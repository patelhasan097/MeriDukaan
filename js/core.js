/* ================================================
   MERI DUKAAN v6.0 — CORE
   Firebase · State · Utils · Theme · Phase 3
   ================================================ */

// ============ FIREBASE INIT ============
var firebaseConfig = {
    apiKey: "AIzaSyAXqAvTLGfjwEniREFH7AHJ_rgLRAiS7SM",
    authDomain: "meridukaan-5beaf.firebaseapp.com",
    projectId: "meridukaan-5beaf",
    storageBucket: "meridukaan-5beaf.firebasestorage.app",
    messagingSenderId: "286377172046",
    appId: "1:286377172046:web:5bc0334b0230299e71771f"
};

firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var fdb = firebase.firestore();

fdb.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
    if (err.code === 'failed-precondition') console.warn('[DB] Multi-tab: offline limited');
    else if (err.code === 'unimplemented') console.warn('[DB] Browser: no offline support');
});


// ============ GLOBAL STATE ============
var currentUser = null;
var businessId = null;
var businessRef = null;
var userRole = 'owner';
var allCustomers = [];
var allSales = [];
var allExpenses = [];
var allWaste = [];
var allCreditPayments = [];
var allNotes = [];
var unsubscribers = [];
var currentPeriod = 'today';
var curReport = 'daily';
var dpTarget = '';
var dpViewDate = new Date();
var dpSelectedDate = '';
var rptData = {};
var pickerMode = '';
var pinIn = '';
var pin1 = '';
var cfCb = null;
var salesChart = null;
var expenseChart = null;
var currentTheme = localStorage.getItem('mdTheme') || 'auto';
var reportTimer = null;
var pinAttempts = 0;
var pinLockUntil = 0;
// Phase 3
var batchSelectMode = false;
var batchSelected = {};
var deferredInstallPrompt = null;


// ============ UTILITIES ============
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function S(n) { return n < 10 ? '0' + n : '' + n; }

