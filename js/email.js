/* ================================================
   MERI DUKAAN v7.0 — EMAIL ALERTS
   Smart email notification system via EmailJS.
   No backend required — 100% client-side.

   SETUP (one-time, 5 minutes):
   1. Go to https://emailjs.com and create a free account
   2. Add Email Service → connect your Gmail or Outlook
   3. Create Email Template — use the HTML below as body:
      Subject: {{subject}}
      Body:    {{message}}
   4. Copy your Service ID, Template ID, and Public Key
   5. In the app: Settings → Email Alerts → enter credentials

   Free tier: 200 emails/month — sufficient for daily alerts.

   ALERT TYPES:
   ✅ Stock critical   — atta/oil ≤ 2 days left (cooldown 12h)
   ✅ Price increase   — ≥ 10% price spike (cooldown 7d per cat)
   ✅ Customer inactive— any customer 5+ days quiet (cooldown 48h)
   ✅ Credit overdue   — pending credit > ₹1000 (cooldown 72h)
   ✅ Weekly summary   — every Monday auto-report (cooldown 7d)
   ================================================ */


// ============ CONFIG STORAGE ============
// All email config lives in localStorage — offline-safe, no Firestore.
// Key: 'mdEmailConfig'  Value: JSON (see _defaultConfig below)

var _emailConfigKey = 'mdEmailConfig';

var _defaultConfig = {
    enabled:     false,
    serviceId:   '',
    templateId:  '',
    publicKey:   '',
    ownerEmail:  '',
    alerts: {
        stock:      true,
        price:      true,
        inactivity: true,
        credit:     true,
        weekly:     false
    }
};

function getEmailConfig() {
    try {
        var raw = localStorage.getItem(_emailConfigKey);
        if (!raw) return Object.assign({}, _defaultConfig);
        var parsed = JSON.parse(raw);
        // Merge with defaults so new keys always exist
        return Object.assign({}, _defaultConfig, parsed, {
            alerts: Object.assign({}, _defaultConfig.alerts, parsed.alerts || {})
        });
    } catch (e) {
        return Object.assign({}, _defaultConfig);
    }
}

function saveEmailConfig(config) {
    localStorage.setItem(_emailConfigKey, JSON.stringify(config));
}

// ---- Cooldown helpers ----
function _cooldownKey(type) { return 'mdEmail_cd_' + type; }

function _isOnCooldown(type, hours) {
    var last = parseInt(localStorage.getItem(_cooldownKey(type)) || '0', 10);
    return (Date.now() - last) < (hours * 60 * 60 * 1000);
}

function _setCooldown(type) {
    localStorage.setItem(_cooldownKey(type), Date.now().toString());
}


// ============ EMAILJS INITIALIZER ============
var _emailjsReady = false;

function initEmailSystem() {
    var cfg = getEmailConfig();
    if (!cfg.enabled || !cfg.publicKey) return;

    // EmailJS SDK must be loaded (added via CDN in index.html)
    if (typeof emailjs === 'undefined') {
        console.warn('[Email] EmailJS SDK not loaded. Add CDN script to index.html.');
        return;
    }
    try {
        emailjs.init(cfg.publicKey);
        _emailjsReady = true;
        console.log('[Email] EmailJS initialized ✅');
    } catch (err) {
        console.error('[Email] Init failed:', err);
    }
}


// ============ CORE SEND FUNCTION ============
/**
 * _sendEmail — thin wrapper around emailjs.send()
 * Returns a Promise that resolves true on success, false on failure.
 * Never throws — all errors are caught and logged.
 */
async function _sendEmail(subject, message) {
    if (!_emailjsReady) {
        console.warn('[Email] Not initialized. Call initEmailSystem() first.');
        return false;
    }
    var cfg = getEmailConfig();
    if (!cfg.serviceId || !cfg.templateId || !cfg.ownerEmail) {
        console.warn('[Email] Missing serviceId / templateId / ownerEmail in config.');
        return false;
    }
    try {
        await emailjs.send(cfg.serviceId, cfg.templateId, {
            to_email:   cfg.ownerEmail,
            subject:    subject,
            message:    message,
            app_name:   'Meri Dukaan',
            sent_at:    new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        });
        console.log('[Email] Sent:', subject);
        return true;
    } catch (err) {
        console.error('[Email] Send failed:', err);
        return false;
    }
}


