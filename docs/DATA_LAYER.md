# Data layer: indexes, numbering, pagination

Written for engineers adding or changing a list query, a numbered document, or a table.
It records the decisions from WP-L06 (epic `agents/epics/L06-data-layer.md`). Migration
`server/db/migrations/0019_l06_data_layer.sql` implements them.

## Rules

1. Every org-scoped list or lookup query needs an index that starts with `organization_id`.
   The exceptions are small, static tables, listed at the end of this document.
2. A list that orders by `created_at DESC` for live rows gets the partial index
   `(organization_id, created_at DESC) WHERE deleted_at IS NULL`. If the list also has a
   status filter, add `(organization_id, status, created_at DESC)`.
3. Never compute a user-facing sequence number with `COUNT(*) + 1`. Use
   `allocateDocumentNumber` (see "Document numbers").
4. Don't page with a deep `OFFSET`. Offset pages are capped at 1000. Beyond that, use the
   keyset cursor (see "Pagination").
5. Don't resolve related rows one request at a time in a loop. Add a batch reader, as
   `property.getMany` and `job.getMany` do.
6. `tests/integration/data-layer-indexes.test.ts` must list the primary query of each new
   hot table. The test runs `EXPLAIN` with `enable_seqscan = off` and fails if the plan
   uses a sequential scan.

## Hot tables: primary query and index

| Table | Primary query | Index |
|---|---|---|
| properties | org list, newest first; optional status | `properties_org_created_idx`, `properties_org_status_created_idx` |
| quotes | org list; status; by property; number lookup | `quotes_org_created_idx`, `quotes_org_status_created_idx`, `quotes_org_property_idx`, `quotes_org_number_unique` |
| invoices | same shape as quotes | `invoices_org_created_idx`, `invoices_org_status_created_idx`, `invoices_org_property_idx`, `invoices_org_number_unique` |
| work_orders | same shape as quotes | `work_orders_org_created_idx`, `work_orders_org_status_created_idx`, `work_orders_org_property_idx`, `work_orders_org_number_unique` |
| inspections | by property | `inspections_org_property_created_idx` |
| audit_log | filter / export, newest first; entity timeline | `audit_log_org_created_idx`, `audit_log_org_entity_idx` |
| notifications | a user's bell and list, newest first | `notifications_org_user_created_idx` (plus the existing `notifications_org_user_idx`, `notifications_user_unread_idx`) |
| deliverables | by property; reconcile of stuck `generating` rows | `deliverables_org_property_idx`, `deliverables_org_status_updated_idx` |
| jobs | by status; recent runs by kind | `jobs_org_status_idx`, `jobs_kind_created_idx` |
| property_photos | by property, in sort order | `property_photos_org_property_idx` |
| property_attachments | by property | `property_attachments_org_property_idx` |
| clients, subcontractors | org list, newest first | `clients_org_created_idx`, `subcontractors_org_created_idx` |
| assessments, contacts, buildings | by property | `*_org_property_idx` |
| building_sections | by building | `building_sections_org_building_idx` |
| invoice_payments | by invoice | `invoice_payments_org_invoice_idx` |
| subcontractor_coi_docs | by subcontractor | `subcontractor_coi_docs_org_sub_idx` |
| change_orders | by work order | `change_orders_org_work_order_idx` |
| message_deliveries | org ledger; status sweep | existing `message_deliveries_org_created_idx`, `message_deliveries_status_created_idx` (L03) |

These already had a unique or lookup index that covers their access pattern:
`labels`, `org_settings`, `org_branding`, `security_policies`, `programs`, `trades`,
`status_pipelines`, `permissions`, `program_memberships`, `saved_views`,
`notification_subscriptions`, `homeowner_users`, `subcontractor_users`, `pending_invites`,
`provider_configs`, `feature_flags`, `inspection_templates`.

## Document numbers

Quote, invoice, and work-order numbers come from `org_number_counters`, with one row per
organization, entity, and period.

- The `period` is the UTC year when the org's number format contains `{year}`. Otherwise it
  is 0, and the numbers form one running series.
- `allocateDocumentNumber(tx, …)` runs inside the create transaction. It runs
  `UPDATE … SET last_seq = last_seq + 1 RETURNING`, so concurrent creates in one org queue
  on that row lock.
- The first allocation in a period seeds the counter from the legacy `COUNT(*) … LIKE`, so
  numbering continues from pre-L06 data.
- If a candidate number already exists, it is skipped, never reused. That can happen with
  legacy gaps or after a format change.
- Backstop: the per-org unique indexes `*_org_number_unique`. If that constraint fires,
  `withNumberRetry` reruns the create once.
- Tests: `tests/integration/numbering-race.test.ts`. It runs 12 concurrent creates per entity
  and expects distinct, consecutive numbers.

## Pagination

- `PaginationInputSchema` still accepts `page` and `pageSize`, with `page ≤ 1000`. RPC
  arguments are not schema-validated, so services also enforce the cap in
  `assertPageWindow`. A violation raises an `Invalid pagination` error, which returns HTTP 400.
- List outputs carry `nextCursor`, or `null` on the last page. To get the next page, pass it
  back as `afterCreatedAt` and `afterId`. Keyset paging costs the same at any depth.
- The cursor holds the last row's timestamp at full microsecond precision.
  `keysetCursor` reads it back from the database. It is not taken from the row's
  millisecond ISO string, because a cursor at millisecond precision would skip or repeat
  rows that share a millisecond.
- Offset and cursor paging use the same order: `created_at DESC, id DESC`.
- The feature is live on these methods: `property.list`, `quote.list`, `invoice.list`,
  `workOrder.list`, `audit.filter`, and `notification.listForUser`.
- The audit CSV export walks the cursor in pages of 1000 rows, up to 50,000 rows.
- Tests: `tests/unit/pagination.test.ts` and `tests/integration/pagination-cursor.test.ts`.

## Batch reads

- `property.getMany(ids, organizationId)` resolves up to 500 ids in one query. It replaced
  the per-row `property.get` loops on the quotes, invoices, work-orders, and compliance
  lists, and on the new-invoice and new-work-order pages.
- `job.getMany` does the same job for the compliance reconcile sweep.
- Tests: `tests/integration/n-plus-one.test.ts`. It spies on the shared client and asserts
  one `select` call for K ids.

## Small or static tables without an org index

`api_keys`, `webhooks`, `webhook_deliveries`, and `compliance_docs` hold a handful of rows
per org (a legacy table; live data is in `deliverables`). They are not on any hot path.
Revisit if one of them grows.
