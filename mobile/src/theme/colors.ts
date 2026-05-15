export interface CategoryColors {
  bg: string
  text: string
}

export interface AppColors {
  primary: string
  primaryDim: string
  primaryContainer: string
  onPrimary: string
  secondary: string
  secondaryContainer: string
  surface: string
  surfaceLow: string
  surfaceContainer: string
  surfaceHigh: string
  surfaceVariant: string
  onSurface: string
  onSurfaceVariant: string
  outlineVariant: string
  glow: string
  // Semantic aliases
  background: string
  text: string
  textSecondary: string
  border: string
  // Category colors
  cat: {
    vorspeisen: CategoryColors
    hauptspeisen: CategoryColors
    desserts: CategoryColors
    brunch: CategoryColors
    snacks: CategoryColors
    drinks: CategoryColors
    [key: string]: CategoryColors
  }
}

export const LightColors: AppColors = {
  primary:           '#a43f14',
  primaryDim:        '#943308',
  primaryContainer:  '#ffad90',
  onPrimary:         '#fff7f5',
  secondary:         '#526448',
  secondaryContainer:'#e2f7d3',
  surface:           '#fff8f4',
  surfaceLow:        '#fdf1e9',
  surfaceContainer:  '#f8ece2',
  surfaceHigh:       '#f3e6db',
  surfaceVariant:    '#eee0d5',
  onSurface:         '#393129',
  onSurfaceVariant:  '#675d54',
  outlineVariant:    '#bdb0a5',
  glow:              'rgba(57, 49, 41, 0.08)',
  // Aliases
  background:        '#fff8f4',
  text:              '#393129',
  textSecondary:     '#675d54',
  border:            '#bdb0a5',
  cat: {
    vorspeisen:   { bg: '#f3d5a5', text: '#8b5a1a' },
    hauptspeisen: { bg: '#f5d4b3', text: '#8b4a1a' },
    desserts:     { bg: '#e8d4f1', text: '#6a3a6a' },
    brunch:       { bg: '#f5d4de', text: '#7a3a4a' },
    snacks:       { bg: '#d4f1d4', text: '#2d6b2d' },
    drinks:       { bg: '#d4e8f5', text: '#3a5a7a' },
  },
}

export const DarkColors: AppColors = {
  primary:           '#ffb59c',
  primaryDim:        '#e66d41',
  primaryContainer:  '#e66d41',
  onPrimary:         '#5c1900',
  secondary:         '#cfc5b6',
  secondaryContainer:'#4f483d',
  surface:           '#161311',
  surfaceLow:        '#1e1b19',
  surfaceContainer:  '#221f1d',
  surfaceHigh:       '#2d2927',
  surfaceVariant:    '#383432',
  onSurface:         '#e9e1dd',
  onSurfaceVariant:  '#dec0b7',
  outlineVariant:    '#57423b',
  glow:              'rgba(255, 181, 156, 0.1)',
  // Aliases
  background:        '#161311',
  text:              '#e9e1dd',
  textSecondary:     '#dec0b7',
  border:            '#57423b',
  cat: {
    vorspeisen:   { bg: '#4a3520', text: '#e8c080' },
    hauptspeisen: { bg: '#4a3020', text: '#e8b080' },
    desserts:     { bg: '#3a2040', text: '#d4a0e0' },
    brunch:       { bg: '#421a24', text: '#e8a0b0' },
    snacks:       { bg: '#1a3a1a', text: '#90d490' },
    drinks:       { bg: '#1a2a3a', text: '#90c0e0' },
  },
}

export function getCatColors(
  category: string | null | undefined,
  colors: AppColors,
): CategoryColors {
  if (!category) return { bg: colors.surfaceVariant, text: colors.onSurfaceVariant }
  const key = category.toLowerCase()
  return colors.cat[key] ?? { bg: colors.surfaceVariant, text: colors.onSurfaceVariant }
}
