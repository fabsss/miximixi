"""
Telegram Bot: Handles /start, URL submissions, access control, and notifications.
Replaces n8n Telegram integration with native FastAPI.

Architecture:
  User → Bot (polling) → import_queue → run_worker → notify() → User
  
Instagram Sync Commands (admin-only):
  /sync_setup    - Interactive collection selection menu
  /sync_status   - Show current sync state and selected collection
  /sync_enable   - Enable automatic syncing
  /sync_disable  - Disable automatic syncing
  /sync_now      - Trigger manual sync immediately
"""
import asyncio
import logging
import re
from typing import Callable, Optional
from urllib.parse import urlparse

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes

from app.config import settings
from app.instagram_auth import get_auth_state, is_cookie_valid
from app.source_identifier import extract_source_id, get_source_type_from_url

logger = logging.getLogger(__name__)


# ── Access Control ───────────────────────────────────────────────────────────
def is_allowed(user_id: int) -> bool:
    """
    Prüft, ob ein User die Bot-Nutzung erlaubt ist.
    Empty allowlist = all users allowed.
    """
    if not settings.telegram_allowed_user_ids:
        logger.info(f"Access check for user {user_id}: ALLOWED (empty allowlist)")
        return True
    
    allowed_str = [str(user_id) for user_id in settings.telegram_allowed_user_ids]
    is_allowed_user = str(user_id) in allowed_str
    logger.info(f"Access check for user {user_id}: {'ALLOWED' if is_allowed_user else 'DENIED'} (allowlist: {settings.telegram_allowed_user_ids})")
    return is_allowed_user


def is_admin(user_id: int) -> bool:
    """
    Prüft, ob ein User Admin-Rechte hat.
    Nutzt TELEGRAM_ADMIN_IDS environment variable.
    """
    # Log the raw config value  
    logger.warning(f"[Admin Check] Raw config: admin_ids_setting={repr(settings.telegram_admin_ids)}, type={type(settings.telegram_admin_ids)}")
    
    if not settings.telegram_admin_ids:
        logger.warning(f"[Admin Check] User {user_id}: DENIED — no admins configured (empty list)")
        return False
    
    # Convert both to strings for comparison
    user_id_str = str(user_id)
    
    # Log what we're searching for
    logger.warning(f"[Admin Check] User {user_id}: checking membership")
    logger.warning(f"[Admin Check]   looking_for: {repr(user_id_str)}")
    logger.warning(f"[Admin Check]   admin_list: {settings.telegram_admin_ids}")
    logger.warning(f"[Admin Check]   admin_list types: {[type(x).__name__ for x in settings.telegram_admin_ids]}")
    
    # Direct comparison
    is_admin_user = user_id_str in settings.telegram_admin_ids
    
    logger.warning(f"[Admin Check] User {user_id}: Result={repr(is_admin_user)}")
    
    return is_admin_user


# ── DB-Backed User Lookup ────────────────────────────────────────────────────
def get_user_id_for_telegram(telegram_user_id: int) -> str | None:
    """Returns miximixi user_id (UUID str) for a linked Telegram user, or None."""
    import psycopg2
    from app.config import settings
    try:
        conn = psycopg2.connect(
            host=settings.db_host, port=settings.db_port,
            user=settings.db_user, password=settings.db_password,
            dbname=settings.db_name,
        )
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id FROM user_telegram_links WHERE telegram_user_id = %s",
                (telegram_user_id,)
            )
            row = cur.fetchone()
        conn.close()
        return str(row[0]) if row else None
    except Exception as e:
        logger.error(f"DB lookup for telegram_user_id {telegram_user_id}: {e}")
        return None


def consume_link_code(code: str, telegram_user_id: int, telegram_username: str | None) -> bool:
    """Validates and consumes a link code, creates the user_telegram_links row. Returns True on success."""
    import psycopg2
    from app.config import settings
    try:
        conn = psycopg2.connect(
            host=settings.db_host, port=settings.db_port,
            user=settings.db_user, password=settings.db_password,
            dbname=settings.db_name,
        )
        with conn.cursor() as cur:
            cur.execute(
                """SELECT user_id FROM telegram_link_codes
                   WHERE code = %s AND expires_at > now() AND used_at IS NULL""",
                (code,)
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return False
            user_id = row[0]
            cur.execute(
                """INSERT INTO user_telegram_links (user_id, telegram_user_id, telegram_username)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (telegram_user_id) DO UPDATE SET user_id = EXCLUDED.user_id, telegram_username = EXCLUDED.telegram_username""",
                (user_id, telegram_user_id, telegram_username)
            )
            cur.execute(
                "UPDATE telegram_link_codes SET used_at = now() WHERE code = %s",
                (code,)
            )
            conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"consume_link_code error: {e}")
        return False


# ── Error Humanization ───────────────────────────────────────────────────────
def humanize_error(error: str) -> str:
    """
    Konvertiert technische Fehler in benutzerfreundliche Deutsche Meldungen.
    """
    error_lower = error.lower()

    # Link nicht gefunden (404 / URL existiert nicht)
    if any(w in error_lower for w in ["404", "not found", "link nicht gefunden", "does not exist", "removed", "existiert nicht"]):
        return "❌ Der Link existiert nicht mehr oder wurde gelöscht. Bitte einen anderen probieren."

    # Authentifizierung/Cookie Fehler
    if any(w in error_lower for w in ["cookie", "unauthorized", "authentication", "session expired", "login required", "access denied"]):
        return "❌ Authentifizierung fehlgeschlagen. Cookie könnte abgelaufen sein. Bitte den Admin kontaktieren."

    # Andere Download & connectivity errors
    if any(w in error_lower for w in ["download", "connection", "timeout"]):
        return "❌ Video/Seite konnte nicht heruntergeladen werden. Bitte später erneut versuchen."

    # Recipe extraction errors
    if any(w in error_lower for w in ["recipe", "extract", "parsing", "json", "no recipe"]):
        return "❌ Kein Rezept im Video/auf der Seite gefunden. Bitte ein anderes probieren."

    # Generic fallback
    return f"❌ Technischer Fehler: {error[:100]}"


# ── Telegram Handlers ────────────────────────────────────────────────────────
async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles /start command, including deep-link account linking via MIX- codes."""
    user = update.message.from_user
    args = context.args or []

    if args and args[0].startswith("MIX-"):
        code = args[0]
        success = consume_link_code(code, user.id, user.username)
        if success:
            await update.message.reply_text(
                "✅ Dein Telegram-Gerät wurde erfolgreich mit deinem Miximixi-Account verknüpft!\n\n"
                "Du kannst jetzt Instagram- und Rezept-Links direkt in diesen Chat schicken."
            )
        else:
            await update.message.reply_text(
                "❌ Ungültiger oder abgelaufener Code.\n"
                "Bitte einen neuen Code im Miximixi-Frontend generieren."
            )
        return

    await update.message.reply_text(
        "👋 Willkommen bei Miximixi!\n\n"
        "Um dieses Gerät zu verknüpfen, öffne Miximixi im Browser, "
        "gehe zu deinem Profil und scanne den QR-Code."
    )


async def getchatid_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles /getchatid command — returns the current chat ID."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id

    # Access control
    if not is_allowed(user_id):
        await update.message.reply_text("❌ Du hast keinen Zugriff auf diesen Bot.")
        logger.warning(f"Unauthorized user {user_id} tried /getchatid")
        return

    await update.message.reply_text(
        f"🔍 *Deine Chat-ID:*\n\n`{chat_id}`\n\n"
        f"Kopiere diese ID und setze sie als `TELEGRAM_NOTIFY_CHAT_ID` im .env"
    )
    logger.info(f"User {user_id} requested chat ID: {chat_id}")


async def jobs_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles /jobs command — shows all failed and processing jobs (admin-only)."""
    user_id = str(update.effective_user.id)

    if settings.telegram_admin_ids and user_id not in settings.telegram_admin_ids:
        await update.message.reply_text("❌ Nur Admin-Benutzer können /jobs nutzen")
        return

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        db = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
        )
        cursor = db.cursor(cursor_factory=RealDictCursor)

        # Get needs_review jobs (failed)
        cursor.execute(
            """
            SELECT id, source_url, error_msg, created_at
            FROM import_queue
            WHERE status = %s
            ORDER BY created_at DESC
            LIMIT 10
            """,
            ("needs_review",)
        )
        failed_jobs = cursor.fetchall()

        # Get processing jobs (stuck or in-progress)
        cursor.execute(
            """
            SELECT id, source_url, created_at, updated_at,
                   now() - updated_at as age
            FROM import_queue
            WHERE status = %s
            ORDER BY created_at DESC
            LIMIT 5
            """,
            ("processing",)
        )
        processing_jobs = cursor.fetchall()

        db.close()

        # Build message
        msg_lines = ["📊 *Job Queue Status*\n"]

        if failed_jobs:
            msg_lines.append(f"❌ *{len(failed_jobs)} Failed Jobs (needs_review):*\n")
            for job in failed_jobs:  # Show ALL jobs
                url_short = job["source_url"][:50] + "…" if len(job["source_url"]) > 50 else job["source_url"]
                error_short = job["error_msg"][:60] + "…" if len(job["error_msg"]) > 60 else job["error_msg"]
                job_id = str(job['id'])[:12]  # First 12 chars of UUID
                msg_lines.append(f"• `{job_id}`")
                msg_lines.append(f"  🔗 {url_short}")
                msg_lines.append(f"  ❌ {error_short}\n")
        else:
            msg_lines.append("✅ Keine fehlgeschlagenen Jobs\n")

        if processing_jobs:
            msg_lines.append(f"\n⏳ *{len(processing_jobs)} Processing Jobs:*\n")
            for job in processing_jobs:
                url_short = job["source_url"][:50] + "…" if len(job["source_url"]) > 50 else job["source_url"]
                age_str = str(job["age"]).split(".")[0] if job["age"] else "?"
                job_id = str(job['id'])[:12]
                msg_lines.append(f"• `{job_id}` (age: {age_str})")
                msg_lines.append(f"  🔗 {url_short}\n")
        else:
            msg_lines.append("\n✅ Keine aktiven Jobs\n")

        msg_lines.append("\n💡 Nutze `/job <id>` für Details")

        await update.message.reply_text(
            "\n".join(msg_lines),
            parse_mode="Markdown"
        )
        logger.info(f"Admin {user_id} requested job status")

    except Exception as e:
        logger.exception(f"Error in /jobs command: {e}")
        await update.message.reply_text(f"❌ Fehler: {e}")


