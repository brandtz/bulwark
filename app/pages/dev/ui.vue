<!--
  pages/dev/ui.vue — UI primitive playground.

  Why this page exists
  --------------------
  Per ADR-0007 every UI primitive needs a Playwright spec. Rather than
  one spec per primitive (which would compound test runtime), we
  consolidate primitives onto one playground page and assert each one
  there. The page lives under /dev/ so production users never see it.

  This is also our visual living documentation: when we change a
  primitive, we look at /dev/ui to confirm nothing regressed.
-->
<script setup lang="ts">
useHead({ title: 'UI Playground' })

const text = ref('')
const long = ref('')
const choice = ref<string>('')
const flag = ref(false)
const tri = ref<'pass' | 'fail' | 'na' | null>(null)
const view = ref('list')
const search = ref('')
const tags = ref<string[]>(['a'])
const date = ref<string | null>(null)
const files = ref<File[]>([])
const tab = ref('overview')
const page = ref(2)

const toast = useToast()
const showModal = ref(false)
const showDrawer = ref(false)

const stepperSteps = [
  { label: 'Address', status: 'complete' as const },
  { label: 'Owner', status: 'complete' as const },
  { label: 'Photos', status: 'current' as const },
  { label: 'Review', status: 'upcoming' as const },
]
</script>

<template>
  <div class="p-4 md:p-6 space-y-8 max-w-3xl">
    <div>
      <h1 class="text-display">UI Playground</h1>
      <p class="text-body text-text-secondary mt-1">
        Every primitive renders here so we can spot drift instantly.
      </p>
    </div>

    <section data-section="buttons" class="space-y-2">
      <h2 class="text-h2">Buttons</h2>
      <div class="flex flex-wrap gap-2">
        <BulwarkButton variant="primary">Primary</BulwarkButton>
        <BulwarkButton variant="secondary">Secondary</BulwarkButton>
        <BulwarkButton variant="ghost">Ghost</BulwarkButton>
        <BulwarkButton variant="destructive">Delete</BulwarkButton>
        <BulwarkButton :loading="true">Loading</BulwarkButton>
        <BulwarkButton :disabled="true">Disabled</BulwarkButton>
      </div>
    </section>

    <section data-section="inputs" class="space-y-3">
      <h2 class="text-h2">Form primitives</h2>
      <BulwarkInput v-model="text" label="Email" type="email" placeholder="you@example.com" required />
      <BulwarkTextarea v-model="long" label="Notes" :rows="3" />
      <BulwarkSelect
        v-model="choice"
        label="Status"
        :options="[
          { value: 'lead', label: 'Lead' },
          { value: 'scheduled', label: 'Scheduled' },
        ]"
      />
      <BulwarkMultiSelect
        v-model="tags"
        label="Tags"
        :options="[
          { value: 'a', label: 'Defensible space' },
          { value: 'b', label: 'Roof' },
          { value: 'c', label: 'Vents' },
        ]"
      />
      <BulwarkToggle v-model="flag" label="Active" description="Show in field worker queue" />
      <BulwarkPassFailToggle v-model="tri" label="Roof rated Class A" />
      <BulwarkSegmentedControl
        v-model="view"
        :options="[
          { value: 'list', label: 'List' },
          { value: 'map', label: 'Map' },
        ]"
        aria-label="View mode"
      />
      <BulwarkSearchField v-model="search" placeholder="Search properties..." />
      <BulwarkDatePicker v-model="date" label="Scheduled for" />
      <BulwarkFilePicker v-model="files" label="Photos" accept="image/*" />
    </section>

    <section data-section="display" class="space-y-3">
      <h2 class="text-h2">Display primitives</h2>
      <div class="flex items-center gap-2">
        <BulwarkAvatar name="Drew Owens" />
        <BulwarkAvatar name="Matthew Reyes" size="sm" />
        <BulwarkAvatar name="Jeff Park" size="lg" />
      </div>
      <BulwarkBreadcrumbs :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: '123 Pine St' },
      ]" />
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BulwarkKpiCard label="Active jobs" :value="12" delta="+2 this week" delta-direction="up" />
        <BulwarkKpiCard label="Compliance pending" :value="3" tone="warning" />
        <BulwarkKpiCard label="Past due" :value="1" tone="error" />
      </div>
      <BulwarkJobCard
        address="123 Pine Street, Truckee CA"
        status="scheduled"
        client-name="Sarah Lee"
        time="Tomorrow · 9:00 AM"
        scope="Full retrofit · 12 items"
      />
      <EmptyState
        title="No properties yet"
        body="Add your first property to start the pipeline."
        icon="·"
      />
      <div class="space-y-2">
        <BulwarkSkeleton variant="text" :lines="2" />
        <BulwarkSkeleton variant="card" />
      </div>
    </section>

    <section data-section="navigation" class="space-y-3">
      <h2 class="text-h2">Navigation primitives</h2>
      <BulwarkTabs
        v-model="tab"
        :tabs="[
          { value: 'overview', label: 'Overview' },
          { value: 'assessments', label: 'Assessments', count: 3 },
          { value: 'quotes', label: 'Quotes', count: 1 },
        ]"
      >
        <template #tab-overview>Overview content</template>
        <template #tab-assessments>3 assessments</template>
        <template #tab-quotes>1 quote</template>
      </BulwarkTabs>
      <BulwarkStepper :steps="stepperSteps" />
      <BulwarkPagination :page="page" :page-size="10" :total="93" @update:page="page = $event" />
    </section>

    <section data-section="overlays" class="space-y-2">
      <h2 class="text-h2">Overlays + Toasts</h2>
      <div class="flex flex-wrap gap-2">
        <BulwarkButton @click="showModal = true">Open modal</BulwarkButton>
        <BulwarkButton variant="secondary" @click="showDrawer = true">Open drawer</BulwarkButton>
        <BulwarkButton variant="ghost" data-testid="toast-info" @click="toast.info('Saved', 'Changes auto-saved.')">Info toast</BulwarkButton>
        <BulwarkButton variant="ghost" data-testid="toast-success" @click="toast.success('Done')">Success</BulwarkButton>
        <BulwarkButton variant="destructive" data-testid="toast-error" @click="toast.error('Save failed', 'Network unreachable.')">Error</BulwarkButton>
      </div>
      <BulwarkModal v-model="showModal" title="Confirm action">
        <p class="text-body">Are you sure? This cannot be undone.</p>
        <template #footer>
          <BulwarkButton variant="secondary" @click="showModal = false">Cancel</BulwarkButton>
          <BulwarkButton variant="destructive" @click="showModal = false">Delete</BulwarkButton>
        </template>
      </BulwarkModal>
      <BulwarkDrawer v-model="showDrawer" side="right" title="Filters">
        <p class="text-body">Drawer body…</p>
      </BulwarkDrawer>
    </section>
  </div>
</template>
