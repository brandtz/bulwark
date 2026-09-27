/**
 * WP-L07 S3 — tenant-firewall coverage gate (ADR-0006).
 *
 * Static analysis over server/services/*.real.ts: every public method that is
 * org-scoped (takes an `organizationId` parameter or an input carrying one)
 * must call the tenant firewall before touching data — `assertSameTenant(...)`
 * directly, or a helper that is itself tenant-bound. A new org-scoped method
 * without the call fails CI. Deliberate exceptions are listed with reasons.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SERVICES = path.resolve(__dirname, '../../server/services')

/** Calls that establish the tenant boundary (directly or via a checked helper). */
const FIREWALL_CALLS = [
  'assertSameTenant(',
  'this.requireOrg(', // notification.real: organization comes from the session resolver only
  'this.myPropertyIds(', // homeowner.real: asserts the tenant, then scopes to the caller
]

/** `Class.method` → why it is exempt. Keep this list short and justified. */
const EXEMPT: Record<string, string> = {
  'RealAuditService.record': 'system-only (RPC policy); called by services after their own tenant check',
  'RealAuditService.logSystemError': 'system-only (RPC policy); writes an error row for the given org',
  'RealNotificationService.enqueue': 'system-only (RPC policy); used by event subscribers',
  'RealStatusPipelineService.reconcileWithDefaults': 'system-only (RPC policy); startup reconciliation',
  'RealAuthService.switchActiveOrg': 'switches the tenant itself; refuses organizations the user is not a member of',
}

interface Finding { key: string, file: string }

function orgScoped(method: ts.MethodDeclaration, source: ts.SourceFile): boolean {
  const params = method.parameters.map((p) => p.getText(source))
  if (params.some((p) => /\borganizationId\b/u.test(p))) return true
  const body = method.body?.getText(source) ?? ''
  return /\b(input|args|opts)\.organizationId\b/u.test(body)
}

/** Methods of a class whose own body calls the firewall (delegation targets). */
function guardedMethods(cls: ts.ClassDeclaration, source: ts.SourceFile): Set<string> {
  const guarded = new Set<string>()
  for (const member of cls.members) {
    if (ts.isMethodDeclaration(member) && member.body && ts.isIdentifier(member.name)
      && FIREWALL_CALLS.some((call) => member.body!.getText(source).includes(call))) guarded.add(member.name.text)
  }
  return guarded
}

function scan(): { checked: string[], missing: Finding[] } {
  const checked: string[] = []
  const missing: Finding[] = []
  for (const file of readdirSync(SERVICES).filter((f) => f.endsWith('.real.ts'))) {
    const full = path.join(SERVICES, file)
    const source = ts.createSourceFile(full, readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true)
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return
      const guarded = guardedMethods(node, source)
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.body || !ts.isIdentifier(member.name)) continue
        const modifiers = ts.getModifiers(member) ?? []
        if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.StaticKeyword)) continue
        if (!orgScoped(member, source)) continue
        const key = `${node.name.text}.${member.name.text}`
        checked.push(key)
        const body = member.body.getText(source)
        const delegates = [...guarded].some((name) => name !== member.name.getText(source) && body.includes(`this.${name}(`))
        if (EXEMPT[key] || delegates || FIREWALL_CALLS.some((call) => body.includes(call))) continue
        missing.push({ key, file })
      }
    })
  }
  return { checked, missing }
}

describe('tenant firewall coverage', () => {
  const { checked, missing } = scan()

  it('finds the org-scoped surface', () => {
    expect(checked.length).toBeGreaterThan(150)
    expect(checked).toContain('RealPropertyService.list')
  })

  it('every org-scoped real-service method calls the tenant firewall', () => {
    expect(missing.map((m) => `${m.key} (${m.file})`)).toEqual([])
  })

  it('exemptions still exist (no stale entries)', () => {
    const stale = Object.keys(EXEMPT).filter((key) => !checked.includes(key))
    expect(stale).toEqual([])
  })

  it('the detector catches a method without the firewall (negative control)', () => {
    const probe = ts.createSourceFile('probe.real.ts', `class RealProbe {
      async leaky(id: string, organizationId: string) { return db.select().where(eq(t.id, id)) }
      async safe(input: { organizationId: string }) { assertSameTenant(this.r, input.organizationId) }
    }`, ts.ScriptTarget.Latest, true)
    const cls = probe.statements[0] as ts.ClassDeclaration
    const [leaky, safe] = cls.members as unknown as ts.MethodDeclaration[]
    expect(orgScoped(leaky!, probe) && !FIREWALL_CALLS.some((c) => leaky!.body!.getText(probe).includes(c))).toBe(true)
    expect(FIREWALL_CALLS.some((c) => safe!.body!.getText(probe).includes(c))).toBe(true)
  })
})
