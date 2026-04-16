# Feature Plan: Telegram Bot Backend Integration

**Branch:** `feature/telegram-bot-backend`  
**Status:** In Development  
**Last Updated:** 2026-04-16

## Overview

Replace n8n Telegram integration with native FastAPI backend implementation. Simultaneously upgrade the job queue worker from serial (1 job) to parallel processing (up to 3 concurrent jobs, configurable).

**Why:** n8n was error-prone (JSON parsing issues, maintenance burden). Cloud LLM APIs (Gemini, Claude, OpenAI) support parallel requests natively.

## Architecture

```
User → Telegram Bot (polling, backend-native)
         │
         ▼
import_queue (PostgreSQL, with telegram_chat_id)
         │
         ▼
run_worker (N parallel asyncio tasks via Semaphore)
         │
         ├── process_job() → Download → LLM → DB
         └── notify_callback() → Bot → User
              ├── ✅ "Rezept 'X' erfolgreich importiert!"
              ├── ⚠️ "Fehler: <user-friendly message>"
              └── ❌ "Rezept existiert bereits"
```

## Files

| File | Action | Status |
|------|--------|--------|
| `backend/app/telegram_bot.py` | Create | Pending |
| `backend/app/queue_worker.py` | Refactor (parallel + callbacks) | Pending |
| `backend/app/main.py` | Update (2nd lifespan task) | Pending |
| `backend/app/config.py` | Add settings | ✅ Done |
| `backend/pyproject.toml` | Add dependency | ✅ Done |
| `backend/migrations/002_telegram_chat_id.sql` | Create | ✅ Done |
| `supabase/migrations/007_telegram_chat_id.sql` | Create | ✅ Done |
| `backend/tests/unit/test_telegram_bot.py` | Create (TDD) | ✅ Done |
| `backend/tests/functional/test_queue_worker.py` | Extend (TDD) | ✅ Done |

## Implementation Details

### 1. Database Schema

Add `telegram_chat_id VARCHAR(50)` to `import_queue` table:
- Stores the Telegram user's chat ID when job is submitted via bot
- **Nulled after notification is sent** (privacy-first design)
- Indexed for efficient lookups by chat_id

### 2. Dependencies

```toml
python-telegram-bot = "^21.0"  # Async, application-based, polling mode
```

### 3. Configuration

New settings in `config.py`:

```python
telegram_allowed_user_ids: list[str] = []
# Empty = all users allowed
# Format: "123456,789012" (comma-separated Telegram user IDs)

worker_max_concurrent: int = 3
# 1 = serial (for local LLMs: Ollama, Gemma3n — single model instance)
# 3+ = parallel (for cloud LLMs: Gemini, Claude, OpenAI)
```

### 4. Queue Worker (Parallel Processing)

**Current (Serial):**
- Poll every 5s
- Fetch 1 pending job
- await process_job()
- Loop

**New (Parallel):**
- Maintain `asyncio.Semaphore(settings.worker_max_concurrent)`
- Poll every 5s
- Claim up to N pending jobs atomically via `FOR UPDATE SKIP LOCKED`
- Spawn N tasks concurrently (each wrapped with semaphore)
- Add `notify_callback` parameter to `process_job()`
- After completion (success/error): call callback, then null `telegram_chat_id`

**Key SQL (atomic claiming):**

```sql
UPDATE import_queue
SET status = 'processing', llm_provider_used = %s
WHERE id = (
    SELECT id FROM import_queue
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

### 5. Telegram Bot Module

**Handlers:**

- `/start` → Welcome message
- Text message with URL → 
  1. Access control check (optional allowlist)
  2. URL extraction (instagram.com, youtube.com, youtu.be, or fallback to web)
  3. Duplicate check (recipes table + import_queue)
  4. If new: INSERT import_queue with `telegram_chat_id`, reply "⏳ Link erkannt!"
  5. If duplicate: reply "❌ Rezept existiert bereits"

**Notification Callback:**

```python
async def notify(
    chat_id: Optional[str],
    success: bool,
    recipe_title: Optional[str] = None,
    error_msg: Optional[str] = None,
    source_url: Optional[str] = None,
) -> None:
```

- If `success=True` and `chat_id`: send "✅ Rezept 'X' erfolgreich importiert!"
- If `success=False` and `chat_id`: send "⚠️ Fehler: <humanized error>"
- If `success=False` and admin channel set: send detailed error to admin

**Error Humanization:**

Map technical errors to user-friendly German text:
- "download" / "404" / "connection" → "Video/Seite konnte nicht heruntergeladen werden"
- "cookie" / "instagram" / "unauthorized" → "Zugriff fehlgeschlagen. Kann ein Cookie-Fehler sein"
- "recipe" / "extract" / "parsing" → "Kein Rezept im Video/auf der Seite gefunden"
- "timeout" → "Verarbeitung hat zu lange gedauert"

### 6. Main Lifespan Integration

Two concurrent background tasks:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Shared mutable slot for bot → worker callback wiring
    notify_holder = [None]

    async def notify_proxy(**kwargs):
        if notify_holder[0]:
            await notify_holder[0](**kwargs)

    # Start worker with proxy callback
    worker_task = asyncio.create_task(
        run_worker(poll_interval=5, notify_callback=notify_proxy)
    )

    # Start bot (injects real callback)
    bot_task = asyncio.create_task(
        run_bot(lambda cb: notify_holder.__setitem__(0, cb))
    )

    logger.info("Queue-Worker und Telegram-Bot gestartet")
    yield

    # Graceful shutdown
    worker_task.cancel()
    bot_task.cancel()
    for task in [worker_task, bot_task]:
        try:
            await task
        except asyncio.CancelledError:
            pass
```

