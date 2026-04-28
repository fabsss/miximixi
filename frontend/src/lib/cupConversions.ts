// frontend/src/lib/cupConversions.ts

export interface DensityType {
  type_name: string
  display_name: string | null
  density_g_per_ml: number
  keywords: string[]
}

const CUP_UNITS = new Set(['cup', 'cups', 'tasse', 'tassen'])
const ML_PER_CUP = 236.588

export function isCupUnit(unit: string | null | undefined): boolean {
  return CUP_UNITS.has(unit?.toLowerCase() ?? '')
}

export function findDensityForIngredient(
  name: string,
  densities: DensityType[],
): DensityType | null {
  const lowerName = name.toLowerCase()
  for (const density of densities) {
    for (const keyword of density.keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        return density
      }
    }
  }
  return null
}

export function convertCupToGram(
  amount: number,
  density: DensityType,
): { grams: number; ml: number } {
  const ml = amount * ML_PER_CUP
  const grams = ml * density.density_g_per_ml
  return { grams, ml }
}