// ============ ALERT #1 — STOCK CRITICAL ============
async function checkStockAlerts() {
    var cfg = getEmailConfig();
    if (!cfg.enabled || !cfg.alerts.stock) return;

    for (var i = 0; i < ['atta', 'oil'].length; i++) {
        var cat  = ['atta', 'oil'][i];
        var cdKey = 'stock_' + cat;
        if (_isOnCooldown(cdKey, 12)) continue;

        // Use the same calculateTrueStock() from analytics.js
        if (typeof calculateTrueStock !== 'function') continue;
        var info = calculateTrueStock(cat);
        if (!info.purchases.length) continue;

        var shouldSend = info.remaining <= 0 || info.daysRemaining <= 2;
        if (!shouldSend) continue;

        var catName = cat === 'atta' ? 'Atta (Wheat Flour)' : 'Oil';
        var urgency = info.remaining <= 0 ? 'OUT OF STOCK' : 'CRITICAL — ' + info.daysRemaining + ' day(s) remaining';
        var subject = '⚠️ ' + catName + ' Stock ' + urgency + ' | Meri Dukaan';
        var last    = info.lastPurchase;
        var lastStr = last ? last.weight + 'kg purchased on ' + fmtDateLong(last.date) + ' at ₹' + (last.weight > 0 ? (last.amount / last.weight).toFixed(1) : last.amount) + '/kg' : 'No recent purchase';

        var message = [
            'Hello,',
            '',
            'This is an automated alert from your Meri Dukaan business app.',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '📦 STOCK ALERT: ' + catName.toUpperCase(),
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            'Status:         ' + urgency,
            'Remaining:      ' + info.remaining + ' kg',
            'Daily Usage:    ' + info.dailyRate.toFixed(2) + ' kg/day',
            'Days Left:      ' + (info.daysRemaining > 0 ? info.daysRemaining : 0),
            'Last Purchase:  ' + lastStr,
            '',
            info.remaining <= 0
                ? '🚨 ACTION REQUIRED: Stock is completely depleted. Production will stop without immediate restock.'
                : '⚠️ ACTION REQUIRED: Order ' + catName + ' today to avoid production stoppage.',
            '',
            'Estimated order needed: ' + Math.ceil(info.dailyRate * 14) + ' kg (2 weeks supply)',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            'Meri Dukaan — Business Manager',
            'This is an automated alert. Reply to this email to reach the app owner.'
        ].join('\n');

        var sent = await _sendEmail(subject, message);
        if (sent) _setCooldown(cdKey);
    }
}


// ============ ALERT #2 — PRICE INCREASE ============
async function checkPriceAlerts() {
    var cfg = getEmailConfig();
    if (!cfg.enabled || !cfg.alerts.price) return;

    for (var i = 0; i < ['atta', 'oil'].length; i++) {
        var cat  = ['atta', 'oil'][i];
        var purchases = allExpenses
            .filter(function(x) { return x.category === cat && x.weight > 0; })
            .sort(function(a, b) { return a.date < b.date ? -1 : 1; });
        if (purchases.length < 2) continue;

        var last     = purchases[purchases.length - 1];
        var prev     = purchases[purchases.length - 2];
        var lastRate = last.amount / last.weight;
        var prevRate = prev.amount / prev.weight;
        var changePct = ((lastRate - prevRate) / prevRate * 100);

        if (changePct < 10) continue; // Only alert on ≥ 10% increase

        // Use last purchase date as part of cooldown key — fires once per purchase
        var cdKey = 'price_' + cat + '_' + last.date;
        if (_isOnCooldown(cdKey, 24 * 7)) continue; // 7-day cooldown per purchase event

        var catName  = cat === 'atta' ? 'Atta (Wheat Flour)' : 'Oil';
        var subject  = '💸 ' + catName + ' Price +' + changePct.toFixed(1) + '% | Meri Dukaan Alert';

        // Calculate impact on per-roti cost
        var avgKgPerRoti   = allSales.length > 0 && allExpenses.length > 0
            ? allExpenses.filter(function(x) { return x.category === 'atta' && x.weight > 0; }).reduce(function(s,x){return s+x.weight;}, 0) /
              Math.max(1, allSales.reduce(function(s,sl){return s+sl.quantity;}, 0))
            : 0.023;
        var oldCostPerRoti = cat === 'atta' ? prevRate * avgKgPerRoti : 0;
        var newCostPerRoti = cat === 'atta' ? lastRate * avgKgPerRoti : 0;
        var impactLine     = cat === 'atta'
            ? 'Impact on Cost: ₹' + oldCostPerRoti.toFixed(2) + ' → ₹' + newCostPerRoti.toFixed(2) + ' per roti (+₹' + (newCostPerRoti - oldCostPerRoti).toFixed(2) + ')'
            : 'This increases your operating costs. Review pricing if needed.';

        var message = [
            'Hello,',
            '',
            'Your most recent ' + catName + ' purchase shows a significant price increase.',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '💸 PRICE INCREASE ALERT: ' + catName.toUpperCase(),
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            'Previous Price:  ₹' + prevRate.toFixed(2) + '/kg (' + fmtDateLong(prev.date) + ')',
            'New Price:       ₹' + lastRate.toFixed(2) + '/kg (' + fmtDateLong(last.date) + ')',
            'Increase:        +' + changePct.toFixed(1) + '% (₹' + (lastRate - prevRate).toFixed(2) + ' more per kg)',
            '',
            impactLine,
            '',
            '💡 Recommendation:',
            '   Review your roti selling rate. If your current rate does not',
            '   cover the increased input cost, consider a small price adjustment',
            '   for new customers or high-volume accounts.',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            'Meri Dukaan — Business Manager'
        ].join('\n');

        var sent = await _sendEmail(subject, message);
        if (sent) _setCooldown(cdKey);
    }
}


