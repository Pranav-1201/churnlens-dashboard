import { ReactNode, useRef } from 'react';
import { Info, Download, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportChartAsPNG } from '@/services/exportUtils';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  tint?: 'primary' | 'success' | 'warning' | 'destructive';
  subtitle?: string;
}

export function MetricCard({ title, value, icon, tint = 'primary', subtitle }: MetricCardProps) {
  const tintMap = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    destructive: 'text-destructive bg-destructive/10',
  };

  return (
    <div className="metric-card group hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        {icon && <div className={`p-1.5 rounded-lg ${tintMap[tint]}`}>{icon}</div>}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

interface ChartCardProps {
  title: string;
  children: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  chartId?: string;
}

export function ChartCard({ title, children, subtitle, action, chartId }: ChartCardProps) {
  const id = chartId || `chart-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="chart-container" id={id}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-title">{title}</h3>
          {subtitle && <p className="section-subtitle mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          {action}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
            onClick={() => exportChartAsPNG(id, id)}
            title="Export as PNG"
          >
            <Image className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

interface TooltipBadgeProps {
  label: string;
  tooltip: string;
}

export function TooltipBadge({ label, tooltip }: TooltipBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-help group/tip relative">
      {label}
      <Info className="w-3 h-3" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-border z-50 max-w-xs text-center">
        {tooltip}
      </span>
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Selected': 'status-success',
    'Runner-up': 'status-warning',
    'Evaluated': 'status-neutral',
    'Excluded': 'status-danger',
  };
  return <span className={map[status] || 'status-neutral'}>{status}</span>;
}

export function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const labels = ['Predicted 0', 'Predicted 1'];
  const rowLabels = ['Actual 0', 'Actual 1'];
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  const colors = [
    ['bg-success/20 text-success', 'bg-warning/20 text-warning'],
    ['bg-destructive/20 text-destructive', 'bg-success/20 text-success'],
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 text-xs">
        <div />
        {labels.map((l) => (
          <div key={l} className="text-center text-muted-foreground font-medium">{l}</div>
        ))}
        {matrix.map((row, i) => (
          <>
            <div key={`row-${i}`} className="flex items-center text-muted-foreground font-medium">{rowLabels[i]}</div>
            {row.map((val, j) => (
              <div key={`${i}-${j}`} className={`p-3 rounded-lg text-center font-bold ${colors[i][j]}`}>
                {val}
                <div className="text-[10px] font-normal opacity-70">{((val / total) * 100).toFixed(1)}%</div>
              </div>
            ))}
          </>
        ))}
      </div>
    </div>
  );
}
