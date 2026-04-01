/**
 * EDA.tsx — FIXED
 */

import { useState, useMemo } from "react";
import { ChartCard } from "@/components/DashboardCards";
import { usePipelineResults } from "@/hooks/usePipelineResults";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { CHART_COLORS } from "@/constants/chartColors";

const tabs = [
  "Target Distribution",
  "Churn by Contract",
  "Dataset Stats",
];

function NoData() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline to compute EDA
    </div>
  );
}

export default function EDA() {
  const [activeTab, setActiveTab] = useState(0);
  const { results, noData, isRunning } = usePipelineResults();

  const eda = results?.eda;

  const churnDist = useMemo(() => {
    if (!eda) return [];
    return [
      { name: "No Churn", value: eda.retain_count, color: CHART_COLORS[0] },
      { name: "Churn", value: eda.churn_count, color: CHART_COLORS[3] },
    ];
  }, [eda]);

  if (noData) return <NoData />;
  if (isRunning) return <div className="text-muted-foreground p-4">Pipeline is running…</div>;
  if (!eda) return <NoData />;

  const churnPct = ((eda.churn_count / eda.total_customers) * 100).toFixed(1);

  return (
    <div className="space-y-6">

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm ${
              activeTab === i
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Target Distribution */}
      {activeTab === 0 && (
        <ChartCard
          title="Target Distribution"
          subtitle={`Churn rate: ${churnPct}%`}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={churnDist} dataKey="value">
                {churnDist.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Churn by Contract */}
      {activeTab === 1 && (
        <ChartCard title="Churn Rate by Contract">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={eda.by_contract.map((d) => ({
                ...d,
                churn_pct: d.churn_rate * 100,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Contract" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Bar dataKey="churn_pct">
                {(() => {
                  const COLORS = Object.values(CHART_COLORS);
                  return eda.by_contract.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ));
                })()}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Dataset Stats */}
      {activeTab === 2 && (
        <ChartCard title="Dataset Stats">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>Total Customers: {eda.total_customers}</div>
            <div>Churn Count: {eda.churn_count}</div>
            <div>Retained: {eda.retain_count}</div>
            <div>Churn Rate: {churnPct}%</div>
          </div>
        </ChartCard>
      )}

    </div>
  );
}