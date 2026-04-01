/**
 * FeatureEngineering.tsx — FIXED
 */

import { ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";

import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from "recharts";

// ✅ FIX 1 — add missing import
import { CHART_COLORS } from "@/constants/chartColors";

// (ModelMetric import not used → removed)

const ENGINEERED_FEATURES = [
  {
    name: "Tenure_to_Charges",
    formula: "tenure / (MonthlyCharges + 1)",
    rationale: "Measures how long a customer stays per unit of spend.",
    data: Array.from({ length: 6 }, (_, i) => ({
      bin: (i * 0.2).toFixed(1),
      count: [800, 1400, 1800, 1500, 900, 643][i],
    })),
  },
  {
    name: "TenureGroup",
    formula: "pd.cut(tenure, bins=[0,12,36,72])",
    rationale: "Groups customers by lifecycle stage.",
    data: [
      { bin: "Short-Term", count: 2175 },
      { bin: "Mid-Term", count: 1539 },
      { bin: "Long-Term", count: 3329 },
    ],
  },
  {
    name: "AvgMonthlyCharge",
    formula: "TotalCharges / (tenure + 1)",
    rationale: "Average monthly spend.",
    data: Array.from({ length: 5 }, (_, i) => ({
      bin: `$${20 + i * 20}–${40 + i * 20}`,
      count: [1200, 1400, 1600, 1500, 1343][i],
    })),
  },
  {
    name: "HighSpender",
    formula: "MonthlyCharges > 75th percentile",
    rationale: "High spenders are more price-sensitive.",
    data: [{ bin: "No", count: 4200 }, { bin: "Yes", count: 2843 }],
  },
  {
    name: "ServiceCount",
    formula: "Sum of 6 binary service flags",
    rationale: "More services = lower churn.",
    data: Array.from({ length: 7 }, (_, i) => ({
      bin: String(i),
      count: [1400, 900, 1100, 1200, 1000, 800, 643][i],
    })),
  },
  {
    name: "LowEngagement",
    formula: "(tenure < 12) & (ServiceCount < 3)",
    rationale: "High-risk segment.",
    data: [{ bin: "No", count: 3643 }, { bin: "Yes", count: 3400 }],
  },
  {
    name: "IsMonthToMonth",
    formula: "Contract == 'Month-to-month'",
    rationale: "Top churn predictor.",
    data: [{ bin: "No", count: 3168 }, { bin: "Yes", count: 3875 }],
  },
  {
    name: "FiberUser",
    formula: "InternetService == 'Fiber optic'",
    rationale: "Higher churn segment.",
    data: [{ bin: "No", count: 3947 }, { bin: "Yes", count: 3096 }],
  },
];

export default function FeatureEngineering() {
  const { results } = usePipelineResults();

  const originalFeatures = 19;
  const engineeredCount = ENGINEERED_FEATURES.length;

  // ✅ FIX 2 — backend does not provide n_features
  const totalAfterEncoding = results ? "Available in model pipeline" : "run pipeline";

  return (
    <div className="space-y-6">

      {/* Summary */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-center gap-6 text-sm flex-wrap">
          <span>
            Original: <strong>{originalFeatures}</strong>
          </span>
          <span>+</span>
          <span>
            Engineered: <strong>{engineeredCount}</strong>
          </span>
          <span>→</span>
          <span>
            After encoding: <strong>{totalAfterEncoding}</strong>
          </span>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ENGINEERED_FEATURES.map((f) => (
          <div key={f.name} className="glass-card p-5 space-y-3">
            <h3 className="font-semibold">{f.name}</h3>
            <code className="text-xs bg-muted px-2 py-1 rounded block">
              {f.formula}
            </code>
            <p className="text-sm text-muted-foreground">{f.rationale}</p>

            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={f.data}>
                <XAxis dataKey="bin" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill={CHART_COLORS[0]} />
              </BarChart>
            </ResponsiveContainer>

          </div>
        ))}
      </div>

    </div>
  );
}