"""
Unified LLM factory.

Features:
- Dynamic provider/model selection (per-user overrides).
- Live model catalog: fetches the current model list from each provider's
  Models endpoint so hardcoded names never 404 when providers deprecate them.
- Safe defaults: if a model isn't given, resolve the first *current* model from
  the live catalog, falling back to the configured env default.
- Backward-compatible `get_llm(preferred_provider)` signature.
"""
import os
import logging
import time
import asyncio
from typing import Optional

import httpx
from dotenv import load_dotenv

from langchain_core.language_models import BaseChatModel
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

from shared.config import settings

load_dotenv()
logger = logging.getLogger(__name__)

PROVIDER_ENV_MAP = {
    "omniroute": "OMNIROUTE_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google": "GOOGLE_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}

# OpenRouter keeps its key in OPENROUTER_API_KEY; if that is unset it falls back
# to OPENAI_API_KEY (the user stores their OpenRouter key under the openai slot).
_OPENROUTER_KEY_FALLBACK = ("OPENROUTER_API_KEY", "OPENAI_API_KEY")

# Per-provider default model used as the final fallback when the catalog is
# unavailable. Kept as a safety net; the live catalog is authoritative.
DEFAULT_MODEL_MAP: dict[str, str] = {
    "omniroute": settings.OMNIROUTE_MODEL,
    "openrouter": settings.OPENROUTER_MODEL,
    "groq": settings.GROQ_MODEL,
    "openai": settings.OPENAI_MODEL,
    "google": settings.GOOGLE_MODEL,
    "mistral": settings.MISTRAL_MODEL,
}

# Provider display labels for the picker.
PROVIDER_LABELS = {
    "omniroute": "OmniRoute",
    "openrouter": "OpenRouter",
    "groq": "Groq",
    "openai": "OpenAI",
    "google": "Google Gemini",
    "mistral": "Mistral",
}

# In-memory catalog cache: {provider: (fetched_at, [models])}. TTL to avoid
# hammering provider APIs on every request.
_MODEL_CACHE: dict[str, tuple[float, list[str]]] = {}
_CACHE_TTL = 600  # seconds (10 min)
_OPENAI_ENDPOINT = "https://api.openai.com/v1/models"
_MISTRAL_ENDPOINT = "https://api.mistral.ai/v1/models"


def _provider_key(provider: str) -> str | None:
    """Return which env var actually backs a provider, honoring the OpenRouter
    OPENROUTER->OPENAI key fallback."""
    envs = PROVIDER_ENV_MAP[provider]
    if provider == "openrouter":
        for name in _OPENROUTER_KEY_FALLBACK:
            if os.getenv(name):
                return name
        return None
    return envs


def _provider_key_value(provider: str) -> str | None:
    name = _provider_key(provider)
    return os.getenv(name) if name else None


def list_providers() -> dict[str, bool]:
    return {name: _provider_key_value(name) is not None for name in PROVIDER_ENV_MAP}


def _provider_present(provider: str) -> bool:
    return _provider_key_value(provider) is not None


def _list_models_sync(provider: str) -> list[str]:
    """Fetch the live model list for a provider. Returns [] on any failure."""
    try:
        if provider == "groq":
            import groq
            client = groq.Groq(api_key=os.getenv("GROQ_API_KEY"))
            return sorted(m.id for m in client.models.list().data)
        elif provider == "openai":
            resp = httpx.get(
                _OPENAI_ENDPOINT,
                headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}"},
                timeout=10,
            )
            resp.raise_for_status()
            return sorted(m["id"] for m in resp.json().get("data", []))
        elif provider == "openrouter":
            key = _provider_key_value("openrouter")
            base = settings.OPENROUTER_BASE_URL.rstrip("/")
            headers = {"Authorization": f"Bearer {key}"} if key else None
            resp = httpx.get(f"{base}/models", headers=headers, timeout=10)
            resp.raise_for_status()
            # OpenRouter exposes `/api/v1/models` as `{data: [{id, ...}]}`.
            return sorted(m.get("id", "") for m in resp.json().get("data", []) if m.get("id"))
        elif provider == "google":
            from google import genai as google_genai
            client = google_genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
            # models.list is paginated; iterate and collect names.
            names: list[str] = []
            try:
                for page in client.models.list():
                    for m in page:
                        names.append(m.name.replace("models/", ""))
            except TypeError:
                # Older google-genai returns a single iterable, not pages.
                for m in client.models.list():
                    names.append(getattr(m, "name", "").replace("models/", ""))
            return sorted(n for n in names if n)
        elif provider == "mistral":
            resp = httpx.get(
                _MISTRAL_ENDPOINT,
                headers={"Authorization": f"Bearer {os.getenv('MISTRAL_API_KEY')}"},
                timeout=10,
            )
            resp.raise_for_status()
            return sorted(m["id"] for m in resp.json().get("data", []))
        elif provider == "omniroute":
            base = settings.OMNIROUTE_BASE_URL.rstrip("/")
            key = os.getenv("OMNIROUTE_API_KEY")
            headers = {"Authorization": f"Bearer {key}"} if key else None
            resp = httpx.get(f"{base}/models", headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("data") or data.get("models") or []
            out = []
            for m in raw:
                if isinstance(m, dict):
                    out.append(m.get("id") or m.get("name") or "")
                else:
                    out.append(str(m))
            return sorted(x for x in out if x)
        return []
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to list models for provider '%s': %s", provider, e)
        return []


def refresh_models(provider: str) -> list[str]:
    """Force-refresh a provider's model catalog (bypass cache)."""
    models = _list_models_sync(provider)
    _MODEL_CACHE[provider] = (time.time(), models)
    return models


def list_models(provider: str) -> list[str]:
    """Return the current model list for a provider, using a short-lived cache."""
    if not _provider_present(provider):
        return []
    now = time.time()
    cached = _MODEL_CACHE.get(provider)
    if cached and (now - cached[0]) < _CACHE_TTL and cached[1]:
        return cached[1]
    return refresh_models(provider)


def list_all_models() -> dict[str, list[str]]:
    return {p: list_models(p) for p in PROVIDER_ENV_MAP}


# Substrings that identify non-chat (ASR/speech/audio/guard) models which
# don't support tool calling. Excluded from auto-default resolution.
_NON_CHAT_MARKERS = (
    "whisper", "allam", "orpheus", "prompt-guard", "safeguard",
)

# Per-provider ordered list of model-name substrings known to support tool
# calling (e.g. Groq's deepseek-r1-distill/gemma2/aya models do NOT). Preferred
# over the alphabetically-first catalog model so bind_tools / reasoning agents
# get a model that actually accepts tools.
_PREFERRED_TOOL_MODELS: dict[str, list[str]] = {
    "groq": [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen3",
        "llama-3.3-70b-versatile",
        "llama-4-scout",
        "llama-4-maverick",
        "llama-3.1-8b-instant",
    ],
    "openrouter": [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3.7-sonnet",
        "meta-llama/llama-3.3-70b",
    ],
}

# Order in which providers are considered when none is explicitly preferred.
# OpenRouter is first so direct AI calls default to it when configured.
_PROVIDER_PRIORITY: list[str] = ["openrouter", "groq", "openai", "google", "mistral", "omniroute"]


def _is_chat_model(model: str) -> bool:
    return not any(marker in model.lower() for marker in _NON_CHAT_MARKERS)


def _resolve_default_model(provider: str) -> str:
    """Pick a valid, tool-calling-capable current model.
    Prefers a known tool-capable model from the live catalog, then the first
    current chat model; env-configured default as the final fallback.
    """
    models = [m for m in list_models(provider) if _is_chat_model(m)]
    for name in _PREFERRED_TOOL_MODELS.get(provider, []):
        for m in models:
            if name in m:
                return m
    if models:
        return models[0]
    return DEFAULT_MODEL_MAP.get(provider, "")


def _pick_provider(preferred: Optional[str] = None) -> str:
    by_name = list_providers()
    available = [p for p, ok in by_name.items() if ok]
    if preferred:
        if preferred in available:
            return preferred
        logger.warning("Preferred provider '%s' not available, falling back.", preferred)
    if not available:
        raise RuntimeError("No LLM API keys configured.")
    # Honor the explicit priority order (OpenRouter first) so direct AI calls
    # default to OpenRouter when any key is present.
    for name in _PROVIDER_PRIORITY:
        if name in available:
            return name
    return available[0]


def get_llm(
    preferred_provider: Optional[str] = None,
    model: Optional[str] = None,
) -> BaseChatModel:
    """
    Build a LangChain ChatModel.

    - preferred_provider: force a specific provider; falls back to the first
      available if not configured.
    - model: optional explicit model; if omitted, resolved to a current model
      from the live catalog (env default as final fallback).
    """
    provider = _pick_provider(preferred_provider)
    resolved_model = model or _resolve_default_model(provider)
    logger.info("Creating LLM for provider: %s, model: %s", provider, resolved_model)

    if provider == "omniroute":
        return ChatOpenAI(
            base_url=settings.OMNIROUTE_BASE_URL,
            api_key=settings.OMNIROUTE_API_KEY,
            model=resolved_model,
            temperature=0.7,
            timeout=60,
            max_tokens=settings.LLM_MAX_TOKENS,
        )
    elif provider == "openrouter":
        return ChatOpenAI(
            base_url=settings.OPENROUTER_BASE_URL,
            api_key=_provider_key_value("openrouter"),
            model=resolved_model,
            temperature=0.7,
            timeout=120,
            max_tokens=settings.LLM_MAX_TOKENS,
            default_headers={"HTTP-Referer": settings.SERVICE_NAME, "X-Title": "Propel"},
        )
    elif provider == "groq":
        return ChatGroq(model=resolved_model, temperature=0.7, max_tokens=settings.LLM_MAX_TOKENS)
    elif provider == "openai":
        return ChatOpenAI(model=resolved_model, temperature=0.7, max_tokens=settings.LLM_MAX_TOKENS)
    elif provider == "google":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError:
            raise RuntimeError("langchain-google-genai not installed") from None
        from google import genai as google_genai
        api_key = settings.GOOGLE_API_KEY
        client = google_genai.Client(api_key=api_key)
        return ChatGoogleGenerativeAI(
            client=client,
            model=resolved_model,
            temperature=0.7,
        )
    elif provider == "mistral":
        try:
            from langchain_mistralai import ChatMistralAI
        except ImportError:
            raise RuntimeError("langchain-mistralai not installed") from None
        return ChatMistralAI(model=resolved_model, temperature=0.7)
    else:
        raise ValueError(f"Unknown provider: {provider}")


class DummyLLM(BaseChatModel):
    """Placeholder when no provider is configured."""
    @property
    def _llm_type(self) -> str:
        return "dummy"

    def _generate(self, *args, **kwargs):
        raise RuntimeError("No LLM provider configured. Set at least one API key.")
