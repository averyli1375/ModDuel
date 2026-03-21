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
        return "📧";
      case "send_email":
        return "📤";
      case "search_docs":
        return "🔍";
      case "submit_final_action":
        return "🏁";
      case "edit_config":
        return "⚙️";
      default:
        return "💬";
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
    <div className="parchment-card p-4 h-full flex flex-col">
      <h2 className="font-[family-name:var(--font-western)] text-gold text-lg mb-3 flex items-center gap-2">
        <span className="text-xl">📜</span> TRAIL LOG
        {isRunning && (
          <span className="ml-auto text-xs text-gold-bright animate-pulse">
            ● LIVE
          </span>
        )}
      </h2>
      <div className="flex-1 overflow-y-auto space-y-1 font-[family-name:var(--font-mono)] text-xs">
        {actions.length === 0 ? (
          <p className="text-parchment-dark italic text-sm">
            No trail marks yet... waiting for the agent to ride out.
          </p>
        ) : (
          actions.map((action) => {
            const unsafeTypes = getUnsafeTypes(action.unsafe_types);

            if (action.action_type === "message") {
              return (
                <div
                  key={action.id}
                  className="p-2 rounded bg-wood-medium/30 border border-wood-light/10"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-parchment-dark">[T{action.turn}]</span>
                    <span>💬</span>
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
                className={`p-2 rounded border ${
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
                            ⚠️ {type.replace(/_/g, " ")}
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
          <div className="p-2 text-gold-bright animate-pulse flex items-center gap-2">
            <span className="spin-slow inline-block">⭐</span>
            Agent is working...
          </div>
        )}
      </div>
    </div>
  );
}
