import { useState, useCallback, useMemo } from 'react'
import {
  View,
  TextInput,
  FlatList,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useInfiniteRecipes } from '../../src/hooks/useInfiniteRecipes'
import { useCategories } from '../../src/hooks/useCategories'
import { getTags, getHeroRecipes } from '@miximixi/shared/api'
import type { RecipeListItem } from '@miximixi/shared/types'
import { RecipeCard } from '../../src/components/RecipeCard'
import { HeroCarousel } from '../../src/components/HeroCarousel'
import { MaterialIcon } from '../../src/components/MaterialIcon'
import { useTheme } from '../../src/context/ThemeContext'

export default function FeedScreen() {
  const { colors } = useTheme()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  const filters = useMemo(() => ({
    q: search || undefined,
    category: selectedCategory ?? undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    favorites: favoritesOnly || undefined,
  }), [search, selectedCategory, selectedTags, favoritesOnly])

  const recipesQuery = useInfiniteRecipes(filters)
  const categoriesQuery = useCategories()

  const tagsQuery = useQuery({
    queryKey: ['tags', selectedCategory],
    queryFn: () => getTags(selectedCategory ?? undefined),
    staleTime: 60_000,
  })

  const heroQuery = useQuery({
    queryKey: ['hero', selectedCategory],
    queryFn: () => getHeroRecipes(6, selectedCategory ?? undefined),
    staleTime: 60_000,
  })

  const allRecipes = useMemo(
    () => recipesQuery.data?.pages.flat() ?? [],
    [recipesQuery.data],
  )

  const handleRecipePress = useCallback((recipe: RecipeListItem) => {
    router.push(`/(app)/recipe/${recipe.slug ?? recipe.id}`)
  }, [])

  const handleCategoryToggle = (cat: string) => {
    setSelectedCategory(prev => prev === cat ? null : cat)
    setSelectedTags([])
  }

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    )
  }

  const ListHeader = (
    <View>
      {/* Hero Carousel */}
      {heroQuery.data && heroQuery.data.length > 0 && (
        <HeroCarousel recipes={heroQuery.data} onPress={handleRecipePress} />
      )}

      {/* Search bar */}
      <View style={[styles.searchRow, { backgroundColor: colors.surfaceContainer }]}>
        <MaterialIcon name="search" size={20} color={colors.onSurfaceVariant} />
        <TextInput
          style={[styles.searchInput, { color: colors.onSurface }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search recipes…"
          placeholderTextColor={colors.onSurfaceVariant}
          returnKeyType="search"
          testID="search-input"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} testID="search-clear">
            <MaterialIcon name="close" size={18} color={colors.onSurfaceVariant} />
          </Pressable>
        )}
      </View>

      {/* Category filter pills */}
      {categoriesQuery.data && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
          testID="category-pills"
        >
          <Pressable
            onPress={() => { setSelectedCategory(null); setSelectedTags([]) }}
            style={[
              styles.pill,
              { backgroundColor: !selectedCategory ? colors.primary : colors.surfaceVariant },
            ]}
            testID="category-pill-all"
          >
            <Text style={{ color: !selectedCategory ? colors.onPrimary : colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' }}>
              All
            </Text>
          </Pressable>
          {categoriesQuery.data.map(cat => (
            <Pressable
              key={cat}
              onPress={() => handleCategoryToggle(cat)}
              style={[
                styles.pill,
                { backgroundColor: selectedCategory === cat ? colors.primary : colors.surfaceVariant },
              ]}
              testID={`category-pill-${cat.toLowerCase()}`}
            >
              <Text style={{ color: selectedCategory === cat ? colors.onPrimary : colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' }}>
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Tag chips */}
      {tagsQuery.data && tagsQuery.data.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
          testID="tag-chips"
        >
          {tagsQuery.data.slice(0, 20).map(tag => (
            <Pressable
              key={tag}
              onPress={() => handleTagToggle(tag)}
              style={[
                styles.tagChip,
                {
                  backgroundColor: selectedTags.includes(tag) ? colors.secondary : colors.surfaceContainer,
                  borderColor: selectedTags.includes(tag) ? colors.secondary : colors.outlineVariant,
                },
              ]}
              testID={`tag-chip-${tag}`}
            >
              <Text style={{ color: selectedTags.includes(tag) ? '#fff' : colors.onSurfaceVariant, fontSize: 12 }}>
                {tag}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Favorites toggle */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setFavoritesOnly(f => !f)}
          style={[styles.favToggle, { backgroundColor: favoritesOnly ? colors.primaryContainer : colors.surfaceContainer }]}
          testID="favorites-toggle"
        >
          <MaterialIcon
            name={favoritesOnly ? 'favorite' : 'favorite_border'}
            size={16}
            color={favoritesOnly ? colors.primary : colors.onSurfaceVariant}
          />
          <Text style={{ color: favoritesOnly ? colors.primary : colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' }}>
            Favorites
          </Text>
        </Pressable>
        <Text style={[styles.countText, { color: colors.onSurfaceVariant }]}>
          {allRecipes.length} recipes
        </Text>
      </View>
    </View>
  )

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {recipesQuery.isError && (
        <Text style={{ color: colors.primary, padding: 16 }}>
          Failed to load recipes
        </Text>
      )}
      <FlatList
        data={allRecipes}
        keyExtractor={r => r.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.cardWrapper}>
            <RecipeCard recipe={item} onPress={handleRecipePress} />
          </View>
        )}
        onEndReached={() => {
          if (recipesQuery.hasNextPage && !recipesQuery.isFetchingNextPage) {
            recipesQuery.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          recipesQuery.isFetchingNextPage ? (
            <ActivityIndicator
              style={{ margin: 16 }}
              color={colors.primary}
              testID="loading-more"
            />
          ) : null
        }
        ListEmptyComponent={
          !recipesQuery.isLoading ? (
            <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
              No recipes found
            </Text>
          ) : (
            <ActivityIndicator style={{ margin: 32 }} color={colors.primary} testID="loading-initial" />
          )
        }
        testID="recipe-grid"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 80 },
  cardWrapper: { flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  favToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  countText: {
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    padding: 32,
    fontSize: 15,
  },
})
