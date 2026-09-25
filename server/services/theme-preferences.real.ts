import { eq } from 'drizzle-orm'
import type {
  IThemePreferencesService,
  ThemePreferences,
  ThemePreferencesUpdateInput,
} from '../../shared/contracts/theme-preferences'
import { ThemePreferencesUpdateInputSchema } from '../../shared/contracts/theme-preferences'
import { getDb } from '../db/client'
import { userPrefs } from '../db/schema/user_prefs'
import { SYSTEM_USER_ID, type TenantResolver } from './_tenant'

export class RealThemePreferencesService implements IThemePreferencesService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private currentUserId(): string {
    const userId = this.tenantResolver?.()?.userId
    if (!userId || userId === SYSTEM_USER_ID) throw new Error('Authentication required')
    return userId
  }

  async getCurrent(): Promise<ThemePreferences> {
    const userId = this.currentUserId()
    const [row] = await getDb().select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1)
    return row
      ? { userId: row.userId, theme: row.theme, density: row.density, saved: true, updatedAt: row.updatedAt.toISOString() }
      : { userId, theme: 'system', density: 'auto', saved: false, updatedAt: null }
  }

  async updateCurrent(input: ThemePreferencesUpdateInput): Promise<ThemePreferences> {
    const parsed = ThemePreferencesUpdateInputSchema.parse(input)
    const userId = this.currentUserId()
    const db = getDb()
    const [before] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1)
    const [row] = await db
      .insert(userPrefs)
      .values({
        userId,
        theme: parsed.theme ?? before?.theme ?? 'system',
        density: parsed.density ?? before?.density ?? 'auto',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPrefs.userId,
        set: {
          ...(parsed.theme !== undefined ? { theme: parsed.theme } : {}),
          ...(parsed.density !== undefined ? { density: parsed.density } : {}),
          updatedAt: new Date(),
        },
      })
      .returning()
    return { userId: row!.userId, theme: row!.theme, density: row!.density, saved: true, updatedAt: row!.updatedAt.toISOString() }
  }
}