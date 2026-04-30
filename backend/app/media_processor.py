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
from urllib.parse import urljoin

import httpx
import requests
from bs4 import BeautifulSoup

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
    thumbnail_path: str | None = None  # Vom Anbieter gesetztes Thumbnail (z.B. Instagram Cover)


# ── yt-dlp: Instagram + YouTube ──────────────────────────────────────

async def download_media(url: str, output_dir: str) -> DownloadResult:
    """
    Lädt Medien via yt-dlp herunter (Instagram, YouTube, öffentliche Posts).
    Extrahiert zusätzlich die Beschreibung/Caption als raw_source_text.

    Fehlerbehandlung:
    - 404 / "not available" / "Seite nicht gefunden" → Link nicht gefunden
    - Cookie / Auth / "login" / "unauthorized" → Authentication-Fehler
    - Andere Fehler → Generischer Download-Fehler
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

    # Schritt 2: Medien + Thumbnail herunterladen
    def _download():
        return subprocess.run(
            ["yt-dlp", "--no-playlist", "--no-warnings"] + cookie_args +
            ["--write-thumbnail", "--convert-thumbnails", "jpg",
             "-o", output_template, url],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
        )
    try:
        result = await asyncio.wait_for(asyncio.to_thread(_download), timeout=130)
    except Exception as e:
        logger.error(f"yt-dlp Timeout ({url}): {e}")
        return DownloadResult(description=description)

    if result.returncode != 0:
        stderr = result.stderr.lower()

        # Klassifiziere Fehler
        if any(x in stderr for x in ["404", "not available", "not found", "does not exist", "removed"]):
            logger.error(f"yt-dlp Fehler: Link nicht gefunden ({url})")
            raise ValueError(f"Link nicht gefunden (404). URL existiert nicht oder wurde gelöscht: {url}")

        elif any(x in stderr for x in ["cookie", "unauthorized", "403", "access denied", "login required", "private", "authentication failed", "session expired"]):
            logger.error(f"yt-dlp Fehler: Authentifizierung fehlgeschlagen ({url})")
            raise ValueError(f"Authentifizierung fehlgeschlagen. Cookie könnte abgelaufen sein. Bitte den Admin kontaktieren und neue Cookies exportieren.")

        else:
            logger.error(f"yt-dlp Fehler ({url}): {result.stderr[:500]}")
            return DownloadResult(description=description)

    all_files = list(Path(output_dir).iterdir())
    media_paths = [str(f) for f in all_files if f.suffix.lower() in VIDEO_EXTS | IMAGE_EXTS]

    # Thumbnail: yt-dlp schreibt es als <id>.jpg neben das Video
    # Erkenne es als Bild-Datei, die nicht im VIDEO_EXTS ist und keinen Video-Partner hat
    video_stems = {Path(p).stem for p in media_paths if Path(p).suffix.lower() in VIDEO_EXTS}
    thumbnail_path = next(
        (str(f) for f in all_files
         if f.suffix.lower() in {".jpg", ".jpeg", ".webp", ".png"}
         and f.stem in video_stems),
        None,
    )
    if thumbnail_path:
        logger.info(f"yt-dlp: Thumbnail gefunden: {thumbnail_path}")
        # Thumbnail nicht in media_paths – wird separat als Cover genutzt
        media_paths = [p for p in media_paths if p != thumbnail_path]

    logger.info(f"yt-dlp: {len(media_paths)} Datei(en) heruntergeladen")
    return DownloadResult(media_paths=media_paths, description=description, thumbnail_path=thumbnail_path)


# ── Website-Import: HTML-Parsing für Rezept-Extraktion ──────────────────

def _find_og_image(soup) -> str | None:
    """Findet og:image oder twitter:image Meta-Tag."""
    for prop in ["og:image", "twitter:image"]:
        tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        if tag and tag.get("content"):
            return tag["content"]
    return None


def _find_schema_image(soup) -> str | None:
    """Findet Bild aus schema.org Recipe JSON-LD oder itemprop."""
    # JSON-LD
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            if not script.string:
                continue
            data = json.loads(script.string)
            # Handle list of schemas
            if isinstance(data, list):
                data = next((d for d in data if d.get("@type") == "Recipe"), {})
            # Extract image from Recipe
            if data.get("@type") == "Recipe":
                img = data.get("image")
                if isinstance(img, list) and img:
                    img = img[0]
                if isinstance(img, dict):
                    img = img.get("url")
                if img:
                    return img
        except Exception as e:
            logger.debug(f"Schema.org JSON-LD Parsing fehlgeschlagen: {e}")

    # itemprop attribute fallback
    tag = soup.find(itemprop="image")
    if tag:
        return tag.get("src") or tag.get("content")

    return None


def _find_largest_img(soup, base_url: str) -> str | None:
    """Fallback: Findet das größte Bild auf der Seite (wahrscheinlich Rezept-Foto)."""
    imgs = soup.find_all("img", src=True)

    # Bevorzuge Bilder mit großer width (wahrscheinlich Hero-Image)
    for img in imgs:
        src = img.get("src", "")
        width = int(img.get("width", 0) or 0)
        alt = img.get("alt", "").lower()
        # Skip obvious icons/logos
        if width >= 400 and not any(x in alt for x in ["logo", "icon", "avatar"]):
            return urljoin(base_url, src)

    # Fallback: erstes aussagekräftiges Bild
    for img in imgs:
        src = img.get("src", "")
        if not any(x in src for x in ["logo", "icon", "avatar", "sprite", "pixel"]):
            return urljoin(base_url, src)

    return None


def _download_image(url: str, output_dir: str) -> str | None:
    """Lädt Bild herunter und speichert lokal. Gibt lokalen Pfad zurück."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; Miximixi/1.0)"}
        resp = requests.get(url, headers=headers, timeout=15, stream=True)
        resp.raise_for_status()

        # Dateiendung aus URL
        ext = Path(url.split("?")[0]).suffix.lower() or ".jpg"
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            ext = ".jpg"

        out_path = str(Path(output_dir) / f"recipe_image{ext}")
        with open(out_path, "wb") as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)

        logger.info(f"Rezept-Bild heruntergeladen: {out_path}")
        return out_path
    except Exception as e:
        logger.warning(f"Bild-Download fehlgeschlagen ({url}): {e}")
        return None


