import { getCategoryColors, getCategoryIcon, getCategoryLabel } from '../categoryUtils'

const CATEGORIES = [
  'vorspeisen',
  'hauptspeisen',
  'desserts',
  'brunch',
  'snacks',
  'drinks',
]

describe('getCategoryColors', () => {
  test.each(CATEGORIES)('%s has distinct light bg color', (cat) => {
    const colors = getCategoryColors(cat, false)
    expect(colors.bg).toBeTruthy()
    expect(colors.text).toBeTruthy()
  })

  test.each(CATEGORIES)('%s has distinct dark bg color', (cat) => {
    const colors = getCategoryColors(cat, true)
    expect(colors.bg).toBeTruthy()
    expect(colors.text).toBeTruthy()
  })

  test('all light colors are distinct across categories', () => {
    const bgs = CATEGORIES.map(cat => getCategoryColors(cat, false).bg)
    const unique = new Set(bgs)
    expect(unique.size).toBe(CATEGORIES.length)
  })

  test('all dark colors are distinct across categories', () => {
    const bgs = CATEGORIES.map(cat => getCategoryColors(cat, true).bg)
    const unique = new Set(bgs)
    expect(unique.size).toBe(CATEGORIES.length)
  })

  test('case-insensitive lookup', () => {
    const lower = getCategoryColors('desserts', false)
    const upper = getCategoryColors('Desserts', false)
    const allCaps = getCategoryColors('DESSERTS', false)
    expect(lower).toEqual(upper)
    expect(lower).toEqual(allCaps)
  })

  test('unknown category returns fallback', () => {
    const colors = getCategoryColors('unknown-category', false)
    expect(colors.bg).toBeTruthy()
    expect(colors.text).toBeTruthy()
  })

  test('light and dark modes return different colors for same category', () => {
    const light = getCategoryColors('hauptspeisen', false)
    const dark = getCategoryColors('hauptspeisen', true)
    expect(light.bg).not.toBe(dark.bg)
  })
})

describe('getCategoryIcon', () => {
  test.each(CATEGORIES)('%s returns a non-empty icon name', (cat) => {
    expect(getCategoryIcon(cat)).toBeTruthy()
  })

  test('unknown category returns default icon', () => {
    expect(getCategoryIcon('unknown')).toBe('silverware-fork-knife')
  })

  test('case-insensitive lookup', () => {
    expect(getCategoryIcon('Drinks')).toBe(getCategoryIcon('drinks'))
    expect(getCategoryIcon('SNACKS')).toBe(getCategoryIcon('snacks'))
  })

  test('all icons are distinct', () => {
    const icons = CATEGORIES.map(getCategoryIcon)
    const unique = new Set(icons)
    expect(unique.size).toBe(CATEGORIES.length)
  })
})

describe('getCategoryLabel', () => {
  test.each([
    ['vorspeisen', 'Vorspeisen'],
    ['hauptspeisen', 'Hauptspeisen'],
    ['desserts', 'Desserts'],
    ['brunch', 'Brunch'],
    ['snacks', 'Snacks'],
    ['drinks', 'Drinks'],
  ])('%s → %s', (input, expected) => {
    expect(getCategoryLabel(input)).toBe(expected)
  })

  test('unknown category returns the input unchanged', () => {
    expect(getCategoryLabel('custom')).toBe('custom')
  })
})
