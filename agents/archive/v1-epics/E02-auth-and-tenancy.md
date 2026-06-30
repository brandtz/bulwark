# Epic E2 — Auth Foundation + Tenant Firewall

> **Phase**: 1 | **Build order**: 3rd | **Depends on**: E0, E1

## Objective

Implement real (mock-backed) auth so every subsequent screen can rely on
`useAuth()` returning a `SessionUser` with `userId`, `organizationId`,
`organizationRole`, `isSuperAdmin`. Build the auth pages and the tenant firewall.

## In Scope

- `app/pages/login.vue` — replaces demo login
- `app/pages/forgot-password.vue`, `reset-password.vue`, `accept-invite.vue` (AUTH-02 / 03 / 04)
- `app/pages/org-switcher.vue` (AUTH-05) — for super_admin and multi-org users
- `app/middleware/auth.global.ts` — redirects unauthed → `/login?next=…`
- `app/composables/useAuth.ts` — wraps `nuxt-auth-utils`; backed by mock auth in E0–E10
- `shared/contracts/auth.ts` — login, refresh, invite Zod schemas
- `shared/mocks/MockAuthService.ts` — issues mock sessions for the four demo personas
- Error pages: `app/pages/[...slug].vue` (404), `403.vue`, `500.vue` (ERR-01/02/03)
- `app/composables/usePermissions.ts` upgraded from stub to real role check

## Out of Scope

- Real JOSE-signed JWT issuance (E11)
- Real password hashing / bcrypt (E11)
- API key issuance UI (E9)

## Dependencies

E0 (contracts), E1 (AppLayout, form primitives).

## Risks

- Mock auth tempts shortcuts that won't survive E11. Mitigation: `MockAuthService` implements the **same** interface `RealAuthService` will, with the same Zod-validated returns.

## Stories

| ID | Title | Visible delta |
|---|---|---|
| E2-S1 | `useAuth` composable + session cookie roundtrip (mock backend) | login form posts, sets cookie, page reloads as authed |
| E2-S2 | Login page wired to `useAuth.login()` + `?next=` redirect | sponsor can log in as any of 4 personas |
| E2-S3 | Forgot / reset / accept-invite flows (mock email link) | flows are walkable end-to-end |
| E2-S4 | `auth.global.ts` middleware + role-aware route guards | unauthed → /login, wrong-role → /403 |
| E2-S5 | Org switcher page + top-bar widget | super_admin can pick a tenant; selection persists in session |
| E2-S6 | 404 / 403 / 500 error pages styled to design system | hitting an unknown route renders friendly 404 |
| E2-S7 | Tenant firewall scaffold in `MockServiceFactory` — every mock service receives `{userId, organizationId}` and rejects cross-tenant requests | unit test proves cross-tenant request throws |
| E2-S8 | **Playwright matrix** — login each persona, verify only allowed routes return 200 | green spec |

## Approval Status

Proposed.
