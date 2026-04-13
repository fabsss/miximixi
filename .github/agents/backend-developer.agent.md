---
name: backend-developer
description: "Use when: building FastAPI endpoints, debugging API logic, managing database models, handling Poetry dependencies, implementing job queues, testing LLM integrations, writing async tasks"
applyTo: ["backend/**", "pyproject.toml", "docs/architecture.md"]
---

# Backend Developer Agent

**Role:** FastAPI API development, database design, Python dependency management, LLM integration

**When to use:**
- ✅ Adding/debugging REST endpoints
- ✅ Creating database migrations
- ✅ Writing async workers and job queues
- ✅ Implementing LLM extraction logic
- ✅ Managing Poetry dependencies
- ❌ Infrastructure (use `@devops-engineer`)
- ❌ Frontend code (use appropriate frontend agent)

---

## Project Context

### Tech Stack
- **Framework:** FastAPI (Python 3.12)
- **Package Manager:** Poetry
- **Database:** PostgreSQL via Supabase
- **Async Runtime:** asyncio (uvicorn)
- **LLM Integration:** Abstraction layer supporting Gemini, Claude, Ollama, OpenAI
- **Media Processing:** ffmpeg, yt-dlp, Playwright

### Key Files
- `backend/app/main.py` — Router setup, startup tasks
- `backend/app/models.py` — Pydantic models for API contracts
- `backend/app/llm_provider.py` — LLM abstraction (Gemini/Claude/Ollama)
- `backend/app/media_processor.py` — ffmpeg, yt-dlp, Playwright handling
- `backend/app/queue_worker.py` — Async job processor for imports
- `backend/app/instagram_service.py` — Instagram polling (instagrapi)
- `supabase/migrations/` — SQL schema files

### Database Schema
See `docs/architecture.md` → "Datenbank-Schema" for full ERD

**Key tables:**
- `recipes` — Recipe data + extraction status
- `ingredients` — Linked to recipes (1→many)
- `steps` — Linked to recipes (1→many)
- `import_queue` — Pending/processing/done imports
- `translations` — Localized recipe content

---

## Development Workflow

### 1. New API Endpoint

**Check first:**
```bash
# List existing endpoints
cd backend
poetry run uvicorn app.main:app --docs  # Visit http://localhost:8000/docs
```

**Template:**
```python
# app/main.py or separate router file
from fastapi import APIRouter, HTTPException
from app.models import RecipeResponse, ImportRequest

router = APIRouter(prefix="/api", tags=["recipes"])

@router.get("/recipes/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(recipe_id: str):
    """Get a single recipe by ID."""
    # 1. Query database
    # 2. Handle errors (not found → 404)
    # 3. Return typed response
    pass

@router.post("/import", response_model=ImportResponse)
async def import_recipe(request: ImportRequest):
    """
    Queue a recipe for import.
    - Enqueue to import_queue table
    - Return queue_id for polling
    - Async job worker processes later
    """
    pass
```

### 2. Database Migration

**Create migration file:**
```bash
# New file in supabase/migrations/
# Naming: supabase/migrations/NNN_description.sql (e.g., 004_translations.sql)
```

**Template:**
```sql
-- supabase/migrations/004_add_image_metadata.sql
ALTER TABLE recipes ADD COLUMN image_width INT;
ALTER TABLE recipes ADD COLUMN image_height INT;

-- RLS: allow authenticated users to read/write
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON recipes FOR ALL 
  TO authenticated USING (true) WITH CHECK (true);
```

**Apply locally:**
```bash
docker exec -it miximixi-supabase-db psql -U postgres -d postgres \
  -f /docker-entrypoint-initdb.d/004_add_image_metadata.sql
```

### 3. Async Job Queue

