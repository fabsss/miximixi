# Feature Plan: Instagram Sync Worker Backend

**Branch:** `feature/instagram-sync-worker`  
**Status:** Planning  
**Last Updated:** 2026-04-16

## Overview

Replace n8n Instagram Collection Sync with native FastAPI background worker. This removes the last n8n dependency and allows us to **eliminate n8n entirely** from the deployment.

**Why:** 
- n8n adds operational complexity (separate service, memory overhead)
- Instagram syncing is a simple periodic task
- Easier to monitor, test, and debug in Python
- Consolidates all background jobs into single FastAPI process
- Admin can control which collections to monitor via Telegram

## Architecture

**Multi-User Ready** (currently single admin, scales to multiple users later)

```
┌─ Telegram Bot (polling)
│  ├─ User issues: /sync_setup, /sync_status, /sync_now
│  ├─ Extract user_id from update.effective_user.id
│  └─ Check if user is admin (env var now, DB query later)
│
├─ SyncControl (per-user)
│  ├─ sync_controls[user_id].enabled
│  ├─ sync_controls[user_id].selected_collection
│  └─ sync_controls[user_id].last_status
│
├─ run_instagram_sync() [asyncio task]
│  ├─ For EACH user in sync_controls:
│  │  ├─ Get user's selected collection (from DB)
│  │  ├─ Fetch Instagram posts
│  │  ├─ Detect new posts (per-user state in instagram_sync_state)
│  │  └─ Queue imports (with user_id)
│  └─ Every 15 minutes (900s)
│
├─ Database (user-scoped)
│  ├─ instagram_sync_collections (user_id, collection_id, ...)
│  ├─ instagram_sync_state (user_id, collection_id, post_id, ...)
│  └─ admin_users (telegram_user_id) [for now; future: users table]
│
└─ import_queue → run_worker → process_job → User notification
```

**Multi-User Transition (future):**
When adding authentication:
1. Add `users` table with `id`, `username`, `email`, etc.
2. Link `admin_users.telegram_user_id` → `users.id`
3. Add REST endpoints with FastAPI auth: `@app.authenticate(user: User = Depends(get_current_user))`
4. No changes needed to sync worker (already user-scoped)
5. Frontend settings UI just adds another way to query the same data

## Files

| File | Action | Status |
|------|--------|--------|
| `backend/app/instagram_sync_worker.py` | Create | NEW |
| `backend/app/main.py` | Update (add 3rd lifespan task) | Pending |
| `backend/tests/unit/test_instagram_sync_worker.py` | Create (TDD) | NEW |
| `supabase/migrations/009_instagram_sync_collections.sql` | Create | NEW |
| `.env.example` | Add sync config | Pending |
| `n8n/instagram_poller.json` | DELETE | Will decommission |
| `docker-compose.yml` | Remove n8n service | After PR merge |

## Multi-User Ready Architecture

**Current state:** Single admin user (Telegram ID from env var)  
**Future state:** Multiple users per system (Telegram + Frontend auth)

### Design Philosophy

Build with per-user isolation from day one, so adding multi-user support only requires:
1. Adding `users` table (auth model)
2. Changing admin lookup from env var to database query
3. Adding REST API endpoints with auth middleware

No sync worker refactoring needed — already user-scoped.

### Admin User Configuration (Single-User Now, Multi-User Ready)

**Now (single admin via environment):**
```bash
# .env
TELEGRAM_ADMIN_IDS=123456789,987654321  # Comma-separated list of Telegram user IDs
```

**How to find your Telegram user ID:**

1. Send a message to the bot
2. Check backend logs for: `user_id: 123456789`
3. Add that number to `TELEGRAM_ADMIN_IDS`

Or with custom logging:
```python
# In telegram_bot.py start handler
user_id = update.effective_user.id
logger.info(f"Your Telegram user ID is: {user_id}")
```

**Later (multi-user with user auth):**
Will use `admin_users` database table (migration 010) populated at setup:
```sql
-- Instead of env var, lookup in DB
SELECT * FROM admin_users 
WHERE telegram_user_id = $1 AND is_active = true
```

Then link to auth system:
```sql
ALTER TABLE admin_users ADD COLUMN user_id INT REFERENCES users(id)
```

### Key Changes for Multi-User Support

**1. User Identification (Now → Later)**

*Now (single admin):*
```python
# Check if Telegram user is admin
user_id = update.effective_user.id  # Telegram user ID
if user_id not in settings.telegram_admin_ids:
    # Deny access
```

*Later (with user auth):*
```python
# Check if user is admin in database
user = session.query(User).filter(User.telegram_user_id == user_id).first()
if not user or not user.is_admin:
    # Deny access
```

**2. Settings Storage (In-Memory → Database)**

*Now (single admin):*
```python
sync_controls: Dict[int, SyncControl] = {}
sync_controls[admin_user_id] = SyncControl(enabled=True, selected_collection=...)
```

*Later (multi-user):*
```python
# Load all active users' settings on startup
for user in session.query(User).filter(User.is_active == True):
    sync_controls[user.id] = await load_user_settings_from_db(user.id)
```

**3. Data Isolation (Global tables → User-scoped)**

Already built into database schema:

```python
# Now: Admin-only sync state
SELECT * FROM instagram_sync_state 
WHERE user_id = $1  -- Admin's telegram_user_id

# Later: Same query, user_id = authenticated user's database id
SELECT * FROM instagram_sync_state 
WHERE user_id = $1  -- User's users.id
```

**4. API Endpoints (Telegram only → Telegram + REST)**

*Now:*
```python
@telegram_bot.message_handler(commands=['sync_setup'])
async def sync_setup(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Telegram-only
```

*Later:*
```python
@app.get("/api/instagram-sync/settings")
async def get_sync_settings(current_user: User = Depends(get_current_user)):
    # REST API endpoint (same business logic as Telegram)
    # Filter by current_user.id instead of hardcoded admin_id
```

### Database Migrations for Multi-User

**Migration 008: instagram_sync_state (user-scoped)**
```sql
CREATE TABLE instagram_sync_state (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,  -- Now: Telegram ID | Later: users.id
    collection_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    synced_at TIMESTAMP DEFAULT now(),
    UNIQUE(user_id, collection_id, post_id)
);
```

**Migration 009: instagram_sync_collections (user-scoped)**
```sql
CREATE TABLE instagram_sync_collections (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    collection_id TEXT NOT NULL,
    collection_name TEXT,
    enabled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE(user_id, (CASE WHEN enabled_at IS NOT NULL THEN 1 END))
);
```

**Migration 010: admin_users (for auth integration)**
```sql
CREATE TABLE admin_users (
    id BIGSERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    telegram_username TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now()
    -- Later: user_id INT REFERENCES users(id)
);
```

