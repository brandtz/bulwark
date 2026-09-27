/**
 * WP-L07 S7 — RPC role policy. Every method of every BulwarkServices contract
 * must be classified (deny by default), and the decisions for the escalation
 * paths found in the SH-01/L03 reviews stay closed.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { authorizeRpc, RPC_POLICY } from '../../server/utils/rpc-policy'
import type { Role } from '../../shared/contracts/_shared'

const contractsDir = new URL('../../shared/contracts/', import.meta.url)

function contractMethods(): Record<string, string[]> {
  const services = readFileSync(new URL('services.ts', contractsDir), 'utf8').replace(/\r/g, '')
  const serviceBlock = services.slice(services.indexOf('export interface BulwarkServices'))
  const map = [...serviceBlock.matchAll(/^\s+([a-zA-Z]+): (I[A-Za-z]+Service)/gm)].map((m) => [m[1]!, m[2]!] as const)
  const interfaces: Record<string, string[]> = {}
  for (const file of readdirSync(contractsDir)) {
    const src = readFileSync(new URL(file, contractsDir), 'utf8').replace(/\r/g, '')
    for (const m of src.matchAll(/export interface (I[A-Za-z]+Service)\b[^{]*\{([\s\S]*?)\n\}/g)) {
      interfaces[m[1]!] = [...m[2]!.matchAll(/^ {2}([a-zA-Z]+)\??\s*[(<:]/gm)].map((x) => x[1]!)
    }
  }
  return Object.fromEntries(map.map(([name, iface]) => [name, interfaces[iface] ?? []]))
}

const ALL_ROLES: Role[] = ['super_admin', 'org_admin', 'org_manager', 'field', 'sub_contractor', 'viewer', 'homeowner', 'stakeholder']

describe('RPC policy coverage', () => {
  const methods = contractMethods()

  it('parses the service contracts', () => {
    expect(Object.keys(methods).length).toBeGreaterThan(40)
    expect(methods.user).toContain('invite')
  })

  it('classifies every contract method (deny by default)', () => {
    const missing = Object.entries(methods).flatMap(([svc, ms]) =>
      ms.filter((m) => RPC_POLICY[svc]?.[m] === undefined).map((m) => `${svc}.${m}`))
    expect(missing).toEqual([])
  })

  it('has no stale entries for methods the contracts no longer declare', () => {
    const stale = Object.entries(RPC_POLICY).flatMap(([svc, rules]) =>
      Object.keys(rules).filter((m) => !methods[svc]?.includes(m)).map((m) => `${svc}.${m}`))
    expect(stale).toEqual([])
  })
})

describe('authorizeRpc', () => {
  it('refuses unknown and prototype-chain methods', () => {
    expect(authorizeRpc('user', 'nope', 'org_admin')).toMatchObject({ allowed: false, status: 404 })
    expect(authorizeRpc('user', 'constructor', 'org_admin')).toMatchObject({ allowed: false, status: 404 })
    expect(authorizeRpc('__proto__', 'toString', 'org_admin')).toMatchObject({ allowed: false, status: 404 })
  })

  it('lets anonymous callers reach only public auth entry points', () => {
    expect(authorizeRpc('auth', 'login', null)).toEqual({ allowed: true })
    expect(authorizeRpc('auth', 'resetPassword', null)).toEqual({ allowed: true })
    expect(authorizeRpc('property', 'list', null)).toMatchObject({ allowed: false, status: 401 })
    expect(authorizeRpc('auth', 'getAttempts', null)).toMatchObject({ allowed: false, status: 401 })
  })

  it('never exposes system methods, not even to super_admin', () => {
    for (const [svc, m] of [['account', 'purgeExpiredDeletions'], ['audit', 'record'], ['notification', 'enqueue'], ['search', 'index']] as const) {
      expect(authorizeRpc(svc, m, 'super_admin')).toMatchObject({ allowed: false, status: 403 })
    }
  })

  it('keeps administration admin-only (invite, roles, secrets, flags, keys)', () => {
    const adminOnly = [
      ['user', 'invite'], ['user', 'setRole'], ['providerConfig', 'list'], ['providerConfig', 'upsert'],
      ['featureFlag', 'set'], ['permission', 'upsert'], ['apiKey', 'create'], ['webhook', 'create'], ['comms', 'deliveryHealth'],
    ] as const
    for (const [svc, m] of adminOnly) {
      for (const role of ALL_ROLES) {
        const allowed = role === 'super_admin' || role === 'org_admin' || role === 'org_manager'
        expect(authorizeRpc(svc, m, role).allowed, `${role} ${svc}.${m}`).toBe(allowed)
      }
    }
  })

  it('never gives portal roles whole-org staff reads', () => {
    for (const role of ['homeowner', 'sub_contractor', 'stakeholder'] as const) {
      for (const [svc, m] of [['property', 'list'], ['quote', 'list'], ['invoice', 'list'], ['client', 'list'], ['reporting', 'arAging'], ['search', 'search']] as const) {
        expect(authorizeRpc(svc, m, role).allowed, `${role} ${svc}.${m}`).toBe(false)
      }
    }
  })

  it('gives homeowners their self-scoped portal reads and nobody else', () => {
    expect(authorizeRpc('homeowner', 'listMyQuotes', 'homeowner').allowed).toBe(true)
    expect(authorizeRpc('homeowner', 'getMyInvoice', 'homeowner').allowed).toBe(true)
    expect(authorizeRpc('homeowner', 'listMyQuotes', 'sub_contractor').allowed).toBe(false)
    expect(authorizeRpc('homeowner', 'listForUser', 'homeowner').allowed).toBe(false)
  })

  it('keeps viewers read-only on staff data', () => {
    expect(authorizeRpc('property', 'list', 'viewer').allowed).toBe(true)
    expect(authorizeRpc('property', 'update', 'viewer').allowed).toBe(false)
    expect(authorizeRpc('inspection', 'submit', 'viewer').allowed).toBe(false)
    expect(authorizeRpc('inspection', 'submit', 'field').allowed).toBe(true)
  })
})
