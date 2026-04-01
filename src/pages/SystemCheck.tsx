import { MetricCard, ChartCard } from '@/components/DashboardCards';
import { Cpu, CheckCircle, AlertTriangle } from 'lucide-react';

export default function SystemCheck() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="metric-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10"><AlertTriangle className="w-5 h-5 text-warning" /></div>
            <div>
              <p className="text-sm font-medium text-foreground">PyTorch GPU</p>
              <span className="status-warning">Not Available</span>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Cpu className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-sm font-medium text-foreground">Device</p>
              <span className="text-foreground font-medium">CPU</span>
            </div>
          </div>
        </div>
      </div>

      <ChartCard title="Environment Specifications">
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Python", "3.10.12", "success"],
              ["PyTorch", "2.1.0", "success"],
              ["scikit-learn", "1.3.2", "success"],
              ["XGBoost", "2.0.2", "success"],
              ["LightGBM", "4.1.0", "success"],
              ["CatBoost", "1.2.2", "success"],
              ["CUDA", "Not Available", "warning"],
              ["NumPy", "1.26.2", "success"],
              ["Pandas", "2.1.3", "success"],
              ["SHAP", "0.43.0", "success"],
            ].map(([label, value, status]) => (
              <tr key={label} className="border-b border-border/50">
                <td className="py-2.5 text-muted-foreground">{label}</td>
                <td className="py-2.5 text-foreground font-medium">{value}</td>
                <td className="py-2.5 text-right">
                  <span className={status === 'success' ? 'status-success' : 'status-warning'}>
                    {status === 'success' ? '✓ OK' : '⚠ Warning'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </div>
  );
}
