import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useLocalSearchParams, router, Stack } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Slider from '@react-native-community/slider'
import {
  getRecipe, updateRecipe, deleteRecipe, translateRecipe,
  getImageUrl, getStepImageUrl,
} from '@miximixi/shared/api'
import type { RecipeDetail, Ingredient, Step } from '@miximixi/shared/types'
import { CategoryChip } from '../../../src/components/CategoryChip'
import { IngredientRow } from '../../../src/components/IngredientRow'
import { ConnectedStepTimer } from '../../../src/components/StepTimer'
import { MaterialIcon } from '../../../src/components/MaterialIcon'
import { useTheme } from '../../../src/context/ThemeContext'
import { useDensities } from '../../../src/hooks/useDensities'

const LANGUAGES = ['de', 'en', 'fr', 'it', 'es', 'pl', 'nl']

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const { data: densities = [] } = useDensities()

  const [scale, setScale] = useState(1)
  const [isEditing, setIsEditing] = useState(false)
  const [translatedData, setTranslatedData] = useState<{ title: string; ingredients: Record<string, string>; steps: Record<string, string> } | null>(null)

  // Edit state
  const [editTitle, setEditTitle] = useState('')
  const [editServings, setEditServings] = useState('')
  const [editPrepTime, setEditPrepTime] = useState('')
  const [editCookTime, setEditCookTime] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const { data: recipe, isLoading, error } = useQuery<RecipeDetail>({
    queryKey: ['recipe', id],
    queryFn: () => getRecipe(id!),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateRecipe>[1]) => updateRecipe(id!, data),
    onSuccess: updated => {
      queryClient.setQueryData(['recipe', id], updated)
      setIsEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecipe(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      router.back()
    },
  })

  const translateMutation = useMutation({
    mutationFn: (lang: string) => translateRecipe(id!, lang),
    onSuccess: result => {
      const ingredientMap: Record<string, string> = {}
      const stepMap: Record<string, string> = {}
      result.ingredients.forEach(i => { ingredientMap[String(i.id)] = i.name })
      result.steps.forEach(s => { stepMap[String(s.id)] = s.text })
      setTranslatedData({ title: result.title, ingredients: ingredientMap, steps: stepMap })
    },
  })

  const handleStartEdit = () => {
    if (!recipe) return
    setEditTitle(recipe.title)
    setEditServings(String(recipe.servings ?? ''))
    setEditPrepTime(recipe.prep_time ?? '')
    setEditCookTime(recipe.cook_time ?? '')
    setEditNotes(recipe.notes ?? '')
    setIsEditing(true)
  }

  const handleSave = () => {
    updateMutation.mutate({
      title: editTitle || undefined,
      servings: editServings ? Number(editServings) : undefined,
      prep_time: editPrepTime || undefined,
      cook_time: editCookTime || undefined,
      notes: editNotes || undefined,
    })
  }

  const handleDelete = () => {
    Alert.alert('Delete Recipe', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ])
  }

  const handleRating = (rating: -1 | 0 | 1) => {
    updateMutation.mutate({ rating })
  }

  const handleTranslate = (lang: string) => {
    setTranslatedData(null)
    translateMutation.mutate(lang)
  }

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} testID="recipe-loading" />
      </View>
    )
  }

  if (error || !recipe) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.primary }}>Recipe not found</Text>
      </View>
    )
  }

  const displayTitle = translatedData?.title ?? recipe.title
  const groupedIngredients = groupIngredients(recipe.ingredients)

  return (
    <>
      <Stack.Screen
        options={{
          title: recipe.title,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={handleStartEdit} testID="edit-button">
                <MaterialIcon name="edit" size={22} color={colors.onSurface} />
              </Pressable>
              <Pressable onPress={handleDelete} testID="delete-button">
                <MaterialIcon name="delete" size={22} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        testID="recipe-detail-scroll"
      >
        {/* Hero image */}
        {recipe.image_filename && (
          <Image
            source={{ uri: getImageUrl(recipe.id) }}
            style={styles.heroImage}
            resizeMode="cover"
            testID="recipe-hero-image"
          />
        )}

        {/* Header */}
        <View style={styles.header}>
          {isEditing ? (
            <TextInput
              style={[styles.titleInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
              value={editTitle}
              onChangeText={setEditTitle}
              multiline
              testID="title-input"
            />
          ) : (
            <Text style={[styles.title, { color: colors.onSurface }]} testID="recipe-title">
              {displayTitle}
            </Text>
          )}

          {recipe.category && <CategoryChip category={recipe.category} />}

          {/* Meta row */}
          <View style={styles.metaRow}>
            {(recipe.prep_time || isEditing) && (
              <View style={styles.metaItem}>
                <MaterialIcon name="schedule" size={14} color={colors.onSurfaceVariant} />
                {isEditing ? (
                  <TextInput
                    value={editPrepTime}
                    onChangeText={setEditPrepTime}
                    placeholder="Prep time"
                    style={[styles.metaInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                    testID="prep-time-input"
                  />
                ) : (
                  <Text style={[styles.metaText, { color: colors.onSurfaceVariant }]}>{recipe.prep_time}</Text>
                )}
              </View>
            )}
            {(recipe.cook_time || isEditing) && (
              <View style={styles.metaItem}>
                <MaterialIcon name="timer" size={14} color={colors.onSurfaceVariant} />
                {isEditing ? (
                  <TextInput
                    value={editCookTime}
                    onChangeText={setEditCookTime}
                    placeholder="Cook time"
                    style={[styles.metaInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                    testID="cook-time-input"
                  />
                ) : (
                  <Text style={[styles.metaText, { color: colors.onSurfaceVariant }]}>{recipe.cook_time}</Text>
                )}
              </View>
            )}
          </View>

          {/* Rating */}
          <View style={styles.ratingRow}>
            {([-1, 0, 1] as const).map(r => (
              <Pressable
                key={r}
                onPress={() => handleRating(r)}
                style={[
                  styles.ratingBtn,
                  { backgroundColor: recipe.rating === r ? colors.primaryContainer : colors.surfaceContainer },
                ]}
                testID={`rating-${r}`}
              >
                <Text style={{ color: recipe.rating === r ? colors.primary : colors.onSurfaceVariant, fontSize: 16 }}>
                  {r === 1 ? '❤️' : r === -1 ? '👎' : '😐'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Cook mode button */}
          <Pressable
            onPress={() => router.push(`/(app)/cook/${recipe.slug ?? recipe.id}`)}
            style={[styles.cookBtn, { backgroundColor: colors.primary }]}
            testID="cook-button"
          >
            <MaterialIcon name="restaurant" size={18} color={colors.onPrimary} />
            <Text style={[styles.cookBtnText, { color: colors.onPrimary }]}>Start Cooking</Text>
          </Pressable>
        </View>

        {/* Edit actions */}
        {isEditing && (
          <View style={styles.editActions}>
            <Pressable
              onPress={() => setIsEditing(false)}
              style={[styles.actionBtn, { backgroundColor: colors.surfaceContainer }]}
              testID="cancel-edit-button"
            >
              <Text style={{ color: colors.onSurface }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              testID="save-edit-button"
            >
              {updateMutation.isPending ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={{ color: colors.onPrimary }}>Save</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Translation row */}
        <View style={styles.translateRow}>
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Translate:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {LANGUAGES.map(lang => (
                <Pressable
                  key={lang}
                  onPress={() => handleTranslate(lang)}
                  style={[styles.langBtn, { backgroundColor: colors.surfaceContainer }]}
                  testID={`translate-${lang}`}
                >
                  <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: '600' }}>
                    {lang.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {translateMutation.isPending && <ActivityIndicator color={colors.primary} />}
        </View>

        {/* Servings / scaling */}
        {recipe.servings != null && (
          <View style={[styles.section, { backgroundColor: colors.surfaceContainer }]}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
              Servings: {Math.round(recipe.servings * scale)}
              {scale !== 1 && ` (×${scale.toFixed(1)})`}
            </Text>
            <Slider
              minimumValue={0.5}
              maximumValue={4}
              step={0.5}
              value={scale}
              onValueChange={setScale}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.outlineVariant}
              thumbTintColor={colors.primary}
              testID="scaling-slider"
            />
          </View>
        )}

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surfaceContainer }]}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Ingredients</Text>
            {groupedIngredients.map(({ group, items }) => (
              <View key={group ?? 'default'}>
                {group && (
                  <Text style={[styles.groupLabel, { color: colors.onSurfaceVariant }]}>{group}</Text>
                )}
                {items.map(ing => (
                  <IngredientRow
                    key={ing.id}
                    ingredient={translatedData ? { ...ing, name: translatedData.ingredients[ing.id] ?? ing.name } : ing}
                    scale={scale}
                    densities={densities}
                  />
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Steps */}
        {recipe.steps.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surfaceContainer }]}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Steps</Text>
            {recipe.steps.map((step, idx) => (
              <StepCard
                key={step.id}
                step={translatedData ? { ...step, text: translatedData.steps[step.id] ?? step.text } : step}
                index={idx}
                recipeId={recipe.id}
                recipeTitle={recipe.title}
                colors={colors}
                densities={densities}
              />
            ))}
          </View>
        )}

        {/* Notes */}
        {(recipe.notes || isEditing) && (
          <View style={[styles.section, { backgroundColor: colors.surfaceContainer }]}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Notes</Text>
            {isEditing ? (
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
                style={[styles.notesInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                placeholder="Add notes…"
                placeholderTextColor={colors.onSurfaceVariant}
                testID="notes-input"
              />
            ) : (
              <Text style={[styles.notes, { color: colors.onSurface }]}>{recipe.notes}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </>
  )
}

interface StepCardProps {
  step: Step
  index: number
  recipeId: string
  recipeTitle: string
  colors: ReturnType<typeof useTheme>['colors']
  densities: ReturnType<typeof useDensities>['data']
}

function StepCard({ step, index, recipeId, recipeTitle, colors }: StepCardProps) {
  return (
    <View style={[styles.stepCard, { backgroundColor: colors.surfaceHigh }]} testID={`step-card-${index}`}>
      <View style={[styles.stepNumBadge, { backgroundColor: colors.primary }]}>
        <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 13 }}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={[styles.stepText, { color: colors.onSurface }]}>{step.text}</Text>
        {step.step_image_filename && (
          <Image
            source={{ uri: getStepImageUrl(recipeId, step.step_image_filename) }}
            style={styles.stepImage}
            resizeMode="cover"
          />
        )}
        {step.time_minutes != null && step.time_minutes > 0 && (
          <ConnectedStepTimer
            recipeId={recipeId}
            stepIndex={index}
            stepLabel={step.text.slice(0, 30)}
            recipeTitle={recipeTitle}
            totalSeconds={step.time_minutes * 60}
          />
        )}
      </View>
    </View>
  )
}

function groupIngredients(ingredients: Ingredient[]): { group: string | null; items: Ingredient[] }[] {
  const groups: Map<string | null, Ingredient[]> = new Map()
  for (const ing of ingredients) {
    const key = ing.group_name ?? null
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ing)
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }))
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 40 },
  heroImage: { width: '100%', aspectRatio: 16 / 9 },
  header: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  titleInput: { fontSize: 22, fontWeight: '700', borderWidth: 1, borderRadius: 8, padding: 8 },
  metaRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13 },
  metaInput: { fontSize: 13, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: 100 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingBtn: { padding: 8, borderRadius: 20 },
  cookBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, justifyContent: 'center' },
  cookBtnText: { fontSize: 16, fontWeight: '700' },
  editActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 8 },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  translateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8, flexWrap: 'nowrap' },
  langBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  section: { margin: 8, padding: 16, borderRadius: 16, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  groupLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 8, marginBottom: 4 },
  stepCard: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12, marginBottom: 8 },
  stepNumBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepText: { fontSize: 14, lineHeight: 22 },
  stepImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8 },
  notesInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, minHeight: 80 },
  notes: { fontSize: 14, lineHeight: 22 },
})
