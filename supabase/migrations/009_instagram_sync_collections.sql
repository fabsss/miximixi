-- Migration 009: Instagram sync collections configuration
-- Track which Instagram collections are monitored for sync
-- Only ONE collection can be active (enabled_at IS NOT NULL) at a time

CREATE TABLE IF NOT EXISTS instagram_sync_collections (
    id BIGSERIAL PRIMARY KEY,
    collection_id VARCHAR(100) NOT NULL,
    collection_name VARCHAR(255),
    enabled_at TIMESTAMP,
    disabled_at TIMESTAMP,
    selected_by_telegram_id VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id)
);

-- Ensure only ONE collection is enabled at a time
CREATE UNIQUE INDEX idx_instagram_sync_only_one_enabled 
ON instagram_sync_collections(id) 
WHERE enabled_at IS NOT NULL AND disabled_at IS NULL;

CREATE INDEX idx_instagram_sync_enabled ON instagram_sync_collections(enabled_at DESC);
CREATE INDEX idx_instagram_sync_collection_id ON instagram_sync_collections(collection_id);
