import type { HealthResponse, RecipeDetail, RecipeListItem } from '../types'
import type { DensityType } from './cupConversions'

const baseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'https://miximixi-api.sektbirne.fun'

const API_BASE_URL = baseUrl.replace(/\/$/, '')

const TOKEN_KEY = 'miximixi_auth_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken()
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  if (response.status === 401) {
    clearStoredToken()
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!response.ok) {
    throw new Error(`API error ${response.status}`)
  }
  return (await response.json()) as T
}

export function getImageUrl(recipeId: string): string {
  return `${API_BASE_URL}/images/${recipeId}`
}

export function getStepImageUrl(recipeId: string, filename: string): string {
  return `${API_BASE_URL}/images/${recipeId}/${filename}`
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export async function getCategories(): Promise<string[]> {
  const response = await request<{ categories: string[] }>('/categories')
  return response.categories
}

interface GetRecipesFilters {
  q?: string
  category?: string
  tags?: string[]
  favorites?: boolean
}

export async function getRecipes(limit = 20, offset = 0, filters: GetRecipesFilters = {}): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  params.append('limit', String(limit))
  params.append('offset', String(offset))
  if (filters.q) params.append('q', filters.q)
  if (filters.category) params.append('category', filters.category)
  if (filters.tags) {
    filters.tags.forEach(tag => params.append('tags', tag))
  }
  if (filters.favorites) params.append('favorites', 'true')
  return request<RecipeListItem[]>(`/recipes?${params.toString()}`)
}

export async function getTags(category?: string): Promise<string[]> {
  const params = new URLSearchParams()
  if (category) params.append('category', category)
  return request<string[]>(`/tags?${params.toString()}`)
}

export interface TagWithCount {
  tag: string
  count: number
}

export async function getTagsWithCounts(): Promise<TagWithCount[]> {
  return request<TagWithCount[]>('/tags/counts')
}

export async function mergeTags(sourceTags: string[], targetTag: string): Promise<{ updated_recipes: number }> {
  return request<{ updated_recipes: number }>('/tags/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_tags: sourceTags, target_tag: targetTag }),
  })
}

export async function getHeroRecipes(limit = 6, category?: string): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  params.append('limit', String(limit))
  params.append('offset', '0')
  if (category) params.append('category', category)
  return request<RecipeListItem[]>(`/recipes?${params.toString()}`)
}

export async function getRecipe(recipeId: string): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/recipes/${recipeId}`)
}

export interface RecipeUpdateRequest {
  title?: string
  servings?: number
  prep_time?: string
  cook_time?: string
  category?: string
  tags?: string[]
  notes?: string
  rating?: -1 | 0 | 1 | null
  ingredients?: Array<{
    name: string
    amount: number | null
    unit: string | null
    group_name: string | null
    sort_order: number
  }>
  steps?: Array<{
    text: string
    time_minutes: number | null
    sort_order: number
  }>
}

export async function updateRecipe(
  recipeId: string,
  data: RecipeUpdateRequest,
): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/recipes/${recipeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export interface TranslationResponse {
  title: string
  ingredients: Array<{ id: string | number; name: string }>
  steps: Array<{ id: string | number; text: string }>
}

export async function translateRecipe(
  recipeId: string,
  lang: string,
): Promise<TranslationResponse> {
  return request<TranslationResponse>(
    `/recipes/${recipeId}/translate?lang=${encodeURIComponent(lang)}`,
    { method: 'POST' },
  )
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  console.log(`[API] Deleting recipe: ${recipeId}`)
  try {
    const response = await fetch(`${API_BASE_URL}/recipes/${recipeId}`, {
      method: 'DELETE',
    })
    console.log(`[API] Delete response status: ${response.status}`)

    if (!response.ok) {
      let errorDetail = `Delete failed: ${response.status}`
      try {
        const errorData = await response.json()
        if (errorData.detail) {
          errorDetail = errorData.detail
        }
      } catch {
        // If response isn't JSON, use status code message
      }
      console.error(`[API] Delete error: ${errorDetail}`)
      throw new Error(errorDetail)
    }

    console.log(`[API] Recipe deleted successfully`)
    // For successful deletion, no response body to parse
  } catch (error) {
    console.error(`[API] Delete request failed:`, error)
    throw error
  }
}

export async function uploadRecipeImage(recipeId: string, file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE_URL}/recipes/${recipeId}/image`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) throw new Error(`Image upload failed: ${response.status}`)
}

export async function uploadStepImage(
  recipeId: string,
  stepId: string,
  file: File,
): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE_URL}/recipes/${recipeId}/steps/${stepId}/image`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    let errorDetail = `Step image upload failed: ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData.detail) {
        errorDetail = errorData.detail
      }
    } catch {
      // If response isn't JSON, use status code message
    }
    throw new Error(errorDetail)
  }
}

export async function deleteStepImage(
  recipeId: string,
  stepId: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/recipes/${recipeId}/steps/${stepId}/image`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    let errorDetail = `Step image delete failed: ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData.detail) {
        errorDetail = errorData.detail
      }
    } catch {
      // If response isn't JSON, use status code message
    }
    throw new Error(errorDetail)
  }
}

export interface CategoryCountsResponse {
  counts: Record<string, number>
  total: number
}

export async function getCategoryCounts(): Promise<CategoryCountsResponse> {
  return request<CategoryCountsResponse>('/categories/counts')
}

export async function getDensities(): Promise<DensityType[]> {
  return request<DensityType[]>('/ingredient-densities')
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: { id: string; email: string; display_name: string }
}

export interface CurrentUser {
  id: string
  email: string
  display_name: string
  created_at: string
}

export interface TelegramLinkResponse {
  code: string
  deep_link: string
  expires_in: number
}

export interface TelegramLink {
  telegram_user_id: number
  telegram_username: string | null
  linked_at: string
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.detail || `Login failed: ${response.status}`)
  }
  return response.json()
}

export async function getMe(): Promise<CurrentUser> {
  return request<CurrentUser>('/auth/me')
}

export async function createTelegramLinkCode(): Promise<TelegramLinkResponse> {
  return request<TelegramLinkResponse>('/auth/telegram-link-code', { method: 'POST' })
}

export async function getTelegramLinks(): Promise<TelegramLink[]> {
  return request<TelegramLink[]>('/auth/telegram-links')
}

export async function unlinkTelegramDevice(telegramUserId: number): Promise<void> {
  await request<void>(`/auth/telegram-links/${telegramUserId}`, { method: 'DELETE' })
}