async def download_website(url: str, output_dir: str) -> DownloadResult:
    """
    Lädt eine Website herunter:
    - Extrahiert Rezept-Bild (og:image → schema.org → größtes Bild)
    - Bereinigter Seitentext als raw_source_text
    """
    import asyncio

    os.makedirs(output_dir, exist_ok=True)
    description = ""

    def _fetch_and_parse():
        headers = {"User-Agent": "Mozilla/5.0 (compatible; Miximixi/1.0)"}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")

        # ── Text-Inhalt bereinigen ──────────────────────────
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        text = "\n".join(line for line in text.splitlines() if line.strip())
        text = text[:8000]  # Max 8000 Zeichen

        # ── Rezept-Bild extrahieren ────────────────────────
        image_url = (
            _find_og_image(soup) or
            _find_schema_image(soup) or
            _find_largest_img(soup, url)
        )

        return text, image_url

    try:
        description, image_url = await asyncio.to_thread(_fetch_and_parse)
    except Exception as e:
        logger.error(f"Website-Fehler ({url}): {e}")
        return DownloadResult(description=description)

    # ── Bild herunterladen ──────────────────────────────────
    media_paths = []
    if image_url:
        img_path = await asyncio.to_thread(_download_image, image_url, output_dir)
        if img_path:
            media_paths.append(img_path)

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


# ── Timestamp-Parsing mit Frame-Genauigkeit ───────────────────────────

def get_video_fps(video_path: str) -> float:
    """Liest die FPS aus den Video-Metadaten via ffprobe."""
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", video_path],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(probe.stdout)
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                fps_str = stream.get("r_frame_rate", "30/1")
                num, den = fps_str.split("/")
                fps = float(num) / max(float(den), 1)
                return fps if fps > 0 else 30.0
    except Exception as e:
        logger.warning(f"FPS-Erkennung fehlgeschlagen ({video_path}): {e}")
    return 30.0


