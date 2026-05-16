<!--
  app/pages/login.vue — Bulwark sign-in page.

  Why this file exists
  --------------------
  E2-S1 / E2-S2: replaces the demo's mock /login with a real form. Even
  while the auth backend is mocked, the surface (email + password fields,
  banner errors, next-redirect) matches what RealAuthService will accept
  in E11-S2 — so we can swap implementations without touching this page.

  Decisions
  ---------
  - Standalone layout (`layout: false`): no sidebar/topbar. The persistent
    shell from ADR-0005 is for signed-in users only. Showing it pre-auth
    would tease functionality the visitor cannot reach.
  - The `next` query param preserves deep links (e.g. an email about a work
    order at /admin/work-orders/123 bounces through /login then back).
    Decision cast down: always return to `/`. Rejected because the demo's
    share-link behaviour was a daily papercut.
  - No "Forgot password" yet — that page lands in E2-S3.
  - Demo persona quick-pick block is gated behind `import.meta.dev` so it
    doesn't ship to production builds.
  - Form submit binds Enter to the same `submit()` function as the button
    to avoid the "I have to click" annoyance.
-->
<script setup lang="ts">
import { formatRetryAfter } from '~/composables/login-flow-helpers'

definePageMeta({ layout: false })
useHead({ title: 'Sign in · Bulwark' })

const route = useRoute()
const { loginEx, verifyMfa, loading, error } = useAuth()
const { t } = useLabel()

type Step =
  | { kind: 'idle' }
  | { kind: 'mfa'; mfaToken: string; email: string; useBackup: boolean }
  | { kind: 'locked'; until: number }

const email = ref('')
const password = ref('')
const code = ref('')
const step = ref<Step>({ kind: 'idle' })
const now = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    now.value = Date.now()
    if (step.value.kind === 'locked' && now.value >= step.value.until) {
      step.value = { kind: 'idle' }
      stopCountdown()
    }
  }, 1000)
}
function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}
onBeforeUnmount(stopCountdown)

const retrySecondsLeft = computed(() => {
  if (step.value.kind !== 'locked') return 0
  return Math.max(0, Math.ceil((step.value.until - now.value) / 1000))
})
const retryAfterDisplay = computed(() => formatRetryAfter(retrySecondsLeft.value))

async function submit() {
  if (!email.value || !password.value) return
  const r = await loginEx({ email: email.value, password: password.value })
  if (r.ok && r.kind === 'session') {
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await navigateTo(next)
    return
  }
  if (r.ok && r.kind === 'mfa_required') {
    step.value = { kind: 'mfa', mfaToken: r.mfaToken, email: r.email, useBackup: false }
    code.value = ''
    return
  }
  if (!r.ok && r.kind === 'locked') {
    step.value = { kind: 'locked', until: Date.now() + r.retryAfterSeconds * 1000 }
    now.value = Date.now()
    startCountdown()
    return
  }
  // 'error' kind — useAuth already set `error.value`; stay on idle.
}

async function submitMfa() {
  if (step.value.kind !== 'mfa' || !code.value.trim()) return
  const ok = await verifyMfa(step.value.mfaToken, code.value.trim())
  if (ok) {
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await navigateTo(next)
  }
}

function toggleBackupCodeMode() {
  if (step.value.kind !== 'mfa') return
  step.value = { ...step.value, useBackup: !step.value.useBackup }
  code.value = ''
}

function cancelMfa() {
  step.value = { kind: 'idle' }
  code.value = ''
}

// Dev-only quick logins so sponsors and tests don't have to remember mock creds.
const personas = [
  { label: 'Org admin (Drew)', email: 'drew@bulwark.demo' },
  { label: 'Field worker (Matthew)', email: 'matthew@bulwark.demo' },
  { label: 'Subcontractor (Jeff)', email: 'jeff@bulwark.demo' },
]
async function quickLogin(personaEmail: string) {
  email.value = personaEmail
  password.value = 'BulwarkDemo!1'
  await submit()
}

const showDevPersonas = import.meta.dev
</script>

