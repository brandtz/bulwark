import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL || 'postgresql://bulwark:Blue1984@localhost:5432/bulwark_dev')
const r = await sql`select tablename from pg_tables where schemaname='public' order by tablename`
console.log(r.map((x) => x.tablename).join('\n'))
await sql.end()
