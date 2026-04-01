import { ChartCard } from '@/components/DashboardCards';
import { Button } from '@/components/ui/button';
import { Download, Copy } from 'lucide-react';
import { useState } from 'react';

const inferenceCode = `import joblib
import pandas as pd

# Load model
pipeline = joblib.load('models/churn_model.pkl')
threshold = 0.13

def predict_churn(customer_data: dict) -> dict:
    """Predict churn probability for a single customer."""
    df = pd.DataFrame([customer_data])
    probability = pipeline.predict_proba(df)[:, 1][0]
    prediction = int(probability >= threshold)
    return {
        "probability": round(probability, 4),
        "prediction": "CHURN" if prediction else "RETAINED",
        "threshold": threshold
    }

# Example usage
result = predict_churn({
    "gender": "Male",
    "SeniorCitizen": 0,
    "Partner": "No",
    "Dependents": "No",
    "tenure": 2,
    "PhoneService": "Yes",
    "InternetService": "Fiber optic",
    "Contract": "Month-to-month",
    "MonthlyCharges": 70.70,
    "TotalCharges": 151.65,
    # ... all other features
})`;

const artifactTree = [
  { name: 'churn_model.pkl', type: 'file', indent: 0 },
  { name: 'model: Pipeline', type: 'detail', indent: 1 },
  { name: 'StandardScaler', type: 'detail', indent: 2 },
  { name: 'LogisticRegression (C=0.847)', type: 'detail', indent: 2 },
  { name: 'threshold: 0.13', type: 'detail', indent: 1 },
  { name: 'sklearn_version: 1.3.2', type: 'detail', indent: 1 },
  { name: 'scaler.pkl', type: 'file', indent: 0 },
];

export default function ModelSaving() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(inferenceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Artifact viewer */}
      <ChartCard title="Model Artifacts" subtitle="models/churn_model.pkl">
        <div className="space-y-1">
          {artifactTree.map((item, i) => (
            <div key={i} className="flex items-center gap-2" style={{ paddingLeft: item.indent * 20 }}>
              <span className={`text-sm ${item.type === 'file' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {item.type === 'file' ? '📦' : '├─'} {item.name}
              </span>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Inference code */}
      <ChartCard
        title="Inference Function"
        action={
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="w-3 h-3 mr-1" /> {copied ? 'Copied!' : 'Copy'}
          </Button>
        }
      >
        <pre className="bg-secondary rounded-lg p-4 overflow-x-auto text-xs font-mono text-foreground leading-relaxed">
          {inferenceCode}
        </pre>
      </ChartCard>

      {/* Download buttons */}
      <div className="flex flex-wrap gap-3">
        <Button variant="default" className="gap-2">
          <Download className="w-4 h-4" /> Download Model (.pkl)
        </Button>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" /> Download Requirements.txt
        </Button>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" /> Export Results CSV
        </Button>
      </div>
    </div>
  );
}
