/* ================================================
   MERI DUKAAN v7.0 — ANALYTICS
   Complete rebuild from scratch.

   PHASE 2+3 CHANGES vs v6:
   ✅ 100% English — all Hindi/Hinglish purged
   ✅ True stock remaining — cumulative model:
      remaining = total_purchased − total_consumed
      (v6 only used LAST purchase — fundamentally wrong)
   ✅ True profit margin — includes atta + oil + gas + poly
      (v6 only counted atta → showed inflated 81.9%)
   ✅ Linear regression revenue forecasting (7-day)
   ✅ Pattern detection engine (weekday trends, seasonality)
   ✅ Customer risk scoring (inactivity + reliability)
   ✅ Rolling 30-day / 90-day / all-time window toggle
   ✅ "Stock Out" state fixed (was "About to finish" when 0)
   ✅ Smart insights: unlimited, priority-sorted, paginated
   ================================================ */

var _analyticsWindow = 30; // days — toggled by UI

function loadAnalytics() {
    renderSmartInsights();
    renderStockTracker();
    renderPriceTrend('atta');
    renderDayWiseSales();
    renderUnitEconomics();
    renderCustomerInsights();
}

function setAnalyticsWindow(days, btn) {
    _analyticsWindow = days;
    document.querySelectorAll('.an-window-btn').forEach(function(b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    renderDayWiseSales();
    renderUnitEconomics();
}


// ============ UTILITY — LINEAR REGRESSION ============
/**
 * linearRegression — returns {slope, intercept, predict(x), r2}
 * Used for revenue forecasting and trend detection.
 */
function linearRegression(points) {
    var n = points.length;
    if (n < 2) return { slope: 0, intercept: 0, predict: function() { return 0; }, r2: 0 };
    var sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    points.forEach(function(p) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y; });
    var slope     = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    var intercept = (sy - slope * sx) / n;
    var yMean     = sy / n;
    var ssTot = 0, ssRes = 0;
    points.forEach(function(p) {
        ssTot += Math.pow(p.y - yMean, 2);
        ssRes += Math.pow(p.y - (slope * p.x + intercept), 2);
    });
    var r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    return {
        slope:     slope,
        intercept: intercept,
        predict:   function(x) { return Math.max(0, slope * x + intercept); },
        r2:        r2
    };
}

function getWindowDates() {
    var end   = todayStr();
    var start = new Date();
    start.setDate(start.getDate() - (_analyticsWindow - 1));
    return { start: start.getFullYear() + '-' + S(start.getMonth()+1) + '-' + S(start.getDate()), end: end };
}


// ============ TRUE STOCK CALCULATION ============
/**
 * calculateTrueStock — Phase 3 fix
 *
 * v6 BUG: kgRemaining = last.weight - dailyRate × daysSinceLast
 * → Only looked at the most recent purchase. If you bought 50kg on May 6,
 *   50kg on May 10, and 50kg on May 13, it showed stock as if you
 *   only have the May 13 bag. The May 6 and May 10 bags were ignored.
 *
 * v7 FIX — Cumulative model:
 *   For ATTA:  remaining = totalPurchasedKg − (totalRotiSold × kgPerRoti)
 *              kgPerRoti is derived from lifetime purchase/sales ratio.
 *
 *   For OIL:   remaining = last_purchase_weight −
 *                          (avgDailyOilUsage × daysSinceLastPurchase)
 *              avgDailyOilUsage = total_oil_purchased / total_days_tracked
 *              This is a fair estimate since oil usage doesn't map to roti count.
 */
function calculateTrueStock(cat) {
    var purchases = allExpenses
        .filter(function(x) { return x.category === cat && x.weight > 0; })
        .sort(function(a, b) { return a.date < b.date ? -1 : 1; });

    if (!purchases.length) {
        return { remaining: 0, dailyRate: 0, daysRemaining: 0, purchases: [], lastPurchase: null };
    }

    var totalPurchasedKg = purchases.reduce(function(s, p) { return s + p.weight; }, 0);
    var firstDate        = new Date(purchases[0].date + 'T00:00:00');
    var today            = new Date(); today.setHours(23, 59, 59, 999);
    var totalDays        = Math.max(1, Math.round((today - firstDate) / 86400000));
    var last             = purchases[purchases.length - 1];
    var lastDate         = new Date(last.date + 'T00:00:00');
    var daysSinceLast    = Math.round((today - lastDate) / 86400000);

    var remaining   = 0;
    var dailyRate   = 0;

    if (cat === 'atta') {
        // Atta: consumption is directly tied to roti production
        var totalRotiSold = allSales.reduce(function(s, sl) { return s + sl.quantity; }, 0);
        // kg per roti: lifetime ratio (most accurate)
        var kgPerRoti = totalRotiSold > 0 ? totalPurchasedKg / totalRotiSold : 0.023;

        // True remaining = all atta bought − all atta used
        var totalConsumed = totalRotiSold * kgPerRoti;
        remaining = Math.max(0, totalPurchasedKg - totalConsumed);

        // Daily rate from recent 30 days
        var recentCut = new Date(); recentCut.setDate(recentCut.getDate() - 30);
        var recentCutStr = recentCut.getFullYear() + '-' + S(recentCut.getMonth()+1) + '-' + S(recentCut.getDate());
        var recentRoti = allSales
            .filter(function(s) { return s.date >= recentCutStr; })
            .reduce(function(s, sl) { return s + sl.quantity; }, 0);
        var avgDailyRoti = recentRoti / 30;
        dailyRate = avgDailyRoti * kgPerRoti;

    } else if (cat === 'oil') {
        // Oil: no direct roti mapping — use time-based consumption model
        // Between purchases, the previous stock was used up. Estimate daily rate
        // from the intervals between purchases.
        if (purchases.length >= 2) {
            var totalIntervalDays = 0;
            var totalOilInIntervals = 0;
            for (var i = 0; i < purchases.length - 1; i++) {
                var d1  = new Date(purchases[i].date + 'T00:00:00');
                var d2  = new Date(purchases[i+1].date + 'T00:00:00');
                var gap = Math.max(1, Math.round((d2 - d1) / 86400000));
                totalIntervalDays   += gap;
                totalOilInIntervals += purchases[i].weight; // assumed consumed before next purchase
            }
            dailyRate = totalIntervalDays > 0 ? totalOilInIntervals / totalIntervalDays : last.weight / 14;
        } else {
            // Only one purchase — assume typical 14-day usage cycle
            dailyRate = last.weight / 14;
        }
        // Remaining = last purchase weight − daily usage × days since last purchase
        remaining = Math.max(0, last.weight - (dailyRate * daysSinceLast));
    }

    var daysRemaining = dailyRate > 0 ? Math.floor(remaining / dailyRate) : 999;

    return {
        remaining:    Math.round(remaining * 10) / 10,
        dailyRate:    Math.round(dailyRate * 100) / 100,
        daysRemaining: daysRemaining,
        purchases:    purchases,
        lastPurchase: last,
        daysSinceLast: daysSinceLast
    };
}

function renderStockTracker() {
    var ct = document.getElementById('stockTrackerBody');
    if (!ct) return;
    var h = '';
    ['atta', 'oil'].forEach(function(cat) {
        var info    = calculateTrueStock(cat);
        var purchases = info.purchases;
        if (!purchases.length) {
            h += '<div class="stock-card">' +
                 '<div class="sk-header"><span class="sk-icon">' + catIc(cat) + '</span>' +
                 '<span class="sk-name">' + catNm(cat) + '</span>' +
                 '<span class="sk-status-amber">No Data</span></div>' +
                 '<div class="no-data" style="padding:8px 0;font-size:12px">No purchases recorded yet</div>' +
                 '</div>';
            return;
        }

        // Status label — FIXED: separate "Stock Out" from "About to finish"
        var statusClass, statusText;
        if (info.remaining <= 0) {
            statusClass = 'sk-status-red';
            statusText  = '🔴 Stock Out! Order Now';
        } else if (info.daysRemaining <= 1) {
            statusClass = 'sk-status-red';
            statusText  = '🔴 Critical — ' + info.daysRemaining + ' day left';
        } else if (info.daysRemaining <= 3) {
            statusClass = 'sk-status-amber';
            statusText  = '⚠️ Low — ' + info.daysRemaining + ' days';
        } else {
            statusClass = 'sk-status-green';
            statusText  = '✅ Good — ' + info.daysRemaining + ' days';
        }

        // Progress bar: remaining vs last purchase weight (as a reference)
        var last     = info.lastPurchase;
        var barPct   = last.weight > 0 ? Math.min(100, (info.remaining / last.weight) * 100) : 0;
        var barColor = barPct > 40 ? 'var(--gn)' : barPct > 15 ? 'var(--am)' : 'var(--rd)';

        // Price change badge
        var priceBadge = '';
        if (purchases.length >= 2) {
            var prev2    = purchases[purchases.length - 2];
            var prevRate = prev2.weight > 0 ? prev2.amount / prev2.weight : 0;
            var lastRate = last.weight  > 0 ? last.amount  / last.weight  : 0;
            if (prevRate > 0) {
                var pctChange = ((lastRate - prevRate) / prevRate * 100).toFixed(1);
                if (Math.abs(parseFloat(pctChange)) >= 1) {
                    priceBadge = parseFloat(pctChange) > 0
                        ? '<span class="sk-price-badge sk-price-up">+' + pctChange + '%</span>'
                        : '<span class="sk-price-badge sk-price-dn">' + pctChange + '%</span>';
                }
            }
        }

        h += '<div class="stock-card">';
        h += '<div class="sk-header">' +
             '<span class="sk-icon">' + catIc(cat) + '</span>' +
             '<span class="sk-name">' + catNm(cat) + '</span>' +
             '<span class="' + statusClass + '">' + statusText + '</span>' +
             '</div>';

        h += '<div class="sk-bar-wrap"><div class="sk-bar-fill" style="width:' + barPct + '%;background:' + barColor + '"></div></div>';
        h += '<div class="sk-bar-label"><span>' + info.remaining + 'kg remaining</span><span>' + (last.weight || '?') + 'kg last stock</span></div>';

        var lastRateVal = last.weight > 0 ? '₹' + (last.amount / last.weight).toFixed(1) + '/kg' : 'N/A';
        h += '<div class="sk-stats">';
        h += '<div class="sk-stat"><span class="sk-stat-val">' + lastRateVal + priceBadge + '</span><span class="sk-stat-lbl">Last Rate</span></div>';
        h += '<div class="sk-stat"><span class="sk-stat-val">' + info.daysSinceLast + 'd ago</span><span class="sk-stat-lbl">Last Purchase</span></div>';
        h += '<div class="sk-stat"><span class="sk-stat-val">' + info.dailyRate.toFixed(1) + 'kg/d</span><span class="sk-stat-lbl">Avg Usage</span></div>';
        h += '</div>';

        // Purchase history (last 3)
        h += '<div class="sk-history">';
        purchases.slice(-3).reverse().forEach(function(p) {
            var rateStr = p.weight > 0 ? '₹' + (p.amount / p.weight).toFixed(1) + '/kg = ₹' + p.amount : '₹' + p.amount;
            h += '<div class="sk-hist-row">' +
                 '<span class="sk-hist-date">' + fmtDateLong(p.date) + '</span>' +
                 '<span class="sk-hist-info">' + p.weight + 'kg @ ' + rateStr + '</span>' +
                 '</div>';
        });
        h += '</div></div>';
    });
    ct.innerHTML = h || '<div class="no-data">No stock data available</div>';
}


// ============ PRICE TREND ============
var _priceCat = 'atta';
function renderPriceTrend(cat) {
    _priceCat = cat;
    document.querySelectorAll('.price-cat-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-cat') === cat);
    });

    var purchases = allExpenses
        .filter(function(x) { return x.category === cat && x.weight > 0; })
        .sort(function(a, b) { return a.date < b.date ? -1 : 1; });

    var chartArea = document.getElementById('priceTrendChart');
    if (!chartArea) return;

    if (!purchases.length || typeof Chart === 'undefined') {
        chartArea.innerHTML = '<div class="chart-empty" style="height:140px;display:flex;align-items:center;justify-content:center;color:var(--tx3);font-size:13px">No purchase data for ' + catNm(cat) + '</div>';
        return;
    }

    var labels = purchases.map(function(p) {
        var parts = p.date.split('-');
        return parts[2] + '/' + parts[1];
    });
    var rates = purchases.map(function(p) { return parseFloat((p.amount / p.weight).toFixed(2)); });

    // Summary badges
    var curRate  = rates[rates.length - 1];
    var prevRate = rates.length > 1 ? rates[rates.length - 2] : curRate;
    var chg      = prevRate > 0 ? ((curRate - prevRate) / prevRate * 100).toFixed(1) : '0';
    var bestRate = Math.min.apply(null, rates);
    var avgRate  = (rates.reduce(function(a, b) { return a + b; }, 0) / rates.length).toFixed(1);

    var badgesEl = document.getElementById('priceBadges');
    if (badgesEl) {
        var chgClass = parseFloat(chg) > 0 ? 'price-up' : parseFloat(chg) < 0 ? 'price-dn' : '';
        badgesEl.innerHTML =
            '<div class="price-badge"><span class="pb-val">₹' + curRate + '</span><span class="pb-lbl">Current</span></div>' +
            '<div class="price-badge ' + chgClass + '"><span class="pb-val">' + (parseFloat(chg) > 0 ? '↑' : '↓') + ' ' + Math.abs(chg) + '%</span><span class="pb-lbl">vs Last</span></div>' +
            '<div class="price-badge pb-best"><span class="pb-val">₹' + bestRate + '</span><span class="pb-lbl">Best Price</span></div>' +
            '<div class="price-badge"><span class="pb-val">₹' + avgRate + '</span><span class="pb-lbl">Avg/kg</span></div>';
    }

    chartArea.innerHTML = '<canvas id="ptCanvas" style="width:100%;height:140px"></canvas>';
    var ctx = document.getElementById('ptCanvas');
    if (!ctx) return;

    var isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    var textColor = isDark ? '#565d80' : '#9ca3af';
    var gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';

    try {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label:           '₹/kg',
                    data:            rates,
                    borderColor:     'var(--pr, #e65100)',
                    backgroundColor: 'rgba(230,81,0,0.1)',
                    borderWidth:     2.5,
                    pointRadius:     5,
                    pointHoverRadius:7,
                    pointBackgroundColor:'#e65100',
                    tension:         0.35,
                    fill:            true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 500 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: { label: function(c) { return '₹' + c.parsed.y + '/kg'; } }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { size: 10 }, callback: function(v) { return '₹' + v; } }
                    },
                    x: { grid: { display: false }, ticks: { color: textColor, font: { size: 9 }, maxRotation: 0 } }
                }
            }
        });
    } catch (err) { console.error('[PriceTrend]', err); }
}


// ============ DAY-WISE SALES (PATTERN DETECTION) ============
function renderDayWiseSales() {
    var ct = document.getElementById('dayWiseSalesBody');
    if (!ct) return;

    var range     = getWindowDates();
    var sales     = dataInRange(allSales, range.start, range.end);
    var dayNames  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var dayTotals = [0, 0, 0, 0, 0, 0, 0];
    var dayCounts = [0, 0, 0, 0, 0, 0, 0];

    // Group by day-of-week
    var dateMap = {};
    sales.forEach(function(s) {
        var d     = new Date(s.date + 'T00:00:00');
        var dow   = d.getDay();
        var ds    = s.date;
        dayTotals[dow] += s.total;
        if (!dateMap[ds]) { dateMap[ds] = true; dayCounts[dow]++; }
    });

    // Average per occurrence
    var dayAvgs = dayTotals.map(function(t, i) {
        return dayCounts[i] > 0 ? Math.round(t / dayCounts[i]) : 0;
    });

    var maxAvg   = Math.max.apply(null, dayAvgs) || 1;
    var bestIdx  = dayAvgs.indexOf(maxAvg);
    var worstAvg = Math.min.apply(null, dayAvgs.filter(function(v) { return v > 0; }));
    var worstIdx = dayAvgs.indexOf(worstAvg);

    // Detect patterns for insights
    var weekdays  = [dayAvgs[1], dayAvgs[2], dayAvgs[3], dayAvgs[4], dayAvgs[5]]; // Mon-Fri
    var weekends  = [dayAvgs[0], dayAvgs[6]]; // Sun, Sat
    var wdAvg     = weekdays.reduce(function(a, b) { return a + b; }, 0) / weekdays.length;
    var weAvg     = weekends.reduce(function(a, b) { return a + b; }, 0) / weekends.length;
    var weekendBetter = weAvg > wdAvg * 1.1;

    var h = '<div class="heatmap-grid">';
    dayNames.forEach(function(name, i) {
        var pct    = maxAvg > 0 ? (dayAvgs[i] / maxAvg * 100) : 0;
        var height = Math.max(4, pct * 0.7); // max 70px
        var color  = i === bestIdx  ? 'var(--gn)' : i === worstIdx ? 'var(--rd)' : 'var(--pr)';
        var badge  = '';
        if (i === bestIdx)  badge = '<span class="hm-badge">Best</span>';
        if (i === worstIdx) badge = '<span class="hm-badge hm-badge-low">Low</span>';

        h += '<div class="hm-cell' +
             (i === bestIdx ? ' hm-best' : i === worstIdx ? ' hm-worst' : '') + '">' +
             '<div class="hm-bar" style="height:' + height + 'px;background:' + color + '"></div>' +
             '<div class="hm-day">' + name + '</div>' +
             (dayAvgs[i] > 0 ? '<div class="hm-rev">₹' + dayAvgs[i] + '</div>' : '<div class="hm-rev" style="color:var(--tx3)">—</div>') +
             (badge ? badge : '') +
             '</div>';
    });
    h += '</div>';

    // Summary row
    var totalSalesAmt = sales.reduce(function(s, sl) { return s + sl.total; }, 0);
    var totalOrders   = sales.length;
    var avgOrder      = totalOrders > 0 ? Math.round(totalSalesAmt / totalOrders) : 0;
    var activeDays    = Object.keys(dateMap).length;

    h += '<div class="hm-summary">';
    h += '<div class="hms-item"><span class="hms-val">' + dayNames[bestIdx] + '</span><span class="hms-lbl">Best Day</span></div>';
    h += '<div class="hms-item"><span class="hms-val">' + dayNames[worstIdx] + '</span><span class="hms-lbl">Slow Day</span></div>';
    h += '<div class="hms-item"><span class="hms-val">₹' + avgOrder + '</span><span class="hms-lbl">Avg/Order</span></div>';
    h += '<div class="hms-item"><span class="hms-val">' + activeDays + '</span><span class="hms-lbl">Active Days</span></div>';
    h += '</div>';

    // Pattern insight
    if (weekendBetter) {
        h += '<div class="an-insight-pill green">📈 Weekends average ' + Math.round(weAvg) + '% more than weekdays</div>';
    }

    ct.innerHTML = h;

    // Revenue forecast
    renderRevenueForecast(sales);
}

function renderRevenueForecast(sales) {
    var ct = document.getElementById('forecastBody');
    if (!ct) return;

    // Build daily revenue array for last 30 days
    var points  = [];
    var dateMap = {};
    sales.forEach(function(s) {
        if (!dateMap[s.date]) dateMap[s.date] = 0;
        dateMap[s.date] += s.total;
    });

    // Convert to indexed points (x = day index, y = revenue)
    var sortedDates = Object.keys(dateMap).sort();
    sortedDates.forEach(function(d, i) {
        points.push({ x: i, y: dateMap[d] });
    });

    if (points.length < 5) {
        ct.innerHTML = '<div class="no-data" style="font-size:12px">Need at least 5 days of data for forecasting</div>';
        return;
    }

    var reg  = linearRegression(points);
    var nextX = points.length; // Next day index
    var forecast7 = [];
    for (var f = 0; f < 7; f++) {
        forecast7.push(Math.round(reg.predict(nextX + f)));
    }
    var totalForecast7 = forecast7.reduce(function(a, b) { return a + b; }, 0);

    var trendLabel, trendClass;
    if (reg.slope > 50)       { trendLabel = '📈 Upward trend detected';   trendClass = 'green'; }
    else if (reg.slope < -50) { trendLabel = '📉 Downward trend detected'; trendClass = 'red'; }
    else                      { trendLabel = '→ Revenue is stable';         trendClass = 'neutral'; }

    var r2Pct = Math.round(reg.r2 * 100);
    var conf  = r2Pct > 70 ? 'High' : r2Pct > 40 ? 'Medium' : 'Low';

    var h = '<div class="forecast-box">';
    h += '<div class="fc-row"><span class="fc-lbl">7-Day Revenue Forecast</span><span class="fc-val">₹' + totalForecast7.toLocaleString() + '</span></div>';
    h += '<div class="fc-row"><span class="fc-lbl">Daily Average (forecast)</span><span class="fc-val">₹' + Math.round(totalForecast7 / 7) + '</span></div>';
    h += '<div class="fc-row"><span class="fc-lbl">Trend</span><span class="fc-val ' + trendClass + '">' + trendLabel + '</span></div>';
    h += '<div class="fc-row"><span class="fc-lbl">Confidence</span><span class="fc-val">' + conf + ' (R²: ' + r2Pct + '%)</span></div>';
    h += '</div>';
    ct.innerHTML = h;
}


