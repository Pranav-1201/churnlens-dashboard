/**
 * BusinessAnalysis.tsx — real cost curve, real savings.
 *
 * The cost-vs-threshold curve and every rupee figure on this page come from the
 * backend, which evaluates exact confusion matrices over the selected model's
 * out-of-fold validation predictions at the FN/FP costs configured in Settings.
 *
 * This page used to synthesise its curve client-side from a single confusion
 * matrix (sigmoid ramp). See AUDIT.md §4.B and tests/test_threshold_curve.py.
 */

import { useState, useEffect } from "react";
import { ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";
import { useThresholdCurve } from "@/hooks/useThresholdCurve";
import { usePipelineStore } from "@/stores/pipelineStore";
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { CHART_COLORS } from "@/constants/chartColors";

function NoData() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline to see business analysis
    </div>
  );
}

/** Animated counter hook */
function useAnimatedCount(target: number, duration = 60) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    let frame = 0;
    const step = target / duration;
    const timer = setInterval(() => {
      frame++;
      setValue(Math.min(target, Math.round(step * frame)));
      if (frame >= duration) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

export default function BusinessAnalysis() {
  const { currency } = usePipelineStore();
  const { results, noData, isRunning } = usePipelineResults();
  const { data: curveData, loading, error } = useThresholdCurve();

  const defaultRow = curveData?.curve.find((d) => Math.abs(d.threshold - 0.5) < 1e-9);
  const optimal = curveData?.optimal;
  const defaultCost = defaultRow?.cost ?? 0;
  const optimalCost = optimal?.cost ?? 0;
  const savings = defaultCost - optimalCost;

  const animatedSavings = useAnimatedCount(savings);

  if (noData) return <NoData />;
  if (isRunning) return <div className="text-muted-foreground p-4">Pipeline is running…</div>;
  if (!results) return null;

  if (error) {
    return (
      <div className="glass-card p-5 border-l-2 border-l-destructive">
        <h3 className="font-semibold text-foreground mb-1">Cost analysis unavailable</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (loading || !curveData || !optimal) {
    return <div className="text-muted-foreground p-4">Loading cost analysis…</div>;
  }

  const { cost_fn, cost_fp, model, locked_threshold } = curveData;
  const costCurve = curveData.curve.map((p) => ({
    ...p,
    costK: +(p.cost / 1000).toFixed(1),
  }));
  const savingsPct = defaultCost > 0 ? ((savings / defaultCost) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">

      {/* Cost vs Threshold */}
      <ChartCard
        title="Cost vs Threshold"
        subtitle={`Cost-optimal threshold = ${optimal.threshold} | Model: ${model} | Validation (out-of-fold) data`}
      >
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={costCurve}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="threshold"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              label={{ value: `Cost (K ${currency})`, angle: -90, position: "insideLeft", fontSize: 10 }}
            />
            <Tooltip
              formatter={(v: number) => [`${currency}${Math.round(v * 1000).toLocaleString()}`, "Cost"]}
              labelFormatter={(l) => `Threshold: ${l}`}
            />
            <ReferenceLine
              x={optimal.threshold}
              stroke={CHART_COLORS[3]}
              strokeDasharray="5 5"
              label={{ value: "Optimal", fill: "hsl(var(--destructive))", fontSize: 10 }}
            />
            {locked_threshold != null && (
              <ReferenceLine
                x={locked_threshold}
                stroke={CHART_COLORS[2]}
                strokeDasharray="2 4"
                label={{ value: "Deployed", fill: CHART_COLORS[2], fontSize: 10 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="costK"
              stroke={CHART_COLORS[0]}
              fill={CHART_COLORS[0]}
              fillOpacity={0.1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Real savings cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="metric-card border-l-2 border-l-warning">
          <span className="text-xs text-muted-foreground uppercase">Default (t=0.50)</span>
          <span className="text-2xl font-bold text-foreground">
            {currency}{defaultCost.toLocaleString()}
          </span>
        </div>
        <div className="metric-card border-l-2 border-l-success">
          <span className="text-xs text-muted-foreground uppercase">
            Optimal (t={optimal.threshold})
          </span>
          <span className="text-2xl font-bold text-foreground">
            {currency}{optimalCost.toLocaleString()}
          </span>
        </div>
        <div className="metric-card border-l-2 border-l-primary">
          <span className="text-xs text-muted-foreground uppercase">Savings</span>
          <span className="text-2xl font-bold text-success">
            {currency}{animatedSavings.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Cost matrix — real values from pipeline */}
      <ChartCard title="Cost Matrix">
        <div className="grid grid-cols-2 gap-2 max-w-md mx-auto text-center">
          <div className="bg-success/10 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">True Negative</p>
            <p className="text-lg font-bold text-success">{currency}0</p>
            <p className="text-xs text-muted-foreground">Correct retain</p>
          </div>
          <div className="bg-warning/10 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">False Positive</p>
            <p className="text-lg font-bold text-warning">
              {currency}{cost_fp.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Unnecessary offer</p>
          </div>
          <div className="bg-destructive/10 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">False Negative</p>
            <p className="text-lg font-bold text-destructive">
              {currency}{cost_fn.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Missed churner</p>
          </div>
          <div className="bg-success/10 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">True Positive</p>
            <p className="text-lg font-bold text-success">{currency}0</p>
            <p className="text-xs text-muted-foreground">Correct flag</p>
          </div>
        </div>
      </ChartCard>

      {/* Confusion matrix at the cost-optimal threshold — measured, not assumed */}
      <ChartCard title={`Validation Confusion Matrix at threshold ${optimal.threshold} (${model})`}>
        <div className="grid grid-cols-2 gap-2 max-w-md mx-auto text-center">
          <div className="bg-success/10 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">True Negative</p>
            <p className="text-lg font-bold text-success">{optimal.tn.toLocaleString()}</p>
          </div>
          <div className="bg-destructive/10 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">False Positive</p>
            <p className="text-lg font-bold text-destructive">{optimal.fp.toLocaleString()}</p>
          </div>
          <div className="bg-destructive/10 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">False Negative</p>
            <p className="text-lg font-bold text-destructive">{optimal.fn.toLocaleString()}</p>
          </div>
          <div className="bg-success/10 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">True Positive</p>
            <p className="text-lg font-bold text-success">{optimal.tp.toLocaleString()}</p>
          </div>
        </div>
      </ChartCard>

      {/* Business interpretation — uses real numbers */}
      <div className="glass-card p-5 border-l-2 border-l-primary">
        <h3 className="font-semibold text-foreground mb-2">Business Interpretation</h3>
        <p className="text-sm text-muted-foreground">
          At threshold {optimal.threshold}, the {model} model minimises total validation cost to{" "}
          <strong className="text-foreground">
            {currency}{optimalCost.toLocaleString()}
          </strong>
          {" "}vs{" "}
          <strong className="text-foreground">
            {currency}{defaultCost.toLocaleString()}
          </strong>{" "}
          at the default 0.50 threshold — a net saving of{" "}
          <strong className="text-success">{currency}{savings.toLocaleString()}</strong>{" "}
          (<strong className="text-foreground">{savingsPct}% cost reduction</strong>).
          It catches {optimal.tp} churners and misses {optimal.fn}, at the price of{" "}
          {optimal.fp} unnecessary offers.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Figures are measured on out-of-fold validation predictions — the same data used to
          choose the threshold. Held-out test performance is reported once, in the final summary.
        </p>
      </div>

    </div>
  );
}
