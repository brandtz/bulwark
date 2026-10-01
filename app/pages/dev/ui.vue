<!--
  pages/dev/ui.vue — component specimen page (WP-A2).

  Mirrors the design's components/INDEX.html: one section per primitive, in
  the index's (alphabetical) order, each variant and state rendered in light
  and dark side by side (DevThemePair). Playwright drives it for keyboard,
  axe and visual-parity checks (tests/e2e/ui-primitives.spec.ts), and it is
  the living reference when a primitive changes. A3/A4 add their composites.

  Not in production: available in development, and on a built server only
  with NUXT_PUBLIC_DEV_UI=1 (the test servers set it). Otherwise 404.
-->
<script setup lang="ts">
if (!import.meta.dev && !useRuntimeConfig().public.devUi) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

useHead({ title: 'Components' })

const text = ref('Rimrock Rd')
const money = ref('4,250')
const long = ref('Replace the gutters on the north side.')
const choice = ref<string>('')
const combo = ref<string>('')
const flag = ref(true)
const flagOff = ref(false)
const tri = ref<'pass' | 'fail' | 'na' | null>(null)
const view = ref('list')
const search = ref('')
const tags = ref<string[]>(['roofing', 'gutters'])
const date = ref<string | null>('2026-10-07')
const rangeStart = ref<string | null>(null)
const rangeEnd = ref<string | null>(null)
const files = ref<File[]>([])
const tab = ref('overview')
const page = ref(2)
const qty = ref(3)
const signature = ref('')

const showModal = ref(false)
const showDrawer = ref(false)
const drawerDirty = ref(false)
const drawerNote = ref('')
const lastMenu = ref('')

const toast = useToast()

const trades = [
  { value: 'roofing', label: 'Roofing' },
  { value: 'gutters', label: 'Gutters' },
  { value: 'siding', label: 'Siding' },
  { value: 'windows', label: 'Windows' },
  { value: 'vents', label: 'Vents' },
]
const states = ['CA', 'NV', 'OR', 'WA', 'AZ', 'UT', 'ID', 'MT', 'WY', 'CO'].map((s) => ({ value: s, label: s }))
const stepperSteps = [
  { label: 'Address', state: 'complete' as const },
  { label: 'Owner', state: 'complete' as const },
  { label: 'Photos', state: 'current' as const },
  { label: 'Review', state: 'upcoming' as const },
]
const hues = ['slate', 'blue', 'indigo', 'violet', 'teal', 'green', 'lime', 'amber', 'orange', 'red', 'pink', 'gray'] as const
const icons = ['home', 'calendar', 'camera', 'file-text', 'wrench', 'users', 'bell', 'settings', 'search', 'check-circle', 'alert-triangle', 'x'] as const
const saveMenu = [
  { label: 'Save and send', value: 'send' },
  { label: 'Save as template', value: 'template' },
  { label: 'Discard draft', value: 'discard', destructive: true },
]
</script>

