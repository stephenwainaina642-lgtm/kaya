import type { Config } from 'tailwindcss';

// Design language: plain and exact, like a private bank's own software. One
// sans-serif family, flat white surfaces on a cool grey canvas, near-black
// primary actions and a single restrained blue for links and focus. No
// gradients, glows or decoration. Token names are kept from earlier themes so
// every page picks the new look up without being rewritten.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // `font-display` is kept as an alias so older markup still works.
        display: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Historic name for the primary (now near-black) scale.
        cypress: {
          50: '#f3f4f6',
          100: '#e5e7eb',
          400: '#6b7280',
          500: '#374151',
          600: '#14181f',
          700: '#0b0e13',
          800: '#05070a',
          DEFAULT: '#14181f',
        },
        accent: { DEFAULT: '#2451d6', soft: '#eef2fd', deep: '#1b3fa8' },
        ink: '#0f1419',
        muted: '#5b6470',
        faint: '#8a929c',
        surface: '#ffffff',
        sunk: '#f4f5f7',
        ground: '#f6f7f8',
        line: '#e4e6ea',
        ok: '#1b3fa8',
        warn: '#b45309',
        danger: '#b42318',
      },
      borderRadius: {
        control: '6px',
        panel: '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,20,25,0.04)',
        lift: '0 12px 32px -8px rgba(15,20,25,0.18)',
      },
      fontSize: { display: ['1.625rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }] },
    },
  },
  plugins: [],
} satisfies Config;
