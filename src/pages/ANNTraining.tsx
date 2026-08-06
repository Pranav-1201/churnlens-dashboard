/**
 * ANNTraining.tsx — real recorded ANN training history.
 *
 * The loss curve is the ACTUAL per-epoch train/val loss from a PyTorch training
 * run, recorded to src/data/ann_history.json by backend/export_ann_history.py
 * (same architecture, loss, optimiser, early stopping and seed as the notebook).
 *
 * It previously plotted `0.65 * Math.exp(-0.08 * epoch) + 0.32` — a fabricated
 * curve dressed up as "notebook experiment data". That was the same bug pattern
 * as the cost chart (AUDIT.md §4.B); do not reintroduce it. The ANN is not part
 * of the live backend pipeline, so this history is a recorded artifact, not a
 * live fetch — but every number in it is measured, not invented.
 */

import { ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";

import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";

import { CHART_COLORS } from "@/constants/chartColors";
import annHistory from "@/data/ann_history.json";

const EPOCHS = annHistory.epochs;
const BEST_EPOCH = annHistory.early_stop_epoch;
const LAST_EPOCH = EPOCHS.length ? EPOCHS[EPOCHS.length - 1].epoch : 0;

const ARCHITECTURE = [
  { label: "Input", neurons: annHistory.n_features, color: "bg-primary/20 border-primary" },
  { label: "Dense", neurons: 128, color: "bg-primary/30 border-primary" },
  { label: "BN+ReLU", neurons: 128, color: "bg-success/20 border-success" },
  { label: "Dropout", neurons: "0.4", color: "bg-warning/20 border-warning" },
  { label: "Dense", neurons: 64, color: "bg-primary/30 border-primary" },
  { label: "BN+ReLU", neurons: 64, color: "bg-success/20 border-success" },
  { label: "Dropout", neurons: "0.3", color: "bg-warning/20 border-warning" },
  { label: "Output", neurons: 1, color: "bg-destructive/20 border-destructive" },
];

const hp = annHistory.hyperparams;
const TRAINING_CONFIG: [string, string][] = [
  ["Optimizer", `Adam (lr=${hp.lr})`],
  ["Loss", "BCEWithLogitsLoss"],
  ["Batch Size", String(hp.batch_size)],
  ["Device", "CPU"],
  ["Epochs", `${hp.max_epochs} (ran ${LAST_EPOCH}, best @ ${BEST_EPOCH})`],
  ["Patience", `${hp.patience} epochs`],
  ["Test ROC-AUC", String(annHistory.test_auc)],
  ["Best Val Loss", String(annHistory.best_val_loss)],
];

export default function ANNTraining() {
  const { results } = usePipelineResults();

  return (
    <div className="space-y-6">

      {/* Provenance banner — real recorded run, not synthetic */}
      <div className="rounded-lg px-4 py-3 text-sm flex flex-wrap gap-4 bg-muted/40 text-muted-foreground">
        {results && (
          <>
            <span>
              Dataset: <strong className="text-foreground">
                {results.eda?.total_customers?.toLocaleString?.() ?? "—"} rows
              </strong>
            </span>
            <span>
              Churn rate: <strong className="text-foreground">
                {results.eda?.churn_rate != null ? (results.eda.churn_rate * 100).toFixed(1) + "%" : "—"}
              </strong>
            </span>
          </>
        )}
        <span className="text-xs">
          Real recorded PyTorch run ({EPOCHS.length} epochs, best val loss at epoch {BEST_EPOCH},
          test ROC-AUC {annHistory.test_auc}). Seed {annHistory.seed}. The ANN is a research
          reference — it is not part of the live backend pipeline.
        </span>
      </div>

      {/* Architecture */}
      <ChartCard title="Neural Network Architecture">
        <div className="flex items-center justify-center gap-2 py-6 overflow-x-auto">
          {ARCHITECTURE.map((layer, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`px-4 py-3 rounded-xl border ${layer.color} text-center min-w-[80px]`}>
                <div className="text-xs font-medium text-foreground">{layer.label}</div>
                <div className="text-lg font-bold text-foreground">{layer.neurons}</div>
              </div>
              {i < ARCHITECTURE.length - 1 && (
                <span className="text-muted-foreground">→</span>
              )}
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Training curves — real per-epoch losses */}
      <ChartCard
        title="Training Curves"
        subtitle={`Recorded per-epoch loss — best validation loss at epoch ${BEST_EPOCH}`}
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={EPOCHS}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="epoch"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              label={{ value: "Epoch", position: "insideBottom", offset: -4, fontSize: 10 }}
            />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip formatter={(v: number) => v.toFixed(4)} />

            <ReferenceLine
              x={BEST_EPOCH}
              stroke={CHART_COLORS[3]}
              strokeDasharray="5 5"
              label={{ value: "Best (restored)", fill: "hsl(var(--destructive))", fontSize: 10 }}
            />

            <Line type="monotone" dataKey="trainLoss" stroke={CHART_COLORS[0]} dot={false} strokeWidth={2} name="Train Loss" />
            <Line type="monotone" dataKey="valLoss" stroke={CHART_COLORS[1]} dot={false} strokeWidth={2} name="Val Loss" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Training config */}
      <ChartCard title="Training Configuration">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TRAINING_CONFIG.map(([k, v]) => (
            <div key={k} className="bg-muted/50 rounded-lg p-3">
              <span className="text-xs text-muted-foreground">{k}</span>
              <p className="text-sm font-medium text-foreground mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </ChartCard>

    </div>
  );
}
