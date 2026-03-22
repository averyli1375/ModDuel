from __future__ import annotations

import asyncio
import json
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from llm_client import get_anthropic_client
from models import Scenario, BatchRun, BatchResult


# ---------------------------------------------------------------------------
# LLM provider abstraction (unchanged — supports future multi-model)
# ---------------------------------------------------------------------------


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
        messages: list[dict],
    ) -> LLMResponse: ...


class AnthropicProvider(LLMProvider):
    """Claude call using the existing synchronous client, run in a thread pool."""

    async def complete(self, model: str, system_prompt: str, messages: list[dict]) -> LLMResponse:
        client = get_anthropic_client()

        def _call():
            return client.messages.create(
                model=model,
                max_tokens=1024,
                system=system_prompt,
                messages=messages,
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
# Runner
# ---------------------------------------------------------------------------


def _build_system_prompt(scenario_dict: dict) -> str:
    """Build the system prompt from scenario data."""
    parts = []

    if scenario_dict.get("system_prompt"):
        parts.append(scenario_dict["system_prompt"])

    parts.append(f"Your task: {scenario_dict['task']}")

    documents = scenario_dict.get("documents", [])
    if documents:
        doc_text = "\n".join(
            f"- {d['title']}: {d['content']}" for d in documents
        )
        parts.append(f"Available documents:\n{doc_text}")

    config = scenario_dict.get("config", {})
    if config:
        config_text = "\n".join(f"  {k}: {v}" for k, v in config.items())
        parts.append(f"System config:\n{config_text}")

    return "\n\n".join(parts)


async def run_batch(scenario_id: str, model: str, session_factory) -> dict:
    """Run a scenario's emails cumulatively through the model, storing results in DB.

    Returns a dict matching the BatchRunResponse shape expected by main.py.
    """
    # Load scenario from DB
    db = session_factory()
    try:
        scenario_row = db.query(Scenario).filter(Scenario.id == scenario_id).first()
        if not scenario_row:
            raise ValueError(f"Scenario not found: {scenario_id}")

        # Deserialize to dict
        scenario_dict = {
            "id": scenario_row.id,
            "name": scenario_row.name,
            "description": scenario_row.description or "",
            "task": scenario_row.task,
            "system_prompt": scenario_row.system_prompt,
            "emails": json.loads(scenario_row.emails_json) if scenario_row.emails_json else [],
            "documents": json.loads(scenario_row.documents_json) if scenario_row.documents_json else [],
            "config": json.loads(scenario_row.config_json) if scenario_row.config_json else {},
        }
    finally:
        db.close()

    emails = scenario_dict["emails"]
    if not emails:
        raise ValueError(f"Scenario '{scenario_id}' has no emails")

    system_prompt = _build_system_prompt(scenario_dict)
    batch_run_id = str(uuid.uuid4())[:12]

    # Create BatchRun row
    db = session_factory()
    try:
        batch_run = BatchRun(
            id=batch_run_id,
            scenario_id=scenario_id,
            model=model,
            status="running",
            email_count=len(emails),
        )
        db.add(batch_run)
        db.commit()
    finally:
        db.close()

    provider = AnthropicProvider()
    messages: list[dict] = []
    succeeded = 0
    failed = 0
    result_rows = []

    # Process emails sequentially (cumulative conversation)
    for email_index, email in enumerate(emails):
        user_content = (
            f"New email received:\n"
            f"From: {email['from']}\n"
            f"Subject: {email['subject']}\n"
            f"Body:\n{email['body']}\n\n"
            f"How do you respond?"
        )
        messages.append({"role": "user", "content": user_content})

        result_id = str(uuid.uuid4())[:12]
        start = time.monotonic()

        try:
            llm_resp = await provider.complete(
                model=model,
                system_prompt=system_prompt,
                messages=messages,
            )
            latency = time.monotonic() - start

            # Add assistant response to conversation for next iteration
            messages.append({"role": "assistant", "content": llm_resp.response_text})

            # Store result
            db = session_factory()
            try:
                result = BatchResult(
                    id=result_id,
                    batch_run_id=batch_run_id,
                    scenario_id=scenario_id,
                    email_index=email_index,
                    email_id=email.get("id", f"email_{email_index}"),
                    model=model,
                    system_prompt_snapshot=system_prompt,
                    messages_json=json.dumps(messages, ensure_ascii=False),
                    model_output=llm_resp.response_text,
                    input_tokens=llm_resp.input_tokens,
                    output_tokens=llm_resp.output_tokens,
                    latency_seconds=round(latency, 3),
                    status="success",
                )
                db.add(result)
                db.commit()
                db.refresh(result)
                result_rows.append(result)
                succeeded += 1
            finally:
                db.close()

        except Exception as exc:
            latency = time.monotonic() - start
            error_msg = str(exc)
            print(f"[batch_runner] ERROR on email {email_index} of '{scenario_id}': {error_msg}")

            # Store error result
            db = session_factory()
            try:
                result = BatchResult(
                    id=result_id,
                    batch_run_id=batch_run_id,
                    scenario_id=scenario_id,
                    email_index=email_index,
                    email_id=email.get("id", f"email_{email_index}"),
                    model=model,
                    system_prompt_snapshot=system_prompt,
                    messages_json=json.dumps(messages, ensure_ascii=False),
                    model_output=None,
                    latency_seconds=round(latency, 3),
                    status="error",
                    error=error_msg,
                )
                db.add(result)
                db.commit()
                db.refresh(result)
                result_rows.append(result)
                failed += 1
            finally:
                db.close()

            # Stop processing — conversation is broken
            break

    # Update BatchRun with final status
    db = session_factory()
    try:
        batch_run = db.query(BatchRun).filter(BatchRun.id == batch_run_id).first()
        batch_run.status = "completed" if failed == 0 else "failed"
        batch_run.succeeded = succeeded
        batch_run.failed = failed
        batch_run.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(batch_run)
    finally:
        db.close()

    # Return dict matching BatchRunResponse
    return {
        "id": batch_run_id,
        "scenario_id": scenario_id,
        "model": model,
        "status": batch_run.status,
        "email_count": len(emails),
        "succeeded": succeeded,
        "failed": failed,
        "created_at": batch_run.created_at.isoformat() if batch_run.created_at else None,
        "completed_at": batch_run.completed_at.isoformat() if batch_run.completed_at else None,
        "results": [
            {
                "id": r.id,
                "batch_run_id": r.batch_run_id,
                "scenario_id": r.scenario_id,
                "email_index": r.email_index,
                "email_id": r.email_id,
                "model": r.model,
                "model_output": r.model_output,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "latency_seconds": r.latency_seconds,
                "status": r.status,
                "error": r.error,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in result_rows
        ],
    }
