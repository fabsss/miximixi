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
import { useCategories, useCategoryCounts } from '../../src/hooks/useCategories'
import { getTags, getHeroRecipes } from '@miximixi/shared/api'
import type { RecipeListItem } from '@miximixi/shared/types'
import { RecipeCard } from '../../src/components/RecipeCard'
import { CategoryChip } from '../../src/components/CategoryChip'
import { CategoryDrawer } from '../../src/components/CategoryDrawer'
import { HeroCarousel } from '../../src/components/HeroCarousel'
import { MaterialIcon } from '../../src/components/MaterialIcon'
import { useTheme } from '../../src/context/ThemeContext'
import { useDrawer } from '../../src/context/DrawerContext'

export default function FeedScreen() {
  const { colors } = useTheme()
  const { isOpen: drawerOpen, close: closeDrawer } = useDrawer()

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
  const countsQuery = useCategoryCounts()

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

  const handleCategorySelect = useCallback((cat: string | null) => {
    setSelectedCategory(cat)
    setSelectedTags([])
  }, [])

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

      {/* Search bar — in scrollable content, matching web layout (hero → search → tags → grid) */}
      <View style={[styles.searchRow, { backgroundColor: colors.surfaceContainer }]}>
        <MaterialIcon name="search" size={18} color={colors.onSurfaceVariant} />
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

      {/* Active category chip */}
      {selectedCategory && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activeFilterRow}
        >
          <Pressable
            onPress={() => handleCategorySelect(null)}
            style={styles.activeChipWrap}
            accessibilityLabel={`Remove ${selectedCategory} filter`}
          >
            <CategoryChip category={selectedCategory} size="sm" />
            <View style={[styles.removeChipBadge, { backgroundColor: colors.onSurface }]}>
              <MaterialIcon name="close" size={10} color={colors.surface} />
            </View>
          </Pressable>
        </ScrollView>
      )}

      {/* Tag chips + favorites toggle */}
      {tagsQuery.data && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
          testID="tag-chips"
        >
          {/* Favorites toggle — first chip */}
          <Pressable
            onPress={() => setFavoritesOnly(f => !f)}
            style={[
              styles.tagChip,
              {
                backgroundColor: favoritesOnly ? colors.primaryContainer : colors.surfaceContainer,
                borderColor: favoritesOnly ? colors.primary : colors.outlineVariant,
              },
            ]}
            testID="favorites-toggle"
          >
            <MaterialIcon
              name={favoritesOnly ? 'favorite' : 'favorite_border'}
              size={12}
              color={favoritesOnly ? colors.primaryDim : colors.onSurfaceVariant}
            />
            <Text style={{ color: favoritesOnly ? colors.primaryDim : colors.onSurfaceVariant, fontSize: 12, fontWeight: favoritesOnly ? '700' : '400' }}>
              Favorites
            </Text>
          </Pressable>

          {tagsQuery.data.slice(0, 20).map(tag => (
            <Pressable
              key={tag}
              onPress={() => handleTagToggle(tag)}
              style={[
                styles.tagChip,
                {
                  backgroundColor: selectedTags.includes(tag) ? colors.secondaryContainer : colors.surfaceContainer,
                  borderColor: selectedTags.includes(tag) ? colors.secondary : colors.outlineVariant,
                },
              ]}
              testID={`tag-chip-${tag}`}
            >
              <Text style={{ color: selectedTags.includes(tag) ? colors.secondary : colors.onSurfaceVariant, fontSize: 12, fontWeight: selectedTags.includes(tag) ? '700' : '400' }}>
                {tag}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Result count */}
      <View style={styles.countRow}>
        <Text style={[styles.countText, { color: colors.onSurfaceVariant }]}>
          {allRecipes.length} recipe{allRecipes.length !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  )

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {recipesQuery.isError && (
        <Text style={{ color: colors.primary, padding: 16 }}>Failed to load recipes</Text>
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
            <ActivityIndicator style={{ margin: 16 }} color={colors.primary} testID="loading-more" />
          ) : null
        }
        ListEmptyComponent={
          !recipesQuery.isLoading ? (
            <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>No recipes found</Text>
          ) : (
            <ActivityIndicator style={{ margin: 32 }} color={colors.primary} testID="loading-initial" />
          )
        }
        testID="recipe-grid"
      />

      {/* CategoryDrawer uses Modal (statusBarTranslucent) so it covers the full screen */}
      <CategoryDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        categories={categoriesQuery.data ?? []}
        counts={countsQuery.data?.counts ?? {}}
        selectedCategory={selectedCategory}
        onSelectCategory={handleCategorySelect}
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
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  activeFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 6,
    alignItems: 'center',
  },
  activeChipWrap: {
    position: 'relative',
  },
  removeChipBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  countRow: {
    paddingHorizontal: 14,
    paddingBottom: 6,
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
