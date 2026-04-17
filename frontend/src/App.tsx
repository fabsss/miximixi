import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { AppLayout } from './components/AppLayout'
import { CookPage } from './pages/CookPage'
import { FeedPage } from './pages/FeedPage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'

// Store scroll positions per route
const scrollPositions: Record<string, number> = {}

function App() {
  useEffect(() => {
    // Save scroll position before navigating away
    const handleScroll = () => {
      const path = window.location.pathname
      scrollPositions[path] = window.scrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <Routes>
      <Route element={<AppLayout scrollPositions={scrollPositions} />}>
        <Route path="/" element={<FeedPage />} />
        <Route path="/recipes/:recipeSlug" element={<RecipeDetailPage />} />
      </Route>
      <Route path="/cook/:recipeSlug" element={<CookPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
