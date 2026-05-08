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

    # Frontend URL for deep links in Telegram notifications
    frontend_url: str = "https://miximixi.example.com"

    # Auth
    secret_key: str = ""          # JWT signing secret — fetched from Vaultwarden
    admin_key: str = ""           # X-Admin-Key for POST /auth/register — fetched from Vaultwarden
    encryption_key: str = ""      # Fernet key for Instagram passwords — fetched from Vaultwarden

    # Telegram
    telegram_bot_username: str = "miximixi_bot"

    # Vaultwarden Secrets Manager
    vaultwarden_url: str = "http://vaultwarden:80/api"
    vaultwarden_client_id: str = ""
    vaultwarden_client_secret: str = ""

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

        # Try to fetch secrets from Vaultwarden if configured
        if self.vaultwarden_client_id and self.vaultwarden_client_secret:
            logger.info(f"🔐 Vaultwarden configured. Attempting to fetch secrets...")
            try:
                self._fetch_secrets_from_vaultwarden()
            except Exception as e:
                logger.warning(f"⚠️ Vaultwarden fetch failed ({e}). Falling back to env variables.")
                # Secrets from .env will be used if not set by Vaultwarden
        else:
            logger.info("⚠️ Vaultwarden not configured (VAULTWARDEN_CLIENT_ID or VAULTWARDEN_CLIENT_SECRET empty). Using env variables for secrets.")

    def _fetch_secrets_from_vaultwarden(self):
        """Fetch SECRET_KEY, ADMIN_KEY, ENCRYPTION_KEY from Vaultwarden using OAuth2."""
        try:
            # Normalize base URL
            base_url = self.vaultwarden_url.rstrip('/')
            if base_url.endswith('/api'):
                base_url = base_url[:-4]

            logger.info(f"🔐 Vaultwarden: url={base_url}, client_id={self.vaultwarden_client_id}")

            # Step 0: Get OAuth2 access token using client credentials
            logger.info("🔑 Fetching OAuth2 access token...")

            token_response = httpx.post(
                f"{base_url}/identity/connect/token",
                data={
                    "grant_type": "client_credentials",
                    "scope": "api",
                    "client_id": self.vaultwarden_client_id,
                    "client_secret": self.vaultwarden_client_secret
                },
                timeout=10.0
            )

            if token_response.status_code != 200:
                logger.error(f"❌ Token endpoint returned {token_response.status_code}")
                logger.error(f"Response body: {token_response.text}")
                token_response.raise_for_status()

            access_token = token_response.json()["access_token"]
            logger.info("✅ OAuth2 access token obtained")

            # Prepare headers with Bearer token for all subsequent requests
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }

            # Step 1: Get organization ID
            logger.info("📦 Fetching organization...")
            org_response = httpx.get(
                f"{base_url}/api/organizations/self",
                headers=headers,
                timeout=10.0
            )

            if org_response.status_code != 200:
                logger.error(f"❌ /api/organizations/self returned {org_response.status_code}")
                logger.error(f"Response body: {org_response.text}")
                org_response.raise_for_status()

            org_id = org_response.json()["id"]
            logger.info(f"✅ Organization ID: {org_id[:12]}...")

            # Step 2: Get items in organization
            logger.info("🔍 Fetching items from Vaultwarden...")
            items_response = httpx.get(
                f"{base_url}/api/organizations/{org_id}/items",
                headers=headers,
                timeout=10.0
            )

            if items_response.status_code != 200:
                logger.error(f"❌ /api/organizations/{{org_id}}/items returned {items_response.status_code}")
                logger.error(f"Response body: {items_response.text}")
                items_response.raise_for_status()

            items = items_response.json()
            logger.info(f"✅ Found {len(items)} items")

            # Step 4: Extract secrets from items
            secrets_map = {}
            for item in items:
                item_name = item.get("name", "").strip().upper()

                if item_name in ("SECRET_KEY", "ADMIN_KEY", "ENCRYPTION_KEY"):
                    # Try to get value from notes field first, then from custom fields
                    secret_value = item.get("notes", "").strip()

                    if not secret_value:
                        # Try to extract from fields array
                        fields = item.get("fields", [])
                        if fields and isinstance(fields, list):
                            secret_value = fields[0].get("data", "").strip()

                    if secret_value:
                        secrets_map[item_name.lower()] = secret_value
                        logger.info(f"✅ Found {item_name}")
                    else:
                        logger.warning(f"⚠️ Item '{item_name}' found but value is empty")

            # Step 5: Apply secrets to settings
            if "secret_key" in secrets_map:
                self.secret_key = secrets_map["secret_key"]
                logger.info("✅ SECRET_KEY loaded from Vaultwarden")
            else:
                logger.warning("⚠️ SECRET_KEY not found in Vaultwarden")

            if "admin_key" in secrets_map:
                self.admin_key = secrets_map["admin_key"]
                logger.info("✅ ADMIN_KEY loaded from Vaultwarden")
            else:
                logger.warning("⚠️ ADMIN_KEY not found in Vaultwarden")

            if "encryption_key" in secrets_map:
                self.encryption_key = secrets_map["encryption_key"]
                logger.info("✅ ENCRYPTION_KEY loaded from Vaultwarden")
            else:
                logger.warning("⚠️ ENCRYPTION_KEY not found in Vaultwarden")

            logger.info("✅ All secrets loaded from Vaultwarden successfully")

        except httpx.HTTPError as e:
            logger.error(f"❌ Vaultwarden API error: {e}")
            raise RuntimeError(f"Cannot fetch secrets from Vaultwarden: {e}") from e
        except KeyError as e:
            logger.error(f"❌ Unexpected Vaultwarden response format: {e}")
            raise RuntimeError(f"Cannot parse Vaultwarden response: {e}") from e
        except Exception as e:
            logger.error(f"❌ Error fetching secrets: {e}")
            raise RuntimeError(f"Cannot fetch secrets from Vaultwarden: {e}") from e


settings = Settings()
