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
const passwordVisible = ref(false)
const rememberMe = ref(false)
const errorSummary = ref<HTMLElement | null>(null)
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
const nextDestination = computed(() => {
  const next = typeof route.query.next === 'string' ? route.query.next : ''
  return next.startsWith('/') && !next.startsWith('//') ? next : ''
})
const passwordResetComplete = computed(() => route.query.reset === 'ok')

watch(error, async (message) => {
  if (!message) return
  await nextTick()
  errorSummary.value?.focus()
})

async function submit() {
  if (!email.value || !password.value) return
  const r = await loginEx({ email: email.value, password: password.value, rememberMe: rememberMe.value })
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
  <main class="auth-page" data-testid="login-page-root">
    <a class="skip-link" href="#login-form">Skip to sign in</a>

    <header class="auth-header">
      <NuxtLink to="/login" class="brand-lockup" aria-label="Bulwark sign in">
        <span class="brand-mark" aria-hidden="true">B</span>
        <span class="brand-copy">
          <strong>Bulwark</strong>
          <small>Operations workspace</small>
        </span>
      </NuxtLink>
      <span class="help-copy">Need help? Contact your administrator.</span>
    </header>

    <section class="auth-content" aria-labelledby="login-heading">
      <div class="auth-card">
        <div v-if="step.kind !== 'mfa'" class="auth-title">
          <h1 id="login-heading">Sign in</h1>
          <p>Use your work email and password to continue.</p>
        </div>

        <div
          v-if="passwordResetComplete"
          class="auth-banner auth-banner--success"
          role="status"
          data-testid="login-reset-success"
        >Your password has been updated. Sign in with your new password.</div>
        <div
          v-if="nextDestination && step.kind !== 'mfa'"
          class="auth-banner auth-banner--info"
          data-testid="login-next-notice"
        >Sign in to continue to <span class="font-mono">{{ nextDestination }}</span>.</div>

        <div
          v-if="step.kind === 'locked'"
          role="alert"
          class="auth-banner auth-banner--warning"
          data-testid="login-locked-banner"
        >
          <strong>{{ t('login.locked', 'title', 'Account temporarily locked') }}</strong>
          <span data-testid="login-locked-retry">Try again in {{ retryAfterDisplay }}.</span>
        </div>

        <form
          v-if="step.kind === 'mfa'"
          id="login-form"
          class="auth-form"
          data-testid="login-mfa-form"
          @submit.prevent="submitMfa"
        >
          <div class="auth-title auth-title--compact">
            <h1 id="login-heading">{{ t('login.mfa', 'title', 'Two-factor required') }}</h1>
            <p>Enter the {{ step.useBackup ? 'backup code' : '6-digit code' }} for {{ step.email }}.</p>
          </div>
          <div v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="auth-banner auth-banner--danger">{{ error }}</div>
          <BulwarkInput
            v-model="code"
            :label="step.useBackup ? 'Backup code' : 'Code'"
            :placeholder="step.useBackup ? 'XXXX-XXXX' : '123456'"
            autocomplete="one-time-code"
            inputmode="numeric"
            required
            data-testid="login-mfa-input"
          />
          <BulwarkButton type="submit" variant="primary" size="lg" :loading="loading" class="auth-submit" data-testid="login-mfa-submit">
            Verify
          </BulwarkButton>
          <div class="auth-link-row">
            <button type="button" class="auth-link" data-testid="login-mfa-toggle-backup" @click="toggleBackupCodeMode">
              {{ step.useBackup ? 'Use authenticator code' : 'Use backup code' }}
            </button>
            <button type="button" class="auth-link auth-link--muted" data-testid="login-mfa-cancel" @click="cancelMfa">Back</button>
          </div>
        </form>

        <form
          v-else
          id="login-form"
          class="auth-form"
          :class="{ 'auth-form--locked': step.kind === 'locked' }"
          @submit.prevent="submit"
        >
          <div v-if="error && step.kind !== 'locked'" ref="errorSummary" role="alert" tabindex="-1" class="auth-banner auth-banner--danger" data-testid="login-error-summary">{{ error }}</div>
          <BulwarkInput
            v-model="email"
            type="email"
            label="Email"
            placeholder="you@company.com"
            autocomplete="username"
            required
            :disabled="step.kind === 'locked' || loading"
          />
          <div class="password-control">
            <BulwarkInput
              v-model="password"
              :type="passwordVisible ? 'text' : 'password'"
              label="Password"
              autocomplete="current-password"
              required
              :disabled="step.kind === 'locked' || loading"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="passwordVisible ? 'Hide password' : 'Show password'"
              :aria-pressed="passwordVisible"
              :disabled="step.kind === 'locked' || loading"
              @click="passwordVisible = !passwordVisible"
            >{{ passwordVisible ? 'Hide' : 'Show' }}</button>
          </div>

          <div class="auth-link-row auth-link-row--after-password">
            <label class="remember-control" data-touch-row>
              <input v-model="rememberMe" type="checkbox" data-testid="remember-me-checkbox">
              <span>Keep me signed in on this device</span>
            </label>
            <NuxtLink to="/forgot-password" class="auth-link" data-testid="forgot-password-link">Forgot password?</NuxtLink>
          </div>

          <BulwarkButton
            type="submit"
            variant="primary"
            size="lg"
            :loading="loading"
            :disabled="step.kind === 'locked'"
            class="auth-submit"
            data-testid="login-submit"
          >Sign In</BulwarkButton>
        </form>

        <div v-if="showDevPersonas && step.kind !== 'mfa'" class="dev-personas">
          <p class="dev-personas-title">Demo personas</p>
          <div class="dev-persona-list">
            <BulwarkButton
              v-for="persona in personas"
              :key="persona.email"
              type="button"
              variant="secondary"
              :data-persona="persona.email"
              @click="quickLogin(persona.email)"
            >{{ persona.label }}</BulwarkButton>
          </div>
        </div>

        <p v-if="step.kind !== 'mfa'" class="invite-prompt">
          Already invited?
          <NuxtLink to="/accept-invite" class="auth-link" data-testid="open-invite-link">Open your invite link</NuxtLink>
        </p>
      </div>
    </section>

    <footer class="auth-footer">
      <span>Powered by <strong>BULWARK</strong></span>
      <span class="footer-legal">Secure access for your organization</span>
    </footer>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: 28px clamp(20px, 5vw, 72px) 20px;
  color: var(--text-primary);
  background: var(--bg-page);
  font-family: var(--font-body);
}

