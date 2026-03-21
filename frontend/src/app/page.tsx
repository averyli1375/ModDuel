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
    <div className="h-screen flex flex-col overflow-hidden western-scene dust-mote">
      <div className="town-decor" aria-hidden="true">
        <span className="scene-sky" />
        <span className="scene-road" />
        <span className="scene-left-town" />
        <span className="scene-right-town" />
        <span className="scene-wagon wagon-one" />
        <span className="tumbleweed tumbleweed-one" />
        <span className="tumbleweed tumbleweed-two" />
      </div>

      {/* Header */}
      <header className="saloon-header rope-divider backdrop-blur-sm sticky top-0 z-50 shadow-2xl relative">
        <div className="absolute inset-0 bg-wood-dark" style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E"), linear-gradient(to bottom, transparent, rgba(0,0,0,0.5))`
        }}></div>
        <div className="relative max-w-[1600px] mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              {/* Crossed revolvers / Star icon placeholder */}
              <span className="text-4xl text-gold drop-shadow-md">✯</span>
            </div>
            <div className="wood-board px-6 py-2 shadow-lg border-2 border-wood-darker transform -rotate-1 relative z-10 before:absolute before:inset-0 before:bg-gradient-to-t before:from-black/20 before:to-transparent">
              <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-zinc-800 shadow-inner" />
              <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-zinc-800 shadow-inner" />
              <div className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-zinc-800 shadow-inner" />
              <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-zinc-800 shadow-inner" />
              <h1 className="font-[family-name:var(--font-western)] text-wood-dark text-4xl leading-none drop-shadow-sm">
                MODDUEL
              </h1>
              <p className="text-[10px] text-wood-dark font-bold uppercase tracking-[0.2em] relative z-10">
                Red-Teaming for Frontier Models
              </p>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-2 p-2 relative z-10">
            <button
              onClick={() => setActiveTab("arena")}
              className={`wood-board px-6 py-2 shadow-md transition-all border-2 border-wood-darker transform hover:-translate-y-1 ${
                activeTab === "arena"
                  ? "bg-amber-100 text-wood-dark rotate-1"
                  : "bg-wood-medium opacity-80 text-wood-dark hover:opacity-100"
              }`}
            >
              <span className="font-[family-name:var(--font-western)] text-xl">The Arena</span>
            </button>
            <button
              onClick={() => setActiveTab("reckoning")}
              className={`wood-board px-6 py-2 shadow-md transition-all border-2 border-wood-darker transform hover:-translate-y-1 ${
                activeTab === "reckoning"
                  ? "bg-amber-100 text-wood-dark -rotate-1"
                  : "bg-wood-medium opacity-80 text-wood-dark hover:opacity-100"
              }`}
            >
               <span className="font-[family-name:var(--font-western)] text-xl">The Reckoning</span>
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
      <main className={`flex-1 max-w-[1600px] mx-auto w-full p-4 relative z-10 ${activeTab === "arena" ? "overflow-hidden" : "overflow-y-auto"}`}>
        {activeTab === "arena" ? (
          <div className="flex gap-4 h-full min-h-0">
            {/* Left sidebar: Scenario selector */}
            <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
              {/* Scenario selector */}
              <div className="wood-board p-2 h-max flex flex-col items-center">
                <div className="wanted-poster p-4 w-full h-full shadow-md animate-fade-in relative z-10 transition-transform">
                  <h2 className="font-[family-name:var(--font-western)] text-wood-dark text-xl mb-3 flex items-center justify-center gap-2 border-b-2 border-wood-dark/30 pb-2">
                    <span className="text-sm">★</span> Bounty Target <span className="text-sm">★</span>
                  </h2>
                  <div className="space-y-3">
                    {scenarios.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedScenario(s.id)}
                        disabled={isRunning}
                        className={`w-full text-left p-2 transition-all hover:-translate-y-1 relative paper-texture shadow-sm ${
                          selectedScenario === s.id
                            ? "bg-amber-100 border border-wood-dark"
                            : "bg-parchment/80 border border-wood-light/50 hover:bg-parchment"
                        } ${isRunning ? "opacity-50 cursor-not-allowed" : ""} ${
                          s.id === selectedScenario ? "-skew-y-1" : "skew-y-1"
                        }`}
                      >
                        <div className="absolute top-0.5 right-1 text-[8px] text-wood-dark/50 uppercase">wanted</div>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-zinc-400 shadow-md border border-zinc-600 z-10" />
                        <p className="text-md font-bold text-wood-dark mt-1 font-[family-name:var(--font-western)] text-center">
                          {s.name}
                        </p>
                        <p className="text-xs text-wood-dark mt-1 line-clamp-2 italic font-serif text-center">
                          {s.description}
                        </p>
                      </button>
                  ))}
                  </div>
                </div>
              </div>

              {/* Agent mode selector */}
              <div className="wood-board p-2 animate-fade-in relative">
                {/* Nails */}
                <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-wood-darker shadow-inner" />
                <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-wood-darker shadow-inner" />
                <div className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-wood-darker shadow-inner" />
                <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-wood-darker shadow-inner" />

                <div className="wood-panel border-4 border-wood-dark/40 p-3 h-full flex flex-col">
                  <h2 className="font-[family-name:var(--font-western)] text-parchment text-lg mb-3 uppercase tracking-wider text-center border-b border-wood-light/20 pb-2">
                    Marshal Orders
                  </h2>
                  <div className="space-y-2 font-serif relative z-10 w-full px-1">
                    <button
                      onClick={() => setAgentMode("baseline")}
                      disabled={isRunning}
                      className={`w-full text-left p-2 rounded-sm border transition-all hover:scale-[1.02] shadow-sm flex items-center gap-2 ${
                        agentMode === "baseline"
                          ? "border-rust bg-rust/20 text-rust shadow-inner"
                          : "border-wood-light/30 bg-wood-dark/40 hover:bg-wood-dark/60 text-parchment/70"
                      } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span className="text-xl font-mono opacity-80">{agentMode === "baseline" ? "■" : "□"}</span>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wider font-[family-name:var(--font-western)]">Outlaw (Baseline)</p>
                        <p className="text-[10px] mt-0.5 opacity-80">
                            No safety reins. Raw rider behavior.
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => setAgentMode("guarded")}
                      disabled={isRunning}
                      className={`w-full text-left p-2 rounded-sm border transition-all hover:scale-[1.02] shadow-sm flex items-center gap-2 ${
                        agentMode === "guarded"
                          ? "border-safe bg-safe/20 text-safe shadow-inner"
                          : "border-wood-light/30 bg-wood-dark/40 hover:bg-wood-dark/60 text-parchment/70"
                      } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span className="text-xl font-mono opacity-80">{agentMode === "guarded" ? "■" : "□"}</span>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wider font-[family-name:var(--font-western)]">Lawman (Guarded)</p>
                        <p className="text-[10px] mt-0.5 opacity-80">
                            Fenced with alignment rules.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Run button */}
              <button
                onClick={handleStartRun}
                disabled={isRunning || !selectedScenario}
                className={`w-full py-4 relative group transition-all hover:scale-105 active:scale-95 border-b-4 border-2 ${
                  isRunning
                    ? "bg-wood-dark/50 border-wood-darker text-wood-light cursor-not-allowed"
                    : "bg-red-800 border-red-950 text-parchment hover:bg-red-700"
                }`}
                style={{ 
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.5)' 
                }}
              >
                <div className="absolute inset-0 bg-black/10 transition-opacity group-hover:opacity-0" />
                <span className="relative z-10 font-[family-name:var(--font-western)] text-2xl uppercase tracking-widest flex items-center justify-center gap-3">
                  {isRunning ? "SADDLING..." : (
                    <>
                      <span className="text-xl">⚔</span> 
                      Commence Duel 
                      <span className="text-xl">⚔</span>
                    </>
                  )}
                </span>
              </button>

              {/* Quick score preview */}
              {currentRun?.score && (
                <div
                  className="parchment-card p-4 cursor-pointer hover:glow-gold transition-all hover:scale-105 animate-fade-in"
                  onClick={() => setActiveTab("reckoning")}
                >
                  <p className="text-xs text-parchment-dark uppercase tracking-wider">
                    Latest Bounty
                  </p>
                  <p className="text-3xl font-[family-name:var(--font-western)] text-gold mt-1">
                    {Math.round(currentRun.score.alignment_score)}
                  </p>
                  <p className="text-xs text-parchment-dark">
                    Open full reckoning -&gt;
                  </p>
                </div>
              )}
            </div>

            {/* Main area: 3-pane view */}
            <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0">
              {/* Top row: Inbox + Task Board */}
              <div className="flex gap-4 h-[45%] min-h-0">
                <div className="flex-1 min-w-0 min-h-0">
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
                <div className="w-80 flex-shrink-0 min-h-0">
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
            <div className="parchment-card p-4 mb-6 animate-fade-in">
              <div className="flex items-center gap-4 flex-wrap">
                <h3 className="font-[family-name:var(--font-serif)] text-gold text-sm uppercase tracking-wider">
                  Duel ledger comparison:
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
      <footer className="border-t border-wood-light/20 py-3 text-center text-xs text-parchment-dark rope-divider relative z-10">
        ModDuel Arena | Frontier Alignment Office | HooHacks 2026
      </footer>
    </div>
  );
}
