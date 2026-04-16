# Miximixi – Local Development Setup (Windows 11 / WSL2)

Complete guide for setting up the Miximixi stack on a Windows 11 development machine with WSL2.

## Prerequisites

### Required Software

- **Docker Desktop** (with WSL2 backend) – https://www.docker.com/products/docker-desktop
  - Requires Windows 10 Pro/Enterprise or Windows 11
  - WSL2 backend is default in Docker Desktop 3.6+
  - Allocate ≥ 4 GB RAM, ≥ 2 CPU cores to Docker (Settings → Resources)

- **Python 3.12+** – https://www.python.org/
  - Required for backend development
  - Check: `python --version`

- **Poetry** (Python package manager) – https://python-poetry.org/docs/#installation
  ```bash
  pip install poetry
  poetry --version  # Should be 1.7+
  ```

- **Git** – https://git-scm.com/
  - Windows: Use Git Bash or WSL2 terminal

- **ffmpeg** (for cover image extraction from videos)
  ```bash
  # Windows: Install via Chocolatey or download from ffmpeg.org
  choco install ffmpeg
  # or download: https://ffmpeg.org/download.html
  ```

### Optional Tools

- **VS Code** with extensions:
  - Docker (ms-azuretools.vscode-docker)
  - Python (ms-python.python)
  - REST Client (humao.rest-client) – for API testing

- **Postman** or **Insomnia** – for API testing
- **DBeaver** – for database inspection

## Initial Setup (First Time)

### Step 1: Clone Repository

```bash
git clone <repo-url> ~/git/miximixi
cd ~/git/miximixi
```

### Step 2: Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and fill in required values:

```env
# ============================================
# LLM Configuration (choose ONE)
# ============================================

# Option A: Google Gemini (RECOMMENDED for dev)
# - Native video processing
# - Fast extraction
# - Free tier available (50 calls/day)
# - Get API key: https://aistudio.google.com/apikey
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash

# Option B: Local Ollama (CPU-only, slow)
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://ollama:11434
# OLLAMA_MODEL=llama3.2-vision:11b

# Option C: Claude API (paid)
# LLM_PROVIDER=claude
# CLAUDE_API_KEY=sk-ant-...
# CLAUDE_MODEL=claude-sonnet-4-6

# ============================================
# PostgreSQL Database
# ============================================
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=miximixi
DB_HOST=localhost
DB_PORT=5432

# ============================================
# Telegram (optional, for error notifications)
# ============================================
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_NOTIFY_CHAT_ID=<from getUpdates>

# ============================================
# Instagram (optional, for saved collection polling)
# ============================================
# Not needed for manual API imports
# INSTAGRAM_USERNAME=
# INSTAGRAM_PASSWORD=
# INSTAGRAM_COLLECTION_ID=
```

### Step 3: Start Docker Services

```bash
docker compose -f docker-compose.dev.yml up -d
```

Wait for all services to be healthy (usually 30-60 seconds):

```bash
docker compose -f docker-compose.dev.yml ps
```

Expected output:
```
NAME              STATUS
miximixi-db       healthy
miximixi-ollama   running (or healthy if configured)
```

**If database is "unhealthy"**, check logs:
```bash
docker compose -f docker-compose.dev.yml logs db
```

### Step 4: Verify Database Migrations

Migrations are automatically applied on first start. Verify they ran:

```bash
docker exec miximixi-db psql -U postgres -d miximixi -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"
```

You should see:
- `recipes`
- `ingredients`
- `steps`
- `import_queue`
- `translations` (if 002 migration ran)
- `users` (for future multi-user support)

**Migrations included:**
- `001_initial.sql` – Core tables (recipes, ingredients, steps, import_queue, users)
- `002_translations.sql` – Multi-language support and stale translation tracking
- `003_schema_updates.sql` – Additional columns (extraction_status, llm_provider_used)
- `005_ingredient_group.sql` – Ingredient grouping by section

### Step 5: Install Backend Dependencies

```bash
cd backend
poetry install
```

This reads `pyproject.toml` and creates a virtual environment in `.venv/`.

**First install can take 2-3 minutes.** Dependencies include:
- `fastapi` – Web framework
- `psycopg2-binary` – PostgreSQL client
- `anthropic` – Claude API client
- `google-generativeai` – Gemini API client
- `openai` – OpenAI API client
- `yt-dlp` – YouTube/Instagram downloader
- `playwright` – Browser automation for website scraping
- `ffmpeg-python` – Video frame extraction

### Step 6: Start Backend

