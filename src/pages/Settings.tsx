import { useState } from 'react';
import { ChartCard } from '@/components/DashboardCards';
import { usePipelineStore } from '@/stores/pipelineStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Moon, Sun, Eye, EyeOff, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { checkHealth } from '@/services/api';

export default function SettingsPage() {
  const { isDark, toggleTheme, apiBaseUrl, setApiBaseUrl, fnCost, fpCost, setCosts, currency, setCurrency, businessMode, toggleBusinessMode, backendConnected, setBackendConnected } = usePipelineStore();
  const [url, setUrl] = useState(apiBaseUrl);
  const [fn, setFn] = useState(fnCost);
  const [fp, setFp] = useState(fpCost);
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    setApiBaseUrl(url);
    const response = await checkHealth();
    const ok = response.status === "ok";

    setBackendConnected(ok);
    setTesting(false);
    if (ok) toast.success('Backend connected!');
    else toast.error('Backend unreachable — using local mode');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <ChartCard title="Appearance">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Theme</span>
          <Button variant="outline" size="sm" onClick={toggleTheme} className="gap-2">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </Button>
        </div>
      </ChartCard>

      <ChartCard title="Business Mode" subtitle="Translate technical metrics into business language">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-foreground">Business-Friendly Labels</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Replaces ROC-AUC → "Model Performance", Recall → "Catch Rate", etc.
            </p>
          </div>
          <Button variant={businessMode ? 'default' : 'outline'} size="sm" onClick={toggleBusinessMode} className="gap-2">
            {businessMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {businessMode ? 'On' : 'Off'}
          </Button>
        </div>
      </ChartCard>

      <ChartCard title="API Configuration">
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Base URL</label>
            <div className="flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button onClick={testConnection} size="sm" disabled={testing}>
                {testing ? 'Testing...' : 'Test & Save'}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {backendConnected ? (
              <span className="flex items-center gap-1 text-success"><Wifi className="w-3 h-3" /> Connected</span>
            ) : (
              <span className="flex items-center gap-1 text-warning"><WifiOff className="w-3 h-3" /> Local mode (mock data fallback)</span>
            )}
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Cost Constants" subtitle="Changing these affects threshold optimization">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">FN Cost (missed churner)</label>
              <Input type="number" value={fn} onChange={(e) => setFn(+e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">FP Cost (false alarm)</label>
              <Input type="number" value={fp} onChange={(e) => setFp(+e.target.value)} />
            </div>
          </div>
          <Button onClick={() => { setCosts(fn, fp); toast.success('Costs updated'); }} size="sm">Update Costs</Button>
        </div>
      </ChartCard>

      <ChartCard title="Currency">
        <div className="flex gap-2">
          {['₹', '$', '€'].map(c => (
            <Button key={c} variant={currency === c ? 'default' : 'outline'} size="sm" onClick={() => setCurrency(c)}>
              {c}
            </Button>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}
