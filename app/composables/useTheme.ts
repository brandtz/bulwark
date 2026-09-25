import type { DensityPreference, ThemePreference } from '~~/shared/contracts/theme-preferences'
export type { DensityPreference, ThemePreference } from '~~/shared/contracts/theme-preferences'

const THEME_COOKIE = 'bulwark.theme'
const DENSITY_COOKIE = 'bulwark.density'
const THEME_STORAGE = 'bulwark.theme'
const DENSITY_STORAGE = 'bulwark.density'

export function useTheme() {
  const theme = useCookie<ThemePreference>(THEME_COOKIE, {
    default: () => 'system',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  const density = useCookie<DensityPreference>(DENSITY_COOKIE, {
    default: () => 'auto',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  const systemTheme = useState<'light' | 'dark'>('bulwark.theme.system', () => 'light')
  const route = useRoute()
  const preferences = useService('themePreferences')

  const resolvedTheme = computed(() => theme.value === 'system' ? systemTheme.value : theme.value)
  const resolvedDensity = computed(() => {
    if (density.value !== 'auto') return density.value
    return /^\/(field|sub|homeowner|client|stakeholder)(\/|$)/u.test(route.path) ? 'touch' : 'comfortable'
  })

  function setTheme(value: ThemePreference): void {
    theme.value = value
    if (import.meta.client) {
      try { window.localStorage.setItem(THEME_STORAGE, value) } catch { /* Cookie remains the SSR fallback. */ }
      void preferences.updateCurrent({ theme: value }).catch(() => {})
    }
  }

  function setDensity(value: DensityPreference): void {
    density.value = value
    if (import.meta.client) {
      try { window.localStorage.setItem(DENSITY_STORAGE, value) } catch { /* Cookie remains the SSR fallback. */ }
      void preferences.updateCurrent({ density: value }).catch(() => {})
    }
  }

  return { theme, density, systemTheme, resolvedTheme, resolvedDensity, setTheme, setDensity }
}