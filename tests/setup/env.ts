/**
 * tests/setup/env.ts — load .env.local for integration tests (E11-S2).
 *
 * Vitest doesn't auto-load .env files. This setup runs once per test
 * file, parses bulwark/.env.local, and surfaces vars on process.env so
 * tests that need DATABASE_URL/etc. can find them.
 *
 * Honest about the format: line-based KEY=VALUE, # comments ignored,
 * no quoting/expansion magic. If we ever need real dotenv semantics,
 * bring in `dotenv` and delete this.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envPath = fileURLToPath(new URL('../../.env.local', import.meta.url))

try {
  const text = readFileSync(envPath, 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  // .env.local missing is fine — tests that need DATABASE_URL will
  // skip themselves rather than blowing up the whole suite.
}
