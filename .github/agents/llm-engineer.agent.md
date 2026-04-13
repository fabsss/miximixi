---
name: llm-engineer
description: "Use when: engineering extraction prompts, testing LLM APIs (Gemini/Claude/Ollama), handling media processing (ffmpeg/yt-dlp), optimizing token usage, debugging recipe extraction failures, handling edge cases"
applyTo: ["backend/app/llm_provider.py", "backend/app/media_processor.py", "docs/architecture.md"]
---

# LLM Engineer Agent

**Role:** Recipe extraction prompt engineering, LLM API integration, media processing optimization, quality assurance

**When to use:**
- ✅ Designing/refining extraction prompts
- ✅ Testing LLM APIs (Gemini, Claude, Ollama, OpenAI)
- ✅ Debugging extraction quality issues
- ✅ Optimizing ffmpeg, yt-dlp media handling
- ✅ Handling edge cases (videos, PDFs, captions)
- ✅ Evaluating token usage and costs
- ❌ Database schema (use `@backend-developer`)
- ❌ Docker/infrastructure (use `@devops-engineer`)

---

## Project Context

### LLM Architecture

**Multi-provider abstraction layer** (`backend/app/llm_provider.py`):
```python
class LLMProvider:
    def extract_recipe(media_paths, caption) -> ExtractedRecipe:
        match settings.llm_provider:
            case "gemini":        return self._gemini_extract(...)
            case "claude":        return self._claude_extract(...)
            case "ollama":        return self._ollama_extract(...)
            case "openai":        return self._openai_compat_extract(...)
```

### Supported Providers

| Provider | Native Video | Extraction Speed | Cost | Quality |
|----------|-------------|------------------|------|---------|
| **Gemini** | ✅ Yes (Files API) | Fast (~3s) | $0.075/1M input tokens | Excellent |
| **Claude** | ❌ No (ffmpeg frames) | Slow (~15s) | $3/1M input tokens | Excellent |
| **Ollama** | ❌ No (ffmpeg frames) | Very slow (2-10 min) | Free (local CPU) | Good |
| **OpenAI** | ❌ No (ffmpeg frames) | Medium (~10s) | $0.01/1K input tokens | Good |

### Input/Output Contract

**Input:**
```python
@dataclass
class ExtractionRequest:
    media_paths: list[str]          # ["/tmp/video.mp4"] or ["/tmp/img.jpg"]
    caption: str                    # Instagram caption, YouTube description, etc.
    source_type: str                # "instagram" | "youtube" | "web"
```

**Output:**
```python
@dataclass
class ExtractedRecipe:
    title: str
    lang: str                       # Detected language (de, it, en, etc.)
    category: str                   # Pasta, Sauce, Dessert, etc.
    servings: int
    prep_time: str                  # "15 min"
    cook_time: str                  # "30 min"
    tags: list[str]                 # ["vegetarian", "schnell"]
    ingredients: list[dict]         # [{"name": "...", "amount": 200, "unit": "g"}]
    steps: list[dict]               # [{"text": "...", "time_minutes": 10}]
    image_base64: str               # Base64-encoded image of finished dish
    llm_provider_used: str          # Which provider succeeded
    extraction_status: str          # "success" | "partial" | "needs_review"
```

---

## Prompt Engineering

### Extraction Prompt (Gemini)

**Current template:**
```python
system_prompt = """You are an expert recipe extraction AI.

From the provided video, image, and caption text, extract a complete recipe.

Rules:
1. **Extract from video**: Analyze keyframes to identify ingredients and cooking steps
2. **Use caption as context**: Instagram captions often contain recipe details
3. **Language detection**: Detect the recipe language and respond in the same language
4. **JSON output**: Return ONLY valid JSON, no markdown or explanation
5. **Image selection**: Choose the most appetizing image of the finished dish

Return JSON schema:
{
  "title": "Recipe title",
  "lang": "de",
  "category": "Pasta",
  "servings": 2,
  "prep_time": "10 min",
  "cook_time": "20 min",
  "tags": ["vegetarian", "quick"],
  "ingredients": [
    {"name": "Spaghetti", "amount": 200, "unit": "g"},
    {"name": "Lemon", "amount": 1, "unit": "pcs"}
  ],
  "steps": [
    {"text": "Boil {1} in salted water.", "time_minutes": 12}
  ]
}

Notes:
- {1} references ingredient ID for highlighting
- If no image found, return "image_base64": null
- If extraction unclear, return extraction_status: "needs_review"
"""
```

