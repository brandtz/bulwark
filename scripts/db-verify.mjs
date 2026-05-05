import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)
try {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name
  `
  console.log('Tables:')
  for (const t of tables) console.log('  ', t.table_name)

  const enums = await sql`
    SELECT typname FROM pg_type
    WHERE typtype='e' AND typnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
    ORDER BY typname
  `
  console.log('Enums:')
  for (const e of enums) console.log('  ', e.typname)
} finally {
  await sql.end()
}
