/**
 * shared/utils/rpc-error.ts — field-level RPC input errors (WP-X4).
 *
 * The dispatcher answers a malformed call with 400 and `data.issues`
 * ({ arg, path, message }); the client proxy rethrows it as RpcInputError so
 * a form can map issues onto its fields with `fieldErrors(err)`.
 */
export interface RpcIssue {
  /** Positional argument index. */
  arg: number
  /** Path inside that argument (['phone'], ['lineItems', 0, 'quantity']). */
  path: Array<string | number>
  message: string
}

export class RpcInputError extends Error {
  readonly issues: RpcIssue[]
  constructor(message: string, issues: RpcIssue[]) {
    super(message)
    this.name = 'RpcInputError'
    this.issues = issues
  }
}

/**
 * Issues keyed by dotted path within the first argument ("phone",
 * "lineItems.0.quantity"); the first message per field wins. Errors that are
 * not input errors yield {}.
 */
export function fieldErrors(err: unknown, arg = 0): Record<string, string> {
  if (!(err instanceof RpcInputError)) return {}
  const out: Record<string, string> = {}
  for (const i of err.issues) {
    if (i.arg !== arg) continue
    const key = i.path.join('.') || '_'
    out[key] ??= i.message
  }
  return out
}
