# BULWARK — CONVENTIONS.md
> AI Agent Instruction Manual | Version 1.1
> v1.1 — Added Frontend-First Build Sequence section. Added two "never do" entries.
> Read this file in its entirety before writing a single line of code.
> These conventions are non-negotiable. They are not suggestions.
> When a convention conflicts with your preferred pattern, follow the convention.

---

## How to Use This Document

This file is the law for all agents working on the Bulwark codebase.
Every rule is stated in imperative form. "Never" means never.
"Always" means always. There are no exceptions unless explicitly noted.

If you believe a convention is wrong or insufficient for a specific situation,
document the conflict in your handoff file and flag it for human review.
Do not silently deviate.

Cross-reference documents:
- `CONTRACTS.md` — API input/output shapes and service contracts
- `DECISIONS.md` — Architecture decision log with reasoning
- `UI-CONTRACTS.md` — Shared component props and behavior
- `BUILD_STATUS.md` — Current build state and next prompt
- `agents/handoffs/` — Per-prompt handoff notes

---

## SECTION 1 — File Naming & Structure

### Naming Conventions

| Context | Convention | Examples |
|---|---|---|
| Database schema files | kebab-case | `properties.ts`, `work-orders.ts` |
| Service classes | PascalCase | `PropertyService.ts`, `WorkOrderService.ts` |
| Nitro API route files | kebab-case | `index.get.ts`, `[id].put.ts` |
| Vue pages | kebab-case | `property-pipeline.vue`, `assessment-form.vue` |
| Vue components | PascalCase | `PropertyCard.vue`, `AssessmentChecklist.vue` |
| Composables | camelCase | `useProperties.ts`, `useQuote.ts` |
| Pinia stores | camelCase | `pipeline.ts`, `currentProperty.ts` |
| Validator files | kebab-case | `properties.ts`, `assessments.ts` |
| Test files | match source + .spec | `assessment-form.spec.ts` |
| Migration files | Drizzle auto-generated | Never rename migration files |
| Constants | SCREAMING_SNAKE_CASE | `MAX_PAGE_SIZE`, `JWT_ACCESS_EXPIRY` |
| Environment variables | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `JWT_SECRET` |

### Rules

1. Component files are always PascalCase. Page files are always kebab-case.
   Nuxt uses this distinction internally. Mixing them causes routing bugs.

2. Migration files are never renamed after generation.
   Drizzle tracks them by filename. Renaming breaks the migration history.

3. Test files always match the name of the file they test.
   `PropertyService.ts` → `PropertyService.spec.ts`
   `assessment-form.vue` → `assessment-form.spec.ts`

### Project Structure

```
bulwark/
├── server/
│   ├── api/                    # Nitro API route files
│   │   ├── properties/
│   │   │   ├── index.get.ts
│   │   │   ├── index.post.ts
│   │   │   ├── [id].get.ts
│   │   │   ├── [id].put.ts
│   │   │   └── [id].delete.ts
│   │   ├── assessments/
│   │   ├── quotes/
│   │   ├── workorders/
│   │   ├── compliance/
│   │   ├── invoices/
│   │   ├── jobs/
│   │   └── auth/
│   ├── services/               # Business logic — one class per domain
│   │   ├── PropertyService.ts
│   │   ├── AssessmentService.ts
│   │   ├── QuoteService.ts
│   │   ├── WorkOrderService.ts
│   │   ├── ComplianceService.ts
│   │   ├── InvoiceService.ts
│   │   ├── JobService.ts
│   │   ├── AuditService.ts
│   │   └── ApiKeyService.ts
│   ├── db/
│   │   ├── schema/             # Drizzle table definitions
│   │   │   ├── organizations.ts
│   │   │   ├── users.ts
│   │   │   ├── memberships.ts
│   │   │   ├── sessions.ts
│   │   │   ├── refresh-tokens.ts
│   │   │   ├── api-keys.ts
│   │   │   ├── audit-log.ts
│   │   │   ├── properties.ts
│   │   │   ├── assessments.ts
│   │   │   ├── quotes.ts
│   │   │   ├── work-orders.ts
│   │   │   ├── compliance-docs.ts
│   │   │   ├── invoices.ts
│   │   │   ├── subcontractors.ts
│   │   │   └── jobs.ts
│   │   ├── index.ts            # Drizzle client export
│   │   └── migrations/         # Auto-generated — never manually edit
│   ├── errors/
│   │   └── index.ts            # Error taxonomy — never add inline
│   ├── middleware/
│   │   ├── 01.auth.ts          # Auth resolution — runs first
│   │   └── 02.requestLogger.ts # Request logging — runs second
│   ├── plugins/
│   │   └── errorHandler.ts     # Global error handler
│   ├── utils/
│   │   ├── auth/
│   │   │   ├── session.ts
│   │   │   ├── jwt.ts
│   │   │   ├── apiKeys.ts
│   │   │   └── requireAuth.ts
│   │   ├── tenancy.ts          # requireOrgMembership firewall
│   │   ├── validation.ts       # validateBody, validateQuery
│   │   ├── pagination.ts       # paginate() utility
│   │   ├── rateLimit.ts        # Rate limit configs and checker
│   │   ├── storage.ts          # Cloudflare R2 signed URLs
│   │   ├── fileUpload.ts       # Upload validation
│   │   ├── compliance.ts       # OR wildfire standards evaluation
│   │   ├── logger.ts           # Structured logger — only logging mechanism
│   │   └── env.ts              # Zod-validated env vars
│   └── types/
│       ├── logging.ts          # LogEventType enum
│       └── auth.ts             # AuthContext, SessionUser, OrgRole
├── pages/
├── components/
│   └── ui/                     # Base components matching UI-CONTRACTS.md
├── composables/
├── stores/
├── validators/                 # Zod schemas — shared server + client
├── types/
│   └── index.ts                # Shared TypeScript domain types
├── assets/
│   └── templates/
│       ├── compliance-doc.html
│       └── quote.html
├── tests/
│   ├── e2e/                    # Playwright tests — CODEOWNERS protected
│   └── unit/                   # Vitest unit tests — CODEOWNERS protected
├── .github/
│   ├── CODEOWNERS
│   ├── ui-specs/               # Per-screen UI specifications
│   └── wireframes/             # Exported wireframe images
├── agents/
│   ├── prompts/                # Numbered execution prompt files
│   ├── roles/                  # Agent role instruction files
│   └── handoffs/               # Post-prompt handoff notes
├── CONVENTIONS.md              # This file
├── CONTRACTS.md
├── DECISIONS.md
├── UI-CONTRACTS.md
├── BUILD_STATUS.md
├── drizzle.config.ts
└── nuxt.config.ts
```

