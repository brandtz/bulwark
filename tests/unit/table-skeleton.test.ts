/**
 * tests/unit/table-skeleton.test.ts — skeleton SFC contracts (Packet A
 * components/SPEC.md, WP-A2). Source-level, like signature-pad.test.ts.
 *
 *   - BulwarkTableSkeleton is the SPEC's alias of BulwarkSkeleton kind="table"
 *     (rows 8, columns 5); the old `cols` prop still works.
 *   - BulwarkSkeleton renders a header row plus `rows` rows of `columns`
 *     cells with the design shimmer (bw-skel), is aria-busy, hides the shimmer
 *     from assistive tech and announces "Loading" once, and waits 300ms before
 *     showing so fast loads never flash.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (f: string) => readFileSync(fileURLToPath(new URL(`../../app/components/ui/${f}`, import.meta.url)), 'utf8')
const TABLE = read('BulwarkTableSkeleton.vue')
const SKEL = read('BulwarkSkeleton.vue')

describe('BulwarkTableSkeleton (WP-A2)', () => {
  it('is BulwarkSkeleton kind="table" with SPEC defaults and the legacy cols prop', () => {
    expect(TABLE).toMatch(/rows\??:\s*number/u)
    expect(TABLE).toMatch(/columns\??:\s*number/u)
    expect(TABLE).toMatch(/cols\??:\s*number/u)
    expect(TABLE).toMatch(/rows:\s*8,\s*columns:\s*5/u)
    expect(TABLE).toMatch(/<BulwarkSkeleton kind="table" :rows="props\.rows" :columns="props\.cols \?\? props\.columns" \/>/u)
  })
})

describe('BulwarkSkeleton (WP-A2)', () => {
  it('renders a header row plus one row per `rows`, `columns` cells each, with the design shimmer', () => {
    expect(SKEL).toMatch(/v-for="r in rows \+ 1"/u)
    expect(SKEL).toMatch(/v-for="c in columns"/u)
    expect(SKEL).toContain('class="bw-skel"')
    expect(SKEL).toContain('data-testid="bulwark-table-skeleton"')
  })

  it('is aria-busy, hides the shimmer and announces Loading once', () => {
    expect(SKEL).toMatch(/aria-busy="true"/u)
    expect(SKEL).toMatch(/<div v-if="visible" aria-hidden="true">/u)
    expect(SKEL).toMatch(/role="status">Loading</u)
  })

  it('appears after a 300ms delay', () => {
    expect(SKEL).toMatch(/delay:\s*300/u)
    expect(SKEL).toMatch(/setTimeout\(\(\) => \{ visible\.value = true \}, props\.delay\)/u)
  })
})
