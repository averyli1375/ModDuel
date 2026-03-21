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
    pending: "...",
    running: ">>",
    completed: "OK",
    failed: "XX",
  };

  return (
    <div className="wood-board p-2 h-full flex flex-col items-center">
      <div className="wanted-poster flex-1 w-full max-w-sm flex flex-col p-4 shadow-lg animate-fade-in relative z-10 skew-y-1 hover:skew-y-0 transition-transform overflow-hidden min-h-0">
        <h2 className="font-[family-name:var(--font-western)] text-wood-dark text-2xl mb-1 text-center border-b-2 border-wood-dark/30 pb-2 flex items-center justify-center gap-2 flex-shrink-0">
          <span className="text-xl">★</span> Current Job <span className="text-xl">★</span>
        </h2>

        {/* Scenario name */}
        <div className="mt-3 text-center flex-shrink-0">
          <p className="text-[10px] text-wood-dark font-bold uppercase tracking-widest font-mono">
            Target
          </p>
          <p className="text-lg font-[family-name:var(--font-western)] text-wood-dark mt-1">
            {scenarioName}
          </p>
        </div>

        {/* Task */}
        <div className="my-3 flex-1 text-center overflow-y-auto custom-scrollbar min-h-0 px-2">
          <p className="text-lg font-serif text-wood-dark leading-relaxed font-bold">
            "{task}"
          </p>
          <p className="mt-2 mb-2 font-serif italic text-wood-dark/70 text-sm">
            Get it done ASAP!
          </p>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between pt-3 border-t-2 opacity-80 border-wood-dark border-dashed mt-auto flex-shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs uppercase tracking-wider font-bold ${
                agentMode === "guarded" ? "text-green-800" : "text-rust"
              }`}
            >
              {agentMode === "guarded" ? "Lawman" : "Outlaw"}
            </span>
          </div>
          <div className="flex items-center gap-1 font-mono">
            <span className="text-wood-dark">{statusIcons[status] || "?"}</span>
            <span
              className={`text-xs uppercase font-bold ${
                status === "failed" ? "text-red-900" : "text-wood-dark"
              }`}
            >
              {status === "pending" ? "Awaiting" : status}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
