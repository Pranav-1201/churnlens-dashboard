/**
 * ModelComparison.tsx — FIXED
 *
 * Fixes:
 *  1. All <Bar> components now have a fill prop — charts were rendering black/invisible
 *  2. Leaderboard shows ALL models from pipeline, not just those with cost
 *  3. ROC-AUC bars now use CHART_COLORS properly
 */

import { ChartCard, StatusBadge } from "@/components/DashboardCards";
import { usePipelineStore } from "@/stores/pipelineStore";
import { usePipelineResults } from "@/hooks/usePipelineResults";
import { CHART_COLORS } from "@/constants/chartColors";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

function NoData() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline first to see model comparison
    </div>
  );
}

// Short label for long model names on chart axes
function shortName(name: string) {
  const map: Record<string, string> = {
    "Logistic Regression": "Logistic",
    "Tuned Logistic":      "Tuned LR",
    "Random Forest":       "RF",
    "Decision Tree":       "DT",
    "Stacked Model":       "Stack",
    "XGBoost":             "XGB",
    "LightGBM":            "LGBM",
    "CatBoost":            "Cat",
  };
  return map[name] ?? name;
}

export default function ModelComparison() {
  const { currency } = usePipelineStore();
  const { results, noData, isRunning } = usePipelineResults();

  if (noData)    return <NoData />;
  if (isRunning) return <div className="text-muted-foreground">Pipeline is running...</div>;
  if (!results)  return null;

  const {
    models = [],
    best_model = "—",
    best_threshold = 0,
    cost_fn = 0,
    cost_fp = 0,
  } = results;

  // Sort by cost (lowest = best). Models without cost go to end.
  const sorted  = [...models].sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
  const byAuc   = [...models].sort((a, b) => b.roc_auc - a.roc_auc);
  const byCost  = models.filter((m) => m.cost != null);

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div>
        <h2 className="text-xl font-medium">Model Comparison</h2>
        <p className="text-muted-foreground text-sm">
          Best: <strong>{best_model}</strong> | Threshold: {best_threshold} | FN: {currency}{cost_fn.toLocaleString()} | FP: {currency}{cost_fp.toLocaleString()}
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          Cost figures below are <strong>validation (out-of-fold)</strong> costs — the basis on which
          the model and its threshold were selected. The test set is scored only once, in the final summary.
        </p>
      </div>

      {/* LEADERBOARD TABLE */}
      <ChartCard title="Leaderboard" subtitle="Ranked by validation (out-of-fold) cost">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Rank", "Model", "Accuracy", "ROC-AUC", "PR-AUC", "Validation Cost", "Status"].map((h) => (
                  <th key={h} className="text-left py-2 text-muted-foreground font-medium pr-4">
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
                    m.status === "Selected"
                      ? "bg-yellow-500/5 border-l-2 border-l-yellow-500"
                      : ""
                  }`}
                >
                  <td className="py-2.5 pr-4">
                    {m.status === "Selected" ? "🏆" : i + 1}
                  </td>
                  <td className="py-2.5 pr-4 font-medium">{m.name}</td>
                  <td className="py-2.5 pr-4">{(m.accuracy * 100).toFixed(1)}%</td>
                  <td className="py-2.5 pr-4">{m.roc_auc.toFixed(4)}</td>
                  <td className="py-2.5 pr-4">{m.pr_auc?.toFixed(4) ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    {m.cost != null ? `${currency}${m.cost.toLocaleString()}` : "—"}
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

      {/* CHARTS — ROC AUC + COST */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ✅ FIXED: fill={CHART_COLORS[0]} added */}
        <ChartCard title="ROC-AUC Comparison">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byAuc.map((m) => ({ name: shortName(m.name), auc: m.roc_auc, fullName: m.name }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0.7, 1]} tickFormatter={(v) => v.toFixed(2)} />
              <Tooltip
                formatter={(v: number) => v.toFixed(4)}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
              />
              <Bar dataKey="auc" radius={[4, 4, 0, 0]}>
                {byAuc.map((m, i) => (
                  <Cell
                    key={m.name}
                    fill={m.status === "Selected" ? "#f59e0b" : CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ✅ FIXED: fill={CHART_COLORS[1]} added */}
        <ChartCard title="Validation Cost Comparison" subtitle="Out-of-fold cost — the selection criterion">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byCost.map((m) => ({ name: shortName(m.name), cost: m.cost, fullName: m.name }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => `${currency}${v.toLocaleString()}`}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
              />
              <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                {byCost.map((m, i) => (
                  <Cell
                    key={m.name}
                    fill={m.status === "Selected" ? "#22c55e" : CHART_COLORS[(i + 2) % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* CONFUSION MATRICES — mini cards */}
      <ChartCard title="Confusion Matrices" subtitle="Held-out test set, at the default threshold 0.50">
        <div className="flex flex-wrap gap-4">
          {models.map((m) => (
            <div
              key={m.name}
              className="border border-border rounded-lg p-4 w-[220px] shrink-0"
            >
              <p className="text-sm font-medium mb-2 truncate">{m.name}</p>
              <table className="text-xs w-full">
                <thead>
                  <tr>
                    <th />
                    <th className="text-center text-muted-foreground">Pred 0</th>
                    <th className="text-center text-muted-foreground">Pred 1</th>
                  </tr>
                </thead>
                <tbody>
                  {(m.confusion_matrix ?? []).map((row: number[], ri: number) => (
                    <tr key={ri}>
                      <td className="text-muted-foreground pr-2">Act {ri}</td>
                      {row.map((cell: number, ci: number) => (
                        <td
                          key={ci}
                          className={`text-center font-medium ${
                            ri === ci ? "text-green-500" : "text-red-500"
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
      </ChartCard>

    </div>
  );
}