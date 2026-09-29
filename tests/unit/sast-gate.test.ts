/**
 * tests/unit/sast-gate.test.ts — WP-L07 S5: the SAST rules in eslint.config.mjs
 * really fail on planted violations (so the lint gate is not silently empty),
 * and the regex rewrites they forced keep their meaning.
 */
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import tsParser from '@typescript-eslint/parser'
import security from 'eslint-plugin-security'
import { SECURITY_RULES } from '../../eslint.config.mjs'
import { TradeCreateInputSchema } from '../../shared/contracts/trade'
import { sectionBase } from '../../shared/utils/inspection-evaluator'
import { buildLikePatternForYear } from '../../shared/utils/numbering'
import { decodeDataUrl } from '../../server/services/storage/backfill'

async function lintText(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{ files: ['**/*.ts'], languageOptions: { parser: tsParser }, plugins: { security }, rules: SECURITY_RULES }],
  })
  const [result] = await eslint.lintText(code, { filePath: 'planted.ts' })
  return result!.messages.map((m) => m.ruleId)
}

describe('SAST lint gate', () => {
  it('flags planted violations', async () => {
    expect(await lintText('export const f = (s: string) => eval(s)')).toContain('security/detect-eval-with-expression')
    expect(await lintText("import cp from 'node:child_process'\nexport const g = (c: string) => cp.exec(c)")).toContain('security/detect-child-process')
    expect(await lintText('export const r = /^(a+)+$/')).toContain('security/detect-unsafe-regex')
    expect(await lintText('export const b = (n: number) => new Buffer(n)')).toContain('security/detect-new-buffer')
  })

  it('passes clean code', async () => {
    expect(await lintText('export const ok = (a: number) => a + 1')).toEqual([])
  })
})

describe('regex rewrites keep their meaning', () => {
  const slug = (s: string) => TradeCreateInputSchema.shape.slug.safeParse(s).success

  it('slugs: runs of [a-z0-9] joined by single - or _', () => {
    for (const ok of ['roofing', 'hvac-2', 'fire_safety', 'a-b_c', 'x']) expect(slug(ok), ok).toBe(true)
    for (const bad of ['', '-a', 'a-', '_a', 'a_', 'a--b', 'a-_b', 'A', 'a b', 'a.b']) expect(slug(bad), bad).toBe(false)
  })

  it('sectionBase strips only a trailing -<digits>', () => {
    expect(sectionBase('roof')).toBe('roof')
    expect(sectionBase('roof-2')).toBe('roof')
    expect(sectionBase('roof-deck-12')).toBe('roof-deck')
    expect(sectionBase('roof-deck')).toBe('roof-deck')
    expect(sectionBase('roof-')).toBe('roof-')
    expect(sectionBase('-3')).toBe('-3')
  })

  it('numbering LIKE pattern replaces {seq} and {seq:N}', () => {
    expect(buildLikePatternForYear('Q-{year}-{seq:4}', 2026)).toBe('Q-2026-%')
    expect(buildLikePatternForYear('WO{seq}', 2026)).toBe('WO%')
  })

  it('decodeDataUrl parses base64 and percent-encoded payloads', () => {
    expect(decodeDataUrl('data:image/png;base64,AQID')).toEqual({ contentType: 'image/png', body: Buffer.from([1, 2, 3]) })
    expect(decodeDataUrl('  data:text/plain;charset=utf-8,hi%20there')).toEqual({ contentType: 'text/plain', body: Buffer.from('hi there') })
    expect(decodeDataUrl('data:,x')).toEqual({ contentType: 'text/plain', body: Buffer.from('x') })
    expect(decodeDataUrl('https://example.com/x.png')).toBeNull()
    expect(decodeDataUrl('data:image/png;base64')).toBeNull()
  })
})
