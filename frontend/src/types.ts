export interface RecipeListItem {
  id: string
  slug?: string
  title: string
  category: string | null
  image_filename: string | null
  source_url: string | null
  source_label: string | null
  rating: number | null
  tags: string[] | null
  created_at: string
}

export interface Ingredient {
  id: string
  recipe_id: string
  sort_order: number
  section: string | null
  group_name: string | null
  name: string
  amount: number | null
  unit: string | null
}

export interface Step {
  id: string
  recipe_id: string
  sort_order: number
  text: string
  time_minutes: number | null
}

export interface RecipeDetail extends RecipeListItem {
  lang: string | null
  servings: number | null
  prep_time: string | null
  cook_time: string | null
  notes: string | null
  ingredients: Ingredient[]
  steps: Step[]
}

export interface HealthResponse {
  status: string
  llm_provider: string
}
