# Shortcode-Based Recipe Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace URL-based duplicate detection with source-type + shortcode detection to prevent duplicate recipes from different URL formats (e.g., Instagram posts with/without UTM parameters).

**Architecture:** Add `source_type` and `source_id` columns to recipes table. Extract shortcodes (Instagram post ID, YouTube video ID, etc.) before checking for duplicates. Update deduplication logic in telegram_bot.py and instagram_sync_worker.py to use normalized source identifiers instead of full URLs.

**Tech Stack:** PostgreSQL migrations, Python utility functions for shortcode extraction, psycopg2 queries

---

## File Structure

**New Files:**
- `backend/app/source_identifier.py` - Utility functions to extract and normalize source identifiers

**Modified Files:**
- `backend/migrations/012_recipe_source_tracking.sql` - Add source_type and source_id columns
- `backend/app/telegram_bot.py` - Update deduplication to use shortcode check
- `backend/app/instagram_sync_worker.py` - Update deduplication to use shortcode check
- `backend/app/queue_worker.py` - Extract and store source_id when saving recipes
- `backend/tests/unit/test_source_identifier.py` - Unit tests for shortcode extraction

---

## Task 1: Create Source Identifier Utility Module

**Files:**
- Create: `backend/app/source_identifier.py`
- Test: `backend/tests/unit/test_source_identifier.py`

- [ ] **Step 1: Write failing tests for shortcode extraction**

Create `backend/tests/unit/test_source_identifier.py`:

```python
import pytest
from app.source_identifier import extract_source_id, get_source_type_from_url


class TestExtractSourceId:
    """Test shortcode extraction from various URL formats"""
    
    def test_instagram_post_standard_url(self):
        """Standard Instagram post URL"""
        url = "https://www.instagram.com/p/ABC123XYZ/"
        assert extract_source_id(url) == "ABC123XYZ"
    
    def test_instagram_post_with_utm_params(self):
        """Instagram URL with UTM tracking parameters"""
        url = "https://www.instagram.com/p/ABC123XYZ/?utm_source=ig_web_copy_link"
        assert extract_source_id(url) == "ABC123XYZ"
    
    def test_instagram_shorthand_domain(self):
        """Instagram shorthand domain"""
        url = "https://instagr.am/p/ABC123XYZ/"
        assert extract_source_id(url) == "ABC123XYZ"
    
    def test_instagram_reel(self):
        """Instagram Reel URL"""
        url = "https://www.instagram.com/reel/ABC123XYZ/"
        assert extract_source_id(url) == "ABC123XYZ"
    
    def test_youtube_standard_url(self):
        """Standard YouTube video URL"""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        assert extract_source_id(url) == "dQw4w9WgXcQ"
    
    def test_youtube_with_timestamp(self):
        """YouTube URL with timestamp parameter"""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"
        assert extract_source_id(url) == "dQw4w9WgXcQ"
    
    def test_youtube_short_url(self):
        """YouTube short URL"""
        url = "https://youtu.be/dQw4w9WgXcQ"
        assert extract_source_id(url) == "dQw4w9WgXcQ"
    
    def test_youtube_short_with_timestamp(self):
        """YouTube short URL with timestamp"""
        url = "https://youtu.be/dQw4w9WgXcQ?t=42"
        assert extract_source_id(url) == "dQw4w9WgXcQ"
    
    def test_web_url_returns_none(self):
        """Web URLs (non-Instagram/YouTube) return None"""
        url = "https://example.com/recipe"
        assert extract_source_id(url) is None
    
    def test_invalid_instagram_url(self):
        """Invalid Instagram URL returns None"""
        url = "https://www.instagram.com/invalid/"
        assert extract_source_id(url) is None
    
    def test_invalid_youtube_url(self):
        """Invalid YouTube URL returns None"""
        url = "https://www.youtube.com/invalid"
        assert extract_source_id(url) is None


class TestGetSourceTypeFromUrl:
    """Test source type detection"""
    
    def test_instagram_com(self):
        """Detects instagram.com"""
        assert get_source_type_from_url("https://www.instagram.com/p/ABC123/") == "instagram"
    
    def test_instagr_am(self):
        """Detects instagr.am shorthand"""
        assert get_source_type_from_url("https://instagr.am/p/ABC123/") == "instagram"
    
    def test_youtube_com(self):
        """Detects youtube.com"""
        assert get_source_type_from_url("https://www.youtube.com/watch?v=ABC") == "youtube"
    
    def test_youtu_be(self):
        """Detects youtu.be shorthand"""
        assert get_source_type_from_url("https://youtu.be/ABC") == "youtube"
    
    def test_web_default(self):
        """Unknown URLs default to 'web'"""
        assert get_source_type_from_url("https://example.com/recipe") == "web"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/Users/fabia/git/miximixi/backend
python -m pytest tests/unit/test_source_identifier.py -v
```

