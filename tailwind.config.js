/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Share Tech Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        hud: {
          red: '#ef4444',
          bright: '#f87171',
          ink: '#3f3f46',
          soft: '#71717a',
          grid: '#e4e4e7',
          panel: '#fafafa',
          strong: '#f4f4f5',
          dark: '#202020'
        }
      },
      boxShadow: {
        hud: '4px 4px 0 rgba(239, 68, 68, 0.12)',
        glow: '0 0 22px rgba(239, 68, 68, 0.35)',
      },
    },
  },
  plugins: [],
};
