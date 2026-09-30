#!/usr/bin/env node
/**
 * scripts/codegraph/build.mjs — builds the Bulwark CodeGraph.
 *
 * A dependency-free (Node ≥20) static indexer that turns the repo into a
 * queryable graph so any agent (Copilot, Codex, Claude Code, …) can locate
 * the code, tests, contracts and design specs for a piece of work without
 * re-reading the tree.
 *
 * Nodes: page · layout · middleware · component · composable · contract ·
 *        service · serviceMethod · apiRoute · table · test · navItem ·
 *        design (screen SPEC from agents/design/return) · workPackage
 * Edges: USES_COMPONENT · CALLS_SERVICE · IMPORTS · HAS_LAYOUT · GUARDED_BY ·
 *        REQUIRES_ROLE · IMPLEMENTS · DECLARES_METHOD · TOUCHES_TABLE ·
 *        COVERS_ROUTE · COVERS_FILE · USES_TESTID · DESIGNS_ROUTE ·
 *        NAV_TO · WP_TOUCHES · WP_IMPLEMENTS_DESIGN · WP_DEPENDS_ON
 *
 * Output: agents/codegraph/graph.json, INDEX.md, routes.md, components.md,
 *         services.md, coverage.md
 *
 * Usage: node scripts/codegraph/build.mjs        (from bulwark/)
 *        pnpm codegraph:build
 */
import { promises as fs, existsSync as fsExistsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSourceManifest, readCurrentGraph, writeSourceManifest } from './source-manifest.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT_DIR = path.join(ROOT, 'agents', 'codegraph')
const DESIGN_RETURN = path.join(ROOT, 'agents', 'design', 'return', 'design-return')
const INVENTORY = path.join(ROOT, 'agents', 'design', '01-SCREEN-INVENTORY.md')
const DESIGN_INDEX = path.join(ROOT, 'agents', 'program', 'design-index.json')
const WORK_PACKAGES = path.join(ROOT, 'agents', 'program', 'work-packages.json')
const IF_CHANGED = process.argv.includes('--if-changed')

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')

// ---------------------------------------------------------------------------
// FS helpers
// ---------------------------------------------------------------------------
async function walk(dir, filter) {
  const out = []
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return out }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en')) // deterministic across OS/filesystems
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (['node_modules', '.nuxt', '.output', 'dist', 'test-results', 'playwright-report'].includes(e.name)) continue
      out.push(...await walk(p, filter))
    } else if (filter(p)) out.push(p)
  }
  return out
}
const read = (p) => fs.readFile(p, 'utf8')
const uniq = (a) => [...new Set(a)]

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------
const nodes = new Map() // id -> node
const edges = []       // { from, to, type, meta? }
function addNode(id, type, attrs = {}) {
  const existing = nodes.get(id)
  if (existing) { Object.assign(existing, attrs); return existing }
  const n = { id, type, ...attrs }
  nodes.set(id, n)
  return n
}
function addEdge(from, to, type, meta) {
  if (!from || !to) return
  edges.push(meta ? { from, to, type, meta } : { from, to, type })
}

// ---------------------------------------------------------------------------
// Source parsing helpers (regex-based; good enough for a map, not a compiler)
// ---------------------------------------------------------------------------
const IMPORT_RE = /import\s+(?:type\s+)?(?:[\w*{}\s,]+)\s+from\s+['"]([^'"]+)['"]/g
const SIDE_IMPORT_RE = /import\s+['"]([^'"]+)['"]/g
function imports(src) {
  const out = []
  for (const m of src.matchAll(IMPORT_RE)) out.push(m[1])
  for (const m of src.matchAll(SIDE_IMPORT_RE)) out.push(m[1])
  return uniq(out)
}
function resolveImport(spec, fromFile) {
  // Nuxt aliases: ~~ / @@ → repo root, ~ / @ → app/
  let base
  if (spec.startsWith('~~/') || spec.startsWith('@@/')) base = path.join(ROOT, spec.slice(3))
  else if (spec.startsWith('~/') || spec.startsWith('@/')) base = path.join(ROOT, 'app', spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null // package
  const candidates = [base, base + '.ts', base + '.vue', base + '.mjs', base + '.js', path.join(base, 'index.ts')]
  return candidates.map(rel)
}

function pageRouteFromFile(file) {
  // app/pages/admin/properties/[id]/index.vue → /admin/properties/:id
  let r = rel(file).replace(/^app\/pages/, '').replace(/\.vue$/, '')
  r = r.replace(/\/index$/, '')
  r = r.replace(/\[\.\.\.(\w+)\]/g, ':$1*').replace(/\[(\w+)\]/g, ':$1')
  return r === '' ? '/' : r
}
function routeToRegex(route) {
  const esc = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:\w+\\\*/g, '.*').replace(/:\w+/g, '[^/]+')
  return new RegExp('^' + esc + '/?(\\?.*)?$')
}
// Prefer an exact route, then a page whose dynamic-ness matches the design route (so
// /admin/properties/:id does not resolve to /admin/properties/new).
function findPageForRoute(pages, r) {
  const exact = pages.find((p) => p.route === r)
  if (exact) return exact
  const re = routeToRegex(r)
  const dyn = r.includes(':')
  return pages.find((p) => re.test(p.route) && p.route.includes(':') === dyn) ?? pages.find((p) => re.test(p.route))
}

