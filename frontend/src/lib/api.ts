import type { HealthResponse, RecipeDetail, RecipeListItem } from '../types'

const baseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'https://miximixi-api.sektbirne.fun'

const API_BASE_URL = baseUrl.replace(/\/$/, '')

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  if (!response.ok) {
    throw new Error(`API error ${response.status}`)
  }
  return (await response.json()) as T
}

export function getImageUrl(recipeId: string): string {
  return `${API_BASE_URL}/images/${recipeId}`
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export async function getCategories(): Promise<string[]> {
  const response = await request<{ categories: string[] }>('/categories')
  return response.categories
}

export async function getRecipes(limit = 20, offset = 0): Promise<RecipeListItem[]> {
  return request<RecipeListItem[]>(`/recipes?limit=${limit}&offset=${offset}`)
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
  const response = await fetch(`${API_BASE_URL}/recipes/${recipeId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Delete failed: ${response.status}`)
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
