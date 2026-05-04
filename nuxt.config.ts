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
    '@pinia/nuxt',
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
  ],

  // -------------------------------------------------------------------------
  // Runtime config — anything that varies by environment goes here
  // -------------------------------------------------------------------------
  runtimeConfig: {
    // Server-only (never exposed to client)
    sessionPassword: process.env.NUXT_SESSION_PASSWORD || 'dev-only-32char-min-replace-in-env',
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || '',

    public: {
      // Exposed to the client. ADR-0004: this flag flips mock vs real services.
      backend: process.env.BULWARK_BACKEND || 'mock',
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
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Wildfire retrofit operations and compliance platform.' },
      ],
      link: [
        // Inter font matches STYLE_GUIDE §3.1 — single font, no marketing display face
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Nitro — server engine config
  // -------------------------------------------------------------------------
  nitro: {
    // E11 wires real DB. For now Nitro just serves the SSR app.
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
