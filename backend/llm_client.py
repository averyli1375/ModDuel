import os
from functools import lru_cache
from pathlib import Path

import anthropic
from dotenv import load_dotenv


def _clean_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


@lru_cache(maxsize=1)
def get_anthropic_client() -> anthropic.Anthropic:
    # Load backend/.env regardless of launch directory.
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(env_path, override=False)

    api_key = _clean_env("ANTHROPIC_API_KEY")
    auth_token = _clean_env("ANTHROPIC_AUTH_TOKEN")

    if api_key:
        return anthropic.Anthropic(api_key=api_key, auth_token=None)

    if auth_token:
        return anthropic.Anthropic(api_key=None, auth_token=auth_token)

    raise RuntimeError(
        "Anthropic auth is not configured. Set ANTHROPIC_API_KEY or "
        "ANTHROPIC_AUTH_TOKEN in backend/.env or your shell environment."
    )
