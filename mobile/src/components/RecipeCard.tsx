import { Pressable, View, Text, Image, StyleSheet } from 'react-native'
import { getImageUrl } from '@miximixi/shared/api'
import type { RecipeListItem } from '@miximixi/shared/types'
import { CategoryChip } from './CategoryChip'
import { MaterialIcon } from './MaterialIcon'
import { useTheme } from '../context/ThemeContext'

interface Props {
  recipe: RecipeListItem
  onPress: (recipe: RecipeListItem) => void
  testID?: string
}

export function RecipeCard({ recipe, onPress, testID }: Props) {
  const { colors } = useTheme()
  const isFavorite = recipe.rating === 1

  return (
    <Pressable
      onPress={() => onPress(recipe)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceContainer },
        pressed && styles.cardPressed,
      ]}
      testID={testID ?? `recipe-card-${recipe.id}`}
      accessibilityRole="button"
      accessibilityLabel={recipe.title}
    >
      {/* Image */}
      <View style={styles.imageContainer}>
        {recipe.image_filename ? (
          <Image
            source={{ uri: getImageUrl(recipe.id) }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.imageFallback, { backgroundColor: colors.surfaceVariant }]} />
        )}
        {isFavorite && (
          <View style={[styles.favBadge, { backgroundColor: colors.primary }]} testID="favorite-badge">
            <MaterialIcon name="favorite" size={12} color={colors.onPrimary} />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text
          style={[styles.title, { color: colors.onSurface }]}
          numberOfLines={2}
        >
          {recipe.title}
        </Text>
        {recipe.category && (
          <CategoryChip category={recipe.category} size="sm" />
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: 4,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  imageContainer: {
    aspectRatio: 4 / 3,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    width: '100%',
    height: '100%',
  },
  favBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 10,
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
})
