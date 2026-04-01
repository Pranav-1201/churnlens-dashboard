import {
  Users, TrendingDown, Award, DollarSign,
  AlertTriangle, Download, FileText, Eye
} from 'lucide-react';

import {
  MetricCard, ChartCard, StatusBadge
} from '@/components/DashboardCards';

import { usePipelineStore } from '@/stores/pipelineStore';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { exportToCSV, exportReportAsPDF } from '@/services/exportUtils';
import { usePipelineResults } from '@/hooks/usePipelineResults';

export default function DashboardHome() {
  const { currency, businessMode } = usePipelineStore();
  const navigate = useNavigate();
  const { results, noData, isRunning } = usePipelineResults();

  if (noData) return <div>No data yet</div>;
  if (isRunning) return <div>Pipeline running...</div>;
  if (!results) return null;

  const models = results.models;

  const best = models.find((m) => m.status === 'Selected');

  const topChurnDrivers = results.shap_global.slice(0, 5);

  return (
    <div className="space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Customers" value="7,043" icon={<Users />} />

        <MetricCard
          title="Churn Rate"
          value="26.5%"
          icon={<TrendingDown />}
          tint="destructive"
          subtitle="1,869 churned"
        />

        <MetricCard
          title={businessMode ? 'Model Performance' : 'Best Model AUC'}
          value={best?.roc_auc?.toFixed(3) ?? '—'}
          icon={<Award />}
          tint="primary"
          subtitle={best?.name}
        />

        <MetricCard
          title="Min Business Cost"
          value={best?.cost ? `${currency}${(best.cost / 1000).toFixed(0)}K` : '—'}
          icon={<DollarSign />}
          tint="success"
        />
      </div>

      {/* SHAP Drivers */}
      <ChartCard
        title="🔥 Top Churn Drivers"
        subtitle="SHAP-based features"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/shap-global')}>
            <Eye className="w-3.5 h-3.5 mr-1" /> View All
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {topChurnDrivers.map((s, i) => (
            <div key={s.feature} className="p-3 rounded-lg bg-destructive/5 border space-y-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs font-bold text-destructive">#{i + 1}</span>
              </div>

              <h4 className="text-xs font-semibold">{s.feature}</h4>

              <p className="text-[10px] text-muted-foreground">
                Importance: {s.importance.toFixed(3)}
              </p>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Leaderboard */}
      <ChartCard title="Model Leaderboard">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th>Model</th>
                <th>Accuracy</th>
                <th>ROC-AUC</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.name}>
                  <td>{m.name}</td>
                  <td>{m.accuracy.toFixed(4)}</td>
                  <td>{m.roc_auc.toFixed(4)}</td>
                  <td>{m.cost ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Actions */}
      <ChartCard title="Quick Actions">
        <div className="space-y-2">
          <Button onClick={() => navigate('/dashboard/shap-single')}>Predict</Button>
          <Button onClick={() => navigate('/dashboard/shap-global')}>SHAP</Button>
          <Button onClick={() => exportReportAsPDF()}>
            <FileText className="w-3.5 h-3.5 mr-1" /> Export
          </Button>
        </div>
      </ChartCard>

    </div>
  );
}