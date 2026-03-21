"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Scenario,
  ScenarioDetail,
  Run,
  fetchScenarios,
  fetchScenarioDetail,
  startRun,
  fetchRun,
  fetchRuns,
  RunSummary,
} from "@/lib/api";
import Inbox from "@/components/Inbox";
import TaskBoard from "@/components/TaskBoard";
import ActionLog from "@/components/ActionLog";
import Dashboard from "@/components/Dashboard";

type Tab = "arena" | "reckoning";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("arena");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [scenarioDetail, setScenarioDetail] = useState<ScenarioDetail | null>(null);
  const [agentMode, setAgentMode] = useState<"baseline" | "guarded">("baseline");
  const [currentRun, setCurrentRun] = useState<Run | null>(null);
  const [comparisonRun, setComparisonRun] = useState<Run | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastRuns, setPastRuns] = useState<RunSummary[]>([]);
  const [selectedComparison, setSelectedComparison] = useState<string>("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch scenarios on mount
  useEffect(() => {
    fetchScenarios()
      .then((data) => {
        setScenarios(data);
        if (data.length > 0) setSelectedScenario(data[0].id);
      })
      .catch(() => setError("Failed to connect to backend. Is the server running?"));
  }, []);

  // Fetch scenario detail when selection changes
  useEffect(() => {
    if (!selectedScenario) return;
    fetchScenarioDetail(selectedScenario).then(setScenarioDetail).catch(console.error);
  }, [selectedScenario]);

  // Fetch past runs
  const loadPastRuns = useCallback(() => {
    fetchRuns().then(setPastRuns).catch(console.error);
  }, []);

  useEffect(() => {
    loadPastRuns();
  }, [loadPastRuns]);

  // Polling for run updates
  const startPolling = useCallback((runId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const run = await fetchRun(runId);
        setCurrentRun(run);

        if (run.status === "completed" || run.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setIsRunning(false);
          loadPastRuns();
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
  }, [loadPastRuns]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleStartRun = async () => {
    if (!selectedScenario || isRunning) return;
    setError(null);

    try {
      const result = await startRun(selectedScenario, agentMode);
      setIsRunning(true);
      setCurrentRun(null);
      setComparisonRun(null);
      startPolling(result.run_id);
    } catch (err) {
      setError(`Failed to start run: ${err}`);
    }
  };

  const handleLoadComparison = async (runId: string) => {
    if (!runId) {
      setComparisonRun(null);
      return;
    }
    try {
      const run = await fetchRun(runId);
      setComparisonRun(run);
    } catch (err) {
      console.error("Failed to load comparison run:", err);
    }
  };

  // Derive which emails have been read
  const readEmails = new Set<string>();
  if (currentRun?.actions) {
    for (const action of currentRun.actions) {
      if (action.tool_name === "read_email" && action.tool_input) {
        try {
          const input = JSON.parse(action.tool_input);
          readEmails.add(input.email_id);
        } catch { /* ignore */ }
      }
    }
  }

  const currentScenario = scenarios.find((s) => s.id === selectedScenario);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gold/30 bg-wood-medium/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⭐</span>
            <div>
              <h1 className="font-[family-name:var(--font-western)] text-gold text-2xl leading-tight">
                MODDUEL ARENA
              </h1>
              <p className="text-[10px] text-parchment-dark uppercase tracking-[0.2em]">
                The Frontier AI Alignment Testing Ground
              </p>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 bg-wood-dark/50 rounded p-1">
            <button
              onClick={() => setActiveTab("arena")}
              className={`px-4 py-1.5 rounded text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === "arena"
                  ? "bg-gold text-wood-dark"
                  : "text-parchment-dark hover:text-parchment"
              }`}
            >
              🤠 Arena
            </button>
            <button
              onClick={() => setActiveTab("reckoning")}
              className={`px-4 py-1.5 rounded text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === "reckoning"
                  ? "bg-gold text-wood-dark"
                  : "text-parchment-dark hover:text-parchment"
              }`}
            >
              📊 Reckoning
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-danger/20 border-b border-danger/40 px-4 py-2 text-center text-sm text-danger">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4">
        {activeTab === "arena" ? (
          <div className="flex gap-4 h-[calc(100vh-120px)]">
            {/* Left sidebar: Scenario selector */}
            <div className="w-72 flex-shrink-0 flex flex-col gap-4">
              {/* Scenario selector */}
              <div className="parchment-card p-4">
                <h2 className="font-[family-name:var(--font-western)] text-gold text-sm mb-3 uppercase tracking-wider">
                  Choose Your Scenario
                </h2>
                <div className="space-y-2">
                  {scenarios.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedScenario(s.id)}
                      disabled={isRunning}
                      className={`w-full text-left p-3 rounded border transition-all ${
                        selectedScenario === s.id
                          ? "border-gold bg-gold/10 glow-gold"
                          : "border-wood-light/30 hover:border-gold/50 bg-wood-medium/30"
                      } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <p className="text-sm font-bold text-parchment">
                        {s.name}
                      </p>
                      <p className="text-[11px] text-parchment-dark mt-1 line-clamp-2">
                        {s.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Agent mode selector */}
              <div className="parchment-card p-4">
                <h2 className="font-[family-name:var(--font-western)] text-gold text-sm mb-3 uppercase tracking-wider">
                  Agent Mode
                </h2>
                <div className="space-y-2">
                  <button
                    onClick={() => setAgentMode("baseline")}
                    disabled={isRunning}
                    className={`w-full text-left p-3 rounded border transition-all ${
                      agentMode === "baseline"
                        ? "border-rust bg-rust/10"
                        : "border-wood-light/30 hover:border-rust/50 bg-wood-medium/30"
                    } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <p className="text-sm font-bold text-rust">🤠 Baseline</p>
                    <p className="text-[11px] text-parchment-dark mt-1">
                      No guardrails. Raw agent behavior.
                    </p>
                  </button>
                  <button
                    onClick={() => setAgentMode("guarded")}
                    disabled={isRunning}
                    className={`w-full text-left p-3 rounded border transition-all ${
                      agentMode === "guarded"
                        ? "border-safe bg-safe/10"
                        : "border-wood-light/30 hover:border-safe/50 bg-wood-medium/30"
                    } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <p className="text-sm font-bold text-safe">🛡️ Guarded</p>
                    <p className="text-[11px] text-parchment-dark mt-1">
                      With alignment guardrails and monitoring.
                    </p>
                  </button>
                </div>
              </div>

              {/* Run button */}
              <button
                onClick={handleStartRun}
                disabled={isRunning || !selectedScenario}
                className={`w-full py-3 rounded font-[family-name:var(--font-western)] text-lg uppercase tracking-wider transition-all ${
                  isRunning
                    ? "bg-gold/30 text-parchment-dark cursor-not-allowed"
                    : "bg-gold text-wood-dark hover:bg-gold-bright glow-gold"
                }`}
              >
                {isRunning ? "⏳ Running..." : "🔥 RIDE OUT"}
              </button>

              {/* Quick score preview */}
              {currentRun?.score && (
                <div
                  className="parchment-card p-4 cursor-pointer hover:glow-gold transition-all"
                  onClick={() => setActiveTab("reckoning")}
                >
                  <p className="text-xs text-parchment-dark uppercase tracking-wider">
                    Latest Result
                  </p>
                  <p className="text-3xl font-[family-name:var(--font-western)] text-gold mt-1">
                    {Math.round(currentRun.score.alignment_score)}
                  </p>
                  <p className="text-xs text-parchment-dark">
                    Click for full reckoning →
                  </p>
                </div>
              )}
            </div>

            {/* Main area: 3-pane view */}
            <div className="flex-1 flex flex-col gap-4 min-w-0">
              {/* Top row: Inbox + Task Board */}
              <div className="flex gap-4 h-[45%]">
                <div className="flex-1 min-w-0">
                  <Inbox
                    emails={
                      scenarioDetail?.emails.map((e) => ({
                        id: e.id,
                        from: e.from,
                        subject: e.subject,
                      })) || []
                    }
                    readEmails={readEmails}
                    actions={currentRun?.actions || []}
                  />
                </div>
                <div className="w-80 flex-shrink-0">
                  <TaskBoard
                    task={currentScenario?.task || "Select a scenario to begin..."}
                    scenarioName={currentScenario?.name || "No scenario selected"}
                    agentMode={agentMode}
                    status={currentRun?.status || "pending"}
                  />
                </div>
              </div>

              {/* Bottom: Action Log */}
              <div className="flex-1 min-h-0">
                <ActionLog
                  actions={currentRun?.actions || []}
                  isRunning={isRunning}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Reckoning (Dashboard) tab */
          <div className="max-w-5xl mx-auto">
            {/* Comparison selector */}
            <div className="parchment-card p-4 mb-6">
              <div className="flex items-center gap-4 flex-wrap">
                <h3 className="font-[family-name:var(--font-serif)] text-gold text-sm uppercase tracking-wider">
                  Compare with past run:
                </h3>
                <select
                  value={selectedComparison}
                  onChange={(e) => {
                    setSelectedComparison(e.target.value);
                    handleLoadComparison(e.target.value);
                  }}
                  className="bg-wood-medium border border-gold/30 rounded px-3 py-1.5 text-sm text-parchment focus:outline-none focus:border-gold"
                >
                  <option value="">No comparison</option>
                  {pastRuns
                    .filter(
                      (r) =>
                        r.status === "completed" && r.id !== currentRun?.id
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        [{r.id}] {r.scenario_id} / {r.agent_mode}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <Dashboard
              currentRun={currentRun}
              comparisonRun={comparisonRun}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-wood-light/20 py-3 text-center text-xs text-parchment-dark">
        ModDuel Arena — Testing AI Alignment on the Frontier — HooHacks 2026
      </footer>
    </div>
  );
}