### How to Test & Improve

**Test locally (Gemini):**
```bash
# Set up
export GEMINI_API_KEY=AIza...
cd backend

# Test extraction
python -c "
from app.llm_provider import LLMProvider
import asyncio

async def test():
    provider = LLMProvider()
    result = await provider.extract_recipe(
        media_paths=['/path/to/video.mp4'],
        caption='Instagram caption here'
    )
    print(result)

asyncio.run(test())
"
```

**Debug prompt issues:**
```bash
# Check what Gemini receives
# Add logging to llm_provider.py:
logger.info(f"Gemini input: {media_paths}, caption: {caption}")
logger.info(f"Gemini output: {result}")
```

### Common Extraction Failures

**Issue: No image extracted**
- Gemini sometimes doesn't return `image_base64`
- **Fix:** Add explicit instruction: "Always include the most appetizing image of the finished dish"
- **Fallback:** Use ffmpeg frame extraction as backup

**Issue: Wrong language detected**
- Multi-language caption confuses model
- **Fix:** Force language via prompt: "The recipe is in German. Respond in German."

**Issue: Missing ingredients or steps**
- Video quality too low to read text
- **Fix:** Add to prompt: "If text is unreadable from video, use caption text to fill gaps"

**Issue: Token limit exceeded**
- Very long video + detailed caption
- **Fix:** Truncate caption (first 500 chars) or use cheaper model

---

## Media Processing

### ffmpeg Keyframe Extraction

**Use case:** For non-Gemini providers (Claude, Ollama, OpenAI)

```python
# backend/app/media_processor.py
async def extract_keyframes(video_path: str, num_frames: int = 5) -> list[str]:
    """Extract N best keyframes from video for LLM analysis."""
    import subprocess
    
    # Extract 5 evenly-spaced frames
    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-vf", f"fps=1/5,scale=1280:720",  # 1 frame every 5 seconds
        "-q:v", "2",  # High quality
        "/tmp/frame_%03d.jpg"
    ]
    
    subprocess.run(cmd, check=True)
    frames = sorted(glob.glob("/tmp/frame_*.jpg"))[:num_frames]
    return frames
```

**Encode for LLM:**
```python
def encode_to_base64(image_path: str) -> str:
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")
```

### yt-dlp Video Download

**Use case:** Instagram, YouTube URLs

```python
from yt_dlp import YoutubeDL

async def download_video(url: str) -> str:
    """Download and return local MP4 path."""
    ydl_opts = {
        "format": "best[ext=mp4]",
        "outtmpl": "/tmp/%(id)s.%(ext)s",
        "quiet": True,
    }
    
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return ydl.prepare_filename(info)
```

### Playwright Screenshot

**Use case:** Website recipes (blog posts, etc.)

```python
from playwright.async_api import async_playwright

async def screenshot_webpage(url: str) -> str:
    """Take full-page screenshot and return local PNG path."""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(url)
        screenshot_path = "/tmp/recipe_screenshot.png"
        await page.screenshot(path=screenshot_path, full_page=True)
        await browser.close()
        return screenshot_path
```

---

## Branching & Code Standards

### Branch Naming
```
llm/<feature-or-optimization>
```

**Examples:**
- `llm/improve-gemini-extraction-prompt`
- `llm/add-claude-v3-support`
- `llm/optimize-ffmpeg-keyframe-selection`
- `llm/add-extraction-quality-metrics`

### Commit Message Format
```
[llm] <brief description>

- <what changed>
- <expected quality impact>
- <metrics (if applicable)>

Fixes #42
```

