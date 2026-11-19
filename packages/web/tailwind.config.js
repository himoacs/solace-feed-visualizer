/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Solace 2025 brand palette (authoritative values from the
        // solace-branding skill) - kept separate from the sunburst panel,
        // which intentionally keeps its own original rainbow/teal scheme.
        solace: {
          green: '#00C895', // Classic Green - primary/CTA
          'green-bright': '#ABFF88',
          'blue-deep': '#093B5F', // backgrounds, headers
          'blue-dark': '#03213B', // deep backgrounds, dark mode
          'green-spring': '#C7FFCB',
          'blue-sky': '#C2F7FF',
          'yellow-sunrise': '#FFF7C2',
          'green-dark': '#009193',
          orange: '#FCA829',
        },
        // Solace Cloud console tokens (solace-cloud-design skill) - used for
        // the whole app UI; the brand palette above stays for logo/accents.
        sc: {
          nav: '#012E4D',
          'nav-active': '#00243D',
          ring: '#7CE2CA',
          'nav-icon': '#99A2B0',
          page: '#F9F9FA',
          canvas: '#F8F9FB',
          border: '#D9DBE1',
          chip: '#ECEDF0',
          'chip-hover': '#E0E2E7',
          text: '#32495B',
          muted: '#778893',
          action: '#007095',
          'action-hover': '#005B7A',
          select: '#21999B',
          success: '#0D7D66',
          'success-bg': '#EBF8F5',
          error: '#D34945',
          'error-bg': '#FDF2F1',
          info: '#ECF6FC',
        },
        gray: {
          12: '#F4F4F4',
          13: '#EAEAEA',
          14: '#D6D6D6',
        },
      },
      fontFamily: {
        heading: ['"New Spirit"', 'Georgia', 'serif'],
        sans: ['Figtree', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Space Mono"', '"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'solace-gradient': 'linear-gradient(135deg, #ABFF88, #00C895)',
        'solace-gradient-deep': 'linear-gradient(135deg, #009193, #093B5F)',
        'solace-gradient-dark': 'linear-gradient(135deg, #093B5F, #03213B)',
      },
    },
  },
  plugins: [],
};
