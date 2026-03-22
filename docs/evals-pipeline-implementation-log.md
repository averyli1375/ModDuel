# Evals Pipeline Implementation Log

This file is updated as implementation proceeds.

## Entries
- 2026-03-21: Created physical docs in repository for design, plan, and implementation log.
- 2026-03-21: Locked final planning decisions for v1 (critical flags, threshold, per-batch auto-analysis cadence).
- 2026-03-21: Started implementation. Added eval persistence models (`EvalRecord`, `EvalAnalysis`) in `backend/models.py`.
- 2026-03-21: Added eval grading logic for one JSON file (`grade_eval_file`) in `backend/scorer.py`.
- 2026-03-21: Added batch analyzer module (`backend/analyzer.py`) with deterministic metrics + analyzer LLM pass.
- 2026-03-21: Added eval API endpoints in `backend/main.py`:
	- `POST /api/evals/grade-file`
	- `GET /api/evals/{eval_id}`
	- `GET /api/evals/batch/{batch_id}`
	- `POST /api/evals/analyze`
	- `GET /api/evals/analysis/{analysis_id}`
- 2026-03-21: Added automatic analysis trigger every 50 graded files per `batch_id`.
- 2026-03-21: Performed sanity check with `python3 -m py_compile main.py scorer.py analyzer.py models.py`.
- 2026-03-21: Added demo test assets under `backend/outputs/demo_batch_001/` (`case_001.json`, `case_002.json`).
- 2026-03-21: Added runnable demo script `backend/tests/demo_eval_case.py` for endpoint-level grading and batch analysis output.
- 2026-03-21: Executed demo script successfully and validated real response payloads for grading and analysis endpoints.
- 2026-03-21: Started `The Research Lab` implementation (multi-scenario experiment UI + backend orchestration).
- 2026-03-21: Added backend models `ResearchExperiment` and `ResearchExperimentRun` in `backend/models.py`.
- 2026-03-21: Added backend endpoints in `backend/main.py`:
	- `POST /api/research/experiments/start`
	- `GET /api/research/experiments`
	- `GET /api/research/experiments/{experiment_id}`
- 2026-03-21: Added backend background orchestrator for experiment execution with bounded concurrency support.
- 2026-03-21: Added frontend API contracts in `frontend/src/lib/api.ts` for research experiment start/list/get.
- 2026-03-21: Added new UI component `frontend/src/components/ResearchLab.tsx`.
- 2026-03-21: Added new top-level tab `The Research Lab` in `frontend/src/app/page.tsx` and connected live polling + run log selection.
- 2026-03-21: Smoke-tested research endpoints via FastAPI TestClient (start/get returned 200 and transitioned to running).
- 2026-03-21: Slice 2 complete — added `experiment_id` filtering to `GET /api/runs` for Reckoning auto-filter flow.
- 2026-03-21: Slice 2 complete — added Research Lab concurrency input (default 1) and wired it into experiment start payload.
- 2026-03-21: Slice 2 complete — added ETA/status enrichment in Research Lab right panel (ETA + active run label).
- 2026-03-21: Slice 2 complete — added Reckoning filter badge/clear action when navigating from Research Lab results.

## Current Status
- Planning complete.
- Implementation in progress.

## Next Update Template
- Date:
- Change:
- Files touched:
- Validation performed:
- Follow-up:
