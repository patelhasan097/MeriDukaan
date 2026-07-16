/* ================================================
   MERI DUKAAN v8.0 — ANALYTICS
   All sections update together on window change.
   Fixed: linearRegression div-by-zero guard.
   Fixed: kgPerRoti validation.
   ================================================ */

import { getState }                             from './state.js';
import { t }                                    from './i18n.js';
import { todayStr, fmtCurrency, fmtDate,
         dataInRange, getPeriodRange,
         buildWhatsAppLink }                    from './core.js';

let _window = 30;   // days
let _charts  = {};  // Chart.js instances

export function renderAnalytics() {
  const ct = document.getElementById('analyticsScreen');
  if (!ct || !ct.classList.contains('screen--active')) return;

  const sales    = getState('allSales');
  const expenses = getState('allExpenses');
  const waste    = getState('allWaste');
  const custs    = getState('allCustomers');

  if (sales.length < 3) {
    const msg = document.getElementById('analyticsNoData');
    if (msg) msg.style.display = 'block';
    return;
  }
  const msg = document.getElementById('analyticsNoData');
  if (msg) msg.style.display = 'none';

  // Compute date window
  const endDate   = todayStr();
  const startD    = new Date();
  startD.setDate(startD.getDate() - _window);
  const startDate = _window === 9999 ? '2000-01-01'
    : `${startD.getFullYear()}-${String(startD.getMonth()+1).padStart(2,'0')}-${String(startD.getDate()).padStart(2,'0')}`;

  const wSales = dataInRange(sales,    startDate, endDate);
  const wExps  = dataInRange(expenses, startDate, endDate);
  const wWaste = dataInRange(waste,    startDate, endDate);

  // All 6 sections update together ← v7 bug: only 2 updated
  _renderPerRotiCard(wSales, wExps, wWaste);
  _renderRevenueTrend(wSales);
  _renderUnitEconomics(wSales, wExps);
  _renderStockTracker(expenses, sales);
  _renderCustomerInsights(wSales, custs);
  _renderSmartInsights(wSales, wExps, custs, wWaste);
}

export function setAnalyticsWindow(days, btn) {
  _window = days;
  document.querySelectorAll('[data-analytics-window]').forEach(b =>
    b.classList.toggle('window-btn--active', parseInt(b.dataset.analyticsWindow) === days));
  renderAnalytics();
}

// ── Per-Roti Profit Breakdown (Hero Card) ────────────────────────────────
function _renderPerRotiCard(sales, exps, waste) {
  const totalQty     = sales.reduce((s,x) => s + (x.qty||0), 0);
  const totalRevenue = sales.reduce((s,x) => s + (x.total||0), 0);
  if (!totalQty) return;

  const revenuePerRoti = totalRevenue / totalQty;

  // Expense breakdown per roti
  const catCost = {};
  exps.forEach(e => {
    const cat = e.category || 'Other';
    catCost[cat] = (catCost[cat]||0) + (e.amount||0);
  });
  const totalExp       = Object.values(catCost).reduce((s,v)=>s+v,0);
  const costPerRoti    = totalExp / totalQty;
  const wasteQty       = waste.reduce((s,x) => s + (x.qty||0), 0);
  const wasteCostPerR  = (wasteQty / totalQty) * revenuePerRoti;
  const profitPerRoti  = revenuePerRoti - costPerRoti;
  const margin         = totalRevenue > 0 ? (profitPerRoti / revenuePerRoti * 100) : 0;

  const _set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  _set('arRevenuePerRoti', fmtCurrency(revenuePerRoti, 2));
  _set('arCostPerRoti',    fmtCurrency(costPerRoti, 2));
  _set('arWasteCostPerR',  fmtCurrency(wasteCostPerR, 2));
  _set('arProfitPerRoti',  fmtCurrency(profitPerRoti, 2));
  _set('arMargin',         Math.round(margin) + '%');

  // Cost breakdown bars
  const breakdownEl = document.getElementById('arCostBreakdown');
  if (breakdownEl && totalQty) {
    breakdownEl.innerHTML = Object.entries(catCost)
      .sort((a,b) => b[1]-a[1])
      .map(([cat, amt]) => {
        const perRoti = amt / totalQty;
        const pct     = totalExp > 0 ? (amt/totalExp*100).toFixed(0) : 0;
        return `<div class="cost-bar-row">
          <span class="cost-bar__label">${cat}</span>
          <div class="cost-bar__track"><div class="cost-bar__fill" style="width:${pct}%"></div></div>
          <span class="cost-bar__val">${fmtCurrency(perRoti, 2)}/roti</span>
        </div>`;
      }).join('');
  }
}

