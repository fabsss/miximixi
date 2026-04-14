import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager

import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import settings
from app.models import ImportRequest, ImportResponse
from app.queue_worker import run_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Temp-Verzeichnis anlegen
    os.makedirs(settings.tmp_dir, exist_ok=True)
    os.makedirs(settings.images_dir, exist_ok=True)

    # Queue-Worker als Background-Task starten
    worker_task = asyncio.create_task(run_worker(poll_interval=5))
    logger.info("Queue-Worker gestartet")

    yield

    # Beim Herunterfahren
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


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


# ── Import Endpoints ─────────────────────────────────────────────────
@app.post("/import", response_model=ImportResponse)
async def create_import(req: ImportRequest):
    """URL in die Import-Queue legen."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        # Duplikat-Check
        cursor.execute(
            "SELECT id, status FROM import_queue WHERE source_url = %s AND status IN (%s, %s, %s)",
            (req.url, "pending", "processing", "done"),
        )
        existing = cursor.fetchone()

        if existing:
            db.close()
            return ImportResponse(
                queue_id=existing["id"],
                status=existing["status"],
                message=f"URL bereits in Queue (status: {existing['status']})",
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
async def list_recipes(limit: int = 50):
    """Alle Rezepte auflisten."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        cursor.execute(
            """
            SELECT id, title, category, image_filename, source_url, source_label, rating, created_at
            FROM recipes ORDER BY created_at DESC LIMIT %s
            """,
            (limit,),
        )
        recipes = cursor.fetchall()
        db.close()
        return [dict(r) for r in recipes]

    except Exception as e:
        db.close()
        logger.error(f"Recipes list failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str):
    """Rezept mit Zutaten und Schritten abrufen."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
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
            "ingredients": [dict(i) for i in ingredients],
            "steps": [dict(s) for s in steps],
        }

    except HTTPException:
        raise
    except Exception as e:
        db.close()
        logger.error(f"Recipe lookup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Image Serving ───────────────────────────────────────────────────
@app.get("/images/{recipe_id}")
async def get_recipe_image(recipe_id: str):
    """Serve recipe cover image."""
    image_path = os.path.join(settings.images_dir, f"{recipe_id}.jpg")

    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(image_path, media_type="image/jpeg")
