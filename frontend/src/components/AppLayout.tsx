import { flushSync } from 'react-dom'
import { useEffect, useRef } from 'react'
import { Link, Outlet, useMatch, useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useNavDrawer } from '../context/useNavDrawer'

interface AppLayoutProps {
  scrollPositions: Record<string, number>
}

export function AppLayout({ scrollPositions }: AppLayoutProps) {
  const { theme, setTheme } = useTheme()
  const { setOpen: openDrawer } = useNavDrawer()
  const navigate = useNavigate()
  const location = useLocation()
  const scrollPositionsRef = useRef(scrollPositions)

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

  const themeIcon = theme === 'system' ? '🖥️' : theme === 'dark' ? '🌙' : '☀️'
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
                onClick={() => openDrawer(true)}
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
                className="rounded-full px-3 py-2 text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)] transition"
              >
                {themeIcon}
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-shell mt-8">
        <Outlet />
      </main>
    </div>
  )
}

