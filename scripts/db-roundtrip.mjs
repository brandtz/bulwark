/**
 * scripts/db-roundtrip.mjs — E11-S1 smoke test (raw SQL).
 *
 * Inserts an organization, reads it back, deletes it. Confirms the
 * migration applied and DATABASE_URL works end-to-end. Stays on raw
 * postgres-js (no Drizzle) so this script doesn't depend on the
 * Nuxt-flavoured TS resolution that schema barrels expect.
 */
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const slug = `e11-smoke-${Date.now()}`

try {
  const [created] = await sql`
    INSERT INTO organizations (name, slug)
    VALUES ('E11 Smoke Test Org', ${slug})
    RETURNING id, slug
  `
  console.log('INSERT ok:', created)

  const found = await sql`SELECT id FROM organizations WHERE id = ${created.id}`
  console.log('SELECT ok:', found.length === 1 ? 'found 1 row' : `found ${found.length} rows`)

  const deleted = await sql`DELETE FROM organizations WHERE id = ${created.id} RETURNING id`
  console.log('DELETE ok:', deleted.length === 1 ? 'removed 1 row' : `removed ${deleted.length} rows`)

  console.log('OK: round-trip succeeded')
} catch (e) {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
} finally {
  await sql.end()
}