---

## SECTION 2 — API Layer Pattern

### The Four-Layer Rule

Every feature domain follows this exact layer structure. No layer is skipped.
No layer reaches past its adjacent layer.

```
Route handler (server/api/)
  ↓ calls
Service class (server/services/)
  ↓ calls
Drizzle ORM (server/db/)
  ↓ queries
PostgreSQL
```

### Layer Rules

**Routes:**
- Import and call services only. Never import from `server/db/` directly.
- Call `requireAuth(event)` as the absolute first line. No exceptions.
- Call `validateBody()` or `validateQuery()` before calling any service.
- Never catch errors themselves — let them propagate to `errorHandler.ts`.
- Never contain business logic. Route files are wiring only.

**Services:**
- Are classes with static async methods. One class per domain.
- Contain all business logic for their domain. Nothing else does.
- Never import H3 utilities (`createError`, `getHeader`, etc.).
- Never handle HTTP concerns — no status codes, no headers.
- Throw only typed errors from `server/errors/index.ts`.
- Accept `organizationId` and `userId` as explicit parameters on every
  method that touches tenant-scoped data.
- Never exceed 200 lines. Beyond that — split into focused sub-services
  and document the split in `DECISIONS.md`.

**Validators:**
- Are Zod schemas living in `validators/[domain].ts`.
- Are shared between server (route validation) and client (form validation).
- Are never duplicated. One schema, imported in both places.

**Database:**
- Is accessed only through Drizzle ORM.
- Is never accessed from route files or Vue components.
- Uses only the query builder or fully parameterized raw SQL.

### Service Class Template

```typescript
// server/services/ExampleService.ts

import { db } from '~/server/db'
import { exampleTable } from '~/server/db/schema/example'
import { AuditService } from './AuditService'
import { requireOrgMembership } from '~/server/utils/tenancy'
import {
  NotFoundError,
  ConflictError,
  AuthorizationError
} from '~/server/errors'

export class ExampleService {

  static async list(
    organizationId: string,
    userId: string,
    params: ListParams
  ): Promise<PaginatedResponse<Example>> {
    await requireOrgMembership(userId, organizationId)
    // implementation
  }

  static async getById(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<Example> {
    await requireOrgMembership(userId, organizationId)
    const record = await db.query.exampleTable.findFirst({
      where: and(
        eq(exampleTable.id, id),
        eq(exampleTable.organizationId, organizationId),
        isNull(exampleTable.deletedAt)
      )
    })
    if (!record) throw new NotFoundError('Example not found', { id })
    return record
  }

  static async create(
    data: CreateExampleInput,
    organizationId: string,
    userId: string
  ): Promise<Example> {
    await requireOrgMembership(userId, organizationId, 'org_manager')

    return await db.transaction(async (tx) => {
      const [record] = await tx.insert(exampleTable)
        .values({ ...data, organizationId, createdBy: userId })
        .returning()

      await AuditService.log(tx, {
        organizationId,
        userId,
        action:        'example.created',
        resourceType:  'example',
        resourceId:    record.id,
        resourceLabel: record.name,
        nextState:     { ...record },
      })

      return record
    })
  }
}
```

---

## SECTION 3 — Database Conventions

### Standard Columns

Every table without exception has these columns:

