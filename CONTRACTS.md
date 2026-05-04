# Bulwark — API & Service Contracts

> **Status**: Skeleton landed in E0-S1. Filled out per-domain in E0-S5.
>
> This is the **single source of truth** for every data shape that crosses a
> service boundary. Both `MockXService` and `RealXService` implement these
> contracts. UI imports the inferred TypeScript types from
> [`shared/contracts/`](shared/contracts/) — never inlines a shape.

---

## How to use this document

For each domain (Property, Assessment, Quote, …) we publish:

1. **Zod schemas** in `shared/contracts/<domain>.ts` — runtime + compile-time
2. **Service interface** in `shared/contracts/services.ts` — `IPropertyService`, etc.
3. **A row in the table below** linking to the file and listing the methods

Adding a new method = adding a Zod schema for its input/output, adding the
method to the interface, and updating the table.

---

## Service Contract Index

| Domain | File | Interface | Methods (MVP) |
|---|---|---|---|
| Auth | `shared/contracts/auth.ts` | `IAuthService` | `login`, `logout`, `refresh`, `requestPasswordReset`, `resetPassword`, `acceptInvite`, `currentUser` |
| Organization | `shared/contracts/organization.ts` | `IOrganizationService` | `get`, `update`, `listForUser`, `switchActive` |
| User / Membership | `shared/contracts/user.ts` | `IUserService` | `list`, `get`, `invite`, `updateMembership`, `removeMembership` |
| Property | `shared/contracts/property.ts` | `IPropertyService` | `list`, `get`, `create`, `update`, `softDelete`, `updateStatus` |
| Client | `shared/contracts/client.ts` | `IClientService` | `list`, `get`, `create`, `update`, `softDelete` |
| Assessment | `shared/contracts/assessment.ts` | `IAssessmentService` | `getForProperty`, `create`, `update`, `submit` |
| Compliance Eval | `shared/contracts/compliance.ts` | (pure fn) | `evaluateCompliance(assessment, standards)` |
| Quote | `shared/contracts/quote.ts` | `IQuoteService` | `list`, `get`, `create`, `update`, `send`, `accept`, `decline` |
| Work Order | `shared/contracts/work-order.ts` | `IWorkOrderService` | `list`, `get`, `createFromQuote`, `assignSubToTrade`, `updateProgress` |
| Subcontractor | `shared/contracts/subcontractor.ts` | `ISubcontractorService` | `list`, `get`, `create`, `update`, `softDelete` |
| Compliance Doc | `shared/contracts/compliance-doc.ts` | `IComplianceDocService` | `generate` (returns jobId), `get`, `listForProperty` |
| Invoice | `shared/contracts/invoice.ts` | `IInvoiceService` | `list`, `get`, `createFromWorkOrder`, `markPaid` |
| Job (async) | `shared/contracts/job.ts` | `IJobService` | `get`, `pollUntilDone` |
| Audit Log | `shared/contracts/audit-log.ts` | `IAuditLogService` | `list`, `query` |
| API Key | `shared/contracts/api-key.ts` | `IApiKeyService` | `list`, `issue`, `revoke` |
| Settings (per domain) | `shared/contracts/settings/*.ts` | various | per E9 sub-route |

---

## Shape conventions

Every entity Zod schema:

- `id: z.string().uuid()`
- `organizationId: z.string().uuid()` (tenant-scoped entities only)
- `createdAt: z.string().datetime()` (ISO string at the API boundary; Date in DB)
- `updatedAt: z.string().datetime()`
- `deletedAt: z.string().datetime().nullable()`

Every list method:

- Input: `{ organizationId, page?: number, pageSize?: number, filters?: …, sort?: … }`
- Output: `{ rows: T[], total: number, page: number, pageSize: number }`

Money:

- Stored and transported as integer cents (`z.number().int().nonnegative()`)
- Display formatting is a UI concern — see `shared/utils/money.ts`
- Per [CONVENTIONS.md](CONVENTIONS.md): **never** float, **never** string

Status fields:

- Always `z.enum([...])` matching the Postgres enum exactly
- Source of truth: `server/db/schema/<entity>.ts` enum declaration

---

## Filling this document

Stories E0-S5 (contracts) and E11 (backend wiring) keep this file current. Any
new method added to a service must add a row here and a Zod schema in the
corresponding file. CI lint rule (added in E0-S8) verifies that every service
method named in this table exists in the corresponding file.
