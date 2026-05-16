/**
 * server/api/health.get.ts — liveness probe (W3-5 / EH-Q / ADR-0034).
 *
 * Liveness checks are cheap — they confirm the process is up. Readiness
 * (DB connectivity, downstream deps) lives at `/api/ready`. Public so
 * Render/Netlify uptime monitors don't need a service token.
 */
const STARTED_AT = Date.now()

export default defineEventHandler(() => {
  return {
    status: 'ok',
    version: process.env.BULWARK_VERSION ?? 'dev',
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
  }
})
