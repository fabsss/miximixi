from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
import logging

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


settings = Settings()
