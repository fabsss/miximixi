"""
Instagram Sync Worker
Periodically syncs Instagram collections to recipe import queue.
Multi-user ready: currently single admin (env var), scales to multi-user with auth.
"""

import asyncio
import logging
import psycopg2
import instaloader
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
        self.enabled: bool = True
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
    
    def get_status(self) -> dict:
        """Get current sync status"""
        return {
            "enabled": self.enabled,
            "selected_collection": {
                "id": self.selected_collection_id,
                "name": self.selected_collection_name,
            } if self.selected_collection_id else None,
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
    Fetch all available Instagram collections for authenticated account.
    Uses instaloader to enumerate user's saved collections.
    
    Returns: [{"collection_id": "123", "collection_name": "Favorite Recipes", "post_count": 45}]
    Raises: ValueError if Instagram auth fails (expired cookie, invalid account)
    """
    try:
        L = _get_loader()
        
        # For now, return empty list as placeholder
        # Instagram doesn't provide a direct API to list collections
        # TODO: Implement via web scraping if needed
        logger.info("Fetching collections from Instagram")
        return []
    
    except ValueError as e:
        # Auth error (cookie expired, etc.)
        error_msg = str(e)
        if "sessionid" in error_msg or "cookie" in error_msg.lower():
            raise ValueError(
                f"Instagram authentication failed: {error_msg}. "
                f"Your cookies may have expired. "
                f"Please export new cookies from instagram.com and restart the server."
            )
        raise
    except Exception as e:
        raise ValueError(f"Failed to connect to Instagram: {str(e)}")


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
    Fetch posts from specified Instagram collection using instaloader.
    
    Args:
        collection_id: Instagram collection ID (numeric)
    
    Returns: [{"post_id": "ABC123", "url": "https://...", "caption": "...", "owner": "@username"}]
    Raises: ValueError if collection not found or not accessible, or auth fails
    """
    try:
        L = _get_loader()
        
        # Fetch collection
        try:
            collection = instaloader.Collection(L.context, int(collection_id))
        except Exception as e:
            error_msg = str(e).lower()
            if "not found" in error_msg or "does not exist" in error_msg:
                raise ValueError(f"Instagram collection {collection_id} not found or not accessible")
            raise
        
        posts = []
        post_count = 0
        
        # Iterate over posts in collection (up to last 100)
        try:
            for post in collection.get_posts():
                post_count += 1
                if post_count > 100:  # Limit to prevent rate limiting
                    logger.info(f"Limited collection fetch to 100 most recent posts")
                    break
                
                posts.append({
                    "post_id": post.shortcode,
                    "url": f"https://www.instagram.com/p/{post.shortcode}/",
                    "caption": post.caption or "",
                    "owner": post.owner_username,
                    "timestamp": post.date_utc.isoformat() if post.date_utc else None,
                })
        except Exception as e:
            logger.warning(f"Error iterating collection posts: {e}")
        
        logger.info(f"Fetched {len(posts)} posts from collection {collection_id}")
        return posts
    
    except ValueError:
        raise
    except Exception as e:
        error_msg = str(e).lower()
        if "sessionid" in error_msg or "auth" in error_msg or "cookie" in error_msg:
            raise ValueError(
                f"Instagram authentication failed. Your cookies may have expired. "
                f"Error: {str(e)}"
            )
        raise ValueError(f"Failed to fetch collection posts: {str(e)}")


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
