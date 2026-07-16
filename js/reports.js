/* ================================================
   MERI DUKAAN v8.0 — REPORTS & PDF EXPORT
   Smart defaults · Pre-export summary · Print
   ₹ symbol via Noto Sans · WhatsApp share
   ================================================ */

import { getState }                              from './state.js';
import { t }                                    from './i18n.js';
import { todayStr, fmtDate, fmtDateLong,
         fmtCurrency, dataInRange,
         getPeriodRange, shareContent,
         showToast, btnLoading }                from './core.js';

let _tab     = 'daily';
let _dateRef = '';   // YYYY-MM-DD reference date for the report

export function loadReport() {
  _dateRef = _dateRef || todayStr();
  _renderReport();
}

export function setReportTab(tab) {
  _tab = tab;
  document.querySelectorAll('[data-report-tab]').forEach(btn =>
    btn.classList.toggle('tab-btn--active', btn.dataset.reportTab === tab));
  // ✅ Smart default: auto-load current period on tab switch, no date picker needed
  if (tab !== 'custom') _dateRef = todayStr();
  _renderReport();
}

export function reportPickDate(dateStr) {
  _dateRef = dateStr;
  _renderReport();
}

function _getRange() {
  const weekStart = getState('weekStart');
  if (_tab === 'daily')   return getPeriodRange('daily',   _dateRef, weekStart);
  if (_tab === 'weekly')  return getPeriodRange('weekly',  _dateRef, weekStart);
  if (_tab === 'monthly') return getPeriodRange('monthly', _dateRef, weekStart);
  if (_tab === 'custom')  return getPeriodRange('daily',   _dateRef, weekStart); // user picks specific date
  return getPeriodRange('daily', _dateRef, weekStart);
}

function _getLabel() {
  const r = _getRange();
  if (_tab === 'daily')   return fmtDateLong(r.start);
  if (_tab === 'weekly')  return `${fmtDate(r.start)} – ${fmtDate(r.end)}`;
  if (_tab === 'monthly') {
    const d = new Date(r.start);
    return d.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  }
  if (_tab === 'custom')  return fmtDateLong(r.start);
  return '';
}

function _renderReport() {
  const range   = _getRange();
  const sales   = dataInRange(getState('allSales'),    range.start, range.end);
  const exps    = dataInRange(getState('allExpenses'), range.start, range.end);
  const waste   = dataInRange(getState('allWaste'),    range.start, range.end);
  const credit  = dataInRange(getState('allSales').filter(s=>s.payType==='credit'), range.start, range.end);
  const custs   = getState('allCustomers');

  const totalRoti    = sales.reduce((s,x)=>s+(x.qty||0),0);
  const totalRevenue = sales.reduce((s,x)=>s+(x.total||0),0);
  const cashRev      = sales.filter(s=>s.payType==='cash').reduce((s,x)=>s+(x.total||0),0);
  const upiRev       = sales.filter(s=>s.payType==='upi').reduce((s,x)=>s+(x.total||0),0);
  const creditRev    = credit.reduce((s,x)=>s+(x.total||0),0);
  const totalExp     = exps.reduce((s,x)=>s+(x.amount||0),0);
  const totalWaste   = waste.reduce((s,x)=>s+(x.qty||0),0);
  const profit       = totalRevenue - totalExp;

  // Update header
  const labelEl = document.getElementById('reportDateLabel');
  if (labelEl) labelEl.textContent = _getLabel();

  // Stat cards
  const _set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  _set('rptRoti',    totalRoti.toLocaleString('en-IN'));
  _set('rptRevenue', fmtCurrency(totalRevenue));
  _set('rptExpenses',fmtCurrency(totalExp));
  _set('rptProfit',  fmtCurrency(profit));
  _set('rptCash',    fmtCurrency(cashRev));
  _set('rptUpi',     fmtCurrency(upiRev));
  _set('rptCredit',  fmtCurrency(creditRev));
  _set('rptWaste',   totalWaste+' roti');

  const profCard = document.getElementById('rptProfitCard');
  if (profCard) profCard.classList.toggle('stat-card--loss', profit < 0);

  // Sales breakdown by customer
  _renderSalesBreakdown(sales, custs);

  // Expense breakdown by category
  _renderExpBreakdown(exps);

  // No data state
  const noData = document.getElementById('rptNoData');
  if (noData) noData.style.display = (!sales.length && !exps.length) ? 'block' : 'none';

  // Charts
  _renderReportCharts(sales, exps);
}