async def job_details_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles /job <id> command — shows details of a specific job, or /job delete <id>."""
    user_id = str(update.effective_user.id)

    if settings.telegram_admin_ids and user_id not in settings.telegram_admin_ids:
        await update.message.reply_text("❌ Nur Admin-Benutzer können /job nutzen")
        return

    if not context.args or len(context.args) < 1:
        await update.message.reply_text(
            "❌ Nutze:\n"
            "`/job <id>` - Zeige Details\n"
            "`/job delete <id>` - Lösche Job",
            parse_mode="Markdown"
        )
        return

    # Check for delete subcommand
    if context.args[0].lower() == "delete" and len(context.args) >= 2:
        job_id = context.args[1].strip()
        await _delete_job(update, user_id, job_id)
        return

    # Otherwise: show job details
    job_id = context.args[0].strip()
    await _show_job_details(update, user_id, job_id)


async def _show_job_details(update: Update, user_id: str, job_id: str) -> None:
    """Shows details of a specific job by ID or partial ID."""
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        db = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
        )
        cursor = db.cursor(cursor_factory=RealDictCursor)

        # Try exact UUID match first, then prefix match by casting to text
        cursor.execute(
            """
            SELECT id, status, source_url, source_type, error_msg,
                   created_at, updated_at, recipe_id
            FROM import_queue
            WHERE id::text LIKE %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (f"{job_id}%",)
        )
        job = cursor.fetchone()

        if not job:
            await update.message.reply_text("❌ Job nicht gefunden")
            db.close()
            return

        # Format message
        msg = f"📋 *Job Details*\n\n"
        msg += f"ID: `{job['id']}`\n"
        msg += f"Status: {job['status']}\n"
        msg += f"Type: {job['source_type']}\n"
        msg += f"URL: {job['source_url']}\n"
        msg += f"Created: {job['created_at']}\n"
        msg += f"Updated: {job['updated_at']}\n"

        if job['error_msg']:
            msg += f"\n❌ *Error:*\n```\n{job['error_msg']}\n```\n"
        if job['recipe_id']:
            msg += f"\n✅ Recipe ID: `{job['recipe_id']}`\n"

        msg += f"\n💡 Lösche mit: `/job delete {str(job['id'])[:12]}`"

        await update.message.reply_text(msg, parse_mode="Markdown")
        db.close()
        logger.info(f"Admin {user_id} requested job details: {job_id}")

    except Exception as e:
        logger.exception(f"Error in /job details command: {e}")
        await update.message.reply_text(f"❌ Fehler: {e}")


async def _delete_job(update: Update, user_id: str, job_id: str) -> None:
    """Deletes a job from the queue."""
    try:
        import psycopg2

        db = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
        )
        cursor = db.cursor()

        # Find the job first
        cursor.execute(
            "SELECT id, source_url FROM import_queue WHERE id::text LIKE %s LIMIT 1",
            (f"{job_id}%",)
        )
        job = cursor.fetchone()

        if not job:
            await update.message.reply_text("❌ Job nicht gefunden")
            db.close()
            return

        full_job_id = job[0]

        # Delete the job
        cursor.execute("DELETE FROM import_queue WHERE id = %s", (full_job_id,))
        db.commit()
        db.close()

        msg = f"✅ Job gelöscht:\n\n"
        msg += f"ID: `{full_job_id}`\n"
        msg += f"URL: {job[1]}\n\n"
        msg += f"Der Job wurde aus der Queue entfernt."

        await update.message.reply_text(msg, parse_mode="Markdown")
        logger.info(f"Admin {user_id} deleted job: {full_job_id}")

    except Exception as e:
        logger.exception(f"Error deleting job: {e}")
        await update.message.reply_text(f"❌ Fehler beim Löschen: {e}")


