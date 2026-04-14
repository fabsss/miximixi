import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  deleteRecipe,
  getImageUrl,
  getRecipe,
  translateRecipe,
  updateRecipe,
  uploadRecipeImage,
  type RecipeUpdateRequest,
  type TranslationResponse,
} from '../lib/api'
import type { Ingredient } from '../types'
import { HeartIcon } from '../components/RecipeCard'

const CATEGORY_OPTIONS = ['Vorspeisen', 'Hauptspeisen', 'Nachspeisen', 'Getränke'] as const

const IMPERIAL_TO_METRIC: Record<string, { factor: number; unit: string }> = {
  cup:      { factor: 236.588, unit: 'ml' },
  cups:     { factor: 236.588, unit: 'ml' },
  tasse:    { factor: 236.588, unit: 'ml' },
  tassen:   { factor: 236.588, unit: 'ml' },
  tbsp:     { factor: 15,      unit: 'ml' },
  tsp:      { factor: 5,       unit: 'ml' },
  el:       { factor: 15,      unit: 'ml' },
  tl:       { factor: 5,       unit: 'ml' },
  oz:       { factor: 28.35,   unit: 'g'  },
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
): Array<{ type: 'text' | 'ref'; content: string }> {
  const parts: Array<{ type: 'text' | 'ref'; content: string }> = []
  const regex = /\{(\d+)\}/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex)
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    parts.push({ type: 'ref', content: match[1] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length)
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}

function playBell() {
  try {
    const ctx = new AudioContext()
    ;[1047, 1319, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.28
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.35, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1)
      osc.start(t); osc.stop(t + 1.1)
    })
  } catch (_) {}
}

function StepTimer({ minutes }: { minutes: number }) {
  const totalRef = useRef(minutes * 60)
  const [remaining, setRemaining] = useState(totalRef.current)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const hasRung = useRef(false)

  useEffect(() => {
    if (!running || done) return
    const id = window.setInterval(() => setRemaining((r) => (r <= 1 ? 0 : r - 1)), 1000)
    return () => window.clearInterval(id)
  }, [running, done])

  useEffect(() => {
    if (running && remaining === 0 && !hasRung.current) {
      hasRung.current = true; setRunning(false); setDone(true); playBell()
    }
  }, [remaining, running])

  const reset = () => {
    hasRung.current = false; setRemaining(totalRef.current); setRunning(false); setDone(false)
  }
  const adjustMinutes = (delta: number) => {
    setRemaining((r) => Math.max(0, r + delta * 60))
    if (done) { hasRung.current = false; setDone(false) }
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const labelText = done ? 'Fertig!' : running ? 'Timer läuft' : remaining < totalRef.current ? 'Pausiert' : 'Zeit'
  const labelColor = done || running ? 'text-[var(--mx-primary)]' : 'text-[var(--mx-on-surface-variant)]'

  return (
    <div className="mt-3 inline-flex items-center gap-3 rounded-xl border border-[var(--mx-outline-variant)]/10 bg-[var(--mx-surface-variant)] p-3">
      {running ? (
        <div className="h-10 w-10 flex-shrink-0 rounded-full border-4 border-[var(--mx-primary)] border-t-transparent animate-spin" style={{ animationDuration: '2s' }} />
      ) : (
        <span className={`material-symbols-outlined flex-shrink-0 text-[22px] ${done ? 'text-[var(--mx-primary)]' : 'text-[var(--mx-secondary)]'}`} style={done ? { fontVariationSettings: "'FILL' 1" } : undefined}>
          {done ? 'alarm_on' : 'timer'}
        </span>
      )}
      <div className="min-w-[4.5rem]">
        <span className={`mb-0.5 block text-[10px] font-bold uppercase tracking-widest ${labelColor}`}>{labelText}</span>
        <span className="font-headline text-2xl font-bold tracking-tighter text-[var(--mx-on-surface)]">{mm}:{ss}</span>
      </div>
      <div className="flex flex-col gap-1">
        <button onClick={() => adjustMinutes(1)} title="+1 Minute" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-primary)]/10 hover:text-[var(--mx-primary)] transition-colors">
          <span className="material-symbols-outlined text-[14px]">add</span>
        </button>
        <button onClick={() => adjustMinutes(-1)} title="-1 Minute" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-primary)]/10 hover:text-[var(--mx-primary)] transition-colors">
          <span className="material-symbols-outlined text-[14px]">remove</span>
        </button>
      </div>
      {done ? (
        <button onClick={reset} className="rounded-full border border-[var(--mx-primary)] px-3 py-1 text-xs font-bold text-[var(--mx-primary)] hover:bg-[var(--mx-primary)]/10 transition-colors">Reset</button>
      ) : running ? (
        <button onClick={() => setRunning(false)} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--mx-primary)] text-[var(--mx-on-primary)]">
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>pause</span>
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <button onClick={() => setRunning(true)} className="rounded-full bg-[var(--mx-primary)] px-3 py-1 text-xs font-bold text-[var(--mx-on-primary)] hover:bg-[var(--mx-primary-dim)] transition-colors">
            {remaining < totalRef.current ? 'Weiter' : 'Start'}
          </button>
          {remaining < totalRef.current && (
            <button onClick={reset} className="rounded-full border border-[var(--mx-outline-variant)] px-3 py-1 text-xs font-bold text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-high)] transition-colors">Reset</button>
          )}
        </div>
      )}
    </div>
  )
}

// Types
interface IngredientDraft { name: string; amount: string; unit: string; group_name: string }
interface StepDraft { text: string; time_minutes: string }
interface EditDraft {
  title: string; category: string; servings: string; prep_time: string; cook_time: string; tags: string
  ingredients: IngredientDraft[]; steps: StepDraft[]
}

// Page
export function RecipeDetailPage() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [convertToMetric, setConvertToMetric] = useState(true)
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const recipeQuery = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: () => getRecipe(recipeId!),
    enabled: Boolean(recipeId),
  })

  const translateMutation = useMutation({
    mutationFn: ({ id, lang }: { id: string; lang: string }) => translateRecipe(id, lang),
    onSuccess: (data: TranslationResponse) => setTranslation(data),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecipeUpdateRequest }) => updateRecipe(id, data),
    onSuccess: async () => {
      if (pendingImageFile && recipeId) {
        try { await uploadRecipeImage(recipeId, pendingImageFile) } catch (_) {}
        setPendingImageFile(null); setImagePreviewUrl(null)
      }
      await recipeQuery.refetch()
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      setIsEditMode(false); setEditDraft(null)
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
      navigate('/')
    },
  })

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
    setIsEditMode(true)
  }

  const cancelEditMode = () => {
    setEditDraft(null); setIsEditMode(false); setPendingImageFile(null); setImagePreviewUrl(null)
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

  const getDisplayAmount = (ing: Ingredient): { amount: string; unit: string | null } => {
    const scaled = ing.amount != null ? ing.amount * servingsFactor : null
    if (scaled == null) return { amount: '', unit: ing.unit }
    if (convertToMetric) {
      const conv = IMPERIAL_TO_METRIC[ing.unit?.toLowerCase() ?? '']
      if (conv) return { amount: formatAmount(scaled * conv.factor), unit: conv.unit }
    } else {
      const conv = METRIC_TO_IMPERIAL[ing.unit?.toLowerCase() ?? '']
      if (conv) return { amount: formatAmount(scaled * conv.factor), unit: conv.unit }
    }
    return { amount: formatAmount(scaled), unit: ing.unit }
  }

  const stepsToShow = (translation?.steps ?? recipe.steps) as Array<{ id: string; text: string; time_minutes?: number | null }>
  const categories = recipe.category ? recipe.category.split(',').map((c) => c.trim()).filter(Boolean) : []

  const inputCls = 'block w-full rounded-[1rem] bg-[var(--mx-surface-container)] px-3 py-2 font-body text-sm text-[var(--mx-on-surface)] outline-none focus:ring-2 focus:ring-[var(--mx-primary)]/30'
  const labelCls = 'text-[10px] font-label font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]'
  const miniInputCls = 'rounded-lg bg-[var(--mx-surface-container)] px-2 py-1.5 text-xs text-[var(--mx-on-surface)] outline-none focus:ring-1 focus:ring-[var(--mx-primary)]/30'

  return (
    <div className="-mt-8 pb-20">

      {/* HERO */}
      <section className="pb-6 pt-2">
        <div className="group relative h-[360px] w-full overflow-hidden rounded-[2rem]">
          <img
            src={imagePreviewUrl ?? getImageUrl(recipe.id)}
            alt={recipe.title ?? 'Rezeptbild'}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 w-full max-w-2xl p-6 md:p-8">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {categories.length > 0 ? categories.map((cat, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-[var(--mx-secondary-container)] px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-[var(--mx-secondary)]">
                  <span className="material-symbols-outlined text-[12px]">eco</span>{cat}
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
                <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-white transition-colors">
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
              className={`flex items-center justify-center rounded-full p-2 transition-all active:scale-95 disabled:opacity-50 ${recipe.rating === 1 ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]' : 'bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)]'}`}>
              <HeartIcon filled={recipe.rating === 1} className="h-4 w-4" />
            </button>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="ml-auto flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-red-500 hover:bg-red-500/10 transition-all active:scale-95">
              <span className="material-symbols-outlined text-[14px]">delete</span>Löschen
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
                  {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
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
        <aside className="w-full flex-shrink-0 lg:w-[350px]">
          <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-6 lg:sticky lg:top-24">
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
                  <span className="text-xs font-medium text-[var(--mx-on-surface-variant)]">Portionen anpassen</span>
                  <span className="text-sm font-bold text-[var(--mx-primary)]">{actualServings} {actualServings === 1 ? 'Person' : 'Personen'}</span>
                </div>
                <input type="range" min={1} max={Math.max(baseServings * 4, 12)} step={1} value={actualServings}
                  onChange={(e) => setDisplayServings(parseInt(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--mx-surface-variant)] accent-[var(--mx-primary)]" />
              </div>
            )}

            <div className="space-y-5">
              {[...groupedIngredients.entries()].map(([group, items]) => {
                const showHeader = groupedIngredients.size > 1 || group !== 'Zutaten'
                return (
                  <div key={group}>
                    {showHeader && <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">{group}</p>}
                    <ul className="space-y-2.5">
                      {items.map((ingredient) => {
                        const { amount, unit } = getDisplayAmount(ingredient)
                        const isHighlighted = highlightedSortOrder === String(ingredient.sort_order)
                        return (
                          <li
                            key={ingredient.id}
                            onClick={() => setHighlightedSortOrder(isHighlighted ? null : String(ingredient.sort_order))}
                            className="group flex cursor-pointer items-start justify-between py-1 transition-all duration-150"
                          >
                            <span className={`leading-relaxed transition-all duration-150 ${isHighlighted ? 'text-base font-bold text-[var(--mx-primary)]' : 'text-sm font-medium text-[var(--mx-on-surface)] group-hover:text-[var(--mx-primary)]'}`}>
                              {ingredient.name}
                            </span>
                            {(amount || unit) && (
                              <span className={`ml-3 flex-shrink-0 font-medium transition-all duration-150 ${isHighlighted ? 'text-base font-bold text-[var(--mx-primary)]' : 'text-sm text-[var(--mx-on-surface-variant)]'}`}>
                                {amount}{unit ? ` ${unit}` : ''}
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

            {/* Chef's Note – inline editing */}
            <div className="mt-7 rounded-[1.5rem] border border-[var(--mx-primary-container)]/30 bg-[var(--mx-primary-container)]/20 p-4">
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
                      if (part.type === 'text') return <span key={i}>{part.content}</span>
                      const sortOrder = part.content
                      const ingredient = Array.from(groupedIngredients.values()).flat().find((ing) => String(ing.sort_order) === sortOrder)
                      const isHighlighted = highlightedSortOrder === sortOrder
                      const { amount: tipAmt, unit: tipUnit } = ingredient ? getDisplayAmount(ingredient) : { amount: '', unit: null as string | null }
                      const tipText = [tipAmt, tipUnit].filter(Boolean).join(' ')
                      return (
                        <span key={i} className="relative inline-block">
                          <button type="button" onClick={() => setHighlightedSortOrder(isHighlighted ? null : sortOrder)}
                            className={`rounded-md px-1.5 py-0.5 text-xs font-semibold transition-colors ${isHighlighted ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]' : 'bg-[var(--mx-primary-container)]/40 text-[var(--mx-primary)] hover:bg-[var(--mx-primary-container)]/70'}`}>
                            {ingredient?.name ?? `Zutat #${sortOrder}`}
                          </button>
                          {isHighlighted && tipText && (
                            <span className="lg:hidden pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--mx-on-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--mx-surface)] shadow-lg z-10">
                              {tipText}
                              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--mx-on-surface)]" />
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </p>
                  {step.time_minutes ? <StepTimer minutes={step.time_minutes} /> : null}
                </li>
              )
            })}
          </ol>

          <div className="mt-14 border-t border-[var(--mx-outline-variant)]/20 pt-8">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {recipe.prep_time && <div><span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">Vorbereitung</span><span className="text-sm font-bold text-[var(--mx-on-surface)]">{recipe.prep_time}</span></div>}
              {recipe.cook_time && <div><span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">Kochzeit</span><span className="text-sm font-bold text-[var(--mx-on-surface)]">{recipe.cook_time}</span></div>}
              {recipe.servings && <div><span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">Portionen</span><span className="text-sm font-bold text-[var(--mx-on-surface)]">{actualServings}</span></div>}
              {recipe.source_url ? (
                <div><span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">Quelle</span><a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[var(--mx-primary)] hover:underline">{recipe.source_label || 'Instagram'}</a></div>
              ) : recipe.category ? (
                <div><span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">Kategorie</span><span className="text-sm font-bold text-[var(--mx-on-surface)]">{recipe.category}</span></div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {/* DELETE CONFIRMATION */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-sm rounded-[2rem] bg-[var(--mx-surface)] p-8 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <span className="material-symbols-outlined text-[24px] text-red-600" style={{ fontVariationSettings: "'FILL' 1" }}>delete_forever</span>
            </div>
            <h3 className="font-headline text-xl font-bold text-[var(--mx-on-surface)]">Rezept löschen?</h3>
            <p className="mt-2 font-body text-sm text-[var(--mx-on-surface-variant)]">
              "{recipe.title}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
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
