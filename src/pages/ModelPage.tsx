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
import { CHART_COLORS } from '@/constants/chartColors';
import { usePipelineResults } from '@/hooks/usePipelineResults';
import { AlertTriangle } from 'lucide-react';

// Slug → possible backend model names
const SLUG_TO_NAMES: Record<string, string[]> = {
  'logistic': ['Logistic Regression', 'Logistic'],
  'decision-tree': ['Decision Tree', 'DecisionTree'],
  'random-forest': ['Random Forest', 'RandomForest'],
  'xgboost': ['XGBoost', 'XGBoost (Calibrated)', 'xgboost'],
  'lightgbm': ['LightGBM', 'lightgbm'],
  'catboost': ['CatBoost', 'catboost'],
  'stacking': ['Stacked Model', 'Stacking Model', 'Stacking', 'StackedModel'],
};

function findModelBySlug(models: any[], slug: string) {
  const candidates = SLUG_TO_NAMES[slug] ?? [];
  // Try exact match on candidate names
  for (const name of candidates) {
    const found = models.find((m) => m.name === name);
    if (found) return found;
  }
  // Try case-insensitive match
  for (const name of candidates) {
    const found = models.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  // Fallback: try slug-based conversion (old logic)
  return models.find(
    (m) => m.name.toLowerCase().replace(/[^a-z]+/g, '-') === slug
  );
}

export default function ModelPage() {
  const { modelId } = useParams();
  const { currency } = usePipelineStore();
  const { results, noData, isRunning } = usePipelineResults();

  if (noData) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Run the pipeline first to see model details
    </div>
  );
  if (isRunning) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Pipeline running...
    </div>
  );
  if (!results?.models) return null;

  const model = findModelBySlug(results.models, modelId ?? '');

  if (!model) {
    // Friendly message for models not in this pipeline run
    const slugLabel = Object.entries(SLUG_TO_NAMES).find(([k]) => k === modelId)?.[1]?.[0] ?? modelId;
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-3">
        <AlertTriangle className="w-8 h-8 text-warning" />
        <p className="text-sm font-medium">{slugLabel}</p>
        <p className="text-xs">This model was not included in the current pipeline run.</p>
        <p className="text-xs">Available models: {results.models.map(m => m.name).join(', ')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold text-foreground">{model.name}</h2>
        <StatusBadge status={model.status} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Accuracy" value={(model.accuracy * 100).toFixed(2) + '%'} />
        <MetricCard title="ROC-AUC" value={model.roc_auc.toFixed(4)} />
        <MetricCard title="PR-AUC" value={model.pr_auc?.toFixed(4) ?? 'N/A'} />
        <MetricCard
          title="Cost"
          value={model.cost != null ? `${currency}${model.cost.toLocaleString()}` : 'N/A'}
        />
      </div>

      {/* Confusion Matrix */}
      {model.confusion_matrix && (
        <ChartCard title="Confusion Matrix">
          <ConfusionMatrix matrix={model.confusion_matrix} />
        </ChartCard>
      )}

      {/* Cross Validation */}
      {model.cv_scores && model.cv_scores.length > 0 && (
        <ChartCard
          title="Cross Validation"
          subtitle={`Mean: ${model.cv_mean?.toFixed(4) ?? '—'} ± ${model.cv_std?.toFixed(4) ?? '—'}`}
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={model.cv_scores.map((v: number, i: number) => ({
                fold: `Fold ${i + 1}`,
                score: v,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="fold" />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip formatter={(v: number) => v.toFixed(4)} />
              <Bar dataKey="score" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

    </div>
  );
}
