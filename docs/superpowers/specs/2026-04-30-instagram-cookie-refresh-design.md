# Instagram Auto Cookie-Refresh via Playwright

**Date:** 2026-04-30  
**Status:** Approved

## Problem

Instagram-Cookies laufen regelmäßig ab. Bisher musste der Nutzer manuell neue Cookies über die Browser-Extension "Get cookies.txt LOCALLY" exportieren und die Datei ersetzen. Das ist fehleranfällig und führt zu Sync-Ausfällen.

## Ziel

Automatischer Cookie-Refresh via Playwright: Der Sync-Worker erkennt abgelaufene oder bald ablaufende Cookies und erneuert sie selbstständig durch einen echten Browser-Login. Der Nutzer wird nur noch bei nicht lösbaren Problemen (Checkpoint-Challenge) benachrichtigt.

## Architektur

### Neue/geänderte Einheiten

**`backend/app/instagram_auth.py`** (neu)  
Einzige Verantwortung: gültige Cookies bereitstellen.

- `ensure_valid_cookies()` — Einstiegspunkt; prüft Gültigkeit, refresht bei Bedarf
- `refresh_cookies_via_playwright()` — öffnet Browser, loggt ein, extrahiert Cookies
- `is_cookie_valid(threshold_days: int) -> bool` — prüft sessionid-Ablauf lokal (kein Netzwerk-Request)
- Optionaler `account_id`-Parameter (heute immer `"default"`) für spätere Multi-User-Erweiterung

**`backend/app/instagram_service.py`** (kleine Änderung)  
Ruft `ensure_valid_cookies()` vor jedem API-Call auf statt direkt die Datei zu lesen.

**`backend/app/instagram_sync_worker.py`** (kleine Änderung)  
- Auth-Fehler triggern `refresh_cookies_via_playwright()` als erste Reaktion
- Täglicher Proaktiv-Check: Cookie-Gültigkeit prüfen, Refresh wenn < `INSTAGRAM_COOKIE_REFRESH_THRESHOLD_DAYS` Tage verbleiben

## Playwright Login-Flow

Schützt den Account durch menschliches Verhalten:

1. Persistenter Browser-Context wird beim ersten Start angelegt (`INSTAGRAM_BROWSER_STATE_DIR`). Playwright speichert Cookies, localStorage, Fingerprint.
2. Login-Sequenz (nur wenn kein gültiger State vorhanden):
   - Zufälliger Delay vor Seitenaufruf (2–5 Sekunden)
   - `instagram.com` aufrufen, kurz verweilen (1–3 Sekunden)
   - Username zeichenweise eintippen (zufällige Delays zwischen Tastenanschlägen)
   - Kurze Pause, dann Password ebenso
   - Submit, warten auf Navigation
   - Nach Login: 2–4 Sekunden auf Feed verweilen, dann Browser schließen
3. Cookie-Export: Alle Instagram-Cookies werden im Netscape-Format in `INSTAGRAM_COOKIES_FILE` geschrieben (kompatibel mit yt-dlp). Browser-State bleibt erhalten.

## Checkpoint-Detection

Wenn nach dem Login eine Challenge erkannt wird (URL enthält `/challenge/` oder `/checkpoint/`):
- Browser wird geschlossen
- Telegram-Warnung an Admin: "Instagram-Login blockiert — bitte Cookies manuell erneuern"
- Sync pausiert bis manuelle Intervention (neue `cookies.txt` hinterlegen)

Vollautomatisches CAPTCHA-Lösen wird bewusst nicht implementiert.

## Trigger-Logik

**Proaktiv (täglich):**
- Sync-Worker prüft einmal täglich ob sessionid noch ≥ `INSTAGRAM_COOKIE_REFRESH_THRESHOLD_DAYS` Tage gültig
- Zeitpunkt der letzten Prüfung wird in der DB gespeichert (`instagram_auth_state`-Tabelle: `last_checked_at`, `last_refresh_at`, `refresh_fail_count`)
- Falls nicht: Refresh vor dem nächsten Sync-Zyklus

**Reaktiv (bei Auth-Fehler):**
1. Auth-Fehler → erster automatischer Refresh-Versuch
2. Erfolg → Sync läuft weiter, Telegram-Info: "Cookies wurden automatisch erneuert"
3. Fehlschlag → Retry nach `INSTAGRAM_COOKIE_RETRY_INTERVAL` Sekunden

**Retry-Verhalten:**
- Max. `INSTAGRAM_COOKIE_MAX_REFRESH_RETRIES` Versuche (Standard: 2)
- Nach Erschöpfung der Versuche: Sync pausiert, Telegram-Warnung, keine weiteren automatischen Versuche bis manueller Eingriff
- Bewusst konservativ zum Schutz des Accounts

## Neues Telegram-Kommando

**`/auth_status`** (Admin):  
Zeigt Cookie-Gültigkeit, Ablaufdatum, Zeitpunkt des letzten Refreshs.

## Konfiguration

### `.env`-Variablen (neu/geändert)

```env
# Geändert: jetzt auf externem Volume
INSTAGRAM_COOKIES_FILE=/mnt/data/miximixi/instagram_cookies.txt

# Neu
INSTAGRAM_BROWSER_STATE_DIR=/mnt/data/miximixi/instagram_browser_state/
INSTAGRAM_COOKIE_REFRESH_THRESHOLD_DAYS=7
INSTAGRAM_COOKIE_MAX_REFRESH_RETRIES=2
INSTAGRAM_COOKIE_RETRY_INTERVAL=1800
```

`INSTAGRAM_USERNAME` und `INSTAGRAM_PASSWORD` (bereits vorhanden) werden jetzt aktiv genutzt.

### Python-Dependency

```toml
playwright = "^1.44"
```

Einmalig nach Installation: `playwright install chromium`

### Docker

**`Dockerfile`:**
```dockerfile
RUN playwright install chromium --with-deps
```

**`docker-compose.yml`:**
```yaml
volumes:
  - /mnt/data/miximixi:/mnt/data/miximixi
```

Browser-State (~1–5 MB) und `cookies.txt` liegen beide auf dem externen Volume — konsistent mit der restlichen Datenpersistenz.

## Skalierbarkeit (vorbereitet, nicht implementiert)

- `instagram_auth.py` akzeptiert optionalen `account_id`-Parameter (heute immer `"default"`)
- Browser-State-Pfad: `{INSTAGRAM_BROWSER_STATE_DIR}/{account_id}/`
- Cookies heute als Datei, spätere Migration zu DB-Speicherung möglich ohne Interface-Änderung

## Dateiübersicht

| Datei | Änderung |
|-------|----------|
| `backend/app/instagram_auth.py` | Neu |
| `backend/app/instagram_service.py` | `ensure_valid_cookies()` einbinden |
| `backend/app/instagram_sync_worker.py` | Proaktiv-Check + reaktiver Refresh + `/auth_status` |
| `backend/app/config.py` | Neue Settings-Felder |
| `backend/app/telegram_bot.py` | `/auth_status`-Kommando |
| `backend/pyproject.toml` | `playwright` hinzufügen |
| `Dockerfile` | `playwright install chromium --with-deps` |
| `docker-compose.yml` | Volume für `/mnt/data/miximixi` |
| `.env.example` | Neue Variablen dokumentieren |