Expected: All tests fail with `ModuleNotFoundError: No module named 'app.source_identifier'`

- [ ] **Step 3: Implement source_identifier module**

Create `backend/app/source_identifier.py`:

```python
"""
Source identifier extraction for deduplication.
Normalizes URLs to extract platform-specific identifiers (shortcodes, video IDs, etc.)
"""
import re
from typing import Optional
from urllib.parse import urlparse, parse_qs


def get_source_type_from_url(url: str) -> str:
    """
    Detect source type from URL.
    
    Args:
        url: Full URL from import request
    
    Returns:
        "instagram" | "youtube" | "web"
    """
    url_lower = url.lower()
    
    if "instagram.com" in url_lower or "instagr.am" in url_lower:
        return "instagram"
    
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "youtube"
    
    return "web"


def extract_source_id(url: str) -> Optional[str]:
    """
    Extract platform-specific identifier (shortcode, video ID, etc.) from URL.
    
    Handles:
    - Instagram posts/reels: extracts shortcode from /p/{SHORTCODE}/ or /reel/{SHORTCODE}/
    - YouTube: extracts video ID from watch?v={ID} or youtu.be/{ID}
    - Web URLs: returns None (full URL is the identifier)
    
    Args:
        url: Full URL from import request
    
    Returns:
        Shortcode (Instagram) or video ID (YouTube) or None (web)
    """
    source_type = get_source_type_from_url(url)
    
    if source_type == "instagram":
        return _extract_instagram_shortcode(url)
    elif source_type == "youtube":
        return _extract_youtube_id(url)
    
    return None


def _extract_instagram_shortcode(url: str) -> Optional[str]:
    """
    Extract Instagram shortcode from URL.
    Handles: /p/{SHORTCODE}/, /reel/{SHORTCODE}/, /tv/{SHORTCODE}/
    
    Shortcodes are alphanumeric, up to 15 characters.
    """
    # Remove query parameters and fragments first
    base_url = url.split('?')[0].split('#')[0]
    
    # Match /p/, /reel/, or /tv/ followed by shortcode
    match = re.search(r'/(p|reel|tv)/([A-Za-z0-9_-]{11,}?)/', base_url)
    if match:
        return match.group(2)
    
    return None


def _extract_youtube_id(url: str) -> Optional[str]:
    """
    Extract YouTube video ID from URL.
    Handles: youtube.com/watch?v={ID} and youtu.be/{ID}
    
    Video IDs are exactly 11 characters, alphanumeric with - and _.
    """
    # Remove fragment
    base_url = url.split('#')[0]
    
    # youtu.be/{ID}
    match = re.search(r'youtu\.be/([A-Za-z0-9_-]{11})', base_url)
    if match:
        return match.group(1)
    
    # youtube.com/watch?v={ID}
    parsed = urlparse(base_url)
    if 'youtube.com' in parsed.netloc or 'youtube.com' in base_url.lower():
        params = parse_qs(parsed.query)
        if 'v' in params and params['v']:
            video_id = params['v'][0]
            if len(video_id) == 11 and re.match(r'^[A-Za-z0-9_-]{11}$', video_id):
                return video_id
    
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /c/Users/fabia/git/miximixi/backend
python -m pytest tests/unit/test_source_identifier.py -v
```

Expected: All tests pass (15/15)

- [ ] **Step 5: Commit**

