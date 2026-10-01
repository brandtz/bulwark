/**
 * tests/unit/ui-spec-parity.test.ts — WP-A2: every existing primitive declares
 * the props its Packet A SPEC names (components/SPEC.md, exported to
 * tests/unit/_ui-spec.generated.json by scripts/codegraph/export-ui-spec.mjs).
 *
 * Names only: the SPEC's types are design notation ('sm'|'md'(480)), so type
 * fidelity is checked by vue-tsc and the e2e/visual specs, not here.
 *
 * NOT_YET_RESTYLED lists primitives A2 has not reached. It must only shrink:
 * the test fails if a listed component already satisfies its SPEC (remove it)
 * and when a component outside the list misses a SPEC prop.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import uiSpec from './_ui-spec.generated.json'

const UI = path.resolve(__dirname, '../../app/components/ui')
const spec = (uiSpec as { components: Record<string, { props: Array<{ name: string }> }> }).components

const NOT_YET_RESTYLED = new Set([
  'BulwarkAvatar', 'BulwarkBreadcrumbs', 'BulwarkDatePicker',
  'BulwarkFilePicker', 'BulwarkJobCard', 'BulwarkKpiCard', 'BulwarkMultiSelect',
  'BulwarkPagination', 'BulwarkPassFailToggle', 'BulwarkSearchField', 'BulwarkSegmentedControl',
  'BulwarkSignaturePad', 'BulwarkSkeleton', 'BulwarkStepper', 'BulwarkTableSkeleton', 'BulwarkTabs',
  'BulwarkToastHost', 'EmptyState',
])

/** Prop names from `defineProps<{...}>()` or `defineProps<Name>()` + `interface|type Name`. */
export function declaredProps(src: string): Set<string> {
  const script = src.slice(0, src.indexOf('</script>') + 1 || undefined)
  let body = script.match(/defineProps<\{([\s\S]*?)\}>\(\)/u)?.[1]
  if (body === undefined) {
    const typeName = script.match(/defineProps<(\w+)>\(\)/u)?.[1]
    if (typeName) body = script.match(new RegExp(`(?:interface ${typeName}|type ${typeName}\\s*=)\\s*\\{([\\s\\S]*?)\\n\\}`, 'u'))?.[1]
  }
  return new Set(body ? [...body.matchAll(/^\s*(?:readonly\s+)?['"]?(\w+)['"]?\??\s*:/gmu)].map((m) => m[1]!) : [])
}

function gaps(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const file of readdirSync(UI).filter((f) => f.endsWith('.vue'))) {
    const name = file.slice(0, -'.vue'.length)
    const entry = spec[name]
    if (!entry) continue
    const declared = declaredProps(readFileSync(path.join(UI, file), 'utf8'))
    out[name] = entry.props.map((p) => p.name).filter((p) => !declared.has(p))
  }
  return out
}

describe('UI primitives match the Packet A SPEC (WP-A2)', () => {
  it('reads props from inline and named prop types', () => {
    expect([...declaredProps('<script setup lang="ts">\ndefineProps<{\n  a?: string\n  b: number\n}>()\n</script>')]).toEqual(['a', 'b'])
    expect([...declaredProps('<script setup lang="ts">\ninterface Props {\n  label?: string\n  error?: string | null\n}\nconst p = defineProps<Props>()\n</script>')]).toEqual(['label', 'error'])
  })

  it('every restyled primitive declares its SPEC props', () => {
    const missing = Object.entries(gaps()).filter(([name, m]) => m.length && !NOT_YET_RESTYLED.has(name))
    expect(Object.fromEntries(missing), 'add these props (names per components/SPEC.md)').toEqual({})
  })

  it('the not-yet-restyled list only shrinks', () => {
    const done = Object.entries(gaps()).filter(([name, m]) => !m.length && NOT_YET_RESTYLED.has(name)).map(([n]) => n)
    expect(done, 'these now satisfy their SPEC: remove them from NOT_YET_RESTYLED').toEqual([])
  })
})
