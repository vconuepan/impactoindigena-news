/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f9f4',
          100: '#dcf0e5',
          200: '#b9e2ca',
          300: '#86cd9e',
          400: '#4db378',
          500: '#27965c',
          600: '#1a7a4a',
          700: '#156040',
          800: '#0D5F3C',
          900: '#0a4a30',
        },
        accent: {
          50:  '#fdf2f1',
          100: '#fce4e2',
          200: '#f9c6c1',
          300: '#f59e97',
          400: '#ee6d64',
          500: '#C8473A',
          600: '#b03d31',
          700: '#922f25',
          800: '#6e221a',
          900: '#4a1410',
        },
        // `neutral` is driven by CSS variables whose fallbacks are Tailwind's
        // default (cool) neutral channels — so the public site is unchanged.
        // The admin scopes a warmer, brand-aligned scale (DESIGN.md's stone-based
        // neutrals) by setting these vars under `.admin-warm` (see index.css),
        // which makes the internal panel feel like the same product as the
        // warm editorial site without editing hundreds of class names.
        neutral: {
          50:  'rgb(var(--n-50, 250 250 250) / <alpha-value>)',
          100: 'rgb(var(--n-100, 245 245 245) / <alpha-value>)',
          200: 'rgb(var(--n-200, 229 229 229) / <alpha-value>)',
          300: 'rgb(var(--n-300, 212 212 212) / <alpha-value>)',
          400: 'rgb(var(--n-400, 163 163 163) / <alpha-value>)',
          500: 'rgb(var(--n-500, 115 115 115) / <alpha-value>)',
          600: 'rgb(var(--n-600, 82 82 82) / <alpha-value>)',
          700: 'rgb(var(--n-700, 64 64 64) / <alpha-value>)',
          800: 'rgb(var(--n-800, 38 38 38) / <alpha-value>)',
          900: 'rgb(var(--n-900, 23 23 23) / <alpha-value>)',
          950: 'rgb(var(--n-950, 10 10 10) / <alpha-value>)',
        },
      },
      fontFamily: {
        fraunces: ['Fraunces', 'Georgia', 'ui-serif', 'serif'],
        lora:     ['Lora',     'ui-serif', 'Georgia', 'serif'],
        'dm-sans':['DM Sans',  'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
