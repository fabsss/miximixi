# Miximixi – Local Development Setup (Windows 11 / WSL2)

Complete guide for setting up the Miximixi stack on a Windows 11 development machine with WSL2.

## Prerequisites

### Required Software

- **Docker Desktop** (with WSL2 backend) – https://www.docker.com/products/docker-desktop
  - Requires Windows 10 Pro/Enterprise or Windows 11
  - WSL2 backend is default in Docker Desktop 3.6+
  - Allocate ≥ 4 GB RAM, ≥ 2 CPU cores to Docker (Settings → Resources)

- **Node.js 20+** – https://nodejs.org/
  - Required for frontend development
  - Check: `node --version`

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

- **Playwright Chromium** (for website scraping)
  ```bash
  pip install playwright
  playwright install chromium
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
# Database & API
# ============================================
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_KEY=<from Supabase Studio>
SUPABASE_ANON_KEY=<from Supabase Studio>

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

# ============================================
# Frontend
# ============================================
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<same as above>
VITE_API_BASE_URL=http://localhost:8000
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
NAME                          STATUS
miximixi-supabase-db         healthy
miximixi-supabase-rest       healthy
miximixi-supabase-studio     healthy
miximixi-ollama              running (or healthy if configured)
miximixi-n8n                 running
nginx-api                    running
```

**If services are "unhealthy"**, check logs:
```bash
# View specific service logs
docker compose -f docker-compose.dev.yml logs supabase-db
docker compose -f docker-compose.dev.yml logs supabase-rest

# View all logs with timestamps
docker compose -f docker-compose.dev.yml logs -f --timestamps
```

### Step 4: Run Database Migrations

Migrations are defined in `supabase/migrations/*.sql` and are automatically applied on first start. To manually verify or re-run:

```bash
docker exec -it miximixi-supabase-db psql -U postgres -d postgres << 'EOF'
SELECT migration_name, executed_at FROM schema_migrations ORDER BY executed_at DESC LIMIT 5;
EOF
```

**Migrations included:**
- `001_initial.sql` – Core tables (recipes, ingredients, steps, import_queue)
- `002_translations.sql` – Multi-language support
- `003_schema_updates.sql` – Additional columns and indices
- `004_roles_and_grants.sql` – Role-based access control (anon, authenticated, service_role)
- `005_ingredient_group.sql` – Ingredient grouping by section

### Step 5: Get Supabase API Keys

1. Open **Supabase Studio**: http://localhost:54323
2. Navigate to **Settings → API**
3. Copy the keys and add to `.env`:
   ```env
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   - **anon key**: Used by frontend (limited permissions)
   - **service_role key**: Used by backend (full permissions)

4. Restart backend to pick up new keys:
   ```bash
   # You'll do this in Step 7
   ```

### Step 6: Pull Ollama Model (if using local LLM)

Only needed if you set `LLM_PROVIDER=ollama`. **This downloads ~4GB and takes 5-10 minutes.**

```bash
docker exec -it miximixi-ollama ollama pull llama3.2-vision:11b
```

Check download progress:
```bash
docker exec -it miximixi-ollama ollama list
```

You can skip this if using Gemini (recommended for dev).

### Step 7: Install Backend Dependencies

```bash
cd backend
poetry install
```

This reads `pyproject.toml` and creates a virtual environment in `.venv/`.

**First install can take 2-3 minutes.** Dependencies include:
- `fastapi` – Web framework
- `anthropic` – Claude API client
- `google-generativeai` – Gemini API client
- `openai` – OpenAI API client
- `supabase` – Supabase Python client
- `httpx` – Async HTTP client
- `yt-dlp` – YouTube/Instagram downloader
- `playwright` – Browser automation for website scraping
- `ffmpeg-python` – Video frame extraction

### Step 8: Start Backend

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
# Returns: {"status":"ok"}
```

### Step 9: Install Frontend Dependencies (Optional, for UI work)

```bash
cd frontend
npm install
```

### Step 10: Start Frontend (Optional, for UI work)

```bash
cd frontend
npm run dev
```

Expected output:
```
  Local:        http://localhost:5173/
  press h to show help
```

---

## Service Details

### PostgreSQL Database (Supabase)

**Port:** 5432 (internal only, not exposed to host)
**Container:** `miximixi-supabase-db`

**Role:** Stores recipes, ingredients, cooking steps, import queue, and user translations.

**Schema:**
```sql
-- Core tables
recipes              -- Recipe metadata + extraction status
ingredients         -- Recipe ingredients with amounts + grouping
steps               -- Cooking instructions + timing
import_queue        -- Pending/processing/done imports from URLs
recipe_translations -- Translated content (future)
```

