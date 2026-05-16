/**
 * server/services/search.real.ts — RealSearchService
 * (W3-5 / EH-P / ADR-0033).
 *
 * # Decisions (ADR-0008, ADR-0033)
 *   - **Postgres `ilike` per entity**. For each searchable entity we
 *     run a tenant-scoped `SELECT … WHERE org = $1 AND deleted_at IS
 *     NULL AND (col_a ILIKE $2 OR …) LIMIT 20`. Cheap, predictable,
 *     and zero new infrastructure.
 *   - **Per-entity cap of 20** then a global cap of 50, after scoring
 *     each hit with the same `scoreSearchHit()` formula the mock
 *     uses. The contract caps `limit` at 50 so the global truncate
 *     is well-defined.
 *   - **Tenant firewall on every read** via `assertSameTenant`. The
 *     bounded SQL also includes `organization_id = $1` defensively.
 *   - **`index()` is a no-op** — Postgres scans live rows. The hook
 *     is documented in the ADR for the Phase-2 tsvector/GIN
 *     promotion path.
 *
 * # Decision cast down
 *   - Rejected: building a single `UNION ALL` over every entity. The
 *     planner can fail to push the `ILIKE` predicate inside each
 *     branch; running N parallel `Promise.all` queries gave better
 *     latency on a 10k-row dev fixture.
 *   - Rejected: returning row JSON inline. Cmd-K only needs
 *     title/subtitle/url; callers fetch the row on click.
 */
