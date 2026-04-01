/**
 * FinalCVCheck.tsx — FIXED
 */

import { ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";

import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ✅ FIX 1 — add missing import
import { CHART_COLORS } from "@/constants/chartColors";

function NoData() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline to see cross-validation results
    </div>
  );
}

export default function FinalCVCheck() {
  const { results, noData, isRunning } = usePipelineResults();

  if (noData) return <NoData />;
  if (isRunning) return <div className="text-muted-foreground p-4">Pipeline is running…</div>;
  if (!results) return null;

  const { models } = results;

  // ✅ FIX 2 — safe guard
  if (!models || models.length === 0) return <NoData />;

  const allScores = models.flatMap((m) => m.cv_scores || []);

  const minScore = Math.floor(Math.min(...allScores) * 1000) / 1000 - 0.005;
  const maxScore = Math.ceil(Math.max(...allScores) * 1000) / 1000 + 0.005;

  return (
    <div className="space-y-6">

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {models.map((m) => (
          <div
            key={m.name}
            className={`glass-card p-4 text-center ${
              m.status === "Selected" ? "border border-warning/50" : ""
            }`}
          >
            <p className="text-xs text-muted-foreground truncate">{m.name}</p>
            <p className="text-xl font-bold mt-1">{m.cv_mean.toFixed(4)}</p>
            <p className="text-xs text-muted-foreground">±{m.cv_std.toFixed(4)}</p>
            {m.status === "Selected" && (
              <span className="text-xs text-warning mt-1 block">Selected</span>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {models.map((m) => {
          const foldData = m.cv_scores.map((score, i) => ({
            fold: `Fold ${i + 1}`,
            score: +score.toFixed(4),
          }));

          return (
            <ChartCard
              key={m.name}
              title={m.name}
              subtitle={`Mean: ${m.cv_mean.toFixed(4)} ± ${m.cv_std.toFixed(4)}`}
            >
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={foldData}>
                  <XAxis dataKey="fold" />
                  <YAxis domain={[minScore, maxScore]} />
                  <Tooltip />

                  <ReferenceLine
                    y={m.cv_mean}
                    stroke={CHART_COLORS[3]}
                    strokeDasharray="4 2"
                  />

                  <Bar
                    dataKey="score"
                    fill={
                      m.status === "Selected"
                        ? CHART_COLORS[0]
                        : CHART_COLORS[1]
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          );
        })}
      </div>

      {/* Table */}
      <div className="glass-card p-5">
        <h3 className="font-semibold mb-3">Stability Analysis</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Model", "F1", "F2", "F3", "F4", "F5", "Mean", "Std", "Stable"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.name}>
                  <td>{m.name}</td>
                  {m.cv_scores.map((s, i) => (
                    <td key={i}>{s.toFixed(4)}</td>
                  ))}
                  <td>{m.cv_mean.toFixed(4)}</td>
                  <td>{m.cv_std.toFixed(4)}</td>
                  <td>
                    {m.cv_std < 0.015 ? "✓ Stable" : "⚠ Review"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}