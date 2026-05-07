# User Authentication & Telegram Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT-based user authentication to Miximixi with QR-code Telegram device linking, secure credential storage, and persistent browser login.

**Architecture:** A new `auth.py` module handles JWT issuance and verification via a FastAPI `Depends()` guard. The existing `users` table is extended with `password_hash`. Two new tables (`user_telegram_links`, `telegram_link_codes`) power the QR/deep-link pairing flow. The frontend gets an `AuthContext`, a `LoginPage`, and a `ProfilePage` with QR rendering.

**Tech Stack:** Python-jose (JWT), bcrypt, cryptography/Fernet (AES-256), qrcode (npm), React context API, localStorage for token persistence.

---

## File Map

**Create:**
- `backend/migrations/017_user_auth_telegram_linking.sql`
- `backend/app/auth.py` — JWT helpers + `get_current_user` dependency
- `backend/app/crypto.py` — Fernet encrypt/decrypt
- `backend/tests/unit/test_auth.py`
- `backend/tests/unit/test_crypto.py`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/ProfilePage.tsx`
- `frontend/src/components/ProtectedRoute.tsx`

**Modify:**
- `backend/app/config.py` — add `secret_key`, `encryption_key`, `telegram_bot_username`, `admin_key`
- `backend/app/main.py` — add `/auth/*` endpoints, tighten CORS
- `backend/app/telegram_bot.py` — replace env allowlist with DB lookup, add `/start` deep link handler
- `backend/pyproject.toml` — add `python-jose[cryptography]`, `bcrypt`, `cryptography`
- `frontend/package.json` — add `qrcode`, `@types/qrcode`
- `frontend/src/lib/api.ts` — add auth header, add `login()` function
- `frontend/src/App.tsx` — add `AuthProvider`, protected routes, `/login`, `/profile`

---

## Task 1: DB Migration

**Files:**
- Create: `backend/migrations/017_user_auth_telegram_linking.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 017: User auth, Telegram linking, Instagram credentials

-- Extend users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- One Telegram device per row, multiple rows per user allowed
CREATE TABLE IF NOT EXISTS user_telegram_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id  BIGINT NOT NULL UNIQUE,
  telegram_username TEXT,
  linked_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_links_user_id ON user_telegram_links(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_telegram_id ON user_telegram_links(telegram_user_id);

-- Short-lived QR/deep-link codes
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code        TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_link_codes_user_id ON telegram_link_codes(user_id);

-- Per-user Instagram credentials (future use)
CREATE TABLE IF NOT EXISTS user_instagram_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instagram_username   TEXT NOT NULL,
  password_encrypted   BYTEA NOT NULL,
  session_file_path    TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  last_verified_at     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, instagram_username)
);
```

- [ ] **Step 2: Verify migration file is picked up by the runner**

The migration runner in `main.py` applies all `.sql` files in `backend/migrations/` ordered by filename. Confirm `017_` sorts after `016_`.

```bash
ls backend/migrations/*.sql | sort
```
Expected: `016_instagram_auth_state.sql` before `017_user_auth_telegram_linking.sql`.

- [ ] **Step 3: Apply migration locally**

```bash
cd backend
poetry run python -c "
from app.main import run_migrations
run_migrations()
"
```
Expected: `Migration 017_user_auth_telegram_linking.sql angewendet` in output.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/017_user_auth_telegram_linking.sql
git commit -m "feat: migration 017 — user auth, telegram linking, instagram credentials tables"
```

---

## Task 2: Backend Dependencies + Config

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add Python dependencies**

In `backend/pyproject.toml`, under `[tool.poetry.dependencies]`, add:

```toml
python-jose = {extras = ["cryptography"], version = "^3.3.0"}
bcrypt = "^4.1.0"
cryptography = "^42.0.0"
```

- [ ] **Step 2: Install**

```bash
cd backend
poetry add "python-jose[cryptography]" "bcrypt>=4.1.0" "cryptography>=42.0.0"
```
Expected: lock file updated, no errors.

- [ ] **Step 3: Add config fields**

In `backend/app/config.py`, add to the `Settings` class after the `frontend_url` field:

```python
# Auth
secret_key: str = ""          # JWT signing secret — must be set in production
admin_key: str = ""           # X-Admin-Key for POST /auth/register
encryption_key: str = ""      # Fernet key for Instagram passwords (base64)

# Telegram
telegram_bot_username: str = "miximixi_bot"
```

- [ ] **Step 4: Write failing test**

Create `backend/tests/unit/test_config_auth.py`:

```python
import os
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp")
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/c.txt")

def test_auth_config_defaults():
    from app.config import Settings
    s = Settings()
    assert s.secret_key == ""
    assert s.encryption_key == ""
    assert s.telegram_bot_username == "miximixi_bot"
    assert s.admin_key == ""
```

- [ ] **Step 5: Run test**

```bash
cd backend
poetry run pytest tests/unit/test_config_auth.py -v
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/poetry.lock backend/app/config.py backend/tests/unit/test_config_auth.py
git commit -m "feat: add auth/crypto dependencies and config fields"
```

---

## Task 3: Crypto Utility

**Files:**
- Create: `backend/app/crypto.py`
- Create: `backend/tests/unit/test_crypto.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_crypto.py`:

```python
import os
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp")
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/c.txt")

import pytest
from unittest.mock import patch
from cryptography.fernet import Fernet

TEST_KEY = Fernet.generate_key().decode()

def test_encrypt_decrypt_roundtrip():
    with patch("app.crypto.settings") as mock_settings:
        mock_settings.encryption_key = TEST_KEY
        from app.crypto import encrypt_password, decrypt_password
        ciphertext = encrypt_password("secret123")
        assert isinstance(ciphertext, bytes)
        assert decrypt_password(ciphertext) == "secret123"

def test_encrypt_produces_different_ciphertext_each_time():
    with patch("app.crypto.settings") as mock_settings:
        mock_settings.encryption_key = TEST_KEY
        from app.crypto import encrypt_password
        a = encrypt_password("same")
        b = encrypt_password("same")
        assert a != b  # Fernet includes random IV

def test_decrypt_raises_on_tampered_data():
    with patch("app.crypto.settings") as mock_settings:
        mock_settings.encryption_key = TEST_KEY
        from app.crypto import encrypt_password, decrypt_password
        ciphertext = encrypt_password("secret")
        tampered = ciphertext[:-4] + b"xxxx"
        with pytest.raises(Exception):
            decrypt_password(tampered)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
poetry run pytest tests/unit/test_crypto.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'app.crypto'`.

- [ ] **Step 3: Implement crypto.py**

Create `backend/app/crypto.py`:

```python
from cryptography.fernet import Fernet
from app.config import settings


def _fernet() -> Fernet:
    if not settings.encryption_key:
        raise RuntimeError("ENCRYPTION_KEY not configured")
    return Fernet(settings.encryption_key.encode() if isinstance(settings.encryption_key, str) else settings.encryption_key)


def encrypt_password(plaintext: str) -> bytes:
    return _fernet().encrypt(plaintext.encode())


def decrypt_password(ciphertext: bytes) -> str:
    return _fernet().decrypt(ciphertext).decode()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
poetry run pytest tests/unit/test_crypto.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/crypto.py backend/tests/unit/test_crypto.py
git commit -m "feat: add Fernet AES-256 crypto utility for Instagram password storage"
```

---

## Task 4: JWT Auth Module

**Files:**
- Create: `backend/app/auth.py`
- Create: `backend/tests/unit/test_auth.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_auth.py`:

```python
import os
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp")
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/c.txt")

import pytest
from unittest.mock import patch

TEST_SECRET = "testsecret1234567890abcdef123456"
TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"

def test_create_and_verify_token():
    with patch("app.auth.settings") as mock_settings:
        mock_settings.secret_key = TEST_SECRET
        from app.auth import create_access_token, verify_token
        token = create_access_token(TEST_USER_ID)
        assert isinstance(token, str)
        user_id = verify_token(token)
        assert user_id == TEST_USER_ID

def test_verify_raises_on_invalid_token():
    with patch("app.auth.settings") as mock_settings:
        mock_settings.secret_key = TEST_SECRET
        from app.auth import verify_token
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            verify_token("not.a.valid.token")
        assert exc_info.value.status_code == 401

def test_verify_raises_on_wrong_secret():
    with patch("app.auth.settings") as mock_settings:
        mock_settings.secret_key = TEST_SECRET
        from app.auth import create_access_token
        token = create_access_token(TEST_USER_ID)
    with patch("app.auth.settings") as mock_settings:
        mock_settings.secret_key = "wrong_secret_key_abcdef1234567890"
        from app.auth import verify_token
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            verify_token(token)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
poetry run pytest tests/unit/test_auth.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'app.auth'`.

- [ ] **Step 3: Implement auth.py**

Create `backend/app/auth.py`:

```python
import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from app.config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)

TOKEN_EXPIRE_DAYS = 30
ALGORITHM = "HS256"


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def verify_token(token: str) -> str:
    """Returns user_id (sub claim). Raises HTTPException 401 on any failure."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """FastAPI dependency. Returns user_id UUID string."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return verify_token(credentials.credentials)
```

- [ ] **Step 4: Run tests**

```bash
cd backend
poetry run pytest tests/unit/test_auth.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth.py backend/tests/unit/test_auth.py
git commit -m "feat: JWT auth module with create_access_token and get_current_user dependency"
```

---

## Task 5: Auth Endpoints in main.py

**Files:**
- Modify: `backend/app/main.py`

This task adds 6 endpoints and tightens CORS. All changes are additions to the existing file — do not restructure it.

- [ ] **Step 1: Add imports at top of main.py**

After the existing imports block (around line 16), add:

```python
import bcrypt
import secrets
from fastapi import Depends
from fastapi.security import APIKeyHeader
from app.auth import create_access_token, get_current_user
```

- [ ] **Step 2: Tighten CORS**

Replace:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In Produktion: nur Frontend-Domain
    allow_methods=["*"],
    allow_headers=["*"],
)
```
With:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url] if settings.frontend_url else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- [ ] **Step 3: Add admin key dependency and Pydantic models**

After the `get_db()` function, add:

```python
_admin_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=False)

def require_admin_key(key: str | None = Depends(_admin_key_header)):
    if not settings.admin_key or key != settings.admin_key:
        raise HTTPException(status_code=403, detail="Admin key required")


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class TelegramLinkResponse(BaseModel):
    code: str
    deep_link: str
    expires_in: int
```

- [ ] **Step 4: Add auth endpoints**

Add after the `/health` endpoint:

```python
# ── Auth ─────────────────────────────────────────────────────────────

@app.post("/auth/register", dependencies=[Depends(require_admin_key)])
async def register(req: RegisterRequest):
    hashed = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt(rounds=12)).decode()
    try:
        db = get_db()
        with db.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """INSERT INTO users (email, password_hash, display_name)
                   VALUES (%s, %s, %s) RETURNING id, email, display_name""",
                (req.email.lower().strip(), hashed, req.display_name or req.email.split("@")[0]),
            )
            user = dict(cur.fetchone())
            db.commit()
        return user
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Email already registered")
    except Exception as e:
        logger.error(f"Register error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        db.close()


@app.post("/auth/login")
async def login(req: LoginRequest):
    db = get_db()
    try:
        with db.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, email, password_hash, display_name, is_active FROM users WHERE email = %s",
                (req.email.lower().strip(),),
            )
            user = cur.fetchone()
        if not user or not user["password_hash"]:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user["is_active"]:
            raise HTTPException(status_code=403, detail="Account disabled")
        if not bcrypt.checkpw(req.password.encode(), user["password_hash"].encode()):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_access_token(str(user["id"]))
        return {"access_token": token, "token_type": "bearer", "user": {"id": str(user["id"]), "email": user["email"], "display_name": user["display_name"]}}
    finally:
        db.close()


@app.get("/auth/me")
async def get_me(user_id: str = Depends(get_current_user)):
    db = get_db()
    try:
        with db.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, email, display_name, created_at FROM users WHERE id = %s AND is_active = true",
                (user_id,),
            )
            user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(user)
    finally:
        db.close()


@app.post("/auth/telegram-link-code")
async def create_telegram_link_code(user_id: str = Depends(get_current_user)):
    code = "MIX-" + secrets.token_hex(3).upper()
    deep_link = f"https://t.me/{settings.telegram_bot_username}?start={code}"
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute(
                """INSERT INTO telegram_link_codes (code, user_id, expires_at)
                   VALUES (%s, %s, now() + interval '5 minutes')""",
                (code, user_id),
            )
            db.commit()
        return TelegramLinkResponse(code=code, deep_link=deep_link, expires_in=300)
    finally:
        db.close()


@app.get("/auth/telegram-links")
async def list_telegram_links(user_id: str = Depends(get_current_user)):
    db = get_db()
    try:
        with db.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT telegram_user_id, telegram_username, linked_at FROM user_telegram_links WHERE user_id = %s ORDER BY linked_at DESC",
                (user_id,),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        db.close()


@app.delete("/auth/telegram-links/{telegram_user_id}")
async def unlink_telegram(telegram_user_id: int, user_id: str = Depends(get_current_user)):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute(
                "DELETE FROM user_telegram_links WHERE user_id = %s AND telegram_user_id = %s",
                (user_id, telegram_user_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Link not found")
            db.commit()
        return {"ok": True}
    finally:
        db.close()
```

- [ ] **Step 5: Start the backend and test manually**

```bash
cd backend
SECRET_KEY=test123 ADMIN_KEY=admintest poetry run uvicorn app.main:app --reload --port 8000
```

In another terminal:
```bash
# Register
curl -X POST http://localhost:8000/auth/register \
  -H "X-Admin-Key: admintest" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","display_name":"Test"}'
# Expected: {"id": "<uuid>", "email": "test@example.com", "display_name": "Test"}

# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
# Expected: {"access_token": "<jwt>", "token_type": "bearer", "user": {...}}

# Me (copy token from login response)
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer <token>"
# Expected: {"id": ..., "email": "test@example.com", ...}
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: add /auth/* endpoints (register, login, me, telegram-link-code, telegram-links)"
```

---

## Task 6: Telegram Bot — DB-backed Auth + /start Deep Link

**Files:**
- Modify: `backend/app/telegram_bot.py`

- [ ] **Step 1: Add DB lookup helper**

In `telegram_bot.py`, after the imports, add a helper function. Import `get_db_connection` or use psycopg2 directly — the bot already imports from `app.config`. Add after the `is_admin()` function:

```python
def get_user_id_for_telegram(telegram_user_id: int) -> str | None:
    """Returns miximixi user_id (UUID str) for a linked Telegram user, or None."""
    import psycopg2
    from app.config import settings
    try:
        conn = psycopg2.connect(
            host=settings.db_host, port=settings.db_port,
            user=settings.db_user, password=settings.db_password,
            dbname=settings.db_name,
        )
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id FROM user_telegram_links WHERE telegram_user_id = %s",
                (telegram_user_id,)
            )
            row = cur.fetchone()
        conn.close()
        return str(row[0]) if row else None
    except Exception as e:
        logger.error(f"DB lookup for telegram_user_id {telegram_user_id}: {e}")
        return None


def consume_link_code(code: str, telegram_user_id: int, telegram_username: str | None) -> bool:
    """Validates and consumes a link code, creates the user_telegram_links row. Returns True on success."""
    import psycopg2
    from app.config import settings
    try:
        conn = psycopg2.connect(
            host=settings.db_host, port=settings.db_port,
            user=settings.db_user, password=settings.db_password,
            dbname=settings.db_name,
        )
        with conn.cursor() as cur:
            cur.execute(
                """SELECT user_id FROM telegram_link_codes
                   WHERE code = %s AND expires_at > now() AND used_at IS NULL""",
                (code,)
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return False
            user_id = row[0]
            cur.execute(
                """INSERT INTO user_telegram_links (user_id, telegram_user_id, telegram_username)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (telegram_user_id) DO UPDATE SET user_id = EXCLUDED.user_id, telegram_username = EXCLUDED.telegram_username""",
                (user_id, telegram_user_id, telegram_username)
            )
            cur.execute(
                "UPDATE telegram_link_codes SET used_at = now() WHERE code = %s",
                (code,)
            )
            conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"consume_link_code error: {e}")
        return False
```

- [ ] **Step 2: Add /start handler**

Find where command handlers are registered (the `Application.builder()` block). Add a `start_handler` function and register it:

```python
async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user
    args = context.args or []

    if args and args[0].startswith("MIX-"):
        code = args[0]
        success = consume_link_code(code, user.id, user.username)
        if success:
            await update.message.reply_text(
                "✅ Dein Telegram-Gerät wurde erfolgreich mit deinem Miximixi-Account verknüpft!\n\n"
                "Du kannst jetzt Instagram- und Rezept-Links direkt in diesen Chat schicken."
            )
        else:
            await update.message.reply_text(
                "❌ Ungültiger oder abgelaufener Code.\n"
                "Bitte einen neuen Code im Miximixi-Frontend generieren."
            )
        return

    await update.message.reply_text(
        "👋 Willkommen bei Miximixi!\n\n"
        "Um dieses Gerät zu verknüpfen, öffne Miximixi im Browser, "
        "gehe zu deinem Profil und scanne den QR-Code."
    )
```

In the handler registration block, add:
```python
app.add_handler(CommandHandler("start", start_handler))
```

- [ ] **Step 3: Replace env-var allowlist with DB lookup in message_handler**

Find the existing `is_allowed()` call in the URL message handler. The current pattern checks `settings.telegram_allowed_user_ids`. Replace the access check with the DB lookup:

Find the section in the URL submission handler that calls `is_allowed()` and change it to:

```python
user_id_str = get_user_id_for_telegram(update.message.from_user.id)
if user_id_str is None:
    await update.message.reply_text(
        "❌ Kein Miximixi-Account verknüpft.\n\n"
        "Öffne Miximixi im Browser, gehe zu deinem Profil und scanne den QR-Code."
    )
    return
```

> **Note:** Keep `is_allowed()` and `is_admin()` as-is for now — they are still used for admin commands like `/sync_*`. Only the URL submission handler needs the DB-based check. The full admin migration is out of scope for this plan.

- [ ] **Step 4: Test the /start handler manually**

With the bot running locally:
1. Generate a link code via `POST /auth/telegram-link-code` (requires a logged-in user token)
2. Send `/start MIX-<code>` to the bot
3. Verify reply is "✅ Dein Telegram-Gerät..."
4. Send `/start MIX-<code>` again (already used)
5. Verify reply is "❌ Ungültiger oder abgelaufener..."

- [ ] **Step 5: Commit**

```bash
git add backend/app/telegram_bot.py
git commit -m "feat: telegram bot DB-backed user lookup and /start deep link handler"
```

---

## Task 7: Frontend Dependencies + Auth API

**Files:**
- Modify: `frontend/package.json` (via npm)
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Install frontend dependencies**

```bash
cd frontend
npm install qrcode @types/qrcode
```
Expected: `package.json` updated, no errors.

- [ ] **Step 2: Add auth functions and token management to api.ts**

At the top of `frontend/src/lib/api.ts`, after the `API_BASE_URL` constant, add:

```typescript
const TOKEN_KEY = 'miximixi_auth_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
```

- [ ] **Step 3: Update the request() function to include auth header**

Replace the existing `request<T>()` function with:

```typescript
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken()
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  if (response.status === 401) {
    clearStoredToken()
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!response.ok) {
    throw new Error(`API error ${response.status}`)
  }
  return (await response.json()) as T
}
```

- [ ] **Step 4: Add auth API functions**

At the end of `api.ts`, add:

```typescript
export interface LoginResponse {
  access_token: string
  token_type: string
  user: { id: string; email: string; display_name: string }
}

export interface CurrentUser {
  id: string
  email: string
  display_name: string
  created_at: string
}

export interface TelegramLinkResponse {
  code: string
  deep_link: string
  expires_in: number
}

export interface TelegramLink {
  telegram_user_id: number
  telegram_username: string | null
  linked_at: string
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.detail || `Login failed: ${response.status}`)
  }
  return response.json()
}

export async function getMe(): Promise<CurrentUser> {
  return request<CurrentUser>('/auth/me')
}

export async function createTelegramLinkCode(): Promise<TelegramLinkResponse> {
  return request<TelegramLinkResponse>('/auth/telegram-link-code', { method: 'POST' })
}

export async function getTelegramLinks(): Promise<TelegramLink[]> {
  return request<TelegramLink[]>('/auth/telegram-links')
}

export async function unlinkTelegramDevice(telegramUserId: number): Promise<void> {
  await request<void>(`/auth/telegram-links/${telegramUserId}`, { method: 'DELETE' })
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/api.ts
git commit -m "feat: frontend auth token management and auth API functions"
```

---

## Task 8: AuthContext

**Files:**
- Create: `frontend/src/context/AuthContext.tsx`

- [ ] **Step 1: Create AuthContext**

Create `frontend/src/context/AuthContext.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getMe,
  login as apiLogin,
  setStoredToken,
  clearStoredToken,
  getStoredToken,
  type CurrentUser,
} from '../lib/api'

interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setIsLoading(false)
      return
    }
    getMe()
      .then(setUser)
      .catch(() => {
        clearStoredToken()
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const { access_token, user: userData } = await apiLogin(email, password)
    setStoredToken(access_token)
    setUser(userData as CurrentUser)
  }

  function logout() {
    clearStoredToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/context/AuthContext.tsx
git commit -m "feat: AuthContext with login/logout and token validation on mount"
```

---

## Task 9: ProtectedRoute + LoginPage

**Files:**
- Create: `frontend/src/components/ProtectedRoute.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Create ProtectedRoute**

Create `frontend/src/components/ProtectedRoute.tsx`:

```typescript
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Laden...</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
```

- [ ] **Step 2: Create LoginPage**

Create `frontend/src/pages/LoginPage.tsx`:

```typescript
import { useState, type FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { login, user, isLoading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isLoading) return null
  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Miximixi</h1>
        <input
          type="email"
          placeholder="E-Mail"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoFocus
          style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: '8px', border: '1px solid #ccc' }}
        />
        <input
          type="password"
          placeholder="Passwort"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: '8px', border: '1px solid #ccc' }}
        />
        {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: '8px', background: '#333', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          {submitting ? 'Anmelden...' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProtectedRoute.tsx frontend/src/pages/LoginPage.tsx
git commit -m "feat: ProtectedRoute guard and LoginPage with email/password form"
```

---

## Task 10: ProfilePage with QR Code

**Files:**
- Create: `frontend/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Create ProfilePage**

Create `frontend/src/pages/ProfilePage.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../context/AuthContext'
import {
  createTelegramLinkCode,
  getTelegramLinks,
  unlinkTelegramDevice,
  type TelegramLink,
  type TelegramLinkResponse,
} from '../lib/api'

export function ProfilePage() {
  const { user, logout } = useAuth()
  const [links, setLinks] = useState<TelegramLink[]>([])
  const [linkCode, setLinkCode] = useState<TelegramLinkResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [codeExpiry, setCodeExpiry] = useState<number>(0)
  const [generating, setGenerating] = useState(false)

  const loadLinks = useCallback(async () => {
    try {
      setLinks(await getTelegramLinks())
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  // Poll for new links while code is active
  useEffect(() => {
    if (!linkCode) return
    const interval = setInterval(loadLinks, 3000)
    return () => clearInterval(interval)
  }, [linkCode, loadLinks])

  // Countdown timer
  useEffect(() => {
    if (codeExpiry <= 0) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, codeExpiry - Date.now())
      if (remaining === 0) {
        setLinkCode(null)
        setQrDataUrl(null)
      }
      setCodeExpiry(prev => prev)
    }, 1000)
    return () => clearInterval(interval)
  }, [codeExpiry])

  async function generateCode() {
    setGenerating(true)
    try {
      const response = await createTelegramLinkCode()
      setLinkCode(response)
      setCodeExpiry(Date.now() + response.expires_in * 1000)
      const dataUrl = await QRCode.toDataURL(response.deep_link, { width: 240, margin: 2 })
      setQrDataUrl(dataUrl)
    } catch (err) {
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  async function handleUnlink(telegramUserId: number) {
    await unlinkTelegramDevice(telegramUserId)
    await loadLinks()
  }

  const secondsLeft = linkCode ? Math.max(0, Math.ceil((codeExpiry - Date.now()) / 1000)) : 0

  return (
    <div style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Profil</h1>
      <p><strong>{user?.display_name}</strong> ({user?.email})</p>
      <button onClick={logout} style={{ marginBottom: '2rem' }}>Abmelden</button>

      <h2>Telegram-Geräte</h2>
      {links.length === 0 && <p>Noch kein Telegram-Gerät verknüpft.</p>}
      {links.map(link => (
        <div key={link.telegram_user_id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <span>@{link.telegram_username ?? link.telegram_user_id}</span>
          <span style={{ fontSize: '0.85rem', color: '#888' }}>
            seit {new Date(link.linked_at).toLocaleDateString('de-DE')}
          </span>
          <button onClick={() => handleUnlink(link.telegram_user_id)}>Entfernen</button>
        </div>
      ))}

      <h3 style={{ marginTop: '2rem' }}>Neues Gerät verknüpfen</h3>
      {!linkCode && (
        <button onClick={generateCode} disabled={generating}>
          {generating ? 'Generiere...' : 'QR-Code generieren'}
        </button>
      )}
      {linkCode && qrDataUrl && (
        <div>
          <p>Scanne diesen QR-Code mit deiner Handy-Kamera. Der Code ist noch {secondsLeft}s gültig.</p>
          <img src={qrDataUrl} alt="Telegram Link QR Code" style={{ display: 'block', margin: '1rem 0' }} />
          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            Oder öffne manuell: <a href={linkCode.deep_link}>{linkCode.deep_link}</a>
          </p>
          {secondsLeft === 0 && (
            <button onClick={generateCode}>Neuen Code generieren</button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ProfilePage.tsx
git commit -m "feat: ProfilePage with QR code Telegram linking and device management"
```

---

## Task 11: Wire Everything into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the entire content of `frontend/src/App.tsx` with:

```typescript
import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { CookPage } from './pages/CookPage'
import { FeedPage } from './pages/FeedPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'
import { TagsPage } from './pages/TagsPage'
import { TimerProvider } from './context/TimerContext'

const scrollPositions: Record<string, number> = {}

function App() {
  useEffect(() => {
    const handleScroll = () => {
      scrollPositions[window.location.pathname] = window.scrollY
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <AuthProvider>
      <TimerProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout scrollPositions={scrollPositions} />}>
              <Route path="/" element={<FeedPage />} />
              <Route path="/recipes/:recipeSlug" element={<RecipeDetailPage />} />
              <Route path="/tags" element={<TagsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route path="/cook/:recipeSlug" element={<CookPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </TimerProvider>
    </AuthProvider>
  )
}

export default App
```

- [ ] **Step 2: Run frontend build to check for type errors**

```bash
cd frontend
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Start frontend and test login flow**

```bash
cd frontend
npm run dev
```

1. Open `http://localhost:5173` → should redirect to `/login`
2. Enter credentials for a user created via `/auth/register` → should land on `/`
3. Refresh page → should stay logged in (token in localStorage)
4. Open `/profile` → should show profile page
5. Click "Abmelden" → should redirect to `/login`, token cleared

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire AuthProvider and ProtectedRoute into app routing"
```

---

## Task 12: Environment Variables + .env.example

**Files:**
- Modify: `.env.example` (or create if not present)
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add new env vars to docker-compose.yml**

In the `backend` service environment section, add:

```yaml
- SECRET_KEY=${SECRET_KEY}
- ADMIN_KEY=${ADMIN_KEY}
- ENCRYPTION_KEY=${ENCRYPTION_KEY}
- TELEGRAM_BOT_USERNAME=${TELEGRAM_BOT_USERNAME:-miximixi_bot}
```

In the `frontend` service build args, add:

```yaml
args:
  VITE_API_BASE_URL: https://miximixi-api.sektbirne.fun
  VITE_TELEGRAM_BOT_USERNAME: ${TELEGRAM_BOT_USERNAME:-miximixi_bot}
```

- [ ] **Step 2: Update .env.example**

Add to `.env.example`:

```bash
# Auth (generate with: python -c "import secrets; print(secrets.token_hex(32))")
SECRET_KEY=
ADMIN_KEY=

# Encryption (generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
ENCRYPTION_KEY=

# Telegram Bot
TELEGRAM_BOT_USERNAME=miximixi_bot
```

- [ ] **Step 3: Generate real values for production .env**

```bash
python -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"
python -c "import secrets; print('ADMIN_KEY=' + secrets.token_hex(16))"
```

Copy output into production `.env` on the server.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: add SECRET_KEY, ADMIN_KEY, ENCRYPTION_KEY, TELEGRAM_BOT_USERNAME to env config"
```

---

## Task 13: Run Full Test Suite

- [ ] **Step 1: Run all backend unit tests**

```bash
cd backend
poetry run pytest tests/unit/ -v
```
Expected: all tests pass (14 existing + new auth/crypto tests).

- [ ] **Step 2: Run frontend type check and build**

```bash
cd frontend
npx tsc --noEmit && npm run build
```
Expected: no type errors, build completes.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues found in full test suite run"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ JWT auth with email/password → Tasks 4, 5
- ✅ Persistent login via localStorage → Task 7 (getStoredToken/setStoredToken)
- ✅ user_telegram_links table (1:N) → Task 1
- ✅ telegram_link_codes table → Task 1
- ✅ QR code deep link flow → Tasks 5, 8, 9, 10
- ✅ /start MIX-xxx bot handler → Task 6
- ✅ Multiple Telegram devices per user → Task 6 (ON CONFLICT DO UPDATE preserves other rows)
- ✅ bcrypt password hashing (rounds=12) → Task 5
- ✅ Fernet AES-256 for Instagram passwords → Tasks 3, schema in Task 1
- ✅ user_instagram_accounts table → Task 1
- ✅ CORS tightened → Task 5
- ✅ Telegram bot: DB-backed lookup replaces env allowlist for URL submission → Task 6
- ✅ ProtectedRoute for all existing routes → Task 11
- ✅ ProfilePage with device management → Task 10
- ✅ .env keys documented → Task 12

**No placeholders found.**

**Type consistency confirmed:** `TelegramLinkResponse`, `TelegramLink`, `CurrentUser` defined in Task 7 and used in Tasks 8, 10.
