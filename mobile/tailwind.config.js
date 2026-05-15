/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'mx-primary':            '#a43f14',
        'mx-primary-dark':       '#ffb59c',
        'mx-surface':            '#fff8f4',
        'mx-surface-dark':       '#161311',
        'mx-on-surface':         '#393129',
        'mx-on-surface-dark':    '#e9e1dd',
        'mx-surface-container':  '#f8ece2',
        'mx-surface-variant':    '#eee0d5',
        'mx-outline-variant':    '#bdb0a5',
        'mx-secondary':          '#526448',
      },
      fontFamily: {
        headline: ['NotoSerif_400Regular', 'Georgia', 'serif'],
        'headline-bold': ['NotoSerif_700Bold', 'Georgia', 'serif'],
        body: ['PlusJakartaSans_400Regular', 'sans-serif'],
        'body-semibold': ['PlusJakartaSans_600SemiBold', 'sans-serif'],
        label: ['PlusJakartaSans_500Medium', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
