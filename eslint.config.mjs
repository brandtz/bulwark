// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
// @ts-expect-error eslint-plugin-security ships no type declarations
import security from 'eslint-plugin-security'

/**
 * SAST (WP-L07 S5): eslint-plugin-security, limited to the high-signal rules so
 * every hit is worth fixing. Noisy heuristics (object-injection, non-literal
 * fs/regexp, timing-attack guesses) stay off; secrets are compared with
 * timingSafeEqual by convention. tests/unit/sast-gate.test.ts proves a planted
 * violation fails lint.
 */
/** @type {import('eslint').Linter.RulesRecord} */
export const SECURITY_RULES = {
  'security/detect-eval-with-expression': 'error',
  'security/detect-non-literal-require': 'error',
  'security/detect-child-process': 'error',
  'security/detect-unsafe-regex': 'error',
  'security/detect-buffer-noassert': 'error',
  'security/detect-new-buffer': 'error',
  'security/detect-pseudoRandomBytes': 'error',
  'security/detect-disable-mustache-escape': 'error',
  'security/detect-no-csrf-before-method-override': 'error',
  'security/detect-bidi-characters': 'error',
}

export default withNuxt(
  {
    ignores: ['demo/**', 'boilerplate/**', '.nuxt/**', '.output/**', 'dist/**', 'agents/design/**', 'agents/codegraph/**'],
  },
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', 'app/**/*.ts', 'app/**/*.vue'],
    plugins: { security },
    rules: SECURITY_RULES,
  },
)
