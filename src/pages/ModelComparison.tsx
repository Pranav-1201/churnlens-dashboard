/**
 * ModelComparison.tsx — FINAL MERGED VERSION
 *
 * Combines:
 * - Real pipeline results (Claude) ✅
 * - Your charts + UI (Recharts + cards) ✅
 * - Removes mock data ❌
 */

import { ChartCard, StatusBadge } from "@/components/DashboardCards";
import { usePipelineStore } from "@/stores/pipelineStore";
import { usePipelineResults } from "@/hooks/usePipelineResults";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ============================================
// PLACEHOLDER (NO DATA)
// ============================================

function NoData() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline first to see model comparison
    </div>
  );
}

// ============================================
// COMPONENT
// ============================================

export default function ModelComparison() {
  const { currency } = usePipelineStore();
  const { results, noData, isRunning } = usePipelineResults();

  if (noData) return <NoData />;
  if (isRunning) return <div className="text-muted-foreground">Pipeline is running...</div>;
  if (!results) return null;

  const { models, best_model, best_threshold, cost_fn, cost_fp } = results;

  // Sorting
  const sorted = [...models].sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
  const byAuc = [...models].sort((a, b) => b.roc_auc - a.roc_auc);
  const byCost = models.filter((m) => m.cost !== null);

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div>
        <h2 className="text-xl font-medium">Model Comparison</h2>
        <p className="text-muted-foreground text-sm">
          Best: <strong>{best_model}</strong> | Threshold: {best_threshold} | FN: {currency}{cost_fn} | FP: {currency}{cost_fp}
        </p>
      </div>

      {/* LEADERBOARD TABLE */}
      <ChartCard title="Leaderboard" subtitle="Ranked by business cost">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Rank", "Model", "Accuracy", "ROC-AUC", "PR-AUC", "Cost", "Status"].map((h) => (
                  <th key={h} className="text-left py-2 text-muted-foreground font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => (
                <tr
                  key={m.name}
                  className={`border-b border-border/30 ${
                    m.status === "Selected" ? "bg-warning/5 border-l-2 border-l-warning" : ""
                  }`}
                >
                  <td className="py-2.5">{m.status === "Selected" ? "🏆" : i + 1}</td>
                  <td className="py-2.5 font-medium">{m.name}</td>
                  <td className="py-2.5">{(m.accuracy * 100).toFixed(1)}%</td>
                  <td className="py-2.5">{m.roc_auc.toFixed(4)}</td>
                  <td className="py-2.5">{m.pr_auc?.toFixed(4) ?? "—"}</td>
                  <td className="py-2.5">
                    {m.cost ? `${currency}${m.cost.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-2.5">
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ROC AUC */}
        <ChartCard title="ROC-AUC Comparison">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={byAuc.map((m) => ({
                name: m.name,
                auc: m.roc_auc,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="auc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* COST */}
        <ChartCard title="Business Cost Comparison">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={byCost.map((m) => ({
                name: m.name,
                cost: m.cost,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip formatter={(v: number) => `${currency}${v.toLocaleString()}`} />
              <Bar dataKey="cost" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* CONFUSION MATRICES */}
      <div className="flex flex-wrap gap-4">
        {models.map((m) => (
          <div
            key={m.name}
            className="border border-border rounded-lg p-4 w-[220px]"
          >
            <p className="text-sm font-medium mb-2">{m.name}</p>

            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th />
                  <th>Pred 0</th>
                  <th>Pred 1</th>
                </tr>
              </thead>
              <tbody>
                {m.confusion_matrix.map((row, ri) => (
                  <tr key={ri}>
                    <td>Act {ri}</td>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`text-center font-medium ${
                          ri === ci ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

    </div>
  );
}