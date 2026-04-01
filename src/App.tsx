import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { SkeletonChart } from "@/components/SkeletonChart";

// Eagerly loaded (always needed)
import Landing from "./pages/Landing";
import DashboardLayout from "./layouts/DashboardLayout";

// Lazy loaded pages
const DashboardHome = lazy(() => import("./pages/DashboardHome"));
const SystemCheck = lazy(() => import("./pages/SystemCheck"));
const DataOverview = lazy(() => import("./pages/DataOverview"));
const EDA = lazy(() => import("./pages/EDA"));
const DataCleaning = lazy(() => import("./pages/DataCleaning"));
const FeatureEngineering = lazy(() => import("./pages/FeatureEngineering"));
const Encoding = lazy(() => import("./pages/Encoding"));
const TrainTestSplit = lazy(() => import("./pages/TrainTestSplit"));
const ModelPage = lazy(() => import("./pages/ModelPage"));
const ModelComparison = lazy(() => import("./pages/ModelComparison"));
const ThresholdOptimization = lazy(() => import("./pages/ThresholdOptimization"));
const FinalCVCheck = lazy(() => import("./pages/FinalCVCheck"));
const OptunaTuning = lazy(() => import("./pages/OptunaTuning"));
const TunedModel = lazy(() => import("./pages/TunedModel"));
const ShapGlobal = lazy(() => import("./pages/ShapGlobal"));
const ShapSingle = lazy(() => import("./pages/ShapSingle"));
const ANNTraining = lazy(() => import("./pages/ANNTraining"));
const ANNEvaluation = lazy(() => import("./pages/ANNEvaluation"));
const BusinessAnalysis = lazy(() => import("./pages/BusinessAnalysis"));
const FinalSummary = lazy(() => import("./pages/FinalSummary"));
const ModelSaving = lazy(() => import("./pages/ModelSaving"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="metric-card">
            <div className="h-3 w-20 bg-muted animate-pulse rounded" />
            <div className="h-7 w-24 bg-muted animate-pulse rounded mt-2" />
          </div>
        ))}
      </div>
      <SkeletonChart height={300} />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Suspense fallback={<PageLoader />}><DashboardHome /></Suspense>} />
            <Route path="system-check" element={<Suspense fallback={<PageLoader />}><SystemCheck /></Suspense>} />
            <Route path="data-overview" element={<Suspense fallback={<PageLoader />}><DataOverview /></Suspense>} />
            <Route path="eda" element={<Suspense fallback={<PageLoader />}><EDA /></Suspense>} />
            <Route path="cleaning" element={<Suspense fallback={<PageLoader />}><DataCleaning /></Suspense>} />
            <Route path="features" element={<Suspense fallback={<PageLoader />}><FeatureEngineering /></Suspense>} />
            <Route path="encoding" element={<Suspense fallback={<PageLoader />}><Encoding /></Suspense>} />
            <Route path="split" element={<Suspense fallback={<PageLoader />}><TrainTestSplit /></Suspense>} />
            <Route path="models/:modelId" element={<Suspense fallback={<PageLoader />}><ModelPage /></Suspense>} />
            <Route path="comparison" element={<Suspense fallback={<PageLoader />}><ModelComparison /></Suspense>} />
            <Route path="threshold" element={<Suspense fallback={<PageLoader />}><ThresholdOptimization /></Suspense>} />
            <Route path="cv-check" element={<Suspense fallback={<PageLoader />}><FinalCVCheck /></Suspense>} />
            <Route path="optuna" element={<Suspense fallback={<PageLoader />}><OptunaTuning /></Suspense>} />
            <Route path="tuned-model" element={<Suspense fallback={<PageLoader />}><TunedModel /></Suspense>} />
            <Route path="shap-global" element={<Suspense fallback={<PageLoader />}><ShapGlobal /></Suspense>} />
            <Route path="shap-single" element={<Suspense fallback={<PageLoader />}><ShapSingle /></Suspense>} />
            <Route path="ann-training" element={<Suspense fallback={<PageLoader />}><ANNTraining /></Suspense>} />
            <Route path="ann-eval" element={<Suspense fallback={<PageLoader />}><ANNEvaluation /></Suspense>} />
            <Route path="business" element={<Suspense fallback={<PageLoader />}><BusinessAnalysis /></Suspense>} />
            <Route path="final-summary" element={<Suspense fallback={<PageLoader />}><FinalSummary /></Suspense>} />
            <Route path="model-saving" element={<Suspense fallback={<PageLoader />}><ModelSaving /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
          </Route>
          <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
