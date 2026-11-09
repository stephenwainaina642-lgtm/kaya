import type { Config } from 'tailwindcss';

// Design language: a private-office ledger. A deep evergreen "spine" (sidebar),
// a cool stone canvas, white hairline-ruled surfaces, brass used sparingly as
// the single warm accent. Token names are kept from the previous theme so every
// page inherits the new look without being rewritten.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"Hanken Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        cypress: {
          50: '#eef3f0',
          100: '#dce7e1',
          400: '#5e9078',
          500: '#2f6b50',
          600: '#1a4a39',
          700: '#123629',
          800: '#0c2a1f',
          DEFAULT: '#1a4a39',
        },
        spine: { DEFAULT: '#0c1a16', raised: '#12261f', line: 'rgba(255,255,255,0.07)', text: '#a3b3ab', bright: '#f3f1ea' },
        brass: { DEFAULT: '#b6925a', soft: '#f6efe2', deep: '#8a6d3b' },
        ink: '#131c18',
        muted: '#5e6b63',
        faint: '#94a09a',
        surface: '#ffffff',
        sunk: '#f6f7f4',
        ground: '#f3f4f1',
        line: '#e3e7e2',
        ok: '#1f6a4a',
        warn: '#9a7432',
        danger: '#a8443a',
        accent: '#b6925a',
      },
      borderRadius: {
        control: '8px',
        panel: '14px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(19,28,24,0.03), 0 14px 32px -22px rgba(19,28,24,0.22)',
        lift: '0 24px 60px -24px rgba(12,26,22,0.45)',
      },
      fontSize: { display: ['2.1rem', { lineHeight: '1.1', letterSpacing: '-0.01em' }] },
    },
  },
  plugins: [],
} satisfies Config;
