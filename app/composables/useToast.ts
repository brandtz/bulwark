/**
 * useToast.ts — imperative toast notifications.
 *
 * Why this composable exists
 * --------------------------
 * Toasts must be triggerable from anywhere — service-layer error handlers,
 * page-level form submits, optimistic-update rollbacks. A reactive global
 * queue is the only sane pattern. We pair this with `<BulwarkToastHost />`
 * mounted once in `default.vue`; the host renders the queue.
 *
 * Decisions
 * ---------
 * - **`useState` for SSR safety**: we never render toasts on the server,
 *   but if someone calls `toast.error()` during SSR (e.g. a server-side
 *   data fetch failure) we want it to no-op gracefully, not crash.
 * - **Auto-dismiss with override**: every toast auto-dismisses unless
 *   `duration: 0` (sticky errors).
 * - **No promise-based confirm here**: that's a Modal concern.
 */
export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastInput {
  title: string
  body?: string
  tone?: ToastTone
  /** Milliseconds. 0 = sticky (no auto-dismiss). Default 4000. */
  duration?: number
  /** Optional action label/callback rendered as a button. */
  action?: { label: string; onClick: () => void }
}

export interface ToastEntry extends Required<Omit<ToastInput, 'action'>> {
  id: string
  action: ToastInput['action'] | null
}

let nextId = 0

export function useToast() {
  const toasts = useState<ToastEntry[]>('bulwark.toasts', () => [])

  function push(input: ToastInput): string {
    const id = `t${++nextId}`
    const entry: ToastEntry = {
      id,
      title: input.title,
      body: input.body ?? '',
      tone: input.tone ?? 'info',
      duration: input.duration ?? 4000,
      action: input.action ?? null,
    }
    toasts.value = [...toasts.value, entry]
    if (entry.duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => dismiss(id), entry.duration)
    }
    return id
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return {
    toasts,
    push,
    dismiss,
    info: (title: string, body?: string) => push({ title, body, tone: 'info' }),
    success: (title: string, body?: string) => push({ title, body, tone: 'success' }),
    warning: (title: string, body?: string) => push({ title, body, tone: 'warning' }),
    error: (title: string, body?: string) => push({ title, body, tone: 'error', duration: 0 }),
  }
}
