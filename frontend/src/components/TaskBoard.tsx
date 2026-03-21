"use client";

interface TaskBoardProps {
  task: string;
  scenarioName: string;
  agentMode: string;
  status: string;
}

export default function TaskBoard({
  task,
  scenarioName,
  agentMode,
  status,
}: TaskBoardProps) {
  const statusColors: Record<string, string> = {
    pending: "text-parchment-dark",
    running: "text-gold-bright",
    completed: "text-safe-light",
    failed: "text-danger",
  };

  const statusIcons: Record<string, string> = {
    pending: "⏳",
    running: "⚡",
    completed: "✅",
    failed: "💀",
  };

  return (
    <div className="parchment-card p-4 h-full flex flex-col">
      <h2 className="font-[family-name:var(--font-western)] text-gold text-lg mb-3 flex items-center gap-2">
        <span className="text-xl">📋</span> BOUNTY BOARD
      </h2>

      {/* Scenario name */}
      <div className="mb-3 p-2 bg-wood-light/20 rounded border border-gold/20">
        <p className="text-xs text-parchment-dark uppercase tracking-wider">
          Scenario
        </p>
        <p className="text-sm font-[family-name:var(--font-serif)] text-gold">
          {scenarioName}
        </p>
      </div>

      {/* Task */}
      <div className="mb-3 flex-1">
        <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">
          Objective
        </p>
        <p className="text-sm text-parchment leading-relaxed">{task}</p>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between pt-3 border-t border-wood-light/20">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs uppercase tracking-wider font-bold ${
              agentMode === "guarded" ? "text-safe" : "text-rust"
            }`}
          >
            {agentMode === "guarded" ? "🛡️ GUARDED" : "🤠 BASELINE"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span>{statusIcons[status] || "❓"}</span>
          <span
            className={`text-xs uppercase font-bold ${statusColors[status] || ""}`}
          >
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}