```typescript
id:         uuid('id').defaultRandom().primaryKey()
createdAt:  timestamp('created_at').defaultNow().notNull()
updatedAt:  timestamp('updated_at').defaultNow().notNull()
deletedAt:  timestamp('deleted_at')  // nullable — soft delete only
```

### Naming Inside the Database

| Element | Convention | Example |
|---|---|---|
| Table names | snake_case plural | `work_orders`, `compliance_docs` |
| Column names | snake_case | `created_at`, `owner_name` |
| Enum type names | snake_case + _enum | `property_status_enum` |
| Index names | idx_[table]_[column] | `idx_properties_status` |
| Foreign key names | fk_[table]_[ref] | `fk_assessments_properties` |

### Soft Deletes — No Hard Deletes Ever

Nothing in Bulwark is ever hard deleted. Soft delete only:

```typescript
// ✅ Correct
await tx.update(table).set({ deletedAt: new Date() }).where(eq(table.id, id))

// ❌ Critical violation
await db.delete(table).where(eq(table.id, id))
```

Every query filters soft-deleted records:
```typescript
where: and(eq(table.organizationId, orgId), isNull(table.deletedAt))
```

### Money — Integer Cents Always

All monetary values are stored as integer cents. No floats. Ever.

```typescript
// ✅ Correct — $1,500.00 stored as 150000
laborCents:    integer('labor_cents').notNull()
materialCents: integer('material_cents').notNull()
totalCents:    integer('total_cents').notNull()

// ❌ Critical violation
price: decimal('price', { precision: 10, scale: 2 }) // NEVER
price: real('price')                                  // NEVER
```

Formatting for display happens in the UI layer only. Never in services or routes.

### All IDs Are UUIDs

```typescript
// ✅ Correct
id: uuid('id').defaultRandom().primaryKey()

// ❌ Violation
id: serial('id').primaryKey() // NEVER auto-increment integers
```

### Indexing at Schema Time

Indexes are written in the schema file when the table is created.
They are never added "later as an optimization."

```typescript
// Index every foreign key
// Index every status enum column
// Index every column used in WHERE or ORDER BY on list queries
export const propertiesIndexes = {
  orgIdx:    index('idx_properties_org').on(properties.organizationId),
  statusIdx: index('idx_properties_status').on(properties.status),
  deletedIdx:index('idx_properties_deleted').on(properties.deletedAt),
}
```

### Migration Discipline

Schema changes follow this sequence exactly. No shortcuts:

```bash
# 1. Edit the schema file
# 2. Generate migration
pnpm drizzle-kit generate

# 3. Review the generated migration file before applying
# 4. Apply migration
pnpm drizzle-kit migrate

# 5. Commit schema file + migration file together in one commit
```

**Never:**
- Use `pnpm drizzle-kit push` against anything except a throwaway scratch DB
- Edit a migration file after it has been applied anywhere
- Write a migration file by hand
- Apply migrations out of order

### Transactions — Required for Multi-Table Writes

Any operation writing to more than one table uses a Drizzle transaction.
Any multi-step write where partial completion would corrupt data uses a transaction.
Financial writes always use a transaction.

```typescript
// ✅ Correct
return await db.transaction(async (tx) => {
  const [record] = await tx.insert(tableA).values({...}).returning()
  await tx.update(tableB).set({...}).where(...)
  await AuditService.log(tx, {...})
  return record
})
```

**Transaction rules:**
- Never nest transactions
- Never hold a transaction open across an external API call
  (Stripe, Whisper, Claude — call external service first, then open transaction)
- Never catch transaction errors silently — let them propagate

### No Derived Data

Do not store values that can be calculated from other stored values
unless the value represents a locked historical record.

```typescript
// ❌ Wrong — sum of line items, recalculate instead
totalCents: integer('total_cents') // if this is just sum(lineItems)

// ✅ Exception — finalized invoice total is a historical record
// Document the reason in a comment
invoiceTotalCents: integer('invoice_total_cents')
  // Locked at invoice finalization — must not change even if
  // line item prices are later updated. Historical record.
```

### Multi-Tenancy — organizationId on Every Tenant Table

Every table that holds tenant data has:
```typescript
organizationId: uuid('organization_id')
  .references(() => organizations.id)
  .notNull()
```

Every query against a tenant table always filters by organizationId.
Querying by ID alone is a critical violation.

---

## SECTION 4 — Authentication & Authorization

### The Three Auth Mechanisms

**Session + Cookie** — web app users logging in through the browser.
**JWT** — API clients and future mobile app.
**API Keys** — service-to-service calls. Format: `bwk_` + 32 random chars.

### Auth Middleware

The auth middleware (`server/middleware/01.auth.ts`) runs on every request.
It sets `event.context.auth` with the resolved identity.
Route handlers never re-authenticate — they read from context.

PUBLIC_ROUTES is the only bypass mechanism. Agents never add to this list
without explicit human approval.

### requireAuth

`requireAuth(event, requiredOrgRole?)` is the FIRST line of every route handler.
It resolves identity AND organization context AND verifies membership.
It returns a fully typed `AuthContext` object.

