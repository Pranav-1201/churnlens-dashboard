/**
 * api.ts — FINAL MERGED VERSION
 * Combines:
 * - Claude async pipeline system ✅
 * - Your retry + fallback logic ✅
 * - Clean typing + full backend mapping ✅
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { ModelMetric } from "@/types/api";

// ============================================
// BASE CONFIG (AXIOS + FETCH SUPPORT)
// ============================================

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000";

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// Retry interceptor (from your original — KEEP)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as any;
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

  customer_shap: any[];

  dataset_info: DatasetInfo;

  eda: EDAInfo; // ✅ THIS LINE FIXES YOUR ERROR
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
// PIPELINE (IMPORTANT — THIS FIXES YOUR ISSUE)
// ============================================

// Start pipeline with file
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

// Demo pipeline
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

// Poll status (FIXED: now requires jobId)
export async function getPipelineStatus(jobId: string): Promise<JobStatus> {
  return apiFetch(`/pipeline-status/${jobId}`);
}

// Get results
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

// ============================================
// PREDICT (UNCHANGED)
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
// HEALTH
// ============================================

export const checkHealth = async () => {
  const r = await api.get("/health");
  return r.data;
};

// ============================================
// LOCAL FALLBACK (KEEP THIS — VERY IMPORTANT)
// ============================================

export const localPredict = (customer: CustomerInput): number => {
  let score = 0.265;

  if (customer.tenure < 12) score += 0.25;
  if (customer.MonthlyCharges > 80) score += 0.15;
  if (customer.Contract === "Month-to-month") score += 0.2;
  if (customer.Contract === "Two year") score -= 0.15;
  if (customer.InternetService === "Fiber optic") score += 0.1;
  if (customer.TechSupport === "Yes") score -= 0.08;
  if (customer.OnlineSecurity === "Yes") score -= 0.08;

  return Math.min(Math.max(score, 0.01), 0.99);
};

export default api;