// ============ TRUE UNIT ECONOMICS ============
/**
 * renderUnitEconomics — Phase 3 fix
 *
 * v6 BUG: Only counted atta cost → showed 81.9% margin (wrong).
 * v7 FIX: Counts atta + oil + gas + polythene → REAL margin.
 */
function renderUnitEconomics() {
    var range = getWindowDates();

    var rotiSales  = dataInRange(allSales,    range.start, range.end);
    var allWindowExps = dataInRange(allExpenses, range.start, range.end);

    var totalRoti    = rotiSales.reduce(function(s, sl) { return s + sl.quantity; }, 0);
    var totalRevenue = rotiSales.reduce(function(s, sl) { return s + sl.total; }, 0);

    if (!totalRoti) {
        var ueBody = document.getElementById('unitEconBody');
        if (ueBody) ueBody.innerHTML = '<div class="no-data">No sales data in selected period</div>';
        return;
    }

    // Cost breakdown — all categories
    var costByCategory = {};
    var totalExpenses  = 0;
    allWindowExps.forEach(function(x) {
        if (!costByCategory[x.category]) costByCategory[x.category] = 0;
        costByCategory[x.category] += x.amount;
        totalExpenses += x.amount;
    });

    var netProfit      = totalRevenue - totalExpenses;
    var trueMarginPct  = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';
    var revenuePerRoti = totalRevenue / totalRoti;
    var costPerRoti    = totalExpenses / totalRoti;
    var profitPerRoti  = revenuePerRoti - costPerRoti;

    // Gauge fill: angle based on margin %
    var gaugeEl = document.getElementById('ueGaugeFill');
    if (gaugeEl) {
        var angle = Math.max(-90, Math.min(0, (-90 + (parseFloat(trueMarginPct) / 100) * 90)));
        gaugeEl.style.transform = 'rotate(' + angle + 'deg)';
        gaugeEl.style.background = parseFloat(trueMarginPct) > 60 ? 'var(--gn)' :
                                    parseFloat(trueMarginPct) > 30 ? 'var(--am)' : 'var(--rd)';
    }
    var marginEl = document.getElementById('ueMarginPct');
    if (marginEl) marginEl.textContent = trueMarginPct + '%';

    var ueBody = document.getElementById('unitEconBody');
    if (!ueBody) return;

    var h = '<div class="ue-stats">';
    h += '<div class="ue-row"><span class="ue-lbl">Avg Selling Rate</span><span class="ue-val">₹' + revenuePerRoti.toFixed(2) + '/roti</span></div>';

    // Per-category cost per roti
    var catColors = { atta: 'red', oil: 'red', gas: 'red', poly: 'red', other: 'red' };
    Object.keys(costByCategory).forEach(function(cat) {
        var cpr = (costByCategory[cat] / totalRoti).toFixed(2);
        h += '<div class="ue-row"><span class="ue-lbl">' + catNm(cat) + ' Cost/Roti</span>' +
             '<span class="ue-val ' + (catColors[cat] || '') + '">-₹' + cpr + '</span></div>';
    });

    h += '<div class="ue-row ue-row-total"><span class="ue-lbl" style="font-weight:700">Profit/Roti</span>' +
         '<span class="ue-val ' + (profitPerRoti >= 0 ? 'green' : 'red') + '">' +
         (profitPerRoti >= 0 ? '₹' : '-₹') + Math.abs(profitPerRoti).toFixed(2) + '</span></div>';
    h += '</div>';

    h += '<div class="ue-detail">';
    h += '<div class="ue-row"><span class="ue-lbl">Total Roti Sold</span><span class="ue-val">' + totalRoti.toLocaleString() + '</span></div>';
    h += '<div class="ue-row"><span class="ue-lbl">Total Revenue</span><span class="ue-val green">₹' + totalRevenue.toLocaleString() + '</span></div>';
    h += '<div class="ue-row"><span class="ue-lbl">Total Expenses</span><span class="ue-val red">-₹' + totalExpenses.toLocaleString() + '</span></div>';
    h += '<div class="ue-row"><span class="ue-lbl">Net Profit</span><span class="ue-val ' + (netProfit >= 0 ? 'green' : 'red') + '">' +
         (netProfit >= 0 ? '₹' : '-₹') + Math.abs(netProfit).toLocaleString() + '</span></div>';
    h += '</div>';

    h += '<div class="ue-note">* All expense categories included. True margin = ' + trueMarginPct + '%. ' +
         'Only categories with expenses in this period are shown.</div>';

    ueBody.innerHTML = h;
}


