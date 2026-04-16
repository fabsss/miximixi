-- Migration 007: Add telegram_chat_id to import_queue
-- 
-- Enables storing chat IDs for Telegram notifications and user tracking
-- Fixes: telegram bot failing to queue recipes with "Fehler beim Einreihen" error

ALTER TABLE import_queue
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- Create index for quick lookups by chat_id for notifications
CREATE INDEX IF NOT EXISTS import_queue_telegram_chat_id_idx 
  ON import_queue(telegram_chat_id);
