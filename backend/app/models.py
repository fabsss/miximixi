from pydantic import BaseModel


class Ingredient(BaseModel):
    id: int
    name: str
    amount: float | None = None
    unit: str | None = None


class Step(BaseModel):
    id: int
    text: str
    time_minutes: int | None = None


class ExtractedRecipe(BaseModel):
    title: str
    lang: str = "de"
    category: str | None = None
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
