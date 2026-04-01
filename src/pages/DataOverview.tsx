/**
 * DataOverview.tsx — uses real pipeline results for metrics,
 * static schema preview for table illustration
 */

import { MetricCard, ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";

import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from "recharts";

import { CHART_COLORS } from "@/constants/chartColors";

function NoData() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline to see dataset overview
    </div>
  );
}

// Static schema reference — illustrates column structure (not mock results data)
const SCHEMA_PREVIEW = [
  { customerID: "7590-VHVEG", gender: "Female", SeniorCitizen: 0, Partner: "Yes", Dependents: "No", tenure: 1, PhoneService: "No", MultipleLines: "No phone service", InternetService: "DSL", OnlineSecurity: "No", OnlineBackup: "Yes", DeviceProtection: "No", TechSupport: "No", StreamingTV: "No", StreamingMovies: "No", Contract: "Month-to-month", PaperlessBilling: "Yes", PaymentMethod: "Electronic check", MonthlyCharges: 29.85, TotalCharges: "29.85", Churn: "No" },
  { customerID: "5575-GNVDE", gender: "Male", SeniorCitizen: 0, Partner: "No", Dependents: "No", tenure: 34, PhoneService: "Yes", MultipleLines: "No", InternetService: "DSL", OnlineSecurity: "Yes", OnlineBackup: "No", DeviceProtection: "Yes", TechSupport: "No", StreamingTV: "No", StreamingMovies: "No", Contract: "One year", PaperlessBilling: "No", PaymentMethod: "Mailed check", MonthlyCharges: 56.95, TotalCharges: "1889.5", Churn: "No" },
  { customerID: "3668-QPYBK", gender: "Male", SeniorCitizen: 0, Partner: "No", Dependents: "No", tenure: 2, PhoneService: "Yes", MultipleLines: "No", InternetService: "DSL", OnlineSecurity: "Yes", OnlineBackup: "Yes", DeviceProtection: "No", TechSupport: "No", StreamingTV: "No", StreamingMovies: "No", Contract: "Month-to-month", PaperlessBilling: "Yes", PaymentMethod: "Mailed check", MonthlyCharges: 53.85, TotalCharges: "108.15", Churn: "Yes" },
];

// Static dtype distribution — describes the raw dataset schema
const DTYPE_DATA = [
  { name: "Object", value: 16, color: CHART_COLORS[0] },
  { name: "Numeric", value: 3, color: CHART_COLORS[1] },
  { name: "Boolean", value: 2, color: CHART_COLORS[2] },
];

const MISSING_DATA = [
  { feature: "TotalCharges", missing: 11 },
  { feature: "MonthlyCharges", missing: 0 },
  { feature: "tenure", missing: 0 },
  { feature: "SeniorCitizen", missing: 0 },
];

export default function DataOverview() {
  const { results, noData, isRunning } = usePipelineResults();

  if (noData) return <NoData />;
  if (isRunning)
    return <div className="text-muted-foreground p-4">Pipeline is running…</div>;

  const di = results?.eda;
  const datasetInfo = results?.dataset_info;

  const cols = Object.keys(SCHEMA_PREVIEW[0]);

  return (
    <div className="space-y-6">

      {/* Metrics — from real pipeline results */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Rows"
          value={di?.total_customers?.toLocaleString() ?? "—"}
          tint="primary"
          subtitle="From uploaded dataset"
        />

        <MetricCard
          title="Columns"
          value={cols.length}
          tint="success"
        />

        <MetricCard
          title="Features (encoded)"
          value={datasetInfo?.n_features ?? "—"}
          tint="warning"
          subtitle="After encoding"
        />

        <MetricCard
          title="Churn rate"
          value={di ? `${(di.churn_rate * 100).toFixed(1)}%` : "—"}
          tint="destructive"
        />
      </div>

      {/* Schema Preview — static reference */}
      <ChartCard
        title="Dataset Schema Preview"
        subtitle="Illustrative rows showing column structure"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {cols.map((c) => (
                  <th
                    key={c}
                    className="text-left py-2 px-2 text-muted-foreground font-medium whitespace-nowrap"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {SCHEMA_PREVIEW.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/30 hover:bg-muted/30"
                >
                  {cols.map((c) => (
                    <td
                      key={c}
                      className="py-1.5 px-2 text-foreground whitespace-nowrap"
                    >
                      {String(row[c as keyof typeof row] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Data types */}
        <ChartCard title="Data Types Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={DTYPE_DATA}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {DTYPE_DATA.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Missing values */}
        <ChartCard title="Missing Values" subtitle="Before cleaning">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={MISSING_DATA} layout="vertical">
              <XAxis type="number" />
              <YAxis type="category" dataKey="feature" width={110} />
              <Tooltip />
              <Bar
                dataKey="missing"
                fill={CHART_COLORS[3]}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>
    </div>
  );
}