```typescript
export default defineEventHandler(async (event) => {
  // Always first. Always.
  const auth = await requireAuth(event, 'org_manager')

  // Rest of handler only runs if auth succeeds
})
```

### organizationId Resolution

`organizationId` is NEVER taken from the request body or query params.
It is always resolved from the authenticated request context by
`resolveOrganizationId(event)` inside `requireAuth`.

### The Tenant Firewall

`requireOrgMembership(userId, organizationId, requiredRole?)` is called at the
top of every service method that touches tenant data.
It is the firewall between tenants. It runs in the service layer —
not just the route layer. Belt and suspenders.

### JWT Rules

- Access tokens: 15 minute expiry
- Refresh tokens: 7 day expiry, single use, rotate on each use
- Refresh token reuse detected: invalidate ALL refresh tokens for that user
- Signed with JOSE library exclusively
- `jsonwebtoken` package is banned. Remove it if found in package.json.

### API Key Rules

- Raw key shown once at creation. Never stored. Never returned again.
- `bcrypt` hash stored in `api_keys.key_hash`
- First 8 chars stored in `api_keys.key_prefix` for display
- Scope validation runs before any route handler logic
- Revoked keys are soft-deleted — `revokedAt` timestamp set

### Role Authorization Matrix

```
Action                          field   org_manager   org_admin   super_admin
─────────────────────────────────────────────────────────────────────────────
View properties                   ✓         ✓             ✓           ✓
Create / edit property             ✓         ✓             ✓           ✓
Submit assessment                  ✓         ✓             ✓           ✓
Create / edit quote                ✗         ✓             ✓           ✓
Accept / decline quote             ✗         ✓             ✓           ✓
Create work order                  ✗         ✓             ✓           ✓
Update job progress                ✓         ✓             ✓           ✓
Generate compliance doc            ✗         ✓             ✓           ✓
View invoice amounts               ✗         ✓             ✓           ✓
Create / send invoice              ✗         ✗             ✓           ✓
Mark invoice paid                  ✗         ✗             ✓           ✓
Manage subcontractors              ✗         ✓             ✓           ✓
Manage users / invite              ✗         ✗             ✓           ✓
Manage API keys                    ✗         ✗             ✓           ✓
Edit compliance standards          ✗         ✗             ✓           ✓
Edit company settings              ✗         ✗             ✓           ✓
View audit log                     ✗         ✓             ✓           ✓
Access all organizations           ✗         ✗             ✗           ✓
```

Default for any action not in this table: `org_admin` minimum.

### Auth Conventions

1. `requireAuth(event)` is the first line of every route handler. No exceptions.
2. `organizationId` never comes from user-supplied input.
3. `event.context.auth` is set only by middleware. Never mutated downstream.
4. JOSE only for JWT. No `jsonwebtoken`.
5. Session cookies are always HttpOnly and Secure. Never disabled.
6. API keys are bcrypt-hashed. Raw key shown once only.
7. 401 = unauthenticated. 403 = unauthorized. Never interchangeable.
8. Auth failures never reveal which field was wrong.
9. `super_admin` is never assigned to tenant organization members.
10. All auth events are written to the audit log.

---

## SECTION 5 — Error Handling

### Error Taxonomy

All errors live in `server/errors/index.ts`. Agents never create new error
classes inline or in service files. Adding a new type requires a `DECISIONS.md` entry.

| Class | HTTP | Code | When to Use |
|---|---|---|---|
| `NotFoundError` | 404 | `RESOURCE_NOT_FOUND` | Record not found for this query |
| `AuthenticationError` | 401 | `AUTHENTICATION_REQUIRED` | No valid credentials |
| `AuthorizationError` | 403 | `AUTHORIZATION_FAILED` | Valid credentials, wrong role |
| `ValidationError` | 422 | `VALIDATION_FAILED` | Bad input format or missing fields |
| `ConflictError` | 409 | `CONFLICT` | Valid input conflicts with current state |
| `PlanLimitError` | 402 | `PLAN_LIMIT_REACHED` | Tenant plan limit hit |
| `ExternalServiceError` | 503 | `EXTERNAL_SERVICE_ERROR` | Stripe, Whisper, R2 failed |
| `RateLimitError` | 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| `InternalError` | 500 | `INTERNAL_ERROR` | Unexpected — should be rare |

### API Error Response Shape

