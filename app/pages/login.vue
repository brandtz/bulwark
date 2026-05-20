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
const router = useRouter()
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
    await goToPostLoginDestination()
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
    await goToPostLoginDestination()
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

/**
 * Navigate after auth with a safety fallback for the layout:false -> default
 * transition race observed on Nuxt 3.21.
 */
async function goToPostLoginDestination() {
  const raw = typeof route.query.next === 'string' ? route.query.next : '/'
  const next = raw.startsWith('/') ? raw : '/'
  const dest = next.startsWith('/login') ? '/' : next

  // Guard against dead deep-links; if route is unknown, land on root.
  const resolved = router.resolve(dest)
  const safeDest = resolved.matched.length > 0 ? dest : '/'

  await navigateTo(safeDest, { replace: true })

  // Fallback: if navigation settles but login UI still owns the DOM,
  // force a hard load so the authenticated shell mounts cleanly.
  if (typeof window !== 'undefined') {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const stillLoginPath = route.path === '/login'
    const staleLoginDom = route.path !== '/login'
      && document.querySelector('[data-testid="login-page-root"]') !== null
    if (stillLoginPath || staleLoginDom) {
      window.location.assign(safeDest)
    }
  }
}
</script>

<template>
  <main class="min-h-screen bg-surface-muted md:bg-white" data-testid="login-page-root">
    <div class="min-h-screen flex flex-col md:flex-row">
      <aside class="hidden md:flex md:w-1/2 bg-slate-950 text-white relative overflow-hidden">
        <div class="absolute inset-0 pointer-events-none">
          <div class="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
          <div class="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        </div>

        <div class="relative z-10 flex h-full w-full flex-col justify-between p-12 lg:p-16">
          <div>
            <div class="mb-16 flex items-center gap-3">
              <div class="h-10 w-10 rounded-[10px] bg-primary text-white grid place-items-center font-bold shadow">B</div>
              <span class="text-3xl font-semibold tracking-tight">Bulwark</span>
            </div>
            <h1 class="text-5xl font-bold leading-tight">Field operations<br>simplified.</h1>
            <p class="mt-5 max-w-md text-slate-300 text-lg">
              The complete operations platform for wildfire retrofit contractors and property management.
            </p>

            <div class="mt-12 max-w-xl space-y-4">
              <div class="rounded-card border border-slate-800 bg-slate-900/60 p-5">
                <p class="text-white font-semibold">Fast Data Entry</p>
                <p class="mt-1 text-sm text-slate-300">Optimized for gloved hands and challenging field conditions.</p>
              </div>
              <div class="rounded-card border border-slate-800 bg-slate-900/60 p-5">
                <p class="text-white font-semibold">Compliance Docs</p>
                <p class="mt-1 text-sm text-slate-300">Instant PDF generation with legal text and certifications.</p>
              </div>
            </div>
          </div>

          <p class="text-slate-400 text-sm">© {{ new Date().getFullYear() }} Bulwark Operations Inc.</p>
        </div>
      </aside>

      <section class="w-full md:w-1/2 flex items-center justify-center px-4 py-8 sm:px-8 lg:px-14">
        <div class="w-full max-w-[460px] rounded-card border border-border bg-surface shadow p-6 md:border-none md:shadow-none md:p-0">
          <div class="mb-8 text-center md:hidden">
            <div class="mx-auto h-12 w-12 rounded-[12px] bg-primary text-white grid place-items-center font-bold shadow">B</div>
            <p class="mt-4 text-3xl font-semibold text-text-primary">Bulwark</p>
            <p class="text-small text-text-secondary mt-1">Field operations simplified.</p>
          </div>

          <header class="mb-8 hidden md:block">
            <p class="text-4xl font-semibold text-text-primary">Welcome back</p>
            <h1 class="mt-1 text-h2 text-text-primary">Sign in</h1>
            <p class="mt-2 text-body text-text-secondary">Please enter your details to sign in.</p>
          </header>

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

          <form
            v-if="step.kind === 'mfa'"
            class="space-y-4"
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

          <form
            v-else
            class="space-y-4"
            :class="{ 'opacity-60 pointer-events-none': step.kind === 'locked' }"
            @submit.prevent="submit"
          >
            <div
              v-if="error && step.kind !== 'locked'"
              role="alert"
              class="rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
              data-testid="login-error-summary"
            >{{ error }}</div>

            <BulwarkInput
              v-model="email"
              type="email"
              label="Email Address"
              placeholder="name@company.com"
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

            <div class="flex items-center justify-between pt-1">
              <label class="inline-flex items-center gap-2 text-small text-text-primary">
                <input type="checkbox" class="h-4 w-4 rounded border-border text-primary focus:ring-primary/40">
                Remember me
              </label>
              <NuxtLink to="/forgot-password" class="text-small text-text-secondary hover:text-text-primary">
                Forgot password?
              </NuxtLink>
            </div>

            <BulwarkButton
              type="submit"
              variant="primary"
              :loading="loading"
              :disabled="step.kind === 'locked'"
              class="w-full"
            >
              Log In
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

          <p class="mt-8 text-center text-small text-text-secondary">
            Need an account?
            <span class="text-primary font-medium">Contact Admin</span>
          </p>
        </div>
      </section>
    </div>
  </main>
</template>
