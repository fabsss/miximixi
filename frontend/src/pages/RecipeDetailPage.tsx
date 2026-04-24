import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTimers } from '../context/TimerContext'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  deleteRecipe,
  deleteStepImage,
  getImageUrl,
  getRecipe,
  getStepImageUrl,
  translateRecipe,
  updateRecipe,
  uploadRecipeImage,
  uploadStepImage,
  type RecipeUpdateRequest,
  type TranslationResponse,
} from '../lib/api'
import { useCategories } from '../lib/useCategories'
import { useDensities } from '../lib/useDensities'
import { isCupUnit, findDensityForIngredient, convertCupToGram } from '../lib/cupConversions'
import type { Ingredient, RecipeDetail, Step } from '../types'
import { HeartIcon } from '../components/RecipeCard'
import { categoryChipCls, getCategoryIcon } from '../lib/categoryUtils'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const IMPERIAL_TO_METRIC: Record<string, { factor: number; unit: string; suffix?: string }> = {
  cup:      { factor: 236.588, unit: 'ml' },
  cups:     { factor: 236.588, unit: 'ml' },
  tasse:    { factor: 236.588, unit: 'ml' },
  tassen:   { factor: 236.588, unit: 'ml' },
  tbsp:     { factor: 15,      unit: 'ml', suffix: 'EL' },
  tsp:      { factor: 5,       unit: 'ml', suffix: 'TL' },
  oz:       { factor: 28.35,   unit: 'g'  },
  ounce:    { factor: 28.35,   unit: 'g'  },
  ounces:   { factor: 28.35,   unit: 'g'  },
  lb:       { factor: 453.592, unit: 'g'  },
  lbs:      { factor: 453.592, unit: 'g'  },
}

const METRIC_TO_IMPERIAL: Record<string, { factor: number; unit: string }> = {
  g:   { factor: 1 / 28.35,  unit: 'oz' },
  kg:  { factor: 2.205,      unit: 'lbs' },
  ml:  { factor: 1 / 236.6,  unit: 'cups' },
  l:   { factor: 4.227,      unit: 'cups' },
  cl:  { factor: 1 / 23.66,  unit: 'cups' },
}

function formatAmount(n: number): string {
  if (n <= 0) return ''
  return String(Math.round(n * 10) / 10)
}

function parseIngredientReference(
  text: string,
): Array<{ type: 'text' | 'ref'; content: string; label: string }> {
  const parts: Array<{ type: 'text' | 'ref'; content: string; label: string }> = []
  const regex = /\[([^\]]+)\]\{(\d+)\}/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index), label: '' })
    }
    parts.push({ type: 'ref', content: match[2], label: match[1] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length)
    parts.push({ type: 'text', content: text.slice(lastIndex), label: '' })
  return parts.length > 0 ? parts : [{ type: 'text', content: text, label: '' }]
}

function formatTime(seconds: number): string {
  const abs = Math.abs(seconds)
  const mm = String(Math.floor(abs / 60)).padStart(2, '0')
  const ss = String(Math.floor(abs) % 60).padStart(2, '0')
  return seconds < 0 ? `−${mm}:${ss}` : `${mm}:${ss}`
}

interface StepTimerProps {
  recipeId: string
  recipeTitle: string
  stepIndex: number
  stepLabel: string
  minutes: number
}

const StepTimer = React.memo(function StepTimer({ recipeId, recipeTitle, stepIndex, stepLabel, minutes }: StepTimerProps) {
  const { timers, getRemainingSeconds, startTimer, pauseTimer, resumeTimer, resetTimer, adjustTimer, initializeTimer } = useTimers()
  const id = `${recipeId}:${stepIndex}`
  const timer = timers.get(id)
  const totalSeconds = minutes * 60

  const remaining = timer ? getRemainingSeconds(timer) : totalSeconds
  const isRunning = timer?.isRunning ?? false

  const labelText = isRunning ? 'Timer läuft' : remaining < totalSeconds ? 'Pausiert' : 'Zeit'
  const labelColor = isRunning ? 'text-[var(--mx-primary)]' : 'text-[var(--mx-on-surface-variant)]'

  return (
    <div className="mt-3 inline-flex items-center gap-3 rounded-xl border border-[var(--mx-outline-variant)]/10 bg-[var(--mx-surface-variant)] p-3">
      {isRunning ? (
        <div className="h-10 w-10 flex-shrink-0 rounded-full border-4 border-[var(--mx-primary)] border-t-transparent animate-spin" style={{ animationDuration: '2s' }} />
      ) : (
        <span className="material-symbols-outlined flex-shrink-0 text-[22px] text-[var(--mx-secondary)]">timer</span>
      )}
      <div className="min-w-[4.5rem]">
        <span className={`mb-0.5 block text-[10px] font-bold uppercase tracking-widest ${labelColor}`}>{labelText}</span>
        <span className="font-headline text-2xl font-bold tracking-tighter text-[var(--mx-on-surface)]">{formatTime(remaining)}</span>
      </div>
      <div className="flex flex-col gap-1">
        <button onClick={() => {
          if (!timer) {
            initializeTimer(recipeId, stepIndex, stepLabel, recipeTitle, totalSeconds)
          }
          adjustTimer(id, 60)
        }} title="+1 Minute" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-primary)]/10 hover:text-[var(--mx-primary)] transition-colors">
          <span className="material-symbols-outlined text-[14px]">add</span>
        </button>
        <button onClick={() => {
          if (!timer) {
            initializeTimer(recipeId, stepIndex, stepLabel, recipeTitle, totalSeconds)
          }
          adjustTimer(id, -60)
        }} title="-1 Minute" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-primary)]/10 hover:text-[var(--mx-primary)] transition-colors">
          <span className="material-symbols-outlined text-[14px]">remove</span>
        </button>
      </div>
      {isRunning ? (
        <button onClick={() => pauseTimer(id)} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--mx-primary)] text-[var(--mx-on-primary)]">
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>pause</span>
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => {
              if (!timer) {
                startTimer(recipeId, stepIndex, stepLabel, recipeTitle, totalSeconds)
              } else {
                resumeTimer(id)
              }
            }}
            className="rounded-full bg-[var(--mx-primary)] px-3 py-1 text-xs font-bold text-[var(--mx-on-primary)] hover:bg-[var(--mx-primary-dim)] transition-colors"
          >
            {remaining < totalSeconds ? 'Weiter' : 'Start'}
          </button>
          {remaining < totalSeconds && (
            <button onClick={() => resetTimer(id)} className="rounded-full border border-[var(--mx-outline-variant)] px-3 py-1 text-xs font-bold text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-high)] transition-colors">Reset</button>
          )}
        </div>
      )}
    </div>
  )
})

