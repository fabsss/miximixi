import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { AppLayout } from './components/AppLayout'
import { CookPage } from './pages/CookPage'
import { FeedPage } from './pages/FeedPage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'
import { TagsPage } from './pages/TagsPage'
import { TimerProvider } from './context/TimerContext'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'

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
    <AuthProvider>
      <TimerProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout scrollPositions={scrollPositions} />}>
              <Route path="/" element={<FeedPage />} />
              <Route path="/recipes/:recipeSlug" element={<RecipeDetailPage />} />
              <Route path="/tags" element={<TagsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route path="/cook/:recipeSlug" element={<CookPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </TimerProvider>
    </AuthProvider>
  )
}

export default App
