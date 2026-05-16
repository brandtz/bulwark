<!--
  app/pages/admin/properties/[id]/inspection/new.vue —
  W2-2 (EH-F / ADR-0019). Pick a program / template, create an
  inspection, route the user to the form.
-->
<script setup lang="ts">
import type { Program } from '~~/shared/contracts/program'
import type { InspectionTemplate } from '~~/shared/contracts/inspection-template'
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({ middleware: ['role'], requiredRoles: ROLE_GROUPS.admin })

const route = useRoute()
const router = useRouter()
const propertyId = computed(() => String(route.params.id))

const auth = useService('auth')
const programService = useService('program')
const templateService = useService('inspectionTemplate')
const inspectionService = useService('inspection')

const sessionUser = await auth.currentUser()
if (!sessionUser) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
const organizationId = sessionUser.activeOrganizationId
const inspectorUserId = sessionUser.userId

const programs = ref<Program[]>([])
const templates = ref<InspectionTemplate[]>([])
const loading = ref(true)
const creating = ref(false)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  try {
    const list = await programService.list({ organizationId, page: 1, pageSize: 50 })
    programs.value = list.rows
    const tplLists = await Promise.all(
      programs.value.map((p) =>
        templateService.list({ organizationId, programId: p.id, page: 1, pageSize: 20 }),
      ),
    )
    templates.value = tplLists.flatMap((r) => r.rows).filter((t) => t.isActive)
  } finally {
    loading.value = false
  }
}
await load()

async function start(template: InspectionTemplate): Promise<void> {
  creating.value = true
  error.value = null
  try {
    const program = programs.value.find((p) => p.id === template.programId) ?? null
    const inspection = await inspectionService.create({
      organizationId,
      propertyId: propertyId.value,
      buildingId: null,
      templateId: template.id,
      programId: program?.id ?? null,
      inspectorUserId,
    })
    await router.push(`/admin/properties/${propertyId.value}/inspection/${inspection.id}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to start inspection'
  } finally {
    creating.value = false
  }
}

function programName(programId: string | null): string {
  if (!programId) return 'No program'
  return programs.value.find((p) => p.id === programId)?.name ?? 'Program'
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-2xl mx-auto" data-testid="inspection-new">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'New inspection' },
      ]"
    />
    <h1 class="text-display mt-2">Start an inspection</h1>
    <p class="text-body text-text-secondary mt-1">
      Pick the program template that matches what you're inspecting today.
    </p>

    <BulwarkSkeleton v-if="loading" class="mt-6 h-24" />
    <EmptyState
      v-else-if="templates.length === 0"
      title="No active inspection templates"
      description="Ask an admin to publish a template before starting an inspection."
    />
    <div v-else class="mt-6 flex flex-col gap-3">
      <BulwarkCard v-for="tpl in templates" :key="tpl.id" :data-testid="`template-${tpl.slug}`">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-md font-semibold">{{ tpl.name }}</h2>
            <p class="text-small text-text-secondary">{{ programName(tpl.programId) }} · v{{ tpl.version }}</p>
          </div>
          <BulwarkButton
            variant="primary"
            :disabled="creating"
            :data-testid="`start-${tpl.slug}`"
            @click="start(tpl)"
          >Start</BulwarkButton>
        </div>
      </BulwarkCard>
    </div>

    <p v-if="error" class="mt-3 text-small text-status-error">{{ error }}</p>
  </div>
</template>
