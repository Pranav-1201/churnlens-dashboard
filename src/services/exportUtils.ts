import { toast } from 'sonner';

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
    // Use SVG serialization for Recharts
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
// PDF Export (browser-based)
// ============================================
export async function exportReportAsPDF() {
  toast.info('Generating PDF report...');

  // Dynamically create a print-friendly page
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Popup blocked — please allow popups for PDF export');
    return;
  }

  const reportHTML = generateReportHTML();
  printWindow.document.write(reportHTML);
  printWindow.document.close();

  // Wait for content to render then trigger print
  setTimeout(() => {
    printWindow.print();
    toast.success('PDF report ready — use your browser\'s Save as PDF option');
  }, 500);
}

function generateReportHTML(): string {
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
    <div class="metric"><div class="value">7,043</div><div class="label">Total Customers</div></div>
    <div class="metric"><div class="value">26.5%</div><div class="label">Churn Rate</div></div>
    <div class="metric"><div class="value">0.845</div><div class="label">Best ROC-AUC</div></div>
    <div class="metric"><div class="value">₹383,500</div><div class="label">Min Business Cost</div></div>
  </div>

  <h2>Model Comparison</h2>
  <table>
    <tr><th>Model</th><th>Accuracy</th><th>ROC-AUC</th><th>PR-AUC</th><th>Cost</th><th>Status</th></tr>
    <tr style="background:#f0fdf4"><td><strong>Logistic Regression</strong></td><td>0.7367</td><td>0.8451</td><td>0.6557</td><td>₹392,500</td><td>✅ Selected</td></tr>
    <tr><td>Stacked Model</td><td>0.7537</td><td>0.8465</td><td>0.6610</td><td>₹400,500</td><td>Runner-up</td></tr>
    <tr><td>CatBoost</td><td>0.7488</td><td>0.8433</td><td>0.6604</td><td>₹400,500</td><td>Evaluated</td></tr>
    <tr><td>XGBoost (Calibrated)</td><td>0.7935</td><td>0.8397</td><td>0.6501</td><td>₹423,500</td><td>Evaluated</td></tr>
    <tr><td>Random Forest</td><td>0.7800</td><td>0.8360</td><td>0.6420</td><td>₹448,000</td><td>Evaluated</td></tr>
  </table>

  <h2>Key Findings</h2>
  <div class="highlight">
    <strong>Top Churn Drivers:</strong> Month-to-month contracts, low tenure, fiber optic internet, no tech support, electronic check payments.
  </div>

  <h2>Business Impact</h2>
  <p>At the optimal threshold of <strong>0.13</strong>, the model catches <strong>97% of churners</strong>.</p>
  <table>
    <tr><td>Default cost (threshold=0.50)</td><td><strong>₹943,500</strong></td></tr>
    <tr><td>Optimized cost (threshold=0.13)</td><td><strong>₹383,500</strong></td></tr>
    <tr style="background:#f0fdf4"><td>Annual savings</td><td><strong>₹561,000 (59% reduction)</strong></td></tr>
  </table>

  <h2>Recommendations</h2>
  <ol>
    <li><strong>Target month-to-month customers</strong> with contract upgrade offers (12-month discounts)</li>
    <li><strong>Bundle tech support & security</strong> for fiber optic users — reduces churn by ~18%</li>
    <li><strong>Early engagement program</strong> for new customers (tenure &lt; 6 months)</li>
    <li><strong>Auto-pay incentives</strong> — move electronic check users to automatic payments</li>
    <li><strong>Deploy the model</strong> with threshold 0.13 for maximum cost savings</li>
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
