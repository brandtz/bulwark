<!--
  app/pages/settings/users.vue — users + memberships + invites
  (W2-4 / EH-H Part B / ADR-0021).

  # Decisions (ADR-0008, ADR-0021)
    - One unified list of members + outstanding invites (discriminated
      union from IUserService.list). Each row carries `kind` so the
      action menu branches.
    - Status pill copy goes through `useLabel().t('user.status', ...)`.
    - Invite flow: modal → POST → success banner shows the inviteUrl
      ONCE (W3-1 will send the email).
    - Role change is inline select; suspend/reactivate/deactivate/
      revoke/resend hang inline per row.

  # Decision cast down
    - Rejected: bulk actions for v1. One-at-a-time keeps the surface
      legible while we still have ≤20 members per org in practice.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { Role } from '~~/shared/contracts/_shared'
import type { UserAdminRow } from '~~/shared/contracts/user'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Users & roles' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const userService = useService('user')
const { t } = useLabel()
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const rows = ref<UserAdminRow[]>([])
const loading = ref(false)
async function load() {
  loading.value = true
  try {
    const r = await userService.list({ organizationId: orgId.value })
    rows.value = r.users
  } finally {
    loading.value = false
  }
}
await load()

const showInviteModal = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<Role>('field')
const inviting = ref(false)
const justInvited = ref<{ email: string; url: string } | null>(null)

const ROLE_CHOICES: Role[] = [
  'org_admin',
  'org_manager',
  'field',
  'sub_contractor',
  'viewer',
]

async function onInvite() {
  if (!inviteEmail.value.trim()) return
  inviting.value = true
  try {
    const result = await userService.invite({
      organizationId: orgId.value,
      email: inviteEmail.value.trim().toLowerCase(),
      role: inviteRole.value,
      invitedByUserId: session.value?.userId ?? null,
    })
    justInvited.value = { email: inviteEmail.value, url: result.inviteUrl }
    showInviteModal.value = false
    inviteEmail.value = ''
    inviteRole.value = 'field'
    await load()
  } catch (err) {
    toastError('Could not invite', (err as Error).message)
  } finally {
    inviting.value = false
  }
}

async function onChangeRole(row: UserAdminRow, newRole: Role) {
  if (row.kind !== 'member') return
  try {
    await userService.setRole({
      organizationId: orgId.value,
      userId: row.id,
      role: newRole,
    })
    toastSuccess('Role updated', `${row.fullName} is now ${newRole}.`)
    await load()
  } catch (err) {
    toastError('Could not change role', (err as Error).message)
  }
}

async function onSuspend(row: UserAdminRow) {
  if (row.kind !== 'member') return
  await userService.suspend(row.id, orgId.value)
  toastSuccess('Suspended', `${row.fullName} has been suspended.`)
  await load()
}
async function onReactivate(row: UserAdminRow) {
  if (row.kind !== 'member') return
  await userService.reactivate(row.id, orgId.value)
  toastSuccess('Reactivated', `${row.fullName} can sign in again.`)
  await load()
}
async function onDeactivate(row: UserAdminRow) {
  if (row.kind !== 'member') return
  if (!confirm(`Deactivate ${row.fullName}? They will be locked out.`)) return
  await userService.deactivate(row.id, orgId.value)
  toastSuccess('Deactivated', `${row.fullName} is deactivated.`)
  await load()
}
async function onRevoke(row: UserAdminRow) {
  if (row.kind !== 'invite') return
  await userService.revokeInvite(row.id, orgId.value)
  toastSuccess('Invite revoked')
  await load()
}
async function onResend(row: UserAdminRow) {
  if (row.kind !== 'invite') return
  const result = await userService.resendInvite(row.id, orgId.value)
  justInvited.value = { email: row.email, url: result.inviteUrl }
  await load()
}

