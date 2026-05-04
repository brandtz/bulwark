/**
 * app/composables/useService.ts — the canonical way UI pulls a service.
 *
 * Per ADR-0004, UI never imports a service class directly. The composable
 * pattern lets us swap impls without touching call sites and keeps the
 * service-layer firewall reading uniform across pages.
 *
 * Usage:
 *   const property = useService('property')
 *   const { rows } = await property.list({ organizationId, page: 1, pageSize: 25 })
 */
import type { BulwarkServices, ServiceName } from '~~/shared/contracts/services'

export function useService<K extends ServiceName>(name: K): BulwarkServices[K] {
  const { $services } = useNuxtApp()
  return $services[name]
}
