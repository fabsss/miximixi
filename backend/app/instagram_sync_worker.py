"""
Instagram Sync Worker
Periodically syncs Instagram collections to recipe import queue.
Multi-user ready: currently single admin (env var), scales to multi-user with auth.
"""

import asyncio
import logging
import psycopg2
from datetime import datetime
from typing import Optional, Dict, List, Callable
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

from app.config import settings
from app.instagram_service import _get_loader

logger = logging.getLogger(__name__)


class SyncControl:
    """Manages sync state: enabled/disabled, selected collection, status"""
    
    def __init__(self):
        self.enabled: bool = False
        self.selected_collection_id: Optional[str] = None
        self.selected_collection_name: Optional[str] = None
        self.last_status: Dict = {}
    
    def enable(self):
        """Enable automatic syncing"""
        self.enabled = True
        logger.info("Instagram sync enabled")
    
    def disable(self):
        """Disable automatic syncing"""
        self.enabled = False
        logger.info("Instagram sync disabled")
    
    def set_collection(self, collection_id: str, collection_name: str) -> bool:
        """Select collection. Only ONE collection can be active at a time."""
        self.selected_collection_id = collection_id
        self.selected_collection_name = collection_name
        logger.info(f"Instagram collection selected: {collection_name} ({collection_id})")
        return True
    
    def restore_from_db(self) -> bool:
        """
        Restore previously selected collection (and enabled state) from the database.
        Called once at startup so the selection survives container restarts.

        Returns True if a collection was found and restored, False otherwise.
        """
        try:
            db = get_db_connection()
            try:
                cursor = db.cursor(cursor_factory=RealDictCursor)
                cursor.execute("""
                    SELECT collection_id, collection_name
                    FROM instagram_sync_collections
                    WHERE enabled_at IS NOT NULL AND disabled_at IS NULL
                    LIMIT 1
                """)
                row = cursor.fetchone()
            finally:
                db.close()

            if row:
                self.selected_collection_id = row["collection_id"]
                self.selected_collection_name = row["collection_name"]
                # Re-enable sync automatically if a collection was previously configured
                self.enabled = True
                logger.info(
                    f"Restored Instagram sync state from DB: "
                    f"collection={row['collection_name']} ({row['collection_id']}), enabled=True"
                )
                return True
            else:
                logger.info("No previously selected Instagram collection found in DB — starting fresh")
                return False
        except Exception as e:
            # DB might not be ready yet on very first startup — non-fatal
            logger.warning(f"Could not restore Instagram sync state from DB: {e}")
            return False

    def get_status(self) -> dict:
        """Get current sync status"""
        return {
            "enabled": self.enabled,
            "collection_id": self.selected_collection_id,
            "collection_name": self.selected_collection_name,
            "last_sync": self.last_status.get("timestamp"),
            "last_stats": self.last_status.get("stats"),
        }


def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
    )


