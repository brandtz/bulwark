<!--
  BulwarkSelect.vue — single-choice select (Packet A components/SPEC.md, WP-A2).

  Two renderings:
    - native (default today): a styled <select>. Accessible everywhere, the
      phone's own picker on mobile, and what Playwright's selectOption drives.
    - combobox (`native=false`, or `searchable`): ARIA 1.2 select-only combobox
      with a listbox popup: Arrow keys, Home/End, Enter/Space, Esc, type-ahead;
      `searchable` filters as you type; `createLabel` adds a footer action that
      emits `create` with the typed text.

  ED-064: the SPEC default is "native below 768px, combobox above". Switching
  every existing form at once would change 25 call sites and their specs ahead
  of the screens that redesign them, so the native rendering stays the default
  and each SCR package opts its selects in (native=false / searchable) when it
  rebuilds the form.

  Options: { value, label, meta?, avatar?, disabled? }. `meta` is a muted second
  line in the combobox; the native rendering shows the label only.
-->
<script setup lang="ts">
export interface SelectOption {
  value: string
  label: string
  meta?: string
  avatar?: string
  disabled?: boolean
}

interface Props {
  modelValue: string | null | undefined
  label: string
  options?: SelectOption[]
  placeholder?: string
  error?: string
  required?: boolean
  disabled?: boolean
  /** Filter-as-you-type combobox (SPEC: auto above 8 options when not native). */
  searchable?: boolean
  /** Native <select> (default) or the combobox rendering. */
  native?: boolean
  /** Footer action in the combobox; emits `create` with the typed text. */
  createLabel?: string
  /** Helper text (SPEC name `helper` on fields). */
  helper?: string
  /** @deprecated use `helper`. */
  hint?: string
  id?: string
}
const props = withDefaults(defineProps<Props>(), {
  options: () => [],
  placeholder: 'Select…',
  error: '',
  required: false,
  disabled: false,
  searchable: undefined,
  native: undefined,
  createLabel: undefined,
  helper: '',
  hint: '',
  id: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  create: [query: string]
}>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `sel-${reactiveId}`)
const listId = computed(() => `${inputId.value}-list`)
const helperText = computed(() => props.helper || props.hint)
const describedById = computed(() =>
  props.error ? `${inputId.value}-err` : helperText.value ? `${inputId.value}-hint` : undefined,
)

const isSearchable = computed(() => props.searchable ?? (props.native === false && props.options.length > 8))
const isNative = computed(() => !isSearchable.value && props.native !== false)
const selected = computed(() => props.options.find((o) => o.value === props.modelValue) ?? null)

// ---- combobox -------------------------------------------------------------
const open = ref(false)
const query = ref('')
const active = ref(-1)
const root = ref<HTMLElement | null>(null)
const control = ref<HTMLElement | null>(null)

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.options.filter((o) => o.label.toLowerCase().includes(q) || o.meta?.toLowerCase().includes(q)) : props.options
})
const optionId = (i: number) => `${inputId.value}-opt-${i}`

function nextEnabled(from: number, step: 1 | -1): number {
  const list = visible.value
  for (let i = 1; i <= list.length; i++) {
    const idx = from + step * i
    if (idx < 0 || idx >= list.length) break
    if (!list[idx]!.disabled) return idx
  }
  return from
}

function openList() {
  if (props.disabled || open.value) return
  open.value = true
  const at = visible.value.findIndex((o) => o.value === props.modelValue)
  active.value = at >= 0 ? at : nextEnabled(-1, 1)
  document.addEventListener('pointerdown', onOutside, true)
}

function closeList() {
  open.value = false
  query.value = ''
  document.removeEventListener('pointerdown', onOutside, true)
}

function onOutside(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) closeList()
}

function pick(o: SelectOption | undefined) {
  if (!o || o.disabled) return
  emit('update:modelValue', o.value)
  closeList()
  control.value?.focus()
}

let typed = ''
let typedAt = 0
function typeahead(ch: string) {
  const now = Date.now()
  typed = now - typedAt > 700 ? ch : typed + ch
  typedAt = now
  const at = visible.value.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.toLowerCase()))
  if (at >= 0) active.value = at
}

function onKey(e: KeyboardEvent) {
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
    return
  }
  switch (e.key) {
    case 'ArrowDown': active.value = nextEnabled(active.value, 1); break
    case 'ArrowUp': active.value = nextEnabled(active.value, -1); break
    case 'Home': active.value = nextEnabled(-1, 1); break
    case 'End': active.value = nextEnabled(visible.value.length, -1); break
    case 'Enter': pick(visible.value[active.value]); break
    case ' ': if (isSearchable.value) return; pick(visible.value[active.value]); break
    case 'Escape': closeList(); break
    case 'Tab': closeList(); return
    default:
      if (!isSearchable.value && e.key.length === 1) typeahead(e.key)
      return
  }
  e.preventDefault()
  nextTick(() => document.getElementById(optionId(active.value))?.scrollIntoView({ block: 'nearest' }))
}

