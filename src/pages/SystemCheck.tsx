import { useQuery } from '@tanstack/react-query';
import { ChartCard } from '@/components/DashboardCards';
import { getHealth } from '@/services/api';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

function formatAge(seconds: number | null): string {
  if (seconds == null) return 'unknown';
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(seconds / 3600);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/** Every value on this page is reported by the running backend's GET /health; none is hard-coded. */
export default function SystemCheck() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Asking the backend&hellip;
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="metric-card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10"><AlertTriangle className="w-5 h-5 text-warning" /></div>
          <div>
            <p className="text-sm font-medium text-foreground">Backend not available</p>
            <p className="text-xs text-muted-foreground">
              GET /health did not answer, or answered 503 because the model artifact could not be
              loaded. Start the API (see the README) and reload this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const healthy = data.status === 'ok';
  const rows: [string, string][] = [
    ['Status', data.status],
    ['Model', data.model_name ?? 'unknown'],
    ['Features', String(data.feature_count)],
    ['Python', data.python],
    ['scikit-learn', data.sklearn_version],
    ['API build (git commit)', data.app_git_commit],
    ['Model artifact (git commit)', data.artifact_git_commit ?? 'unknown'],
    ['Model trained at', data.artifact_trained_at ?? 'unknown'],
    ['Model age', formatAge(data.artifact_age_seconds)],
  ];

  return (
    <div className="space-y-6">
      <div className="metric-card">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${healthy ? 'bg-primary/10' : 'bg-warning/10'}`}>
            {healthy
              ? <CheckCircle className="w-5 h-5 text-primary" />
              : <AlertTriangle className="w-5 h-5 text-warning" />}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Backend</p>
            <span className={healthy ? 'status-success' : 'status-warning'}>
              {healthy ? 'Healthy' : data.status}
            </span>
          </div>
        </div>
      </div>

      <ChartCard title="Backend environment" subtitle="Reported live by GET /health">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-border/50">
                <td className="py-2.5 text-muted-foreground">{label}</td>
                <td className="py-2.5 text-foreground font-medium break-all">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </div>
  );
}
