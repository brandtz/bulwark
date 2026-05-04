/**
 * shared/mocks/client.mock.ts — MockClientService.
 */
import type { IClientService, Client, ClientCreateInput, ClientListInput, ClientListOutput } from '../contracts/client'
import { FIXTURE_CLIENTS } from './fixtures'

const rows: Client[] = [...FIXTURE_CLIENTS]
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockClientService implements IClientService {
  async list(input: ClientListInput): Promise<ClientListOutput> {
    let scoped = rows.filter(r => r.organizationId === input.organizationId && !r.deletedAt)
    if (input.search) {
      const q = input.search.toLowerCase()
      scoped = scoped.filter(r =>
        r.fullName.toLowerCase().includes(q) ||
        (r.email?.toLowerCase().includes(q) ?? false) ||
        r.phone.includes(input.search),
      )
    }
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Client | null> {
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  async create(input: ClientCreateInput): Promise<Client> {
    const now = nowIso()
    const row: Client = {
      id: newId(),
      organizationId: input.organizationId,
      fullName: input.fullName,
      email: input.email ?? null,
      phone: input.phone,
      preferredContact: input.preferredContact ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.unshift(row)
    return row
  }
}
