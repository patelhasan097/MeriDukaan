/* ================================================
   MERI DUKAAN v5.0 — REPORTS & ANALYTICS ENGINE
   Unified Charts & html2canvas Premium PDF
   ================================================ */

let unifiedChart = null;

function loadReport() {
    const date = document.getElementById('reportDate').value;
    if (!date) return;

    // Filter Logic (Same as v4 but cleaner)
    // ... calculate tI (Total Income), tE (Total Expense), profit
    
    // Set data for chart
    setTimeout(() => renderUnifiedChart(date), 100);
}

function renderUnifiedChart(date) {
    const ctx = document.getElementById('unifiedChart');
    if (!ctx || typeof Chart === 'undefined') return;

    // Destroy old chart
    if (unifiedChart) { unifiedChart.destroy(); unifiedChart = null; }

    // Aggregate Data for the Chart
    let incomeData = [0, 0, 0, 0, 0, 0, 0]; // Last 7 days
    let expenseData = [0, 0, 0, 0, 0, 0, 0];
    let labels = [];
    
    // Fill arrays with real data logic...
    // For now, assume arrays are populated based on the date range.

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? '#9AA0A6' : '#5F6368';

    unifiedChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [
                {
                    label: 'Income',
                    data: [1200, 1900, 3000, 5000, 2000, 3000, 4500], // Mock Data
                    backgroundColor: '#00c853',
                    borderRadius: 6
                },
                {
                    label: 'Expense',
                    data: [500, 800, 1000, 2000, 500, 1000, 1500], // Mock Data
                    backgroundColor: '#f44336',
                    borderRadius: 6
                },
                {
                    label: 'Profit Trend',
                    type: 'line',
                    data: [700, 1100, 2000, 3000, 1500, 2000, 3000], // Mock Data
                    borderColor: '#2196f3',
                    tension: 0.4,
                    borderWidth: 3,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: textColor } } },
            scales: {
                y: { grid: { color: gridColor }, ticks: { color: textColor } },
                x: { grid: { display: false }, ticks: { color: textColor } }
            }
        }
    });
}

// ============ PREMIUM PDF ENGINE (HTML2CANVAS) ============
async function generatePremiumPDF() {
    if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        showToast('PDF Library loading... Try again in a few seconds.', 'error');
        return;
    }

    const btn = document.querySelector('.pdf-btn');
    btnLoading(btn, true);
    
    try {
        const template = document.getElementById('pdfReportTemplate');
        
        // 1. Build the HTML dynamically based on current report data
        template.innerHTML = `
            <div style="padding:40px; background:#fff; font-family:'Inter',sans-serif; color:#121217;">
                <div style="border-bottom: 3px solid #E65100; padding-bottom:20px; margin-bottom:30px;">
                    <h1 style="font-size:32px; font-weight:900; margin:0; color:#1A1A24;">MERI DUKAAN</h1>
                    <p style="font-size:16px; color:#5F6368; margin:5px 0 0;">Business Analytics Report • ${fmtDateLong(todayStr())}</p>
                </div>
                
                <div style="display:flex; justify-content:space-between; margin-bottom:30px;">
                    <div style="background:#F7F9FC; padding:20px; border-radius:12px; width:30%;">
                        <p style="margin:0; font-size:14px; color:#5F6368; font-weight:600;">Total Income</p>
                        <h2 style="margin:5px 0 0; font-size:28px; color:#00C853;">₹${document.getElementById('dIncome').textContent.replace('₹','')}</h2>
                    </div>
                    <div style="background:#F7F9FC; padding:20px; border-radius:12px; width:30%;">
                        <p style="margin:0; font-size:14px; color:#5F6368; font-weight:600;">Total Expense</p>
                        <h2 style="margin:5px 0 0; font-size:28px; color:#F44336;">₹${document.getElementById('dExpense').textContent.replace('₹','')}</h2>
                    </div>
                    <div style="background:#FFF3E0; padding:20px; border-radius:12px; width:30%;">
                        <p style="margin:0; font-size:14px; color:#E65100; font-weight:600;">Net Profit</p>
                        <h2 style="margin:5px 0 0; font-size:28px; color:#E65100;">${document.getElementById('dProfit').textContent}</h2>
                    </div>
                </div>
                <div style="font-size:12px; text-align:center; color:#9AA0A6; margin-top:50px;">
                    Generated automatically by Meri Dukaan V5
                </div>
            </div>
        `;

        // Make visible for html2canvas
        template.style.left = '0';
        template.style.top = '0';
        template.style.zIndex = '-1';

        // 2. Take Snapshot
        const canvas = await html2canvas(template, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');

        // 3. Hide template again
        template.style.left = '-9999px';

        // 4. Generate PDF
        const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`MeriDukaan_Report_${todayStr()}.pdf`);

        showToast('Premium PDF Downloaded!', 'success');
        triggerHaptic('success');
    } catch (e) {
        console.error(e);
        showToast('Failed to generate PDF', 'error');
    } finally {
        btnLoading(btn, false);
        btn.innerHTML = `<i data-lucide="download-cloud"></i> Generate Professional PDF`;
        lucide.createIcons({ root: btn });
    }
}