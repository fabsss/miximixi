"""
Functional tests for shortcode-based deduplication.

These tests verify the complete deduplication flow:
- Telegram bot duplicate detection
- Queue worker source extraction
- Integration with database schema
"""
import pytest
import psycopg2
from psycopg2.extras import RealDictCursor


@pytest.fixture
def db():
    """Get database connection for testing."""
    import os
    from app.config import settings

    db = psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
    )
    yield db
    db.close()


@pytest.fixture
def clean_recipes(db):
    """Clean up recipes table before and after each test."""
    import os
    import glob
    import re

    cursor = db.cursor()

    # Ensure migrations are run by parsing and executing all SQL statements
    migration_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'migrations')
    if os.path.exists(migration_dir):
        migration_files = sorted(glob.glob(os.path.join(migration_dir, '[0-9][0-9][0-9]_*.sql')))
        for migration_file in migration_files:
            try:
                with open(migration_file, 'r') as f:
                    migration_sql = f.read()

                # Remove SQL comments and split into statements
                # This handles -- comments and /* */ comments
                lines = migration_sql.split('\n')
                cleaned_lines = []
                in_block_comment = False

                for line in lines:
                    # Handle block comments
                    if '/*' in line:
                        in_block_comment = True
                    if '*/' in line:
                        in_block_comment = False
                        continue
                    if in_block_comment:
                        continue

                    # Remove line comments
                    if '--' in line:
                        line = line[:line.index('--')]

                    cleaned_lines.append(line)

                cleaned_sql = '\n'.join(cleaned_lines)

                # Split statements by semicolon, filter empty statements
                statements = [s.strip() for s in cleaned_sql.split(';') if s.strip()]

                for statement in statements:
                    try:
                        cursor.execute(statement)
                    except (psycopg2.errors.DuplicateTable, psycopg2.errors.DuplicateObject, psycopg2.errors.DuplicateSchema):
                        # Migration already applied
                        pass
                    except Exception:
                        # Some statements might fail if already applied, continue
                        pass

                db.commit()
            except Exception:
                # Rollback on any error
                db.rollback()

    # Delete test recipes
    try:
        cursor.execute("DELETE FROM recipes WHERE id LIKE 'test-%'")
        db.commit()
    except psycopg2.errors.UndefinedTable:
        # Table doesn't exist yet, will be created by migrations
        db.rollback()

    yield

    # Cleanup after test
    try:
        cursor.execute("DELETE FROM recipes WHERE id LIKE 'test-%'")
        db.commit()
    except psycopg2.errors.UndefinedTable:
        pass
    finally:
        cursor.close()


