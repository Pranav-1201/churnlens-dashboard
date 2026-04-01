import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Menu, Eye, EyeOff, Wifi, WifiOff } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { usePipelineStore } from '@/stores/pipelineStore';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard Home',
  '/dashboard/system-check': 'System Check',
  '/dashboard/data-overview': 'Data Overview',
  '/dashboard/eda': 'Exploratory Data Analysis',
  '/dashboard/cleaning': 'Data Cleaning',
  '/dashboard/features': 'Feature Engineering',
  '/dashboard/encoding': 'Encoding',
  '/dashboard/split': 'Train/Test Split',
  '/dashboard/models/logistic': 'Logistic Regression',
  '/dashboard/models/decision-tree': 'Decision Tree',
  '/dashboard/models/random-forest': 'Random Forest',
  '/dashboard/models/xgboost': 'XGBoost',
  '/dashboard/models/lightgbm': 'LightGBM',
  '/dashboard/models/catboost': 'CatBoost',
  '/dashboard/models/stacking': 'Stacking Model',
  '/dashboard/comparison': 'Model Comparison',
  '/dashboard/threshold': 'Threshold Optimization',
  '/dashboard/cv-check': 'Final CV Check',
  '/dashboard/optuna': 'Optuna Tuning',
  '/dashboard/tuned-model': 'Tuned Model',
  '/dashboard/shap-global': 'SHAP Global',
  '/dashboard/shap-single': 'SHAP Single Prediction',
  '/dashboard/ann-training': 'ANN Training',
  '/dashboard/ann-eval': 'ANN Evaluation',
  '/dashboard/business': 'Business Analysis',
  '/dashboard/final-summary': 'Final Summary',
  '/dashboard/model-saving': 'Model Saving',
  '/dashboard/settings': 'Settings',
};

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { isDark, businessMode, toggleBusinessMode, backendConnected } = usePipelineStore();
  const title = PAGE_TITLES[location.pathname] || 'ChurnLens';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div
        className="flex-1 flex flex-col transition-all duration-200"
        style={{ marginLeft: collapsed ? 64 : 240 }}
      >
        {/* Header */}
        <header className="h-12 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="lg:hidden p-1 rounded-md hover:bg-accent"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="text-sm font-medium text-foreground">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Backend status */}
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              {backendConnected ? (
                <><Wifi className="w-3 h-3 text-success" /> API</>
              ) : (
                <><WifiOff className="w-3 h-3 text-warning" /> Local</>
              )}
            </span>

            {/* Business mode toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                toggleBusinessMode();
                toast.info(businessMode ? 'Technical mode enabled' : 'Business mode enabled — metrics translated to plain language');
              }}
              title={businessMode ? 'Switch to technical mode' : 'Switch to business mode'}
            >
              {businessMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {businessMode ? 'Business' : 'Technical'}
            </Button>

            <button className="p-2 rounded-md hover:bg-accent transition-colors">
              <Bell className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
