/**
 * drizzle.config.ts — Bulwark DB tooling config
 *
 * Used by drizzle-kit for migration generation and Drizzle Studio. Schemas
 * live under server/db/schema/. Migrations land in server/db/migrations/.
 *
 * Decisions NOT taken:
 *   - We do NOT generate migrations during E0. Schemas are written in E0-S4
 *     and migrations are produced + applied in E11-S1 (real backend wiring).
 */
import type { Config } from 'drizzle-kit'

export default {
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://localhost/bulwark_dev',
  },
  strict: true,
  verbose: true,
} satisfies Config
