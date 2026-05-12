import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { Ingredient } from '@miximixi/shared/types'
import { isCupUnit, findDensityForIngredient, convertCupToGram } from '@miximixi/shared/cupConversions'
import type { DensityType } from '@miximixi/shared/cupConversions'
import { useTheme } from '../context/ThemeContext'

interface Props {
  ingredient: Ingredient
  scale: number
  densities: DensityType[]
  highlighted?: boolean
  onPress?: () => void
  testID?: string
}

function formatAmount(amount: number): string {
  if (amount === Math.floor(amount)) return String(amount)
  return amount.toFixed(1).replace(/\.0$/, '')
}

export function IngredientRow({ ingredient, scale, densities, highlighted, onPress, testID }: Props) {
  const { colors } = useTheme()
  const scaledAmount = ingredient.amount != null ? ingredient.amount * scale : null
  const isCup = isCupUnit(ingredient.unit)

  let conversionNote: string | null = null
  if (isCup && scaledAmount != null) {
    const density = findDensityForIngredient(ingredient.name, densities)
    if (density) {
      const { grams } = convertCupToGram(scaledAmount, density)
      conversionNote = `≈ ${Math.round(grams)}g`
    }
  }

  const inner = (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.outlineVariant },
        highlighted && { backgroundColor: `${colors.primaryContainer}80`, borderRadius: 8, paddingHorizontal: 6 },
      ]}
      testID={testID ?? `ingredient-${ingredient.id}`}
    >
      <View style={styles.amountCol}>
        {scaledAmount != null && (
          <Text style={[styles.amount, { color: highlighted ? colors.primaryDim : colors.primary }]}>
            {formatAmount(scaledAmount)}
          </Text>
        )}
        {ingredient.unit && (
          <Text style={[styles.unit, { color: colors.onSurfaceVariant }]}>{ingredient.unit}</Text>
        )}
        {conversionNote && (
          <Text style={[styles.conversion, { color: colors.secondary }]}>{conversionNote}</Text>
        )}
      </View>
      <Text style={[styles.name, { color: highlighted ? colors.primaryDim : colors.onSurface, fontWeight: highlighted ? '700' : '400' }]}>
        {ingredient.name}
      </Text>
    </View>
  )

  if (onPress) {
    return <Pressable onPress={onPress}>{inner}</Pressable>
  }
  return inner
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  amountCol: {
    flexDirection: 'row',
    gap: 4,
    minWidth: 80,
    flexShrink: 0,
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 14,
  },
  conversion: {
    fontSize: 11,
  },
  name: {
    flex: 1,
    fontSize: 14,
  },
})
