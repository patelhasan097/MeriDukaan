/* ================================================
   MERI DUKAAN v5.0 — COMPLETE APP LOGIC
   ★ FIXED: Android PWA login (sessionStorage bug)
   ★ FIXED: Staff login flakiness
   ★ FIXED: Offline detection false positive
   ★ FIXED: All known bugs
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
    if (err.code === 'failed-precondition') console.warn('[DB] Multiple tabs open — offline limited to one tab');
    else if (err.code === 'unimplemented') console.warn('[DB] Browser does not support offline persistence');
});


// ============ GLOBAL STATE ============
var currentUser = null, businessId = null, businessRef = null, userRole = 'owner';
var allCustomers = [], allSales = [], allExpenses = [], allWaste = [], allCreditPayments = [];
var unsubscribers = [], currentPeriod = 'today', curReport = 'daily';
var dpTarget = '', dpViewDate = new Date(), dpSelectedDate = '', rptData = {}, pickerMode = '';
var pinIn = '', pin1 = '', cfCb = null, pulseChart = null, expenseChart = null;
var currentTheme = localStorage.getItem('mdTheme') || 'auto', reportTimer = null;
var pinAttempts = 0, pinLockUntil = 0, authRetryCount = 0;


// ============ UTILITIES ============
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function S(n) { return n < 10 ? '0' + n : '' + n; }
function todayStr() { var d = new Date(); return d.getFullYear() + '-' + S(d.getMonth()+1) + '-' + S(d.getDate()); }
function fmtDate(s) { if (!s) return ''; var p = s.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function fmtDateLong(s) {
    if (!s) return '';
    var d = new Date(s + 'T00:00:00');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
}
function fmtDateBtn(s) {
    if (!s) return 'Select Date';
    var d = new Date(s + 'T00:00:00');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var today = todayStr();
    if (s === today) return '📅 Today, ' + d.getDate() + ' ' + m[d.getMonth()];
    var yd = new Date(); yd.setDate(yd.getDate()-1);
    var yds = yd.getFullYear() + '-' + S(yd.getMonth()+1) + '-' + S(yd.getDate());
    if (s === yds) return '📅 Yesterday, ' + d.getDate() + ' ' + m[d.getMonth()];
    return '📅 ' + days[d.getDay()] + ', ' + d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
}
function getTime(ts) {
    if (!ts) return '';
    var d;
    if (ts && typeof ts.toDate === 'function') d = ts.toDate();
    else if (ts instanceof Date) d = ts;
    else d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + S(d.getMinutes()) + ' ' + ap;
}
function catIc(c) { return { atta:'🌾', oil:'🛢️', gas:'🔥', poly:'🛍️', other:'📦' }[c] || '📦'; }
function catNm(c) { return { atta:'Atta', oil:'Oil', gas:'Gas', poly:'Polythene', other:'Other' }[c] || c; }
function payBdg(p) {
    if (p === 'cash') return { t:'💵 Cash', c:'slb-c' };
    if (p === 'upi') return { t:'📱 UPI', c:'slb-u' };
    return { t:'💳 Credit', c:'slb-h' };
}
function wasteReasonText(r) { return { burnt:'🔥 Burnt', extra:'📦 Extra Made', returned:'↩️ Returned', other:'❓ Other' }[r] || r; }
function dateShift(ds, off) {
    var d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + off);
    var t = new Date(); t.setHours(23,59,59,999); if (d > t) return null;
    return d.getFullYear() + '-' + S(d.getMonth()+1) + '-' + S(d.getDate());
}
function getDateRange(period) {
    var today = new Date(); today.setHours(0,0,0,0); var sd, ed = todayStr();
    if (period === 'today') { sd = ed; }
    else if (period === 'week') { var dy = today.getDay(), mon = new Date(today); mon.setDate(today.getDate()-(dy===0?6:dy-1)); sd = mon.getFullYear()+'-'+S(mon.getMonth()+1)+'-'+S(mon.getDate()); }
    else if (period === 'month') { sd = today.getFullYear()+'-'+S(today.getMonth()+1)+'-01'; }
    else if (period === 'year') { sd = today.getFullYear()+'-01-01'; }
    return { start: sd, end: ed };
}
function findInArray(arr, id) { for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) return arr[i]; } return null; }
function isScreenActive(id) { var el = document.getElementById(id); return el && el.classList.contains('active'); }
function salesForDate(date) { return allSales.filter(function(s) { return s.date === date; }); }
function expensesForDate(date) { return allExpenses.filter(function(e) { return e.date === date; }); }
function wasteForDate(date) { return allWaste.filter(function(w) { return w.date === date; }); }
function dataInRange(arr, sd, ed) { return arr.filter(function(x) { return x.date >= sd && x.date <= ed; }); }


// ============ UI HELPERS ============
function showToast(msg, type) {
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.className = 'toast show ' + (type || 'success');
    clearTimeout(t._tm); t._tm = setTimeout(function() { t.className = 'toast'; }, 2800);
}
function btnLoading(btn, loading) {
    if (!btn) return;
    if (loading) { btn.disabled = true; btn.classList.add('loading'); btn._origText = btn.textContent; }
    else { btn.disabled = false; btn.classList.remove('loading'); if (btn._origText) btn.textContent = btn._origText; }
}
function canModify() { return userRole !== 'staff'; }
function actionBtns(editFn, delFn) {
    if (!canModify()) return '';
    return '<div class="sl-acts"><button class="ic-btn ib-e" onclick="'+editFn+'" aria-label="Edit">✏️</button>' +
           '<button class="ic-btn ib-d" onclick="'+delFn+'" aria-label="Delete">🗑️</button></div>';
}

// ★ HAPTIC FEEDBACK
function triggerHaptic(type) {
    if (!navigator.vibrate) return;
    if (type === 'success') navigator.vibrate([30, 50, 30]);
    else if (type === 'error') navigator.vibrate([100, 50, 100]);
    else if (type === 'light') navigator.vibrate(15);
}


// ============ THEME SYSTEM ============
function applyTheme() {
    var theme = currentTheme;
    if (theme === 'auto') {
        var pref = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', pref ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    updateThemeUI();
    if (isScreenActive('reportScreen') && rptData.sd && rptData.ed) {
        setTimeout(function() { renderCharts(rptData.sd, rptData.ed); }, 150);
    }
}
function cycleTheme() {
    if (currentTheme === 'auto') currentTheme = 'light';
    else if (currentTheme === 'light') currentTheme = 'dark';
    else currentTheme = 'auto';
    localStorage.setItem('mdTheme', currentTheme);
    applyTheme();
    showToast('🎨 Theme: ' + currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1));
    triggerHaptic('light');
}
function updateThemeUI() {
    var icon = currentTheme === 'dark' ? '☀️' : currentTheme === 'light' ? '🌙' : '📱';
    var label = currentTheme === 'auto' ? 'System Default' : currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
    var badge = currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
    var el;
    el = document.getElementById('themeTogBtn'); if (el) el.textContent = icon;
    el = document.getElementById('setThemeIc'); if (el) el.textContent = icon;
    el = document.getElementById('setThemeLabel'); if (el) el.textContent = label;
    el = document.getElementById('setThemeBadge'); if (el) el.textContent = badge;
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (currentTheme === 'auto') applyTheme();
});
applyTheme();


// ============ ★ AUTH — COMPLETELY FIXED ============
// ★ MAIN FIX: Android PWA pe signInWithRedirect kaam nahi karta
// sessionStorage partitioned hoti hai PWA mode mein
// Solution: HAMESHA signInWithPopup use karo
// Sirf popup block hone pe redirect fallback karo

function googleSignIn() {
    var btn = document.getElementById('googleBtn');
    if (!btn) return;
    btn.disabled = true;
    var span = btn.querySelector('span');
    if (span) span.textContent = 'Signing in...';

    // Hide offline note jab sign in try ho
    var note = document.getElementById('loginOfflineNote');
    var retryBtn = document.getElementById('offlineRetryBtn');
    if (note) note.style.display = 'none';
    if (retryBtn) retryBtn.style.display = 'none';

    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    // ★ KEY FIX: HAMESHA POPUP — redirect koi bhi device pe use nahi karo
    // Android PWA + Chrome mein sessionStorage partition hoti hai
    // isliye signInWithRedirect "missing initial state" error deta hai
    auth.signInWithPopup(provider).catch(function(error) {
        console.warn('[Auth] Popup error:', error.code, error.message);

        // Button wapas enable karo
        if (btn) {
            btn.disabled = false;
            var s = btn.querySelector('span');
            if (s) s.textContent = 'Sign in with Google';
        }

        if (error.code === 'auth/popup-blocked') {
            // ★ Popup block hua — user ko batao manually allow kare
            showToast('⚠️ Popup blocked! Browser settings mein allow karo.', 'error');
            // Last resort: redirect try karo
            setTimeout(function() {
                try { auth.signInWithRedirect(provider); } catch(e) { console.warn('[Auth] Redirect also failed:', e); }
            }, 1000);

        } else if (error.code === 'auth/network-request-failed') {
            showToast('❌ Internet nahi hai. Connection check karo.', 'error');
            updateLoginOfflineStatus(true);

        } else if (error.code === 'auth/popup-closed-by-user') {
            // User ne khud band kiya — koi error nahi
            console.log('[Auth] User closed popup');

        } else if (error.code === 'auth/cancelled-popup-request') {
            // Multiple popup requests — ignore karo
            console.log('[Auth] Cancelled duplicate popup');

        } else if (error.code === 'auth/web-storage-unavailable') {
            // ★ EXTRA FIX: Agar storage unavailable ho to user ko guide karo
            showToast('❌ Browser storage issue. Chrome Settings → Privacy → Clear data try karo.', 'error');
            updateLoginOfflineStatus(false, true);

        } else {
            showToast('❌ Login failed: ' + (error.message || 'Try again'), 'error');
        }
    });
}

// ★ Redirect result bhi handle karo (agar kisi wajah se redirect hua ho)
function handleRedirectResult() {
    auth.getRedirectResult().then(function(result) {
        if (result && result.user) {
            console.log('[Auth] Redirect result received for:', result.user.email);
            // onAuthStateChanged already handle karega — yahan kuch nahi karna
        }
    }).catch(function(err) {
        if (err.code && err.code !== 'auth/popup-closed-by-user') {
            console.warn('[Auth] Redirect result error:', err.code, err.message);
            // "missing initial state" error — user ko guide karo
            if (err.code === 'auth/invalid-credential' || err.message.includes('missing initial state')) {
                console.warn('[Auth] sessionStorage issue detected — popup mode pe switch');
                // Koi action nahi chahiye — app already popup use kar rahi hai
            }
        }
    });
}

function updateLoginOfflineStatus(forceShow, storageIssue) {
    var note = document.getElementById('loginOfflineNote');
    var retryBtn = document.getElementById('offlineRetryBtn');
    if (!note) return;

    if (storageIssue) {
        note.textContent = '⚠️ Browser storage issue detected. Chrome → Settings → Privacy → Clear data → Try again.';
        note.style.display = 'block';
        if (retryBtn) retryBtn.style.display = 'none';
    } else if (forceShow || !navigator.onLine) {
        note.textContent = '📴 Offline ho. WiFi/Data check karo aur retry karo.';
        note.style.display = 'block';
        if (retryBtn) retryBtn.style.display = 'block';
    } else {
        note.style.display = 'none';
        if (retryBtn) retryBtn.style.display = 'none';
    }
}

function retrySignIn() {
    if (navigator.onLine) {
        googleSignIn();
    } else {
        showToast('❌ Abhi bhi offline. WiFi check karo.', 'error');
    }
}

function signOutApp() {
    showConfirm('🚪', 'Sign Out?', 'Aap is device se log out ho jaoge.', function() {
        unsubscribers.forEach(function(u) { u(); });
        unsubscribers = [];
        auth.signOut().then(function() {
            currentUser = null; businessId = null; businessRef = null;
            allCustomers = []; allSales = []; allExpenses = []; allWaste = []; allCreditPayments = [];
            goTo('loginScreen');
            showToast('✅ Signed out successfully');
        }).catch(function(err) {
            console.error('[Auth] Sign out error:', err);
            showToast('❌ Sign out failed', 'error');
        });
    });
}

function signOutAndLogin() {
    unsubscribers.forEach(function(u) { u(); });
    unsubscribers = [];
    auth.signOut().then(function() {
        currentUser = null; businessId = null; businessRef = null;
        goTo('loginScreen');
    }).catch(function() {
        currentUser = null; businessId = null; businessRef = null;
        goTo('loginScreen');
    });
}

// ★ FIXED: handleAuthenticated — Staff login + offline + auto-retry
async function handleAuthenticated(user) {
    currentUser = user;
    var pinUser = document.getElementById('pinUserInfo');
    var cachedBizId = localStorage.getItem('mdBusinessId');
    var cachedPin = localStorage.getItem('mdPin');
    var cachedRole = localStorage.getItem('mdUserRole') || 'owner';

    // ★ FIX 1: Offline + cache available — turant use karo, wait mat karo
    if (!navigator.onLine && cachedBizId && cachedPin) {
        console.log('[Auth] Offline mode — using cached credentials');
        businessId = cachedBizId;
        businessRef = fdb.collection('businesses').doc(businessId);
        userRole = cachedRole;
        setupListeners();
        goTo('pinLoginScreen');
        if (pinUser) {
            var img = user.photoURL ? '<img src="' + esc(user.photoURL) + '" alt="">' : '';
            pinUser.innerHTML = img + '<span>' + esc(user.email) + '</span>' +
                '<span style="color:#ffcc80;font-size:10px;margin-left:4px">📴 Offline</span>';
        }
        return;
    }

    try {
        // ★ FIX 2: Owner check karo — businessId = user.uid
        var ownerSnap = await fdb.collection('businesses')
            .where('ownerUid', '==', user.uid).get();

        if (!ownerSnap.empty) {
            businessId = ownerSnap.docs[0].id;
            userRole = 'owner';

        } else {
            // ★ FIX 3: Staff login — email normalize karke match karo
            var userEmail = user.email.toLowerCase().trim();
            var memberSnap = await fdb.collection('businesses')
                .where('memberEmails', 'array-contains', userEmail).get();

            if (!memberSnap.empty) {
                businessId = memberSnap.docs[0].id;
                var bData = memberSnap.docs[0].data();
                var member = (bData.members || []).find(function(m) {
                    return m.email && m.email.toLowerCase().trim() === userEmail;
                });
                userRole = member ? member.role : 'staff';

            } else {
                // New user — business create karo
                businessId = user.uid;
                await fdb.collection('businesses').doc(businessId).set({
                    ownerUid: user.uid,
                    ownerEmail: user.email,
                    ownerName: user.displayName || 'Owner',
                    ownerPhoto: user.photoURL || '',
                    pin: '',
                    members: [],
                    memberEmails: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                userRole = 'owner';
            }
        }

        // Setup karo
        businessRef = fdb.collection('businesses').doc(businessId);
        localStorage.setItem('mdBusinessId', businessId);
        localStorage.setItem('mdUserRole', userRole);
        setupListeners();

        // PIN check karo
        var bizDoc = await businessRef.get();
        var bizData = bizDoc.exists ? bizDoc.data() : {};

        if (!bizData.pin) {
            goTo('pinSetupScreen');
        } else {
            localStorage.setItem('mdPin', bizData.pin);
            goTo('pinLoginScreen');
            if (pinUser) {
                var img2 = user.photoURL ? '<img src="' + esc(user.photoURL) + '" alt="">' : '';
                pinUser.innerHTML = img2 + '<span>' + esc(user.email) + '</span>';
            }
        }

        authRetryCount = 0; // Reset retry count on success

    } catch (err) {
        console.error('[Auth] Setup error:', err);

        // ★ FIX 4: Cache se kaam chalao (sab team members ke liye)
        if (cachedBizId && cachedPin) {
            console.log('[Auth] Using cached credentials after error');
            businessId = cachedBizId;
            businessRef = fdb.collection('businesses').doc(businessId);
            userRole = cachedRole;
            setupListeners();
            goTo('pinLoginScreen');
            if (pinUser) {
                var img3 = user.photoURL ? '<img src="' + esc(user.photoURL) + '" alt="">' : '';
                pinUser.innerHTML = img3 + '<span>' + esc(user.email) + '</span>' +
                    '<span style="color:#ffcc80;font-size:10px;margin-left:4px">📴 Cached</span>';
            }
            showToast('📴 Offline mode — cached data use ho rahi hai');

        } else if (authRetryCount < 2) {
            // ★ FIX 5: Flaky connection ke liye auto-retry
            authRetryCount++;
            console.log('[Auth] Retrying... attempt ' + authRetryCount);
            setTimeout(function() { handleAuthenticated(user); }, 2500);
            showToast('⏳ Connecting... please wait');

        } else {
            // Complete failure
            authRetryCount = 0;
            showToast('❌ Setup failed. Internet check karo.', 'error');
            var loginBtn = document.getElementById('googleBtn');
            if (loginBtn) {
                loginBtn.disabled = false;
                var s2 = loginBtn.querySelector('span');
                if (s2) s2.textContent = 'Sign in with Google';
            }
            updateLoginOfflineStatus(true);
            goTo('loginScreen');
        }
    }
}


// ============ REAL-TIME LISTENERS ============
function setupListeners() {
    unsubscribers.forEach(function(u) { u(); });
    unsubscribers = [];
    if (!businessRef) return;

    unsubscribers.push(businessRef.collection('customers').orderBy('name').onSnapshot(function(snap) {
        allCustomers = [];
        snap.forEach(function(doc) { allCustomers.push(Object.assign({ id: doc.id }, doc.data())); });
        if (isScreenActive('customerScreen')) loadCusts();
        if (isScreenActive('quickSaleScreen')) loadQuickSale();
    }, function(err) { console.error('[Sync] Customers:', err); }));

    unsubscribers.push(businessRef.collection('sales').onSnapshot(function(snap) {
        allSales = [];
        snap.forEach(function(doc) { allSales.push(Object.assign({ id: doc.id }, doc.data())); });
        if (isScreenActive('salesScreen')) loadSales();
        if (isScreenActive('dashboardScreen')) refreshDash();
        if (isScreenActive('quickSaleScreen')) loadQuickSale();
        if (isScreenActive('creditScreen')) loadCredit();
        if (isScreenActive('reportScreen')) loadReport();
    }, function(err) { console.error('[Sync] Sales:', err); }));

    unsubscribers.push(businessRef.collection('expenses').onSnapshot(function(snap) {
        allExpenses = [];
        snap.forEach(function(doc) { allExpenses.push(Object.assign({ id: doc.id }, doc.data())); });
        if (isScreenActive('expenseScreen')) loadExps();
        if (isScreenActive('dashboardScreen')) refreshDash();
        if (isScreenActive('reportScreen')) loadReport();
        if (isScreenActive('stockScreen')) loadStockTracker();
    }, function(err) { console.error('[Sync] Expenses:', err); }));

    unsubscribers.push(businessRef.collection('waste').onSnapshot(function(snap) {
        allWaste = [];
        snap.forEach(function(doc) { allWaste.push(Object.assign({ id: doc.id }, doc.data())); });
        if (isScreenActive('wasteScreen')) loadWasteList();
        if (isScreenActive('dashboardScreen')) refreshDash();
    }, function(err) { console.error('[Sync] Waste:', err); }));

    unsubscribers.push(businessRef.collection('creditPayments').onSnapshot(function(snap) {
        allCreditPayments = [];
        snap.forEach(function(doc) { allCreditPayments.push(Object.assign({ id: doc.id }, doc.data())); });
        if (isScreenActive('creditScreen')) loadCredit();
        if (isScreenActive('dashboardScreen')) refreshDash();
    }, function(err) { console.error('[Sync] Credit:', err); }));
}


// ============ FIRESTORE HELPERS ============
function fsAdd(col, data) {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.createdBy = currentUser ? currentUser.email : '';
    return businessRef.collection(col).add(data);
}
function fsUpdate(col, docId, data) {
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedBy = currentUser ? currentUser.email : '';
    return businessRef.collection(col).doc(docId).update(data);
}
function fsDelete(col, docId) { return businessRef.collection(col).doc(docId).delete(); }


// ============ PIN SYSTEM ============
function buildPad(cid, onD, onB) {
    var c = document.getElementById(cid); if (!c) return; c.innerHTML = '';
    '1,2,3,4,5,6,7,8,9,,0,⌫'.split(',').forEach(function(k) {
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'pin-key' + (k === '' ? ' empty' : ''); b.textContent = k;
        b.setAttribute('aria-label', k === '⌫' ? 'Backspace' : k);
        if (k === '⌫') b.onclick = function() { triggerHaptic('light'); onB(); };
        else if (k !== '') b.onclick = function() { triggerHaptic('light'); onD(k); };
        c.appendChild(b);
    });
}
function setDots(did, len) {
    document.querySelectorAll('#' + did + ' i').forEach(function(d, i) { d.className = i < len ? 'filled' : ''; });
}
function pinErr(did, eid, msg) {
    document.querySelectorAll('#' + did + ' i').forEach(function(d) { d.className = 'error'; });
    var el = document.getElementById(eid); if (el) el.textContent = msg;
    triggerHaptic('error');
    setTimeout(function() {
        document.querySelectorAll('#' + did + ' i').forEach(function(d) { d.className = ''; });
        if (el) el.textContent = '';
    }, 800);
}
function initSetup() {
    pinIn = ''; setDots('setupDots', 0);
    var errEl = document.getElementById('setupErr'); if (errEl) errEl.textContent = '';
    buildPad('setupPad', function(d) {
        if (pinIn.length < 4) {
            pinIn += d; setDots('setupDots', pinIn.length);
            if (pinIn.length === 4) { pin1 = pinIn; pinIn = ''; setTimeout(function() { goTo('pinConfirmScreen'); }, 300); }
        }
    }, function() { if (pinIn.length > 0) { pinIn = pinIn.slice(0, -1); setDots('setupDots', pinIn.length); } });
}
function initConfirm() {
    pinIn = ''; setDots('confirmDots', 0);
    var errEl = document.getElementById('confirmErr'); if (errEl) errEl.textContent = '';
    buildPad('confirmPad', function(d) {
        if (pinIn.length < 4) {
            pinIn += d; setDots('confirmDots', pinIn.length);
            if (pinIn.length === 4) {
                if (pinIn === pin1) {
                    var encoded = btoa(pinIn);
                    businessRef.update({ pin: encoded }).then(function() {
                        localStorage.setItem('mdPin', encoded); pinIn = ''; pin1 = '';
                        triggerHaptic('success'); showToast('✅ PIN set successfully!');
                        setTimeout(function() { goTo('dashboardScreen'); }, 300);
                    }).catch(function(err) {
                        console.error('[PIN] Save error:', err);
                        showToast('❌ Error saving PIN', 'error');
                    });
                } else {
                    pinIn = ''; pinErr('confirmDots', 'confirmErr', 'PIN match nahi hua!');
                    setTimeout(function() { goTo('pinSetupScreen'); }, 1000);
                }
            }
        }
    }, function() { if (pinIn.length > 0) { pinIn = pinIn.slice(0, -1); setDots('confirmDots', pinIn.length); } });
}
function initLogin() {
    pinIn = ''; setDots('loginDots', 0);
    var errEl = document.getElementById('loginErr'); if (errEl) errEl.textContent = '';
    buildPad('loginPad', function(d) {
        if (Date.now() < pinLockUntil) {
            var rem = Math.ceil((pinLockUntil - Date.now()) / 1000);
            var el = document.getElementById('loginErr');
            if (el) el.textContent = '🔒 Locked! Wait ' + rem + 's';
            return;
        }
        if (pinIn.length < 4) {
            pinIn += d; setDots('loginDots', pinIn.length);
            if (pinIn.length === 4) { verifyPin(pinIn); }
        }
    }, function() { if (pinIn.length > 0) { pinIn = pinIn.slice(0, -1); setDots('loginDots', pinIn.length); } });
}
function verifyPin(entered) {
    var doCheck = function(stored) {
        var sv = ''; try { sv = atob(stored || ''); } catch(e) {}
        if (entered === sv) {
            pinIn = ''; pinAttempts = 0; triggerHaptic('success');
            setTimeout(function() { goTo('dashboardScreen'); }, 200);
        } else {
            pinIn = ''; pinAttempts++;
            if (pinAttempts >= 5) {
                pinLockUntil = Date.now() + 30000;
                pinErr('loginDots', 'loginErr', '🔒 Too many attempts! Wait 30s');
                pinAttempts = 0;
            } else {
                pinErr('loginDots', 'loginErr', 'Wrong PIN! (' + (5 - pinAttempts) + ' left)');
            }
        }
    };
    if (businessRef) {
        businessRef.get().then(function(doc) {
            doCheck(doc.exists ? doc.data().pin : localStorage.getItem('mdPin'));
        }).catch(function() {
            // Offline — cache se check karo
            doCheck(localStorage.getItem('mdPin'));
        });
    } else {
        doCheck(localStorage.getItem('mdPin'));
    }
}


// ============ NAVIGATION ============
var authScreens = ['splashScreen', 'loginScreen', 'pinSetupScreen', 'pinConfirmScreen', 'pinLoginScreen'];

function goTo(id) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    var screen = document.getElementById(id); if (screen) screen.classList.add('active');
    var nav = document.getElementById('bottomNav');
    if (nav) nav.classList.toggle('show', authScreens.indexOf(id) === -1);
    document.querySelectorAll('.bn-i').forEach(function(n) {
        var a = n.dataset.s === id; n.classList.toggle('active', a);
        n.setAttribute('aria-current', a ? 'page' : 'false');
    });
    switch (id) {
        case 'pinSetupScreen': initSetup(); break;
        case 'pinConfirmScreen': initConfirm(); break;
        case 'pinLoginScreen': initLogin(); break;
        case 'dashboardScreen': refreshDash(); break;
        case 'customerScreen': loadCusts(); break;
        case 'quickSaleScreen': loadQuickSale(); break;
        case 'salesScreen':
            setDateInput('salesDate', todayStr()); updateDateBtn('salesDateBtn', todayStr());
            clearSearch('salesSearch'); loadSales(); break;
        case 'expenseScreen':
            setDateInput('expDate', todayStr()); updateDateBtn('expDateBtn', todayStr()); loadExps(); break;
        case 'wasteScreen':
            setDateInput('wasteDate', todayStr()); updateDateBtn('wasteDateBtn', todayStr()); loadWasteList(); break;
        case 'creditScreen': loadCredit(); break;
        case 'reportScreen':
            setDateInput('reportDate', todayStr()); updateDateBtn('reportDateBtn', todayStr()); loadReport(); break;
        case 'settingScreen': loadSettings(); break;
        case 'stockScreen': loadStockTracker(); break;
    }
    if (authScreens.indexOf(id) === -1) triggerHaptic('light');
    window.scrollTo(0, 0);
}

function lockApp() { goTo('pinLoginScreen'); }

function closeOverlay(id) {
    var el = document.getElementById(id); if (el) el.classList.remove('active');
    var nav = document.getElementById('bottomNav'); if (nav) nav.classList.add('show');
}
function openOverlay(id) {
    var el = document.getElementById(id); if (el) el.classList.add('active');
    var nav = document.getElementById('bottomNav'); if (nav) nav.classList.remove('show');
}
function setDateInput(id, val) { var el = document.getElementById(id); if (el) el.value = val; }
function updateDateBtn(id, val) { var el = document.getElementById(id); if (el) el.textContent = fmtDateBtn(val); }
function clearSearch(id) { var el = document.getElementById(id); if (el) el.value = ''; }


// ============ DATE PICKER ============
function openDatePicker(target) {
    dpTarget = target; var cv = '';
    if (target === 'sales') cv = document.getElementById('salesDate').value;
    else if (target === 'expense') cv = document.getElementById('expDate').value;
    else if (target === 'waste') cv = document.getElementById('wasteDate').value;
    else if (target === 'report') cv = document.getElementById('reportDate').value;
    dpSelectedDate = cv || todayStr();
    dpViewDate = new Date(dpSelectedDate + 'T00:00:00');
    renderCalendar();
    document.getElementById('datePickerSheet').classList.add('active');
}
function closeDatePicker() { document.getElementById('datePickerSheet').classList.remove('active'); }
function dpMonth(off) {
    var nd = new Date(dpViewDate); nd.setDate(1); nd.setMonth(nd.getMonth() + off);
    var now = new Date();
    if (nd.getFullYear() > now.getFullYear() || (nd.getFullYear() === now.getFullYear() && nd.getMonth() > now.getMonth())) return;
    dpViewDate = nd; renderCalendar();
}
function renderCalendar() {
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('dpMonthLabel').textContent = months[dpViewDate.getMonth()] + ' ' + dpViewDate.getFullYear();
    var year = dpViewDate.getFullYear(), month = dpViewDate.getMonth();
    var firstDay = new Date(year, month, 1).getDay(); firstDay = firstDay === 0 ? 6 : firstDay - 1;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = new Date(); today.setHours(23,59,59,999); var todayS = todayStr(); var h = '';
    for (var e = 0; e < firstDay; e++) h += '<button class="dp-day empty" aria-hidden="true"></button>';
    for (var d = 1; d <= daysInMonth; d++) {
        var ds = year + '-' + S(month+1) + '-' + S(d); var dateObj = new Date(year, month, d);
        var cls = 'dp-day';
        if (ds === todayS) cls += ' today';
        if (ds === dpSelectedDate) cls += ' selected';
        if (dateObj > today) cls += ' future';
        h += '<button class="' + cls + '" onclick="pickDate(\'' + ds + '\')" aria-label="' + d + ' ' + months[month] + ' ' + year + '">' + d + '</button>';
    }
    document.getElementById('dpDays').innerHTML = h;
    var now2 = new Date(); var nextBtn = document.getElementById('dpNextBtn');
    if (nextBtn) {
        var atCur = dpViewDate.getFullYear() >= now2.getFullYear() && dpViewDate.getMonth() >= now2.getMonth();
        nextBtn.disabled = atCur;
    }
    var infoEl = document.getElementById('dpSelectedInfo');
    if (infoEl && dpSelectedDate) {
        var sd2 = new Date(dpSelectedDate + 'T00:00:00');
        if (sd2.getMonth() !== month || sd2.getFullYear() !== year) {
            infoEl.textContent = '✓ Selected: ' + fmtDateLong(dpSelectedDate); infoEl.style.display = 'block';
        } else { infoEl.style.display = 'none'; }
    }
}
function pickDate(ds) { dpSelectedDate = ds; applyPickedDate(ds); closeDatePicker(); }
function pickQuickDate(type) {
    var ds;
    if (type === 'today') { ds = todayStr(); }
    else if (type === 'yesterday') { var y = new Date(); y.setDate(y.getDate()-1); ds = y.getFullYear()+'-'+S(y.getMonth()+1)+'-'+S(y.getDate()); }
    else if (type === 'week') { var t = new Date(); var dy = t.getDay(); t.setDate(t.getDate()-(dy===0?6:dy-1)); ds = t.getFullYear()+'-'+S(t.getMonth()+1)+'-'+S(t.getDate()); }
    applyPickedDate(ds); closeDatePicker();
}
function applyPickedDate(ds) {
    if (dpTarget === 'sales') { setDateInput('salesDate', ds); updateDateBtn('salesDateBtn', ds); loadSales(); }
    else if (dpTarget === 'expense') { setDateInput('expDate', ds); updateDateBtn('expDateBtn', ds); loadExps(); }
    else if (dpTarget === 'waste') { setDateInput('wasteDate', ds); updateDateBtn('wasteDateBtn', ds); loadWasteList(); }
    else if (dpTarget === 'report') { setDateInput('reportDate', ds); updateDateBtn('reportDateBtn', ds); loadReport(); }
}


// ============ CUSTOMER PICKER ============
function openCustPicker(mode) {
    pickerMode = mode; renderPickerList(allCustomers);
    var el = document.getElementById('custSearch'); if (el) el.value = '';
    document.getElementById('custPickerSheet').classList.add('active');
}
function closeCustPicker() { document.getElementById('custPickerSheet').classList.remove('active'); }
function filterCustPicker(val) {
    val = val.toLowerCase();
    renderPickerList(allCustomers.filter(function(c) { return c.name.toLowerCase().indexOf(val) !== -1; }));
}
function renderPickerList(cs) {
    var ct = document.getElementById('custPickerList'); if (!ct) return;
    if (!cs.length) { ct.innerHTML = '<div class="no-data">No customer found</div>'; return; }
    var h = '';
    cs.forEach(function(c) {
        h += '<div class="bts-item" role="option" data-cid="' + c.id + '">' +
             '<span class="bts-item-name">' + esc(c.name) + '</span>' +
             '<span class="bts-item-rate">₹' + c.rate + '</span></div>';
    });
    ct.innerHTML = h;
}
document.addEventListener('DOMContentLoaded', function() {
    var pl = document.getElementById('custPickerList');
    if (pl) {
        pl.addEventListener('click', function(e) {
            var item = e.target.closest('.bts-item'); if (!item) return;
            var cid = item.getAttribute('data-cid'); if (!cid) return;
            var c = findInArray(allCustomers, cid); if (c) selectCust(c);
        });
    }
});
function selectCust(c) {
    if (pickerMode === 'sale') {
        document.getElementById('sfCustomerId').value = c.id;
        document.getElementById('sfCustomerName').value = c.name;
        document.getElementById('sfCustLabel').textContent = c.name + ' (₹' + c.rate + ')';
        document.getElementById('sfCustBtn').classList.add('selected');
        document.getElementById('sfRate').value = c.rate;
        if (c.orderType === 'fixed' && c.fixedQty > 0) {
            document.getElementById('sfQty').value = c.fixedQty;
        } else {
            document.getElementById('sfQty').value = '';
            setTimeout(function() { document.getElementById('sfQty').focus(); }, 300);
        }
        calcSaleTotal(); checkDuplicateSale(c.id, c.name);
    }
    closeCustPicker();
}
function checkDuplicateSale(custId, custName) {
    var dateEl = document.getElementById('salesDate');
    var dateVal = (dateEl && dateEl.value) ? dateEl.value : todayStr();
    var existing = allSales.find(function(s) { return s.customerId === custId && s.date === dateVal; });
    var warn = document.getElementById('sfDupWarn'), warnText = document.getElementById('sfDupText');
    if (warn && existing) {
        if (warnText) warnText.textContent = esc(custName) + ' already has ' + existing.quantity + ' roti sale today (₹' + existing.total + ')';
        warn.style.display = 'block';
    } else if (warn) { warn.style.display = 'none'; }
}


// ============ FORM HELPERS ============
function setPayType(hid, val, btn) {
    var el = document.getElementById(hid); if (el) el.value = val;
    btn.parentElement.querySelectorAll('.tgl').forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
}
function setOrderType(t, btn) {
    document.getElementById('cfOrderType').value = t;
    document.querySelectorAll('#customerForm .tgl').forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
    document.getElementById('fixedQtyGroup').style.display = t === 'fixed' ? 'block' : 'none';
    if (t !== 'fixed') document.getElementById('cfQty').value = '';
}
function setSaleType(type, btn) {
    document.getElementById('sfType').value = type;
    btn.parentElement.querySelectorAll('.tgl').forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
    document.getElementById('sfCustGroup').style.display = type === 'regular' ? 'block' : 'none';
    document.getElementById('sfWalkinGroup').style.display = type === 'walkin' ? 'block' : 'none';
    var warn = document.getElementById('sfDupWarn'); if (warn) warn.style.display = 'none';
    if (type === 'walkin') {
        document.getElementById('sfRate').removeAttribute('readonly');
        document.getElementById('sfQty').value = '';
        document.getElementById('sfCustomerId').value = '';
        document.getElementById('sfCustomerName').value = '';
        var lr = localStorage.getItem('mdLastWalkinRate');
        document.getElementById('sfRate').value = lr || '';
    } else {
        document.getElementById('sfRate').setAttribute('readonly', 'readonly');
    }
    calcSaleTotal();
}
function setExpCat(cat, btn) {
    document.getElementById('efCat').value = cat;
    document.querySelectorAll('#expForm .cat').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active'); setExpCatUI(cat); showLastRate(cat);
}
function setExpCatUI(cat) {
    document.getElementById('efDetailGrp').style.display = cat === 'other' ? 'block' : 'none';
    document.getElementById('efWeightGrp').style.display = (cat === 'atta' || cat === 'oil') ? 'block' : 'none';
}
function setWasteReason(reason, btn) {
    document.getElementById('wfReason').value = reason;
    document.querySelectorAll('#wasteForm .cat').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
}
function calcSaleTotal() {
    var r = parseFloat(document.getElementById('sfRate').value) || 0;
    var q = parseInt(document.getElementById('sfQty').value) || 0;
    var el = document.getElementById('sfTotal'); if (el) el.textContent = '₹' + (r * q);
}


// ============ CONFIRM DIALOG ============
function showConfirm(ic, tt, msg, fn) {
    document.getElementById('confirmIcon').textContent = ic;
    document.getElementById('confirmTitle').textContent = tt;
    document.getElementById('confirmMsg').textContent = msg;
    cfCb = fn;
    document.getElementById('confirmDialog').classList.add('active');
    setTimeout(function() { var nb = document.querySelector('.m-no'); if (nb) nb.focus(); }, 100);
}
function hideConfirm() { document.getElementById('confirmDialog').classList.remove('active'); cfCb = null; }
function onConfirmYes() { if (cfCb) cfCb(); hideConfirm(); }


// ============ DASHBOARD ============
function setPeriod(period, btn) {
    currentPeriod = period;
    document.querySelectorAll('.pt').forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
    refreshDash();
}
function refreshDash() {
    var now = new Date();
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var dateEl = document.getElementById('todayDate');
    if (dateEl) dateEl.textContent = days[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();
    var hr = now.getHours(); var greetEl = document.getElementById('dashGreeting');
    if (greetEl) greetEl.textContent = hr < 12 ? 'Good Morning!' : hr < 17 ? 'Good Afternoon!' : 'Good Evening!';
    var range = getDateRange(currentPeriod);
    var fs = dataInRange(allSales, range.start, range.end);
    var fe = dataInRange(allExpenses, range.start, range.end);
    var fw = dataInRange(allWaste, range.start, range.end);
    var roti = 0, inc = 0, exp = 0, wasteQty = 0;
    fs.forEach(function(s) { roti += s.quantity; inc += s.total; });
    fe.forEach(function(x) { exp += x.amount; });
    fw.forEach(function(w) { wasteQty += (w.quantity || 0); });
    var profit = inc - exp; var el;
    el = document.getElementById('dRoti'); if (el) el.textContent = roti;
    el = document.getElementById('dIncome'); if (el) el.textContent = '₹' + inc;
    el = document.getElementById('dExpense'); if (el) el.textContent = '₹' + exp;
    var pEl = document.getElementById('dProfit');
    if (pEl) { pEl.textContent = (profit >= 0 ? '₹' : '-₹') + Math.abs(profit); pEl.className = profit >= 0 ? '' : 'neg'; }
    el = document.getElementById('dWaste'); if (el) el.textContent = wasteQty;
    var creditByCust = {};
    allSales.forEach(function(s) {
        if (s.paymentType === 'credit') {
            var key = s.customerId || '__walkin__';
            if (!creditByCust[key]) creditByCust[key] = { g: 0, r: 0 };
            creditByCust[key].g += s.total;
        }
    });
    allCreditPayments.forEach(function(p) {
        var key = p.customerId || '__walkin__';
        if (creditByCust[key]) creditByCust[key].r += p.amount;
    });
    var tcp = 0; Object.values(creditByCust).forEach(function(c) { tcp += Math.max(0, c.g - c.r); });
    el = document.getElementById('dCredit'); if (el) el.textContent = '₹' + tcp;
    // Recent sales (today, last 5)
    var tsl = salesForDate(todayStr()), rs = document.getElementById('recentSales');
    if (rs) {
        if (!tsl.length) { rs.innerHTML = '<div class="no-data">No sales today</div>'; }
        else {
            var h = ''; tsl.slice(-5).reverse().forEach(function(s) {
                var pi = s.paymentType === 'cash' ? '💵' : s.paymentType === 'upi' ? '📱' : '💳';
                h += '<div class="aw-item"><span class="aw-item-n">' + esc(s.customerName || 'Walk-in') + ' (' + s.quantity + ')</span><span class="aw-item-v inc">' + pi + ' ₹' + s.total + '</span></div>';
            });
            rs.innerHTML = h;
        }
    }
    // Recent expenses (today, last 5)
    var tel = expensesForDate(todayStr()), re = document.getElementById('recentExp');
    if (re) {
        if (!tel.length) { re.innerHTML = '<div class="no-data">No expenses today</div>'; }
        else {
            var h2 = ''; tel.slice(-5).reverse().forEach(function(x) {
                h2 += '<div class="aw-item"><span class="aw-item-n">' + catIc(x.category) + ' ' + catNm(x.category) + '</span><span class="aw-item-v exp">-₹' + x.amount + '</span></div>';
            });
            re.innerHTML = h2;
        }
    }
}


// ============ QUICK SALE ============
function loadQuickSale() {
    var today = todayStr(); var labelEl = document.getElementById('quickDateLabel');
    if (labelEl) labelEl.textContent = '📅 ' + fmtDateLong(today);
    var todaySales = salesForDate(today), saleMap = {};
    todaySales.forEach(function(s) { if (s.customerId) saleMap[s.customerId] = s; });
    var pendingInputs = {};
    allCustomers.forEach(function(c) {
        if (saleMap[c.id]) return;
        var qe = document.getElementById('qq_' + c.id), pe = document.getElementById('qp_' + c.id);
        if (qe && qe.value) pendingInputs[c.id] = { qty: qe.value, pay: pe ? pe.getAttribute('data-pay') : 'cash' };
    });
    var done = 0, pend = 0, tot = 0;
    todaySales.forEach(function(s) { tot += s.total; });
    allCustomers.forEach(function(c) { if (saleMap[c.id]) done++; else pend++; });
    var el;
    el = document.getElementById('qsDone'); if (el) el.textContent = done;
    el = document.getElementById('qsPending'); if (el) el.textContent = pend;
    el = document.getElementById('qsTotal'); if (el) el.textContent = '₹' + tot;
    var listEl = document.getElementById('quickSaleList'); if (!listEl) return;
    if (!allCustomers.length) {
        listEl.innerHTML = '<div class="empty"><div class="empty-ic">👥</div><h3>No Customers</h3><p>Add customers first to use Quick Sale</p><button class="empty-btn" onclick="goTo(\'customerScreen\')">Add Customer</button></div>';
        return;
    }
    var h = '';
    allCustomers.forEach(function(c, i) {
        var isDone = !!saleMap[c.id], sale = saleMap[c.id], isFixed = c.orderType === 'fixed';
        var qty = isDone ? sale.quantity : (isFixed ? c.fixedQty : '');
        var amt = isDone ? sale.total : (qty ? qty * c.rate : 0);
        h += '<div class="quick-row' + (isDone ? ' done' : '') + '" style="animation-delay:' + (i * 0.03) + 's">';
        h += '<div class="qr-info"><div class="qr-name">' + esc(c.name) + '</div>';
        h += '<div class="qr-details">' + (isFixed ? '📋 Fixed • ' + c.fixedQty + ' roti' : '🔄 Variable') + '</div>';
        h += '<div class="qr-rate">₹' + c.rate + '/roti</div></div>';
        if (isDone) {
            var pi2 = sale.paymentType === 'cash' ? '💵' : sale.paymentType === 'upi' ? '📱' : '💳';
            h += '<div class="qr-amt">₹' + amt + '</div><button class="qr-status" disabled>' + pi2 + ' ✅</button>';
        } else {
            h += '<input type="number" class="qr-qty" id="qq_' + c.id + '" value="' + (qty || '') + '" ' + (isFixed ? '' : 'placeholder="Qty"') + ' min="1" inputmode="numeric" data-cid="' + c.id + '" data-rate="' + c.rate + '" oninput="quickCalcAmt(this)">';
            h += '<button class="qr-pay" id="qp_' + c.id + '" data-pay="cash" data-cid="' + c.id + '" onclick="cycleQuickPay(this)">💵</button>';
            h += '<div class="qr-amt" id="qa_' + c.id + '">₹' + amt + '</div>';
            h += '<button class="qr-status" data-cid="' + c.id + '" data-rate="' + c.rate + '" onclick="quickSaveSaleBtn(this)">💾</button>';
        }
        h += '</div>';
    });
    listEl.innerHTML = h;
    Object.keys(pendingInputs).forEach(function(cid) {
        var saved = pendingInputs[cid], qe = document.getElementById('qq_' + cid);
        var pe = document.getElementById('qp_' + cid), ae = document.getElementById('qa_' + cid);
        if (qe) { qe.value = saved.qty; var c = findInArray(allCustomers, cid); if (c && ae) ae.textContent = '₹' + (parseInt(saved.qty) * c.rate); }
        if (pe) { pe.setAttribute('data-pay', saved.pay); pe.textContent = saved.pay === 'cash' ? '💵' : saved.pay === 'upi' ? '📱' : '💳'; }
    });
}
function quickCalcAmt(el) {
    var rate = parseFloat(el.getAttribute('data-rate')) || 0, qty = parseInt(el.value) || 0;
    var cid = el.getAttribute('data-cid'), ae = document.getElementById('qa_' + cid);
    if (ae) ae.textContent = '₹' + (qty * rate);
}
function cycleQuickPay(btn) {
    var cur = btn.getAttribute('data-pay'), next, icon;
    if (cur === 'cash') { next = 'upi'; icon = '📱'; }
    else if (cur === 'upi') { next = 'credit'; icon = '💳'; }
    else { next = 'cash'; icon = '💵'; }
    btn.setAttribute('data-pay', next); btn.textContent = icon; triggerHaptic('light');
}
function quickSaveSaleBtn(btn) {
    var cid = btn.getAttribute('data-cid'), rate = parseFloat(btn.getAttribute('data-rate')) || 0;
    var cust = findInArray(allCustomers, cid);
    if (!cust) { showToast('❌ Customer not found', 'error'); return; }
    quickSaveSale(cid, cust.name, rate, btn);
}
async function quickSaveSale(custId, custName, rate, btn) {
    var qe = document.getElementById('qq_' + custId), qty = parseInt(qe ? qe.value : 0) || 0;
    if (qty < 1) { showToast('❌ Enter quantity!', 'error'); return; }
    var pe = document.getElementById('qp_' + custId), payType = pe ? pe.getAttribute('data-pay') : 'cash';
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
        await fsAdd('sales', { customerId: custId, customerName: custName, date: todayStr(), rate: rate, quantity: qty, total: rate * qty, paymentType: payType, saleType: 'regular', source: 'quick' });
        triggerHaptic('success'); showToast('✅ ' + custName + ' — ' + qty + ' roti saved!');
    } catch(err) {
        console.error('[QuickSale]', err); showToast('❌ Error saving', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '💾'; }
    }
}
async function markAllFixedDone() {
    var today = todayStr(), ts = salesForDate(today), sm = {};
    ts.forEach(function(s) { if (s.customerId) sm[s.customerId] = s; });
    var pending = allCustomers.filter(function(c) { return c.orderType === 'fixed' && !sm[c.id]; });
    if (!pending.length) { showToast('✅ All fixed orders already done!'); return; }
    showConfirm('✅', 'Mark All Fixed Done?', pending.length + ' customers will be marked as done.',
        async function() {
            var btn = document.querySelector('.qa-btn'); btnLoading(btn, true);
            try {
                for (var i = 0; i < pending.length; i++) {
                    var c = pending[i]; if (!c.fixedQty || c.fixedQty < 1) continue;
                    await fsAdd('sales', { customerId: c.id, customerName: c.name, date: today, rate: c.rate, quantity: c.fixedQty, total: c.rate * c.fixedQty, paymentType: 'cash', saleType: 'regular', source: 'bulk' });
                }
                triggerHaptic('success'); showToast('✅ ' + pending.length + ' orders marked done!');
            } catch(err) { showToast('❌ Error marking orders', 'error'); }
            finally { btnLoading(btn, false); }
        }
    );
}


// ============ CUSTOMERS ============
function loadCusts() {
    var ct = document.getElementById('customerList'), cc = document.getElementById('custCount');
    if (!ct) return;
    if (cc) cc.textContent = allCustomers.length + ' Customer' + (allCustomers.length !== 1 ? 's' : '');
    if (!allCustomers.length) {
        ct.innerHTML = '<div class="empty"><div class="empty-ic">👥</div><h3>No Customers Yet</h3><p>Add your regular roti customers</p><button class="empty-btn" onclick="openCustomerForm()">+ Add First Customer</button></div>';
        return;
    }
    var h = '';
    allCustomers.forEach(function(c, i) {
        h += '<div class="c-card" style="animation-delay:' + (i * 0.04) + 's">';
        h += '<div class="c-info"><div class="c-name">' + esc(c.name) + '</div>';
        h += '<div class="c-dets"><span class="c-b cb-r">₹' + c.rate + '</span>';
        h += (c.orderType === 'fixed' ? '<span class="c-b cb-f">📋 Fixed</span><span class="c-b cb-v">' + c.fixedQty + ' roti</span>' : '<span class="c-b cb-v">🔄 Variable</span>');
        h += '</div>';
        if (c.phone) h += '<div class="c-ph">📞 ' + esc(c.phone) + '</div>';
        h += '</div>';
        if (canModify()) {
            h += '<div class="c-acts">';
            h += '<button class="ic-btn ib-e" onclick="openCustomerForm(\'' + c.id + '\')" aria-label="Edit">✏️</button>';
            h += '<button class="ic-btn ib-d" onclick="confirmDelCust(\'' + c.id + '\')" aria-label="Delete">🗑️</button>';
            h += '</div>';
        }
        h += '</div>';
    });
    ct.innerHTML = h;
}
function openCustomerForm(id) {
    var form = document.getElementById('customerForm'); if (form) form.reset();
    document.getElementById('cfId').value = ''; document.getElementById('cfOrderType').value = 'fixed';
    document.getElementById('fixedQtyGroup').style.display = 'block';
    document.querySelectorAll('#customerForm .tgl').forEach(function(b, i) { b.classList.toggle('active', i === 0); b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false'); });
    var title = document.getElementById('cfTitle');
    if (id) {
        if (title) title.textContent = 'Edit Customer';
        var c = findInArray(allCustomers, id);
        if (c) {
            document.getElementById('cfId').value = c.id; document.getElementById('cfName').value = c.name;
            document.getElementById('cfRate').value = c.rate; document.getElementById('cfPhone').value = c.phone || '';
            document.getElementById('cfOrderType').value = c.orderType || 'fixed';
            document.getElementById('cfQty').value = c.fixedQty || '';
            document.getElementById('fixedQtyGroup').style.display = c.orderType === 'fixed' ? 'block' : 'none';
            document.querySelectorAll('#customerForm .tgl').forEach(function(b, idx) {
                var a = (idx === 0 && c.orderType === 'fixed') || (idx === 1 && c.orderType !== 'fixed');
                b.classList.toggle('active', a); b.setAttribute('aria-pressed', String(a));
            });
        }
    } else { if (title) title.textContent = 'New Customer'; }
    openOverlay('customerFormOverlay');
}
async function saveCustomer(e) {
    e.preventDefault();
    var name = document.getElementById('cfName').value.trim(), rate = parseFloat(document.getElementById('cfRate').value);
    var orderType = document.getElementById('cfOrderType').value, fixedQty = parseInt(document.getElementById('cfQty').value) || 0;
    if (!name) { showToast('❌ Enter customer name!', 'error'); return; }
    if (!rate || rate <= 0) { showToast('❌ Enter valid rate!', 'error'); return; }
    if (orderType === 'fixed' && fixedQty < 1) { showToast('❌ Enter fixed quantity!', 'error'); return; }
    var data = { name: name, rate: rate, phone: document.getElementById('cfPhone').value.trim() || '', orderType: orderType, fixedQty: orderType === 'fixed' ? fixedQty : 0 };
    var btn = document.getElementById('cfSubmitBtn'); btnLoading(btn, true);
    try {
        var idV = document.getElementById('cfId').value;
        if (idV) { await fsUpdate('customers', idV, data); showToast('✅ Customer updated!'); }
        else { await fsAdd('customers', data); showToast('✅ ' + name + ' added!'); }
        triggerHaptic('success'); closeOverlay('customerFormOverlay');
    } catch(err) { console.error('[Customer]', err); showToast('❌ Error saving customer', 'error'); }
    finally { btnLoading(btn, false); }
}
function confirmDelCust(id) {
    if (!canModify()) { showToast('❌ Staff cannot delete', 'error'); return; }
    var c = findInArray(allCustomers, id); if (!c) return;
    showConfirm('🗑️', 'Delete Customer?', c.name + ' — Delete?', async function() {
        try { await fsDelete('customers', id); showToast('✅ Customer deleted!'); }
        catch(err) { showToast('❌ Error deleting', 'error'); }
    });
}


// ============ SALES ============
function changeSalesDate(off) { var cv = document.getElementById('salesDate').value, nd = dateShift(cv, off); if (nd) { setDateInput('salesDate', nd); updateDateBtn('salesDateBtn', nd); loadSales(); } }
function loadSales() {
    var date = document.getElementById('salesDate').value; if (!date) return;
    var sales = salesForDate(date), roti = 0, income = 0, cash = 0, upi = 0, credit = 0;
    sales.forEach(function(s) { roti += s.quantity; income += s.total; if (s.paymentType === 'cash') cash += s.total; else if (s.paymentType === 'upi') upi += s.total; else credit += s.total; });
    var el;
    el = document.getElementById('sRoti'); if (el) el.textContent = roti;
    el = document.getElementById('sIncome'); if (el) el.textContent = '₹' + income;
    el = document.getElementById('sCash'); if (el) el.textContent = '₹' + (cash + upi);
    el = document.getElementById('sCredit'); if (el) el.textContent = '₹' + credit;
    renderSalesList(sales);
}
function filterSales(val) {
    var date = document.getElementById('salesDate').value, sales = salesForDate(date);
    if (val) { val = val.toLowerCase(); sales = sales.filter(function(s) { return (s.customerName || '').toLowerCase().indexOf(val) !== -1; }); }
    renderSalesList(sales);
}
function renderSalesList(sales) {
    var ct = document.getElementById('salesList'); if (!ct) return;
    if (!sales.length) { ct.innerHTML = '<div class="empty"><div class="empty-ic">🫓</div><h3>No Sales</h3><p>No sales recorded on this date</p><button class="empty-btn" onclick="openSaleForm()">+ Add Sale</button></div>'; return; }
    var h = '';
    sales.slice().reverse().forEach(function(s, i) {
        var pb = payBdg(s.paymentType), isW = s.saleType === 'walkin';
        h += '<div class="sale-card' + (isW ? ' walkin' : '') + '" style="animation-delay:' + (i * 0.04) + 's">';
        h += '<div class="sl-top"><span class="sl-name">' + esc(s.customerName || 'Walk-in') + '</span><span class="sl-amt">₹' + s.total + '</span></div>';
        h += '<div class="sl-badges"><span class="sl-b slb-q">' + s.quantity + ' roti</span><span class="sl-b slb-r">₹' + s.rate + '</span><span class="sl-b ' + pb.c + '">' + pb.t + '</span>' + (isW ? '<span class="sl-b slb-w">🚶 Walk-in</span>' : '') + '</div>';
        h += '<div class="sl-foot"><span class="sl-time">' + getTime(s.createdAt) + '</span>';
        if (canModify()) h += '<div class="sl-acts"><button class="ic-btn ib-e" onclick="openSaleForm(\'' + s.id + '\')" aria-label="Edit">✏️</button><button class="ic-btn ib-d" onclick="confirmDelSale(\'' + s.id + '\')" aria-label="Delete">🗑️</button></div>';
        h += '</div></div>';
    });
    ct.innerHTML = h;
}
function openSaleForm(id) {
    var form = document.getElementById('saleForm'); if (form) form.reset();
    document.getElementById('sfId').value = ''; document.getElementById('sfCustomerId').value = ''; document.getElementById('sfCustomerName').value = '';
    document.getElementById('sfType').value = 'regular'; document.getElementById('sfPay').value = 'cash';
    document.getElementById('sfCustGroup').style.display = 'block'; document.getElementById('sfWalkinGroup').style.display = 'none';
    document.getElementById('sfRate').setAttribute('readonly', 'readonly'); document.getElementById('sfRate').value = '';
    document.getElementById('sfQty').value = ''; document.getElementById('sfTotal').textContent = '₹0';
    var warn = document.getElementById('sfDupWarn'); if (warn) warn.style.display = 'none';
    var title = document.getElementById('sfTitle');
    if (id) {
        if (title) title.textContent = 'Edit Sale'; var s = findInArray(allSales, id);
        if (s) {
            document.getElementById('sfId').value = s.id; document.getElementById('sfCustomerId').value = s.customerId || '';
            document.getElementById('sfCustomerName').value = s.customerName || ''; document.getElementById('sfType').value = s.saleType || 'regular';
            document.getElementById('sfRate').value = s.rate; document.getElementById('sfQty').value = s.quantity;
            document.getElementById('sfTotal').textContent = '₹' + s.total;
            if (s.saleType === 'walkin') { document.getElementById('sfCustGroup').style.display = 'none'; document.getElementById('sfWalkinGroup').style.display = 'block'; document.getElementById('sfWalkinName').value = s.customerName || ''; document.getElementById('sfRate').removeAttribute('readonly'); }
            else { document.getElementById('sfCustLabel').textContent = s.customerName + ' (₹' + s.rate + ')'; document.getElementById('sfCustBtn').classList.add('selected'); }
            document.getElementById('sfPay').value = s.paymentType || 'cash';
        }
    } else {
        if (title) title.textContent = 'New Sale';
        var sl = document.getElementById('sfCustLabel'); if (sl) sl.textContent = '-- Select Customer --';
        var sb = document.getElementById('sfCustBtn'); if (sb) sb.classList.remove('selected');
    }
    openOverlay('saleFormOverlay');
}
async function saveSale(e) {
    e.preventDefault();
    var type = document.getElementById('sfType').value, custId = document.getElementById('sfCustomerId').value, custName = '';
    if (type === 'regular') { if (!custId) { showToast('❌ Select a customer!', 'error'); return; } custName = document.getElementById('sfCustomerName').value; }
    else custName = document.getElementById('sfWalkinName').value.trim() || 'Walk-in Customer';
    var rate = parseFloat(document.getElementById('sfRate').value), qty = parseInt(document.getElementById('sfQty').value);
    if (!rate || rate <= 0) { showToast('❌ Enter valid rate!', 'error'); return; }
    if (!qty || qty < 1) { showToast('❌ Enter valid quantity!', 'error'); return; }
    if (type === 'walkin') localStorage.setItem('mdLastWalkinRate', rate);
    var data = { customerId: type === 'regular' ? custId : '', customerName: custName, saleType: type, rate: rate, quantity: qty, total: rate * qty, paymentType: document.getElementById('sfPay').value, date: document.getElementById('salesDate').value || todayStr() };
    var btn = document.getElementById('sfSubmitBtn'); btnLoading(btn, true);
    try {
        var idV = document.getElementById('sfId').value;
        if (idV) { await fsUpdate('sales', idV, data); showToast('✅ Sale updated!'); }
        else { await fsAdd('sales', data); showToast('✅ Sale saved!'); }
        triggerHaptic('success'); closeOverlay('saleFormOverlay');
    } catch(err) { console.error('[Sale]', err); showToast('❌ Error saving sale', 'error'); }
    finally { btnLoading(btn, false); }
}
function confirmDelSale(id) {
    if (!canModify()) { showToast('❌ Staff cannot delete', 'error'); return; }
    var s = findInArray(allSales, id); if (!s) return;
    showConfirm('🗑️', 'Delete Sale?', (s.customerName || 'Walk-in') + ' — ' + s.quantity + ' roti ₹' + s.total + ' — Delete?', async function() {
        try { await fsDelete('sales', id); showToast('✅ Sale deleted!'); }
        catch(err) { showToast('❌ Error deleting', 'error'); }
    });
}


// ============ EXPENSES ============
function changeExpDate(off) { var cv = document.getElementById('expDate').value, nd = dateShift(cv, off); if (nd) { setDateInput('expDate', nd); updateDateBtn('expDateBtn', nd); loadExps(); } }
function loadExps() {
    var date = document.getElementById('expDate').value; if (!date) return;
    var exps = expensesForDate(date), total = 0; exps.forEach(function(x) { total += x.amount; });
    var el; el = document.getElementById('eTotal'); if (el) el.textContent = '₹' + total; el = document.getElementById('eCount'); if (el) el.textContent = exps.length;
    renderExps(exps);
}
function openExpenseForm(id) {
    var form = document.getElementById('expForm'); if (form) form.reset();
    document.getElementById('efId').value = ''; document.getElementById('efCat').value = 'atta'; document.getElementById('efPay').value = 'cash';
    document.getElementById('efRateInfo').style.display = 'none'; setExpCatUI('atta');
    document.querySelectorAll('#expForm .cat').forEach(function(b) { b.classList.remove('active'); });
    var fc = document.querySelectorAll('#expForm .cat')[0]; if (fc) fc.classList.add('active');
    var title = document.getElementById('efTitle');
    if (id) {
        if (title) title.textContent = 'Edit Expense'; var x = findInArray(allExpenses, id);
        if (x) {
            document.getElementById('efId').value = x.id; document.getElementById('efCat').value = x.category;
            document.getElementById('efAmount').value = x.amount; document.getElementById('efWeight').value = x.weight || '';
            document.getElementById('efDetail').value = x.detail || ''; document.getElementById('efPay').value = x.paymentType || 'cash';
            setExpCatUI(x.category);
            document.querySelectorAll('#expForm .cat').forEach(function(b) { b.classList.remove('active'); });
            var cm = { atta:0, oil:1, gas:2, poly:3, other:4 }; var ci = cm[x.category]; var cb = document.querySelectorAll('#expForm .cat');
            if (ci !== undefined && cb[ci]) cb[ci].classList.add('active');
        }
    } else { if (title) title.textContent = 'New Expense'; showLastRate('atta'); }
    openOverlay('expFormOverlay');
}
function updateExpComparison() {
    var cat = document.getElementById('efCat').value;
    if (cat !== 'atta' && cat !== 'oil') { document.getElementById('efRateInfo').style.display = 'none'; return; }
    var amt = parseFloat(document.getElementById('efAmount').value) || 0, wt = parseFloat(document.getElementById('efWeight').value) || 0;
    showLastRate(cat, amt, wt);
}
function showLastRate(cat, currentAmt, currentWt) {
    var ri = document.getElementById('efRateInfo'); if (!ri) return;
    if (cat !== 'atta' && cat !== 'oil') { ri.style.display = 'none'; return; }
    var all = allExpenses.filter(function(x) { return x.category === cat && x.weight && x.weight > 0 && x.amount > 0; }).sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    if (!all.length) {
        if (currentAmt && currentWt) { ri.textContent = '📊 Current rate: ₹' + (currentAmt/currentWt).toFixed(1) + '/kg'; ri.className = 'rate-box neutral'; ri.style.display = 'block'; }
        else ri.style.display = 'none'; return;
    }
    var last = all[all.length - 1], lastRate = last.amount / last.weight;
    var daysLasted = '';
    if (all.length >= 2) { var d1 = new Date(all[all.length-2].date + 'T00:00:00'), d2 = new Date(last.date + 'T00:00:00'), diff = Math.round((d2-d1)/(1000*60*60*24)); if (diff > 0) daysLasted = '\n⏱️ Last stock lasted: ' + diff + ' days'; }
    else if (last.date) { var da = Math.round((new Date() - new Date(last.date + 'T00:00:00')) / (1000*60*60*24)); if (da >= 0) daysLasted = '\n⏱️ Last stock: ' + da + ' days ago'; }
    var msg;
    if (currentAmt && currentWt) {
        var cr = currentAmt / currentWt, diff2 = ((cr - lastRate) / lastRate * 100);
        msg = '📊 Current: ₹' + cr.toFixed(1) + '/kg' + daysLasted + '\n📊 Last: ₹' + lastRate.toFixed(1) + '/kg';
        if (diff2 > 0) { msg += '\n⬆️ ' + diff2.toFixed(1) + '% MORE expensive'; ri.className = 'rate-box up'; }
        else if (diff2 < 0) { msg += '\n⬇️ ' + Math.abs(diff2).toFixed(1) + '% CHEAPER'; ri.className = 'rate-box down'; }
        else { msg += '\n➡️ Same rate'; ri.className = 'rate-box neutral'; }
    } else {
        msg = '📊 Last ' + catNm(cat) + ': ₹' + lastRate.toFixed(1) + '/kg (' + last.weight + 'kg = ₹' + last.amount + ')' + daysLasted;
        ri.className = 'rate-box neutral';
    }
    ri.textContent = msg; ri.style.whiteSpace = 'pre-line'; ri.style.display = 'block';
}
async function saveExpense(e) {
    e.preventDefault();
    var cat = document.getElementById('efCat').value, amt = parseFloat(document.getElementById('efAmount').value);
    if (!amt || amt <= 0) { showToast('❌ Enter valid amount!', 'error'); return; }
    var weight = parseFloat(document.getElementById('efWeight').value) || null;
    if (weight !== null && weight <= 0) { showToast('❌ Weight must be positive!', 'error'); return; }
    var data = { category: cat, detail: document.getElementById('efDetail').value.trim(), weight: weight, amount: amt, paymentType: document.getElementById('efPay').value, date: document.getElementById('expDate').value || todayStr() };
    var btn = document.getElementById('efSubmitBtn'); btnLoading(btn, true);
    try {
        var idV = document.getElementById('efId').value;
        if (idV) { await fsUpdate('expenses', idV, data); showToast('✅ Expense updated!'); }
        else { await fsAdd('expenses', data); showToast('✅ ' + catNm(cat) + ' ₹' + amt + ' saved!'); }
        triggerHaptic('success'); closeOverlay('expFormOverlay');
    } catch(err) { console.error('[Expense]', err); showToast('❌ Error saving expense', 'error'); }
    finally { btnLoading(btn, false); }
}
function renderExps(exps) {
    var ct = document.getElementById('expList'); if (!ct) return;
    if (!exps.length) { ct.innerHTML = '<div class="empty"><div class="empty-ic">🛒</div><h3>No Expenses</h3><p>No expenses recorded on this date</p><button class="empty-btn" onclick="openExpenseForm()">+ Add Expense</button></div>'; return; }
    var h = '';
    exps.forEach(function(x, i) {
        var pb = payBdg(x.paymentType), det = '';
        if (x.weight && x.weight > 0) det = x.weight + 'kg • ₹' + (x.amount/x.weight).toFixed(1) + '/kg'; else if (x.detail) det = x.detail;
        h += '<div class="exp-card" style="animation-delay:' + (i*0.04) + 's">';
        h += '<div class="ex-top"><div class="ex-cat">' + catIc(x.category) + ' ' + catNm(x.category) + '</div><div class="ex-amt">-₹' + x.amount + '</div></div>';
        if (det) h += '<div class="ex-det">' + esc(det) + '</div>';
        h += '<div class="ex-badges"><span class="sl-b ' + pb.c + '">' + pb.t + '</span></div>';
        h += '<div class="ex-foot"><span class="sl-time">' + getTime(x.createdAt) + '</span>';
        if (canModify()) h += '<div class="sl-acts"><button class="ic-btn ib-e" onclick="openExpenseForm(\'' + x.id + '\')" aria-label="Edit">✏️</button><button class="ic-btn ib-d" onclick="confirmDelExp(\'' + x.id + '\')" aria-label="Delete">🗑️</button></div>';
        h += '</div></div>';
    });
    ct.innerHTML = h;
}
function confirmDelExp(id) {
    if (!canModify()) { showToast('❌ Staff cannot delete', 'error'); return; }
    var x = findInArray(allExpenses, id); if (!x) return;
    showConfirm('🗑️', 'Delete Expense?', catNm(x.category) + ' ₹' + x.amount + ' — Delete?', async function() {
        try { await fsDelete('expenses', id); showToast('✅ Expense deleted!'); } catch(err) { showToast('❌ Error deleting', 'error'); }
    });
}


// ============ WASTE ============
function changeWasteDate(off) { var cv = document.getElementById('wasteDate').value, nd = dateShift(cv, off); if (nd) { setDateInput('wasteDate', nd); updateDateBtn('wasteDateBtn', nd); loadWasteList(); } }
function loadWasteList() {
    var date = document.getElementById('wasteDate').value; if (!date) return;
    var all = wasteForDate(date), totalQty = 0; all.forEach(function(w) { totalQty += (w.quantity || 0); });
    var avgRate = 0; if (allSales.length) { var ta = 0, tq = 0; allSales.forEach(function(s) { ta += s.total; tq += s.quantity; }); avgRate = tq > 0 ? ta / tq : 0; }
    var el; el = document.getElementById('wQty'); if (el) el.textContent = totalQty; el = document.getElementById('wCost'); if (el) el.textContent = '₹' + Math.round(totalQty * avgRate);
    var ct = document.getElementById('wasteList'); if (!ct) return;
    if (!all.length) { ct.innerHTML = '<div class="empty"><div class="empty-ic">🗑️</div><h3>No Waste</h3><p>No waste recorded on this date</p><button class="empty-btn" onclick="openWasteForm()">+ Add Waste</button></div>'; return; }
    var h = '';
    all.forEach(function(w, i) {
        h += '<div class="waste-card" style="animation-delay:' + (i*0.04) + 's">';
        h += '<div class="wc-top"><div class="wc-reason">' + wasteReasonText(w.reason) + '</div><div class="wc-qty">' + w.quantity + ' roti</div></div>';
        if (w.notes) h += '<div class="wc-notes">' + esc(w.notes) + '</div>';
        h += '<div class="wc-foot"><span class="sl-time">' + getTime(w.createdAt) + '</span>';
        if (canModify()) h += '<div class="sl-acts"><button class="ic-btn ib-e" onclick="openWasteForm(\'' + w.id + '\')" aria-label="Edit">✏️</button><button class="ic-btn ib-d" onclick="confirmDelWaste(\'' + w.id + '\')" aria-label="Delete">🗑️</button></div>';
        h += '</div></div>';
    });
    ct.innerHTML = h;
}
function openWasteForm(id) {
    var form = document.getElementById('wasteForm'); if (form) form.reset();
    document.getElementById('wfId').value = ''; document.getElementById('wfReason').value = 'burnt';
    document.querySelectorAll('#wasteForm .cat').forEach(function(b) { b.classList.remove('active'); });
    var fc = document.querySelectorAll('#wasteForm .cat')[0]; if (fc) fc.classList.add('active');
    var te = document.getElementById('wfFormTitle');
    if (id) {
        if (te) te.textContent = 'Edit Waste Entry'; var w = findInArray(allWaste, id);
        if (w) {
            document.getElementById('wfId').value = w.id; document.getElementById('wfQty').value = w.quantity;
            document.getElementById('wfNotes').value = w.notes || ''; document.getElementById('wfReason').value = w.reason || 'burnt';
            var rm = { burnt:0, extra:1, returned:2, other:3 };
            document.querySelectorAll('#wasteForm .cat').forEach(function(b) { b.classList.remove('active'); });
            var ri = rm[w.reason]; if (ri !== undefined) { var rb = document.querySelectorAll('#wasteForm .cat'); if (rb[ri]) rb[ri].classList.add('active'); }
        }
    } else { if (te) te.textContent = 'Add Waste Entry'; }
    openOverlay('wasteFormOverlay');
}
async function saveWaste(e) {
    e.preventDefault(); var qty = parseInt(document.getElementById('wfQty').value);
    if (!qty || qty < 1) { showToast('❌ Enter valid quantity!', 'error'); return; }
    var data = { quantity: qty, reason: document.getElementById('wfReason').value, notes: document.getElementById('wfNotes').value.trim(), date: document.getElementById('wasteDate').value || todayStr() };
    var btn = document.getElementById('wfSubmitBtn'); btnLoading(btn, true);
    try {
        var idV = document.getElementById('wfId').value;
        if (idV) { await fsUpdate('waste', idV, data); showToast('✅ Waste entry updated!'); }
        else { await fsAdd('waste', data); showToast('✅ Waste entry saved!'); }
        triggerHaptic('success'); closeOverlay('wasteFormOverlay');
    } catch(err) { console.error('[Waste]', err); showToast('❌ Error saving waste', 'error'); }
    finally { btnLoading(btn, false); }
}
function confirmDelWaste(id) {
    if (!canModify()) { showToast('❌ Staff cannot delete', 'error'); return; }
    var w = findInArray(allWaste, id); if (!w) return;
    showConfirm('🗑️', 'Delete Waste?', w.quantity + ' roti (' + wasteReasonText(w.reason) + ') — Delete?', async function() {
        try { await fsDelete('waste', id); showToast('✅ Waste deleted!'); } catch(err) { showToast('❌ Error deleting', 'error'); }
    });
}


// ============ CREDIT ============
function loadCredit() {
    var cm = {}; allCustomers.forEach(function(c) { cm[c.id] = { id: c.id, name: c.name, g: 0, r: 0 }; });
    var walkin = { id: '__walkin__', name: '🚶 Walk-in Customers', g: 0, r: 0 };
    allSales.forEach(function(s) { if (s.paymentType === 'credit') { if (s.customerId) { if (!cm[s.customerId]) cm[s.customerId] = { id: s.customerId, name: s.customerName || 'Unknown', g: 0, r: 0 }; cm[s.customerId].g += s.total; } else walkin.g += s.total; } });
    allCreditPayments.forEach(function(p) { if (p.customerId && cm[p.customerId]) cm[p.customerId].r += p.amount; });
    if (walkin.g > 0) cm['__walkin__'] = walkin;
    var list = Object.values(cm).filter(function(c) { return c.g > 0; }); list.sort(function(a, b) { return (b.g-b.r)-(a.g-a.r); });
    var tp = 0; list.forEach(function(c) { tp += Math.max(0, c.g - c.r); });
    var el = document.getElementById('cTotalPending'); if (el) el.textContent = '₹' + tp;
    var ct = document.getElementById('creditList'); if (!ct) return;
    if (!list.length) { ct.innerHTML = '<div class="empty"><div class="empty-ic">🎉</div><h3>No Pending Credit!</h3><p>All customers have paid up. Great job!</p></div>'; return; }
    var h = '';
    list.forEach(function(c, i) {
        var pending = Math.max(0, c.g - c.r);
        h += '<div class="u-card" style="animation-delay:' + (i*0.04) + 's" onclick="openCreditPay(\'' + c.id + '\')" role="button" tabindex="0">';
        h += '<div class="u-info"><div class="u-name">' + esc(c.name) + '</div><div class="u-sub">Total: ₹' + c.g + ' • Paid: ₹' + c.r + '</div></div>';
        h += '<div class="u-amt' + (pending === 0 ? ' u-zero' : '') + '">₹' + pending + '</div></div>';
    });
    ct.innerHTML = h;
}
function openCreditPay(cid) {
    var cust = findInArray(allCustomers, cid), custPays = allCreditPayments.filter(function(p) { return p.customerId === cid; });
    var g = 0, nameF = '';
    allSales.forEach(function(s) { if (s.paymentType === 'credit' && s.customerId === cid) { g += s.total; if (s.customerName) nameF = s.customerName; } });
    var r = 0; custPays.forEach(function(p) { r += p.amount; }); var pending = Math.max(0, g - r);
    var name = cust ? cust.name : nameF;
    if (!name) { custPays.forEach(function(p) { if (p.customerName) name = p.customerName; }); }
    if (!name) name = 'Unknown Customer'; if (cid === '__walkin__') name = '🚶 Walk-in Customers';
    document.getElementById('crpTitle').textContent = name; document.getElementById('crpCustId').value = cid;
    document.getElementById('crpCustName').value = name; document.getElementById('crpAmount').value = ''; document.getElementById('crpPay').value = 'cash';
    var tg = document.querySelectorAll('#crpForm .tgl'); tg.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); }); if (tg[0]) { tg[0].classList.add('active'); tg[0].setAttribute('aria-pressed','true'); }
    var de = document.getElementById('crpDetail');
    if (de) de.innerHTML = '<div class="ud-row"><span class="ud-label">Total Credit</span><span class="ud-val">₹' + g + '</span></div><div class="ud-row"><span class="ud-label">Paid</span><span class="ud-val green">₹' + r + '</span></div><div class="ud-row"><span class="ud-label">Pending</span><span class="ud-val amber">₹' + pending + '</span></div>';
    var hDiv = document.getElementById('crpHistory');
    if (hDiv) {
        if (!custPays.length) { hDiv.innerHTML = '<div class="no-data">No payments recorded yet</div>'; }
        else { var hh = ''; custPays.slice().reverse().forEach(function(p) { hh += '<div class="aw-item"><span class="aw-item-n">' + fmtDate(p.date) + '</span><span class="aw-item-v inc">+₹' + p.amount + ' ' + (p.paymentType === 'upi' ? '📱' : '💵') + '</span></div>'; }); hDiv.innerHTML = '<div class="aw-card" style="margin:0">' + hh + '</div>'; }
    }
    openOverlay('creditPayOverlay');
}
async function saveCreditPayment(e) {
    e.preventDefault(); var amt = parseFloat(document.getElementById('crpAmount').value);
    if (!amt || amt <= 0) { showToast('❌ Enter valid amount!', 'error'); return; }
    var btn = document.getElementById('crpSubmitBtn'); btnLoading(btn, true);
    try {
        var custId = document.getElementById('crpCustId').value;
        await fsAdd('creditPayments', { customerId: custId, customerName: document.getElementById('crpCustName').value, amount: amt, paymentType: document.getElementById('crpPay').value, date: todayStr() });
        triggerHaptic('success'); showToast('✅ ₹' + amt + ' payment saved!');
        // ★ Confetti jab credit puri tarah clear ho
        var g = 0; allSales.forEach(function(s) { if (s.paymentType === 'credit' && s.customerId === custId) g += s.total; });
        var r = 0; allCreditPayments.forEach(function(p) { if (p.customerId === custId) r += p.amount; }); r += amt;
        if (g > 0 && r >= g && window.confetti) { setTimeout(function() { confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 }, colors: ['#e65100','#ff8f00','#00c853','#2196f3','#7c4dff'] }); }, 300); }
        closeOverlay('creditPayOverlay');
    } catch(err) { console.error('[Credit]', err); showToast('❌ Error saving payment', 'error'); }
    finally { btnLoading(btn, false); }
}


// ============ REPORTS ============
function switchReport(type, btn) {
    curReport = type;
    document.querySelectorAll('.rp-t').forEach(function(t) { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected','true'); loadReport();
}
function changeReportDate(off) {
    var cv = document.getElementById('reportDate').value; if (!cv) return; var d = new Date(cv + 'T00:00:00');
    if (curReport === 'daily') d.setDate(d.getDate() + off);
    else if (curReport === 'weekly') d.setDate(d.getDate() + (off * 7));
    else { d.setDate(1); d.setMonth(d.getMonth() + off); }
    var t = new Date(); t.setHours(23,59,59,999); if (d > t) return;
    setDateInput('reportDate', d.getFullYear()+'-'+S(d.getMonth()+1)+'-'+S(d.getDate())); loadReport();
}
function loadReport() { clearTimeout(reportTimer); reportTimer = setTimeout(function() { _loadReportInternal(); }, 200); }
function _loadReportInternal() {
    var date = document.getElementById('reportDate').value; if (!date) return;
    var sd, ed, title, btnText, d = new Date(date + 'T00:00:00');
    var mn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (curReport === 'daily') { sd = ed = date; title = 'Daily Report • ' + fmtDateLong(date); btnText = fmtDateBtn(date); }
    else if (curReport === 'weekly') { var dy = d.getDay(), mon = new Date(d); mon.setDate(d.getDate()-(dy===0?6:dy-1)); var sun = new Date(mon); sun.setDate(mon.getDate()+6); sd = mon.getFullYear()+'-'+S(mon.getMonth()+1)+'-'+S(mon.getDate()); ed = sun.getFullYear()+'-'+S(sun.getMonth()+1)+'-'+S(sun.getDate()); title = 'Weekly: ' + fmtDate(sd) + ' — ' + fmtDate(ed); btnText = '📅 ' + fmtDate(sd) + ' — ' + fmtDate(ed); }
    else { sd = d.getFullYear()+'-'+S(d.getMonth()+1)+'-01'; var ld = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); ed = d.getFullYear()+'-'+S(d.getMonth()+1)+'-'+S(ld); title = mn[d.getMonth()]+' '+d.getFullYear(); btnText = '📅 '+mn[d.getMonth()]+' '+d.getFullYear(); }
    var dateBtn = document.getElementById('reportDateBtn'); if (dateBtn) dateBtn.textContent = btnText;
    var fS = dataInRange(allSales, sd, ed), fE = dataInRange(allExpenses, sd, ed), fP = dataInRange(allCreditPayments, sd, ed), fW = dataInRange(allWaste, sd, ed);
    var tR = 0, tI = 0, tE = 0, cI = 0, uI = 0, hI = 0, wQ = 0, cS = {};
    fS.forEach(function(s) { tR += s.quantity; tI += s.total; if (s.paymentType === 'cash') cI += s.total; else if (s.paymentType === 'upi') uI += s.total; else hI += s.total; var nm = s.customerName || 'Walk-in'; if (!cS[nm]) cS[nm] = { r:0, a:0 }; cS[nm].r += s.quantity; cS[nm].a += s.total; });
    var cE = {}; fE.forEach(function(x) { tE += x.amount; var cn = catNm(x.category); if (!cE[cn]) cE[cn] = 0; cE[cn] += x.amount; });
    fW.forEach(function(w) { wQ += (w.quantity || 0); }); var profit = tI - tE, uRec = 0; fP.forEach(function(p) { uRec += p.amount; });
    rptData = { title:title, sd:sd, ed:ed, tR:tR, tI:tI, tE:tE, profit:profit, cI:cI, uI:uI, hI:hI, uRec:uRec, cS:cS, cE:cE, wQ:wQ };
    var h = '';
    h += '<div class="rp-card"><div class="rp-title">' + esc(title) + '</div></div>';
    h += '<div class="rp-card"><div class="rp-hero"><div class="rp-hero-v ' + (profit >= 0 ? 'green' : 'red') + '">' + (profit >= 0 ? '₹' : '-₹') + Math.abs(profit) + '</div><div class="rp-hero-l">Net Profit</div></div></div>';
    h += '<div class="rp-card"><div class="rp-title">📋 Summary</div>';
    [['Total Roti Sold',tR,''],['Total Income','₹'+tI,'green'],['Cash Income','₹'+cI,''],['UPI Income','₹'+uI,''],['Credit Given','₹'+hI,'amber'],['Credit Recovered','₹'+uRec,'green'],['Total Expense','₹'+tE,'red'],['Waste',wQ+' roti','amber'],['Net Profit',(profit>=0?'₹':'-₹')+Math.abs(profit),profit>=0?'green':'red']].forEach(function(r) { h += '<div class="rp-row"><span class="rp-lbl">'+r[0]+'</span><span class="rp-val '+r[2]+'">'+r[1]+'</span></div>'; });
    h += '</div>';
    var ca = Object.keys(cS); if (ca.length) { h += '<div class="rp-card"><div class="rp-title">👥 Customer Wise Sales</div>'; ca.sort(function(a,b){return cS[b].a-cS[a].a;}); ca.forEach(function(n){h+='<div class="rp-row"><span class="rp-lbl">'+esc(n)+' ('+cS[n].r+')</span><span class="rp-val">₹'+cS[n].a+'</span></div>';}); h+='</div>'; }
    var ea = Object.keys(cE); if (ea.length) { h += '<div class="rp-card"><div class="rp-title">🛒 Expense Breakdown</div>'; ea.sort(function(a,b){return cE[b]-cE[a];}); ea.forEach(function(cn){var pct=tE>0?Math.round(cE[cn]/tE*100):0;h+='<div class="rp-row"><span class="rp-lbl">'+esc(cn)+' ('+pct+'%)</span><span class="rp-val red">₹'+cE[cn]+'</span></div>';}); h+='</div>'; }
    var rc = document.getElementById('reportContent'); if (rc) rc.innerHTML = h;
    setTimeout(function() { renderCharts(sd, ed); }, 100);
}

// ★ PULSE CHART — Income vs Expense vs Profit unified
function renderCharts(sd, ed) {
    if (typeof Chart === 'undefined') return;
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var gc = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', tc = isDark ? '#a0a0b8' : '#666';
    renderPulseChart(sd, ed, gc, tc, isDark); renderExpenseChart(sd, ed, tc, isDark);
}
function renderPulseChart(sd, ed, gridColor, textColor, isDark) {
    var ctx = document.getElementById('salesChart'); if (!ctx) return;
    var sbd = {}, ebd = {}, d = new Date(sd + 'T00:00:00'), end = new Date(ed + 'T00:00:00');
    while (d <= end) { var ds = d.getFullYear()+'-'+S(d.getMonth()+1)+'-'+S(d.getDate()); sbd[ds] = 0; ebd[ds] = 0; d.setDate(d.getDate()+1); }
    dataInRange(allSales, sd, ed).forEach(function(s) { if (sbd[s.date] !== undefined) sbd[s.date] += s.total; });
    dataInRange(allExpenses, sd, ed).forEach(function(x) { if (ebd[x.date] !== undefined) ebd[x.date] += x.amount; });
    var labels = Object.keys(sbd).map(function(dt) { var p = dt.split('-'); return p[2]+'/'+p[1]; });
    var inc = Object.values(sbd), exp = Object.values(ebd), profit = inc.map(function(v, i) { return v - exp[i]; });
    try {
        if (pulseChart) { pulseChart.destroy(); pulseChart = null; }
        var parent = ctx.parentElement; if (!parent || parent.offsetHeight === 0) return;
        pulseChart = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [
            { label: 'Income', data: inc, backgroundColor: 'rgba(0,200,83,0.75)', hoverBackgroundColor: 'rgba(0,200,83,0.95)', borderRadius: 5, borderSkipped: false, maxBarThickness: 32, order: 2 },
            { label: 'Expense', data: exp, backgroundColor: 'rgba(244,67,54,0.75)', hoverBackgroundColor: 'rgba(244,67,54,0.95)', borderRadius: 5, borderSkipped: false, maxBarThickness: 32, order: 3 },
            { label: 'Profit', data: profit, type: 'line', borderColor: '#2196f3', backgroundColor: 'rgba(33,150,243,0.1)', pointBackgroundColor: '#2196f3', pointRadius: labels.length <= 7 ? 4 : 2, borderWidth: 2.5, tension: 0.4, fill: false, order: 1 }
        ]}, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 600, easing: 'easeOutQuart' },
            plugins: { legend: { display: false }, tooltip: { backgroundColor: isDark ? '#22222E' : '#fff', titleColor: isDark ? '#e8e8f0' : '#333', bodyColor: isDark ? '#a0a0b8' : '#666', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#ddd', borderWidth: 1, cornerRadius: 10, padding: 12, callbacks: { label: function(c2) { return c2.dataset.label + ': ₹' + c2.parsed.y; } } } },
            scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } }, x: { grid: { display: false }, ticks: { color: textColor, font: { size: 9 }, maxRotation: 45 } } } } });
        var le = document.getElementById('pulseLegend');
        if (le) le.innerHTML = '<div class="pulse-legend-item"><div class="pulse-dot" style="background:#00c853"></div>Income</div><div class="pulse-legend-item"><div class="pulse-dot" style="background:#f44336"></div>Expense</div><div class="pulse-legend-item"><div class="pulse-dot" style="background:#2196f3"></div>Profit</div>';
    } catch(err) { console.error('[Chart] Pulse:', err); }
}
function renderExpenseChart(sd, ed, textColor, isDark) {
    var ctx = document.getElementById('expenseChart'), cardEl = document.getElementById('expenseChartCard'); if (!ctx || !cardEl) return;
    var ebc = {}; dataInRange(allExpenses, sd, ed).forEach(function(e) { var cat = catNm(e.category); ebc[cat] = (ebc[cat] || 0) + e.amount; });
    var eLabels = Object.keys(ebc), eValues = Object.values(ebc);
    if (expenseChart) { expenseChart.destroy(); expenseChart = null; }
    if (!eValues.length || !eValues.some(function(v) { return v > 0; })) { cardEl.innerHTML = '<h4 class="chart-title">🥧 Expense Breakdown</h4><div class="chart-empty">No expenses in this period</div>'; return; }
    if (!cardEl.querySelector('canvas')) { cardEl.innerHTML = '<h4 class="chart-title">🥧 Expense Breakdown</h4><div class="chart-wrap chart-sm"><canvas id="expenseChart"></canvas></div>'; ctx = document.getElementById('expenseChart'); }
    try {
        var parent = ctx.parentElement; if (!parent || parent.offsetHeight === 0) return;
        var colors = ['#e65100','#ff8f00','#f44336','#7c4dff','#2196f3','#00c853','#ff5722'];
        expenseChart = new Chart(ctx, { type: 'doughnut', data: { labels: eLabels, datasets: [{ data: eValues, backgroundColor: colors.slice(0, eLabels.length), hoverOffset: 6, borderWidth: 2, borderColor: isDark ? '#22222E' : '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 600, easing: 'easeOutQuart' }, cutout: '60%',
                plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { size: 11, weight: 600 }, padding: 12, usePointStyle: true, pointStyleWidth: 10 } },
                tooltip: { backgroundColor: isDark ? '#22222E' : '#fff', titleColor: isDark ? '#e8e8f0' : '#333', bodyColor: isDark ? '#a0a0b8' : '#666', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#ddd', borderWidth: 1, cornerRadius: 10, padding: 12,
                    callbacks: { label: function(context) { var total = context.dataset.data.reduce(function(a,b){return a+b;},0), pct = total > 0 ? Math.round(context.parsed/total*100) : 0; return context.label + ': ₹' + context.parsed + ' (' + pct + '%)'; } } } } } });
    } catch(err) { console.error('[Chart] Expense:', err); }
}


// ============ PDF REPORT ============
function generatePDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) { showToast('❌ PDF library not loaded. Check internet.', 'error'); return; }
    try {
        var jsPDF = window.jspdf.jsPDF, doc = new jsPDF('p','mm','a4'), rd = rptData;
        if (!rd.title) { showToast('❌ Load a report first!', 'error'); return; }
        var pdfBtn = document.querySelector('.pdf-btn'); if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.textContent = '⏳ Generating PDF...'; }
        var W = 210, mL = 14, mR = 14, cW = W - mL - mR;
        doc.setFillColor(26,26,46); doc.rect(0,0,W,40,'F'); doc.setFillColor(230,81,0); doc.rect(0,38,W,3,'F');
        doc.setTextColor(255,255,255); doc.setFontSize(20); doc.setFont('helvetica','bold'); doc.text('MERI DUKAAN',mL,17);
        doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.text('v5.0 — Business Report',mL,23);
        doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.text(rd.title,mL,33);
        doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.text('Generated: '+new Date().toLocaleString(),W-mR,33,{align:'right'});
        var y = 50;
        var pc = rd.profit >= 0 ? [0,150,50] : [200,40,40]; doc.setFillColor(pc[0],pc[1],pc[2]); doc.roundedRect(mL,y,cW,18,3,3,'F'); doc.setTextColor(255,255,255); doc.setFontSize(9); doc.text('NET PROFIT',mL+8,y+8); doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text('Rs. '+Math.abs(rd.profit)+(rd.profit<0?' (Loss)':''),W-mR-8,y+13,{align:'right'}); y += 26;
        doc.setTextColor(26,26,46); doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.text('SUMMARY',mL,y); y += 3;
        doc.autoTable({ startY:y, margin:{left:mL,right:mR}, head:[['Item','Value']], body:[['Total Roti Sold',rd.tR.toString()],['Total Income','Rs. '+rd.tI],['Cash Income','Rs. '+rd.cI],['UPI Income','Rs. '+rd.uI],['Credit Given','Rs. '+rd.hI],['Credit Recovered','Rs. '+rd.uRec],['Total Expense','Rs. '+rd.tE],['Waste',rd.wQ+' roti'],['Net Profit','Rs. '+(rd.profit>=0?'':'-')+Math.abs(rd.profit)]], theme:'grid', headStyles:{fillColor:[230,81,0],textColor:255,fontStyle:'bold',fontSize:9}, bodyStyles:{fontSize:9,textColor:[40,40,40]}, alternateRowStyles:{fillColor:[255,248,240]}, columnStyles:{0:{cellWidth:cW*0.6},1:{cellWidth:cW*0.4,halign:'right',fontStyle:'bold'}} });
        y = doc.lastAutoTable.finalY + 10;
        var ca = Object.keys(rd.cS); if (ca.length) { if(y>240){doc.addPage();y=20;} doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(230,81,0); doc.text('CUSTOMER WISE SALES',mL,y); y+=3; ca.sort(function(a,b){return rd.cS[b].a-rd.cS[a].a;}); doc.autoTable({ startY:y, margin:{left:mL,right:mR}, head:[['Customer','Roti','Amount']], body:ca.map(function(n){return[n,rd.cS[n].r.toString(),'Rs. '+rd.cS[n].a];}), theme:'striped', headStyles:{fillColor:[26,26,46],textColor:255,fontStyle:'bold',fontSize:9}, bodyStyles:{fontSize:9}, columnStyles:{0:{cellWidth:cW*0.45},1:{cellWidth:cW*0.2,halign:'center'},2:{cellWidth:cW*0.35,halign:'right',fontStyle:'bold'}} }); y=doc.lastAutoTable.finalY+10; }
        var ea = Object.keys(rd.cE); if (ea.length) { if(y>240){doc.addPage();y=20;} doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(200,40,40); doc.text('EXPENSE BREAKDOWN',mL,y); y+=3; ea.sort(function(a,b){return rd.cE[b]-rd.cE[a];}); doc.autoTable({ startY:y, margin:{left:mL,right:mR}, head:[['Category','%','Amount']], body:ea.map(function(cn){return[cn,(rd.tE>0?Math.round(rd.cE[cn]/rd.tE*100):0)+'%','Rs. '+rd.cE[cn]];}), theme:'striped', headStyles:{fillColor:[200,40,40],textColor:255,fontStyle:'bold',fontSize:9}, bodyStyles:{fontSize:9}, columnStyles:{0:{cellWidth:cW*0.45},1:{cellWidth:cW*0.2,halign:'center'},2:{cellWidth:cW*0.35,halign:'right',fontStyle:'bold'}} }); }
        var tp = doc.internal.getNumberOfPages(); for (var i = 1; i <= tp; i++) { doc.setPage(i); doc.setFillColor(245,245,245); doc.rect(0,287,W,10,'F'); doc.setFontSize(7); doc.setTextColor(150,150,150); doc.setFont('helvetica','normal'); doc.text('Meri Dukaan v5.0 — Business Report',mL,292); doc.text('Page '+i+'/'+tp,W-mR,292,{align:'right'}); }
        doc.save('MeriDukaan_'+curReport+'_'+todayStr()+'.pdf'); showToast('✅ PDF downloaded!');
    } catch(err) { console.error('[PDF]', err); showToast('❌ PDF generation failed!', 'error'); }
    finally { var pb2 = document.querySelector('.pdf-btn'); if (pb2) { pb2.disabled = false; pb2.textContent = '📄 Download PDF Report'; } }
}


// ============ STOCK TRACKER ============
function loadStockTracker() {
    var ct = document.getElementById('stockContent'); if (!ct) return;
    var cats = ['atta', 'oil', 'gas'], h = '';
    cats.forEach(function(cat) {
        var exps = allExpenses.filter(function(x) { return x.category === cat; }).sort(function(a,b) { return (a.date||'').localeCompare(b.date||''); });
        var icon = catIc(cat), name = catNm(cat);
        if (!exps.length) { h += '<div class="stock-card"><div class="stock-hdr"><div class="stock-title">'+icon+' '+name+'</div><span class="stock-badge ok">No Data</span></div><div class="no-data" style="padding:12px 0">No '+name+' purchases recorded</div></div>'; return; }
        var last = exps[exps.length-1], hasW = last.weight && last.weight > 0, lastRate = hasW ? (last.amount/last.weight) : null;
        var daysArr = []; for (var i = 1; i < exps.length; i++) { var d1 = new Date(exps[i-1].date+'T00:00:00'), d2 = new Date(exps[i].date+'T00:00:00'), diff = Math.round((d2-d1)/(1000*60*60*24)); if (diff>0) daysArr.push(diff); }
        var daysSince = last.date ? Math.round((new Date()-new Date(last.date+'T00:00:00'))/(1000*60*60*24)) : 0;
        var avgDays = daysArr.length > 0 ? Math.round(daysArr.reduce(function(a,b){return a+b;},0)/daysArr.length) : null;
        var rateChange = null, prevRate = null;
        if (exps.length >= 2 && hasW) { var p2 = exps[exps.length-2]; if (p2.weight && p2.weight > 0) { prevRate = p2.amount/p2.weight; rateChange = ((lastRate-prevRate)/prevRate*100).toFixed(1); } }
        var bc = 'good', bt = 'Fresh';
        if (avgDays) { var ratio = daysSince/avgDays; if (ratio > 0.85) { bc = 'low'; bt = 'Restock Soon'; } else if (ratio > 0.6) { bc = 'ok'; bt = 'Running'; } }
        h += '<div class="stock-card"><div class="stock-hdr"><div class="stock-title">'+icon+' '+name+'</div><span class="stock-badge '+bc+'">'+bt+'</span></div>';
        h += '<div class="stock-item"><div class="stock-info"><div class="stock-name">Latest Purchase</div><div class="stock-detail">'+fmtDateLong(last.date)+' • '+(hasW?last.weight+'kg • ':' ')+'₹'+last.amount+'</div><div class="stock-days-badge">'+daysSince+' days ago</div></div>';
        if (lastRate) {
            h += '<div class="stock-rate-box"><div class="stock-cur-rate">₹'+lastRate.toFixed(1)+'/kg</div>';
            if (prevRate) h += '<div class="stock-prev-rate">Prev: ₹'+prevRate.toFixed(1)+'/kg</div>';
            if (rateChange !== null) { var cc2 = parseFloat(rateChange)>0?'up':parseFloat(rateChange)<0?'down':'same'; var ca2 = parseFloat(rateChange)>0?'⬆️ +':parseFloat(rateChange)<0?'⬇️ ':'➡️ '; h += '<div class="stock-change '+cc2+'">'+ca2+Math.abs(rateChange)+'%</div>'; }
            h += '</div>';
        }
        h += '</div>';
        if (avgDays) h += '<div class="stock-row"><span class="stock-lbl">Avg Days Per Stock</span><span class="stock-val">~'+avgDays+' days</span></div>';
        if (exps.length >= 2) { var nextDate = new Date(last.date+'T00:00:00'); nextDate.setDate(nextDate.getDate()+(avgDays||30)); var daysLeft = Math.max(0,Math.round((nextDate-new Date())/(1000*60*60*24))); h += '<div class="stock-row"><span class="stock-lbl">Est. Next Purchase</span><span class="stock-val">'+(daysLeft>0?'In ~'+daysLeft+' days':'Due now!')+'</span></div>'; }
        h += '<div class="stock-row"><span class="stock-lbl">Total Purchases</span><span class="stock-val">'+exps.length+' times</span></div></div>';
    });
    ct.innerHTML = h;
}


// ============ SETTINGS ============
function loadSettings() {
    if (currentUser) {
        var avatar = document.getElementById('suAvatar');
        if (avatar) { if (currentUser.photoURL) { avatar.src = currentUser.photoURL; avatar.style.display = ''; } else avatar.style.display = 'none'; }
        var el;
        el = document.getElementById('suName'); if (el) el.textContent = currentUser.displayName || 'User';
        el = document.getElementById('suEmail'); if (el) el.textContent = currentUser.email;
        el = document.getElementById('suRole'); if (el) el.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
    }
    updateThemeUI(); updateSyncStatus();
    var ve = document.getElementById('appVersionText'); if (ve) ve.textContent = 'v5.0 • PWA • ' + (navigator.onLine ? 'Online' : 'Offline');
}
function updateSyncStatus() {
    var dot = document.getElementById('syncDot'), status = document.getElementById('syncStatus'); if (!dot || !status) return;
    if (navigator.onLine) { dot.className = 'sync-dot online'; status.textContent = 'Connected • Real-time sync active'; }
    else { dot.className = 'sync-dot offline'; status.textContent = 'Offline • Changes will sync when online'; }
}
window.addEventListener('online', function() { updateSyncStatus(); if (isScreenActive('settingScreen')) loadSettings(); updateLoginOfflineStatus(); });
window.addEventListener('offline', function() { updateSyncStatus(); if (isScreenActive('settingScreen')) loadSettings(); });


// ============ CHANGE PIN ============
function showChangePinUI() { openOverlay('changePinOverlay'); }
async function saveNewPin(e) {
    e.preventDefault();
    var oldPin = document.getElementById('chpOld').value, newPin = document.getElementById('chpNew').value, confirm = document.getElementById('chpConfirm').value;
    if (!oldPin || oldPin.length !== 4) { showToast('❌ Enter current PIN', 'error'); return; }
    var stored = localStorage.getItem('mdPin'); var sv = ''; try { sv = atob(stored || ''); } catch(ex) {}
    if (oldPin !== sv) { showToast('❌ Current PIN is wrong!', 'error'); return; }
    if (!newPin || newPin.length !== 4) { showToast('❌ New PIN must be 4 digits', 'error'); return; }
    if (newPin !== confirm) { showToast('❌ PINs do not match!', 'error'); return; }
    var btn = document.getElementById('chpSubmitBtn'); btnLoading(btn, true);
    try { var encoded = btoa(newPin); await businessRef.update({ pin: encoded }); localStorage.setItem('mdPin', encoded); triggerHaptic('success'); showToast('✅ PIN updated successfully!'); closeOverlay('changePinOverlay'); }
    catch(err) { showToast('❌ Error updating PIN', 'error'); }
    finally { btnLoading(btn, false); }
}


// ============ TEAM MANAGER ============
function openTeamManager() { var form = document.getElementById('addMemberForm'); if (form) form.style.display = 'none'; renderTeamList(); openOverlay('teamOverlay'); }
function showAddMember() { var form = document.getElementById('addMemberForm'); if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none'; }
function renderTeamList() {
    if (!businessRef) return;
    businessRef.get().then(function(doc) {
        if (!doc.exists) return; var data = doc.data(), members = data.members || [];
        var ct = document.getElementById('teamMemberList'); if (!ct) return;
        var h = '<div class="team-card"><div class="tc-info"><div class="tc-email">' + esc(data.ownerEmail || 'Owner') + '</div><span class="tc-role owner">👑 Owner</span></div></div>';
        members.forEach(function(m) { h += '<div class="team-card"><div class="tc-info"><div class="tc-email">' + esc(m.email) + '</div><span class="tc-role '+m.role+'">' + (m.role === 'admin' ? '👑 Admin' : '👤 Staff') + '</span></div>'; if (canModify()) h += '<button class="tc-del" onclick="removeTeamMember(\'' + esc(m.email) + '\')" aria-label="Remove">🗑️</button>'; h += '</div>'; });
        if (!members.length) h += '<div class="no-data">No team members added yet</div>';
        ct.innerHTML = h;
    }).catch(function(err) { console.error('[Team] Load error:', err); });
}
async function addTeamMember(e) {
    e.preventDefault(); if (!canModify()) { showToast('❌ Only owners can manage team', 'error'); return; }
    var email = document.getElementById('tmEmail').value.trim().toLowerCase(), role = document.getElementById('tmRole').value;
    if (!email || !email.includes('@')) { showToast('❌ Enter valid email', 'error'); return; }
    var btn = document.getElementById('tmSubmitBtn'); btnLoading(btn, true);
    try {
        var doc = await businessRef.get(); var data = doc.data(), members = data.members || [];
        if (members.find(function(m) { return m.email.toLowerCase() === email; })) { showToast('❌ Member already added', 'error'); return; }
        if (data.ownerEmail && email === data.ownerEmail.toLowerCase()) { showToast('❌ That is the owner email', 'error'); return; }
        members.push({ email: email, role: role, addedAt: new Date().toISOString() });
        var emails = members.map(function(m) { return m.email.toLowerCase(); });
        await businessRef.update({ members: members, memberEmails: emails });
        triggerHaptic('success'); showToast('✅ ' + email + ' added as ' + role + '!');
        document.getElementById('addMemberForm').style.display = 'none';
        var ef = document.getElementById('tmEmail'); if (ef) ef.value = '';
        renderTeamList();
    } catch(err) { console.error('[Team]', err); showToast('❌ Error adding member', 'error'); }
    finally { btnLoading(btn, false); }
}
async function removeTeamMember(email) {
    if (!canModify()) { showToast('❌ Only owners can manage team', 'error'); return; }
    showConfirm('🗑️', 'Remove Member?', email + ' will lose access.', async function() {
        try {
            var doc = await businessRef.get(); var data = doc.data();
            var members = (data.members || []).filter(function(m) { return m.email.toLowerCase() !== email.toLowerCase(); });
            var emails = members.map(function(m) { return m.email.toLowerCase(); });
            await businessRef.update({ members: members, memberEmails: emails });
            showToast('✅ Member removed!'); renderTeamList();
        } catch(err) { showToast('❌ Error removing member', 'error'); }
    });
}


// ============ EXPORT / IMPORT ============
function exportData() {
    showConfirm('💾', 'Download Backup?', 'All your data will be exported as a JSON file.', function() {
        var data = { version: '5.0', exportedAt: new Date().toISOString(), customers: allCustomers.map(function(x){return Object.assign({},x);}), sales: allSales.map(function(x){return Object.assign({},x);}), expenses: allExpenses.map(function(x){return Object.assign({},x);}), waste: allWaste.map(function(x){return Object.assign({},x);}), creditPayments: allCreditPayments.map(function(x){return Object.assign({},x);}) };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'MeriDukaan_backup_' + todayStr() + '.json'; a.click();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        showToast('✅ Backup downloaded!');
    });
}
function importData(e) {
    if (!canModify()) { showToast('❌ Only owner can import data', 'error'); return; }
    var file = e.target.files[0]; if (!file) return;
    showConfirm('📥', 'Import Data?', 'This will REPLACE all existing data. Make a backup first!', function() {
        var reader = new FileReader();
        reader.onload = async function(ev) {
            try {
                var data = JSON.parse(ev.target.result);
                if (!data.customers && !data.sales) { showToast('❌ Invalid backup file!', 'error'); return; }
                showToast('⏳ Importing data...', 'success');
                await deleteCollection('customers'); await deleteCollection('sales'); await deleteCollection('expenses'); await deleteCollection('waste'); await deleteCollection('creditPayments');
                var custIdMap = {}, custs = data.customers || [];
                for (var i = 0; i < custs.length; i++) { var c = Object.assign({}, custs[i]), oldId = c.id; delete c.id; if (c.createdAt && typeof c.createdAt === 'string') delete c.createdAt; var ref = await businessRef.collection('customers').add(c); if (oldId) custIdMap[oldId] = ref.id; }
                var sales = data.sales || []; for (var j = 0; j < sales.length; j++) { var s = Object.assign({}, sales[j]); delete s.id; if (s.customerId) { if (custIdMap[s.customerId]) s.customerId = custIdMap[s.customerId]; else s.customerId = ''; } if (s.paymentType === 'udhari') s.paymentType = 'credit'; if (!s.saleType) s.saleType = 'regular'; if (s.createdAt && typeof s.createdAt === 'string') delete s.createdAt; await businessRef.collection('sales').add(s); }
                var exps = data.expenses || []; for (var k = 0; k < exps.length; k++) { var x = Object.assign({}, exps[k]); delete x.id; if (x.createdAt && typeof x.createdAt === 'string') delete x.createdAt; await businessRef.collection('expenses').add(x); }
                var wastes = data.waste || []; for (var w = 0; w < wastes.length; w++) { var wt = Object.assign({}, wastes[w]); delete wt.id; if (wt.createdAt && typeof wt.createdAt === 'string') delete wt.createdAt; await businessRef.collection('waste').add(wt); }
                var pays = data.creditPayments || data.udhariPayments || []; for (var p = 0; p < pays.length; p++) { var py = Object.assign({}, pays[p]); delete py.id; if (py.customerId) { if (custIdMap[py.customerId]) py.customerId = custIdMap[py.customerId]; else py.customerId = ''; } if (py.createdAt && typeof py.createdAt === 'string') delete py.createdAt; await businessRef.collection('creditPayments').add(py); }
                showToast('✅ Imported! (' + custs.length + ' customers, ' + sales.length + ' sales)');
            } catch(err) { console.error('[Import]', err); showToast('❌ Import failed: ' + (err.message || 'Unknown'), 'error'); }
        };
        reader.readAsText(file);
    });
    e.target.value = '';
}
async function deleteCollection(colName) {
    try {
        var snap = await businessRef.collection(colName).get(), docs = snap.docs; if (!docs.length) return;
        for (var i = 0; i < docs.length; i += 400) { var batch = fdb.batch(); docs.slice(i, i+400).forEach(function(doc) { batch.delete(doc.ref); }); await batch.commit(); }
    } catch(err) { console.error('[Delete] Error in ' + colName + ':', err); throw err; }
}
function resetAllData() {
    if (userRole === 'staff') { showToast('❌ Only owner can delete all data', 'error'); return; }
    showConfirm('🗑️', 'DELETE ALL DATA?', 'All data will be permanently removed. CANNOT be undone! Download backup first.', async function() {
        try {
            showToast('⏳ Deleting all data...', 'success');
            await deleteCollection('customers'); await deleteCollection('sales'); await deleteCollection('expenses'); await deleteCollection('waste'); await deleteCollection('creditPayments');
            showToast('✅ All data deleted!'); if (isScreenActive('dashboardScreen')) refreshDash(); else goTo('dashboardScreen');
        } catch(err) { console.error('[Reset]', err); showToast('❌ Error deleting data', 'error'); }
    });
}


// ============ APP START ============
function startApp() {
    console.log('🫓 Meri Dukaan v5.0 Starting...');
    applyTheme();

    var splashDone = false, authReady = false, pendingUser = null;
    function proceed() {
        if (!splashDone || !authReady) return;
        if (pendingUser) {
            handleAuthenticated(pendingUser);
        } else {
            goTo('loginScreen');
            updateLoginOfflineStatus();
            var btn = document.getElementById('googleBtn');
            if (btn) { btn.disabled = false; var span = btn.querySelector('span'); if (span) span.textContent = 'Sign in with Google'; }
        }
    }

    // Minimum 1.5s splash
    setTimeout(function() { splashDone = true; proceed(); }, 1500);

    // ★ Handle redirect result (fallback case)
    handleRedirectResult();

    // Main auth state listener
    auth.onAuthStateChanged(function(user) {
        pendingUser = user;
        authReady = true;
        proceed();
    });
}


// ============ LAUNCH ============
startApp();


// ============ CONSOLE BRANDING ============
console.log(
    '%c🫓 Meri Dukaan v5.0 %c Android Login Fixed • World-class PWA ',
    'background:#e65100;color:white;padding:8px 12px;border-radius:8px 0 0 8px;font-weight:bold;font-size:14px',
    'background:#1a1a2e;color:white;padding:8px 12px;border-radius:0 8px 8px 0;font-size:14px'
);
