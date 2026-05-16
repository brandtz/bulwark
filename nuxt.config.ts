/**
 * nuxt.config.ts — Bulwark production app
 *
 * What this file does:
 *   - Configures Nuxt 3 with TypeScript strict mode, Tailwind, Pinia, auth.
 *   - Points srcDir at app/ so the page/layout structure matches the layout
 *     in BUILD_PLAN.md §3.
 *   - Wires in tokens.css and main.css globally so design tokens are available
 *     everywhere without per-component imports.
 *
 * Decisions captured here:
 *   - ADR-0001: Nuxt 3 stack
 *   - ADR-0005: single AppLayout — see app/layouts/default.vue
 *   - We use srcDir: 'app' to mirror the canonical structure in BUILD_PLAN §3
 *     and to keep Nuxt's auto-imports scoped away from server/, shared/, tests/.
 *
 * Decisions NOT taken (and why):
 *   - We do NOT enable the experimental compatibilityDate beyond 2024-11-01
 *     to avoid surprise behavior shifts mid-build. Bump in E11 when wiring
 *     real backend.
 *   - We do NOT enable SPA mode globally — SSR is required for fast first
 *     paint per BULWARK_TECH §10 (<300ms page loads).
 *
 * Maintenance notes:
 *   - When adding a new module, also bump package.json devDependencies and
 *     document why in this file's header block.
 */
export default defineNuxtConfig({
  // -------------------------------------------------------------------------
  // Project source layout — mirrors BUILD_PLAN.md §3
  // -------------------------------------------------------------------------
  srcDir: 'app/',

  // -------------------------------------------------------------------------
  // Tooling versions — pin compatibility for predictable agent runs
  // -------------------------------------------------------------------------
  compatibilityDate: '2024-11-01',
  future: {
    compatibilityVersion: 4,
  },

  // -------------------------------------------------------------------------
  // TypeScript — strict mode is non-negotiable per CONVENTIONS.md
  // -------------------------------------------------------------------------
  typescript: {
    strict: true,
    typeCheck: false, // run via `pnpm typecheck` in CI; off in dev for speed
  },

  // -------------------------------------------------------------------------
  // Modules
  // -------------------------------------------------------------------------
  modules: [
    '@nuxtjs/tailwindcss',
    // '@pinia/nuxt' intentionally disabled (E2-S6): the @pinia/nuxt
    // payload plugin tries to call `obj.hasOwnProperty` on every payload
    // node, which throws on Nuxt's NuxtError objects (created with
    // Object.create(null)) and turns every 404 into a 500. We don't use
    // any Pinia stores yet — re-enable when the first store lands.
    'nuxt-auth-utils', // session cookie auth (ADR-0001 / TECH §5)
    '@nuxt/eslint',
  ],

  // -------------------------------------------------------------------------
  // Components — disable path-prefix so app/components/nav/AppSidebar.vue
  // registers as <AppSidebar />, not <NavAppSidebar />. The folders exist
  // for organization, not naming.
  // -------------------------------------------------------------------------
  components: [
    { path: '~/components', pathPrefix: false },
  ],

  // -------------------------------------------------------------------------
  // Global CSS — tokens load before main so utilities can reference them
  // -------------------------------------------------------------------------
  css: [
    '~/assets/css/tokens.css',
    '~/assets/css/main.css',
    // W2-6 / EH-L: global print stylesheet. Scoped to @media print so
    // it has zero impact on screen rendering.
    '~/assets/print.css',
  ],

  // -------------------------------------------------------------------------
  // Runtime config — anything that varies by environment goes here
  // -------------------------------------------------------------------------
  runtimeConfig: {
    // Server-only (never exposed to client)
    sessionPassword: process.env.NUXT_SESSION_PASSWORD || 'dev-only-32char-min-replace-in-env',
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || '',

    // nuxt-auth-utils session cookie config. Secure flag must be off
    // for local dev / Playwright (HTTP localhost); browsers drop Secure
    // cookies on non-HTTPS. Production overrides via NODE_ENV check.
    session: {
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        httpOnly: true,
      },
    },

    public: {
      // Exposed to the client. ADR-0004 introduced the flag; ADR-0015
      // (Phase 1 hardening / EH-C / D-H3) flipped the default from
      // `mock` to `real`. Mock services survive ONLY in unit/integration
      // tests; runtime defaults to the real Postgres + Drizzle backend.
      // Set BULWARK_BACKEND=mock as an explicit opt-in for offline
      // demos — it is no longer the implicit fallback.
      backend: process.env.BULWARK_BACKEND || 'real',
      appName: 'Bulwark',
    },
  },

  // -------------------------------------------------------------------------
  // App-level config — meta, head defaults
  // -------------------------------------------------------------------------
  app: {
    head: {
      title: 'Bulwark',
      titleTemplate: '%s · Bulwark',
      link: [
        // Inter font matches STYLE_GUIDE §3.1 — single font, no marketing display face
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
        // W3-3 / EH-M (ADR-0029) — PWA manifest for the field surface.
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Wildfire retrofit operations and compliance platform.' },
        // PWA theme — must match manifest.webmanifest theme_color.
        { name: 'theme-color', content: '#1d4ed8' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Bulwark' },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Nitro — server engine config
  // -------------------------------------------------------------------------
  nitro: {
    // E11 wires real DB. For now Nitro just serves the SSR app.
    //
    // Deploy preset: `vercel` when running on Vercel (auto-detected via the
    // VERCEL=1 env var Vercel injects in CI). Local `nuxt dev` and `nuxt
    // build` without that flag default to the node-server preset.
    preset: process.env.VERCEL ? 'vercel' : undefined,
    experimental: {
      tasks: true, // enables background tasks for async PDF generation (E7 / E11)
    },
  },

  // -------------------------------------------------------------------------
  // Vite — for now keep defaults. Tweak in E1 if bundle size needs trimming
  // (BULWARK_TECH §10 budget: <200KB initial JS gzipped).
  // -------------------------------------------------------------------------
  vite: {},
})
