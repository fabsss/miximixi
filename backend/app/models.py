from typing import Literal

from pydantic import BaseModel

CATEGORIES = ["Vorspeisen", "Hauptspeisen", "Dessert", "Frühstück", "Snack", "Getränke"]
CATEGORY_VALUES = Literal["Vorspeisen", "Hauptspeisen", "Dessert", "Frühstück", "Snack", "Getränke"]


class Ingredient(BaseModel):
    id: int
    name: str
    amount: float | None = None
    unit: str | None = None
    group_name: str | None = None  # z.B. "Für das Soja-Hack", "Dressing", "Toppings"


class Step(BaseModel):
    id: int
    text: str
    time_minutes: int | None = None


class ExtractedRecipe(BaseModel):
    title: str
    lang: str = "de"
    category: CATEGORY_VALUES | None = None
    servings: int | None = None
    prep_time: str | None = None
    cook_time: str | None = None
    tags: list[str] = []
    ingredients: list[Ingredient] = []
    steps: list[Step] = []


class ExtractionResult(BaseModel):
    recipe: ExtractedRecipe
    # Gemini: Timestamp des besten Frames ("MM:SS"), None = kein gutes Bild gefunden
    cover_timestamp: str | None = None
    # Andere Provider: Index (0-4) des besten Frames aus ffmpeg-Extraktion, None = kein gutes Bild
    cover_frame_index: int | None = None


class ImportRequest(BaseModel):
    url: str
    source_type: str = "telegram"  # telegram | instagram | youtube | web | manual
    media_paths: list[str] = []    # Bereits heruntergeladene Medien (von n8n)
    caption: str = ""              # Instagram-Caption / YouTube-Beschreibung falls vorhanden


class ImportResponse(BaseModel):
    queue_id: str
    status: str
    message: str


class IngredientInput(BaseModel):
    name: str
    amount: float | None = None
    unit: str | None = None
    group_name: str | None = None
    sort_order: int = 0


class StepInput(BaseModel):
    text: str
    time_minutes: int | None = None
    sort_order: int = 0


class RecipeUpdateRequest(BaseModel):
    title: str | None = None
    servings: int | None = None
    prep_time: str | None = None
    cook_time: str | None = None
    category: CATEGORY_VALUES | None = None
    tags: list[str] | None = None
    notes: str | None = None
    rating: int | None = None  # -1, 0, or 1
    ingredients: list[IngredientInput] | None = None
    steps: list[StepInput] | None = None


class TranslationResponse(BaseModel):
    title: str
    ingredients: list[dict]  # [{id, name}, ...]
    steps: list[dict]        # [{id, text}, ...]
