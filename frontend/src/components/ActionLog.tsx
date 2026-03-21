"use client";

import { Action } from "@/lib/api";

interface ActionLogProps {
  actions: Action[];
  isRunning: boolean;
}

export default function ActionLog({ actions, isRunning }: ActionLogProps) {
  const getToolIcon = (toolName: string | null): string => {
    switch (toolName) {
      case "read_email":
        return "[R]";
      case "send_email":
        return "[S]";
      case "search_docs":
        return "[D]";
      case "submit_final_action":
        return "[F]";
      case "edit_config":
        return "[C]";
      default:
        return "[M]";
    }
  };

  const formatToolInput = (input: string | null): string => {
    if (!input) return "";
    try {
      const parsed = JSON.parse(input);
      if (parsed.email_id) return `email_id: "${parsed.email_id}"`;
      if (parsed.to) return `to: ${parsed.to}`;
      if (parsed.query) return `"${parsed.query}"`;
      if (parsed.key) return `${parsed.key} = ${parsed.value}`;
      if (parsed.summary)
        return parsed.summary.slice(0, 80) + (parsed.summary.length > 80 ? "..." : "");
      return JSON.stringify(parsed).slice(0, 100);
    } catch {
      return input.slice(0, 100);
    }
  };

  const getUnsafeTypes = (types: string | null): string[] => {
    if (!types) return [];
    try {
      return JSON.parse(types);
    } catch {
      return [];
    }
  };

  return (
    <div className="wood-board p-2 h-full flex flex-col items-center">
      <div className="terminal-panel w-full h-full flex flex-col border-8 border-wood-darker bg-zinc-900 rounded p-4 relative overflow-hidden shadow-2xl">
        {/* Terminal Header */}
        <h2 className="font-[family-name:var(--font-western)] text-zinc-500 text-sm mb-3 flex items-center justify-between border-b border-zinc-700/50 pb-2 uppercase tracking-wide">
          <span>Agent's Terminal</span>
          {isRunning && (
            <span className="text-xs text-green-500 animate-pulse font-mono tracking-widest flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg> LIVE
            </span>
          )}
        </h2>
        <div className="flex-1 overflow-y-auto space-y-2 font-[family-name:var(--font-mono)] text-xs terminal-text custom-scrollbar">
          {actions.length === 0 ? (
            <p className="text-green-800/60 italic text-sm mt-2">
              AWAITING COMMAND...
            </p>
          ) : (
          actions.map((action) => {
            const unsafeTypes = getUnsafeTypes(action.unsafe_types);

            if (action.action_type === "message") {
              return (
                <div
                  key={action.id}
                  className="p-2 rounded bg-wood-medium/30 border border-wood-light/10 animate-slide-in"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-parchment-dark">[T{action.turn}]</span>
                    <span>[M]</span>
                    <span className="text-parchment-dark leading-relaxed">
                      {action.content?.slice(0, 200)}
                      {(action.content?.length || 0) > 200 ? "..." : ""}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={action.id}
                className={`p-2 rounded border animate-slide-in ${
                  action.is_unsafe
                    ? "bg-blood-red/15 border-danger/40 danger-pulse"
                    : "bg-wood-medium/30 border-wood-light/10"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-parchment-dark whitespace-nowrap">
                    [T{action.turn}]
                  </span>
                  <span>{getToolIcon(action.tool_name)}</span>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`font-bold ${
                        action.is_unsafe ? "text-danger" : "text-gold"
                      }`}
                    >
                      {action.tool_name}
                    </span>
                    <span className="text-parchment-dark ml-1">
                      ({formatToolInput(action.tool_input)})
                    </span>
                    {action.is_unsafe && unsafeTypes.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {unsafeTypes.map((type, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-danger/20 text-danger border border-danger/30 uppercase tracking-wider"
                          >
                            ! {type.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {isRunning && (
          <div className="p-2 text-green-500 animate-pulse flex items-center gap-2 font-mono">
            <span className="spin-slow inline-block text-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </span>
            Processing...
          </div>
        )}
      </div>
      
      {/* Decorative buttons at bottom */}
      <div className="flex gap-2 mt-3 pt-2 border-t border-zinc-800">
        <div className="w-8 h-3 bg-zinc-800 rounded shadow-inner" />
        <div className="w-8 h-3 bg-zinc-800 rounded shadow-inner" />
        <div className="w-8 h-3 bg-zinc-800 rounded shadow-inner" />
        <div className="ml-auto w-16 h-3 bg-zinc-800 rounded shadow-inner" />
      </div>
      </div>
    </div>
  );
}
