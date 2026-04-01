import { ChartCard } from '@/components/DashboardCards';

const oheColumns = [
  'gender_Male', 'Partner_Yes', 'Dependents_Yes', 'PhoneService_Yes',
  'MultipleLines_No phone service', 'MultipleLines_Yes',
  'InternetService_Fiber optic', 'InternetService_No',
  'OnlineSecurity_No internet service', 'OnlineSecurity_Yes',
  'OnlineBackup_No internet service', 'OnlineBackup_Yes',
  'DeviceProtection_No internet service', 'DeviceProtection_Yes',
  'TechSupport_No internet service', 'TechSupport_Yes',
  'StreamingTV_No internet service', 'StreamingTV_Yes',
  'StreamingMovies_No internet service', 'StreamingMovies_Yes',
  'Contract_One year', 'Contract_Two year',
  'PaperlessBilling_Yes',
  'PaymentMethod_Credit card (automatic)', 'PaymentMethod_Electronic check', 'PaymentMethod_Mailed check',
];

const catboostCols = [
  'gender', 'Partner', 'Dependents', 'PhoneService', 'MultipleLines',
  'InternetService', 'OnlineSecurity', 'OnlineBackup', 'DeviceProtection',
  'TechSupport', 'StreamingTV', 'StreamingMovies', 'Contract',
  'PaperlessBilling', 'PaymentMethod', 'TenureGroup',
];

const expansionExamples = [
  { original: 'Contract', expanded: ['Contract_One year', 'Contract_Two year'] },
  { original: 'InternetService', expanded: ['InternetService_Fiber optic', 'InternetService_No'] },
  { original: 'PaymentMethod', expanded: ['PaymentMethod_Credit card', 'PaymentMethod_Electronic check', 'PaymentMethod_Mailed check'] },
];

export default function Encoding() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title="One-Hot Encoding" subtitle="20 raw → 41 encoded columns">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Example Expansions</h4>
            {expansionExamples.map(ex => (
              <div key={ex.original} className="bg-muted/50 rounded-lg p-3">
                <span className="text-sm font-medium text-primary">{ex.original}</span>
                <span className="text-muted-foreground mx-2">→</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ex.expanded.map(e => (
                    <span key={e} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{e}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            <h4 className="text-sm font-medium text-foreground mb-2">All OHE Columns ({oheColumns.length})</h4>
            {oheColumns.map(c => (
              <div key={c} className="text-xs text-muted-foreground py-0.5 px-2 bg-muted/30 rounded">{c}</div>
            ))}
          </div>
        </div>
      </ChartCard>

      <ChartCard title="CatBoost Raw Features" subtitle="16 categorical columns kept as-is">
        <div className="space-y-4">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="text-sm text-foreground">
              CatBoost handles categorical features natively using ordered target encoding with permutation-driven techniques, avoiding the need for explicit one-hot encoding.
            </p>
          </div>
          <div className="space-y-1">
            {catboostCols.map(c => (
              <div key={c} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-muted/30">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-foreground">{c}</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
