/**
 * tailwind.config.ts — Bulwark
 *
 * What this file does:
 *   - Maps every CSS variable in app/assets/css/tokens.css to a Tailwind token
 *     so utilities like `bg-surface`, `text-primary`, `border-border-focus`
 *     produce the correct color/spacing.
 *   - Extends the type scale to match BULWARK_STYLE_GUIDE.md §3.2.
 *
 * Decisions captured here:
 *   - ADR-0005: tokens are the only source of truth for color. Hex colors
 *     outside tokens.css are forbidden — enforced by ESLint rule in E0-S8.
 *   - We override the default Tailwind palette intentionally; we keep its
 *     spacing scale because STYLE_GUIDE §4 happens to align with it.
 *
 * Decisions NOT taken (and why):
 *   - We did NOT adopt Tailwind v4 / oxide. v4 is fast but its config
 *     surface changed enough that the rest of the agentic team's templates
 *     still target v3. Revisit at Phase 2.
 *   - We did NOT use @tailwindcss/forms — Bulwark's form primitives are
 *     fully custom (UI-CONTRACTS.md), so the plugin would fight us.
 */
import type { Config } from 'tailwindcss'

const jobsiteRamp = (name: string) => Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [step, `var(--${name}-${step})`]),
)
const jobsiteSemantic = (name: string) => Object.fromEntries(
  ['fg', 'bg', 'border', 'strong'].map((part) => [part, `var(--${name}-${part})`]),
)

