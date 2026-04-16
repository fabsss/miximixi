# Backend Implementation Summary: Recipe Updates & Translations

## ✅ Completed Tasks

### 1. Updated `app/models.py`
Added two new Pydantic models:

```python
class RecipeUpdateRequest(BaseModel):
    title: str | None = None
    servings: int | None = None
    prep_time: str | None = None
    cook_time: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    rating: int | None = None  # -1, 0, or 1

class TranslationResponse(BaseModel):
    title: str
    ingredients: list[dict]  # [{id, name}, ...]
    steps: list[dict]        # [{id, text}, ...]
```

### 2. Updated `app/llm_provider.py`
- Added `TRANSLATION_PROMPT` for LLM-based recipe translation
- Added `translate_recipe(title, ingredients, steps, target_lang)` method to `LLMProvider` class
- Implemented translation methods for all supported LLM providers:
  - `_gemini_translate()`
  - `_claude_translate()`
  - `_openai_translate()` / `_openai_compat_translate()`
  - `_gemma3n_translate()`
  - `_ollama_translate()`

### 3. Updated `app/main.py`
Added two new endpoints:

#### **PATCH /recipes/{recipe_id}**
- Updates recipe metadata (optional fields: title, servings, notes, rating, category, tags, prep_time, cook_time)
- Validates recipe exists (404 if not)
- Updates only provided fields (sparse update)
- DB triggers automatically mark translations as `is_stale = true` when title/ingredients/steps change
- Returns updated recipe with ingredients and steps
- Error responses: 400 (validation), 404, 500

**Example Usage:**
```bash
curl -X PATCH http://localhost:8000/recipes/{recipe_id} \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Recipe Title",
    "rating": 1,
    "notes": "Updated notes"
  }'
```

#### **POST /recipes/{recipe_id}/translate**
- Query param: `lang` (e.g., "de", "en", "it", "fr")
- Translation logic:
  1. Checks `translations` table for `(recipe_id, lang)` entry
  2. If found AND `is_stale = false`: returns cached result immediately
  3. If found AND `is_stale = true`: calls LLM to re-translate, updates DB, returns
  4. If not found: calls LLM, inserts new translation, returns
- Returns `TranslationResponse` with translated title, ingredients, and steps
- Stores translations in DB with `is_stale=false`
- Error responses: 400, 404, 500

**Example Usage:**
```bash
curl -X POST "http://localhost:8000/recipes/{recipe_id}/translate?lang=en"
```

**Example Response:**
```json
{
  "title": "Translated Recipe Title",
  "ingredients": [
    {"id": "1", "name": "Translated ingredient name"},
    {"id": "2", "name": "Another ingredient"}
  ],
  "steps": [
    {"id": "1", "text": "Translated step text"},
    {"id": "2", "text": "Another step"}
  ]
}
```

## 🔧 Technical Details

### Database Integration
- Uses existing `get_db()` pattern for PostgreSQL connections
- Parameterized queries prevent SQL injection
- JSONB columns for translations are automatically serialized/deserialized by psycopg2
- DB triggers mark translations stale when recipe content changes

### LLM Integration
- Reuses existing `LLMProvider` abstraction
- Supports all configured LLM backends (Gemini, Claude, OpenAI, Ollama, etc.)
- Translation prompt extracts and translates:
  - Recipe title
  - Ingredient names (preserves IDs and structure)
  - Step text (preserves ingredient references like `{1}`)

### Error Handling
- Validates recipe exists before any operation
- Rating validation (-1, 0, or 1 only)
- Proper HTTP status codes (400, 404, 500)
- Detailed error logging

### Performance
- Translation caching: repeated translation requests return from cache if not stale
- Async-compatible (async function signatures)
- Database queries optimized with parameterized statements

## 📝 Testing

Use the provided test script: `backend/test-endpoints.sh`

**Manual curl tests:**

```bash
# 1. Update recipe metadata
curl -X PATCH http://localhost:8000/recipes/{recipe_id} \
  -H "Content-Type: application/json" \
  -d '{"title": "New Title", "rating": 1}'

# 2. Translate recipe
curl -X POST "http://localhost:8000/recipes/{recipe_id}/translate?lang=en"

# 3. Verify translation is cached (second call returns immediately)
curl -X POST "http://localhost:8000/recipes/{recipe_id}/translate?lang=en"
```

## 📋 Files Modified

1. **backend/app/models.py** - Added 2 model classes
2. **backend/app/llm_provider.py** - Added translation prompt + 6 translation methods
3. **backend/app/main.py** - Added 2 new endpoint handlers + imports

## ✨ Features

✅ Sparse updates (only modified fields are updated)
✅ Automatic translation staleness tracking
✅ Multi-language translation caching
✅ All LLM providers supported
✅ Proper error handling and validation
✅ Backward compatible (no breaking changes)
✅ Follows existing code style and patterns
