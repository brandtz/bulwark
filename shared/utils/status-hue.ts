/**
 * shared/utils/status-hue.ts — WP-X5: tenant statuses use the design's 12
 * status hues (tokens.css data-hue: contrast-tuned for light and dark), not a
 * free hex colour.
 *
 *   - STATUS_HUES: the 12 names StatusBadge / KanbanBoard / StatusMenu render.
 *   - SLUG_DEFAULT_HUE: the Packet B defaults for the built-in statuses of every
 *     pipeline (lead slate, scheduled blue, in progress amber, paid green ...).
 *   - nearestHue(hex): legacy colours and colour-only writes map to the closest
 *     hue (RGB distance to each hue's mid tone).
 */
export const STATUS_HUES = [
  'slate', 'blue', 'indigo', 'violet', 'teal', 'green', 'lime', 'amber', 'orange', 'red', 'pink', 'gray',
] as const
export type StatusHue = (typeof STATUS_HUES)[number]

/** Mid tone per hue (Tailwind 600 scale), only for nearest-hue matching. */
export const HUE_REFERENCE: Record<StatusHue, string> = {
  slate: '#475569', blue: '#2563EB', indigo: '#4F46E5', violet: '#7C3AED', teal: '#0D9488', green: '#16A34A',
  lime: '#65A30D', amber: '#D97706', orange: '#EA580C', red: '#DC2626', pink: '#DB2777', gray: '#6B7280',
}

/** Built-in status slugs across the default pipelines → design hue. */
export const SLUG_DEFAULT_HUE: Record<string, StatusHue> = {
  // property (as the Packet B screens use them)
  lead: 'slate', scheduled: 'blue', assessed: 'indigo', quoted: 'violet', accepted: 'teal', in_progress: 'amber',
  completed: 'green', deliverable_pending: 'orange', deliverable_complete: 'green', invoiced: 'blue', paid: 'green',
  on_hold: 'slate', cancelled: 'slate',
  // quote / invoice / work order / compliance / job
  draft: 'slate', sent: 'blue', rejected: 'red', expired: 'gray', partial: 'amber', voided: 'gray',
  generating: 'amber', ready: 'green', failed: 'red', queued: 'slate', running: 'amber', succeeded: 'green',
}

function rgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/u, '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (!/^[0-9a-f]{6}$/iu.test(full)) return null
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** The design hue closest to a hex colour (gray when the colour is not hex). */
export function nearestHue(hex: string): StatusHue {
  const c = rgb(hex)
  if (!c) return 'gray'
  let best: StatusHue = 'gray'
  let bestD = Number.POSITIVE_INFINITY
  for (const hue of STATUS_HUES) {
    const r = rgb(HUE_REFERENCE[hue])!
    const d = (c[0] - r[0]) ** 2 + (c[1] - r[1]) ** 2 + (c[2] - r[2]) ** 2
    if (d < bestD) { bestD = d; best = hue }
  }
  return best
}

/** Default hue for a status: the design default for a built-in slug, else nearest to its colour. */
export function defaultHue(slug: string, color: string): StatusHue {
  return SLUG_DEFAULT_HUE[slug] ?? nearestHue(color)
}

export function isStatusHue(v: unknown): v is StatusHue {
  return typeof v === 'string' && (STATUS_HUES as readonly string[]).includes(v)
}

/**
 * Hue for a saved node: an explicit hue wins; a colour-only write keeps the
 * existing node's hue when its colour is unchanged (a built-in status keeps its
 * design hue), else the nearest hue to the new colour, or the slug default for
 * a node that did not exist.
 */
export function hueOnSave(
  n: { slug: string, color: string, hue?: StatusHue },
  prev?: { color: string, hue: StatusHue },
): StatusHue {
  if (n.hue) return n.hue
  if (prev && prev.color.toLowerCase() === n.color.toLowerCase()) return prev.hue
  return prev ? nearestHue(n.color) : defaultHue(n.slug, n.color)
}
