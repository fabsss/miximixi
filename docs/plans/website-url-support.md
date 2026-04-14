# Plan: Website URL Support in Telegram Import

## Context
The Telegram import workflow currently only accepts Instagram URLs. The user wants to also accept any website URL (recipe blogs, food sites, etc.). The backend already has a skeleton `source_type="web"` path, but `download_website()` uses a full-page screenshot as the recipe image, which is wrong. Instead, we should extract the recipe's actual image from the page HTML (og:image, schema.org, or largest img tag). The n8n Telegram workflow needs to be updated to accept non-Instagram URLs and detect source type automatically.

## What Already Exists (no changes needed)
- `queue_worker.py` already routes `source_type="web"` to `download_website()` in `_download_for_source()`
- `media_processor.py` already has `download_website()` using Playwright + BeautifulSoup
- `models.py` already has `source_type: str = "telegram"` with "web" as a valid value
- `main.py` `/import` endpoint is generic, no changes needed
- All dependencies (playwright, beautifulsoup4, requests) already in pyproject.toml

## Changes Required

### 1. `backend/app/media_processor.py` — Update `download_website()`

**Problem:** Current implementation takes a full-page screenshot as the recipe image.  
**Fix:** Extract recipe image from HTML metadata instead.

Replace the screenshot logic with:

```python
async def download_website(url: str, output_dir: str) -> DownloadResult:
    """
    Downloads recipe content from any website URL.
    Extracts: main text content + best recipe image (og:image, schema.org, or largest img)
    """
    headers = {"User-Agent": "Mozilla/5.0 (compatible; Miximixi/1.0)"}
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.content, "html.parser")

    # ── Extract text content ──────────────────────────────────
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    text = "\n".join(line for line in text.splitlines() if line.strip())
    text = text[:8000]  # Cap at 8000 chars

    # ── Extract recipe image ──────────────────────────────────
    image_url = (
        _find_og_image(soup) or
        _find_schema_image(soup) or
        _find_largest_img(soup, url)
    )

    media_paths = []
    if image_url:
        img_path = _download_image(image_url, output_dir)
        if img_path:
            media_paths.append(img_path)

    return DownloadResult(media_paths=media_paths, description=text)
```

**New helper functions to add:**

```python
def _find_og_image(soup) -> str | None:
    """Find og:image or twitter:image meta tag."""
    for prop in ["og:image", "twitter:image"]:
        tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        if tag and tag.get("content"):
            return tag["content"]
    return None

def _find_schema_image(soup) -> str | None:
    """Find image from schema.org Recipe JSON-LD or itemprop."""
    # JSON-LD
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
            if isinstance(data, list):
                data = next((d for d in data if d.get("@type") == "Recipe"), {})
            if data.get("@type") == "Recipe":
                img = data.get("image")
                if isinstance(img, list): img = img[0]
                if isinstance(img, dict): img = img.get("url")
                if img: return img
        except Exception:
            pass
    # itemprop
    tag = soup.find(itemprop="image")
    if tag:
        return tag.get("src") or tag.get("content")
    return None

def _find_largest_img(soup, base_url: str) -> str | None:
    """Fallback: find the largest img tag on the page (likely the hero image)."""
    imgs = soup.find_all("img", src=True)
    # Prefer images with large width attr or that look like recipe photos
    for img in imgs:
        src = img.get("src", "")
        width = int(img.get("width", 0) or 0)
        if width >= 400:
            return urljoin(base_url, src)
    # Return first non-icon img as last resort
    for img in imgs:
        src = img.get("src", "")
        if not any(x in src for x in ["logo", "icon", "avatar", "sprite"]):
            return urljoin(base_url, src)
    return None

def _download_image(url: str, output_dir: str) -> str | None:
    """Download image to output_dir, return local path."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; Miximixi/1.0)"}
        resp = requests.get(url, headers=headers, timeout=15, stream=True)
        resp.raise_for_status()
        ext = Path(url.split("?")[0]).suffix.lower() or ".jpg"
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            ext = ".jpg"
        out_path = str(Path(output_dir) / f"recipe_image{ext}")
        with open(out_path, "wb") as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        return out_path
    except Exception as e:
        logger.warning(f"Image download failed: {url}: {e}")
        return None
```

**Remove Playwright dependency from `download_website()`** — replace async Playwright with synchronous requests. This simplifies the function and avoids browser overhead for website imports. (Playwright can remain in pyproject.toml for other potential uses.)

**Imports to add** to `media_processor.py`:
```python
import json
import requests
from urllib.parse import urljoin
```

### 2. `n8n/telegram_import.json` — Update Telegram workflow

**Problem:** The URL extraction regex only matches Instagram URLs:
```js
const urlPattern = /https?:\/\/(www\.)?instagram\.com\/[^\s]+/gi;
```

**Fix:** Update to match any URL, and auto-detect source_type:

```js
// Match any URL (Instagram, YouTube, or any website)
const urlPattern = /https?:\/\/[^\s]+/gi;
const matches = text.match(urlPattern);

// ...after extracting url...

// Detect source type
function detectSourceType(url) {
    if (/instagram\.com/i.test(url)) return "instagram";
    if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
    return "web";
}

return [{
    json: {
        valid: true,
        url: url,
        source_type: detectSourceType(url),
        chat_id: chatId,
        message_id: messageId
    }
}];
```

**Also update "Backend /import aufrufen" node body** to include source_type:
```json
{
  "url": "{{ $('URL extrahieren').item.json.url }}",
  "source_type": "{{ $('URL extrahieren').item.json.source_type }}"
}
```

## Files to Modify
1. `backend/app/media_processor.py` — Replace `download_website()` and add helper functions
2. `n8n/telegram_import.json` — Update URL regex + add source_type detection

## Files NOT to Modify
- `backend/app/queue_worker.py` — Already routes "web" correctly
- `backend/app/main.py` — Already generic
- `backend/app/models.py` — Already supports "web"
- `backend/app/config.py` — No new settings needed
- `backend/app/llm_provider.py` — Already handles image files

## Verification
1. Send a recipe blog URL to Telegram bot (e.g. chefkoch.de, allrecipes.com)
2. Check backend logs: should show `yt-dlp` NOT called, instead `requests.get(url)` 
3. Recipe image should be extracted from og:image or schema.org
4. Recipe JSON returned from LLM should match DB schema
5. Check DB: recipe row created with `source_type="web"`
