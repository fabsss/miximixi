import base64
import json
import logging
import time
from pathlib import Path

import anthropic
import httpx
from openai import OpenAI

from app.config import settings
from app.models import ExtractionResult, ExtractedRecipe

logger = logging.getLogger(__name__)

# ── Prompts ───────────────────────────────────────────────────────────

# Gemini: analysiert Video nativ, gibt Timestamp des besten Frames zurück
GEMINI_PROMPT = """Du bist ein Rezept-Extraktor. Analysiere das Video/Bild und den beigefügten Text und extrahiere ein vollständiges Rezept.

Gib das Ergebnis AUSSCHLIESSLICH als JSON zurück – kein Markdown, keine Erklärungen.

JSON-Format:
{
  "title": "Rezeptname",
  "lang": "de",
  "category": "Pasta|Salat|Suppe|Fleisch|Fisch|Dessert|Frühstück|Snack|Sonstiges",
  "servings": 2,
  "prep_time": "10 min",
  "cook_time": "20 min",
  "tags": ["vegetarisch", "schnell"],
  "ingredients": [
    {"id": 1, "name": "Zutat", "amount": 200, "unit": "g", "group_name": "Für den Teig"}
  ],
  "steps": [
    {"id": 1, "text": "Schritt mit {1} Referenz falls Zutat relevant.", "time_minutes": 5}
  ],
  "cover_timestamp": "MM:SS"
}

Wichtig:
- "lang" = ISO-Sprachcode der Originalsprache (de/en/it/fr/es/etc.)
- Zutaten-Referenzen in Steps als {ingredient_id} (z.B. {1})
- "time_minutes" nur setzen wenn eine Zeitangabe im Schritt vorkommt
- Mengen als Zahlen, nicht als Text ("200" statt "zweihundert")
- "group_name" = Gruppe der Zutat falls das Rezept Abschnitte hat (z.B. "Für das Soja-Hack", "Dressing", "Toppings"). NULL wenn keine Gruppen vorhanden.
- "cover_timestamp" = Timestamp im Format "MM:SS" des Moments, in dem das fertige Gericht am appetitlichsten zu sehen ist. NULL wenn kein geeigneter Moment vorhanden.
- Falls kein Rezept erkennbar: {"error": "Kein Rezept gefunden"}
"""

# Andere Provider (Ollama, Claude, OpenAI): bekommen vorextrahierte Frames
FRAMES_PROMPT = """Du bist ein Rezept-Extraktor. Analysiere die Bilder und den beigefügten Text und extrahiere ein vollständiges Rezept.

Gib das Ergebnis AUSSCHLIESSLICH als JSON zurück – kein Markdown, keine Erklärungen.

JSON-Format:
{
  "title": "Rezeptname",
  "lang": "de",
  "category": "Pasta|Salat|Suppe|Fleisch|Fisch|Dessert|Frühstück|Snack|Sonstiges",
  "servings": 2,
  "prep_time": "10 min",
  "cook_time": "20 min",
  "tags": ["vegetarisch", "schnell"],
  "ingredients": [
    {"id": 1, "name": "Zutat", "amount": 200, "unit": "g", "group_name": "Für den Teig"}
  ],
  "steps": [
    {"id": 1, "text": "Schritt mit {1} Referenz falls Zutat relevant.", "time_minutes": 5}
  ],
  "cover_frame_index": 2
}

Wichtig:
- "lang" = ISO-Sprachcode der Originalsprache (de/en/it/fr/es/etc.)
- Zutaten-Referenzen in Steps als {ingredient_id} (z.B. {1})
- "time_minutes" nur setzen wenn eine Zeitangabe im Schritt vorkommt
- Mengen als Zahlen, nicht als Text ("200" statt "zweihundert")
- "group_name" = Gruppe der Zutat falls das Rezept Abschnitte hat (z.B. "Für das Soja-Hack", "Dressing", "Toppings"). NULL wenn keine Gruppen vorhanden.
- "cover_frame_index" = Index (0-basiert) des Bildes, das das fertige Gericht am appetitlichsten zeigt. NULL wenn kein geeignetes Bild vorhanden.
- Falls kein Rezept erkennbar: {"error": "Kein Rezept gefunden"}
"""


def _image_to_base64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")


