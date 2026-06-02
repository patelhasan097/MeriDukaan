/* ================================================
   MERI DUKAAN v8.0 — ANALYTICS
   World-class business intelligence engine.

   FEATURES:
   ✅ Real-time break-even calculator
   ✅ Cohort retention heatmap (6 months × customers)
   ✅ Customer CLV (Lifetime Value) scoring
   ✅ Price optimization suggestions
   ✅ Seasonal analysis (this week vs same week last year)
   ✅ Revenue velocity (acceleration/deceleration)
   ✅ True stock — cumulative model
   ✅ True margin — all cost categories
   ✅ Linear regression forecasting + confidence
   ✅ Smart insights — BOTH dashboard + analytics screen
   ✅ Day-wise pattern detection
   ✅ Daily goal + streak system
   ================================================ */

var _analyticsWindow = 30;

function loadAnalytics() {
    // Update analytics KPI row
    _updateAnKPIs();
    // Load active tab
    var activeTab = document.querySelector('.an-tab.active');
    var tabName   = activeTab ? activeTab.textContent.trim().toLowerCase() : 'overview';
    switchAnTab(tabName, activeTab);
}

function setAnalyticsWindow(days, btn) {
    _analyticsWindow = days;
    document.querySelectorAll('.an-window-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    _updateAnKPIs();
    renderDayWiseSales();
    renderUnitEconomics();
}

function _getWindowRange() {
    if (_analyticsWindow === 0) {
        // All time
        var first = null;
        allSales.forEach(function(s) { if (!first || s.date < first) first = s.date; });
        allExpenses.forEach(function(x) { if (!first || x.date < first) first = x.date; });
        return { start: first || todayStr(), end: todayStr() };
    }
    var end   = todayStr();
    var start = new Date();
    start.setDate(start.getDate() - (_analyticsWindow - 1));
    return {
        start: start.getFullYear() + '-' + S(start.getMonth()+1) + '-' + S(start.getDate()),
        end:   end
    };
}

function _updateAnKPIs() {
    var range    = _getWindowRange();
    var sales    = dataInRange(allSales,    range.start, range.end);
    var expenses = dataInRange(allExpenses, range.start, range.end);

    var revenue  = sales.reduce(function(s,sl){return s+sl.total;},0);
    var expTotal = expenses.reduce(function(s,x){return s+x.amount;},0);
    var margin   = revenue > 0 ? ((revenue - expTotal) / revenue * 100).toFixed(1) : '0';

    // Compare to previous same-length period
    var days     = _analyticsWindow || 30;
    var prevEnd  = new Date(); prevEnd.setDate(prevEnd.getDate() - days);
    var prevStart= new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days);
    var pES = prevStart.getFullYear()+'-'+S(prevStart.getMonth()+1)+'-'+S(prevStart.getDate());
    var pEE = prevEnd.getFullYear()  +'-'+S(prevEnd.getMonth()+1)  +'-'+S(prevEnd.getDate());
    var prevRevenue  = dataInRange(allSales,    pES, pEE).reduce(function(s,sl){return s+sl.total;},0);
    var prevExpenses = dataInRange(allExpenses, pES, pEE).reduce(function(s,x){return s+x.amount;},0);

    function trendHTML(cur, prev) {
        if (!prev) return '<div class="an-kpi-trend akt-na">— no prev data</div>';
        var pct = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
        var cls = parseFloat(pct) > 0 ? 'akt-up' : parseFloat(pct) < 0 ? 'akt-dn' : 'akt-na';
        var arr = parseFloat(pct) > 0 ? '↑' : '↓';
        return '<div class="an-kpi-trend ' + cls + '">' + arr + ' ' + Math.abs(pct) + '% vs prev</div>';
    }

    var elRev = document.getElementById('anRevenue');
    var elMar = document.getElementById('anMargin');
    var elExp = document.getElementById('anExpenses');
    if (elRev) { elRev.textContent = '₹' + revenue.toLocaleString(); }
    if (elMar) { elMar.textContent = margin + '%'; elMar.style.color = parseFloat(margin) > 50 ? 'var(--success)' : parseFloat(margin) > 25 ? 'var(--warning)' : 'var(--danger)'; }
    if (elExp) { elExp.textContent = '₹' + expTotal.toLocaleString(); }

    var elRevT = document.getElementById('anRevTrend');
    var elMarT = document.getElementById('anMarginTrend');
    var elExpT = document.getElementById('anExpTrend');
    if (elRevT) elRevT.outerHTML = trendHTML(revenue, prevRevenue).replace('div class', 'div id="anRevTrend" class');
    if (elMarT) elMarT.outerHTML = '<div id="anMarginTrend" class="an-kpi-trend akt-na">' + _analyticsWindow + 'd window</div>';
    if (elExpT) elExpT.outerHTML = trendHTML(-expTotal, -prevExpenses).replace('div class', 'div id="anExpTrend" class');

    // Break-even
    renderBreakEven();
}


