"""
Unit tests for the DB-backed auth functions in app.telegram_bot:
  get_user_id_for_telegram()
  consume_link_code()
"""
import os
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp")
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/c.txt")

import pytest
from unittest.mock import MagicMock, patch


TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"
TELEGRAM_USER_ID = 123456789
TELEGRAM_USERNAME = "johndoe"
VALID_CODE = "MIX-ABCDEF"


def _mock_conn(fetchone_return=None):
    """Build a psycopg2 connection mock used by get_user_id_for_telegram / consume_link_code."""
    conn = MagicMock()
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchone.return_value = fetchone_return
    conn.cursor.return_value = cur
    return conn, cur


# ===========================================================================
# get_user_id_for_telegram
# ===========================================================================

class TestGetUserIdForTelegram:

    def test_returns_none_when_not_linked(self):
        """No row in user_telegram_links → returns None."""
        conn, _cur = _mock_conn(fetchone_return=None)

        with patch("psycopg2.connect", return_value=conn):
            from app.telegram_bot import get_user_id_for_telegram
            result = get_user_id_for_telegram(TELEGRAM_USER_ID)

        assert result is None

    def test_returns_user_id_when_linked(self):
        """Row found → returns UUID string."""
        import uuid
        user_uuid = uuid.UUID(TEST_USER_ID)
        conn, _cur = _mock_conn(fetchone_return=(user_uuid,))

        with patch("psycopg2.connect", return_value=conn):
            from app.telegram_bot import get_user_id_for_telegram
            result = get_user_id_for_telegram(TELEGRAM_USER_ID)

        assert result == TEST_USER_ID

    def test_returns_none_on_db_error(self):
        """DB connection failure → returns None (graceful degradation)."""
        with patch("psycopg2.connect", side_effect=Exception("connection refused")):
            from app.telegram_bot import get_user_id_for_telegram
            result = get_user_id_for_telegram(TELEGRAM_USER_ID)

        assert result is None

    def test_queries_correct_telegram_user_id(self):
        """Verifies the SELECT is issued with the right telegram_user_id."""
        conn, cur = _mock_conn(fetchone_return=None)

        with patch("psycopg2.connect", return_value=conn):
            from app.telegram_bot import get_user_id_for_telegram
            get_user_id_for_telegram(TELEGRAM_USER_ID)

        cur.execute.assert_called_once()
        call_args = cur.execute.call_args
        # Second positional arg is the params tuple
        assert TELEGRAM_USER_ID in call_args[0][1]


# ===========================================================================
# consume_link_code
# ===========================================================================

class TestConsumeLinkCode:

    def test_returns_false_for_unknown_code(self):
        """No matching row in telegram_link_codes → False."""
        conn, _cur = _mock_conn(fetchone_return=None)

        with patch("psycopg2.connect", return_value=conn):
            from app.telegram_bot import consume_link_code
            result = consume_link_code(VALID_CODE, TELEGRAM_USER_ID, TELEGRAM_USERNAME)

        assert result is False

    def test_returns_false_for_expired_code(self):
        """Expired / used codes: DB returns no row (WHERE clause filters them) → False."""
        # Same as unknown code from the mock perspective — DB returns None
        conn, _cur = _mock_conn(fetchone_return=None)

        with patch("psycopg2.connect", return_value=conn):
            from app.telegram_bot import consume_link_code
            result = consume_link_code("MIX-EXPIRED", TELEGRAM_USER_ID, TELEGRAM_USERNAME)

        assert result is False

    def test_returns_true_and_links_user(self):
        """Valid, unexpired code → True and inserts link + marks code as used."""
        import uuid
        user_uuid = uuid.UUID(TEST_USER_ID)
        conn, cur = _mock_conn(fetchone_return=(user_uuid,))
        # Second and third execute calls (INSERT + UPDATE) should not raise
        cur.execute.side_effect = None

        with patch("psycopg2.connect", return_value=conn):
            from app.telegram_bot import consume_link_code
            result = consume_link_code(VALID_CODE, TELEGRAM_USER_ID, TELEGRAM_USERNAME)

        assert result is True
        conn.commit.assert_called_once()
        # execute should be called three times: SELECT, INSERT, UPDATE
        assert cur.execute.call_count == 3

    def test_returns_false_on_db_connection_error(self):
        """psycopg2.connect failure → False (graceful degradation)."""
        with patch("psycopg2.connect", side_effect=Exception("connection refused")):
            from app.telegram_bot import consume_link_code
            result = consume_link_code(VALID_CODE, TELEGRAM_USER_ID, TELEGRAM_USERNAME)

        assert result is False

    def test_returns_false_on_insert_error(self):
        """INSERT raises an exception → False (transaction aborted, no commit)."""
        import uuid
        user_uuid = uuid.UUID(TEST_USER_ID)
        conn, cur = _mock_conn(fetchone_return=(user_uuid,))

        call_count = [0]

        def execute_side_effect(sql, params=None):
            call_count[0] += 1
            if call_count[0] == 1:
                return  # SELECT succeeds
            raise Exception("insert failed")

        cur.execute.side_effect = execute_side_effect

        with patch("psycopg2.connect", return_value=conn):
            from app.telegram_bot import consume_link_code
            result = consume_link_code(VALID_CODE, TELEGRAM_USER_ID, TELEGRAM_USERNAME)

        assert result is False
        conn.commit.assert_not_called()

    def test_select_uses_expiry_and_used_at_filter(self):
        """The SELECT query filters on expires_at and used_at IS NULL."""
        conn, cur = _mock_conn(fetchone_return=None)

        with patch("psycopg2.connect", return_value=conn):
            from app.telegram_bot import consume_link_code
            consume_link_code(VALID_CODE, TELEGRAM_USER_ID, TELEGRAM_USERNAME)

        first_call_sql = cur.execute.call_args_list[0][0][0]
        assert "expires_at" in first_call_sql
        assert "used_at" in first_call_sql
