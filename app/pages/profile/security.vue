<!--
  app/pages/profile/security.vue — per-user MFA enrolment + backup codes
  (W4-1 / EH-I / ADR-0024).

  # Decisions (ADR-0008, ADR-0024)
    - Single page hosts both the enable-flow (QR → confirm → backup
      codes) and the disable / regenerate-codes flow. State machine
      is driven by `MfaSetupStep` (pure helper for test).
    - Backup codes are shown ONCE; once the user dismisses the modal
      they can never see those codes again (per the contract). Copy
      + Download affordances are right there in the panel.
    - The disable / regenerate flows REQUIRE the current TOTP code
      (or a backup code) per ADR-0024. We don't try to be clever —
      simple input + service call.

  # Decision cast down
    - Auto-copying codes on render. Rejected — clipboard writes
      without an explicit user gesture are blocked by every modern
      browser. Explicit "Copy all" is the right pattern.
-->
<script setup lang="ts">
import type { MfaStatus, MfaSetupResult } from '~~/shared/contracts/mfa'
import { deriveInitialStep, type MfaSetupStep } from '~/composables/mfa-setup-helpers'

definePageMeta({
  // Authenticated users only; no further role gate.
})

useHead({ title: 'Security' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const mfa = useService('mfa')
const { t } = useLabel()

const userId = computed(() => session.value?.userId ?? '')

const status = ref<MfaStatus | null>(null)
const step = ref<MfaSetupStep>('idle')
const setupData = ref<MfaSetupResult | null>(null)
const confirmCode = ref('')
const disableCode = ref('')
const backupCodes = ref<string[]>([])
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

async function refreshStatus() {
  if (!userId.value) return
  try {
    status.value = await mfa.getStatus(userId.value)
    step.value = deriveInitialStep(status.value)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Could not load MFA status'
  }
}

await refreshStatus()

async function startEnroll() {
  errorMsg.value = null
  submitting.value = true
  try {
    setupData.value = await mfa.setupTotp(userId.value)
    step.value = 'qr'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Could not start enrolment'
  } finally {
    submitting.value = false
  }
}

async function confirmEnroll() {
  errorMsg.value = null
  if (!confirmCode.value.trim()) {
    errorMsg.value = 'Enter the 6-digit code from your authenticator app'
    return
  }
  submitting.value = true
  try {
    const r = await mfa.confirmTotp(userId.value, confirmCode.value.trim())
    if (!r.confirmed) {
      errorMsg.value = 'That code did not match. Try again.'
      return
    }
    const codes = await mfa.generateBackupCodes(userId.value)
    backupCodes.value = codes.codes
    step.value = 'backupCodes'
    confirmCode.value = ''
    await refreshStatus()
    // Re-set step because refreshStatus would push us to 'enrolled'.
    step.value = 'backupCodes'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Confirmation failed'
  } finally {
    submitting.value = false
  }
}

function ackBackupCodes() {
  backupCodes.value = []
  setupData.value = null
  step.value = 'enrolled'
}

async function copyBackupCodes() {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(backupCodes.value.join('\n'))
  } catch {
    // ignored — user can still read + copy manually.
  }
}

function downloadBackupCodes() {
  if (typeof document === 'undefined') return
  const blob = new Blob([backupCodes.value.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'bulwark-mfa-backup-codes.txt'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function regenerateCodes() {
  errorMsg.value = null
  if (!disableCode.value.trim()) {
    errorMsg.value = 'Enter your current 6-digit code first'
    return
  }
  submitting.value = true
  try {
    // Verify code, then regenerate. The verify call returns {ok}; on
    // failure we try backup code consumption.
    const verify = await mfa.verifyTotp(userId.value, disableCode.value.trim())
    let ok = verify.ok
    if (!ok) {
      const consume = await mfa.consumeBackupCode(userId.value, disableCode.value.trim())
      ok = consume.ok
    }
    if (!ok) {
      errorMsg.value = 'Could not verify that code'
      return
    }
    const codes = await mfa.generateBackupCodes(userId.value)
    backupCodes.value = codes.codes
    disableCode.value = ''
    step.value = 'backupCodes'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Could not regenerate codes'
  } finally {
    submitting.value = false
  }
}

async function doDisable() {
  errorMsg.value = null
  if (!disableCode.value.trim()) {
    errorMsg.value = 'Enter your current 6-digit code (or a backup code)'
    return
  }
  submitting.value = true
  try {
    const r = await mfa.disable(userId.value, disableCode.value.trim())
    if (!r.disabled) {
      errorMsg.value = 'Disable failed — code did not match'
      return
    }
    disableCode.value = ''
    await refreshStatus()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Disable failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-2xl mx-auto" data-testid="profile-security-page">
    <header>
      <h1 class="text-display">Security</h1>
      <p class="text-body text-text-secondary mt-1">
        Manage your two-factor authentication settings.
      </p>
    </header>

    <p
      v-if="errorMsg"
      role="alert"
      class="mt-4 rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
    >{{ errorMsg }}</p>

    <BulwarkCard padding="md" class="mt-6">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-h2">{{ t('mfa.setup', 'title', 'Two-factor authentication') }}</h2>
          <p class="text-small text-text-secondary mt-1">
            <span v-if="status?.enabled" data-testid="mfa-status-enabled">Enabled · {{ status.backupCodesRemaining }} backup codes remaining</span>
            <span v-else data-testid="mfa-status-disabled">Not enabled</span>
          </p>
        </div>
        <BulwarkButton
          v-if="step === 'idle'"
          variant="primary"
          :loading="submitting"
          data-testid="mfa-enable-button"
          @click="startEnroll"
        >Enable two-factor</BulwarkButton>
      </div>

      <!-- QR step --------------------------------------------------- -->
      <div v-if="step === 'qr' && setupData" class="mt-6" data-testid="mfa-step-qr">
        <p class="text-body">{{ t('mfa.setup', 'scan', 'Scan this QR code with your authenticator app.') }}</p>
        <div class="mt-3 flex flex-col sm:flex-row gap-4 items-start">
          <img
            v-if="setupData.qrCodeDataUrl"
            :src="setupData.qrCodeDataUrl"
            alt="MFA QR code"
            class="w-48 h-48 border border-border rounded-card"
            data-testid="mfa-qr-image"
          />
          <div class="flex-1 min-w-0">
            <p class="text-small text-text-secondary">Or enter this secret manually:</p>
            <code
              class="block mt-1 px-2 py-1 bg-surface-muted rounded font-mono text-small break-all"
              data-testid="mfa-secret"
            >{{ setupData.secret }}</code>
          </div>
        </div>
        <BulwarkButton class="mt-4" variant="primary" @click="step = 'confirm'">
          I've scanned it — continue
        </BulwarkButton>
      </div>

      <!-- Confirm step ---------------------------------------------- -->
      <div v-else-if="step === 'confirm'" class="mt-6" data-testid="mfa-step-confirm">
        <p class="text-body">{{ t('mfa.setup', 'confirm', 'Enter the 6-digit code to confirm enrolment.') }}</p>
        <form class="mt-3 flex gap-2 items-end" @submit.prevent="confirmEnroll">
          <BulwarkInput
            v-model="confirmCode"
            label="Code"
            placeholder="123456"
            autocomplete="one-time-code"
            inputmode="numeric"
            required
            data-testid="mfa-confirm-input"
          />
          <BulwarkButton type="submit" variant="primary" :loading="submitting" data-testid="mfa-confirm-submit">
            Confirm
          </BulwarkButton>
        </form>
      </div>

      <!-- Backup codes step ----------------------------------------- -->
      <div v-else-if="step === 'backupCodes'" class="mt-6" data-testid="mfa-step-backup">
        <h3 class="text-h2">{{ t('mfa.setup', 'backup-codes-header', 'Save these backup codes') }}</h3>
        <p class="text-small text-text-secondary mt-1">
          You'll only see them once. Store them somewhere safe.
        </p>
        <ul class="mt-3 grid grid-cols-2 gap-1 font-mono text-small" data-testid="mfa-backup-codes-list">
          <li
            v-for="(code, idx) in backupCodes"
            :key="idx"
            class="px-2 py-1 bg-surface-muted rounded"
          >{{ code }}</li>
        </ul>
        <div class="mt-3 flex gap-2">
          <BulwarkButton variant="secondary" data-testid="mfa-backup-copy" @click="copyBackupCodes">
            {{ t('mfa.setup', 'copy-all', 'Copy all') }}
          </BulwarkButton>
          <BulwarkButton variant="secondary" data-testid="mfa-backup-download" @click="downloadBackupCodes">
            {{ t('mfa.setup', 'download', 'Download as .txt') }}
          </BulwarkButton>
          <BulwarkButton variant="primary" data-testid="mfa-backup-ack" @click="ackBackupCodes">
            I've saved them
          </BulwarkButton>
        </div>
      </div>

      <!-- Enrolled actions ------------------------------------------ -->
      <div v-else-if="step === 'enrolled'" class="mt-6 flex flex-col gap-4" data-testid="mfa-step-enrolled">
        <div>
          <h3 class="text-h2">Manage</h3>
          <p class="text-small text-text-secondary mt-1">
            {{ t('mfa.disable', 'confirm', 'Enter your current 6-digit code (or a backup code) to disable.') }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2 items-end">
            <BulwarkInput
              v-model="disableCode"
              label="Code"
              placeholder="123456"
              autocomplete="one-time-code"
              inputmode="numeric"
              data-testid="mfa-disable-input"
            />
            <BulwarkButton
              variant="secondary"
              :loading="submitting"
              data-testid="mfa-regen-button"
              @click="regenerateCodes"
            >Regenerate backup codes</BulwarkButton>
            <BulwarkButton
              variant="destructive"
              :loading="submitting"
              data-testid="mfa-disable-button"
              @click="doDisable"
            >Disable two-factor</BulwarkButton>
          </div>
        </div>
      </div>
    </BulwarkCard>
  </div>
</template>
