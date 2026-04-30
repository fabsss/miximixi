CREATE TABLE IF NOT EXISTS instagram_auth_state (
    account_id TEXT PRIMARY KEY DEFAULT 'default',
    last_checked_at TIMESTAMPTZ,
    last_refresh_at TIMESTAMPTZ,
    refresh_fail_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO instagram_auth_state (account_id)
VALUES ('default')
ON CONFLICT (account_id) DO NOTHING;