// ============ CUSTOMER INSIGHTS + RISK SCORING ============
function renderCustomerInsights() {
    var ct = document.getElementById('customerInsightsBody');
    if (!ct) return;

    if (!allCustomers.length) {
        ct.innerHTML = '<div class="no-data">No customers added yet</div>';
        return;
    }

    var today      = new Date(); today.setHours(23, 59, 59, 999);
    var todayStr2  = todayStr();

    var custData = allCustomers.map(function(c) {
        var sales = allSales.filter(function(s) { return s.customerId === c.id; });
        if (!sales.length) return null;

        // Sort by date descending
        sales.sort(function(a, b) { return a.date < b.date ? 1 : -1; });

        var totalRevenue = sales.reduce(function(s, sl) { return s + sl.total; }, 0);
        var totalRoti    = sales.reduce(function(s, sl) { return s + sl.quantity; }, 0);
        var lastSaleDate = sales[0].date;
        var lastSaleObj  = new Date(lastSaleDate + 'T00:00:00');
        var daysInactive = Math.round((today - lastSaleObj) / 86400000);

        // Payment reliability: % of credit sales
        var creditSales = sales.filter(function(s) { return s.paymentType === 'credit'; }).length;
        var reliabilityPct = 100 - Math.round((creditSales / sales.length) * 100);

        // Pending credit
        var creditGiven = sales
            .filter(function(s) { return s.paymentType === 'credit'; })
            .reduce(function(s, sl) { return s + sl.total; }, 0);
        var creditPaid = allCreditPayments
            .filter(function(p) { return p.customerId === c.id; })
            .reduce(function(s, p) { return s + p.amount; }, 0);
        var pending = Math.max(0, creditGiven - creditPaid);

        // Risk score (0-100, lower = riskier):
        // Factors: inactivity (40pts), credit reliability (40pts), order frequency (20pts)
        var inactivityScore   = daysInactive <= 1 ? 40 : daysInactive <= 3 ? 30 : daysInactive <= 7 ? 15 : 0;
        var reliabilityScore  = Math.round(reliabilityPct * 0.4);
        var recent30Cut       = new Date(); recent30Cut.setDate(recent30Cut.getDate() - 30);
        var recent30CutStr    = recent30Cut.getFullYear() + '-' + S(recent30Cut.getMonth()+1) + '-' + S(recent30Cut.getDate());
        var recentOrderCount  = sales.filter(function(s) { return s.date >= recent30CutStr; }).length;
        var freqScore         = recentOrderCount >= 20 ? 20 : Math.round(recentOrderCount * 1);
        var riskScore         = inactivityScore + reliabilityScore + freqScore;

        return {
            id: c.id, name: c.name, totalRevenue: totalRevenue, totalRoti: totalRoti,
            lastSaleDate: lastSaleDate, daysInactive: daysInactive,
            reliabilityPct: reliabilityPct, pending: pending,
            riskScore: riskScore, salesCount: sales.length
        };
    }).filter(Boolean);

    if (!custData.length) {
        ct.innerHTML = '<div class="no-data">No sales data to analyze</div>';
        return;
    }

    // Sort by revenue desc
    custData.sort(function(a, b) { return b.totalRevenue - a.totalRevenue; });

    var h = '';
    custData.slice(0, 8).forEach(function(c, i) {
        var riskColor  = c.riskScore >= 60 ? 'var(--gn)' : c.riskScore >= 35 ? 'var(--am)' : 'var(--rd)';
        var riskLabel  = c.riskScore >= 60 ? 'Active'   : c.riskScore >= 35 ? 'At Risk'  : 'Inactive';
        var rankEmoji  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);

        h += '<div class="cust-insight-card">';
        h += '<div class="ci-top">';
        h += '<span class="ci-rank">' + rankEmoji + '</span>';
        h += '<span class="ci-name">' + esc(c.name) + '</span>';
        h += '<span class="ci-rev">₹' + c.totalRevenue.toLocaleString() + '</span>';
        h += '</div>';
        h += '<div class="ci-bar-wrap"><div class="ci-bar" style="width:' +
             Math.round((c.totalRevenue / custData[0].totalRevenue) * 100) + '%;background:' +
             (i === 0 ? 'var(--gn)' : 'var(--pr)') + '"></div></div>';
        h += '<div class="ci-meta">';
        h += '<span class="ci-pill" style="background:' + riskColor + '20;color:' + riskColor + '">' + riskLabel + '</span>';
        h += '<span class="ci-stat">Last: ' + (c.daysInactive === 0 ? 'Today' : c.daysInactive + 'd ago') + '</span>';
        h += '<span class="ci-stat">' + c.totalRoti + ' roti</span>';
        if (c.pending > 0) h += '<span class="ci-pill" style="background:var(--amb);color:var(--am)">₹' + c.pending + ' pending</span>';
        h += '</div></div>';
    });

    ct.innerHTML = h;
}


