/* ================================================
   MERI DUKAAN v6.0 — REPORTS
   Report generation · Chart.js charts · PDF
   ================================================ */

function switchReport(type, btn) {
    curReport = type;
    document.querySelectorAll('.rp-t').forEach(function(t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    loadReport();
}

function changeReportDate(off) {
    var cv = document.getElementById('reportDate').value;
    if (!cv) return;
    var d = new Date(cv + 'T00:00:00');
    if (curReport === 'daily') d.setDate(d.getDate() + off);
    else if (curReport === 'weekly') d.setDate(d.getDate() + (off * 7));
    else {
        d.setDate(1);
        d.setMonth(d.getMonth() + off);
    }
    var t = new Date();
    t.setHours(23, 59, 59, 999);
    if (d > t) return;
    setDateInput('reportDate', d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(d.getDate()));
    loadReport();
}

function loadReport() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(function() { _loadReportInternal(); }, 200);
}

function _loadReportInternal() {
    var date = document.getElementById('reportDate').value;
    if (!date) return;
    
    var sd, ed, title, btnText;
    var d = new Date(date + 'T00:00:00');
    var mn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (curReport === 'daily') {
        sd = ed = date;
        title = 'Daily Report • ' + fmtDateLong(date);
        btnText = fmtDateBtn(date);
    } else if (curReport === 'weekly') {
        var dy = d.getDay(), mon = new Date(d);
        mon.setDate(d.getDate() - (dy === 0 ? 6 : dy - 1));
        var sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        sd = mon.getFullYear() + '-' + S(mon.getMonth() + 1) + '-' + S(mon.getDate());
        ed = sun.getFullYear() + '-' + S(sun.getMonth() + 1) + '-' + S(sun.getDate());
        title = 'Weekly: ' + fmtDate(sd) + ' — ' + fmtDate(ed);
        btnText = '📅 ' + fmtDate(sd) + ' — ' + fmtDate(ed);
    } else {
        sd = d.getFullYear() + '-' + S(d.getMonth() + 1) + '-01';
        var ld = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        ed = d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(ld);
        title = mn[d.getMonth()] + ' ' + d.getFullYear();
        btnText = '📅 ' + mn[d.getMonth()] + ' ' + d.getFullYear();
    }
    
    var dateBtn = document.getElementById('reportDateBtn');
    if (dateBtn) dateBtn.textContent = btnText;
    
    var fS = dataInRange(allSales, sd, ed);
    var fE = dataInRange(allExpenses, sd, ed);
    var fP = dataInRange(allCreditPayments, sd, ed);
    var fW = dataInRange(allWaste, sd, ed);
    
    var tR = 0, tI = 0, tE = 0, cI = 0, uI = 0, hI = 0, wQ = 0;
    var cS = {};
    
    fS.forEach(function(s) {
        tR += s.quantity;
        tI += s.total;
        if (s.paymentType === 'cash') cI += s.total;
        else if (s.paymentType === 'upi') uI += s.total;
        else hI += s.total;
        
        var nm = s.customerName || 'Walk-in';
        if (!cS[nm]) cS[nm] = { r: 0, a: 0 };
        cS[nm].r += s.quantity;
        cS[nm].a += s.total;
    });
    
    var cE = {};
    fE.forEach(function(x) {
        tE += x.amount;
        var cn = catNm(x.category);
        if (!cE[cn]) cE[cn] = 0;
        cE[cn] += x.amount;
    });
    
    fW.forEach(function(w) { wQ += (w.quantity || 0); });
    
    var profit = tI - tE;
    var uRec = 0;
    fP.forEach(function(p) { uRec += p.amount; });
    
    rptData = { title: title, sd: sd, ed: ed, tR: tR, tI: tI, tE: tE, profit: profit, cI: cI, uI: uI, hI: hI, uRec: uRec, cS: cS, cE: cE, wQ: wQ };
    
    var h = '';
    h += '<div class="rp-card"><div class="rp-title">' + esc(title) + '</div></div>';
    h += '<div class="rp-card"><div class="rp-hero"><div class="rp-hero-v ' + (profit >= 0 ? 'green' : 'red') + '">' + (profit >= 0 ? '₹' : '-₹') + Math.abs(profit) + '</div><div class="rp-hero-l">Net Profit</div></div></div>';
    h += '<div class="rp-card"><div class="rp-title">📋 Summary</div>';
    
    [['Total Roti Sold', tR, ''], ['Total Income', '₹' + tI, 'green'], ['Cash Income', '₹' + cI, ''], ['UPI Income', '₹' + uI, ''], ['Credit Given', '₹' + hI, 'amber'], ['Credit Recovered', '₹' + uRec, 'green'], ['Total Expense', '₹' + tE, 'red'], ['Waste', wQ + ' roti', 'amber'], ['Net Profit', (profit >= 0 ? '₹' : '-₹') + Math.abs(profit), profit >= 0 ? 'green' : 'red']].forEach(function(r) {
        h += '<div class="rp-row"><span class="rp-lbl">' + r[0] + '</span><span class="rp-val ' + r[2] + '">' + r[1] + '</span></div>';
    });
    h += '</div>';
    
    var ca = Object.keys(cS);
    if (ca.length) {
        h += '<div class="rp-card"><div class="rp-title">👥 Customer Wise Sales</div>';
        ca.sort(function(a, b) { return cS[b].a - cS[a].a; });
        ca.forEach(function(n) {
            h += '<div class="rp-row"><span class="rp-lbl">' + esc(n) + ' (' + cS[n].r + ')</span><span class="rp-val">₹' + cS[n].a + '</span></div>';
        });
        h += '</div>';
    }
    
    var ea = Object.keys(cE);
    if (ea.length) {
        h += '<div class="rp-card"><div class="rp-title">🛒 Expense Breakdown</div>';
        ea.sort(function(a, b) { return cE[b] - cE[a]; });
        ea.forEach(function(cn) {
            var pct = tE > 0 ? Math.round(cE[cn] / tE * 100) : 0;
            h += '<div class="rp-row"><span class="rp-lbl">' + esc(cn) + ' (' + pct + '%)</span><span class="rp-val red">₹' + cE[cn] + '</span></div>';
        });
        h += '</div>';
    }
    
    var contentEl = document.getElementById('reportContent');
    if (contentEl) contentEl.innerHTML = h;
    setTimeout(function() { renderCharts(sd, ed); }, 150);
}

function renderCharts(sd, ed) {
    if (typeof Chart === 'undefined') {
        var section = document.getElementById('chartSection');
        if (section) section.innerHTML = '<div class="chart-card"><div class="chart-empty">📊 Charts unavailable (offline)</div></div>';
        return;
    }
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    var textColor = isDark ? '#565d80' : '#9ca3af';
    
    renderSalesChart(sd, ed, gridColor, textColor, isDark);
    renderExpenseChart(sd, ed, textColor, isDark);
}

function renderSalesChart(sd, ed, gridColor, textColor, isDark) {
    var ctx = document.getElementById('salesChart');
    if (!ctx) return;
    
    var salesByDay = {};
    var d = new Date(sd + 'T00:00:00'), end = new Date(ed + 'T00:00:00');
    while (d <= end) {
        var ds = d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(d.getDate());
        salesByDay[ds] = 0;
        d.setDate(d.getDate() + 1);
    }
    
    dataInRange(allSales, sd, ed).forEach(function(s) {
        if (salesByDay[s.date] !== undefined) salesByDay[s.date] += s.total;
    });
    
    var labels = Object.keys(salesByDay).map(function(dt) {
        var p = dt.split('-');
        return p[2] + '/' + p[1];
    });
    var values = Object.values(salesByDay);
    
    try {
        if (salesChart) { salesChart.destroy(); salesChart = null; }
        var parent = ctx.parentElement;
        if (!parent || parent.offsetHeight === 0) return;
        
        salesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales (₹)',
                    data: values,
                    backgroundColor: 'rgba(230,81,0,0.75)',
                    hoverBackgroundColor: 'rgba(230,81,0,0.95)',
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 500, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#161726' : '#fff',
                        titleColor: isDark ? '#f1f2f9' : '#111',
                        bodyColor: isDark ? '#9399b8' : '#4b5563',
                        borderColor: isDark ? '#252638' : '#e8eaf0',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 10,
                        callbacks: {
                            label: function(c) { return '₹' + c.parsed.y; }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: textColor, font: { size: 9 }, maxRotation: 45 } }
                }
            }
        });
    } catch (err) {
        console.error('[Chart] Sales:', err);
    }
}

