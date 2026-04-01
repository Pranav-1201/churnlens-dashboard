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

  if (noData) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline first to see the dashboard
    </div>
  );
  if (isRunning) return <div className="text-muted-foreground p-4">Pipeline running...</div>;
  if (!results) return null;

  const models = results?.models ?? [];
  const best = models.find((m) => m.status === 'Selected') ?? models[0];
  const eda = results?.eda;
  const topChurnDrivers = results?.shap_global?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">

      {/* KPIs — all from real pipeline results */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Customers"
          value={eda?.total_customers?.toLocaleString() ?? '—'}
          icon={<Users />}
        />

        <MetricCard
          title="Churn Rate"
          value={eda?.churn_rate != null ? `${(eda.churn_rate * 100).toFixed(1)}%` : '—'}
          icon={<TrendingDown />}
          tint="destructive"
          subtitle={eda?.churn_count != null ? `${eda.churn_count.toLocaleString()} churned` : undefined}
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
                <th className="text-left py-2 text-muted-foreground font-medium">Model</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Accuracy</th>
                <th className="text-left py-2 text-muted-foreground font-medium">ROC-AUC</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Cost</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...models].sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity)).map((m) => (
                <tr key={m.name} className={`border-b border-border/30 ${m.status === 'Selected' ? 'bg-warning/5' : ''}`}>
                  <td className="py-2 font-medium">{m.name}</td>
                  <td className="py-2">{(m.accuracy * 100).toFixed(2)}%</td>
                  <td className="py-2">{m.roc_auc.toFixed(4)}</td>
                  <td className="py-2">{m.cost ? `${currency}${m.cost.toLocaleString()}` : '—'}</td>
                  <td className="py-2"><StatusBadge status={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Actions */}
      <ChartCard title="Quick Actions">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/dashboard/shap-single')}>Predict</Button>
          <Button variant="outline" onClick={() => navigate('/dashboard/shap-global')}>SHAP</Button>
          <Button variant="outline" onClick={() => exportToCSV(
            models.map(m => ({
              Model: m.name,
              Accuracy: m.accuracy,
              'ROC-AUC': m.roc_auc,
              'PR-AUC': m.pr_auc ?? '',
              Cost: m.cost ?? '',
              Status: m.status,
            })),
            'churnlens-models'
          )}>
            <Download className="w-3.5 h-3.5 mr-1" /> CSV
          </Button>
          <Button variant="outline" onClick={() => exportReportAsPDF(results)}>
            <FileText className="w-3.5 h-3.5 mr-1" /> PDF Report
          </Button>
        </div>
      </ChartCard>

    </div>
  );
}
