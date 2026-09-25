import { computeOnAccent } from '~~/shared/utils/theme'
import type { DensityPreference, ThemePreference } from '~~/shared/contracts/theme-preferences'

const THEME_STORAGE = 'bulwark.theme'
const DENSITY_STORAGE = 'bulwark.density'

function normalizeHex(color: string): string {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(color)
  if (!match) return '#0F766E'
  const hex = match[1]!
  return hex.length === 3 ? `#${[...hex].map((channel) => channel + channel).join('')}` : `#${hex}`
}

export default defineNuxtPlugin(async () => {
  const { theme, density, systemTheme, resolvedTheme, resolvedDensity } = useTheme()
  const accent = useState('bulwark.theme.accent', () => '#0F766E')
  const onAccent = useState('bulwark.theme.onAccent', () => '#FFFFFF')
  let storedTheme: ThemePreference | null = null
  let storedDensity: DensityPreference | null = null

  if (import.meta.client) {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    systemTheme.value = media.matches ? 'dark' : 'light'
    media.addEventListener('change', (event) => {
      systemTheme.value = event.matches ? 'dark' : 'light'
    })

    try {
      const themeValue = window.localStorage.getItem(THEME_STORAGE)
      const densityValue = window.localStorage.getItem(DENSITY_STORAGE)
      if (themeValue && ['light', 'dark', 'system'].includes(themeValue)) storedTheme = themeValue as ThemePreference
      if (densityValue && ['comfortable', 'compact', 'touch', 'auto'].includes(densityValue)) storedDensity = densityValue as DensityPreference
    } catch {
      // Storage can be disabled by browser policy; cookies still provide SSR state.
    }
  }

  let preferencesSaved = false
  try {
    const { session, ensureLoaded } = useSession()
    await ensureLoaded()
    if (session.value?.userId) {
      const preferences = await useService('themePreferences').getCurrent()
      preferencesSaved = preferences.saved
      if (preferences.saved) {
        theme.value = preferences.theme
        density.value = preferences.density
        if (import.meta.client) {
          try {
            window.localStorage.setItem(THEME_STORAGE, preferences.theme)
            window.localStorage.setItem(DENSITY_STORAGE, preferences.density)
          } catch { /* Cookie + database remain the persisted sources. */ }
        }
      } else if (import.meta.client && (storedTheme || storedDensity)) {
        if (storedTheme) theme.value = storedTheme
        if (storedDensity) density.value = storedDensity
        await useService('themePreferences').updateCurrent({
          ...(storedTheme ? { theme: storedTheme } : {}),
          ...(storedDensity ? { density: storedDensity } : {}),
        })
      }
    }
    const organizationId = session.value?.activeOrganizationId
    if (organizationId) {
      const branding = await useService('label').getBranding(organizationId)
      accent.value = normalizeHex(branding.accentColor)
      onAccent.value = branding.onAccent
    }
  } catch {
    // Theme defaults must not prevent a route from rendering.
  }

  if (import.meta.client && !preferencesSaved) {
    if (storedTheme) theme.value = storedTheme
    if (storedDensity) density.value = storedDensity
  }

  const computedOnAccent = computed(() => onAccent.value || computeOnAccent(normalizeHex(accent.value)))
  useHead({
    htmlAttrs: {
      'data-theme': theme,
      'data-resolved-theme': resolvedTheme,
      'data-density': resolvedDensity,
      'data-accent': accent,
      style: computed(() => `--accent: ${accent.value}; --on-accent: ${computedOnAccent.value};`),
    },
    meta: [{ name: 'theme-color', content: accent }],
  })
})