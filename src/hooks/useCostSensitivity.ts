/**
 * useCostSensitivity.ts — cost-ratio sensitivity sweep from the backend.
 *
 * Returns how the cost-optimal threshold and its cost shift as FN/FP varies.
 * The FP cost is taken from the Settings store; the backend sweeps the ratio and
 * recomputes the real cost curve at each point. No client-side synthesis; on a
 * backend failure it reports an error rather than inventing a curve.
 */

import { useEffect, useState } from "react";

import { getCostSensitivity, type CostSensitivityResponse } from "../services/api";
import { usePipelineStore } from "../stores/pipelineStore";

interface UseCostSensitivityReturn {
  data: CostSensitivityResponse | null;
  loading: boolean;
  error: string | null;
}

export function useCostSensitivity(): UseCostSensitivityReturn {
  const { results, phase, fpCost } = usePipelineStore();

  const [data, setData] = useState<CostSensitivityResponse | null>(null);
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

    getCostSensitivity(fpCost)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [results, phase, fpCost]);

  return { data, loading, error };
}