function parsePageMeta(src) {
  const m = src.match(/definePageMeta\(\s*\{([\s\S]*?)\}\s*\)/)
  if (!m) return {}
  const body = m[1]
  const layout = body.match(/layout\s*:\s*(?:'([^']+)'|"([^"]+)"|(false))/)
  const middleware = [...body.matchAll(/middleware\s*:\s*(?:\[([^\]]*)\]|'([^']+)'|"([^"]+)")/g)]
    .flatMap((mm) => (mm[1] ? mm[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean) : [mm[2] || mm[3]]))
  const rolesGroup = body.match(/requiredRoles\s*:\s*ROLE_GROUPS\.(\w+)/)
  const rolesArr = body.match(/requiredRoles\s*:\s*\[([^\]]*)\]/)
  const roles = rolesGroup ? [`group:${rolesGroup[1]}`] : rolesArr ? rolesArr[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean) : []
  return { layout: layout ? (layout[1] || layout[2] || 'false') : 'default', middleware, roles }
}
function templateTags(src) {
  const t = src.match(/<template[^>]*>([\s\S]*)<\/template>/)
  const body = t ? t[1] : src
  return uniq([...body.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]))
}
function testIds(src) {
  return uniq([...src.matchAll(/data-testid=["']([^"'{}]+)["']/g)].map((m) => m[1]))
}
function serviceCalls(src) {
  return uniq([...src.matchAll(/useService\(\s*['"](\w+)['"]\s*\)/g)].map((m) => m[1]))
}
function composableCalls(src) {
  return uniq([...src.matchAll(/\b(use[A-Z]\w+)\(/g)].map((m) => m[1]))
}
function defineProps(src) {
  const m = src.match(/defineProps<\s*\{([\s\S]*?)\}\s*>/) || src.match(/defineProps\(\s*\{([\s\S]*?)\}\s*\)/)
  if (!m) return []
  return uniq([...m[1].matchAll(/^\s*(\w+)\??\s*[:?]/gm)].map((x) => x[1]))
}
function defineEmits(src) {
  const m = src.match(/defineEmits<\s*\{([\s\S]*?)\}\s*>/) || src.match(/defineEmits\(\s*\[([\s\S]*?)\]\s*\)/)
  if (!m) return []
  return uniq([...m[1].matchAll(/['"(]([\w:-]+)['")]/g)].map((x) => x[1]))
}

// ---------------------------------------------------------------------------
// 1. Components
// ---------------------------------------------------------------------------
const componentByName = new Map()
async function indexComponents() {
  const files = await walk(path.join(ROOT, 'app', 'components'), (p) => p.endsWith('.vue'))
  for (const f of files) {
    const src = await read(f)
    const name = path.basename(f, '.vue')
    const id = rel(f)
    componentByName.set(name, id)
    addNode(id, 'component', {
      name,
      folder: rel(path.dirname(f)).replace('app/components/', ''),
      props: defineProps(src),
      emits: defineEmits(src),
      testIds: testIds(src),
      lines: src.split('\n').length,
    })
  }
  // second pass: component → component edges
  for (const f of files) {
    const src = await read(f)
    const id = rel(f)
    for (const tag of templateTags(src)) {
      const target = componentByName.get(tag)
      if (target && target !== id) addEdge(id, target, 'USES_COMPONENT')
    }
    for (const c of composableCalls(src)) addEdge(id, `composable:${c}`, 'USES_COMPOSABLE')
    for (const s of serviceCalls(src)) addEdge(id, `service:${s}`, 'CALLS_SERVICE')
  }
}

// ---------------------------------------------------------------------------
// 2. Composables, layouts, middleware
// ---------------------------------------------------------------------------
async function indexAppSupport() {
  for (const f of await walk(path.join(ROOT, 'app', 'composables'), (p) => p.endsWith('.ts'))) {
    const name = path.basename(f, '.ts')
    const src = await read(f)
    addNode(`composable:${name}`, 'composable', { file: rel(f), exports: uniq([...src.matchAll(/export\s+(?:function|const)\s+(\w+)/g)].map((m) => m[1])) })
    for (const s of serviceCalls(src)) addEdge(`composable:${name}`, `service:${s}`, 'CALLS_SERVICE')
  }
  for (const f of await walk(path.join(ROOT, 'app', 'layouts'), (p) => p.endsWith('.vue'))) {
    const name = path.basename(f, '.vue')
    const src = await read(f)
    addNode(`layout:${name}`, 'layout', { file: rel(f), components: templateTags(src).filter((t) => componentByName.has(t)) })
    for (const tag of templateTags(src)) if (componentByName.has(tag)) addEdge(`layout:${name}`, componentByName.get(tag), 'USES_COMPONENT')
  }
  for (const f of await walk(path.join(ROOT, 'app', 'middleware'), (p) => p.endsWith('.ts'))) {
    const name = path.basename(f, '.ts').replace(/\.global$/, '')
    addNode(`middleware:${name}`, 'middleware', { file: rel(f), global: f.includes('.global.') })
  }
}

// ---------------------------------------------------------------------------
// 3. Pages
// ---------------------------------------------------------------------------
async function indexPages() {
  const files = await walk(path.join(ROOT, 'app', 'pages'), (p) => p.endsWith('.vue'))
  for (const f of files) {
    const src = await read(f)
    const id = rel(f)
    const route = pageRouteFromFile(f)
    const meta = parsePageMeta(src)
    const portal = route.startsWith('/admin') ? 'admin' : route.startsWith('/settings') ? 'settings' : route.startsWith('/field') ? 'field' : route.startsWith('/sub') ? 'sub' : route.startsWith('/homeowner') ? 'homeowner' : route.startsWith('/insurer') || route.startsWith('/portal') ? 'stakeholder' : route.startsWith('/dev') ? 'dev' : 'shared'
    const isStub = /coming soon|placeholder|not yet implemented|TODO: implement/i.test(src) && src.length < 6000
    addNode(id, 'page', {
      route,
      portal,
      layout: meta.layout ?? 'default',
      middleware: meta.middleware ?? [],
      roles: meta.roles ?? [],
      testIds: testIds(src),
      lines: src.split('\n').length,
      maturity: isStub ? 'stub' : 'real',
    })
    if (meta.layout && meta.layout !== 'false') addEdge(id, `layout:${meta.layout}`, 'HAS_LAYOUT')
    for (const mw of meta.middleware ?? []) addEdge(id, `middleware:${mw}`, 'GUARDED_BY')
    for (const r of meta.roles ?? []) addEdge(id, `role:${r}`, 'REQUIRES_ROLE')
    for (const tag of templateTags(src)) if (componentByName.has(tag)) addEdge(id, componentByName.get(tag), 'USES_COMPONENT')
    for (const s of serviceCalls(src)) addEdge(id, `service:${s}`, 'CALLS_SERVICE')
    for (const c of composableCalls(src)) if (nodes.has(`composable:${c}`)) addEdge(id, `composable:${c}`, 'USES_COMPOSABLE')
    for (const spec of imports(src)) {
      const cands = resolveImport(spec, f)
      if (!cands) continue
      addEdge(id, cands.find((c) => nodes.has(c)) ?? cands[0], 'IMPORTS')
    }
  }
  // error.vue is a page-like root file
  const errFile = path.join(ROOT, 'app', 'error.vue')
  try {
    const src = await read(errFile)
    addNode(rel(errFile), 'page', { route: '(error)', portal: 'shared', layout: 'false', middleware: [], roles: [], testIds: testIds(src), lines: src.split('\n').length, maturity: 'real' })
  } catch { /* none */ }
}

// ---------------------------------------------------------------------------
// 4. Contracts, services, mocks, api routes, tables
// ---------------------------------------------------------------------------
async function indexContracts() {
  const files = await walk(path.join(ROOT, 'shared', 'contracts'), (p) => p.endsWith('.ts'))
  for (const f of files) {
    const src = await read(f)
    const id = rel(f)
    const schemas = uniq([...src.matchAll(/export\s+const\s+(\w+Schema)\b/g)].map((m) => m[1]))
    const enums = [...src.matchAll(/export\s+const\s+(\w+)\s*=\s*z\.enum\(\[([\s\S]*?)\]\)/g)].map((m) => ({ name: m[1], values: [...m[2].matchAll(/['"]([\w-]+)['"]/g)].map((x) => x[1]) }))
    const ifaces = [...src.matchAll(/export\s+interface\s+(I\w+Service)\s*\{([\s\S]*?)\n\}/g)].map((m) => ({
      name: m[1],
      methods: uniq([...m[2].matchAll(/^\s{2}(\w+)\s*\(/gm)].map((x) => x[1])),
    }))
    addNode(id, 'contract', { name: path.basename(f, '.ts'), schemas, enums, interfaces: ifaces.map((i) => i.name) })
    for (const i of ifaces) {
      addNode(`iface:${i.name}`, 'serviceInterface', { contract: id, methods: i.methods })
      addEdge(id, `iface:${i.name}`, 'DECLARES_INTERFACE')
      for (const m of i.methods) {
        addNode(`method:${i.name}.${m}`, 'serviceMethod', { iface: i.name, method: m })
        addEdge(`iface:${i.name}`, `method:${i.name}.${m}`, 'DECLARES_METHOD')
      }
    }
  }
  // services barrel: name → interface
  const barrel = await read(path.join(ROOT, 'shared', 'contracts', 'services.ts'))
  const body = barrel.match(/export interface BulwarkServices\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  for (const m of body.matchAll(/^\s+(\w+)\s*:\s*(I\w+Service)/gm)) {
    addNode(`service:${m[1]}`, 'service', { name: m[1], iface: m[2] })
    addEdge(`service:${m[1]}`, `iface:${m[2]}`, 'IMPLEMENTS')
  }
}
async function indexTables() {
  const files = await walk(path.join(ROOT, 'server', 'db', 'schema'), (p) => p.endsWith('.ts'))
  for (const f of files) {
    const src = await read(f)
    for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*pgTable\(\s*['"](\w+)['"]/g)) {
      addNode(`table:${m[2]}`, 'table', { export: m[1], file: rel(f), columns: uniq([...(src.slice(m.index).match(/\{([\s\S]*?)\n\}/)?.[1] ?? '').matchAll(/^\s{2}(\w+)\s*:/gm)].map((x) => x[1])) })
    }
    for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*pgEnum\(\s*['"](\w+)['"]\s*,\s*\[([\s\S]*?)\]/g)) {
      addNode(`dbenum:${m[2]}`, 'dbEnum', { export: m[1], file: rel(f), values: [...m[3].matchAll(/['"]([\w-]+)['"]/g)].map((x) => x[1]) })
    }
  }
}
async function indexServiceImpls() {
  const real = await walk(path.join(ROOT, 'server', 'services'), (p) => p.endsWith('.real.ts'))
  const mock = await walk(path.join(ROOT, 'shared', 'mocks'), (p) => p.endsWith('.mock.ts'))
  const tableExports = new Map([...nodes.values()].filter((n) => n.type === 'table').map((n) => [n.export, n.id]))
  for (const f of [...real, ...mock]) {
    const src = await read(f)
    const id = rel(f)
    const kind = f.endsWith('.real.ts') ? 'serviceImpl' : 'serviceMock'
    const ifaceMatch = src.match(/implements\s+(I\w+Service)/) || src.match(/:\s*(I\w+Service)\s*[=;{]/)
    const iface = ifaceMatch?.[1]
    const methods = uniq([...src.matchAll(/^\s{2}(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/gm)].map((m) => m[1])).filter((m) => !['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(m))
    addNode(id, kind, { name: path.basename(f).replace(/\.(real|mock)\.ts$/, ''), iface, methods, lines: src.split('\n').length, usesTenantAssert: /assertSameTenant\(/.test(src) })
    if (iface) addEdge(id, `iface:${iface}`, 'IMPLEMENTS')
    for (const exp of Object.keys(Object.fromEntries(tableExports))) {
      if (new RegExp(`\\b${exp}\\b`).test(src)) addEdge(id, tableExports.get(exp), 'TOUCHES_TABLE')
    }
    for (const spec of imports(src)) {
      const cands = resolveImport(spec, f)
      if (cands) addEdge(id, cands.find((c) => nodes.has(c)) ?? cands[0], 'IMPORTS')
    }
  }
}
async function indexApiRoutes() {
  const files = await walk(path.join(ROOT, 'server', 'api'), (p) => p.endsWith('.ts'))
  for (const f of files) {
    const src = await read(f)
    let r = rel(f).replace(/^server\/api/, '/api').replace(/\.ts$/, '')
    const method = r.match(/\.(get|post|put|patch|delete)$/)?.[1]?.toUpperCase() ?? 'ANY'
    r = r.replace(/\.(get|post|put|patch|delete)$/, '').replace(/\/index$/, '').replace(/\[(\w+)\]/g, ':$1')
    const id = rel(f)
    addNode(id, 'apiRoute', { path: r, method, rateLimited: /rate/i.test(src), usesSession: /getUserSession|requireUserSession/.test(src) })
    for (const spec of imports(src)) {
      const cands = resolveImport(spec, f)
      if (cands) addEdge(id, cands.find((c) => nodes.has(c)) ?? cands[0], 'IMPORTS')
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Nav
// ---------------------------------------------------------------------------
async function indexNav() {
  let src
  try { src = await read(path.join(ROOT, 'shared', 'nav', 'nav.config.ts')) } catch { return }
  for (const m of src.matchAll(/\{\s*(?:group:\s*'([^']*)',\s*)?label:\s*'([^']*)',\s*to:\s*'([^']*)',\s*icon:\s*'([^']*)',\s*roles:\s*\[([^\]]*)\]/g)) {
    const id = `nav:${m[3]}`
    addNode(id, 'navItem', { group: m[1] ?? '', label: m[2], to: m[3], icon: m[4], roles: m[5].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean) })
    const page = [...nodes.values()].find((n) => n.type === 'page' && n.route === m[3])
    addEdge(id, page ? page.id : `route:${m[3]}`, 'NAV_TO')
  }
}

// ---------------------------------------------------------------------------
// 6. Tests
// ---------------------------------------------------------------------------
async function indexTests() {
  const files = await walk(path.join(ROOT, 'tests'), (p) => /\.(test|spec)\.ts$/.test(p))
  const pages = [...nodes.values()].filter((n) => n.type === 'page' && n.route !== '(error)')
  const pageMatchers = pages.map((p) => ({ p, re: routeToRegex(p.route) }))
  const testIdOwners = new Map()
  for (const n of nodes.values()) if ((n.type === 'page' || n.type === 'component') && n.testIds) for (const t of n.testIds) testIdOwners.set(t, [...(testIdOwners.get(t) ?? []), n.id])
  for (const f of files) {
    const src = await read(f)
    const id = rel(f)
    const kind = id.startsWith('tests/e2e') ? 'e2e' : id.startsWith('tests/integration') ? 'integration' : 'unit'
    const titles = uniq([...src.matchAll(/\b(?:test|it)\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]))
    const describes = uniq([...src.matchAll(/\bdescribe\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]))
    const gotos = uniq([...src.matchAll(/goto\(\s*[`'"](\/[^`'"?\s$]*)/g)].map((m) => m[1]))
    const tids = uniq([...src.matchAll(/getByTestId\(\s*['"`]([^'"`]+)['"`]/g), ...src.matchAll(/data-testid=["']([^"']+)["']/g)].map((m) => m[1]))
    addNode(id, 'test', { kind, tests: titles.length, describes, gotos, testIds: tids })
    for (const g of gotos) {
      const hit = pageMatchers.filter((m) => m.re.test(g)).sort((a, b) => b.p.route.length - a.p.route.length)[0]
      if (hit) addEdge(id, hit.p.id, 'COVERS_ROUTE', { path: g })
    }
    for (const t of tids) for (const owner of testIdOwners.get(t) ?? []) addEdge(id, owner, 'USES_TESTID', { testId: t })
    for (const spec of imports(src)) {
      const cands = resolveImport(spec, f)
      if (!cands) continue
      const target = cands.find((c) => nodes.has(c))
      if (target) addEdge(id, target, 'COVERS_FILE')
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Design return (screen SPECs) + inventory
// ---------------------------------------------------------------------------
async function indexDesign() {
  // inventory rows: | ID | Screen | Route | Build | ... | Packet |
  let inv = ''
  try { inv = await read(INVENTORY) } catch { /* optional */ }
  const catalog = JSON.parse(await read(DESIGN_INDEX))
  const invRows = new Map(catalog.designs.map((design) => [design.id, { title: design.title, packet: design.packet, routeText: '' }]))
  for (const line of inv.split('\n')) {
    const m = line.match(/^\|\s*([A-Z]{2,3}-\d{2}[a-z]?)\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|/)
    if (m) invRows.set(m[1], { ...invRows.get(m[1]), title: m[2].trim(), routeText: m[3].trim(), build: m[4].trim() })
  }
  const pages = [...nodes.values()].filter((n) => n.type === 'page')
  const specs = await walk(DESIGN_RETURN, (p) => p.endsWith('SPEC.md') && p.includes(`${path.sep}screens${path.sep}`))
  const received = new Set()
  for (const f of specs) {
    const src = await read(f)
    const folder = path.basename(path.dirname(f))
    const idm = folder.match(/^([A-Z]{2,3}-\d{2}[a-z]?)/)
    if (!idm) continue
    const designId = idm[1]
    received.add(designId)
    const packet = rel(f).split('/')[4]
    const routeLine = src.match(/^Route:\s*([^|\n]+)/m)?.[1]?.trim() ?? ''
    const routes = uniq([...routeLine.matchAll(/(\/[\w\-[\]:/.?=]*)/g)].map((m) => m[1].replace(/\?.*$/, '').replace(/\[(\w+)\]/g, ':$1')).filter((r) => r.length > 1 || r === '/'))
    const components = uniq([...(src.match(/## Components used([\s\S]*?)\n## /)?.[1] ?? '').matchAll(/-\s*([A-Z][A-Za-z0-9]+)/g)].map((m) => m[1]))
    const states = [...(src.match(/## States([\s\S]*?)\n## /)?.[1] ?? '').matchAll(/^\|\s*([^|]+?)\s*\|/gm)].map((m) => m[1]).filter((s) => !/^State$|^-+$/.test(s))
    const openQuestions = (src.match(/## Open questions for engineering([\s\S]*)$/)?.[1] ?? '').split('\n').map((s) => s.replace(/^-\s*/, '').trim()).filter((s) => s && !/^none$/i.test(s))
    const dir = rel(path.dirname(f))
    addNode(`design:${designId}`, 'design', {
      title: src.match(/^#\s*[A-Z]{2,3}-\d{2}[a-z]?\s*—\s*(.+)$/m)?.[1]?.trim() ?? invRows.get(designId)?.title ?? folder,
      packet, status: 'received', dir, spec: rel(f),
      renders: ['desktop.html', 'mobile.html', 'dark.html', 'states.html', 'tablet.html'].filter((r) => specs.length && fsExistsSync(path.join(path.dirname(f), r))),
      routes, components, states, openQuestions,
      inventory: invRows.get(designId) ?? null,
    })
    for (const c of components) if (componentByName.has(c)) addEdge(`design:${designId}`, componentByName.get(c), 'SPECIFIES_COMPONENT')
    for (const r of routes) {
      const hit = findPageForRoute(pages, r)
      addEdge(`design:${designId}`, hit ? hit.id : `route:${r}`, 'DESIGNS_ROUTE')
    }
  }
  for (const [id, row] of invRows) {
    if (received.has(id)) continue
    if (id === 'SH-00' && fsExistsSync(path.join(DESIGN_RETURN, 'A', 'shell', 'INDEX.html'))) {
      addNode('design:SH-00', 'design', { title: row.title, status: 'received', packet: 'A', dir: rel(path.join(DESIGN_RETURN, 'A', 'shell')), spec: rel(path.join(DESIGN_RETURN, 'A', 'shell', 'INDEX.html')), routes: [], components: ['AppSidebar', 'AppTopBar', 'AppBottomNav'], states: [], openQuestions: [], inventory: row })
      continue
    }
    const routes = uniq([...row.routeText.matchAll(/`?(\/[\w\-[\]:/.?=]*)`?/g)].map((m) => m[1].replace(/\?.*$/, '').replace(/\[(\w+)\]/g, ':$1')).filter((r) => r.length > 1 || r === '/'))
    addNode(`design:${id}`, 'design', { title: row.title, status: 'pending', packet: row.packet ?? null, routes, inventory: row })
    for (const r of routes) {
      const hit = findPageForRoute(pages, r)
      addEdge(`design:${id}`, hit ? hit.id : `route:${r}`, 'DESIGNS_ROUTE')
    }
  }
}

// ---------------------------------------------------------------------------
// 8. Work packages
// ---------------------------------------------------------------------------
async function indexWorkPackages() {
  let wps
  try { wps = JSON.parse(await read(WORK_PACKAGES)) } catch { return }
  for (const wp of wps.packages ?? []) {
    const attrs = { ...wp }
    delete attrs.id // node id is wp:<ID>; keep the raw id as wpId
    addNode(`wp:${wp.id}`, 'workPackage', { ...attrs, wpId: wp.id })
    for (const d of wp.designs ?? []) addEdge(`wp:${wp.id}`, `design:${d}`, 'WP_IMPLEMENTS_DESIGN')
    for (const dep of wp.dependsOn ?? []) addEdge(`wp:${wp.id}`, `wp:${dep}`, 'WP_DEPENDS_ON')
    for (const f of wp.files ?? []) {
      // escape regex chars (incl. [id]) before expanding * and **
      const glob = f.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '__DS__').replace(/\*/g, '[^/]*').replace(/__DS__/g, '.*')
      const re = new RegExp('^' + glob + '$')
      for (const n of nodes.values()) if (typeof n.id === 'string' && !n.id.includes(':') && re.test(n.id)) addEdge(`wp:${wp.id}`, n.id, 'WP_TOUCHES')
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Reports
// ---------------------------------------------------------------------------
function outEdges(id, type) { return edges.filter((e) => e.from === id && (!type || e.type === type)) }
function inEdges(id, type) { return edges.filter((e) => e.to === id && (!type || e.type === type)) }
const nm = (id) => nodes.get(id)?.name ?? id.split('/').pop()

function routesReport() {
  const pages = [...nodes.values()].filter((n) => n.type === 'page').sort((a, b) => a.route.localeCompare(b.route))
  const lines = ['# Routes → pages → coverage', '', `${pages.length} pages`, '', '| Route | Portal | Page | Layout | Roles | Services | Components | e2e specs | Design | Design status |', '|---|---|---|---|---|---|---|---|---|---|']
  for (const p of pages) {
    const services = outEdges(p.id, 'CALLS_SERVICE').map((e) => e.to.replace('service:', ''))
    const comps = outEdges(p.id, 'USES_COMPONENT').map((e) => nm(e.to))
    const e2e = uniq(inEdges(p.id, 'COVERS_ROUTE').map((e) => e.from.split('/').pop()))
    const designs = inEdges(p.id, 'DESIGNS_ROUTE').map((e) => nodes.get(e.from)).filter(Boolean)
    lines.push(`| \`${p.route}\` | ${p.portal} | ${p.id.replace('app/pages/', '')} | ${p.layout} | ${p.roles.join(', ')} | ${services.join(', ')} | ${comps.length} | ${e2e.join(', ') || '—'} | ${designs.map((d) => d.id.replace('design:', '')).join(', ') || '—'} | ${designs.map((d) => d.status).join(', ') || 'none'} |`)
  }
  return lines.join('\n')
}
function componentsReport() {
  const comps = [...nodes.values()].filter((n) => n.type === 'component').sort((a, b) => a.name.localeCompare(b.name))
  const lines = ['# Components', '', '| Component | Folder | Props | Used by (pages+components) | Design spec (components/SPEC.md) | Unit tests |', '|---|---|---|---|---|---|']
  const specNames = designComponentSpecNames
  for (const c of comps) {
    const users = inEdges(c.id, 'USES_COMPONENT').length
    const tests = uniq(inEdges(c.id, 'COVERS_FILE').map((e) => e.from.split('/').pop()))
    lines.push(`| ${c.name} | ${c.folder} | ${c.props.join(', ')} | ${users} | ${specNames.has(c.name) ? '✅' : '—'} | ${tests.join(', ') || '—'} |`)
  }
  const missing = [...specNames].filter((n) => !componentByName.has(n)).sort()
  lines.push('', `## Components specified by Design but not yet in code (${missing.length})`, '', missing.map((m) => `- ${m}`).join('\n'))
  return lines.join('\n')
}
function servicesReport() {
  const services = [...nodes.values()].filter((n) => n.type === 'service').sort((a, b) => a.name.localeCompare(b.name))
  const lines = ['# Services', '', '| Service | Interface | Methods | Real impl | Mock impl | Tables | Pages calling | Tests |', '|---|---|---|---|---|---|---|---|']
  for (const s of services) {
    const iface = nodes.get(`iface:${s.iface}`)
    const impls = [...nodes.values()].filter((n) => (n.type === 'serviceImpl' || n.type === 'serviceMock') && n.iface === s.iface)
    const real = impls.find((i) => i.type === 'serviceImpl')
    const mock = impls.find((i) => i.type === 'serviceMock')
    const tables = uniq(impls.flatMap((i) => outEdges(i.id, 'TOUCHES_TABLE').map((e) => e.to.replace('table:', ''))))
    const callers = inEdges(`service:${s.name}`, 'CALLS_SERVICE').filter((e) => nodes.get(e.from)?.type === 'page').length
    const tests = uniq(impls.flatMap((i) => inEdges(i.id, 'COVERS_FILE').map((e) => e.from.split('/').pop())))
    lines.push(`| ${s.name} | ${s.iface} | ${iface?.methods.length ?? '?'} | ${real ? real.id.split('/').pop() : '❌'} | ${mock ? '✅' : '❌'} | ${tables.join(', ')} | ${callers} | ${tests.join(', ') || '—'} |`)
  }
  return lines.join('\n')
}
function coverageReport() {
  const pages = [...nodes.values()].filter((n) => n.type === 'page' && n.portal !== 'dev' && n.route !== '(error)')
  const untested = pages.filter((p) => inEdges(p.id, 'COVERS_ROUTE').length === 0 && inEdges(p.id, 'USES_TESTID').length === 0)
  const undesigned = pages.filter((p) => inEdges(p.id, 'DESIGNS_ROUTE').length === 0)
  const designsPending = [...nodes.values()].filter((n) => n.type === 'design' && n.status === 'pending')
  const designsReceived = [...nodes.values()].filter((n) => n.type === 'design' && n.status === 'received')
  const designsNoPage = designsReceived.filter((d) => outEdges(d.id, 'DESIGNS_ROUTE').every((e) => e.to.startsWith('route:')))
  const lines = ['# Coverage gaps', '',
    `## Pages with no e2e coverage (${untested.length})`, '', ...untested.map((p) => `- \`${p.route}\` — ${p.id}`),
    '', `## Pages with no design (${undesigned.length})`, '', ...undesigned.map((p) => `- \`${p.route}\` — ${p.id}`),
    '', `## Designs received whose route has no page yet (${designsNoPage.length})`, '', ...designsNoPage.map((d) => `- ${d.id.replace('design:', '')} — ${d.title} → ${d.routes.join(', ') || '(no route)'}`),
    '', `## Designs without local received artifacts (${designsPending.length})`, '', ...designsPending.map((d) => `- ${d.id.replace('design:', '')} — ${d.title}`),
    '', `## Open engineering questions in received specs (${designsReceived.reduce((a, d) => a + d.openQuestions.length, 0)})`, '',
    ...designsReceived.filter((d) => d.openQuestions.length).map((d) => `- **${d.id.replace('design:', '')}**: ${d.openQuestions.join(' · ')}`),
  ]
  return lines.join('\n')
}
function workPackagesReport() {
  const wps = [...nodes.values()].filter((n) => n.type === 'workPackage')
  if (!wps.length) return '# Work packages\n\n(none — agents/program/work-packages.json missing)'
  const phases = [...new Set(wps.map((w) => w.phase))].sort()
  const lines = ['# Work packages (generated view — source of truth is agents/program/work-packages.json)', '', `${wps.length} packages · ${wps.filter((w) => w.status === 'done').length} done · ${wps.filter((w) => w.status === 'review').length} in review · ${wps.filter((w) => w.status === 'in-progress').length} in progress · ${wps.filter((w) => w.status === 'ready').length} ready · ${wps.filter((w) => w.status === 'todo').length} todo · ${wps.filter((w) => w.status === 'blocked').length} blocked`, '']
  for (const ph of phases) {
    lines.push(`## Phase ${ph}`, '', '| WP | Title | Lane | Status | Size | Designs (received/total) | Depends on | Blocks |', '|---|---|---|---|---|---|---|---|')
    for (const w of wps.filter((x) => x.phase === ph).sort((a, b) => a.id.localeCompare(b.id))) {
      const designs = (w.designs ?? []).map((d) => nodes.get(`design:${d}`))
      const recv = designs.filter((d) => d?.status === 'received').length
      const blocks = inEdges(w.id, 'WP_DEPENDS_ON').map((e) => e.from.replace('wp:', ''))
      lines.push(`| ${w.id.replace('wp:', '')} | ${w.title} | ${w.lane} | ${w.status} | ${w.size} | ${recv}/${designs.length}${w.designAhead ? ' (ahead)' : ''} | ${(w.dependsOn ?? []).join(', ') || '—'} | ${blocks.join(', ') || '—'} |`)
    }
    lines.push('')
  }
  // ready-now computation
  const done = new Set(wps.filter((w) => w.status === 'done').map((w) => w.id.replace('wp:', '')))
  // Only unclaimed work: in-progress/review/done packages are already underway or finished.
  const readyNow = wps.filter((w) => (w.status === 'todo' || w.status === 'ready' || w.status === 'blocked') && (w.dependsOn ?? []).every((d) => done.has(d)) && ((w.designs ?? []).every((d) => nodes.get(`design:${d}`)?.status === 'received') || w.designAhead))
  lines.push('## Startable now (all deps done, designs received or designAhead)', '', ...readyNow.map((w) => `- ${w.id.replace('wp:', '')} — ${w.title} [${w.lane}]`))
  return lines.join('\n')
}
function indexReport(stats) {
  return `# Bulwark CodeGraph

Generated by \`scripts/codegraph/build.mjs\` (deterministic, ignored output; rebuilt in CI). Do not edit by hand; refresh with \`pnpm codegraph:sync\` or \`pnpm codegraph:repair\`.

## What this is
A static map of the repository as a graph (\`graph.json\`) plus human-readable views. Query it with \`pnpm codegraph:query -- <command>\` (see \`scripts/codegraph/query.mjs --help\`) instead of grepping the tree. Rebuild after any structural change (new page/component/service/test/design spec).

Extraction is regex-based and approximate, not authoritative evidence of coverage, authorization or runtime behavior. Canonical design IDs come from \`agents/program/design-index.json\`; received status requires local artifacts under the optional, ignored \`agents/design/\` tree. Pending means unavailable locally, not necessarily undelivered. Input enumeration and content hashes drive freshness; all generated outputs must also match their recorded hashes.

## Counts
${Object.entries(stats.nodeCounts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
- edges: ${stats.edgeCount}

## Views
- [routes.md](routes.md) — every route: page file, layout, roles, services, components, e2e specs, design ID/status
- [components.md](components.md) — every component: props, usage count, design spec presence, unit tests; plus components Design specified that don't exist yet
- [services.md](services.md) — every service: interface, real/mock impls, tables touched, callers, tests
- [coverage.md](coverage.md) — pages without e2e, pages without design, designs without pages, pending designs, open questions
- [work-packages.md](work-packages.md) — every work package by phase with design readiness, dependencies, and what is startable now

## Query cheatsheet
\`\`\`
pnpm codegraph:query -- route /admin/properties      # what implements/tests/designs a route
pnpm codegraph:query -- design AD-12                 # design → route, page, components, spec path, states, open questions
pnpm codegraph:query -- file app/components/ui/StatusBadge.vue   # who uses this file (impact)
pnpm codegraph:query -- impact shared/contracts/quote.ts --depth 2
pnpm codegraph:query -- service quote                # interface methods, impls, tables, callers, tests
pnpm codegraph:query -- component BulwarkDataTable   # spec + code status
pnpm codegraph:query -- wp WP-A1                     # work package: scope, designs, files, tests, deps
pnpm codegraph:query -- untested | undesigned | pending
pnpm codegraph:query -- search "invoice"             # fuzzy over node ids/titles
\`\`\`

## Node id conventions
- Files use repo-relative paths (\`app/pages/admin/index.vue\`, \`server/services/quote.real.ts\`).
- Prefixed ids: \`service:<name>\`, \`iface:I<Name>Service\`, \`method:I<Name>Service.<method>\`, \`table:<pg_table>\`, \`layout:<name>\`, \`middleware:<name>\`, \`composable:<useX>\`, \`nav:<route>\`, \`design:<ID>\`, \`wp:<ID>\`, \`role:<role|group:x>\`, \`route:<path>\` (a route referenced by a design/nav that has no page yet).
`
}

let designComponentSpecNames = new Set()
async function loadDesignComponentSpec() {
  try {
    const src = await read(path.join(DESIGN_RETURN, 'A', 'components', 'SPEC.md'))
    designComponentSpecNames = new Set([...src.matchAll(/^## (\w+)/gm)].map((m) => m[1]))
  } catch { /* optional */ }
}

// ---------------------------------------------------------------------------
async function main() {
  const sourceManifest = await getSourceManifest(ROOT)
  if (IF_CHANGED && await readCurrentGraph(ROOT, sourceManifest)) {
    console.log('codegraph: no source changes; existing graph is current')
    return
  }

  await indexComponents()
  await indexAppSupport()
  await indexPages()
  await indexContracts()
  await indexTables()
  await indexServiceImpls()
  await indexApiRoutes()
  await indexNav()
  await indexTests()
  await loadDesignComponentSpec()
  await indexDesign()
  await indexWorkPackages()

  const nodeCounts = {}
  for (const n of nodes.values()) nodeCounts[n.type] = (nodeCounts[n.type] ?? 0) + 1
  const stats = { nodeCounts, edgeCount: edges.length }

  await fs.mkdir(OUT_DIR, { recursive: true })
  await fs.writeFile(path.join(OUT_DIR, 'graph.json'), JSON.stringify({ stats, nodes: [...nodes.values()], edges }, null, 1))
  await fs.writeFile(path.join(OUT_DIR, 'INDEX.md'), indexReport(stats))
  await fs.writeFile(path.join(OUT_DIR, 'routes.md'), routesReport())
  await fs.writeFile(path.join(OUT_DIR, 'components.md'), componentsReport())
  await fs.writeFile(path.join(OUT_DIR, 'services.md'), servicesReport())
  await fs.writeFile(path.join(OUT_DIR, 'coverage.md'), coverageReport())
  await fs.writeFile(path.join(OUT_DIR, 'work-packages.md'), workPackagesReport())
  await writeSourceManifest(ROOT, sourceManifest)
  console.log(`codegraph: ${nodes.size} nodes, ${edges.length} edges → ${rel(OUT_DIR)}/`)
  console.log(Object.entries(nodeCounts).map(([k, v]) => `  ${k}: ${v}`).join('\n'))
}
main().catch((e) => { console.error(e); process.exit(1) })