// ============ ALERT #3 — CUSTOMER INACTIVITY ============
async function checkInactivityAlerts() {
    var cfg = getEmailConfig();
    if (!cfg.enabled || !cfg.alerts.inactivity) return;
    if (_isOnCooldown('inactivity', 48)) return;

    var fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    var cutoff = fiveDaysAgo.getFullYear() + '-' + S(fiveDaysAgo.getMonth()+1) + '-' + S(fiveDaysAgo.getDate());

    var inactive = [];
    allCustomers.forEach(function(c) {
        var lastSaleDate = null;
        allSales.forEach(function(s) {
            if (s.customerId === c.id && (!lastSaleDate || s.date > lastSaleDate)) {
                lastSaleDate = s.date;
            }
        });
        if (!lastSaleDate) return; // Never ordered — not a regression
        if (lastSaleDate < cutoff) {
            var daysOff = Math.round((new Date() - new Date(lastSaleDate + 'T00:00:00')) / 86400000);
            var revenue = allSales
                .filter(function(s) { return s.customerId === c.id; })
                .reduce(function(s, sl) { return s + sl.total; }, 0);
            inactive.push({ name: c.name, daysOff: daysOff, lastDate: lastSaleDate, revenue: revenue });
        }
    });

    if (!inactive.length) return;
    inactive.sort(function(a, b) { return b.revenue - a.revenue; });

    var subject = '👤 ' + inactive.length + ' Customer' + (inactive.length > 1 ? 's' : '') + ' Inactive 5+ Days | Meri Dukaan';
    var rows    = inactive.slice(0, 10).map(function(c) {
        return '  • ' + c.name.padEnd(20) + ' — ' + c.daysOff + ' days  (last: ' + fmtDateLong(c.lastDate) + ', total: ₹' + c.revenue + ')';
    }).join('\n');

    var message = [
        'Hello,',
        '',
        'The following customers have not placed an order in 5 or more days.',
        'Consider reaching out to confirm their requirements.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '👤 INACTIVE CUSTOMERS (' + inactive.length + ')',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        rows,
        inactive.length > 10 ? '  ...and ' + (inactive.length - 10) + ' more.' : '',
        '',
        '💡 Action: Call or message these customers to confirm',
        '   whether their orders are paused or discontinued.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Meri Dukaan — Business Manager'
    ].join('\n');

    var sent = await _sendEmail(subject, message);
    if (sent) _setCooldown('inactivity');
}


