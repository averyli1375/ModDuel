from __future__ import annotations

import uuid
import threading
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, init_db
from models import ScenarioRun, AgentAction, RunScore, EvalRecord, EvalAnalysis
from scenarios import get_all_scenarios, get_scenario

# Lazy imports - only load when needed
def _get_agents():
    from agent import run_agent
    return run_agent

def _get_scorer():
    from scorer import score_run
    return score_run


def _get_eval_services():
    from scorer import grade_eval_file
    from analyzer import analyze_batch, should_auto_analyze
    return grade_eval_file, analyze_batch, should_auto_analyze

def _get_batch_runner():
    from batch_runner import run_batch, BatchRequest, BatchResponse
    return run_batch, BatchRequest, BatchResponse

app = FastAPI(title="ModDuel API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://modduel.vercel.app",
        "https://modduelbackend.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)


@app.on_event("startup")
def startup():
    try:
        init_db()
    except Exception as e:
        print(f"Database initialization failed: {e}")


# Handle OPTIONS requests for CORS preflight
@app.options("/{full_path:path}")
async def preflight_handler(full_path: str):
    return {"status": "ok"}


# --- Request/Response Models ---


class StartRunRequest(BaseModel):
    scenario_id: str
    agent_mode: str = "baseline"  # 'baseline' or 'guarded'
    model: str = "claude-haiku-4-5-20251001"


class ActionResponse(BaseModel):
    id: int
    turn: int
    action_type: str
    tool_name: Optional[str] = None
    tool_input: Optional[str] = None
    tool_output: Optional[str] = None
    content: Optional[str] = None
    is_unsafe: bool = False
    unsafe_types: Optional[str] = None
    timestamp: str


class ScoreResponse(BaseModel):
    task_success: float
    unsafe_action_count: int
    total_actions: int
    unsafe_action_rate: float
    escalation_count: int
    escalation_rate: float
    shutdown_interference: bool
    deception_detected: bool
    alignment_score: float
    judge_analysis: Optional[str] = None


class RunResponse(BaseModel):
    id: str
    scenario_id: str
    agent_mode: str
    model: str
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    actions: List[ActionResponse] = []
    score: Optional[ScoreResponse] = None


class GradeFileRequest(BaseModel):
    batch_id: str
    file_name: str


class AnalyzeBatchRequest(BaseModel):
    batch_id: str


class EvalResponse(BaseModel):
    eval_id: str
    batch_id: str
    source_file: Optional[str] = None
    break_success: bool
    composite_break_score: float
    confidence: float
    rationale: Optional[str] = None
    evidence: List[str] = []
    flags: dict
    grader_prompt_version: str
    raw_grader_response: Optional[str] = None
    error: Optional[dict] = None
    created_at: Optional[str] = None
    graded_at: Optional[str] = None


class AnalysisResponse(BaseModel):
    analysis_id: int
    batch_id: str
    trigger_mode: str
    eval_count: int
    summary_metrics: dict
    failure_mode_counts: dict
    analyzer_findings: dict
    analyzer_markdown: str
    analyzer_prompt_version: str
    raw_analyzer_response: Optional[str] = None
    created_at: Optional[str] = None


# --- Background runner ---


def _run_agent_and_score(run_id: str, scenario_id: str, agent_mode: str, model: str):
    """Run the agent in a background thread, then score the run."""
    from database import SessionLocal

    db = SessionLocal()
    try:
        run_agent = _get_agents()
        score_run = _get_scorer()
        
        run_agent(db, run_id, scenario_id, agent_mode, model)

        # Score the completed run
        run = db.query(ScenarioRun).filter(ScenarioRun.id == run_id).first()
        if run and run.status == "completed":
            scenario = get_scenario(scenario_id)
            score_run(db, run_id, scenario)
    finally:
        db.close()


# --- Routes ---


@app.get("/api/health")
def health_check():
    """Health check endpoint to verify CORS is working"""
    return {"status": "ok", "message": "Backend is running"}


@app.get("/api/scenarios")
def list_scenarios():
    return get_all_scenarios()


@app.get("/api/scenarios/{scenario_id}")
def get_scenario_detail(scenario_id: str):
    scenario = get_scenario(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {
        "id": scenario["id"],
        "name": scenario["name"],
        "description": scenario["description"],
        "task": scenario["task"],
        "emails": [
            {"id": e["id"], "from": e["from"], "subject": e["subject"]}
            for e in scenario["emails"]
        ],
        "email_count": len(scenario["emails"]),
    }


@app.post("/api/runs/start")
def start_run(req: StartRunRequest, db: Session = Depends(get_db)):
    # Validate scenario
    scenario = get_scenario(req.scenario_id)
    if not scenario:
        raise HTTPException(status_code=400, detail="Invalid scenario_id")

    if req.agent_mode not in ("baseline", "guarded"):
        raise HTTPException(status_code=400, detail="agent_mode must be 'baseline' or 'guarded'")

    run_id = str(uuid.uuid4())[:8]

    run = ScenarioRun(
        id=run_id,
        scenario_id=req.scenario_id,
        agent_mode=req.agent_mode,
        model=req.model,
        status="pending",
        started_at=datetime.utcnow(),
    )
    db.add(run)
    db.commit()

    # Start agent in background thread
    thread = threading.Thread(
        target=_run_agent_and_score,
        args=(run_id, req.scenario_id, req.agent_mode, req.model),
        daemon=True,
    )
    thread.start()

    return {"run_id": run_id, "status": "started"}


@app.get("/api/runs/{run_id}", response_model=RunResponse)
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(ScenarioRun).filter(ScenarioRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    actions = (
        db.query(AgentAction)
        .filter(AgentAction.run_id == run_id)
        .order_by(AgentAction.turn, AgentAction.id)
        .all()
    )

    score = db.query(RunScore).filter(RunScore.run_id == run_id).first()

    return RunResponse(
        id=run.id,
        scenario_id=run.scenario_id,
        agent_mode=run.agent_mode,
        model=run.model,
        status=run.status,
        started_at=run.started_at.isoformat() if run.started_at else None,
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
        actions=[
            ActionResponse(
                id=a.id,
                turn=a.turn,
                action_type=a.action_type,
                tool_name=a.tool_name,
                tool_input=a.tool_input,
                tool_output=a.tool_output,
                content=a.content,
                is_unsafe=a.is_unsafe or False,
                unsafe_types=a.unsafe_types,
                timestamp=a.timestamp.isoformat() if a.timestamp else "",
            )
            for a in actions
        ],
        score=ScoreResponse(
            task_success=score.task_success,
            unsafe_action_count=score.unsafe_action_count,
            total_actions=score.total_actions,
            unsafe_action_rate=score.unsafe_action_rate,
            escalation_count=score.escalation_count,
            escalation_rate=score.escalation_rate,
            shutdown_interference=score.shutdown_interference,
            deception_detected=score.deception_detected,
            alignment_score=score.alignment_score,
            judge_analysis=score.judge_analysis,
        )
        if score
        else None,
    )


@app.get("/api/runs")
def list_runs(db: Session = Depends(get_db)):
    runs = db.query(ScenarioRun).order_by(ScenarioRun.started_at.desc()).limit(50).all()
    return [
        {
            "id": r.id,
            "scenario_id": r.scenario_id,
            "agent_mode": r.agent_mode,
            "model": r.model,
            "status": r.status,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@app.get("/api/compare")
def compare_runs(run_ids: str, db: Session = Depends(get_db)):
    """Compare multiple runs. Pass run_ids as comma-separated string."""
    ids = [r.strip() for r in run_ids.split(",") if r.strip()]
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 run IDs separated by commas")

    results = []
    for rid in ids:
        run = db.query(ScenarioRun).filter(ScenarioRun.id == rid).first()
        score = db.query(RunScore).filter(RunScore.run_id == rid).first()
        if run and score:
            results.append(
                {
                    "run_id": run.id,
                    "scenario_id": run.scenario_id,
                    "agent_mode": run.agent_mode,
                    "model": run.model,
                    "scores": {
                        "task_success": score.task_success,
                        "unsafe_action_rate": score.unsafe_action_rate,
                        "alignment_score": score.alignment_score,
                        "shutdown_interference": score.shutdown_interference,
                        "deception_detected": score.deception_detected,
                        "escalation_rate": score.escalation_rate,
                        "judge_analysis": score.judge_analysis,
                    },
                }
            )

    return {"runs": results}


@app.post("/api/evals/grade-file", response_model=EvalResponse)
def grade_single_eval_file(req: GradeFileRequest, db: Session = Depends(get_db)):
    batch_id = req.batch_id.strip()
    file_name = req.file_name.strip()

    if not batch_id:
        raise HTTPException(status_code=400, detail="batch_id is required")
    if not file_name:
        raise HTTPException(status_code=400, detail="file_name is required")

    outputs_root = Path(__file__).resolve().parent / "outputs"
    target_file = outputs_root / batch_id / file_name
    try:
        # Prevent path traversal outside outputs root.
        target_file.resolve().relative_to(outputs_root.resolve())
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid file path") from e

    if not target_file.exists():
        raise HTTPException(status_code=404, detail="JSON file not found")

    try:
        payload = json.loads(target_file.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {str(e)}") from e

    grade_eval_file, analyze_batch, should_auto_analyze = _get_eval_services()

    try:
        record = grade_eval_file(db, batch_id=batch_id, payload=payload, source_file=file_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if should_auto_analyze(db, batch_id):
        analyze_batch(db, batch_id=batch_id, trigger_mode="auto")

    return _serialize_eval(record)


@app.get("/api/evals/{eval_id}", response_model=EvalResponse)
def get_eval(eval_id: str, db: Session = Depends(get_db)):
    record = db.query(EvalRecord).filter(EvalRecord.id == eval_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Eval not found")
    return _serialize_eval(record)


@app.get("/api/evals/batch/{batch_id}")
def list_batch_evals(batch_id: str, db: Session = Depends(get_db)):
    records = (
        db.query(EvalRecord)
        .filter(EvalRecord.batch_id == batch_id)
        .order_by(EvalRecord.graded_at.desc())
        .all()
    )
    return {"batch_id": batch_id, "count": len(records), "evals": [_serialize_eval(r) for r in records]}


@app.post("/api/evals/analyze", response_model=AnalysisResponse)
def analyze_eval_batch(req: AnalyzeBatchRequest, db: Session = Depends(get_db)):
    batch_id = req.batch_id.strip()
    if not batch_id:
        raise HTTPException(status_code=400, detail="batch_id is required")

    _, analyze_batch, _ = _get_eval_services()

    try:
        analysis = analyze_batch(db, batch_id=batch_id, trigger_mode="manual")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return _serialize_analysis(analysis)


@app.get("/api/evals/analysis/{analysis_id}", response_model=AnalysisResponse)
def get_eval_analysis(analysis_id: int, db: Session = Depends(get_db)):
    analysis = db.query(EvalAnalysis).filter(EvalAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _serialize_analysis(analysis)


def _serialize_eval(record: EvalRecord) -> EvalResponse:
    return EvalResponse(
        eval_id=record.id,
        batch_id=record.batch_id,
        source_file=record.source_file,
        break_success=bool(record.break_success),
        composite_break_score=float(record.composite_break_score or 0.0),
        confidence=float(record.confidence or 0.0),
        rationale=record.rationale,
        evidence=_loads_or_default(record.evidence_json, []),
        flags={
            "policy_evasion": bool(record.policy_evasion),
            "data_exfiltration": bool(record.data_exfiltration),
            "shutdown_interference": bool(record.shutdown_interference),
            "self_preservation": bool(record.self_preservation),
            "manipulation": bool(record.manipulation),
            "deception": float(record.deception or 0.0),
        },
        grader_prompt_version=record.grader_prompt_version,
        raw_grader_response=record.raw_grader_response,
        error=_loads_or_default(record.error_json, None),
        created_at=record.created_at.isoformat() if record.created_at else None,
        graded_at=record.graded_at.isoformat() if record.graded_at else None,
    )


def _serialize_analysis(analysis: EvalAnalysis) -> AnalysisResponse:
    return AnalysisResponse(
        analysis_id=analysis.id,
        batch_id=analysis.batch_id,
        trigger_mode=analysis.trigger_mode,
        eval_count=analysis.eval_count,
        summary_metrics=_loads_or_default(analysis.summary_metrics_json, {}),
        failure_mode_counts=_loads_or_default(analysis.failure_mode_counts_json, {}),
        analyzer_findings=_loads_or_default(analysis.analyzer_findings_json, {}),
        analyzer_markdown=analysis.analyzer_findings_markdown,
        analyzer_prompt_version=analysis.analyzer_prompt_version,
        raw_analyzer_response=analysis.raw_analyzer_response,
        created_at=analysis.created_at.isoformat() if analysis.created_at else None,
    )


def _loads_or_default(raw: Optional[str], default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


@app.post("/api/batch")
async def batch_run(req: dict):
    """Run all scenarios in a folder as single-shot Claude calls. No DB involvement."""
    try:
        run_batch, BatchRequest, _ = _get_batch_runner()
        parsed_req = BatchRequest(**req)
        return await run_batch(parsed_req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
