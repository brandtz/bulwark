#!/usr/bin/env node
/**
 * scripts/codegraph/query.mjs — query the Bulwark CodeGraph (agents/codegraph/graph.json).
 *
 *   node scripts/codegraph/query.mjs <command> [arg] [--json] [--depth N]
 *
 * Commands
 *   route <path>            everything about a route (prefix match): page, layout, roles, services,
 *                           components, e2e specs, design spec(s), nav entry, work packages
 *   design <ID>             design screen → routes/pages, components (exist? / missing), states,
 *                           open questions, spec path, packet, work packages
 *   file <repo-path>        node details + who depends on it (1 level) + what it depends on
 *   impact <repo-path>      reverse-dependency closure (default depth 3): pages, components, tests, WPs affected
 *   service <name>          interface methods, real/mock impls, tables, pages/composables calling, tests
 *   component <Name>        code file (if any), props, users, design spec presence, unit tests
 *   wp <ID>                 work package: scope, designs, files touched, tests, dependencies, status
 *   untested                pages with no e2e coverage
 *   undesigned              pages with no design spec
 *   pending                 design screens still not received from Claude Design
 *   questions [ID]          open engineering questions (all, or for one design)
 *   search <text>           fuzzy search over ids / titles / routes
 *   stats                   node/edge counts
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GRAPH = path.join(ROOT, 'agents', 'codegraph', 'graph.json')

const args = process.argv.slice(2)
const flags = { json: args.includes('--json'), depth: Number(args[args.indexOf('--depth') + 1]) || 3 }
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--depth')
const [cmd, arg] = positional

if (!cmd || cmd === '--help' || cmd === 'help') {
  console.log(await fs.readFile(fileURLToPath(import.meta.url), 'utf8').then((s) => s.split('*/')[0].replace(/^\/\*\*|^ \* ?/gm, '')))
  process.exit(0)
}

