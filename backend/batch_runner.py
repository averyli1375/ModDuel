from __future__ import annotations

import asyncio
import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from llm_client import get_anthropic_client

# ---------------------------------------------------------------------------
# LLM provider abstraction
# ---------------------------------------------------------------------------

_BACKEND_DIR = Path(__file__).resolve().parent


@dataclass
class LLMResponse:
    response_text: str
    input_tokens: int
    output_tokens: int


class LLMProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        model: str,
        system_prompt: str,
        user_prompt: str,
    ) -> LLMResponse: ...


class AnthropicProvider(LLMProvider):
    """Single-shot Claude call using the existing synchronous client."""

    async def complete(self, model: str, system_prompt: str, user_prompt: str) -> LLMResponse:
        client = get_anthropic_client()

        def _call():
            return client.messages.create(
                model=model,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, _call)

        text = response.content[0].text if response.content else ""
        return LLMResponse(
            response_text=text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ScenarioFile(BaseModel):
    id: str
    name: str
    system_prompt: str
    user_prompt: str


class BatchRequest(BaseModel):
    folder: str = "scenarios/"
    model: str = "claude-haiku-4-5-20251001"


class ScenarioResult(BaseModel):
    scenario_id: str
    status: str  # "success" | "error"
    output_file: Optional[str] = None
    error: Optional[str] = None


class BatchResponse(BaseModel):
    batch_id: str
    model: str
    total: int
    succeeded: int
    failed: int
    output_dir: str
    results: list[ScenarioResult]


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


async def run_single_scenario(
    scenario: ScenarioFile,
    model: str,
    output_dir: Path,
    batch_id: str,
    provider: LLMProvider,
) -> ScenarioResult:
    start = time.monotonic()
    output_path = output_dir / f"{scenario.id}.json"

    try:
        llm_resp = await provider.complete(
            model=model,
            system_prompt=scenario.system_prompt,
            user_prompt=scenario.user_prompt,
        )
        latency = time.monotonic() - start

        record = {
            "batch_id": batch_id,
            "scenario_id": scenario.id,
            "scenario_name": scenario.name,
            "model": model,
            "timestamp_utc": datetime.utcnow().isoformat() + "Z",
            "latency_seconds": round(latency, 3),
            "status": "success",
            "input": {
                "system_prompt": scenario.system_prompt,
                "user_prompt": scenario.user_prompt,
            },
            "output": {
                "response_text": llm_resp.response_text,
                "input_tokens": llm_resp.input_tokens,
                "output_tokens": llm_resp.output_tokens,
            },
            "error": None,
        }
        output_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))

        return ScenarioResult(
            scenario_id=scenario.id,
            status="success",
            output_file=str(output_path.relative_to(_BACKEND_DIR.parent)),
        )

    except Exception as exc:
        latency = time.monotonic() - start
        error_msg = str(exc)
        print(f"[batch_runner] ERROR on scenario '{scenario.id}': {error_msg}")

        error_record = {
            "batch_id": batch_id,
            "scenario_id": scenario.id,
            "scenario_name": scenario.name,
            "model": model,
            "timestamp_utc": datetime.utcnow().isoformat() + "Z",
            "latency_seconds": round(latency, 3),
            "status": "error",
            "input": {
                "system_prompt": scenario.system_prompt,
                "user_prompt": scenario.user_prompt,
            },
            "output": None,
            "error": error_msg,
        }
        output_path.write_text(json.dumps(error_record, indent=2, ensure_ascii=False))

        return ScenarioResult(
            scenario_id=scenario.id,
            status="error",
            output_file=str(output_path.relative_to(_BACKEND_DIR.parent)),
            error=error_msg,
        )


async def run_batch(req: BatchRequest) -> BatchResponse:
    # Resolve folder relative to the backend/ directory
    folder = (_BACKEND_DIR / req.folder).resolve()

    if not folder.is_dir():
        raise ValueError(f"Scenario folder not found: {req.folder}")

    json_files = sorted(folder.glob("*.json"))
    if not json_files:
        raise ValueError(f"No .json files found in: {req.folder}")

    # Load and validate all scenario files; capture parse errors without aborting
    scenarios: list[ScenarioFile] = []
    load_errors: list[ScenarioResult] = []

    for path in json_files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            scenarios.append(ScenarioFile(**data))
        except Exception as exc:
            load_errors.append(
                ScenarioResult(
                    scenario_id=path.stem,
                    status="error",
                    output_file=None,
                    error=f"Failed to parse {path.name}: {exc}",
                )
            )

    # Create timestamped output directory inside backend/outputs/
    batch_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    output_dir = _BACKEND_DIR / "outputs" / batch_id
    output_dir.mkdir(parents=True, exist_ok=True)

    provider = AnthropicProvider()

    # Run all valid scenarios concurrently
    tasks = [
        run_single_scenario(s, req.model, output_dir, batch_id, provider)
        for s in scenarios
    ]
    results: list[ScenarioResult] = list(await asyncio.gather(*tasks))

    all_results = results + load_errors
    succeeded = sum(1 for r in all_results if r.status == "success")

    return BatchResponse(
        batch_id=batch_id,
        model=req.model,
        total=len(all_results),
        succeeded=succeeded,
        failed=len(all_results) - succeeded,
        output_dir=str(output_dir.relative_to(_BACKEND_DIR.parent)),
        results=all_results,
    )
