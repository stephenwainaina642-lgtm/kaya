import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        cypress: {
          50: '#f0f5f1',
          100: '#dbe8dd',
          400: '#5a9070',
          500: '#3d7a54',
          600: '#2f6b45',
          700: '#255638',
          800: '#1d4329',
          DEFAULT: '#2f6b45',
        },
        brass: '#b08d57',
        ink: '#1c231f',
        muted: '#5c6a60',
        faint: '#8f9b93',
        surface: '#ffffff',
        sunk: '#f6f8f6',
        ground: '#eef2ef',
        line: '#dfe6e1',
        ok: '#2f6b45',
        warn: '#b08d3f',
        danger: '#b24a3f',
        accent: '#b08d57',
      },
      borderRadius: {
        control: '10px',
        panel: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,35,31,0.06), 0 8px 24px -12px rgba(28,35,31,0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config;