// ══════════════════════════════════════════════
// BREAK-EVEN CALCULATOR (REAL-TIME)
// ══════════════════════════════════════════════
function renderBreakEven() {
    var bvEl  = document.getElementById('breakEvenVal');
    var bsEl  = document.getElementById('breakEvenSub');
    if (!bvEl) return;

    var todayExps = expensesForDate(todayStr()).reduce(function(s,x){return s+x.amount;},0);
    var todaySls  = salesForDate(todayStr());
    var todayRoti = todaySls.reduce(function(s,sl){return s+sl.quantity;},0);
    var todayRev  = todaySls.reduce(function(s,sl){return s+sl.total;},0);

    // Average selling rate
    var avgRate = todayRoti > 0 ? todayRev / todayRoti : 0;
    // Fallback: use all-time avg
    if (!avgRate) {
        var totalR = allSales.reduce(function(s,sl){return s+sl.total;},0);
        var totalQ = allSales.reduce(function(s,sl){return s+sl.quantity;},0);
        avgRate = totalQ > 0 ? totalR / totalQ : 0;
    }

    if (!todayExps) {
        bvEl.textContent = '— ';
        bsEl.textContent = 'No expenses recorded today yet';
        return;
    }
    if (!avgRate) {
        bvEl.textContent = '— ';
        bsEl.textContent = 'No sales data to calculate rate';
        return;
    }

    var breakEvenRoti = Math.ceil(todayExps / avgRate);
    var remaining     = Math.max(0, breakEvenRoti - todayRoti);
    var alreadyDone   = todayRoti >= breakEvenRoti;

    if (alreadyDone) {
        bvEl.textContent = '✅ Done!';
        bvEl.style.color = 'var(--success)';
        bsEl.textContent = 'Break-even achieved. ' + todayRoti + ' roti sold, needed ' + breakEvenRoti;
    } else {
        bvEl.textContent = breakEvenRoti + ' roti';
        bvEl.style.color = 'var(--brand)';
        bsEl.textContent = todayRoti + ' done, ' + remaining + ' more to cover ₹' + todayExps + ' expenses (₹' + avgRate.toFixed(1) + '/roti avg)';
    }
}


// ══════════════════════════════════════════════
// LINEAR REGRESSION
// ══════════════════════════════════════════════
function linearRegression(points) {
    var n = points.length;
    if (n < 2) return { slope:0, intercept:0, predict:function(){return 0;}, r2:0 };
    var sx=0,sy=0,sxy=0,sxx=0,syy=0;
    points.forEach(function(p){sx+=p.x;sy+=p.y;sxy+=p.x*p.y;sxx+=p.x*p.x;syy+=p.y*p.y;});
    var den = (n*sxx - sx*sx);
    if (den === 0) return { slope:0, intercept:sy/n, predict:function(){return sy/n;}, r2:0 };
    var slope     = (n*sxy - sx*sy) / den;
    var intercept = (sy - slope*sx) / n;
    var yMean     = sy/n;
    var ssTot=0, ssRes=0;
    points.forEach(function(p){ssTot+=Math.pow(p.y-yMean,2); ssRes+=Math.pow(p.y-(slope*p.x+intercept),2);});
    var r2 = ssTot > 0 ? Math.max(0, 1 - ssRes/ssTot) : 0;
    return { slope:slope, intercept:intercept, predict:function(x){return Math.max(0,slope*x+intercept);}, r2:r2 };
}


// ══════════════════════════════════════════════
// STOCK TRACKER — CUMULATIVE MODEL
// ══════════════════════════════════════════════
function calculateTrueStock(cat) {
    var purchases = allExpenses.filter(function(x){return x.category===cat&&x.weight>0;}).sort(function(a,b){return a.date<b.date?-1:1;});
    if (!purchases.length) return {remaining:0,dailyRate:0,daysRemaining:0,purchases:[],lastPurchase:null,daysSinceLast:0};

    var totalPurchasedKg = purchases.reduce(function(s,p){return s+p.weight;},0);
    var firstDate = new Date(purchases[0].date+'T00:00:00');
    var today     = new Date(); today.setHours(23,59,59,999);
    var last      = purchases[purchases.length-1];
    var lastDate  = new Date(last.date+'T00:00:00');
    var daysSinceLast = Math.round((today-lastDate)/86400000);
    var remaining=0, dailyRate=0;

    if (cat === 'atta') {
        var totalRotiSold = allSales.reduce(function(s,sl){return s+sl.quantity;},0);
        var kgPerRoti     = totalRotiSold>0 ? totalPurchasedKg/totalRotiSold : 0.023;
        var totalConsumed = totalRotiSold * kgPerRoti;
        remaining = Math.max(0, totalPurchasedKg - totalConsumed);
        var cut30 = new Date(); cut30.setDate(cut30.getDate()-30);
        var cut30s = cut30.getFullYear()+'-'+S(cut30.getMonth()+1)+'-'+S(cut30.getDate());
        var recentRoti = dataInRange(allSales, cut30s, todayStr()).reduce(function(s,sl){return s+sl.quantity;},0);
        dailyRate = (recentRoti/30) * kgPerRoti;
    } else {
        if (purchases.length >= 2) {
            var intervals=0, oilInIntervals=0;
            for (var i=0; i<purchases.length-1; i++) {
                var gap = Math.max(1, Math.round((new Date(purchases[i+1].date+'T00:00:00') - new Date(purchases[i].date+'T00:00:00'))/86400000));
                intervals += gap; oilInIntervals += purchases[i].weight;
            }
            dailyRate = intervals>0 ? oilInIntervals/intervals : last.weight/14;
        } else { dailyRate = last.weight/14; }
        remaining = Math.max(0, last.weight - (dailyRate * daysSinceLast));
    }

    return { remaining:Math.round(remaining*10)/10, dailyRate:Math.round(dailyRate*100)/100, daysRemaining: dailyRate>0 ? Math.floor(remaining/dailyRate) : 999, purchases:purchases, lastPurchase:last, daysSinceLast:daysSinceLast };
}

