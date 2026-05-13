import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Image,
  Modal,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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

type StepPart = { type: 'text'; content: string } | { type: 'ref'; label: string; sortOrder: number }

function parseIngredientRefs(text: string): StepPart[] {
  const parts: StepPart[] = []
  const pattern = /\[([^\]]+)\]\{(\d+)\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'ref', label: match[1], sortOrder: Number(match[2]) })
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }
  return parts
}

function fmtAmount(n: number): string {
  return n === Math.floor(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { data: densities = [] } = useDensities()

  const [scale, setScale] = useState(1)
  const [isEditing, setIsEditing] = useState(false)
  const [translatedData, setTranslatedData] = useState<{ title: string; ingredients: Record<string, string>; steps: Record<string, string> } | null>(null)
  const [highlightedSortOrder, setHighlightedSortOrder] = useState<number | null>(null)
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null)
  // Inline ingredient tip shown inside the step card that was tapped
  const [activeTip, setActiveTip] = useState<{ stepId: string; text: string } | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const setHighlight = useCallback((sortOrder: number | null) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    setHighlightedSortOrder(sortOrder)
    if (sortOrder !== null) {
      highlightTimer.current = setTimeout(() => setHighlightedSortOrder(null), 3000)
    }
  }, [])

  // Called from StepCard when an ingredient ref is tapped — shows inline bubble in that step
  const handleIngredientRefPress = useCallback((sortOrder: number, stepId: string) => {
    const deselecting = highlightedSortOrder === sortOrder
    setHighlight(deselecting ? null : sortOrder)
    if (deselecting) {
      setActiveTip(null)
      if (tipTimer.current) clearTimeout(tipTimer.current)
      return
    }
    if (recipe) {
      const ing = recipe.ingredients.find(i => i.sort_order === sortOrder)
      if (ing) {
        const scaledAmt = ing.amount != null ? ing.amount * scale : null
        const amtStr = scaledAmt != null ? `${fmtAmount(scaledAmt)}${ing.unit ? ' ' + ing.unit : ''}` : ''
        setActiveTip({ stepId, text: [amtStr, ing.name].filter(Boolean).join(' — ') })
        if (tipTimer.current) clearTimeout(tipTimer.current)
        tipTimer.current = setTimeout(() => setActiveTip(null), 3000)
      }
    }
  }, [highlightedSortOrder, setHighlight, recipe, scale])

  const handleIngredientPress = useCallback((sortOrder: number) => {
    setHighlight(highlightedSortOrder === sortOrder ? null : sortOrder)
  }, [highlightedSortOrder, setHighlight])

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    if (tipTimer.current) clearTimeout(tipTimer.current)
  }, [])

  // ── Custom sticky header (Tabs sets headerShown:false for this screen) ──
  const stickyHeader = (
    <View style={[styles.stickyHeader, { paddingTop: insets.top, backgroundColor: colors.surface, borderBottomColor: colors.outlineVariant }]}>
      <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="back-button" accessibilityLabel="Go back">
        <MaterialIcon name="arrow_back" size={22} color={colors.onSurface} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.onSurface }]} numberOfLines={1}>
        {recipe?.title ?? ''}
      </Text>
      {recipe && (
        <View style={styles.headerActions}>
          <Pressable onPress={handleStartEdit} style={styles.headerBtn} testID="edit-button" accessibilityLabel="Edit recipe">
            <MaterialIcon name="edit" size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable onPress={handleDelete} style={styles.headerBtn} testID="delete-button" accessibilityLabel="Delete recipe">
            <MaterialIcon name="delete" size={22} color={colors.primary} />
          </Pressable>
        </View>
      )}
    </View>
  )

  if (isLoading) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.background }]}>
        {stickyHeader}
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} testID="recipe-loading" />
        </View>
      </View>
    )
  }

  if (error || !recipe) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.background }]}>
        {stickyHeader}
        <View style={styles.centered}>
          <Text style={{ color: colors.primary }}>Recipe not found</Text>
        </View>
      </View>
    )
  }

  const displayTitle = translatedData?.title ?? recipe.title
  const groupedIngredients = groupIngredients(recipe.ingredients)

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {stickyHeader}

      {/* Fullscreen image modal */}
      <Modal
        visible={!!fullscreenImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenImageUri(null)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.fullscreenBackdrop}
          onPress={() => setFullscreenImageUri(null)}
        >
          {fullscreenImageUri && (
            <Image
              source={{ uri: fullscreenImageUri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          <Pressable style={styles.fullscreenClose} onPress={() => setFullscreenImageUri(null)}>
            <MaterialIcon name="close" size={24} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.content}
        testID="recipe-detail-scroll"
      >
        {/* Hero image — tap to fullscreen */}
        {recipe.image_filename && (
          <Pressable
            onPress={() => setFullscreenImageUri(getImageUrl(recipe.id))}
            accessibilityLabel="View full-size image"
            style={styles.heroContainer}
          >
            <Image
              source={{ uri: getImageUrl(recipe.id) }}
              style={styles.heroImage}
              resizeMode="cover"
              testID="recipe-hero-image"
            />
            {/* Gradient fade from image into page background */}
            <LinearGradient
              colors={['transparent', colors.background]}
              style={styles.heroGradient}
            />
            <View style={styles.zoomHint}>
              <MaterialIcon name="zoom_in" size={18} color="#fff" />
            </View>
          </Pressable>
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

          {recipe.tags && recipe.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {recipe.tags.map(tag => (
                <View key={tag} style={[styles.tagChip, { backgroundColor: colors.surfaceHigh, borderColor: colors.outlineVariant }]}>
                  <Text style={[styles.tagText, { color: colors.onSurfaceVariant }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

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

          {/* Rating — single heart toggle (liked = rating 1, neutral = 0) */}
          <Pressable
            onPress={() => handleRating(recipe.rating === 1 ? 0 : 1)}
            style={[styles.ratingBtn, { backgroundColor: recipe.rating === 1 ? colors.primaryContainer : colors.surfaceContainer }]}
            testID="rating-1"
            accessibilityLabel={recipe.rating === 1 ? 'Unlike recipe' : 'Like recipe'}
          >
            <MaterialIcon
              name={recipe.rating === 1 ? 'favorite' : 'favorite_border'}
              size={20}
              color={recipe.rating === 1 ? '#e05b5b' : colors.onSurfaceVariant}
            />
          </Pressable>

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
          <MaterialIcon name="translate" size={16} color={colors.onSurfaceVariant} />
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
          {translateMutation.isPending && <ActivityIndicator color={colors.primary} size="small" />}
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
                    highlighted={highlightedSortOrder === ing.sort_order}
                    onPress={() => handleIngredientPress(ing.sort_order)}
                  />
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Notes / Chef's note */}
        {(recipe.notes || isEditing) && (
          <View style={[styles.section, styles.notesSection, { backgroundColor: colors.primaryContainer }]}>
            <View style={styles.notesTitleRow}>
              <MaterialIcon name="lightbulb" size={16} color={colors.primaryDim} />
              <Text style={[styles.sectionTitle, { color: colors.primaryDim }]}>Chef's Note</Text>
            </View>
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
              <Text style={[styles.notes, { color: colors.primaryDim }]}>{recipe.notes}</Text>
            )}
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
                highlightedSortOrder={highlightedSortOrder}
                activeTip={activeTip}
                onIngredientRefPress={handleIngredientRefPress}
                onImagePress={setFullscreenImageUri}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

interface StepCardProps {
  step: Step
  index: number
  recipeId: string
  recipeTitle: string
  colors: ReturnType<typeof useTheme>['colors']
  highlightedSortOrder: number | null
  activeTip: { stepId: string; text: string } | null
  onIngredientRefPress: (sortOrder: number, stepId: string) => void
  onImagePress: (uri: string) => void
}

function StepCard({ step, index, recipeId, recipeTitle, colors, highlightedSortOrder, activeTip, onIngredientRefPress, onImagePress }: StepCardProps) {
  const parts = parseIngredientRefs(step.text)
  const hasRefs = parts.some(p => p.type === 'ref')
  const tipForThisStep = activeTip?.stepId === step.id ? activeTip : null

  return (
    <View style={[styles.stepCard, { backgroundColor: colors.surfaceHigh }]} testID={`step-card-${index}`}>
      <View style={[styles.stepNumBadge, { backgroundColor: colors.primary }]}>
        <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 13 }}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        {hasRefs ? (
          <Text style={[styles.stepText, { color: colors.onSurface }]}>
            {parts.map((part, i) => {
              if (part.type === 'text') {
                return <Text key={i}>{part.content}</Text>
              }
              const isHighlighted = highlightedSortOrder === part.sortOrder
              return (
                <Text
                  key={i}
                  onPress={() => onIngredientRefPress(part.sortOrder, step.id)}
                  style={{
                    backgroundColor: isHighlighted ? colors.primary : `${colors.primaryContainer}88`,
                    color: isHighlighted ? colors.onPrimary : colors.primaryDim,
                    fontWeight: '700',
                  }}
                >{` ${part.label} `}</Text>
              )
            })}
          </Text>
        ) : (
          <Text style={[styles.stepText, { color: colors.onSurface }]}>{step.text}</Text>
        )}

        {/* Ingredient amount tip — appears right after the step text */}
        {tipForThisStep && (
          <View style={[styles.ingredientTip, { backgroundColor: colors.onSurface }]}>
            <MaterialIcon name="sell" size={12} color={colors.surface} />
            <Text style={[styles.ingredientTipText, { color: colors.surface }]}>{tipForThisStep.text}</Text>
          </View>
        )}

        {step.step_image_filename && (
          <Pressable onPress={() => onImagePress(getStepImageUrl(recipeId, step.step_image_filename!))}>
            <Image
              source={{ uri: getStepImageUrl(recipeId, step.step_image_filename) }}
              style={styles.stepImage}
              resizeMode="cover"
            />
            <View style={[styles.zoomHint, { bottom: 8, right: 8 }]}>
              <MaterialIcon name="zoom_in" size={16} color="#fff" />
            </View>
          </Pressable>
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
  // Custom sticky header (replaces navigation header — Tabs has headerShown:false for this route)
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'NotoSerif_700Bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 0,
  },
  headerBtn: {
    padding: 10,
  },
  content: { paddingBottom: 40 },
  heroContainer: { position: 'relative' },
  heroImage: { width: '100%', aspectRatio: 16 / 9 },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  zoomHint: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    padding: 4,
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 8,
  },
  header: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32, fontFamily: 'NotoSerif_700Bold' },
  titleInput: { fontSize: 22, fontWeight: '700', borderWidth: 1, borderRadius: 8, padding: 8 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 12, fontWeight: '600' },
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
  translateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  langBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  section: { margin: 8, padding: 16, borderRadius: 16, gap: 8 },
  notesSection: { marginTop: 0 },
  notesTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 4 },
  groupLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 8, marginBottom: 4 },
  stepCard: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12, marginBottom: 8 },
  stepNumBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepText: { fontSize: 14, lineHeight: 22, fontFamily: 'PlusJakartaSans_400Regular' },
  ingredientTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ingredientTipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8 },
  notesInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, minHeight: 80 },
  notes: { fontSize: 14, lineHeight: 22 },
})
