import { flushSync } from 'react-dom'
import { useEffect, useState, useRef } from 'react'
import { GlobalTimerButton } from './GlobalTimerButton'
import { TimerOverlay } from './TimerOverlay'
import { Link, Outlet, useMatch, useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useNavDrawer } from '../context/useNavDrawer'
import { useCategories, useCategoryCounts } from '../lib/useCategories'

interface AppLayoutProps {
  scrollPositions: Record<string, number>
}

export function AppLayout({ scrollPositions }: AppLayoutProps) {
  const [timerOverlayOpen, setTimerOverlayOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const { open: drawerOpen, setOpen: setDrawerOpen } = useNavDrawer()
  const navigate = useNavigate()
  const location = useLocation()
  const scrollPositionsRef = useRef(scrollPositions)
  const categoriesQuery = useCategories()
  const categoryCountsQuery = useCategoryCounts()

  // Sync ref with prop changes
  useEffect(() => {
    scrollPositionsRef.current = scrollPositions
  }, [scrollPositions])

  // Restore scroll position when navigating to a page
  useEffect(() => {
    const path = location.pathname
    const savedPosition = scrollPositions[path] ?? 0
    // Use requestAnimationFrame to ensure rendering is complete
    requestAnimationFrame(() => {
      window.scrollTo(0, savedPosition)
    })
  }, [location.pathname, scrollPositions])

  const themeIcon = theme === 'system' ? 'brightness_auto' : theme === 'dark' ? 'dark_mode' : 'light_mode'
  const nextTheme: 'light' | 'dark' | 'system' =
    theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'

  const detailMatch = useMatch('/recipes/:recipeSlug')
  const recipeSlug = detailMatch?.params?.recipeSlug

  return (
    <div>
      <header className="sticky top-0 z-20 border-none bg-[color:color-mix(in_srgb,var(--mx-surface)_84%,transparent)] backdrop-blur-xl">
        <div className="mx-shell flex items-center justify-between py-4">
          {/* Left: hamburger (feed, mobile) OR back arrow (detail pages) + logo */}
          <div className="flex items-center gap-3">
            {recipeSlug ? (
              <button
                onClick={() => {
                  // Save scroll position before navigation
                  scrollPositionsRef.current[location.pathname] = window.scrollY
                  if ('startViewTransition' in document) {
                    document.documentElement.dataset.navdir = 'back'
                    ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
                      flushSync(() => navigate(-1))
                    })
                  } else {
                    navigate(-1)
                  }
                }}
                aria-label="Zurück"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition-colors"
              >
                <span className="material-symbols-outlined text-[22px]">arrow_back</span>
              </button>
            ) : (
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Kategorien öffnen"
                className="lg:hidden flex h-9 w-9 items-center justify-center rounded-full text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition-colors"
              >
                <span className="material-symbols-outlined text-[22px]">menu</span>
              </button>
            )}
            <Link to="/" className="block">
              <h1 className="m-0 font-headline text-3xl leading-none text-[var(--mx-primary)]">
                Miximixi
              </h1>
              <p className="w-full text-[11px] uppercase text-[var(--mx-on-surface-variant)]" style={{ textAlign: 'justify', textAlignLast: 'justify', textJustify: 'inter-character' }}>
                Die Rezepte App
              </p>
            </Link>
          </div>

          {/* Right: cook mode (detail pages) + theme pill */}
          <div className="flex items-center gap-3">
            <GlobalTimerButton onClick={() => setTimerOverlayOpen(true)} />
            {recipeSlug && (
              <Link
                to={`/cook/${recipeSlug}`}
                className="hidden sm:flex items-center gap-2 rounded-xl bg-[var(--mx-primary)] px-4 py-2 text-sm font-semibold shadow-md shadow-[var(--mx-primary)]/20 transition-all hover:bg-[var(--mx-primary-dim)] active:scale-95"
                style={{ color: '#fff7f5' }}
              >
                <span
                  className="material-symbols-outlined text-[17px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  restaurant
                </span>
                Kochmodus
              </Link>
            )}
            <nav className="mx-glass flex items-center rounded-full p-1 text-sm font-semibold">
              {recipeSlug && (
                <Link
                  to={`/cook/${recipeSlug}`}
                  className="sm:hidden flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mx-primary)] hover:bg-[var(--mx-primary-dim)] transition-colors"
                  style={{ color: '#fff7f5 !important' }}
                  title="Kochmodus"
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    restaurant
                  </span>
                </Link>
              )}
              <button
                onClick={() => setTheme(nextTheme)}
                title={`Theme: ${theme} → ${nextTheme}`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)] transition"
              >
                <span className="material-symbols-outlined text-[20px]">{themeIcon}</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      <TimerOverlay open={timerOverlayOpen} onClose={() => setTimerOverlayOpen(false)} />

      {/* Mobile drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-[var(--mx-surface)] shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <nav className="rounded-[2rem] bg-[var(--cat-sidebar-bg)] p-4 space-y-1 m-4 mt-5">
          {/* Categories */}
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mx-on-surface-variant)]">Kategorien</p>
          <Link
            to="/"
            onClick={() => setDrawerOpen(false)}
            className="w-full flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-container)]"
          >
            <span>Alle</span>
            <span className="text-xs opacity-60">{categoryCountsQuery.data?.total ?? 0}</span>
          </Link>
          {(categoriesQuery.data ?? []).map((cat) => {
            const colors: Record<string, string> = {
              'Vorspeisen':   'bg-[var(--cat-vorspeisen-bg)] text-[var(--cat-vorspeisen-text)]',
              'Hauptspeisen': 'bg-[var(--cat-hauptspeisen-bg)] text-[var(--cat-hauptspeisen-text)]',
              'Desserts':     'bg-[var(--cat-desserts-bg)] text-[var(--cat-desserts-text)]',
              'Brunch':       'bg-[var(--cat-brunch-bg)] text-[var(--cat-brunch-text)]',
              'Snacks':       'bg-[var(--cat-snacks-bg)] text-[var(--cat-snacks-text)]',
              'Drinks':       'bg-[var(--cat-drinks-bg)] text-[var(--cat-drinks-text)]',
            }
            const isSelected = cat === window.location.search.split('cat=')[1]?.split('&')[0]
            const color = isSelected ? (colors[cat] ?? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]') : ''
            return (
              <Link
                key={cat}
                to={`/?cat=${encodeURIComponent(cat)}`}
                onClick={() => setDrawerOpen(false)}
                className={`w-full flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition ${color || 'text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-container)]'}`}
              >
                <span>{cat}</span>
                <span className="text-xs opacity-60">{categoryCountsQuery.data?.counts?.[cat] ?? 0}</span>
              </Link>
            )
          })}
          <hr className="my-2 border-[var(--mx-outline-variant)]/20" />
          <Link
            to="/tags"
            onClick={() => setDrawerOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition"
          >
            <span className="material-symbols-outlined text-[18px]">sell</span>
            <span>Tags</span>
          </Link>
        </nav>
      </div>

      <main className="mx-shell mt-8">
        <Outlet />
      </main>
    </div>
  )
}

