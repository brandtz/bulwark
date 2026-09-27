/**
 * server/plugins/env-guard.ts — evaluate production configuration at boot
 * (WP-L07 S4). Rules and enforcement mode: server/utils/env-guard.ts.
 */
import { assertProductionEnv, evaluateProductionEnv, runtimeGuardEnv } from '../utils/env-guard'
import { log } from '../utils/logger'

export default defineNitroPlugin(() => {
  const env = runtimeGuardEnv()
  const report = evaluateProductionEnv(env)
  for (const finding of report.critical) log('error', 'config.unsafe', { finding })
  for (const finding of report.warnings) log('warn', 'config.degraded', { finding })
  assertProductionEnv(env, report)
})
