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
GEMINI_PROMPT = """Du bist ein Rezept-Extraktor. Analysiere das Video/Bild, Audio und den beigefügten Text und extrahiere ein vollständiges Rezept.

Gib das Ergebnis AUSSCHLIESSLICH als JSON zurück – kein Markdown, keine Erklärungen.

JSON-Format:
{
  "title": "Rezeptname",
  "lang": "de",
  "category": "Vorspeisen|Hauptspeisen|Desserts|Brunch|Snacks|Drinks",
  "servings": 2,
  "prep_time": "10 min",
  "cook_time": "20 min",
  "tags": ["vegetarisch", "schnell"],
  "ingredients": [
    {"id": 1, "name": "Zutat", "amount": 200, "unit": "g", "group_name": "Für den Teig"}
  ],
  "steps": [
    {"id": 1, "text": "Schritt mit {1} Referenz falls Zutat relevant.", "time_minutes": 5, "step_timestamp": "00:15"}
  ],
  "cover_timestamp": "MM:SS"
}

Wichtig:
- "lang" = ISO-Sprachcode der Originalsprache (de/en/it/fr/es/etc.)
- "category" = GENAU EINER dieser sechs Werte: Vorspeisen, Hauptspeisen, Desserts, Brunch, Snacks, Drinks
- "tags" = 2–5 feingranulare Deskriptoren (NICHT die Hauptkategorie wiederholen). Beispiele: Vegetarisch, Vegan, Glutenfrei, Italienisch, Asiatisch, Französisch, Pasta, Suppe, Salat, Fleisch, Fisch, Dessert, Snack, Frühstück, Schnell, Einfach, Party, Gesund
- Zutaten-Referenzen in Steps als {ingredient_id} (z.B. {1})
- "time_minutes" nur setzen wenn eine Zeitangabe im Schritt vorkommt
- "step_timestamp" = Timestamp im Format "MM:SS" AUSSCHLIESSLICH für besonders wichtige/visuelle Arbeitsschritte (z.B. Schneiden, Braten, Rühren, Backen). NULL für Schritte ohne visuellen Bezug (z.B. "Mit Salz würzen"). Wähle den Moment, in dem dieser Schritt am deutlichsten zu sehen ist.
- Mengen als Zahlen, nicht als Text ("200" statt "zweihundert")
- "group_name" = Gruppe der Zutat falls das Rezept Abschnitte hat (z.B. "Für das Soja-Hack", "Dressing", "Toppings"). NULL wenn keine Gruppen vorhanden.
- "cover_timestamp" = Timestamp im Format "MM:SS" des Moments, in dem das fertige Gericht am appetitlichsten zu sehen ist. Bevorzuge Momente, in denen das fertige Gericht OHNE Text/Überschriften zu sehen ist. Falls jeder Moment Text enthält, nutze den Moment mit dem wenigsten oder unauffälligsten Text. NULL wenn kein geeigneter Moment vorhanden.
- Falls kein Rezept erkennbar: {"error": "Kein Rezept gefunden"}
"""

# Andere Provider (Ollama, Claude, OpenAI): bekommen vorextrahierte Frames
FRAMES_PROMPT = """Du bist ein Rezept-Extraktor. Analysiere die Bilder und den beigefügten Text und extrahiere ein vollständiges Rezept.

Gib das Ergebnis AUSSCHLIESSLICH als JSON zurück – kein Markdown, keine Erklärungen.

JSON-Format:
{
  "title": "Rezeptname",
  "lang": "de",
  "category": "Vorspeisen|Hauptspeisen|Desserts|Brunch|Snacks|Drinks",
  "servings": 2,
  "prep_time": "10 min",
  "cook_time": "20 min",
  "tags": ["Vegetarisch", "Italienisch"],
  "ingredients": [
    {"id": 1, "name": "Zutat", "amount": 200, "unit": "g", "group_name": "Für den Teig"}
  ],
  "steps": [
    {"id": 1, "text": "Schritt mit {1} Referenz falls Zutat relevant.", "time_minutes": 5, "step_timestamp": "00:15"}
  ],
  "cover_frame_index": 2
}

Wichtig:
- "lang" = ISO-Sprachcode der Originalsprache (de/en/it/fr/es/etc.)
- "category" = GENAU EINER dieser sechs Werte: Vorspeisen, Hauptspeisen, Desserts, Brunch, Snacks, Drinks
- "tags" = 2–5 feingranulare Deskriptoren (NICHT die Hauptkategorie wiederholen). Beispiele: Vegetarisch, Vegan, Glutenfrei, Italienisch, Asiatisch, Französisch, Pasta, Suppe, Salat, Fleisch, Fisch, Dessert, Snack, Frühstück, Schnell, Einfach, Party, Gesund
- Zutaten-Referenzen in Steps als {ingredient_id} (z.B. {1})
- "time_minutes" nur setzen wenn eine Zeitangabe im Schritt vorkommt
- "step_timestamp" = Timestamp im Format "MM:SS" AUSSCHLIESSLICH für besonders wichtige/visuelle Arbeitsschritte (z.B. Schneiden, Braten, Rühren, Backen). NULL für Schritte ohne visuellen Bezug (z.B. "Mit Salz würzen"). Nutze die Bilder um den Moment zu identifizieren, wo dieser Schritt am deutlichsten zu sehen ist.
- Mengen als Zahlen, nicht als Text ("200" statt "zweihundert")
- "group_name" = Gruppe der Zutat falls das Rezept Abschnitte hat (z.B. "Für das Soja-Hack", "Dressing", "Toppings"). NULL wenn keine Gruppen vorhanden.
- "cover_frame_index" = Index (0-basiert) des Bildes, das das fertige Gericht am appetitlichsten zeigt. NULL wenn kein geeignetes Bild vorhanden.
- Falls kein Rezept erkennbar: {"error": "Kein Rezept gefunden"}
"""

