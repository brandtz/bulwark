import { snapshotAllQueuedWrites, type PendingQueuedWrite } from './useOfflineQueue'

export function useQueuedWorkSignOut() {
  const { logout } = useAuth()
  const toast = useToast()
  const warningOpen = ref(false)
  const pendingWrites = ref<PendingQueuedWrite[]>([])
  const inspectionFailed = ref(false)

  function refreshPendingWrites(): void {
    try {
      pendingWrites.value = typeof localStorage === 'undefined' ? [] : snapshotAllQueuedWrites(localStorage)
      inspectionFailed.value = false
    } catch (error) {
      pendingWrites.value = []
      inspectionFailed.value = true
      console.error('Could not inspect pending offline work before sign out', error)
    }
  }

  async function signOut(): Promise<void> {
    try {
      await logout()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign out.'
      console.error('Sign out failed', error)
      toast.error('Could not sign out', message)
    }
  }

  async function requestSignOut(): Promise<void> {
    refreshPendingWrites()
    if (pendingWrites.value.length > 0 || inspectionFailed.value) {
      warningOpen.value = true
      return
    }
    await signOut()
  }

  async function confirmSignOut(): Promise<void> {
    warningOpen.value = false
    await signOut()
  }

  function cancelSignOut(): void {
    warningOpen.value = false
    pendingWrites.value = []
    inspectionFailed.value = false
  }

  return {
    warningOpen,
    pendingWrites,
    inspectionFailed,
    refreshPendingWrites,
    requestSignOut,
    confirmSignOut,
    cancelSignOut,
  }
}
