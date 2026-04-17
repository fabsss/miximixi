import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager

import psycopg2
from psycopg2.extras import RealDictCursor
import shutil
from fastapi import FastAPI, HTTPException, BackgroundTasks, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import settings
from app.models import ImportRequest, ImportResponse, RecipeUpdateRequest, TranslationResponse, CategoryCountsResponse, CATEGORIES
from app.queue_worker import run_worker
from app.telegram_bot import run_bot
from app.instagram_sync_worker import SyncControl, run_instagram_sync
from app.llm_provider import LLMProvider

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def generate_slug(title: str) -> str:
    """Generiert einen URL-sicheren Slug aus dem Rezepttitel."""
    import re
    slug = title.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)  # Nur Buchstaben, Zahlen, Leerzeichen, Bindestrich
    slug = re.sub(r'[-\s]+', '-', slug)   # Leerzeichen + mehrere Bindestriche → ein Bindestrich
    return slug.strip('-')


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Temp-Verzeichnis anlegen
    os.makedirs(settings.tmp_dir, exist_ok=True)
    os.makedirs(settings.images_dir, exist_ok=True)

    # Shared mutable slot for bot → worker callback wiring
    notify_holder = [None]

    async def notify_proxy(**kwargs):
        """Proxy that calls the real notify callback once bot is initialized."""
        if notify_holder[0]:
            await notify_holder[0](**kwargs)

    # Start worker with proxy callback
    worker_task = asyncio.create_task(
        run_worker(poll_interval=5, notify_callback=notify_proxy)
    )
    logger.info("Queue-Worker gestartet")

    # Create Instagram sync control instance
    sync_control = SyncControl()

    # Admin notification callback for sync worker
    async def notify_admin(message: str):
        """Notify admin via Telegram on sync auth failure"""
        if notify_holder[0] and settings.telegram_notify_chat_id:
            try:
                await notify_holder[0](
                    chat_id=settings.telegram_notify_chat_id,
                    success=False,
                    error_msg=message,
                )
            except Exception as e:
                logger.warning(f"Failed to notify admin: {e}")

    # Start sync worker if enabled
    if settings.instagram_sync_enabled:
        sync_task = asyncio.create_task(
            run_instagram_sync(
                sync_control=sync_control,
                sync_interval=settings.instagram_sync_interval,
                notify_admin=notify_admin,
            )
        )
        logger.info("Instagram-Sync-Worker gestartet")
    else:
        sync_task = None
        logger.info("Instagram-Sync-Worker deaktiviert (INSTAGRAM_SYNC_ENABLED=false)")

    # Start bot (bot will inject real callback into notify_holder)
    async def init_bot():
        def set_notify_callback(callback):
            notify_holder[0] = callback
        await run_bot(set_notify_callback, sync_control=sync_control)
    
    bot_task = asyncio.create_task(init_bot())
    logger.info("Telegram-Bot gestartet")

    yield

    # Graceful shutdown
    logger.info("Fahre Worker, Bot und Sync herunter...")
    worker_task.cancel()
    bot_task.cancel()
    if sync_task:
        sync_task.cancel()
    
    tasks_to_cancel = [worker_task, bot_task]
    if sync_task:
        tasks_to_cancel.append(sync_task)
    
    for task in tasks_to_cancel:
        try:
            await task
        except asyncio.CancelledError:
            pass
    
    logger.info("Worker, Bot und Sync heruntergefahren")


app = FastAPI(
    title="Miximixi Backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In Produktion: nur Frontend-Domain
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    """Erstellt eine PostgreSQL-Verbindung."""
    return psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
    )


# ── Healthcheck ──────────────────────────────────────────────────────
@app.get("/health")
async def health():
    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT 1")
        db.close()
        return {"status": "ok", "llm_provider": settings.llm_provider}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Database not available")


# ── Configuration Endpoints ──────────────────────────────────────────
@app.get("/categories")
async def get_categories():
    """Gibt alle erlaubten Rezept-Kategorien zurück."""
    return {"categories": CATEGORIES}