// Types
interface IngredientDraft { name: string; amount: string; unit: string; group_name: string }
interface StepDraft {
  text: string
  time_minutes: string
  step_image_file?: File | null          // pending file to upload
  step_image_deleted?: boolean            // marks existing image for deletion
  step_image_preview?: string | null      // preview URL (blob or existing)
}
interface EditDraft {
  title: string; category: string; servings: string; prep_time: string; cook_time: string; tags: string
  ingredients: IngredientDraft[]; steps: StepDraft[]
}

async function uploadStepImages(
  recipeId: string,
  stepImageFiles: Record<number, File>,
  stepImageDeleted: Record<number, boolean>,
  recipe: RecipeDetail,
): Promise<void> {
  // Upload new step images
  for (const [stepIdx, file] of Object.entries(stepImageFiles)) {
    const idx = parseInt(stepIdx)
    const step = recipe.steps[idx]
    if (!step) continue
    try {
      await uploadStepImage(recipeId, step.id, file)
    } catch (error) {
      console.error(`Failed to upload image for step ${idx + 1}:`, error)
    }
  }

  // Delete step images marked for deletion
  for (const [stepIdx, isDeleted] of Object.entries(stepImageDeleted)) {
    if (!isDeleted) continue
    const idx = parseInt(stepIdx)
    const step = recipe.steps[idx]
    if (!step) continue
    try {
      await deleteStepImage(recipeId, step.id)
    } catch (error) {
      console.error(`Failed to delete image for step ${idx + 1}:`, error)
    }
  }
}