import { and, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import type {
  ISearchService,
  SearchEntityType,
  SearchIndexInput,
  SearchInput,
  SearchOutput,
  SearchResult,
} from '../../shared/contracts/search'
import { scoreSearchHit } from '../../shared/contracts/search'
import { escapeLikeContains } from '../../shared/utils/likeEscape'
import { getDb } from '../db/client'
import { properties } from '../db/schema/properties'
import { clients } from '../db/schema/clients'
import { quotes } from '../db/schema/quotes'
import { workOrders } from '../db/schema/work_orders'
import { invoices } from '../db/schema/invoices'
import { subcontractors } from '../db/schema/subcontractors'
import { inspections } from '../db/schema/inspections'
import { contacts } from '../db/schema/contacts'
import { buildings } from '../db/schema/buildings'
import { assertSameTenant, type TenantResolver } from './_tenant'

const PER_TYPE_LIMIT = 20

interface AdapterHit {
  id: string
  organizationId: string
  title: string
  subtitle: string
  url: string
}

type AdapterRunner = (orgId: string, pattern: string) => Promise<AdapterHit[]>

export class RealSearchService implements ISearchService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private readonly adapters: Record<SearchEntityType, AdapterRunner> = {
    property: this.runProperties.bind(this),
    client: this.runClients.bind(this),
    quote: this.runQuotes.bind(this),
    'work-order': this.runWorkOrders.bind(this),
    invoice: this.runInvoices.bind(this),
    subcontractor: this.runSubcontractors.bind(this),
    inspection: this.runInspections.bind(this),
    contact: this.runContacts.bind(this),
    building: this.runBuildings.bind(this),
  }

  async search(input: SearchInput): Promise<SearchOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const limit = input.limit ?? 20
    const allowed: SearchEntityType[] =
      input.types && input.types.length > 0
        ? input.types
        : (Object.keys(this.adapters) as SearchEntityType[])

    // W5-3 / ADR-0037: escape LIKE wildcards in user input so `%` /
    // `_` can't widen the match to every row (data-exfiltration via
    // search). Drizzle parameterises the value but does not escape
    // the LIKE meta-characters.
    const pattern = escapeLikeContains(input.query)
    const runs = await Promise.all(allowed.map((t) => this.adapters[t](input.organizationId, pattern)))

    const hits: SearchResult[] = []
    allowed.forEach((entityType, idx) => {
      const perType: SearchResult[] = []
      for (const h of runs[idx]!) {
        const score = scoreSearchHit(input.query, h.title, h.subtitle)
        if (score <= 0) continue
        perType.push({
          entityType,
          id: h.id,
          title: h.title,
          subtitle: h.subtitle,
          url: h.url,
          score,
          organizationId: h.organizationId,
        })
      }
      perType.sort((a, b) => b.score - a.score)
      hits.push(...perType.slice(0, PER_TYPE_LIMIT))
    })
    hits.sort((a, b) => b.score - a.score)
    return { results: hits.slice(0, limit), hasMore: hits.length > limit }
  }

  async index(_input: SearchIndexInput): Promise<void> {
    // No-op (Postgres ILIKE scans live rows). See ADR-0033.
  }

  // --------------------------------------------------------------------------
  // Adapter implementations.
  // --------------------------------------------------------------------------
  private async runProperties(orgId: string, pattern: string): Promise<AdapterHit[]> {
    const db = getDb()
    const where = and(
      eq(properties.organizationId, orgId),
      sql`${properties.deletedAt} IS NULL`,
      or(
        ilike(properties.addressLine1, pattern),
        ilike(properties.city, pattern),
        ilike(properties.parcelNumber, pattern),
      ) as SQL,
    )
    const rows = await db
      .select({
        id: properties.id,
        organizationId: properties.organizationId,
        addressLine1: properties.addressLine1,
        city: properties.city,
        state: properties.state,
        status: properties.status,
      })
      .from(properties)
      .where(where)
      .limit(PER_TYPE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      title: r.addressLine1,
      subtitle: `${r.city}, ${r.state} · ${r.status}`,
      url: `/admin/properties/${r.id}`,
    }))
  }

  private async runClients(orgId: string, pattern: string): Promise<AdapterHit[]> {
    const db = getDb()
    const where = and(
      eq(clients.organizationId, orgId),
      sql`${clients.deletedAt} IS NULL`,
      or(
        ilike(clients.fullName, pattern),
        ilike(clients.email, pattern),
        ilike(clients.phone, pattern),
      ) as SQL,
    )
    const rows = await db
      .select({
        id: clients.id,
        organizationId: clients.organizationId,
        fullName: clients.fullName,
        email: clients.email,
        phone: clients.phone,
      })
      .from(clients)
      .where(where)
      .limit(PER_TYPE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      title: r.fullName,
      subtitle: r.email ?? r.phone ?? '',
      url: `/admin/clients/${r.id}`,
    }))
  }

  private async runQuotes(orgId: string, pattern: string): Promise<AdapterHit[]> {
    const db = getDb()
    const where = and(
      eq(quotes.organizationId, orgId),
      sql`${quotes.deletedAt} IS NULL`,
      or(ilike(quotes.quoteNumber, pattern), ilike(quotes.notes, pattern)) as SQL,
    )
    const rows = await db
      .select({
        id: quotes.id,
        organizationId: quotes.organizationId,
        quoteNumber: quotes.quoteNumber,
        propertyId: quotes.propertyId,
        status: quotes.status,
      })
      .from(quotes)
      .where(where)
      .limit(PER_TYPE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      title: r.quoteNumber,
      subtitle: `Quote · ${r.status}`,
      url: `/admin/properties/${r.propertyId}/quotes/${r.id}`,
    }))
  }

  private async runWorkOrders(orgId: string, pattern: string): Promise<AdapterHit[]> {
    const db = getDb()
    const where = and(
      eq(workOrders.organizationId, orgId),
      sql`${workOrders.deletedAt} IS NULL`,
      or(ilike(workOrders.workOrderNumber, pattern), ilike(workOrders.notes, pattern)) as SQL,
    )
    const rows = await db
      .select({
        id: workOrders.id,
        organizationId: workOrders.organizationId,
        workOrderNumber: workOrders.workOrderNumber,
        status: workOrders.status,
      })
      .from(workOrders)
      .where(where)
      .limit(PER_TYPE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      title: r.workOrderNumber,
      subtitle: `Work order · ${r.status}`,
      url: `/admin/work-orders/${r.id}`,
    }))
  }

  private async runInvoices(orgId: string, pattern: string): Promise<AdapterHit[]> {
    const db = getDb()
    const where = and(
      eq(invoices.organizationId, orgId),
      sql`${invoices.deletedAt} IS NULL`,
      or(ilike(invoices.invoiceNumber, pattern), ilike(invoices.notes, pattern)) as SQL,
    )
    const rows = await db
      .select({
        id: invoices.id,
        organizationId: invoices.organizationId,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
      })
      .from(invoices)
      .where(where)
      .limit(PER_TYPE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      title: r.invoiceNumber,
      subtitle: `Invoice · ${r.status}`,
      url: `/admin/invoices/${r.id}`,
    }))
  }

  private async runSubcontractors(orgId: string, pattern: string): Promise<AdapterHit[]> {
    const db = getDb()
    const where = and(
      eq(subcontractors.organizationId, orgId),
      sql`${subcontractors.deletedAt} IS NULL`,
      or(
        ilike(subcontractors.companyName, pattern),
        ilike(subcontractors.contactName, pattern),
        ilike(subcontractors.email, pattern),
      ) as SQL,
    )
    const rows = await db
      .select({
        id: subcontractors.id,
        organizationId: subcontractors.organizationId,
        companyName: subcontractors.companyName,
        contactName: subcontractors.contactName,
      })
      .from(subcontractors)
      .where(where)
      .limit(PER_TYPE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      title: r.companyName,
      subtitle: r.contactName,
      url: `/admin/subcontractors/${r.id}`,
    }))
  }

  private async runInspections(orgId: string, pattern: string): Promise<AdapterHit[]> {
    const db = getDb()
    const where = and(
      eq(inspections.organizationId, orgId),
      sql`${inspections.deletedAt} IS NULL`,
      ilike(inspections.summary, pattern) as SQL,
    )
    const rows = await db
      .select({
        id: inspections.id,
        organizationId: inspections.organizationId,
        propertyId: inspections.propertyId,
        summary: inspections.summary,
        status: inspections.status,
      })
      .from(inspections)
      .where(where)
      .limit(PER_TYPE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      title: r.summary ?? `Inspection ${r.id.slice(0, 8)}`,
      subtitle: `Inspection · ${r.status}`,
      url: `/admin/properties/${r.propertyId}/inspections/${r.id}`,
    }))
  }

  private async runContacts(orgId: string, pattern: string): Promise<AdapterHit[]> {
    const db = getDb()
    const where = and(
      eq(contacts.organizationId, orgId),
      sql`${contacts.deletedAt} IS NULL`,
      or(
        ilike(contacts.firstName, pattern),
        ilike(contacts.lastName, pattern),
        ilike(contacts.email, pattern),
        ilike(contacts.phone, pattern),
      ) as SQL,
    )
    const rows = await db
      .select({
        id: contacts.id,
        organizationId: contacts.organizationId,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        propertyId: contacts.propertyId,
      })
      .from(contacts)
      .where(where)
      .limit(PER_TYPE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      title: `${r.firstName} ${r.lastName}`.trim(),
      subtitle: r.email ?? 'Contact',
      url: r.propertyId ? `/admin/properties/${r.propertyId}` : `/admin/clients/${r.id}`,
    }))
  }

  private async runBuildings(orgId: string, pattern: string): Promise<AdapterHit[]> {
    const db = getDb()
    const where = and(
      eq(buildings.organizationId, orgId),
      sql`${buildings.deletedAt} IS NULL`,
      ilike(buildings.name, pattern) as SQL,
    )
    const rows = await db
      .select({
        id: buildings.id,
        organizationId: buildings.organizationId,
        name: buildings.name,
        propertyId: buildings.propertyId,
      })
      .from(buildings)
      .where(where)
      .limit(PER_TYPE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      title: r.name,
      subtitle: 'Building',
      url: `/admin/properties/${r.propertyId}`,
    }))
  }
}
