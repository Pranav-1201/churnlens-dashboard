/**
 * DataOverview.tsx — FINAL FIXED VERSION
 */

import { MetricCard, ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";

// mock preview (only for table UI)
import { DATASET_PREVIEW } from "@/data/mockData";

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

// Static distributions
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

  // ✅ SAFE ACCESS
  const di = results?.eda;

  const preview = DATASET_PREVIEW ?? [];
  const cols = preview.length > 0 ? Object.keys(preview[0]) : [];

  return (
    <div className="space-y-6">

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Rows"
          value={di?.total_customers?.toLocaleString() ?? "7,043"}
          tint="primary"
          subtitle={di ? "From uploaded dataset" : "Demo dataset"}
        />

        <MetricCard
          title="Columns"
          value={cols.length || "21"}
          tint="success"
        />

        <MetricCard
          title="Features (encoded)"
          value="—"
          tint="warning"
          subtitle="After encoding"
        />

        <MetricCard
          title="Churn rate"
          value={
            di
              ? `${(di.churn_rate * 100).toFixed(1)}%`
              : "—"
          }
          tint="destructive"
        />
      </div>

      {/* Preview */}
      <ChartCard
        title="Dataset Preview"
        subtitle="First 5 rows (illustrative — same schema as your data)"
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
              {preview.map((row, i) => (
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