@app.get("/categories/counts", response_model=CategoryCountsResponse)
async def get_category_counts():
    """Returns total recipe count per category and overall total."""
    def _fetch_counts():
        db = get_db()
        cursor = db.cursor(cursor_factory=RealDictCursor)
        try:
            cursor.execute(
                "SELECT category, COUNT(*) AS count FROM recipes WHERE category IS NOT NULL GROUP BY category"
            )
            rows = cursor.fetchall()
            cursor.execute("SELECT COUNT(*) AS count FROM recipes")
            total_row = cursor.fetchone()

            if not total_row:
                raise ValueError("Failed to fetch total count from database")

            counts = {row["category"]: row["count"] for row in rows}
            return {"counts": counts, "total": total_row["count"]}
        finally:
            db.close()

    try:
        result = await asyncio.to_thread(_fetch_counts)
        return result
    except Exception as e:
        logger.error(f"Category counts failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch category counts")


# ── Import Endpoints ─────────────────────────────────────────────────
@app.post("/import", response_model=ImportResponse)
async def create_import(req: ImportRequest):
    """URL in die Import-Queue legen."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        # Duplikat-Check: Prüfe ob Rezept bereits erfolgreich importiert wurde
        cursor.execute(
            "SELECT id, title FROM recipes WHERE source_url = %s",
            (req.url,),
        )
        existing_recipe = cursor.fetchone()

        if existing_recipe:
            db.close()
            return ImportResponse(
                queue_id="",
                status="done",
                message=f"❌ Rezept '{existing_recipe['title']}' existiert bereits in der Datenbank",
            )

        # Duplikat-Check: Prüfe ob URL gerade verarbeitet wird
        cursor.execute(
            "SELECT id, status FROM import_queue WHERE source_url = %s AND status IN (%s, %s, %s)",
            (req.url, "pending", "processing", "done"),
        )
        existing_queue = cursor.fetchone()

        if existing_queue:
            db.close()
            return ImportResponse(
                queue_id=existing_queue["id"],
                status=existing_queue["status"],
                message=f"⏳ URL wird gerade verarbeitet (status: {existing_queue['status']})",
            )

        queue_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO import_queue (id, source_url, source_type, status, caption)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (queue_id, req.url, req.source_type, "pending", req.caption or None),
        )
        db.commit()
        db.close()

        logger.info(f"Import-Job erstellt: {queue_id} für {req.url}")

        return ImportResponse(
            queue_id=queue_id,
            status="pending",
            message="✅ Rezept wird verarbeitet…",
        )

    except Exception as e:
        db.close()
        logger.error(f"Import creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/import/{queue_id}")
async def get_import_status(queue_id: str):
    """Status eines Import-Jobs abfragen."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        cursor.execute("SELECT * FROM import_queue WHERE id = %s", (queue_id,))
        job = cursor.fetchone()
        db.close()

        if not job:
            raise HTTPException(status_code=404, detail="Job nicht gefunden")

        response = {"queue_id": queue_id, "status": job["status"]}

        if job.get("recipe_id"):
            response["recipe_id"] = job["recipe_id"]
        if job.get("error_msg"):
            response["error"] = job["error_msg"]

        return response

    except HTTPException:
        raise
    except Exception as e:
        db.close()
        logger.error(f"Import status lookup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/import")
