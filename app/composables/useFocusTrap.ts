/**
 * app/composables/useFocusTrap.ts — modal focus management for BulwarkModal and
 * BulwarkDrawer (WP-L08 / epic L09-S3).
 *
 * While `open` is true:
 *   - initial focus goes to the first focusable control in the panel's body
 *     (a form field before the header's Close button), else the panel itself;
 *   - Tab / Shift+Tab cycle within the panel instead of escaping behind the
 *     backdrop;
 * and when it closes, focus returns to whatever opened it (if that element is
 * still in the document).
 */
import type { Ref } from 'vue'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => el.offsetParent !== null || el === document.activeElement)
}

export function useFocusTrap(open: Ref<boolean> | (() => boolean), panel: Ref<HTMLElement | null>) {
  let opener: HTMLElement | null = null

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !panel.value) return
    const items = focusables(panel.value)
    if (items.length === 0) {
      e.preventDefault()
      panel.value.focus()
      return
    }
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement as HTMLElement | null
    const inside = !!active && panel.value.contains(active)
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault()
      first.focus()
    }
  }

  watch(open, async (isOpen) => {
    if (typeof document === 'undefined') return
    if (isOpen) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      const root = panel.value
      if (!root) return
      if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
      const body = root.querySelector<HTMLElement>('[data-dialog-body]')
      const target = (body && focusables(body)[0]) ?? focusables(root)[0] ?? root
      target.focus({ preventScroll: true })
    } else {
      document.removeEventListener('keydown', onKeydown)
      const back = opener
      opener = null
      if (back && document.contains(back)) back.focus({ preventScroll: true })
    }
  }, { immediate: true })

  onBeforeUnmount(() => {
    if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown)
  })
}
