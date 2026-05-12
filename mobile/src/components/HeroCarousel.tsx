import { useRef, useEffect, useCallback, useState } from 'react'
import { View, FlatList, Image, Text, Pressable, StyleSheet, Dimensions } from 'react-native'
import { getImageUrl } from '@miximixi/shared/api'
import type { RecipeListItem } from '@miximixi/shared/types'
import { useTheme } from '../context/ThemeContext'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface Props {
  recipes: RecipeListItem[]
  onPress: (recipe: RecipeListItem) => void
}

export function HeroCarousel({ recipes, onPress }: Props) {
  const { colors } = useTheme()
  const listRef = useRef<FlatList>(null)
  const currentIndex = useRef(0)
  const [dotIndex, setDotIndex] = useState(0)

  const advance = useCallback(() => {
    if (recipes.length < 2) return
    const next = (currentIndex.current + 1) % recipes.length
    listRef.current?.scrollToIndex({ index: next, animated: true })
    currentIndex.current = next
    setDotIndex(next)
  }, [recipes.length])

  useEffect(() => {
    if (recipes.length < 2) return
    const interval = setInterval(advance, 5000)
    return () => clearInterval(interval)
  }, [advance, recipes.length])

  if (recipes.length === 0) return null

  return (
    <View style={styles.wrapper} testID="hero-carousel">
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={recipes}
          keyExtractor={r => r.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
            currentIndex.current = idx
            setDotIndex(idx)
          }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPress(item)}
              style={styles.slide}
              testID={`hero-slide-${item.id}`}
            >
              {item.image_filename ? (
                <Image
                  source={{ uri: getImageUrl(item.id) }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.imageFallback, { backgroundColor: colors.surfaceContainer }]} />
              )}
              <View style={styles.overlay}>
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              </View>
            </Pressable>
          )}
        />
      </View>
      {/* Dot indicators */}
      {recipes.length > 1 && (
        <View style={styles.dots}>
          {recipes.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === dotIndex ? colors.primary : colors.outlineVariant },
                i === dotIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  container: {
    width: '100%',
    aspectRatio: 16 / 7,
  },
  slide: {
    width: SCREEN_WIDTH,
    aspectRatio: 16 / 7,
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
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    borderRadius: 3,
  },
})
