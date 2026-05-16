from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
import logging
import httpx

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",  # Felder für andere Services (Supabase, Vite) ignorieren
        case_sensitive=False,  # Allow both ALLOWED_ORIGINS and allowed_origins
    )

    # LLM
    llm_provider: str = "ollama"  # ollama | gemini | claude | openai | openai_compat | gemma3n

    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "llama3.2-vision:11b"

    # Google Gemini (bevorzugter Cloud-Provider, native Video-Unterstützung)
    google_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    openai_compat_base_url: str = ""
    openai_compat_api_key: str = ""
    openai_compat_model: str = ""

    # Gemma 3n (lokal via Ollama, Frame-basiert)
    gemma3n_base_url: str = "http://ollama:11434"
    gemma3n_model: str = "gemma3n:e4b"

    # PostgreSQL Database
    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "postgres"
    db_password: str = "postgres"
    db_name: str = "miximixi"

    # Image Storage
    images_dir: str = "/data/recipe-images"

    # Telegram
    telegram_bot_token: str = ""
    telegram_notify_chat_id: str = ""
    
    # Format: "123456,789012" (comma-separated). Empty = all users allowed.
    # Stored as raw string to avoid Pydantic trying JSON parsing on list[str] fields
    telegram_allowed_user_ids_str: str = Field(default="", validation_alias="TELEGRAM_ALLOWED_USER_IDS")
    
    # Format: "123456,789012" (comma-separated). For admin-only commands (/sync_*)
    # Stored as raw string to avoid Pydantic trying JSON parsing on list[str] fields
    telegram_admin_ids_str: str = Field(default="", validation_alias="TELEGRAM_ADMIN_IDS")

    @property
    def telegram_allowed_user_ids(self) -> list[str]:
        """Parse allowed user IDs from comma-separated string."""
        if not self.telegram_allowed_user_ids_str:
            return []
        return [uid.strip() for uid in self.telegram_allowed_user_ids_str.split(",") if uid.strip()]
    
    @property
    def telegram_admin_ids(self) -> list[str]:
        """Parse admin IDs from comma-separated string."""
        if not self.telegram_admin_ids_str:
            return []
        return [uid.strip() for uid in self.telegram_admin_ids_str.split(",") if uid.strip()]

    # Frontend URL for deep links in Telegram notifications and CORS
    frontend_url: str = Field(default="https://miximixi.example.com", validation_alias="FRONTEND_URL")

    # Allow additional origins for development (e.g., localhost:3000, localhost:5173)
    # Format: "http://localhost:3000,http://localhost:5173" (comma-separated)
    allowed_origins: str = Field(default="", validation_alias="ALLOWED_ORIGINS")

    # Auth
    secret_key: str = ""          # JWT signing secret — fetched from Vaultwarden
    admin_key: str = ""           # X-Admin-Key for POST /auth/register — fetched from Vaultwarden
    encryption_key: str = ""      # Fernet key for Instagram passwords — fetched from Vaultwarden

    # Telegram
    telegram_bot_username: str = "miximixi_bot"

    # Vaultwarden API Proxy (retrieves secrets at startup)
    vaultwarden_api_url: str = "http://vaultwarden-api:8080"
    vaultwarden_api_key: str = ""

    # Worker
    worker_max_concurrent: int = 3
    # 1 = seriell (für lokale LLMs: Ollama, Gemma3n — nur ein Modell)
    # 3 = parallel (für Cloud-LLMs: Gemini, Claude, OpenAI)

    # Instagram
    instagram_username: str = ""
    instagram_password: str = ""
    instagram_collection_id: str = ""
    instagram_session_file: str = "instagram_session.json"
    instagram_cookies_file: str = "/mnt/data/miximixi/instagram_cookies.txt"
    instagram_browser_state_dir: str = "/mnt/data/miximixi/instagram_browser_state"
    instagram_cookie_refresh_threshold_days: int = 7
    instagram_cookie_max_refresh_retries: int = 2
    instagram_cookie_retry_interval: int = 1800  # 30 Minuten

    # Instagram Sync Worker
    instagram_sync_enabled: bool = True  # Can disable for testing
    instagram_sync_interval: int = 900  # 15 minutes (in seconds)

    # Temp storage for media downloads
    tmp_dir: str = "/tmp/miximixi"

    def __init__(self, **data):
        super().__init__(**data)

        # Try to fetch secrets from Vaultwarden API if configured
        if self.vaultwarden_api_key:
            logger.warning(f"🔐 Vaultwarden API configured. Attempting to fetch secrets...")
            try:
                self._fetch_secrets_from_vaultwarden_api()
            except Exception as e:
                logger.warning(f"⚠️ Vaultwarden API fetch failed ({e}). Falling back to env variables.")
                import traceback
                logger.warning(f"Traceback: {traceback.format_exc()}")
        else:
            logger.warning("⚠️ Vaultwarden API not configured (VAULTWARDEN_API_KEY empty). Using env variables for secrets.")

    def _fetch_secrets_from_vaultwarden_api(self):
        """Fetch SECRET_KEY, ADMIN_KEY, ENCRYPTION_KEY from Vaultwarden API Server."""
        try:
            base_url = self.vaultwarden_api_url.rstrip('/')
            headers = {
                "Authorization": f"Bearer {self.vaultwarden_api_key}",
            }

            logger.warning(f"🔐 Fetching secrets from Vaultwarden API Server: {base_url}")

            # Fetch each secret individually from the API
            secrets_map = {}
            for secret_name in ("SECRET_KEY", "ADMIN_KEY", "ENCRYPTION_KEY"):
                logger.warning(f"🔍 Fetching {secret_name}...")
                response = httpx.get(
                    f"{base_url}/secret/{secret_name}",
                    headers=headers,
                    timeout=10.0
                )

                if response.status_code == 200:
                    # API returns JSON: {"name":"SECRET_KEY","value":"..."}
                    data = response.json()
                    secret_value = data.get("value", "").strip()
                    if secret_value:
                        secrets_map[secret_name.lower()] = secret_value
                        logger.warning(f"✅ Fetched {secret_name}")
                    else:
                        logger.warning(f"⚠️ {secret_name} value is empty")
                elif response.status_code == 404:
                    logger.warning(f"⚠️ {secret_name} not found in Vaultwarden")
                else:
                    logger.error(f"❌ Failed to fetch {secret_name}: {response.status_code}")
                    response.raise_for_status()

            # Apply secrets to settings
            if "secret_key" in secrets_map:
                self.secret_key = secrets_map["secret_key"]
                logger.warning("✅ SECRET_KEY loaded")
            if "admin_key" in secrets_map:
                self.admin_key = secrets_map["admin_key"]
                logger.warning("✅ ADMIN_KEY loaded")
            if "encryption_key" in secrets_map:
                self.encryption_key = secrets_map["encryption_key"]
                logger.warning("✅ ENCRYPTION_KEY loaded")

            if secrets_map:
                logger.warning(f"✅ Loaded {len(secrets_map)}/3 secrets from Vaultwarden API")
            else:
                logger.warning("⚠️ No secrets found in Vaultwarden API")

        except httpx.HTTPError as e:
            logger.error(f"❌ Vaultwarden API error: {e}")
            raise RuntimeError(f"Cannot fetch secrets from Vaultwarden API: {e}") from e
        except Exception as e:
            logger.error(f"❌ Error fetching secrets: {e}")
            raise RuntimeError(f"Cannot fetch secrets from Vaultwarden API: {e}") from e


settings = Settings()
