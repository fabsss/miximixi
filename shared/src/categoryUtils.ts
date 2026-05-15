export interface CategoryColors {
  bg: string
  text: string
}

export interface CategoryStyle {
  light: CategoryColors
  dark: CategoryColors
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  vorspeisen:   { light: { bg: '#f3d5a5', text: '#8b5a1a' }, dark: { bg: '#4a3520', text: '#e8c080' } },
  hauptspeisen: { light: { bg: '#f5d4b3', text: '#8b4a1a' }, dark: { bg: '#4a3020', text: '#e8b080' } },
  desserts:     { light: { bg: '#e8d4f1', text: '#6a3a6a' }, dark: { bg: '#3a2040', text: '#d4a0e0' } },
  brunch:       { light: { bg: '#f5d4de', text: '#7a3a4a' }, dark: { bg: '#421a24', text: '#e8a0b0' } },
  snacks:       { light: { bg: '#d4f1d4', text: '#2d6b2d' }, dark: { bg: '#1a3a1a', text: '#90d490' } },
  drinks:       { light: { bg: '#d4e8f5', text: '#3a5a7a' }, dark: { bg: '#1a2a3a', text: '#90c0e0' } },
}

const DEFAULT_STYLE: CategoryStyle = {
  light: { bg: 'rgba(255,255,255,0.25)', text: '#ffffff' },
  dark:  { bg: 'rgba(255,255,255,0.15)', text: '#ffffff' },
}

export function getCategoryColors(cat: string, isDark: boolean): CategoryColors {
  const style = CATEGORY_STYLES[cat.toLowerCase()] ?? DEFAULT_STYLE
  return isDark ? style.dark : style.light
}

// Maps to MaterialCommunityIcons names
export function getCategoryIcon(cat: string): string {
  switch (cat.toLowerCase()) {
    case 'vorspeisen':   return 'bowl-mix-outline'
    case 'hauptspeisen': return 'food'
    case 'desserts':     return 'ice-cream'
    case 'brunch':       return 'coffee'
    case 'snacks':       return 'cookie-outline'
    case 'drinks':       return 'cup-water'
    default:             return 'silverware-fork-knife'
  }
}

export function getCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    vorspeisen:   'Vorspeisen',
    hauptspeisen: 'Hauptspeisen',
    desserts:     'Desserts',
    brunch:       'Brunch',
    snacks:       'Snacks',
    drinks:       'Drinks',
  }
  return labels[cat.toLowerCase()] ?? cat
}
