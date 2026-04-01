/**
 * ShapGlobal.tsx — wired to real pipeline results
 * Replaces: import { SHAP_VALUES } from "@/data/mockData"
 */

import { useMemo } from "react";
import { ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";
import { CHART_COLORS } from "@/data/mockData"; // KEEP: only colors, not data
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";

// ── Placeholder ─────────────────────────────────────
function NoData() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline to compute SHAP values
    </div>
  );
}

// ── Direction inference from sign ───────────────────
// The pipeline returns mean |SHAP| (always positive).
// We infer direction from whether the feature name suggests
// a risk-increasing factor — or expose it once backend sends direction.
function inferDirection(feature: string): "increases" | "decreases" {
  const riskPositive = [
    "IsMonthToMonth", "FiberUser", "LowEngagement",
    "HighSpender", "MonthlyCharges",
  ];
  return riskPositive.some((f) => feature.includes(f))
    ? "increases"
    : "decreases";
}

// ── Component ────────────────────────────────────────
export default function ShapGlobal() {
  const { results, noData, isRunning } = usePipelineResults();

  // Normalise: pipeline gives { feature, importance }
  // We want top 20, sorted descending
  const data = useMemo(() => {
    if (!results?.shap_global) return [];
    return results.shap_global
      .slice(0, 20)
      .map((d) => ({
        feature: d.feature,
        shap: d.importance,
        direction: inferDirection(d.feature),
      }));
  }, [results]);

  if (noData) return <NoData />;
  if (isRunning) return <div className="text-muted-foreground p-4">Pipeline is running…</div>;
  if (!results || data.length === 0) return <NoData />;

  return (
    <div className="space-y-6">

      {/* Bar Chart */}
      <ChartCard
        title="Mean |SHAP| Values — Top 20 Features"
        subtitle={`Computed from ${results.dataset_info?.test_size ?? 0} test samples`}
      >
        <ResponsiveContainer width="100%" height={500}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" tickFormatter={(v) => v.toFixed(3)} />
            <YAxis type="category" dataKey="feature" width={220} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => v.toFixed(4)} />
            <Bar dataKey="shap" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[0]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top 5 cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {data.slice(0, 5).map((s, i) => (
          <div key={s.feature} className="glass-card p-4 space-y-2">
            <div className="text-lg font-bold text-primary">#{i + 1}</div>
            <h4 className="text-sm font-semibold break-words">{s.feature}</h4>
            <p className="text-xs text-muted-foreground">
              Avg SHAP: <strong>{s.shap.toFixed(4)}</strong>
            </p>
            <span className={`text-xs ${
              s.direction === "increases" ? "text-destructive" : "text-success"
            }`}>
              {s.direction === "increases" ? "↑ Increases" : "↓ Decreases"} churn risk
            </span>
          </div>
        ))}
      </div>

      {/* Dataset context */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ["Best model", results.best_model],
          ["Threshold", results.best_threshold],
          ["Features", results.dataset_info.n_features],
          ["Test samples", results.dataset_info?.test_size ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="glass-card p-4 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold">{String(value)}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
