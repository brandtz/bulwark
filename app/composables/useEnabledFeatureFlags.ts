export function useEnabledFeatureFlags() {
  const { session } = useSession()
  const featureFlagService = useService('featureFlag')
  const enabledFlags = ref<Set<string>>(new Set())
  const mounted = ref(false)

  onMounted(() => {
    mounted.value = true
  })

  watch(
    () => (mounted.value ? session.value?.activeOrganizationId : undefined),
    async (organizationId, _previous, onCleanup) => {
      enabledFlags.value = new Set()
      if (!organizationId) return

      let stale = false
      onCleanup(() => {
        stale = true
      })

      try {
        const { rows } = await featureFlagService.listForOrg(organizationId)
        if (!stale) {
          enabledFlags.value = new Set(rows.filter((flag) => flag.value === 'on').map((flag) => flag.slug))
        }
      } catch (error) {
        if (!stale) console.error('Failed to load navigation feature flags', error)
      }
    },
    { immediate: true },
  )

  return { enabledFlags }
}