.skip-link {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  transform: translateY(-150%);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-inverse);
  background: var(--accent);
}

.skip-link:focus { transform: translateY(0); }

.auth-header, .auth-footer {
  width: min(100%, 1100px);
  margin-inline: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.brand-mark {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 10px;
  color: var(--on-accent);
  background: var(--accent);
  font-weight: 700;
}

.brand-copy { display: grid; gap: 1px; }
.brand-copy strong { font-size: 16px; line-height: 1.2; font-weight: 600; }
.brand-copy small, .help-copy, .auth-footer { color: var(--text-secondary); font-size: 12px; }
.help-copy { text-align: right; }

.auth-content {
  display: grid;
  place-items: center;
  padding-block: 48px;
}

.auth-card {
  width: min(100%, 440px);
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-1);
  animation: auth-enter 180ms var(--ease-out) both;
}

.auth-title { margin-bottom: 24px; }
.auth-title h1 { margin: 0; font-family: var(--font-display); font-size: 26px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; }
.auth-title p { margin: 6px 0 0; color: var(--text-secondary); font-size: 14px; line-height: 1.5; }
.auth-title--compact { margin-bottom: 0; }
.auth-form { display: grid; gap: 16px; }
.auth-form--locked { opacity: 0.65; }
.auth-banner { display: grid; gap: 3px; padding: 11px 12px; border: 1px solid; border-radius: var(--radius-sm); font-size: 13px; line-height: 1.45; }
.auth-banner--info { margin-bottom: 16px; color: var(--info-strong); background: var(--info-bg); border-color: var(--info-border); }
.auth-banner--success { margin-bottom: 16px; color: var(--success-strong); background: var(--success-bg); border-color: var(--success-border); }
.auth-banner--warning { margin-bottom: 16px; color: var(--warning-strong); background: var(--warning-bg); border-color: var(--warning-border); }
.auth-banner--danger { color: var(--danger-strong); background: var(--danger-bg); border-color: var(--danger-border); }

.password-control { position: relative; }
.password-control :deep(input) { padding-right: 58px; }
.password-toggle {
  position: absolute;
  right: 8px;
  bottom: 8px;
  min-width: 44px;
  min-height: 32px;
  padding-inline: 6px;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-link);
  background: transparent;
  font: 500 12px var(--font-body);
  cursor: pointer;
}
.password-toggle:focus-visible, .auth-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.auth-link-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.auth-link-row--after-password { margin-top: -9px; }
.auth-link, .auth-link--muted { min-height: 32px; display: inline-flex; align-items: center; color: var(--text-link); font-size: 13px; font-weight: 500; text-decoration: none; }
.auth-link:hover { text-decoration: underline; }
.auth-link--muted { color: var(--text-secondary); }
.remember-control { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; color: var(--text-secondary); font-size: 12px; line-height: 1.35; cursor: pointer; }
.remember-control input { width: 16px; height: 16px; flex: none; accent-color: var(--accent); }
.auth-submit { width: 100%; background: var(--accent) !important; color: var(--on-accent) !important; }
.auth-submit:hover:not(:disabled) { background: var(--accent-700) !important; }
.invite-prompt { margin: 22px 0 0; padding-top: 16px; border-top: 1px solid var(--divider); color: var(--text-secondary); font-size: 13px; text-align: center; }
.invite-prompt .auth-link { margin-left: 4px; }
.dev-personas { display: grid; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--divider); }
.dev-personas-title { margin: 0; color: var(--text-secondary); font-size: 12px; font-weight: 500; }
.dev-persona-list { display: flex; flex-wrap: wrap; gap: 8px; }
.dev-persona-list :deep(button) { min-height: 36px; }
.auth-footer { min-height: 32px; }
.auth-footer strong { color: var(--text-primary); font-size: 10px; letter-spacing: 0.04em; }

@keyframes auth-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 499px) {
  .auth-page { padding: 20px; }
  .help-copy { display: none; }
  .auth-content { place-items: start center; padding-block: 48px 24px; }
  .auth-card { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .auth-title { margin-bottom: 24px; }
  .auth-form { gap: 18px; }
  .auth-form :deep(input) { min-height: 48px; }
  .auth-submit { min-height: 48px; }
  /* SH-01 touch audit at 390: every interactive target is at least 48px. */
  .password-toggle { bottom: 0; min-width: 48px; min-height: 48px; }
  .auth-link, .auth-link--muted, .brand-lockup, .skip-link { min-height: 48px; }
  .brand-lockup { display: inline-flex; align-items: center; }
  .remember-control { min-height: 48px; }
  .remember-control input { width: 24px; height: 24px; }
  .auth-link-row--after-password { margin-top: 0; }
  .invite-prompt { margin-top: 20px; }
  .auth-footer { align-items: flex-start; flex-direction: column; gap: 4px; }
}

@media (prefers-reduced-motion: reduce) {
  .auth-card { animation: none; }
}
</style>
