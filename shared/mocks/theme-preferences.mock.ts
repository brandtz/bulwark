import type {
  IThemePreferencesService,
  ThemePreferences,
  ThemePreferencesUpdateInput,
} from '../contracts/theme-preferences'
import { ThemePreferencesUpdateInputSchema } from '../contracts/theme-preferences'
import type { TenantResolver } from './tenant'

const preferencesByUser = new Map<string, ThemePreferences>()

export class MockThemePreferencesService implements IThemePreferencesService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private userId(): string {
    const id = this.tenantResolver?.()?.userId
    if (!id) throw new Error('Authentication required')
    return id
  }

  async getCurrent(): Promise<ThemePreferences> {
    const userId = this.userId()
    return preferencesByUser.get(userId) ?? {
      userId,
      theme: 'system',
      density: 'auto',
      saved: false,
      updatedAt: null,
    }
  }

  async updateCurrent(input: ThemePreferencesUpdateInput): Promise<ThemePreferences> {
    const parsed = ThemePreferencesUpdateInputSchema.parse(input)
    const userId = this.userId()
    const current = await this.getCurrent()
    const preferences: ThemePreferences = {
      userId,
      theme: parsed.theme ?? current.theme,
      density: parsed.density ?? current.density,
      saved: true,
      updatedAt: new Date().toISOString(),
    }
    preferencesByUser.set(userId, preferences)
    return preferences
  }
}

export function __resetMockThemePreferencesForTests(): void {
  preferencesByUser.clear()
}