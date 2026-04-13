"""
Medien-Verarbeitung für den Import-Pipeline.

Download-Pfade je nach source_type:
  instagram / youtube → yt-dlp (Video + Beschreibung)
  web                 → Playwright (Screenshot + HTML-Text)

LLM-Verarbeitungs-Pfade:
  Gemini      → Videos direkt weitergereichen (native Video-Analyse)
  Alle anderen → ffmpeg Keyframes → LLM bekommt Einzel-Frames
"""
import json
import logging
import os
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".webm", ".mkv"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def is_video(path: str) -> bool:
    return Path(path).suffix.lower() in VIDEO_EXTS


@dataclass
class DownloadResult:
    media_paths: list[str] = field(default_factory=list)
    description: str = ""  # Caption / YouTube-Beschreibung / bereinigter HTML-Text


# ── yt-dlp: Instagram + YouTube ──────────────────────────────────────

async def download_media(url: str, output_dir: str) -> DownloadResult:
    """
    Lädt Medien via yt-dlp herunter (Instagram, YouTube, öffentliche Posts).
    Extrahiert zusätzlich die Beschreibung/Caption als raw_source_text.
    """
    import asyncio

    os.makedirs(output_dir, exist_ok=True)
    output_template = os.path.join(output_dir, "%(id)s.%(ext)s")

    # Cookie-Auth: cookies.txt falls vorhanden, sonst kein Auth
    cookie_args = []
    if os.path.exists(settings.instagram_cookies_file):
        cookie_args = ["--cookies", settings.instagram_cookies_file]
        logger.info(f"yt-dlp: Verwende Cookies aus {settings.instagram_cookies_file}")

    # Schritt 1: Beschreibung via --print holen (kein separater Download)
    description = ""
    try:
        def _get_description():
            return subprocess.run(
                ["yt-dlp", "--no-playlist", "--no-warnings"] + cookie_args +
                ["--print", "%(description)s", url],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
            )
        desc_result = await asyncio.wait_for(asyncio.to_thread(_get_description), timeout=35)
        description = desc_result.stdout.strip()
    except Exception as e:
        logger.warning(f"yt-dlp Beschreibung fehlgeschlagen: {e}")

    # Schritt 2: Medien herunterladen
    def _download():
        return subprocess.run(
            ["yt-dlp", "--no-playlist", "--no-warnings"] + cookie_args +
            ["-o", output_template, url],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
        )
    try:
        result = await asyncio.wait_for(asyncio.to_thread(_download), timeout=130)
    except Exception as e:
        logger.error(f"yt-dlp Fehler ({url}): {e}")
        return DownloadResult(description=description)

    if result.returncode != 0:
        logger.error(f"yt-dlp Fehler ({url}): {result.stderr[:500]}")
        return DownloadResult(description=description)

    media_paths = [
        str(f) for f in Path(output_dir).iterdir()
        if f.suffix.lower() in VIDEO_EXTS | IMAGE_EXTS
    ]
    logger.info(f"yt-dlp: {len(media_paths)} Datei(en) heruntergeladen")
    return DownloadResult(media_paths=media_paths, description=description)


# ── Playwright: Website-Import ────────────────────────────────────────

async def download_website(url: str, output_dir: str) -> DownloadResult:
    """
    Lädt eine Website via Playwright herunter:
    - Screenshot als PNG (für LLM-Analyse)
    - Bereinigter Seitentext als raw_source_text
    """
    from playwright.async_api import async_playwright
    from bs4 import BeautifulSoup

    os.makedirs(output_dir, exist_ok=True)
    screenshot_path = os.path.join(output_dir, "screenshot.png")
    description = ""

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 900})

            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            # Kurz warten für lazy-loaded Inhalte
            await page.wait_for_timeout(2000)

            # Screenshot der gesamten Seite
            await page.screenshot(path=screenshot_path, full_page=True)
            logger.info(f"Playwright Screenshot: {screenshot_path}")

            # HTML-Text bereinigen via BeautifulSoup
            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")
            # Nicht relevante Tags entfernen
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()
            raw_text = soup.get_text(separator="\n", strip=True)
            # Mehrfache Leerzeilen reduzieren
            description = re.sub(r"\n{3,}", "\n\n", raw_text).strip()[:8000]

            await browser.close()

    except Exception as e:
        logger.error(f"Playwright Fehler ({url}): {e}")
        return DownloadResult(description=description)

    media_paths = [screenshot_path] if os.path.exists(screenshot_path) else []
    return DownloadResult(media_paths=media_paths, description=description)


# ── Gemini-Pfad: Videos direkt, Bilder direkt ────────────────────────

