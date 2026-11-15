import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartCard } from '@/components/DashboardCards';
import { Button } from '@/components/ui/button';
import { Copy, Loader2 } from 'lucide-react';
import { getHealth, getMetrics } from '@/services/api';

/** Code that really loads the deployed artifact: a pickled dict, not a bare sklearn model. */
function inferenceCode(threshold: number | null): string {
  const thresholdNote = threshold != null ? `  # ${threshold} for the deployed model` : '';
  return `import pickle
import pandas as pd

# models/churn_model.pkl is a dict written by backend/churn_intel/artifacts.py:
#   {"pipeline": <sklearn Pipeline: raw customer row in, probability out>,
#    "threshold": <float>, "metadata": {...}}
# Loading it needs backend/ on sys.path (the pipeline references churn_intel.features).
with open("models/churn_model.pkl", "rb") as f:
    artifact = pickle.load(f)

pipeline = artifact["pipeline"]
threshold = artifact["threshold"]${thresholdNote}


def predict_churn(customer: dict) -> dict:
    """Score one customer given the raw Telco columns (see backend/churn_intel/schemas.py)."""
    df = pd.DataFrame([customer])
    probability = float(pipeline.predict_proba(df)[:, 1][0])
    return {
        "probability": round(probability, 4),
        "prediction": int(probability >= threshold),
        "threshold": threshold,
    }`;
}

/** Everything on this page comes from the running backend (/health and /metrics). */
export default function ModelSaving() {
  const [copied, setCopied] = useState(false);
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false });
  const metrics = useQuery({ queryKey: ['metrics'], queryFn: getMetrics, retry: false });

  const threshold = metrics.data?.best_threshold ?? null;
  const code = inferenceCode(threshold);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // clipboard blocked: the text stays selectable in the box below
    }
  };

  const h = health.data;
  const rows: [string, string][] = h
    ? [
        ['File', 'models/churn_model.pkl'],
        ['Model', h.model_name ?? 'unknown'],
        ['Decision threshold', threshold != null ? String(threshold) : 'unknown (no pipeline results yet)'],
        ['Features', String(h.feature_count)],
        ['scikit-learn version it was saved with', h.sklearn_version],
        ['Trained at', h.artifact_trained_at ?? 'unknown'],
        ['Trained from git commit', h.artifact_git_commit ?? 'unknown'],
      ]
    : [];

  return (
    <div className="space-y-6">
      <ChartCard title="Deployed model artifact" subtitle="Reported live by GET /health and /metrics">
        {health.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Asking the backend&hellip;
          </div>
        ) : health.isError || !h ? (
          <p className="text-sm text-muted-foreground">
            Backend not available, so the artifact details cannot be shown. Start the API and reload.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} className="border-b border-border/50">
                  <td className="py-2.5 text-muted-foreground">{label}</td>
                  <td className="py-2.5 text-foreground font-medium break-all">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>

      <ChartCard
        title="Inference function"
        action={
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="w-3 h-3 mr-1" /> {copied ? 'Copied!' : 'Copy'}
          </Button>
        }
      >
        <pre className="bg-secondary rounded-lg p-4 overflow-x-auto text-xs font-mono text-foreground leading-relaxed">
          {code}
        </pre>
      </ChartCard>
    </div>
  );
}
