import os
from functools import lru_cache
from pathlib import Path

from groq import Groq
from anthropic import Anthropic
from dotenv import load_dotenv


def _clean_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


@lru_cache(maxsize=1)
def get_groq_client() -> Groq:
    # Load backend/.env regardless of launch directory.
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(env_path, override=False)

    api_key = _clean_env("GROQ_API_KEY")

    if api_key:
        return Groq(api_key=api_key)

    raise RuntimeError(
        "Groq auth is not configured. Set GROQ_API_KEY in backend/.env or your shell environment."
    )


@lru_cache(maxsize=1)
def get_anthropic_client() -> Anthropic:
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(env_path, override=False)

    api_key = _clean_env("ANTHROPIC_API_KEY")

    if api_key:
        return Anthropic(api_key=api_key)

    raise RuntimeError(
        "Anthropic auth is not configured. Set ANTHROPIC_API_KEY in backend/.env or your shell environment."
    )