def prepare_media_for_gemini(media_paths: list[str]) -> list[str]:
    """
    Für Gemini: Videos und Bilder werden unverändert weitergegeben.
    Gemini verarbeitet Videos nativ – kein Frame-Splitting nötig.
    """
    supported = [p for p in media_paths if Path(p).suffix.lower() in VIDEO_EXTS | IMAGE_EXTS]
    logger.info(f"Gemini-Pfad: {len(supported)} Medien direkt übergeben")
    return supported[:3]  # Max 3 Dateien (Gemini-Limit)


# ── Standard-Pfad: ffmpeg Frame-Extraktion ────────────────────────────

def extract_keyframes(video_path: str, output_dir: str, num_frames: int = 5) -> list[str]:
    """Extrahiert N gleichmäßig verteilte Frames aus einem Video via ffmpeg."""
    os.makedirs(output_dir, exist_ok=True)
    output_pattern = os.path.join(output_dir, "frame_%03d.jpg")

    # Video-Länge ermitteln
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", video_path],
        capture_output=True, text=True, check=True,
    )
    duration = float(json.loads(probe.stdout)["streams"][0].get("duration", 10))

    fps_val = num_frames / max(duration, 1)
    subprocess.run(
        [
            "ffmpeg", "-i", video_path,
            "-vf", f"fps={fps_val:.4f}",
            "-vframes", str(num_frames),
            "-q:v", "2",
            output_pattern,
            "-y",
        ],
        capture_output=True, check=True,
    )

    frames = sorted(Path(output_dir).glob("frame_*.jpg"))
    logger.info(f"ffmpeg: {len(frames)} Frames aus {video_path}")
    return [str(f) for f in frames]


def prepare_media_for_frames(media_paths: list[str], tmp_dir: str) -> list[str]:
    """
    Standard-Pfad (Ollama, Claude, OpenAI):
    Videos → ffmpeg Keyframes extrahieren.
    Bilder → direkt verwenden.
    """
    image_paths = []

    for path in media_paths:
        ext = Path(path).suffix.lower()
        if ext in VIDEO_EXTS:
            frames_dir = os.path.join(tmp_dir, f"frames_{Path(path).stem}")
            try:
                frames = extract_keyframes(path, frames_dir, num_frames=5)
                image_paths.extend(frames)
            except Exception as e:
                logger.error(f"ffmpeg-Fehler bei {path}: {e}")
        elif ext in IMAGE_EXTS:
            image_paths.append(path)
        else:
            logger.warning(f"Unbekanntes Format übersprungen: {path}")

    return image_paths


# ── Titelbild-Extraktion ──────────────────────────────────────────────

def extract_frame_at_timestamp(video_path: str, timestamp: str, output_dir: str) -> str | None:
    """
    Extrahiert einen einzelnen Frame bei einem bestimmten Timestamp (MM:SS).
    Wird für den Gemini-Pfad verwendet: Gemini liefert den besten Timestamp.
    """
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "cover.jpg")
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-ss", timestamp,
                "-i", video_path,
                "-vframes", "1",
                "-q:v", "2",
                output_path,
                "-y",
            ],
            capture_output=True, check=True,
        )
        return output_path if os.path.exists(output_path) else None
    except Exception as e:
        logger.error(f"Frame-Extraktion bei {timestamp} fehlgeschlagen: {e}")
        return None


def extract_cover_frame(media_paths: list[str], output_dir: str) -> str | None:
    """
    Fallback: Extrahiert einen mittleren Frame aus dem ersten Video.
    Wird verwendet wenn kein Timestamp/Frame-Index vom LLM geliefert wurde.
    """
    for path in media_paths:
        if not is_video(path):
            continue
        try:
            cover_dir = os.path.join(output_dir, "cover")
            frames = extract_keyframes(path, cover_dir, num_frames=3)
            if frames:
                return frames[len(frames) // 2]  # Mittlerer Frame
        except Exception as e:
            logger.error(f"Cover-Extraktion fehlgeschlagen: {e}")

    # Fallback: erstes Bild verwenden
    for path in media_paths:
        if Path(path).suffix.lower() in IMAGE_EXTS:
            return path

    return None


# ── Supabase Storage Upload ───────────────────────────────────────────

def upload_cover_to_storage(file_path: str, recipe_id: str) -> str:
    """Lädt Titelbild in Supabase Storage hoch und gibt die öffentliche URL zurück."""
    bucket = "recipe-images"
    storage_path = f"{recipe_id}.jpg"
    url = f"{settings.supabase_url}/storage/v1/object/{bucket}/{storage_path}"

    with open(file_path, "rb") as f:
        response = httpx.put(
            url,
            content=f.read(),
            headers={
                "Authorization": f"Bearer {settings.supabase_service_key}",
                "Content-Type": "image/jpeg",
                "x-upsert": "true",
            },
            timeout=60.0,
        )
        response.raise_for_status()

    public_url = f"{settings.supabase_url}/storage/v1/object/public/{bucket}/{storage_path}"
    logger.info(f"Cover hochgeladen: {public_url}")
    return public_url
