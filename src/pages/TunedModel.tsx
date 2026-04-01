/**
 * TunedModel.tsx — wired to real pipeline results
 * Replaces: import { CONFUSION_MATRICES } from "@/data/ModelMetric"
 *
 * Real source: results.models — compares "Selected" vs "Runner-up"
 * The concept of "before/after tuning" maps naturally to Selected vs Runner-up.
 */

import { ChartCard, MetricCard, ConfusionMatrix } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

function NoData() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline to see model comparison
    </div>
  );
}

function Delta({ value, label }: { value: number; label: string }) {
  const abs = Math.abs(value * 100).toFixed(3);
  if (value > 0.00005)
    return (
      <span className="flex items-center text-xs text-success gap-0.5">
        <ArrowUp className="w-3 h-3" />
        {abs}%
      </span>
    );
  if (value < -0.00005)
    return (
      <span className="flex items-center text-xs text-destructive gap-0.5">
        <ArrowDown className="w-3 h-3" />
        {abs}%
      </span>
    );
  return (
    <span className="flex items-center text-xs text-muted-foreground gap-0.5">
      <Minus className="w-3 h-3" />
      ~0
    </span>
  );
}

export default function TunedModel() {
  const { results, noData, isRunning } = usePipelineResults();

  if (noData) return <NoData />;
  if (isRunning) return <div className="text-muted-foreground p-4">Pipeline is running…</div>;
  if (!results) return null;

  const { models } = results;

  // Selected = best (lowest cost), Runner-up = second best
  const selected = models.find((m) => m.status === "Selected") ?? models[0];
  const runnerUp = models.find((m) => m.status === "Runner-up") ?? models[1];

  const deltaAcc = selected.accuracy - runnerUp.accuracy;
  const deltaAuc = selected.roc_auc - runnerUp.roc_auc;
  const deltaCost = (runnerUp.cost ?? 0) - (selected.cost ?? 0); // positive = selected is cheaper

  return (
    <div className="space-y-6">

      {/* Comparison grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Runner-up */}
        <ChartCard title={runnerUp.name} subtitle="Runner-up">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MetricCard title="Accuracy" value={(runnerUp.accuracy * 100).toFixed(2) + "%"} tint="primary" />
            <MetricCard title="ROC-AUC" value={runnerUp.roc_auc.toFixed(4)} tint="primary" />
            <MetricCard title="PR-AUC" value={runnerUp.pr_auc?.toFixed(4) ?? "—"} tint="warning" />
            <MetricCard
              title="Business Cost"
              value={runnerUp.cost ? `₹${runnerUp.cost.toLocaleString()}` : "—"}
              tint="destructive"
            />
          </div>
          <ConfusionMatrix matrix={runnerUp.confusion_matrix} />
        </ChartCard>

        {/* Selected / Best */}
        <ChartCard title={selected.name} subtitle="Selected (best cost)">
          <div className="grid grid-cols-2 gap-3 mb-4">

            <div className="metric-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Accuracy
              </span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {(selected.accuracy * 100).toFixed(2)}%
                </span>
                <Delta value={deltaAcc} label="acc" />
              </div>
            </div>

            <div className="metric-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                ROC-AUC
              </span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {selected.roc_auc.toFixed(4)}
                </span>
                <Delta value={deltaAuc} label="auc" />
              </div>
            </div>

            <MetricCard
              title="PR-AUC"
              value={selected.pr_auc?.toFixed(4) ?? "—"}
              tint="warning"
            />

            <div className="metric-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Business Cost
              </span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {selected.cost ? `₹${selected.cost.toLocaleString()}` : "—"}
                </span>
                {deltaCost > 0 && (
                  <span className="text-xs text-success flex items-center gap-0.5">
                    <ArrowDown className="w-3 h-3" />
                    ₹{deltaCost.toLocaleString()} cheaper
                  </span>
                )}
              </div>
            </div>

          </div>
          <ConfusionMatrix matrix={selected.confusion_matrix} />
        </ChartCard>

      </div>

      {/* CV comparison */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-foreground mb-3">Cross-Validation Comparison</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[runnerUp, selected].map((m) => (
            <div key={m.name}>
              <p className="text-sm font-medium mb-2">
                {m.name}{" "}
                <span className="text-xs text-muted-foreground">
                  ({m.cv_mean.toFixed(4)} ± {m.cv_std.toFixed(4)})
                </span>
              </p>
              <div className="flex gap-2">
                {m.cv_scores.map((s, i) => (
                  <div key={i} className="flex-1 text-center bg-muted/50 rounded p-2">
                    <p className="text-xs text-muted-foreground">F{i + 1}</p>
                    <p className="text-xs font-mono font-bold">{s.toFixed(4)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className="glass-card p-5 border-l-2 border-l-warning">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Selection rationale:</strong>{" "}
          {selected.name} was selected over {runnerUp.name} because it minimises
          the business cost function (FN×₹10,000 + FP×₹500).
          {Math.abs(deltaAuc) < 0.001
            ? " ROC-AUC is essentially identical between the two — cost is the deciding factor."
            : ` ROC-AUC difference: ${(deltaAuc * 100).toFixed(3)}%.`}
        </p>
      </div>

    </div>
  );
}