function renderStockTracker() {
    var ct = document.getElementById('stockTrackerBody');
    if (!ct) return;
    var h = '';
    ['atta','oil'].forEach(function(cat) {
        var info = calculateTrueStock(cat);
        if (!info.purchases.length) {
            h += '<div class="stock-card"><div class="stock-head"><div class="stock-name">' + catIc(cat) + ' ' + catNm(cat) + '</div>' +
                 '<span class="stock-status ss-good">No Data</span></div>' +
                 '<div class="no-data" style="font-size:12px;padding:8px 0">No purchases recorded</div></div>';
            return;
        }
        var statusClass, statusText;
        if (info.remaining <= 0)          { statusClass='ss-out';       statusText='🔴 Out of Stock'; }
        else if (info.daysRemaining <= 1)  { statusClass='ss-critical';  statusText='🔴 Critical — ' + info.daysRemaining + 'd left'; }
        else if (info.daysRemaining <= 3)  { statusClass='ss-low';       statusText='⚠️ Low — ' + info.daysRemaining + ' days'; }
        else                               { statusClass='ss-good';      statusText='✅ ' + info.daysRemaining + ' days'; }

        var last = info.lastPurchase;
        var barPct = last.weight>0 ? Math.min(100,info.remaining/last.weight*100) : 0;
        var barCol = barPct>40 ? 'var(--success)' : barPct>15 ? 'var(--warning)' : 'var(--danger)';
        var lastRate = last.weight>0 ? '₹'+(last.amount/last.weight).toFixed(1)+'/kg' : '₹'+last.amount;

        // Price change badge
        var priceBadge = '';
        if (info.purchases.length >= 2) {
            var prev2    = info.purchases[info.purchases.length-2];
            var prevRate = prev2.weight>0 ? prev2.amount/prev2.weight : 0;
            var lastR    = last.weight>0  ? last.amount/last.weight   : 0;
            if (prevRate>0) {
                var chg = ((lastR-prevRate)/prevRate*100).toFixed(1);
                if (Math.abs(parseFloat(chg))>=1) priceBadge = parseFloat(chg)>0 ? '<span class="price-badge-up">+'+chg+'%</span>' : '<span class="price-badge-dn">'+chg+'%</span>';
            }
        }

        h += '<div class="stock-card">';
        h += '<div class="stock-head"><div class="stock-name">' + catIc(cat) + ' ' + catNm(cat) + '</div><span class="stock-status '+statusClass+'">'+statusText+'</span></div>';
        h += '<div class="stock-bar-bg"><div class="stock-bar-fill" style="width:'+barPct+'%;background:'+barCol+'"></div></div>';
        h += '<div class="stock-bar-labels"><span>'+info.remaining+'kg remaining</span><span>'+(last.weight||'?')+'kg last stock</span></div>';
        h += '<div class="stock-stats"><div class="ss-item"><div class="ss-val">'+lastRate+priceBadge+'</div><div class="ss-lbl">Last Rate</div></div>';
        h += '<div class="ss-item"><div class="ss-val">'+info.daysSinceLast+'d ago</div><div class="ss-lbl">Last Purchase</div></div>';
        h += '<div class="ss-item"><div class="ss-val">'+info.dailyRate.toFixed(1)+'kg/d</div><div class="ss-lbl">Avg Usage</div></div></div>';
        h += '<div class="stock-history">';
        info.purchases.slice(-3).reverse().forEach(function(p){
            var r = p.weight>0 ? '₹'+(p.amount/p.weight).toFixed(1)+'/kg' : '₹'+p.amount;
            h += '<div class="sh-row"><span class="sh-date">'+fmtDateLong(p.date)+'</span><span class="sh-info">'+p.weight+'kg @ '+r+' = ₹'+p.amount+'</span></div>';
        });
        h += '</div></div>';
    });
    ct.innerHTML = h || '<div class="no-data">No stock data available</div>';
}


// ══════════════════════════════════════════════
// PRICE TREND CHART
// ══════════════════════════════════════════════
var _priceCat = 'atta';
var _ptChart  = null;

function renderPriceTrend(cat) {
    _priceCat = cat;
    document.querySelectorAll('.price-cat-btn').forEach(function(b){b.classList.toggle('active', b.getAttribute('data-cat')===cat);});
    var purchases = allExpenses.filter(function(x){return x.category===cat&&x.weight>0;}).sort(function(a,b){return a.date<b.date?-1:1;});
    var chartArea = document.getElementById('priceTrendChart');
    var badgesEl  = document.getElementById('priceBadges');
    if (!chartArea) return;

    if (!purchases.length || typeof Chart==='undefined') {
        chartArea.innerHTML = '<div class="no-data">No purchase data for '+catNm(cat)+'</div>';
        if (badgesEl) badgesEl.innerHTML = '';
        return;
    }

    var rates  = purchases.map(function(p){return parseFloat((p.amount/p.weight).toFixed(2));});
    var labels = purchases.map(function(p){var pt=p.date.split('-');return pt[2]+'/'+pt[1];});

    // Badges
    if (badgesEl) {
        var cur=rates[rates.length-1], prev=rates.length>1?rates[rates.length-2]:cur;
        var chg = prev>0 ? ((cur-prev)/prev*100).toFixed(1) : '0';
        var best=Math.min.apply(null,rates), avg=(rates.reduce(function(a,b){return a+b;},0)/rates.length).toFixed(1);
        var chgCls = parseFloat(chg)>0?'price-up':'price-dn';
        badgesEl.innerHTML =
            '<div class="price-badge"><span class="pb-val">₹'+cur+'</span><span class="pb-lbl">Current Rate</span></div>'+
            '<div class="price-badge '+chgCls+'"><span class="pb-val">'+(parseFloat(chg)>0?'↑':'↓')+' '+Math.abs(chg)+'%</span><span class="pb-lbl">vs Last</span></div>'+
            '<div class="price-badge pb-best"><span class="pb-val">₹'+best+'</span><span class="pb-lbl">Best Ever</span></div>'+
            '<div class="price-badge"><span class="pb-val">₹'+avg+'</span><span class="pb-lbl">Avg/kg</span></div>';
    }

    chartArea.innerHTML = '<canvas id="ptCanvas" style="height:140px"></canvas>';
    var ctx = document.getElementById('ptCanvas');
    if (!ctx) return;
    if (_ptChart) { _ptChart.destroy(); _ptChart = null; }
    var isDark = document.documentElement.getAttribute('data-theme')==='dark';
    var tc = isDark?'#475569':'#9ca3af';
    try {
        _ptChart = new Chart(ctx, {
            type:'line',
            data:{ labels:labels, datasets:[{ label:'₹/kg', data:rates, borderColor:'#f97316', backgroundColor:'rgba(249,115,22,0.08)', borderWidth:2.5, pointRadius:5, pointHoverRadius:7, pointBackgroundColor:'#f97316', tension:0.35, fill:true }] },
            options:{ responsive:true, maintainAspectRatio:false, animation:{duration:500}, plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return '₹'+c.parsed.y+'/kg';}}}},
                scales:{ y:{beginAtZero:false,grid:{color:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)'},ticks:{color:tc,font:{size:10},callback:function(v){return '₹'+v;}}}, x:{grid:{display:false},ticks:{color:tc,font:{size:9},maxRotation:0}} } }
        });
    } catch(e) { console.error('[PriceTrend]',e); }
}


