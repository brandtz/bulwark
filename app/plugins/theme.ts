import { computeOnAccent } from '~~/shared/utils/theme'
import type { ThemePreference, DensityPreference } from '~/composables/useTheme'

const THEME_STORAGE = 'bulwark.theme'
const DENSITY_STORAGE = 'bulwark.density'

function normalizeHex(color: string): string {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(color)
  if (!match) return '#0F766E'
  const hex = match[1]!
  return hex.length === 3 ? `#${[...hex].map((channel) => channel + channel).join('')}` : `#${hex}`
}

export default defineNuxtPlugin(async () => {
  const { systemTheme, resolvedTheme, resolvedDensity } = useTheme()
  const accent = useState('bulwark.theme.accent', () => '#0F766E')

  if (import.meta.client) {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    systemTheme.value = media.matches ? 'dark' : 'light'
    media.addEventListener('change', (event) => {
      systemTheme.value = event.matches ? 'dark' : 'light'
    })

    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE)
      const storedDensity = window.localStorage.getItem(DENSITY_STORAGE)
      if (storedTheme && ['light', 'dark', 'system'].includes(storedTheme)) {
        useCookie<ThemePreference>('bulwark.theme').value = storedTheme as ThemePreference
      }
      if (storedDensity && ['comfortable', 'compact', 'touch', 'auto'].includes(storedDensity)) {
        useCookie<DensityPreference>('bulwark.density').value = storedDensity as DensityPreference
      }
    } catch {
      // Storage can be disabled by browser policy; cookies still provide SSR state.
    }
  }

  try {
    const { session, ensureLoaded } = useSession()
    await ensureLoaded()
    const organizationId = session.value?.activeOrganizationId
    if (organizationId) {
      const branding = await useService('label').getBranding(organizationId)
      accent.value = normalizeHex(branding.accentColor)
    }
  } catch {
    // Theme defaults must not prevent a route from rendering.
  }

  const onAccent = computed(() => computeOnAccent(normalizeHex(accent.value)))
  useHead({
    htmlAttrs: {
      'data-theme': resolvedTheme,
      'data-density': resolvedDensity,
      'data-accent': accent,
      style: computed(() => `--accent: ${accent.value}; --on-accent: ${onAccent.value};`),
    },
  })
})