// Page
export function RecipeDetailPage() {
  const { recipeSlug } = useParams<{ recipeSlug: string }>()
  // Extrahiere UUID aus slug-uuid Format (letzte 36 Zeichen)
  const recipeId = recipeSlug && recipeSlug.length > 36 && recipeSlug[recipeSlug.length - 37] === '-'
    ? recipeSlug.slice(-36)
    : recipeSlug
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const categoriesQuery = useCategories()
  const categoryOptions = categoriesQuery.data

  const [convertToMetric, setConvertToMetric] = useState(true)
  const densities = useDensities()
  const [displayServings, setDisplayServings] = useState<number | null>(null)
  const [highlightedSortOrder, setHighlightedSortOrder] = useState<string | null>(null)
  const [showTranslateModal, setShowTranslateModal] = useState(false)
  const [translateLang, setTranslateLang] = useState('de')
  const [translation, setTranslation] = useState<TranslationResponse | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showFullscreenImage, setShowFullscreenImage] = useState(false)
  const [fullscreenStepImage, setFullscreenStepImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stepImageFileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [stepImageFiles, setStepImageFiles] = useState<Record<number, File>>({})
  const [stepImagePreviews, setStepImagePreviews] = useState<Record<number, string>>({})
  const [stepImageDeleted, setStepImageDeleted] = useState<Record<number, boolean>>({})
  const bubbleTimerRef = useRef<number | null>(null)

  // Prevent screen timeout while viewing a recipe
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null

    const acquire = () =>
      navigator.wakeLock.request('screen').then((s) => { sentinel = s }).catch(() => {})

    acquire()
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      sentinel?.release()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])


  const recipeQuery = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: () => getRecipe(recipeId!),
    enabled: Boolean(recipeId),
  })

  useDocumentTitle(recipeQuery.data ? `Miximixi - ${recipeQuery.data.title}` : 'Miximixi')

  const translateMutation = useMutation({
    mutationFn: ({ id, lang }: { id: string; lang: string }) => translateRecipe(id, lang),
    onSuccess: (data: TranslationResponse) => setTranslation(data),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecipeUpdateRequest }) => updateRecipe(id, data),
    onSuccess: async () => {
      // Upload pending recipe image first
      if (pendingImageFile && recipeId) {
        try {
          await uploadRecipeImage(recipeId, pendingImageFile)
        } catch {
          // Ignore image upload errors - recipe is still saved
        }
        setPendingImageFile(null)
        setImagePreviewUrl(null)
      }

      // Upload step images (new and deleted)
      if (recipeId && (Object.keys(stepImageFiles).length > 0 || Object.keys(stepImageDeleted).length > 0)) {
        try {
          // Refetch recipe first to get fresh step IDs
          const freshRecipe = await getRecipe(recipeId)
          await uploadStepImages(recipeId, stepImageFiles, stepImageDeleted, freshRecipe)
        } catch (error) {
          console.error('Step image upload failed:', error)
        }

        // Revoke blob URLs
        Object.values(stepImagePreviews).forEach((url) => {
          if (url.startsWith('blob:')) {
            URL.revokeObjectURL(url)
          }
        })

        // Clear step image state
        setStepImageFiles({})
        setStepImagePreviews({})
        setStepImageDeleted({})
      }

      await recipeQuery.refetch()
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      setIsEditMode(false)
      setEditDraft(null)
    },
  })

  const notesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => updateRecipe(id, { notes }),
    onSuccess: () => {
      recipeQuery.refetch()
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      setEditingNotes(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecipe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      setShowDeleteConfirm(false)
      navigate('/')
    },
    onError: (error) => {
      console.error('Delete recipe error:', error)
    },
  })

  // Scroll to top when recipe is loaded
  useEffect(() => {
    if (recipeQuery.data) {
      window.scrollTo(0, 0)
    }
  }, [recipeQuery.data])


  const groupedIngredients = useMemo(() => {
    const map = new Map<string, Ingredient[]>()
    for (const ing of recipeQuery.data?.ingredients ?? []) {
      const group = ing.group_name || ing.section || 'Zutaten'
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push(ing)
    }
    return map
  }, [recipeQuery.data?.ingredients])

  if (recipeQuery.isLoading)
    return <div className="flex items-center justify-center py-32"><p className="text-base text-[var(--mx-on-surface-variant)]">Lade Rezept …</p></div>

  if (recipeQuery.error || !recipeQuery.data)
    return <div className="rounded-[2rem] bg-red-100/70 p-8 text-red-800">Rezept konnte nicht geladen werden.</div>

  const recipe = recipeQuery.data
  const baseServings = recipe.servings ?? 1
  const actualServings = displayServings ?? baseServings
  const servingsFactor = baseServings > 0 ? actualServings / baseServings : 1

  const enterEditMode = () => {
    setEditDraft({
      title: recipe.title ?? '',
      category: recipe.category ?? '',
      servings: String(recipe.servings ?? ''),
      prep_time: recipe.prep_time ?? '',
      cook_time: recipe.cook_time ?? '',
      tags: (recipe.tags ?? []).join(', '),
      ingredients: (recipe.ingredients ?? []).map((ing) => ({
        name: ing.name, amount: ing.amount != null ? String(ing.amount) : '',
        unit: ing.unit ?? '', group_name: ing.group_name ?? '',
      })),
      steps: (recipe.steps ?? []).map((s) => ({
        text: s.text, time_minutes: s.time_minutes != null ? String(s.time_minutes) : '',
      })),
    })
    // Initialize step image previews with existing images
    const previews: Record<number, string> = {}
    recipe.steps?.forEach((step, idx) => {
      if (step.step_image_filename) {
        previews[idx] = getStepImageUrl(recipe.id, step.step_image_filename)
      }
    })
    setStepImagePreviews(previews)
    setStepImageFiles({})
    setStepImageDeleted({})
    setIsEditMode(true)
  }

  const cancelEditMode = () => {
    // Revoke all blob URLs before clearing state
    // Recipe image blob URL
    if (imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl)
    }
    // Step image blob URLs
    Object.values(stepImagePreviews).forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    })
    setEditDraft(null)
    setIsEditMode(false)
    setPendingImageFile(null)
    setImagePreviewUrl(null)
    setStepImageFiles({})
    setStepImagePreviews({})
    setStepImageDeleted({})
  }

  const saveEdit = () => {
    if (!editDraft || !recipeId) return
    const parsedServings = parseInt(editDraft.servings)
    const data: RecipeUpdateRequest = {
      title: editDraft.title || undefined,
      category: editDraft.category || undefined,
      servings: parsedServings > 0 ? parsedServings : undefined,
      prep_time: editDraft.prep_time || undefined,
      cook_time: editDraft.cook_time || undefined,
      tags: editDraft.tags ? editDraft.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      ingredients: editDraft.ingredients.map((ing, idx) => ({
        name: ing.name, amount: ing.amount ? parseFloat(ing.amount) : null,
        unit: ing.unit || null, group_name: ing.group_name || null, sort_order: idx + 1,
      })),
      steps: editDraft.steps.map((s, idx) => ({
        text: s.text, time_minutes: s.time_minutes ? parseInt(s.time_minutes) : null, sort_order: idx + 1,
      })),
    }
    updateMutation.mutate({ id: recipeId, data })
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingImageFile(file)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  const addIngredient = () => setEditDraft((d) => d ? { ...d, ingredients: [...d.ingredients, { name: '', amount: '', unit: '', group_name: '' }] } : d)
  const removeIngredient = (idx: number) => setEditDraft((d) => d ? { ...d, ingredients: d.ingredients.filter((_, i) => i !== idx) } : d)
  const updateIngredient = (idx: number, field: keyof IngredientDraft, value: string) =>
    setEditDraft((d) => { if (!d) return d; const ings = [...d.ingredients]; ings[idx] = { ...ings[idx], [field]: value }; return { ...d, ingredients: ings } })

  const addStep = () => setEditDraft((d) => d ? { ...d, steps: [...d.steps, { text: '', time_minutes: '' }] } : d)
  const removeStep = (idx: number) => setEditDraft((d) => d ? { ...d, steps: d.steps.filter((_, i) => i !== idx) } : d)
  const updateStep = (idx: number, field: keyof StepDraft, value: string) =>
    setEditDraft((d) => { if (!d) return d; const steps = [...d.steps]; steps[idx] = { ...steps[idx], [field]: value }; return { ...d, steps } })

  const handleStepImageChange = (stepIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Revoke old blob URL before creating new one
    const oldPreview = stepImagePreviews[stepIdx]
    if (oldPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(oldPreview)
    }

    // Store file and create blob preview
    setStepImageFiles(prev => ({ ...prev, [stepIdx]: file }))

    // Create blob URL for instant preview
    const blobUrl = URL.createObjectURL(file)
    setStepImagePreviews(prev => ({ ...prev, [stepIdx]: blobUrl }))

    // Remove from deleted set if it was marked for deletion
    setStepImageDeleted(prev => { const next = { ...prev }; delete next[stepIdx]; return next })
  }

  const handleStepImageDelete = (stepIdx: number) => {
    // Revoke blob URL if it's a pending upload
    const preview = stepImagePreviews[stepIdx]
    if (preview?.startsWith('blob:')) {
      URL.revokeObjectURL(preview)
    }

    // Mark as deleted
    setStepImageDeleted(prev => ({ ...prev, [stepIdx]: true }))

    // Clear file and preview
    setStepImageFiles(prev => { const next = { ...prev }; delete next[stepIdx]; return next })
    setStepImagePreviews(prev => { const next = { ...prev }; delete next[stepIdx]; return next })
  }

  const handleStepImageUndo = (stepIdx: number, step: Step) => {
    // Revoke any pending blob URL from file selection
    const currentPreview = stepImagePreviews[stepIdx]
    if (currentPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(currentPreview)
    }

    // Restore from existing step image
    if (step.step_image_filename) {
      setStepImagePreviews(prev => ({
        ...prev,
        [stepIdx]: getStepImageUrl(recipe.id, step.step_image_filename!)
      }))
    } else {
      // No existing image - clear preview entirely
      setStepImagePreviews(prev => { const next = { ...prev }; delete next[stepIdx]; return next })
    }

    // Clear pending file
    setStepImageFiles(prev => { const next = { ...prev }; delete next[stepIdx]; return next })
    setStepImageDeleted(prev => { const next = { ...prev }; delete next[stepIdx]; return next })
  }

  const getDisplayAmount = (ing: Ingredient): { amount: string; unit: string | null; suffix?: string } => {
    const scaled = ing.amount != null ? ing.amount * servingsFactor : null
    if (scaled == null) return { amount: '', unit: ing.unit }

    // Check if unit is a cup and density lookup is available
    if (convertToMetric && isCupUnit(ing.unit) && densities.data) {
      const density = findDensityForIngredient(ing.name, densities.data)
      if (density) {
        const { grams, ml } = convertCupToGram(scaled, density)
        const gramsFormatted = formatAmount(grams)
        return {
          amount: `~${gramsFormatted}`,
          unit: 'g',
          suffix: `(${formatAmount(ml)}ml)`,
        }
      }
    }

    if (convertToMetric) {
      const conv = IMPERIAL_TO_METRIC[ing.unit?.toLowerCase() ?? '']
      if (conv) {
        const originalLabel = conv.suffix ? `(${formatAmount(scaled)} ${conv.suffix})` : undefined
        return { amount: formatAmount(scaled * conv.factor), unit: conv.unit, suffix: originalLabel }
      }
    } else {
      const conv = METRIC_TO_IMPERIAL[ing.unit?.toLowerCase() ?? '']
      if (conv) return { amount: formatAmount(scaled * conv.factor), unit: conv.unit }
    }
    return { amount: formatAmount(scaled), unit: ing.unit }
  }

  const stepsToShow = (translation?.steps ?? recipe.steps) as Array<{ id: string; text: string; time_minutes?: number | null; step_image_filename?: string | null }>
  const categories = recipe.category ? recipe.category.split(',').map((c) => c.trim()).filter(Boolean) : []

  const inputCls = 'block w-full rounded-[1rem] bg-[var(--mx-surface-container)] px-3 py-2 font-body text-sm text-[var(--mx-on-surface)] outline-none focus:ring-2 focus:ring-[var(--mx-primary)]/30'
  const labelCls = 'text-[10px] font-label font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]'
  const miniInputCls = 'rounded-lg bg-[var(--mx-surface-container)] px-2 py-1.5 text-xs text-[var(--mx-on-surface)] outline-none focus:ring-1 focus:ring-[var(--mx-primary)]/30'

  return (
    <div className="-mt-8 pb-20">

      {/* HERO */}
      <section className="pb-6 pt-2">
        <div className="group relative h-[360px] w-full cursor-zoom-in overflow-hidden rounded-[2rem]" onClick={(e) => {
          // Don't zoom if clicking on a link
          if ((e.target as HTMLElement).closest('a')) return
          setShowFullscreenImage(true)
        }}>
          <img
            src={imagePreviewUrl ?? getImageUrl(recipe.id)}
            alt={recipe.title ?? 'Rezeptbild'}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          <div className="pointer-events-none absolute bottom-0 left-0 w-full max-w-2xl p-6 md:p-8">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {categories.length > 0 ? categories.map((cat, i) => (
                <span key={i} className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider ${categoryChipCls(cat)}`}>
                  <span className="material-symbols-outlined text-[12px]">{getCategoryIcon(cat)}</span>{cat}
                </span>
              )) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-white/80 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-[12px]">restaurant_menu</span>Rezept
                </span>
              )}
            </div>
            {(recipe.tags?.length ?? 0) > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {recipe.tags!.map((tag) => (
                  <span key={tag} className="rounded-full border border-white/20 bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white/80 backdrop-blur-sm">{tag}</span>
                ))}
              </div>
            )}
            <h2 className="font-headline text-3xl font-bold leading-tight text-white md:text-4xl lg:text-5xl">
              {translation?.title || recipe.title}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-white/85">
              {(recipe.prep_time || recipe.cook_time) && (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px]">schedule</span>
                  <span className="text-xs font-medium">{[recipe.prep_time, recipe.cook_time].filter(Boolean).join(' + ')}</span>
                </div>
              )}
              {recipe.servings && (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px]">people</span>
                  <span className="text-xs font-medium">{actualServings} Portionen</span>
                </div>
              )}
              {recipe.source_url && (
                <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="pointer-events-auto flex items-center gap-1.5 hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[15px]">link</span>
                  <span className="text-xs font-medium">{recipe.source_label ? recipe.source_label.replace(/^@/, '@') : 'Originalquelle'}</span>
                </a>
              )}

            </div>
          </div>
        </div>
      </section>

      {/* CONTROLS BAR */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {isEditMode ? (
          <>
            <button onClick={saveEdit} disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 rounded-full bg-[var(--mx-primary)] px-5 py-2 text-xs font-bold text-[var(--mx-on-primary)] shadow-md transition-all active:scale-95 disabled:opacity-50">
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              {updateMutation.isPending ? 'Speichert …' : 'Speichern'}
            </button>
            <button onClick={cancelEditMode}
              className="rounded-full bg-[var(--mx-surface-high)] px-5 py-2 text-xs font-bold text-[var(--mx-on-surface)] transition-all active:scale-95">
              Abbrechen
            </button>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-red-500 hover:bg-red-500/10 transition-all active:scale-95"
              title="Rezept löschen">
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </>
        ) : (
          <>
            <button onClick={enterEditMode}
              className="flex items-center gap-1.5 rounded-full bg-[var(--mx-surface-high)] px-3.5 py-1.5 text-xs font-bold text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-variant)] transition-all active:scale-95">
              <span className="material-symbols-outlined text-[14px]">edit</span>Bearbeiten
            </button>
            <button onClick={() => setShowTranslateModal(true)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 ${translation ? 'bg-[var(--mx-secondary-container)] text-[var(--mx-secondary)]' : 'bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)]'}`}>
              <span className="material-symbols-outlined text-[14px]">translate</span>
              {translation ? 'Übersetzt' : 'Übersetzen'}
            </button>
            <button
              onClick={() => { if (!recipeId) return; updateMutation.mutate({ id: recipeId, data: { rating: recipe.rating === 1 ? 0 : 1 } }) }}
              disabled={updateMutation.isPending}
              title={recipe.rating === 1 ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
              className={`flex items-center justify-center rounded-full p-3 transition-all active:scale-95 disabled:opacity-50 ${recipe.rating === 1 ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]' : 'bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)]'}`}>
              <HeartIcon filled={recipe.rating === 1} className="h-6 w-6" />
            </button>

          </>
        )}
      </div>

      {/* EDIT PANEL */}
      {isEditMode && editDraft && (
        <div className="mb-6 space-y-6 rounded-[2rem] bg-[var(--mx-surface-low)] p-5">
          <h3 className="font-headline text-lg font-bold text-[var(--mx-on-surface)]">Rezept bearbeiten</h3>

          {/* Image */}
          <div>
            <p className={`${labelCls} mb-2`}>Bild</p>
            <div className="flex items-start gap-4">
              <div className="h-24 w-32 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--mx-surface-container)]">
                <img src={imagePreviewUrl ?? getImageUrl(recipe.id)} alt="Vorschau" className="h-full w-full object-cover" />
              </div>
              <div className="space-y-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--mx-surface-high)] px-4 py-2 text-xs font-bold text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-variant)] transition-colors">
                  <span className="material-symbols-outlined text-[14px]">upload</span>Bild hochladen
                </button>
                {pendingImageFile && <p className="text-[11px] text-[var(--mx-on-surface-variant)]">{pendingImageFile.name}</p>}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div>
            <p className={`${labelCls} mb-3`}>Metadaten</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <label className="space-y-1 sm:col-span-2">
                <span className={labelCls}>Titel</span>
                <input value={editDraft.title} onChange={(e) => setEditDraft((d) => d ? { ...d, title: e.target.value } : d)} className={inputCls} />
              </label>
              <label className="space-y-1">
                <span className={labelCls}>Kategorie</span>
                <select value={editDraft.category} onChange={(e) => setEditDraft((d) => d ? { ...d, category: e.target.value } : d)} className={inputCls}>
                  <option value="">— keine —</option>
                  {(categoryOptions ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className={labelCls}>Portionen</span>
                <input type="number" value={editDraft.servings} onChange={(e) => setEditDraft((d) => d ? { ...d, servings: e.target.value } : d)} className={inputCls} />
              </label>
              <label className="space-y-1">
                <span className={labelCls}>Vorbereitung</span>
                <input value={editDraft.prep_time} onChange={(e) => setEditDraft((d) => d ? { ...d, prep_time: e.target.value } : d)} placeholder="z.B. 15 min" className={inputCls} />
              </label>
              <label className="space-y-1">
                <span className={labelCls}>Kochzeit</span>
                <input value={editDraft.cook_time} onChange={(e) => setEditDraft((d) => d ? { ...d, cook_time: e.target.value } : d)} placeholder="z.B. 30 min" className={inputCls} />
              </label>
              <label className="space-y-1 sm:col-span-2 md:col-span-3">
                <span className={labelCls}>Tags (kommagetrennt)</span>
                <input value={editDraft.tags} onChange={(e) => setEditDraft((d) => d ? { ...d, tags: e.target.value } : d)} placeholder="Vegetarisch, Schnell …" className={inputCls} />
              </label>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <p className={`${labelCls} mb-1`}>Zutaten</p>
            <p className="mb-3 text-[11px] text-[var(--mx-on-surface-variant)]">Menge · Einheit · Name · Gruppe (optional)</p>
            <div className="space-y-2">
              {editDraft.ingredients.map((ing, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-5 flex-shrink-0 text-center text-[11px] text-[var(--mx-on-surface-variant)]">{idx + 1}</span>
                  <input value={ing.amount} onChange={(e) => updateIngredient(idx, 'amount', e.target.value)} placeholder="Menge" className={`${miniInputCls} w-16`} />
                  <input value={ing.unit} onChange={(e) => updateIngredient(idx, 'unit', e.target.value)} placeholder="Einheit" className={`${miniInputCls} w-16`} />
                  <input value={ing.name} onChange={(e) => updateIngredient(idx, 'name', e.target.value)} placeholder="Name der Zutat" className={`${miniInputCls} flex-1`} />
                  <input value={ing.group_name} onChange={(e) => updateIngredient(idx, 'group_name', e.target.value)} placeholder="Gruppe" className={`${miniInputCls} w-24`} />
                  <button onClick={() => removeIngredient(idx)} className="flex-shrink-0 rounded-full p-1 text-red-400 hover:bg-red-500/10 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
              <button onClick={addIngredient} className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--mx-outline-variant)] px-4 py-1.5 text-xs font-bold text-[var(--mx-on-surface-variant)] hover:border-[var(--mx-primary)] hover:text-[var(--mx-primary)] transition-colors">
                <span className="material-symbols-outlined text-[14px]">add</span>Zutat hinzufügen
              </button>
            </div>
          </div>

          {/* Steps */}
          <div>
            <p className={`${labelCls} mb-3`}>Anleitung</p>
            <div className="space-y-3">
              {editDraft.steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="mt-1.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--mx-primary)] text-xs font-bold text-[var(--mx-on-primary)]">{idx + 1}</div>
                  <div className="flex-1 space-y-1">
                    <textarea value={step.text} onChange={(e) => updateStep(idx, 'text', e.target.value)} rows={2} placeholder="Schritt beschreiben …"
                      className="block w-full resize-none rounded-lg bg-[var(--mx-surface-container)] px-3 py-2 font-body text-sm text-[var(--mx-on-surface)] outline-none focus:ring-2 focus:ring-[var(--mx-primary)]/30" />
                    <input value={step.time_minutes} onChange={(e) => updateStep(idx, 'time_minutes', e.target.value)} type="number" placeholder="Zeit (min, optional)"
                      className={`${miniInputCls} w-36`} />
                  {/* Step Picture */}
                  <div className="mt-2">
                    <p className={`${labelCls} mb-2`}>Schritt-Bild</p>
                    {stepImageDeleted[idx] ? (
                      // State 3: Marked for deletion
                      <div className="flex items-center gap-2">
                        <div
                          className="h-[67px] w-[120px] flex-shrink-0 rounded-lg bg-[var(--mx-surface-container)] opacity-50"
                          style={{ aspectRatio: '16/9' }}
                        />
                        <button
                          type="button"
                          onClick={() => handleStepImageUndo(idx, recipe.steps[idx])}
                          className="text-xs font-semibold text-[var(--mx-primary)] hover:underline"
                        >
                          Rückgängig
                        </button>
                      </div>
                    ) : stepImagePreviews[idx] ? (
                      // State 2: Existing or new preview
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <img
                            src={stepImagePreviews[idx]}
                            alt="Schritt Vorschau"
                            className="h-[67px] w-[120px] rounded-lg object-cover"
                            style={{ aspectRatio: '16/9' }}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => stepImageFileInputRefs.current[idx]?.click()}
                            aria-label="Schritt-Bild ändern"
                            className="flex items-center gap-1 rounded-full bg-[var(--mx-primary)] px-3 py-1.5 text-xs font-bold text-[var(--mx-on-primary)] hover:bg-[var(--mx-primary-dim)] transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                            Ändern
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStepImageDelete(idx)}
                            aria-label="Schritt-Bild löschen"
                            className="flex items-center gap-1 rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                            Löschen
                          </button>
                        </div>
                      </div>
                    ) : (
                      // State 1: Empty placeholder
                      <button
                        type="button"
                        onClick={() => stepImageFileInputRefs.current[idx]?.click()}
                        className="flex items-center justify-center gap-2 h-[67px] w-[120px] rounded-lg bg-[var(--mx-surface-container)] border-2 border-dashed border-[var(--mx-outline-variant)] hover:border-[var(--mx-primary)] hover:bg-[var(--mx-primary)]/5 transition-colors"
                        style={{ aspectRatio: '16/9' }}
                      >
                        <span className="material-symbols-outlined text-[20px] text-[var(--mx-on-surface-variant)]">add_a_photo</span>
                      </button>
                    )}
                    <input
                      ref={(el) => {
                        if (el) stepImageFileInputRefs.current[idx] = el
                      }}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleStepImageChange(idx, e)}
                      className="hidden"
                    />
                  </div>
                  </div>
                  <button onClick={() => removeStep(idx)} className="mt-1 flex-shrink-0 rounded-full p-1 text-red-400 hover:bg-red-500/10 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
              <button onClick={addStep} className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--mx-outline-variant)] px-4 py-1.5 text-xs font-bold text-[var(--mx-on-surface-variant)] hover:border-[var(--mx-primary)] hover:text-[var(--mx-primary)] transition-colors">
                <span className="material-symbols-outlined text-[14px]">add</span>Schritt hinzufügen
              </button>
            </div>
          </div>

        </div>
      )}

      {/* MAIN SPLIT */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* INGREDIENTS SIDEBAR */}
        <aside
          className="w-full flex-shrink-0 lg:w-[350px]"
        >
          <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-headline text-xl font-bold text-[var(--mx-on-surface)]">Zutaten</h3>
              <div className="flex rounded-full bg-[var(--mx-surface-variant)] p-0.5">
                <button onClick={() => setConvertToMetric(false)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${!convertToMetric ? 'bg-[var(--mx-surface)] shadow-sm text-[var(--mx-on-surface)]' : 'text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'}`}>
                  Imperial
                </button>
                <button onClick={() => setConvertToMetric(true)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${convertToMetric ? 'bg-[var(--mx-surface)] shadow-sm text-[var(--mx-on-surface)]' : 'text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'}`}>
                  Metrisch
                </button>
              </div>
            </div>

            {recipe.servings && (
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  {actualServings !== baseServings && (
                    <button
                      onClick={() => setDisplayServings(null)}
                      className="text-xs font-medium text-[var(--mx-primary)] hover:underline active:opacity-70 transition-opacity"
                    >
                      Portion zurücksetzen
                    </button>
                  )}
                  <span className="ml-auto text-sm font-bold text-[var(--mx-primary)]">{actualServings} {actualServings === 1 ? 'Person' : 'Personen'}</span>
                </div>
                <input type="range" min={1} max={Math.max(baseServings * 4, 12)} step={1} value={actualServings}
                  onChange={(e) => setDisplayServings(parseInt(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--mx-surface-variant)] accent-[var(--mx-primary)]" />
              </div>
            )}

            <div className="space-y-5">
              {[...groupedIngredients.entries()].map(([group, items]) => {
                const showHeader = group !== 'Zutaten' && group !== ''
                return (
                  <div key={group}>
                    {showHeader && <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">{group}</p>}
                    <ul className="space-y-2.5">
                      {items.map((ingredient) => {
                        const display = getDisplayAmount(ingredient)
                        const isHighlighted = highlightedSortOrder === String(ingredient.sort_order)
                        return (
                          <li
                            id={`ingredient-${ingredient.sort_order}`}
                            key={ingredient.id}
                            onClick={() => setHighlightedSortOrder(isHighlighted ? null : String(ingredient.sort_order))}
                            className="group flex cursor-pointer items-start justify-between py-1 transition-all duration-150"
                          >
                            <span className={`leading-relaxed transition-all duration-150 ${isHighlighted ? 'text-base font-bold text-[var(--mx-primary)]' : 'text-sm font-medium text-[var(--mx-on-surface)] group-hover:text-[var(--mx-primary)]'}`}>
                              {ingredient.name}
                            </span>
                            {(display.amount || display.unit) && (
                              <span className={`ml-3 flex-shrink-0 font-medium transition-all duration-150 ${isHighlighted ? 'text-base font-bold text-[var(--mx-primary)]' : 'text-sm text-[var(--mx-on-surface-variant)]'}`}>
                                {display.amount}
                                {display.unit && ` ${display.unit}`}
                                {display.suffix && <span className="font-body text-[var(--mx-on-surface-variant)] text-xs ml-1">{display.suffix}</span>}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Chef's Note */}
          <div className="mt-4 rounded-[1.5rem] border border-[var(--mx-primary-container)]/30 bg-[var(--mx-primary-container)]/20 p-4">
            <div className="flex gap-3">
              <span className="material-symbols-outlined flex-shrink-0 text-[20px] text-[var(--mx-primary)]">lightbulb</span>
              <div className="min-w-0 flex-1">
                <strong className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--mx-primary)]">Chef's Note</strong>
                {editingNotes ? (
                  <div className="space-y-2">
                    <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={4} autoFocus
                      placeholder="Persönliche Notizen, Variationen, Tipps …"
                      className="block w-full resize-none rounded-lg bg-[var(--mx-surface-container)] px-3 py-2 font-body text-sm text-[var(--mx-on-surface)] outline-none focus:ring-2 focus:ring-[var(--mx-primary)]/30" />
                    <div className="flex gap-2">
                      <button onClick={() => notesMutation.mutate({ id: recipeId!, notes: notesDraft })} disabled={notesMutation.isPending}
                        className="rounded-full bg-[var(--mx-primary)] px-4 py-1.5 text-xs font-bold text-[var(--mx-on-primary)] disabled:opacity-50">
                        {notesMutation.isPending ? 'Speichert …' : 'Speichern'}
                      </button>
                      <button onClick={() => setEditingNotes(false)} className="rounded-full bg-[var(--mx-surface-high)] px-4 py-1.5 text-xs font-bold text-[var(--mx-on-surface)]">Abbrechen</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {recipe.notes ? (
                      <p className="whitespace-pre-wrap font-body text-sm leading-relaxed text-[var(--mx-on-surface)]">{recipe.notes}</p>
                    ) : (
                      <p className="font-body text-sm italic text-[var(--mx-on-surface-variant)]">Noch keine Notizen …</p>
                    )}
                    <button onClick={() => { setNotesDraft(recipe.notes ?? ''); setEditingNotes(true) }}
                      className="mt-2 text-xs font-semibold text-[var(--mx-primary)] hover:underline">
                      {recipe.notes ? 'Bearbeiten' : 'Notiz hinzufügen'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* INSTRUCTIONS */}
        <section className="min-w-0 flex-grow">
          <h3 className="mb-6 font-headline text-2xl font-bold text-[var(--mx-on-surface)]">Anleitung</h3>
          <ol className="space-y-8">
            {stepsToShow.map((step, index) => {
              const parts = parseIngredientReference(step.text)
              return (
                <li key={step.id} className="relative pl-12">
                  <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mx-primary)] text-sm font-bold text-[var(--mx-on-primary)]">{index + 1}</div>
                  <p className="font-body text-sm leading-relaxed text-[var(--mx-on-surface-variant)] md:text-base">
                    {parts.map((part, i) => {
                      if (part.type === 'text') {
                        return <span key={i}>{part.content}</span>
                      }
                      const sortOrder = part.content
                      const ingredient = Array.from(groupedIngredients.values()).flat().find((ing) => String(ing.sort_order) === sortOrder)
                      const isHighlighted = highlightedSortOrder === sortOrder
                      const displayInfo = ingredient ? getDisplayAmount(ingredient) : { amount: '', unit: null as string | null, suffix: undefined }
                      const tipText = [displayInfo.amount, displayInfo.unit, displayInfo.suffix].filter(Boolean).join(' ')
                      return (
                        <span key={i} className="relative inline-block">
                          <button type="button" onClick={() => {
                              const next = isHighlighted ? null : sortOrder
                              setHighlightedSortOrder(next)
                              if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
                              if (next) {
                                // Auto-dismiss bubble after 3s
                                bubbleTimerRef.current = window.setTimeout(() => setHighlightedSortOrder(null), 3000)
                              }                            }}
                            className={`rounded-md px-1.5 py-0.5 text-sm font-semibold transition-colors ${isHighlighted ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]' : 'bg-[var(--mx-primary-container)]/40 text-[var(--mx-primary)] hover:bg-[var(--mx-primary-container)]/70'}`}>
                            {part.label}
                          </button>
                          {isHighlighted && tipText && (
                            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--mx-on-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--mx-surface)] shadow-lg z-10">
                              {tipText}
                              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--mx-on-surface)]" />
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </p>
                  {step.step_image_filename && (
                    <div
                      className="mt-3 inline-block cursor-zoom-in overflow-hidden rounded-lg"
                      onClick={() => {
                        setFullscreenStepImage(getStepImageUrl(recipe.id, step.step_image_filename!))
                      }}
                      style={{ width: '120px', aspectRatio: '16/9' }}
                    >
                      <img
                        src={getStepImageUrl(recipe.id, step.step_image_filename)}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-110"
                      />
                    </div>
                  )}
                  {step.time_minutes && (
                    <div className="mt-3 flex justify-center w-full">
                      <StepTimer
                        recipeId={recipe.id}
                        recipeTitle={recipe.title ?? ''}
                        stepIndex={index}
                        stepLabel={`Schritt ${index + 1}`}
                        minutes={step.time_minutes}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      </div>

      {/* FULLSCREEN IMAGE */}
      <div
        onClick={() => setShowFullscreenImage(false)}
        className={`fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 backdrop-blur-sm transition-all duration-300 ${showFullscreenImage ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <img
          src={getImageUrl(recipe.id)}
          alt={recipe.title ?? 'Rezeptbild'}
          className={`max-h-[90dvh] max-w-[90dvw] rounded-2xl object-contain shadow-2xl transition-all duration-300 ${showFullscreenImage ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}
        />
      </div>

      {/* FULLSCREEN STEP IMAGE */}
      {fullscreenStepImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setFullscreenStepImage(null)}
        >
          <img
            src={fullscreenStepImage}
            alt=""
            className="max-h-[90dvh] max-w-[90dvw] rounded-2xl object-contain"
          />
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="mx-auto w-full max-w-sm rounded-[2rem] bg-[var(--mx-surface)] p-6 shadow-xl md:p-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <span className="material-symbols-outlined text-[24px] text-red-600" style={{ fontVariationSettings: "'FILL' 1" }}>delete_forever</span>
            </div>
            <h3 className="font-headline text-xl font-bold text-[var(--mx-on-surface)]">Rezept löschen?</h3>
            <p className="mt-2 font-body text-sm text-[var(--mx-on-surface-variant)]">
              "{recipe.title}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            {deleteMutation.isError && (
              <p className="mt-4 font-body text-sm text-red-500">Löschen fehlgeschlagen. Bitte versuche es später erneut.</p>
            )}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-full bg-[var(--mx-surface-high)] px-4 py-2.5 text-sm font-bold text-[var(--mx-on-surface)]">Abbrechen</button>
              <button type="button" onClick={() => { if (recipeId) deleteMutation.mutate(recipeId) }} disabled={deleteMutation.isPending}
                className="flex-1 rounded-full bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50">
                {deleteMutation.isPending ? 'Löschen …' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSLATE MODAL */}
      {showTranslateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[2rem] bg-[var(--mx-surface)] p-8 shadow-xl">
            <h3 className="font-headline text-xl font-bold text-[var(--mx-on-surface)]">Übersetzen</h3>
            <div className="mt-5 space-y-4">
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">Zielsprache</span>
                <select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)}
                  className="block w-full rounded-[1rem] bg-[var(--mx-surface-container)] px-3 py-2 font-body text-sm text-[var(--mx-on-surface)] outline-none">
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                </select>
              </label>
              {translation && <p className="font-body text-sm text-[var(--mx-on-surface-variant)]">Übersetzung vorhanden. Neu laden?</p>}
              {translateMutation.isError && <p className="font-body text-sm text-red-500">Übersetzung fehlgeschlagen.</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTranslateModal(false)}
                  className="flex-1 rounded-full bg-[var(--mx-surface-high)] px-4 py-2.5 text-sm font-bold text-[var(--mx-on-surface)]">Abbrechen</button>
                <button type="button"
                  onClick={() => { if (recipeId) { translateMutation.mutate({ id: recipeId, lang: translateLang }); setShowTranslateModal(false) } }}
                  disabled={translateMutation.isPending}
                  className="flex-1 rounded-full bg-[var(--mx-primary)] px-4 py-2.5 text-sm font-bold text-[var(--mx-on-primary)] disabled:opacity-50">
                  {translateMutation.isPending ? 'Übersetzt …' : 'Übersetzen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