class TestTelegramBotDeduplication:
    """Test duplicate detection in telegram bot flow"""

    def test_instagram_duplicate_detection_with_utm_params(self, db, clean_recipes):
        """
        TC1: Same Instagram post with different UTM params should be detected as duplicate

        Scenario:
        1. User sends: instagram.com/p/ABC123/
        2. Recipe is saved with source_type='instagram', source_id='ABC123'
        3. User sends: instagram.com/p/ABC123/?utm_source=ig_web_copy_link
        4. Bot should detect this as duplicate
        """
        from app.source_identifier import get_source_type_from_url, extract_source_id

        # Simulate first import being saved
        url1 = "https://www.instagram.com/p/ABC123XYZ/"
        source_type = get_source_type_from_url(url1)
        source_id = extract_source_id(url1)

        recipe_id = "test-insta-1"
        cursor = db.cursor()
        cursor.execute(
            """INSERT INTO recipes (id, title, source_url, source_type, source_id)
               VALUES (%s, %s, %s, %s, %s)""",
            (recipe_id, "Test Recipe", url1, source_type, source_id)
        )
        db.commit()

        # Now check if second URL (with UTM params) is detected as duplicate
        url2 = "https://www.instagram.com/p/ABC123XYZ/?utm_source=ig_web_copy_link"
        source_type2 = get_source_type_from_url(url2)
        source_id2 = extract_source_id(url2)

        # Should extract same source_id
        assert source_type2 == "instagram"
        assert source_id2 == "ABC123XYZ"
        assert source_id == source_id2, "Should extract same shortcode from both URLs"

        # Check if bot would find duplicate
        cursor.execute(
            "SELECT id FROM recipes WHERE source_type = %s AND source_id = %s",
            (source_type2, source_id2)
        )
        result = cursor.fetchone()
        assert result is not None, "Should find existing recipe by (source_type, source_id)"
        assert result[0] == recipe_id

        cursor.close()

    def test_youtube_duplicate_detection_with_timestamp(self, db, clean_recipes):
        """
        TC2: Same YouTube video with different timestamp should be detected as duplicate

        Scenario:
        1. User sends: youtube.com/watch?v=dQw4w9WgXcQ
        2. Recipe is saved with source_type='youtube', source_id='dQw4w9WgXcQ'
        3. User sends: youtube.com/watch?v=dQw4w9WgXcQ&t=42s
        4. Bot should detect this as duplicate
        """
        from app.source_identifier import get_source_type_from_url, extract_source_id

        url1 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        source_type = get_source_type_from_url(url1)
        source_id = extract_source_id(url1)

        recipe_id = "test-yt-1"
        cursor = db.cursor()
        cursor.execute(
            """INSERT INTO recipes (id, title, source_url, source_type, source_id)
               VALUES (%s, %s, %s, %s, %s)""",
            (recipe_id, "Test Recipe", url1, source_type, source_id)
        )
        db.commit()

        # Check if URL with timestamp is detected as duplicate
        url2 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"
        source_type2 = get_source_type_from_url(url2)
        source_id2 = extract_source_id(url2)

        assert source_type2 == "youtube"
        assert source_id2 == "dQw4w9WgXcQ"
        assert source_id == source_id2

        cursor.execute(
            "SELECT id FROM recipes WHERE source_type = %s AND source_id = %s",
            (source_type2, source_id2)
        )
        result = cursor.fetchone()
        assert result is not None
        assert result[0] == recipe_id

        cursor.close()

    def test_web_url_duplicate_detection_full_url_match(self, db, clean_recipes):
        """
        TC3: Web URLs should use full URL for deduplication (no shortcode extraction)

        Scenario:
        1. User sends: example.com/recipe/pasta
        2. Recipe is saved with source_type='web', source_id=NULL
        3. User sends: example.com/recipe/pasta (exact same)
        4. Bot should detect as duplicate using full URL
        5. User sends: example.com/recipe/pasta?utm=tracking
        6. This should NOT be detected as duplicate (different URL)
        """
        from app.source_identifier import get_source_type_from_url, extract_source_id

        url1 = "https://example.com/recipe/pasta"
        source_type = get_source_type_from_url(url1)
        source_id = extract_source_id(url1)

        assert source_type == "web"
        assert source_id is None

        recipe_id = "test-web-1"
        cursor = db.cursor()
        cursor.execute(
            """INSERT INTO recipes (id, title, source_url, source_type, source_id)
               VALUES (%s, %s, %s, %s, %s)""",
            (recipe_id, "Test Recipe", url1, source_type, source_id)
        )
        db.commit()

        # Exact same URL should be found
        cursor.execute(
            "SELECT id FROM recipes WHERE source_url = %s",
            (url1,)
        )
        result = cursor.fetchone()
        assert result is not None, "Exact URL match should be found"

        # Different URL (even with same path) should NOT be found
        url2 = "https://example.com/recipe/pasta?utm=tracking"
        cursor.execute(
            "SELECT id FROM recipes WHERE source_url = %s",
            (url2,)
        )
        result = cursor.fetchone()
        assert result is None, "Different URL should not match for web sources"

        cursor.close()


class TestQueueWorkerSourceExtraction:
    """Test that queue worker correctly extracts and stores source_type/source_id"""

    def test_queue_worker_stores_instagram_source_info(self, db, clean_recipes):
        """
        TC4: Queue worker should extract and store Instagram source_type and source_id
        """
        from app.source_identifier import get_source_type_from_url, extract_source_id

        url = "https://www.instagram.com/p/ABC123XYZ/?utm_source=share"
        source_type = get_source_type_from_url(url)
        source_id = extract_source_id(url) if source_type != 'web' else None

        # Simulate what queue_worker does when saving
        cursor = db.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """INSERT INTO recipes (id, title, source_url, source_type, source_id)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING source_type, source_id""",
            ("test-qw-1", "Test", url, source_type, source_id)
        )
        result = cursor.fetchone()
        db.commit()

        # Verify extraction worked correctly
        assert result['source_type'] == 'instagram'
        assert result['source_id'] == 'ABC123XYZ'

        cursor.close()

    def test_queue_worker_stores_youtube_source_info(self, db, clean_recipes):
        """
        TC5: Queue worker should extract and store YouTube source_type and source_id
        """
        from app.source_identifier import get_source_type_from_url, extract_source_id

        url = "https://youtu.be/dQw4w9WgXcQ?t=42"
        source_type = get_source_type_from_url(url)
        source_id = extract_source_id(url) if source_type != 'web' else None

        cursor = db.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """INSERT INTO recipes (id, title, source_url, source_type, source_id)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING source_type, source_id""",
            ("test-qw-2", "Test", url, source_type, source_id)
        )
        result = cursor.fetchone()
        db.commit()

        assert result['source_type'] == 'youtube'
        assert result['source_id'] == 'dQw4w9WgXcQ'

        cursor.close()


