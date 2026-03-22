"use client";

import { Scenario, ResearchExperiment, Run } from "@/lib/api";
import ActionLog from "@/components/ActionLog";

interface ResearchLabProps {
  scenarios: Scenario[];
  counts: Record<string, number>;
  onCountChange: (scenarioId: string, count: number) => void;
  onRunExperiment: () => void;
  isStarting: boolean;
  experiment: ResearchExperiment | null;
  etaText: string | null;
  activeRunLabel: string | null;
  selectedRunId: string | null;
  selectedRun: Run | null;
  onSelectRun: (runId: string) => void;
  onGoToResults: () => void;
}

export default function ResearchLab({
  scenarios,
  counts,
  onCountChange,
  onRunExperiment,
  isStarting,
  experiment,
  etaText,
  activeRunLabel,
  selectedRunId,
  selectedRun,
  onSelectRun,
  onGoToResults,
}: ResearchLabProps) {
  const totalPlanned = scenarios.reduce((acc, s) => acc + (counts[s.id] || 0), 0);
  const canRun =
    totalPlanned > 0 &&
    !isStarting &&
    (!experiment || experiment.status !== "running");

  return (
    <div className="flex gap-4 h-full min-h-0">
      <div className="w-80 flex-shrink-0 wood-board p-2 h-full min-h-0 flex flex-col">
        <div className="wanted-poster p-3 h-full flex flex-col min-h-0">
          <h2 className="font-[family-name:var(--font-western)] text-xl text-wood-dark text-center border-b border-wood-dark/30 pb-2">
            The Research Lab
          </h2>
          <p className="text-xs text-wood-dark/80 mt-2 text-center">
            Select how many runs to execute per scenario.
          </p>

          <div className="mt-3 space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1 min-h-0">
            {scenarios.map((s) => (
              <div key={s.id} className="paper-texture border border-wood-light/60 p-2 rounded-sm">
                <p className="font-[family-name:var(--font-western)] text-sm text-wood-dark">{s.name}</p>
                <p className="text-xs italic text-wood-dark/70 line-clamp-2">{s.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[11px] uppercase tracking-wider text-wood-dark/70">Runs</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={counts[s.id] === 0 ? "" : counts[s.id]}
                    placeholder="0"
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!/^\d*$/.test(raw)) return;
                      if (raw === "") {
                        onCountChange(s.id, 0);
                        return;
                      }
                      const parsed = Number.parseInt(raw, 10);
                      onCountChange(s.id, Number.isNaN(parsed) ? 0 : parsed);
                    }}
                    className="w-20 px-2 py-1 text-sm border border-wood-dark/30 bg-parchment text-wood-dark rounded-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-wood-dark/20 pt-3 space-y-2">
            <p className="text-xs text-wood-dark/80">Total planned runs: {totalPlanned}</p>
            <p className="text-[11px] text-wood-dark/80">
              Execution mode: sequential (1 run at a time) to avoid rate limits.
            </p>
            <button
              onClick={onRunExperiment}
              disabled={!canRun}
              className={`w-full py-2 font-[family-name:var(--font-western)] uppercase rounded-sm border ${
                canRun
                  ? "bg-wood-dark text-gold border-gold hover:brightness-110"
                  : "bg-wood-medium/50 text-wood-dark/50 border-wood-dark/20 cursor-not-allowed"
              }`}
            >
              {isStarting ? "Starting..." : "Run Experiment"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 wood-board p-2 h-full min-h-0 flex flex-col">
        <div className="terminal-panel p-3 h-full flex flex-col min-h-0">
          <h3 className="font-[family-name:var(--font-western)] text-parchment text-lg border-b border-zinc-700/50 pb-2">
            Experiment Runs
          </h3>

          {!experiment ? (
            <p className="text-zinc-500 text-sm mt-3">Start a research experiment to see grouped runs.</p>
          ) : (
            <div className="mt-3 flex-1 min-h-0 flex flex-col gap-3">
              <div className="overflow-y-auto custom-scrollbar pr-1 space-y-2 max-h-[45%]">
                {experiment.scenario_groups.map((group) => (
                  <details key={group.scenario_id} open className="bg-zinc-900/60 border border-zinc-700 rounded-sm">
                    <summary className="cursor-pointer p-2 text-sm text-parchment flex items-center justify-between">
                      <span>{group.scenario_name}</span>
                      <span className="text-xs text-zinc-400">
                        {group.completed_runs + group.failed_runs}/{group.total_runs}
                      </span>
                    </summary>
                    <div className="px-2 pb-2 space-y-1">
                      {group.runs.map((run) => (
                        <button
                          key={run.id}
                          onClick={() => onSelectRun(run.run_id)}
                          className={`w-full text-left px-2 py-1 rounded text-xs border ${
                            selectedRunId === run.run_id
                              ? "bg-gold/20 border-gold/40 text-gold"
                              : "bg-zinc-800/60 border-zinc-700 text-zinc-200"
                          }`}
                        >
                          Run {run.run_index} - {run.status}
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </div>

              <div className="flex-1 min-h-0">
                <ActionLog actions={selectedRun?.actions || []} isRunning={experiment.status === "running"} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="w-80 flex-shrink-0 wood-board p-2 h-full min-h-0 flex flex-col">
        <div className="wood-panel p-3 h-full flex flex-col">
          <h3 className="font-[family-name:var(--font-western)] text-parchment text-lg border-b border-wood-light/20 pb-2 text-center">
            Overall Status
          </h3>

          {!experiment ? (
            <p className="text-parchment-dark text-sm mt-4 text-center">No active experiment</p>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-parchment">
              <p>Experiment ID: <span className="font-mono">{experiment.experiment_id}</span></p>
              <p>Status: <span className="uppercase">{experiment.status}</span></p>
              <p>Progress: {experiment.completed_runs + experiment.failed_runs}/{experiment.total_runs}</p>
              <p>Pending: {experiment.pending_runs}</p>
              <p>Running: {experiment.running_runs}</p>
              <p>Completed: {experiment.completed_runs}</p>
              <p>Failed: {experiment.failed_runs}</p>
              <p>ETA: {etaText || "Calculating..."}</p>
              <p>Active run: {activeRunLabel || "None"}</p>
              {experiment.latest_error ? (
                <p className="text-danger text-xs border border-danger/30 bg-danger/10 p-2 rounded-sm">
                  Latest error: {experiment.latest_error}
                </p>
              ) : null}

              {experiment.total_runs > 0 ? (
                <div className="w-full bg-zinc-800 rounded h-2 mt-2">
                  <div
                    className="bg-safe h-2 rounded"
                    style={{
                      width: `${Math.round(((experiment.completed_runs + experiment.failed_runs) / experiment.total_runs) * 100)}%`,
                    }}
                  />
                </div>
              ) : null}

              <button
                onClick={onGoToResults}
                disabled={experiment.status !== "completed"}
                className={`w-full mt-4 py-2 font-[family-name:var(--font-western)] uppercase rounded-sm border ${
                  experiment.status === "completed"
                    ? "bg-safe text-white border-safe hover:brightness-110"
                    : "bg-wood-medium/50 text-wood-dark/50 border-wood-dark/20 cursor-not-allowed"
                }`}
              >
                Go To Results
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
