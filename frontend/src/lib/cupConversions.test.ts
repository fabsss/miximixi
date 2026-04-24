import { describe, it, expect } from 'vitest'
import {
  isCupUnit,
  findDensityForIngredient,
  convertCupToGram,
  type DensityType,
} from './cupConversions'

const FLOUR: DensityType = {
  type_name: 'flour',
  display_name: 'Mehl / Flour',
  density_g_per_ml: 0.593,
  keywords: ['mehl', 'weizenmehl', 'flour', 'all-purpose flour'],
}

const SUGAR: DensityType = {
  type_name: 'sugar',
  display_name: 'Zucker / Sugar',
  density_g_per_ml: 0.845,
  keywords: ['zucker', 'sugar'],
}

const ALL_DENSITIES = [FLOUR, SUGAR]

describe('isCupUnit', () => {
  it('recognizes cup', () => expect(isCupUnit('cup')).toBe(true))
  it('recognizes cups', () => expect(isCupUnit('cups')).toBe(true))
  it('recognizes tasse', () => expect(isCupUnit('tasse')).toBe(true))
  it('recognizes tassen', () => expect(isCupUnit('tassen')).toBe(true))
  it('is case-insensitive', () => expect(isCupUnit('Cup')).toBe(true))
  it('rejects ml', () => expect(isCupUnit('ml')).toBe(false))
  it('rejects null', () => expect(isCupUnit(null)).toBe(false))
  it('rejects undefined', () => expect(isCupUnit(undefined)).toBe(false))
})

describe('findDensityForIngredient', () => {
  it('finds flour by keyword "mehl"', () => {
    expect(findDensityForIngredient('Mehl', ALL_DENSITIES)).toBe(FLOUR)
  })
  it('finds flour for "Weizenmehl Type 405"', () => {
    expect(findDensityForIngredient('Weizenmehl Type 405', ALL_DENSITIES)).toBe(FLOUR)
  })
  it('finds sugar by keyword "zucker"', () => {
    expect(findDensityForIngredient('Zucker', ALL_DENSITIES)).toBe(SUGAR)
  })
  it('is case-insensitive', () => {
    expect(findDensityForIngredient('MEHL', ALL_DENSITIES)).toBe(FLOUR)
  })
  it('returns null for unknown ingredient', () => {
    expect(findDensityForIngredient('Olivenöl', ALL_DENSITIES)).toBeNull()
  })
  it('returns null for empty densities list', () => {
    expect(findDensityForIngredient('mehl', [])).toBeNull()
  })
})

describe('convertCupToGram', () => {
  it('converts 1 cup flour correctly', () => {
    const { grams, ml } = convertCupToGram(1, FLOUR)
    expect(ml).toBeCloseTo(236.588, 2)
    expect(grams).toBeCloseTo(140.3, 0)  // 236.588 * 0.593
  })
  it('converts 2 cups sugar correctly', () => {
    const { grams, ml } = convertCupToGram(2, SUGAR)
    expect(ml).toBeCloseTo(473.176, 2)
    expect(grams).toBeCloseTo(399.8, 0)  // 473.176 * 0.845
  })
  it('converts 0.5 cups', () => {
    const { ml } = convertCupToGram(0.5, FLOUR)
    expect(ml).toBeCloseTo(118.294, 2)
  })
})
