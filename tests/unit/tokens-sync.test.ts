import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sources = [
  ['app/assets/css/tokens.css', 'tests/fixtures/design/packet-a-tokens.css'],
  ['app/assets/css/base.css', 'tests/fixtures/design/packet-a-base.css'],
  ['tailwind.preset.cjs', 'tests/fixtures/design/packet-a-tailwind.preset.js'],
] as const

describe('Packet A runtime exports', () => {
  it.each(sources)('%s matches its approved source export', (runtimePath, fixturePath) => {
    const runtime = readFileSync(new URL(`../../${runtimePath}`, import.meta.url))
    const fixture = readFileSync(new URL(`../../${fixturePath}`, import.meta.url))
    expect(runtime).toEqual(fixture)
  })
})