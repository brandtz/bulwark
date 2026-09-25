/**
 * Accent foreground contract: WCAG AA for normal text, without browser state.
 * Independent contrast calculation checks every grayscale input and saturated
 * colors. Explicit boundary cases prevent a simple luminance cutoff regression.
 * Persistence and branding service integration belong to a later A1 increment.
 */
import { describe, expect, it } from 'vitest'
import { computeOnAccent } from '../../shared/utils/theme'
import { MockLabelService, __resetMockLabelsForTests } from '../../shared/mocks/label.mock'
import { FIXTURE_ORG_ID, FIXTURE_USER_ADMIN } from '../../shared/mocks/fixtures'
import { beforeEach } from 'vitest'

function contrast(first: string, second: string): number {
  const brightness = (hex: string) => {
    const packed = Number.parseInt(hex.substring(1), 16)
    return [packed >>> 16, (packed >>> 8) & 255, packed & 255]
      .reduce((total, byte, index) => {
        const linear = byte / 255 <= 0.04045 ? byte / 3294.6 : ((byte / 255 + 0.055) / 1.055) ** 2.4
        return total + linear * [0.2126, 0.7152, 0.0722][index]!
      }, 0)
  }
  const values = [brightness(first), brightness(second)].sort((left, right) => right - left)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

describe('computeOnAccent', () => {
  it.each([
    ['#0F766E', '#FFFFFF'], ['#F5D90A', '#161B22'],
    ['#767676', '#FFFFFF'], ['#777777', '#000000'],
    ['#787878', '#000000'], ['#818181', '#000000'], ['#828282', '#161B22'],
    ['#000000', '#FFFFFF'], ['#FFFFFF', '#161B22'], ['#f5d90a', '#161B22'],
  ])('%s selects %s', (accent, foreground) => {
    expect(computeOnAccent(accent)).toBe(foreground)
  })

  it('meets 4.5:1 for all grays and a saturated RGB grid', () => {
    const colors = Array.from({ length: 256 }, (_, byte) => `#${byte.toString(16).padStart(2, '0').repeat(3)}`)
    for (const red of ['00', '33', '66', '99', 'cc', 'ff']) {
      for (const green of ['00', '33', '66', '99', 'cc', 'ff']) {
        for (const blue of ['00', '33', '66', '99', 'cc', 'ff']) colors.push(`#${red}${green}${blue}`)
      }
    }
    for (const accent of colors) {
      const foreground = computeOnAccent(accent)
      expect(contrast(accent, foreground), accent).toBeGreaterThanOrEqual(4.5)
      if (foreground === '#000000') {
        expect(contrast(accent, '#FFFFFF')).toBeLessThan(4.5)
        expect(contrast(accent, '#161B22')).toBeLessThan(4.5)
      }
    }
  })

  it.each(['', '#777', 'FFFFFF', '#12345678', '#gggggg', ' #123456', '#123456 ', '#123456\n',
    '#123456; color:red', 'var(--accent)', 'rgb(0,0,0)', 'url(https://example.com)', null, undefined, 123456, {}])(
    'rejects invalid input %j', (input) => {
      expect(() => computeOnAccent(input as string)).toThrow('Invalid accent')
    },
  )
})

describe('branding onAccent persistence', () => {
  beforeEach(() => __resetMockLabelsForTests())

  it('stores the computed foreground when the organization accent is saved', async () => {
    const service = new MockLabelService(() => ({
      userId: FIXTURE_USER_ADMIN.userId,
      organizationId: FIXTURE_ORG_ID,
    }))
    const light = await service.updateBranding({ organizationId: FIXTURE_ORG_ID, accentColor: '#F5D90A' })
    expect(light).toMatchObject({ accentColor: '#F5D90A', onAccent: '#161B22' })
    const dark = await service.updateBranding({ organizationId: FIXTURE_ORG_ID, accentColor: '#0F766E' })
    expect(dark.onAccent).toBe('#FFFFFF')
    await expect(service.getBranding(FIXTURE_ORG_ID)).resolves.toMatchObject({ onAccent: '#FFFFFF' })
  })
})