async def get_available_collections() -> List[Dict]:
    """
    Fetch all available Instagram saved collections via Instagram's private mobile API.
    Uses the authenticated requests.Session from instaloader (sessionid cookie).

    instaloader.Profile has no get_collections() method — we call /api/v1/collections/list/
    directly with mobile app headers, which is what Instagram's own app uses.

    Returns: [{"collection_id": "123", "collection_name": "Favorite Recipes", "post_count": 45}]
    Raises: ValueError if Instagram auth fails (expired cookie, invalid account)
    """
    try:
        logger.info("Fetching collections from Instagram")

        # instaloader is synchronous — run in thread pool to avoid blocking the event loop
        def _fetch_sync() -> List[Dict]:
            L = _get_loader()  # Already has sessionid cookie set on its requests.Session

            # The sessionid cookie determines the authenticated account — not INSTAGRAM_USERNAME.
            # INSTAGRAM_USERNAME is only used as a label. Collections are owned by whoever
            # exported instagram_cookies.txt. Log this clearly to avoid confusion.
            logger.info(
                f"Fetching collections for session owner (cookies.txt account). "
                f"INSTAGRAM_USERNAME env var is set to: {repr(settings.instagram_username)} "
                f"(this is just a label — it does NOT control which account is used)"
            )

            # Instagram private mobile API — same endpoint the app uses for saved collections.
            # collection_types:
            #   "ALL_MEDIA_AUTO_COLLECTION" = the default "All" saved posts folder
            #   "MEDIA" = custom named saved collections (what the user creates)
            url = "https://www.instagram.com/api/v1/collections/list/"
            params = {
                "collection_types": '["ALL_MEDIA_AUTO_COLLECTION","MEDIA"]',
                "query": "",
                "include_public_only": "0",
            }
            headers = {
                # Mobile app User-Agent is required — the desktop UA returns 400/403 here
                "User-Agent": (
                    "Instagram 276.0.0.19.101 Android (33/13; 420dpi; 1080x2340; "
                    "Google/google; Pixel 6; oriole; oriole; en_US; 458229258)"
                ),
                "X-IG-App-ID": "936619743392459",
                "Accept": "application/json",
            }

            resp = L.context._session.get(url, params=params, headers=headers)

            if resp.status_code in (401, 403):
                raise ValueError(
                    f"Instagram authentication failed (HTTP {resp.status_code}). "
                    "Your cookies may have expired. "
                    "Please export new cookies from instagram.com and restart the server."
                )
            resp.raise_for_status()

            data = resp.json()
            result = []
            for item in data.get("items", []):
                # Skip the auto-generated "All" collection (not user-created)
                if item.get("collection_type") == "ALL_MEDIA_AUTO_COLLECTION":
                    continue
                result.append({
                    "collection_id": str(item.get("collection_id", "")),
                    "collection_name": item.get("collection_name", ""),
                    # API returns 'collection_media_count', not 'media_count'
                    "post_count": item.get("collection_media_count") or item.get("media_count") or 0,
                })
            return result

        loop = asyncio.get_event_loop()
        collections = await loop.run_in_executor(None, _fetch_sync)
        logger.info(f"Found {len(collections)} Instagram collections")
        return collections

    except ValueError:
        raise
    except Exception as e:
        error_msg = str(e)
        if any(w in error_msg.lower() for w in ["sessionid", "cookie", "login", "auth", "401", "403"]):
            raise ValueError(
                f"Instagram authentication failed: {error_msg}. "
                f"Your cookies may have expired. "
                f"Please export new cookies from instagram.com and restart the server."
            )
        raise ValueError(f"Failed to fetch Instagram collections: {error_msg}")