// ── Revenue Trend Chart ──────────────────────────────────────────────────
function _renderRevenueTrend(sales) {
  const canvas = document.getElementById('revenueTrendChart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Group by date
  const byDate = {};
  sales.forEach(s => { byDate[s.date] = (byDate[s.date]||0) + (s.total||0); });
  const dates    = Object.keys(byDate).sort();
  const revenues = dates.map(d => byDate[d]);

  // 7-day rolling average
  const rolling = revenues.map((_,i) => {
    const slice = revenues.slice(Math.max(0,i-6), i+1);
    return slice.reduce((s,v)=>s+v,0) / slice.length;
  });

  // Linear regression forecast
  const n = revenues.length;
  if (n >= 7) {
    const forecast = _linearRegression(revenues.map((_,i)=>i), revenues);
    const nextDays = [n, n+1, n+2].map(x => Math.max(0, forecast.predict(x)));
    // Could render forecast as dotted extension — for now just show r²
    const r2El = document.getElementById('arForecastR2');
    if (r2El) r2El.textContent = `Trend confidence: ${Math.round(forecast.r2 * 100)}%`;
  }

  if (_charts.revenue) _charts.revenue.destroy();
  _charts.revenue = new Chart(canvas, {
    type: 'bar',
    data: {
      labels:   dates.map(d => fmtDate(d)),
      datasets: [
        {
          label:           'Revenue',
          data:            revenues,
          backgroundColor: 'rgba(230,81,0,0.7)',
          borderRadius:    4,
          order:           2,
        },
        {
          label:           '7-day avg',
          data:            rolling,
          type:            'line',
          borderColor:     '#ff9d5c',
          borderWidth:     2,
          pointRadius:     0,
          fill:            false,
          tension:         0.4,
          order:           1,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          enabled: true,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${fmtCurrency(ctx.raw)}`
          }
        },
        legend: { labels: { color: '#9399b8', font: { size: 11 } } },
        zoom: { zoom: { wheel: { enabled: false }, pinch: { enabled: true }, mode: 'x' } }
      },
      scales: {
        x: { ticks: { color: '#565d80', maxTicksLimit: 8 }, grid: { display: false } },
        y: { ticks: { color: '#565d80', callback: v => '₹'+Math.round(v) }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ── Unit Economics ────────────────────────────────────────────────────────
function _renderUnitEconomics(sales, exps) {
  const canvas = document.getElementById('unitEconChart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Daily profit summary
  const byDate = {};
  sales.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = { rev:0, exp:0 };
    byDate[s.date].rev += s.total||0;
  });
  exps.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = { rev:0, exp:0 };
    byDate[e.date].exp += e.amount||0;
  });

  const dates   = Object.keys(byDate).sort();
  const profits = dates.map(d => byDate[d].rev - byDate[d].exp);
  const revenues= dates.map(d => byDate[d].rev);

  if (_charts.unitEcon) _charts.unitEcon.destroy();
  _charts.unitEcon = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates.map(d => fmtDate(d)),
      datasets: [
        {
          label:       'Revenue',
          data:        revenues,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          fill:        true, tension: 0.4, pointRadius: 2,
        },
        {
          label:       'Profit',
          data:        profits,
          borderColor: '#059669',
          backgroundColor: 'rgba(5,150,105,0.08)',
          fill:        true, tension: 0.4, pointRadius: 2,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtCurrency(ctx.raw)}` } },
        legend:  { labels: { color: '#9399b8', font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { color:'#565d80', maxTicksLimit:8 }, grid:{ display:false } },
        y: { ticks: { color:'#565d80', callback: v=>'₹'+Math.round(v) }, grid:{ color:'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ── Stock Tracker ────────────────────────────────────────────────────────
function _renderStockTracker(allExps, allSales) {
  const ct = document.getElementById('stockTrackerContent');
  if (!ct) return;

  const today  = todayStr();
  const d30    = new Date(); d30.setDate(d30.getDate()-30);
  const start30 = d30.toISOString().split('T')[0];
  const recentExps  = dataInRange(allExps,  start30, today);
  const recentSales = dataInRange(allSales, start30, today);

  const totalRotiSold = recentSales.reduce((s,x)=>s+(x.qty||0),0);

  // Atta
  const attaBuys = recentExps.filter(e => /atta|flour|maida|gehu|wheat/i.test(e.category||''));
  const totalKg  = attaBuys.reduce((s,e) => {
    if (e.unit === 'kg' && e.qty) return s + parseFloat(e.qty);
    return s;
  }, 0);

  // Guard: kgPerRoti must be reasonable (0.01–0.1)
  let kgPerRoti = 0.023;
  if (totalKg > 0 && totalRotiSold > 100) {
    const calc = totalKg / totalRotiSold;
    if (calc >= 0.005 && calc <= 0.15) kgPerRoti = calc;
  }

  const lastAttaBuy = attaBuys.sort((a,b)=>b.date.localeCompare(a.date))[0];
  const dailyRotiAvg = totalRotiSold / 30;
  const dailyAttaKg  = dailyRotiAvg * kgPerRoti;
  let   attaDaysLeft = 0;

  if (lastAttaBuy && lastAttaBuy.qty && lastAttaBuy.unit === 'kg') {
    const daysSinceBuy = Math.round((new Date()-new Date(lastAttaBuy.date))/86400000);
    const kgUsed       = daysSinceBuy * dailyAttaKg;
    const kgLeft       = Math.max(0, parseFloat(lastAttaBuy.qty) - kgUsed);
    attaDaysLeft       = dailyAttaKg > 0 ? Math.round(kgLeft / dailyAttaKg) : 0;
  }

  // Gas cylinder (cycle-based)
  const gasBuys   = recentExps.filter(e => /gas|cylinder|lpg/i.test(e.category||''));
  const lastGasBuy= gasBuys.sort((a,b)=>b.date.localeCompare(a.date))[0];
  const GAS_AVG_DAYS = 28;
  const gasDaysLeft  = lastGasBuy
    ? Math.max(0, GAS_AVG_DAYS - Math.round((new Date()-new Date(lastGasBuy.date))/86400000))
    : null;

  const _urgencyClass = (days) =>
    days === null ? 'stock-item--unknown' :
    days <= 2     ? 'stock-item--critical' :
    days <= 5     ? 'stock-item--low' : 'stock-item--ok';

  const bizName = getState('businessName');
  // Supplier contact from settings
  const supplierPhone = localStorage.getItem('mdSupplierPhone') || '';

  const _orderBtn = (item) => supplierPhone
    ? `<button class="btn btn--sm btn--whatsapp" onclick="orderStock('${item}')">Order Now 📱</button>` : '';

  ct.innerHTML = `
    <div class="stock-item ${_urgencyClass(attaDaysLeft)}">
      <div class="stock-item__icon">🌾</div>
      <div class="stock-item__info">
        <div class="stock-item__name">Atta (Wheat Flour)</div>
        <div class="stock-item__days">${attaDaysLeft > 0 ? `~${attaDaysLeft} days remaining` : 'Unknown — add purchase'}</div>
        <div class="stock-item__sub">${(kgPerRoti*1000).toFixed(0)}g per roti · ${dailyAttaKg.toFixed(1)}kg/day</div>
      </div>
      ${attaDaysLeft > 0 && attaDaysLeft <= 5 ? _orderBtn('Atta') : ''}
    </div>
    <div class="stock-item ${_urgencyClass(gasDaysLeft)}">
      <div class="stock-item__icon">🔥</div>
      <div class="stock-item__info">
        <div class="stock-item__name">Gas Cylinder</div>
        <div class="stock-item__days">${gasDaysLeft !== null ? `~${gasDaysLeft} days remaining` : 'Unknown — add purchase'}</div>
        <div class="stock-item__sub">Based on last refill date</div>
      </div>
      ${gasDaysLeft !== null && gasDaysLeft <= 3 ? _orderBtn('Gas') : ''}
    </div>
  `;
}

export function orderStock(item) {
  const phone = localStorage.getItem('mdSupplierPhone') || '';
  if (!phone) { alert('Add supplier phone in Settings → Payments'); return; }
  const bizName = getState('businessName');
  const msg = `Hello! ${bizName} needs ${item}. Please arrange delivery. Thank you.`;
  window.open(buildWhatsAppLink(phone, msg), '_blank');
}

// ── Customer Insights ────────────────────────────────────────────────────
function _renderCustomerInsights(sales, custs) {
  const ct = document.getElementById('custInsightsContent');
  if (!ct) return;

  const byCustomer = {};
  sales.forEach(s => {
    if (!byCustomer[s.customerId]) byCustomer[s.customerId] = { qty:0, revenue:0, days: new Set() };
    byCustomer[s.customerId].qty     += s.qty||0;
    byCustomer[s.customerId].revenue += s.total||0;
    byCustomer[s.customerId].days.add(s.date);
  });

  const ranked = Object.entries(byCustomer)
    .map(([id, data]) => {
      const cust = custs.find(c=>c.id===id);
      return { id, cust, ...data, dayCount: data.days.size };
    })
    .filter(r => r.cust)
    .sort((a,b) => b.revenue - a.revenue);

  if (!ranked.length) { ct.innerHTML = `<p class="empty-mini">${t('no_analytics')}</p>`; return; }

  const maxRev = ranked[0].revenue;
  ct.innerHTML = ranked.slice(0,8).map((r,i) => {
    const pct = maxRev > 0 ? Math.round(r.revenue/maxRev*100) : 0;
    return `<div class="cust-insight-row">
      <div class="cust-insight__rank">${i+1}</div>
      <div class="cust-insight__info">
        <button class="cust-insight__name" onclick="openCustomerProfile('${r.id}')">${r.cust.name}</button>
        <div class="cust-insight__bar"><div class="cust-insight__fill" style="width:${pct}%"></div></div>
        <span class="cust-insight__meta">${r.qty} roti · ${r.dayCount} days</span>
      </div>
      <span class="cust-insight__rev">${fmtCurrency(r.revenue)}</span>
    </div>`;
  }).join('');
}

// ── Smart Insights ───────────────────────────────────────────────────────
function _renderSmartInsights(sales, exps, custs, waste) {
  const ct = document.getElementById('smartInsightsContent');
  if (!ct) return;

  const insights = [];
  const today    = todayStr();
  const n        = new Set(sales.map(s=>s.date)).size;

  // ① Best day of week
  if (n >= 14) {
    const byDay = Array(7).fill(0).map(()=>({rev:0,cnt:0}));
    sales.forEach(s => {
      const day = new Date(s.date).getDay();
      byDay[day].rev += s.total||0;
      byDay[day].cnt++;
    });
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const avgAll   = byDay.filter(d=>d.cnt>0).reduce((s,d)=>s+d.rev/d.cnt,0)/byDay.filter(d=>d.cnt>0).length;
    const best     = byDay.reduce((b,d,i)=>d.cnt>0&&d.rev/d.cnt>b.avg?{i,avg:d.rev/d.cnt}:b,{i:-1,avg:0});
    if (best.i >= 0 && avgAll > 0) {
      const pct = Math.round((best.avg/avgAll-1)*100);
      insights.push({
        icon: '📅', type: 'info',
        title: t('best_day', dayNames[best.i], pct),
        body:  `Consider higher production on ${dayNames[best.i]}s`,
        confidence: n >= 30 ? 'high' : 'medium',
        based_on: n,
      });
    }
  }

  // ② Inactive customers
  custs.filter(c=>c.status==='active').forEach(c => {
    const lastSale = sales.filter(s=>s.customerId===c.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
    if (lastSale) {
      const days = Math.round((new Date()-new Date(lastSale.date))/86400000);
      if (days >= 5 && days < 60) {
        insights.push({
          icon: '👤', type: 'warning',
          title: `${c.name} hasn't ordered in ${days} days`,
          body:  `Last sale: ${fmtDate(lastSale.date)}`,
          confidence: 'high', based_on: 1,
          action: c.phone ? { label: t('whatsapp_remind'), fn: `sendWhatsAppReminder('${c.id}',0)` } : null,
        });
      }
    }
  });

  // ③ Revenue forecast
  if (n >= 14) {
    const dailyRevs = [];
    const sorted = [...new Set(sales.map(s=>s.date))].sort();
    sorted.forEach(d => { dailyRevs.push(sales.filter(s=>s.date===d).reduce((s,x)=>s+(x.total||0),0)); });
    const reg = _linearRegression(dailyRevs.map((_,i)=>i), dailyRevs);
    if (reg.r2 > 0.3 && reg.slope !== 0) {
      const dir   = reg.slope > 0 ? '📈 growing' : '📉 declining';
      const chg   = Math.abs(Math.round(reg.slope));
      insights.push({
        icon: '📊', type: reg.slope > 0 ? 'success' : 'warning',
        title: `Revenue trend: ${dir}`,
        body:  `~₹${chg}/day change. Forecast: ${fmtCurrency(Math.max(0,reg.predict(n+7)))} in 7 days.`,
        confidence: reg.r2 > 0.6 ? 'high' : 'medium',
        based_on: n,
      });
    }
  }

  // ④ Waste alert
  const totalQty   = sales.reduce((s,x)=>s+(x.qty||0),0);
  const totalWaste = waste.reduce((s,x)=>s+(x.qty||0),0);
  if (totalQty > 0 && totalWaste / totalQty > 0.1) {
    insights.push({
      icon: '♻️', type: 'warning',
      title: `Waste rate: ${Math.round(totalWaste/totalQty*100)}% of production`,
      body:  `${totalWaste} roti wasted out of ${totalQty} produced this period`,
      confidence: 'high', based_on: n,
    });
  }

  if (!insights.length) {
    ct.innerHTML = `<p class="empty-mini">Keep recording data — insights will appear after 14 days.</p>`;
    return;
  }

  ct.innerHTML = insights.map(ins => `
    <div class="insight-card insight-card--${ins.type}">
      <div class="insight-card__top">
        <span class="insight-icon">${ins.icon}</span>
        <div class="insight-body">
          <div class="insight-title">${ins.title}</div>
          <div class="insight-text">${ins.body}</div>
          ${ins.action ? `<button class="btn btn--sm btn--whatsapp mt-4" onclick="${ins.action.fn}">${ins.action.label}</button>` : ''}
        </div>
      </div>
      <div class="insight-meta">
        <span class="insight-confidence insight-confidence--${ins.confidence}">${t('insight_confidence_'+ins.confidence)}</span>
        <span class="insight-based">${t('insight_based_on', ins.based_on, _window)}</span>
      </div>
    </div>
  `).join('');
}

// ── Linear Regression ────────────────────────────────────────────────────
function _linearRegression(xs, ys) {
  const n   = xs.length;
  const sx  = xs.reduce((s,v)=>s+v,0);
  const sy  = ys.reduce((s,v)=>s+v,0);
  const sxy = xs.reduce((s,v,i)=>s+v*ys[i],0);
  const sxx = xs.reduce((s,v)=>s+v*v,0);
  const denom = n*sxx - sx*sx;

  // ✅ Guard against division by zero (all x values identical)
  if (denom === 0) return { slope:0, intercept: sy/n, r2:0, predict: ()=>sy/n };

  const slope     = (n*sxy - sx*sy) / denom;
  const intercept = (sy - slope*sx) / n;
  const yMean     = sy / n;
  const ssTot     = ys.reduce((s,v)=>s+Math.pow(v-yMean,2),0);
  const ssRes     = ys.reduce((s,v,i)=>s+Math.pow(v-(slope*xs[i]+intercept),2),0);
  const r2        = ssTot > 0 ? 1 - ssRes/ssTot : 0;
  const predict   = (x) => slope*x + intercept;
  return { slope, intercept, r2, predict };
}

window.setAnalyticsWindow = setAnalyticsWindow;
window.orderStock         = orderStock;
export { renderAnalytics, setAnalyticsWindow };
console.log('[analytics] Meri Dukaan v8.0 ready');
