import {
  isCupUnit,
  findDensityForIngredient,
  convertCupToGram,
  type DensityType,
} from '../cupConversions'

const FLOUR: DensityType = {
  type_name: 'flour',
  display_name: 'Flour',
  density_g_per_ml: 0.56,
  keywords: ['flour', 'mehl'],
}

const WATER: DensityType = {
  type_name: 'water',
  display_name: 'Water',
  density_g_per_ml: 1.0,
  keywords: ['water', 'wasser'],
}

const SUGAR: DensityType = {
  type_name: 'sugar',
  display_name: 'Sugar',
  density_g_per_ml: 0.85,
  keywords: ['sugar', 'zucker'],
}

describe('isCupUnit', () => {
  test.each([
    ['cup', true],
    ['cups', true],
    ['Cup', true],
    ['CUPS', true],
    ['tasse', true],
    ['Tassen', true],
    ['g', false],
    ['ml', false],
    ['tbsp', false],
    [null, false],
    [undefined, false],
    ['', false],
  ])('isCupUnit(%s) → %s', (unit, expected) => {
    expect(isCupUnit(unit)).toBe(expected)
  })
})

describe('findDensityForIngredient', () => {
  const densities = [FLOUR, WATER, SUGAR]

  test('finds by exact keyword', () => {
    expect(findDensityForIngredient('flour', densities)).toBe(FLOUR)
  })

  test('finds by German keyword', () => {
    expect(findDensityForIngredient('mehl', densities)).toBe(FLOUR)
  })

  test('finds by partial match in ingredient name', () => {
    expect(findDensityForIngredient('all-purpose flour', densities)).toBe(FLOUR)
  })

  test('is case-insensitive', () => {
    expect(findDensityForIngredient('WATER', densities)).toBe(WATER)
    expect(findDensityForIngredient('Zucker', densities)).toBe(SUGAR)
  })

  test('returns null for unknown ingredient', () => {
    expect(findDensityForIngredient('olive oil', densities)).toBeNull()
  })

  test('returns null for empty densities list', () => {
    expect(findDensityForIngredient('flour', [])).toBeNull()
  })
})

describe('convertCupToGram', () => {
  const ML_PER_CUP = 236.588

  test('1 cup of water = 236.588g', () => {
    const result = convertCupToGram(1, WATER)
    expect(result.ml).toBeCloseTo(ML_PER_CUP, 2)
    expect(result.grams).toBeCloseTo(ML_PER_CUP * 1.0, 2)
  })

  test('1 cup of flour ≈ 132.49g', () => {
    const result = convertCupToGram(1, FLOUR)
    expect(result.ml).toBeCloseTo(ML_PER_CUP, 2)
    expect(result.grams).toBeCloseTo(ML_PER_CUP * 0.56, 2)
  })

  test('0.5 cups of sugar', () => {
    const result = convertCupToGram(0.5, SUGAR)
    expect(result.ml).toBeCloseTo(ML_PER_CUP * 0.5, 2)
    expect(result.grams).toBeCloseTo(ML_PER_CUP * 0.5 * 0.85, 2)
  })

  test('2 cups returns double the 1 cup result', () => {
    const one = convertCupToGram(1, FLOUR)
    const two = convertCupToGram(2, FLOUR)
    expect(two.grams).toBeCloseTo(one.grams * 2, 5)
    expect(two.ml).toBeCloseTo(one.ml * 2, 5)
  })
})
