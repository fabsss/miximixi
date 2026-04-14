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

export async function getRecipes(limit = 60): Promise<RecipeListItem[]> {
  return request<RecipeListItem[]>(`/recipes?limit=${limit}`)
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
