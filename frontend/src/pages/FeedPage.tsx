import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecipes } from '../lib/api'
import { RecipeCard, HeartIcon } from '../components/RecipeCard'

const MAIN_CATEGORIES = ['Vorspeisen', 'Hauptspeisen', 'Nachspeisen', 'Getraenke'] as const
type MainCategory = (typeof MAIN_CATEGORIES)[number]

const CATEGORY_LABELS: Record<MainCategory, string> = {
  Vorspeisen: 'Vorspeisen',
  Hauptspeisen: 'Hauptspeisen',
  Nachspeisen: 'Nachspeisen',
  Getraenke: 'Getraenke',
}

const CATEGORY_ICONS: Record<MainCategory, string> = {
  Vorspeisen: 'S',
  Hauptspeisen: 'H',
  Nachspeisen: 'N',
  Getraenke: 'G',
}

export function FeedPage() {
  const [search, setSearch] = useState('')
  const [selectedMainCategory, setSelectedMainCategory] = useState<MainCategory | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  const recipesQuery = useQuery({
    queryKey: ['recipes'],
    queryFn: () => getRecipes(80),
  })

  // Count recipes per main category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of recipesQuery.data ?? []) {
      if (r.category) counts[r.category] = (counts[r.category] ?? 0) + 1
    }
    return counts
  }, [recipesQuery.data])

  // Tags available in the current main category
  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    for (const r of recipesQuery.data ?? []) {
      if (!selectedMainCategory || r.category === selectedMainCategory) {
        for (const t of r.tags ?? []) tags.add(t)
      }
    }
    return Array.from(tags).sort()
  }, [recipesQuery.data, selectedMainCategory])

  const filteredRecipes = useMemo(() => {
    const value = search.trim().toLowerCase()
    return (recipesQuery.data ?? []).filter((recipe) => {
      const titleMatch = recipe.title.toLowerCase().includes(value)
      const tagMatch = recipe.tags?.some((t) => t.toLowerCase().includes(value))
      const categoryMatch = recipe.category?.toLowerCase().includes(value)
      const searchOk = !value || titleMatch || tagMatch || categoryMatch
      const mainCatOk = !selectedMainCategory || recipe.category === selectedMainCategory
      const tagOk = !selectedTag || recipe.tags?.includes(selectedTag)
      const favoriteOk = !showFavoritesOnly || recipe.rating === 1
      return searchOk && mainCatOk && tagOk && favoriteOk
    })
  }, [recipesQuery.data, search, selectedMainCategory, selectedTag, showFavoritesOnly])

  const handleMainCat = (cat: MainCategory | null) => {
    setSelectedMainCategory(cat)
    setSelectedTag(null)
    setShowFavoritesOnly(false)
  }

  const sidebarBtnClass = (active: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
      active
        ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
        : 'text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-container)]'
    }`

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Sidebar – desktop sticky, mobile horizontal scroll */}
      <aside className="lg:sticky lg:top-28 lg:w-52 lg:flex-shrink-0">
        {/* Desktop sidebar */}
        <nav className="hidden lg:block rounded-[2rem] bg-[var(--mx-surface-low)] p-4 space-y-1">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mx-on-surface-variant)]">
            Kategorien
          </p>
          <button
            onClick={() => handleMainCat(null)}
            className={sidebarBtnClass(!selectedMainCategory && !showFavoritesOnly)}
          >
            <span>Alle</span>
            <span className="text-xs opacity-60">{recipesQuery.data?.length ?? 0}</span>
          </button>
          {MAIN_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleMainCat(cat)}
              className={sidebarBtnClass(selectedMainCategory === cat)}
            >
              <span>{CATEGORY_LABELS[cat]}</span>
              {categoryCounts[cat] != null && (
                <span className="text-xs opacity-60">{categoryCounts[cat]}</span>
              )}
            </button>
          ))}
          <div className="pt-2">
            <button
              onClick={() => {
                setShowFavoritesOnly(!showFavoritesOnly)
                setSelectedMainCategory(null)
                setSelectedTag(null)
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                showFavoritesOnly
                  ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                  : 'text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-container)]'
              }`}
            >
              <HeartIcon filled={showFavoritesOnly} className="h-4 w-4 flex-shrink-0" />
              Favoriten
            </button>
          </div>
        </nav>

        {/* Mobile: horizontal tab bar */}
        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          <button
            onClick={() => handleMainCat(null)}
            className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
              !selectedMainCategory && !showFavoritesOnly
                ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)]'
            }`}
          >
            Alle
          </button>
          {MAIN_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleMainCat(cat)}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
                selectedMainCategory === cat
                  ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                  : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)]'
              }`}
            >
              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
            </button>
          ))}
          <button
            onClick={() => {
              setShowFavoritesOnly(!showFavoritesOnly)
              setSelectedMainCategory(null)
            }}
            className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
              showFavoritesOnly
                ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)]'
            }`}
          >
            <HeartIcon filled={showFavoritesOnly} className="h-3 w-3" />
            Favoriten
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[2.5rem] bg-[var(--mx-surface-container)] p-8 md:p-12">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--mx-primary-container)]/35 via-transparent to-[var(--mx-secondary-container)]/30" />
          <div className="relative max-w-2xl">
            <p className="mb-3 inline-flex rounded-full bg-[var(--mx-primary)] px-4 py-1 text-xs font-bold uppercase tracking-[0.22em] text-[var(--mx-on-primary)]">
              {selectedMainCategory ?? 'Rezeptsammlung'}
            </p>
            <h2 className="text-3xl leading-tight text-[var(--mx-on-surface)] md:text-5xl">
              {selectedMainCategory
                ? `${selectedMainCategory} durchsuchen`
                : 'Alle Rezepte aus der Sammlung'}
            </h2>
          </div>
        </section>

        {/* Search + tag filters */}
        <div className="space-y-3">
          <div className="mx-glass flex items-center rounded-full px-4 py-2">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Suche nach Titel oder Tag ..."
              className="w-full bg-transparent px-3 py-2 text-sm text-[var(--mx-on-surface)] outline-none placeholder:text-[var(--mx-on-surface-variant)]"
            />
          </div>

          {availableTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="rounded-full bg-[var(--mx-surface-container)] px-3 py-1 text-xs font-semibold text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]"
                >
                  Alle Tags
                </button>
              )}
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedTag === tag
                      ? 'bg-[var(--mx-secondary-container)] text-[var(--mx-secondary)]'
                      : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {recipesQuery.isLoading ? (
          <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-10 text-center text-[var(--mx-on-surface-variant)]">
            Lade Rezepte ...
          </div>
        ) : null}

        {recipesQuery.error ? (
          <div className="rounded-[2rem] bg-red-100/70 p-10 text-center text-red-800">
            Rezepte konnten nicht geladen werden.
          </div>
        ) : null}

        {!recipesQuery.isLoading && !recipesQuery.error ? (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredRecipes.map((recipe, index) => (
              <RecipeCard key={recipe.id} recipe={recipe} index={index} />
            ))}
          </section>
        ) : null}

        {!recipesQuery.isLoading && !recipesQuery.error && filteredRecipes.length === 0 ? (
          <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-10 text-center text-[var(--mx-on-surface-variant)]">
            {search ? `Keine Treffer fuer "${search}"` : 'Keine Rezepte in dieser Kategorie.'}
          </div>
        ) : null}
      </div>
    </div>
  )
}
