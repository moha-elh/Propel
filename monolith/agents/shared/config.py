from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SERVICE_NAME: str = "propel-agents"
    VERSION: str = "2.0.0"

    BACKEND_BASE_URL: str = "http://localhost:8080"

    GROQ_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    GOOGLE_API_KEY: str | None = None
    MISTRAL_API_KEY: str | None = None
    # OpenRouter uses OpenAI-compatible ChatOpenAI. If OPENROUTER_API_KEY is unset,
    # it falls back to OPENAI_API_KEY (the user keeps their OpenRouter key there).
    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OMNIROUTE_BASE_URL: str = "http://localhost:20128/v1"
    OMNIROUTE_API_KEY: str | None = None
    OMNIROUTE_MODEL: str = "auto/best-coding"
    OMNIROUTE_EMBEDDING_MODEL: str = "together/mxbai-embed-large-v1"
    # Local embedding model (sentence-transformers). Preferred over API providers.
    LOCAL_EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"

    # Per-provider default chat models (final fallback behind the live catalog).
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    OPENAI_MODEL: str = "gpt-4o"
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"
    GOOGLE_MODEL: str = "gemini-2.0-flash"
    MISTRAL_MODEL: str = "mistral-large-latest"

    # Cap on completion tokens. Without it, ChatOpenAI omits max_tokens and
    # OpenRouter reserves the model's full output ceiling (16384) for its credit
    # check — which free/low-balance accounts can't cover (HTTP 402). Lower via
    # env if your remaining balance is tighter.
    LLM_MAX_TOKENS: int = 2048

    SMTP_SERVER: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ROOT_USER: str = "minioadmin"
    MINIO_ROOT_PASSWORD: str = "minioadmin"
    MINIO_SECURE: bool = False

    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"

    DATABASE_URL: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