## Concurrency Model

### Why Parallel?

- Each job takes 30–120 seconds (download + LLM + DB write)
- Cloud LLMs (Gemini, Claude, OpenAI) support unlimited concurrent requests
- 3 concurrent jobs = good throughput + safe resource use

### Why Configurable?

- Local LLMs (Ollama, Gemma3n) run on single GPU/CPU
- Setting `worker_max_concurrent=1` forces serial processing
- Cloud deployments can increase to 5+ safely

### Race Condition Prevention

`FOR UPDATE SKIP LOCKED` ensures:
- Each concurrent worker claims a unique row
- No two workers process the same job
- Safe for N parallel workers

## Testing Strategy (TDD)

### Phase 1: Unit Tests (RED)

**`test_telegram_bot.py`** (8 tests):
1. TC1: URL detection — Instagram
2. TC2: URL detection — YouTube
3. TC3: URL detection — Web fallback
4. TC4: Access control — empty allowlist
5. TC5: Access control — user in list
6. TC6: Access control — user not in list
7. TC7: Error humanization — download error
8. TC8: Error humanization — unknown error

### Phase 2: Functional Tests (RED)

**`test_queue_worker.py`** (7 tests):
9. TC9: Job claiming — no pending job returns None
10. TC10: Job claiming — sets status to processing
11. TC11: Semaphore — limits concurrency to max_concurrent
12. TC12: Callback — called on success
13. TC13: Callback — called on error
14. TC14: No callback for jobs without chat_id (REST-submitted)
15. TC15: chat_id nulled after notification

### Phase 3: Implementation (GREEN)

Write code until all tests pass.

### Phase 4: Refactoring (REFACTOR)

Clean up without breaking tests.

## Verification

1. **Unit & Functional Tests**
   ```bash
   poetry run pytest tests/unit/test_telegram_bot.py -v
   poetry run pytest tests/functional/test_queue_worker.py -v
   ```

2. **Manual DB Migration**
   ```bash
   docker exec miximixi-backend python run_migrations.py
   ```

3. **Backend Startup**
   ```bash
   # Log should contain: "Queue-Worker und Telegram-Bot gestartet"
   ```

4. **End-to-End Telegram Test**
   - Send valid URL → bot replies "⏳"
   - After processing → "✅ Rezept '...' erfolgreich importiert!"
   - Send duplicate URL → "❌ Rezept existiert bereits"
   - Set `WORKER_MAX_CONCURRENT=1` and send 2 URLs → verify serial processing

5. **REST API Still Works**
   - `POST /import` still queues jobs
   - No `telegram_chat_id` column → NULL
   - Admin notifications still work for failed jobs

## Known Constraints

- **Telegram polling:** Not webhook-based (simpler for self-hosted, ~2s latency)
- **Max concurrent jobs:** Default 3, but monitor resource usage in production
- **Chat_id storage:** Only temporary (nulled after notification)
- **Admin notifications:** Fallback for jobs without chat_id

## Success Criteria

- ✅ All TDD tests pass
- ✅ Multiple URLs processed concurrently (verify via logs)
- ✅ User receives status messages (success, error, duplicate)
- ✅ `telegram_chat_id` is nulled after notification
- ✅ `worker_max_concurrent=1` forces serial processing
- ✅ Graceful shutdown (worker waits for jobs to finish)
- ✅ No regressions in REST `/import` endpoint
- ✅ Existing admin error notifications still work

## PR Checklist

Before creating PR to `main`:
- [ ] All tests pass (`poetry run pytest tests/ -v`)
- [ ] Local migration applied to test DB
- [ ] Manual Telegram test performed
- [ ] Log output verified
- [ ] Config documented in `.env.example`
- [ ] No breaking changes to existing `/import` endpoint
- [ ] Graceful shutdown tested (Ctrl+C)