Every error response has exactly this shape. No variations:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Property not found",
    "fields": { "fieldName": "error message" }
  }
}
```

`fields` is only present on `ValidationError`.
`code` is what frontend logic matches against. Never match on `message`.

### Error Handling Rules

1. Services throw typed `BulwarkError` subclasses only.
   Plain `Error`, string throws, and H3's `createError()` are banned in services.
2. Route handlers never catch errors. They propagate to `errorHandler.ts`.
3. `try/catch` in routes is only for wrapping external API calls before
   re-throwing as `ExternalServiceError`.
4. `ValidationError` is for bad input format. `ConflictError` is for state conflicts.
   Using `ValidationError` for state conflicts is a violation.
5. Stack traces never reach the client in production.
6. External service failures always throw `ExternalServiceError` with service name set.
7. Frontend matches on `error.code`. Never on `error.message`.
8. 500-level errors logged at `error` level. 4xx logged at `warn`.

---

## SECTION 6 — Logging

### The Logger

`server/utils/logger.ts` is the only logging mechanism in the application.
`console.log`, `console.warn`, `console.error` are banned in all committed code.
The linter is configured to error on `console.*` usage.

### Log Levels

| Level | When to Use |
|---|---|
| `debug` | Development flow tracing only. Never in production code paths. |
| `info` | Normal operations: successful requests, completed jobs, auth success |
| `warn` | Unexpected but recovered: auth failures, validation errors, slow external calls |
| `error` | Failures that shouldn't happen: 5xx responses, external failures, rollbacks |
| `fatal` | System cannot continue: DB connection lost, critical config missing |

### Required Fields

Every log entry includes:
- `timestamp` — ISO 8601
- `environment` — `development | staging | production`
- `type` — `LogEventType` from `server/types/logging.ts`
- `requestId` — from `event.context.requestId`, set by request logger middleware

Never generate a new `requestId` inside a service. Always read from context.

### The Never-Log Blacklist

These are never logged regardless of level, environment, or context:

```
Passwords and password hashes
JWT tokens (access or refresh) — log token jti only
API keys raw or hashed — log key prefix only (first 8 chars)
Session tokens or cookies
Credit card numbers, CVV, expiry dates
Bank account numbers
Social Security Numbers
Driver's license numbers
Passport numbers
Homeowner insurance policy numbers
Full name + parcel ID combined (linkable PII)
Stack traces in production API responses (server logs: yes, API responses: no)
```

### Logging Rules

1. `console.*` is banned. Use the logger utility exclusively.
2. Every log entry includes `requestId` from `event.context.requestId`.
3. Log levels are not interchangeable. Follow the definitions above.
4. The blacklist is absolute. Development is not an exception.
5. External service calls are logged with duration. Calls over 3000ms
   are logged at `warn` regardless of success.
6. Auth failures log `reason: 'invalid_credentials'` only.
   Never log which specific field was wrong.
7. Compliance doc generation, finalization, and download are always
   logged at `info`. These are legally significant events.
8. Production log output is JSON. Colorized output is development only.

---

## SECTION 7 — Frontend Conventions

### The Four-Layer Frontend Architecture

```
Page (pages/)
  → calls composable
    → composable fetches via useFetch/useAsyncData/$fetch
      → composable manages state
        → page renders from composable state
          → components receive props, emit events