```bash
cd /c/Users/fabia/git/miximixi/backend
git add app/source_identifier.py tests/unit/test_source_identifier.py
git commit -m "[backend] Add source identifier extraction for deduplication

- Extract Instagram shortcodes from /p/, /reel/, /tv/ URLs
- Extract YouTube video IDs from youtube.com and youtu.be URLs
- Normalize URLs to handle query parameters and fragments
- Tested against URL variants with UTM params, shorthand domains, etc."
```

---

## Task 2: Create Database Migration for Source Tracking

**Files:**
- Create: `backend/migrations/012_recipe_source_tracking.sql`

- [ ] **Step 1: Write the migration**

Create `backend/migrations/012_recipe_source_tracking.sql`:

```sql
-- Migration 012: Add source type and source ID for deduplication
-- Tracks platform-specific identifiers (shortcode, video ID) instead of full URL
-- Enables deduplication across URL format variations

-- Add columns to recipes table
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS source_type TEXT,
ADD COLUMN IF NOT EXISTS source_id TEXT;

-- Create unique constraint on (source_type, source_id) for platform-specific IDs
-- Allows multiple 'web' recipes since they don't have shortcodes
CREATE UNIQUE INDEX IF NOT EXISTS recipes_source_type_id_idx
  ON recipes (source_type, source_id)
  WHERE source_type IN ('instagram', 'youtube');

-- Index for queries by source
CREATE INDEX IF NOT EXISTS recipes_source_type_idx ON recipes (source_type);
CREATE INDEX IF NOT EXISTS recipes_source_id_idx ON recipes (source_id);
```

- [ ] **Step 2: Verify migration syntax**

```bash
cd /c/Users/fabia/git/miximixi/backend
psql -h localhost -U postgres -d miximixi -f migrations/012_recipe_source_tracking.sql
```

Expected: Migration applies without errors (may see "already exists" notices for IF NOT EXISTS)

- [ ] **Step 3: Commit**

```bash
cd /c/Users/fabia/git/miximixi/backend
git add migrations/012_recipe_source_tracking.sql
git commit -m "[backend] Add source_type and source_id columns for deduplication

- Track platform-specific identifiers separate from full URL
- Enables deduplication across URL format variations (UTM params, etc.)
- Unique constraint on (source_type, source_id) for Instagram/YouTube
- Web URLs can have multiple recipes since source_id=NULL"
```

---

## Task 3: Update Telegram Bot Deduplication Logic

**Files:**
- Modify: `backend/app/telegram_bot.py:150-212`

- [ ] **Step 1: Read current telegram_bot.py to understand context**

```bash
head -n 220 /c/Users/fabia/git/miximixi/backend/app/telegram_bot.py | tail -n 70
```

- [ ] **Step 2: Update imports in telegram_bot.py**

Find the imports section (around line 1-25) and add:

```python
from app.source_identifier import extract_source_id, get_source_type_from_url
```

- [ ] **Step 3: Replace duplicate check in message_handler**

In `message_handler()` function, replace the current duplicate check (lines 187-198) with:

```python
    # Detect source type and extract identifier
    source_type = get_source_type_from_url(url)
    source_id = extract_source_id(url)
    
    # Check if recipe already exists (deduplication by source_type + source_id)
    if source_type in ('instagram', 'youtube') and source_id:
        cursor.execute(
            "SELECT id FROM recipes WHERE source_type = %s AND source_id = %s LIMIT 1",
            (source_type, source_id)
        )
        if cursor.fetchone():
            await update.message.reply_text(
                f"❌ Dieses Rezept existiert bereits in meiner Sammlung.\n"
                f"Schau es dir doch an oder probier einen anderen Link!"
            )
            db.close()
            return
    # For web URLs, fall back to full URL check (source_id is None)
    else:
        cursor.execute(
            "SELECT id FROM recipes WHERE source_url = %s LIMIT 1",
            (url,)
        )
        if cursor.fetchone():
            await update.message.reply_text(
                f"❌ Dieses Rezept existiert bereits in meiner Sammlung.\n"
                f"Schau es dir doch an oder probier einen anderen Link!"
            )
            db.close()
            return
```

