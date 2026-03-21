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
      <div className="parchment-card p-6 text-center">
        <h2 className="font-[family-name:var(--font-western)] text-gold text-2xl mb-4">
          🤠 THE RECKONING
        </h2>
        <p className="text-parchment-dark">
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
      <div className="parchment-card p-6 text-center wanted-border">
        <h2 className="font-[family-name:var(--font-western)] text-gold text-2xl mb-2">
          🤠 THE RECKONING
        </h2>

        <div className="flex items-center justify-center gap-8 mt-4">
          {/* Current run score */}
          <div className="text-center">
            <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">
              {currentRun.agent_mode === "guarded"
                ? "🛡️ Guarded"
                : "🤠 Baseline"}
            </p>
            <p
              className={`text-6xl font-[family-name:var(--font-western)] ${getAlignmentColor(score.alignment_score)}`}
            >
              {Math.round(score.alignment_score)}
            </p>
            <p
              className={`text-sm font-bold mt-1 ${getAlignmentColor(score.alignment_score)}`}
            >
              {getAlignmentLabel(score.alignment_score)}
            </p>
          </div>

          {/* VS divider */}
          {compScore && (
            <>
              <div className="text-3xl font-[family-name:var(--font-western)] text-rust">
                VS
              </div>
              <div className="text-center">
                <p className="text-xs text-parchment-dark uppercase tracking-wider mb-1">
                  {comparisonRun?.agent_mode === "guarded"
                    ? "🛡️ Guarded"
                    : "🤠 Baseline"}
                </p>
                <p
                  className={`text-6xl font-[family-name:var(--font-western)] ${getAlignmentColor(compScore.alignment_score)}`}
                >
                  {Math.round(compScore.alignment_score)}
                </p>
                <p
                  className={`text-sm font-bold mt-1 ${getAlignmentColor(compScore.alignment_score)}`}
                >
                  {getAlignmentLabel(compScore.alignment_score)}
                </p>
              </div>
            </>
          )}
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
        <div className="parchment-card p-4">
          <h3 className="font-[family-name:var(--font-serif)] text-gold text-sm mb-3 uppercase tracking-wider">
            Metrics Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#4a2c1a" />
              <XAxis
                dataKey="metric"
                tick={{ fill: "#d4b896", fontSize: 11 }}
                stroke="#4a2c1a"
              />
              <YAxis
                tick={{ fill: "#d4b896", fontSize: 11 }}
                stroke="#4a2c1a"
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  background: "#2d1810",
                  border: "1px solid #d4a017",
                  borderRadius: 4,
                  color: "#f5e6c8",
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
        <div className="parchment-card p-4">
          <h3 className="font-[family-name:var(--font-serif)] text-gold text-sm mb-3 uppercase tracking-wider">
            Agent Profile
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#4a2c1a" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: "#d4b896", fontSize: 10 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: "#d4b896", fontSize: 9 }}
              />
              <Radar
                name="Score"
                dataKey="value"
                stroke="#d4a017"
                fill="#d4a017"
                fillOpacity={0.3}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Judge analysis */}
      {score.judge_analysis && (
        <div className="parchment-card p-4">
          <h3 className="font-[family-name:var(--font-serif)] text-gold text-sm mb-2 uppercase tracking-wider">
            🏛️ Judge&apos;s Verdict
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
    safe: "border-safe/40 text-safe-light",
    danger: "border-danger/40 text-danger",
    rust: "border-rust/40 text-rust",
    gold: "border-gold/40 text-gold",
  };

  return (
    <div className={`parchment-card p-3 border ${colorMap[color]}`}>
      <p className="text-[10px] text-parchment-dark uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-xl font-bold mt-1 ${colorMap[color].split(" ")[1]}`}>
        {value}
      </p>
    </div>
  );
}
