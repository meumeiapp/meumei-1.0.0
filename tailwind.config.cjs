/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './Pages/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './contexts/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    fontSize: {
      xs: ['10px', { lineHeight: '14px' }],
      sm: ['11px', { lineHeight: '15px' }],
      base: ['12px', { lineHeight: '16px' }],
      lg: ['13px', { lineHeight: '18px' }],
      xl: ['14px', { lineHeight: '19px' }],
      '2xl': ['16px', { lineHeight: '22px' }],
      '3xl': ['18px', { lineHeight: '24px' }],
      '4xl': ['22px', { lineHeight: '28px' }],
      '5xl': ['26px', { lineHeight: '32px' }],
      '6xl': ['30px', { lineHeight: '36px' }],
      '7xl': ['34px', { lineHeight: '40px' }]
    },
    extend: {}
  },
  plugins: []
};
