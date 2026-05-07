# User Authentication & Telegram Linking Design

## Goal

Introduce a proper user authentication system for Miximixi that supports multi-user operation, connects the existing Telegram bot to user accounts, and stores sensitive credentials (passwords, Instagram credentials) securely.

## Scope

This spec covers:
1. **User accounts** — email/password auth with JWT, persistent login via localStorage
2. **Telegram linking** — QR code + deep link flow to connect Telegram devices to a Miximixi account
3. **Secure credential storage** — bcrypt for user passwords, AES-256 for Instagram passwords
4. **Bot access control** — replace env-var allowlist with DB-backed user lookup

This spec does NOT cover:
- Per-user Instagram sync (architecture is prepared, but not activated)
- Frontend route protection beyond a login gate (all logged-in users see all their own data)
- Admin UI (admin access remains env-var controlled for now)

---

## Data Model

### Migration 017: User Auth & Telegram Linking

```sql
-- Extend existing users table (already has id, username, email, created_at)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,         -- bcrypt, nullable during migration
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- One Telegram device = one row. Multiple rows per user allowed.
CREATE TABLE IF NOT EXISTS user_telegram_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id  BIGINT NOT NULL UNIQUE,
  telegram_username TEXT,
  linked_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_links_user_id ON user_telegram_links(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_telegram_id ON user_telegram_links(telegram_user_id);

-- Short-lived codes for QR/deep-link Telegram linking
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code        TEXT PRIMARY KEY,           -- "MIX-XXXXXX" (6 hex chars)
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,       -- now() + 5 minutes
  used_at     TIMESTAMPTZ                 -- NULL = still valid
);
CREATE INDEX IF NOT EXISTS idx_link_codes_user_id ON telegram_link_codes(user_id);

-- Per-user Instagram credentials (for future per-user sync)
CREATE TABLE IF NOT EXISTS user_instagram_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instagram_username   TEXT NOT NULL,
  password_encrypted   BYTEA NOT NULL,    -- Fernet AES-256
  session_file_path    TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  last_verified_at     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, instagram_username)
);
```

---

## Backend Architecture

### New file: `backend/app/auth.py`

Single responsibility: JWT creation, verification, and the FastAPI `get_current_user` dependency.

```
create_access_token(user_id: str) -> str
verify_token(token: str) -> str  # returns user_id, raises HTTPException on invalid
get_current_user(token) -> str   # FastAPI Depends(), returns user_id UUID string
```

JWT payload: `{"sub": "<user_id_uuid>", "exp": <unix_timestamp>}`
Algorithm: HS256. Secret: `settings.secret_key` (new env var, required in production).
Expiry: 30 days (long-lived to support "remember me" — token stored in localStorage).

### New endpoints in `backend/app/main.py`

```
POST /auth/register          — create user (admin-only via X-Admin-Key header)
POST /auth/login             — returns JWT
GET  /auth/me                — returns current user info
POST /auth/telegram-link-code — generates MIX-XXXXXX code, returns {code, deep_link, expires_in}
GET  /auth/telegram-links    — list linked Telegram devices for current user
DELETE /auth/telegram-links/{telegram_user_id} — unlink a device
```

`/auth/login` and `/auth/register` are the only unauthenticated endpoints (besides `/health`, `/og/`, `/images/`).

### Modified: `backend/app/telegram_bot.py`

Replace env-var allowlist with DB lookup:

```python
async def get_user_for_telegram_id(telegram_user_id: int) -> str | None:
    """Returns miximixi user_id or None if not linked."""
    # SELECT user_id FROM user_telegram_links WHERE telegram_user_id = %s
```

Every bot command that touches user data calls this first. If `None`: reply with link instructions including the deep link URL pattern.

Add `/start` handler that accepts the link code:
```
/start MIX-XXXXXX  →  look up code, link telegram_user_id to user_id, confirm
/start             →  welcome message with instructions
```

### Modified: `backend/app/config.py`

New settings:
```python
secret_key: str = ""              # JWT signing secret, required in prod
encryption_key: str = ""          # Fernet key for Instagram passwords
telegram_bot_username: str = "miximixi_bot"
admin_key: str = ""               # X-Admin-Key for /auth/register
```

### Encryption utility: `backend/app/crypto.py`

