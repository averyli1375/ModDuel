"use client";

import { Score, Run } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";

interface DashboardProps {
  currentRun: Run | null;
  comparisonRun: Run | null;
}

export default function Dashboard({
  currentRun,
  comparisonRun,
}: DashboardProps) {
  if (!currentRun?.score) {
    return (
      <div className="wanted-poster border-4 border-double border-wood-dark p-6 text-center animate-fade-in relative shadow-lg">
        <h2 className="font-[family-name:var(--font-western)] text-wood-dark text-3xl mb-4 tracking-widest drop-shadow-sm">
          THE RECKONING
        </h2>
        <p className="text-wood-dark font-serif italic text-lg opacity-80">
          Run a scenario to see the results, partner.
        </p>
      </div>
    );
  }

  const score = currentRun.score;
  const compScore = comparisonRun?.score;

  // Bar chart data
  const barData = [
    {
      metric: "Task Success",
      current: score.task_success,
      ...(compScore ? { comparison: compScore.task_success } : {}),
    },
    {
      metric: "Alignment",
      current: score.alignment_score,
      ...(compScore ? { comparison: compScore.alignment_score } : {}),
    },
    {
      metric: "Unsafe Rate",
      current: Math.round(score.unsafe_action_rate * 100),
      ...(compScore
        ? { comparison: Math.round(compScore.unsafe_action_rate * 100) }
        : {}),
    },
    {
      metric: "Escalation",
      current: Math.round(score.escalation_rate * 100),
      ...(compScore
        ? { comparison: Math.round(compScore.escalation_rate * 100) }
        : {}),
    },
  ];

  // Radar data for the current run
  const radarData = [
    { metric: "Task Success", value: score.task_success },
    { metric: "Alignment", value: score.alignment_score },
    {
      metric: "Safety",
      value: Math.max(0, 100 - score.unsafe_action_rate * 100),
    },
    { metric: "Escalation", value: score.escalation_rate * 100 },
    { metric: "Honesty", value: score.deception_detected ? 20 : 100 },
  ];

  const getAlignmentColor = (s: number) => {
    if (s >= 80) return "text-safe-light";
    if (s >= 50) return "text-badge-yellow";
    return "text-danger";
  };

  const getAlignmentLabel = (s: number) => {
    if (s >= 90) return "LAWFUL";
    if (s >= 70) return "MOSTLY LAWFUL";
    if (s >= 50) return "SUSPICIOUS";
    if (s >= 30) return "OUTLAW";
    return "MOST WANTED";
  };

  return (
    <div className="space-y-6">
      {/* Header with big alignment score */}
      <div className="wood-board p-3 animate-fade-in relative shadow-xl">
        <div className="wanted-poster p-6 flex flex-col items-center border border-wood-dark/20 text-center relative z-10 before:absolute before:inset-0 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgoJCTxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPgoJPC9zdmc+')] before:pointer-events-none">
          
          <h2 className="font-[family-name:var(--font-western)] text-wood-dark text-3xl mb-1 flex items-center gap-3">
            <span className="text-red-900/80">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </span> 
            WANTED LEVEL 
            <span className="text-red-900/80">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </span>
          </h2>
          <div className="h-px bg-wood-darker/30 w-1/2 mb-4" />

          <div className="flex items-center justify-center gap-12 mt-2 w-full max-w-2xl px-8 py-4 bg-wood-dark/5 rounded border border-wood-dark/10 shadow-inner">
            {/* Current run score */}
            <div className="text-center relative">
              <p className="text-xs text-wood-dark uppercase tracking-widest mb-2 font-bold font-mono">
                {currentRun.agent_mode === "guarded"
                  ? "LAWMAN (Guarded)"
                  : "OUTLAW (Baseline)"}
              </p>
              <div className="relative inline-block mt-2">
                <span className="absolute -inset-4 bg-red-900/5 rounded-full blur-md" />
                <p
                  className={`text-8xl font-[family-name:var(--font-western)] relative z-10 tracking-tighter ${
                    score.alignment_score < 50 ? "text-red-900" : "text-wood-dark"
                  }`}
                  style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}
                >
                  {Math.round(100 - score.alignment_score)}
                </p>
              </div>
              <p className="text-sm font-bold uppercase tracking-widest text-red-900 mt-4 font-serif">
                {getAlignmentLabel(score.alignment_score)}
              </p>
            </div>

          {/* VS divider */}
          {compScore && (
            <>
              <div className="text-5xl font-[family-name:var(--font-western)] text-red-900 mx-4 opacity-80" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}>
                VS
              </div>
              <div className="text-center relative">
                <p className="text-xs text-wood-dark uppercase tracking-widest mb-2 font-bold font-mono">
                  {comparisonRun?.agent_mode === "guarded"
                    ? "LAWMAN (Guarded)"
                    : "OUTLAW (Baseline)"}
                </p>
                <div className="relative inline-block mt-2">
                  <span className="absolute -inset-4 bg-red-900/5 rounded-full blur-md" />
                  <p
                    className={`text-8xl font-[family-name:var(--font-western)] relative z-10 tracking-tighter ${
                      compScore.alignment_score < 50 ? "text-red-900" : "text-wood-dark"
                    }`}
                    style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}
                  >
                    {Math.round(100 - compScore.alignment_score)}
                  </p>
                </div>
                <p
                  className="text-sm font-bold uppercase tracking-widest text-red-900 mt-4 font-serif"
                >
                  {getAlignmentLabel(compScore.alignment_score)}
                </p>
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Task Success"
          value={`${Math.round(score.task_success)}%`}
          color={score.task_success >= 70 ? "safe" : "rust"}
        />
        <MetricCard
          label="Unsafe Actions"
          value={`${score.unsafe_action_count}/${score.total_actions}`}
          color={score.unsafe_action_count > 0 ? "danger" : "safe"}
        />
        <MetricCard
          label="Shutdown Interference"
          value={score.shutdown_interference ? "YES" : "NO"}
          color={score.shutdown_interference ? "danger" : "safe"}
        />
        <MetricCard
          label="Deception"
          value={score.deception_detected ? "DETECTED" : "NONE"}
          color={score.deception_detected ? "danger" : "safe"}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bar chart comparison */}
        <div className="wanted-poster p-4 shadow-md before:absolute border-x-4 border-y-2 border-wood-dark/20 relative">
          <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-wood-darker/60 shadow-sm" />
          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-wood-darker/60 shadow-sm" />
          <div className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-wood-darker/60 shadow-sm" />
          <div className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-wood-darker/60 shadow-sm" />
          <h3 className="font-[family-name:var(--font-western)] text-wood-dark text-lg mb-3 uppercase tracking-wider text-center border-b border-wood-dark/20 pb-2">
            Metrics Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#4a2c1a" opacity={0.2} />
              <XAxis
                dataKey="metric"
                tick={{ fill: "#1a0f0a", fontSize: 11, fontFamily: "monospace" }}
                stroke="#4a2c1a"
              />
              <YAxis
                tick={{ fill: "#1a0f0a", fontSize: 11, fontFamily: "monospace" }}
                stroke="#4a2c1a"
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  background: "#f5e6c8",
                  border: "2px solid #2d1810",
                  borderRadius: 4,
                  fontFamily: "monospace",
                  color: "#1a0f0a",
                }}
              />
              <Bar
                dataKey="current"
                fill="#d4a017"
                name={currentRun.agent_mode}
                radius={[4, 4, 0, 0]}
              />
              {compScore && (
                <Bar
                  dataKey="comparison"
                  fill="#4a7c59"
                  name={comparisonRun?.agent_mode || "comparison"}
                  radius={[4, 4, 0, 0]}
                />
              )}
              <Legend wrapperStyle={{ color: "#f5e6c8" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar chart */}
        <div className="wanted-poster p-4 shadow-md before:absolute border-x-4 border-y-2 border-wood-dark/20 relative">
          <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-wood-darker/60 shadow-sm" />
          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-wood-darker/60 shadow-sm" />
          <div className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-wood-darker/60 shadow-sm" />
          <div className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-wood-darker/60 shadow-sm" />
          <h3 className="font-[family-name:var(--font-western)] text-wood-dark text-lg mb-3 uppercase tracking-wider text-center border-b border-wood-dark/20 pb-2">
            Agent Profile
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#4a2c1a" opacity={0.3} />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: "#1a0f0a", fontSize: 10, fontFamily: "monospace" }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: "#1a0f0a", fontSize: 9, fontFamily: "monospace" }}
              />
              <Radar
                name="Score"
                dataKey="value"
                stroke="#1a0f0a"
                fill="#2d1810"
                fillOpacity={0.6}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Judge analysis */}
      {score.judge_analysis && (
        <div className="parchment-card p-4">
          <h3 className="font-[family-name:var(--font-serif)] text-gold text-sm mb-2 uppercase tracking-wider flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>
            Judge&apos;s Verdict
          </h3>
          <p className="text-sm text-parchment-dark leading-relaxed">
            {score.judge_analysis}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "safe" | "danger" | "rust" | "gold";
}) {
  const colorMap = {
    safe: "border-wood-medium/40 text-green-900 bg-green-900/5",
    danger: "border-red-900/40 text-red-900 bg-red-900/5",
    rust: "border-wood-medium/40 text-rust bg-rust/5",
    gold: "border-wood-medium/40 text-wood-dark bg-amber-900/5",
  };

  return (
    <div className={`paper-texture shadow-md p-3 border-2 relative ${colorMap[color]} transform transition-transform hover:scale-105`}>
      <div className="absolute top-1 left-1 w-1 h-1 rounded-full bg-wood-darker/50" />
      <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-wood-darker/50" />
      <div className="absolute bottom-1 left-1 w-1 h-1 rounded-full bg-wood-darker/50" />
      <div className="absolute bottom-1 right-1 w-1 h-1 rounded-full bg-wood-darker/50" />
      <p className="text-[10px] uppercase tracking-widest font-mono text-wood-dark/70 font-bold mb-1">
        {label}
      </p>
      <p className={`text-2xl font-[family-name:var(--font-western)] tracking-wide mt-1 ${colorMap[color].split(" ")[1]}`}>
        {value}
      </p>
    </div>
  );
}
