const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  task: string;
  email_count: number;
}

export interface ScenarioDetail extends Scenario {
  emails: { id: string; from: string; subject: string }[];
}

export interface Action {
  id: number;
  turn: number;
  action_type: string;
  tool_name: string | null;
  tool_input: string | null;
  tool_output: string | null;
  content: string | null;
  is_unsafe: boolean;
  unsafe_types: string | null;
  timestamp: string;
}

export interface Score {
  task_success: number;
  unsafe_action_count: number;
  total_actions: number;
  unsafe_action_rate: number;
  escalation_count: number;
  escalation_rate: number;
  shutdown_interference: boolean;
  deception_detected: boolean;
  alignment_score: number;
  judge_analysis: string | null;
}

export interface Run {
  id: string;
  scenario_id: string;
  agent_mode: string;
  model: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  actions: Action[];
  score: Score | null;
}

export interface RunSummary {
  id: string;
  scenario_id: string;
  agent_mode: string;
  model: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface ResearchScenarioCount {
  scenario_id: string;
  run_count: number;
}

export interface StartResearchExperimentPayload {
  name?: string;
  agent_mode: "baseline" | "guarded";
  model?: string;
  max_concurrency: number;
  scenarios: ResearchScenarioCount[];
}

export interface ResearchExperimentRun {
  id: number;
  scenario_id: string;
  scenario_name: string;
  run_index: number;
  run_id: string;
  status: string;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ResearchScoreSummary {
  scored_runs: number;
  avg_alignment_score: number;
  avg_task_success: number;
  avg_unsafe_action_count: number;
  avg_unsafe_action_rate: number;
  avg_escalation_rate: number;
  total_unsafe_actions: number;
  total_actions: number;
  shutdown_interference_count: number;
  deception_detected_count: number;
}

export interface ResearchScenarioGroup {
  scenario_id: string;
  scenario_name: string;
  total_runs: number;
  pending_runs: number;
  running_runs: number;
  completed_runs: number;
  failed_runs: number;
  summary: ResearchScoreSummary;
  runs: ResearchExperimentRun[];
}

export interface ResearchExperiment {
  experiment_id: string;
  name: string | null;
  agent_mode: string;
  model: string;
  max_concurrency: number;
  status: string;
  total_runs: number;
  pending_runs: number;
  running_runs: number;
  completed_runs: number;
  failed_runs: number;
  latest_error: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  summary: ResearchScoreSummary;
  scenario_groups: ResearchScenarioGroup[];
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const res = await fetch(`${API_BASE}/api/scenarios`);
  if (!res.ok) throw new Error("Failed to fetch scenarios");
  return res.json();
}

export async function fetchScenarioDetail(id: string): Promise<ScenarioDetail> {
  const res = await fetch(`${API_BASE}/api/scenarios/${id}`);
  if (!res.ok) throw new Error("Failed to fetch scenario");
  return res.json();
}

export async function startRun(
  scenarioId: string,
  agentMode: string,
  model: string = "claude-haiku-4-5-20251001"
): Promise<{ run_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/runs/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario_id: scenarioId,
      agent_mode: agentMode,
      model,
    }),
  });
  if (!res.ok) throw new Error("Failed to start run");
  return res.json();
}

export async function fetchRun(runId: string): Promise<Run> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}`);
  if (!res.ok) throw new Error(`Failed to fetch run (${res.status})`);
  return res.json();
}

export async function fetchRuns(experimentId?: string): Promise<RunSummary[]> {
  const query = experimentId ? `?experiment_id=${encodeURIComponent(experimentId)}` : "";
  const res = await fetch(`${API_BASE}/api/runs${query}`);
  if (!res.ok) throw new Error("Failed to fetch runs");
  return res.json();
}

export async function compareRuns(
  runIds: string[]
): Promise<{ runs: { run_id: string; scenario_id: string; agent_mode: string; scores: Score }[] }> {
  const res = await fetch(`${API_BASE}/api/compare?run_ids=${runIds.join(",")}`);
  if (!res.ok) throw new Error("Failed to compare runs");
  return res.json();
}

export async function startResearchExperiment(
  payload: StartResearchExperimentPayload
): Promise<ResearchExperiment> {
  const res = await fetch(`${API_BASE}/api/research/experiments/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to start research experiment");
  return res.json();
}

export async function fetchResearchExperiment(experimentId: string): Promise<ResearchExperiment> {
  const res = await fetch(`${API_BASE}/api/research/experiments/${experimentId}`);
  if (!res.ok) throw new Error("Failed to fetch research experiment");
  return res.json();
}

export async function fetchResearchExperiments(): Promise<ResearchExperiment[]> {
  const res = await fetch(`${API_BASE}/api/research/experiments`);
  if (!res.ok) throw new Error("Failed to fetch research experiments");
  return res.json();
}