**Access from backend:**
```python
from supabase import create_client
supabase = create_client(
    settings.supabase_url,      # http://supabase-api:8000
    settings.supabase_service_key
)
result = supabase.table("recipes").select("*").execute()
```

**Backup/Restore:**
```bash
# Backup
docker exec miximixi-supabase-db pg_dump -U postgres postgres > backup.sql

# Restore
docker exec -i miximixi-supabase-db psql -U postgres postgres < backup.sql
```

**Reset database (WARNING: deletes all data):**
```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d supabase-db
```

### PostgREST REST API (Supabase)

**Internal Port:** 3000 (via PostgREST)
**External Port:** 54321 (via nginx proxy)
**Container:** `miximixi-supabase-rest`, `nginx-api`

**Role:** Auto-generates REST API from PostgreSQL schema. Handles authentication and row-level security.

**Example requests:**
```bash
# Get all recipes
curl http://localhost:54321/rest/v1/recipes \
  -H "Authorization: Bearer $ANON_KEY"

# Insert recipe (service_role only)
curl -X POST http://localhost:54321/rest/v1/recipes \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Pasta","lang":"de",...}'

# Filter with conditions
curl "http://localhost:54321/rest/v1/recipes?extraction_status=eq.success" \
  -H "Authorization: Bearer $ANON_KEY"
```

**Routing:**
- Requests to `http://localhost:54321/rest/v1/*` are proxied to PostgREST's internal root (`/`)
- This is handled by `nginx-api` service (see `docker-compose.dev.yml`)
- PostgREST doesn't need to know about the `/rest/v1/` prefix

**Schema cache issues:**
If you add a database column and PostgREST still returns "column not found", restart it:
```bash
docker compose -f docker-compose.dev.yml restart supabase-rest
```

### Supabase Studio Admin UI

**URL:** http://localhost:54323
**Container:** `miximixi-supabase-studio`

**Role:** Web UI for managing database, users, API keys, and running migrations.

**Features:**
- SQL editor for running custom queries
- Table browser (inspect data)
- Authentication user management
- API documentation generator
- Backup/restore UI

**Inspect import queue status:**
1. Open http://localhost:54323
2. Select database `postgres`
3. Browse table `import_queue`
4. Filter by `status = 'processing'` to see current jobs

---

### FastAPI Backend

**Port:** 8000
**Container:** Local (dev machine, not dockerized)

**Role:** Imports recipes from URLs, orchestrates LLM extraction, manages storage, sends Telegram notifications.

**Key endpoints:**
```bash
# Health check
curl http://localhost:8000/health

# Import recipe from URL
curl -X POST http://localhost:8000/import \
  -H "Content-Type: application/json" \
  -d '{"url":"https://instagram.com/p/xyz"}'

# List recipes (from backend's perspective)
curl http://localhost:8000/recipes

# API documentation
open http://localhost:8000/docs
```

**Code structure:**
```
backend/
├── app/
│   ├── main.py              # FastAPI app setup + routes
│   ├── config.py            # Environment configuration
│   ├── models.py            # Pydantic models (Recipe, Ingredient, etc.)
│   ├── llm_provider.py      # LLM abstraction (Gemini, Claude, Ollama, etc.)
│   ├── media_processor.py   # Download + frame extraction (yt-dlp, Playwright, ffmpeg)
│   ├── queue_worker.py      # Background job processor
│   └── instagram_service.py # Instagram polling (instaloader)
└── pyproject.toml           # Poetry dependencies
```

**Environment variables for backend:**
```env
LLM_PROVIDER              # Which LLM to use
GEMINI_API_KEY            # For Gemini
OLLAMA_BASE_URL           # For local Ollama
SUPABASE_URL              # Database URL
SUPABASE_SERVICE_KEY      # Database auth key
TELEGRAM_BOT_TOKEN        # For error notifications
INSTAGRAM_COOKIES_FILE    # For yt-dlp Instagram auth
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
```bash
# If running in terminal, logs appear directly
# If running via docker (not for dev), use:
docker compose logs -f backend

# Check specific log level (debug, info, warning)
# Set in app/main.py via logging.basicConfig()
```

---

### Ollama (Local LLM Runtime)

**Port:** 11434
**Container:** `miximixi-ollama`
**URL:** http://localhost:11434

**Role:** Runs open-source LLMs locally (CPU-only in dev). Supports multiple models via one container.

**Initial setup (download model):**
```bash
docker exec -it miximixi-ollama ollama pull llama3.2-vision:11b
# This downloads ~4GB. Takes 5-10 min depending on internet.
```

**List available models:**
```bash
docker exec -it miximixi-ollama ollama list
```

**Pull additional models:**
```bash
# Gemma 3n (smaller, faster, multimodal)
docker exec -it miximixi-ollama ollama pull gemma3n:e4b

