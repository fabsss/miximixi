import { Pressable, View, Text, Image, StyleSheet } from 'react-native'
import { getImageUrl } from '@miximixi/shared/api'
import { getCategoryIcon } from '@miximixi/shared/categoryUtils'
import type { RecipeListItem } from '@miximixi/shared/types'
import { MaterialIcon } from './MaterialIcon'
import { getCatColors } from '../theme/colors'
import { useTheme } from '../context/ThemeContext'

interface Props {
  recipe: RecipeListItem
  onPress: (recipe: RecipeListItem) => void
  testID?: string
}

export function RecipeCard({ recipe, onPress, testID }: Props) {
  const { colors } = useTheme()
  const isFavorite = recipe.rating === 1
  const catColors = recipe.category ? getCatColors(recipe.category, colors) : null
  const cardBg = catColors?.bg ?? colors.surfaceContainer
  const iconName = recipe.category ? getCategoryIcon(recipe.category) : null

  return (
    <Pressable
      onPress={() => onPress(recipe)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardBg },
        pressed && styles.cardPressed,
      ]}
      testID={testID ?? `recipe-card-${recipe.id}`}
      accessibilityRole="button"
      accessibilityLabel={recipe.title}
    >
      {/* Image with overlaid badges */}
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

        {/* Category icon badge — top-left, icon only, matching web design */}
        {iconName && catColors && (
          <View style={[styles.catBadge, { backgroundColor: `${catColors.bg}CC` }]}>
            <MaterialIcon name={iconName} size={16} color={catColors.text} />
          </View>
        )}

        {/* Favourite heart — top-right, only when liked */}
        {isFavorite && (
          <View style={styles.favBadge} testID="favorite-badge">
            <MaterialIcon name="favorite" size={14} color="#e05b5b" />
          </View>
        )}
      </View>

      {/* Title + tags below image, on category-coloured background */}
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={2}>
          {recipe.title}
        </Text>
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
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  imageContainer: {
    aspectRatio: 4 / 3,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    width: '100%',
    height: '100%',
  },
  catBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 10,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'NotoSerif_700Bold',
    lineHeight: 22,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tagChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
})
