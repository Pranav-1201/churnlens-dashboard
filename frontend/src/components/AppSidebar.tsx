import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Server, Database, BarChart2, Wrench, Cpu, Code, Scissors,
  TrendingUp, GitBranch, TreePine, Zap, Layers, Box, LayoutGrid,
  Trophy, Target, RefreshCw, Sliders, CheckCircle,
  Globe, User, Brain, Activity, DollarSign, Award, Save, Settings,
  ChevronLeft, ChevronRight, Moon, Sun
} from 'lucide-react';
import { usePipelineStore } from '@/stores/pipelineStore';
import { cn } from '@/lib/utils';

// Slug → possible backend model names (must match ModelPage.tsx)
const MODEL_SLUG_NAMES: Record<string, string[]> = {
  'logistic': ['Logistic Regression', 'Logistic'],
  'decision-tree': ['Decision Tree', 'DecisionTree'],
  'random-forest': ['Random Forest', 'RandomForest'],
  'xgboost': ['XGBoost', 'XGBoost (Calibrated)', 'xgboost'],
  'lightgbm': ['LightGBM', 'lightgbm'],
  'catboost': ['CatBoost', 'catboost'],
  'stacking': ['Stacked Model', 'Stacking Model', 'Stacking', 'StackedModel'],
};

function isModelAvailable(slug: string, modelNames: string[]): boolean {
  const candidates = MODEL_SLUG_NAMES[slug] ?? [];
  return candidates.some((c) =>
    modelNames.some((n) => n.toLowerCase() === c.toLowerCase())
  );
}

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { icon: Home, label: "Dashboard Home", path: "/dashboard" },
      { icon: Server, label: "System Check", path: "/dashboard/system-check" },
    ],
  },
  {
    label: "Data Pipeline",
    items: [
      { icon: Database, label: "Data Overview", path: "/dashboard/data-overview" },
      { icon: BarChart2, label: "EDA", path: "/dashboard/eda" },
      { icon: Wrench, label: "Data Cleaning", path: "/dashboard/cleaning" },
      { icon: Cpu, label: "Feature Engineering", path: "/dashboard/features" },
      { icon: Code, label: "Encoding", path: "/dashboard/encoding" },
      { icon: Scissors, label: "Train/Test Split", path: "/dashboard/split" },
    ],
  },
  {
    label: "Models",
    items: [
      { icon: TrendingUp, label: "Logistic Regression", path: "/dashboard/models/logistic" },
      { icon: GitBranch, label: "Decision Tree", path: "/dashboard/models/decision-tree" },
      { icon: TreePine, label: "Random Forest", path: "/dashboard/models/random-forest" },
      { icon: Zap, label: "XGBoost", path: "/dashboard/models/xgboost" },
      { icon: Layers, label: "LightGBM", path: "/dashboard/models/lightgbm" },
      { icon: Box, label: "CatBoost", path: "/dashboard/models/catboost" },
      { icon: LayoutGrid, label: "Stacking Model", path: "/dashboard/models/stacking" },
    ],
  },
  {
    label: "Evaluation",
    items: [
      { icon: Trophy, label: "Model Comparison", path: "/dashboard/comparison" },
      { icon: Target, label: "Threshold Optimization", path: "/dashboard/threshold" },
      { icon: RefreshCw, label: "Final CV Check", path: "/dashboard/cv-check" },
      { icon: Sliders, label: "Optuna Tuning", path: "/dashboard/optuna" },
      { icon: CheckCircle, label: "Tuned Model", path: "/dashboard/tuned-model" },
    ],
  },
  {
    label: "Explainability",
    items: [
      { icon: Globe, label: "SHAP Global", path: "/dashboard/shap-global" },
      { icon: User, label: "SHAP Single", path: "/dashboard/shap-single" },
      { icon: Brain, label: "ANN Training", path: "/dashboard/ann-training" },
      { icon: Activity, label: "ANN Evaluation", path: "/dashboard/ann-eval" },
    ],
  },
  {
    label: "Business",
    items: [
      { icon: DollarSign, label: "Business Analysis", path: "/dashboard/business" },
      { icon: Award, label: "Final Summary", path: "/dashboard/final-summary" },
      { icon: Save, label: "Model Saving", path: "/dashboard/model-saving" },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const { isDark, toggleTheme, results } = usePipelineStore();

  // Get available model names from results
  const availableModelNames = results?.models?.map((m) => m.name) ?? [];

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar overflow-hidden"
    >
      {/* Logo */}
      <div className="h-12 flex items-center px-4 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
            CL
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="font-semibold text-sidebar-foreground whitespace-nowrap"
              >
                ChurnLens
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <span className="px-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {group.label}
              </span>
            )}
            <ul className="mt-1 space-y-0.5">
              {group.items.map((item) => {
                const active = location.pathname === item.path;

                // Check if this is a model link and whether the model is available
                const isModelLink = item.path.startsWith('/dashboard/models/');
                const modelSlug = isModelLink ? item.path.split('/').pop() ?? '' : '';
                const modelAvailable = !isModelLink || availableModelNames.length === 0 || isModelAvailable(modelSlug, availableModelNames);

                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-200",
                        active
                          ? "bg-primary/10 text-primary border-l-2 border-primary"
                          : modelAvailable
                          ? "text-sidebar-foreground hover:bg-sidebar-accent"
                          : "text-sidebar-foreground/40 hover:bg-sidebar-accent/50"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon className={cn("w-4 h-4 shrink-0", !modelAvailable && !active && "opacity-40")} />
                      {!collapsed && (
                        <span className={cn("truncate", !modelAvailable && !active && "opacity-40")}>
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-1 shrink-0">
        <Link
          to="/dashboard/settings"
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full"
        >
          {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
        <button
          onClick={onToggle}
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full"
        >
          {collapsed ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