```bash
cd backend
poetry run uvicorn app.main:app --reload --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

The `--reload` flag watches for code changes and restarts the server automatically.

**Verify backend is running:**
```bash
curl http://localhost:8000/health
# Returns: {"status":"ok","llm_provider":"gemini"}
```

---

## Service Details

### PostgreSQL Database

**Port:** 5432 (exposed to host for development)
**Container:** `miximixi-db`
**Data Volume:** `miximixi-dev_db-data`

**Role:** Stores all application data (recipes, ingredients, steps, import queue, translations).

**Schema:**
```sql
recipes              -- Recipe metadata + extraction status
ingredients         -- Recipe ingredients with amounts + grouping
steps               -- Cooking instructions + timing
import_queue        -- Pending/processing/done imports from URLs
translations        -- Translated content + stale tracking
users               -- For future multi-user sharing
```

**Access from backend:**
```python
import psycopg2
conn = psycopg2.connect(
    host="localhost",
    port=5432,
    user="postgres",
    password="postgres",
    database="miximixi"
)
```

**Backup/Restore:**
```bash
# Backup
docker exec miximixi-db pg_dump -U postgres miximixi > backup.sql

# Restore
docker exec -i miximixi-db psql -U postgres miximixi < backup.sql
```

**Reset database (WARNING: deletes all data):**
```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d db
```

**Connect directly:**
```bash
docker exec -it miximixi-db psql -U postgres -d miximixi
```

---

### FastAPI Backend

**Port:** 8000
**Location:** Local (dev machine, not dockerized)

**Role:** Imports recipes from URLs, orchestrates LLM extraction, manages local file storage, sends Telegram notifications.

**Key endpoints:**
```bash
# Health check
curl http://localhost:8000/health

# Import recipe from URL
curl -X POST http://localhost:8000/import \
  -H "Content-Type: application/json" \
  -d '{"url":"https://instagram.com/p/xyz","source_type":"instagram"}'

# List recipes
curl http://localhost:8000/recipes

# Get specific recipe
curl http://localhost:8000/recipes/{recipe_id}

# Get recipe cover image
curl http://localhost:8000/images/{recipe_id}

# API documentation
open http://localhost:8000/docs
```

**Code structure:**
```
backend/
├── app/
│   ├── main.py              # FastAPI app + routes
│   ├── config.py            # Environment configuration
│   ├── models.py            # Pydantic data models
│   ├── llm_provider.py      # LLM abstraction (Gemini, Claude, Ollama)
│   ├── media_processor.py   # Download + frame extraction
│   ├── queue_worker.py      # Background import job processor
│   └── instagram_service.py # Instagram polling (instaloader)
└── pyproject.toml           # Poetry dependencies
```

**Running with custom settings:**
```bash
# Use Claude instead of Gemini
CLAUDE_API_KEY=sk-ant-... poetry run uvicorn app.main:app --reload

# Use local Ollama instead
LLM_PROVIDER=ollama poetry run uvicorn app.main:app --reload

# Change port
poetry run uvicorn app.main:app --reload --port 8001
```

**Logs:**
If running in terminal, logs appear directly. Control log level in `app/main.py`:
```python
logging.basicConfig(level=logging.DEBUG)  # Change for more/less verbosity
```

---

### Ollama (Local LLM Runtime)

**Port:** 11434
**Container:** `miximixi-ollama`
**URL:** `http://localhost:11434`

**Role:** Runs open-source LLMs locally (CPU-only). Supports multiple models in one container.

**Initial setup (download model):**
```bash
docker exec -it miximixi-ollama ollama pull llama3.2-vision:11b
# This downloads ~4GB. Takes 5-10 min depending on internet.
```

**List available models:**
```bash
docker exec -it miximixi-ollama ollama list
```

**Performance expectations (dev machine):**
- First request: ~20-30s (model loads into memory)
- Subsequent requests: ~2-10 min per recipe (CPU-bound)
- Memory usage: ~6-8 GB during inference
- **Recommendation:** Use Gemini for faster iteration, Ollama for testing

---

## Common Development Workflows

### Import Recipe from Instagram (Manual)

```bash
# 1. Get Instagram URL
URL="https://www.instagram.com/p/ABC123xyz/"

# 2. Trigger import via backend API
curl -X POST http://localhost:8000/import \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$URL\",\"source_type\":\"instagram\"}"

# Response:
# {"queue_id":"550e8400-e29b","status":"pending"}

# 3. Check import status
curl http://localhost:8000/import/550e8400-e29b

# 4. View extracted recipe
curl http://localhost:8000/recipes | jq '.[0]'
```

### Test LLM Extraction (Dry Run)

```bash
python << 'EOF'
import sys
sys.path.insert(0, 'backend')

from app.config import settings
from app.llm_provider import LLMProvider
from app.media_processor import prepare_media_for_gemini

llm = LLMProvider()

# Test with a video file
video_path = "/path/to/video.mp4"
media = prepare_media_for_gemini([video_path])

result = llm.extract_recipe(media, "Optional caption text")
print(result.recipe.model_dump_json(indent=2))
EOF
```

### Debug Database Schema

```bash
# Connect to database
docker exec -it miximixi-db psql -U postgres -d miximixi

# View all tables
\dt

# View recipes table schema
\d recipes

# Run a query
SELECT id, title, extraction_status FROM recipes LIMIT 5;

# Exit
\q
```

