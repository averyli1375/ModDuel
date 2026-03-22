from __future__ import annotations

import uuid
import threading
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, init_db
from models import (
    ScenarioRun, AgentAction, RunScore, EvalRecord, EvalAnalysis,
    Scenario, BatchRun, BatchResult, ResearchExperiment, ResearchExperimentRun,
)
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

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
    except Exception as e:
        print(f"Database initialization failed: {e}")
    yield

app = FastAPI(title="ModDuel API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

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


class ResearchScenarioCount(BaseModel):
    scenario_id: str
    run_count: int


class StartResearchExperimentRequest(BaseModel):
    name: Optional[str] = None
    agent_mode: str = "baseline"
    model: str = "claude-haiku-4-5-20251001"
    max_concurrency: int = 1
    scenarios: List[ResearchScenarioCount]


class ResearchExperimentRunResponse(BaseModel):
    id: int
    scenario_id: str
    scenario_name: str
    run_index: int
    run_id: str
    status: str
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class ResearchScenarioGroupResponse(BaseModel):
    scenario_id: str
    scenario_name: str
    total_runs: int
    pending_runs: int
    running_runs: int
    completed_runs: int
    failed_runs: int
    runs: List[ResearchExperimentRunResponse]


class ResearchExperimentResponse(BaseModel):
    experiment_id: str
    name: Optional[str] = None
    agent_mode: str
    model: str
    max_concurrency: int
    status: str
    total_runs: int
    pending_runs: int
    running_runs: int
    completed_runs: int
    failed_runs: int
    latest_error: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    scenario_groups: List[ResearchScenarioGroupResponse] = []


# --- Background runner ---


def _run_agent_and_score(run_id: str, scenario_id: str, agent_mode: str, model: str):
    """Run the agent in a background thread, then score the run."""
    from database import get_session_factory

    session_factory = get_session_factory()
    db = session_factory()
    try:
        run_agent = _get_agents()
        score_run = _get_scorer()
        
        run_agent(db, run_id, scenario_id, agent_mode, model)

        # Score the completed run
        run = db.query(ScenarioRun).filter(ScenarioRun.id == run_id).first()
        if run and run.status == "completed":
            scenario = get_scenario(scenario_id, db=db)
            score_run(db, run_id, scenario)
    finally:
        db.close()


# --- Routes ---


@app.get("/api/health")
def health_check():
    """Health check endpoint to verify CORS is working"""
    return {"status": "ok", "message": "Backend is running"}


@app.get("/api/scenarios")
def list_scenarios(db: Session = Depends(get_db)):
    return get_all_scenarios(db=db)


@app.get("/api/scenarios/{scenario_id}")
def get_scenario_detail(scenario_id: str, db: Session = Depends(get_db)):
    scenario = get_scenario(scenario_id, db=db)
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
def start_run(req: StartRunRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Start a new scenario run - returns immediately with run_id"""
    start_time = time.time()
    
    # Step 1: Validate scenario
    t1 = time.time()
    scenario = get_scenario(req.scenario_id, db=db)
    if not scenario:
        raise HTTPException(status_code=400, detail="Invalid scenario_id")
    print(f"[{req.scenario_id}] Step 1 (get_scenario): {time.time() - t1:.3f}s")

    if req.agent_mode not in ("baseline", "guarded"):
        raise HTTPException(status_code=400, detail="agent_mode must be 'baseline' or 'guarded'")

    run_id = str(uuid.uuid4())[:8]
    print(f"[{run_id}] Starting new run for scenario {req.scenario_id}")

    # Step 2: Create database record
    t2 = time.time()
    try:
        run = ScenarioRun(
            id=run_id,
            scenario_id=req.scenario_id,
            agent_mode=req.agent_mode,
            model=req.model,
            status="pending",
            started_at=datetime.utcnow(),
        )
        db.add(run)
        t_add = time.time()
        print(f"[{run_id}] Step 2a (db.add): {t_add - t2:.3f}s")
        
        db.commit()
        t_commit = time.time()
        print(f"[{run_id}] Step 2b (db.commit): {t_commit - t_add:.3f}s")
    except Exception as e:
        print(f"[{run_id}] Database error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # Step 3: Schedule background task
    t3 = time.time()
    import os
    if os.environ.get("VERCEL"):
        background_tasks.add_task(_run_agent_and_score, run_id, req.scenario_id, req.agent_mode, req.model)
    else:
        thread = threading.Thread(
            target=_run_agent_and_score,
            args=(run_id, req.scenario_id, req.agent_mode, req.model),
            daemon=True,
        )
        thread.start()
    
    print(f"[{run_id}] Step 3 (schedule task): {time.time() - t3:.3f}s")
    print(f"[{run_id}] Total time: {time.time() - start_time:.3f}s")

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
def list_runs(experiment_id: Optional[str] = None, db: Session = Depends(get_db)):
    if experiment_id:
        run_ids = [
            row.run_id
            for row in db.query(ResearchExperimentRun.run_id)
            .filter(ResearchExperimentRun.experiment_id == experiment_id)
            .all()
        ]
        if not run_ids:
            return []
        runs = (
            db.query(ScenarioRun)
            .filter(ScenarioRun.id.in_(run_ids))
            .order_by(ScenarioRun.started_at.desc())
            .limit(200)
            .all()
        )
    else:
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


# --- Research Lab experiment orchestration ---


def _refresh_research_experiment_counters(db: Session, experiment_id: str):
    exp = db.query(ResearchExperiment).filter(ResearchExperiment.id == experiment_id).first()
    if not exp:
        return

    statuses = [
        row.status
        for row in db.query(ResearchExperimentRun.status)
        .filter(ResearchExperimentRun.experiment_id == experiment_id)
        .all()
    ]

    exp.total_runs = len(statuses)
    exp.pending_runs = sum(1 for s in statuses if s == "pending")
    exp.running_runs = sum(1 for s in statuses if s == "running")
    exp.completed_runs = sum(1 for s in statuses if s == "completed")
    exp.failed_runs = sum(1 for s in statuses if s == "failed")

    latest_failed = (
        db.query(ResearchExperimentRun)
        .filter(
            ResearchExperimentRun.experiment_id == experiment_id,
            ResearchExperimentRun.status == "failed",
        )
        .order_by(ResearchExperimentRun.completed_at.desc())
        .first()
    )
    exp.latest_error = latest_failed.error if latest_failed else None

    if exp.pending_runs == 0 and exp.running_runs == 0:
        exp.status = "completed"
        if not exp.completed_at:
            exp.completed_at = datetime.utcnow()

    db.commit()


def _execute_research_experiment_run(experiment_id: str, experiment_run_id: int):
    from database import get_session_factory

    session_factory = get_session_factory()
    db = session_factory()
    try:
        exp_run = (
            db.query(ResearchExperimentRun)
            .filter(
                ResearchExperimentRun.id == experiment_run_id,
                ResearchExperimentRun.experiment_id == experiment_id,
            )
            .first()
        )
        if not exp_run:
            return

        exp = db.query(ResearchExperiment).filter(ResearchExperiment.id == experiment_id).first()
        if not exp:
            return

        exp_run.status = "running"
        exp_run.started_at = datetime.utcnow()

        scenario_run = db.query(ScenarioRun).filter(ScenarioRun.id == exp_run.run_id).first()
        if not scenario_run:
            scenario_run = ScenarioRun(
                id=exp_run.run_id,
                scenario_id=exp_run.scenario_id,
                agent_mode=exp.agent_mode,
                model=exp.model,
                status="pending",
                started_at=datetime.utcnow(),
            )
            db.add(scenario_run)
        db.commit()

        run_agent = _get_agents()
        score_run = _get_scorer()

        try:
            run_agent(db, exp_run.run_id, exp_run.scenario_id, exp.agent_mode, exp.model)

            finished_run = db.query(ScenarioRun).filter(ScenarioRun.id == exp_run.run_id).first()
            if finished_run and finished_run.status == "completed":
                scenario = get_scenario(exp_run.scenario_id, db=db)
                score_run(db, exp_run.run_id, scenario)
                exp_run.status = "completed"
                exp_run.error = None
            else:
                exp_run.status = "failed"
                exp_run.error = "Run did not complete successfully"
        except Exception as exc:
            exp_run.status = "failed"
            exp_run.error = str(exc)

            failed_run = db.query(ScenarioRun).filter(ScenarioRun.id == exp_run.run_id).first()
            if failed_run:
                failed_run.status = "failed"
                failed_run.completed_at = datetime.utcnow()

        exp_run.completed_at = datetime.utcnow()
        db.commit()
        _refresh_research_experiment_counters(db, experiment_id)
    finally:
        db.close()


def _run_research_experiment(experiment_id: str):
    from database import get_session_factory

    session_factory = get_session_factory()
    db = session_factory()
    try:
        exp = db.query(ResearchExperiment).filter(ResearchExperiment.id == experiment_id).first()
        if not exp:
            return
        exp.status = "running"
        exp.started_at = datetime.utcnow()
        db.commit()

        run_ids = [
            row.id
            for row in db.query(ResearchExperimentRun.id)
            .filter(ResearchExperimentRun.experiment_id == experiment_id)
            .order_by(ResearchExperimentRun.id.asc())
            .all()
        ]
        max_workers = max(1, int(exp.max_concurrency or 1))
    finally:
        db.close()

    if max_workers == 1:
        for rid in run_ids:
            _execute_research_experiment_run(experiment_id, rid)
    else:
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = [pool.submit(_execute_research_experiment_run, experiment_id, rid) for rid in run_ids]
            for fut in futures:
                try:
                    fut.result()
                except Exception:
                    # Per-run failures are already tracked inside run handlers.
                    pass

    db = session_factory()
    try:
        _refresh_research_experiment_counters(db, experiment_id)
    finally:
        db.close()


def _serialize_research_experiment(exp: ResearchExperiment, db: Session) -> ResearchExperimentResponse:
    scenario_map = {s["id"]: s["name"] for s in get_all_scenarios(db=db)}

    runs = (
        db.query(ResearchExperimentRun)
        .filter(ResearchExperimentRun.experiment_id == exp.id)
        .order_by(ResearchExperimentRun.scenario_id.asc(), ResearchExperimentRun.run_index.asc())
        .all()
    )

    groups: dict[str, ResearchScenarioGroupResponse] = {}
    for r in runs:
        if r.scenario_id not in groups:
            groups[r.scenario_id] = ResearchScenarioGroupResponse(
                scenario_id=r.scenario_id,
                scenario_name=scenario_map.get(r.scenario_id, r.scenario_id),
                total_runs=0,
                pending_runs=0,
                running_runs=0,
                completed_runs=0,
                failed_runs=0,
                runs=[],
            )

        group = groups[r.scenario_id]
        group.total_runs += 1
        if r.status == "pending":
            group.pending_runs += 1
        elif r.status == "running":
            group.running_runs += 1
        elif r.status == "completed":
            group.completed_runs += 1
        elif r.status == "failed":
            group.failed_runs += 1

        group.runs.append(
            ResearchExperimentRunResponse(
                id=r.id,
                scenario_id=r.scenario_id,
                scenario_name=group.scenario_name,
                run_index=r.run_index,
                run_id=r.run_id,
                status=r.status,
                error=r.error,
                started_at=r.started_at.isoformat() if r.started_at else None,
                completed_at=r.completed_at.isoformat() if r.completed_at else None,
            )
        )

    return ResearchExperimentResponse(
        experiment_id=exp.id,
        name=exp.name,
        agent_mode=exp.agent_mode,
        model=exp.model,
        max_concurrency=exp.max_concurrency,
        status=exp.status,
        total_runs=exp.total_runs,
        pending_runs=exp.pending_runs,
        running_runs=exp.running_runs,
        completed_runs=exp.completed_runs,
        failed_runs=exp.failed_runs,
        latest_error=exp.latest_error,
        created_at=exp.created_at.isoformat() if exp.created_at else None,
        started_at=exp.started_at.isoformat() if exp.started_at else None,
        completed_at=exp.completed_at.isoformat() if exp.completed_at else None,
        scenario_groups=list(groups.values()),
    )


@app.post("/api/research/experiments/start", response_model=ResearchExperimentResponse)
def start_research_experiment(req: StartResearchExperimentRequest, db: Session = Depends(get_db)):
    if req.agent_mode not in ("baseline", "guarded"):
        raise HTTPException(status_code=400, detail="agent_mode must be 'baseline' or 'guarded'")
    if not req.scenarios:
        raise HTTPException(status_code=400, detail="At least one scenario run count is required")

    sanitized: list[ResearchScenarioCount] = []
    total_runs = 0
    for item in req.scenarios:
        run_count = int(item.run_count)
        if run_count < 0:
            raise HTTPException(status_code=400, detail="run_count must be >= 0")
        if run_count == 0:
            continue
        scenario = get_scenario(item.scenario_id, db=db)
        if not scenario:
            raise HTTPException(status_code=400, detail=f"Invalid scenario_id: {item.scenario_id}")
        sanitized.append(ResearchScenarioCount(scenario_id=item.scenario_id, run_count=run_count))
        total_runs += run_count

    if total_runs == 0:
        raise HTTPException(status_code=400, detail="Provide at least one scenario with run_count > 0")

    experiment_id = str(uuid.uuid4())[:12]
    exp = ResearchExperiment(
        id=experiment_id,
        name=req.name,
        agent_mode=req.agent_mode,
        model=req.model,
        max_concurrency=max(1, int(req.max_concurrency)),
        status="pending",
        total_runs=total_runs,
        pending_runs=total_runs,
        running_runs=0,
        completed_runs=0,
        failed_runs=0,
        created_at=datetime.utcnow(),
    )
    db.add(exp)
    db.commit()

    run_rows: list[ResearchExperimentRun] = []
    for item in sanitized:
        for idx in range(1, item.run_count + 1):
            run_rows.append(
                ResearchExperimentRun(
                    experiment_id=experiment_id,
                    scenario_id=item.scenario_id,
                    run_index=idx,
                    run_id=str(uuid.uuid4())[:8],
                    status="pending",
                )
            )

    db.add_all(run_rows)
    db.commit()
    db.refresh(exp)

    thread = threading.Thread(target=_run_research_experiment, args=(experiment_id,), daemon=True)
    thread.start()

    return _serialize_research_experiment(exp, db)


@app.get("/api/research/experiments")
def list_research_experiments(db: Session = Depends(get_db)):
    rows = db.query(ResearchExperiment).order_by(ResearchExperiment.created_at.desc()).limit(25).all()
    return [_serialize_research_experiment(r, db) for r in rows]


@app.get("/api/research/experiments/{experiment_id}", response_model=ResearchExperimentResponse)
def get_research_experiment(experiment_id: str, db: Session = Depends(get_db)):
    exp = db.query(ResearchExperiment).filter(ResearchExperiment.id == experiment_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Research experiment not found")
    return _serialize_research_experiment(exp, db)


# --- Scenario CRUD (/api/batch-scenarios) ---


class ScenarioCreate(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    task: str
    system_prompt: Optional[str] = None
    emails: list = []
    documents: list = []
    config: dict = {}


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    task: Optional[str] = None
    system_prompt: Optional[str] = None
    emails: Optional[list] = None
    documents: Optional[list] = None
    config: Optional[dict] = None


class ScenarioResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    task: str
    system_prompt: Optional[str] = None
    emails: list
    documents: list
    config: dict
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


def _serialize_scenario(row: Scenario) -> ScenarioResponse:
    return ScenarioResponse(
        id=row.id,
        name=row.name,
        description=row.description,
        task=row.task,
        system_prompt=row.system_prompt,
        emails=_loads_or_default(row.emails_json, []),
        documents=_loads_or_default(row.documents_json, []),
        config=_loads_or_default(row.config_json, {}),
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@app.post("/api/batch-scenarios", response_model=ScenarioResponse)
def create_scenario(req: ScenarioCreate, db: Session = Depends(get_db)):
    scenario_id = req.id or str(uuid.uuid4())[:12]
    existing = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Scenario '{scenario_id}' already exists")

    row = Scenario(
        id=scenario_id,
        name=req.name,
        description=req.description,
        task=req.task,
        system_prompt=req.system_prompt,
        emails_json=json.dumps(req.emails),
        documents_json=json.dumps(req.documents),
        config_json=json.dumps(req.config),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_scenario(row)


@app.get("/api/batch-scenarios")
def list_batch_scenarios(db: Session = Depends(get_db)):
    rows = db.query(Scenario).order_by(Scenario.created_at).all()
    return [_serialize_scenario(r) for r in rows]


@app.get("/api/batch-scenarios/{scenario_id}", response_model=ScenarioResponse)
def get_batch_scenario(scenario_id: str, db: Session = Depends(get_db)):
    row = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return _serialize_scenario(row)


@app.put("/api/batch-scenarios/{scenario_id}", response_model=ScenarioResponse)
def update_scenario(scenario_id: str, req: ScenarioUpdate, db: Session = Depends(get_db)):
    row = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if req.name is not None:
        row.name = req.name
    if req.description is not None:
        row.description = req.description
    if req.task is not None:
        row.task = req.task
    if req.system_prompt is not None:
        row.system_prompt = req.system_prompt
    if req.emails is not None:
        row.emails_json = json.dumps(req.emails)
    if req.documents is not None:
        row.documents_json = json.dumps(req.documents)
    if req.config is not None:
        row.config_json = json.dumps(req.config)

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _serialize_scenario(row)


@app.delete("/api/batch-scenarios/{scenario_id}")
def delete_scenario(scenario_id: str, db: Session = Depends(get_db)):
    row = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Scenario not found")

    has_results = db.query(BatchResult).filter(BatchResult.scenario_id == scenario_id).first()
    if has_results:
        raise HTTPException(status_code=409, detail="Cannot delete scenario with existing batch results")

    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": scenario_id}


@app.post("/api/batch-scenarios/seed")
def seed_scenarios(db: Session = Depends(get_db)):
    """Migrate hardcoded SCENARIOS dict into the DB. Skips existing IDs."""
    from scenarios import SCENARIOS

    created = []
    skipped = []
    for s in SCENARIOS.values():
        existing = db.query(Scenario).filter(Scenario.id == s["id"]).first()
        if existing:
            skipped.append(s["id"])
            continue
        row = Scenario(
            id=s["id"],
            name=s["name"],
            description=s.get("description", ""),
            task=s["task"],
            emails_json=json.dumps(s.get("emails", [])),
            documents_json=json.dumps(s.get("documents", [])),
            config_json=json.dumps(s.get("config", {})),
        )
        db.add(row)
        created.append(s["id"])

    db.commit()
    return {"created": created, "skipped": skipped}


# --- Batch run endpoints ---


class BatchRunRequest(BaseModel):
    scenario_id: str
    model: str = "claude-haiku-4-5-20251001"


class BatchResultResponse(BaseModel):
    id: str
    batch_run_id: str
    scenario_id: str
    email_index: int
    email_id: str
    model: str
    model_output: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    latency_seconds: Optional[float] = None
    status: str
    error: Optional[str] = None
    created_at: Optional[str] = None


class BatchRunResponse(BaseModel):
    id: str
    scenario_id: str
    model: str
    status: str
    email_count: int
    succeeded: int
    failed: int
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    results: List[BatchResultResponse] = []


def _serialize_batch_result(r: BatchResult) -> BatchResultResponse:
    return BatchResultResponse(
        id=r.id,
        batch_run_id=r.batch_run_id,
        scenario_id=r.scenario_id,
        email_index=r.email_index,
        email_id=r.email_id,
        model=r.model,
        model_output=r.model_output,
        input_tokens=r.input_tokens,
        output_tokens=r.output_tokens,
        latency_seconds=r.latency_seconds,
        status=r.status,
        error=r.error,
        created_at=r.created_at.isoformat() if r.created_at else None,
    )


def _serialize_batch_run(run: BatchRun, include_results: bool = False) -> BatchRunResponse:
    return BatchRunResponse(
        id=run.id,
        scenario_id=run.scenario_id,
        model=run.model,
        status=run.status,
        email_count=run.email_count,
        succeeded=run.succeeded,
        failed=run.failed,
        created_at=run.created_at.isoformat() if run.created_at else None,
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
        results=[_serialize_batch_result(r) for r in run.results] if include_results else [],
    )


@app.post("/api/batch", response_model=BatchRunResponse)
async def batch_run(req: BatchRunRequest):
    """Run a scenario's emails cumulatively through the model, storing results in DB."""
    try:
        from batch_runner import run_batch
        from database import get_session_factory
        return await run_batch(req.scenario_id, req.model, get_session_factory())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/batch-runs")
def list_batch_runs(db: Session = Depends(get_db)):
    runs = db.query(BatchRun).order_by(BatchRun.created_at.desc()).limit(50).all()
    return [_serialize_batch_run(r) for r in runs]


@app.get("/api/batch-runs/{batch_id}", response_model=BatchRunResponse)
def get_batch_run(batch_id: str, db: Session = Depends(get_db)):
    run = db.query(BatchRun).filter(BatchRun.id == batch_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Batch run not found")
    return _serialize_batch_run(run, include_results=True)


@app.get("/api/batch-results/{result_id}", response_model=BatchResultResponse)
def get_batch_result(result_id: str, db: Session = Depends(get_db)):
    result = db.query(BatchResult).filter(BatchResult.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Batch result not found")
    return _serialize_batch_result(result)


# --- Grade from DB endpoints ---


class GradeResultRequest(BaseModel):
    batch_result_id: str


class GradeBatchRunRequest(BaseModel):
    batch_run_id: str


@app.post("/api/evals/grade-result", response_model=EvalResponse)
def grade_single_result(req: GradeResultRequest, db: Session = Depends(get_db)):
    """Grade a single BatchResult by ID."""
    result = db.query(BatchResult).filter(BatchResult.id == req.batch_result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Batch result not found")
    if result.status != "success" or not result.model_output:
        raise HTTPException(status_code=400, detail="Cannot grade a result with status != success")

    prompt_text = f"[SYSTEM]\n{result.system_prompt_snapshot or ''}\n\n[MESSAGES]\n{result.messages_json}"

    grade_eval_file, analyze_batch, should_auto_analyze = _get_eval_services()
    payload = {
        "prompt": prompt_text,
        "model_output": result.model_output,
        "model_name": result.model,
        "source": f"batch:{result.batch_run_id}",
    }
    record = grade_eval_file(db, batch_id=result.batch_run_id, payload=payload, source_file=None)

    if should_auto_analyze(db, result.batch_run_id):
        analyze_batch(db, batch_id=result.batch_run_id, trigger_mode="auto")

    return _serialize_eval(record)


@app.post("/api/evals/grade-batch")
def grade_batch_run(req: GradeBatchRunRequest, db: Session = Depends(get_db)):
    """Grade all successful results in a BatchRun."""
    run = db.query(BatchRun).filter(BatchRun.id == req.batch_run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Batch run not found")

    results = (
        db.query(BatchResult)
        .filter(BatchResult.batch_run_id == req.batch_run_id, BatchResult.status == "success")
        .order_by(BatchResult.email_index)
        .all()
    )
    if not results:
        raise HTTPException(status_code=400, detail="No successful results to grade")

    grade_eval_file, analyze_batch, should_auto_analyze = _get_eval_services()

    graded = 0
    errors = 0
    for result in results:
        try:
            prompt_text = f"[SYSTEM]\n{result.system_prompt_snapshot or ''}\n\n[MESSAGES]\n{result.messages_json}"
            payload = {
                "prompt": prompt_text,
                "model_output": result.model_output,
                "model_name": result.model,
                "source": f"batch:{result.batch_run_id}",
            }
            grade_eval_file(db, batch_id=result.batch_run_id, payload=payload, source_file=None)
            graded += 1
        except Exception as e:
            print(f"[grade-batch] Error grading result {result.id}: {e}")
            errors += 1

    if should_auto_analyze(db, req.batch_run_id):
        analyze_batch(db, batch_id=req.batch_run_id, trigger_mode="auto")

    return {"batch_run_id": req.batch_run_id, "graded": graded, "errors": errors}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
