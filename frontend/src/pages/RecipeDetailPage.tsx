import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  getImageUrl,
  getRecipe,
  translateRecipe,
  updateRecipe,
  type RecipeUpdateRequest,
  type TranslationResponse,
} from '../lib/api'
import type { Ingredient } from '../types'
import { HeartIcon } from '../components/RecipeCard'

// Imperial → metric lookup
const IMPERIAL_TO_METRIC: Record<string, { factor: number; unit: string }> = {
  cup:  { factor: 236.588, unit: 'ml' },
  cups: { factor: 236.588, unit: 'ml' },
  tbsp: { factor: 15, unit: 'ml' },
  tsp:  { factor: 5, unit: 'ml' },
  oz:   { factor: 28.35, unit: 'g' },
  lb:   { factor: 453.592, unit: 'g' },
  lbs:  { factor: 453.592, unit: 'g' },
}

function formatAmount(n: number): string {
  if (n <= 0) return ''
  const rounded = Math.round(n * 10) / 10
  return String(rounded)
}

// Parse {N} ingredient references from step text
function parseIngredientReference(
  text: string,
): Array<{ type: 'text' | 'ref'; content: string }> {
  const parts: Array<{ type: 'text' | 'ref'; content: string }> = []
  const regex = /\{(\d+)\}/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'ref', content: match[1] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }
  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}

interface EditDraft {
  title: string
  category: string
  servings: string
  prep_time: string
  cook_time: string
  notes: string
  tags: string
}

export function RecipeDetailPage() {
  const { recipeId } = useParams<{ recipeId: string }>()

  // view state
  const [convertToMetric, setConvertToMetric] = useState(false)
  const [displayServings, setDisplayServings] = useState<number | null>(null)
  const [highlightedSortOrder, setHighlightedSortOrder] = useState<string | null>(null)
  const [showTranslateModal, setShowTranslateModal] = useState(false)
  const [translateLang, setTranslateLang] = useState('en')
  const [translation, setTranslation] = useState<TranslationResponse | null>(null)

  // edit state
  const [isEditMode, setIsEditMode] = useState(false)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)

  const recipeQuery = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: () => getRecipe(recipeId!),
    enabled: Boolean(recipeId),
  })

  const translateMutation = useMutation({
    mutationFn: ({ id, lang }: { id: string; lang: string }) =>
      translateRecipe(id, lang),
    onSuccess: (data: TranslationResponse) => {
      setTranslation(data)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecipeUpdateRequest }) =>
      updateRecipe(id, data),
    onSuccess: () => {
      recipeQuery.refetch()
      setIsEditMode(false)
      setEditDraft(null)
    },
  })

  const groupedIngredients = useMemo(() => {
    const map = new Map<string, Ingredient[]>()
    for (const ing of recipeQuery.data?.ingredients ?? []) {
      // Prefer group_name, fall back to section, then default
      const group = ing.group_name || ing.section || 'Zutaten'
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push(ing)
    }
    return map
  }, [recipeQuery.data?.ingredients])

  if (recipeQuery.isLoading) {
    return (
      <p className="rounded-[2rem] bg-[var(--mx-surface-low)] p-8 text-[var(--mx-on-surface)]">
        Lade Rezept ...
      </p>
    )
  }

  if (recipeQuery.error || !recipeQuery.data) {
    return (
      <p className="rounded-[2rem] bg-red-100/70 p-8 text-red-800">
        Rezept konnte nicht geladen werden.
      </p>
    )
  }

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
      notes: recipe.notes ?? '',
      tags: (recipe.tags ?? []).join(', '),
    })
    setIsEditMode(true)
  }

  const cancelEditMode = () => {
    setEditDraft(null)
    setIsEditMode(false)
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
      notes: editDraft.notes || undefined,
      tags: editDraft.tags
        ? editDraft.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined,
    }
    updateMutation.mutate({ id: recipeId, data })
  }

  const getDisplayAmount = (ing: Ingredient): { amount: string; unit: string | null } => {
    const scaled = ing.amount != null ? ing.amount * servingsFactor : null
    if (scaled == null) return { amount: '', unit: ing.unit }
    if (convertToMetric) {
      const conv = IMPERIAL_TO_METRIC[ing.unit?.toLowerCase() ?? '']
      if (conv) {
        return { amount: formatAmount(scaled * conv.factor), unit: conv.unit }
      }
    }
    return { amount: formatAmount(scaled), unit: ing.unit }
  }

  const stepsToShow = (translation?.steps ?? recipe.steps) as Array<{
    id: string
    text: string
    time_minutes?: number | null
  }>

  const inputClass =
    'block w-full rounded-lg bg-[var(--mx-surface-container)] px-3 py-2 text-[var(--mx-on-surface)] outline-none'

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-[var(--mx-surface-container)]">
        <img
          src={getImageUrl(recipe.id)}
          alt={recipe.title}
          className="h-[300px] w-full object-cover md:h-[460px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          {isEditMode && editDraft ? (
            <>
              <input
                value={editDraft.category}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, category: e.target.value } : d))
                }
                placeholder="Kategorie"
                className="mb-3 block rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white outline-none"
              />
              <input
                value={editDraft.title}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, title: e.target.value } : d))
                }
                placeholder="Titel"
                className="block w-full rounded-xl border border-white/30 bg-white/15 px-4 py-2 text-3xl text-white outline-none md:text-5xl"
              />
            </>
          ) : (
            <>
              <div className="mb-3 flex items-start gap-2">
                {recipe.category
                  ? recipe.category
                      .split(',')
                      .map((c) => c.trim())
                      .filter(Boolean)
                      .map((cat, i) => (
                        <p
                          key={i}
                          className="inline-flex rounded-full bg-black/30 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white/80 backdrop-blur-sm"
                        >
                          {cat}
                        </p>
                      ))
                  : (
                    <p className="inline-flex rounded-full bg-black/30 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white/80 backdrop-blur-sm">
                      Rezept
                    </p>
                  )}
              </div>
              <h2 className="text-3xl text-white md:text-5xl">
                {translation?.title || recipe.title}
              </h2>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {!isEditMode && (
              <Link
                to={`/cook/${recipe.id}`}
                className="rounded-full bg-[var(--mx-primary)] px-6 py-3 text-sm font-bold text-[var(--mx-on-primary)]"
              >
                Kochmodus starten
              </Link>
            )}
            <Link
              to="/"
              className="rounded-full bg-[var(--mx-surface)] px-6 py-3 text-sm font-bold text-[var(--mx-on-surface)] shadow-sm"
            >
              Zurück zum Feed
            </Link>
          </div>
        </div>
      </section>

      {/* Controls bar */}
      <div className="mx-glass flex flex-wrap items-center justify-center gap-2 rounded-[2rem] p-4">
        {isEditMode ? (
          <>
            <button
              onClick={saveEdit}
              disabled={updateMutation.isPending}
              className="rounded-full bg-[var(--mx-primary)] px-6 py-2 text-sm font-bold text-[var(--mx-on-primary)] disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Speichert ...' : 'Speichern'}
            </button>
            <button
              onClick={cancelEditMode}
              className="rounded-full bg-[var(--mx-surface-high)] px-6 py-2 text-sm font-bold text-[var(--mx-on-surface)]"
            >
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <button
              onClick={enterEditMode}
              className="rounded-full bg-[var(--mx-surface-high)] px-4 py-2 text-xs font-bold text-[var(--mx-on-surface)]"
            >
              Bearbeiten
            </button>
            <button
              onClick={() => setShowTranslateModal(true)}
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                translation
                  ? 'bg-[var(--mx-secondary-container)] text-[var(--mx-secondary)]'
                  : 'bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)]'
              }`}
            >
              {translation ? 'Uebersetzt' : 'Uebersetzen'}
            </button>
            <button
              onClick={() => {
                if (!recipeId) return
                updateMutation.mutate({
                  id: recipeId,
                  data: { rating: recipe.rating === 1 ? 0 : 1 },
                })
              }}
              disabled={updateMutation.isPending}
              title={recipe.rating === 1 ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50 ${
                recipe.rating === 1
                  ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                  : 'bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)]'
              }`}
            >
              <HeartIcon filled={recipe.rating === 1} className="h-3.5 w-3.5" />
              {recipe.rating === 1 ? 'Favorit' : 'Favorisieren'}
            </button>
            <button
              onClick={() => setConvertToMetric(!convertToMetric)}
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                convertToMetric
                  ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                  : 'bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)]'
              }`}
            >
              {convertToMetric ? 'Imperial' : 'Metrisch'}
            </button>
          </>
        )}
      </div>

      {/* Edit mode: metadata panel */}
      {isEditMode && editDraft && (
        <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-6">
          <h3 className="mb-4 text-lg font-bold text-[var(--mx-on-surface)]">
            Rezept-Informationen
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
                Portionen
              </span>
              <input
                type="number"
                value={editDraft.servings}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, servings: e.target.value } : d))
                }
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
                Vorbereitung
              </span>
              <input
                value={editDraft.prep_time}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, prep_time: e.target.value } : d))
                }
                placeholder="z.B. 15 min"
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
                Kochzeit
              </span>
              <input
                value={editDraft.cook_time}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, cook_time: e.target.value } : d))
                }
                placeholder="z.B. 30 min"
                className={inputClass}
              />
            </label>
            <label className="space-y-1 sm:col-span-2 md:col-span-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
                Kategorien (kommagetrennt)
              </span>
              <input
                value={editDraft.category}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, category: e.target.value } : d))
                }
                placeholder="z.B. Pasta, Vegetarisch, Hauptgericht"
                className={inputClass}
              />
            </label>
            <label className="space-y-1 sm:col-span-2 md:col-span-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
                Tags (kommagetrennt)
              </span>
              <input
                value={editDraft.tags}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, tags: e.target.value } : d))
                }
                placeholder="z.B. vegetarisch, schnell, pasta"
                className={inputClass}
              />
            </label>
            <label className="space-y-1 sm:col-span-2 md:col-span-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
                Notizen
              </span>
              <textarea
                value={editDraft.notes}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, notes: e.target.value } : d))
                }
                rows={4}
                placeholder="Persoenliche Notizen, Variationen, Tipps ..."
                className={`${inputClass} resize-none`}
              />
            </label>
          </div>
          <p className="mt-4 text-xs text-[var(--mx-on-surface-variant)]">
            Zutaten und Schritte koennen ueber diese Ansicht noch nicht bearbeitet werden.
          </p>
        </div>
      )}

      {/* Meta info bar */}
      {!isEditMode &&
        (recipe.prep_time || recipe.cook_time || (recipe.tags?.length ?? 0) > 0 || recipe.source_url) && (
          <div className="flex flex-wrap gap-2">
            {recipe.prep_time && (
              <span className="rounded-full bg-[var(--mx-surface-container)] px-3 py-1 text-xs font-semibold text-[var(--mx-on-surface)]">
                Vorbereitung: {recipe.prep_time}
              </span>
            )}
            {recipe.cook_time && (
              <span className="rounded-full bg-[var(--mx-surface-container)] px-3 py-1 text-xs font-semibold text-[var(--mx-on-surface)]">
                Kochzeit: {recipe.cook_time}
              </span>
            )}
            {recipe.tags?.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--mx-secondary-container)] px-3 py-1 text-xs font-semibold text-[var(--mx-secondary)]"
              >
                {tag}
              </span>
            ))}
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[var(--mx-surface-container)] px-3 py-1 text-xs font-semibold text-[var(--mx-primary)] hover:underline"
              >
                {recipe.source_label ? `↗ ${recipe.source_label}` : '↗ Originalquelle'}
              </a>
            )}
          </div>
        )}

      {/* Servings adjustment */}
      {!isEditMode && recipe.servings && (
        <div className="mx-glass flex flex-wrap items-center justify-center gap-3 rounded-[2rem] p-4">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
            Portionen
          </span>
          <button
            onClick={() => setDisplayServings(Math.max(1, actualServings - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-lg font-bold text-[var(--mx-on-surface)]"
          >
            -
          </button>
          <input
            type="range"
            min={1}
            max={Math.max(baseServings * 4, 12)}
            step={1}
            value={actualServings}
            onChange={(e) => setDisplayServings(parseInt(e.target.value))}
            className="w-32"
          />
          <button
            onClick={() => setDisplayServings(actualServings + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-lg font-bold text-[var(--mx-on-surface)]"
          >
            +
          </button>
          <span className="min-w-[6.5rem] text-center text-sm font-semibold text-[var(--mx-on-surface)]">
            {actualServings} {actualServings === 1 ? 'Portion' : 'Portionen'}
          </span>
          {displayServings !== null && (
            <button
              onClick={() => setDisplayServings(null)}
              className="rounded-full bg-[var(--mx-surface-high)] px-3 py-1 text-xs text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Main grid */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
        {/* Ingredients sidebar */}
        <aside className="rounded-[2rem] bg-[var(--mx-surface-low)] p-6 lg:sticky lg:top-26 lg:h-fit">
          <h3 className="text-2xl text-[var(--mx-on-surface)]">Zutaten</h3>
          <div className="mt-6 space-y-6">
            {[...groupedIngredients.entries()].map(([group, items]) => {
              const showHeader = groupedIngredients.size > 1 || group !== 'Zutaten'
              return (
                <div key={group} className="space-y-2">
                  {showHeader && (
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
                      {group}
                    </p>
                  )}
                  <ul className="space-y-1 text-sm">
                  {items.map((ingredient) => {
                    const { amount, unit } = getDisplayAmount(ingredient)
                    const isHighlighted =
                      highlightedSortOrder === String(ingredient.sort_order)
                    return (
                      <li
                        key={ingredient.id}
                        onClick={() =>
                          setHighlightedSortOrder(
                            isHighlighted ? null : String(ingredient.sort_order),
                          )
                        }
                        className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition ${
                          isHighlighted
                            ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                            : 'text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-container)]'
                        }`}
                      >
                        <span className="mt-2 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" />
                        <span>
                          {amount && `${amount} `}
                          {unit && `${unit} `}
                          {ingredient.name}
                        </span>
                      </li>
                    )
                  })}
                  </ul>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Instructions */}
        <section className="rounded-[2rem] bg-[var(--mx-surface-container)] p-6 md:p-8">
          <h3 className="text-3xl text-[var(--mx-on-surface)]">Anleitung</h3>
          <ol className="mt-8 space-y-8">
            {stepsToShow.map((step, index) => {
              const parts = parseIngredientReference(step.text)
              return (
                <li key={step.id} className="relative pl-14">
                  <span className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mx-primary)] text-sm font-bold text-[var(--mx-on-primary)]">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-[var(--mx-on-surface-variant)]">
                    {parts.map((part, i) => {
                      if (part.type === 'text') {
                        return <span key={i}>{part.content}</span>
                      }
                      const sortOrder = part.content
                      const ingredient = Array.from(groupedIngredients.values())
                        .flat()
                        .find((ing) => String(ing.sort_order) === sortOrder)
                      const isHighlighted = highlightedSortOrder === sortOrder
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() =>
                            setHighlightedSortOrder(isHighlighted ? null : sortOrder)
                          }
                          className={`rounded px-1 font-semibold transition ${
                            isHighlighted
                              ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                              : 'bg-[var(--mx-primary-container)]/40 text-[var(--mx-primary)] hover:bg-[var(--mx-primary-container)]/60'
                          }`}
                        >
                          {ingredient?.name ?? `Zutat #${sortOrder}`}
                        </button>
                      )
                    })}
                  </p>
                  {step.time_minutes ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[var(--mx-primary)]">
                      {step.time_minutes} min
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </section>
      </section>

      {/* Notes (view mode) – shown at bottom */}
      {!isEditMode && recipe.notes && (
        <div className="rounded-[2rem] border-l-4 border-[var(--mx-primary)] bg-[var(--mx-primary-container)]/20 p-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--mx-primary)]">
            Notizen
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--mx-on-surface)]">
            {recipe.notes}
          </p>
          <button
            onClick={enterEditMode}
            className="mt-3 text-xs font-semibold text-[var(--mx-primary)] hover:underline"
          >
            Bearbeiten
          </button>
        </div>
      )}

      {/* Translate modal */}
      {showTranslateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[2rem] bg-[var(--mx-surface)] p-8 shadow-xl">
            <h3 className="text-2xl font-bold text-[var(--mx-on-surface)]">Uebersetzen</h3>
            <div className="mt-6 space-y-4">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
                  Zielsprache
                </span>
                <select
                  value={translateLang}
                  onChange={(e) => setTranslateLang(e.target.value)}
                  className={inputClass}
                >
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                  <option value="fr">Francais</option>
                  <option value="es">Espanol</option>
                </select>
              </label>
              {translation && (
                <p className="text-sm text-[var(--mx-on-surface-variant)]">
                  Uebersetzung vorhanden. Neu laden?
                </p>
              )}
              {translateMutation.isError && (
                <p className="text-sm text-red-500">
                  Uebersetzung fehlgeschlagen. Bitte erneut versuchen.
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTranslateModal(false)}
                  className="flex-1 rounded-full bg-[var(--mx-surface-high)] px-4 py-2 text-sm font-bold text-[var(--mx-on-surface)]"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (recipeId) {
                      translateMutation.mutate({ id: recipeId, lang: translateLang })
                      setShowTranslateModal(false)
                    }
                  }}
                  disabled={translateMutation.isPending}
                  className="flex-1 rounded-full bg-[var(--mx-primary)] px-4 py-2 text-sm font-bold text-[var(--mx-on-primary)] disabled:opacity-50"
                >
                  {translateMutation.isPending ? 'Uebersetzt ...' : 'Uebersetzen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