function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + S(d.getMonth()+1) + '-' + S(d.getDate());
}
function fmtDate(s) {
    if (!s) return '';
    var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0];
}
function fmtDateLong(s) {
    if (!s) return '';
    var d = new Date(s+'T00:00:00');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
}
function fmtDateBtn(s) {
    if (!s) return 'Select Date';
    var d = new Date(s+'T00:00:00');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var today = todayStr();
    if (s === today) return '📅 Today, ' + d.getDate() + ' ' + m[d.getMonth()];
    var yd = new Date(); yd.setDate(yd.getDate()-1);
    var yds = yd.getFullYear()+'-'+S(yd.getMonth()+1)+'-'+S(yd.getDate());
    if (s === yds) return '📅 Yesterday, ' + d.getDate() + ' ' + m[d.getMonth()];
    return '📅 ' + days[d.getDay()] + ', ' + d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
}
function getTime(ts) {
    if (!ts) return '';
    var d;
    if (typeof ts.toDate === 'function') d = ts.toDate();
    else if (ts instanceof Date) d = ts;
    else d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + S(d.getMinutes()) + ' ' + ap;
}
function catIc(c) { return {atta:'🌾',oil:'🛢️',gas:'🔥',poly:'🛍️',other:'📦'}[c]||'📦'; }
function catNm(c) { return {atta:'Atta',oil:'Oil',gas:'Gas Cylinder',poly:'Polythene',other:'Other'}[c]||c; }
function payBdg(p) {
    if (p==='cash') return {t:'💵 Cash',c:'slb-c'};
    if (p==='upi')  return {t:'📱 UPI',c:'slb-u'};
    return {t:'💳 Credit',c:'slb-h'};
}
function wasteReasonText(r) {
    return {burnt:'🔥 Burnt',extra:'📦 Extra Made',returned:'↩️ Returned',other:'❓ Other'}[r]||r;
}
function dateShift(ds, off) {
    var d = new Date(ds+'T00:00:00'); d.setDate(d.getDate()+off);
    var t = new Date(); t.setHours(23,59,59,999);
    if (d > t) return null;
    return d.getFullYear()+'-'+S(d.getMonth()+1)+'-'+S(d.getDate());
}
function getDateRange(period) {
    var today = new Date(); today.setHours(0,0,0,0);
    var sd, ed = todayStr();
    if (period === 'today') { sd = ed; }
    else if (period === 'week') {
        var dy = today.getDay(), mon = new Date(today);
        mon.setDate(today.getDate()-(dy===0?6:dy-1));
        sd = mon.getFullYear()+'-'+S(mon.getMonth()+1)+'-'+S(mon.getDate());
    } else if (period === 'month') { sd = today.getFullYear()+'-'+S(today.getMonth()+1)+'-01'; }
    else if (period === 'year') { sd = today.getFullYear()+'-01-01'; }
    return { start: sd, end: ed };
}
function findInArray(arr, id) {
    for (var i=0; i<arr.length; i++) { if (arr[i].id===id) return arr[i]; }
    return null;
}
function isScreenActive(id) { var el=document.getElementById(id); return el&&el.classList.contains('active'); }
function cleanTimestamp(val) {
    if (!val) return null;
    if (typeof val.toDate==='function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return val;
}
function cleanForExport(obj) {
    var r = {};
    Object.keys(obj).forEach(function(k) { r[k] = cleanTimestamp(obj[k]) || obj[k]; });
    return r;
}
function salesForDate(date) { return allSales.filter(function(s){return s.date===date;}); }
function expensesForDate(date) { return allExpenses.filter(function(e){return e.date===date;}); }
function wasteForDate(date) { return allWaste.filter(function(w){return w.date===date;}); }
function dataInRange(arr, sd, ed) { return arr.filter(function(x){return x.date>=sd&&x.date<=ed;}); }

// Customer advance balance
function getCustomerAdvance(cid) {
    var given = 0, paid = 0;
    allSales.forEach(function(s) { if (s.customerId===cid&&s.paymentType==='credit') given+=s.total; });
    allCreditPayments.forEach(function(p) { if (p.customerId===cid) paid+=p.amount; });
    return paid - given; // positive = advance, negative = pending
}


// ============ UI HELPERS ============
function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show '+(type||'success');
    clearTimeout(t._tm);
    t._tm = setTimeout(function(){t.className='toast';}, 2800);
}
function btnLoading(btn, loading) {
    if (!btn) return;
    if (loading) { btn.disabled=true; btn.classList.add('loading'); btn._origText=btn.textContent; }
    else { btn.disabled=false; btn.classList.remove('loading'); if(btn._origText) btn.textContent=btn._origText; }
}
function canModify() { return userRole !== 'staff'; }
function actionBtns(editFn, delFn) {
    if (!canModify()) return '';
    return '<div class="sl-acts">'+
        '<button class="ic-btn ib-e" onclick="'+editFn+'" aria-label="Edit">✏️</button>'+
        '<button class="ic-btn ib-d" onclick="'+delFn+'" aria-label="Delete">🗑️</button>'+
        '</div>';
}


// ============ THEME ============
function applyTheme() {
    var theme = currentTheme;
    if (theme==='auto') {
        document.documentElement.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } else { document.documentElement.setAttribute('data-theme', theme); }
    updateThemeUI();
    if (isScreenActive('reportScreen') && rptData.sd && rptData.ed) {
        setTimeout(function(){ if(typeof renderCharts==='function') renderCharts(rptData.sd, rptData.ed); }, 150);
    }
}
function cycleTheme() {
    if (currentTheme==='auto') currentTheme='light';
    else if (currentTheme==='light') currentTheme='dark';
    else currentTheme='auto';
    localStorage.setItem('mdTheme', currentTheme);
    applyTheme();
    showToast('🎨 Theme: '+currentTheme.charAt(0).toUpperCase()+currentTheme.slice(1));
}
function updateThemeUI() {
    var icon = currentTheme==='dark'?'☀️':currentTheme==='light'?'🌙':'📱';
    var label = currentTheme==='auto'?'System Default':currentTheme==='dark'?'Dark Mode':'Light Mode';
    var el;
    el=document.getElementById('themeTogBtn'); if(el) el.textContent=icon;
    el=document.getElementById('setThemeIc'); if(el) el.textContent=icon;
    el=document.getElementById('setThemeLabel'); if(el) el.textContent=label;
    el=document.getElementById('setThemeBadge'); if(el) el.textContent=currentTheme.charAt(0).toUpperCase()+currentTheme.slice(1);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){ if(currentTheme==='auto') applyTheme(); });