class TestOldRecipesBackfill:
    """Test that backfill correctly populates old recipes"""

    def test_old_instagram_recipe_gets_backfilled(self, db, clean_recipes):
        """
        TC6: Old recipe (source_type=NULL) should be backfillable to source_type='instagram'
        """
        from app.source_identifier import get_source_type_from_url, extract_source_id

        # Insert old recipe (simulating pre-migration data)
        url = "https://www.instagram.com/p/ABC123XYZ/"
        cursor = db.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """INSERT INTO recipes (id, title, source_url, source_type, source_id)
               VALUES (%s, %s, %s, NULL, NULL)
               RETURNING id""",
            ("test-old-1", "Old Recipe", url)
        )
        recipe_id = cursor.fetchone()['id']
        db.commit()

        # Simulate backfill (what backfill_source_type.py would do)
        source_type = get_source_type_from_url(url)
        source_id = extract_source_id(url) if source_type != 'web' else None

        cursor.execute(
            "UPDATE recipes SET source_type = %s, source_id = %s WHERE id = %s",
            (source_type, source_id, recipe_id)
        )
        db.commit()

        # Verify backfill worked
        cursor.execute("SELECT source_type, source_id FROM recipes WHERE id = %s", (recipe_id,))
        result = cursor.fetchone()
        assert result['source_type'] == 'instagram'
        assert result['source_id'] == 'ABC123XYZ'

        # Now verify dedup would work on the backfilled recipe
        cursor.execute(
            "SELECT id FROM recipes WHERE source_type = 'instagram' AND source_id = 'ABC123XYZ'"
        )
        dup_check = cursor.fetchone()
        assert dup_check is not None, "Backfilled recipe should be findable by (source_type, source_id)"

        cursor.close()


class TestDatabaseConstraints:
    """Test that database constraints enforce deduplication correctly"""

    def test_unique_constraint_prevents_instagram_duplicates(self, db, clean_recipes):
        """
        TC7: Unique index on (source_type, source_id) should prevent duplicates for Instagram
        """
        cursor = db.cursor()

        # Insert first recipe
        cursor.execute(
            """INSERT INTO recipes (id, title, source_url, source_type, source_id)
               VALUES (%s, %s, %s, %s, %s)""",
            ("test-uc-1", "Recipe 1", "https://instagram.com/p/ABC123/", "instagram", "ABC123")
        )
        db.commit()

        # Try to insert duplicate shortcode for same platform
        # This should fail due to unique constraint
        with pytest.raises(psycopg2.IntegrityError):
            cursor.execute(
                """INSERT INTO recipes (id, title, source_url, source_type, source_id)
                   VALUES (%s, %s, %s, %s, %s)""",
                ("test-uc-2", "Recipe 2", "https://instagram.com/p/ABC123/?utm=tracking", "instagram", "ABC123")
            )
            db.commit()

        db.rollback()
        cursor.close()

    def test_multiple_web_recipes_allowed(self, db, clean_recipes):
        """
        TC8: Multiple web recipes should be allowed even with NULL source_id
        (unique constraint only applies to instagram/youtube)
        """
        cursor = db.cursor()

        # Insert multiple web recipes (all with source_id=NULL)
        cursor.execute(
            """INSERT INTO recipes (id, title, source_url, source_type, source_id)
               VALUES (%s, %s, %s, %s, %s)""",
            ("test-web-2", "Web Recipe 1", "https://example.com/recipe1", "web", None)
        )
        cursor.execute(
            """INSERT INTO recipes (id, title, source_url, source_type, source_id)
               VALUES (%s, %s, %s, %s, %s)""",
            ("test-web-3", "Web Recipe 2", "https://example.com/recipe2", "web", None)
        )

        # Should succeed (no unique constraint violation)
        db.commit()

        # Verify both were inserted
        cursor.execute("SELECT COUNT(*) FROM recipes WHERE source_type = 'web' AND source_id IS NULL")
        count = cursor.fetchone()[0]
        assert count >= 2, "Multiple web recipes should be allowed"

        cursor.close()