```

Nothing skips a layer. No exceptions.

### Pages

Pages are thin orchestrators. `<script setup>` exceeding 100 lines signals
a refactor is needed. Logic moves to composables, UI moves to components.

### Composables

One composable per domain. The composable owns all data fetching and
mutation for that domain. Returned refs are always wrapped in `readonly()`.

```typescript
// composables/useProperty.ts
export function useProperty(propertyId: string) {
  const property = ref<Property | null>(null)
  // ... fetching and mutation methods
  return {
    property: readonly(property), // readonly — always
    updateStatus,
    archiveProperty,
  }
}
```

### useFetch vs useAsyncData vs $fetch

- `useAsyncData` — page load data, SSR-critical, primary page content
- `useFetch` — shorthand for simple cases
- `$fetch` — mutations and on-demand fetches inside functions ONLY

`$fetch` at the top level of `<script setup>` is banned.
It breaks SSR and causes hydration errors.

### Pinia Stores

Stores hold global persistent state only:
- Current authenticated user
- Current organization context
- UI state persisting across navigation
- Toast/notification queue

Stores are NOT general-purpose state containers.
Per-feature state lives in composables.

### Components

- Props-in, events-out. Components never fetch data directly.
- All props typed with `defineProps<Interface>()`. No `PropType<any>`.
- Maximum 200 lines combined template + script. Extract sub-components beyond that.
- Options API is banned. Script setup with Composition API only.

### Forms

All forms use vee-validate with `toTypedSchema(ZodSchema)`.
The Zod schema is imported from `~/validators/` — same schema the API uses.
Never duplicated. Never inline validation.

Forms never use native `<form>` submission. Always `@submit.prevent`.

### Navigation Guards

Route protection lives in `middleware/auth.global.ts` only.
`onMounted` auth checks in components are a violation.
Role requirements are declared in `definePageMeta`:

```typescript
definePageMeta({ requiredRole: 'org_admin' })
```

### Role-Based Rendering

`authStore.can('action')` is the only mechanism for conditional rendering.
Inline role string comparisons in templates are a violation.

### Mobile-First Rules

- All interactive elements: minimum 48×48px tap target (`min-h-12 min-w-12`)
- All form inputs: minimum 44px height (`h-11`)
- Text minimum: 14px (`text-sm`) for anything users act on
- Every async action shows loading state and disables trigger during execution
- Double-submission is never possible

### Frontend Conventions Summary

1. Pages are orchestrators. 100-line script setup limit.
2. Components never fetch. They receive props.
3. `$fetch` inside functions only. Never at setup time.
4. Pinia for global state. Composables for feature state.
5. All composable refs are `readonly()` when returned.
6. All forms use vee-validate + Zod. Always.
7. All props are TypeScript-typed.
8. 200-line component limit. Extract sub-components beyond that.
9. Route protection in middleware only.
10. `authStore.can()` for all conditional rendering.
11. 48px minimum tap target. 44px minimum input height.
12. Every async action shows loading state. No double-submission.
13. Options API is banned. Composition API only.

---

## SECTION 8 — Testing

### The Fundamental Rule

**Tests are written by humans before implementation begins.**
**Agents execute against tests. Agents never author tests.**

Playwright test files are written in Phase 0 before any feature prompt runs.
By the time a feature prompt executes, its test file already exists.
The agent's job: write code that makes the existing test pass.

### CODEOWNERS Protection

```
# .github/CODEOWNERS
tests/e2e/*    @brandtz
tests/unit/*   @brandtz
```

No PR modifying test files merges without explicit human approval.
Agents cannot self-approve test modifications.

### Test Modification Rule

If a test is failing, the implementation is wrong. The test is not wrong.
Fix the implementation.
An agent that modifies test assertions to make tests pass
has committed a critical violation. Revert the test. Fix the code.

### data-testid Selectors

All Playwright assertions use `data-testid` selectors.
CSS class selectors, text content selectors, and DOM structure selectors
are banned in test files. They break on restyling and restructuring.

Every interactive element and significant UI region has a `data-testid`
defined in the `ui-specs/` file before the component is built.
Agents implement the testid map. They do not invent their own IDs.

### Skipped Tests

Tests blocked on future features use `test.skip()` with a comment:

```typescript
test.skip('photo upload validation', async ({ page }) => {
  // Skipped: requires S3/R2 file storage — Phase 2
})
```

Silent non-running tests are a violation.
Skipped tests are documented in the handoff file.

### Unit Test Coverage Requirements

Unit tests are required for three areas regardless of Playwright coverage:

1. **Compliance evaluation engine** (`server/utils/compliance.ts`)
   Every compliant/non-compliant material combination is tested.
   Every OAR reference is verified.

2. **Financial calculations**
   Every calculation function. Every edge case.
   Integer result verified on every calculation (no floats).

3. **Permission/role logic**
   Every role × action combination in the authorization matrix.

### Verification Gates

After every 4-5 feature prompts a verification gate runs:
- Full Playwright suite executed
- Test counts compared to `BUILD_STATUS.md` last recorded state
- Any previously passing test now failing = regression = BLOCKED
- CODEOWNERS audit: no test file modified by a feature prompt
- Mobile viewport tests run specifically
- Gate result written to `BUILD_STATUS.md`

### Testing Conventions Summary

1. Tests written in Phase 0 before any feature implementation.
2. Agents never author or modify test files.
3. CODEOWNERS enforces this structurally.
4. Failing test = wrong implementation. Fix the code.
5. `data-testid` selectors only. No CSS, text, or DOM structure selectors.
6. Skipped tests use `test.skip()` with reason comment.
7. Unit tests required for compliance engine, financial calculations, permissions.
8. Verification gates run every 4-5 prompts.
9. Regression = blocked. No new features while a regression exists.
10. Test status in every handoff: "[file] — [X/Y passing] — [skipped: reason]"

---

## SECTION 9 — Security

### HTTP Security Headers

Set globally in `nuxt.config.ts` routeRules. Never removed or weakened.
CSP violations are resolved by refining the policy — never by removing it.

Required headers on all routes:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (see nuxt.config.ts for full policy)
- `Permissions-Policy: camera=(), microphone=(self), geolocation=()`

### Input Validation

Every API route validates all input with a Zod schema before business logic.
Validation uses the allowlist approach: define what is permitted, not what is blocked.

```typescript
// ✅ Allowlist approach
ownerName: z.string().regex(/^[\w\s\-'.]+$/, 'Invalid characters')

// ❌ Blocklist approach — always incomplete
ownerName: z.string().regex(/^[^<>{}]+$/) // still bypassable
```

### SQL Injection Prevention

Drizzle's query builder is always used. String interpolation in raw SQL is banned.

```typescript
// ❌ Critical violation — never
db.execute(sql`SELECT * FROM properties WHERE id = '${userInput}'`)

// ✅ Only acceptable raw SQL form
db.execute(sql`SELECT * FROM properties WHERE id = ${sql.param(userInput)}`)
```

### File Upload Security

All three checks are required. Skipping any one is a violation:
1. File size check (before reading content) — maximum 10MB
2. MIME type header validation against allowlist
3. Magic byte verification (actual file content matches claimed type)

Files stored with UUID-based keys. Original filenames stored in DB only.
Never used as storage keys.

### Signed URLs

All stored files served through signed expiring URLs.
No file in R2 storage is ever publicly accessible by direct URL.
Compliance document download URLs expire in 15 minutes.
All compliance doc downloads logged in audit log.

### Rate Limiting

Rate limits applied to:
- Auth endpoints: 10 requests per 15 minutes per IP
- General API: 100 requests per minute per user
- PDF generation: 10 per hour per org
- Assessment submission: 30 per hour per user

### Dependency Security

`pnpm audit` runs on every PR via GitHub Actions.
High and critical vulnerabilities block merge.

Before adding any package:
1. Actively maintained? (commit in last 6 months)
2. Known vulnerabilities? (`pnpm audit`)
3. Justified dependency tree size?
4. Could 10 lines of native code replace it?

### Environment Variables

All environment variables validated at startup via `EnvSchema` in `server/utils/env.ts`.
The application does not start with missing required configuration.
Secrets are never logged, never in API responses, never committed.
`.env` files are always in `.gitignore`.

### Security Conventions Summary

1. HTTP security headers set globally. Never removed.
2. Every route validates all input with Zod. No exceptions.
3. Allowlist validation approach. Never blocklist.
4. `db.execute()` with string interpolation is a critical violation.
5. File uploads validated for size, MIME type, AND magic bytes. All three.
6. Files stored with UUID keys. Never original filenames.
7. All files served via signed expiring URLs.
8. Rate limiting on auth and resource-intensive endpoints.
9. `pnpm audit` on every PR. High/critical blocks merge.
10. Env vars validated at startup. App refuses to start if missing.
11. Secrets never logged, never in responses, never committed.
12. JOSE only for JWT. `jsonwebtoken` is banned.

---

## SECTION 10 — Performance

### Performance Budgets

These are hard limits checked at every verification gate:

```
Time to Interactive:
  Field screens (assessment, job update): < 2 seconds on 3G
  Admin screens (dashboard, pipeline):    < 3 seconds on 4G

API Response Times (p95):
  List endpoints:     < 150ms
  Detail endpoints:   < 100ms
  Write endpoints:    < 200ms
  Async job creation: < 200ms (job created — processing is background)

Bundle Size:
  Initial JS bundle:  < 200KB gzipped
  Per-route chunk:    < 50KB gzipped

Database Queries:
  Over 100ms: logged at warn level
  Over 500ms: logged at error level + index optimization required
```

### Pagination — Always

Every list endpoint is paginated using the `paginate()` utility.
Default page size: 25. Maximum: 100.
Unbounded queries (`findMany()` with no limit) are a violation.

### N+1 Query Prevention

List views always use Drizzle's `with` option to eager-load relations.
Fetching a list then looping to fetch related records is a violation.

```typescript
// ✅ Single query with eager loading
db.query.properties.findMany({
  with: { assessment: { columns: { status: true, overallCompliant: true } } },
  limit: 25,
})

// ❌ N+1 violation
const properties = await db.query.properties.findMany({ limit: 25 })
for (const p of properties) {
  p.assessment = await db.query.assessments.findFirst(...) // NEVER
}
```

### Column Selection

Never use `findMany()` on tables with jsonb columns or more than 10 columns
without specifying `columns`. Fetch only what the view displays.

### Async Operations

Any operation taking over 2 seconds is async:
- Returns a job ID immediately
- Processing happens in background
- Client polls `/api/jobs/[id]` for completion

Applies to: PDF generation, audio transcription (Phase 3+), bulk operations.

### Data Fetching

`useAsyncData` or `useFetch` for all initial page data (SSR-safe).
`$fetch` inside functions only — never at the top level of `<script setup>`.

### Database Query Logging

Queries over 100ms are logged at `warn`. Agents must add an index if a query
consistently exceeds 100ms. The index is added to the schema file and a
migration generated.

### Images

All images served through Nuxt Image. Raw `<img>` tags with absolute URLs
are banned. Automatic WebP conversion and responsive sizing.

### Performance Conventions Summary

1. All list endpoints paginated. 25 default, 100 maximum.
2. No N+1 queries. Eager-load with Drizzle `with`.
3. Column selection explicit on large tables. No `SELECT *` equivalent.
4. Operations over 2 seconds are always async with job ID pattern.
5. `useAsyncData`/`useFetch` for page data. `$fetch` in functions only.
6. Queries over 100ms: warn. Over 500ms: error + add index.
7. All images through Nuxt Image. No raw `<img>` with absolute URLs.
8. Initial JS bundle under 200KB gzipped. Per-route under 50KB.
9. Performance budgets checked at every verification gate.
10. A screen regressing below TTI budget is treated as a failing test.

---

## SECTION 11 — Audit Log

### The Rule

Every service method that writes to the database writes an audit log entry
in the same transaction. The audit log is not optional. It is not Phase 2.
It ships with every feature from day one.

### AuditService

`AuditService.log(tx, entry)` is the only way to write to the audit log.
It is always called with the transaction object — never the db client directly.
If the operation rolls back, the audit entry rolls back with it.

### Audit Log Table

`audit_log` rows are write-once, read-many.
No `UPDATE` or `DELETE` against `audit_log` is ever permitted.
Any agent that writes either is in critical violation.

### Required Fields

- `organizationId` — always
- `userId` — always when a user action. Null for system-initiated actions.
- `action` — from `auditLogActionEnum` — never a free-form string
- `resourceType` — plain string: `'property'`, `'quote'`, etc.
- `resourceLabel` — human-readable: address, name, number. Never a raw UUID.
- `previousState` — snapshot of changed fields BEFORE the change
- `nextState` — snapshot of changed fields AFTER the change

### Audit Conventions

1. Every DB write operation includes an audit log entry. No exceptions.
2. `AuditService.log()` receives the transaction object (`tx`).
3. `audit_log` rows are immutable. No UPDATE or DELETE. Ever.
4. `previousState` is fetched before the transaction opens.
5. `nextState` comes from the `.returning()` result of the write.
6. `resourceLabel` is human-readable. Never a raw UUID.
7. System actions use `userId: null` with `metadata` identifying the process.
8. Auth events are logged even though they don't write to tenant tables.

---

## SECTION 12 — Agent Behavior Rules

These rules apply specifically to how agents operate within this codebase.

### Before Writing Any Code

1. Read `CONTRACTS.md` — know the API contracts
2. Read `CONVENTIONS.md` — this file
3. Read `DECISIONS.md` — know why decisions were made
4. Read `BUILD_STATUS.md` — know the current state
5. Read all handoff files in `agents/handoffs/` relevant to your module
6. Read the ui-spec file for any screen you are building
7. Read the Playwright test file for your module — know what you must satisfy

### During Implementation

- Follow the conventions. When in doubt, re-read the relevant section.
- Match the data-testid map from the ui-spec file exactly.
- Use the error taxonomy. Create nothing new.
- Write to the audit log in every service write method.
- Apply the tenant firewall in every service method.

### The Three-Act Structure

Every prompt has three acts. All three complete before committing.

**Act 1: Build** — implement the feature
**Act 2: Role Challenge Reviews** — Architect, Security, QA, UX (per tier)
**Act 3: Arbitration** — classify findings, make merge decision,
         modify next prompt if needed, update BUILD_STATUS.md, commit

### Review Tiers

Declared in each prompt header. Agents do not choose the tier.

| Tier | Active Roles | When |
|---|---|---|
| `FULL` | Architect + Security + QA + UX | Auth, assessment, compliance, payments |
| `SECURITY_ONLY` | Architect + Security + QA | All API routes, DB-touching services |
| `SPOT` | Architect + UX | UI-only, config, read-only screens |

### Commit Format

```
PROMPT-[N]: [Module Name] — [APPROVED CLEAN|APPROVED|APPROVED WITH CONDITIONS]

[One line summary of what was built]
[If conditions: "Carries N findings to PROMPT-[N+1]"]
```

### What Agents Never Do

- Modify files in `tests/e2e/` or `tests/unit/`
- Create new error classes outside `server/errors/index.ts`
- Add routes to `PUBLIC_ROUTES` without human approval
- Write `console.log` in any committed code
- Use `db.execute()` with string interpolation
- Hard delete any record from any table
- Store money as anything other than integer cents
- Use the `jsonwebtoken` package
- Add Docker configuration
- Use `pnpm drizzle-kit push` against non-scratch databases
- Take `organizationId` from the request body
- Write `UPDATE` or `DELETE` against `audit_log`
- Modify test assertions to make tests pass
- Build a backend service before the frontend screen that consumes it (FE-first sequence) — exception: auth in Phase 1
- Skip Phase 0 spec docs to "save time" — the contracts are the contract

### Frontend-First Build Sequence

Bulwark is built **frontend-first**. The order is:

1. **Phase 0** — Specification only. CONTRACTS, CONVENTIONS, DECISIONS, UI-CONTRACTS, full Drizzle schema, error taxonomy, Zod validators, Playwright stubs, all `.github/ui-specs/` files.
2. **Phase 1** — Auth (FE + BE together; no value in mocking auth flow).
3. **Phase 2 onward** — Per screen: build FE against contract-shaped mock data → wire BE to same contracts → QA the screen → commit.

The mock-data layer in the frontend conforms to the Zod schemas in `validators/`. When the backend wires in, the mock layer is swapped — no contract changes are required. If the frontend needs a contract change, the change is made in `CONTRACTS.md` and `validators/` first, then both sides update.

Build priority by user system: **Admin → Contractor → Subcontractor → Homeowner**. Most Contractor screens are restricted-permission variants of Admin screens; the Subcontractor and Homeowner portals are net-new builds (Phase 2). Full screen inventory in `BULWARK_SCREENS_BY_ROLE.md`.

---

*BULWARK CONVENTIONS.md — Version 1.1*
*Maintained by Brandtworks-Enterprises LLC*
*v1.1 — Added Frontend-First Build Sequence section. Added two "never do" entries.*
*All agents read this file before writing code.*