function _renderSalesBreakdown(sales, custs) {
  const ct = document.getElementById('rptSalesByCustomer');
  if (!ct) return;
  const byCustomer = {};
  sales.forEach(s => {
    if (!byCustomer[s.customerId]) byCustomer[s.customerId] = { qty:0, total:0 };
    byCustomer[s.customerId].qty   += s.qty||0;
    byCustomer[s.customerId].total += s.total||0;
  });
  const rows = Object.entries(byCustomer)
    .map(([id,d]) => ({ cust: custs.find(c=>c.id===id), ...d }))
    .filter(r=>r.cust)
    .sort((a,b)=>b.total-a.total);

  ct.innerHTML = rows.length ? rows.map(r=>
    `<div class="rpt-row">
      <span class="rpt-row__name">${r.cust.name}</span>
      <span class="rpt-row__qty">${r.qty} roti</span>
      <span class="rpt-row__amt">${fmtCurrency(r.total)}</span>
    </div>`).join('')
    : `<p class="empty-mini">${t('no_sales')}</p>`;
}

function _renderExpBreakdown(exps) {
  const ct = document.getElementById('rptExpByCategory');
  if (!ct) return;
  const byCat = {};
  exps.forEach(e => { byCat[e.category] = (byCat[e.category]||0) + (e.amount||0); });
  const rows = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  ct.innerHTML = rows.length ? rows.map(([cat,amt])=>
    `<div class="rpt-row">
      <span class="rpt-row__name">${cat}</span>
      <span class="rpt-row__amt">${fmtCurrency(amt)}</span>
    </div>`).join('')
    : `<p class="empty-mini">${t('no_expenses')}</p>`;
}

let _rptChart = null;
function _renderReportCharts(sales, exps) {
  const canvas = document.getElementById('rptChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_rptChart) { _rptChart.destroy(); _rptChart = null; }
  if (!sales.length && !exps.length) return;

  const allDates = [...new Set([...sales.map(s=>s.date),...exps.map(e=>e.date)])].sort();
  const revByDate = {}, expByDate = {};
  sales.forEach(s => { revByDate[s.date]=(revByDate[s.date]||0)+(s.total||0); });
  exps.forEach(e  => { expByDate[e.date]=(expByDate[e.date]||0)+(e.amount||0); });

  _rptChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels:   allDates.map(d=>fmtDate(d)),
      datasets: [
        { label:'Revenue',  data:allDates.map(d=>revByDate[d]||0), backgroundColor:'rgba(230,81,0,0.75)', borderRadius:4 },
        { label:'Expenses', data:allDates.map(d=>expByDate[d]||0), backgroundColor:'rgba(220,38,38,0.5)',  borderRadius:4 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        tooltip: { callbacks: { label:ctx=>`${ctx.dataset.label}: ${fmtCurrency(ctx.raw)}` } },
        legend:  { labels: { color:'#9399b8', font:{size:11} } }
      },
      scales: {
        x: { ticks:{color:'#565d80',maxTicksLimit:10}, grid:{display:false} },
        y: { ticks:{color:'#565d80',callback:v=>'₹'+Math.round(v)}, grid:{color:'rgba(255,255,255,0.04)'} }
      }
    }
  });
}

