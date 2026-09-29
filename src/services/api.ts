/**
 * api.ts — FINAL MERGED VERSION
 * Combines:
 * - Claude async pipeline system ✅
 * - Your retry + fallback logic ✅
 * - Clean typing + full backend mapping ✅
 * - Reactive base URL ✅
 * - Graceful error handling ✅
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { CustomerShapRow, ModelMetric } from "@/types/api";

// ============================================
// BASE CONFIG (AXIOS + FETCH SUPPORT)
// ============================================

let BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000";

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

/** Update the base URL at runtime (called from Settings / pipelineStore) */
export function setBaseUrl(url: string) {
  BASE_URL = url;
  api.defaults.baseURL = url;
}

// Retry interceptor (from your original — KEEP)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as (NonNullable<AxiosError["config"]> & { _retryCount?: number }) | undefined;
    if (!config) return Promise.reject(error);

    config._retryCount = config._retryCount || 0;

    if (config._retryCount < 2 && !error.response) {
      config._retryCount++;
      await new Promise((r) => setTimeout(r, 800 * config._retryCount));
      return api(config);
    }

    return Promise.reject(error);
  }
);

// ============================================
// TYPES
// ============================================

export interface JobResponse {
  job_id: string;
  status: "queued" | "running" | "complete" | "failed";
}

export interface JobStatus {
  job_id: string;
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  current_step: string;
  logs: { time: number; step: string; progress: number }[];
  error: string | null;
  elapsed: number | null;
}



export interface MetricsResponse {
  models: ModelMetric[];
  best_model: string;
  best_threshold: number;
  cost_fn: number;
  cost_fp: number;
}

export interface ShapFeature {
  feature: string;
  importance: number;
}

export interface CustomerShap {
  index: number;
  customer: Record<string, unknown>;
  probability: number;
  prediction: number;
  risk_level: string;
  threshold_used: number;
  shap_values: Record<string, number>;
}

export interface EDAResponse {
  total_customers: number;
  churn_rate: number;
  churn_count: number;
  retain_count: number;
  by_contract: { Contract: string; churn_rate: number }[];
}

export interface EDAInfo {
  total_customers: number;
  churn_rate: number;
  churn_count: number;
  retain_count: number;

  by_contract: {
    Contract: string;
    churn_rate: number;
  }[];
}

export interface DatasetInfo {
  total_rows: number;
  train_size: number;
  test_size: number;
  n_features: number;
  churn_rate: number;
}

/** One real point on the cost-vs-threshold curve. Computed by the backend from
 *  out-of-fold validation predictions via an exact confusion matrix — never
 *  interpolated or simulated on the client (see AUDIT.md §4.B). */
export interface ThresholdPoint {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  cost: number;
}

export interface ThresholdCurveResponse {
  source: "validation_oof";
  model: string;
  cost_fn: number;
  cost_fp: number;
  curve: ThresholdPoint[];
  optimal: ThresholdPoint;
  locked_threshold: number;
  note?: string;
}

/** How FN/FP costs were derived from the dataset (CLV-based), not guessed. */
export interface CostDerivation {
  method: string;
  avg_monthly_charges?: number;
  retained_lifetime_months?: number;
  gross_margin?: number;
  retention_discount?: number;
  offer_duration_months?: number;
  cost_fn?: number;
  cost_fp?: number;
  cost_fn_formula?: string;
  cost_fp_formula?: string;
}

export interface CostSensitivityPoint {
  ratio: number;
  cost_fn: number;
  cost_fp: number;
  optimal_threshold: number;
  optimal_cost: number;
  recall_at_optimal: number;
  precision_at_optimal: number;
}

export interface CostSensitivityResponse {
  source: "validation_oof";
  model: string;
  cost_fp: number;
  points: CostSensitivityPoint[];
  cost_derivation?: CostDerivation;
}

export interface PipelineResults {
  models: ModelMetric[];

  best_model: string;
  best_threshold: number;

  cost_fn: number;
  cost_fp: number;

  shap_global: {
    feature: string;
    importance: number;
  }[];

  customer_shap: CustomerShapRow[];

  dataset_info: DatasetInfo;

  eda: EDAInfo;

  threshold_curve?: ThresholdCurveResponse;
}

// ============================================
// FETCH HELPER (Claude style)
// ============================================

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// ============================================
// PIPELINE
// ============================================