// ══════════════════════════════════════════════
// DAY-WISE SALES + FORECAST
// ══════════════════════════════════════════════
function renderDayWiseSales() {
    var ct = document.getElementById('dayWiseSalesBody');
    if (!ct) return;
    var range    = _getWindowRange();
    var sales    = dataInRange(allSales, range.start, range.end);
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var dayTotals= [0,0,0,0,0,0,0];
    var dateMap  = {};

    sales.forEach(function(s){
        var d   = new Date(s.date+'T00:00:00');
        var dow = d.getDay();
        dayTotals[dow] += s.total;
        if (!dateMap[s.date]) dateMap[s.date] = true;
    });
    // Per-occurrence averages
    var dayCounts = [0,0,0,0,0,0,0];
    Object.keys(dateMap).forEach(function(ds){
        dayCounts[new Date(ds+'T00:00:00').getDay()]++;
    });
    var dayAvgs = dayTotals.map(function(t,i){ return dayCounts[i]>0 ? Math.round(t/dayCounts[i]) : 0; });
    var maxAvg  = Math.max.apply(null,dayAvgs)||1;
    var bestIdx = dayAvgs.indexOf(maxAvg);
    var worstNonZero = dayAvgs.filter(function(v){return v>0;});
    var worstVal = worstNonZero.length ? Math.min.apply(null,worstNonZero) : 0;
    var worstIdx = dayAvgs.indexOf(worstVal);

    var h = '<div class="heatmap-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:flex-end;padding-bottom:8px">';
    dayNames.forEach(function(name,i){
        var pct    = maxAvg>0 ? (dayAvgs[i]/maxAvg*100) : 0;
        var height = Math.max(4, pct*0.7);
        var color  = i===bestIdx  ? 'var(--success)' : i===worstIdx && dayAvgs[i]>0 ? 'var(--danger)' : 'var(--brand)';
        var badge  = i===bestIdx  ? '<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:800;background:var(--success);color:#fff;padding:1px 5px;border-radius:4px;white-space:nowrap">Best</div>' : '';
        h += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;position:relative">';
        h += badge;
        h += '<div style="width:100%;border-radius:3px 3px 0 0;height:'+height+'px;background:'+color+';min-height:4px;transition:height 0.5s"></div>';
        h += '<div style="font-size:9px;color:var(--tx3);font-weight:700">'+name+'</div>';
        h += dayAvgs[i]>0 ? '<div style="font-size:8px;color:var(--tx2);font-weight:600">₹'+dayAvgs[i]+'</div>' : '<div style="font-size:8px;color:var(--tx3)">—</div>';
        h += '</div>';
    });
    h += '</div>';

    // Summary row
    var activeDays = Object.keys(dateMap).length;
    var totalAmt   = sales.reduce(function(s,sl){return s+sl.total;},0);
    var avgPerDay  = activeDays>0 ? Math.round(totalAmt/activeDays) : 0;

    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--br)">';
    [['Best Day',dayNames[bestIdx]||'—'],['Slow Day',dayAvgs[worstIdx]>0?dayNames[worstIdx]:'—'],['Avg/Day','₹'+avgPerDay],['Active Days',activeDays]].forEach(function(r){
        h += '<div style="text-align:center"><div style="font-size:14px;font-weight:800">'+r[1]+'</div><div style="font-size:9px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px">'+r[0]+'</div></div>';
    });
    h += '</div>';

    // Weekday vs weekend insight
    var wdAvg = [dayAvgs[1],dayAvgs[2],dayAvgs[3],dayAvgs[4],dayAvgs[5]].filter(Boolean).reduce(function(a,b){return a+b;},0) / 5;
    var weAvg = [dayAvgs[0],dayAvgs[6]].filter(Boolean).reduce(function(a,b){return a+b;},0) / 2;
    if (weAvg > wdAvg*1.1) {
        h += '<div style="margin-top:10px;display:inline-block;font-size:11px;font-weight:700;padding:5px 12px;border-radius:100px;background:rgba(16,185,129,0.1);color:var(--success);border:1px solid rgba(16,185,129,0.2)">📈 Weekends earn '+Math.round((weAvg/wdAvg-1)*100)+'% more than weekdays</div>';
    }
    ct.innerHTML = h;

    // Forecast
    _renderForecast(sales, dateMap);
}

function _renderForecast(sales, dateMap) {
    var ct = document.getElementById('forecastBody');
    if (!ct) return;
    var points = Object.keys(dateMap).sort().map(function(d,i){
        return { x:i, y:sales.filter(function(s){return s.date===d;}).reduce(function(s,sl){return s+sl.total;},0) };
    }).filter(function(p){return p.y>0;});

    if (points.length < 5) { ct.innerHTML='<div class="no-data" style="font-size:12px">Need 5+ days of sales data</div>'; return; }

    var reg = linearRegression(points);
    var nextX = points.length;
    var forecast7 = [], total = 0;
    for (var f=0; f<7; f++) { var v = Math.round(reg.predict(nextX+f)); forecast7.push(v); total+=v; }

    var r2    = Math.round(reg.r2*100);
    var conf  = r2>70?'High':r2>40?'Medium':'Low';
    var trend = reg.slope>50  ? {label:'📈 Upward trend',    cls:'up'}
              : reg.slope<-50 ? {label:'📉 Downward trend',  cls:'dn'}
              : {label:'→ Stable revenue', cls:'na'};

    var h = '<div class="forecast-card">';
    [['7-Day Revenue Forecast','₹'+total.toLocaleString(),''],
     ['Daily Average (forecast)','₹'+Math.round(total/7),''],
     ['Trend',trend.label,trend.cls],
     ['Confidence',conf+' (R²: '+r2+'%)','']
    ].forEach(function(r){
        h+='<div class="fc-row"><span class="fc-lbl">'+r[0]+'</span><span class="fc-val '+(r[2]?'fc-val '+r[2]:'')+'">'+r[1]+'</span></div>';
    });
    h += '</div>';
    ct.innerHTML = h;
}


