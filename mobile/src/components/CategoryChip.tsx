import { View, Text, StyleSheet } from 'react-native'
import { MaterialIcon } from './MaterialIcon'
import { getCatColors } from '../theme/colors'
import { getCategoryIcon, getCategoryLabel } from '@miximixi/shared/categoryUtils'
import { useTheme } from '../context/ThemeContext'

interface Props {
  category: string
  size?: 'sm' | 'md'
  testID?: string
}

export function CategoryChip({ category, size = 'md', testID }: Props) {
  const { colors, effectiveTheme } = useTheme()
  const isDark = effectiveTheme === 'dark'
  const catColors = getCatColors(category, colors)
  const iconName = getCategoryIcon(category)
  const label = getCategoryLabel(category)
  const isSmall = size === 'sm'

  return (
    <View
      style={[
        styles.chip,
        isSmall && styles.chipSm,
        { backgroundColor: catColors.bg },
      ]}
      testID={testID ?? `category-chip-${category.toLowerCase()}`}
    >
      <MaterialIcon
        name={iconName}
        size={isSmall ? 12 : 14}
        color={catColors.text}
      />
      <Text
        style={[styles.label, isSmall && styles.labelSm, { color: catColors.text }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  labelSm: {
    fontSize: 10,
  },
})