<template>
  <div class="p-4 md:p-6 space-y-10 max-w-7xl">
    <header>
      <h1 style="font: 700 var(--text-3xl) var(--font-display)">Components</h1>
      <p class="bw-help mt-1">Packet A primitives, light and dark. Same order as the design's components index.</p>
      <!-- Follows the page theme (not a forced panel): tests/e2e/theme.spec.ts measures it. -->
      <div data-section="buttons" data-testid="theme-probe" class="flex items-center gap-3 mt-4 p-4" style="min-height: 80px">
        <BulwarkButton>Primary</BulwarkButton>
        <BulwarkCard padding="sm" data-testid="theme-probe-card"><p>Page-theme card</p></BulwarkCard>
      </div>
    </header>

    <section data-testid="ui-BulwarkAvatar" data-component="BulwarkAvatar">
      <h2 class="ui-h">BulwarkAvatar</h2>
      <DevThemePair>
        <div class="flex items-center gap-3">
          <BulwarkAvatar name="Dev Patel" size="sm" />
          <BulwarkAvatar name="Dev Patel" />
          <BulwarkAvatar name="Dev Patel" size="lg" presence="online" />
          <BulwarkAvatar name="Acme Restoration" size="xl" shape="square" />
        </div>
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkBreadcrumbs" data-component="BulwarkBreadcrumbs">
      <h2 class="ui-h">BulwarkBreadcrumbs</h2>
      <DevThemePair>
        <BulwarkBreadcrumbs :items="[{ label: 'Properties', to: '/admin/properties' }, { label: '1842 Rimrock Rd' }]" />
        <BulwarkBreadcrumbs :items="[{ label: 'Settings', to: '/settings' }, { label: 'Workflow', to: '/settings' }, { label: 'Pipelines', to: '/settings' }, { label: 'Property' }]" />
        <BulwarkBreadcrumbs back-only :items="[{ label: 'Jobs', to: '/admin/work-orders' }, { label: 'J-2201' }]" />
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkButton" data-component="BulwarkButton">
      <h2 class="ui-h">BulwarkButton</h2>
      <DevThemePair>
        <div class="flex flex-wrap items-center gap-3">
          <BulwarkButton>New Quote</BulwarkButton>
          <BulwarkButton variant="secondary">Schedule</BulwarkButton>
          <BulwarkButton variant="ghost">View All</BulwarkButton>
          <BulwarkButton variant="destructive">Delete Property</BulwarkButton>
          <BulwarkButton variant="link">Learn more</BulwarkButton>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <BulwarkButton size="sm">Small</BulwarkButton>
          <BulwarkButton size="lg">Large</BulwarkButton>
          <BulwarkButton :loading="true">Loading</BulwarkButton>
          <BulwarkButton disabled>Disabled</BulwarkButton>
          <BulwarkButton variant="ghost" icon-only aria-label="More"><BulwarkIcon name="more-horizontal" /></BulwarkButton>
        </div>
      </DevThemePair>
      <div class="flex items-center gap-3 mt-3">
        <BulwarkButton :menu="saveMenu" aria-label="Save" data-testid="split-save" @menu-select="lastMenu = $event.label">Save</BulwarkButton>
        <p class="bw-help" data-testid="split-last">{{ lastMenu ? `Chose: ${lastMenu}` : 'No menu choice yet' }}</p>
      </div>
    </section>

    <section data-testid="ui-BulwarkCard" data-component="BulwarkCard">
      <h2 class="ui-h">BulwarkCard</h2>
      <DevThemePair>
        <div class="grid sm:grid-cols-3 gap-3">
          <BulwarkCard><p>Default card</p></BulwarkCard>
          <BulwarkCard clickable selected><p>Selected</p></BulwarkCard>
          <BulwarkCard tone="danger" padding="sm"><p>Delete account</p></BulwarkCard>
        </div>
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkDatePicker" data-component="BulwarkDatePicker">
      <h2 class="ui-h">BulwarkDatePicker</h2>
      <DevThemePair>
        <div class="grid sm:grid-cols-2 gap-4">
          <BulwarkDatePicker v-model="date" label="Scheduled date" />
          <BulwarkDatePicker v-model:start="rangeStart" v-model:end="rangeEnd" mode="range" label="Window" />
        </div>
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkDrawer" data-component="BulwarkDrawer">
      <h2 class="ui-h">BulwarkDrawer · BulwarkModal</h2>
      <div class="flex gap-3">
        <BulwarkButton variant="secondary" @click="showDrawer = true">Open drawer</BulwarkButton>
        <BulwarkButton variant="secondary" @click="showModal = true">Open modal</BulwarkButton>
      </div>
      <BulwarkModal v-model="showModal" title="Void invoice INV-1042?" destructive data-testid="dev-modal">
        <p>The invoice stays in the ledger as void. This cannot be undone.</p>
        <template #footer>
          <BulwarkButton variant="secondary" @click="showModal = false">Cancel</BulwarkButton>
          <BulwarkButton variant="destructive" @click="showModal = false">Void invoice</BulwarkButton>
        </template>
      </BulwarkModal>
      <BulwarkDrawer v-model="showDrawer" title="Edit filters" subtitle="Changes apply to this list" :dirty="drawerDirty" data-testid="dev-drawer">
        <BulwarkInput v-model="drawerNote" label="Note" data-testid="dev-drawer-note" @update:model-value="drawerDirty = true" />
        <template #footer>
          <BulwarkButton variant="secondary" @click="showDrawer = false">Cancel</BulwarkButton>
          <BulwarkButton @click="drawerDirty = false; showDrawer = false">Save</BulwarkButton>
        </template>
      </BulwarkDrawer>
    </section>

    <section data-testid="ui-BulwarkFilePicker" data-component="BulwarkFilePicker">
      <h2 class="ui-h">BulwarkFilePicker</h2>
      <DevThemePair>
        <BulwarkFilePicker v-model="files" label="Attachments" accept="application/pdf,image/*" :max-size="10 * 1024 * 1024" helper="PDF or image, up to 10 MB" />
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkIcon" data-component="BulwarkIcon">
      <h2 class="ui-h">BulwarkIcon</h2>
      <DevThemePair>
        <div class="flex flex-wrap gap-3" style="color: var(--text-secondary)">
          <BulwarkIcon v-for="n in icons" :key="n" :name="n" />
        </div>
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkInput" data-component="BulwarkInput">
      <h2 class="ui-h">BulwarkInput · BulwarkSelect · BulwarkTextarea</h2>
      <DevThemePair>
        <div class="grid sm:grid-cols-2 gap-4">
          <BulwarkInput v-model="text" label="Street address" required icon="map-pin" helper="As it appears on the deed" />
          <BulwarkInput v-model="money" label="Contract value" type="currency" />
          <BulwarkInput model-value="" label="Email" type="email" error="Enter an email like name@company.com" />
          <BulwarkInput model-value="1,840" label="Roof area" type="measurement" unit="sq ft" readonly />
          <BulwarkSelect v-model="choice" label="State" :options="states" placeholder="Choose a state" />
          <BulwarkSelect v-model="combo" label="Trade (combobox)" :options="trades" :native="false" create-label="Add trade" />
          <BulwarkTextarea v-model="long" label="Scope notes" :maxlength="280" />
          <BulwarkInput model-value="" label="Disabled" disabled />
        </div>
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkJobCard" data-component="BulwarkJobCard">
      <h2 class="ui-h">BulwarkJobCard · BulwarkKpiCard</h2>
      <DevThemePair>
        <div class="grid sm:grid-cols-2 gap-3">
          <BulwarkJobCard
            :job="{ number: 'J-2201', address: '1842 Rimrock Rd', window: '8:00 – 12:00 PM', trade: 'Roofing', assignee: { name: 'Dev Patel' } }"
            :status="{ id: 'in_progress', label: 'In progress', hue: 'amber' }"
            :cta="{ label: 'Check in' }"
          />
          <BulwarkJobCard
            :job="{ number: 'J-2204', address: '77 Ponderosa Way', window: 'Tomorrow', trade: 'Gutters', blockedReason: 'Permit not issued' }"
            :status="{ id: 'scheduled', label: 'Scheduled', hue: 'blue' }"
          />
        </div>
        <div class="grid sm:grid-cols-3 gap-3">
          <BulwarkKpiCard label="Revenue this month" :value="4825000" format="money" :delta="{ value: '12%', label: 'vs last month', direction: 'up' }" />
          <BulwarkKpiCard label="Overdue invoices" :value="3" format="int" tone="danger" />
          <BulwarkKpiCard label="Close rate" :value="null" empty-reason="No quotes sent yet" />
        </div>
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkMultiSelect" data-component="BulwarkMultiSelect">
      <h2 class="ui-h">BulwarkMultiSelect</h2>
      <DevThemePair>
        <BulwarkMultiSelect v-model="tags" label="Trades" :options="trades" :max="4" />
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkPagination" data-component="BulwarkPagination">
      <h2 class="ui-h">BulwarkPagination</h2>
      <BulwarkPagination :page="page" :page-size="10" :total="93" @update:page="page = $event" />
    </section>

    <section data-testid="ui-BulwarkPassFailToggle" data-component="BulwarkPassFailToggle">
      <h2 class="ui-h">BulwarkPassFailToggle</h2>
      <BulwarkPassFailToggle v-model="tri" label="Vents are ember-resistant" description="1/8 inch mesh or better" require-photo-on-fail />
      <DevThemePair>
        <BulwarkPassFailToggle model-value="pass" label="Pass (selected)" />
        <BulwarkPassFailToggle model-value="fail" label="Fail (selected)" />
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkSearchField" data-component="BulwarkSearchField">
      <h2 class="ui-h">BulwarkSearchField · BulwarkSegmentedControl</h2>
      <div class="flex flex-wrap items-center gap-4">
        <div class="w-72"><BulwarkSearchField v-model="search" placeholder="Search properties…" /></div>
        <BulwarkSegmentedControl
          v-model="view"
          :options="[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }, { value: 'map', label: 'Map' }]"
          aria-label="View"
        />
      </div>
    </section>

    <section data-testid="ui-BulwarkSignaturePad" data-component="BulwarkSignaturePad">
      <h2 class="ui-h">BulwarkSignaturePad</h2>
      <div class="max-w-md"><BulwarkSignaturePad v-model="signature" statement="By signing you approve this scope." /></div>
    </section>

    <section data-testid="ui-BulwarkSkeleton" data-component="BulwarkSkeleton">
      <h2 class="ui-h">BulwarkSkeleton</h2>
      <DevThemePair>
        <BulwarkSkeleton :delay="0" :lines="3" />
        <BulwarkSkeleton :delay="0" kind="table" :rows="3" :columns="4" />
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkStepper" data-component="BulwarkStepper">
      <h2 class="ui-h">BulwarkStepper</h2>
      <DevThemePair>
        <BulwarkStepper :steps="stepperSteps" />
        <BulwarkStepper v-model="qty" variant="input" label="Quantity" :min="0" :max="99" />
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkTabs" data-component="BulwarkTabs">
      <h2 class="ui-h">BulwarkTabs</h2>
      <BulwarkTabs
        v-model="tab"
        aria-label="Property"
        :tabs="[
          { value: 'overview', label: 'Overview' },
          { value: 'quotes', label: 'Quotes', count: 1 },
          { value: 'photos', label: 'Photos', count: 12 },
          { value: 'archive', label: 'Archive', disabled: true },
        ]"
      >
        <template #tab-overview><p>Overview content</p></template>
        <template #tab-quotes><p>1 quote</p></template>
        <template #tab-photos><p>12 photos</p></template>
      </BulwarkTabs>
    </section>

    <section data-testid="ui-BulwarkToastHost" data-component="BulwarkToastHost">
      <h2 class="ui-h">BulwarkToast · BulwarkToastHost</h2>
      <div class="flex flex-wrap gap-2">
        <BulwarkButton variant="secondary" data-testid="toast-info" @click="toast.info('Heads up', 'Something to know.')">Info toast</BulwarkButton>
        <BulwarkButton variant="secondary" data-testid="toast-success" @click="toast.success('Done', 'Your change was saved.')">Success toast</BulwarkButton>
        <BulwarkButton variant="secondary" data-testid="toast-error" @click="toast.error('Save failed', 'Network unreachable. Try again.')">Error toast</BulwarkButton>
      </div>
      <DevThemePair>
        <BulwarkToast tone="success" title="Quote sent" body="Q-2026-0042 went to Sarah Lee." />
        <BulwarkToast tone="error" title="Upload failed" :action="{ label: 'Retry', fn: () => {} }" />
      </DevThemePair>
    </section>

    <section data-testid="ui-BulwarkToggle" data-component="BulwarkToggle">
      <h2 class="ui-h">BulwarkToggle</h2>
      <DevThemePair>
        <BulwarkToggle v-model="flag" label="Email me when a quote is accepted" description="Sent to your account email" />
        <BulwarkToggle v-model="flagOff" label="Off" />
        <BulwarkToggle :model-value="true" label="Disabled" disabled />
      </DevThemePair>
    </section>

    <section data-testid="ui-EmptyState" data-component="EmptyState">
      <h2 class="ui-h">EmptyState</h2>
      <DevThemePair>
        <EmptyState title="No properties yet" body="Add your first property to start the pipeline." :primary="{ label: 'Add property', action: '/admin/properties/new' }" />
        <EmptyState flavor="error" title="Couldn’t load quotes" body="Try again in a moment." error-ref="req_8f2c" />
      </DevThemePair>
    </section>

    <section data-testid="ui-StatusBadge" data-component="StatusBadge">
      <h2 class="ui-h">StatusBadge</h2>
      <DevThemePair>
        <div class="flex flex-wrap gap-2">
          <StatusBadge v-for="h in hues" :key="h" :hue="h" :label="h[0]!.toUpperCase() + h.slice(1)" />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge status="in_progress" />
          <StatusBadge status="paid" size="sm" />
          <StatusBadge hue="red" label="Overdue" variant="outline" />
          <StatusBadge hue="green" label="Online" variant="dot" />
        </div>
      </DevThemePair>
    </section>
  </div>
</template>

<style scoped>
.ui-h { margin: 0 0 12px; font: 600 var(--text-lg) var(--font-display); color: var(--text-primary); }
</style>