# Llama 2 (7B, faster but less accurate)
docker exec -it miximixi-ollama ollama pull llama2:7b-chat-q4_K_M
```

**Direct API calls (for testing):**
```bash
# Extract recipe from 5 images
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2-vision:11b",
    "prompt": "Extract recipe...",
    "images": ["base64_image_1", "base64_image_2", ...],
    "stream": false,
    "format": "json"
  }'
```

**Performance expectations (dev machine):**
- First request: ~20-30s (model loads into memory)
- Subsequent requests: ~2-10 min per recipe (CPU-bound)
- Memory usage: ~6-8 GB during inference
- Not recommended for rapid iteration – use Gemini instead

**Troubleshooting:**
```bash
# Check Ollama logs
docker compose -f docker-compose.dev.yml logs ollama

# Stop and reset Ollama (keep models cached)
docker compose -f docker-compose.dev.yml restart ollama

# Force re-download of model (if corrupted)
docker exec -it miximixi-ollama ollama rm llama3.2-vision:11b
docker exec -it miximixi-ollama ollama pull llama3.2-vision:11b
```

---

### n8n (Workflow Automation)

**Port:** 5678
**Container:** `miximixi-n8n`
**URL:** http://localhost:5678

**Role:** Receives webhooks from Telegram/Instagram, triggers recipe imports via backend API.

**Not actively used in local dev** (you can trigger imports manually via curl or Swagger UI). Useful for:
- Telegram bot integration (user messages trigger imports)
- Instagram saved collection polling (automatic)
- Scheduled recipe imports

**Setup (optional, for testing workflows):**
1. Open http://localhost:5678
2. Click **+ Workflow**
3. Click **+ Node** and search for "Webhook"
4. Set webhook URL (e.g., `http://n8n:5678/webhook/telegram`)
5. Add HTTP request node pointing to backend: `POST http://backend:8000/import`
6. Save and activate workflow

**Workflows included in repo:**
```
n8n/
├── telegram_import.json      # Receives Telegram messages, extracts recipe URLs
└── instagram_poller.json     # Polls saved collection every hour
```

**Manual import (for local testing):**
```bash
# Trigger import directly via backend API
curl -X POST http://localhost:8000/import \
  -H "Content-Type: application/json" \
  -d '{"url":"https://instagram.com/p/ABC123", "source_type":"instagram"}'
```

---

### nginx API Proxy

**Port:** 54321
**Container:** `nginx-api`
**Config:** `nginx-dev.conf`

**Role:** Routes `/rest/v1/*` requests to PostgREST's root path (`/`).

**Why needed:**
PostgREST doesn't support path prefixes natively. Clients expect the API at `/rest/v1/`, but PostgREST serves from `/`. nginx translates the request:

```
Client request:  GET /rest/v1/recipes
                    ↓
nginx routing:   GET / (to PostgREST)
                    ↓
PostgREST response: 200 OK [recipes]
```

**Verify nginx is working:**
```bash
curl http://localhost:54321/rest/v1/recipes -H "Authorization: Bearer $ANON_KEY"
# Should return recipe list, not 404
```

**If requests fail with 404:**
1. Check nginx logs: `docker compose -f docker-compose.dev.yml logs nginx-api`
2. Verify PostgREST is running: `docker compose -f docker-compose.dev.yml ps supabase-rest`
3. Restart nginx: `docker compose -f docker-compose.dev.yml restart nginx-api`

---

## Common Development Workflows

### Import Recipe from Instagram (Manual)

```bash
# 1. Get Instagram URL (e.g., from browser address bar)
URL="https://www.instagram.com/p/ABC123xyz/"

# 2. Trigger import via backend API
curl -X POST http://localhost:8000/import \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$URL\",\"source_type\":\"instagram\"}"

# Response:
# {"queue_id":"550e8400-e29b","status":"pending"}

# 3. Check import status in Supabase
curl "http://localhost:54321/rest/v1/import_queue?id=eq.550e8400-e29b" \
  -H "Authorization: Bearer $ANON_KEY"

# 4. View extracted recipe
curl http://localhost:54321/rest/v1/recipes \
  -H "Authorization: Bearer $ANON_KEY" | jq '.[-1]'
```

### Test LLM Extraction (Dry Run)

```bash
# Extract frames from video, send to LLM, print result
python << 'EOF'
import sys
sys.path.insert(0, 'backend')

from app.config import settings
from app.llm_provider import LLMProvider
from app.media_processor import prepare_media_for_frames

llm = LLMProvider()

# Assuming you have a video file locally
video_path = "/tmp/recipe_video.mp4"
frames = prepare_media_for_frames([video_path], "/tmp/frames")

result = llm.extract_recipe(frames, caption="Some recipe description")
print(result.recipe.json(indent=2))
EOF
```

