import { useParams } from 'react-router-dom';
import {
  MetricCard,
  ChartCard,
  ConfusionMatrix,
  StatusBadge
} from '@/components/DashboardCards';
import { usePipelineStore } from '@/stores/pipelineStore';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';

import { usePipelineResults } from '@/hooks/usePipelineResults';

export default function ModelPage() {
  const { modelId } = useParams();
  const { currency } = usePipelineStore();
  const { results, noData, isRunning } = usePipelineResults();

  // ✅ Guards (VERY IMPORTANT)
  if (noData) return <div>No data yet</div>;
  if (isRunning) return <div>Pipeline running...</div>;
  if (!results) return null;

  // Find model using slug
  const model = results.models.find(
    (m) =>
      m.name.toLowerCase().replace(/[^a-z]+/g, '-') === modelId
  );

  if (!model) return <div>Model not found</div>;

  return (
    <div className="space-y-6">

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Accuracy" value={model.accuracy.toFixed(4)} />
        <MetricCard title="ROC-AUC" value={model.roc_auc.toFixed(4)} />
        <MetricCard title="PR-AUC" value={model.pr_auc?.toFixed(4) ?? 'N/A'} />
        <MetricCard
          title="Cost"
          value={model.cost ? `${currency}${model.cost}` : 'N/A'}
        />
      </div>

      {/* Confusion Matrix */}
      <ChartCard title="Confusion Matrix">
        <ConfusionMatrix matrix={model.confusion_matrix} />
      </ChartCard>

      {/* Cross Validation */}
      <ChartCard title="Cross Validation">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={model.cv_scores.map((v, i) => ({
              fold: `Fold ${i + 1}`,
              score: v,
            }))}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fold" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="score" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

    </div>
  );
}