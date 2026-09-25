function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

export function computeOnAccent(accent: string): '#FFFFFF' | '#161B22' | '#000000' {
  if (typeof accent !== 'string' || accent.length !== 7 || !/^#[0-9a-f]{6}$/i.test(accent)) {
    throw new TypeError('Invalid accent: expected #RRGGBB')
  }
  const background = luminance(accent)
  const dark = luminance('#161B22')
  const whiteContrast = 1.05 / (background + 0.05)
  const darkContrast = (Math.max(background, dark) + 0.05) / (Math.min(background, dark) + 0.05)
  if (whiteContrast >= 4.5) return '#FFFFFF'
  if (darkContrast >= 4.5) return '#161B22'
  return '#000000'
}