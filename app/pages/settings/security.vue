<!--
  app/pages/settings/security.vue — organization security policy (WP-L07 S2).

  # Decisions
    - Functional admin surface in the existing settings style; the ST-23
      design (WP-C3, pending) replaces the layout, not the behaviour.
    - Empty idle timeout = no timeout. When set, "Keep me signed in" is
      ignored at sign-in (ED-001), which the form states.
    - The roster shows who has not enrolled, so an admin can see the impact
      of switching MFA to "required" before doing it.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { MfaMode, MfaRosterRow, SecurityPolicy } from '~~/shared/contracts/security-policy'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})
useHead({ title: 'Security' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const securityPolicy = useService('securityPolicy')
const { success: toastSuccess, error: toastError } = useToast()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const policy = ref<SecurityPolicy | null>(null)
const roster = ref<MfaRosterRow[]>([])
const form = reactive({ mfaMode: 'optional' as MfaMode, idleMinutes: '', lockoutAttempts: 5, lockoutMinutes: 30, trustedDays: 30 })
const saving = ref(false)

async function load() {
  const [p, r] = await Promise.all([securityPolicy.get(orgId.value), securityPolicy.mfaRoster(orgId.value)])
  policy.value = p
  roster.value = r
  Object.assign(form, {
    mfaMode: p.mfaMode,
    idleMinutes: p.idleMinutes === null ? '' : String(p.idleMinutes),
    lockoutAttempts: p.lockoutAttempts,
    lockoutMinutes: p.lockoutMinutes,
    trustedDays: p.trustedDays,
  })
}
await load()

const notEnrolled = computed(() => roster.value.filter((r) => !r.mfaEnabled).length)

async function save() {
  saving.value = true
  try {
    await securityPolicy.update({
      organizationId: orgId.value,
      mfaMode: form.mfaMode,
      idleMinutes: form.idleMinutes === '' ? null : Number(form.idleMinutes),
      lockoutAttempts: Number(form.lockoutAttempts),
      lockoutMinutes: Number(form.lockoutMinutes),
      trustedDays: Number(form.trustedDays),
    })
    toastSuccess('Security policy saved', 'Changes apply to the next request each member makes.')
    await load()
  } catch (err) {
    toastError('Could not save the security policy', (err as Error).message)
  } finally {
    saving.value = false
  }
}

const inputClass = 'w-full rounded-input border border-border-default bg-surface-base px-3 py-2'
</script>

<template>
  <div class="p-4 md:p-6 max-w-4xl mx-auto" data-testid="settings-security">
    <BulwarkBreadcrumbs :items="[{ label: 'Settings', to: '/settings' }, { label: 'Security' }]" />
    <header class="mt-2">
      <h1 class="text-display">Security</h1>
      <p class="text-body text-text-secondary mt-1">
        Two-factor authentication, session timeout and sign-in lockout for everyone in this organization.
      </p>
    </header>

    <BulwarkCard padding="md" class="mt-6">
      <form class="grid gap-4 md:grid-cols-2" data-testid="security-policy-form" @submit.prevent="save">
        <div class="md:col-span-2">
          <label for="mfa-mode" class="block text-small font-medium text-text-secondary mb-1">Two-factor authentication</label>
          <select id="mfa-mode" v-model="form.mfaMode" :class="inputClass" data-testid="security-mfa-mode">
            <option value="disabled">Disabled — members cannot enrol</option>
            <option value="optional">Optional — members choose</option>
            <option value="required">Required — members must enrol before using Bulwark</option>
          </select>
          <p v-if="form.mfaMode === 'required' && notEnrolled" class="text-small text-status-warning mt-1" data-testid="security-mfa-impact">
            {{ notEnrolled }} member{{ notEnrolled === 1 ? '' : 's' }} will be asked to enrol on their next action.
          </p>
        </div>
        <div>
          <label for="idle-minutes" class="block text-small font-medium text-text-secondary mb-1">Sign out after inactivity (minutes)</label>
          <input id="idle-minutes" v-model="form.idleMinutes" type="number" min="5" max="1440" placeholder="No timeout" :class="inputClass" data-testid="security-idle-minutes">
          <p class="text-small text-text-secondary mt-1">When set, “Keep me signed in” is ignored.</p>
        </div>
        <div>
          <label for="trusted-days" class="block text-small font-medium text-text-secondary mb-1">“Keep me signed in” lasts (days)</label>
          <input id="trusted-days" v-model="form.trustedDays" type="number" min="1" max="90" required :class="inputClass" data-testid="security-trusted-days">
        </div>
        <div>
          <label for="lockout-attempts" class="block text-small font-medium text-text-secondary mb-1">Lock after failed sign-ins</label>
          <input id="lockout-attempts" v-model="form.lockoutAttempts" type="number" min="3" max="20" required :class="inputClass" data-testid="security-lockout-attempts">
        </div>
        <div>
          <label for="lockout-minutes" class="block text-small font-medium text-text-secondary mb-1">Lockout duration (minutes)</label>
          <input id="lockout-minutes" v-model="form.lockoutMinutes" type="number" min="1" max="1440" required :class="inputClass" data-testid="security-lockout-minutes">
        </div>
        <div class="md:col-span-2 flex justify-end">
          <BulwarkButton type="submit" variant="primary" :disabled="saving" data-testid="security-save">
            {{ saving ? 'Saving…' : 'Save policy' }}
          </BulwarkButton>
        </div>
      </form>
    </BulwarkCard>

    <BulwarkCard padding="md" class="mt-6">
      <h2 class="text-body font-medium">Two-factor enrolment</h2>
      <table class="mt-3 w-full text-small" data-testid="security-mfa-roster">
        <thead>
          <tr class="text-left text-text-secondary">
            <th scope="col" class="py-1 font-medium">Member</th>
            <th scope="col" class="py-1 font-medium">Role</th>
            <th scope="col" class="py-1 font-medium">Two-factor</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in roster" :key="row.userId" data-testid="security-roster-row" :data-enrolled="row.mfaEnabled">
            <td class="py-1">{{ row.fullName }} <span class="text-text-secondary">· {{ row.email }}</span></td>
            <td class="py-1">{{ row.role }}</td>
            <td class="py-1">{{ row.mfaEnabled ? 'Enrolled' : 'Not enrolled' }}</td>
          </tr>
        </tbody>
      </table>
    </BulwarkCard>
  </div>
</template>
