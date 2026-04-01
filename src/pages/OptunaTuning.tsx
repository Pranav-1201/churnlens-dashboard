/**
 * OptunaTuning.tsx
 *
 * Optuna trial history is a notebook artifact (30 trials run offline).
 * The "best params" card compares Optuna result against the REAL live
 * pipeline's selected model, so it's not entirely fake.
 */

import { MetricCard, ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";
import { OPTUNA_TRIALS, CHART_COLORS } from "@/data/mockData";
import {
  ScatterChart, Scatter, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";

// Notebook Optuna best — static
const OPTUNA_BEST = {
  trial: 25,
  rocAuc: 0.8454,
  params: {
    C: "0.847",
    penalty: "l2",
    solver: "lbfgs",
    max_iter: "2000",
    class_weight: "balanced",
  },
};

export default function OptunaTuning() {
  const { results } = usePipelineResults();

  const liveSelected = results?.models.find((m) => m.status === "Selected");
  const diffVsLive = liveSelected
    ? (OPTUNA_BEST.rocAuc - liveSelected.roc_auc).toFixed(4)
    : null;

  return (
    <div className="space-y-6">

      {/* Context banner */}
      <div className="rounded-lg px-4 py-3 text-sm bg-muted/40 text-muted-foreground">
        {results
          ? "Optuna trial history from notebook (30 trials) — compared below against live pipeline best model."
          : "Optuna trial history from notebook experiment — run pipeline for live comparison."}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Scatter — static notebook data */}
        <ChartCard title="Optimization History" subtitle="30 trials — notebook experiment">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="trial"
                name="Trial"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                dataKey="rocAuc"
                name="ROC-AUC"
                domain={[0.82, 0.86]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip />
              <Scatter data={OPTUNA_TRIALS}>
                {OPTUNA_TRIALS.map((t, i) => (
                  <Cell
                    key={i}
                    fill={t.isBest ? CHART_COLORS[0] : "hsl(var(--muted-foreground))"}
                    r={t.isBest ? 8 : 4}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="space-y-4">
          <MetricCard
            title="Optuna Best CV Score"
            value={OPTUNA_BEST.rocAuc.toFixed(4)}
            tint="primary"
            subtitle={`Trial #${OPTUNA_BEST.trial}`}
          />

          {/* Live comparison */}
          {liveSelected && (
            <div className="glass-card p-4">
              <p className="text-xs text-muted-foreground mb-2">vs Live Pipeline</p>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Optuna</p>
                  <p className="font-bold">{OPTUNA_BEST.rocAuc.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{liveSelected.name}</p>
                  <p className="font-bold">{liveSelected.roc_auc.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Δ</p>
                  <p className={`font-bold ${parseFloat(diffVsLive ?? "0") >= 0 ? "text-success" : "text-destructive"}`}>
                    {diffVsLive !== null
                      ? `${parseFloat(diffVsLive) >= 0 ? "+" : ""}${diffVsLive}`
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          <ChartCard title="Best Hyperparameters">
            <div className="space-y-2">
              {Object.entries(OPTUNA_BEST.params).map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between items-center py-1.5 border-b border-border/30"
                >
                  <span className="text-sm text-muted-foreground">{k}</span>
                  <span className="text-sm font-mono font-medium text-foreground">{v}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

      </div>

      <div className="glass-card p-5 border-l-2 border-l-warning">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Note:</strong> Optuna tuning showed marginal
          improvement on Logistic Regression (+0.0003 ROC-AUC). The live pipeline uses the
          tuned parameters as "Tuned Logistic" but selects by minimum business cost,
          not just ROC-AUC.
        </p>
      </div>

    </div>
  );
}
