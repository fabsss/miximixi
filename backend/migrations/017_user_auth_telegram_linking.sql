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
