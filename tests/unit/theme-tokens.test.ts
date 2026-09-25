/**
 * Additive Jobsite contract: compile actual Tailwind CSS, not config snapshots.
 * Explicit legacy expectations protect opacity, responsive widths and typography.
 * Token checks use tracked runtime CSS only; ignored design returns are not test
 * fixtures. Browser cascade/computed styles are covered by theme.spec.ts.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'

type TailwindPlugin = Extract<ReturnType<typeof tailwind>, { postcssPlugin: string }>
type Postcss = Parameters<NonNullable<TailwindPlugin['Once']>>[1]['postcss']
type Root = ReturnType<Postcss['parse']>
const require = createRequire(import.meta.url)
const postcss: Postcss = createRequire(require.resolve('tailwindcss'))('postcss')
const tokens = postcss.parse(readFileSync(new URL('../../app/assets/css/jobsite-tokens.css', import.meta.url), 'utf8'))
const legacy = postcss.parse(readFileSync(new URL('../../app/assets/css/tokens.css', import.meta.url), 'utf8'))

function declarations(root: Root, selector: string) {
  const values: Record<string, string> = {}
  root.walkRules((rule) => {
    if (rule.selectors.includes(selector)) rule.walkDecls((decl) => { values[decl.prop] = decl.value })
  })
  return values
}

async function compile(classes: string) {
  return (await postcss([tailwind({ ...config, content: [{ raw: classes, extension: 'html' }] })])
    .process('@tailwind utilities;', { from: undefined })).root
}

describe('additive Jobsite utilities', () => {
  it('preserves legacy colors including alpha modifiers and semantic defaults', async () => {
    const aliases = {
      primary: 'primary', 'primary-700': 'primary-hover', surface: 'surface', 'surface-muted': 'background',
      background: 'background', sidebar: 'sidebar', success: 'success', warning: 'warning', error: 'error',
      info: 'info', 'status-success': 'success', 'status-warning': 'warning', 'status-error': 'error',
      'status-info': 'info', purple: 'purple', blocked: 'blocked',
    }
    const css = await compile(Object.keys(aliases).flatMap((name) => [`bg-${name}`, `bg-${name}/50`]).join(' ')
      + ' text-text-primary/75 border-border/25 ring-primary/50 bg-slate-50 bg-neutral-950')
    for (const [name, variable] of Object.entries(aliases)) {
      expect(declarations(css, `.bg-${name}`)['background-color']).toBe(`rgb(var(--color-${variable}) / var(--tw-bg-opacity, 1))`)
      expect(declarations(css, `.bg-${name}\\/50`)['background-color']).toBe(`rgb(var(--color-${variable}) / 0.5)`)
      expect(declarations(legacy, ':root')[`--color-${variable}`]).toMatch(/^\d+ \d+ \d+$/)
    }
    expect(declarations(css, '.text-text-primary\\/75').color).toBe('rgb(var(--color-text-primary) / 0.75)')
    expect(declarations(css, '.border-border\\/25')['border-color']).toBe('rgb(var(--color-border) / 0.25)')
    expect(declarations(css, '.ring-primary\\/50')['--tw-ring-color']).toBe('rgb(var(--color-primary) / 0.5)')
    expect(declarations(css, '.bg-slate-50')['background-color']).toContain('248 250 252')
    expect(declarations(css, '.bg-neutral-950')['background-color']).toContain('10 10 10')
  })

  it('preserves default breakpoints, widths, type, fonts and radius', async () => {
    const css = await compile('sm:w-1/2 md:w-1/2 lg:w-1/2 xl:w-1/2 2xl:w-1/2 w-sidebar w-sidebar-collapsed text-xs text-sm text-base text-body text-display font-sans font-mono rounded rounded-sm rounded-md rounded-lg rounded-card')
    const media: string[] = []
    css.walkAtRules('media', (rule) => { media.push(rule.params) })
    expect(media).toEqual([640, 768, 1024, 1280, 1536].map((width) => `(min-width: ${width}px)`))
    for (const [name, value] of Object.entries({ xs: '0.75rem', sm: '0.875rem', base: '1rem', body: '0.875rem', display: '1.5rem' })) {
      expect(declarations(css, `.text-${name}`)['font-size']).toBe(value)
    }
    expect(declarations(css, '.w-sidebar').width).toBe('240px')
    expect(declarations(css, '.w-sidebar-collapsed').width).toBe('64px')
    expect(declarations(css, '.font-sans')['font-family']).toBe('var(--font-body)')
    expect(declarations(css, '.font-mono')['font-family']).toContain('ui-monospace')
    expect(declarations(css, '.font-mono')['font-family']).not.toContain('var(')
    for (const [suffix, value] of Object.entries({ '': '8px', '-sm': '0.125rem', '-md': '0.375rem', '-lg': '0.5rem', '-card': '12px' })) {
      expect(declarations(css, `.rounded${suffix}`)['border-radius']).toBe(value)
    }
  })

  it('generates new colors without wrapping hex properties in rgb()', async () => {
    const cases = {
      'bg-page': ['background-color', '--bg-page'], 'bg-card': ['background-color', '--bg-card'],
      'text-ink': ['color', '--text-primary'], 'bg-accent': ['background-color', '--accent'],
      'text-accent-on': ['color', '--on-accent'], 'bg-hue-bg': ['background-color', '--hue-bg'],
      'text-hue-fg': ['color', '--hue-fg'], 'border-hue-border': ['border-color', '--hue-border'],
      'bg-success-bg': ['background-color', '--success-bg'], 'text-warning-fg': ['color', '--warning-fg'],
      'text-danger': ['color', '--danger-fg'], 'border-info-border': ['border-color', '--info-border'],
      'bg-status-blue-bg': ['background-color', '--status-blue-bg'],
      'bg-jobsite-neutral-950': ['background-color', '--neutral-950'],
    }
    const css = await compile(Object.keys(cases).join(' '))
    for (const [name, [property, variable]] of Object.entries(cases)) {
      expect(declarations(css, `.${name}`)[property!]).toBe(`var(${variable})`)
    }
    expect(css.toString()).not.toContain('rgb(var(')
  })

  it('exposes named typography, design radii and density without replacing defaults', async () => {
    const css = await compile('font-display font-body font-jobsite-mono text-jobsite-label text-jobsite-sm rounded-jobsite-lg h-control py-row-y px-row-x p-card gap-gap min-h-jobsite-touch')
    expect(declarations(css, '.font-body')['font-family']).toBe('var(--font-body)')
    expect(declarations(css, '.font-display')['font-family']).toBe('var(--font-display)')
    expect(declarations(css, '.font-jobsite-mono')['font-family']).toBe('var(--font-mono)')
    expect(declarations(css, '.text-jobsite-label')['letter-spacing']).toBe('0')
    expect(declarations(css, '.text-jobsite-sm')['font-size']).toBe('var(--text-sm)')
    expect(declarations(css, '.rounded-jobsite-lg')['border-radius']).toBe('var(--radius-lg)')
    expect(declarations(css, '.h-control').height).toBe('var(--control-h)')
    expect(declarations(css, '.p-card').padding).toBe('var(--card-p)')
    expect(declarations(css, '.py-row-y')['padding-top']).toBe('var(--row-py)')
    expect(declarations(css, '.px-row-x')['padding-left']).toBe('var(--row-px)')
    expect(declarations(css, '.gap-gap').gap).toBe('var(--gap)')
    expect(declarations(css, '.min-h-jobsite-touch')['min-height']).toBe('var(--touch-min)')
  })
})

describe('runtime token contract', () => {
  it('contains only custom properties, no global styling, legacy overrides or design imports', () => {
    tokens.walkDecls((decl) => {
      expect(decl.prop).toMatch(/^--/)
      expect(decl.prop).not.toMatch(/^--color-/)
    })
    expect(tokens.nodes.every((node) => node.type === 'rule' || node.type === 'comment')).toBe(true)
    const main = readFileSync(new URL('../../app/assets/css/main.css', import.meta.url), 'utf8')
    expect(main).toContain("@import './jobsite-tokens.css'")
    expect(main).not.toContain('design-return')
    const oldValues = declarations(legacy, ':root')
    for (const property of Object.keys(declarations(tokens, ':root'))) expect(oldValues).not.toHaveProperty(property)
  })

  it('defines light/dark surfaces, fixed state colors, zero tracking and design radii', () => {
    expect(declarations(tokens, ':root')).toMatchObject({
      '--bg-page': 'var(--neutral-50)', '--bg-card': 'var(--neutral-0)', '--neutral-50': '#F5F7F8',
      '--text-primary': 'var(--neutral-950)', '--neutral-950': '#161B22', '--accent': '#0F766E',
      '--on-accent': '#FFFFFF', '--success-bg': '#EAF4EE', '--tracking-tight': '0', '--tracking-wide': '0',
      '--radius-sm': '6px', '--radius-md': '10px', '--radius-lg': '16px',
    })
    expect(declarations(tokens, '[data-theme="dark"]')).toMatchObject({
      '--bg-page': 'var(--neutral-950)', '--bg-card': 'var(--neutral-900)',
      '--text-primary': 'var(--neutral-50)', '--success-bg': '#12301F', '--selection-weight': '18%',
    })
    const accent = declarations(tokens, '[data-accent]')
    for (const property of ['--bg-page', '--bg-card', '--control-h', '--neutral-950', '--accent', '--on-accent']) {
      expect(accent).not.toHaveProperty(property)
    }
    expect(accent['--bg-selected']).toContain('var(--selection-weight)')
  })

  it.each([
    ['comfortable', '40px', '32px', '48px', '12px', '24px', '40px'],
    ['compact', '32px', '28px', '40px', '8px', '16px', '32px'],
    ['touch', '48px', '44px', '56px', '16px', '20px', '48px'],
  ])('defines %s density independently of theme/accent', (density, height, small, large, row, card, touch) => {
    expect(declarations(tokens, `[data-density="${density}"]`)).toMatchObject({
      '--control-h': height, '--control-h-sm': small, '--control-h-lg': large,
      '--row-py': row, '--card-p': card, '--touch-min': touch,
    })
  })

  it('binds all twelve pipeline hues to theme-specific state properties', () => {
    const hues = ['slate', 'blue', 'indigo', 'violet', 'teal', 'green', 'lime', 'amber', 'orange', 'red', 'pink', 'gray']
    for (const hue of hues) {
      for (const part of ['bg', 'fg', 'border']) {
        const variable = `--status-${hue}-${part}`
        expect(declarations(tokens, `[data-hue="${hue}"]`)[`--hue-${part}`]).toBe(`var(${variable})`)
        expect(declarations(tokens, ':root')[variable]).toMatch(/^#[0-9A-F]{6}$/)
        expect(declarations(tokens, '[data-theme="dark"]')[variable]).toMatch(/^#[0-9A-F]{6}$/)
        expect(declarations(tokens, '[data-theme="dark"]')[variable]).not.toBe(declarations(tokens, ':root')[variable])
      }
    }
  })
})