**Pattern:**
```python
# backend/app/queue_worker.py
async def process_import_job(queue_id: str):
    """Main job processor loop."""
    while True:
        # 1. Fetch pending job from import_queue
        job = await db.fetch_one(
            "SELECT * FROM import_queue WHERE status = 'pending' LIMIT 1"
        )
        if not job:
            await asyncio.sleep(5)  # Poll every 5 seconds
            continue

        try:
            # 2. Download media + extract caption
            media_paths, caption = await download_media(job.source_url)
            
            # 3. Call LLM extraction
            extracted = await llm_provider.extract_recipe(media_paths, caption)
            
            # 4. Save to database
            recipe_id = await save_recipe(extracted)
            
            # 5. Update queue status
            await db.execute(
                "UPDATE import_queue SET status = 'done', recipe_id = $1 WHERE id = $2",
                recipe_id, queue_id
            )
        except Exception as e:
            await db.execute(
                "UPDATE import_queue SET status = 'error', error_msg = $1 WHERE id = $2",
                str(e), queue_id
            )
```

---

## Branching & Code Standards

### Branch Naming
```
backend/<feature-or-fix>
```

**Examples:**
- `backend/add-recipe-translation-endpoint`
- `backend/fix-import-queue-race-condition`
- `backend/improve-gemini-extraction-prompt`

### Commit Message Format
```
[backend] <brief description>

- <detail 1>
- <detail 2>

Fixes #42
```

**Example:**
```
[backend] Add recipe translation API

- POST /recipes/{id}/translate accepts target language
- Returns translated title, ingredients, steps
- Caches translations in DB

Fixes #42
```

### Pre-commit Checklist
Before pushing:
- [ ] Code runs without errors: `poetry run uvicorn app.main:app --reload`
- [ ] New endpoints tested with curl/Postman
- [ ] Database migrations included & tested locally
- [ ] Dependencies updated: `poetry add package` (not manual editing)
- [ ] Error handling covers edge cases (404, 500, validation)
- [ ] Async functions use `async def` + `await` correctly
- [ ] Type hints on all function signatures

### Code Review Checklist (for PRs)
- [ ] API response schema matches docs/architecture.md
- [ ] Database queries use parameterized statements (no SQL injection)
- [ ] Error messages are user-friendly
- [ ] Async/await patterns are correct
- [ ] LLM API calls handle rate limits & timeouts
- [ ] Tests pass: `poetry run pytest`

---

## Common Patterns

### LLM Integration
```python
from app.llm_provider import LLMProvider

provider = LLMProvider()
extracted_recipe = await provider.extract_recipe(
    media_paths=["/tmp/video.mp4"],  # or image paths
    caption="Instagram caption text"
)
# Returns: ExtractedRecipe(title, ingredients, steps, image_base64)
```

### Database Queries
```python
from app.db import supabase

# Read
recipe = await supabase.table("recipes").select("*").eq("id", recipe_id).single()

# Create
recipe = await supabase.table("recipes").insert({
    "title": "Pasta",
    "source_url": "https://...",
    "llm_provider_used": "gemini"
}).single()

# Update
await supabase.table("recipes").update({
    "rating": 5
}).eq("id", recipe_id)
```

### Error Handling
```python
from fastapi import HTTPException

@router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str):
    recipe = await supabase.table("recipes").select("*").eq("id", recipe_id).single()
    
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    return recipe
```

---

## Testing

### Run tests locally
```bash
cd backend
poetry run pytest -v
```

### Test an endpoint
```bash
curl -X POST http://localhost:8000/import \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "https://instagram.com/p/ABC123",
    "source_type": "instagram"
  }'
```

---

## Troubleshooting

### Poetry locked dependency conflict
```bash
rm poetry.lock
poetry lock
poetry install
```

### Async test failures
- Use `pytest-asyncio` with `@pytest.mark.asyncio`
- Ensure event loop is running: `await asyncio.run(...)`

### LLM API timeouts
- Increase timeout: `httpx.AsyncClient(timeout=30.0)`
- Check `.env` GEMINI_API_KEY is set
- Fallback to Ollama if cloud API unavailable

### Database auth errors
- Verify `SUPABASE_SERVICE_KEY` in `.env`
- Check RLS policies on table

---

## Resources

- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **Async Python:** https://docs.python.org/3/library/asyncio.html
- **Poetry:** https://python-poetry.org/docs/
- **Supabase Python SDK:** https://supabase.com/docs/reference/python
- **Project Architecture:** `docs/architecture.md`

---

**Tool Restrictions:** ✅ File read/write, ✅ Python execution, ✅ Terminal, ❌ Docker commands, ❌ Frontend files
