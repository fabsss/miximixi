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
            recipe_url = f"{settings.frontend_url}/recipes/{slug}"

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
    
    except ValueError as auth_error:
        # Instagram auth failed
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
    
    except Exception as e:
        logger.exception(f"Error in /sync_setup: {e}")
        await update.message.reply_text(f"❌ Fehler: {str(e)[:100]}\n\nBitte die Logs überprüfen")


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
    app.add_handler(CommandHandler("sync_setup", sync_setup_handler))
    app.add_handler(CommandHandler("sync_status", sync_status_handler))
    app.add_handler(CommandHandler("sync_enable", sync_enable_handler))
    app.add_handler(CommandHandler("sync_disable", sync_disable_handler))
    app.add_handler(CommandHandler("sync_now", sync_now_handler))
    app.add_handler(CommandHandler("auth_status", auth_status_handler))
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