- [ ] **Step 4: Verify changes**

```bash
cd /c/Users/fabia/git/miximixi/backend
python -m py_compile app/telegram_bot.py
```

Expected: No syntax errors

- [ ] **Step 5: Commit**

```bash
cd /c/Users/fabia/git/miximixi/backend
git add app/telegram_bot.py
git commit -m "[backend] Update telegram bot to use shortcode-based deduplication

- Check (source_type, source_id) for Instagram/YouTube posts
- Falls back to source_url check for web URLs (no shortcode)
- Prevents duplicates from same post with different URL parameters"
```

---

## Task 4: Update Instagram Sync Worker Deduplication Logic

**Files:**
- Modify: `backend/app/instagram_sync_worker.py:342-376`

- [ ] **Step 1: Read current instagram_sync_worker.py**

```bash
sed -n '342,377p' /c/Users/fabia/git/miximixi/backend/app/instagram_sync_worker.py
```

- [ ] **Step 2: Verify instagram_sync_state uses post_id correctly**

The `instagram_sync_state` table already tracks `post_id` (Instagram shortcode), which is the platform-specific identifier. The current deduplication (lines 342-376) is already correct because it uses:

```python
cursor.execute("""
    SELECT post_id FROM instagram_sync_state
    WHERE collection_id = %s AND post_id = ANY(%s)
""")
```

This is already shortcode-based! No changes needed to `instagram_sync_worker.py` deduplication logic.

However, we need to ensure that when recipes are saved, the `source_type` and `source_id` are captured.

- [ ] **Step 3: Commit note (no changes to instagram_sync_worker.py)**

```bash
cd /c/Users/fabia/git/miximixi/backend
git commit --allow-empty -m "[backend] Note: instagram_sync_worker already uses shortcode deduplication

instagram_sync_state table already tracks post_id (shortcode) uniquely per collection.
This ensures posts aren't re-queued. The queue_worker will store source_id when saving recipes."
```

---

## Task 5: Update Queue Worker to Store Source Type and ID

**Files:**
- Modify: `backend/app/queue_worker.py:54-156`

- [ ] **Step 1: Read the _save_recipe_to_db function**

```bash
sed -n '54,102p' /c/Users/fabia/git/miximixi/backend/app/queue_worker.py
```

- [ ] **Step 2: Add import for source_identifier**

At the top of `queue_worker.py` (after other imports), add:

```python
from app.source_identifier import extract_source_id, get_source_type_from_url
```

- [ ] **Step 3: Modify _save_recipe_to_db signature and INSERT**

Update the function signature (line 54):

```python
def _save_recipe_to_db(
    recipe_id: str,
    recipe_data,
    image_filename: Optional[str],
    source_url: str,
    raw_source_text: str,
    extraction_status: str,
    queue_id: str,
    db=None,
) -> None:
```

Add these lines RIGHT AFTER the function signature, before the `should_close = False` line:

```python
    # Extract source type and ID for deduplication tracking
    source_type = get_source_type_from_url(source_url)
    source_id = extract_source_id(source_url) if source_type != 'web' else None
```

- [ ] **Step 4: Update INSERT statement to include source_type and source_id**

Find the INSERT statement (around line 80-84) and update it:

```python
        cursor.execute(
            """
            INSERT INTO recipes (id, title, lang, category, servings, prep_time, cook_time, tags, image_filename, source_url, source_label, raw_source_text, llm_provider_used, extraction_status, source_type, source_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                recipe_id,
                recipe_data.title,
                recipe_data.lang,
                recipe_data.category,
                recipe_data.servings,
                recipe_data.prep_time,
                recipe_data.cook_time,
                recipe_data.tags,
                image_filename,
                source_url,
                _extract_source_label(source_url),
                raw_source_text,
                settings.llm_provider,
                extraction_status,
                source_type,
                source_id,
            ),
        )
```

- [ ] **Step 5: Verify syntax**

```bash
cd /c/Users/fabia/git/miximixi/backend
python -m py_compile app/queue_worker.py
```

Expected: No syntax errors