const config: Config = {
  content: [
    './app/**/*.{vue,ts,tsx}',
    './shared/**/*.{ts,vue}',
    // Pages live under app/pages but explicitly listed for clarity:
    './app/pages/**/*.vue',
    './app/layouts/**/*.vue',
    './app/components/**/*.vue',
  ],

  theme: {
    extend: {
      // ----------------------------------------------------------------------
      // Color tokens — straight port of BULWARK_STYLE_GUIDE.md §2.
      // We reference CSS variables so that future theming (dark mode, per-
      // tenant brand color) only needs to update tokens.css.
      // ----------------------------------------------------------------------
      colors: {
        accent: { DEFAULT: 'var(--accent)', on: 'var(--on-accent)', ...jobsiteRamp('accent') },
        'jobsite-neutral': { 0: 'var(--neutral-0)', ...jobsiteRamp('neutral') },
        page: 'var(--bg-page)',
        card: 'var(--bg-card)',
        raised: 'var(--bg-raised)',
        sunken: 'var(--bg-sunken)',
        hover: 'var(--bg-hover)',
        selected: 'var(--bg-selected)',
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        ink: {
          DEFAULT: 'var(--text-primary)', secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)', inverse: 'var(--text-inverse)', link: 'var(--text-link)',
        },
        shell: {
          DEFAULT: 'var(--shell-bg)', hover: 'var(--shell-hover)', active: 'var(--shell-active)',
          text: 'var(--shell-text)', 'text-active': 'var(--shell-text-active)', border: 'var(--shell-border)',
        },
        hue: { bg: 'var(--hue-bg)', fg: 'var(--hue-fg)', border: 'var(--hue-border)' },
        danger: { DEFAULT: 'var(--danger-fg)', ...jobsiteSemantic('danger') },
        // Brand
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          light: 'rgb(var(--color-primary-light) / <alpha-value>)',
          // Numeric scale alias so `bg-primary-700` compiles to the brand
          // hover color. We keep `primary-hover` as the semantic name and
          // `primary-700` as the convenient legacy alias.
          700: 'rgb(var(--color-primary-hover) / <alpha-value>)',
        },

        // Surfaces & structure
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          // `surface-muted` = the page background under cards. Maps to the
          // same value as the page `background` token; the alias exists so
          // primitives can say "I want a subtly recessed surface" without
          // referencing the `background` token (which reads weird at use
          // sites like `bg-background` inside a card).
          muted: 'rgb(var(--color-background) / <alpha-value>)',
        },
        sidebar: 'rgb(var(--color-sidebar) / <alpha-value>)',
        'sidebar-text': 'rgb(var(--color-sidebar-text) / <alpha-value>)',
        'sidebar-active': 'rgb(var(--color-sidebar-active) / <alpha-value>)',
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          focus: 'rgb(var(--color-border-focus) / <alpha-value>)',
        },

        // Text
        text: {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          disabled: 'rgb(var(--color-text-disabled) / <alpha-value>)',
        },

        // Semantic / status (STYLE_GUIDE §2.3) — both flat and namespaced
        // forms exposed. `bg-success` for direct use; `bg-status-success`
        // for the longer "status badge" reading. Both compile.
        success: {
          ...jobsiteSemantic('success'),
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          light: 'rgb(var(--color-success-light) / <alpha-value>)',
          dark: 'rgb(var(--color-success-dark) / <alpha-value>)',
        },
        warning: {
          ...jobsiteSemantic('warning'),
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          light: 'rgb(var(--color-warning-light) / <alpha-value>)',
        },
        error: {
          DEFAULT: 'rgb(var(--color-error) / <alpha-value>)',
          light: 'rgb(var(--color-error-light) / <alpha-value>)',
        },
        info: {
          ...jobsiteSemantic('info'),
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          light: 'rgb(var(--color-info-light) / <alpha-value>)',
        },
        status: {
          ...Object.fromEntries(
            ['slate', 'blue', 'indigo', 'violet', 'teal', 'green', 'lime', 'amber', 'orange', 'red', 'pink', 'gray']
              .map((hue) => [hue, Object.fromEntries(
                ['bg', 'fg', 'border'].map((part) => [part, `var(--status-${hue}-${part})`]),
              )]),
          ),
          success: 'rgb(var(--color-success) / <alpha-value>)',
          warning: 'rgb(var(--color-warning) / <alpha-value>)',
          error: 'rgb(var(--color-error) / <alpha-value>)',
          info: 'rgb(var(--color-info) / <alpha-value>)',
        },
        purple: {
          DEFAULT: 'rgb(var(--color-purple) / <alpha-value>)',
          light: 'rgb(var(--color-purple-light) / <alpha-value>)',
        },
        blocked: {
          DEFAULT: 'rgb(var(--color-blocked) / <alpha-value>)',
          light: 'rgb(var(--color-blocked-light) / <alpha-value>)',
        },
      },

      // ----------------------------------------------------------------------
      // Typography — STYLE_GUIDE §3.2
      // ----------------------------------------------------------------------
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        'jobsite-mono': ['var(--font-mono)'],
        sans: ['var(--font-body)'],
      },
      fontSize: {
        'jobsite-xs': ['var(--text-xs)', { lineHeight: '1.5', letterSpacing: '0' }],
        'jobsite-sm': ['var(--text-sm)', { lineHeight: '1.5', letterSpacing: '0' }],
        'jobsite-md': ['var(--text-md)', { lineHeight: '1.5', letterSpacing: '0' }],
        'jobsite-lg': ['var(--text-lg)', { lineHeight: '1.5', letterSpacing: '0' }],
        'jobsite-xl': ['var(--text-xl)', { lineHeight: '1.35', letterSpacing: '0' }],
        'jobsite-2xl': ['var(--text-2xl)', { lineHeight: '1.35', letterSpacing: '0' }],
        'jobsite-3xl': ['var(--text-3xl)', { lineHeight: '1.2', letterSpacing: '0' }],
        'jobsite-4xl': ['var(--text-4xl)', { lineHeight: '1.2', letterSpacing: '0' }],
        'jobsite-label': ['var(--text-xs)', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '600' }],
        // [size, { lineHeight, weight }]
        tiny:        ['0.6875rem', { lineHeight: '1.3', fontWeight: '500' }], // 11px
        small:       ['0.75rem',   { lineHeight: '1.4', fontWeight: '400' }], // 12px
        body:        ['0.875rem',  { lineHeight: '1.5', fontWeight: '400' }], // 14px
        'body-strong': ['0.875rem',{ lineHeight: '1.5', fontWeight: '600' }], // 14px
        subheading:  ['1rem',      { lineHeight: '1.4', fontWeight: '600' }], // 16px
        heading:     ['1.25rem',   { lineHeight: '1.3', fontWeight: '600' }], // 20px
        display:     ['1.5rem',    { lineHeight: '1.2', fontWeight: '700' }], // 24px
      },

      // ----------------------------------------------------------------------
      // Border radius — STYLE_GUIDE §6 (cards 12, inputs 8, badges full)
      // ----------------------------------------------------------------------
      borderRadius: {
        'jobsite-sm': 'var(--radius-sm)',
        'jobsite-md': 'var(--radius-md)',
        'jobsite-lg': 'var(--radius-lg)',
        'jobsite-pill': 'var(--radius-pill)',
        DEFAULT: '8px',
        input: '8px',
        card: '12px',
        pill: '9999px',
      },

      // ----------------------------------------------------------------------
      // Box shadows — STYLE_GUIDE §6.3 (subtle, never dramatic)
      // ----------------------------------------------------------------------
      boxShadow: {
        'jobsite-1': 'var(--shadow-1)',
        'jobsite-2': 'var(--shadow-2)',
        'jobsite-3': 'var(--shadow-3)',
        'jobsite-focus': 'var(--focus-ring)',
        card: '0 1px 3px rgba(0,0,0,0.04)',
        'card-hover': '0 2px 8px rgba(0,0,0,0.08)',
        focus: '0 0 0 3px rgba(29,78,216,0.1)',
      },

      // ----------------------------------------------------------------------
      // Layout dimensions
      // ----------------------------------------------------------------------
      width: {
        sidebar: '240px',
        'sidebar-collapsed': '64px',
      },
      height: {
        'bottom-nav': '64px',
        'topbar': '56px',
        'input': '48px', // STYLE_GUIDE §6.2
      },
      // Custom spacing tokens — these flow through Tailwind's spacing scale
      // so utilities like `pb-bottom-nav`, `bottom-bottom-nav`,
      // `top-topbar` all compile.
      spacing: {
        control: 'var(--control-h)',
        'control-sm': 'var(--control-h-sm)',
        'control-lg': 'var(--control-h-lg)',
        'row-y': 'var(--row-py)',
        'row-x': 'var(--row-px)',
        card: 'var(--card-p)',
        gap: 'var(--gap)',
        'field-gap': 'var(--field-gap)',
        'jobsite-touch': 'var(--touch-min)',
        'drawer-md': 'var(--drawer-md)',
        'drawer-lg': 'var(--drawer-lg)',
        'bottom-nav': '64px',
        'topbar': '56px',
      },
      minHeight: {
        'tap': '48px', // STYLE_GUIDE §6.1 — gloved-hand minimum
      },
    },
  },

  plugins: [],
}

export default config
