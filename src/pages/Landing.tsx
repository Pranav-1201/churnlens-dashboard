/**
 * Landing.tsx — with restored pipeline execution UI
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, PlayCircle, ArrowRight, Loader2, Wifi, WifiOff, CheckCircle, Circle } from "lucide-react";
import { usePipelineStore } from "@/stores/pipelineStore";
import { Button } from "@/components/ui/button";
import { checkHealth } from "@/services/api";
import { toast } from "sonner";

// ============================================
// PIPELINE SECTIONS (UI labels for step tracking)
// ============================================
const PIPELINE_SECTIONS = [
  "System Check",
  "Data Loading",
  "EDA & Visualization",
  "Data Cleaning",
  "Feature Engineering",
  "Encoding",
  "Train/Test Split",
  "Model Training",
  "Model Comparison",
  "Threshold Optimization",
  "Cross-Validation",
  "SHAP Analysis",
  "Business Analysis",
  "Final Summary",
];

// ============================================
// PIPELINE OVERLAY — step-by-step execution screen
// ============================================
function PipelineOverlay() {
  const { phase, progress, currentStep, logs, error } = usePipelineStore();
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (phase === "idle" || phase === "complete") return null;

  // Determine which sections are complete based on progress
  const completedSections = Math.floor((progress / 100) * PIPELINE_SECTIONS.length);

  return (
    <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-card border border-border rounded-xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">
              {phase === "uploading"
                ? "📤 Uploading dataset..."
                : phase === "failed"
                ? "❌ Pipeline failed"
                : "🔬 Running ML Pipeline"}
            </h2>
            <span className="text-sm font-mono text-primary">{progress}%</span>
          </div>

          {/* Progress bar */}
          {phase !== "failed" && (
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          {currentStep && phase === "running" && (
            <p className="text-xs text-muted-foreground mt-2">{currentStep}</p>
          )}
        </div>

        {/* Two-panel layout */}
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] h-[400px]">

          {/* Left: Section checklist */}
          <div className="border-r border-border overflow-y-auto p-4 space-y-1 hidden md:block">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-semibold">
              Pipeline Sections
            </p>
            {PIPELINE_SECTIONS.map((section, i) => {
              const isDone = i < completedSections;
              const isCurrent = i === completedSections && phase === "running";
              return (
                <div
                  key={section}
                  className={`flex items-center gap-2.5 py-1.5 px-2 rounded-md text-sm transition-colors ${
                    isCurrent
                      ? "bg-primary/10 text-primary font-medium"
                      : isDone
                      ? "text-success"
                      : "text-muted-foreground"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 shrink-0 opacity-30" />
                  )}
                  <span className="truncate">{section}</span>
                </div>
              );
            })}
          </div>

          {/* Right: Log messages */}
          <div className="overflow-y-auto p-4 bg-muted/30 font-mono text-xs">
            <p className="text-muted-foreground mb-3 font-sans text-xs uppercase tracking-wider font-semibold">
              Execution Log
            </p>
            {logs.length === 0 && phase !== "failed" && (
              <p className="text-muted-foreground italic">Waiting for logs...</p>
            )}
            {logs.map((l, i) => (
              <div key={i} className="py-0.5 text-foreground/80">
                <span className="text-muted-foreground mr-2">
                  [{(l.progress ?? 0).toString().padStart(3, ' ')}%]
                </span>
                {l.step}
              </div>
            ))}
            {phase === "failed" && error && (
              <div className="mt-3 text-destructive font-semibold">
                ❌ {error}
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Footer with error retry */}
        {phase === "failed" && (
          <div className="p-4 border-t border-border flex justify-end">
            <Button variant="outline" size="sm" onClick={() => usePipelineStore.getState().reset()}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// LANDING
// ============================================

export default function Landing() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    runDemo,
    runWithFile,
    phase,
    isDark,
    backendConnected,
    setBackendConnected,
  } = usePipelineStore();

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(true);

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Backend health check — graceful (checkHealth now catches internally)
  useEffect(() => {
    checkHealth()
      .then((res) => {
        setBackendConnected(res.status === "ok");
      })
      .finally(() => setChecking(false));
  }, [setBackendConnected]);

  // Auto navigate on completion
  useEffect(() => {
    if (phase === "complete") {
      toast.success("Pipeline completed!");
      navigate("/dashboard");
    }
  }, [phase, navigate]);

  // =========================
  // HANDLERS
  // =========================

  const handleDemo = async () => {
    await runDemo();
  };

  const handleRunPipeline = async () => {
    if (!selectedFile) return toast.error("Upload a CSV first");
    await runWithFile(selectedFile);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) {
      setSelectedFile(file);
      toast.success(file.name);
    } else {
      toast.error("Upload a CSV file");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      toast.success(file.name);
    }
  };

  // =========================
  // UI
  // =========================

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 space-y-8">

      <PipelineOverlay />

      <div className="text-center">
        <h1 className="text-5xl font-bold">ChurnLens</h1>
        <p className="text-muted-foreground mt-2">
          End-to-end churn prediction system
        </p>

        {/* Backend status */}
        <div className="mt-3 text-xs flex justify-center gap-2">
          {checking ? (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Checking backend...
            </span>
          ) : backendConnected ? (
            <span className="text-green-500 flex items-center gap-1">
              <Wifi className="w-3 h-3" /> Connected
            </span>
          ) : (
            <span className="text-yellow-500 flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Local mode
            </span>
          )}
        </div>
      </div>

      {/* CARDS */}
      <div className="grid md:grid-cols-2 gap-6 w-full max-w-3xl">

        {/* Upload */}
        <div className="border rounded-lg p-6 text-center space-y-4">
          <Upload className="mx-auto" />
          <h3 className="font-semibold">Upload Dataset</h3>

          <label
            className={`block border-2 border-dashed p-6 rounded cursor-pointer ${
              dragActive ? "border-primary" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv"
              hidden
              ref={fileInputRef}
              onChange={handleFileSelect}
            />
            {selectedFile ? selectedFile.name : "Drop CSV here"}
          </label>

          <Button onClick={handleRunPipeline}>
            Run Pipeline
          </Button>
        </div>

        {/* Demo */}
        <div className="border rounded-lg p-6 text-center space-y-4">
          <PlayCircle className="mx-auto" />
          <h3 className="font-semibold">Demo Dataset</h3>

          <Button variant="outline" onClick={handleDemo}>
            Try Demo
          </Button>
        </div>
      </div>

      <button
        onClick={() => navigate("/dashboard")}
        className="text-sm text-muted-foreground flex items-center gap-1"
      >
        Skip → Dashboard <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}
