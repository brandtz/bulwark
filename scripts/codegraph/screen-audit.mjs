#!/usr/bin/env node
/**
 * scripts/codegraph/screen-audit.mjs [WP-ID]
 *
 * Gate for moving a screen WP to `review`:
 *   - every design in the WP has tests/e2e/screens/<ID>.spec.ts
 *   - no `test.fixme(` / `test.skip(` left in those specs
 *   - each spec has ≥1 negative assertion (403 | not.toBeVisible | toBeDisabled | toHaveCount(0))
 *   - each SPEC state name appears in a test title of that spec
 * Without an argument, audits every received design.
 */
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GRAPH = JSON.parse(await fs.readFile(path.join(ROOT, 'agents', 'codegraph', 'graph.json'), 'utf8'))
const WPS = JSON.parse(await fs.readFile(path.join(ROOT, 'agents', 'program', 'work-packages.json'), 'utf8'))
const wpId = process.argv[2]
const designs = wpId
  ? (WPS.packages.find((w) => w.id === wpId)?.designs ?? [])
  : GRAPH.nodes.filter((n) => n.type === 'design' && n.status === 'received' && n.spec).map((n) => n.id.replace('design:', ''))
if (wpId && !designs.length) { console.error(`No designs for ${wpId}`); process.exit(1) }

let failures = 0
for (const id of designs) {
  const node = GRAPH.nodes.find((n) => n.id === `design:${id}`)
  const specFile = path.join(ROOT, 'tests', 'e2e', 'screens', `${id}.spec.ts`)
  const problems = []
  if (!existsSync(specFile)) problems.push('no screen spec (run pnpm screen:scaffold ' + id + ')')
  else {
    const src = await fs.readFile(specFile, 'utf8')
    const fixmes = (src.match(/test\.(fixme|skip)\(/g) ?? []).length
    if (fixmes) problems.push(`${fixmes} test.fixme/skip remaining`)
    if (!/403|not\.toBeVisible|toBeDisabled|toHaveCount\(0\)|toBeHidden|not\.toBeAttached/.test(src)) problems.push('no negative assertion found')
    const titles = [...src.matchAll(/test(?:\.fixme|\.skip)?\(\s*[`'"]([^`'"]+)/g)].map((m) => m[1].toLowerCase())
    for (const s of node?.states ?? []) if (!titles.some((t) => t.includes(s.toLowerCase().split(/\s|\//)[0]))) problems.push(`state "${s}" not covered by a test title`)
  }
  if (node?.status !== 'received') problems.push('design not received')
  if (problems.length) { failures++; console.log(`✖ ${id}\n   - ${problems.join('\n   - ')}`) } else console.log(`✔ ${id}`)
}
console.log(failures ? `\n${failures} screen(s) not ready for review` : '\nall screens ready for review')
process.exit(failures ? 1 : 0)
