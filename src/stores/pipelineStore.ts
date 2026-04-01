/**
 * pipelineStore.ts — FINAL FIXED VERSION
 */

import { create } from "zustand";
import {
  startPipeline,
  startPipelineDemo,
  getPipelineStatus,
  getPipelineResults,
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
  // 🔥 CORE PIPELINE STATE
  phase: PipelinePhase;
  jobId: string | null;
  progress: number;
  currentStep: string;
  logs: JobStatus["logs"];
  error: string | null;
  results: PipelineResults | null;

  // 🎯 UI STATE
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

  // ACTIONS
  runWithFile: (file: File) => Promise<void>;
  runDemo: () => Promise<void>;
  reset: () => void;

  setSelectedModel: (m: string) => void;
  setThreshold: (t: number) => void;
  setCosts: (fn: number, fp: number) => void;

  toggleTheme: () => void;
  toggleBusinessMode: () => void;
  setBackendConnected: (v: boolean) => void;

  // ✅ FIXED MISSING ACTIONS
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
// STORE
// ============================================

export const usePipelineStore = create<PipelineState>((set, get) => ({
  // 🔥 PIPELINE STATE
  phase: "idle",
  jobId: null,
  progress: 0,
  currentStep: "",
  logs: [],
  error: null,
  results: null,

  // 🎯 UI STATE
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

  // ============================================
  // CORE ACTIONS
  // ============================================

  reset: () =>
    set({
      phase: "idle",
      jobId: null,
      progress: 0,
      currentStep: "",
      logs: [],
      error: null,
      results: null,
    }),

  runWithFile: async (file: File) => {
    set({
      phase: "uploading",
      error: null,
      results: null,
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
    set({
      phase: "uploading",
      error: null,
      results: null,
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

  // ============================================
  // UI ACTIONS
  // ============================================

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

  // ✅ NEW FIXED FUNCTIONS
  setApiBaseUrl: (url) => set({ apiBaseUrl: url }),

  setCurrency: (c) => set({ currency: c }),
}));

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

        set({
          phase: "complete",
          results,
          currentStep: "Complete",
          rowCount: results.dataset_info?.total_rows || 0,
          colCount: results.dataset_info?.n_features || 0,
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