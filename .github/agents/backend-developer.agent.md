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
- **Database:** PostgreSQL 15 (direct connection via psycopg2)
- **Async Runtime:** asyncio (uvicorn)
- **LLM Integration:** Abstraction layer supporting Gemini, Claude, Ollama, OpenAI
- **Media Processing:** ffmpeg, yt-dlp, Playwright
- **Image Storage:** Local filesystem (/data/recipe-images/)

### Key Files
- `backend/app/main.py` — Router setup, startup tasks
- `backend/app/models.py` — Pydantic models for API contracts
- `backend/app/llm_provider.py` — LLM abstraction (Gemini/Claude/Ollama)
- `backend/app/media_processor.py` — Media download handlers (yt-dlp for Instagram/YouTube, HTML parsing for websites)
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
```

**Apply locally:**
```bash
docker exec -it miximixi-db psql -U postgres -d miximixi \
  -c "ALTER TABLE recipes ADD COLUMN image_width INT;"
```

**Note:** This project does not use Row-Level Security (RLS). Permission checking is handled in the FastAPI application code instead.

### 3. Async Job Queue

**Pattern:**
```python
# backend/app/queue_worker.py
import psycopg2
from psycopg2.extras import RealDictCursor

async def process_import_job():
    """Main job processor loop."""
    while True:
        db = psycopg2.connect(host=settings.db_host, ...)
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        try:
            # 1. Fetch pending job from import_queue
            cursor.execute(
                "SELECT * FROM import_queue WHERE status = 'pending' LIMIT 1"
            )
            job = cursor.fetchone()
            if not job:
                await asyncio.sleep(5)  # Poll every 5 seconds
                continue

            # 2. Download media + extract caption
            media_paths, caption = await download_media(job['source_url'])
            
            # 3. Call LLM extraction
            extracted = await llm_provider.extract_recipe(media_paths, caption)
            
            # 4. Save to database
            cursor.execute(
                "INSERT INTO recipes (title, source_url, ...) VALUES (%s, %s, ...)",
                (extracted.title, job['source_url'], ...)
            )
            recipe_id = cursor.fetchone()['id']
            
            # 5. Update queue status
            cursor.execute(
                "UPDATE import_queue SET status = 'done', recipe_id = %s WHERE id = %s",
                (recipe_id, job['id'])
            )
            db.commit()
        except Exception as e:
            cursor.execute(
                "UPDATE import_queue SET status = 'needs_review', error_msg = %s WHERE id = %s",
                (str(e), job['id'])
            )
            db.commit()
        finally:
            db.close()
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
import psycopg2
from psycopg2.extras import RealDictCursor
from app.config import settings

def get_db():
    return psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name
    )

# Read
db = get_db()
cursor = db.cursor(cursor_factory=RealDictCursor)
cursor.execute("SELECT * FROM recipes WHERE id = %s", (recipe_id,))
recipe = cursor.fetchone()
db.close()

# Create
cursor.execute("""
    INSERT INTO recipes (title, source_url, llm_provider_used)
    VALUES (%s, %s, %s)
    RETURNING id
""", ("Pasta", "https://...", "gemini"))
recipe_id = cursor.fetchone()['id']
db.commit()

# Update
cursor.execute("UPDATE recipes SET rating = %s WHERE id = %s", (5, recipe_id))
db.commit()
```

### Error Handling
```python
from fastapi import HTTPException

@router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str):
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT * FROM recipes WHERE id = %s", (recipe_id,))
    recipe = cursor.fetchone()
    db.close()
    
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

### Database connection errors
- Verify DB_HOST, DB_PORT, DB_USER, DB_PASSWORD in `.env`
- Ensure PostgreSQL container is running: `docker compose ps db`
- Check firewall rules: `docker exec miximixi-db pg_isready`
- Test connection directly: `psql postgresql://user:pass@host:5432/miximixi`

---

## Resources

- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **Async Python:** https://docs.python.org/3/library/asyncio.html
- **Poetry:** https://python-poetry.org/docs/
- **psycopg2 Docs:** https://www.psycopg.org/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/15/
- **Project Architecture:** `docs/architecture.md`

---

**Tool Restrictions:** ✅ File read/write, ✅ Python execution, ✅ Terminal, ❌ Docker commands, ❌ Frontend files
