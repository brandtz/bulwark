// Bulwark Tailwind preset — maps theme to CSS custom properties from tokens.css
// Usage: presets: [require('./tailwind.preset.js')]; dark mode toggles via <html data-theme="dark">
const steps = [50,100,200,300,400,500,600,700,800,900,950];
const ramp = (name) => Object.fromEntries(steps.map(s => [s, `var(--${name}-${s})`]));
const hues = ["slate","blue","indigo","violet","teal","green","lime","amber","orange","red","pink","gray"];
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    screens: { sm: '390px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1440px' },
    extend: {
      colors: {
        accent: { DEFAULT: 'var(--accent)', on: 'var(--on-accent)', ...ramp('accent') },
        neutral: { 0: 'var(--neutral-0)', ...ramp('neutral') },
        ...Object.fromEntries(['success','warning','danger','info'].map(n => [n, { DEFAULT: `var(--${n}-fg)`, fg: `var(--${n}-fg)`, bg: `var(--${n}-bg)`, border: `var(--${n}-border)`, strong: `var(--${n}-strong)` }])),
        status: Object.fromEntries(hues.map(h => [h, { bg: `var(--status-${h}-bg)`, fg: `var(--status-${h}-fg)`, border: `var(--status-${h}-border)` }])),
        hue: { bg: 'var(--hue-bg)', fg: 'var(--hue-fg)', border: 'var(--hue-border)' },
        page: 'var(--bg-page)', card: 'var(--bg-card)', raised: 'var(--bg-raised)', sunken: 'var(--bg-sunken)', hover: 'var(--bg-hover)', selected: 'var(--bg-selected)',
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        ink: { DEFAULT: 'var(--text-primary)', secondary: 'var(--text-secondary)', muted: 'var(--text-muted)', inverse: 'var(--text-inverse)', link: 'var(--text-link)' },
        shell: { DEFAULT: 'var(--shell-bg)', hover: 'var(--shell-hover)', active: 'var(--shell-active)', text: 'var(--shell-text)', 'text-active': 'var(--shell-text-active)', border: 'var(--shell-border)' },
      },
      fontFamily: { display: 'var(--font-display)', body: 'var(--font-body)', mono: 'var(--font-mono)' },
      fontSize: { xs: ['var(--text-xs)', '1.5'], sm: ['var(--text-sm)', '1.5'], base: ['var(--text-md)', '1.5'], lg: ['var(--text-lg)', '1.5'], xl: ['var(--text-xl)', '1.35'], '2xl': ['var(--text-2xl)', '1.35'], '3xl': ['var(--text-3xl)', '1.2'], '4xl': ['var(--text-4xl)', '1.2'] },
      borderRadius: { sm: 'var(--radius-sm)', DEFAULT: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', pill: 'var(--radius-pill)' },
      boxShadow: { 1: 'var(--shadow-1)', 2: 'var(--shadow-2)', 3: 'var(--shadow-3)', focus: 'var(--focus-ring)' },
      spacing: { control: 'var(--control-h)', 'control-sm': 'var(--control-h-sm)', 'control-lg': 'var(--control-h-lg)', 'row-y': 'var(--row-py)', 'row-x': 'var(--row-px)', card: 'var(--card-p)', gap: 'var(--gap)', sidebar: 'var(--sidebar-width)', 'sidebar-collapsed': 'var(--sidebar-collapsed)', topbar: 'var(--topbar-height)', bottomnav: 'var(--bottomnav-height)', 'drawer-md': 'var(--drawer-md)', 'drawer-lg': 'var(--drawer-lg)' },
      maxWidth: { content: 'var(--content-max)' },
      zIndex: { sticky: 'var(--z-sticky)', dropdown: 'var(--z-dropdown)', drawer: 'var(--z-drawer)', modal: 'var(--z-modal)', toast: 'var(--z-toast)', tooltip: 'var(--z-tooltip)' },
      transitionDuration: { fast: '100ms', DEFAULT: '150ms', slow: '200ms' },
      transitionTimingFunction: { standard: 'cubic-bezier(0.2, 0, 0, 1)' },
    },
  },
  plugins: [
    function ({ addVariant, addUtilities }) {
      addVariant('compact', '[data-density="compact"] &');
      addVariant('touch', '[data-density="touch"] &');
      addUtilities({ '.tnum': { fontVariantNumeric: 'tabular-nums' } });
    },
  ],
};