### Sync Worker Changes (User-Aware)

**SyncControl class (per-user):**
```python
class SyncControl:
    user_id: int  # Telegram ID now, users.id later
    enabled: bool
    selected_collection: Optional[Dict]
    last_status: Optional[Dict]
```

**Main sync loop (multi-user ready):**
```python
async def run_instagram_sync(
    sync_controls_dict: Dict[int, SyncControl],  # All active users
    user_id: Optional[int] = None,  # If set: sync only one user
    ...
):
    """Sync ONE or ALL users, depending on context"""
    for current_user_id in [user_id] if user_id else sync_controls_dict.keys():
        control = sync_controls_dict[current_user_id]
        if not control.enabled:
            continue
        
        # Get user's selected collection (DB query per-user)
        collection = await get_monitored_collection(current_user_id)
        
        # Sync (all queries already filtered by user_id)
        posts = await fetch_collection_posts(current_user_id, collection_id)
        new_posts = await detect_new_posts(current_user_id, collection_id, posts)
        stats = await queue_recipe_imports(current_user_id, collection_id, new_posts)
```

### Telegram Commands (Multi-User Ready)

All handlers extract `user_id` and verify admin status:

```python
@telegram_bot.message_handler(commands=['sync_setup'])
async def sync_setup(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    
    # Check admin (now: env var)
    if user_id not in settings.telegram_admin_ids:
        await update.message.reply_text("❌ Admin only")
        return
    
    # Later: Check DB
    # user = session.query(AdminUser).filter(AdminUser.telegram_user_id == user_id).first()
    # if not user: return error
    
    # Get user's sync control (or create if missing)
    sync_control = await get_sync_control_for_user(user_id)
    
    # Rest of handler uses sync_control which is user-specific
```

---

New settings in `config.py`:

```python
instagram_sync_interval: int = 900  # 15 minutes (seconds)
instagram_sync_enabled: bool = True  # Can disable for testing
telegram_admin_ids: list[str] = []  # Admin user IDs for /sync_* commands

# Existing Instagram auth settings (reused from existing instagram_service.py):
instagram_cookies_file: str = "instagram_cookies.txt"  # Browser cookies export
instagram_username: str = ""  # Instagram username for logging
instagram_collection_id: str = ""  # Will be set dynamically via /sync_setup
```

## Instagram Authentication

The Instagram sync worker **reuses existing authentication** from `backend/app/instagram_service.py`:

1. **Cookie-based auth** via `sessionid` from `instagram_cookies.txt`
   - Same cookies file used by existing recipe downloader (yt-dlp)
   - No programmatic login needed
   - Export via browser extension "Get cookies.txt LOCALLY"
   - File must be in Mozilla cookie jar format

2. **How it works:**
   ```python
   # Load from cookies.txt
   jar = MozillaCookieJar(settings.instagram_cookies_file)
   jar.load()  # Load sessionid cookie
   
   # Use instaloader library
   L = instaloader.Instaloader(...)
   L.context._session.cookies.set("sessionid", session_id, ...)
   
   # Fetch collection via instaloader
   collection = instaloader.Collection(L.context, collection_id)
   posts = collection.get_posts()
   ```

3. **Collection access:**
   - Collection must be **public** or **owned by** the authenticated Instagram account
   - Collection ID dynamically set via `/sync_setup` menu
   - `get_available_collections()` lists all accessible collections for the account

Environment:
```bash
INSTAGRAM_SYNC_INTERVAL=900
INSTAGRAM_SYNC_ENABLED=true
INSTAGRAM_COOKIES_FILE=instagram_cookies.txt  # Path to exported cookies
INSTAGRAM_USERNAME=your_instagram_handle     # For logging
TELEGRAM_ADMIN_IDS=123456,789012
```

### 2. Database Schema for Sync State & Collections

**Track processed posts** to avoid re-queuing:

Create migration `008_instagram_sync_state.sql`:
```sql
CREATE TABLE IF NOT EXISTS instagram_sync_state (
    id SERIAL PRIMARY KEY,
    collection_id VARCHAR(100) NOT NULL,
    post_id VARCHAR(50) NOT NULL,
    source_url TEXT NOT NULL,
    last_processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    queued_job_id UUID REFERENCES import_queue(id) ON DELETE SET NULL,
    UNIQUE(collection_id, post_id)
);

CREATE INDEX idx_instagram_sync_collection_id ON instagram_sync_state(collection_id);
CREATE INDEX idx_instagram_sync_processed_at ON instagram_sync_state(last_processed_at);
```

**Track monitored collections** (admin selects via interactive menu):

Create migration `009_instagram_sync_collections.sql`:
```sql
CREATE TABLE IF NOT EXISTS instagram_sync_collections (
    id SERIAL PRIMARY KEY,
    collection_id VARCHAR(100) NOT NULL,
    collection_name VARCHAR(255),
    enabled BOOLEAN DEFAULT true,
    selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    selected_by_telegram_id VARCHAR(50),
    notes TEXT
);

-- Only one collection can be active at a time
CREATE UNIQUE INDEX idx_instagram_sync_only_one ON instagram_sync_collections(id) 
WHERE enabled = true;
```

### 3. Instagram Sync Worker Module

**`backend/app/instagram_sync_worker.py`**

Leverages existing `instagram_service.py` for authentication and media fetching via `instaloader`.

Main functions:

```python
async def get_available_collections() -> list[dict]
    """
    List all available Instagram collections for authenticated account.
    Uses instaloader to enumerate user's saved collections.
    Reuses existing instagram_service authentication (cookies.txt).
    Returns: [{"collection_id": "123", "collection_name": "Favorite Recipes", "post_count": 45}]
    Raises: ValueError if Instagram auth fails (expired cookie, invalid account)
    """

async def get_monitored_collections() -> list[dict]
    """
    Fetch the SELECTED collection from instagram_sync_collections table (only_one=true).
    Returns: [{"collection_id": "123", "collection_name": "...", "enabled": true}]
    """

async def fetch_collection_posts(collection_id: str) -> list[dict]
    """
    Fetches posts from specified Instagram collection using instaloader.Collection.
    Reuses instagram_service._get_loader() for authenticated client.
    Returns: [{"post_id": "ABC123", "url": "https://...", "caption": "...", "owner": "@username"}]
    Raises: instaloader.InstaloaderException if collection not found or not accessible
    """

async def has_recipe(post_caption: str) -> bool
    """
    Quick check: does caption mention recipes/cooking?
    Uses simple heuristics (Zutat, Rezept, Schritt) to filter out non-recipes.
    """

async def detect_new_posts(collection_id: str, collection_posts: list) -> list[dict]
    """
    Compares fetched posts against instagram_sync_state table.
    Returns only new posts not yet queued.
    """

async def queue_recipe_imports(collection_id: str, new_posts: list) -> dict
    """
    Inserts new posts into import_queue with source_type='instagram'.
    Updates instagram_sync_state with tracking info.
    Returns: {"queued": 3, "skipped": 1, "errors": 0}
    """

async def run_instagram_sync(sync_interval: int = 900) -> None
    """
    Main sync loop. Iterates over monitored collections every sync_interval seconds.
    """
```

