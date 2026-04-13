# Miximixi – Quick Reference: What's Done, What's Next

## 🎯 Your Immediate Workflow

1. **TODAY: Test the import pipeline (30 min)**
   - Manual backend test (Phase 1 in testing-guide.md)
   - Verify Gemini API works
   - Confirm database saves recipes

2. **THIS WEEK: Set up n8n + Telegram bot (1 hour)**
   - Import telegram_import.json workflow
   - Get Telegram bot token from @BotFather
   - Send test links to bot

3. **NEXT WEEK: Implement missing backend features (1-2 days)**
   - Website import (Playwright)
   - YouTube import (yt-dlp)
   - Fallback logic (when extraction fails)

---

## ✅ Confirmed Working

| Component | Status | How to Test |
|-----------|--------|------------|
| FastAPI backend | ✅ Running | `curl http://localhost:8000/health` |
| Database (Supabase) | ✅ Ready | Migrations executed, tables exist |
| LLM layer (Gemini) | ✅ Ready | API key in `.env`, has 50 free calls/month |
| Queue worker | ✅ Running | Logs show "Queue-Worker gestartet" |
| Endpoints: `/import` | ✅ Ready | See Phase 1, Step 2 in testing-guide.md |
| Endpoints: `/import/{id}` | ✅ Ready | Check import status |

---

## ⚠️ Not Tested Yet / Unclear

| What | What to Do | Where |
|------|-----------|-------|
| Does LLM extraction actually work? | Run Phase 1 test with real Instagram link | testing-guide.md Phase 1 |
| Is n8n connected properly? | Import workflow, configure Telegram, test | testing-guide.md Phase 2 |
| Does Instagram sync work? | Lower priority - test Telegram first | testing-guide.md Phase 3 |

---

## ❌ Still Missing (Next Implementation)

| Feature | Why Blocked | Effort |
|---------|-------------|--------|
| **Website import** | Needs Playwright screenshot handling | 2 hours |
| **YouTube import** | yt-dlp integration in backend | 2 hours |
| **Fallback logic** | When extraction fails → partial/needs_review | 1 hour |
| **Photo extraction** (non-Gemini) | ffmpeg frame extraction | 3 hours |
| **Frontend** | Phase 2, after pipeline is solid | 3-5 days |

---

## 📋 Implementation Order (Backend First!)

```
Week 1:
  [✅] Set up Docker stack
  [✅] Database migrations
  [✅] Backend basic endpoints
  [ → TODAY] Test manually + n8n integration
  
Week 2:
  [ ] Website + YouTube import
  [ ] Fallback logic
  [ ] Telegram error notifications
  
Week 3+:
  [ ] React frontend (feed, detail, cook mode)
  [ ] Authentication
  [ ] Sharing
```

---

## 🚀 Start Here (Pick One)

### Option A: Verify Everything Works (Risk: Low, Time: 30 min)
1. Open testing-guide.md
2. Follow Phase 1 (manual tests)
3. If all pass → Move to Option B

### Option B: Try n8n + Telegram (Risk: Medium, Time: 1 hour)
1. Get Telegram bot token from @BotFather
2. Follow Phase 2 in testing-guide.md
3. Send test links to bot

### Option C: Check Backend Logs (Risk: Very Low, Time: 5 min)
```bash
docker compose -f docker-compose.dev.yml logs backend -f
# Should see "Queue-Worker gestartet" and no errors
```

---

## 📞 Common Questions

**Q: Is the import pipeline actually done?**  
A: Backend endpoints exist, but we haven't tested them end-to-end yet. Do Phase 1 test first.

**Q: Why does the plan say things are "✅ Erledigt"?**  
A: The architecture/skeleton is done, but not validated. Testing confirms it works.

**Q: What if extraction fails?**  
A: Right now: error saved to database. Next week: fallback to manual review + Telegram notification.

**Q: Can I use Ollama instead of Gemini?**  
A: Yes! Change `.env`: `LLM_PROVIDER=ollama` but extraction will be ~10x slower (CPU).

---

## 📁 Key Files to Know

| File | What It Does | Edit When |
|------|--------------|-----------|
| docs/testing-guide.md | How to test pipeline | Read first! |
| docs/plan.md | Overall roadmap | Reference only |
| .env | API keys + config | Initial setup + debugging |
| backend/app/llm_provider.py | LLM integration | Tweaking extraction |
| n8n/*.json | Telegram workflows | Via n8n UI |

---

**NEXT ACTION:** Open `docs/testing-guide.md` and run Phase 1 (manual backend test)
