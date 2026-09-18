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