def _fix_encoding(obj):
    """Repariert double-encoded UTF-8 Strings (Latin-1 mis-decoded als Unicode)."""
    if isinstance(obj, str):
        try:
            return obj.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return obj
    if isinstance(obj, list):
        return [_fix_encoding(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _fix_encoding(v) for k, v in obj.items()}
    return obj


def _parse_llm_response(text: str, is_gemini: bool = False) -> ExtractionResult:
    """JSON aus LLM-Antwort parsen und in ExtractionResult umwandeln."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    data = json.loads(text.strip())
    data = _fix_encoding(data)
    if "error" in data:
        raise ValueError(data["error"])

    cover_timestamp = data.pop("cover_timestamp", None)
    cover_frame_index = data.pop("cover_frame_index", None)

    recipe = ExtractedRecipe(**data)
    return ExtractionResult(
        recipe=recipe,
        cover_timestamp=cover_timestamp if is_gemini else None,
        cover_frame_index=cover_frame_index if not is_gemini else None,
    )


def _detect_media_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    video_exts = {".mp4", ".mov", ".avi", ".webm", ".mkv"}
    return "video" if ext in video_exts else "image"


class LLMProvider:
    def extract_recipe(
        self,
        media_paths: list[str],
        caption: str = "",
    ) -> ExtractionResult:
        """
        Extrahiert Rezept + Foto-Hint aus Medien + Caption.

        Gemini:       Video nativ → 1 API-Call → Rezept + cover_timestamp
        Alle anderen: Bild-Frames → LLM → Rezept + cover_frame_index
        """
        logger.info(f"Extracting recipe: provider={settings.llm_provider}, media={len(media_paths)}")

        match settings.llm_provider:
            case "gemini":
                return self._gemini_extract(media_paths, caption)
            case "claude":
                return self._claude_extract(media_paths, caption)
            case "openai":
                return self._openai_extract(media_paths, caption)
            case "openai_compat":
                return self._openai_compat_extract(media_paths, caption)
            case _:
                return self._ollama_extract(media_paths, caption)

    # ── Gemini (native Video + 1 API-Call für Rezept + Timestamp) ────────
    def _gemini_extract(self, media_paths: list[str], caption: str) -> ExtractionResult:
        """
        Gemini verarbeitet Videos nativ und gibt zusätzlich cover_timestamp zurück.
        Caption wird als Kontext übergeben – Gemini kombiniert beides.
        """
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)

        parts = []

        for path in media_paths[:3]:  # Max 3 Medien
            media_type = _detect_media_type(path)

            if media_type == "video":
                logger.info(f"Gemini: Lade Video hoch: {path}")
                video_file = genai.upload_file(path=path)

                while video_file.state.name == "PROCESSING":
                    time.sleep(2)
                    video_file = genai.get_file(video_file.name)

                if video_file.state.name == "FAILED":
                    logger.warning(f"Gemini File Upload fehlgeschlagen: {path}")
                    continue

                parts.append(video_file)
                logger.info(f"Gemini: Video bereit: {video_file.uri}")

            else:
                file_size = Path(path).stat().st_size
                if file_size > 10 * 1024 * 1024:  # >10MB → Files API
                    img_file = genai.upload_file(path=path)
                    parts.append(img_file)
                else:
                    import PIL.Image
                    img = PIL.Image.open(path)
                    parts.append(img)

        if caption:
            parts.append(f"Caption / Beschreibung:\n{caption}")

        parts.append(GEMINI_PROMPT)

        response = model.generate_content(parts)
        return _parse_llm_response(response.text, is_gemini=True)

    # ── Claude ────────────────────────────────────────────────────────────
    def _claude_extract(self, image_paths: list[str], caption: str) -> ExtractionResult:
        client = anthropic.Anthropic(api_key=settings.claude_api_key)

        content: list = []
        for path in image_paths[:5]:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": _image_to_base64(path),
                },
            })

        if caption:
            content.append({"type": "text", "text": f"Caption / Beschreibung:\n{caption}"})
        content.append({"type": "text", "text": FRAMES_PROMPT})

        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=2048,
            messages=[{"role": "user", "content": content}],
        )
        return _parse_llm_response(response.content[0].text)

    # ── OpenAI ────────────────────────────────────────────────────────────
    def _openai_extract(self, image_paths: list[str], caption: str) -> ExtractionResult:
        client = OpenAI(api_key=settings.openai_api_key)
        return self._openai_compatible_call(client, settings.openai_model, image_paths, caption)

    def _openai_compat_extract(self, image_paths: list[str], caption: str) -> ExtractionResult:
        client = OpenAI(
            api_key=settings.openai_compat_api_key,
            base_url=settings.openai_compat_base_url,
        )
        return self._openai_compatible_call(client, settings.openai_compat_model, image_paths, caption)

    def _openai_compatible_call(
        self, client: OpenAI, model: str, image_paths: list[str], caption: str
    ) -> ExtractionResult:
        content: list = []
        for path in image_paths[:5]:
            b64 = _image_to_base64(path)
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
            })
        if caption:
            content.append({"type": "text", "text": f"Caption / Beschreibung:\n{caption}"})
        content.append({"type": "text", "text": FRAMES_PROMPT})

        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content}],
            max_tokens=2048,
        )
        return _parse_llm_response(response.choices[0].message.content)

    # ── Ollama ────────────────────────────────────────────────────────────
    def _ollama_extract(self, image_paths: list[str], caption: str) -> ExtractionResult:
        images_b64 = [_image_to_base64(p) for p in image_paths[:5]]

        prompt = FRAMES_PROMPT
        if caption:
            prompt = f"Caption / Beschreibung:\n{caption}\n\n{FRAMES_PROMPT}"

        payload = {
            "model": settings.ollama_model,
            "prompt": prompt,
            "images": images_b64,
            "stream": False,
            "format": "json",
        }

        response = httpx.post(
            f"{settings.ollama_base_url}/api/generate",
            json=payload,
            timeout=300.0,
        )
        response.raise_for_status()
        return _parse_llm_response(response.json()["response"])
