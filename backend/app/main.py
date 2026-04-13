import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client

from app.config import settings
from app.models import ImportRequest, ImportResponse
from app.queue_worker import run_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Temp-Verzeichnis anlegen
    os.makedirs(settings.tmp_dir, exist_ok=True)

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


def get_supabase():
    return create_client(settings.supabase_url, settings.supabase_service_key)


# ── Healthcheck ──────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "llm_provider": settings.llm_provider}


# ── Import Endpoints ─────────────────────────────────────────────────
@app.post("/import", response_model=ImportResponse)
async def create_import(req: ImportRequest):
    """
    URL in die Import-Queue legen.
    Wird von n8n aufgerufen (Telegram-Bot oder Instagram-Poller).
    """
    supabase = get_supabase()

    # Duplikat-Check
    existing = supabase.table("import_queue") \
        .select("id, status") \
        .eq("source_url", req.url) \
        .in_("status", ["pending", "processing", "done"]) \
        .execute()

    if existing.data:
        existing_job = existing.data[0]
        return ImportResponse(
            queue_id=existing_job["id"],
            status=existing_job["status"],
            message=f"URL bereits in Queue (status: {existing_job['status']})",
        )

    queue_id = str(uuid.uuid4())
    supabase.table("import_queue").insert({
        "id": queue_id,
        "source_url": req.url,
        "source_type": req.source_type,
        "status": "pending",
        # Extra-Felder für Worker (werden im Supabase JSONB-Feld gespeichert)
        # Hinweis: Falls media_paths und caption übergeben werden, speichern wir
        # sie in einer separaten Tabelle oder als Notiz – für jetzt reicht die URL.
    }).execute()

    logger.info(f"Import-Job erstellt: {queue_id} für {req.url}")

    return ImportResponse(
        queue_id=queue_id,
        status="pending",
        message="✅ Rezept wird verarbeitet…",
    )


@app.get("/import/{queue_id}")
async def get_import_status(queue_id: str):
    """Status eines Import-Jobs abfragen."""
    supabase = get_supabase()
    result = supabase.table("import_queue").select("*").eq("id", queue_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")

    job = result.data[0]
    response = {"queue_id": queue_id, "status": job["status"]}

    if job.get("recipe_id"):
        response["recipe_id"] = job["recipe_id"]
    if job.get("error_msg"):
        response["error"] = job["error_msg"]

    return response


@app.get("/import")
async def list_imports(limit: int = 20):
    """Letzte Import-Jobs auflisten (für Verifikations-Seite)."""
    supabase = get_supabase()
    result = supabase.table("import_queue") \
        .select("*") \
        .order("created_at", desc=True) \
        .limit(limit) \
        .execute()
    return result.data


# ── Instagram Sync Endpoint ─────────────────────────────────────────
@app.post("/instagram/sync")
async def instagram_sync():
    """
    Wird von n8n (Schedule, alle 15 Min) aufgerufen.
    Holt neue Items aus der Instagram Collection und legt sie in die Queue.
    """
    from app.instagram_service import get_collection_media_urls

    try:
        items = get_collection_media_urls(limit=20)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Instagram-Fehler: {e}")

    supabase = get_supabase()
    queued = 0

    for item in items:
        # Duplikat-Check
        existing = supabase.table("import_queue") \
            .select("id") \
            .eq("source_url", item["url"]) \
            .execute()

        if existing.data:
            continue

        supabase.table("import_queue").insert({
            "id": str(uuid.uuid4()),
            "source_url": item["url"],
            "source_type": "instagram",
            "status": "pending",
        }).execute()
        queued += 1

    logger.info(f"Instagram Sync: {queued} neue Jobs erstellt")
    return {"queued": queued, "total_checked": len(items)}


# ── Recipes Endpoint (für Verifikations-Seite) ───────────────────────
@app.get("/recipes")
async def list_recipes(limit: int = 50):
    supabase = get_supabase()
    result = supabase.table("recipes") \
        .select("id, title, category, image_url, source_url, source_label, rating, created_at") \
        .order("created_at", desc=True) \
        .limit(limit) \
        .execute()
    return result.data


@app.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str):
    supabase = get_supabase()

    recipe = supabase.table("recipes").select("*").eq("id", recipe_id).execute()
    if not recipe.data:
        raise HTTPException(status_code=404, detail="Rezept nicht gefunden")

    ingredients = supabase.table("ingredients") \
        .select("*").eq("recipe_id", recipe_id).order("sort_order").execute()

    steps = supabase.table("steps") \
        .select("*").eq("recipe_id", recipe_id).order("sort_order").execute()

    return {
        **recipe.data[0],
        "ingredients": ingredients.data,
        "steps": steps.data,
    }
