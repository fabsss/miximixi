import type { HealthResponse, RecipeDetail, RecipeListItem } from './types'
import type { DensityType } from './cupConversions'
import { DEFAULT_API_BASE_URL } from './constants'

export interface StorageAdapter {
  getToken(): Promise<string | null>
  setToken(token: string): Promise<void>
  clearToken(): Promise<void>
  onUnauthenticated(): void
}

// File input that works in both browser (File) and React Native ({ uri, name, type })
export type FileInput = File | { uri: string; name: string; type: string }

let _adapter: StorageAdapter | null = null
let _baseUrl = DEFAULT_API_BASE_URL

export function configureApi(adapter: StorageAdapter, baseUrl?: string): void {
  _adapter = adapter
  if (baseUrl) _baseUrl = baseUrl.replace(/\/$/, '')
}

function getAdapter(): StorageAdapter {
  if (!_adapter) throw new Error('API not configured — call configureApi() first')
  return _adapter
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const adapter = getAdapter()
  const token = await adapter.getToken()
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(`${_baseUrl}${path}`, { ...options, headers })
  if (response.status === 401) {
    await adapter.clearToken()
    adapter.onUnauthenticated()
    throw new Error('Session expired')
  }
  if (!response.ok) {
    let detail = `API error ${response.status}`
    try {
      const body = await response.json()
      if (body.detail) detail = body.detail
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  return (await response.json()) as T
}

export function getImageUrl(recipeId: string): string {
  return `${_baseUrl}/images/${recipeId}`
}

export function getStepImageUrl(recipeId: string, filename: string): string {
  return `${_baseUrl}/images/${recipeId}/${filename}`
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export async function getCategories(): Promise<string[]> {
  const response = await request<{ categories: string[] }>('/categories')
  return response.categories
}

export interface CategoryCountsResponse {
  counts: Record<string, number>
  total: number
}

export async function getCategoryCounts(): Promise<CategoryCountsResponse> {
  return request<CategoryCountsResponse>('/categories/counts')
}

export interface GetRecipesFilters {
  q?: string
  category?: string
  tags?: string[]
  favorites?: boolean
}

export async function getRecipes(
  limit = 20,
  offset = 0,
  filters: GetRecipesFilters = {},
): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  params.append('limit', String(limit))
  params.append('offset', String(offset))
  if (filters.q) params.append('q', filters.q)
  if (filters.category) params.append('category', filters.category)
  if (filters.tags) filters.tags.forEach(tag => params.append('tags', tag))
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

export async function mergeTags(
  sourceTags: string[],
  targetTag: string,
): Promise<{ updated_recipes: number }> {
  return request<{ updated_recipes: number }>('/tags/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_tags: sourceTags, target_tag: targetTag }),
  })
}

export async function getHeroRecipes(
  limit = 6,
  category?: string,
): Promise<RecipeListItem[]> {
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
  const adapter = getAdapter()
  const token = await adapter.getToken()
  const response = await fetch(`${_baseUrl}/recipes/${recipeId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    let detail = `Delete failed: ${response.status}`
    try {
      const body = await response.json()
      if (body.detail) detail = body.detail
    } catch { /* ignore */ }
    throw new Error(detail)
  }
}

export async function uploadRecipeImage(
  recipeId: string,
  file: FileInput,
): Promise<void> {
  const adapter = getAdapter()
  const token = await adapter.getToken()
  const form = new FormData()
  // React Native requires { uri, name, type } cast; browser accepts File directly
  form.append('file', file as unknown as Blob)
  const response = await fetch(`${_baseUrl}/recipes/${recipeId}/image`, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`Image upload failed: ${response.status}`)
}

export async function uploadStepImage(
  recipeId: string,
  stepId: string,
  file: FileInput,
): Promise<void> {
  const adapter = getAdapter()
  const token = await adapter.getToken()
  const form = new FormData()
  form.append('file', file as unknown as Blob)
  const response = await fetch(
    `${_baseUrl}/recipes/${recipeId}/steps/${stepId}/image`,
    {
      method: 'POST',
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  )
  if (!response.ok) throw new Error(`Step image upload failed: ${response.status}`)
}

export async function deleteStepImage(
  recipeId: string,
  stepId: string,
): Promise<void> {
  const adapter = getAdapter()
  const token = await adapter.getToken()
  const response = await fetch(
    `${_baseUrl}/recipes/${recipeId}/steps/${stepId}/image`,
    {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  )
  if (!response.ok) throw new Error(`Step image delete failed: ${response.status}`)
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

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await fetch(`${_baseUrl}/auth/login`, {
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

export async function createTelegramLinkCode(): Promise<TelegramLinkResponse> {
  return request<TelegramLinkResponse>('/auth/telegram-link-code', {
    method: 'POST',
  })
}

export async function getTelegramLinks(): Promise<TelegramLink[]> {
  return request<TelegramLink[]>('/auth/telegram-links')
}

export async function unlinkTelegramDevice(telegramUserId: number): Promise<void> {
  await request<void>(`/auth/telegram-links/${telegramUserId}`, {
    method: 'DELETE',
  })
}

export async function updateDisplayName(displayName: string): Promise<CurrentUser> {
  return request<CurrentUser>('/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName }),
  })
}