<template>
  <main class="min-h-screen bg-surface-muted flex items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex items-center gap-3">
        <div class="h-10 w-10 rounded-card bg-primary text-white grid place-items-center font-bold">B</div>
        <div>
          <p class="text-h2 leading-none text-text-primary">Bulwark</p>
          <p class="text-tiny text-text-secondary mt-1">Wildfire compliance, made operational.</p>
        </div>
      </div>

      <!-- Locked banner ------------------------------------------------ -->
      <div
        v-if="step.kind === 'locked'"
        role="alert"
        class="mb-4 rounded-card border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-small text-text-primary"
        data-testid="login-locked-banner"
      >
        <p class="font-medium">{{ t('login.locked', 'title', 'Account temporarily locked') }}</p>
        <p class="mt-1 text-text-secondary" data-testid="login-locked-retry">
          Try again in <span class="font-mono">{{ retryAfterDisplay }}</span>.
        </p>
      </div>

      <!-- MFA panel ---------------------------------------------------- -->
      <form
        v-if="step.kind === 'mfa'"
        class="space-y-4 bg-surface rounded-card p-6 shadow"
        data-testid="login-mfa-form"
        @submit.prevent="submitMfa"
      >
        <h1 class="text-h2 text-text-primary">{{ t('login.mfa', 'title', 'Two-factor required') }}</h1>
        <p class="text-small text-text-secondary">
          Enter the {{ step.useBackup ? 'backup code' : '6-digit code' }} for
          <span class="font-medium text-text-primary">{{ step.email }}</span>.
        </p>

        <div
          v-if="error"
          role="alert"
          class="rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
        >{{ error }}</div>

        <BulwarkInput
          v-model="code"
          :label="step.useBackup ? 'Backup code' : 'Code'"
          :placeholder="step.useBackup ? 'XXXX-XXXX' : '123456'"
          autocomplete="one-time-code"
          inputmode="numeric"
          required
          data-testid="login-mfa-input"
        />

        <BulwarkButton
          type="submit"
          variant="primary"
          :loading="loading"
          class="w-full"
          data-testid="login-mfa-submit"
        >Verify</BulwarkButton>

        <div class="flex items-center justify-between text-small">
          <button
            type="button"
            class="text-primary hover:underline"
            data-testid="login-mfa-toggle-backup"
            @click="toggleBackupCodeMode"
          >{{ step.useBackup ? 'Use authenticator code' : 'Use backup code' }}</button>
          <button
            type="button"
            class="text-text-secondary hover:underline"
            data-testid="login-mfa-cancel"
            @click="cancelMfa"
          >Cancel</button>
        </div>
      </form>

      <!-- Default email/password form --------------------------------- -->
      <form
        v-else
        class="space-y-4 bg-surface rounded-card p-6 shadow"
        :class="{ 'opacity-60 pointer-events-none': step.kind === 'locked' }"
        @submit.prevent="submit"
      >
        <h1 class="text-h2 text-text-primary">Sign in</h1>

        <div
          v-if="error && step.kind !== 'locked'"
          role="alert"
          class="rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
        >{{ error }}</div>

        <BulwarkInput
          v-model="email"
          type="email"
          label="Email"
          placeholder="you@company.com"
          autocomplete="email"
          required
        />
        <BulwarkInput
          v-model="password"
          type="password"
          label="Password"
          autocomplete="current-password"
          required
        />

        <BulwarkButton
          type="submit"
          variant="primary"
          :loading="loading"
          :disabled="step.kind === 'locked'"
          class="w-full"
        >
          Sign in
        </BulwarkButton>
      </form>

      <div v-if="showDevPersonas && step.kind !== 'mfa'" class="mt-6 rounded-card border border-border bg-surface p-4">
        <p class="text-small font-medium text-text-primary">Demo personas (mock auth)</p>
        <p class="text-tiny text-text-secondary mt-0.5 mb-3">
          Click any persona to sign in instantly. The mock backend ignores the password.
        </p>
        <div class="flex flex-col gap-2">
          <BulwarkButton
            v-for="p in personas"
            :key="p.email"
            type="button"
            variant="secondary"
            :data-persona="p.email"
            @click="quickLogin(p.email)"
          >
            {{ p.label }}
          </BulwarkButton>
        </div>
      </div>
    </div>
  </main>
</template>
