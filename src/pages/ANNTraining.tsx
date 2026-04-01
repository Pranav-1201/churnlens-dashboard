/**
 * ANNTraining.tsx
 */

import { ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";

// ✅ FIX 1 — use mockData (temporary until full removal)
import { ANN_TRAINING_CURVE } from "@/data/mockData";

import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";

// ✅ FIX 2 — use correct color source
import { CHART_COLORS } from "@/constants/chartColors";

const EARLY_STOP_EPOCH = 20;

const ARCHITECTURE = [
  { label: "Input", neurons: 40, color: "bg-primary/20 border-primary" },
  { label: "Dense", neurons: 128, color: "bg-primary/30 border-primary" },
  { label: "BN+ReLU", neurons: 128, color: "bg-success/20 border-success" },
  { label: "Dropout", neurons: "0.4", color: "bg-warning/20 border-warning" },
  { label: "Dense", neurons: 64, color: "bg-primary/30 border-primary" },
  { label: "BN+ReLU", neurons: 64, color: "bg-success/20 border-success" },
  { label: "Dropout", neurons: "0.3", color: "bg-warning/20 border-warning" },
  { label: "Output", neurons: 1, color: "bg-destructive/20 border-destructive" },
];

const TRAINING_CONFIG = [
  ["Optimizer", "Adam (lr=0.0005)"],
  ["Loss", "BCEWithLogitsLoss"],
  ["Batch Size", "64"],
  ["Device", "CPU"],
  ["Epochs", "40 (stopped at 20)"],
  ["Patience", "5 epochs"],
  ["pos_weight", "2.77"],
  ["Scheduler", "None"],
];

export default function ANNTraining() {
  const { results } = usePipelineResults();

  return (
    <div className="space-y-6">

      {/* Context banner */}
      <div className={`rounded-lg px-4 py-3 text-sm flex flex-wrap gap-4 ${
        results ? "bg-muted/40 text-muted-foreground" : "bg-muted/20 text-muted-foreground/60"
      }`}>
        {results ? (
          <>
            <span>
              Dataset: <strong className="text-foreground">
                {results.eda.total_customers.toLocaleString()} rows
              </strong>
            </span>
            <span>
              Churn rate: <strong className="text-foreground">
                {(results.eda.churn_rate * 100).toFixed(1)}%
              </strong>
            </span>
            <span className="text-xs opacity-60">
              Training curve = notebook experiment; ANN not in live pipeline
            </span>
          </>
        ) : (
          <span>
            Training curve from notebook experiment — run pipeline for live dataset context
          </span>
        )}
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

      {/* Training curves */}
      <ChartCard
        title="Training Curves"
        subtitle={`Early stopping at epoch ${EARLY_STOP_EPOCH} — notebook experiment`}
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={ANN_TRAINING_CURVE}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="epoch"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              label={{ value: "Epoch", position: "insideBottom", offset: -4, fontSize: 10 }}
            />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip />

            {/* ✅ FIX 3 — correct color usage */}
            <ReferenceLine
              x={EARLY_STOP_EPOCH}
              stroke={CHART_COLORS[3]} // danger (red)
              strokeDasharray="5 5"
              label={{ value: "Early Stop", fill: "hsl(var(--destructive))", fontSize: 10 }}
            />

            <Line
              type="monotone"
              dataKey="trainLoss"
              stroke={CHART_COLORS[0]} // primary (blue)
              dot={false}
              strokeWidth={2}
              name="Train Loss"
            />

            <Line
              type="monotone"
              dataKey="valLoss"
              stroke={CHART_COLORS[1]} // secondary (green)
              dot={false}
              strokeWidth={2}
              name="Val Loss"
            />
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