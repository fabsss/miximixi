"""
Telegram Bot: Handles /start, URL submissions, access control, and notifications.
Replaces n8n Telegram integration with native FastAPI.

Architecture:
  User → Bot (polling) → import_queue → run_worker → notify() → User
"""
import asyncio
import logging
import re
from typing import Callable, Optional
from urllib.parse import urlparse

from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

from app.config import settings

logger = logging.getLogger(__name__)


# ── URL Detection ────────────────────────────────────────────────────────────
def detect_source_type(url: str) -> str:
    """
    Erkennt den Quell-Typ einer URL.
    Returns: "instagram" | "youtube" | "web"
    """
    url_lower = url.lower()
    
    # Instagram
    if "instagram.com" in url_lower or "instagr.am" in url_lower:
        return "instagram"
    
    # YouTube
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "youtube"
    
    # Web fallback
    return "web"


# ── Access Control ───────────────────────────────────────────────────────────
def is_allowed(user_id: int) -> bool:
    """
    Prüft, ob ein User die Bot-Nutzung erlaubt ist.
    Empty allowlist = all users allowed.
    """
    if not settings.telegram_allowed_user_ids:
        return True
    
    allowed_str = [str(user_id) for user_id in settings.telegram_allowed_user_ids]
    return str(user_id) in allowed_str


# ── Error Humanization ───────────────────────────────────────────────────────
def humanize_error(error: str) -> str:
    """
    Konvertiert technische Fehler in benutzerfreundliche Deutsche Meldungen.
    """
    error_lower = error.lower()
    
    # Download & connectivity errors
    if any(w in error_lower for w in ["download", "404", "not found", "connection", "timeout"]):
        return "❌ Video/Seite konnte nicht heruntergeladen werden. Bitte später erneut versuchen."
    
    # Instagram & auth errors
    if any(w in error_lower for w in ["instagram", "cookie", "unauthorized", "403", "access"]):
        return "❌ Zugriff fehlgeschlagen. Das könnte ein Cookie-Fehler sein. Bitte den Admin kontaktieren."
    
    # Recipe extraction errors
    if any(w in error_lower for w in ["recipe", "extract", "parsing", "json", "no recipe"]):
        return "❌ Kein Rezept im Video/auf der Seite gefunden. Bitte ein anderes probieren."
    
    # Timeout
    if "timeout" in error_lower:
        return "❌ Verarbeitung hat zu lange gedauert. Bitte später erneut versuchen."
    
    # Generic fallback
    return f"❌ Technischer Fehler: {error[:100]}"


# ── Telegram Handlers ────────────────────────────────────────────────────────
async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles /start command."""
    user_id = update.effective_user.id
    
    # Access control
    if not is_allowed(user_id):
        await update.message.reply_text(
            "❌ Du hast keinen Zugriff auf diesen Bot.\n"
            "Bitte den Admin kontaktieren."
        )
        logger.warning(f"Unauthorized user {user_id} tried /start")
        return
    
    welcome_msg = (
        "👋 Hallo! Ich bin der Miximixi Recipe Bot.\n\n"
        "🍳 *So funktioniert es:*\n"
        "1. Sende mir einen Link zu einem Instagram-Post, YouTube-Video oder einer Website mit einem Rezept\n"
        "2. Ich extrahiere automatisch das Rezept\n"
        "3. Du erhältst eine Bestätigung wenn alles klappt\n\n"
        "📝 *Unterstützte Quellen:*\n"
        "• Instagram (Posts & Reels)\n"
        "• YouTube Videos\n"
        "• Website-Links\n\n"
        "Los geht's! 🚀"
    )
    await update.message.reply_text(welcome_msg, parse_mode="Markdown")


async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles text messages — URL extraction and queueing."""
    user_id = update.effective_user.id
    text = update.message.text
    
    # Access control
    if not is_allowed(user_id):
        await update.message.reply_text("❌ Du hast keinen Zugriff auf diesen Bot.")
        logger.warning(f"Unauthorized user {user_id} sent message")
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
        from psycopg2.extras import RealDictCursor
        
        db = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
        )
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Check if recipe already exists (duplicate prevention)
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
        
        # Check if already in queue
        cursor.execute(
            "SELECT id FROM import_queue WHERE source_url = %s AND status != %s LIMIT 1",
            (url, "done")
        )
        if cursor.fetchone():
            await update.message.reply_text(
                "⏳ Dieser Link wird gerade schon verarbeitet.\n"
                "Du erhältst bald eine Bestätigung!"
            )
            db.close()
            return
        
        # Detect source type
        source_type = detect_source_type(url)
        
        # Insert into import_queue with telegram_chat_id
        cursor.execute(
            """
            INSERT INTO import_queue (source_url, source_type, status, telegram_chat_id)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (url, source_type, "pending", str(user_id))
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
        error_msg: Error message (if not success)
        source_url: Original URL for logging/context
        app: Telegram Application instance (injected from run_bot)
    """
    if not chat_id or not app:
        return
    
    try:
        if success and recipe_title:
            text = (
                f"✅ Rezept erfolgreich importiert!\n\n"
                f"📖 *{recipe_title}*\n\n"
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
            parse_mode="Markdown"
        )
        logger.info(f"Notification sent to {chat_id}: success={success}")
    except Exception as e:
        logger.warning(f"Failed to send notification to {chat_id}: {e}")


# ── Bot Startup ──────────────────────────────────────────────────────────────
async def run_bot(set_notify_callback: Callable[[Callable], None]) -> None:
    """
    Starts the Telegram bot in polling mode.
    Accepts a callback setter to inject the notification function into the app context.
    
    Args:
        set_notify_callback: Function that receives the notify callback for wiring
    """
    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN not set — bot not started")
        return
    
    # Build application
    app = Application.builder().token(settings.telegram_bot_token).build()
    
    # Wire the notify callback for the queue worker
    # Create a closure that captures the app instance
    async def notify_with_app(**kwargs):
        await notify(**kwargs, app=app)
    
    set_notify_callback(notify_with_app)
    
    # Add handlers
    app.add_handler(CommandHandler("start", start_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    
    logger.info("Telegram Bot gestartet (polling mode)")
    
    try:
        await app.initialize()
        await app.start()
        await app.updater.start_polling(allowed_updates=Update.ALL_TYPES)
        
        # Keep running until cancelled
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        logger.info("Telegram Bot shutting down...")
        await app.updater.stop()
        await app.stop()
        await app.shutdown()
    except Exception as e:
        logger.exception(f"Telegram Bot error: {e}")
