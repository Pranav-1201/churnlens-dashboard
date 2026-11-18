/**
 * pipelineStore.ts — FINAL FIXED VERSION
 */

import { create } from "zustand";
// The committed results of the run that matches the deployed model. Vite emits it as a
// hashed static asset, so every page can load from the CDN with no backend running (and
// the API may be asleep on a free tier). One source of truth: the file the API also loads.
import snapshotUrl from "../../models/results_snapshot.json?url";
import {
  startPipeline,
  startPipelineDemo,
  getPipelineStatus,
  getPipelineResults,
  setBaseUrl,
  type JobStatus,
  type PipelineResults,
} from "../services/api";

// ============================================
// TYPES
// ============================================

export type PipelinePhase =
  | "idle"
  | "uploading"
  | "running"
  | "complete"
  | "failed";

export interface PipelineState {
  phase: PipelinePhase;
  jobId: string | null;
  progress: number;
  currentStep: string;
  logs: JobStatus["logs"];
  error: string | null;
  results: PipelineResults | null;
  /** Where `results` came from: the committed snapshot, or a run started in this session. */
  resultsSource: "snapshot" | "run" | null;
  /** Set when the snapshot could not be loaded, so the UI can say why it is empty. */
  snapshotError: string | null;

  fileName: string | null;
  rowCount: number;
  colCount: number;
  selectedModel: string;
  currentThreshold: number;
  fnCost: number;
  fpCost: number;
  currency: string;
  isDark: boolean;
  apiBaseUrl: string;
  businessMode: boolean;
  backendConnected: boolean;

  runWithFile: (file: File) => Promise<void>;
  runDemo: () => Promise<void>;
  /** Load the committed results so pages render without running the pipeline. */
  loadSnapshot: () => Promise<void>;
  reset: () => void;

  setSelectedModel: (m: string) => void;
  setThreshold: (t: number) => void;
  setCosts: (fn: number, fp: number) => void;

  toggleTheme: () => void;
  toggleBusinessMode: () => void;
  setBackendConnected: (v: boolean) => void;

  setApiBaseUrl: (url: string) => void;
  setCurrency: (c: string) => void;
}

// ============================================
// THEME INIT
// ============================================

const savedDark =
  typeof window !== "undefined"
    ? localStorage.getItem("churnlens-dark")
    : null;

const initialDark = savedDark !== null ? savedDark === "true" : true;

// ============================================
// POLLING INTERVAL
// ============================================

const POLL_INTERVAL = 2000;

// ============================================
// RESULTS HELPERS
// ============================================

/** Mirror where the results came from onto <html data-results>, so tests and debugging
 *  can see that results arrived without reaching into the store. */
function markResults(source: "snapshot" | "run" | null) {
  if (typeof document === "undefined") return;
  if (source) document.documentElement.dataset.results = source;
  else delete document.documentElement.dataset.results;
}

/** Store fields that must follow the results, whether they came from a run or the snapshot.
 *  Without this the selected model, threshold and costs would stay at their defaults. */
function fieldsFromResults(results: PipelineResults) {
  return {
    results,
    rowCount: results.dataset_info?.total_rows || 0,
    colCount: results.dataset_info?.n_features || 0,
    selectedModel: results.best_model || "Logistic Regression",
    currentThreshold: results.best_threshold || 0.13,
    fnCost: results.cost_fn || 10000,
    fpCost: results.cost_fp || 500,
  };
}

// ============================================
// STORE
// ============================================