applyTheme();


// ============ CONFIRM DIALOG ============
function showConfirm(ic, tt, msg, fn) {
    document.getElementById('confirmIcon').textContent = ic;
    document.getElementById('confirmTitle').textContent = tt;
    document.getElementById('confirmMsg').textContent = msg;
    cfCb = fn;
    document.getElementById('confirmDialog').classList.add('active');
    setTimeout(function(){ var b=document.querySelector('.m-no'); if(b) b.focus(); }, 100);
}
function hideConfirm() { document.getElementById('confirmDialog').classList.remove('active'); cfCb=null; }
function onConfirmYes() { if(cfCb) cfCb(); hideConfirm(); }


// ============ PHASE 3: DEBOUNCE ============
function debounce(fn, delay) {
    var timer;
    return function() {
        var args=arguments, ctx=this;
        clearTimeout(timer);
        timer=setTimeout(function(){ fn.apply(ctx,args); }, delay||300);
    };
}


// ============ PHASE 3: ERROR BOUNDARIES ============
window.addEventListener('error', function(e) {
    console.error('[GlobalError]', e.message, e.lineno);
    if (e.filename && (e.filename.indexOf('cdn')!==-1 || e.filename.indexOf('cdnjs')!==-1 || e.filename.indexOf('gstatic')!==-1)) return;
    if (typeof showToast==='function') showToast('⚠️ Kuch galat hua — refresh karo', 'error');
});
window.addEventListener('unhandledrejection', function(e) {
    console.error('[UnhandledPromise]', e.reason);
    if (e.reason && e.reason.code) {
        var code = e.reason.code;
        if (code.indexOf('unavailable')!==-1 || code.indexOf('network')!==-1 || code.indexOf('offline')!==-1) return;
    }
});


// ============ PHASE 3: SKELETON LOADER ============
function showSkeletons(containerId, count) {
    var ct = document.getElementById(containerId);
    if (!ct) return;
    var h = '';
    for (var i=0; i<(count||3); i++) {
        h += '<div class="skel-card" style="animation-delay:'+(i*0.08)+'s">';
        h += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">';
        h += '<div class="skel" style="width:42px;height:42px;border-radius:12px;flex-shrink:0"></div>';
        h += '<div style="flex:1"><div class="skel skel-line med"></div>';
        h += '<div class="skel skel-line short" style="margin-top:6px"></div></div></div>';
        h += '<div class="skel skel-line full"></div></div>';
    }
    ct.innerHTML = h;
}


// ============ PHASE 3: PWA INSTALL BANNER ============
window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    var dismissed = parseInt(localStorage.getItem('pwaInstallDismissed') || '0');
    var threeDays = 3 * 24 * 60 * 60 * 1000;
    if (!localStorage.getItem('pwaInstalled') && (Date.now() - dismissed) > threeDays) {
        setTimeout(showInstallBanner, 4000);
    }
});
window.addEventListener('appinstalled', function() {
    localStorage.setItem('pwaInstalled', '1');
    hideInstallBanner();
    showToast('🎉 App install ho gaya! Home screen pe dekho');
});
function showInstallBanner() {
    var banner = document.getElementById('installBanner');
    if (banner && deferredInstallPrompt) banner.classList.add('show');
}
function hideInstallBanner() {
    var banner = document.getElementById('installBanner');
    if (banner) {
        banner.classList.remove('show');
        localStorage.setItem('pwaInstallDismissed', Date.now().toString());
    }
}
async function triggerInstall() {
    if (!deferredInstallPrompt) { showToast('Browser menu se install karo', 'error'); return; }
    hideInstallBanner();
    deferredInstallPrompt.prompt();
    var result = await deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') localStorage.setItem('pwaInstalled', '1');
    deferredInstallPrompt = null;
}

console.log('[Core] Meri Dukaan v6.0 — Core loaded');