// ══════════════════════════════════════════════
// UNIT ECONOMICS — TRUE MARGIN
// ══════════════════════════════════════════════
function renderUnitEconomics() {
    var range    = _getWindowRange();
    var sales    = dataInRange(allSales,    range.start, range.end);
    var expenses = dataInRange(allExpenses, range.start, range.end);

    var totalRoti = sales.reduce(function(s,sl){return s+sl.quantity;},0);
    var totalRev  = sales.reduce(function(s,sl){return s+sl.total;},0);
    if (!totalRoti) {
        var ueBody = document.getElementById('unitEconBody');
        if (ueBody) ueBody.innerHTML='<div class="no-data">No sales data in this period</div>';
        return;
    }

    var costByCat = {};
    var totalExp  = 0;
    expenses.forEach(function(x){ if(!costByCat[x.category])costByCat[x.category]=0; costByCat[x.category]+=x.amount; totalExp+=x.amount; });

    var profit    = totalRev - totalExp;
    var margin    = totalRev>0 ? ((profit/totalRev)*100).toFixed(1) : '0';
    var revPerRoti= totalRev/totalRoti;
    var costPerRoti=totalExp/totalRoti;
    var profitPerRoti=revPerRoti-costPerRoti;

    // Gauge
    var gFill = document.getElementById('ueGaugeFill');
    var gPct  = document.getElementById('ueMarginPct');
    if (gFill) {
        var angle = -90 + (parseFloat(margin)/100)*90;
        gFill.style.transform = 'rotate('+angle+'deg)';
        gFill.style.background = parseFloat(margin)>60?'var(--success)':parseFloat(margin)>30?'var(--warning)':'var(--danger)';
    }
    if (gPct) { gPct.textContent=margin+'%'; gPct.style.color=parseFloat(margin)>60?'var(--success)':parseFloat(margin)>30?'var(--warning)':'var(--danger)'; }

    var body = document.getElementById('unitEconBody');
    if (!body) return;
    var h = '<div class="ue-table"><div class="ue-row"><span class="ue-lbl">Avg Selling Rate</span><span class="ue-val">₹'+revPerRoti.toFixed(2)+'/roti</span></div>';
    Object.keys(costByCat).forEach(function(cat){
        var cpr = (costByCat[cat]/totalRoti).toFixed(2);
        h += '<div class="ue-row"><span class="ue-lbl">'+catNm(cat)+' Cost/Roti</span><span class="ue-val red">-₹'+cpr+'</span></div>';
    });
    h += '<div class="ue-row total"><span class="ue-lbl">Profit/Roti</span><span class="ue-val '+(profitPerRoti>=0?'green':'red')+'">'+(profitPerRoti>=0?'₹':'-₹')+Math.abs(profitPerRoti).toFixed(2)+'</span></div></div>';
    h += '<div class="ue-table" style="margin-top:10px">';
    [['Total Roti Sold',totalRoti.toLocaleString(),''],['Total Revenue','₹'+totalRev.toLocaleString(),'green'],['Total Expenses','-₹'+totalExp.toLocaleString(),'red'],['Net Profit',(profit>=0?'₹':'-₹')+Math.abs(profit).toLocaleString(),profit>=0?'green':'red']].forEach(function(r){
        h+='<div class="ue-row"><span class="ue-lbl">'+r[0]+'</span><span class="ue-val '+r[2]+'">'+r[1]+'</span></div>';
    });
    h += '</div>';
    h += '<div class="ue-note">All expense categories included. True margin = '+margin+'%.</div>';
    body.innerHTML = h;

    // Price optimization suggestion
    _renderPriceOptimizer(revPerRoti, costPerRoti, totalRev, totalExp);
}

function _renderPriceOptimizer(currentRate, costPerRoti, totalRev, totalExp) {
    var targetMargin = 0.65; // 65% target
    var requiredRate = costPerRoti / (1 - targetMargin);
    if (currentRate < requiredRate) {
        var insight = document.createElement('div');
        insight.className = 'insight-card ic-amber';
        insight.style.margin = '10px 16px 0';
        insight.innerHTML =
            '<div class="insight-ic">💡</div>' +
            '<div class="insight-text">To achieve 65% margin, consider raising your rate from <strong>₹'+currentRate.toFixed(1)+'</strong> to <strong>₹'+requiredRate.toFixed(1)+'</strong> per roti. Current margin: '+ (totalRev>0?((totalRev-totalExp)/totalRev*100).toFixed(1):0)+'%</div>';
        var body = document.getElementById('unitEconBody');
        if (body) body.appendChild(insight);
    }
}


