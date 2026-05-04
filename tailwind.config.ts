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
        // Brand
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          light: 'rgb(var(--color-primary-light) / <alpha-value>)',
        },

        // Surfaces & structure
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
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

        // Semantic / status (STYLE_GUIDE §2.3)
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          light: 'rgb(var(--color-success-light) / <alpha-value>)',
          dark: 'rgb(var(--color-success-dark) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          light: 'rgb(var(--color-warning-light) / <alpha-value>)',
        },
        error: {
          DEFAULT: 'rgb(var(--color-error) / <alpha-value>)',
          light: 'rgb(var(--color-error-light) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          light: 'rgb(var(--color-info-light) / <alpha-value>)',
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
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
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
        DEFAULT: '8px',
        card: '12px',
        pill: '9999px',
      },

      // ----------------------------------------------------------------------
      // Box shadows — STYLE_GUIDE §6.3 (subtle, never dramatic)
      // ----------------------------------------------------------------------
      boxShadow: {
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
      },
      minHeight: {
        'tap': '48px', // STYLE_GUIDE §6.1 — gloved-hand minimum
      },
    },
  },

  plugins: [],
}

export default config