watch(query, () => { active.value = nextEnabled(-1, 1) })
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <div ref="root" class="bw-field">
    <label :id="`${inputId}-label`" :for="inputId" class="bw-label">
      {{ label }}<span v-if="required" class="req" aria-hidden="true">*</span>
    </label>

    <select
      v-if="isNative"
      :id="inputId"
      :value="modelValue ?? ''"
      :disabled="disabled"
      :required="required"
      :aria-invalid="!!error"
      :aria-describedby="describedById"
      class="bw-input bw-select"
      :class="{ 'is-error': !!error }"
      :style="!modelValue ? 'color: var(--text-muted)' : undefined"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled hidden>{{ placeholder }}</option>
      <option
        v-for="opt in options"
        :key="opt.value"
        :value="opt.value"
        :disabled="opt.disabled"
      >
        {{ opt.label }}
      </option>
    </select>

    <div v-else class="relative">
      <input
        v-if="isSearchable"
        :id="inputId"
        ref="control"
        v-model="query"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="open && active >= 0 ? optionId(active) : undefined"
        :aria-invalid="!!error"
        :aria-describedby="describedById"
        :aria-required="required || undefined"
        :placeholder="selected?.label ?? placeholder"
        :disabled="disabled"
        autocomplete="off"
        class="bw-input bw-select"
        :class="{ 'is-error': !!error }"
        @focus="openList"
        @click="openList"
        @keydown="onKey"
      >
      <div
        v-else
        :id="inputId"
        ref="control"
        role="combobox"
        :tabindex="disabled ? -1 : 0"
        :aria-labelledby="`${inputId}-label`"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="open && active >= 0 ? optionId(active) : undefined"
        :aria-invalid="!!error"
        :aria-describedby="describedById"
        :aria-required="required || undefined"
        :aria-disabled="disabled || undefined"
        class="bw-input bw-select flex items-center cursor-pointer"
        :class="{ 'is-error': !!error }"
        :style="!selected ? 'color: var(--text-muted)' : undefined"
        @click="open ? closeList() : openList()"
        @keydown="onKey"
      >
        {{ selected?.label ?? placeholder }}
      </div>

      <div
        v-show="open"
        class="bw-menu absolute left-0 right-0 top-full mt-1 overflow-auto"
        style="z-index: var(--z-dropdown); max-height: 280px"
      >
        <ul :id="listId" role="listbox" :aria-labelledby="`${inputId}-label`">
          <li
            v-for="(opt, i) in visible"
            :id="optionId(i)"
            :key="opt.value"
            role="option"
            class="item"
            :class="{ 'is-on': i === active }"
            :aria-selected="opt.value === modelValue"
            :aria-disabled="opt.disabled || undefined"
            :style="opt.disabled ? 'opacity: .5; cursor: not-allowed' : undefined"
            @mousedown.prevent
            @click="pick(opt)"
            @mousemove="opt.disabled || (active = i)"
          >
            <img v-if="opt.avatar" :src="opt.avatar" alt="" class="w-5 h-5 rounded-full">
            <span class="flex flex-col min-w-0">
              <span class="truncate">{{ opt.label }}</span>
              <span v-if="opt.meta" class="bw-help truncate">{{ opt.meta }}</span>
            </span>
            <BulwarkIcon v-if="opt.value === modelValue" name="check" size="sm" class="ml-auto" />
          </li>
          <li v-if="!visible.length" class="item" aria-disabled="true" style="cursor: default; color: var(--text-muted)">
            No matches
          </li>
        </ul>
        <template v-if="createLabel">
          <div class="sep" />
          <button
            type="button"
            class="item w-full"
            @mousedown.prevent
            @click="emit('create', query.trim()); closeList()"
          >
            <BulwarkIcon name="plus" size="sm" />{{ createLabel }}<template v-if="query.trim()">: “{{ query.trim() }}”</template>
          </button>
        </template>
      </div>
    </div>

    <p v-if="error" :id="`${inputId}-err`" class="bw-error" role="alert">
      <BulwarkIcon name="alert-circle" size="sm" />{{ error }}
    </p>
    <p v-else-if="helperText" :id="`${inputId}-hint`" class="bw-help">{{ helperText }}</p>
  </div>
</template>