async def list_imports(limit: int = 20):
    """Letzte Import-Jobs auflisten."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        cursor.execute(
            "SELECT * FROM import_queue ORDER BY created_at DESC LIMIT %s",
            (limit,),
        )
        jobs = cursor.fetchall()
        db.close()
        return [dict(job) for job in jobs]

    except Exception as e:
        db.close()
        logger.error(f"Import list failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Instagram Endpoints ───────────────────────────────────────────────

_instagram_challenge_client = None


@app.post("/instagram/login")
async def instagram_login():
    """Instagram-Session initialisieren."""
    global _instagram_challenge_client
    import asyncio
    from instagrapi import Client
    from instagrapi.exceptions import ChallengeRequired, TwoFactorRequired

    if not settings.instagram_username or not settings.instagram_password:
        raise HTTPException(status_code=400, detail="INSTAGRAM_USERNAME/PASSWORD nicht konfiguriert")

    def _login():
        cl = Client()
        if os.path.exists(settings.instagram_session_file):
            try:
                cl.load_settings(settings.instagram_session_file)
                cl.login(settings.instagram_username, settings.instagram_password)
                cl.dump_settings(settings.instagram_session_file)
                return cl, "reused"
            except Exception:
                pass
        cl.login(settings.instagram_username, settings.instagram_password)
        cl.dump_settings(settings.instagram_session_file)
        return cl, "new"

    try:
        cl, mode = await asyncio.to_thread(_login)
        logger.info(f"Instagram Login erfolgreich ({mode} session)")
        return {"status": "ok", "message": f"Login erfolgreich ({mode} session)"}
    except ChallengeRequired:
        from instagrapi import Client

        cl = Client()
        if os.path.exists(settings.instagram_session_file):
            cl.load_settings(settings.instagram_session_file)
        cl.challenge_resolve(cl.last_json)
        _instagram_challenge_client = cl
        return {
            "status": "challenge_required",
            "message": 'Verification Code: POST /instagram/challenge mit {"code": "123456"}',
        }
    except TwoFactorRequired:
        _instagram_challenge_client = None
        raise HTTPException(status_code=400, detail="2FA aktiv – App-Passwort verwenden")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/instagram/challenge")
async def instagram_challenge(body: dict):
    """Verification Code einreichen."""
    global _instagram_challenge_client
    import asyncio

    code = body.get("code", "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="'code' fehlt")
    if not _instagram_challenge_client:
        raise HTTPException(status_code=400, detail="Kein aktiver Challenge-Login")

    def _verify():
        _instagram_challenge_client.challenge_resolve(_instagram_challenge_client.last_json, code)
        _instagram_challenge_client.dump_settings(settings.instagram_session_file)

    try:
        await asyncio.to_thread(_verify)
        _instagram_challenge_client = None
        logger.info("Instagram Challenge erfolgreich")
        return {"status": "ok", "message": "Login abgeschlossen"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Challenge fehlgeschlagen: {e}")


@app.post("/instagram/sync")
async def instagram_sync():
    """Instagram Collection-Sync."""
    from app.instagram_service import get_collection_media_urls

    try:
        items = get_collection_media_urls(limit=20)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Instagram-Fehler: {e}")

    db = get_db()
    cursor = db.cursor()
    queued = 0

    try:
        for item in items:
            # Duplikat-Check
            cursor.execute(
                "SELECT id FROM import_queue WHERE source_url = %s",
                (item["url"],),
            )
            if cursor.fetchone():
                continue

            cursor.execute(
                """
                INSERT INTO import_queue (id, source_url, source_type, status)
                VALUES (%s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), item["url"], "instagram", "pending"),
            )
            queued += 1

        db.commit()
        db.close()
        logger.info(f"Instagram Sync: {queued} neue Jobs")
        return {"queued": queued, "total_checked": len(items)}

    except Exception as e:
        db.close()
        logger.error(f"Instagram sync failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Recipes Endpoints ───────────────────────────────────────────────
@app.get("/recipes")
async def list_recipes(limit: int = 20, offset: int = 0):
    """Alle Rezepte auflisten."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        cursor.execute(
            """
            SELECT id, title, category, image_filename, source_url, source_label, rating, tags, created_at
            FROM recipes ORDER BY created_at DESC LIMIT %s OFFSET %s
            """,
            (limit, offset),
        )
        recipes = cursor.fetchall()
        db.close()
        return [
            {
                **dict(r),
                "slug": f"{generate_slug(r['title'])}-{r['id']}"
            }
            for r in recipes
        ]

    except Exception as e:
        db.close()
        logger.error(f"Recipes list failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recipes/{recipe_slug}")
async def get_recipe(recipe_slug: str):
    """Rezept mit Zutaten und Schritten abrufen. Slug-Format: 'rezept-name-{uuid}'."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        # Extrahiere UUID aus slug-uuid Format (letzte 36 Zeichen)
        if len(recipe_slug) > 36 and recipe_slug[-37] == '-':
            recipe_id = recipe_slug[-36:]
        else:
            recipe_id = recipe_slug

        cursor.execute("SELECT * FROM recipes WHERE id = %s", (recipe_id,))
        recipe = cursor.fetchone()

        if not recipe:
            db.close()
            raise HTTPException(status_code=404, detail="Rezept nicht gefunden")

        cursor.execute(
            "SELECT * FROM ingredients WHERE recipe_id = %s ORDER BY sort_order",
            (recipe_id,),
        )
        ingredients = cursor.fetchall()

        cursor.execute(
            "SELECT * FROM steps WHERE recipe_id = %s ORDER BY sort_order",
            (recipe_id,),
        )
        steps = cursor.fetchall()

        db.close()

        return {
            **dict(recipe),
            "slug": f"{generate_slug(recipe['title'])}-{recipe['id']}",
            "ingredients": [dict(i) for i in ingredients],
            "steps": [dict(s) for s in steps],
        }

    except HTTPException:
        raise
    except Exception as e:
        db.close()
        logger.error(f"Recipe lookup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Recipe Update Endpoint ──────────────────────────────────────────
@app.patch("/recipes/{recipe_id}")
async def update_recipe(recipe_id: str, req: RecipeUpdateRequest):
    """Update recipe metadata (title, servings, notes, rating, category, tags, prep_time, cook_time)."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        # Check if recipe exists
        cursor.execute("SELECT id FROM recipes WHERE id = %s", (recipe_id,))
        if not cursor.fetchone():
            db.close()
            raise HTTPException(status_code=404, detail="Rezept nicht gefunden")

        # Build update query dynamically (sparse update)
        fields_to_update = []
        params = []

        if req.title is not None:
            fields_to_update.append("title = %s")
            params.append(req.title)
        if req.servings is not None:
            fields_to_update.append("servings = %s")
            params.append(req.servings)
        if req.prep_time is not None:
            fields_to_update.append("prep_time = %s")
            params.append(req.prep_time)
        if req.cook_time is not None:
            fields_to_update.append("cook_time = %s")
            params.append(req.cook_time)
        if req.category is not None:
            fields_to_update.append("category = %s")
            params.append(req.category)
        if req.tags is not None:
            fields_to_update.append("tags = %s")
            params.append(req.tags)
        if req.notes is not None:
            fields_to_update.append("notes = %s")
            params.append(req.notes)
        if req.rating is not None:
            if req.rating not in (-1, 0, 1):
                db.close()
                raise HTTPException(status_code=400, detail="Rating muss -1, 0 oder 1 sein")
            fields_to_update.append("rating = %s")
            params.append(req.rating)

        # If no fields provided (metadata nor relations), return 400
        if not fields_to_update and req.ingredients is None and req.steps is None:
            db.close()
            raise HTTPException(status_code=400, detail="Keine Felder zum Aktualisieren angegeben")

        # Execute metadata update (if any)
        if fields_to_update:
            params.append(recipe_id)
            query = f"UPDATE recipes SET {', '.join(fields_to_update)} WHERE id = %s RETURNING *"
            cursor.execute(query, params)
        else:
            cursor.execute("SELECT * FROM recipes WHERE id = %s", (recipe_id,))
        updated_recipe = cursor.fetchone()

        # Replace ingredients if provided
        if req.ingredients is not None:
            cursor.execute("DELETE FROM ingredients WHERE recipe_id = %s", (recipe_id,))
            for ing in req.ingredients:
                cursor.execute(
                    "INSERT INTO ingredients (id, recipe_id, sort_order, name, amount, unit, group_name) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (str(uuid.uuid4()), recipe_id, ing.sort_order, ing.name, ing.amount, ing.unit, ing.group_name),
                )

        # Replace steps if provided
        if req.steps is not None:
            cursor.execute("DELETE FROM steps WHERE recipe_id = %s", (recipe_id,))
            for step in req.steps:
                cursor.execute(
                    "INSERT INTO steps (id, recipe_id, sort_order, text, time_minutes) VALUES (%s, %s, %s, %s, %s)",
                    (str(uuid.uuid4()), recipe_id, step.sort_order, step.text, step.time_minutes),
                )

        db.commit()

        # Fetch full recipe with ingredients and steps
        cursor.execute(
            "SELECT * FROM ingredients WHERE recipe_id = %s ORDER BY sort_order",
            (recipe_id,),
        )
        ingredients = cursor.fetchall()

        cursor.execute(
            "SELECT * FROM steps WHERE recipe_id = %s ORDER BY sort_order",
            (recipe_id,),
        )
        steps = cursor.fetchall()

        db.close()

        logger.info(f"Recipe updated: {recipe_id}")

        return {
            **dict(updated_recipe),
            "ingredients": [dict(i) for i in ingredients],
            "steps": [dict(s) for s in steps],
        }

    except HTTPException:
        raise
    except Exception as e:
        db.close()
        logger.error(f"Recipe update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Recipe Translation Endpoint ─────────────────────────────────────
@app.post("/recipes/{recipe_id}/translate", response_model=TranslationResponse)
async def translate_recipe(recipe_id: str, lang: str):
    """
    Fetch or generate translations for a recipe in target language.
    
    Query param: lang (e.g., "de", "en", "it", "fr")
    
    Logic:
    1. Check translations table for (recipe_id, lang) entry
    2. If found AND is_stale = false: return cached result immediately
    3. If found AND is_stale = true: call LLM to re-translate, update DB, return
    4. If not found: call LLM, insert into translations table, return
    """
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        # 1. Verify recipe exists and get its data
        cursor.execute(
            "SELECT id, title FROM recipes WHERE id = %s",
            (recipe_id,),
        )
        recipe = cursor.fetchone()
        if not recipe:
            db.close()
            raise HTTPException(status_code=404, detail="Rezept nicht gefunden")

        # Get ingredients and steps
        cursor.execute(
            "SELECT id, name FROM ingredients WHERE recipe_id = %s ORDER BY sort_order",
            (recipe_id,),
        )
        ingredients = [{"id": str(i["id"]), "name": i["name"]} for i in cursor.fetchall()]

        cursor.execute(
            "SELECT id, text FROM steps WHERE recipe_id = %s ORDER BY sort_order",
            (recipe_id,),
        )
        steps = [{"id": str(s["id"]), "text": s["text"]} for s in cursor.fetchall()]

        # 2. Check if translation exists
        cursor.execute(
            "SELECT * FROM translations WHERE recipe_id = %s AND lang = %s",
            (recipe_id, lang),
        )
        translation = cursor.fetchone()

        # 3a. If found and NOT stale: return cached
        if translation and not translation.get("is_stale", False):
            db.close()
            logger.info(f"Translation cache hit: {recipe_id} → {lang}")
            return TranslationResponse(
                title=translation["title"],
                ingredients=translation.get("ingredients", []),
                steps=translation.get("steps", []),
            )

        # 3b/4. Call LLM to translate
        logger.info(f"Translating recipe {recipe_id} to {lang}")
        llm_provider = LLMProvider()
        translated_data = llm_provider.translate_recipe(
            title=recipe["title"],
            ingredients=ingredients,
            steps=steps,
            target_lang=lang,
        )

        # Update or insert into translations table
        if translation:
            # Update existing (mark as not stale)
            cursor.execute(
                """
                UPDATE translations
                SET title = %s, ingredients = %s, steps = %s, is_stale = false
                WHERE recipe_id = %s AND lang = %s
                """,
                (
                    translated_data.get("title"),
                    translated_data.get("ingredients", []),
                    translated_data.get("steps", []),
                    recipe_id,
                    lang,
                ),
            )
        else:
            # Insert new
            cursor.execute(
                """
                INSERT INTO translations (recipe_id, lang, title, ingredients, steps, is_stale)
                VALUES (%s, %s, %s, %s, %s, false)
                """,
                (
                    recipe_id,
                    lang,
                    translated_data.get("title"),
                    translated_data.get("ingredients", []),
                    translated_data.get("steps", []),
                ),
            )

        db.commit()
        db.close()

        logger.info(f"Translation completed: {recipe_id} → {lang}")

        return TranslationResponse(
            title=translated_data.get("title"),
            ingredients=translated_data.get("ingredients", []),
            steps=translated_data.get("steps", []),
        )

    except HTTPException:
        raise
    except Exception as e:
        db.close()
        logger.error(f"Translation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Delete Recipe ───────────────────────────────────────────────────
@app.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str):
    """Delete a recipe (ingredients and steps cascade automatically)."""
    logger.info(f"Attempting to delete recipe: {recipe_id}")
    db = None
    try:
        db = get_db()
        cursor = db.cursor()
        logger.info(f"Database connection established for deletion")

        cursor.execute("SELECT id FROM recipes WHERE id = %s", (recipe_id,))
        if not cursor.fetchone():
            logger.info(f"Recipe {recipe_id} not found")
            db.close()
            raise HTTPException(status_code=404, detail="Rezept nicht gefunden")

        logger.info(f"Found recipe {recipe_id}, attempting DELETE")
        cursor.execute("DELETE FROM recipes WHERE id = %s", (recipe_id,))
        db.commit()
        logger.info(f"Successfully committed deletion of recipe {recipe_id}")
        db.close()

        # Remove image directory if it exists (after DB commit)
        # This is separate so a file deletion error doesn't trigger DB rollback issues
        recipe_dir = os.path.join(settings.images_dir, recipe_id)
        try:
            if os.path.exists(recipe_dir):
                logger.info(f"Deleting image directory: {recipe_dir}")
                shutil.rmtree(recipe_dir)
                logger.info(f"Successfully deleted image directory")
        except Exception as e:
            logger.warning(f"Failed to delete recipe images for {recipe_id}: {e}")
            # Don't fail the whole request if image deletion fails

        logger.info(f"Recipe {recipe_id} deletion completed successfully")
        return {"message": "Rezept geloescht"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Recipe delete failed: {type(e).__name__}: {e}", exc_info=True)
        if db:
            try:
                db.rollback()
                db.close()
            except Exception as close_err:
                logger.error(f"Failed to close DB connection: {close_err}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")


# ── Image Upload ─────────────────────────────────────────────────────
@app.post("/recipes/{recipe_id}/image")
async def upload_recipe_image(recipe_id: str, file: UploadFile = File(...)):
    """Upload or replace the cover image for a recipe."""
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute("SELECT id FROM recipes WHERE id = %s", (recipe_id,))
        if not cursor.fetchone():
            db.close()
            raise HTTPException(status_code=404, detail="Rezept nicht gefunden")
        db.close()
        recipe_dir = os.path.join(settings.images_dir, recipe_id)
        os.makedirs(recipe_dir, exist_ok=True)
        image_path = os.path.join(recipe_dir, "cover.jpg")
        with open(image_path, "wb") as out:
            shutil.copyfileobj(file.file, out)
        return {"message": "Bild hochgeladen", "image_url": f"/images/{recipe_id}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Image Serving ───────────────────────────────────────────────────
@app.get("/images/{recipe_id}")
async def get_recipe_image(recipe_id: str):
    """Serve recipe cover image."""
    image_path = os.path.join(settings.images_dir, recipe_id, "cover.jpg")

    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(image_path, media_type="image/jpeg")


@app.get("/images/{recipe_id}/{filename}")
async def get_recipe_step_image(recipe_id: str, filename: str):
    """Serve recipe step image."""
    # Validate filename to prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    image_path = os.path.join(settings.images_dir, recipe_id, filename)

    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(image_path, media_type="image/jpeg")