**Workflow per sync:**

1. Fetch each monitored collection via Instagram service
2. For each post:
   - Check if already in `instagram_sync_state` for this collection → skip
   - Quick heuristic: does caption look like a recipe? → skip if not
   - Try to extract URL from caption or post
   - Queue as `pending` import job
   - Track in `instagram_sync_state`
3. Log summary: "Synced 2 collections. Queued 3 new recipes from 12 posts checked"

### 4. Integration into Lifespan

Update `backend/app/main.py`:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Existing setup
    os.makedirs(settings.tmp_dir, exist_ok=True)
    os.makedirs(settings.images_dir, exist_ok=True)

    notify_holder = [None]
    sync_control = SyncControl()  # NEW: Sync state management
    
    # Start 3 background tasks
    worker_task = asyncio.create_task(run_worker(...))
    
    # Bot needs sync_control injected for /sync_* commands
    async def init_bot():
        def set_notify_callback(callback):
            notify_holder[0] = callback
        await run_bot(set_notify_callback, sync_control)  # PASS sync_control
    
    bot_task = asyncio.create_task(init_bot())
    sync_task = asyncio.create_task(
        run_instagram_sync(sync_interval=settings.instagram_sync_interval, 
                          sync_control=sync_control)
    )
    
    logger.info("3 background workers gestartet")
    
    yield
    
    # Graceful shutdown
    for task in [worker_task, bot_task, sync_task]:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
```

### 5. Telegram Bot Integration for Sync Control

**Multi-User Ready**: All handlers extract `user_id` from message and verify admin status (env var now, DB lookup later).

**New Admin Commands** (in `backend/app/telegram_bot.py`):

```python
/sync_status    # Returns current sync state: enabled/disabled, selected collection
/sync_enable    # Enable Instagram sync (admin only)
/sync_disable   # Disable Instagram sync (admin only)
/sync_now       # Trigger manual sync immediately (admin only)
/sync_setup     # Interactive menu to select which collection to sync (admin only)
```

**Collection Selection Menu:**

The `/sync_setup` command shows an interactive menu with available Instagram collections:

```python
/sync_setup
→ "📋 Available Collections:

   Please select a collection to sync:
   
   [Favorite Recipes (45 posts)]
   [Quick Meals (23 posts)]
   [Desserts (18 posts)]
   
   (User taps a button to select)"
```

After selection:
```
Bot: ✅ Collection 'Favorite Recipes' (ID: 123) ausgewählt
     Sync startet beim nächsten Sync
     Alle 15 Minuten werden neue Rezepte von dieser Sammlung importiert
```

**Shared State for Sync Control:**

Similar to notify_holder pattern, use shared state object:

```python
class SyncControl:
    enabled: bool = True
    selected_collection_id: str = None  # Only ONE collection at a time
    last_status: dict = {}
    
    def enable(self):
        self.enabled = True
        
    def disable(self):
        self.enabled = False
        
    def set_collection(self, collection_id: str, collection_name: str) -> bool
        """Select collection. Replaces previous selection."""
        
    def get_status(self) -> dict:
        return {
            "enabled": self.enabled,
            "selected_collection": self.selected_collection_id,
            "last_sync": self.last_status.get("timestamp"),
            "next_sync_in": calculate_next_sync_time(),
            "last_stats": self.last_status,
        }
```

**Lifespan Wiring:**

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    sync_control = SyncControl()
    notify_holder = [None]  # Holds admin notification callback
    
    # Admin notification function
    async def notify_admin(chat_id: str, message: str):
        """Send admin notification via Telegram bot"""
        if notify_holder[0]:
            # Use existing bot application to send message
            await notify_holder[0].bot.send_message(chat_id=chat_id, text=message)
        else:
            logger.warning(f"Bot not initialized yet. Message not sent: {message}")
    
    # Wire Telegram bot commands to sync_control
    async def set_sync_control(control):
        # Inject into bot context
        pass
    
    bot_task = asyncio.create_task(
        run_bot(set_sync_control, sync_control)
    )
    
    # Wire sync worker with admin notification callback
    sync_task = asyncio.create_task(
        run_instagram_sync(
            sync_control=sync_control,
            notify_admin=notify_admin
        )
    )
    
    logger.info("3 background workers gestartet (worker, bot, sync)")
    
    yield
    
    # Graceful shutdown
    for task in [worker_task, bot_task, sync_task]:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
```

**Implementation in Bot:**

```python
async def sync_status_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_status command"""
    if not is_admin(update.effective_user.id):
        await update.message.reply_text("❌ Nur Admin-Benutzer können Sync-Befehle nutzen")
        return
    
    status = sync_control.get_status()
    msg = f"📊 Instagram Sync Status\n\n" \
          f"Status: {'✅ Aktiv' if status['enabled'] else '⏸️ Inaktiv'}\n" \
          f"Ausgewählte Sammlung: {status['selected_collection'] or '(keine)'}\n" \
          f"Nächster Sync: in {status['next_sync_in']}s\n" \
          f"Letzter Sync: {status['last_sync']}\n" \
          f"Letztes Ergebnis: {status['last_stats']}"
    
    await update.message.reply_text(msg)

async def sync_setup_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_setup command - show interactive collection selection menu"""
    if not is_admin(update.effective_user.id):
        await update.message.reply_text("❌ Nur Admin-Benutzer können /sync_setup nutzen")
        return
    
    try:
        # Fetch available collections from Instagram
        available = await get_available_collections()
    except ValueError as e:
        # Instagram auth failed (expired cookies, invalid account, etc.)
        await update.message.reply_text(
            f"❌ Instagram-Authentifizierung fehlgeschlagen:\n"
            f"{str(e)}\n\n"
            f"Lösung:\n"
            f"1. Exportiere neue cookies.txt von instagram.com\n"
            f"2. Ersetze backend/instagram_cookies.txt\n"
            f"3. Starte den Server neu und versuche /sync_setup erneut"
        )
        return
    except Exception as e:
        logger.exception(f"Error fetching Instagram collections: {e}")
        await update.message.reply_text(f"❌ Fehler beim Abrufen von Sammlungen: {str(e)}")
        return
    
    if not available:
        await update.message.reply_text("❌ Keine Instagram-Sammlungen gefunden. Bitte überprüfe Instagram-Anmeldedaten.")
        return
    
    # Build inline keyboard with collection buttons
    keyboard = []
    for coll in available:
        button_text = f"{coll['collection_name']} ({coll['post_count']} posts)"
        button = InlineKeyboardButton(
            text=button_text,
            callback_data=f"select_collection_{coll['collection_id']}"
        )
        keyboard.append([button])
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    msg = "📋 Verfügbare Instagram-Sammlungen:\n\n" \
          "Bitte wähle eine Sammlung zum Synchronisieren aus:\n"
    
    await update.message.reply_text(msg, reply_markup=reply_markup)

async def collection_select_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle collection selection via inline button"""
    query = update.callback_query
    
    if not is_admin(query.from_user.id):
        await query.answer("❌ Nur Admin", show_alert=True)
        return
    
    # Extract collection ID from callback_data
    collection_id = query.data.replace("select_collection_", "")
    
    # Fetch collection details
    available = await get_available_collections()
    selected = next((c for c in available if c['collection_id'] == collection_id), None)
    
    if not selected:
        await query.answer("❌ Sammlung nicht gefunden", show_alert=True)
        return
    
    # Set as selected in sync_control
    sync_control.set_collection(collection_id, selected['collection_name'])
    
    # Update database
    await db.execute(
        "DELETE FROM instagram_sync_collections WHERE enabled = true"
    )
    await db.execute(
        "INSERT INTO instagram_sync_collections (collection_id, collection_name, selected_by_telegram_id) "
        "VALUES (%s, %s, %s)",
        (collection_id, selected['collection_name'], str(query.from_user.id))
    )
    
    # Edit message to confirm selection
    msg = f"✅ Sammlung ausgewählt:\n\n" \
          f"📌 {selected['collection_name']}\n" \
          f"🔗 ID: {collection_id}\n" \
          f"📊 Posts: {selected['post_count']}\n\n" \
          f"⏱️ Der Sync startet beim nächsten Poll (in ~15 Minuten)"
    
    await query.edit_message_text(msg)
    await query.answer("✅ Sammlung ausgewählt", show_alert=False)
```

