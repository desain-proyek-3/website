/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary clinical teal
        teal: {
          900: '#134E4A',
          800: '#115E59',
          700: '#0F766E',
          600: '#0D9488',
          500: '#14B8A6',
          400: '#2DD4BF',
          300: '#5EEAD4',
          200: '#99F6E4',
          100: '#CCFBF1',
          50:  '#F0FDFA',
        },
        // Radiography viewer surfaces
        viewer: {
          900: '#0B1220',
          800: '#0F172A',
          700: '#152238',
          600: '#1E293B',
        },
        canvas: '#F8FAFC',
        ink: '#1E293B',
        signal: {
          amber: '#F59E0B',
          cyan:  '#22D3EE',
          rose:  '#F43F5E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.12)',
        lift: '0 24px 60px -30px rgba(13,148,136,.55)',
      },
      keyframes: {
        sweep: {
          '0%':   { transform: 'translateY(-12%)', opacity: '0' },
          '18%':  { opacity: '1' },
          '82%':  { opacity: '1' },
          '100%': { transform: 'translateY(112%)', opacity: '0' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%':     { opacity: '.35', transform: 'scale(.82)' },
        },
      },
      animation: {
        sweep: 'sweep 4.5s cubic-bezier(.4,0,.2,1) infinite',
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
