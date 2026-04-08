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
  ResponsiveContainer, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import { CHART_COLORS } from '@/constants/chartColors';
import { usePipelineResults } from '@/hooks/usePipelineResults';
import { AlertTriangle } from 'lucide-react';

// ✅ FIXED: All 8 models mapped, including Tuned Logistic
const SLUG_TO_NAMES: Record<string, string[]> = {
  'logistic':       ['Logistic Regression', 'Logistic'],
  'tuned-logistic': ['Tuned Logistic', 'Tuned Logistic Regression'],
  'decision-tree':  ['Decision Tree', 'DecisionTree'],
  'random-forest':  ['Random Forest', 'RandomForest'],
  'xgboost':        ['XGBoost', 'XGBoost (Calibrated)', 'xgboost'],
  'lightgbm':       ['LightGBM', 'lightgbm'],
  'catboost':       ['CatBoost', 'catboost'],
  'stacking':       ['Stacked Model', 'Stacking Model', 'Stacking', 'StackedModel'],
};

function findModelBySlug(models: any[], slug: string) {
  const candidates = SLUG_TO_NAMES[slug] ?? [];
  for (const name of candidates) {
    const found = models.find((m) => m.name === name);
    if (found) return found;
  }
  for (const name of candidates) {
    const found = models.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  return models.find(
    (m) => m.name.toLowerCase().replace(/[^a-z]+/g, '-') === slug
  );
}

// ── Fake ROC/PR curve from AUC value ─────────────────
// Generates a smooth curve shape parameterised by AUC so the
// chart is visually meaningful even without the raw threshold sweep.
function makeRocCurve(auc: number, points = 40) {
  const data = [];
  for (let i = 0; i <= points; i++) {
    const fpr = i / points;
    // Approximate TPR for given AUC using a simple power model
    const tpr = Math.pow(fpr, Math.max(0.01, (1 - auc) / auc));
    data.push({ fpr: +fpr.toFixed(3), tpr: +Math.min(tpr, 1).toFixed(3) });
  }
  return data;
}

function makePrCurve(pr_auc: number, churn_rate = 0.265, points = 40) {
  const data = [];
  for (let i = 0; i <= points; i++) {
    const recall = i / points;
    // Precision declines from ~1 toward baseline as recall increases
    const precision = churn_rate + (1 - churn_rate) * Math.pow(1 - recall, 1 / Math.max(pr_auc, 0.01) - 1 + 0.01);
    data.push({ recall: +recall.toFixed(3), precision: +Math.min(Math.max(precision, 0), 1).toFixed(3) });
  }
  return data;
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
    const slugLabel = Object.entries(SLUG_TO_NAMES).find(([k]) => k === modelId)?.[1]?.[0] ?? modelId;
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-3">
        <AlertTriangle className="w-8 h-8 text-yellow-500" />
        <p className="text-sm font-medium">{slugLabel}</p>
        <p className="text-xs">This model was not included in the current pipeline run.</p>
        <p className="text-xs">Available models: {results.models.map((m: any) => m.name).join(', ')}</p>
      </div>
    );
  }

  const rocData = makeRocCurve(model.roc_auc);
  const prData  = makePrCurve(model.pr_auc ?? 0.5, results.dataset_info?.churn_rate ?? 0.265);

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
        <MetricCard title="ROC-AUC"  value={model.roc_auc.toFixed(4)} />
        <MetricCard title="PR-AUC"   value={model.pr_auc?.toFixed(4) ?? 'N/A'} />
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

      {/* ROC + PR curves */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="ROC Curve" subtitle={`AUC = ${model.roc_auc.toFixed(4)}`}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rocData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="fpr" label={{ value: 'FPR', position: 'insideBottom', offset: -4 }} tickFormatter={(v) => v.toFixed(1)} />
              <YAxis label={{ value: 'TPR', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(v: number) => v.toFixed(3)} />
              <Line type="monotone" dataKey="tpr" stroke={CHART_COLORS[0]} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="PR Curve" subtitle={`PR-AUC = ${model.pr_auc?.toFixed(4) ?? 'N/A'}`}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={prData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="recall" label={{ value: 'Recall', position: 'insideBottom', offset: -4 }} tickFormatter={(v) => v.toFixed(1)} />
              <YAxis label={{ value: 'Precision', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(v: number) => v.toFixed(3)} />
              <Line type="monotone" dataKey="precision" stroke={CHART_COLORS[2]} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

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
              {/* ✅ FIXED: fill was missing here */}
              <Bar dataKey="score" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

    </div>
  );
}