async def sync_enable_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_enable command"""
    if not is_admin(update.effective_user.id):
        return
    
    sync_control.enable()
    await update.message.reply_text(
        "✅ Instagram Sync aktiviert\nNächster Sync: in 15 Minuten"
    )

async def sync_disable_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_disable command"""
    if not is_admin(update.effective_user.id):
        return
    
    sync_control.disable()
    await update.message.reply_text("⏸️ Instagram Sync deaktiviert")

async def sync_now_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_now command - trigger manual sync"""
    if not is_admin(update.effective_user.id):
        return
    
    collection = await get_monitored_collections()
    if not collection:
        await update.message.reply_text(
            "❌ Keine Sammlung ausgewählt!\n"
            "Nutze /sync_setup um eine Sammlung zu wählen"
        )
        return
    
    await update.message.reply_text("🔄 Sync wird ausgelöst...")
    
    try:
        stats = await run_instagram_sync(sync_control, run_once=True)
        
        msg = f"📊 Sync abgeschlossen:\n" \
              f"- {stats['total_posts']} Posts geprüft\n" \
              f"- {stats['queued']} neue Rezepte queued\n" \
              f"- {stats['duplicates']} Duplikate übersprungen"
        
        await update.message.reply_text(msg)
    
    except ValueError as auth_error:
        # Instagram auth failed
        await update.message.reply_text(
            f"❌ Instagram-Authentifizierung fehlgeschlagen:\n\n"
            f"{str(auth_error)}\n\n"
            f"Lösung:\n"
            f"1. Gehe zu instagram.com und melde dich an\n"
            f"2. Exportiere neue cookies.txt via 'Get cookies.txt LOCALLY'\n"
            f"3. Ersetze backend/instagram_cookies.txt\n"
            f"4. Starte den Server neu\n"
            f"5. Versuche /sync_now erneut"
        )
    
    except Exception as e:
        await update.message.reply_text(
            f"❌ Fehler beim Sync:\n\n{str(e)}\n\n"
            f"Bitte überprüfe die Logs für mehr Details"
        )
```
```

**Sync Loop with Control:**

```python
async def run_instagram_sync(
    sync_interval: int = 900,
    sync_controls_dict: Optional[Dict[int, SyncControl]] = None,  # Per-user controls
    run_once: bool = False,  # For /sync_now
    user_id: Optional[int] = None,  # Which user to sync (None = sync all)
    notify_admin: Optional[Callable] = None,  # Admin notification callback
) -> dict:
    """
    Instagram sync loop with multi-user support.
    Syncs the ONE selected collection per user.
    
    Multi-user ready: When you add user auth later, just pass user_id list instead of None.
    
    Args:
        sync_interval: Seconds between syncs (shared across all users)
        sync_controls_dict: Dict[user_id -> SyncControl] for multi-user support
        run_once: If True, run once and return stats (for /sync_now)
        user_id: If set, sync only this user; if None, sync all active users
        notify_admin: Callback to notify admin of auth failures
    """
    
    while True:
        try:
            # Determine which users to sync
            if user_id:
                users_to_sync = [user_id]  # Manual trigger for one user
            else:
                users_to_sync = list(sync_controls_dict.keys()) if sync_controls_dict else []  # All active users
            
            # Sync each user's collection
            total_stats = {"total_posts": 0, "queued": 0, "duplicates": 0}
            
            for current_user_id in users_to_sync:
                sync_control = sync_controls_dict.get(current_user_id)
                
                # Check if sync is enabled for this user
                if sync_control and not sync_control.enabled:
                    if run_once:
                        # For manual trigger, report disabled state
                        return {"error": "Sync disabled for this user"}
                    continue
                
                # Get the SINGLE selected collection for this user
                collection = await get_monitored_collection(current_user_id)
                
                if not collection:
                    logger.warning(f"No collection selected for user {current_user_id}. Skipping.")
                    if run_once:
                        return {"total_posts": 0, "queued": 0, "duplicates": 0, "error": "No collection selected"}
                    continue
                
                # Sync this user's collection
                posts = await fetch_collection_posts(current_user_id, collection["collection_id"])
                new_posts = await detect_new_posts(current_user_id, collection["collection_id"], posts)
                stats = await queue_recipe_imports(current_user_id, collection["collection_id"], new_posts)
                
                # Update sync_control with stats for this user
                if sync_control:
                    sync_control.last_status = {
                        "timestamp": datetime.now(),
                        "collection_name": collection["collection_name"],
                        **stats,
                    }
                
                logger.info(f"User {current_user_id} sync complete: {stats['queued']} recipes queued")
                
                # Accumulate stats if syncing multiple users
                total_stats["total_posts"] += stats["total_posts"]
                total_stats["queued"] += stats["queued"]
                total_stats["duplicates"] += stats["duplicates"]
                
                if run_once:
                    return stats  # Return stats for the requested user
            
            await asyncio.sleep(sync_interval)
            
        except ValueError as auth_error:
            # Instagram auth failed (cookies expired, invalid sessionid, etc.)
            error_msg = str(auth_error)
            logger.error(f"Instagram auth failed: {error_msg}")
            logger.error("⚠️ Cookies may have expired. Notifying admin...")
            
            # Notify admin via Telegram
            if notify_admin:
                await notify_admin(
                    chat_id=settings.telegram_notify_chat_id,
                    message=f"⚠️ Instagram Sync Auth Error\n\n"
                            f"Die Instagram-Authentifizierung ist abgelaufen!\n\n"
                            f"Fehler: {error_msg}\n\n"
                            f"Lösung:\n"
                            f"1. Gehe zu instagram.com und melde dich an\n"
                            f"2. Exportiere neue cookies.txt via 'Get cookies.txt LOCALLY'\n"
                            f"3. Ersetze backend/instagram_cookies.txt\n"
                            f"4. Starte den Server neu\n"
                            f"5. Nutze /sync_setup um die Authentifizierung zu testen"
                )
            
            # Continue trying (don't crash)
            await asyncio.sleep(sync_interval)
            
        except Exception as e:
            # Rate limit, network error, database error, etc.
            logger.exception(f"Sync error (will retry): {e}")
            await asyncio.sleep(sync_interval)
```

## Testing Strategy (TDD)

### Phase 1: Unit Tests

**`test_instagram_sync_worker.py`** (8 tests):

1. **TC1**: `fetch_collection_posts()` returns list of posts
2. **TC2**: `has_recipe()` detects German recipe keywords (Zutat, Rezept)
3. **TC3**: `has_recipe()` ignores non-recipe captions
4. **TC4**: `detect_new_posts()` returns only unseen posts for collection
5. **TC5**: `detect_new_posts()` skips already-queued posts from collection
6. **TC6**: `queue_recipe_imports()` inserts jobs into import_queue
7. **TC7**: `queue_recipe_imports()` tracks in instagram_sync_state per collection
8. **TC8**: `run_instagram_sync()` sync interval respects config

### Phase 1b: Telegram Control Commands (Unit Tests)

**`test_telegram_bot.py`** (add 7 new tests):

9. **TC9**: `/sync_status` requires admin user
10. **TC10**: `/sync_status` shows enabled/disabled state + selected collection
11. **TC11**: `/sync_setup` fetches available collections from Instagram
12. **TC12**: `/sync_setup` renders inline buttons with collection names
13. **TC13**: Collection button callback sets selected collection in SyncControl
14. **TC14**: Collection button callback updates database (old collection deleted, new one inserted)
15. **TC15**: `/sync_setup` when no collections available shows error message
16. **TC16**: `/sync_setup` with invalid Instagram auth shows recovery steps

### Phase 1c: Enable/Disable/Now Commands

**`test_telegram_bot.py`** (add 4 more tests):

17. **TC17**: `/sync_enable` sets sync_control.enabled = True
18. **TC18**: `/sync_disable` sets sync_control.enabled = False
19. **TC19**: `/sync_now` triggers immediate sync and returns stats
20. **TC20**: `/sync_now` with Instagram auth error shows recovery steps to user

### Phase 2: Functional Tests

**`test_instagram_sync_integration.py`** (6 tests):

21. **TC21**: Full sync cycle with selected collection: fetch → detect → queue → track
22. **TC22**: Duplicate posts not re-queued on next sync
23. **TC23**: Sync skips if no collection selected (logs warning)
24. **TC24**: Sync respects `sync_control.enabled` flag and pauses when disabled
25. **TC25**: Instagram auth error triggers admin notification via Telegram
26. **TC26**: Admin notification includes recovery steps (new cookies, restart)

## Verification Checklist

### Pre-Implementation
- [ ] Review existing Instagram service functions
- [ ] Confirm `import_queue` table schema compatibility
- [ ] Implement `get_available_collections()` function (API or scraping)
- [ ] Define recipe detection heuristics (keywords)
- [ ] Document Instagram API rate limits
- [ ] Design instagram_sync_collections table for ONE collection
- [ ] Define admin user IDs for Telegram sync commands

### Post-Implementation
- [ ] All tests pass (TC1-TC23)
- [ ] Database migrations applied (008 + 009)
- [ ] `/sync_setup` shows available Instagram collections as buttons
- [ ] Select a collection via button → database updated, SyncControl updated
- [ ] Manual sync test: `/sync_setup` → select collection → `/sync_now` → recipes queued
- [ ] Verify `instagram_sync_state` table populated correctly for selected collection
- [ ] Verify `instagram_sync_collections` table has exactly ONE enabled entry
- [ ] Log output shows sync interval respected
- [ ] `/sync_status` returns correct state and selected collection name
- [ ] `/sync_disable` stops automatic syncing, waits 15 min (no new syncs)
- [ ] `/sync_now` triggers immediate sync while disabled (if collection selected)
- [ ] `/sync_enable` resumes automatic syncing
- [ ] `/sync_setup` called again replaces previously selected collection
- [ ] Non-admin user gets "❌ Nur Admin" message
- [ ] `/sync_now` shows error if no collection selected
- [ ] Graceful shutdown tested (Ctrl+C during sync)

### Decommissioning n8n
- [ ] Feature branch merged to main
- [ ] Telegram bot working (feature/telegram-bot-backend merged)
- [ ] All background workers stable (1+ hour uptime)
- [ ] n8n postgres and services can be stopped
- [ ] `docker-compose.yml` updated to remove n8n
- [ ] `.env.example` removes n8n vars
- [ ] Deployment docs updated

## Success Criteria

- ✅ All 23 TDD tests passing
- ✅ `/sync_setup` fetches available Instagram collections from account
- ✅ User can select collection via interactive button menu
- ✅ Only ONE collection is synced at a time
- ✅ Instagram recipes queued automatically every 15 minutes from selected collection
- ✅ No duplicate recipe imports from same Instagram post
- ✅ Sync continues if single post fails (error resilience)
- ✅ **Telegram admin can control sync:**
  - `/sync_status` shows enabled/disabled + selected collection name + next sync time
  - `/sync_setup` shows available collections as interactive buttons
  - Selected collection replaces previous selection
  - `/sync_disable` stops automatic syncing (no new syncs queued)
  - `/sync_enable` resumes automatic syncing
  - `/sync_now` triggers manual sync immediately (shows stats)
  - `/sync_now` shows error if no collection selected
- ✅ Non-admin users cannot access sync commands
- ✅ Existing `/import` endpoint still works
- ✅ Existing Telegram bot integration still works
- ✅ Graceful shutdown with existing worker + bot + sync
- ✅ Admin can change selected collection anytime via `/sync_setup`
- ✅ n8n can be completely removed from deployment

## Configuration Examples

### Development (test Instagram collection)
```bash
INSTAGRAM_SYNC_INTERVAL=60          # Sync every 1 minute for testing
INSTAGRAM_SYNC_ENABLED=true
TELEGRAM_ADMIN_IDS=123456             # Your test user ID
```

### Production (standard)
```bash
INSTAGRAM_SYNC_INTERVAL=900         # Sync every 15 minutes
INSTAGRAM_SYNC_ENABLED=true
TELEGRAM_ADMIN_IDS=123456,789012      # Real admin IDs
```

### Disabled (debugging)
```bash
INSTAGRAM_SYNC_ENABLED=false        # No automatic syncing
TELEGRAM_ADMIN_IDS=123456             # BUT /sync_now still works for manual trigger
```

## Telegram Admin Command Examples

**Scenario 1: Select Collection on First Setup**
```
User (admin):  /sync_setup

Bot:
📋 Verfügbare Instagram-Sammlungen:

Bitte wähle eine Sammlung zum Synchronisieren aus:

[Favorite Recipes (45 posts)]
[Quick Meals (23 posts)]
[Desserts (18 posts)]

User (taps button "Favorite Recipes"):

Bot:           ✅ Sammlung ausgewählt:

               📌 Favorite Recipes
               🔗 ID: 123456789
               📊 Posts: 45

               ⏱️ Der Sync startet beim nächsten Poll (in ~15 Minuten)
```

**Scenario 2: Check Sync Status**
```
User (admin):  /sync_status

Bot:
📊 Instagram Sync Status

Status: ✅ Aktiv
Ausgewählte Sammlung: Favorite Recipes
Nächster Sync: in 12 Min. 34 Sek.
Letzter Sync: vor 2 Min.
Letztes Ergebnis: 12 posts, 3 neu, 2 dup.
```

**Scenario 3: Change Selected Collection**
```
User (admin):  /sync_setup

Bot:
📋 Verfügbare Instagram-Sammlungen:

[Favorite Recipes (45 posts)]
[Quick Meals (23 posts)]  ← Select this one
[Desserts (18 posts)]

User (taps button "Quick Meals"):

Bot:           ✅ Sammlung ausgewählt:

               📌 Quick Meals
               🔗 ID: 987654321
               📊 Posts: 23

               ⏱️ Der Sync startet beim nächsten Poll (in ~15 Minuten)
```

**Scenario 4: Disable Sync During Maintenance**
```
User (admin):  /sync_disable

Bot:           ⏸️ Instagram Sync deaktiviert

(next automatic sync won't happen until re-enabled)

User (admin):  /sync_enable

Bot:           ✅ Instagram Sync aktiviert
               Nächster Sync: in 15 Minuten
```

**Scenario 5: Manual Sync Trigger**
```
User (admin):  /sync_now

Bot:           🔄 Sync wird ausgelöst...
               Bitte warte auf das Ergebnis

(after 10-30 seconds)

Bot:           📊 Sync abgeschlossen:
               - 12 Posts geprüft
               - 3 neue Rezepte queued
               - 2 Duplikate übersprungen
```

**Scenario 6: Try Sync Without Selecting Collection**
```
User (admin):  /sync_now

Bot:           ❌ Keine Sammlung ausgewählt!
               Nutze /sync_setup um eine Sammlung zu wählen
```

**Scenario 7: Non-Admin Attempts Command**
```
User (regular): /sync_setup

Bot:            ❌ Nur Admin-Benutzer können /sync_setup nutzen
```

## Migration Path

### Week 1: Implementation + Testing
1. Create feature branch `feature/instagram-sync-worker`
2. Implement worker + tests (TC1-TC23)
3. Deploy to staging for 1 week observation

### Week 2: Validation
1. Monitor sync logs and `instagram_sync_state` table
2. Verify no duplicate queuing from selected collection
3. Test `/sync_setup` button selection with multiple collections
4. Test changing collection via `/sync_setup` (replaces previous)
5. Check concurrent processing with Telegram bot + REST API
6. Get sign-off on recipe import quality

### Week 3: n8n Decommissioning
1. Merge feature to main
2. Update deployment to remove n8n service
3. Reduce n8n postgres retention (if shared)
4. Archive n8n workflows as documentation

## How to Find Instagram Collection IDs

Instagram collections are saved collections of posts. Collection IDs can be found via:

### Method 1: Instagram Web/App URL
1. Go to a profile/account on Instagram
2. Tap the menu at the top (☰)
3. Look for "Collections", "Saved", or similar section
4. Open a collection - the URL will look like:
   ```
   https://www.instagram.com/collections/[COLLECTION_ID]/
   ```
   or
   ```
   https://www.instagram.com/[USERNAME]/collections/[COLLECTION_ID]/
   ```
5. Copy the numeric `COLLECTION_ID`

### Method 2: Instagram Graph API (Programmatic)
If using Instagram Graph API:
```bash
curl -H "Authorization: Bearer {ACCESS_TOKEN}" \
  "https://graph.instagram.com/me/ig_user/collections"
```
Response includes collection IDs in the format: `123456789012345`

### Method 3: Testing with Bot Command
If unsure about which collection to use, run `/sync_setup` to see all available collections:
```
User: /sync_setup

Bot: [Shows list of available collections as buttons]

User: (Select a collection by tapping a button)

Bot: ✅ Sammlung ausgewählt
     (Sync will start on next cycle every 15 minutes)
```

## Instagram Cookie Authentication & Maintenance

### How It Works

The sync worker uses **browser cookie authentication** (same as existing recipe downloader):

1. **Export cookies from browser:**
   - Install browser extension "Get cookies.txt LOCALLY" (or similar)
   - Go to instagram.com and log in
   - Export cookies → save as `instagram_cookies.txt`
   - Place in backend directory (same as `backend/app/instagram_cookies.txt`)

2. **How the worker authenticates:**
   ```python
   # Load sessionid from cookies.txt
   jar = MozillaCookieJar("instagram_cookies.txt")
   jar.load(ignore_discard=True)
   
   # Extract sessionid cookie
   sessionid = next((c.value for c in jar if c.name == "sessionid"), None)
   
   # Use with instaloader
   L = instaloader.Instaloader()
   L.context._session.cookies.set("sessionid", sessionid, domain=".instagram.com")
   ```

### Cookie Expiration & Refresh

**Instagram cookies typically expire after:**
- 90 days of no activity
- Browser logout or clear cookies
- Instagram security update (manual logout on all devices)

**When cookies expire:**
```
User: /sync_setup
Bot: ❌ Instagram-Authentifizierung fehlgeschlagen
     Bitte cookies.txt aktualisieren und Server neu starten
```

**To refresh cookies:**
1. Go to instagram.com in browser (log in if needed)
2. Use "Get cookies.txt LOCALLY" to export fresh cookies
3. Replace `backend/instagram_cookies.txt`
4. Restart the backend service (cookies reloaded on startup)
5. Try `/sync_setup` again

### Shared Authentication

The sync worker **uses the exact same `instagram_cookies.txt`** as the existing recipe downloader:
- Both use `instaloader` library
- Both configured in `config.py`
- Expiry affects BOTH features
- Single point of authentication management

## Admin Notifications for Authentication Failures

When Instagram authentication fails during a sync attempt, the admin is notified **automatically via Telegram**:

### Notification Flow

```
run_instagram_sync() catches ValueError (auth error)
    ↓
Calls notify_admin() callback
    ↓
Telegram bot sends message to TELEGRAM_NOTIFY_CHAT_ID
    ↓
Admin receives: "⚠️ Instagram Sync Auth Error - Cookies expired"
    ↓
Admin follows repair steps in the message
```

### Example Admin Notification

```
⚠️ Instagram Sync Auth Error

Die Instagram-Authentifizierung ist abgelaufen!

Fehler: Kein 'sessionid' Cookie in der Cookies-Datei gefunden.

Lösung:
1. Gehe zu instagram.com und melde dich an
2. Exportiere neue cookies.txt via 'Get cookies.txt LOCALLY'
3. Ersetze backend/instagram_cookies.txt
4. Starte den Server neu
5. Nutze /sync_setup um die Authentifizierung zu testen
```

### How Admin Gets Notified

1. **Automatic notification** during background sync:
   - Every 15 minutes, if auth fails → admin gets notification
   - Only on first failure (not spammed on every attempt)
   - Message includes recovery steps

2. **On-demand notification** via `/sync_now`:
   - Admin runs `/sync_now` manually
   - If auth fails → immediate Telegram response with error + recovery steps
   - No separate admin notification (user gets direct feedback)

### Configuration

Admin notification requires:
```bash
# Required for notifications to Admin
TELEGRAM_NOTIFY_CHAT_ID=123456789   # Admin's Telegram chat ID

# The sync worker sends to this chat when auth fails
# Must be a valid Telegram chat_id (numeric)
```

Admin chat ID can be found by:
1. Send any message to the bot
2. Check backend logs for `chat_id: <number>`
3. Set `TELEGRAM_NOTIFY_CHAT_ID` to that number

## Known Constraints

- **Single collection:** Only ONE collection can be selected at a time
- **Cookie-based auth:** Instagram auth via browser cookies (`sessionid`)
  - Cookies loaded from `instagram_cookies.txt` (Mozilla cookie jar format)
  - Expires after ~90 days or browser logout → must refresh via browser export
  - Shared with existing recipe downloader (same auth mechanism)
  - Error on expired cookies: `/sync_setup` will fail with "Instagram auth failed"
- **Sync interval:** Fixed 15 minutes (read-only, safe from rate limits)
- **Rate limits:** Instagram has rate limits; `instaloader` includes backoff handling
- **Collection switching:** `/sync_setup` replaces previous selection (only one active)
- **Recipe detection:** Simple heuristic; requires refinement for different languages
- **Database:** Requires new tables `instagram_sync_state` and `instagram_sync_collections`
- **Platform dependency:** Uses `instaloader` library (web scraping, may break if Instagram changes UI)

## Future Enhancements

- [ ] Recipe preview from Instagram post caption before full extraction
- [ ] Webhook-based polling (if Instagram API supports)
- [ ] Configurable recipe keywords (per language)
- [ ] Metrics: "recipes queued per sync", "avg sync duration", "sync health"
- [ ] Support for multiple collections (separate toggle for each)
- [ ] Statistics dashboard in Telegram (trending recipes, sync history)

## Related Issues

- Replaces: n8n Instagram Poller workflow
- Depends on: Feature `feature/telegram-bot-backend` (merged first)
- Blocks: n8n service decommissioning
- Related: Feature `feature/telegram-bot-backend` (parallel job processing)

## PR Checklist

Before creating PR to `main`:
- [ ] All tests pass (`pytest tests/unit/test_instagram_sync_worker.py -v`)
- [ ] All functional tests pass (`pytest tests/functional/test_instagram_sync_integration.py -v`)
- [ ] All Telegram bot tests pass (TC9-TC19 for sync commands + /sync_setup)
- [ ] Database migrations tested on local schema (008 + 009)
- [ ] `/sync_setup` fetches available collections from Instagram API
- [ ] Select collection via button → database updated correctly (only one enabled)
- [ ] Manual Instagram sync performed and verified with selected collection
- [ ] Telegram `/sync_status` tested with admin + non-admin users
- [ ] Telegram `/sync_setup` → button select → `/sync_now` flow tested
- [ ] `/sync_setup` called again replaces previous collection selection
- [ ] `/sync_now` shows error if no collection selected
- [ ] Config documented in `.env.example` with `TELEGRAM_ADMIN_IDS`
- [ ] No regressions in Telegram bot + REST API imports
- [ ] Graceful shutdown tested
- [ ] Log output verified (examples in docs)

---

## Implementation Verification Checklist

Use this comprehensive checklist to verify the implementation is complete and production-ready:

### Code & Architecture
- [ ] `backend/app/instagram_sync_worker.py` created with all 7 functions
  - [ ] `get_available_collections()` - fetches user's Instagram collections
  - [ ] `get_monitored_collections()` - retrieves selected collection from DB
  - [ ] `fetch_collection_posts(collection_id)` - gets posts from collection
  - [ ] `detect_new_posts(collection_id, posts)` - finds unseen posts
  - [ ] `queue_recipe_imports(collection_id, posts)` - imports to queue
  - [ ] `run_instagram_sync(...)` - main loop with callbacks
  - [ ] `SyncControl` - class for enable/disable + collection selection
- [ ] Lifespan wiring includes 3 concurrent tasks (bot + sync + uvicorn)
- [ ] Admin notification callback injected into sync loop
- [ ] Error handling for auth failures (ValueError catch)
- [ ] Graceful retry on auth failure (doesn't crash)
- [ ] Shared auth with recipe downloader (same `instagram_cookies.txt`)

### Database Migrations
- [ ] Migration 008: `instagram_sync_state` table created
  - [ ] Columns: `id`, `collection_id`, `post_id`, `synced_at`
  - [ ] Composite PK on `(collection_id, post_id)`
  - [ ] Index on `collection_id` for lookups
- [ ] Migration 009: `instagram_sync_collections` table created
  - [ ] Columns: `id`, `collection_id`, `collection_name`, `enabled_at`, `disabled_at`
  - [ ] Unique index on `(enabled_at IS NOT NULL)` → only ONE enabled
- [ ] Migrations applied to staging + production

### Telegram Commands (5 handlers)
- [ ] `/sync_setup` 
  - [ ] Fetches available collections from Instagram
  - [ ] Renders inline buttons with collection names
  - [ ] Shows count of posts per collection
  - [ ] Requires admin user verification
- [ ] `/sync_status`
  - [ ] Shows enabled/disabled state
  - [ ] Displays selected collection name
  - [ ] Shows next sync time + last sync result
  - [ ] Requires admin user verification
- [ ] `/sync_enable`
  - [ ] Sets `sync_control.enabled = True`
  - [ ] Requires admin user verification
- [ ] `/sync_disable`
  - [ ] Sets `sync_control.enabled = False`
  - [ ] Requires admin user verification
- [ ] `/sync_now`
  - [ ] Triggers immediate one-time sync
  - [ ] Shows stats (posts checked, queued, duplicates)
  - [ ] Shows error + recovery steps on auth failure
  - [ ] Requires admin user verification

### Button Callbacks
- [ ] Collection selection button callback:
  - [ ] Updates `SyncControl` with selected collection
  - [ ] Updates database: deletes old record, inserts new one
  - [ ] Confirms selection to user with collection details
  - [ ] Respects unique index (only one collection enabled)

### Authentication & Cookies
- [ ] Uses shared `instagram_cookies.txt` (same as recipe downloader)
- [ ] Cookie format: Mozilla cookie jar (netscape format)
- [ ] Extracts `sessionid` cookie for instaloader
- [ ] Handles cookie expiration gracefully (ValueError on missing sessionid)
- [ ] Admin can refresh cookies via browser export (documented)
- [ ] Cookies reloaded on server startup (not cached in memory)

### Admin Notifications
- [ ] Notification triggered on auth failure (ValueError catch)
- [ ] Callback function `notify_admin(chat_id, message)` defined in lifespan
- [ ] Bot app reference stored in `notify_holder` list
- [ ] Message sent to `TELEGRAM_NOTIFY_CHAT_ID` setting
- [ ] Message includes:
  - [ ] Error description (e.g., "sessionid cookie expired")
  - [ ] Step-by-step recovery instructions (German language)
  - [ ] Command to test after recovery (`/sync_setup`)
- [ ] Notification sent only on first failure (not spammed)
- [ ] Admin can manually fix cookies + restart
- [ ] Sync resumes automatically after restart

### Error Handling
- [ ] Auth failures (ValueError) caught in sync loop:
  - [ ] Logged with full error message
  - [ ] Admin notified via Telegram
  - [ ] Sync loop continues (sleeps `sync_interval`)
- [ ] Rate limit errors handled gracefully:
  - [ ] Logged 
  - [ ] Sync loop backoffs and retries
- [ ] Database errors handled:
  - [ ] No duplicate imports on state conflicts
  - [ ] Logs error and continues
- [ ] Network errors handled:
  - [ ] Retries with exponential backoff
  - [ ] Doesn't crash the main loop

### Testing (26 tests total)
- [ ] TC1-8: Unit tests for sync worker functions
- [ ] TC9-16: Telegram command handler tests
- [ ] TC17-20: Enable/disable/now command tests
- [ ] TC21-26: Functional integration tests
- [ ] **TC25-26: Admin notification tests** (auth failure → notification)
  - [ ] Test ValueError thrown by Instagram auth
  - [ ] Verify `notify_admin()` callback called
  - [ ] Verify Telegram message sent to admin chat
  - [ ] Verify message includes recovery steps

### Staging Deployment
- [ ] Database migrations applied without errors
- [ ] Sync worker starts and connects to Instagram
- [ ] `/sync_setup` loads available collections (list appears within 5s)
- [ ] Select collection via button (database updated, confirm shown)
- [ ] Background sync runs (logs show "Sync complete" every 15 min)
- [ ] `/sync_status` shows selected collection + next sync time
- [ ] `/sync_now` triggers manual sync (stats appear in 10-30s)
- [ ] Manually trigger auth failure:
  - [ ] Delete `instagram_cookies.txt`
  - [ ] Run `/sync_now` → error message shown to user + recovery steps
  - [ ] Admin receives Telegram notification (within 5 min)
  - [ ] Message includes recovery instructions
- [ ] Recover from auth failure:
  - [ ] Export fresh cookies via browser
  - [ ] Replace `backend/instagram_cookies.txt`
  - [ ] Restart server
  - [ ] Run `/sync_setup` → collections load successfully
  - [ ] Run `/sync_now` → sync completes successfully

### Configuration
- [ ] `.env.example` includes:
  - [ ] `INSTAGRAM_SYNC_INTERVAL=900` (15 min)
  - [ ] `INSTAGRAM_SYNC_ENABLED=true`
  - [ ] `TELEGRAM_NOTIFY_CHAT_ID=123456789` (admin's chat ID)
- [ ] Documentation added: how to find admin chat ID
- [ ] All settings have sensible defaults

### Documentation
- [ ] Feature plan complete: `docs/plans/instagram-poller-worker.md`
- [ ] How to find Instagram collection ID (3 methods documented)
- [ ] How to refresh Instagram cookies (admin runbook)
- [ ] Example admin notifications (German language)
- [ ] Configuration examples (dev, prod, disabled)
- [ ] Architecture diagram updated in `docs/architecture.md`
- [ ] Deployment guide updated: `docs/deployment.md`

### Production Readiness
- [ ] All 26 tests passing (unit + functional)
- [ ] Code review approved (security, error handling)
- [ ] No security issues (no hardcoded credentials, proper env vars)
- [ ] No performance regressions (sync doesn't block REST API)
- [ ] Graceful shutdown tested:
  - [ ] Ctrl+C during sync → worker finishes current cycle
  - [ ] Bot receives `Updater.stop()` signal
  - [ ] All 3 tasks (bot, sync, uvicorn) shut down cleanly
  - [ ] No orphaned asyncio tasks
- [ ] Monitoring & logging:
  - [ ] Sync start/end logged with timestamp
  - [ ] Auth failures logged with error details
  - [ ] New recipes queued logged with count
  - [ ] No sensitive data in logs (passwords, private IDs)
- [ ] Rollback tested:
  - [ ] Can disable sync without downtime (`INSTAGRAM_SYNC_ENABLED=false`)
  - [ ] Existing `/import` endpoint still works
  - [ ] Existing Telegram bot still works

### n8n Decommissioning (after approval)
- [ ] Feature merged to main
- [ ] Telegram bot working + stable for 1+ week
- [ ] Background worker stable for 1+ week
- [ ] Remove n8n service from `docker-compose.yml`
- [ ] Remove n8n migration guide from deployment docs
- [ ] Update roadmap: "n8n removed ✅"
- [ ] Archive n8n workflows as historical reference
