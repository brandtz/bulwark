/**
 * WP-Q3 — every PascalCase component tag in app templates must resolve.
 *
 * nuxt.config registers components with `pathPrefix: false`, so
 * app/components/charts/Donut.vue is <Donut>, not <ChartsDonut>. Tags written
 * with a folder prefix rendered as unknown HTML elements (dashboard charts and
 * the property depth nav never appeared). This gate catches that at test time.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const APP = path.resolve(__dirname, '../../app')
const BUILT_INS = new Set([
  'NuxtLink', 'NuxtPage', 'NuxtLayout', 'ClientOnly', 'NuxtLoadingIndicator', 'NuxtErrorBoundary', 'NuxtImg',
  'NuxtRouteAnnouncer', 'NuxtClientFallback', 'RouterLink', 'RouterView', 'Teleport', 'Transition',
  'TransitionGroup', 'KeepAlive', 'Suspense', 'Component',
])

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}

function unresolvedTags(): string[] {
  const registered = new Set(walk(path.join(APP, 'components')).filter((f) => f.endsWith('.vue')).map((f) => path.basename(f, '.vue')))
  const problems: string[] = []
  for (const file of walk(APP).filter((f) => f.endsWith('.vue'))) {
    const src = readFileSync(file, 'utf8')
    const imported = new Set([...src.matchAll(/import\s+([A-Z][A-Za-z0-9]*)\s+from/g)].map((m) => m[1]))
    const template = src.slice(src.indexOf('<template'))
    for (const m of template.matchAll(/<([A-Z][A-Za-z0-9]+)[\s>/]/g)) {
      const tag = m[1]!
      if (!registered.has(tag) && !BUILT_INS.has(tag) && !imported.has(tag)) problems.push(`${path.relative(APP, file)}: <${tag}>`)
    }
  }
  return [...new Set(problems)]
}

describe('component resolution', () => {
  it('every component tag used in app templates is registered', () => {
    expect(unresolvedTags()).toEqual([])
  })
})
