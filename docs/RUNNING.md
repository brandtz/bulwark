# Running Bulwark locally with the real backend

> **Default mode** since [ADR-0015](../agents/decisions/ADR-0015-real-backend-default.md):
> `pnpm dev` and `pnpm test:e2e` both expect a real Postgres + the seed
> dataset. Mock mode is still available as an explicit opt-in but is no
> longer the implicit fallback.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 | `.nvmrc` is the source of truth; engines field enforces it |
| pnpm | 9.15+ | `corepack enable` then `corepack prepare pnpm@9.15.9 --activate` |
| PostgreSQL | 18.x | Local install (`postgresql-x64-18` on Windows) per [ADR-0012](../agents/decisions/ADR-0012-phase2-infrastructure.md) |

## One-time setup

### 1. Install dependencies

```powershell
pnpm install
```

### 2. Create the local database + role

Pick whichever role/db names suit you. The seed script wipes only the
two demo orgs, never the whole schema, so a shared `bulwark_dev` DB is
safe for day-to-day work.

```powershell
# psql as a Postgres superuser (postgres / your local equivalent)
createuser --pwprompt bulwark_app
createdb --owner=bulwark_app bulwark_dev
```

### 3. Configure `.env.local`

Create `bulwark/.env.local` (gitignored). Minimum required:

```bash
DATABASE_URL=postgres://bulwark_app:YOUR_PASSWORD@localhost:5432/bulwark_dev
NUXT_SESSION_PASSWORD=replace-with-32-char-random-string-please
JWT_SECRET=replace-with-32-char-random-string-please

# Optional — leave unset unless you're wiring R2 / Stripe / Twilio
# BULWARK_PDF_STUB=1     # short-circuit compliance worker without R2
# BULWARK_BACKEND=mock   # explicit opt-out for offline dev demos
```

### 4. Run migrations + seed

```powershell
pnpm db:migrate
pnpm db:seed
```

Or, equivalently, drop + reseed in one shot (DEV ONLY — refuses to run
against a non-localhost `DATABASE_URL`):

```powershell
pnpm db:reset
```

### 5. Start the dev server

```powershell
pnpm dev
```

The app comes up at <http://localhost:3000>. Login with any seeded
persona; demo password for ALL personas is `BulwarkDemo!1`.

| Persona | Email | Role |
|---|---|---|
| Admin | `drew@bulwark.demo` | `org_admin` |
| Manager | `morgan@bulwark.demo` | `org_manager` |
| Field | `matthew@bulwark.demo` | `field` |
| Sub | `jeff@bulwark.demo` | `sub_contractor` |
| Viewer | `vivian@bulwark.demo` | `viewer` |
| Super | `sasha@bulwark.platform` | `super_admin` (both orgs) |
| Acme admin | `ana@acme.demo` | `org_admin` (Acme) |
| Acme field | `felix@acme.demo` | `field` (Acme) |

## Running tests

### Unit tests (always mock-backed; no DB required)

```powershell
pnpm test:unit
```

### Integration tests (real DB)

```powershell
pnpm exec vitest run tests/integration
```

### End-to-end tests (real DB by default per ADR-0015)

```powershell
# Defaults to BULWARK_BACKEND=real; DATABASE_URL must be set.
pnpm test:e2e

# Run just the canary smoke spec:
pnpm exec playwright test tests/e2e/happy-path-launch.spec.ts --project=chromium

# Mock-mode lane (escape hatch; retiring after Wave 2 acceptance):
$env:BULWARK_BACKEND='mock'; pnpm test:e2e
```

The Playwright `globalSetup` reseeds the DB before the suite runs;
individual specs that need a pristine baseline call
`reseedRealBackend()` in `beforeAll`.

## Background worker (compliance PDFs)

The PDF render path uses pg-boss + Puppeteer + Cloudflare R2. To run it
locally:

```powershell
# In a second terminal. Requires R2 credentials in .env.local OR
# BULWARK_PDF_STUB=1 (returns a placeholder URL without Chromium).
pnpm worker:jobs
```

Without the worker running, compliance docs created from the UI stay in
`generating`. This is expected, not a bug — Wave 2 will wire the worker
into the Playwright harness.

## Common issues

| Symptom | Fix |
|---|---|
| `BULWARK_BACKEND=real but DATABASE_URL is unset` (e2e) | Add `DATABASE_URL` to `.env.local` or shell env |
| `Refusing to run db-seed.mjs against a non-localhost DATABASE_URL` | Intentional — seed is dev-only. Set `BULWARK_ALLOW_PROD_SEED=1` only if you're certain |
| Login page accepts password but bounces back | `NUXT_SESSION_PASSWORD` < 32 chars, or `secure` cookie set in non-HTTPS dev. Check the value. |
| Migrations fail with `relation "..." already exists` | Local DB has stale tables from a pre-`pnpm db:reset` era. Run `pnpm db:reset` to nuke and reapply. |
| Compliance doc stuck in `generating` | The worker isn't running. Start `pnpm worker:jobs` in a second terminal. |
