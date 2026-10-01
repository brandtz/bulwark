<!--
  BulwarkDrawer.vue — side panel for detail / edit with more than six fields
  (Packet A components/SPEC.md, WP-A2).

  role=dialog with a focus trap, initial focus and restore (useFocusTrap);
  Esc, the overlay and the close button dismiss. The body has its own scroll
  region. Below 768px it is a bottom sheet (CSS only).

  Unsaved guard (SPEC `dirtyGuard`, default on): when the caller marks the
  form `dirty`, a dismissal shows an inline "Discard changes?" confirmation
  instead of closing; focus moves to "Keep editing". `save` is emitted by the
  caller's footer button; the drawer does not submit anything itself.

  API: SPEC `open` / `close` / `save`, sizes md (480) and lg (640), `subtitle`,
  slots header-end, default, footer. v-model (modelValue) also works.
-->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })

interface Props {
  open?: boolean
  modelValue?: boolean
  title?: string
  subtitle?: string
  size?: 'md' | 'lg'
  /** Ask before discarding unsaved changes (needs `dirty`). */
  dirtyGuard?: boolean
  /** The form has unsaved changes. */
  dirty?: boolean
  dismissible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  open: undefined,
  modelValue: undefined,
  title: '',
  subtitle: '',
  size: 'md',
  dirtyGuard: true,
  dirty: false,
  dismissible: true,
})

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  close: []
  save: []
}>()

const isOpen = computed(() => Boolean(props.open ?? props.modelValue))
const titleId = useId()
const panel = ref<HTMLElement | null>(null)
const keepEditing = ref<HTMLButtonElement | null>(null)
const confirming = ref(false)
useFocusTrap(() => isOpen.value, panel)

function requestClose() {
  if (!props.dismissible) return
  if (props.dirtyGuard && props.dirty) {
    confirming.value = true
    nextTick(() => keepEditing.value?.focus())
    return
  }
  doClose()
}

function doClose() {
  confirming.value = false
  emit('update:modelValue', false)
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (confirming.value) { confirming.value = false; return }
  requestClose()
}

watch(isOpen, (open) => {
  if (typeof document === 'undefined') return
  confirming.value = false
  if (open) {
    document.addEventListener('keydown', onKeydown)
    document.body.style.overflow = 'hidden'
  } else {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  }
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="isOpen" class="bw-drawer-overlay" @click.self="requestClose">
        <aside
          ref="panel"
          class="bw-drawer focus:outline-none"
          :style="{ '--drawer-w': size === 'lg' ? 'var(--drawer-lg)' : 'var(--drawer-md)' }"
          v-bind="$attrs"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
        >
          <header class="bw-drawer__hd">
            <div class="min-w-0">
              <h2 v-if="title" :id="titleId" class="bw-drawer__title">{{ title }}</h2>
              <p v-if="subtitle" class="bw-help">{{ subtitle }}</p>
            </div>
            <div class="flex items-center gap-2">
              <slot name="header-end" />
              <button
                v-if="dismissible"
                type="button"
                class="bw-btn bw-btn--ghost bw-btn--icon bw-btn--sm"
                aria-label="Close"
                @click="requestClose"
              >
                <BulwarkIcon name="x" size="sm" />
              </button>
            </div>
          </header>
          <div class="bw-drawer__bd" data-dialog-body>
            <slot />
          </div>
          <div v-if="confirming" class="bw-drawer__ft" role="alertdialog" aria-label="Discard changes?" data-testid="drawer-discard-confirm">
            <span class="mr-auto text-sm">Discard unsaved changes?</span>
            <button ref="keepEditing" type="button" class="bw-btn bw-btn--secondary bw-btn--sm" @click="confirming = false">Keep editing</button>
            <button type="button" class="bw-btn bw-btn--destructive bw-btn--sm" @click="doClose">Discard</button>
          </div>
          <footer v-else-if="$slots.footer" class="bw-drawer__ft">
            <slot name="footer" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.bw-drawer-overlay { position: fixed; inset: 0; z-index: var(--z-drawer); background: var(--overlay); }
.bw-drawer {
  position: fixed; top: 0; right: 0; height: 100%; width: min(100%, var(--drawer-w));
  display: flex; flex-direction: column;
  background: var(--bg-card); box-shadow: var(--shadow-3);
}
.bw-drawer__hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 24px 12px; border-bottom: 1px solid var(--divider); }
.bw-drawer__title { margin: 0; font: 700 var(--text-xl) var(--font-display); color: var(--text-primary); }
.bw-drawer__bd { flex: 1; overflow-y: auto; padding: 16px 24px; }
.bw-drawer__ft { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 24px; border-top: 1px solid var(--divider); }
/* SPEC: bottom sheet below 768px. */
@media (max-width: 767px) {
  .bw-drawer {
    top: auto; bottom: 0; width: 100%; height: auto; max-height: 90vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
}
</style>