async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles text messages — URL extraction and queueing."""
    user_id = update.effective_user.id
    text = update.message.text
    
    # Access control — DB-backed lookup
    user_id_str = get_user_id_for_telegram(user_id)
    if user_id_str is None:
        await update.message.reply_text(
            "❌ Kein Miximixi-Account verknüpft.\n\n"
            "Öffne Miximixi im Browser, gehe zu deinem Profil und scanne den QR-Code."
        )
        return
    
    # URL extraction
    urls = re.findall(r'https?://[^\s]+', text)
    if not urls:
        await update.message.reply_text(
            "❌ Ich konnte keinen Link in deiner Nachricht finden.\n"
            "Schreib einfach einen Link zu einem Instagram-Post, YouTube-Video oder einer Website."
        )
        return
    
    url = urls[0]  # Take first URL if multiple
    
    # Queue the job
    try:
        import psycopg2
        import psycopg2.errors
        from psycopg2.extras import RealDictCursor
        
        db = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
        )
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Detect source type and extract identifier
        source_type = get_source_type_from_url(url)
        source_id = extract_source_id(url)

        # Check if recipe already exists (deduplication by source_type + source_id)
        if source_type in ('instagram', 'youtube') and source_id:
            cursor.execute(
                "SELECT id FROM recipes WHERE source_type = %s AND source_id = %s LIMIT 1",
                (source_type, source_id)
            )
            if cursor.fetchone():
                await update.message.reply_text(
                    f"❌ Dieses Rezept existiert bereits in meiner Sammlung.\n"
                    f"Schau es dir doch an oder probier einen anderen Link!"
                )
                db.close()
                return
        # For web URLs, fall back to full URL check (source_id is None)
        else:
            cursor.execute(
                "SELECT id FROM recipes WHERE source_url = %s LIMIT 1",
                (url,)
            )
            if cursor.fetchone():
                await update.message.reply_text(
                    f"❌ Dieses Rezept existiert bereits in meiner Sammlung.\n"
                    f"Schau es dir doch an oder probier einen anderen Link!"
                )
                db.close()
                return

        # Check if already processing (pending or processing status)
        cursor.execute(
            "SELECT id, status FROM import_queue WHERE source_url = %s AND status IN (%s, %s) LIMIT 1",
            (url, "pending", "processing")
        )
        job_in_progress = cursor.fetchone()
        if job_in_progress:
            await update.message.reply_text(
                "⏳ Dieser Link wird gerade schon verarbeitet.\n"
                "Du erhältst bald eine Bestätigung!"
            )
            db.close()
            return

        # Check if job failed before (needs_review status)
        cursor.execute(
            "SELECT id, error_msg FROM import_queue WHERE source_url = %s AND status = %s LIMIT 1",
            (url, "needs_review")
        )
        failed_job = cursor.fetchone()
        if failed_job:
            error_msg = failed_job[1] or "Unbekannter Fehler"

            # Humanize error message for users
            humanized = humanize_error(error_msg)

            msg = (
                "⚠️ *Diesen Link habe ich schon versucht zu verarbeiten*\n\n"
                f"{humanized}\n\n"
                "Bitte versuche einen anderen Link oder kontaktiere den Admin."
            )
            await update.message.reply_text(msg, parse_mode="Markdown")
            db.close()
            return
        
        # Insert into import_queue
        # Try with telegram_chat_id (if column exists), fall back without it
        try:
            cursor.execute(
                """
                INSERT INTO import_queue (source_url, source_type, status, telegram_chat_id)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (url, source_type, "pending", str(user_id))
            )
        except psycopg2.errors.UndefinedColumn:
            # Fallback: Column doesn't exist yet (migration not applied)
            cursor.execute(
                """
                INSERT INTO import_queue (source_url, source_type, status)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (url, source_type, "pending")
            )
        
        job_id = cursor.fetchone()["id"]
        db.commit()
        db.close()
        
        logger.info(f"Job queued: {job_id}, user={user_id}, url={url}, type={source_type}")
        
        # Send confirmation
        await update.message.reply_text(
            f"⏳ Link erkannt! ({source_type})\n\n"
            f"Rezept wird gerade extrahiert...\n"
            f"Du erhältst gleich eine Bestätigung! 🍳"
        )
        
    except Exception as e:
        logger.exception(f"Error queuing job for user {user_id}: {e}")
        await update.message.reply_text(
            "❌ Fehler beim Einreihen. Bitte später erneut versuchen."
        )


# ── Notification Callback ────────────────────────────────────────────────────
async def notify(
    chat_id: Optional[str],
    success: bool,
    recipe_title: Optional[str] = None,
    recipe_id: Optional[str] = None,
    error_msg: Optional[str] = None,
    source_url: Optional[str] = None,
    app: Optional[Application] = None,
) -> None:
    """
    Sends a notification to the user after job completion.

    Args:
        chat_id: Telegram chat ID (user ID) or None for no user notification
        success: True if extraction succeeded
        recipe_title: Extracted recipe title (if success)
        recipe_id: Recipe ID for creating deep link
        error_msg: Error message (if not success)
        source_url: Original URL for logging/context
        app: Telegram Application instance (injected from run_bot)
    """
    if not chat_id or not app:
        return

    import re

    def _generate_slug(title: str) -> str:
        """Generiert einen URL-sicheren Slug aus dem Rezepttitel (same as backend)."""
        slug = title.lower().strip()
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'[-\s]+', '-', slug)
        return slug.strip('-')

    try:
        import html as html_module
        if success and recipe_title and recipe_id:
            slug = f"{_generate_slug(recipe_title)}-{recipe_id}"
            base_url = settings.frontend_url.rstrip("/")
            recipe_url = f"{base_url}/recipes/{slug}"

            # Use HTML parse mode — Markdown breaks on titles with parentheses/special chars
            safe_title = html_module.escape(recipe_title)
            safe_url = html_module.escape(recipe_url)
            text = (
                f"✅ Rezept erfolgreich importiert!\n\n"
                f'📖 <a href="{safe_url}">{safe_title}</a>\n\n'
                f"Schau es dir jetzt in der App an und viel Spaß beim Kochen! 🍳"
            )
        else:
            humanized_error = humanize_error(error_msg or "Unbekannter Fehler")
            text = (
                f"{humanized_error}\n\n"
                f"Wenn das Problem weiterhin besteht, kontaktiere den Admin."
            )

        await app.bot.send_message(
            chat_id=int(chat_id),
            text=text,
            parse_mode="HTML"
        )
        logger.info(f"Notification sent to {chat_id}: success={success}")
    except Exception as e:
        logger.warning(f"Failed to send notification to {chat_id}: {e}")


# ── Instagram Auth Status Command (admin-only) ───────────────────────────────
async def auth_status_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    if settings.telegram_admin_ids and user_id not in settings.telegram_admin_ids:
        await update.message.reply_text("Keine Berechtigung.")
        return

    state = get_auth_state()
    cookie_ok = is_cookie_valid(threshold_days=settings.instagram_cookie_refresh_threshold_days)

    def fmt_dt(dt):
        return dt.strftime("%Y-%m-%d %H:%M UTC") if dt else "nie"

    status_icon = "✅" if cookie_ok else "❌"
    lines = [
        f"{status_icon} *Instagram Auth Status*",
        "",
        f"Cookie gültig: {'ja' if cookie_ok else 'nein (abgelaufen oder fehlt)'}",
        f"Letzter Check: {fmt_dt(state.get('last_checked_at'))}",
        f"Letzter Refresh: {fmt_dt(state.get('last_refresh_at'))}",
        f"Fehlgeschlagene Versuche: {state.get('refresh_fail_count', 0)}",
    ]
    if state.get("last_error"):
        lines.append(f"Letzter Fehler: `{state['last_error']}`")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def refresh_cookies_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    if settings.telegram_admin_ids and user_id not in settings.telegram_admin_ids:
        await update.message.reply_text("Keine Berechtigung.")
        return

    from app.instagram_auth import refresh_cookies_via_instaloader, get_auth_state, is_cookie_valid
    await update.message.reply_text("🔄 Starte Instagram Login via instaloader...")

    try:
        success = await refresh_cookies_via_instaloader()
    except Exception as e:
        await update.message.reply_text(f"❌ Login-Fehler:\n\n`{e}`", parse_mode="Markdown")
        return

    if success:
        await update.message.reply_text("✅ Cookie-Refresh erfolgreich! Instagram-Cookies wurden erneuert.")
    else:
        state = get_auth_state()
        error = state.get("last_error") or "Unbekannter Fehler"
        await update.message.reply_text(f"❌ Cookie-Refresh fehlgeschlagen:\n\n`{error}`", parse_mode="Markdown")


# ── Instagram Sync Commands (admin-only) ─────────────────────────────────────
async def sync_status_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_status command — show Instagram sync state."""
    user_id = update.effective_user.id
    
    if not is_admin(user_id):
        await update.message.reply_text("❌ Nur Admin-Benutzer können Sync-Befehle nutzen")
        logger.warning(f"Non-admin user {user_id} tried /sync_status")
        return
    
    # Get sync control status (passed via context.bot_data)
    sync_control = context.bot_data.get("sync_control")
    if not sync_control:
        await update.message.reply_text("⚠️ Sync-System nicht initialisiert")
        return
    
    status = sync_control.get_status()
    
    msg = "📊 Instagram Sync Status\n\n"
    msg += f"Status: {'✅ Aktiv' if status['enabled'] else '⏸️ Inaktiv'}\n"
    msg += f"Ausgewählte Sammlung: {status['collection_name'] if status['collection_id'] else '(keine)'}\n"
    
    if status["last_sync"]:
        msg += f"Letzter Sync: {status['last_sync']}\n"
        if status["last_stats"]:
            stats = status["last_stats"]
            msg += f"  └─ {stats.get('queued', 0)} neu queued, {stats.get('skipped', 0)} übersprungen"
    else:
        msg += "Letzter Sync: (noch kein Sync)\n"
    
    await update.message.reply_text(msg)


async def sync_enable_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_enable command — enable automatic syncing."""
    user_id = update.effective_user.id
    
    if not is_admin(user_id):
        await update.message.reply_text("❌ Nur Admin-Benutzer können /sync_enable nutzen")
        return
    
    sync_control = context.bot_data.get("sync_control")
    if not sync_control:
        await update.message.reply_text("⚠️ Sync-System nicht initialisiert")
        return
    
    sync_control.enable()
    await update.message.reply_text("✅ Instagram Sync aktiviert\nNächster Sync: in 15 Minuten")
    logger.info(f"Admin {user_id} enabled Instagram sync")


async def sync_disable_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_disable command — disable automatic syncing."""
    user_id = update.effective_user.id
    
    if not is_admin(user_id):
        await update.message.reply_text("❌ Nur Admin-Benutzer können /sync_disable nutzen")
        return
    
    sync_control = context.bot_data.get("sync_control")
    if not sync_control:
        await update.message.reply_text("⚠️ Sync-System nicht initialisiert")
        return
    
    sync_control.disable()
    await update.message.reply_text("⏸️ Instagram Sync deaktiviert")
    logger.info(f"Admin {user_id} disabled Instagram sync")


async def sync_setup_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_setup command — interactive collection selection menu."""
    user_id = update.effective_user.id
    
    if not is_admin(user_id):
        await update.message.reply_text("❌ Nur Admin-Benutzer können /sync_setup nutzen")
        return
    
    sync_control = context.bot_data.get("sync_control")
    if not sync_control:
        await update.message.reply_text("⚠️ Sync-System nicht initialisiert")
        return
    
    try:
        # Try to fetch available collections
        from app.instagram_sync_worker import get_available_collections
        
        await update.message.reply_text("🔄 Lade verfügbare Instagram-Sammlungen...")
        
        collections = await get_available_collections()
        
        if not collections:
            await update.message.reply_text(
                "❌ Keine Instagram-Sammlungen gefunden.\n\n"
                "Gründe:\n"
                "1. Keine Sammlungen erstellt auf Instagram\n"
                "2. Instagram-Authentifizierung fehlgeschlagen\n\n"
                "Lösung:\n"
                "1. Erstelle eine Sammlung auf Instagram (Instagram > Profil > Sammlungen)\n"
                "2. Exportiere neue cookies.txt via 'Get cookies.txt LOCALLY'\n"
                "3. Ersetze backend/instagram_cookies.txt\n"
                "4. Starte den Server neu und versuche /sync_setup erneut"
            )
            return
        
        # Build inline keyboard with collection buttons
        keyboard = []
        for coll in collections:
            button_text = f"{coll['collection_name']} ({coll['post_count']} posts)"
            button = InlineKeyboardButton(
                text=button_text,
                callback_data=f"select_collection_{coll['collection_id']}"
            )
            keyboard.append([button])
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        msg = "📋 Verfügbare Instagram-Sammlungen:\n\n" \
              "Bitte wähle eine Sammlung zum Synchronisieren aus:\n"
        
        await update.message.reply_text(msg, reply_markup=reply_markup)
        logger.info(f"Admin {user_id} opened /sync_setup with {len(collections)} collections")
    
    except Exception as auth_error:
        from app.instagram_sync_worker import RateLimitError
        if isinstance(auth_error, RateLimitError):
            await update.message.reply_text(
                f"⏳ Instagram nicht erreichbar:\n\n{str(auth_error)}\n\n"
                "Bitte etwas warten und es erneut versuchen."
            )
            logger.warning(f"Instagram challenge/rate-limit for /sync_setup: {auth_error}", exc_info=False)
        elif isinstance(auth_error, ValueError):
            await update.message.reply_text(
                f"❌ Instagram-Authentifizierung fehlgeschlagen:\n\n"
                f"{str(auth_error)}\n\n"
                f"Lösung:\n"
                f"1. Gehe zu instagram.com und melde dich an\n"
                f"2. Exportiere neue cookies.txt via 'Get cookies.txt LOCALLY'\n"
                f"3. Ersetze backend/instagram_cookies.txt\n"
                f"4. Starte den Server neu und versuche /sync_setup erneut"
            )
            logger.warning(f"Instagram auth failed for /sync_setup: {auth_error}", exc_info=False)
        else:
            logger.exception(f"Error in /sync_setup: {auth_error}")
            await update.message.reply_text(f"❌ Fehler: {str(auth_error)[:100]}\n\nBitte die Logs überprüfen")


async def collection_select_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle collection selection via inline button."""
    query = update.callback_query
    user_id = query.from_user.id
    
    if not is_admin(user_id):
        await query.answer("❌ Nur Admin", show_alert=True)
        return
    
    # Extract collection ID from callback_data
    collection_id = query.data.replace("select_collection_", "")
    
    sync_control = context.bot_data.get("sync_control")
    if not sync_control:
        await query.answer("⚠️ Sync-System nicht initialisiert", show_alert=True)
        return
    
    try:
        # Get available collections to find the selected one
        from app.instagram_sync_worker import get_available_collections
        
        collections = await get_available_collections()
        selected_coll = next((c for c in collections if c['collection_id'] == collection_id), None)
        
        if not selected_coll:
            await query.answer("❌ Sammlung nicht gefunden", show_alert=True)
            return
        
        # Update sync control
        sync_control.set_collection(collection_id, selected_coll['collection_name'])
        
        # Update database (delete old, insert new)
        import psycopg2
        from psycopg2.extras import RealDictCursor
        
        db = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
        )
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Disable all previous collections
        cursor.execute("""
            UPDATE instagram_sync_collections
            SET disabled_at = CURRENT_TIMESTAMP
            WHERE disabled_at IS NULL
        """)
        
        # Insert new selected collection
        cursor.execute("""
            INSERT INTO instagram_sync_collections (collection_id, collection_name, enabled_at, selected_by_telegram_id)
            VALUES (%s, %s, CURRENT_TIMESTAMP, %s)
            ON CONFLICT (collection_id) DO UPDATE
            SET enabled_at = CURRENT_TIMESTAMP, disabled_at = NULL
        """, (collection_id, selected_coll['collection_name'], str(user_id)))
        
        db.commit()
        db.close()
        
        # Edit message to confirm selection
        msg = f"✅ Sammlung ausgewählt:\n\n" \
              f"📌 {selected_coll['collection_name']}\n" \
              f"🔗 ID: {collection_id}\n" \
              f"📊 Posts: {selected_coll['post_count']}\n\n" \
              f"⏱️ Der Sync startet beim nächsten Poll (in ~15 Minuten)"
        
        await query.edit_message_text(msg)
        await query.answer("✅ Sammlung ausgewählt", show_alert=False)
        logger.info(f"Admin {user_id} selected collection {collection_id}")
    
    except Exception as e:
        logger.exception(f"Error selecting collection: {e}")
        await query.answer(f"❌ Fehler: {str(e)[:50]}", show_alert=True)


