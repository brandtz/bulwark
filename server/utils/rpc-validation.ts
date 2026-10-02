/**
 * server/utils/rpc-validation.ts — RPC argument validation at the dispatcher
 * (WP-X4).
 *
 * `validateRpcArgs` checks positional args against server/utils/rpc-args.ts
 * and returns field-level issues ([] when valid). It only validates: the
 * service receives the caller's original args, so schema defaults and
 * key-stripping never change what a service sees. Services keep their own
 * invariants (tenant firewall, transitions, uniqueness) — this is the shape
 * check that keeps malformed input away from the database.
 */
import type { RpcIssue } from '~~/shared/utils/rpc-error'
import { RPC_ARGS, type ArgsRule } from './rpc-args'

export function rpcArgsRule(service: string, method: string): ArgsRule | undefined {
  return RPC_ARGS[service]?.[method]
}

export function validateRpcArgs(service: string, method: string, args: unknown[]): RpcIssue[] {
  const rule = rpcArgsRule(service, method)
  // Unclassified methods are refused by the policy before this runs, and the
  // coverage test keeps the two maps aligned.
  if (!rule || rule.kind === 'skip') return []
  const issues: RpcIssue[] = []
  if (args.length > rule.items.length) {
    issues.push({ arg: rule.items.length, path: [], message: `Expected at most ${rule.items.length} argument(s), got ${args.length}` })
  }
  rule.items.forEach((schema, arg) => {
    // JSON has no `undefined`: an omitted middle argument (updateStatus(id,
    // s, org, undefined, details)) arrives as null. Treat null as omitted for
    // optional args that do not themselves accept null.
    const value = args[arg] === null && !schema.safeParse(null).success && schema.safeParse(undefined).success ? undefined : args[arg]
    const result = schema.safeParse(value)
    if (result.success) return
    for (const issue of result.error.issues) {
      issues.push({ arg, path: issue.path, message: issue.message })
    }
  })
  return issues
}

/** One-line summary for the HTTP status message. */
export function summarizeIssues(issues: RpcIssue[]): string {
  const first = issues[0]
  if (!first) return 'Invalid input'
  const where = first.path.length ? first.path.join('.') : `argument ${first.arg + 1}`
  const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : ''
  return `Invalid input: ${where}: ${first.message}${more}`
}
