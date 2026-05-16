<!--
  app/pages/field/jobs/[woId]/inspect.vue — field-styled inspection
  capture (W3-3 / EH-M / ADR-0029).

  # What this is
    Wraps the existing `<InspectionForm />` (W2-2) inside the field
    layout. The form already auto-saves every 800ms — that's the seed
    of the offline strategy (next save attempt simply queues).

  # Decisions (ADR-0008)
    - We look up or create an inspection for this work order's
      property. v1 picks the active program's default template by
      asking `inspectionTemplate.listForProgram(programId)` and using
      the most recent. If the property has an in-flight inspection we
      reuse it; otherwise we create one tied to the WO.
    - The page does NOT modify the W2-2 inspection form — it just
      provides a host shell with the right `inspectionId` prop. The
      W2-2 surface's autosave is already routed through `useService`
      which goes through the RPC proxy — when the offline queue
      promotion lands (Phase 2) the proxy itself can buffer; for now
      a lost-connection save returns an error that the form's
      `saveError` ref already surfaces.

  # Decision cast down
    - Rejected: a "Continue last inspection" prompt. The crew thinks
      in terms of jobs, not inspection rows; resuming silently is the
      right default.
-->
<script setup lang="ts">
import type { Inspection } from '~~/shared/contracts/inspection'

definePageMeta({
  layout: 'field',
  middleware: 'field-role',
  fieldTitle: 'Inspection',
})

const route = useRoute()
const woId = computed(() => route.params.woId as string)

const { session, ensureLoaded } = useSession()
await ensureLoaded()
if (!session.value) throw createError({ statusCode: 401 })
const orgId = session.value.activeOrganizationId

const workOrderService = useService('workOrder')
const inspectionService = useService('inspection')
const templateService = useService('inspectionTemplate')

const inspection = ref<Inspection | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

async function bootstrap(): Promise<void> {
  try {
    const wo = await workOrderService.get(woId.value, orgId)
    if (!wo) throw new Error('Work order not found.')

    // Look for an existing in-flight inspection on this property.
    const existing = await inspectionService.list({
      organizationId: orgId,
      propertyId: wo.propertyId,
      page: 1,
      pageSize: 50,
    })
    const open = existing.rows.find((r) => r.status === 'draft' || r.status === 'submitted')
    if (open) {
      inspection.value = open
      return
    }
    // Pick the most-recently-updated active template.
    const templates = await templateService.list({
      organizationId: orgId,
      page: 1,
      pageSize: 50,
    })
    const active = templates.rows.find((t) => !t.deletedAt)
    if (!active) throw new Error('No inspection templates configured.')
    inspection.value = await inspectionService.create({
      organizationId: orgId,
      propertyId: wo.propertyId,
      templateId: active.id,
      inspectorUserId: session.value!.userId,
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not start inspection.'
  } finally {
    loading.value = false
  }
}
await bootstrap()
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-inspection">
    <p v-if="loading" class="text-body text-text-secondary">Loading inspection…</p>
    <BulwarkCard v-else-if="error" padding="md" data-testid="field-inspection-error">
      <p class="text-body text-status-error">{{ error }}</p>
    </BulwarkCard>
    <InspectionForm
      v-else-if="inspection"
      :inspection-id="inspection.id"
      data-testid="field-inspection-form"
    />
  </div>
</template>