let graph
try { graph = JSON.parse(await fs.readFile(GRAPH, 'utf8')) } catch {
  console.error('graph.json not found — run `pnpm codegraph:build` first'); process.exit(1)
}
const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
const out = (e) => graph.edges.filter((x) => x.from === e)
const inn = (e) => graph.edges.filter((x) => x.to === e)
const byType = (t) => graph.nodes.filter((n) => n.type === t)
const short = (id) => id.replace(/^app\/pages\//, 'pages/').replace(/^app\/components\//, 'components/')
const list = (arr) => (arr.length ? arr.map((a) => `  - ${a}`).join('\n') : '  (none)')
const emit = (title, obj, md) => { if (flags.json) console.log(JSON.stringify(obj, null, 2)); else console.log(`# ${title}\n\n${md}`) }

function pageBundle(p) {
  const services = out(p.id).filter((e) => e.type === 'CALLS_SERVICE').map((e) => e.to.replace('service:', ''))
  const components = out(p.id).filter((e) => e.type === 'USES_COMPONENT').map((e) => nodes.get(e.to)?.name ?? e.to)
  const composables = out(p.id).filter((e) => e.type === 'USES_COMPOSABLE').map((e) => e.to.replace('composable:', ''))
  const e2e = [...new Set(inn(p.id).filter((e) => e.type === 'COVERS_ROUTE' || e.type === 'USES_TESTID').map((e) => e.from))]
  const designs = inn(p.id).filter((e) => e.type === 'DESIGNS_ROUTE').map((e) => nodes.get(e.from)).filter(Boolean)
  const nav = inn(p.id).filter((e) => e.type === 'NAV_TO').map((e) => nodes.get(e.from)).filter(Boolean)
  const wps = inn(p.id).filter((e) => e.type === 'WP_TOUCHES').map((e) => nodes.get(e.from)).filter(Boolean)
  return { page: p, services, components, composables, e2e, designs, nav, wps }
}
function pageMd(b) {
  const p = b.page
  return [
    `**Route** \`${p.route}\` · portal ${p.portal} · layout ${p.layout} · roles ${p.roles.join(', ') || '—'} · middleware ${p.middleware.join(', ') || '—'} · maturity ${p.maturity} · ${p.lines} lines`,
    `**File** ${p.id}`,
    `**Services** ${b.services.join(', ') || '—'}`,
    `**Composables** ${b.composables.join(', ') || '—'}`,
    `**Components** ${b.components.join(', ') || '—'}`,
    `**Test ids** ${p.testIds.join(', ') || '—'}`,
    `**e2e / tests referencing**\n${list(b.e2e)}`,
    `**Design**\n${list(b.designs.map((d) => `${d.id.replace('design:', '')} — ${d.title} [${d.status}]${d.spec ? ` → ${d.spec}` : ''}`))}`,
    `**Nav** ${b.nav.map((n) => `${n.group}/${n.label}`).join(', ') || '—'}`,
    `**Work packages** ${b.wps.map((w) => w.id.replace('wp:', '')).join(', ') || '—'}`,
  ].join('\n\n')
}

switch (cmd) {
  case 'stats': {
    emit('Stats', graph.stats, Object.entries(graph.stats.nodeCounts).map(([k, v]) => `- ${k}: ${v}`).join('\n') + `\n- edges: ${graph.stats.edgeCount}`)
    break
  }
  case 'route': {
    if (!arg) { console.error('route <path>'); process.exit(1) }
    const pages = byType('page').filter((p) => p.route === arg || p.route.startsWith(arg.replace(/\/$/, '') + '/') || p.route.startsWith(arg))
      .sort((a, b) => a.route.localeCompare(b.route))
    if (!pages.length) { console.log(`No page matches ${arg}. Designs referencing it:`); console.log(list(byType('design').filter((d) => (d.routes ?? []).some((r) => r.startsWith(arg))).map((d) => `${d.id} [${d.status}] ${d.title}`))); break }
    const bundles = pages.map(pageBundle)
    emit(`Route ${arg}`, bundles, bundles.map(pageMd).join('\n\n---\n\n'))
    break
  }
  case 'design': {
    const d = nodes.get(`design:${arg}`)
    if (!d) { console.error(`No design ${arg}`); process.exit(1) }
    const routeTargets = out(d.id).filter((e) => e.type === 'DESIGNS_ROUTE').map((e) => e.to)
    const pages = routeTargets.filter((t) => nodes.has(t)).map((t) => nodes.get(t))
    const missingRoutes = routeTargets.filter((t) => t.startsWith('route:')).map((t) => t.replace('route:', ''))
    const compsExist = (d.components ?? []).filter((c) => byType('component').some((n) => n.name === c))
    const compsMissing = (d.components ?? []).filter((c) => !compsExist.includes(c))
    const wps = inn(d.id).filter((e) => e.type === 'WP_IMPLEMENTS_DESIGN').map((e) => e.from.replace('wp:', ''))
    emit(`Design ${arg}`, { ...d, pages: pages.map((p) => p.id), missingRoutes, compsExist, compsMissing, wps }, [
      `**${d.title}** · packet ${d.packet ?? '—'} · status **${d.status}**`,
      d.spec ? `**Spec** ${d.spec}\n**Renders** ${(d.renders ?? []).join(', ')}` : '(no spec received yet)',
      `**Routes** ${(d.routes ?? []).join(', ') || '—'}`,
      `**Existing pages**\n${list(pages.map((p) => `${p.id} (${p.route})`))}`,
      `**Routes with no page yet**\n${list(missingRoutes)}`,
      `**Components — exist in code**\n${list(compsExist)}`,
      `**Components — must be created**\n${list(compsMissing)}`,
      `**States to implement**\n${list(d.states ?? [])}`,
      `**Open questions** (answers: agents/program/ENGINEERING-DECISIONS.md)\n${list(d.openQuestions ?? [])}`,
      `**Work packages** ${wps.join(', ') || '—'}`,
      d.inventory ? `**Inventory** build=${d.inventory.build} · ${d.inventory.routeText}` : '',
    ].join('\n\n'))
    break
  }
  case 'file': {
    const n = nodes.get(arg)
    if (!n) { console.error(`No node ${arg}`); process.exit(1) }
    const deps = out(n.id).map((e) => `${e.type} → ${e.to}`)
    const dependents = inn(n.id).map((e) => `${e.from} —${e.type}→`)
    emit(`File ${arg}`, { node: n, deps, dependents }, `\`\`\`json\n${JSON.stringify(n, null, 2)}\n\`\`\`\n\n**Depends on**\n${list(deps)}\n\n**Depended on by**\n${list(dependents)}`)
    break
  }
  case 'impact': {
    if (!nodes.has(arg)) { console.error(`No node ${arg}`); process.exit(1) }
    const seen = new Map([[arg, 0]])
    let frontier = [arg]
    for (let d = 1; d <= flags.depth && frontier.length; d++) {
      const next = []
      for (const id of frontier) for (const e of inn(id)) if (!seen.has(e.from)) { seen.set(e.from, d); next.push(e.from) }
      frontier = next
    }
    seen.delete(arg)
    const grouped = {}
    for (const [id, d] of seen) { const t = nodes.get(id)?.type ?? 'ref'; (grouped[t] ??= []).push(`${id} (d${d})`) }
    emit(`Impact of ${arg} (depth ${flags.depth})`, grouped, Object.entries(grouped).map(([t, ids]) => `**${t}** (${ids.length})\n${list(ids.sort())}`).join('\n\n'))
    break
  }
  case 'service': {
    const s = nodes.get(`service:${arg}`)
    if (!s) { console.error(`No service ${arg}. Known: ${byType('service').map((x) => x.name).join(', ')}`); process.exit(1) }
    const iface = nodes.get(`iface:${s.iface}`)
    const impls = graph.nodes.filter((n) => (n.type === 'serviceImpl' || n.type === 'serviceMock') && n.iface === s.iface)
    const tables = [...new Set(impls.flatMap((i) => out(i.id).filter((e) => e.type === 'TOUCHES_TABLE').map((e) => e.to.replace('table:', ''))))]
    const callers = inn(s.id).filter((e) => e.type === 'CALLS_SERVICE').map((e) => e.from)
    const tests = [...new Set(impls.flatMap((i) => inn(i.id).filter((e) => e.type === 'COVERS_FILE').map((e) => e.from)))]
    emit(`Service ${arg}`, { service: s, iface, impls, tables, callers, tests }, [
      `**Interface** ${s.iface} (${iface?.contract ?? '?'})`,
      `**Methods**\n${list(iface?.methods ?? [])}`,
      `**Implementations**\n${list(impls.map((i) => `${i.id} [${i.type}] ${i.methods.length} methods${i.usesTenantAssert ? ' · assertSameTenant ✓' : i.type === 'serviceImpl' ? ' · ⚠ no assertSameTenant found' : ''}`))}`,
      `**Tables** ${tables.join(', ') || '—'}`,
      `**Called from**\n${list(callers.map(short))}`,
      `**Tests**\n${list(tests)}`,
    ].join('\n\n'))
    break
  }
  case 'component': {
    const c = byType('component').find((n) => n.name === arg)
    const specd = graph.nodes.some((n) => n.type === 'design' && (n.components ?? []).includes(arg))
    const users = c ? inn(c.id).filter((e) => e.type === 'USES_COMPONENT').map((e) => short(e.from)) : []
    const designs = byType('design').filter((n) => (n.components ?? []).includes(arg)).map((n) => n.id.replace('design:', ''))
    const tests = c ? inn(c.id).filter((e) => e.type === 'COVERS_FILE').map((e) => e.from) : []
    emit(`Component ${arg}`, { component: c ?? null, users, designs, tests, referencedByDesigns: specd }, [
      c ? `**File** ${c.id} · props ${c.props.join(', ') || '—'} · emits ${c.emits.join(', ') || '—'} · ${c.lines} lines` : '**Not in code yet** — spec in agents/design/return/design-return/A/components/SPEC.md',
      `**Used by** (${users.length})\n${list(users)}`,
      `**Referenced by design screens** (${designs.length})\n${list(designs)}`,
      `**Tests**\n${list(tests)}`,
    ].join('\n\n'))
    break
  }
  case 'wp': {
    const w = nodes.get(`wp:${arg}`)
    if (!w) { console.error(`No work package ${arg}. Known: ${byType('workPackage').map((x) => x.id.replace('wp:', '')).join(', ')}`); process.exit(1) }
    const touches = out(w.id).filter((e) => e.type === 'WP_TOUCHES').map((e) => e.to)
    const designs = out(w.id).filter((e) => e.type === 'WP_IMPLEMENTS_DESIGN').map((e) => nodes.get(e.to)).filter(Boolean)
    const deps = out(w.id).filter((e) => e.type === 'WP_DEPENDS_ON').map((e) => e.to.replace('wp:', ''))
    const dependents = inn(w.id).filter((e) => e.type === 'WP_DEPENDS_ON').map((e) => e.from.replace('wp:', ''))
    emit(`Work package ${arg}`, { ...w, touches, designs: designs.map((d) => d.id), deps, dependents }, [
      `**${w.title}** · lane ${w.lane} · phase ${w.phase} · status **${w.status}** · size ${w.size}`,
      `**Goal** ${w.goal}`,
      `**Scope**\n${list(w.scope ?? [])}`,
      `**Out of scope**\n${list(w.outOfScope ?? [])}`,
      `**Designs**\n${list(designs.map((d) => `${d.id.replace('design:', '')} — ${d.title} [${d.status}]${d.spec ? ` → ${d.spec}` : ''}`))}`,
      `**Files (globs)**\n${list(w.files ?? [])}`,
      `**Existing files matched**\n${list(touches)}`,
      `**Acceptance**\n${list(w.acceptance ?? [])}`,
      `**Tests required**\n${list(w.tests ?? [])}`,
      `**Depends on** ${deps.join(', ') || '—'} · **Blocks** ${dependents.join(', ') || '—'}`,
      `**Decisions** ${(w.decisions ?? []).join(', ') || '—'}`,
    ].join('\n\n'))
    break
  }
  case 'untested': {
    const pages = byType('page').filter((p) => p.portal !== 'dev' && p.route !== '(error)' && !inn(p.id).some((e) => e.type === 'COVERS_ROUTE' || e.type === 'USES_TESTID'))
    emit('Pages without e2e coverage', pages.map((p) => p.id), list(pages.map((p) => `${p.route} — ${p.id}`)))
    break
  }
  case 'undesigned': {
    const pages = byType('page').filter((p) => p.portal !== 'dev' && p.route !== '(error)' && !inn(p.id).some((e) => e.type === 'DESIGNS_ROUTE'))
    emit('Pages without design', pages.map((p) => p.id), list(pages.map((p) => `${p.route} — ${p.id}`)))
    break
  }
  case 'pending': {
    const d = byType('design').filter((n) => n.status === 'pending').sort((a, b) => a.id.localeCompare(b.id))
    emit('Designs pending', d.map((x) => x.id), list(d.map((x) => `${x.id.replace('design:', '')} — ${x.title}`)))
    break
  }
  case 'questions': {
    const d = byType('design').filter((n) => n.status === 'received' && n.openQuestions?.length && (!arg || n.id === `design:${arg}`))
    emit('Open engineering questions', d.map((x) => ({ id: x.id, q: x.openQuestions })), d.map((x) => `**${x.id.replace('design:', '')}**\n${list(x.openQuestions)}`).join('\n\n'))
    break
  }
  case 'search': {
    const q = (arg ?? '').toLowerCase()
    const hits = graph.nodes.filter((n) => JSON.stringify([n.id, n.title, n.route, n.name, n.path]).toLowerCase().includes(q)).slice(0, 60)
    emit(`Search "${arg}"`, hits.map((h) => h.id), list(hits.map((h) => `[${h.type}] ${h.id}${h.route ? ` (${h.route})` : ''}${h.title ? ` — ${h.title}` : ''}`)))
    break
  }
  default:
    console.error(`Unknown command ${cmd}. Run with --help.`)
    process.exit(1)
}