async def get_monitored_collection(user_id: Optional[int] = None) -> Optional[Dict]:
    """
    Fetch the SELECTED collection from instagram_sync_collections table.
    Only ONE collection should be enabled (enabled_at IS NOT NULL, disabled_at IS NULL).
    
    Args:
        user_id: For future multi-user support (currently unused)
    
    Returns: {"collection_id": "123", "collection_name": "Favorite Recipes"} or None
    """
    db = get_db_connection()
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT collection_id, collection_name
            FROM instagram_sync_collections
            WHERE enabled_at IS NOT NULL AND disabled_at IS NULL
            LIMIT 1
        """)
        result = cursor.fetchone()
        return dict(result) if result else None
    finally:
        db.close()


async def fetch_collection_posts(collection_id: str) -> List[Dict]:
    """
    Fetch posts from a specific Instagram saved collection via the private mobile API.

    instaloader.Collection does not exist as a public class — we use
    /api/v1/feed/collection/{id}/posts/ directly, consistent with get_available_collections().

    Args:
        collection_id: Instagram collection ID (numeric string)

    Returns: [{"post_id": "ABC123", "url": "https://...", "caption": "...", "owner": "username"}]
    Raises: ValueError if auth fails or collection is not accessible
    """
    try:
        def _fetch_sync() -> List[Dict]:
            L = _get_loader()

            url = f"https://www.instagram.com/api/v1/feed/collection/{collection_id}/posts/"
            headers = {
                "User-Agent": (
                    "Instagram 276.0.0.19.101 Android (33/13; 420dpi; 1080x2340; "
                    "Google/google; Pixel 6; oriole; oriole; en_US; 458229258)"
                ),
                "X-IG-App-ID": "936619743392459",
                "Accept": "application/json",
            }

            posts = []
            max_id = None

            while len(posts) < 100:
                params = {}
                if max_id:
                    params["max_id"] = max_id

                resp = L.context._session.get(url, params=params, headers=headers)

                if resp.status_code in (401, 403):
                    raise ValueError(
                        f"Instagram authentication failed (HTTP {resp.status_code}). "
                        "Your cookies may have expired."
                    )
                resp.raise_for_status()

                data = resp.json()

                for item in data.get("items", []):
                    # Items may be wrapped in a "media" key or be the media object directly
                    media = item.get("media", item)
                    shortcode = media.get("code") or media.get("shortcode")
                    if not shortcode:
                        continue

                    caption_data = media.get("caption") or {}
                    caption = caption_data.get("text", "") if isinstance(caption_data, dict) else ""

                    user_data = media.get("user") or {}
                    owner = user_data.get("username", "")

                    taken_at = media.get("taken_at")
                    timestamp = None
                    if taken_at:
                        from datetime import datetime, timezone
                        timestamp = datetime.fromtimestamp(taken_at, tz=timezone.utc).isoformat()

                    posts.append({
                        "post_id": shortcode,
                        "url": f"https://www.instagram.com/p/{shortcode}/",
                        "caption": caption,
                        "owner": owner,
                        "timestamp": timestamp,
                    })

                # Pagination
                next_max_id = data.get("next_max_id")
                if not next_max_id or not data.get("more_available", False):
                    break
                max_id = next_max_id

            return posts

        loop = asyncio.get_event_loop()
        posts = await loop.run_in_executor(None, _fetch_sync)
        logger.info(f"Fetched {len(posts)} posts from collection {collection_id}")
        return posts

    except ValueError:
        raise
    except Exception as e:
        error_msg = str(e)
        if any(w in error_msg.lower() for w in ["sessionid", "cookie", "auth", "401", "403"]):
            raise ValueError(
                f"Instagram authentication failed. Your cookies may have expired. "
                f"Error: {error_msg}"
            )
        raise ValueError(f"Failed to fetch collection posts: {error_msg}")


async def has_recipe(caption: str) -> bool:
    """
    Quick heuristic: does caption mention recipes/cooking?
    German keywords: Rezept, Zutat, Schritt, Kochen, Backen, Gericht
    English keywords: recipe, ingredient, step, cook, bake, dish
    
    Returns: True if caption likely contains a recipe
    """
    if not caption:
        return False
    
    caption_lower = caption.lower()
    recipe_keywords = [
        # German
        "rezept", "zutat", "schritt", "kochen", "backen", "gericht", "anleitung",
        # English
        "recipe", "ingredient", "step", "cook", "bake", "dish", "instruction",
    ]
    
    return any(keyword in caption_lower for keyword in recipe_keywords)


async def detect_new_posts(collection_id: str, posts: List[Dict]) -> List[Dict]:
    """
    Compare fetched posts against instagram_sync_state table.
    Returns only new posts not yet queued.
    
    Args:
        collection_id: Instagram collection ID
        posts: List of posts from fetch_collection_posts()
    
    Returns: Subset of posts that are new (not in instagram_sync_state)
    """
    if not posts:
        return []
    
    db = get_db_connection()
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Get all post IDs we've already seen for this collection
        post_ids = [p["post_id"] for p in posts]
        cursor.execute("""
            SELECT post_id FROM instagram_sync_state
            WHERE collection_id = %s AND post_id = ANY(%s)
        """, (collection_id, post_ids))
        
        seen_ids = {row["post_id"] for row in cursor.fetchall()}
        
        # Filter to only new posts
        new_posts = [p for p in posts if p["post_id"] not in seen_ids]
        
        logger.info(f"Collection {collection_id}: {len(posts)} total, {len(new_posts)} new")
        return new_posts
    
    finally:
        db.close()


async def queue_recipe_imports(
    collection_id: str,
    posts: List[Dict],
) -> Dict:
    """
    Insert new posts into import_queue with source_type='instagram'.
    Update instagram_sync_state with tracking info.
    
    Args:
        collection_id: Instagram collection ID
        posts: List of new posts from detect_new_posts()
    
    Returns: {"queued": 3, "skipped": 0, "errors": 0}
    """
    db = get_db_connection()
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        queued = 0
        skipped = 0
        errors = 0
        
        for post in posts:
            try:
                # Skip if no recipe keywords in caption
                if not await has_recipe(post["caption"]):
                    skipped += 1
                    continue
                
                # Insert into import_queue
                cursor.execute("""
                    INSERT INTO import_queue (source_url, source_type, caption, status)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                """, (
                    post["url"],
                    "instagram",
                    post["caption"][:1000],  # Limit caption length
                    "pending",
                ))
                
                queue_id = cursor.fetchone()["id"]
                
                # Update instagram_sync_state with tracking info
                cursor.execute("""
                    INSERT INTO instagram_sync_state (collection_id, post_id, source_url, queued_job_id)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (collection_id, post_id) DO UPDATE
                    SET queued_job_id = EXCLUDED.queued_job_id, synced_at = CURRENT_TIMESTAMP
                """, (collection_id, post["post_id"], post["url"], queue_id))
                
                queued += 1
                
            except Exception as post_error:
                logger.warning(f"Error queueing post {post['post_id']}: {post_error}")
                errors += 1
        
        db.commit()
        
        stats = {"queued": queued, "skipped": skipped, "errors": errors, "total_posts": len(posts)}
        logger.info(f"Queue result: {stats}")
        return stats
    
    finally:
        db.close()


async def run_instagram_sync(
    sync_control: SyncControl,
    sync_interval: int = 900,
    run_once: bool = False,
    notify_admin: Optional[Callable] = None,
) -> Optional[Dict]:
    """
    Main Instagram sync loop.
    Runs continuously, syncing selected collection every sync_interval seconds.
    
    Args:
        sync_control: SyncControl instance for enabling/disabling + collection selection
        sync_interval: Seconds between syncs (default: 900 = 15 minutes)
        run_once: If True, run once and return stats (for /sync_now)
        notify_admin: Callback function to notify admin on auth failures
    
    Returns: Stats dict if run_once=True, else None (runs forever)
    """
    
    while True:
        try:
            # Check if sync is enabled
            if not sync_control.enabled and not run_once:
                logger.debug("Instagram sync disabled, skipping")
                await asyncio.sleep(sync_interval)
                continue
            
            # Get the selected collection
            collection = await get_monitored_collection()
            
            if not collection:
                if run_once:
                    return {
                        "error": "No collection selected",
                        "total_posts": 0,
                        "queued": 0,
                        "skipped": 0,
                        "errors": 0,
                    }
                logger.debug("No Instagram collection selected, skipping sync")
                await asyncio.sleep(sync_interval)
                continue
            
            # Fetch posts and process
            posts = await fetch_collection_posts(collection["collection_id"])
            new_posts = await detect_new_posts(collection["collection_id"], posts)
            stats = await queue_recipe_imports(collection["collection_id"], new_posts)
            
            # Update sync control status
            sync_control.last_status = {
                "timestamp": datetime.now().isoformat(),
                "collection": collection,
                "stats": stats,
            }
            
            logger.info(
                f"Sync complete for collection '{collection['collection_name']}': "
                f"{stats['queued']} queued, {stats['skipped']} skipped, {stats['errors']} errors"
            )
            
            if run_once:
                return stats
            
            await asyncio.sleep(sync_interval)
        
        except ValueError as auth_error:
            # Instagram authentication failed
            error_msg = str(auth_error)
            logger.error(f"Instagram auth failed during sync: {error_msg}")
            
            # Notify admin
            if notify_admin:
                try:
                    await notify_admin(
                        message=(
                            "⚠️ Instagram Sync Auth Error\n\n"
                            "Die Instagram-Authentifizierung ist abgelaufen!\n\n"
                            f"Fehler: {error_msg}\n\n"
                            "Lösung:\n"
                            "1. Gehe zu instagram.com und melde dich an\n"
                            "2. Exportiere neue cookies.txt via 'Get cookies.txt LOCALLY'\n"
                            "3. Ersetze backend/instagram_cookies.txt\n"
                            "4. Starte den Server neu\n"
                            "5. Nutze /sync_setup um die Authentifizierung zu testen"
                        )
                    )
                except Exception as notify_error:
                    logger.warning(f"Failed to notify admin: {notify_error}")
            
            if run_once:
                return {"error": error_msg, "total_posts": 0, "queued": 0}
            
            # Continue trying on next interval
            await asyncio.sleep(sync_interval)
        
        except Exception as e:
            # Rate limit, network error, database error, etc.
            logger.exception(f"Sync error (will retry): {e}")
            
            if run_once:
                return {"error": str(e), "total_posts": 0, "queued": 0}
            
            await asyncio.sleep(sync_interval)
