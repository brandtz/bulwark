import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('FAIL: DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { max: 1 })
try {
  const rows = await sql`SELECT version() AS v, current_database() AS db, current_user AS u`
  console.log('OK:', rows[0])
} catch (e) {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
} finally {
  await sql.end()
}