def timestamp_to_seek(timestamp: str, fps: float = 30.0) -> str:
    """
    Konvertiert einen Timestamp in einen ffmpeg-kompatiblen Seek-String.

    Unterstützte Formate:
      "MM:SS"     → unverändert weitergegeben
      "MM:SS:FF"  → Frame FF wird in Dezimalsekunden umgerechnet (FF/fps)
    """
    parts = timestamp.strip().split(":")
    if len(parts) == 3:
        try:
            mm, ss, ff = int(parts[0]), int(parts[1]), int(parts[2])
            total_seconds = mm * 60 + ss + ff / fps
            return f"{total_seconds:.3f}"
        except ValueError:
            logger.warning(f"Ungültiges Timestamp-Format: {timestamp}")
    return timestamp


# ── Titelbild-Extraktion ──────────────────────────────────────────────

def extract_cover_frame_at_timestamp(video_path: str, timestamp: str, output_dir: str) -> str | None:
    """
    Extrahiert einen einzelnen Cover-Frame bei einem bestimmten Timestamp.
    Unterstützt "MM:SS" und "MM:SS:FF" (Frame-genaue Angabe).
    Wird für den Gemini-Pfad verwendet: Gemini liefert den besten Timestamp.
    """
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "cover.jpg")
    try:
        fps = get_video_fps(video_path)
        seek = timestamp_to_seek(timestamp, fps)
        logger.info(f"Cover-Frame bei Timestamp {timestamp!r} (seek={seek}s, fps={fps:.2f})")
        subprocess.run(
            [
                "ffmpeg",
                "-ss", seek,
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
    Fallback: Extrahiert einen Frame nahe dem Ende des Videos.
    Wird verwendet wenn kein Timestamp/Frame-Index vom LLM geliefert wurde.
    """
    for path in media_paths:
        if not is_video(path):
            continue
        try:
            cover_dir = os.path.join(output_dir, "cover")
            frames = extract_keyframes(path, cover_dir, num_frames=3)
            if frames:
                return frames[-1]  # Letzter Frame (nahe dem Ende)
        except Exception as e:
            logger.error(f"Cover-Extraktion fehlgeschlagen: {e}")

    # Fallback: erstes Bild verwenden
    for path in media_paths:
        if Path(path).suffix.lower() in IMAGE_EXTS:
            return path

    return None


# ── Supabase Storage Upload ───────────────────────────────────────────

def save_cover_to_storage(file_path: str, recipe_id: str) -> str:
    """Speichert Titelbild lokal und gibt den Dateinamen zurück."""
    import shutil

    recipe_dir = os.path.join(settings.images_dir, recipe_id)
    os.makedirs(recipe_dir, exist_ok=True)

    image_filename = "cover.jpg"
    destination = os.path.join(recipe_dir, image_filename)

    shutil.copy2(file_path, destination)
    logger.info(f"Cover gespeichert: {destination}")

    return image_filename


# ── Step Frame Extraction ────────────────────────────────────────────────

def extract_frame_at_timestamp(video_path: str, timestamp: str, recipe_id: str, step_id: int) -> str | None:
    """
    Extrahiert einen Frame aus dem Video an einem bestimmten Timestamp.

    Args:
        video_path: Pfad zur Videodatei
        timestamp: Format "MM:SS" oder "MM:SS:FF" (Frame-genaue Angabe)
        recipe_id: ID des Rezepts
        step_id: ID des Schritts

    Returns:
        Dateiname des gespeicherten Frames oder None bei Fehler
    """
    if not is_video(video_path):
        logger.warning(f"extract_frame_at_timestamp: {video_path} ist kein Video")
        return None

    try:
        recipe_dir = os.path.join(settings.images_dir, recipe_id)
        os.makedirs(recipe_dir, exist_ok=True)

        frame_filename = f"step-{step_id}-frame.jpg"
        output_path = os.path.join(recipe_dir, frame_filename)

        fps = get_video_fps(video_path)
        seek = timestamp_to_seek(timestamp, fps)
        logger.info(f"Step {step_id} Frame bei Timestamp {timestamp!r} (seek={seek}s, fps={fps:.2f})")

        cmd = [
            "ffmpeg",
            "-ss", seek,
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            "-y",
            output_path,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode != 0:
            logger.error(f"ffmpeg frame extraction fehlgeschlagen: {result.stderr}")
            return None

        logger.info(f"Frame extrahiert: {output_path}")
        return frame_filename

    except subprocess.TimeoutExpired:
        logger.error(f"ffmpeg timeout bei {video_path}, timestamp {timestamp}")
        return None
    except Exception as e:
        logger.error(f"Frame-Extraktion fehlgeschlagen: {e}")
        return None