// ============ ALERT #4 — HIGH CREDIT PENDING ============
async function checkCreditAlerts() {
    var cfg = getEmailConfig();
    if (!cfg.enabled || !cfg.alerts.credit) return;
    if (_isOnCooldown('credit', 72)) return;

    var threshold = 1000;
    var custDebts = [];

    allCustomers.forEach(function(c) {
        var given = allSales
            .filter(function(s) { return s.customerId === c.id && s.paymentType === 'credit'; })
            .reduce(function(s, sl) { return s + sl.total; }, 0);
        var paid  = allCreditPayments
            .filter(function(p) { return p.customerId === c.id; })
            .reduce(function(s, p) { return s + p.amount; }, 0);
        var pending = given - paid;
        if (pending > 0) custDebts.push({ name: c.name, pending: pending, given: given, paid: paid });
    });

    var totalPending = custDebts.reduce(function(s, d) { return s + d.pending; }, 0);
    if (totalPending < threshold) return;

    custDebts.sort(function(a, b) { return b.pending - a.pending; });
    var subject = '💳 ₹' + totalPending + ' Credit Pending from ' + custDebts.length + ' Customer' + (custDebts.length > 1 ? 's' : '') + ' | Meri Dukaan';

    var rows = custDebts.slice(0, 10).map(function(d) {
        return '  • ' + d.name.padEnd(20) + ' — Pending: ₹' + d.pending + ' (Given: ₹' + d.given + ', Paid: ₹' + d.paid + ')';
    }).join('\n');

    var message = [
        'Hello,',
        '',
        'The following customers have outstanding credit balances.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '💳 CREDIT PENDING SUMMARY',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'Total Pending:    ₹' + totalPending,
        'Customers Owing:  ' + custDebts.length,
        '',
        'BREAKDOWN:',
        rows,
        custDebts.length > 10 ? '  ...and ' + (custDebts.length - 10) + ' more.' : '',
        '',
        '💡 Action: Follow up with top debtors first.',
        '   Record their payments in the Credit Register.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Meri Dukaan — Business Manager'
    ].join('\n');

    var sent = await _sendEmail(subject, message);
    if (sent) _setCooldown('credit');
}


// ============ ALERT #5 — WEEKLY SUMMARY (MONDAYS) ============
async function checkWeeklySummary() {
    var cfg = getEmailConfig();
    if (!cfg.enabled || !cfg.alerts.weekly) return;

    var today = new Date();
    if (today.getDay() !== 1) return; // Only on Mondays

    var cdKey = 'weekly_' + today.getFullYear() + '_' + _getWeekNumber(today);
    if (_isOnCooldown(cdKey, 24 * 6)) return; // 6-day cooldown so it fires once per week

    // Last 7 days
    var sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7);
    var sd = sevenAgo.getFullYear() + '-' + S(sevenAgo.getMonth()+1) + '-' + S(sevenAgo.getDate());
    var ed = todayStr();

    var weekSales = dataInRange(allSales, sd, ed);
    var weekExps  = dataInRange(allExpenses, sd, ed);

    var revenue  = weekSales.reduce(function(s, sl) { return s + sl.total; }, 0);
    var expenses = weekExps.reduce(function(s, x) { return s + x.amount; }, 0);
    var profit   = revenue - expenses;
    var roti     = weekSales.reduce(function(s, sl) { return s + sl.quantity; }, 0);

    // Top customer this week
    var custMap = {};
    weekSales.forEach(function(s) {
        var nm = s.customerName || 'Walk-in';
        if (!custMap[nm]) custMap[nm] = 0;
        custMap[nm] += s.total;
    });
    var topCust = Object.entries(custMap).sort(function(a, b) { return b[1] - a[1]; })[0];

    // vs previous week
    var prevEnd = new Date(sevenAgo); prevEnd.setDate(prevEnd.getDate() - 1);
    var prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 6);
    var psd = prevStart.getFullYear() + '-' + S(prevStart.getMonth()+1) + '-' + S(prevStart.getDate());
    var ped = prevEnd.getFullYear()   + '-' + S(prevEnd.getMonth()+1)   + '-' + S(prevEnd.getDate());
    var prevRevenue = dataInRange(allSales, psd, ped).reduce(function(s, sl) { return s + sl.total; }, 0);
    var revChangePct = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue * 100).toFixed(1) : null;

    var subject = '📊 Weekly Summary: ₹' + revenue + ' Revenue | ' + fmtDateLong(sd) + ' — ' + fmtDateLong(ed);
    var message = [
        'Hello,',
        '',
        'Here is your weekly business summary from Meri Dukaan.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '📊 WEEKLY SUMMARY',
        fmtDateLong(sd) + ' — ' + fmtDateLong(ed),
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'Revenue:          ₹' + revenue.toLocaleString(),
        revChangePct ? 'vs Last Week:     ' + (parseFloat(revChangePct) >= 0 ? '+' : '') + revChangePct + '%' : '',
        'Roti Sold:        ' + roti.toLocaleString(),
        'Total Expenses:   ₹' + expenses.toLocaleString(),
        'Net Profit:       ₹' + profit.toLocaleString() + (profit < 0 ? ' ⚠️ (Loss)' : ' ✅'),
        topCust ? 'Top Customer:     ' + topCust[0] + ' (₹' + topCust[1] + ')' : '',
        '',
        profit >= 0
            ? '✅ Strong week! Keep the momentum going.'
            : '⚠️ This week showed a loss. Review expenses and credit collections.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Meri Dukaan — Business Manager'
    ].filter(Boolean).join('\n');

    var sent = await _sendEmail(subject, message);
    if (sent) _setCooldown(cdKey);
}

