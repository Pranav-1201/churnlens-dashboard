/**
 * usePipelineResults.ts — FINAL CLEAN VERSION
 */

import { usePipelineStore } from "../stores/pipelineStore";
import type { PipelineResults } from "../services/api";

interface UsePipelineResultsReturn {
  results: PipelineResults | null;
  isReady: boolean;
  noData: boolean;
  isRunning: boolean;
}

export function usePipelineResults(): UsePipelineResultsReturn {
  const { phase, results } = usePipelineStore();

  return {
    results,
    isReady: phase === "complete" && results !== null,
    noData: phase === "idle",
    isRunning: phase === "running" || phase === "uploading",
  };
}