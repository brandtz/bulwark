export default defineNuxtRouteMiddleware((to) => {
  if (to.meta.layout !== undefined) return

  if (to.path === '/settings' || to.path.startsWith('/settings/')) {
    setPageLayout('settings')
    return
  }

  const { session } = useSession()
  if (
    to.path === '/insurer'
    || to.path.startsWith('/insurer/')
    || session.value?.activeRole === 'stakeholder'
  ) {
    setPageLayout('stakeholder')
    return
  }

  setPageLayout('default')
})