function renderExpenseChart(sd, ed, textColor, isDark) {
    var ctx = document.getElementById('expenseChart');
    var cardEl = document.getElementById('expenseChartCard');
    if (!ctx || !cardEl) return;
    
    var expByCat = {};
    dataInRange(allExpenses, sd, ed).forEach(function(e) {
        var cat = catNm(e.category);
        expByCat[cat] = (expByCat[cat] || 0) + e.amount;
    });
    
    var eLabels = Object.keys(expByCat), eValues = Object.values(expByCat);
    
    if (expenseChart) { expenseChart.destroy(); expenseChart = null; }
    
    if (!eValues.length || !eValues.some(function(v) { return v > 0; })) {
        cardEl.innerHTML = '<h4 class="chart-title">🥧 Expense Breakdown</h4><div class="chart-empty">No expenses in this period</div>';
        return;
    }
    
    if (!cardEl.querySelector('canvas')) {
        cardEl.innerHTML = '<h4 class="chart-title">🥧 Expense Breakdown</h4><div class="chart-wrap chart-sm"><canvas id="expenseChart"></canvas></div>';
        ctx = document.getElementById('expenseChart');
    }
    
    try {
        var parent = ctx.parentElement;
        if (!parent || parent.offsetHeight === 0) return;
        
        expenseChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: eLabels,
                datasets: [{
                    data: eValues,
                    backgroundColor: ['#e65100', '#ff8f00', '#f44336', '#7c4dff', '#2196f3', '#00c853', '#ff5722'],
                    hoverOffset: 6,
                    borderWidth: 2,
                    borderColor: isDark ? '#161726' : '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 500, easing: 'easeOutQuart' },
                cutout: '62%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, font: { size: 11, weight: '600' }, padding: 12, usePointStyle: true, pointStyleWidth: 10 }
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#161726' : '#fff',
                        titleColor: isDark ? '#f1f2f9' : '#111',
                        bodyColor: isDark ? '#9399b8' : '#4b5563',
                        borderColor: isDark ? '#252638' : '#e8eaf0',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                var total = context.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                                var pct = total > 0 ? Math.round(context.parsed / total * 100) : 0;
                                return context.label + ': ₹' + context.parsed + ' (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error('[Chart] Expense:', err);
    }
}

function generatePDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('❌ PDF library not loaded. Check internet.', 'error');
        return;
    }
    
    try {
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF('p', 'mm', 'a4');
        var rd = rptData;
        
        if (!rd.title) {
            showToast('❌ Load a report first!', 'error');
            return;
        }
        
        var pdfBtn = document.querySelector('.pdf-btn');
        if (pdfBtn) {
            pdfBtn.disabled = true;
            pdfBtn.textContent = '⏳ Generating PDF...';
        }
        
        var W = 210, mL = 14, mR = 14, cW = W - mL - mR;
        
        doc.setFillColor(26, 26, 46);
        doc.rect(0, 0, W, 40, 'F');
        doc.setFillColor(230, 81, 0);
        doc.rect(0, 38, W, 3, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('MERI DUKAAN', mL, 17);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Business Report', mL, 23);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(rd.title, mL, 33);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('Generated: ' + new Date().toLocaleString(), W - mR, 33, { align: 'right' });
        
        var y = 50;
        var pc = rd.profit >= 0 ? [0, 150, 50] : [200, 40, 40];
        doc.setFillColor(pc[0], pc[1], pc[2]);
        doc.roundedRect(mL, y, cW, 18, 3, 3, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text('NET PROFIT', mL + 8, y + 8);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Rs. ' + Math.abs(rd.profit) + (rd.profit < 0 ? ' (Loss)' : ''), W - mR - 8, y + 13, { align: 'right' });
        y += 26;
        
        doc.setTextColor(26, 26, 46);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('SUMMARY', mL, y);
        y += 3;
        
        doc.autoTable({
            startY: y,
            margin: { left: mL, right: mR },
            head: [['Item', 'Value']],
            body: [
                ['Total Roti Sold', rd.tR.toString()],
                ['Total Income', 'Rs. ' + rd.tI],
                ['Cash Income', 'Rs. ' + rd.cI],
                ['UPI Income', 'Rs. ' + rd.uI],
                ['Credit Given', 'Rs. ' + rd.hI],
                ['Credit Recovered', 'Rs. ' + rd.uRec],
                ['Total Expense', 'Rs. ' + rd.tE],
                ['Waste', rd.wQ + ' roti'],
                ['Net Profit', 'Rs. ' + (rd.profit >= 0 ? '' : '-') + Math.abs(rd.profit)]
            ],
            theme: 'grid',
            headStyles: { fillColor: [230, 81, 0], textColor: 255, fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
            alternateRowStyles: { fillColor: [255, 248, 240] },
            columnStyles: { 0: { cellWidth: cW * 0.6 }, 1: { cellWidth: cW * 0.4, halign: 'right', fontStyle: 'bold' } }
        });
        
        y = doc.lastAutoTable.finalY + 10;
        var ca = Object.keys(rd.cS);
        if (ca.length) {
            if (y > 240) { doc.addPage(); y = 20; }
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(230, 81, 0);
            doc.text('CUSTOMER WISE SALES', mL, y);
            y += 3;
            ca.sort(function(a, b) { return rd.cS[b].a - rd.cS[a].a; });
            
            doc.autoTable({
                startY: y,
                margin: { left: mL, right: mR },
                head: [['Customer', 'Roti', 'Amount']],
                body: ca.map(function(n) { return [n, rd.cS[n].r.toString(), 'Rs. ' + rd.cS[n].a]; }),
                theme: 'striped',
                headStyles: { fillColor: [26, 26, 46], textColor: 255, fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 9 },
                columnStyles: { 0: { cellWidth: cW * 0.45 }, 1: { cellWidth: cW * 0.2, halign: 'center' }, 2: { cellWidth: cW * 0.35, halign: 'right', fontStyle: 'bold' } }
            });
            y = doc.lastAutoTable.finalY + 10;
        }
        
        var ea = Object.keys(rd.cE);
        if (ea.length) {
            if (y > 240) { doc.addPage(); y = 20; }
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(200, 40, 40);
            doc.text('EXPENSE BREAKDOWN', mL, y);
            y += 3;
            ea.sort(function(a, b) { return rd.cE[b] - rd.cE[a]; });
            
            doc.autoTable({
                startY: y,
                margin: { left: mL, right: mR },
                head: [['Category', '%', 'Amount']],
                body: ea.map(function(cn) {
                    var pct = rd.tE > 0 ? Math.round(rd.cE[cn] / rd.tE * 100) : 0;
                    return [cn, pct + '%', 'Rs. ' + rd.cE[cn]];
                }),
                theme: 'striped',
                headStyles: { fillColor: [200, 40, 40], textColor: 255, fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 9 },
                columnStyles: { 0: { cellWidth: cW * 0.45 }, 1: { cellWidth: cW * 0.2, halign: 'center' }, 2: { cellWidth: cW * 0.35, halign: 'right', fontStyle: 'bold' } }
            });
        }
        
        var totalPages = doc.internal.getNumberOfPages();
        for (var i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFillColor(245, 245, 245);
            doc.rect(0, 287, W, 10, 'F');
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'normal');
            doc.text('Meri Dukaan v6.0 — Business Report', mL, 292);
            doc.text('Page ' + i + '/' + totalPages, W - mR, 292, { align: 'right' });
        }
        
        doc.save('MeriDukaan_' + curReport + '_' + todayStr() + '.pdf');
        showToast('✅ PDF downloaded!');
        
    } catch (err) {
        console.error('[PDF]', err);
        showToast('❌ PDF generation failed!', 'error');
    } finally {
        var pdfBtn2 = document.querySelector('.pdf-btn');
        if (pdfBtn2) {
            pdfBtn2.disabled = false;
            pdfBtn2.textContent = '📄 Download PDF Report';
        }
    }
}

console.log('[Reports] Reports module loaded');