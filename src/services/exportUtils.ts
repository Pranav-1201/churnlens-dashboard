import { toast } from 'sonner';
import type { PipelineResults } from './api';

// ============================================
// CSV Export
// ============================================
export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) {
    toast.error('No data to export');
    return;
  }
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const val = row[h];
      const str = String(val ?? '');
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')),
  ].join('\n');

  downloadFile(csv, `${filename}.csv`, 'text/csv');
  toast.success(`Exported ${data.length} rows to ${filename}.csv`);
}

// ============================================
// PNG Export (from chart container)
// ============================================
export async function exportChartAsPNG(containerId: string, filename: string) {
  const container = document.getElementById(containerId);
  if (!container) {
    toast.error('Chart not found');
    return;
  }

  try {
    const svg = container.querySelector('svg');
    if (!svg) {
      toast.error('No chart SVG found');
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx.scale(2, 2);
        ctx.fillStyle = '#0A0A0F';
        ctx.fillRect(0, 0, img.width, img.height);
        ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });

    canvas.toBlob(blob => {
      if (blob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.png`;
        link.click();
        URL.revokeObjectURL(link.href);
        toast.success(`Chart exported as ${filename}.png`);
      }
    }, 'image/png');

    URL.revokeObjectURL(url);
  } catch {
    toast.error('Failed to export chart');
  }
}

// ============================================
// PDF Export (browser-based) — uses real pipeline results
// ============================================
export async function exportReportAsPDF(results?: PipelineResults | null) {
  toast.info('Generating PDF report...');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Popup blocked — please allow popups for PDF export');
    return;
  }

  const reportHTML = generateReportHTML(results);
  printWindow.document.write(reportHTML);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.print();
    toast.success('PDF report ready — use your browser\'s Save as PDF option');
  }, 500);
}

function generateReportHTML(results?: PipelineResults | null): string {
  const eda = results?.eda;
  const models = results?.models ?? [];
  const best = models.find(m => m.status === 'Selected') ?? models[0];
  const shap = results?.shap_global?.slice(0, 5) ?? [];

  const totalCustomers = eda?.total_customers?.toLocaleString() ?? '—';
  const churnRate = eda ? `${(eda.churn_rate * 100).toFixed(1)}%` : '—';
  const bestAuc = best?.roc_auc?.toFixed(3) ?? '—';
  const bestCost = best?.cost ? `₹${best.cost.toLocaleString()}` : '—';
  const bestThreshold = results?.best_threshold ?? '—';

  const modelRows = [...models]
    .sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity))
    .map(m => `<tr${m.status === 'Selected' ? ' style="background:#f0fdf4"' : ''}>
      <td>${m.status === 'Selected' ? '<strong>' + m.name + '</strong>' : m.name}</td>
      <td>${(m.accuracy * 100).toFixed(2)}%</td>
      <td>${m.roc_auc.toFixed(4)}</td>
      <td>${m.pr_auc?.toFixed(4) ?? '—'}</td>
      <td>${m.cost ? `₹${m.cost.toLocaleString()}` : '—'}</td>
      <td>${m.status === 'Selected' ? '✅ Selected' : m.status}</td>
    </tr>`).join('');

  const shapList = shap.map(s => `<li><strong>${s.feature}</strong> (importance: ${s.importance.toFixed(4)})</li>`).join('');

  return `<!DOCTYPE html>
<html><head><title>ChurnLens Report</title>
<style>
  body { font-family: 'Inter', system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; }
  h1 { color: #6366F1; border-bottom: 2px solid #6366F1; padding-bottom: 8px; }
  h2 { color: #333; margin-top: 32px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  th, td { padding: 8px 12px; border: 1px solid #e5e7eb; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .metric { display: inline-block; background: #f0f0ff; padding: 8px 16px; border-radius: 8px; margin: 4px; text-align: center; }
  .metric .value { font-size: 24px; font-weight: 700; color: #6366F1; }
  .metric .label { font-size: 11px; color: #666; }
  .highlight { background: #f0fdf4; border-left: 3px solid #10B981; padding: 12px; margin: 16px 0; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <h1>🔍 ChurnLens — Churn Prediction Report</h1>
  <p>Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

  <div style="display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0;">
    <div class="metric"><div class="value">${totalCustomers}</div><div class="label">Total Customers</div></div>
    <div class="metric"><div class="value">${churnRate}</div><div class="label">Churn Rate</div></div>
    <div class="metric"><div class="value">${bestAuc}</div><div class="label">Best ROC-AUC</div></div>
    <div class="metric"><div class="value">${bestCost}</div><div class="label">Min Business Cost</div></div>
  </div>

  <h2>Model Comparison</h2>
  <table>
    <tr><th>Model</th><th>Accuracy</th><th>ROC-AUC</th><th>PR-AUC</th><th>Cost</th><th>Status</th></tr>
    ${modelRows || '<tr><td colspan="6">No pipeline results available</td></tr>'}
  </table>

  <h2>Top Churn Drivers (SHAP)</h2>
  ${shapList ? `<ol>${shapList}</ol>` : '<p>Run pipeline to see SHAP analysis</p>'}

  <h2>Business Impact</h2>
  <p>At the optimal threshold of <strong>${bestThreshold}</strong>, the model minimises total business cost.</p>
  <table>
    <tr><td>Best Model</td><td><strong>${best?.name ?? '—'}</strong></td></tr>
    <tr><td>Optimal Threshold</td><td><strong>${bestThreshold}</strong></td></tr>
    <tr><td>FN Cost</td><td><strong>₹${results?.cost_fn?.toLocaleString() ?? '—'}</strong></td></tr>
    <tr><td>FP Cost</td><td><strong>₹${results?.cost_fp?.toLocaleString() ?? '—'}</strong></td></tr>
    <tr style="background:#f0fdf4"><td>Minimum Cost</td><td><strong>${bestCost}</strong></td></tr>
  </table>

  <h2>Recommendations</h2>
  <ol>
    <li><strong>Target month-to-month customers</strong> with contract upgrade offers</li>
    <li><strong>Bundle tech support & security</strong> for fiber optic users</li>
    <li><strong>Early engagement program</strong> for new customers (tenure &lt; 6 months)</li>
    <li><strong>Auto-pay incentives</strong> — move electronic check users to automatic payments</li>
    <li><strong>Deploy the model</strong> with threshold ${bestThreshold} for maximum cost savings</li>
  </ol>

  <p style="color:#999; font-size: 11px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 16px;">
    ChurnLens — AI-Powered Customer Churn Prediction Platform
  </p>
</body></html>`;
}

// ============================================
// Helper
// ============================================
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