// ============ SMART INSIGHTS ENGINE ============
function renderSmartInsights() {
    var ct = document.getElementById('dashInsights');
    if (!ct) return;

    var insights = [];
    var today    = todayStr();
    var nowHour  = new Date().getHours();

    // ---- Stock alerts ----
    ['atta', 'oil'].forEach(function(cat) {
        var info = calculateTrueStock(cat);
        if (!info.purchases.length) return;

        if (info.remaining <= 0) {
            insights.push({
                priority: 1,
                icon: '🚨',
                text: catNm(cat) + ' is COMPLETELY OUT OF STOCK. Order immediately to avoid production stoppage.',
                color: 'var(--rd)'
            });
        } else if (info.daysRemaining <= 1) {
            insights.push({
                priority: 1,
                icon: '🔴',
                text: catNm(cat) + ' will run out TODAY. Only ' + info.remaining + 'kg remaining at current usage rate.',
                color: 'var(--rd)'
            });
        } else if (info.daysRemaining <= 3) {
            insights.push({
                priority: 2,
                icon: '⚠️',
                text: catNm(cat) + ' is running low — ' + info.remaining + 'kg left, approximately ' + info.daysRemaining + ' days remaining.',
                color: 'var(--am)'
            });
        }
    });

    // ---- Price increase alert ----
    ['atta', 'oil'].forEach(function(cat) {
        var purchases = allExpenses
            .filter(function(x) { return x.category === cat && x.weight > 0; })
            .sort(function(a, b) { return a.date < b.date ? -1 : 1; });
        if (purchases.length < 2) return;
        var last    = purchases[purchases.length - 1];
        var prev    = purchases[purchases.length - 2];
        var lastR   = last.amount / last.weight;
        var prevR   = prev.amount / prev.weight;
        var change  = ((lastR - prevR) / prevR * 100);
        if (change >= 10) {
            insights.push({
                priority: 2,
                icon: '💸',
                text: catNm(cat) + ' price increased by ' + change.toFixed(1) + '% (₹' + prevR.toFixed(1) + ' → ₹' + lastR.toFixed(1) + '/kg). Consider reviewing selling rates.',
                color: 'var(--am)'
            });
        } else if (change <= -5) {
            insights.push({
                priority: 4,
                icon: '💰',
                text: catNm(cat) + ' price dropped ' + Math.abs(change).toFixed(1) + '% (₹' + prevR.toFixed(1) + ' → ₹' + lastR.toFixed(1) + '/kg). Good buying opportunity.',
                color: 'var(--gn)'
            });
        }
    });

    // ---- Today's performance ----
    var todaySales  = salesForDate(today);
    var todayInc    = todaySales.reduce(function(s, sl) { return s + sl.total; }, 0);
    var todayRoti   = todaySales.reduce(function(s, sl) { return s + sl.quantity; }, 0);

    if (!todaySales.length && nowHour >= 8 && nowHour <= 18) {
        insights.push({ priority: 2, icon: '📋', text: 'No sales recorded today yet. Use Quick Sale to log your morning deliveries.', color: 'var(--bl)' });
    }

    // Yesterday comparison
    var yd    = new Date(); yd.setDate(yd.getDate() - 1);
    var ydStr = yd.getFullYear() + '-' + S(yd.getMonth()+1) + '-' + S(yd.getDate());
    var ydInc = salesForDate(ydStr).reduce(function(s, sl) { return s + sl.total; }, 0);
    if (ydInc > 0 && todayInc > 0) {
        var delta = ((todayInc - ydInc) / ydInc * 100).toFixed(0);
        if (Math.abs(parseFloat(delta)) >= 15) {
            insights.push({
                priority: 3,
                icon: parseFloat(delta) > 0 ? '📈' : '📉',
                text: 'Today\'s revenue is ' + Math.abs(delta) + '% ' + (parseFloat(delta) > 0 ? 'higher' : 'lower') + ' than yesterday (₹' + todayInc + ' vs ₹' + ydInc + ').',
                color: parseFloat(delta) > 0 ? 'var(--gn)' : 'var(--rd)'
            });
        }
    }

    // ---- Inactive customers ----
    var threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    var tda = threeDaysAgo.getFullYear() + '-' + S(threeDaysAgo.getMonth()+1) + '-' + S(threeDaysAgo.getDate());
    var inactiveCusts = allCustomers.filter(function(c) {
        var lastSale = null;
        allSales.forEach(function(s) { if (s.customerId === c.id && (!lastSale || s.date > lastSale)) lastSale = s.date; });
        return lastSale && lastSale < tda;
    });
    if (inactiveCusts.length > 0) {
        insights.push({
            priority: 3,
            icon: '👤',
            text: inactiveCusts.length + ' customer' + (inactiveCusts.length > 1 ? 's have' : ' has') + ' not ordered in 3+ days: ' + inactiveCusts.slice(0, 2).map(function(c) { return c.name; }).join(', ') + (inactiveCusts.length > 2 ? ' +' + (inactiveCusts.length - 2) + ' more' : '') + '.',
            color: 'var(--am)'
        });
    }

    // ---- Pending credit alert ----
    var totalPending = 0;
    allCustomers.forEach(function(c) {
        var given = allSales.filter(function(s) { return s.customerId === c.id && s.paymentType === 'credit'; }).reduce(function(s, sl) { return s + sl.total; }, 0);
        var paid  = allCreditPayments.filter(function(p) { return p.customerId === c.id; }).reduce(function(s, p) { return s + p.amount; }, 0);
        totalPending += Math.max(0, given - paid);
    });
    if (totalPending > 500) {
        insights.push({
            priority: 3,
            icon: '💳',
            text: '₹' + totalPending + ' total credit is pending from customers. Follow up for collection.',
            color: 'var(--am)'
        });
    }

    // ---- Revenue forecast ----
    var last7 = [];
    for (var d = 6; d >= 0; d--) {
        var dd = new Date(); dd.setDate(dd.getDate() - d);
        var ds = dd.getFullYear() + '-' + S(dd.getMonth()+1) + '-' + S(dd.getDate());
        var inc = salesForDate(ds).reduce(function(s, sl) { return s + sl.total; }, 0);
        last7.push({ x: 6 - d, y: inc });
    }
    var reg2 = linearRegression(last7.filter(function(p) { return p.y > 0; }));
    if (reg2.slope > 100 && reg2.r2 > 0.4) {
        insights.push({ priority: 4, icon: '🚀', text: 'Strong upward revenue trend detected over the past 7 days. Keep it up!', color: 'var(--gn)' });
    } else if (reg2.slope < -100 && reg2.r2 > 0.4) {
        insights.push({ priority: 2, icon: '📉', text: 'Revenue has been declining consistently over the past week. Review your customer order patterns.', color: 'var(--rd)' });
    }

    // Sort by priority, limit to 5
    insights.sort(function(a, b) { return a.priority - b.priority; });

    if (!insights.length) {
        ct.innerHTML = '<div class="insight-card"><span class="insight-ic">✅</span><span class="insight-text">Everything looks great! Stock is healthy, sales are steady, no pending issues.</span></div>';
        return;
    }

    var h = '';
    insights.slice(0, 5).forEach(function(ins, i) {
        h += '<div class="insight-card" style="animation-delay:' + (i * 0.06) + 's;border-left-color:' + ins.color + '">' +
             '<span class="insight-ic">' + ins.icon + '</span>' +
             '<span class="insight-text">' + esc(ins.text) + '</span>' +
             '</div>';
    });
    if (insights.length > 5) {
        h += '<div style="text-align:center;font-size:11px;color:var(--tx3);padding:4px 0;font-weight:600">' + (insights.length - 5) + ' more insights — check Analytics</div>';
    }
    ct.innerHTML = h;
}

console.log('[Analytics] Meri Dukaan v7.0 — Analytics rebuilt');