- [ ] **Step 6: Commit**

```bash
cd /c/Users/fabia/git/miximixi/backend
git add app/queue_worker.py
git commit -m "[backend] Store source_type and source_id when saving recipes

- Extract shortcode/video ID from source URL
- Store in recipes.source_type and recipes.source_id
- Enables deduplication across URL format variations"
```

---

## Task 6: Add Tests for Integration

**Files:**
- Create: `backend/tests/unit/test_deduplication_integration.py`

- [ ] **Step 1: Write integration tests for deduplication logic**

Create `backend/tests/unit/test_deduplication_integration.py`:

```python
"""
Integration tests for shortcode-based deduplication.
Verify that recipes with different URL formats are correctly deduplicated.
"""
import pytest
from app.source_identifier import extract_source_id, get_source_type_from_url


class TestDeduplicationScenarios:
    """Test real-world duplicate scenarios"""
    
    def test_instagram_post_utm_variations(self):
        """Same Instagram post with different UTM parameters should have same shortcode"""
        url1 = "https://www.instagram.com/p/ABC123XYZ/"
        url2 = "https://www.instagram.com/p/ABC123XYZ/?utm_source=ig_web_copy_link"
        url3 = "https://www.instagram.com/p/ABC123XYZ/?utm_medium=share_sheet"
        
        # All should extract the same shortcode
        assert extract_source_id(url1) == extract_source_id(url2) == extract_source_id(url3)
        assert extract_source_id(url1) == "ABC123XYZ"
    
    def test_instagram_shorthand_vs_full_domain(self):
        """instagr.am shorthand and www.instagram.com should have same shortcode"""
        url1 = "https://www.instagram.com/p/ABC123XYZ/"
        url2 = "https://instagr.am/p/ABC123XYZ/"
        
        assert extract_source_id(url1) == extract_source_id(url2) == "ABC123XYZ"
        assert get_source_type_from_url(url1) == get_source_type_from_url(url2) == "instagram"
    
    def test_youtube_timestamp_variations(self):
        """YouTube URLs with different timestamps should have same video ID"""
        url1 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        url2 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"
        url3 = "https://youtu.be/dQw4w9WgXcQ?t=42"
        
        assert extract_source_id(url1) == extract_source_id(url2) == extract_source_id(url3)
        assert extract_source_id(url1) == "dQw4w9WgXcQ"
    
    def test_web_urls_have_no_shortcode(self):
        """Web URLs don't have platform-specific shortcodes"""
        url = "https://example.com/recipe/pasta"
        assert extract_source_id(url) is None
        assert get_source_type_from_url(url) == "web"
    
    def test_source_type_consistency(self):
        """Source type should be consistent across URL variations"""
        instagram_urls = [
            "https://www.instagram.com/p/ABC123/",
            "https://instagr.am/p/ABC123/",
            "https://www.instagram.com/p/ABC123/?utm_source=ig_web_copy_link",
        ]
        
        for url in instagram_urls:
            assert get_source_type_from_url(url) == "instagram"
        
        youtube_urls = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
        ]
        
        for url in youtube_urls:
            assert get_source_type_from_url(url) == "youtube"
```

- [ ] **Step 2: Run tests**

```bash
cd /c/Users/fabia/git/miximixi/backend
python -m pytest tests/unit/test_deduplication_integration.py -v
```

Expected: All tests pass (5/5)

- [ ] **Step 3: Commit**

```bash
cd /c/Users/fabia/git/miximixi/backend
git add tests/unit/test_deduplication_integration.py
git commit -m "[backend] Add integration tests for shortcode deduplication

- Verify Instagram posts with UTM params deduplicate to same shortcode
- Verify shorthand domains (instagr.am) match full domain
- Verify YouTube timestamps don't affect video ID extraction
- Verify web URLs correctly have no shortcode"
```

---

## Task 7: Verify Existing Data Has source_type Set

**Files:**
- No files modified, verification step

- [ ] **Step 1: Check existing recipes without source_type**

```bash
cd /c/Users/fabia/git/miximixi/backend
psql -h localhost -U postgres -d miximixi -c "SELECT COUNT(*) as recipes_missing_source_type FROM recipes WHERE source_type IS NULL;"
```