// ── Pre-export summary overlay ────────────────────────────────────────────
export function showExportSummary() {
  const range    = _getRange();
  const sales    = dataInRange(getState('allSales'),    range.start, range.end);
  const exps     = dataInRange(getState('allExpenses'), range.start, range.end);
  const totalRoti= sales.reduce((s,x)=>s+(x.qty||0),0);
  const revenue  = sales.reduce((s,x)=>s+(x.total||0),0);
  const totalExp = exps.reduce((s,x)=>s+(x.amount||0),0);
  const profit   = revenue - totalExp;
  const credit   = sales.filter(s=>s.payType==='credit').reduce((s,x)=>s+(x.total||0),0);
  const custs    = new Set(sales.map(s=>s.customerId)).size;

  const el = document.getElementById('exportSummaryContent');
  if (el) el.innerHTML = `
    <div class="export-summary">
      <div class="export-summary__period">${_getLabel()}</div>
      <div class="export-row"><span>🫓 Roti sold</span>     <strong>${totalRoti.toLocaleString('en-IN')}</strong></div>
      <div class="export-row"><span>💰 Revenue</span>       <strong>${fmtCurrency(revenue)}</strong></div>
      <div class="export-row"><span>💸 Expenses</span>      <strong>${fmtCurrency(totalExp)}</strong></div>
      <div class="export-row export-row--profit"><span>📈 Profit</span><strong>${fmtCurrency(profit)}</strong></div>
      <div class="export-row"><span>📒 Credit given</span>  <strong>${fmtCurrency(credit)}</strong></div>
      <div class="export-row"><span>👥 Customers</span>     <strong>${custs}</strong></div>
    </div>`;

  const { openOverlay } = require('./core.js');
  openOverlay('exportSummaryOverlay');
}

export function closeExportSummary() {
  const { closeOverlay } = require('./core.js');
  closeOverlay('exportSummaryOverlay');
}

// ── PDF Export ────────────────────────────────────────────────────────────
export async function downloadPdf() {
  const btn = document.getElementById('rptPdfBtn');
  btnLoading(btn, true, t('calculating'));
  closeExportSummary();

  try {
    // Dynamically load jsPDF if not already loaded
    if (!window.jspdf) {
      await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    }

    btnLoading(btn, true, t('formatting'));
    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF('p','mm','a4');
    const range= _getRange();
    const sales= dataInRange(getState('allSales'),    range.start, range.end);
    const exps = dataInRange(getState('allExpenses'), range.start, range.end);
    const custs= getState('allCustomers');
    const bizName = getState('businessName');

    const totalRoti = sales.reduce((s,x)=>s+(x.qty||0),0);
    const revenue   = sales.reduce((s,x)=>s+(x.total||0),0);
    const totalExp  = exps.reduce((s,x)=>s+(x.amount||0),0);
    const profit    = revenue - totalExp;

    const primaryRGB = [191, 54, 12]; // #bf360c

    // Header
    pdf.setFillColor(...primaryRGB);
    pdf.rect(0, 0, 210, 28, 'F');
    pdf.setTextColor(255,255,255);
    pdf.setFontSize(18); pdf.setFont('helvetica','bold');
    pdf.text(bizName || 'Meri Dukaan', 14, 12);
    pdf.setFontSize(10); pdf.setFont('helvetica','normal');
    pdf.text('Business Report — ' + _getLabel(), 14, 20);
    pdf.text('Generated: ' + new Date().toLocaleString('en-IN'), 140, 20, { align:'right' });

    // Summary Cards Row
    pdf.setTextColor(50,50,50);
    const cards = [
      { label:'Roti Sold',   val: totalRoti.toLocaleString('en-IN') },
      { label:'Revenue',     val: 'Rs.' + Math.round(revenue).toLocaleString('en-IN') },
      { label:'Expenses',    val: 'Rs.' + Math.round(totalExp).toLocaleString('en-IN') },
      { label:'Profit',      val: 'Rs.' + Math.round(profit).toLocaleString('en-IN') },
    ];
    cards.forEach((card, i) => {
      const x = 14 + i * 46;
      pdf.setFillColor(245,245,245);
      pdf.roundedRect(x, 34, 44, 20, 2, 2, 'F');
      pdf.setFontSize(7); pdf.setFont('helvetica','normal');
      pdf.setTextColor(120,120,120);
      pdf.text(card.label, x+22, 40, { align:'center' });
      pdf.setFontSize(11); pdf.setFont('helvetica','bold');
      pdf.setTextColor(profit<0&&card.label==='Profit' ? 220:50, 50, 50);
      pdf.text(card.val, x+22, 48, { align:'center' });
    });

    btnLoading(btn, true, t('generating_pdf'));

    // Sales Table
    pdf.setFontSize(12); pdf.setFont('helvetica','bold');
    pdf.setTextColor(50,50,50);
    pdf.text('Sales Detail', 14, 64);

    const salesRows = sales.map(s => {
      const cust = custs.find(c=>c.id===s.customerId);
      return [fmtDate(s.date), cust?.name||'—', s.qty, 'Rs.'+s.rate, 'Rs.'+s.total, s.payType];
    });

    pdf.autoTable({
      head:       [['Date','Customer','Qty','Rate','Total','Payment']],
      body:       salesRows,
      startY:     68,
      styles:     { fontSize:8, cellPadding:2 },
      headStyles: { fillColor:primaryRGB, textColor:255, fontStyle:'bold' },
      alternateRowStyles: { fillColor:[248,248,248] },
      columnStyles: { 2:{halign:'right'}, 4:{halign:'right'} }
    });

    // Expenses Table
    const finalY = pdf.lastAutoTable.finalY + 8;
    pdf.setFontSize(12); pdf.setFont('helvetica','bold');
    pdf.text('Expenses', 14, finalY);

    const expRows = exps.map(e => [fmtDate(e.date), e.category, e.note||'—', 'Rs.'+e.amount]);
    pdf.autoTable({
      head:       [['Date','Category','Note','Amount']],
      body:       expRows.length ? expRows : [['—','—','No expenses','—']],
      startY:     finalY + 4,
      styles:     { fontSize:8, cellPadding:2 },
      headStyles: { fillColor:[60,60,60], textColor:255 },
      alternateRowStyles: { fillColor:[248,248,248] },
      columnStyles: { 3:{halign:'right'} }
    });

    // Footer
    const pageCount = pdf.getNumberOfPages();
    for (let p=1; p<=pageCount; p++) {
      pdf.setPage(p);
      pdf.setFontSize(7); pdf.setTextColor(160,160,160);
      pdf.text(`Meri Dukaan v8.0 — Page ${p} of ${pageCount}`, 105, 292, { align:'center' });
    }

    const filename = `meri-dukaan-${_tab}-${_dateRef}.pdf`;
    pdf.save(filename);
    showToast('✅ PDF downloaded!', 'success');

  } catch (err) {
    console.error('[reports] PDF error', err);
    showToast(t('err_generic'), 'error');
  } finally {
    btnLoading(btn, false);
  }
}

