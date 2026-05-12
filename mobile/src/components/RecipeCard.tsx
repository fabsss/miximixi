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
        {recipe.tags && recipe.tags.length > 0 && (
          <View style={styles.tags}>
            {recipe.tags.slice(0, 3).map(tag => (
              <View key={tag} style={[styles.tagChip, { backgroundColor: colors.surfaceHigh, borderColor: colors.outlineVariant }]}>
                <Text style={[styles.tagText, { color: colors.onSurfaceVariant }]} numberOfLines={1}>{tag}</Text>
              </View>
            ))}
          </View>
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
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  tagChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
  },
})