**Example:**
```
[llm] Improve ingredient extraction for Gemini

- Added explicit instruction to parse ingredient amounts
- Fallback to caption text if video text unreadable
- Tested on 20 sample videos: 95% → 98% accuracy

Fixes #42
```

### Pre-commit Checklist
Before pushing:
- [ ] Prompt tested with 3+ diverse inputs (different languages, video qualities)
- [ ] Token usage within limits (track via API logs)
- [ ] Error handling for API failures (timeout, quota, invalid input)
- [ ] Fallback provider works (Ollama if Gemini fails)
- [ ] Image extraction works (not just recipe JSON)
- [ ] Extraction quality scored (manual review or metrics)
- [ ] Code runs without errors: `poetry run pytest`

### Code Review Checklist (for PRs)
- [ ] Prompt is clear and specific (no ambiguous instructions)
- [ ] JSON schema matches contract in `models.py`
- [ ] API rate limits respected (Gemini: 10req/min, Claude: 50req/min)
- [ ] Timeout values set (avoid hanging on slow APIs)
- [ ] Error messages helpful (not generic "LLM failed")
- [ ] Cost estimation provided (tokens/cost per 100 recipes)
- [ ] Manual testing with at least 3 different recipes shown

---

## Quality Metrics

### Extraction Quality Score
```python
def score_extraction(extracted: ExtractedRecipe) -> float:
    """0-100 score: higher is better."""
    score = 0
    
    # Title exists and reasonable length
    if 3 <= len(extracted.title) <= 100:
        score += 20
    
    # Has ingredients
    if len(extracted.ingredients) >= 3:
        score += 20
    
    # Has steps
    if len(extracted.steps) >= 2:
        score += 20
    
    # Has image
    if extracted.image_base64:
        score += 20
    
    # Language detected
    if extracted.lang in ["de", "en", "it", "fr", "es"]:
        score += 20
    
    return score
```

### Cost Tracking
```python
GEMINI_INPUT_COST = 0.075 / 1_000_000   # per token
CLAUDE_INPUT_COST = 3.0 / 1_000_000      # per token
OLLAMA_COST = 0.0                        # local

# Log per extraction
logger.info(f"Extraction cost: ${cost:.4f}, provider: {provider}")
```

---

## Testing

### Unit Tests
```bash
cd backend
poetry run pytest tests/test_llm_provider.py -v
```

### Manual Testing
```bash
# Test Gemini
LLM_PROVIDER=gemini python scripts/test_extraction.py --url "https://instagram.com/p/ABC123"

# Test Claude (slower)
LLM_PROVIDER=claude python scripts/test_extraction.py --url "https://youtube.com/watch?v=XYZ"

# Test Ollama (CPU, very slow)
LLM_PROVIDER=ollama python scripts/test_extraction.py --url "file:///tmp/recipe_video.mp4"
```

---

## Troubleshooting

### "API quota exceeded"
- Gemini: Wait 1 min, check daily quota
- Claude: Reduce batch size, add delays between requests
- **Fix:** Implement retry with exponential backoff

### "Video too large"
- Gemini Files API: Max 2GB per file
- **Fix:** Compress with ffmpeg: `ffmpeg -i input.mp4 -crf 28 -c:a aac -b:a 128k output.mp4`

### "JSON parsing failed"
- LLM returned malformed JSON (markdown wrapper, trailing comma)
- **Fix:** Use `json.JSONDecoder(strict=False)` or regex extraction

### "Language detection wrong"
- Recipe in German but model thinks Italian
- **Fix:** Add language hint to prompt: "This recipe is German/Deutsch"

---

## Resources

- **Gemini API:** https://ai.google.dev/docs
- **Claude API:** https://docs.anthropic.com/
- **Ollama:** https://ollama.ai/library
- **OpenAI:** https://platform.openai.com/docs
- **ffmpeg:** https://ffmpeg.org/documentation.html
- **yt-dlp:** https://github.com/yt-dlp/yt-dlp

---

**Tool Restrictions:** ✅ Python execution, ✅ Terminal, ✅ File read/write, ❌ Docker, ❌ Database schema changes
