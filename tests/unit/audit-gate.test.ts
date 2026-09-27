/** WP-L07 S5 — dependency audit gate: seeded vulnerable deps fail, accepted risk must be justified and unexpired. */
import { describe, expect, it } from 'vitest'
import { evaluate } from '../../scripts/security/audit-gate.mjs'

const advisory = (id: number, severity: string, module_name: string) => ({
  id, severity, module_name, github_advisory_id: `GHSA-${id}`, title: `${module_name} issue`, patched_versions: '>=9.9.9',
})
const audit = { advisories: { 1: advisory(1, 'critical', 'evil-pkg'), 2: advisory(2, 'moderate', 'meh-pkg'), 3: advisory(3, 'high', 'accepted-pkg') } }
const today = new Date('2026-09-26')

describe('audit gate', () => {
  it('fails on an unaccepted high/critical advisory and ignores moderate ones', () => {
    const problems = evaluate(audit, [{ id: 'GHSA-3', module: 'accepted-pkg', reason: 'build-time only', expires: '2026-12-31' }], today)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/critical evil-pkg GHSA-1/u)
  })

  it('passes a clean tree', () => {
    expect(evaluate({ advisories: { 2: advisory(2, 'moderate', 'meh-pkg') } }, [], today)).toEqual([])
  })

  it('rejects expired or unjustified allowlist entries', () => {
    const problems = evaluate({ advisories: {} }, [
      { id: 'GHSA-3', module: 'accepted-pkg', reason: 'old', expires: '2026-01-01' },
      { id: 'GHSA-4', module: 'x' },
    ], today)
    expect(problems.join('\n')).toMatch(/expired on 2026-01-01/u)
    expect(problems.join('\n')).toMatch(/GHSA-4 needs reason and expires/u)
  })
})
