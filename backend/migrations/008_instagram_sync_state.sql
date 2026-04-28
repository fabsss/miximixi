-- Migration 008: Instagram sync state tracking
-- Track which Instagram posts have been processed and queued for import

CREATE TABLE IF NOT EXISTS instagram_sync_state (
    id BIGSERIAL PRIMARY KEY,
    collection_id VARCHAR(100) NOT NULL,
    post_id VARCHAR(50) NOT NULL,
    source_url TEXT NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    queued_job_id UUID REFERENCES import_queue(id) ON DELETE SET NULL,
    UNIQUE(collection_id, post_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instagram_sync_collection_id ON instagram_sync_state(collection_id);
CREATE INDEX IF NOT EXISTS idx_instagram_sync_post_id ON instagram_sync_state(post_id);
CREATE INDEX IF NOT EXISTS idx_instagram_sync_synced_at ON instagram_sync_state(synced_at DESC);
