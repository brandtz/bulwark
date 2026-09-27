/**
 * scripts/security/audit-gate.mjs — dependency vulnerability gate (WP-L07 S5).
 *
 * Runs `pnpm audit --prod --json` and fails on any high/critical advisory that
 * is not listed in scripts/security/audit-allowlist.json. Every allowlist entry
 * needs a reason and an expiry date; expired entries fail the gate so accepted
 * risk is re-reviewed instead of lingering.
 *
 * Usage: node scripts/security/audit-gate.mjs [--json-file=<audit.json>]
 *   --json-file lets tests feed a recorded audit instead of hitting the registry.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const BLOCKING = new Set(['high', 'critical'])

export function evaluate(audit, allowlist, today = new Date()) {
  const allowed = new Map(allowlist.map((entry) => [String(entry.id), entry]))
  const problems = []
  for (const entry of allowlist) {
    if (!entry.reason || !entry.expires) problems.push(`allowlist entry ${entry.id} needs reason and expires`)
    else if (new Date(entry.expires) < today) problems.push(`allowlist entry ${entry.id} (${entry.module}) expired on ${entry.expires}`)
  }
  for (const advisory of Object.values(audit.advisories ?? {})) {
    if (!BLOCKING.has(advisory.severity)) continue
    const ids = [String(advisory.id), advisory.github_advisory_id].filter(Boolean)
    if (ids.some((id) => allowed.has(id))) continue
    problems.push(`${advisory.severity} ${advisory.module_name} ${advisory.github_advisory_id ?? advisory.id}: ${advisory.title} (fix: ${advisory.patched_versions})`)
  }
  return problems
}

function main() {
  const jsonArg = process.argv.find((a) => a.startsWith('--json-file='))
  const raw = jsonArg
    ? readFileSync(jsonArg.slice('--json-file='.length), 'utf8')
    : (() => {
        try {
          return execFileSync('pnpm', ['audit', '--prod', '--json'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 })
        } catch (error) {
          // pnpm audit exits non-zero when it finds anything; the JSON is still on stdout.
          if (error.stdout) return error.stdout
          throw error
        }
      })()
  const allowlist = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'security', 'audit-allowlist.json'), 'utf8'))
  const problems = evaluate(JSON.parse(raw), allowlist)
  if (problems.length) {
    console.error(`✖ dependency audit gate: ${problems.length} blocking finding(s)\n  - ${problems.join('\n  - ')}`)
    process.exit(1)
  }
  console.log('✔ dependency audit gate: no unaccepted high/critical advisories')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