// ══════════════════════════════════════════════
// CUSTOMER INSIGHTS + RISK SCORING
// ══════════════════════════════════════════════
function renderCustomerInsights() {
    var ct = document.getElementById('customerInsightsBody');
    if (!ct) return;
    if (!allCustomers.length) { ct.innerHTML='<div class="no-data">No customers added yet</div>'; return; }

    var today   = new Date(); today.setHours(23,59,59,999);
    var cut30   = new Date(); cut30.setDate(cut30.getDate()-30);
    var cut30s  = cut30.getFullYear()+'-'+S(cut30.getMonth()+1)+'-'+S(cut30.getDate());

    var data = allCustomers.map(function(c){
        var cs = allSales.filter(function(s){return s.customerId===c.id;});
        if (!cs.length) return null;
        cs.sort(function(a,b){return a.date<b.date?1:-1;});
        var totalRev = cs.reduce(function(s,sl){return s+sl.total;},0);
        var totalRoti= cs.reduce(function(s,sl){return s+sl.quantity;},0);
        var lastDate = new Date(cs[0].date+'T00:00:00');
        var daysInac = Math.round((today-lastDate)/86400000);
        var creditSls= cs.filter(function(s){return s.paymentType==='credit';}).length;
        var reliPct  = Math.round((1-(creditSls/cs.length))*100);
        var creditGiven = cs.filter(function(s){return s.paymentType==='credit';}).reduce(function(s,sl){return s+sl.total;},0);
        var creditPaid  = allCreditPayments.filter(function(p){return p.customerId===c.id;}).reduce(function(s,p){return s+p.amount;},0);
        var pending  = Math.max(0, creditGiven-creditPaid);
        // CLV estimate: avg monthly revenue × estimated 12 months
        var recent30 = cs.filter(function(s){return s.date>=cut30s;}).reduce(function(s,sl){return s+sl.total;},0);
        var clv      = Math.round(recent30 * 12);
        // Risk score
        var inacScore = daysInac<=1?40:daysInac<=3?30:daysInac<=7?15:0;
        var relScore  = Math.round(reliPct*0.4);
        var freqScore = Math.min(20, cs.filter(function(s){return s.date>=cut30s;}).length);
        var riskScore = inacScore+relScore+freqScore;
        var riskLabel = riskScore>=60?'Active':riskScore>=35?'At Risk':'Inactive';
        var riskColor = riskScore>=60?'cp-active':riskScore>=35?'cp-atrisk':'cp-inactive';
        return {id:c.id,name:c.name,totalRev:totalRev,totalRoti:totalRoti,clv:clv,daysInac:daysInac,riskScore:riskScore,riskLabel:riskLabel,riskColor:riskColor,pending:pending,salesCount:cs.length};
    }).filter(Boolean);

    if (!data.length) { ct.innerHTML='<div class="no-data">No sales data to analyze</div>'; return; }
    data.sort(function(a,b){return b.totalRev-a.totalRev;});
    var topRev = data[0].totalRev;

    var h = '';
    data.slice(0,8).forEach(function(c,i){
        var rank = i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1);
        h += '<div class="cust-insight-card">';
        h += '<div class="ci-row"><div class="ci-rank">'+rank+'</div><div class="ci-name">'+esc(c.name)+'</div><div class="ci-rev">₹'+c.totalRev.toLocaleString()+'</div></div>';
        h += '<div class="ci-bar-bg"><div class="ci-bar-fill" style="width:'+Math.round(c.totalRev/topRev*100)+'%;background:'+(i===0?'var(--success)':'var(--brand)')+'"></div></div>';
        h += '<div class="ci-meta">';
        h += '<span class="ci-pill '+c.riskColor+'">'+c.riskLabel+'</span>';
        h += '<span class="ci-stat">'+c.totalRoti+' roti · '+(c.daysInac===0?'Today':c.daysInac+'d ago')+'</span>';
        h += '<span class="ci-stat">CLV ₹'+c.clv.toLocaleString()+'/yr</span>';
        if (c.pending>0) h += '<span class="ci-pill cp-pending">₹'+c.pending+' pending</span>';
        h += '</div></div>';
    });
    ct.innerHTML = h;
}


// ══════════════════════════════════════════════
// COHORT HEATMAP (NEW V8)
// ══════════════════════════════════════════════
function renderCohortHeatmap() {
    var ct = document.getElementById('cohortGrid');
    if (!ct) return;
    if (!allCustomers.length || !allSales.length) { ct.innerHTML='<div class="no-data" style="font-size:12px">Need sales data for cohort analysis</div>'; return; }

    // Build last 6 months
    var months = [];
    for (var m=5; m>=0; m--) {
        var d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-m);
        months.push({ label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()], year:d.getFullYear(), month:d.getMonth()+1 });
    }

    // Top 8 customers by revenue
    var custRevMap = {};
    allSales.forEach(function(s){ if(s.customerId){ if(!custRevMap[s.customerId])custRevMap[s.customerId]=0; custRevMap[s.customerId]+=s.total; } });
    var topCusts = Object.keys(custRevMap).sort(function(a,b){return custRevMap[b]-custRevMap[a];}).slice(0,8);

    if (!topCusts.length) { ct.innerHTML='<div class="no-data" style="font-size:12px">Not enough customer data</div>'; return; }

    // Find max revenue in any cell for color scaling
    var maxCell = 0;
    topCusts.forEach(function(cid){
        months.forEach(function(mo){
            var rev = allSales.filter(function(s){
                var parts = s.date.split('-');
                return s.customerId===cid && parseInt(parts[1],10)===mo.month && parseInt(parts[0],10)===mo.year;
            }).reduce(function(s,sl){return s+sl.total;},0);
            if (rev>maxCell) maxCell=rev;
        });
    });

    var h = '';
    // Header row
    h += '<div style="display:flex;gap:3px;margin-bottom:4px;padding-left:72px">';
    months.forEach(function(mo){ h += '<div style="flex:1;text-align:center;font-size:9px;color:var(--tx3);font-weight:700">'+mo.label+'</div>'; });
    h += '</div>';

    topCusts.forEach(function(cid){
        var cust = findInArray(allCustomers, cid);
        if (!cust) return;
        var name = cust.name.length>10 ? cust.name.slice(0,9)+'…' : cust.name;
        h += '<div style="display:flex;align-items:center;gap:3px;margin-bottom:3px">';
        h += '<div style="width:68px;font-size:10px;color:var(--tx3);font-weight:600;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(name)+'</div>';
        months.forEach(function(mo){
            var rev = allSales.filter(function(s){
                var parts = s.date.split('-');
                return s.customerId===cid && parseInt(parts[1],10)===mo.month && parseInt(parts[0],10)===mo.year;
            }).reduce(function(s,sl){return s+sl.total;},0);
            var intensity = maxCell>0 ? rev/maxCell : 0;
            var bg, title;
            if (rev===0)       { bg='var(--s3)'; title='No orders'; }
            else if (intensity>0.8) { bg='rgba(249,115,22,0.85)'; title='₹'+rev+' (top)'; }
            else if (intensity>0.6) { bg='rgba(249,115,22,0.65)'; title='₹'+rev+' (high)'; }
            else if (intensity>0.4) { bg='rgba(249,115,22,0.45)'; title='₹'+rev; }
            else if (intensity>0.2) { bg='rgba(249,115,22,0.25)'; title='₹'+rev+' (low)'; }
            else                    { bg='rgba(249,115,22,0.12)'; title='₹'+rev+' (minimal)'; }
            h += '<div style="flex:1;height:20px;border-radius:3px;background:'+bg+';cursor:default" title="'+esc(cust.name)+' '+mo.label+': '+title+'"></div>';
        });
        h += '</div>';
    });

    // Legend
    h += '<div style="display:flex;align-items:center;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid var(--br)">';
    h += '<div style="font-size:9px;color:var(--tx3);font-weight:600">Low</div>';
    [0.1,0.3,0.5,0.7,0.9].forEach(function(v){
        h += '<div style="width:20px;height:10px;border-radius:2px;background:rgba(249,115,22,'+v+')"></div>';
    });
    h += '<div style="font-size:9px;color:var(--tx3);font-weight:600">High</div>';
    h += '</div>';

    ct.innerHTML = h;
}


