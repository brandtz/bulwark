import { describe, expect, it, vi } from 'vitest'
import { RoleSchema, StakeholderKindSchema } from '../../shared/contracts/_shared'
import { roleEnum, stakeholderKindEnum } from '../../server/db/schema/users'
import { DeliverableKindSchema } from '../../shared/contracts/deliverable'
import { deliverableKindEnum } from '../../server/db/schema/deliverables'
import { createMockServices } from '../../shared/mocks/factory'

describe('contract and database enum lockstep', () => {
  it('keeps contract roles identical to the PostgreSQL role enum', () => {
    expect([...RoleSchema.options].sort()).toEqual([...roleEnum.enumValues].sort())
    expect(RoleSchema.options).toContain('stakeholder')
  })

  it('keeps stakeholder kinds identical to the PostgreSQL enum', () => {
    expect([...StakeholderKindSchema.options].sort()).toEqual([...stakeholderKindEnum.enumValues].sort())
  })

  it('keeps deliverable kinds identical to the PostgreSQL enum', () => {
    expect([...DeliverableKindSchema.options].sort()).toEqual([...deliverableKindEnum.enumValues].sort())
  })

  it('resolves the deprecated complianceDoc key to the deliverable service with one warning', () => {
    const services = createMockServices({
      getActivePersonaEmail: () => null,
      setActivePersonaEmail: () => {},
    })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(services.complianceDoc).toBe(services.deliverable)
      expect(services.complianceDoc).toBe(services.deliverable)
      expect(warning).toHaveBeenCalledTimes(1)
    } finally {
      warning.mockRestore()
    }
  })
})