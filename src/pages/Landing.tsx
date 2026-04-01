/**
 * Landing.tsx — FINAL MERGED VERSION
 *
 * - Real backend pipeline execution ✅
 * - Your UI (drag-drop + cards + design) ✅
 * - Removes fake pipeline simulation ❌
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, PlayCircle, ArrowRight, Loader2, Wifi, WifiOff } from "lucide-react";
import { usePipelineStore } from "@/stores/pipelineStore";
import { Button } from "@/components/ui/button";
import { checkHealth } from "@/services/api";
import { toast } from "sonner";

// ============================================
// REAL PIPELINE OVERLAY (FROM STORE)
// ============================================

function PipelineOverlay() {
  const { phase, progress, currentStep, logs, error } = usePipelineStore();

  if (phase === "idle") return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center">
      <div className="w-full max-w-xl bg-card border border-border rounded-xl p-6 space-y-4">

        <div>
          <h2 className="text-lg font-semibold">
            {phase === "uploading"
              ? "Uploading dataset..."
              : phase === "failed"
              ? "Pipeline failed"
              : "Running ML Pipeline"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {phase === "running" ? currentStep : ""}
          </p>
        </div>

        {/* Progress */}
        {phase !== "failed" && (
          <div>
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex justify-between">
              <span>{progress}%</span>
              <span>{currentStep}</span>
            </div>
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <div className="h-32 overflow-y-auto text-xs font-mono bg-muted p-3 rounded">
            {logs.slice(-20).map((l, i) => (
              <div key={i}>{l.step}</div>
            ))}
          </div>
        )}

        {/* Error */}
        {phase === "failed" && (
          <div className="text-destructive text-sm">{error}</div>
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

  // Backend health check
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