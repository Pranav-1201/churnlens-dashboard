/**
 * FinalSummary.tsx — wired to real pipeline results
 * Replaces: import { MODEL_RESULTS } from "@/data/mockData"
 */

import { ChartCard, StatusBadge } from "@/components/DashboardCards";
import { usePipelineStore } from "@/stores/pipelineStore";
import { usePipelineResults } from "@/hooks/usePipelineResults";
import { CheckCircle, AlertTriangle } from "lucide-react";

// ── Placeholder ─────────────────────────────────────
function NoData() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline to see the final summary
    </div>
  );
}

// ── Component ────────────────────────────────────────
export default function FinalSummary() {
  const { currency } = usePipelineStore();
  const { results, noData, isRunning } = usePipelineResults();

  if (noData) return <NoData />;
  if (isRunning) return <div className="text-muted-foreground p-4">Pipeline is running…</div>;
  if (!results) return null;

  const { models, best_model, best_threshold, cost_fn, cost_fp, dataset_info } = results;
  const best = models.find((m) => m.status === "Selected") ?? models[0];

  // Deployment checklist — static facts + dynamic checks from real results
  const checklist = [
    { text: `Best model selected: ${best_model}`, done: !!best_model },
    { text: `Optimal threshold: ${best_threshold}`, done: best_threshold > 0 },
    {
      text: `Cross-validation stable (CV σ < 0.015): ${best.cv_std < 0.015 ? "yes" : "needs review"}`,
      done: best.cv_std < 0.015,
    },
    { text: "SHAP global importances computed", done: results.shap_global.length > 0 },
    { text: "Per-customer explanations available", done: results.customer_shap.length > 0 },
    { text: `Dataset: ${dataset_info.total_rows.toLocaleString()} rows, ${dataset_info.n_features} features`, done: true },
    { text: "Calibration: verify isotonic vs sigmoid on hold-out", done: false },
    { text: "Add input validation for null/missing fields in production", done: false },
  ];

  return (
    <div className="space-y-6">

      {/* Winner showcase */}
      <div className="glass-card p-8 border-2 border-warning/50 text-center space-y-4">
        <div className="text-3xl">🏆</div>
        <h2 className="text-2xl font-bold text-foreground">{best.name}</h2>
        <p className="text-muted-foreground">Business-Optimal Model</p>

        <div className="flex justify-center gap-6 flex-wrap">
          {[
            ["Accuracy", `${(best.accuracy * 100).toFixed(2)}%`],
            ["ROC-AUC", best.roc_auc.toFixed(4)],
            ["PR-AUC", best.pr_auc?.toFixed(4) ?? "—"],
            ["Threshold", String(best_threshold)],
            ["FN Cost", `${currency}${cost_fn.toLocaleString()}`],
            ["Total Cost", best.cost ? `${currency}${best.cost.toLocaleString()}` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="text-center">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="text-lg font-bold text-foreground">{v}</p>
            </div>
          ))}
        </div>

        {/* CV scores */}
        <div className="flex justify-center gap-2 flex-wrap mt-2">
          <span className="text-xs text-muted-foreground">
            5-fold CV: {best.cv_scores.map((s) => s.toFixed(4)).join(", ")}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          Mean: {best.cv_mean?.toFixed(4)} ± {best.cv_std?.toFixed(4)}
        </div>
      </div>

      {/* Full model comparison table */}
      <ChartCard title="Full Model Comparison">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Model", "Accuracy", "ROC-AUC", "PR-AUC", "Cost", "CV Mean ± Std", "Status"].map((h) => (
                  <th key={h} className="text-left py-2 text-muted-foreground font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...models]
                .sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity))
                .map((m) => (
                  <tr
                    key={m.name}
                    className={`border-b border-border/30 ${
                      m.status === "Selected" ? "bg-warning/5" : ""
                    }`}
                  >
                    <td className="py-2 font-medium text-foreground">{m.name}</td>
                    <td className="py-2 text-foreground">{(m.accuracy * 100).toFixed(2)}%</td>
                    <td className="py-2 text-foreground">{m.roc_auc.toFixed(4)}</td>
                    <td className="py-2 text-foreground">{m.pr_auc?.toFixed(4) ?? "—"}</td>
                    <td className="py-2 text-foreground">
                      {m.cost ? `${currency}${m.cost.toLocaleString()}` : "—"}
                    </td>
                    <td className="py-2 text-foreground font-mono text-xs">
                      {m.cv_mean?.toFixed(4)} ± {m.cv_std?.toFixed(4)}
                    </td>
                    <td className="py-2">
                      <StatusBadge status={m.status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Dataset summary */}
      <ChartCard title="Dataset Summary">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            ["Total rows", dataset_info.total_rows.toLocaleString()],
            ["Train size", dataset_info.train_size.toLocaleString()],
            ["Test size", dataset_info.test_size.toLocaleString()],
            ["Features", dataset_info.n_features],
            ["Churn rate", `${(dataset_info.churn_rate * 100).toFixed(1)}%`],
          ].map(([label, value]) => (
            <div key={String(label)} className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{String(value)}</p>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Deployment checklist — dynamic */}
      <ChartCard title="Deployment Checklist">
        <div className="space-y-2">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              {item.done ? (
                <CheckCircle className="w-4 h-4 text-success shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
              )}
              <span
                className={`text-sm ${item.done ? "text-foreground" : "text-warning"}`}
              >
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </ChartCard>

    </div>
  );
}