export async function startPipeline(file: File): Promise<JobResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("use_demo", "false");

  const res = await fetch(`${BASE_URL}/run-pipeline`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error("Pipeline start failed");
  return res.json();
}

export async function startPipelineDemo(): Promise<JobResponse> {
  const form = new FormData();
  form.append("use_demo", "true");

  const res = await fetch(`${BASE_URL}/run-pipeline`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error("Demo pipeline failed");
  return res.json();
}

export async function getPipelineStatus(jobId: string): Promise<JobStatus> {
  return apiFetch(`/pipeline-status/${jobId}`);
}

export async function getPipelineResults(
  jobId: string
): Promise<PipelineResults> {
  return apiFetch(`/results/${jobId}`);
}

// ============================================
// DASHBOARD DATA
// ============================================

export async function getMetrics(): Promise<MetricsResponse> {
  return apiFetch("/metrics");
}

export async function getShapGlobal(): Promise<ShapFeature[]> {
  const data = await apiFetch<{ shap_global: ShapFeature[] }>("/shap-global");
  return data.shap_global;
}

export async function getCustomerShap(index: number): Promise<CustomerShap> {
  return apiFetch(`/shap/${index}`);
}

export async function getEDA(): Promise<EDAResponse> {
  return apiFetch("/eda");
}

/**
 * Fetch the REAL cost-vs-threshold curve for the selected model.
 *
 * The FN/FP costs are sent to the backend, which re-evaluates the stored
 * out-of-fold validation predictions at every threshold and returns exact
 * confusion-matrix costs. This is what makes the cost inputs actually matter:
 * nothing about the curve is computed on the client.
 */
export async function getThresholdCurve(
  costFn?: number,
  costFp?: number
): Promise<ThresholdCurveResponse> {
  const params = new URLSearchParams();
  if (costFn != null) params.set("cost_fn", String(costFn));
  if (costFp != null) params.set("cost_fp", String(costFp));
  const qs = params.toString();
  return apiFetch(`/threshold-curve${qs ? `?${qs}` : ""}`);
}

/**
 * Fetch the cost-ratio sensitivity sweep: how the cost-optimal threshold and its
 * cost move as FN/FP varies. Computed by the backend from the same out-of-fold
 * predictions via the real cost curve — no client-side modelling.
 */
export async function getCostSensitivity(
  costFp?: number
): Promise<CostSensitivityResponse> {
  const params = new URLSearchParams();
  if (costFp != null) params.set("cost_fp", String(costFp));
  const qs = params.toString();
  return apiFetch(`/cost-sensitivity${qs ? `?${qs}` : ""}`);
}

// ============================================
// PREDICT
// ============================================

export interface CustomerInput {
  gender: string;
  SeniorCitizen: number;
  Partner: string;
  Dependents: string;
  tenure: number;
  PhoneService: string;
  MultipleLines: string;
  InternetService: string;
  OnlineSecurity: string;
  OnlineBackup: string;
  DeviceProtection: string;
  TechSupport: string;
  StreamingTV: string;
  StreamingMovies: string;
  Contract: string;
  PaperlessBilling: string;
  PaymentMethod: string;
  MonthlyCharges: number;
  TotalCharges: number;
}

export interface PredictionResult {
  probability: number;
  prediction: number;
  risk_level: string;
  threshold_used: number;
  shap_values: Record<string, number>;
}

export async function predictChurn(
  customer: CustomerInput
): Promise<PredictionResult> {
  const r = await api.post("/predict", customer);
  return r.data;
}

// ============================================
// HEALTH — graceful error handling
// ============================================

export const checkHealth = async (): Promise<{ status: string }> => {
  try {
    const r = await api.get("/health");
    return r.data;
  } catch {
    return { status: "error" };
  }
};

/** What GET /health reports about the running backend (see backend/main.py). */
export interface HealthResponse {
  status: string;
  sklearn_version: string;
  python: string;
  feature_count: number;
  model_name: string | null;
  app_git_commit: string;
  artifact_git_commit: string | null;
  artifact_trained_at: string | null;
  artifact_age_seconds: number | null;
}

/** Full health payload. Rejects when the backend is unreachable or unhealthy (503). */
export async function getHealth(): Promise<HealthResponse> {
  const r = await api.get<HealthResponse>("/health");
  return r.data;
}

// There is deliberately no local/offline prediction: a client-side formula would be a
// made-up score shown as a model result. Without the backend the UI says so.

export default api;
