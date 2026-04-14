import { useQuery } from '@tanstack/react-query'
import { Outlet } from 'react-router-dom'
import { getHealth } from '../lib/api'
import { useTheme } from '../context/ThemeContext'

export function AppLayout() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    staleTime: 60_000,
  })

  const { theme, setTheme } = useTheme()

  const themeIcon = theme === 'system' ? '🖥️' : theme === 'dark' ? '🌙' : '☀️'
  const nextTheme: 'light' | 'dark' | 'system' =
    theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'

  return (
    <div className="pb-12">
      <header className="sticky top-0 z-20 border-none bg-[color:color-mix(in_srgb,var(--mx-surface)_84%,transparent)] backdrop-blur-xl">
        <div className="mx-shell flex items-center justify-between py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--mx-on-surface-variant)]">
              Miximixi
            </p>
            <h1 className="m-0 text-2xl text-[var(--mx-primary)]">Das moderne Erbe</h1>
          </div>
          <nav className="mx-glass flex items-center rounded-full p-1 text-sm font-semibold">
            <button
              onClick={() => setTheme(nextTheme)}
              title={`Theme: ${theme} → ${nextTheme}`}
              className="rounded-full px-3 py-2 text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)] transition"
            >
              {themeIcon}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-shell mt-8">
        <Outlet />
      </main>

      <footer className="mx-shell mt-12 text-xs text-[var(--mx-on-surface-variant)]">
        {healthQuery.data?.status === 'ok' ? (
          <p>Backend online · LLM: {healthQuery.data.llm_provider}</p>
        ) : (
          <p>Backend wird überprüft …</p>
        )}
      </footer>
    </div>
  )
}