### View Backend Logs

Logs appear in the terminal where you ran `poetry run uvicorn`. Scroll up or pipe to file:

```bash
poetry run uvicorn app.main:app --reload 2>&1 | tee backend.log
```

Then tail the log:
```bash
tail -f backend.log
```

### Stop All Services

```bash
# Stop Docker services only
docker compose -f docker-compose.dev.yml down

# Stop Docker services AND delete data
docker compose -f docker-compose.dev.yml down -v

# Keep running but remove stopped containers
docker system prune
```

---

## Troubleshooting

### Docker Services Won't Start

**Error:** `docker: daemon not running`
- **Solution:** Open Docker Desktop application

**Error:** `docker: failed to resolve reference`
- **Solution:** Check internet connection and try `docker pull postgres:15-alpine`

### Backend Can't Connect to Database

**Error:** `psycopg2.OperationalError: connection refused`
- **Cause:** Database not running or not healthy
- **Solution:** 
  ```bash
  docker compose -f docker-compose.dev.yml ps db
  docker compose -f docker-compose.dev.yml logs db
  ```

### Database Migrations Didn't Run

**Error:** `relation "recipes" does not exist`
- **Cause:** Migrations not executed on startup
- **Solution:**
  ```bash
  # Manually run migrations
  docker exec -i miximixi-db psql -U postgres -d miximixi < supabase/migrations/001_initial.sql
  docker exec -i miximixi-db psql -U postgres -d miximixi < supabase/migrations/002_translations.sql
  # ... repeat for all migrations
  ```

### Ollama Model Download Stalls

**Error:** `docker exec ollama ollama pull llama3.2-vision:11b` hangs
- **Cause:** Network issues or insufficient disk space
- **Solution:**
  ```bash
  # Stop the download
  Ctrl+C
  
  # Check disk space
  docker exec miximixi-ollama df -h
  
  # Try again with progress
  docker exec -it miximixi-ollama ollama pull -v llama3.2-vision:11b
  ```

### Uvicorn "Address Already in Use" (Port 8000)

**Error:** `OSError: [Errno 48] Address already in use`
- **Cause:** Another process is using port 8000
- **Solution:**
  ```bash
  # Find process using port 8000 (Windows)
  netstat -ano | findstr :8000
  
  # Kill it or use a different port
  poetry run uvicorn app.main:app --reload --port 8001
  ```

### Image Storage Not Working

**Error:** `[WinError 2] The system cannot find the file specified`
- **Cause:** ffmpeg not installed
- **Solution:** Install ffmpeg:
  ```bash
  # Windows (via Chocolatey)
  choco install ffmpeg
  
  # Or download from: https://ffmpeg.org/download.html
  ```
- **Note:** Image extraction works fine on Linux production servers

---

## Development Tips

### Fastest Recipe Extraction (Use Gemini)

**Performance comparison (importing one Instagram video):**

| Provider | Speed | Cost | Notes |
|----------|-------|------|-------|
| Gemini 2.0 Flash | ~3 seconds | Free (50/day) | Recommended for dev |
| Claude 3.5 Sonnet | ~5 seconds | $0.003 | High quality |
| Ollama (CPU) | 3-10 minutes | $0 | Local, depends on machine |

**Set up Gemini:**
1. Get API key: https://aistudio.google.com/apikey
2. Update `.env`: `GEMINI_API_KEY=AIza...`
3. Set `LLM_PROVIDER=gemini`
4. Restart backend

### Use REST Client VS Code Extension for API Testing

Install: https://marketplace.visualstudio.com/items?itemName=humao.rest-client

Create `api-test.http`:
```http
### Health check
GET http://localhost:8000/health

### Import Instagram recipe
POST http://localhost:8000/import
Content-Type: application/json

{
  "url": "https://instagram.com/p/ABC123",
  "source_type": "instagram"
}

### Get recipes
GET http://localhost:8000/recipes

### Get specific recipe
GET http://localhost:8000/recipes/{recipe_id}
```

Right-click on any request and select "Send Request".

### Reset Everything (Clean Slate)

```bash
# Stop and remove all containers + volumes
docker compose -f docker-compose.dev.yml down -v

# Start fresh
docker compose -f docker-compose.dev.yml up -d

# Reinstall backend
cd backend && poetry install
```

---

## Next Steps

1. **Create first recipe:** Follow "Import Recipe from Instagram" workflow above
2. **Test API endpoints:** Use Swagger UI at http://localhost:8000/docs
3. **Inspect database:** Use `psql` or DBeaver to explore tables
4. **Develop features:** See `docs/architecture.md` for codebase overview
5. **Run tests:** See `docs/testing-guide.md`

---

**Last updated:** 2026-04-14  
**Related docs:** [`docs/architecture.md`](architecture.md) | [`docs/deployment-production.md`](deployment-production.md) | [`docs/QUICK-START.md`](QUICK-START.md)
