export type Theme = 'light' | 'dark' | 'system'

export function applyTheme(theme: Theme): 'light' | 'dark' {
  localStorage.setItem('mx-theme', theme)

  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme')
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.setAttribute('data-theme', theme)
  return theme
}
