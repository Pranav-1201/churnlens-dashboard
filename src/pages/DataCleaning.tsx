import { ChartCard } from '@/components/DashboardCards';
import { CheckCircle } from 'lucide-react';

const steps = [
  {
    title: "TotalCharges Conversion",
    before: "object dtype, 11 blank values",
    after: "float64, 0 missing values",
    detail: "Converted TotalCharges from string to numeric. 11 blank strings found and handled.",
    rows: [{ id: 488, tenure: 0, total: "" }, { id: 753, tenure: 0, total: "" }, { id: 936, tenure: 0, total: "" }],
  },
  {
    title: "Missing Value Imputation",
    before: "11 missing TotalCharges",
    after: "0 missing values",
    detail: "tenure = 0 → TotalCharges = 0 (11 rows affected). New customers with no tenure have zero charges.",
  },
  {
    title: "Target Encoding",
    before: 'Churn: "Yes" / "No" (string)',
    after: "Churn: 1 / 0 (integer)",
    detail: "Yes → 1, No → 0. Class counts: 5,174 (No) / 1,869 (Yes)",
  },
  {
    title: "CustomerID Removal",
    before: "21 columns",
    after: "20 columns",
    detail: "Dropped CustomerID — unique identifier with no predictive value.",
  },
];

export default function DataCleaning() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="glass-card p-5 border-l-2 border-l-primary">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-destructive/5 rounded-lg p-3">
                    <span className="text-xs text-destructive font-medium">Before</span>
                    <p className="text-sm text-foreground mt-1">{step.before}</p>
                  </div>
                  <div className="bg-success/5 rounded-lg p-3">
                    <span className="text-xs text-success font-medium">After</span>
                    <p className="text-sm text-foreground mt-1">{step.after}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
                {step.rows && (
                  <div className="overflow-x-auto">
                    <table className="text-xs">
                      <thead><tr className="border-b border-border">
                        <th className="py-1 pr-4 text-muted-foreground">Row</th>
                        <th className="py-1 pr-4 text-muted-foreground">tenure</th>
                        <th className="py-1 text-muted-foreground">TotalCharges</th>
                      </tr></thead>
                      <tbody>
                        {step.rows.map(r => (
                          <tr key={r.id} className="border-b border-border/30">
                            <td className="py-1 pr-4 text-foreground">{r.id}</td>
                            <td className="py-1 pr-4 text-foreground">{r.tenure}</td>
                            <td className="py-1 text-muted-foreground italic">(blank)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card p-5 border-l-2 border-l-success">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-success" />
          <span className="font-semibold text-foreground">Dataset ready: 7,043 rows × 20 columns, 0 missing values</span>
        </div>
      </div>
    </div>
  );
}
