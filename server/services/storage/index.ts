/**
 * server/services/storage/index.ts — driver selector + accessor (L01-S1 / ADR-0001).
 *
 * `getStorage()` returns the process-wide driver, chosen by env:
 *   - production  → always 'r2' (fail closed; R2Driver throws if creds missing).
 *   - dev/test    → 'fs' unless BULWARK_STORAGE_DRIVER=r2 is explicitly set.
 *
 * The selection is a pure function (`selectStorageDriverName`) so it is unit-
 * testable without constructing a driver.
 */
import type { StorageDriver } from './types'
import { FsDriver } from './fs-driver'
import { R2Driver } from './r2-driver'

/**
 * Structural env snapshot — `Record<string, string | undefined>` so
 * `process.env` satisfies it without weak-type friction (the same
 * ProcessEnv TS2559 lesson recorded in server/jobs/env-guard.ts).
 */
export type StorageEnv = Record<string, string | undefined>

/** Decide which driver name to use. Production is always 'r2' (fail closed). */
// NODE_ENV is read as the literal `process.env.NODE_ENV` (Nitro inlines it at build time); a
// built server started without NODE_ENV would otherwise see it unset on the env object and
// silently fall back to the fs driver (WP-L02 finding, same quirk as runtimeGuardEnv).
export function selectStorageDriverName(
  env: StorageEnv = { ...process.env, NODE_ENV: process.env.NODE_ENV },
): 'r2' | 'fs' {
  if (env.NODE_ENV === 'production') return 'r2'
  return env.BULWARK_STORAGE_DRIVER === 'r2' ? 'r2' : 'fs'
}

let _driver: StorageDriver | null = null

/** Process-wide storage driver (memoized). */
export function getStorage(): StorageDriver {
  if (_driver) return _driver
  _driver = selectStorageDriverName() === 'r2' ? new R2Driver() : new FsDriver()
  return _driver
}

/** Test seam — clears the memoized driver so a test can re-select. */
export function __resetStorageForTests(): void {
  _driver = null
}

export * from './types'
export { buildStorageKey, parseStorageKey } from './keys'