# Translation Prompt: Translates recipe title, ingredient names, and steps
TRANSLATION_PROMPT = """Du bist ein Rezept-Übersetzer. Übersetze das englischsprachige Rezept in die Zielsprache – nur Title, Zutatennamen und Schritte.

Gib das Ergebnis AUSSCHLIESSLICH als JSON zurück – kein Markdown, keine Erklärungen.

Zielsprache: {target_lang}

JSON-Format:
{
  "title": "Übersetzter Rezeptname",
  "ingredients": [
    {"id": 1, "name": "Übersetzter Zutatennamen"}
  ],
  "steps": [
    {"id": 1, "text": "Übersetzter Schritt-Text mit {{1}} Referenzen"}
  ]
}

Wichtig:
- Übersetze NUR den Text, nicht die IDs
- Behalte {{ingredient_id}} Referenzen in den Steps bei (z.B. {{1}})
- Behalte die gleiche Struktur und Reihenfolge"""


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


def _normalize_category(category: str | None) -> str | None:
    """Normalisiert LLM-Kategorien auf erlaubte Werte."""
    if not category:
        return None

    # Mapping von häufigen LLM-Outputs auf erlaubte Kategorien
    mapping = {
        "dessert": "Desserts",
        "desserts": "Desserts",
        "nachtisch": "Desserts",
        "süßspeisen": "Desserts",
        "nachspeisen": "Desserts",
        "frühstück": "Brunch",
        "breakfast": "Brunch",
        "brunch": "Brunch",
        "snack": "Snacks",
        "snacks": "Snacks",
        "appetizer": "Vorspeisen",
        "appetizers": "Vorspeisen",
        "getränk": "Drinks",
        "getränke": "Drinks",
        "drinks": "Drinks",
        "drink": "Drinks",
        "beverage": "Drinks",
        "suppe": "Vorspeisen",
        "salat": "Vorspeisen",
        "pasta": "Hauptspeisen",
        "fleisch": "Hauptspeisen",
        "fisch": "Hauptspeisen",
        "main course": "Hauptspeisen",
        "main": "Hauptspeisen",
    }

    normalized = category.lower().strip()

    # Exakte Treffer in erlaubten Kategorien
    if normalized in ["vorspeisen", "hauptspeisen", "desserts", "brunch", "snacks", "drinks"]:
        return category  # Original-Capitalization behalten

    # Versuche Mapping
    if normalized in mapping:
        return mapping[normalized]

    # Kein Match: Kategorie auf None setzen (import nicht ablehnen)
    logger.warning(f"Unbekannte Kategorie '{category}' → None gesetzt")
    return None


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

    # Kategorie normalisieren, bevor Pydantic validiert
    if "category" in data:
        data["category"] = _normalize_category(data["category"])

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
            case "gemma3n":
                return self._gemma3n_extract(media_paths, caption)
            case _:
                return self._ollama_extract(media_paths, caption)

    # ── Gemini (native Video + 1 API-Call für Rezept + Timestamp) ────────
    def _gemini_extract(self, media_paths: list[str], caption: str) -> ExtractionResult:
        """
        Gemini verarbeitet Videos nativ und gibt zusätzlich cover_timestamp zurück.
        Caption wird als Kontext übergeben – Gemini kombiniert beides.
        """
        import google.generativeai as genai

        genai.configure(api_key=settings.google_api_key)
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

    # ── Gemma 3n (lokal via Ollama, Frame-basiert) ────────────────────────
    def _gemma3n_extract(self, image_paths: list[str], caption: str) -> ExtractionResult:
        """
        Gemma 3n über Ollama – Frame-basierte Extraktion (wie Ollama, aber mit Gemma 3n Modell).
        Wenn Ollama in Zukunft natives Video-Support für Gemma 3n hinzufügt,
        können wir hier einfach auf Video-Upload umschalten ohne den Aufruf zu ändern.
        """
        images_b64 = [_image_to_base64(p) for p in image_paths[:5]]

        prompt = FRAMES_PROMPT
        if caption:
            prompt = f"Caption / Beschreibung:\n{caption}\n\n{FRAMES_PROMPT}"

        payload = {
            "model": settings.gemma3n_model,
            "prompt": prompt,
            "images": images_b64,
            "stream": False,
            "format": "json",
        }

        response = httpx.post(
            f"{settings.gemma3n_base_url}/api/generate",
            json=payload,
            timeout=300.0,
        )
        response.raise_for_status()
        return _parse_llm_response(response.json()["response"])

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

    # ── Translation: Translate recipe title, ingredients, steps ──────────
    def translate_recipe(
        self,
        title: str,
        ingredients: list[dict],
        steps: list[dict],
        target_lang: str,
    ) -> dict:
        """
        Translates recipe title, ingredient names, and step text to target language.
        
        Args:
            title: Recipe title in original language
            ingredients: List of dicts with {id, name}
            steps: List of dicts with {id, text}
            target_lang: Target language (e.g., "de", "en", "it", "fr")
            
        Returns:
            dict with translated {title, ingredients, steps}
        """
        logger.info(f"Translating recipe to {target_lang}: provider={settings.llm_provider}")

        recipe_json = {
            "title": title,
            "ingredients": [{"id": int(ing["id"]), "name": ing["name"]} for ing in ingredients],
            "steps": [{"id": int(step["id"]), "text": step["text"]} for step in steps],
        }

        prompt = TRANSLATION_PROMPT.format(target_lang=target_lang)
        message_content = f"Recipe to translate:\n{json.dumps(recipe_json, ensure_ascii=False)}\n\n{prompt}"

        match settings.llm_provider:
            case "gemini":
                return self._gemini_translate(message_content)
            case "claude":
                return self._claude_translate(message_content)
            case "openai":
                return self._openai_translate(message_content)
            case "openai_compat":
                return self._openai_compat_translate(message_content)
            case "gemma3n":
                return self._gemma3n_translate(message_content)
            case _:
                return self._ollama_translate(message_content)

    def _gemini_translate(self, message: str) -> dict:
        """Translate using Gemini."""
        import google.generativeai as genai

        genai.configure(api_key=settings.google_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        response = model.generate_content(message)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text.strip())
        data = _fix_encoding(data)
        return data

    def _claude_translate(self, message: str) -> dict:
        """Translate using Claude."""
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=2048,
            messages=[{"role": "user", "content": message}],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text.strip())
        data = _fix_encoding(data)
        return data

    def _openai_translate(self, message: str) -> dict:
        """Translate using OpenAI."""
        client = OpenAI(api_key=settings.openai_api_key)
        return self._openai_compat_translate_impl(client, settings.openai_model, message)

    def _openai_compat_translate(self, message: str) -> dict:
        """Translate using OpenAI-compatible API."""
        client = OpenAI(
            api_key=settings.openai_compat_api_key,
            base_url=settings.openai_compat_base_url,
        )
        return self._openai_compat_translate_impl(client, settings.openai_compat_model, message)

    def _openai_compat_translate_impl(self, client: OpenAI, model: str, message: str) -> dict:
        """Translate using OpenAI-compatible client."""
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": message}],
            max_tokens=2048,
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text.strip())
        data = _fix_encoding(data)
        return data

    def _gemma3n_translate(self, message: str) -> dict:
        """Translate using Gemma 3n via Ollama."""
        payload = {
            "model": settings.gemma3n_model,
            "prompt": message,
            "stream": False,
            "format": "json",
        }
        response = httpx.post(
            f"{settings.gemma3n_base_url}/api/generate",
            json=payload,
            timeout=300.0,
        )
        response.raise_for_status()
        text = response.json()["response"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text.strip())
        data = _fix_encoding(data)
        return data

    def _ollama_translate(self, message: str) -> dict:
        """Translate using Ollama."""
        payload = {
            "model": settings.ollama_model,
            "prompt": message,
            "stream": False,
            "format": "json",
        }
        response = httpx.post(
            f"{settings.ollama_base_url}/api/generate",
            json=payload,
            timeout=300.0,
        )
        response.raise_for_status()
        text = response.json()["response"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text.strip())
        data = _fix_encoding(data)
        return data