async def sync_now_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /sync_now command — trigger manual sync."""
    user_id = update.effective_user.id
    
    if not is_admin(user_id):
        await update.message.reply_text("❌ Nur Admin-Benutzer können /sync_now nutzen")
        return
    
    sync_control = context.bot_data.get("sync_control")
    if not sync_control:
        await update.message.reply_text("⚠️ Sync-System nicht initialisiert")
        return
    
    # Check if collection is selected
    if not sync_control.selected_collection_id:
        await update.message.reply_text(
            "❌ Keine Sammlung ausgewählt!\n"
            "Nutze /sync_setup um eine Sammlung zu wählen"
        )
        return
    
    await update.message.reply_text("🔄 Sync wird ausgelöst...")
    
    try:
        # Import here to avoid circular imports
        from app.instagram_sync_worker import run_instagram_sync
        
        # Run sync once
        stats = await run_instagram_sync(sync_control, run_once=True)
        
        if "error" in stats:
            await update.message.reply_text(
                f"❌ Sync-Fehler:\n\n{stats['error']}"
            )
        else:
            msg = f"📊 Sync abgeschlossen:\n" \
                  f"- {stats.get('total_posts', 0)} Posts geprüft\n" \
                  f"- {stats.get('queued', 0)} neue Rezepte queued\n" \
                  f"- {stats.get('skipped', 0)} übersprungen\n" \
                  f"- {stats.get('errors', 0)} Fehler"
            
            await update.message.reply_text(msg)
        
        logger.info(f"Admin {user_id} triggered manual sync: {stats}")
    
    except ValueError as auth_error:
        # Instagram auth failed
        await update.message.reply_text(
            f"❌ Instagram-Authentifizierung fehlgeschlagen:\n\n"
            f"{str(auth_error)}\n\n"
            f"Lösung:\n"
            f"1. Gehe zu instagram.com und melde dich an\n"
            f"2. Exportiere neue cookies.txt via 'Get cookies.txt LOCALLY'\n"
            f"3. Ersetze backend/instagram_cookies.txt\n"
            f"4. Starte den Server neu und versuche /sync_now erneut"
        )
        logger.warning(f"Instagram auth failed for /sync_now: {auth_error}", exc_info=False)
    
    except Exception as e:
        logger.exception(f"Error in /sync_now: {e}")
        await update.message.reply_text(f"❌ Fehler: {str(e)[:100]}")


# ── Bot Startup ──────────────────────────────────────────────────────────────
async def run_bot(set_notify_callback: Callable[[Callable], None], sync_control=None) -> None:
    """
    Starts the Telegram bot in polling mode.
    Accepts a callback setter to inject the notification function into the app context.
    Accepts sync_control for Instagram sync commands.
    
    Args:
        set_notify_callback: Function that receives the notify callback for wiring
        sync_control: SyncControl instance for /sync_* commands
    """
    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN not set — bot not started")
        return
    
    # Build application
    app = Application.builder().token(settings.telegram_bot_token).build()
    
    # Store sync_control in bot_data for use in handlers
    if sync_control:
        app.bot_data["sync_control"] = sync_control
    
    # Wire the notify callback for the queue worker
    # Create a closure that captures the app instance
    async def notify_with_app(**kwargs):
        await notify(**kwargs, app=app)
    
    set_notify_callback(notify_with_app)
    
    # Error handler — log errors, but do NOT stop the bot on Conflict.
    # python-telegram-bot already retries after 409 automatically.
    # Calling updater.stop() on Conflict was self-defeating: we killed our own bot
    # and handed victory to the competing poller.
    async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle errors from polling."""
        if not context.error:
            return
        if "Conflict" in str(context.error):
            # Another poller is active — python-telegram-bot will retry automatically.
            # Just log and wait it out. DO NOT stop the updater.
            logger.warning(
                "⚠️ 409 Conflict — another poller is active. "
                "The library will retry. Check for competing bots (n8n, other deployments)."
            )
        else:
            logger.error(f"Telegram Bot error: {context.error}", exc_info=context.error)
    
    app.add_error_handler(error_handler)
    
    # Add handlers
    app.add_handler(CommandHandler("start", start_handler))
    app.add_handler(CommandHandler("getchatid", getchatid_handler))
    app.add_handler(CommandHandler("jobs", jobs_handler))
    app.add_handler(CommandHandler("job", job_details_handler))
    app.add_handler(CommandHandler("sync_setup", sync_setup_handler))
    app.add_handler(CommandHandler("sync_status", sync_status_handler))
    app.add_handler(CommandHandler("sync_enable", sync_enable_handler))
    app.add_handler(CommandHandler("sync_disable", sync_disable_handler))
    app.add_handler(CommandHandler("sync_now", sync_now_handler))
    app.add_handler(CommandHandler("auth_status", auth_status_handler))
    app.add_handler(CommandHandler("refresh_cookies", refresh_cookies_handler))
    app.add_handler(CallbackQueryHandler(collection_select_callback, pattern="^select_collection_"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    
    logger.info("Telegram Bot gestartet (polling mode)")
    
    try:
        # PTB v21 correct lifecycle: initialize → start → poll → stop → shutdown
        # 'async with app:' only does initialize()+shutdown() — it does NOT call start()
        # Without app.start(), the update dispatch loop never runs and handlers never fire.
        await app.initialize()
        await app.start()  # Starts the update processor so handlers actually dispatch
        
        # start_polling internally calls deleteWebhook when drop_pending_updates=True,
        # so no manual deleteWebhook call is needed here.
        await app.updater.start_polling(
            allowed_updates=Update.ALL_TYPES,
            drop_pending_updates=True,
        )
        logger.info("Telegram Bot polling started")
        
        # Keep alive until the task is cancelled by lifespan shutdown
        await asyncio.Event().wait()
        
    except asyncio.CancelledError:
        logger.info("Telegram Bot shutdown signal received")
    except Exception as e:
        logger.exception(f"Telegram Bot fatal error: {e}")
    finally:
        # Guaranteed cleanup regardless of how we got here.
        # Order matters: stop polling first, then stop app processor, then tear down.
        logger.info("Telegram Bot cleaning up...")
        try:
            await app.updater.stop()
        except Exception as e:
            logger.warning(f"Error stopping updater: {e}")
        try:
            await app.stop()
        except Exception as e:
            logger.warning(f"Error stopping application: {e}")
        try:
            await app.shutdown()
        except Exception as e:
            logger.warning(f"Error shutting down: {e}")
        logger.info("Telegram Bot shutdown complete")