function statusPill(status: UserAdminRow['status']): { cls: string; text: string } {
  const text = t('user.status', status, status)
  const cls = {
    active: 'bg-status-success/10 text-status-success',
    invited: 'bg-status-info/10 text-status-info',
    suspended: 'bg-status-warning/10 text-status-warning',
    deactivated: 'bg-status-error/10 text-status-error',
  }[status]
  return { cls, text }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-4xl mx-auto" data-testid="settings-users">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Users & roles' }]"
    />
    <header class="mt-2 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-display">Users & roles</h1>
        <p class="text-body text-text-secondary mt-1">
          Members and outstanding invites for this organization.
        </p>
      </div>
      <BulwarkButton
        variant="primary"
        data-testid="users-invite-button"
        @click="showInviteModal = true"
      >
        Invite user
      </BulwarkButton>
    </header>

    <BulwarkCard
      v-if="justInvited"
      padding="md"
      class="mt-4 border-status-warning bg-status-warning/5"
      data-testid="invite-success-banner"
    >
      <p class="text-body font-medium text-status-warning">
        Copy this invite link now — it will not be shown again.
      </p>
      <p class="text-small text-text-secondary mt-1">
        Sent to {{ justInvited.email }}
      </p>
      <code
        class="block mt-2 break-all rounded-card bg-surface-muted p-2 text-small"
        data-testid="invite-success-url"
      >{{ justInvited.url }}</code>
      <div class="mt-2 flex justify-end">
        <BulwarkButton size="sm" variant="secondary" @click="justInvited = null">
          I've saved it
        </BulwarkButton>
      </div>
    </BulwarkCard>

    <BulwarkCard padding="none" class="mt-6">
      <p v-if="loading" class="p-4 text-small text-text-secondary">Loading…</p>
      <ul v-else class="divide-y divide-border-default">
        <li
          v-for="row in rows"
          :key="row.id"
          class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2"
          data-testid="user-row"
          :data-kind="row.kind"
        >
          <div class="md:col-span-5">
            <template v-if="row.kind === 'member'">
              <p class="text-body font-medium text-text-primary">{{ row.fullName }}</p>
              <p class="text-small text-text-secondary">{{ row.email }}</p>
            </template>
            <template v-else>
              <p class="text-body font-medium text-text-primary">{{ row.email }}</p>
              <p class="text-small text-text-secondary">
                Invited · expires {{ new Date(row.expiresAt).toLocaleDateString() }}
              </p>
            </template>
          </div>
          <div class="md:col-span-3 self-center">
            <select
              v-if="row.kind === 'member'"
              :value="row.role"
              class="rounded-input border border-border-default bg-surface-base px-2 py-1 text-small"
              data-testid="user-role-select"
              @change="onChangeRole(row, ($event.target as HTMLSelectElement).value as Role)"
            >
              <option v-for="r in ROLE_CHOICES" :key="r" :value="r">{{ r }}</option>
            </select>
            <span v-else class="text-small text-text-secondary">{{ row.role }}</span>
          </div>
          <div class="md:col-span-2 self-center">
            <span
              :class="['inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium', statusPill(row.status).cls]"
              data-testid="user-status-pill"
              :data-status="row.status"
            >{{ statusPill(row.status).text }}</span>
          </div>
          <div class="md:col-span-2 self-center md:text-right text-small">
            <template v-if="row.kind === 'member'">
              <button
                v-if="row.status === 'active'"
                type="button"
                class="text-status-warning hover:underline mr-3"
                data-testid="user-suspend-button"
                @click="onSuspend(row)"
              >Suspend</button>
              <button
                v-if="row.status === 'suspended' || row.status === 'deactivated'"
                type="button"
                class="text-status-success hover:underline mr-3"
                data-testid="user-reactivate-button"
                @click="onReactivate(row)"
              >Reactivate</button>
              <button
                v-if="row.status !== 'deactivated'"
                type="button"
                class="text-status-error hover:underline"
                data-testid="user-deactivate-button"
                @click="onDeactivate(row)"
              >Deactivate</button>
            </template>
            <template v-else>
              <button
                type="button"
                class="text-status-info hover:underline mr-3"
                data-testid="invite-resend-button"
                @click="onResend(row)"
              >Resend</button>
              <button
                type="button"
                class="text-status-error hover:underline"
                data-testid="invite-revoke-button"
                @click="onRevoke(row)"
              >Revoke</button>
            </template>
          </div>
        </li>
      </ul>
    </BulwarkCard>

    <div
      v-if="showInviteModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="invite-modal"
    >
      <BulwarkCard padding="md" class="w-full max-w-md">
        <h2 class="text-headline mb-3">Invite teammate</h2>
        <form class="space-y-3" @submit.prevent="onInvite">
          <BulwarkInput
            v-model="inviteEmail"
            type="email"
            label="Email"
            placeholder="alex@example.com"
            data-testid="invite-email-input"
            required
          />
          <div>
            <label class="block text-small font-medium text-text-secondary mb-1">Role</label>
            <select
              v-model="inviteRole"
              class="w-full rounded-input border border-border-default bg-surface-base px-3 py-2"
              data-testid="invite-role-select"
            >
              <option v-for="r in ROLE_CHOICES" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <BulwarkButton
              type="button"
              variant="secondary"
              @click="showInviteModal = false"
            >Cancel</BulwarkButton>
            <BulwarkButton
              type="submit"
              variant="primary"
              :disabled="inviting"
              data-testid="invite-submit-button"
            >{{ inviting ? 'Sending…' : 'Send invite' }}</BulwarkButton>
          </div>
        </form>
      </BulwarkCard>
    </div>
  </div>
</template>
