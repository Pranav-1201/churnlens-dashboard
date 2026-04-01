/**
 * ShapSingle.tsx — FINAL FIXED VERSION
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { ChartCard } from "@/components/DashboardCards";

// ✅ FIX: use mockData (since ModelMetric file doesn't exist)
import { SAMPLE_CUSTOMERS } from "@/data/mockData";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { predictChurn } from "@/services/api";
import { usePipelineStore } from "@/stores/pipelineStore";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Shield } from "lucide-react";
import type { CustomerInput, PredictionResult } from "@/services/api";
import { FEATURE_OPTIONS } from "@/types/api";

// ✅ correct colors source
import { CHART_COLORS } from "@/constants/chartColors";

export default function ShapSingle() {
  const { currentThreshold } = usePipelineStore();

  const [features, setFeatures] = useState<CustomerInput>(
    SAMPLE_CUSTOMERS[1] as unknown as CustomerInput
  );

  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const runPrediction = useCallback(async (f: CustomerInput) => {
    setLoading(true);
    try {
      const res = await predictChurn(f);
      setResult(res);
    } catch {
      toast.error("Prediction failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runPrediction(features);
  }, []); // eslint-disable-line

  const updateFeature = (key: keyof CustomerInput, value: string | number) => {
    const updated = { ...features, [key]: value };
    setFeatures(updated);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runPrediction(updated), 300);
  };

  const prob = result?.probability ?? 0;
  const isHighRisk = prob > currentThreshold;

  // Convert backend SHAP object → sorted array
  const shapValues = result?.shap_values
    ? Object.entries(result.shap_values)
        .map(([feature, contribution]) => ({ feature, contribution }))
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 15)
    : [];

  const riskFactors = shapValues.filter((s) => s.contribution > 0).slice(0, 3);
  const protectiveFactors = shapValues.filter((s) => s.contribution < 0).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Feature controls */}
        <ChartCard title="Customer Features">
          <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">

            <div>
              <span className="text-sm text-muted-foreground">
                Tenure: <strong>{features.tenure}</strong> months
              </span>
              <Slider
                min={0} max={72} step={1}
                value={[features.tenure]}
                onValueChange={([v]) => updateFeature("tenure", v)}
              />
            </div>

            <div>
              <span className="text-sm text-muted-foreground">
                Monthly Charges: <strong>${features.MonthlyCharges}</strong>
              </span>
              <Slider
                min={18} max={120} step={0.5}
                value={[features.MonthlyCharges]}
                onValueChange={([v]) => updateFeature("MonthlyCharges", v)}
              />
            </div>

            {Object.entries(FEATURE_OPTIONS).map(([key, options]) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground block mb-1">{key}</label>
                <select
                  className="w-full text-sm bg-muted/50 border border-border rounded-md px-3 py-2 text-foreground"
                  value={features[key as keyof CustomerInput] as string}
                  onChange={(e) =>
                    updateFeature(key as keyof CustomerInput, e.target.value)
                  }
                >
                  {options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <Button onClick={() => runPrediction(features)} disabled={loading} className="w-full">
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Predicting…
                </span>
              ) : (
                "Predict"
              )}
            </Button>
          </div>
        </ChartCard>

        {/* Result */}
        <div className="space-y-4">

          <div className="glass-card p-6 text-center">
            <p className="text-xs text-muted-foreground uppercase mb-2">Churn Probability</p>

            <div className="text-5xl font-bold text-foreground">
              {loading ? (
                <Loader2 className="animate-spin mx-auto w-12 h-12" />
              ) : (
                `${(prob * 100).toFixed(1)}%`
              )}
            </div>

            <div className="mt-4 h-2 bg-muted rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isHighRisk ? "bg-destructive" : "bg-success"
                }`}
                style={{ width: `${prob * 100}%` }}
              />
            </div>

            <div className={`mt-3 text-xl font-bold ${isHighRisk ? "text-destructive" : "text-success"}`}>
              {isHighRisk ? (
                <span className="flex items-center justify-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> HIGH RISK
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Shield className="w-5 h-5" /> LOW RISK
                </span>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}