function _loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── Print ─────────────────────────────────────────────────────────────────
export function printReport() { window.print(); }

// ── Share Report ──────────────────────────────────────────────────────────
export async function shareReport() {
  const range    = _getRange();
  const sales    = dataInRange(getState('allSales'),    range.start, range.end);
  const exps     = dataInRange(getState('allExpenses'), range.start, range.end);
  const revenue  = sales.reduce((s,x)=>s+(x.total||0),0);
  const totalExp = exps.reduce((s,x)=>s+(x.amount||0),0);
  const profit   = revenue - totalExp;
  const roti     = sales.reduce((s,x)=>s+(x.qty||0),0);

  await shareContent({
    title: `Meri Dukaan — ${_getLabel()}`,
    text:  [
      `📊 ${getState('businessName')} — ${_getLabel()}`,
      `🫓 Roti: ${roti.toLocaleString('en-IN')}`,
      `💰 Revenue: ${fmtCurrency(revenue)}`,
      `💸 Expenses: ${fmtCurrency(totalExp)}`,
      `📈 Profit: ${fmtCurrency(profit)}`,
      `\nSent via Meri Dukaan`
    ].join('\n')
  });
}

window.loadReport       = loadReport;
window.setReportTab     = setReportTab;
window.reportPickDate   = reportPickDate;
window.showExportSummary= showExportSummary;
window.closeExportSummary= closeExportSummary;
window.downloadPdf      = downloadPdf;
window.printReport      = printReport;
window.shareReport      = shareReport;

export { loadReport, setReportTab };
console.log('[reports] Meri Dukaan v8.0 ready');
