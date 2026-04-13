# Miximixi – Testing & Setup Guide

> How to test the import pipeline end-to-end and configure n8n

---

## Current Status

### What's Working ✅
- FastAPI backend with `/import` endpoints
- Queue Worker (watching `import_queue` table)
- LLM abstraction layer (Gemini, Claude, OpenAI, Ollama)
- Database schema (recipes, ingredients, steps, import_queue)
- n8n (running, workflows ready to import)

### What's Not Tested Yet ⚠️
- n8n workflows (not imported yet)
- End-to-end import flow (link → n8n → backend → LLM → recipe)
- Telegram bot integration
- Instagram collection sync

### What's Missing/Partial ❌
- Website import (Playwright)
- YouTube import (yt-dlp integration in backend)
- Fallback logic (needs_review handling)
- Photo extraction for non-Gemini providers

---

## Phase 1: Manual Testing (No n8n yet)

### Step 1: Test Backend Health
```bash
curl http://localhost:8000/health
# Expected: {"status": "ok", "llm_provider": "gemini"}
```

### Step 2: Create an Import Job (Manually)
```bash
curl -X POST http://localhost:8000/import \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://instagram.com/p/ABC123DEF456/",
    "source_type": "instagram"
  }'

# Expected response:
# {
#   "queue_id": "uuid-here",
#   "status": "pending",
#   "message": "✅ Rezept wird verarbeitet…"
# }
```

**Copy the `queue_id` from response** ↓

### Step 3: Check Import Status
```bash
curl http://localhost:8000/import/{queue_id}

# Possible responses:
# {"queue_id": "...", "status": "processing"}  # Still extracting
# {"queue_id": "...", "status": "done", "recipe_id": "recipe-uuid"}  # Success!
# {"queue_id": "...", "status": "failed", "error": "Extraction failed"}  # Error
```

### Step 4: List All Imports
```bash
curl http://localhost:8000/import
# Shows last 20 import jobs
```

### Step 5: View Extracted Recipe (if done)
```sql
-- SSH into Supabase and run:
SELECT id, title, ingredient_count, extraction_status 
FROM recipes 
WHERE id = 'recipe-uuid-from-step-3' 
LIMIT 1;
```

---

## Phase 2: n8n Setup (Telegram Bot Integration)

### What n8n Will Do
1. **Listens** for Telegram messages with links
2. **Extracts** the URL
3. **Calls** `/import` endpoint on our backend
4. **Polls** `/import/{queue_id}` for status
5. **Sends back** result to Telegram (link to recipe)

### Setup Steps

#### 2.1. Access n8n UI
```
http://localhost:5678
```

#### 2.2. Import the Telegram Workflow
1. Click **Workflows** (left sidebar)
2. Click **+ Create New** (or Import)
3. Click **Import from File**
4. Select: `n8n/telegram_import.json`
5. Click **Import**

#### 2.3. Configure Telegram Bot (n8n)
**You need:**
- Telegram Bot Token (from `@BotFather`)
- Webhook URL (so Telegram can reach n8n)

Inside the imported workflow:
1. Find the **"Telegram" trigger node** (should be first node)
2. Click it
3. **Credentials:** Create new
   - Paste your `TELEGRAM_BOT_TOKEN` from `.env`
4. **Test:** Send a message to the bot
   - Bot should show "received" in n8n logs

#### 2.4. Configure Backend URL
In the **"HTTP Request" node** (that calls `/import`):
- URL: Should be `http://backend:8000/import` (internal Docker network)
- For local testing: `http://127.0.0.1:8000/import`

#### 2.5. Test Telegram → Backend
1. Go to your Telegram bot chat
2. Send a message: `https://instagram.com/p/ABC123/`
3. Bot should respond with status
4. Check backend logs: `docker compose logs -f backend | grep "Import-Job"`

---

## Phase 3: Instagram Collection Sync (Optional)

### What This Does
- Polls your Instagram collection automatically every 15 minutes
- Pulls new items and adds to import queue
- No manual link pasting needed

### Setup
1. Import workflow: `n8n/instagram_poller.json`
2. Requires Instagram credentials (browser session)
3. More complex – test Telegram flow first

---

## Testing Checklist

### Manual Backend Test
- [ ] `curl http://localhost:8000/health` returns OK
- [ ] `curl -X POST /import` returns a `queue_id`
- [ ] `curl /import/{queue_id}` shows status changes
- [ ] Check Supabase: new recipe appears in `recipes` table

### n8n Telegram Test
- [ ] n8n workflow imported successfully
- [ ] Telegram credentials configured
- [ ] Send message to bot: Instagram link
- [ ] Bot responds (might take 30-60s for extraction)
- [ ] Recipe appears in Supabase

### Backend Logs to Watch
```bash
# In one terminal:
docker compose -f docker-compose.dev.yml logs -f backend

# In Telegram:
# Send link → watch logs for:
# "Import-Job erstellt: {uuid}"
# "Processing: instagram.com/p/..."
# "Extracted recipe: title=..."
```

---

## Troubleshooting

### Backend won't process jobs
**Check:**
```bash
# Are there pending jobs?
curl http://localhost:8000/import

# Check queue worker logs
docker compose -f docker-compose.dev.yml logs backend | grep "Queue-Worker"

# Are LLM API keys set?
grep GEMINI .env
```

### n8n can't reach backend
**Check:**
- n8n URL: `http://backend:8000` (if running in Docker)
- Or: `http://127.0.0.1:8000` (if backend runs locally)
- Port 8000 is accessible: `curl http://127.0.0.1:8000/health`

### Extraction takes 60+ seconds
**Normal!** Especially for:
- Instagram videos (download + processing)
- Long recipes (LLM token limit)
- Non-Gemini providers (ffmpeg frame extraction)

### "role 'authenticated' does not exist" error
**Known issue** with Supabase setup. Doesn't affect import pipeline.

---

## Next Steps After Testing

Once manual + n8n testing works:

1. **Story 2c**: Implement website/YouTube import
2. **Story 2d**: Fallback logic (extraction failures)
3. **Story 6**: Build React frontend (recipe feed, detail page)
4. **Story 11**: Authentication (Supabase Auth)

---

## File References

| File | Purpose | When to Edit |
|------|---------|--------------|
| `.env` | API keys, LLM provider | Initial setup |
| `backend/app/main.py` | Import endpoints | Adding new endpoints |
| `backend/app/llm_provider.py` | LLM calls (Gemini, Claude, etc) | Tweaking prompts |
| `backend/app/queue_worker.py` | Background job processor | Debugging extraction |
| `n8n/*.json` | Telegram + Instagram workflows | Through n8n UI |
| `supabase/migrations/` | Database schema | New tables/columns |

---

## Quick Commands

```bash
# Check backend is running
curl http://localhost:8000/health

# Check database
docker exec -it miximixi-supabase-db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM recipes;"

# View backend logs
docker compose -f docker-compose.dev.yml logs backend -f

# Restart queue worker
docker compose -f docker-compose.dev.yml restart backend

# Test n8n endpoint
curl http://127.0.0.1:5678/health

# Clear all import jobs (if needed)
docker exec -it miximixi-supabase-db psql -U postgres -d postgres -c "DELETE FROM import_queue;"
```

---

**Status:** Ready for testing! Start with Phase 1 (manual), then Phase 2 (n8n).
