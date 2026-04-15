import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { CookPage } from './pages/CookPage'
import { FeedPage } from './pages/FeedPage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<FeedPage />} />
        <Route path="/recipes/:recipeSlug" element={<RecipeDetailPage />} />
      </Route>
      <Route path="/cook/:recipeSlug" element={<CookPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