```python
def encrypt_password(plaintext: str) -> bytes   # Fernet encrypt
def decrypt_password(ciphertext: bytes) -> str  # Fernet decrypt
```

---

## Frontend Architecture

### Token storage

JWT stored in `localStorage` under key `miximixi_auth_token`. On app start, token is read and validated (by calling `GET /auth/me`). If valid: user is logged in. If 401: token is cleared and login page shown.

No refresh token mechanism — 30-day expiry is sufficient. User re-logs in after expiry.

### New files

```
frontend/src/context/AuthContext.tsx   — React context: current user, login(), logout()
frontend/src/pages/LoginPage.tsx       — Email + password form, "remember me" = always (localStorage)
frontend/src/pages/ProfilePage.tsx     — Show linked Telegram devices, generate QR code for linking
```

### Modified files

```
frontend/src/App.tsx                   — wrap routes in AuthProvider, add /login and /profile routes
frontend/src/lib/api.ts               — add auth header to all requests, export login() function
```

### QR Code

Use `qrcode` npm package (client-side rendering, no server needed).

Deep link format: `https://t.me/miximixi_bot?start=MIX-XXXXXX`

QR code shown on ProfilePage after clicking "Telegram verknüpfen". Auto-refreshes after 5 minutes (when code expires).

### Route protection

`ProtectedRoute` wrapper component: if no valid token → redirect to `/login`. Applied to all existing routes. `/login` redirects to `/` if already authenticated.

---

## Auth Flow Diagrams

### Login (Frontend)
```
User visits app → no token in localStorage → redirect to /login
User enters email + password → POST /auth/login
Backend: bcrypt.checkpw(password, hash) → issue JWT (30 days)
Frontend: store token in localStorage → redirect to /
All subsequent fetch() calls: Authorization: Bearer <token>
```

### Telegram Linking
```
User on ProfilePage → clicks "Telegram-Gerät verknüpfen"
→ POST /auth/telegram-link-code
← { code: "MIX-A3F291", deep_link: "https://t.me/miximixi_bot?start=MIX-A3F291", expires_in: 300 }
→ QR code rendered from deep_link

User scans QR with phone camera → Telegram opens
→ Bot receives /start MIX-A3F291
→ Bot looks up code: valid, not expired, not used
→ INSERT INTO user_telegram_links
→ UPDATE telegram_link_codes SET used_at = now()
→ Bot replies: "✅ Gerät verknüpft mit Miximixi-Account von [display_name]"

ProfilePage polls GET /auth/telegram-links every 3s for 5 minutes
→ when new device appears: show success state
```

### Telegram Bot Message
```
User sends URL to bot
→ Bot: telegram_user_id from update.message.from_user.id
→ get_user_for_telegram_id(telegram_user_id)
→ None: reply "Kein Miximixi-Account verknüpft. Bitte /start im Miximixi-Frontend scannen."
→ user_id: proceed with import, associate job with user_id
```

---

## Security Notes

- **bcrypt** rounds=12 for password hashing
- **JWT secret** must be a random 32+ byte hex string, set in `.env`
- **Fernet key** generated with `Fernet.generate_key()`, set in `.env` as base64 string
- **Link codes** are 6 random hex chars prefixed "MIX-" → 16M combinations, 5 min TTL, single-use
- **Admin registration** protected by `X-Admin-Key` header (separate from JWT secret)
- CORS will be tightened to `settings.frontend_url` in the same change

---

## Dependencies to Add

**Backend (`pyproject.toml`):**
- `python-jose[cryptography]` — JWT (HS256)
- `bcrypt` — password hashing
- `cryptography` — Fernet AES-256 (already a transitive dep via playwright, but add explicitly)

**Frontend (`package.json`):**
- `qrcode` — QR code rendering
- `@types/qrcode` — TypeScript types

---

## What This Does NOT Change (Yet)

- The system-level Instagram account (`INSTAGRAM_USERNAME` in `.env`) stays as-is
- `admin_users` table and `TELEGRAM_ADMIN_IDS` env var remain for bot admin commands
- `recipes` table gets a `user_id` FK added but existing recipes are not re-assigned
- Per-user recipe visibility (row-level filtering) is NOT implemented in this spec — that is a separate feature
