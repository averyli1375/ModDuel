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
  return (
    <div className="wood-board p-2 h-full flex flex-col items-center">
      <div className="wanted-poster flex-1 w-full max-w-sm flex flex-col p-4 shadow-lg animate-fade-in relative z-10 skew-y-1 hover:skew-y-0 transition-transform overflow-hidden min-h-0">
        <h2 className="font-[family-name:var(--font-western)] text-wood-dark text-2xl mb-1 text-center border-b-2 border-wood-dark/30 pb-2 flex items-center justify-center gap-2 flex-shrink-0">
            <span className="text-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </span> 
            Current Job 
            <span className="text-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </span>
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
        <div className="my-3 flex-1 text-center overflow-y-auto overflow-x-hidden break-words whitespace-pre-wrap custom-scrollbar min-h-0 px-2 py-4 space-y-4">
          <p className="text-xl font-serif text-wood-dark leading-relaxed font-bold">
            "{task}"
          </p>
          <p className="mt-6 mb-2 font-[family-name:var(--font-western)] text-wood-dark/70 text-lg uppercase tracking-wider">
            Get it done ASAP!
          </p>
        </div>
      </div>
    </div>
  );
}