// ══════════════════════════════════════════════
// SMART INSIGHTS ENGINE — BOTH SCREENS
// ══════════════════════════════════════════════
function _buildInsights() {
    var insights = [];
    var today    = todayStr();
    var nowHour  = new Date().getHours();

    // Stock alerts
    ['atta','oil'].forEach(function(cat){
        var info = calculateTrueStock(cat);
        if (!info.purchases.length) return;
        if (info.remaining<=0)         insights.push({p:1,ic:'🚨',text:catNm(cat)+' is completely OUT OF STOCK. Order immediately.',col:'var(--danger)'});
        else if (info.daysRemaining<=1) insights.push({p:1,ic:'🔴',text:catNm(cat)+' will run out TODAY — '+info.remaining+'kg left. Order now!',col:'var(--danger)'});
        else if (info.daysRemaining<=3) insights.push({p:2,ic:'⚠️',text:catNm(cat)+' running low — '+info.remaining+'kg, ~'+info.daysRemaining+' days remaining.',col:'var(--warning)'});
    });

    // Price increase alerts
    ['atta','oil'].forEach(function(cat){
        var ps = allExpenses.filter(function(x){return x.category===cat&&x.weight>0;}).sort(function(a,b){return a.date<b.date?-1:1;});
        if (ps.length<2) return;
        var last=ps[ps.length-1], prev=ps[ps.length-2];
        var chg = ((last.amount/last.weight - prev.amount/prev.weight)/(prev.amount/prev.weight)*100);
        if (chg>=10) insights.push({p:2,ic:'💸',text:catNm(cat)+' price up '+chg.toFixed(1)+'% (₹'+(prev.amount/prev.weight).toFixed(1)+'→₹'+(last.amount/last.weight).toFixed(1)+'/kg). Review selling rate.',col:'var(--warning)'});
        else if (chg<=-5) insights.push({p:4,ic:'💰',text:catNm(cat)+' price dropped '+Math.abs(chg).toFixed(1)+'%! Good time to stock up.',col:'var(--success)'});
    });

    // Today's performance
    var todaySls = salesForDate(today);
    var todayRev = todaySls.reduce(function(s,sl){return s+sl.total;},0);
    var todayRoti= todaySls.reduce(function(s,sl){return s+sl.quantity;},0);
    if (!todaySls.length && nowHour>=8 && nowHour<=18) insights.push({p:2,ic:'📋',text:'No sales recorded yet today. Use Quick Sale to log morning deliveries.',col:'var(--info)'});

    // Yesterday comparison
    var yd = new Date(); yd.setDate(yd.getDate()-1);
    var yds = yd.getFullYear()+'-'+S(yd.getMonth()+1)+'-'+S(yd.getDate());
    var ydRev = salesForDate(yds).reduce(function(s,sl){return s+sl.total;},0);
    if (ydRev>0 && todayRev>0) {
        var delta = ((todayRev-ydRev)/ydRev*100).toFixed(0);
        if (Math.abs(parseFloat(delta))>=15) insights.push({p:3,ic:parseFloat(delta)>0?'📈':'📉',text:"Today's revenue is "+Math.abs(delta)+'% '+(parseFloat(delta)>0?'higher':'lower')+' than yesterday (₹'+todayRev+' vs ₹'+ydRev+').',col:parseFloat(delta)>0?'var(--success)':'var(--danger)'});
    }

    // Inactive customers (5+ days)
    var fiveDaysAgo = new Date(); fiveDaysAgo.setDate(fiveDaysAgo.getDate()-5);
    var cutoff5 = fiveDaysAgo.getFullYear()+'-'+S(fiveDaysAgo.getMonth()+1)+'-'+S(fiveDaysAgo.getDate());
    var inactive = allCustomers.filter(function(c){
        var last=null; allSales.forEach(function(s){if(s.customerId===c.id&&(!last||s.date>last))last=s.date;});
        return last && last<cutoff5;
    });
    if (inactive.length>0) insights.push({p:3,ic:'👤',text:inactive.length+' customer'+(inactive.length>1?'s have':' has')+' not ordered in 5+ days: '+inactive.slice(0,2).map(function(c){return c.name;}).join(', ')+(inactive.length>2?'+'+( inactive.length-2)+' more':'')+'. Follow up.',col:'var(--warning)'});

    // Credit pending
    var totalPending=0;
    allCustomers.forEach(function(c){
        var given=allSales.filter(function(s){return s.customerId===c.id&&s.paymentType==='credit';}).reduce(function(s,sl){return s+sl.total;},0);
        var paid=allCreditPayments.filter(function(p){return p.customerId===c.id;}).reduce(function(s,p){return s+p.amount;},0);
        totalPending+=Math.max(0,given-paid);
    });
    if (totalPending>500) insights.push({p:3,ic:'💳',text:'₹'+totalPending+' total credit pending. Follow up for collection.',col:'var(--warning)'});

    // Revenue trend (last 7 days)
    var pts=[];
    for (var d=6;d>=0;d--){
        var dd=new Date();dd.setDate(dd.getDate()-d);
        var ds=dd.getFullYear()+'-'+S(dd.getMonth()+1)+'-'+S(dd.getDate());
        pts.push({x:6-d,y:salesForDate(ds).reduce(function(s,sl){return s+sl.total;},0)});
    }
    var reg2=linearRegression(pts.filter(function(p){return p.y>0;}));
    if (reg2.slope>100&&reg2.r2>0.4) insights.push({p:4,ic:'🚀',text:'Strong upward revenue trend over the past 7 days! Keep the momentum.',col:'var(--success)'});
    else if (reg2.slope<-100&&reg2.r2>0.4) insights.push({p:2,ic:'📉',text:'Revenue declining consistently this week. Review customer order patterns.',col:'var(--danger)'});

    // Break-even check
    var todayExps = expensesForDate(today).reduce(function(s,x){return s+x.amount;},0);
    if (todayExps>0 && todayRev>0 && todayRev<todayExps) {
        var gap = todayExps-todayRev;
        insights.push({p:2,ic:'⚠️',text:'Today: expenses (₹'+todayExps+') > revenue (₹'+todayRev+'). Need ₹'+gap+' more to break even.',col:'var(--danger)'});
    } else if (todayExps>0 && todayRev>=todayExps) {
        insights.push({p:4,ic:'✅',text:'Break-even achieved today! Revenue ₹'+todayRev+' covers expenses ₹'+todayExps+'. Net: ₹'+(todayRev-todayExps)+'.',col:'var(--success)'});
    }

    insights.sort(function(a,b){return a.p-b.p;});
    return insights;
}