### Debug Database Schema

```bash
# Connect to database directly
docker exec -it miximixi-supabase-db psql -U postgres -d postgres

# View all tables
\dt

# View recipes table schema
\d recipes

# Run a query
SELECT id, title, extraction_status FROM recipes LIMIT 5;

# Exit
\q
```

### View Backend Logs (Terminal)

Logs appear automatically in the terminal where you ran `poetry run uvicorn`.

**Change log level:**
Edit `backend/app/main.py`:
```python
import logging
logging.basicConfig(level=logging.DEBUG)  # Change to DEBUG for verbose logs
```

Then restart backend with `Ctrl+C` and re-run `poetry run uvicorn app.main:app --reload`.

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

**Error:** `Error response from daemon: could not choose an IP address`
- **Solution:** Restart Docker Desktop (Settings → click restart icon)

### Backend Can't Connect to Supabase

**Error:** `ConnectionError: Connection failed to http://supabase-api:8000`
- **Cause:** Docker services not running or not healthy
- **Solution:** 
  ```bash
  docker compose -f docker-compose.dev.yml ps
  docker compose -f docker-compose.dev.yml logs supabase-db
  ```

### PostgREST Returns 401 Unauthorized

**Error:** `{"message":"JWT expired","code":"PGRST..."}`
- **Cause:** Invalid or expired API key
- **Solution:** 
  1. Get fresh keys from Supabase Studio: http://localhost:54323 → Settings → API
  2. Update `.env` with new keys
  3. Restart backend: `Ctrl+C` then re-run uvicorn

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
  # Find process using port 8000
  lsof -i :8000  # On macOS/Linux
  netstat -ano | findstr :8000  # On Windows PowerShell
  
  # Kill it or use a different port
  poetry run uvicorn app.main:app --reload --port 8001
  ```

### PostgREST Still Says "Column Not Found" After Adding Migration

**Error:** `Could not find the 'group_name' column`
- **Cause:** PostgREST caches schema metadata on startup
- **Solution:**
  ```bash
  docker compose -f docker-compose.dev.yml restart supabase-rest
  # Wait ~10 seconds for restart
  ```

### Can't Access Supabase Studio (Port 54323)

**Error:** `Connection refused` or blank page
- **Cause:** Studio takes time to start (depends on DB healthcheck)
- **Solution:**
  ```bash
  # Wait 60 seconds and try again
  docker compose -f docker-compose.dev.yml logs supabase-studio
  ```

---

## Development Tips

### Fastest Recipe Extraction (Use Gemini)

**Performance comparison (importing one Instagram video):**

| Provider | Speed | Cost | Notes |
|----------|-------|------|-------|
| Gemini 2.0 Flash | ~3 seconds | Free (50/day) | Recommended for dev |
| Claude 3.5 Sonnet | ~5 seconds | $0.003 | High quality |
| Ollama (CPU) | 3-10 minutes | $0 | Depends on machine |
| Gemma 3n (Ollama) | 2-5 minutes | $0 | Smaller, faster |

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
  "source_type": "instagram",
  "caption": "Optional caption"
}

### Get recipes
GET http://localhost:54321/rest/v1/recipes
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

### Filter by status
GET http://localhost:54321/rest/v1/recipes?extraction_status=eq.success
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Right-click on any request and select "Send Request".

### Reset Everything (Clean Slate)

```bash
# Stop and remove all containers + volumes (WARNING: loses all data)
docker compose -f docker-compose.dev.yml down -v

# Start fresh
docker compose -f docker-compose.dev.yml up -d

# Re-run setup from Step 5 onward
```

### View Raw Database Dump

```bash
# Export database to SQL file
docker exec miximixi-supabase-db pg_dump -U postgres postgres > dump.sql

# View recipes table
grep -A 20 "^COPY recipes" dump.sql
```

---

## Next Steps

1. **Create first recipe:** Follow "Import Recipe from Instagram" workflow above
2. **Test API endpoints:** Use Swagger UI at http://localhost:8000/docs
3. **Inspect database:** Explore tables in Supabase Studio at http://localhost:54323
4. **Develop features:** See `docs/architecture.md` for codebase overview
5. **Run tests:** See `docs/testing-guide.md`

---

**Last updated:** 2026-04-14  
**Related docs:** [`docs/deployment-production.md`](deployment-production.md) | [`docs/architecture.md`](architecture.md) | [`docs/QUICK-START.md`](QUICK-START.md)