- [ ] **Step 2: Run backfill query (if needed)**

If there are recipes without source_type, run a backfill query. Create a temporary script:

Create `backend/backfill_source_type.py`:

```python
"""
Backfill source_type and source_id for existing recipes.
Run once after migration.
"""
import psycopg2
from psycopg2.extras import RealDictCursor
from app.source_identifier import extract_source_id, get_source_type_from_url
from app.config import settings

def backfill():
    db = psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
    )
    cursor = db.cursor(cursor_factory=RealDictCursor)
    
    # Get recipes without source_type
    cursor.execute("SELECT id, source_url FROM recipes WHERE source_type IS NULL")
    recipes = cursor.fetchall()
    
    updated = 0
    for recipe in recipes:
        source_type = get_source_type_from_url(recipe['source_url'])
        source_id = extract_source_id(recipe['source_url']) if source_type != 'web' else None
        
        cursor.execute(
            "UPDATE recipes SET source_type = %s, source_id = %s WHERE id = %s",
            (source_type, source_id, recipe['id'])
        )
        updated += 1
    
    db.commit()
    db.close()
    print(f"✓ Backfilled {updated} recipes")

if __name__ == "__main__":
    backfill()
```

Run it:

```bash
cd /c/Users/fabia/git/miximixi/backend
python backfill_source_type.py
```

Then remove the script:

```bash
rm backend/backfill_source_type.py
```

- [ ] **Step 3: Verify backfill**

```bash
psql -h localhost -U postgres -d miximixi -c "SELECT source_type, COUNT(*) FROM recipes GROUP BY source_type;"
```

Expected: Shows instagram, youtube, web counts (none with NULL source_type)

- [ ] **Step 4: No commit needed**

Backfill is a data operation, not code. If you did the backfill, just note it's complete.

---

## Task 8: Manual Testing Scenario

**Files:**
- No files, manual testing only

- [ ] **Step 1: Test Instagram duplicate prevention via Telegram**

Send the same Instagram post via Telegram bot in TWO formats:
1. Standard format: `https://www.instagram.com/p/{shortcode}/`
2. With UTM params: `https://www.instagram.com/p/{shortcode}/?utm_source=ig_web_copy_link`

Expected: Bot rejects the second as duplicate

- [ ] **Step 2: Test YouTube duplicate prevention**

Send the same YouTube video in TWO formats:
1. Standard: `https://www.youtube.com/watch?v={id}`
2. With timestamp: `https://www.youtube.com/watch?v={id}&t=42s`

Expected: Bot rejects the second as duplicate

- [ ] **Step 3: Test Instagram sync doesn't re-queue**

After syncing a collection, manually add the same post URL with different parameters to `import_queue`. Run sync again.

Expected: Sync detects the post_id is already tracked in `instagram_sync_state` and doesn't queue it again

- [ ] **Step 4: Verify database state**

```bash
psql -h localhost -U postgres -d miximixi << EOF
-- Check a recipe has source_type and source_id
SELECT id, title, source_url, source_type, source_id 
FROM recipes 
WHERE source_type IN ('instagram', 'youtube') 
LIMIT 3;
EOF
```

Expected: Shows source_type and source_id populated for Instagram/YouTube recipes

---

## Summary

This plan implements shortcode-based deduplication in 8 tasks:

1. **Source Identifier Module** - Extract and normalize shortcodes
2. **Database Migration** - Add source_type and source_id columns
3. **Telegram Bot** - Use shortcode check instead of URL check
4. **Instagram Sync** - Already uses shortcode, no changes needed
5. **Queue Worker** - Store source_type and source_id when saving
6. **Integration Tests** - Verify deduplication across URL variations
7. **Data Backfill** - Populate source_type for existing recipes
8. **Manual Testing** - Verify bot rejects duplicates correctly

**Key behavioral changes:**
- Instagram/YouTube posts with different URL parameters now deduplicate
- Web URLs still use full URL dedup (no shortcode extraction)
- Existing Instagram sync already works correctly (uses post_id)
