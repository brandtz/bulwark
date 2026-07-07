<!--
  app/pages/settings/jobs.vue — scheduled jobs: run history + manual trigger
  (L05-S3 / ADR-0005).

  # Decisions (ADR-0008)
    - super_admin only. These are PLATFORM-scope maintenance jobs (GDPR
      account purge, all-orgs COI expiry scan) — org admins have no business
      triggering a cross-org sweep.
    - Reads GET /api/admin/jobs (recent runs incl. the worker's _runSummary
      counts); "Run now" POSTs the same guarded endpoints the platform
      scheduler curls, so manual and scheduled runs are literally the same
      code path.
    - Runs list polls only on demand (Refresh) — a settings page doesn't
      need live polling; the runs land within seconds and Refresh is honest.
-->
<script setup lang="ts">
definePageMeta({
  middleware: ['role'],
  requiredRoles: ['super_admin'],
})

useHead({ title: 'Scheduled jobs' })

const { success: toastSuccess, error: toastError } = useToast()

interface RunRow {
  id: string
  kind: string
  status: string
  payload: Record<string, unknown>
  error: string | null
  createdAt: string
  updatedAt: string
}

const JOB_META: Record<string, { label: string; description: string; endpoint: string }> = {
  account_purge: {
    label: 'Account purge (GDPR)',
    description:
      'Hard-deletes accounts whose soft-delete passed the 30-day grace window. Scheduled daily 02:00 UTC.',
    endpoint: '/api/admin/jobs/account-purge',
  },
  coi_expiry_scan: {
    label: 'COI expiry scan',
    description:
      'Scans every organization for subcontractor COIs expiring within 30 days and notifies. Scheduled nightly 03:00 UTC.',
    endpoint: '/api/admin/jobs/coi-expiry-scan',
  },
}

const runs = ref<RunRow[]>([])
const loading = ref(false)
const triggering = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    const res = await $fetch<{ runs: RunRow[] }>('/api/admin/jobs')
    runs.value = res.runs
  } catch (err) {
    toastError('Could not load job runs', (err as Error).message)
  } finally {
    loading.value = false
  }
}
await load()

async function runNow(kind: string) {
  const meta = JOB_META[kind]
  if (!meta) return
  triggering.value = kind
  try {
    const res = await $fetch<{ jobId: string }>(meta.endpoint, { method: 'POST' })
    toastSuccess('Job enqueued', `${meta.label} queued as ${res.jobId.slice(0, 8)}…`)
    await load()
  } catch (err) {
    toastError('Could not enqueue job', (err as Error).message)
  } finally {
    triggering.value = null
  }
}

function lastRunFor(kind: string): RunRow | undefined {
  return runs.value.find((r) => r.kind === kind)
}

function summaryText(run: RunRow | undefined): string {
  const s = run?.payload?.['_runSummary'] as Record<string, unknown> | undefined
  if (!s) return ''
  if (typeof s['purgedCount'] === 'number') {
    return `scanned ${s['candidateCount']}, purged ${s['purgedCount']}`
  }
  if (typeof s['flagged'] === 'number') {
    return `${s['scannedOrgs']} orgs scanned, ${s['flagged']} COIs flagged`
  }
  return ''
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString()
}

const statusTone: Record<string, string> = {
  succeeded: 'text-status-success',
  failed: 'text-status-error',
  running: 'text-status-info',
  queued: 'text-text-secondary',
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-jobs">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Scheduled jobs' }]"
    />
    <header class="mt-2 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-display">Scheduled jobs</h1>
        <p class="text-body text-text-secondary mt-1">
          Platform maintenance sweeps — run automatically on schedule, or trigger one now.
        </p>
      </div>
      <BulwarkButton
        variant="secondary"
        size="sm"
        :disabled="loading"
        data-testid="jobs-refresh"
        @click="load"
      >
        Refresh
      </BulwarkButton>
    </header>

    <BulwarkCard
      v-for="(meta, kind) in JOB_META"
      :key="kind"
      padding="md"
      class="mt-4"
      :data-testid="`job-card-${kind}`"
    >
      <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <p class="text-body font-medium">{{ meta.label }}</p>
          <p class="text-small text-text-secondary mt-1">{{ meta.description }}</p>
          <p v-if="lastRunFor(kind)" class="text-small mt-2" data-testid="job-last-run">
            Last run
            <span :class="statusTone[lastRunFor(kind)!.status] ?? ''">
              {{ lastRunFor(kind)!.status }}
            </span>
            · {{ fmt(lastRunFor(kind)!.updatedAt) }}
            <span v-if="summaryText(lastRunFor(kind))" class="text-text-secondary">
              — {{ summaryText(lastRunFor(kind)) }}
            </span>
          </p>
          <p v-else class="text-small text-text-secondary mt-2" data-testid="job-no-runs">
            No runs recorded yet.
          </p>
          <p
            v-if="lastRunFor(kind)?.status === 'failed' && lastRunFor(kind)?.error"
            class="text-small text-status-error mt-1"
          >
            {{ lastRunFor(kind)!.error }}
          </p>
        </div>
        <BulwarkButton
          size="sm"
          :loading="triggering === kind"
          :disabled="triggering !== null"
          :data-testid="`job-run-now-${kind}`"
          @click="runNow(kind)"
        >
          Run now
        </BulwarkButton>
      </div>
    </BulwarkCard>

    <BulwarkCard padding="none" class="mt-6">
      <div class="p-3 md:p-4 border-b border-border-default">
        <h2 class="text-h3">Recent runs</h2>
      </div>
      <ul v-if="runs.length > 0" class="divide-y divide-border-default">
        <li
          v-for="r in runs"
          :key="r.id"
          class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-1"
          data-testid="job-run-row"
        >
          <div class="md:col-span-4">
            <code class="text-small">{{ JOB_META[r.kind]?.label ?? r.kind }}</code>
          </div>
          <div class="md:col-span-3">
            <span class="text-small" :class="statusTone[r.status] ?? ''">{{ r.status }}</span>
          </div>
          <div class="md:col-span-5 text-small text-text-secondary">
            {{ fmt(r.createdAt) }}
            <span v-if="summaryText(r)"> — {{ summaryText(r) }}</span>
          </div>
        </li>
      </ul>
      <p v-else class="p-4 text-small text-text-secondary" data-testid="jobs-empty">
        No scheduled-job runs yet. They appear here after the first scheduled or manual run.
      </p>
    </BulwarkCard>
  </div>
</template>
