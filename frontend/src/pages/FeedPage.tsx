import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getImageUrl, getRecipes } from '../lib/api'
import { HeartIcon, RecipeCard } from '../components/RecipeCard'
import { useNavDrawer } from '../context/NavDrawerContext'

const MAIN_CATEGORIES = ['Vorspeisen', 'Hauptspeisen', 'Nachspeisen', 'Getr\u00e4nke'] as const
type MainCategory = (typeof MAIN_CATEGORIES)[number]

export function FeedPage() {
  const [search, setSearch] = useState('')
  const [selectedMainCategory, setSelectedMainCategory] = useState<MainCategory | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroImgOk, setHeroImgOk] = useState(true)
  const { open: drawerOpen, setOpen: setDrawerOpen } = useNavDrawer()
  const mainRef = useRef<HTMLDivElement>(null)

  const recipesQuery = useQuery({
    queryKey: ['recipes'],
    queryFn: () => getRecipes(80),
  })

  // Rotate hero every 5s through first 6 recipes
  useEffect(() => {
    const total = Math.min(recipesQuery.data?.length ?? 0, 6)
    if (total <= 1) return
    const id = setInterval(() => {
      setHeroIndex(i => (i + 1) % total)
      setHeroImgOk(true)
    }, 5000)
    return () => clearInterval(id)
  }, [recipesQuery.data?.length])

  // Close drawer on scroll
  useEffect(() => {
    if (!drawerOpen) return
    const el = mainRef.current
    if (!el) return
    const onScroll = () => setDrawerOpen(false)
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
    }
  }, [drawerOpen])

  const heroRecipe = recipesQuery.data?.[heroIndex]

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of recipesQuery.data ?? []) {
      if (r.category) counts[r.category] = (counts[r.category] ?? 0) + 1
    }
    return counts
  }, [recipesQuery.data])

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
      const tagOk = selectedTags.size === 0 || recipe.tags?.some((t) => selectedTags.has(t))
      const favoriteOk = !showFavoritesOnly || recipe.rating === 1
      return searchOk && mainCatOk && tagOk && favoriteOk
    })
  }, [recipesQuery.data, search, selectedMainCategory, selectedTags, showFavoritesOnly])

  const handleMainCat = (cat: MainCategory | null) => {
    setSelectedMainCategory(cat)
    setSelectedTags(new Set())
    setShowFavoritesOnly(false)
    setDrawerOpen(false)
  }

  const sidebarBtnCls = (active: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
      active
        ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
        : 'text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-container)]'
    }`

  const CategoryNav = () => (
    <>
      <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mx-on-surface-variant)]">Kategorien</p>
      <button onClick={() => handleMainCat(null)} className={sidebarBtnCls(!selectedMainCategory)}>
        <span>Alle</span>
        <span className="text-xs opacity-60">{recipesQuery.data?.length ?? 0}</span>
      </button>
      {MAIN_CATEGORIES.map((cat) => (
        <button key={cat} onClick={() => handleMainCat(cat)} className={sidebarBtnCls(selectedMainCategory === cat)}>
          <span>{cat}</span>
          {categoryCounts[cat] != null && <span className="text-xs opacity-60">{categoryCounts[cat]}</span>}
        </button>
      ))}
    </>
  )

  return (
    <div ref={mainRef} className="flex flex-col gap-6 lg:flex-row lg:items-start">

      {/* ── Mobile drawer backdrop ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile slide-in drawer ── */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-[var(--mx-surface)] shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--mx-outline-variant)]/20 px-5 py-5">
          <span className="font-headline text-lg font-bold text-[var(--mx-on-surface)]">Kategorien</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <nav className="space-y-1 p-4">
          <CategoryNav />
        </nav>
      </div>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:block lg:sticky lg:top-28 lg:w-52 lg:flex-shrink-0">
        <nav className="rounded-[2rem] bg-[var(--mx-surface-low)] p-4 space-y-1">
          <CategoryNav />
        </nav>
      </aside>

      {/* ── Main ── */}
      <div className="min-w-0 flex-1 space-y-5">

        {/* ROTATING HERO */}
        {heroRecipe && (
          <section>
            <div className="group relative w-full overflow-hidden rounded-[2.5rem]" style={{ aspectRatio: '21/9' }}>
              {heroImgOk ? (
                <img
                  key={heroIndex}
                  src={getImageUrl(heroRecipe.id)}
                  alt={heroRecipe.title}
                  onError={() => setHeroImgOk(false)}
                  className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
                  style={{ animation: 'mx-fadein 0.6s ease-out' }}
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-[var(--mx-primary-container)] to-[var(--mx-secondary-container)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 flex w-full flex-col items-start justify-between gap-4 p-5 md:flex-row md:items-end md:p-8">
                <div className="max-w-xl">
                  {heroRecipe.category && (
                    <span className="mb-2 inline-block rounded-full bg-[var(--mx-primary)]/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mx-on-primary)] backdrop-blur-md md:text-xs">
                      {heroRecipe.category}
                    </span>
                  )}
                  <h2 className="font-headline text-2xl font-bold leading-[1.1] text-white md:text-4xl">
                    {heroRecipe.title}
                  </h2>
                  {(heroRecipe.tags?.length ?? 0) > 0 && (
                    <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
                      {heroRecipe.tags!.slice(0, 4).map(tag => (
                        <span key={tag} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/80 backdrop-blur-sm">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  to={`/recipes/${heroRecipe.id}`}
                  className="flex shrink-0 items-center gap-2 self-end rounded-full bg-gradient-to-r from-[var(--mx-primary)] to-[var(--mx-primary-dim)] px-5 py-2.5 text-sm font-bold text-[var(--mx-on-primary)] shadow-xl transition-all active:scale-95"
                >
                  Zum Rezept
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              </div>
            </div>

            {/* Dot indicators */}
            {(recipesQuery.data?.length ?? 0) > 1 && (
              <div className="mt-3 flex justify-center gap-1.5">
                {Array.from({ length: Math.min(recipesQuery.data!.length, 6) }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => { setHeroIndex(i); setHeroImgOk(true) }}
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === heroIndex ? 'w-5 bg-[var(--mx-primary)]' : 'w-1.5 bg-[var(--mx-outline-variant)]'}`}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* SEARCH + HAMBURGER (mobile) + TAG FILTERS + FAVORITES */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">

            <div className="mx-glass flex flex-1 items-center rounded-full px-4 py-2">
              <span className="material-symbols-outlined mr-2 flex-shrink-0 text-[18px] text-[var(--mx-on-surface-variant)]">search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Titel oder Tag ..."
                className="w-full bg-transparent py-1.5 text-sm text-[var(--mx-on-surface)] outline-none placeholder:text-[var(--mx-on-surface-variant)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Favorites filter */}
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                showFavoritesOnly
                  ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                  : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
              }`}
            >
              <HeartIcon filled={showFavoritesOnly} className="h-3 w-3" />
              Favoriten
            </button>

            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTags((prev) => {
                  const next = new Set(prev)
                  next.has(tag) ? next.delete(tag) : next.add(tag)
                  return next
                })}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedTags.has(tag)
                    ? 'bg-[var(--mx-secondary-container)] text-[var(--mx-secondary)]'
                    : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {recipesQuery.isLoading && (
          <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-10 text-center text-[var(--mx-on-surface-variant)]">
            Lade Rezepte ...
          </div>
        )}

        {/* Error */}
        {recipesQuery.error && (
          <div className="rounded-[2rem] bg-red-100/70 p-10 text-center text-red-800">
            Rezepte konnten nicht geladen werden.
          </div>
        )}

        {/* Grid */}
        {!recipesQuery.isLoading && !recipesQuery.error && (
          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            {filteredRecipes.map((recipe, index) => (
              <RecipeCard key={recipe.id} recipe={recipe} index={index} />
            ))}
          </section>
        )}

        {/* Empty state */}
        {!recipesQuery.isLoading && !recipesQuery.error && filteredRecipes.length === 0 && (
          <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-10 text-center text-[var(--mx-on-surface-variant)]">
            {search ? `Keine Treffer f\u00fcr \u201e${search}\u201c` : 'Keine Rezepte in dieser Kategorie.'}
          </div>
        )}
      </div>
    </div>
  )
}
