import { MetricCard, ChartCard } from '@/components/DashboardCards';
import { CheckCircle } from 'lucide-react';

export default function TrainTestSplit() {
  return (
    <div className="space-y-6">
      {/* Visual split bar */}
      <ChartCard title="Data Split" subtitle="80/20 stratified split">
        <div className="space-y-3">
          <div className="flex rounded-lg overflow-hidden h-12">
            <div className="bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium" style={{ width: '80%' }}>
              Training: 5,634 rows (80%)
            </div>
            <div className="bg-muted flex items-center justify-center text-muted-foreground text-sm font-medium" style={{ width: '20%' }}>
              Test: 1,409 (20%)
            </div>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <CheckCircle className="w-4 h-4 text-success" />
            <span className="text-sm text-success font-medium">Stratification confirmed — both sets maintain 26.5% churn rate</span>
          </div>
        </div>
      </ChartCard>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Train Positive" value="1,495" tint="destructive" subtitle="Churned" />
        <MetricCard title="Train Negative" value="4,139" tint="success" subtitle="Retained" />
        <MetricCard title="Test Positive" value="374" tint="destructive" subtitle="Churned" />
        <MetricCard title="Test Negative" value="1,035" tint="success" subtitle="Retained" />
      </div>

      <ChartCard title="Scaling & Additional Splits">
        <div className="space-y-3">
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-foreground mb-1">StandardScaler</h4>
            <p className="text-sm text-muted-foreground">Applied to training data, transform applied to test. Ensures zero mean and unit variance.</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-foreground mb-1">ANN Split</h4>
            <p className="text-sm text-muted-foreground">Training: 4,507 samples · Validation: 1,127 samples (80/20 from training set)</p>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
