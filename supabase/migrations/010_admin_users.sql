-- Migration 010: Admin users for sync control
-- Track Telegram users who have admin access to sync commands
-- Currently used for /sync_setup, /sync_status, /sync_enable, /sync_disable, /sync_now

CREATE TABLE IF NOT EXISTS admin_users (
    id BIGSERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    telegram_username VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup of admin status
CREATE INDEX idx_admin_users_telegram_id ON admin_users(telegram_user_id);
CREATE INDEX idx_admin_users_active ON admin_users(is_active) WHERE is_active = true;
