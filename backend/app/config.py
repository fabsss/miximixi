from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # LLM
    llm_provider: str = "ollama"  # ollama | gemini | claude | openai | openai_compat

    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "llama3.2-vision:11b"

    # Google Gemini (bevorzugter Cloud-Provider, native Video-Unterstützung)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    openai_compat_base_url: str = ""
    openai_compat_api_key: str = ""
    openai_compat_model: str = ""

    # Supabase
    supabase_url: str = "http://supabase-api:8000"
    supabase_service_key: str = ""
    supabase_anon_key: str = ""

    # Instagram
    instagram_username: str = ""
    instagram_password: str = ""
    instagram_collection_id: str = ""
    instagram_session_file: str = "instagram_session.json"

    # Temp storage for media downloads
    tmp_dir: str = "/tmp/miximixi"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
