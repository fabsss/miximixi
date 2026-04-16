-- Migration 002: Add telegram_chat_id column to import_queue for per-user bot notifications
-- This column stores the Telegram chat ID of the user who submitted the import request.
-- It is nulled after sending the completion notification for privacy.

ALTER TABLE import_queue
  ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50);

-- Index for looking up jobs by chat_id (e.g., to list a user's imports)
CREATE INDEX IF NOT EXISTS import_queue_telegram_chat_id_idx
  ON import_queue (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
