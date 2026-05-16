/**
 * icon-names.ts — registry of glyph names advertised by BulwarkIcon.
 *
 * Lives outside the .vue file so the unit test
 * (tests/unit/bulwark-icon.test.ts) can import it under Vitest's node
 * env without booting the Vue SFC compiler.
 *
 * # Contract
 *   - Every name in ICON_NAMES MUST have a corresponding
 *     `<symbol id="bw-{name}">` in public/icons/sprite.svg.
 *   - Adding a glyph = (1) add a <symbol> to the sprite, (2) add the
 *     bare name (without the `bw-` prefix) to ICON_NAMES below.
 *   - The unit test enforces this contract.
 *
 * Decisions captured here
 *   - The `bw-` prefix lives on the sprite IDs, not in this list.
 *     Consumers should never type the prefix; BulwarkIcon adds it.
 */
export const ICON_NAMES = [
  'alert-circle',
  'alert-triangle',
  'arrow-left',
  'arrow-right',
  'bell',
  'briefcase',
  'building',
  'calendar',
  'camera',
  'check',
  'check-circle',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'chevron-up',
  'clipboard',
  'clock',
  'dollar-sign',
  'download',
  'edit',
  'external-link',
  'eye',
  'eye-off',
  'file',
  'file-text',
  'filter',
  'flame',
  'home',
  'image',
  'info',
  'list',
  'map-pin',
  'menu',
  'minus',
  'more-horizontal',
  'pencil',
  'phone',
  'plus',
  'printer',
  'refresh',
  'search',
  'settings',
  'shield',
  'tool',
  'trash',
  'upload',
  'user',
  'users',
  'wrench',
  'x',
  'x-circle',
] as const

export type IconName = (typeof ICON_NAMES)[number]