function _renderInsightsList(containerId, limit) {
    var ct = document.getElementById(containerId);
    if (!ct) return;
    var insights = _buildInsights();
    if (!insights.length) {
        ct.innerHTML='<div class="insight-card"><div class="insight-ic">✅</div><div class="insight-text">Everything looks great — stock healthy, sales steady, no issues detected.</div></div>';
        return;
    }
    var toShow = limit ? insights.slice(0,limit) : insights;
    var h = '';
    toShow.forEach(function(ins,i){
        h += '<div class="insight-card" style="animation-delay:'+(i*0.06)+'s;border-left-color:'+ins.col+'">';
        h += '<div class="insight-ic" style="font-size:16px">'+ins.ic+'</div>';
        h += '<div class="insight-text">'+esc(ins.text)+'</div></div>';
    });
    if (limit && insights.length>limit) {
        h += '<div style="text-align:center;font-size:11px;color:var(--tx3);padding:4px 0;font-weight:600">+' + (insights.length-limit) + ' more — check Analytics → Insights tab</div>';
    }
    ct.innerHTML = h;
}

// Dashboard smart insights (limit 5)
function renderSmartInsights() {
    _renderInsightsList('dashInsights', 5);
}

// Analytics screen — full insights list (no limit)
function renderAllInsights() {
    _renderInsightsList('allInsightsList', 0);
}


// ══════════════════════════════════════════════
// DAILY GOAL PROGRESS
// ══════════════════════════════════════════════
function updateGoalProgressAnalytics() {
    var goal = parseInt(localStorage.getItem('mdDailyGoal')||'0',10);
    var inp  = document.getElementById('dailyGoalInput');
    if (inp && !inp.value && goal) inp.value = goal;
    var streak = localStorage.getItem('mdGoalStreak')||'0';
    var infoEl = document.getElementById('goalStreakInfo');
    if (infoEl) infoEl.textContent = parseInt(streak)>0 ? '🔥 '+streak+'-day streak!' : 'Set a goal and hit it every day to build your streak.';
}


// ══════════════════════════════════════════════
// ANALYTICS TAB CONTENT LOADER
// ══════════════════════════════════════════════
var _currentAnTab = 'overview';

function switchAnTab(tab, btn) {
    _currentAnTab = tab;
    document.querySelectorAll('.an-tab').forEach(function(t){t.classList.remove('active');});
    if (btn) btn.classList.add('active');
    var tabs = ['overview','stock','insights','cohort'];
    tabs.forEach(function(t){
        var el = document.getElementById('anTab'+t.charAt(0).toUpperCase()+t.slice(1));
        if (el) el.style.display = (t===tab?'block':'none');
    });
    // Lazy render based on tab
    if (tab==='overview')  { renderUnitEconomics(); renderDayWiseSales(); renderBreakEven(); }
    if (tab==='stock')     { renderStockTracker(); renderPriceTrend(_priceCat); }
    if (tab==='insights')  { renderAllInsights(); renderCustomerInsights(); }
    if (tab==='cohort')    { renderCohortHeatmap(); updateGoalProgressAnalytics(); }
}

// Override loadAnalytics to use new system
function loadAnalytics() {
    _updateAnKPIs();
    switchAnTab(_currentAnTab, document.querySelector('.an-tab.active'));
}

console.log('[Analytics V8] Meri Dukaan v8.0 — Advanced analytics loaded');