function _getWeekNumber(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}


// ============ SEND TEST EMAIL ============
async function sendTestEmail() {
    var cfg = getEmailConfig();
    if (!cfg.serviceId || !cfg.templateId || !cfg.publicKey || !cfg.ownerEmail) {
        showToast('❌ Fill in all EmailJS credentials first', 'error');
        return;
    }

    // Re-init with latest config before test
    if (typeof emailjs !== 'undefined') {
        try { emailjs.init(cfg.publicKey); _emailjsReady = true; } catch(e) {}
    }

    var btn = document.getElementById('emailTestBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending...'; }

    var subject = '✅ Meri Dukaan — Email Alerts Are Working!';
    var message = [
        'Hello!',
        '',
        'This is a test email from your Meri Dukaan business app.',
        '',
        'Your email alert system is configured correctly. ✅',
        '',
        'You will now receive automatic alerts for:',
        cfg.alerts.stock      ? '  ✅ Stock running low (atta / oil)' : '  ❌ Stock alerts — disabled',
        cfg.alerts.price      ? '  ✅ Price increases ≥ 10%'          : '  ❌ Price alerts — disabled',
        cfg.alerts.inactivity ? '  ✅ Customer inactivity (5+ days)'  : '  ❌ Inactivity alerts — disabled',
        cfg.alerts.credit     ? '  ✅ Credit pending > ₹1000'         : '  ❌ Credit alerts — disabled',
        cfg.alerts.weekly     ? '  ✅ Weekly summary (every Monday)'   : '  ❌ Weekly summary — disabled',
        '',
        'Alerts are checked automatically when you open the app.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Meri Dukaan v7.0 — Business Manager'
    ].join('\n');

    var sent = await _sendEmail(subject, message);

    if (btn) { btn.disabled = false; btn.textContent = '📧 Send Test Email'; }
    if (sent) {
        showToast('✅ Test email sent! Check your inbox.', 'success');
    } else {
        showToast('❌ Email failed. Check your Service ID, Template ID & Public Key.', 'error');
    }
}


// ============ MASTER CHECK — call on app startup ============
/**
 * runAllEmailChecks — called from startApp() after data loads.
 * Checks all alert conditions and sends emails as needed.
 * Each check is independent — one failure doesn't block others.
 */
async function runAllEmailChecks() {
    var cfg = getEmailConfig();
    if (!cfg.enabled || !_emailjsReady) return;

    // Small delay to ensure allSales/allExpenses are populated from Firestore
    await new Promise(function(resolve) { setTimeout(resolve, 3000); });

    try { await checkStockAlerts(); }    catch(e) { console.error('[Email] Stock check:', e); }
    try { await checkPriceAlerts(); }    catch(e) { console.error('[Email] Price check:', e); }
    try { await checkInactivityAlerts(); } catch(e) { console.error('[Email] Inactivity check:', e); }
    try { await checkCreditAlerts(); }   catch(e) { console.error('[Email] Credit check:', e); }
    try { await checkWeeklySummary(); }  catch(e) { console.error('[Email] Weekly check:', e); }
}

console.log('[Email] Meri Dukaan v7.0 — Email module loaded');