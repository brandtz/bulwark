// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['demo/**', 'boilerplate/**', '.nuxt/**', '.output/**', 'dist/**'],
  },
)
