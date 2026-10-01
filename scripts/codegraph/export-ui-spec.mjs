#!/usr/bin/env node
/**
 * scripts/codegraph/export-ui-spec.mjs — WP-A2: component SPEC → committed JSON.
 *
 * Parses agents/design/return/design-return/A/components/SPEC.md (gitignored:
 * the design return is not in the repository) into
 * tests/unit/_ui-spec.generated.json, which tests/unit/ui-spec-parity.test.ts
 * reads in CI. Each "## Name" section yields its Props (a row may name several
 * props: "label / helper / error"), slots and emitted events.
 *
 *   node scripts/codegraph/export-ui-spec.mjs          # regenerate
 *   node scripts/codegraph/export-ui-spec.mjs --check  # fail when stale
 *
 * Without the SPEC on disk (CI) both modes skip and the committed JSON stands
 * (same split as export-matrix.mjs).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SPEC = path.join(ROOT, 'agents', 'design', 'return', 'design-return', 'A', 'components', 'SPEC.md')
const OUT = path.join(ROOT, 'tests', 'unit', '_ui-spec.generated.json')

if (!existsSync(SPEC)) {
  console.log(`export-ui-spec: ${path.relative(ROOT, SPEC)} not present — skipping (using the committed ${path.relative(ROOT, OUT)}).`)
  process.exit(0)
}

const md = readFileSync(SPEC, 'utf8').replace(/\r\n/g, '\n')
const sections = md.split(/\n(?=## )/u).filter((s) => s.startsWith('## '))

/** "a / b / c" → ["a","b","c"]; strips backticks and trailing "?". */
const names = (cell) => cell.split('/').map((n) => n.replace(/[`?]/gu, '').trim()).filter((n) => /^[A-Za-z][\w-]*$/u.test(n))
const list = (line) => (line ?? '').split(/[,;]/u).map((s) => s.replace(/`/gu, '').trim()).filter((s) => s && s !== '—' && s !== '-')

const components = {}
for (const section of sections) {
  const lines = section.split('\n')
  const name = lines[0].slice(3).trim()
  const existing = /Existing name:\s*yes/iu.test(section)
  const props = []
  let inProps = false
  for (const line of lines) {
    if (/^Props:/u.test(line)) { inProps = true; continue }
    if (inProps && !line.startsWith('|')) { if (props.length || line.trim()) inProps = line.trim() === '' && props.length === 0; continue }
    if (!inProps || /^\|\s*name\s*\|/u.test(line) || /^\|[-\s|]+\|$/u.test(line)) continue
    // | name | type (may contain |) | default | description |
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|$/u)
    if (!m) continue
    for (const n of names(m[1])) props.push({ name: n, type: m[2], default: m[3] === '—' ? null : m[3] })
  }
  const slots = list(section.match(/^Slots:\s*(.*)$/mu)?.[1])
  const emits = list(section.match(/^Emits\/events:\s*(.*)$/mu)?.[1]).map((e) => e.replace(/\s*\(.*$/u, ''))
  components[name] = { existing, props, slots, emits }
}

const out = JSON.stringify({ generatedFrom: path.relative(ROOT, SPEC).replace(/\\/gu, '/'), components }, null, 1) + '\n'
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : ''
  if (current !== out) {
    console.error('export-ui-spec: tests/unit/_ui-spec.generated.json is stale; run node scripts/codegraph/export-ui-spec.mjs')
    process.exit(1)
  }
  console.log(`ui spec current: ${Object.keys(components).length} components.`)
} else {
  writeFileSync(OUT, out)
  console.log(`ui spec: ${Object.keys(components).length} components → ${path.relative(ROOT, OUT)}`)
}
