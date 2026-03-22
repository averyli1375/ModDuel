"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Scenario,
  ScenarioDetail,
  Run,
  ResearchExperiment,
  fetchScenarios,
  fetchScenarioDetail,
  startRun,
  fetchRun,
  fetchRuns,
  RunSummary,
  startResearchExperiment,
  fetchResearchExperiment,
} from "@/lib/api";
import Inbox from "@/components/Inbox";
import TaskBoard from "@/components/TaskBoard";
import ActionLog from "@/components/ActionLog";
import Dashboard from "@/components/Dashboard";
import ResearchLab from "@/components/ResearchLab";

type Tab = "arena" | "research_lab" | "reckoning";

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
  const [showResultsPopup, setShowResultsPopup] = useState(true);
  const [showResultsButton, setShowResultsButton] = useState(false);
  const [researchCounts, setResearchCounts] = useState<Record<string, number>>({});
  const [researchExperiment, setResearchExperiment] = useState<ResearchExperiment | null>(null);
  const [selectedResearchRunId, setSelectedResearchRunId] = useState<string | null>(null);
  const [selectedResearchRun, setSelectedResearchRun] = useState<Run | null>(null);
  const [researchStarting, setResearchStarting] = useState(false);
  const [researchSelectedModel, setResearchSelectedModel] = useState<string>("llama-3.3-70b-versatile");
  const [reckoningExperimentFilter, setReckoningExperimentFilter] = useState<string | null>(null);
  const [reckoningBatchRunId, setReckoningBatchRunId] = useState<string | null>(null);
  const [reckoningBatchRun, setReckoningBatchRun] = useState<Run | null>(null);
  const [showDuelAnimation, setShowDuelAnimation] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const researchPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch scenarios on mount
  useEffect(() => {
    fetchScenarios()
      .then((data) => {
        setScenarios(data);
        if (data.length > 0) setSelectedScenario(data[0].id);
        const initialCounts: Record<string, number> = {};
        data.forEach((s) => {
          initialCounts[s.id] = 0;
        });
        setResearchCounts(initialCounts);
      })
      .catch(() => setError("Failed to connect to backend. Is the server running?"));
  }, []);

  // Fetch scenario detail when selection changes
  useEffect(() => {
    if (!selectedScenario) return;
    setShowResultsButton(false);
    fetchScenarioDetail(selectedScenario).then(setScenarioDetail).catch(console.error);
  }, [selectedScenario]);

  // Fetch past runs
  const loadPastRuns = useCallback((experimentId?: string) => {
    fetchRuns(experimentId).then(setPastRuns).catch(console.error);
  }, []);

  useEffect(() => {
    loadPastRuns(reckoningExperimentFilter || undefined);
  }, [loadPastRuns, reckoningExperimentFilter]);

  // Polling for run updates
  const startPolling = useCallback((runId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const run = await fetchRun(runId);
        setCurrentRun(run);

        // Wait until scorings finishes (run.score is present) before stopping
        if (run.status === "failed" || (run.status === "completed" && run.score)) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setIsRunning(false);
          setShowResultsButton(true);
          loadPastRuns(reckoningExperimentFilter || undefined);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1000);
  }, [loadPastRuns, reckoningExperimentFilter]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (researchPollingRef.current) clearInterval(researchPollingRef.current);
    };
  }, []);

  const handleResearchCountChange = (scenarioId: string, count: number) => {
    setResearchCounts((prev) => ({
      ...prev,
      [scenarioId]: Math.max(0, Number.isFinite(count) ? count : 0),
    }));
  };

  const startResearchPolling = useCallback((experimentId: string) => {
    if (researchPollingRef.current) clearInterval(researchPollingRef.current);

    researchPollingRef.current = setInterval(async () => {
      try {
        const exp = await fetchResearchExperiment(experimentId);
        setResearchExperiment(exp);

        if (exp.status === "completed" || exp.status === "failed") {
          if (researchPollingRef.current) clearInterval(researchPollingRef.current);
          researchPollingRef.current = null;
        }
      } catch (err) {
        console.error("Research polling error:", err);
      }
    }, 1500);
  }, []);

  const handleStartResearchExperiment = async () => {
    if (researchStarting || (researchExperiment && researchExperiment.status === "running")) {
      return;
    }

    const scenarioPayload = Object.entries(researchCounts)
      .map(([scenario_id, run_count]) => ({ scenario_id, run_count }))
      .filter((s) => s.run_count > 0);

    if (scenarioPayload.length === 0) {
      setError("Set at least one scenario run count above 0 to start The Research Lab experiment.");
      return;
    }

    setError(null);
    setResearchStarting(true);
    setSelectedResearchRunId(null);
    setSelectedResearchRun(null);

    try {
      const exp = await startResearchExperiment({
        name: "The Research Lab",
        agent_mode: agentMode,
        model: researchSelectedModel,
        max_concurrency: 1,
        scenarios: scenarioPayload,
      });
      setResearchExperiment(exp);
      startResearchPolling(exp.experiment_id);
    } catch (err) {
      setError(`Failed to start research experiment: ${err}`);
    } finally {
      setResearchStarting(false);
    }
  };

  const handleSelectResearchRun = async (runId: string) => {
    setSelectedResearchRunId(runId);

    const runMeta = researchExperiment?.scenario_groups
      .flatMap((g) => g.runs)
      .find((r) => r.run_id === runId);

    try {
      const run = await fetchRun(runId);
      setSelectedResearchRun(run);
      setCurrentRun(run);
    } catch (err) {
      // Pending runs may not yet have a persisted ScenarioRun row; show a stub instead of failing UI.
      if (runMeta && researchExperiment) {
        const fallbackRun: Run = {
          id: runMeta.run_id,
          scenario_id: runMeta.scenario_id,
          agent_mode: researchExperiment.agent_mode,
          model: researchExperiment.model,
          status: runMeta.status,
          started_at: runMeta.started_at,
          completed_at: runMeta.completed_at,
          actions: [],
          score: null,
        };
        setSelectedResearchRun(fallbackRun);
        setCurrentRun(fallbackRun);
        return;
      }

      console.error("Failed to fetch research run:", err);
      setError("Could not load that run yet. Try again in a moment.");
    }
  };

  const handleResearchGoToResults = () => {
    if (researchExperiment) {
      setReckoningExperimentFilter(researchExperiment.experiment_id);
      setReckoningBatchRunId(null);
      setReckoningBatchRun(null);
      loadPastRuns(researchExperiment.experiment_id);
      setCurrentRun(null);
      setComparisonRun(null);
    }
    setActiveTab("reckoning");
  };

  const handleOpenBatchRunInReckoning = async (runId: string) => {
    const runMeta = researchExperiment?.scenario_groups
      .flatMap((g) => g.runs)
      .find((r) => r.run_id === runId);

    try {
      const run = await fetchRun(runId);
      setReckoningBatchRunId(runId);
      setReckoningBatchRun(run);
    } catch (err) {
      if (runMeta && researchExperiment) {
        const fallbackRun: Run = {
          id: runMeta.run_id,
          scenario_id: runMeta.scenario_id,
          agent_mode: researchExperiment.agent_mode,
          model: researchExperiment.model,
          status: runMeta.status,
          started_at: runMeta.started_at,
          completed_at: runMeta.completed_at,
          actions: [],
          score: null,
        };
        setReckoningBatchRunId(runId);
        setReckoningBatchRun(fallbackRun);
        return;
      }

      console.error("Failed to fetch batch run:", err);
      setError("Could not open that run yet. Try again in a moment.");
    }
  };

  const runningResearchRun = researchExperiment
    ? researchExperiment.scenario_groups.flatMap((g) => g.runs).find((r) => r.status === "running")
    : null;

  const etaText = (() => {
    if (!researchExperiment) return null;
    if (researchExperiment.status === "completed") return "Ready";
    if (researchExperiment.status === "failed") return "Stopped";
    if (!researchExperiment.started_at) return "Waiting to start";

    const done = researchExperiment.completed_runs + researchExperiment.failed_runs;
    const allRuns = researchExperiment.scenario_groups.flatMap((g) => g.runs);
    const completedDurations = allRuns
      .filter((r) => r.started_at && r.completed_at && (r.status === "completed" || r.status === "failed"))
      .map((r) => {
        const start = new Date(r.started_at as string).getTime();
        const end = new Date(r.completed_at as string).getTime();
        return Math.max(1, Math.floor((end - start) / 1000));
      });

    if (completedDurations.length === 0 && done <= 0) return "Estimating...";

    const recentDurations = completedDurations.slice(-5);
    const avgSecPerRun = recentDurations.length
      ? recentDurations.reduce((sum, s) => sum + s, 0) / recentDurations.length
      : (() => {
          const startedMs = new Date(researchExperiment.started_at as string).getTime();
          const elapsedSec = Math.max(1, Math.floor((Date.now() - startedMs) / 1000));
          return done > 0 ? elapsedSec / done : 60;
        })();

    const runningRun = allRuns.find((r) => r.status === "running");
    const runningElapsedSec = runningRun?.started_at
      ? Math.max(0, Math.floor((Date.now() - new Date(runningRun.started_at).getTime()) / 1000))
      : 0;

    const remainingQueued = Math.max(
      0,
      researchExperiment.total_runs - done - (runningRun ? 1 : 0)
    );
    const currentRunRemaining = runningRun ? Math.max(0, Math.floor(avgSecPerRun - runningElapsedSec)) : 0;
    const etaSec = Math.floor(currentRunRemaining + remainingQueued * avgSecPerRun);

    const minutes = Math.floor(etaSec / 60);
    const seconds = etaSec % 60;
    return `${minutes}m ${seconds}s`;
  })();

  const handleStartRun = async () => {
    if (!selectedScenario || isRunning) return;
    setError(null);
    setShowDuelAnimation(true);
    setTimeout(() => setShowDuelAnimation(false), 2500);

    try {
      const result = await startRun(selectedScenario, agentMode);
      setIsRunning(true);
      setComparisonRun(null);
      setShowResultsPopup(true);
      startPolling(result.run_id);
    } catch (err) {
      setError(`Failed to start run: ${err}`);
      setShowDuelAnimation(false);
    }
  };

  const handleViewResults = () => {
    setActiveTab("reckoning");
    setShowResultsButton(false);
  };

  const isResultsReady = showResultsButton && !isRunning && currentRun?.status === "completed" && currentRun?.score;

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
      {/* Duel Animation Overlay */}
      {showDuelAnimation && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-black/40 animate-flash-screen" />
          <div className="text-gold-bright font-[family-name:var(--font-western)] text-9xl animate-draw-text font-black drop-shadow-[0_0_20px_rgba(255,0,0,0.8)]">
            DRAW!
          </div>
          <img src="/tumbleweed.svg" className="absolute bottom-10 left-[-200px] w-48 h-48 animate-tumbleweed opacity-80" alt="tumbleweed overlay" />
        </div>
      )}

      <div className="town-decor" aria-hidden="true">
        <span className="scene-sky" />
        <span className="scene-road" />
        <span className="scene-general-store" />
        <span className="scene-blacksmith" />
        <span className="scene-saloon" />
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
            <div className="wood-board pegged-board px-6 py-2 shadow-lg border-2 border-wood-darker transform -rotate-1 relative z-10 before:absolute before:inset-0 before:bg-gradient-to-t before:from-black/20 before:to-transparent">
              <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-zinc-800 shadow-inner" />
              <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-zinc-800 shadow-inner" />
              <div className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-zinc-800 shadow-inner" />
              <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-zinc-800 shadow-inner" />
              <h1 className="font-[family-name:var(--font-western)] text-wood-dark text-4xl leading-none drop-shadow-sm">
                ModDuel
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
              onClick={() => setActiveTab("research_lab")}
              className={`wood-board px-6 py-2 shadow-md transition-all border-2 border-wood-darker transform hover:-translate-y-1 ${
                activeTab === "research_lab"
                  ? "bg-amber-100 text-wood-dark"
                  : "bg-wood-medium opacity-80 text-wood-dark hover:opacity-100"
              }`}
            >
              <span className="font-[family-name:var(--font-western)] text-xl">The Research Lab</span>
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
      <main className={`flex-1 max-w-[1600px] mx-auto w-full p-4 relative z-10 ${activeTab === "reckoning" ? "overflow-y-auto" : "overflow-hidden"}`}>
        {activeTab === "arena" ? (
          <div className="flex gap-4 h-full min-h-0">
            {/* Left sidebar: Scenario selector */}
            <div className="w-72 flex-shrink-0 flex flex-col gap-4 h-full min-h-0">
              {/* Scenario selector */}
              <div className="wood-board p-2 flex flex-col items-center flex-1 min-h-0">
                <div className="wanted-poster p-4 w-full h-full shadow-md animate-fade-in relative z-10 transition-transform flex flex-col min-h-0">
                  <h2 className="font-[family-name:var(--font-western)] shrink-0 text-wood-dark text-xl mb-3 flex items-center justify-center gap-2 border-b-2 border-wood-dark/30 pb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Bounty Target <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  </h2>
                  <div className="space-y-4 pt-2 pb-2 overflow-y-auto flex-1 min-h-0 pr-2 custom-scrollbar">
                    {scenarios.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedScenario(s.id);
                          setCurrentRun(null);
                          setComparisonRun(null);
                        }}
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
                      </button>
                  ))}
                  </div>
                </div>
              </div>

              {/* Agent mode selector */}
              <div className="wood-board pegged-board p-2 animate-fade-in relative shrink-0">
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
                      <span className="opacity-80 flex-shrink-0">
                        {agentMode === "baseline" ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
                        )}
                      </span>
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
                      <span className="opacity-80 flex-shrink-0">
                        {agentMode === "guarded" ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
                        )}
                      </span>
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
                onClick={isResultsReady ? handleViewResults : handleStartRun}
                disabled={isRunning || (!selectedScenario && !isResultsReady)}
                className={`w-full py-4 min-h-[4.5rem] shrink-0 flex items-center justify-center relative group transition-all active:scale-95 overflow-hidden rounded-sm ${
                  isRunning
                    ? "wood-panel border-2 border-wood-darker text-wood-light/50 cursor-not-allowed"
                    : isResultsReady
                      ? "wood-board border-2 border-safe text-safe shadow-[0_0_15px_rgba(34,197,94,0.15)] hover:shadow-[0_0_25px_rgba(34,197,94,0.4)] hover:brightness-110 cursor-pointer"
                      : "wood-board border-2 border-gold text-gold-bright shadow-[0_0_15px_rgba(212,160,23,0.15)] hover:shadow-[0_0_25px_rgba(212,160,23,0.4)] hover:brightness-110 cursor-pointer"
                }`}
                style={{ 
                  textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
                }}
              >
                {/* Nails */}
                <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-wood-darker shadow-[inset_0_1px_1px_rgba(0,0,0,1)] opacity-80" />
                <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-wood-darker shadow-[inset_0_1px_1px_rgba(0,0,0,1)] opacity-80" />
                <div className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-wood-darker shadow-[inset_0_1px_1px_rgba(0,0,0,1)] opacity-80" />
                <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-wood-darker shadow-[inset_0_1px_1px_rgba(0,0,0,1)] opacity-80" />

                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none transition-opacity group-hover:opacity-50" />
                <span className="relative z-10 font-[family-name:var(--font-western)] text-xl uppercase tracking-wider flex items-center justify-center gap-2 w-full pb-1 whitespace-nowrap">
                  {isRunning ? "SADDLING..." : isResultsReady ? (
                    <>
                      <span>View Results</span>
                      <span className="text-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-swords"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>
                      </span> 
                      Commence Duel 
                      <span className="text-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-swords"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>
                      </span>
                    </>
                  )}
                </span>
              </button>
            </div>

            {/* Main area: 3-pane view */}
            <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0">
              {/* Top row: Inbox + Task Board */}
              <div className="flex gap-4 h-[55%] min-h-0">
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
        ) : activeTab === "research_lab" ? (
          <ResearchLab
            scenarios={scenarios}
            counts={researchCounts}
            onCountChange={handleResearchCountChange}
            onRunExperiment={handleStartResearchExperiment}
            isStarting={researchStarting}
            experiment={researchExperiment}
            etaText={etaText}
            activeRunLabel={runningResearchRun ? `${runningResearchRun.scenario_name} / Run ${runningResearchRun.run_index}` : null}
            selectedRunId={selectedResearchRunId}
            selectedRun={selectedResearchRun}
            onSelectRun={handleSelectResearchRun}
            onGoToResults={handleResearchGoToResults}
            selectedModel={researchSelectedModel}
            onModelChange={setResearchSelectedModel}
          />
        ) : (
          /* Reckoning (Dashboard) tab */
          <div className="max-w-5xl mx-auto">
            {/* Comparison selector or aggregated results */}
            {reckoningExperimentFilter ? (
              /* Aggregated research results */
              <div className="space-y-6">
                <div className="parchment-card p-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-[family-name:var(--font-serif)] text-gold text-sm uppercase tracking-wider mb-2">
                        Research Experiment Results
                      </h3>
                      <span className="px-2 py-1 rounded bg-safe/20 border border-safe/40 text-safe text-xs">
                        Experiment: {reckoningExperimentFilter}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setReckoningExperimentFilter(null);
                        setReckoningBatchRunId(null);
                        setReckoningBatchRun(null);
                        setCurrentRun(null);
                        loadPastRuns();
                      }}
                      className="px-4 py-2 rounded border border-wood-light/30 text-parchment hover:bg-wood-light/20 text-sm"
                    >
                      View Individual Runs
                    </button>
                  </div>

                  {researchExperiment ? (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-wood-dark/20 p-3 rounded border border-wood-light/20">
                        <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Avg Alignment</p>
                        <p className="text-xl font-bold text-safe">{researchExperiment.summary.avg_alignment_score.toFixed(1)}</p>
                      </div>
                      <div className="bg-wood-dark/20 p-3 rounded border border-wood-light/20">
                        <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Avg Task Success</p>
                        <p className="text-xl font-bold text-parchment">{researchExperiment.summary.avg_task_success.toFixed(1)}%</p>
                      </div>
                      <div className="bg-wood-dark/20 p-3 rounded border border-wood-light/20">
                        <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Avg Unsafe Rate</p>
                        <p className="text-xl font-bold text-danger">{(researchExperiment.summary.avg_unsafe_action_rate * 100).toFixed(1)}%</p>
                      </div>
                      <div className="bg-wood-dark/20 p-3 rounded border border-wood-light/20">
                        <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Flags Triggered</p>
                        <p className="text-xl font-bold text-rust">
                          {researchExperiment.summary.shutdown_interference_count + researchExperiment.summary.deception_detected_count}
                        </p>
                        <p className="text-[11px] text-parchment-dark/80 mt-0.5">
                          shutdown: {researchExperiment.summary.shutdown_interference_count} | deception: {researchExperiment.summary.deception_detected_count}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {reckoningBatchRunId && reckoningBatchRun ? (
                  <div className="space-y-4">
                    <div className="parchment-card p-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-[family-name:var(--font-western)] text-lg text-gold">Batch Run Detail</h4>
                        <p className="text-xs text-parchment-dark mt-1">
                          Run ID: {reckoningBatchRun.id} | Status: {reckoningBatchRun.status}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setReckoningBatchRunId(null);
                          setReckoningBatchRun(null);
                        }}
                        className="px-4 py-2 rounded border border-wood-light/30 text-parchment hover:bg-wood-light/20 text-sm"
                      >
                        Back To Batch Runs
                      </button>
                    </div>
                    <Dashboard
                      currentRun={reckoningBatchRun}
                      comparisonRun={null}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {researchExperiment && researchExperiment.scenario_groups.map((group) => {
                      if (group.completed_runs === 0) return null;

                      return (
                        <div key={group.scenario_id} className="parchment-card p-6">
                          <h4 className="font-[family-name:var(--font-western)] text-lg text-gold mb-4">{group.scenario_name}</h4>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="bg-wood-dark/20 p-4 rounded border border-wood-light/20">
                              <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Total Runs</p>
                              <p className="text-2xl font-bold text-parchment">{group.total_runs}</p>
                            </div>
                            <div className="bg-wood-dark/20 p-4 rounded border border-wood-light/20">
                              <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Completed</p>
                              <p className="text-2xl font-bold text-safe">{group.completed_runs}</p>
                            </div>
                            <div className="bg-wood-dark/20 p-4 rounded border border-wood-light/20">
                              <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Failed</p>
                              <p className="text-2xl font-bold text-danger">{group.failed_runs}</p>
                            </div>
                            <div className="bg-wood-dark/20 p-4 rounded border border-wood-light/20">
                              <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Pending</p>
                              <p className="text-2xl font-bold text-rust">{group.pending_runs}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            <div className="bg-wood-dark/20 p-3 rounded border border-wood-light/20">
                              <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Avg Alignment</p>
                              <p className="text-lg font-bold text-safe">{group.summary.avg_alignment_score.toFixed(1)}</p>
                            </div>
                            <div className="bg-wood-dark/20 p-3 rounded border border-wood-light/20">
                              <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Avg Unsafe Rate</p>
                              <p className="text-lg font-bold text-danger">{(group.summary.avg_unsafe_action_rate * 100).toFixed(1)}%</p>
                            </div>
                            <div className="bg-wood-dark/20 p-3 rounded border border-wood-light/20">
                              <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Unsafe Actions</p>
                              <p className="text-lg font-bold text-parchment">{group.summary.total_unsafe_actions}</p>
                            </div>
                            <div className="bg-wood-dark/20 p-3 rounded border border-wood-light/20">
                              <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">Flagged Runs</p>
                              <p className="text-lg font-bold text-rust">
                                {group.summary.shutdown_interference_count + group.summary.deception_detected_count}
                              </p>
                              <p className="text-[11px] text-parchment-dark/80 mt-0.5">
                                scored: {group.summary.scored_runs}
                              </p>
                            </div>
                          </div>

                          <details className="bg-wood-dark/10 p-3 rounded border border-wood-light/20">
                            <summary className="cursor-pointer text-sm text-parchment font-semibold">View Individual Runs from {group.scenario_name}</summary>
                            <div className="mt-3 space-y-2">
                              {group.runs.map((run) => (
                                <button
                                  key={run.run_id}
                                  onClick={() => handleOpenBatchRunInReckoning(run.run_id)}
                                  className="w-full text-left px-3 py-2 rounded text-xs border bg-zinc-800/60 border-zinc-700 text-zinc-200 hover:bg-zinc-700/60 transition-colors"
                                >
                                  Run {run.run_index} - {run.status}
                                </button>
                              ))}
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Individual run results */
              <>
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
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-wood-light/20 py-3 text-center text-xs text-parchment-dark rope-divider relative z-10">
        ModDuel | HooHacks 2026
      </footer>

      {/* Results Ready Popup */}
      {isResultsReady && activeTab === "arena" && showResultsPopup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] backdrop-blur-sm animate-fade-in">
          <div className="wanted-poster pegged-board border-4 border-double border-gold p-8 shadow-2xl max-w-md animate-bounce-in relative" style={{
            boxShadow: '0_0_40px_rgba(212,160,23,0.5), inset 0_0_20px_rgba(0,0,0,0.3)'
          }}>
            <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-wood-darker shadow-inner" />
            <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-wood-darker shadow-inner" />
            <div className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-wood-darker shadow-inner" />
            <div className="absolute bottom-3 right-3 w-3 h-3 rounded-full bg-wood-darker shadow-inner" />
            
            <div className="text-center space-y-6">
              <div>
                <h3 className="font-[family-name:var(--font-western)] text-wood-dark text-2xl mb-2 tracking-widest drop-shadow-sm">
                  DUEL COMPLETE
                </h3>
                <p className="text-wood-dark/80 font-serif italic">
                  Your results be ready, partner.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowResultsPopup(false);
                    handleViewResults();
                  }}
                  className="w-full px-6 py-3 bg-safe text-white font-bold uppercase rounded-sm border-2 border-safe shadow-lg hover:shadow-xl hover:brightness-110 transition-all active:scale-95 font-[family-name:var(--font-western)] tracking-wider flex items-center justify-center gap-2"
                >
                  <span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </span>
                  View Results
                </button>
                <button
                  onClick={() => setShowResultsPopup(false)}
                  className="w-full px-6 py-2 bg-wood-medium text-parchment font-bold uppercase rounded-sm border border-wood-light/30 hover:bg-wood-light/20 transition-all font-[family-name:var(--font-western)] tracking-wider"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
