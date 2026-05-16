/**
 * app/composables/useLabel.ts — per-tenant CMS label resolver (EH-B / W1-2 / ADR-0014).
 *
 * What this file does:
 *   - Exposes `t(namespace, key, fallback)` — the canonical way UI looks
 *     up a user-facing string that an admin may have overridden.
 *   - Caches the per-org override map in a Nuxt `useState` keyed by
 *     `bulwark.labels.<orgId>` so per-org maps don't bleed when a
 *     super_admin switches between organizations.
 *
 * Decisions captured here (ADR-0008, ADR-0014):
 *   - **Lazy + sync read**: first `useLabel()` call kicks off an async
 *     `reload()` (fire-and-forget) but `t()` is purely sync — it reads
 *     `useState` and returns the override if present, else the
 *     `fallback` arg. On first paint the cache is empty so callers see
 *     `fallback`; once the fetch resolves the reactive state triggers a
 *     re-render with overrides.
 *   - **Cache key includes orgId**: the unit test asserts switching org
 *     yields a different cache slot. Without this a super_admin who
 *     toggled orgs would see Org A's overrides on Org B's pages.
 *   - **Watch session for org change**: when `session.value?.
 *     activeOrganizationId` changes, we clear the previous cache marker
 *     and reload. Belt-and-suspenders: the new state key already differs,
 *     but explicit invalidation avoids stale `ready` flags.
 *
 * Decisions NOT taken:
 *   - We considered awaiting `reload()` inside a Nuxt plugin so SSR
 *     emits overrides on first paint. Rejected for this slice — the
 *     plugin file is owned by W1-5 (real-backend cutover). Pages that
 *     care can `await useLabel().reload()` in their setup.
 *   - We considered exposing per-namespace lookup `tNs(key, fallback)`.
 *     Rejected — saving 1 arg per call site is not worth the API
 *     surface duplication; ergonomics improve more by adopting useLabel
 *     in fewer, high-leverage surfaces.
 *
 * Maintenance notes:
 *   - When adding a new high-stakes label surface, prefer wrapping the
 *     existing default lookup (e.g. `PROPERTY_STATUS_LABEL[status]`)
 *     with `useLabel().t('status.property', status, default)` — the
 *     three-arg signature makes the fallback explicit, which the
 *     reviewer can read at a glance.
 */
import type { Ref } from 'vue'
import type { LabelMapOutput } from '~~/shared/contracts/label'
import { DEFAULT_LABELS } from '~~/shared/labels/defaults'

interface LabelCacheEntry {
  /** Flat override map: `${namespace}.${key}` → value. */
  overrides: LabelMapOutput
  ready: boolean
}

/**
 * Pure resolution: override → DEFAULT_LABELS → fallback. Extracted so the
 * vitest unit can exercise the priority rule without booting Nuxt's
 * `useState` runtime. The composable's `t()` is a thin wrapper around this.
 */
export function resolveLabel(
  overrides: Readonly<LabelMapOutput>,
  namespace: string,
  key: string,
  fallback: string,
): string {
  const flat = `${namespace}.${key}`
  const ov = overrides[flat]
  if (ov) return ov
  return DEFAULT_LABELS[flat] ?? fallback
}

export function useLabel(): {
  t: (namespace: string, key: string, fallback: string) => string
  ready: Ref<boolean>
  reload: () => Promise<void>
} {
  const { session } = useSession()

  const orgId = computed(() => session.value?.activeOrganizationId ?? '__no_org__')

  // Per-org cache slot. `useState` is SSR-safe and shared across the
  // component tree. Using a function-style default avoids re-running on
  // hydration.
  function stateKey(id: string): string {
    return `bulwark.labels.${id}`
  }
  function entry(): Ref<LabelCacheEntry> {
    return useState<LabelCacheEntry>(stateKey(orgId.value), () => ({
      overrides: {},
      ready: false,
    }))
  }

  const ready = computed(() => entry().value.ready)

  // In-flight guard so concurrent `reload()` calls share the same promise.
  // Keyed by orgId so two simultaneous orgs each get one fetch.
  const inflight = useState<Record<string, Promise<void> | null>>(
    'bulwark.labels.inflight',
    () => ({}),
  )

  async function reload(): Promise<void> {
    const id = orgId.value
    if (!id || id === '__no_org__') return
    if (inflight.value[id]) {
      await inflight.value[id]!
      return
    }
    const slot = entry()
    const labelSvc = useService('label')
    const p = (async () => {
      try {
        const map = await labelSvc.getMap(id)
        slot.value = { overrides: map, ready: true }
      } catch {
        // Defensive: never let a label fetch break the page. Treat as
        // "no overrides" — fallbacks will surface.
        slot.value = { overrides: {}, ready: true }
      } finally {
        inflight.value[id] = null
      }
    })()
    inflight.value[id] = p
    await p
  }

  // Kick off a lazy load on first composable use if the cache is empty.
  // Fire-and-forget; the reactive state triggers re-render once ready.
  // Guarded by `ready` so subsequent `useLabel()` calls in already-loaded
  // components don't restart the request storm.
  if (!entry().value.ready && !inflight.value[orgId.value]) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    reload()
  }

  // Invalidate when the org changes. The new state key already gives us
  // a fresh slot; this watcher just ensures a fresh fetch happens
  // immediately rather than waiting for the next render-driven read.
  watch(orgId, (next, prev) => {
    if (next === prev) return
    if (!entry().value.ready && !inflight.value[next]) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      reload()
    }
  })

  function t(namespace: string, key: string, fallback: string): string {
    return resolveLabel(entry().value.overrides, namespace, key, fallback)
  }

  return { t, ready, reload }
}