export const usePipelineStore = create<PipelineState>((set, get) => ({
  phase: "idle",
  jobId: null,
  progress: 0,
  currentStep: "",
  logs: [],
  error: null,
  results: null,
  resultsSource: null,
  snapshotError: null,

  fileName: null,
  rowCount: 0,
  colCount: 0,
  selectedModel: "Logistic Regression",
  currentThreshold: 0.13,
  fnCost: 10000,
  fpCost: 500,
  currency: "₹",
  isDark: initialDark,
  apiBaseUrl: "http://localhost:8000",
  businessMode: false,
  backendConnected: false,

  loadSnapshot: async () => {
    // A run started by the visitor (or already finished) outranks the committed snapshot.
    const { phase, resultsSource } = get();
    if (resultsSource === "run" || phase === "uploading" || phase === "running") return;

    try {
      const res = await fetch(snapshotUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const results = (await res.json()) as PipelineResults;

      // The visitor may have started a run while the file was downloading.
      const now = get();
      if (now.resultsSource === "run" || now.phase === "uploading" || now.phase === "running") return;

      markResults("snapshot");
      set({
        phase: "complete",
        resultsSource: "snapshot",
        snapshotError: null,
        currentStep: "Complete",
        ...fieldsFromResults(results),
      });
    } catch (e) {
      set({ snapshotError: `Could not load the saved results: ${String(e)}` });
    }
  },

  reset: () => {
    markResults(null);
    set({
      phase: "idle",
      jobId: null,
      progress: 0,
      currentStep: "",
      logs: [],
      error: null,
      results: null,
      resultsSource: null,
    });
  },

  runWithFile: async (file: File) => {
    markResults(null);
    set({
      phase: "uploading",
      error: null,
      results: null,
      resultsSource: null,
      progress: 0,
      fileName: file.name,
    });

    try {
      const { job_id } = await startPipeline(file);

      set({
        jobId: job_id,
        phase: "running",
        currentStep: "Queued",
      });

      _startPolling(job_id, set, get);
    } catch (e) {
      set({ phase: "failed", error: String(e) });
    }
  },

  runDemo: async () => {
    markResults(null);
    set({
      phase: "uploading",
      error: null,
      results: null,
      resultsSource: null,
      progress: 0,
    });

    try {
      const { job_id } = await startPipelineDemo();

      set({
        jobId: job_id,
        phase: "running",
        currentStep: "Queued",
      });

      _startPolling(job_id, set, get);
    } catch (e) {
      set({ phase: "failed", error: String(e) });
    }
  },

  setSelectedModel: (m) => set({ selectedModel: m }),

  setThreshold: (t) => set({ currentThreshold: t }),

  setCosts: (fn, fp) => set({ fnCost: fn, fpCost: fp }),

  toggleTheme: () =>
    set((s) => {
      const next = !s.isDark;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("churnlens-dark", String(next));
      return { isDark: next };
    }),

  toggleBusinessMode: () =>
    set((s) => ({ businessMode: !s.businessMode })),

  setBackendConnected: (v) => set({ backendConnected: v }),

  // ✅ Now also updates the axios instance
  setApiBaseUrl: (url) => {
    setBaseUrl(url);
    set({ apiBaseUrl: url });
  },

  setCurrency: (c) => set({ currency: c }),
}));

// Dev-only: expose the store for debugging and manual QA in the browser console.
// Gated by import.meta.env.DEV so it is stripped from production builds.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __pipelineStore?: typeof usePipelineStore }).__pipelineStore =
    usePipelineStore;
}

// ============================================
// POLLING LOGIC
// ============================================

function _startPolling(
  jobId: string,
  set: (partial: Partial<PipelineState>) => void,
  get: () => PipelineState
) {
  const timer = setInterval(async () => {
    if (get().jobId !== jobId) {
      clearInterval(timer);
      return;
    }

    try {
      const status = await getPipelineStatus(jobId);

      set({
        progress: status.progress,
        currentStep: status.current_step,
        logs: status.logs,
      });

      if (status.status === "complete") {
        clearInterval(timer);

        set({
          progress: 100,
          currentStep: "Fetching results...",
        });

        const results = await getPipelineResults(jobId);

        // Sync the selected model, threshold and costs with the actual results; they
        // would otherwise stay at the hardcoded defaults (Logistic Regression / 0.13).
        markResults("run");
        set({
          phase: "complete",
          resultsSource: "run",
          currentStep: "Complete",
          ...fieldsFromResults(results),
        });
      }

      if (status.status === "failed") {
        clearInterval(timer);
        set({
          phase: "failed",
          error: status.error ?? "Pipeline failed",
        });
      }
    } catch (e) {
      console.warn("Polling error:", e);
    }
  }, POLL_INTERVAL);
}
