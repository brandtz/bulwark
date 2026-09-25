import { z } from 'zod'
import { UuidSchema } from './_shared'

export const ThemePreferenceSchema = z.enum(['light', 'dark', 'system'])
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>

export const DensityPreferenceSchema = z.enum(['comfortable', 'compact', 'touch', 'auto'])
export type DensityPreference = z.infer<typeof DensityPreferenceSchema>

export const ThemePreferencesSchema = z.object({
  userId: UuidSchema,
  theme: ThemePreferenceSchema,
  density: DensityPreferenceSchema,
  saved: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
})
export type ThemePreferences = z.infer<typeof ThemePreferencesSchema>

export const ThemePreferencesUpdateInputSchema = z.object({
  theme: ThemePreferenceSchema.optional(),
  density: DensityPreferenceSchema.optional(),
}).refine((input) => input.theme !== undefined || input.density !== undefined, {
  message: 'Set at least one theme preference',
})
export type ThemePreferencesUpdateInput = z.infer<typeof ThemePreferencesUpdateInputSchema>

export interface IThemePreferencesService {
  getCurrent(): Promise<ThemePreferences>
  updateCurrent(input: ThemePreferencesUpdateInput): Promise<ThemePreferences>
}