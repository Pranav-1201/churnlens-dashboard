import { useEffect } from 'react';
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
  const { isDark, toggleTheme } = usePipelineStore();

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
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-200",
                        active
                          ? "bg-primary/10 text-primary border-l-2 border-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
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
