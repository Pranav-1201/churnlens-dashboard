/**
 * useThresholdCurve.ts — the single source of cost-vs-threshold data.
 *
 * The curve ALWAYS comes from the backend, which computes exact confusion
 * matrices over the selected model's out-of-fold validation predictions.
 * The FN/FP costs from the Settings page are sent with the request, so changing
 * them genuinely recomputes the curve server-side.
 *
 * There is deliberately NO client-side fallback that synthesises a curve.
 * If the backend cannot be reached we surface an error — a wrong chart is worse
 * than no chart (see AUDIT.md §4.B).
 */

import { useEffect, useState } from "react";

import { getThresholdCurve, type ThresholdCurveResponse } from "../services/api";
import { usePipelineStore } from "../stores/pipelineStore";

interface UseThresholdCurveReturn {
  data: ThresholdCurveResponse | null;
  loading: boolean;
  error: string | null;
}

export function useThresholdCurve(): UseThresholdCurveReturn {
  const { results, phase, fnCost, fpCost } = usePipelineStore();

  const [data, setData] = useState<ThresholdCurveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "complete" || !results) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getThresholdCurve(fnCost, fpCost)
      .then((curve) => {
        if (!cancelled) setData(curve);
      })
      .catch((e) => {
        if (cancelled) return;
        // The pipeline run already shipped a real curve at the run's own costs.
        // Reuse it only when the requested costs match — otherwise report failure.
        const shipped = results.threshold_curve;
        if (shipped && shipped.cost_fn === fnCost && shipped.cost_fp === fpCost) {
          setData(shipped);
        } else {
          setError(
            `Could not reach the backend to recompute the cost curve (${String(e)}). ` +
              `Costs shown in Settings require a live backend.`
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [results, phase, fnCost, fpCost]);

  return { data, loading, error };
}
