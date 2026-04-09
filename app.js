/* ================================================
   MERI DUKAAN v4.0 — APP LOGIC (PART 1 of 3)
   Core: Firebase, Auth, PIN, Navigation, Pickers
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

// Offline persistence
fdb.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
    if (err.code === 'failed-precondition') {
        console.warn('[DB] Multiple tabs — offline limited to one tab');
    } else if (err.code === 'unimplemented') {
        console.warn('[DB] Browser does not support offline persistence');
    }
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

// ★ PIN brute-force protection
var pinAttempts = 0;
var pinLockUntil = 0;


// ============ UTILITIES ============
function esc(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function S(n) { return n < 10 ? '0' + n : '' + n; }

function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(d.getDate());
}

function fmtDate(s) {
    if (!s) return '';
    var p = s.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
}

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
    var yd = new Date(); yd.setDate(yd.getDate() - 1);
    var yds = yd.getFullYear() + '-' + S(yd.getMonth() + 1) + '-' + S(yd.getDate());
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

function catIc(c) {
    return { atta:'🌾', oil:'🛢️', gas:'🔥', poly:'🛍️', other:'📦' }[c] || '📦';
}
function catNm(c) {
    return { atta:'Atta', oil:'Oil', gas:'Gas Cylinder', poly:'Polythene', other:'Other' }[c] || c;
}
function payBdg(p) {
    if (p === 'cash') return { t:'💵 Cash', c:'slb-c' };
    if (p === 'upi') return { t:'📱 UPI', c:'slb-u' };
    return { t:'💳 Credit', c:'slb-h' };
}
function wasteReasonText(r) {
    return { burnt:'🔥 Burnt', extra:'📦 Extra Made', returned:'↩️ Returned', other:'❓ Other' }[r] || r;
}

function dateShift(ds, off) {
    var d = new Date(ds + 'T00:00:00');
    d.setDate(d.getDate() + off);
    var t = new Date(); t.setHours(23, 59, 59, 999);
    if (d > t) return null;
    return d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(d.getDate());
}

function getDateRange(period) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var sd, ed = todayStr();
    if (period === 'today') {
        sd = ed;
    } else if (period === 'week') {
        var dy = today.getDay();
        var mon = new Date(today);
        mon.setDate(today.getDate() - (dy === 0 ? 6 : dy - 1));
        sd = mon.getFullYear() + '-' + S(mon.getMonth() + 1) + '-' + S(mon.getDate());
    } else if (period === 'month') {
        sd = today.getFullYear() + '-' + S(today.getMonth() + 1) + '-01';
    } else if (period === 'year') {
        sd = today.getFullYear() + '-01-01';
    }
    return { start: sd, end: ed };
}

function findInArray(arr, id) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return arr[i];
    }
    return null;
}

function isScreenActive(id) {
    var el = document.getElementById(id);
    return el && el.classList.contains('active');
}

function cleanTimestamp(val) {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return val;
}

function cleanForExport(obj) {
    var result = {};
    Object.keys(obj).forEach(function(key) {
        result[key] = cleanTimestamp(obj[key]) || obj[key];
    });
    return result;
}

function salesForDate(date) {
    return allSales.filter(function(s) { return s.date === date; });
}
function expensesForDate(date) {
    return allExpenses.filter(function(e) { return e.date === date; });
}
function wasteForDate(date) {
    return allWaste.filter(function(w) { return w.date === date; });
}
function dataInRange(arr, sd, ed) {
    return arr.filter(function(x) { return x.date >= sd && x.date <= ed; });
}


// ============ UI HELPERS ============
function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show ' + (type || 'success');
    clearTimeout(t._tm);
    t._tm = setTimeout(function() { t.className = 'toast'; }, 2800);
}

// ★ Button loading state — prevents double-tap, shows spinner
function btnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.classList.add('loading');
        btn._origText = btn.textContent;
    } else {
        btn.disabled = false;
        btn.classList.remove('loading');
        if (btn._origText) btn.textContent = btn._origText;
    }
}

// ★ Staff role check — hides edit/delete for staff users
function canModify() {
    return userRole !== 'staff';
}

// ★ Generate action buttons HTML only if user can modify
function actionBtns(editFn, delFn) {
    if (!canModify()) return '';
    return '<div class="sl-acts">' +
        '<button class="ic-btn ib-e" onclick="' + editFn + '" aria-label="Edit">✏️</button>' +
        '<button class="ic-btn ib-d" onclick="' + delFn + '" aria-label="Delete">🗑️</button>' +
        '</div>';
}


// ============ THEME SYSTEM ============
function applyTheme() {
    var theme = currentTheme;
    if (theme === 'auto') {
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    updateThemeUI();

    // ★ Redraw charts if report screen is open
    if (isScreenActive('reportScreen') && rptData.sd && rptData.ed) {
        setTimeout(function() {
            if (typeof renderCharts === 'function') renderCharts(rptData.sd, rptData.ed);
        }, 150);
    }
}

function cycleTheme() {
    if (currentTheme === 'auto') currentTheme = 'light';
    else if (currentTheme === 'light') currentTheme = 'dark';
    else currentTheme = 'auto';
    localStorage.setItem('mdTheme', currentTheme);
    applyTheme();
    showToast('🎨 Theme: ' + currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1));
}

function updateThemeUI() {
    var icon = currentTheme === 'dark' ? '☀️' : currentTheme === 'light' ? '🌙' : '📱';
    var label = currentTheme === 'auto' ? 'System Default' : currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
    var badge = currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);

    var el = document.getElementById('themeTogBtn'); if (el) el.textContent = icon;
    el = document.getElementById('setThemeIc'); if (el) el.textContent = icon;
    el = document.getElementById('setThemeLabel'); if (el) el.textContent = label;
    el = document.getElementById('setThemeBadge'); if (el) el.textContent = badge;
}

// System theme change listener
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (currentTheme === 'auto') applyTheme();
});

// Apply immediately
applyTheme();


// ============ FIREBASE AUTH ============
function googleSignIn() {
    var btn = document.getElementById('googleBtn');
    if (!btn) return;
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Signing in...';

    var provider = new firebase.auth.GoogleAuthProvider();
    var isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true;

    if (isPWA) {
        auth.signInWithRedirect(provider);
    } else {
        auth.signInWithPopup(provider).catch(function(error) {
            btn.disabled = false;
            btn.querySelector('span').textContent = 'Sign in with Google';
            if (error.code === 'auth/popup-blocked') {
                auth.signInWithRedirect(provider);
            } else if (error.code !== 'auth/popup-closed-by-user') {
                showToast('❌ Sign in failed: ' + error.message, 'error');
            }
        });
    }
}

function signOutApp() {
    showConfirm('🚪', 'Sign Out?', 'You will be logged out from this device.', function() {
        unsubscribers.forEach(function(u) { u(); });
        unsubscribers = [];
        auth.signOut().then(function() {
            currentUser = null; businessId = null; businessRef = null;
            allCustomers = []; allSales = []; allExpenses = [];
            allWaste = []; allCreditPayments = [];
            goTo('loginScreen');
            showToast('✅ Signed out');
        });
    });
}

function signOutAndLogin() {
    unsubscribers.forEach(function(u) { u(); });
    unsubscribers = [];
    auth.signOut().then(function() {
        currentUser = null; businessId = null; businessRef = null;
        goTo('loginScreen');
    });
}

async function handleAuthenticated(user) {
    currentUser = user;
    try {
        // Check if user owns a business
        var ownerSnap = await fdb.collection('businesses')
            .where('ownerUid', '==', user.uid).get();

        if (!ownerSnap.empty) {
            businessId = ownerSnap.docs[0].id;
            userRole = 'owner';
        } else {
            // Check if team member
            var memberSnap = await fdb.collection('businesses')
                .where('memberEmails', 'array-contains', user.email.toLowerCase()).get();

            if (!memberSnap.empty) {
                businessId = memberSnap.docs[0].id;
                var bData = memberSnap.docs[0].data();
                var member = (bData.members || []).find(function(m) {
                    return m.email.toLowerCase() === user.email.toLowerCase();
                });
                userRole = member ? member.role : 'staff';
            } else {
                // New user — create business
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

        businessRef = fdb.collection('businesses').doc(businessId);
        localStorage.setItem('mdBusinessId', businessId);
        setupListeners();

        // Check PIN
        var bizDoc = await businessRef.get();
        var bizData = bizDoc.data();

        if (!bizData.pin) {
            goTo('pinSetupScreen');
        } else {
            localStorage.setItem('mdPin', bizData.pin);
            goTo('pinLoginScreen');
            var pinUser = document.getElementById('pinUserInfo');
            if (pinUser) {
                var img = user.photoURL ? '<img src="' + esc(user.photoURL) + '" alt="">' : '';
                pinUser.innerHTML = img + '<span>' + esc(user.email) + '</span>';
            }
        }
    } catch (err) {
        console.error('[Auth] Setup error:', err);

        // ★ FIX: Better offline fallback
        var cachedBizId = localStorage.getItem('mdBusinessId');
        var cachedPin = localStorage.getItem('mdPin');

        if (cachedBizId && cachedPin) {
            businessId = cachedBizId;
            businessRef = fdb.collection('businesses').doc(businessId);
            setupListeners();
            goTo('pinLoginScreen');
            var pinUser2 = document.getElementById('pinUserInfo');
            if (pinUser2) {
                pinUser2.innerHTML = '<span>' + esc(user.email) + '</span>' +
                    '<span style="color:#ff8a80;font-size:10px;margin-left:4px">Offline</span>';
            }
            showToast('📴 Working offline', 'error');
        } else {
            showToast('❌ Internet required for first setup', 'error');
            var btn = document.getElementById('googleBtn');
            if (btn) {
                btn.disabled = false;
                btn.querySelector('span').textContent = 'Sign in with Google';
            }
            goTo('loginScreen');
        }
    }
}


// ============ REAL-TIME LISTENERS ============
function setupListeners() {
    unsubscribers.forEach(function(u) { u(); });
    unsubscribers = [];
    if (!businessRef) return;

    // Customers
    unsubscribers.push(
        businessRef.collection('customers').orderBy('name').onSnapshot(function(snap) {
            allCustomers = [];
            snap.forEach(function(doc) {
                allCustomers.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('customerScreen') && typeof loadCusts === 'function') loadCusts();
            if (isScreenActive('quickSaleScreen') && typeof loadQuickSale === 'function') loadQuickSale();
        }, function(err) { console.error('[Sync] Customers:', err); })
    );

    // Sales
    unsubscribers.push(
        businessRef.collection('sales').onSnapshot(function(snap) {
            allSales = [];
            snap.forEach(function(doc) {
                allSales.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('salesScreen') && typeof loadSales === 'function') loadSales();
            if (isScreenActive('dashboardScreen') && typeof refreshDash === 'function') refreshDash();
            if (isScreenActive('quickSaleScreen') && typeof loadQuickSale === 'function') loadQuickSale();
            if (isScreenActive('creditScreen') && typeof loadCredit === 'function') loadCredit();
        }, function(err) { console.error('[Sync] Sales:', err); })
    );

    // Expenses
    unsubscribers.push(
        businessRef.collection('expenses').onSnapshot(function(snap) {
            allExpenses = [];
            snap.forEach(function(doc) {
                allExpenses.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('expenseScreen') && typeof loadExps === 'function') loadExps();
            if (isScreenActive('dashboardScreen') && typeof refreshDash === 'function') refreshDash();
        }, function(err) { console.error('[Sync] Expenses:', err); })
    );

    // Waste
    unsubscribers.push(
        businessRef.collection('waste').onSnapshot(function(snap) {
            allWaste = [];
            snap.forEach(function(doc) {
                allWaste.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('wasteScreen') && typeof loadWasteList === 'function') loadWasteList();
            if (isScreenActive('dashboardScreen') && typeof refreshDash === 'function') refreshDash();
        }, function(err) { console.error('[Sync] Waste:', err); })
    );

    // Credit Payments
    unsubscribers.push(
        businessRef.collection('creditPayments').onSnapshot(function(snap) {
            allCreditPayments = [];
            snap.forEach(function(doc) {
                allCreditPayments.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('creditScreen') && typeof loadCredit === 'function') loadCredit();
            if (isScreenActive('dashboardScreen') && typeof refreshDash === 'function') refreshDash();
        }, function(err) { console.error('[Sync] Credit:', err); })
    );
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

function fsDelete(col, docId) {
    return businessRef.collection(col).doc(docId).delete();
}


// ============ PIN SYSTEM ============
function buildPad(cid, onD, onB) {
    var c = document.getElementById(cid);
    if (!c) return;
    c.innerHTML = '';
    '1,2,3,4,5,6,7,8,9,,0,⌫'.split(',').forEach(function(k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pin-key' + (k === '' ? ' empty' : '');
        b.textContent = k;
        b.setAttribute('aria-label', k === '⌫' ? 'Backspace' : k);
        if (k === '⌫') b.onclick = onB;
        else if (k !== '') b.onclick = function() { onD(k); };
        c.appendChild(b);
    });
}

function setDots(did, len) {
    var dots = document.querySelectorAll('#' + did + ' i');
    dots.forEach(function(d, i) { d.className = i < len ? 'filled' : ''; });
}

function pinErr(did, eid, msg) {
    document.querySelectorAll('#' + did + ' i').forEach(function(d) { d.className = 'error'; });
    var el = document.getElementById(eid);
    if (el) el.textContent = msg;
    if (navigator.vibrate) navigator.vibrate(200);
    setTimeout(function() {
        document.querySelectorAll('#' + did + ' i').forEach(function(d) { d.className = ''; });
        if (el) el.textContent = '';
    }, 800);
}

function initSetup() {
    pinIn = '';
    setDots('setupDots', 0);
    var errEl = document.getElementById('setupErr');
    if (errEl) errEl.textContent = '';

    buildPad('setupPad', function(d) {
        if (pinIn.length < 4) {
            pinIn += d;
            setDots('setupDots', pinIn.length);
            if (pinIn.length === 4) {
                pin1 = pinIn;
                pinIn = '';
                setTimeout(function() { goTo('pinConfirmScreen'); }, 300);
            }
        }
    }, function() {
        if (pinIn.length > 0) {
            pinIn = pinIn.slice(0, -1);
            setDots('setupDots', pinIn.length);
        }
    });
}

function initConfirm() {
    pinIn = '';
    setDots('confirmDots', 0);
    var errEl = document.getElementById('confirmErr');
    if (errEl) errEl.textContent = '';

    buildPad('confirmPad', function(d) {
        if (pinIn.length < 4) {
            pinIn += d;
            setDots('confirmDots', pinIn.length);
            if (pinIn.length === 4) {
                if (pinIn === pin1) {
                    var encoded = btoa(pinIn);
                    businessRef.update({ pin: encoded }).then(function() {
                        localStorage.setItem('mdPin', encoded);
                        pinIn = ''; pin1 = '';
                        showToast('✅ PIN set successfully!');
                        setTimeout(function() { goTo('dashboardScreen'); }, 300);
                    }).catch(function() {
                        showToast('❌ Error saving PIN', 'error');
                    });
                } else {
                    pinIn = '';
                    pinErr('confirmDots', 'confirmErr', 'PIN does not match!');
                    setTimeout(function() { goTo('pinSetupScreen'); }, 1000);
                }
            }
        }
    }, function() {
        if (pinIn.length > 0) {
            pinIn = pinIn.slice(0, -1);
            setDots('confirmDots', pinIn.length);
        }
    });
}

function initLogin() {
    pinIn = '';
    setDots('loginDots', 0);
    var errEl = document.getElementById('loginErr');
    if (errEl) errEl.textContent = '';

    buildPad('loginPad', function(d) {
        // ★ Check lockout before accepting input
        if (Date.now() < pinLockUntil) {
            var rem = Math.ceil((pinLockUntil - Date.now()) / 1000);
            var el = document.getElementById('loginErr');
            if (el) el.textContent = '🔒 Locked! Wait ' + rem + 's';
            return;
        }
        if (pinIn.length < 4) {
            pinIn += d;
            setDots('loginDots', pinIn.length);
            if (pinIn.length === 4) {
                verifyPin(pinIn);
            }
        }
    }, function() {
        if (pinIn.length > 0) {
            pinIn = pinIn.slice(0, -1);
            setDots('loginDots', pinIn.length);
        }
    });
}

function verifyPin(entered) {
    var doCheck = function(stored) {
        var sv = '';
        try { sv = atob(stored || ''); } catch (e) {}

        if (entered === sv) {
            // Success
            pinIn = '';
            pinAttempts = 0;
            setTimeout(function() { goTo('dashboardScreen'); }, 200);
        } else {
            // Wrong
            pinIn = '';
            pinAttempts++;
            if (pinAttempts >= 5) {
                // ★ Lock for 30 seconds after 5 failed attempts
                pinLockUntil = Date.now() + 30000;
                pinErr('loginDots', 'loginErr', '🔒 Too many attempts! Wait 30s');
                pinAttempts = 0;
            } else {
                pinErr('loginDots', 'loginErr', 'Wrong PIN! (' + (5 - pinAttempts) + ' left)');
            }
        }
    };

    // Try cloud first, fallback to cache
    if (businessRef) {
        businessRef.get().then(function(doc) {
            doCheck(doc.exists ? doc.data().pin : localStorage.getItem('mdPin'));
        }).catch(function() {
            doCheck(localStorage.getItem('mdPin'));
        });
    } else {
        doCheck(localStorage.getItem('mdPin'));
    }
}


// ============ NAVIGATION ============
var authScreens = ['splashScreen', 'loginScreen', 'pinSetupScreen', 'pinConfirmScreen', 'pinLoginScreen'];

function goTo(id) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    var screen = document.getElementById(id);
    if (screen) screen.classList.add('active');

    // Bottom nav visibility
    var nav = document.getElementById('bottomNav');
    if (nav) nav.classList.toggle('show', authScreens.indexOf(id) === -1);

    // Highlight active nav button
    document.querySelectorAll('.bn-i').forEach(function(n) {
        var isActive = n.dataset.s === id;
        n.classList.toggle('active', isActive);
        n.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    // Screen-specific init
    switch (id) {
        case 'pinSetupScreen': initSetup(); break;
        case 'pinConfirmScreen': initConfirm(); break;
        case 'pinLoginScreen': initLogin(); break;
        case 'dashboardScreen':
            if (typeof refreshDash === 'function') refreshDash();
            break;
        case 'customerScreen':
            if (typeof loadCusts === 'function') loadCusts();
            break;
        case 'quickSaleScreen':
            if (typeof loadQuickSale === 'function') loadQuickSale();
            break;
        case 'salesScreen':
            setDateInput('salesDate', todayStr());
            updateDateBtn('salesDateBtn', todayStr());
            clearSearch('salesSearch');
            if (typeof loadSales === 'function') loadSales();
            break;
        case 'expenseScreen':
            setDateInput('expDate', todayStr());
            updateDateBtn('expDateBtn', todayStr());
            if (typeof loadExps === 'function') loadExps();
            break;
        case 'wasteScreen':
            setDateInput('wasteDate', todayStr());
            updateDateBtn('wasteDateBtn', todayStr());
            if (typeof loadWasteList === 'function') loadWasteList();
            break;
        case 'creditScreen':
            if (typeof loadCredit === 'function') loadCredit();
            break;
        case 'reportScreen':
            setDateInput('reportDate', todayStr());
            updateDateBtn('reportDateBtn', todayStr());
            if (typeof loadReport === 'function') loadReport();
            break;
        case 'settingScreen':
            if (typeof loadSettings === 'function') loadSettings();
            break;
    }

    window.scrollTo(0, 0);
}

function lockApp() { goTo('pinLoginScreen'); }

function closeOverlay(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('active');
    var nav = document.getElementById('bottomNav');
    if (nav) nav.classList.add('show');
}

function openOverlay(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
    var nav = document.getElementById('bottomNav');
    if (nav) nav.classList.remove('show');
}

function setDateInput(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val;
}

function updateDateBtn(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = fmtDateBtn(val);
}

function clearSearch(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
}


// ============ CUSTOM DATE PICKER ============
function openDatePicker(target) {
    dpTarget = target;
    var cv = '';
    if (target === 'sales') cv = document.getElementById('salesDate').value;
    else if (target === 'expense') cv = document.getElementById('expDate').value;
    else if (target === 'waste') cv = document.getElementById('wasteDate').value;
    else if (target === 'report') cv = document.getElementById('reportDate').value;

    dpSelectedDate = cv || todayStr();
    dpViewDate = new Date(dpSelectedDate + 'T00:00:00');
    renderCalendar();
    document.getElementById('datePickerSheet').classList.add('active');
}

function closeDatePicker() {
    document.getElementById('datePickerSheet').classList.remove('active');
}

function dpMonth(off) {
    var newDate = new Date(dpViewDate);
    newDate.setMonth(newDate.getMonth() + off);

    // ★ FIX: Block future months
    var now = new Date();
    if (newDate.getFullYear() > now.getFullYear() ||
        (newDate.getFullYear() === now.getFullYear() && newDate.getMonth() > now.getMonth())) {
        return;
    }

    dpViewDate = newDate;
    renderCalendar();
}

function renderCalendar() {
    var months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

    document.getElementById('dpMonthLabel').textContent =
        months[dpViewDate.getMonth()] + ' ' + dpViewDate.getFullYear();

    var year = dpViewDate.getFullYear();
    var month = dpViewDate.getMonth();
    var firstDay = new Date(year, month, 1).getDay();
    firstDay = firstDay === 0 ? 6 : firstDay - 1; // Monday = 0
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = new Date(); today.setHours(23, 59, 59, 999);
    var todayS = todayStr();
    var h = '';

    // Empty cells
    for (var e = 0; e < firstDay; e++) {
        h += '<button class="dp-day empty" aria-hidden="true"></button>';
    }

    // Day cells
    for (var d = 1; d <= daysInMonth; d++) {
        var ds = year + '-' + S(month + 1) + '-' + S(d);
        var dateObj = new Date(year, month, d);
        var cls = 'dp-day';
        if (ds === todayS) cls += ' today';
        if (ds === dpSelectedDate) cls += ' selected';
        if (dateObj > today) cls += ' future';
        h += '<button class="' + cls + '" onclick="pickDate(\'' + ds + '\')" ' +
             'aria-label="' + d + ' ' + months[month] + ' ' + year + '">' + d + '</button>';
    }

    document.getElementById('dpDays').innerHTML = h;

    // ★ FIX: Disable forward button when at current month
    var now2 = new Date();
    var nextBtn = document.getElementById('dpNextBtn');
    if (nextBtn) {
        var atCurrent = dpViewDate.getFullYear() >= now2.getFullYear() &&
                        dpViewDate.getMonth() >= now2.getMonth();
        nextBtn.disabled = atCurrent;
    }

    // ★ FIX: Show selected date info when viewing different month
    var infoEl = document.getElementById('dpSelectedInfo');
    if (infoEl && dpSelectedDate) {
        var selDate = new Date(dpSelectedDate + 'T00:00:00');
        if (selDate.getMonth() !== month || selDate.getFullYear() !== year) {
            infoEl.textContent = '✓ Selected: ' + fmtDateLong(dpSelectedDate);
            infoEl.style.display = 'block';
        } else {
            infoEl.style.display = 'none';
        }
    }
}

function pickDate(ds) {
    dpSelectedDate = ds;
    applyPickedDate(ds);
    closeDatePicker();
}

function pickQuickDate(type) {
    var ds;
    if (type === 'today') {
        ds = todayStr();
    } else if (type === 'yesterday') {
        var y = new Date(); y.setDate(y.getDate() - 1);
        ds = y.getFullYear() + '-' + S(y.getMonth() + 1) + '-' + S(y.getDate());
    } else if (type === 'week') {
        var t = new Date();
        var dy = t.getDay();
        t.setDate(t.getDate() - (dy === 0 ? 6 : dy - 1));
        ds = t.getFullYear() + '-' + S(t.getMonth() + 1) + '-' + S(t.getDate());
    }
    applyPickedDate(ds);
    closeDatePicker();
}

function applyPickedDate(ds) {
    if (dpTarget === 'sales') {
        setDateInput('salesDate', ds); updateDateBtn('salesDateBtn', ds);
        if (typeof loadSales === 'function') loadSales();
    } else if (dpTarget === 'expense') {
        setDateInput('expDate', ds); updateDateBtn('expDateBtn', ds);
        if (typeof loadExps === 'function') loadExps();
    } else if (dpTarget === 'waste') {
        setDateInput('wasteDate', ds); updateDateBtn('wasteDateBtn', ds);
        if (typeof loadWasteList === 'function') loadWasteList();
    } else if (dpTarget === 'report') {
        setDateInput('reportDate', ds); updateDateBtn('reportDateBtn', ds);
        if (typeof loadReport === 'function') loadReport();
    }
}


// ============ CUSTOMER PICKER ============
function openCustPicker(mode) {
    pickerMode = mode;
    renderPickerList(allCustomers);
    var el = document.getElementById('custSearch');
    if (el) el.value = '';
    document.getElementById('custPickerSheet').classList.add('active');
}

function closeCustPicker() {
    document.getElementById('custPickerSheet').classList.remove('active');
}

function filterCustPicker(val) {
    val = val.toLowerCase();
    var filtered = allCustomers.filter(function(c) {
        return c.name.toLowerCase().indexOf(val) !== -1;
    });
    renderPickerList(filtered);
}

// ★ FIX: Use data-cid attribute instead of inline names (prevents special char bugs)
function renderPickerList(cs) {
    var ct = document.getElementById('custPickerList');
    if (!ct) return;
    if (!cs.length) {
        ct.innerHTML = '<div class="no-data">No customer found</div>';
        return;
    }
    var h = '';
    cs.forEach(function(c) {
        h += '<div class="bts-item" role="option" data-cid="' + c.id + '">' +
             '<span class="bts-item-name">' + esc(c.name) + '</span>' +
             '<span class="bts-item-rate">₹' + c.rate + '</span></div>';
    });
    ct.innerHTML = h;
}

// ★ Event delegation for picker — handles special characters safely
document.addEventListener('DOMContentLoaded', function() {
    var pickerList = document.getElementById('custPickerList');
    if (pickerList) {
        pickerList.addEventListener('click', function(e) {
            var item = e.target.closest('.bts-item');
            if (!item) return;
            var cid = item.getAttribute('data-cid');
            if (!cid) return;
            var c = findInArray(allCustomers, cid);
            if (c) selectCust(c);
        });
    }
});

// ★ Takes customer object instead of individual params
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

        calcSaleTotal();

        // ★ Check for duplicate sale and show warning
        checkDuplicateSale(c.id, c.name);
    }
    closeCustPicker();
}

// ★ NEW: Duplicate sale warning (non-blocking)
function checkDuplicateSale(custId, custName) {
    var dateVal = '';
    var dateEl = document.getElementById('salesDate');
    if (dateEl && dateEl.value) dateVal = dateEl.value;
    else dateVal = todayStr();

    var existing = allSales.find(function(s) {
        return s.customerId === custId && s.date === dateVal;
    });

    var warn = document.getElementById('sfDupWarn');
    var warnText = document.getElementById('sfDupText');
    if (warn && existing) {
        warnText.textContent = esc(custName) + ' already has ' + existing.quantity +
            ' roti sale today (₹' + existing.total + ')';
        warn.style.display = 'block';
    } else if (warn) {
        warn.style.display = 'none';
    }
}


// ============ FORM HELPERS ============
function setPayType(hid, val, btn) {
    var el = document.getElementById(hid);
    if (el) el.value = val;
    btn.parentElement.querySelectorAll('.tgl').forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
}

function setOrderType(t, btn) {
    document.getElementById('cfOrderType').value = t;
    document.querySelectorAll('#customerForm .tgl').forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    document.getElementById('fixedQtyGroup').style.display = t === 'fixed' ? 'block' : 'none';
    if (t !== 'fixed') document.getElementById('cfQty').value = '';
}

function setSaleType(type, btn) {
    document.getElementById('sfType').value = type;
    btn.parentElement.querySelectorAll('.tgl').forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');

    document.getElementById('sfCustGroup').style.display = type === 'regular' ? 'block' : 'none';
    document.getElementById('sfWalkinGroup').style.display = type === 'walkin' ? 'block' : 'none';

    // Hide duplicate warning when switching type
    var warn = document.getElementById('sfDupWarn');
    if (warn) warn.style.display = 'none';

    if (type === 'walkin') {
        document.getElementById('sfRate').removeAttribute('readonly');
        document.getElementById('sfQty').value = '';
        document.getElementById('sfCustomerId').value = '';
        document.getElementById('sfCustomerName').value = '';

        // ★ FIX: Load last used walk-in rate
        var lastRate = localStorage.getItem('mdLastWalkinRate');
        document.getElementById('sfRate').value = lastRate || '';
    } else {
        document.getElementById('sfRate').setAttribute('readonly', 'readonly');
    }
    calcSaleTotal();
}

function setExpCat(cat, btn) {
    document.getElementById('efCat').value = cat;
    document.querySelectorAll('#expForm .cat').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    setExpCatUI(cat);
    if (typeof showLastRate === 'function') showLastRate(cat);
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
    var el = document.getElementById('sfTotal');
    if (el) el.textContent = '₹' + (r * q);
}


// ============ CONFIRM DIALOG ============
function showConfirm(ic, tt, msg, fn) {
    document.getElementById('confirmIcon').textContent = ic;
    document.getElementById('confirmTitle').textContent = tt;
    document.getElementById('confirmMsg').textContent = msg;
    cfCb = fn;
    document.getElementById('confirmDialog').classList.add('active');

    // Focus the cancel button for accessibility
    setTimeout(function() {
        var noBtn = document.querySelector('.m-no');
        if (noBtn) noBtn.focus();
    }, 100);
}

function hideConfirm() {
    document.getElementById('confirmDialog').classList.remove('active');
    cfCb = null;
}

function onConfirmYes() {
    if (cfCb) cfCb();
    hideConfirm();
}


/* ================================================
   END OF PART 1
   Part 2: Dashboard, Quick Sale, Customers,
           Sales, Expenses, Waste
   ================================================ */
   /* ================================================
   MERI DUKAAN v4.0 — APP LOGIC (PART 2 of 3)
   Dashboard, Quick Sale, Customers, Sales,
   Expenses, Waste, Credit
   ================================================ */


// ============ DASHBOARD ============
function setPeriod(period, btn) {
    currentPeriod = period;
    document.querySelectorAll('.pt').forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    refreshDash();
}

function refreshDash() {
    var now = new Date();
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

    var dateEl = document.getElementById('todayDate');
    if (dateEl) dateEl.textContent = days[now.getDay()] + ', ' + now.getDate() + ' ' +
        months[now.getMonth()] + ' ' + now.getFullYear();

    var hr = now.getHours();
    var greetEl = document.getElementById('dashGreeting');
    if (greetEl) greetEl.textContent =
        hr < 12 ? 'Good Morning!' : hr < 17 ? 'Good Afternoon!' : 'Good Evening!';

    // Period filtered data
    var range = getDateRange(currentPeriod);
    var fs = dataInRange(allSales, range.start, range.end);
    var fe = dataInRange(allExpenses, range.start, range.end);
    var fw = dataInRange(allWaste, range.start, range.end);

    var roti = 0, inc = 0, exp = 0, wasteQty = 0;
    fs.forEach(function(s) { roti += s.quantity; inc += s.total; });
    fe.forEach(function(x) { exp += x.amount; });
    fw.forEach(function(w) { wasteQty += (w.quantity || 0); });
    var profit = inc - exp;

    var el;
    el = document.getElementById('dRoti'); if (el) el.textContent = roti;
    el = document.getElementById('dIncome'); if (el) el.textContent = '₹' + inc;
    el = document.getElementById('dExpense'); if (el) el.textContent = '₹' + exp;

    var pEl = document.getElementById('dProfit');
    if (pEl) {
        pEl.textContent = (profit >= 0 ? '₹' : '-₹') + Math.abs(profit);
        pEl.className = profit >= 0 ? '' : 'neg';
    }

    el = document.getElementById('dWaste'); if (el) el.textContent = wasteQty;

    // ★ FIX: Credit calculation matching credit screen logic (per-customer Math.max)
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
    var totalCreditPending = 0;
    Object.values(creditByCust).forEach(function(c) {
        totalCreditPending += Math.max(0, c.g - c.r);
    });
    el = document.getElementById('dCredit'); if (el) el.textContent = '₹' + totalCreditPending;

    // Recent sales (today only — last 5)
    var todaySalesList = salesForDate(todayStr());
    var rs = document.getElementById('recentSales');
    if (rs) {
        if (!todaySalesList.length) {
            rs.innerHTML = '<div class="no-data">No sales today</div>';
        } else {
            var h = '';
            todaySalesList.slice(-5).reverse().forEach(function(s) {
                var pi = s.paymentType === 'cash' ? '💵' : s.paymentType === 'upi' ? '📱' : '💳';
                h += '<div class="aw-item">' +
                     '<span class="aw-item-n">' + esc(s.customerName || 'Walk-in') +
                     ' (' + s.quantity + ')</span>' +
                     '<span class="aw-item-v inc">' + pi + ' ₹' + s.total + '</span></div>';
            });
            rs.innerHTML = h;
        }
    }

    // Recent expenses (today only — last 5)
    var todayExpsList = expensesForDate(todayStr());
    var re = document.getElementById('recentExp');
    if (re) {
        if (!todayExpsList.length) {
            re.innerHTML = '<div class="no-data">No expenses today</div>';
        } else {
            var h2 = '';
            todayExpsList.slice(-5).reverse().forEach(function(x) {
                h2 += '<div class="aw-item">' +
                      '<span class="aw-item-n">' + catIc(x.category) + ' ' + catNm(x.category) + '</span>' +
                      '<span class="aw-item-v exp">-₹' + x.amount + '</span></div>';
            });
            re.innerHTML = h2;
        }
    }
}


// ============ QUICK SALE ============
function loadQuickSale() {
    var today = todayStr();
    var labelEl = document.getElementById('quickDateLabel');
    if (labelEl) labelEl.textContent = '📅 ' + fmtDateLong(today);

    var todaySales = salesForDate(today);
    var saleMap = {};
    todaySales.forEach(function(s) { if (s.customerId) saleMap[s.customerId] = s; });

    // ★ FIX: Save pending input values BEFORE re-render
    var pendingInputs = {};
    allCustomers.forEach(function(c) {
        if (saleMap[c.id]) return; // Already done, skip
        var qtyEl = document.getElementById('qq_' + c.id);
        var payEl = document.getElementById('qp_' + c.id);
        if (qtyEl && qtyEl.value) {
            pendingInputs[c.id] = {
                qty: qtyEl.value,
                pay: payEl ? payEl.getAttribute('data-pay') : 'cash'
            };
        }
    });

    // Calculate summary
    var doneCount = 0, pendingCount = 0, totalAmt = 0;
    todaySales.forEach(function(s) { totalAmt += s.total; });
    allCustomers.forEach(function(c) {
        if (saleMap[c.id]) doneCount++;
        else pendingCount++;
    });

    var el;
    el = document.getElementById('qsDone'); if (el) el.textContent = doneCount;
    el = document.getElementById('qsPending'); if (el) el.textContent = pendingCount;
    el = document.getElementById('qsTotal'); if (el) el.textContent = '₹' + totalAmt;

    var listEl = document.getElementById('quickSaleList');
    if (!listEl) return;

    if (!allCustomers.length) {
        listEl.innerHTML =
            '<div class="empty"><div class="empty-ic">👥</div><h3>No Customers</h3>' +
            '<p>Add customers first to use Quick Sale</p>' +
            '<button class="empty-btn" onclick="goTo(\'customerScreen\')">Add Customer</button></div>';
        return;
    }

    var h = '';
    allCustomers.forEach(function(c, i) {
        var isDone = !!saleMap[c.id];
        var sale = saleMap[c.id];
        var isFixed = c.orderType === 'fixed';
        var qty = isDone ? sale.quantity : (isFixed ? c.fixedQty : '');
        var amt = isDone ? sale.total : (qty ? qty * c.rate : 0);

        h += '<div class="quick-row' + (isDone ? ' done' : '') +
             '" style="animation-delay:' + (i * 0.03) + 's">';

        // Customer info
        h += '<div class="qr-info">';
        h += '<div class="qr-name">' + esc(c.name) + '</div>';
        h += '<div class="qr-details">' +
             (isFixed ? '📋 Fixed • ' + c.fixedQty + ' roti' : '🔄 Variable') + '</div>';
        h += '<div class="qr-rate">₹' + c.rate + '/roti</div>';
        h += '</div>';

        if (isDone) {
            // Completed state
            h += '<div class="qr-amt">₹' + amt + '</div>';
            h += '<button class="qr-status" disabled aria-label="Completed">✅</button>';
        } else {
            // Pending — input fields
            // ★ Use data attributes for safe event handling
            h += '<input type="number" class="qr-qty" id="qq_' + c.id + '" ' +
                 'value="' + (qty || '') + '" ' +
                 (isFixed ? '' : 'placeholder="Qty"') +
                 ' min="1" inputmode="numeric" ' +
                 'data-cid="' + c.id + '" data-rate="' + c.rate + '" ' +
                 'oninput="quickCalcAmt(this)">';

            h += '<button class="qr-pay" id="qp_' + c.id + '" data-pay="cash" ' +
                 'data-cid="' + c.id + '" onclick="cycleQuickPay(this)" ' +
                 'aria-label="Payment method">💵</button>';

            h += '<div class="qr-amt" id="qa_' + c.id + '">₹' + amt + '</div>';

            h += '<button class="qr-status" data-cid="' + c.id + '" ' +
                 'data-rate="' + c.rate + '" onclick="quickSaveSaleBtn(this)" ' +
                 'aria-label="Save sale for ' + esc(c.name) + '">💾</button>';
        }
        h += '</div>';
    });

    listEl.innerHTML = h;

    // ★ FIX: Restore pending input values AFTER re-render
    Object.keys(pendingInputs).forEach(function(cid) {
        var saved = pendingInputs[cid];
        var qtyEl = document.getElementById('qq_' + cid);
        var payEl = document.getElementById('qp_' + cid);
        var amtEl = document.getElementById('qa_' + cid);

        if (qtyEl) {
            qtyEl.value = saved.qty;
            // Recalculate amount
            var c = findInArray(allCustomers, cid);
            if (c && amtEl) {
                amtEl.textContent = '₹' + (parseInt(saved.qty) * c.rate);
            }
        }
        if (payEl) {
            payEl.setAttribute('data-pay', saved.pay);
            payEl.textContent = saved.pay === 'cash' ? '💵' :
                                saved.pay === 'upi' ? '📱' : '💳';
        }
    });
}

// ★ Refactored to use element reference instead of inline ID
function quickCalcAmt(el) {
    var rate = parseFloat(el.getAttribute('data-rate')) || 0;
    var qty = parseInt(el.value) || 0;
    var cid = el.getAttribute('data-cid');
    var amtEl = document.getElementById('qa_' + cid);
    if (amtEl) amtEl.textContent = '₹' + (qty * rate);
}

function cycleQuickPay(btn) {
    var cur = btn.getAttribute('data-pay');
    var next, icon;
    if (cur === 'cash') { next = 'upi'; icon = '📱'; }
    else if (cur === 'upi') { next = 'credit'; icon = '💳'; }
    else { next = 'cash'; icon = '💵'; }
    btn.setAttribute('data-pay', next);
    btn.textContent = icon;
}

// ★ Refactored — reads from data attributes, no inline special chars
function quickSaveSaleBtn(btn) {
    var cid = btn.getAttribute('data-cid');
    var rate = parseFloat(btn.getAttribute('data-rate')) || 0;
    var cust = findInArray(allCustomers, cid);
    if (!cust) { showToast('❌ Customer not found', 'error'); return; }
    quickSaveSale(cid, cust.name, rate, btn);
}

async function quickSaveSale(custId, custName, rate, btn) {
    var qtyEl = document.getElementById('qq_' + custId);
    var qty = parseInt(qtyEl ? qtyEl.value : 0) || 0;
    if (qty < 1) { showToast('❌ Enter quantity!', 'error'); return; }

    var payBtn = document.getElementById('qp_' + custId);
    var payType = payBtn ? payBtn.getAttribute('data-pay') : 'cash';

    // Disable button during save
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

    try {
        await fsAdd('sales', {
            customerId: custId,
            customerName: custName,
            date: todayStr(),
            rate: rate,
            quantity: qty,
            total: rate * qty,
            paymentType: payType,
            saleType: 'regular',
            source: 'quick'
        });
        showToast('✅ ' + custName + ' — ' + qty + ' roti saved!');
    } catch (err) {
        console.error('[QuickSale]', err);
        showToast('❌ Error saving', 'error');
        // Restore button on error
        if (btn) { btn.disabled = false; btn.textContent = '💾'; }
    }
}

async function markAllFixedDone() {
    var today = todayStr();
    var todaySales = salesForDate(today);
    var saleMap = {};
    todaySales.forEach(function(s) { if (s.customerId) saleMap[s.customerId] = true; });

    var pending = allCustomers.filter(function(c) {
        return c.orderType === 'fixed' && c.fixedQty > 0 && !saleMap[c.id];
    });

    if (!pending.length) {
        showToast('✅ All fixed orders already done!');
        return;
    }

    showConfirm('✅', 'Mark All Done?',
        pending.length + ' fixed orders will be saved as Cash.',
        async function() {
            // Disable button
            var qaBtn = document.querySelector('.qa-btn');
            if (qaBtn) { qaBtn.disabled = true; qaBtn.textContent = '⏳ Saving...'; }

            try {
                var count = 0;
                for (var i = 0; i < pending.length; i++) {
                    var c = pending[i];
                    await fsAdd('sales', {
                        customerId: c.id,
                        customerName: c.name,
                        date: today,
                        rate: c.rate,
                        quantity: c.fixedQty,
                        total: c.rate * c.fixedQty,
                        paymentType: 'cash',
                        saleType: 'regular',
                        source: 'quick'
                    });
                    count++;
                }
                showToast('✅ ' + count + ' orders saved!');
            } catch (err) {
                console.error('[MarkAll]', err);
                showToast('❌ Error saving orders', 'error');
            } finally {
                if (qaBtn) { qaBtn.disabled = false; qaBtn.textContent = '✅ Mark All Fixed as Done'; }
            }
        }
    );
}


// ============ CUSTOMERS ============
function loadCusts() {
    var countEl = document.getElementById('custCount');
    if (countEl) {
        countEl.textContent = allCustomers.length + ' Customer' +
            (allCustomers.length !== 1 ? 's' : '');
    }

    var ct = document.getElementById('customerList');
    if (!ct) return;

    if (!allCustomers.length) {
        ct.innerHTML =
            '<div class="empty"><div class="empty-ic">👥</div><h3>No Customers</h3>' +
            '<p>Add your first customer to start tracking</p>' +
            '<button class="empty-btn" onclick="openCustomerForm()">+ Add Customer</button></div>';
        return;
    }

    var h = '';
    allCustomers.forEach(function(c, i) {
        var tt = c.orderType === 'fixed' ? '📋 Fixed: ' + c.fixedQty + '/day' : '🔄 Variable';
        var tc = c.orderType === 'fixed' ? 'cb-f' : 'cb-v';

        h += '<div class="c-card" style="animation-delay:' + (i * 0.04) + 's">';
        h += '<div class="c-info">';
        h += '<div class="c-name">' + esc(c.name) + '</div>';
        h += '<div class="c-dets">';
        h += '<span class="c-b cb-r">₹' + c.rate + '/roti</span>';
        h += '<span class="c-b ' + tc + '">' + tt + '</span>';
        h += '</div>';
        if (c.phone) h += '<div class="c-ph">📱 ' + esc(c.phone) + '</div>';
        h += '</div>';

        // ★ FIX: Only show edit/delete for non-staff
        if (canModify()) {
            h += '<div class="c-acts">';
            h += '<button class="ic-btn ib-e" onclick="openCustomerForm(\'' + c.id + '\')" aria-label="Edit ' + esc(c.name) + '">✏️</button>';
            h += '<button class="ic-btn ib-d" onclick="confirmDelCust(\'' + c.id + '\')" aria-label="Delete ' + esc(c.name) + '">🗑️</button>';
            h += '</div>';
        }

        h += '</div>';
    });
    ct.innerHTML = h;
}

function openCustomerForm(id) {
    var form = document.getElementById('customerForm');
    if (form) form.reset();
    document.getElementById('cfId').value = '';
    document.getElementById('cfOrderType').value = 'fixed';
    document.getElementById('fixedQtyGroup').style.display = 'block';

    // Reset toggles
    var tg = document.querySelectorAll('#customerForm .tgl');
    tg.forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
    });
    if (tg[0]) { tg[0].classList.add('active'); tg[0].setAttribute('aria-pressed', 'true'); }

    if (id) {
        document.getElementById('cfTitle').textContent = 'Edit Customer';
        var c = findInArray(allCustomers, id);
        if (c) {
            document.getElementById('cfId').value = c.id;
            document.getElementById('cfName').value = c.name;
            document.getElementById('cfRate').value = c.rate;
            document.getElementById('cfPhone').value = c.phone || '';
            document.getElementById('cfOrderType').value = c.orderType || 'fixed';
            document.getElementById('cfQty').value = c.fixedQty || '';

            tg.forEach(function(b) {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            if (c.orderType === 'variable') {
                if (tg[1]) { tg[1].classList.add('active'); tg[1].setAttribute('aria-pressed', 'true'); }
                document.getElementById('fixedQtyGroup').style.display = 'none';
            } else {
                if (tg[0]) { tg[0].classList.add('active'); tg[0].setAttribute('aria-pressed', 'true'); }
            }
        }
    } else {
        document.getElementById('cfTitle').textContent = 'New Customer';
    }
    openOverlay('customerFormOverlay');
}

async function saveCustomer(e) {
    e.preventDefault();
    var n = document.getElementById('cfName').value.trim();
    var r = parseFloat(document.getElementById('cfRate').value);
    var ot = document.getElementById('cfOrderType').value;
    var fq = ot === 'fixed' ? parseInt(document.getElementById('cfQty').value) : null;

    // ★ Validation with specific messages
    if (!n) { showToast('❌ Enter customer name!', 'error'); return; }
    if (!r || r <= 0) { showToast('❌ Rate must be positive!', 'error'); return; }
    if (ot === 'fixed' && (!fq || fq < 1)) {
        showToast('❌ Enter daily roti count!', 'error'); return;
    }

    var data = {
        name: n,
        rate: r,
        phone: document.getElementById('cfPhone').value.trim(),
        orderType: ot,
        fixedQty: fq
    };

    var btn = document.getElementById('cfSubmitBtn');
    btnLoading(btn, true);

    try {
        var idV = document.getElementById('cfId').value;
        if (idV) {
            await fsUpdate('customers', idV, data);
            showToast('✅ ' + n + ' updated!');
        } else {
            await fsAdd('customers', data);
            showToast('✅ ' + n + ' added!');
        }
        closeOverlay('customerFormOverlay');
    } catch (err) {
        console.error('[Customer]', err);
        showToast('❌ Error saving customer', 'error');
    } finally {
        btnLoading(btn, false);
    }
}

function confirmDelCust(id) {
    if (!canModify()) { showToast('❌ Staff cannot delete', 'error'); return; }
    var c = findInArray(allCustomers, id);
    if (!c) return;
    showConfirm('🗑️', 'Delete Customer?',
        'Delete "' + c.name + '"? This cannot be undone.',
        async function() {
            try {
                await fsDelete('customers', id);
                showToast('✅ ' + c.name + ' deleted!');
            } catch (err) { showToast('❌ Error deleting', 'error'); }
        }
    );
}


// ============ SALES ============
function changeSalesDate(off) {
    var cv = document.getElementById('salesDate').value;
    var nd = dateShift(cv, off);
    if (nd) {
        setDateInput('salesDate', nd);
        updateDateBtn('salesDateBtn', nd);
        clearSearch('salesSearch');
        loadSales();
    }
}

function loadSales() {
    var date = document.getElementById('salesDate').value;
    if (!date) return;
    var all = salesForDate(date);

    var roti = 0, inc = 0, cash = 0, cred = 0;
    all.forEach(function(s) {
        roti += s.quantity; inc += s.total;
        if (s.paymentType === 'credit') cred += s.total;
        else cash += s.total;
    });

    var el;
    el = document.getElementById('sRoti'); if (el) el.textContent = roti;
    el = document.getElementById('sIncome'); if (el) el.textContent = '₹' + inc;
    el = document.getElementById('sCash'); if (el) el.textContent = '₹' + cash;
    el = document.getElementById('sCredit'); if (el) el.textContent = '₹' + cred;

    renderSales(all);
}

// ★ NEW: Sales search filter
function filterSales(query) {
    var date = document.getElementById('salesDate').value;
    if (!date) return;
    var all = salesForDate(date);

    if (query && query.trim()) {
        var q = query.toLowerCase();
        all = all.filter(function(s) {
            return (s.customerName || 'Walk-in').toLowerCase().indexOf(q) !== -1;
        });
    }

    renderSales(all);
}

function openSaleForm(id) {
    var form = document.getElementById('saleForm');
    if (form) form.reset();
    document.getElementById('sfId').value = '';
    document.getElementById('sfCustomerId').value = '';
    document.getElementById('sfCustomerName').value = '';
    document.getElementById('sfCustLabel').textContent = '-- Select Customer --';
    document.getElementById('sfCustBtn').classList.remove('selected');
    document.getElementById('sfType').value = 'regular';
    document.getElementById('sfPay').value = 'cash';
    document.getElementById('sfTotal').textContent = '₹0';
    document.getElementById('sfRate').value = '';
    document.getElementById('sfQty').value = '';
    document.getElementById('sfCustGroup').style.display = 'block';
    document.getElementById('sfWalkinGroup').style.display = 'none';
    document.getElementById('sfWalkinName').value = '';
    document.getElementById('sfRate').setAttribute('readonly', 'readonly');

    // Hide duplicate warning
    var warn = document.getElementById('sfDupWarn');
    if (warn) warn.style.display = 'none';

    // Reset all toggle buttons
    document.querySelectorAll('#saleForm .tgl-row').forEach(function(row) {
        var btns = row.querySelectorAll('.tgl');
        btns.forEach(function(b, i) {
            b.classList.toggle('active', i === 0);
            b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
        });
    });

    if (id) {
        document.getElementById('sfTitle').textContent = 'Edit Sale';
        var s = findInArray(allSales, id);
        if (s) {
            document.getElementById('sfId').value = s.id;
            document.getElementById('sfRate').value = s.rate;
            document.getElementById('sfQty').value = s.quantity;
            document.getElementById('sfPay').value = s.paymentType;

            if (s.saleType === 'walkin') {
                document.getElementById('sfType').value = 'walkin';
                document.getElementById('sfCustGroup').style.display = 'none';
                document.getElementById('sfWalkinGroup').style.display = 'block';
                document.getElementById('sfWalkinName').value = s.customerName || '';
                document.getElementById('sfRate').removeAttribute('readonly');

                var typeTgls = document.querySelectorAll('#saleForm .tgl-row')[0].querySelectorAll('.tgl');
                typeTgls.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
                if (typeTgls[1]) { typeTgls[1].classList.add('active'); typeTgls[1].setAttribute('aria-pressed', 'true'); }
            } else {
                document.getElementById('sfCustomerId').value = s.customerId;
                document.getElementById('sfCustomerName').value = s.customerName;
                document.getElementById('sfCustLabel').textContent = s.customerName + ' (₹' + s.rate + ')';
                document.getElementById('sfCustBtn').classList.add('selected');
            }

            calcSaleTotal();

            // Set payment toggle
            var payTgls = document.querySelectorAll('#saleForm .tgl3 .tgl');
            payTgls.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
            var payIdx = s.paymentType === 'cash' ? 0 : s.paymentType === 'upi' ? 1 : 2;
            if (payTgls[payIdx]) { payTgls[payIdx].classList.add('active'); payTgls[payIdx].setAttribute('aria-pressed', 'true'); }
        }
    } else {
        document.getElementById('sfTitle').textContent = 'New Sale';
    }
    openOverlay('saleFormOverlay');
}

async function saveSale(e) {
    e.preventDefault();
    var saleType = document.getElementById('sfType').value;
    var cid = document.getElementById('sfCustomerId').value;
    var cname = document.getElementById('sfCustomerName').value;
    var r = parseFloat(document.getElementById('sfRate').value);
    var q = parseInt(document.getElementById('sfQty').value);

    // Validation
    if (saleType === 'walkin') {
        cname = document.getElementById('sfWalkinName').value.trim() || 'Walk-in';
        cid = '';
        if (!r || r <= 0) { showToast('❌ Enter valid rate!', 'error'); return; }
    } else {
        if (!cid || !cname) { showToast('❌ Select customer!', 'error'); return; }
    }
    if (!r || r <= 0) { showToast('❌ Rate must be positive!', 'error'); return; }
    if (!q || q < 1) { showToast('❌ Quantity must be at least 1!', 'error'); return; }

    var data = {
        customerId: cid,
        customerName: cname,
        date: document.getElementById('salesDate').value || todayStr(),
        rate: r,
        quantity: q,
        total: r * q,
        paymentType: document.getElementById('sfPay').value,
        saleType: saleType
    };

    // ★ FIX: Save walk-in rate for next time
    if (saleType === 'walkin' && r > 0) {
        localStorage.setItem('mdLastWalkinRate', r.toString());
    }

    var btn = document.getElementById('sfSubmitBtn');
    btnLoading(btn, true);

    try {
        var idV = document.getElementById('sfId').value;
        if (idV) {
            await fsUpdate('sales', idV, data);
            showToast('✅ Sale updated!');
        } else {
            await fsAdd('sales', data);
            showToast('✅ ' + cname + ' — ' + q + ' roti saved!');
        }
        closeOverlay('saleFormOverlay');
    } catch (err) {
        console.error('[Sale]', err);
        showToast('❌ Error saving sale', 'error');
    } finally {
        btnLoading(btn, false);
    }
}

function renderSales(sales) {
    var ct = document.getElementById('salesList');
    if (!ct) return;

    if (!sales.length) {
        var searchEl = document.getElementById('salesSearch');
        var isSearching = searchEl && searchEl.value.trim();
        ct.innerHTML = '<div class="empty"><div class="empty-ic">🫓</div>' +
            '<h3>' + (isSearching ? 'No Results' : 'No Sales') + '</h3>' +
            '<p>' + (isSearching ? 'Try a different search' : 'No sales on this date') + '</p>' +
            (isSearching ? '' : '<button class="empty-btn" onclick="openSaleForm()">+ Add Sale</button>') +
            '</div>';
        return;
    }

    var h = '';
    sales.forEach(function(s, i) {
        var pb = payBdg(s.paymentType);
        var isWalkin = s.saleType === 'walkin';

        h += '<div class="sale-card' + (isWalkin ? ' walkin' : '') +
             '" style="animation-delay:' + (i * 0.04) + 's">';

        h += '<div class="sl-top">';
        h += '<div class="sl-name">' + esc(s.customerName || 'Walk-in') + '</div>';
        h += '<div class="sl-amt">₹' + s.total + '</div>';
        h += '</div>';

        h += '<div class="sl-badges">';
        h += '<span class="sl-b slb-q">' + s.quantity + ' roti</span>';
        h += '<span class="sl-b slb-r">₹' + s.rate + '/roti</span>';
        h += '<span class="sl-b ' + pb.c + '">' + pb.t + '</span>';
        if (isWalkin) h += '<span class="sl-b slb-w">🚶 Walk-in</span>';
        h += '</div>';

        h += '<div class="sl-foot">';
        h += '<span class="sl-time">' + getTime(s.createdAt) + '</span>';

        // ★ FIX: Only show edit/delete for non-staff
        if (canModify()) {
            h += '<div class="sl-acts">';
            h += '<button class="ic-btn ib-e" onclick="openSaleForm(\'' + s.id + '\')" aria-label="Edit">✏️</button>';
            h += '<button class="ic-btn ib-d" onclick="confirmDelSale(\'' + s.id + '\')" aria-label="Delete">🗑️</button>';
            h += '</div>';
        }

        h += '</div></div>';
    });
    ct.innerHTML = h;
}

function confirmDelSale(id) {
    if (!canModify()) { showToast('❌ Staff cannot delete', 'error'); return; }
    var s = findInArray(allSales, id);
    if (!s) return;
    showConfirm('🗑️', 'Delete Sale?',
        (s.customerName || 'Walk-in') + ' — ' + s.quantity + ' roti (₹' + s.total + ')?',
        async function() {
            try {
                await fsDelete('sales', id);
                showToast('✅ Sale deleted!');
            } catch (err) { showToast('❌ Error deleting', 'error'); }
        }
    );
}


// ============ EXPENSES ============
function changeExpDate(off) {
    var cv = document.getElementById('expDate').value;
    var nd = dateShift(cv, off);
    if (nd) {
        setDateInput('expDate', nd);
        updateDateBtn('expDateBtn', nd);
        loadExps();
    }
}

function loadExps() {
    var date = document.getElementById('expDate').value;
    if (!date) return;
    var all = expensesForDate(date);

    var total = 0;
    all.forEach(function(x) { total += x.amount; });

    var el;
    el = document.getElementById('eTotal'); if (el) el.textContent = '₹' + total;
    el = document.getElementById('eCount'); if (el) el.textContent = all.length;

    renderExps(all);
}

function openExpenseForm(id) {
    var form = document.getElementById('expForm');
    if (form) form.reset();
    document.getElementById('efId').value = '';
    document.getElementById('efCat').value = 'atta';
    document.getElementById('efPay').value = 'cash';
    document.getElementById('efDetailGrp').style.display = 'none';
    document.getElementById('efWeightGrp').style.display = 'block';
    document.getElementById('efRateInfo').style.display = 'none';

    // Reset category pills
    document.querySelectorAll('#expForm .cat').forEach(function(b) { b.classList.remove('active'); });
    var firstCat = document.querySelectorAll('#expForm .cat')[0];
    if (firstCat) firstCat.classList.add('active');

    // Reset payment toggles
    var tg = document.querySelectorAll('#expForm .tgl');
    tg.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    if (tg[0]) { tg[0].classList.add('active'); tg[0].setAttribute('aria-pressed', 'true'); }

    if (id) {
        document.getElementById('efTitle').textContent = 'Edit Expense';
        var x = findInArray(allExpenses, id);
        if (x) {
            document.getElementById('efId').value = x.id;
            document.getElementById('efCat').value = x.category;
            document.getElementById('efDetail').value = x.detail || '';
            document.getElementById('efWeight').value = x.weight || '';
            document.getElementById('efAmount').value = x.amount;
            document.getElementById('efPay').value = x.paymentType || 'cash';
            setExpCatUI(x.category);

            // Highlight correct category pill
            var catMap = { atta:0, oil:1, gas:2, poly:3, other:4 };
            document.querySelectorAll('#expForm .cat').forEach(function(b) { b.classList.remove('active'); });
            var ci = catMap[x.category];
            if (ci !== undefined) {
                var catBtns = document.querySelectorAll('#expForm .cat');
                if (catBtns[ci]) catBtns[ci].classList.add('active');
            }

            // Highlight correct payment toggle
            tg.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
            var payIdx = x.paymentType === 'upi' ? 1 : 0;
            if (tg[payIdx]) { tg[payIdx].classList.add('active'); tg[payIdx].setAttribute('aria-pressed', 'true'); }

            showLastRate(x.category);
        }
    } else {
        document.getElementById('efTitle').textContent = 'New Expense';
        showLastRate('atta');
    }
    openOverlay('expFormOverlay');
}

function showLastRate(cat) {
    var ri = document.getElementById('efRateInfo');
    if (!ri) return;
    if (cat !== 'atta' && cat !== 'oil') { ri.style.display = 'none'; return; }

    var all = allExpenses.filter(function(x) {
        return x.category === cat && x.weight && x.weight > 0;
    });
    all.sort(function(a, b) { return a.date > b.date ? 1 : -1; });

    if (!all.length) { ri.style.display = 'none'; return; }

    var last = all[all.length - 1];
    var lr = (last.amount / last.weight).toFixed(1);
    var msg = '📊 Last: ₹' + lr + '/kg (' + last.weight + 'kg = ₹' + last.amount + ') on ' + fmtDate(last.date);

    if (all.length >= 2) {
        var prev = all[all.length - 2];
        var pr = prev.amount / prev.weight;
        var ch = (((last.amount / last.weight) - pr) / pr * 100).toFixed(1);
        if (ch > 0) { msg += '\n⬆️ ' + ch + '% price INCREASE'; ri.className = 'rate-box up'; }
        else if (ch < 0) { msg += '\n⬇️ ' + Math.abs(ch) + '% price decrease'; ri.className = 'rate-box down'; }
        else { msg += '\n➡️ Same price'; ri.className = 'rate-box neutral'; }
    } else {
        ri.className = 'rate-box neutral';
    }

    ri.textContent = msg;
    ri.style.whiteSpace = 'pre-line';
    ri.style.display = 'block';
}

// ★ NEW: Live rate comparison while typing weight/amount
function updateExpComparison() {
    var cat = document.getElementById('efCat').value;
    var ri = document.getElementById('efRateInfo');
    if (!ri) return;
    if (cat !== 'atta' && cat !== 'oil') return;

    var weight = parseFloat(document.getElementById('efWeight').value) || 0;
    var amount = parseFloat(document.getElementById('efAmount').value) || 0;

    // If either field is empty, show last rate only
    if (weight <= 0 || amount <= 0) {
        showLastRate(cat);
        return;
    }

    var currentRate = (amount / weight).toFixed(1);

    // Get last purchase rate
    var all = allExpenses.filter(function(x) {
        return x.category === cat && x.weight && x.weight > 0;
    });
    all.sort(function(a, b) { return a.date > b.date ? 1 : -1; });

    if (!all.length) {
        ri.textContent = '📊 Current rate: ₹' + currentRate + '/kg';
        ri.className = 'rate-box neutral';
        ri.style.display = 'block';
        return;
    }

    var last = all[all.length - 1];
    var lastRate = (last.amount / last.weight).toFixed(1);
    var diff = ((currentRate - lastRate) / lastRate * 100).toFixed(1);

    var msg = '📊 Current: ₹' + currentRate + '/kg\n';
    msg += '📊 Last: ₹' + lastRate + '/kg (' + last.weight + 'kg = ₹' + last.amount + ')';

    if (diff > 0) {
        msg += '\n⬆️ ' + diff + '% MORE expensive';
        ri.className = 'rate-box up';
    } else if (diff < 0) {
        msg += '\n⬇️ ' + Math.abs(diff) + '% CHEAPER';
        ri.className = 'rate-box down';
    } else {
        msg += '\n➡️ Same rate';
        ri.className = 'rate-box neutral';
    }

    ri.textContent = msg;
    ri.style.whiteSpace = 'pre-line';
    ri.style.display = 'block';
}

async function saveExpense(e) {
    e.preventDefault();
    var cat = document.getElementById('efCat').value;
    var amt = parseFloat(document.getElementById('efAmount').value);

    // ★ Validation
    if (!amt || amt <= 0) { showToast('❌ Enter valid amount!', 'error'); return; }

    var weight = parseFloat(document.getElementById('efWeight').value) || null;
    if (weight !== null && weight <= 0) {
        showToast('❌ Weight must be positive!', 'error'); return;
    }

    var data = {
        category: cat,
        detail: document.getElementById('efDetail').value.trim(),
        weight: weight,
        amount: amt,
        paymentType: document.getElementById('efPay').value,
        date: document.getElementById('expDate').value || todayStr()
    };

    var btn = document.getElementById('efSubmitBtn');
    btnLoading(btn, true);

    try {
        var idV = document.getElementById('efId').value;
        if (idV) {
            await fsUpdate('expenses', idV, data);
            showToast('✅ Expense updated!');
        } else {
            await fsAdd('expenses', data);
            showToast('✅ ' + catNm(cat) + ' ₹' + amt + ' saved!');
        }
        closeOverlay('expFormOverlay');
    } catch (err) {
        console.error('[Expense]', err);
        showToast('❌ Error saving expense', 'error');
    } finally {
        btnLoading(btn, false);
    }
}

function renderExps(exps) {
    var ct = document.getElementById('expList');
    if (!ct) return;

    if (!exps.length) {
        ct.innerHTML =
            '<div class="empty"><div class="empty-ic">🛒</div><h3>No Expenses</h3>' +
            '<p>No expenses recorded on this date</p>' +
            '<button class="empty-btn" onclick="openExpenseForm()">+ Add Expense</button></div>';
        return;
    }

    var h = '';
    exps.forEach(function(x, i) {
        var pb = payBdg(x.paymentType);
        var det = '';
        if (x.weight && x.weight > 0) {
            det = x.weight + 'kg • ₹' + (x.amount / x.weight).toFixed(1) + '/kg';
        } else if (x.detail) {
            det = x.detail;
        }

        h += '<div class="exp-card" style="animation-delay:' + (i * 0.04) + 's">';
        h += '<div class="ex-top">';
        h += '<div class="ex-cat">' + catIc(x.category) + ' ' + catNm(x.category) + '</div>';
        h += '<div class="ex-amt">-₹' + x.amount + '</div>';
        h += '</div>';
        if (det) h += '<div class="ex-det">' + esc(det) + '</div>';
        h += '<div class="ex-badges"><span class="sl-b ' + pb.c + '">' + pb.t + '</span></div>';
        h += '<div class="ex-foot">';
        h += '<span class="sl-time">' + getTime(x.createdAt) + '</span>';

        // ★ FIX: Only show edit/delete for non-staff
        if (canModify()) {
            h += '<div class="sl-acts">';
            h += '<button class="ic-btn ib-e" onclick="openExpenseForm(\'' + x.id + '\')" aria-label="Edit">✏️</button>';
            h += '<button class="ic-btn ib-d" onclick="confirmDelExp(\'' + x.id + '\')" aria-label="Delete">🗑️</button>';
            h += '</div>';
        }

        h += '</div></div>';
    });
    ct.innerHTML = h;
}

function confirmDelExp(id) {
    if (!canModify()) { showToast('❌ Staff cannot delete', 'error'); return; }
    var x = findInArray(allExpenses, id);
    if (!x) return;
    showConfirm('🗑️', 'Delete Expense?',
        catNm(x.category) + ' ₹' + x.amount + ' — Delete?',
        async function() {
            try {
                await fsDelete('expenses', id);
                showToast('✅ Expense deleted!');
            } catch (err) { showToast('❌ Error deleting', 'error'); }
        }
    );
}


// ============ WASTE ============
function changeWasteDate(off) {
    var cv = document.getElementById('wasteDate').value;
    var nd = dateShift(cv, off);
    if (nd) {
        setDateInput('wasteDate', nd);
        updateDateBtn('wasteDateBtn', nd);
        loadWasteList();
    }
}

function loadWasteList() {
    var date = document.getElementById('wasteDate').value;
    if (!date) return;
    var all = wasteForDate(date);

    var totalQty = 0;
    all.forEach(function(w) { totalQty += (w.quantity || 0); });

    // Estimate cost using average sale rate
    var avgRate = 0;
    if (allSales.length) {
        var totalSaleAmt = 0, totalSaleQty = 0;
        allSales.forEach(function(s) { totalSaleAmt += s.total; totalSaleQty += s.quantity; });
        avgRate = totalSaleQty > 0 ? totalSaleAmt / totalSaleQty : 0;
    }

    var el;
    el = document.getElementById('wQty'); if (el) el.textContent = totalQty;
    el = document.getElementById('wCost'); if (el) el.textContent = '₹' + Math.round(totalQty * avgRate);

    var ct = document.getElementById('wasteList');
    if (!ct) return;

    if (!all.length) {
        ct.innerHTML =
            '<div class="empty"><div class="empty-ic">🗑️</div><h3>No Waste</h3>' +
            '<p>No waste recorded on this date</p>' +
            '<button class="empty-btn" onclick="openWasteForm()">+ Add Waste</button></div>';
        return;
    }

    var h = '';
    all.forEach(function(w, i) {
        h += '<div class="waste-card" style="animation-delay:' + (i * 0.04) + 's">';
        h += '<div class="wc-top">';
        h += '<div class="wc-reason">' + wasteReasonText(w.reason) + '</div>';
        h += '<div class="wc-qty">' + w.quantity + ' roti</div>';
        h += '</div>';
        if (w.notes) h += '<div class="wc-notes">' + esc(w.notes) + '</div>';
        h += '<div class="wc-foot">';
        h += '<span class="sl-time">' + getTime(w.createdAt) + '</span>';

        // ★ FIX: Edit + Delete buttons (was missing Edit)
        if (canModify()) {
            h += '<div class="sl-acts">';
            h += '<button class="ic-btn ib-e" onclick="openWasteForm(\'' + w.id + '\')" aria-label="Edit">✏️</button>';
            h += '<button class="ic-btn ib-d" onclick="confirmDelWaste(\'' + w.id + '\')" aria-label="Delete">🗑️</button>';
            h += '</div>';
        }

        h += '</div></div>';
    });
    ct.innerHTML = h;
}

// ★ FIX: Now supports editing (takes optional id)
function openWasteForm(id) {
    var form = document.getElementById('wasteForm');
    if (form) form.reset();
    document.getElementById('wfId').value = '';
    document.getElementById('wfReason').value = 'burnt';

    // Reset reason pills
    document.querySelectorAll('#wasteForm .cat').forEach(function(b) { b.classList.remove('active'); });
    var firstCat = document.querySelectorAll('#wasteForm .cat')[0];
    if (firstCat) firstCat.classList.add('active');

    var titleEl = document.getElementById('wfFormTitle');

    if (id) {
        // Edit mode
        if (titleEl) titleEl.textContent = 'Edit Waste Entry';
        var w = findInArray(allWaste, id);
        if (w) {
            document.getElementById('wfId').value = w.id;
            document.getElementById('wfQty').value = w.quantity;
            document.getElementById('wfNotes').value = w.notes || '';
            document.getElementById('wfReason').value = w.reason || 'burnt';

            // Highlight correct reason pill
            var reasonMap = { burnt:0, extra:1, returned:2, other:3 };
            document.querySelectorAll('#wasteForm .cat').forEach(function(b) { b.classList.remove('active'); });
            var ri = reasonMap[w.reason];
            if (ri !== undefined) {
                var reasonBtns = document.querySelectorAll('#wasteForm .cat');
                if (reasonBtns[ri]) reasonBtns[ri].classList.add('active');
            }
        }
    } else {
        // Add mode
        if (titleEl) titleEl.textContent = 'Add Waste Entry';
    }
    openOverlay('wasteFormOverlay');
}

// ★ FIX: Now supports update (was add-only before)
async function saveWaste(e) {
    e.preventDefault();
    var qty = parseInt(document.getElementById('wfQty').value);

    // Validation
    if (!qty || qty < 1) { showToast('❌ Enter valid quantity!', 'error'); return; }

    var data = {
        quantity: qty,
        reason: document.getElementById('wfReason').value,
        notes: document.getElementById('wfNotes').value.trim(),
        date: document.getElementById('wasteDate').value || todayStr()
    };

    var btn = document.getElementById('wfSubmitBtn');
    btnLoading(btn, true);

    try {
        var idV = document.getElementById('wfId').value;
        if (idV) {
            await fsUpdate('waste', idV, data);
            showToast('✅ Waste entry updated!');
        } else {
            await fsAdd('waste', data);
            showToast('✅ Waste entry saved!');
        }
        closeOverlay('wasteFormOverlay');
    } catch (err) {
        console.error('[Waste]', err);
        showToast('❌ Error saving waste', 'error');
    } finally {
        btnLoading(btn, false);
    }
}

function confirmDelWaste(id) {
    if (!canModify()) { showToast('❌ Staff cannot delete', 'error'); return; }
    var w = findInArray(allWaste, id);
    if (!w) return;
    showConfirm('🗑️', 'Delete Waste?',
        w.quantity + ' roti (' + wasteReasonText(w.reason) + ') — Delete?',
        async function() {
            try {
                await fsDelete('waste', id);
                showToast('✅ Waste deleted!');
            } catch (err) { showToast('❌ Error deleting', 'error'); }
        }
    );
}


// ============ CREDIT ============
function loadCredit() {
    var cm = {};
    allCustomers.forEach(function(c) {
        cm[c.id] = { id: c.id, name: c.name, g: 0, r: 0 };
    });

    // ★ FIX: Track walk-in credit separately
    var walkinCredit = { id: '__walkin__', name: '🚶 Walk-in Customers', g: 0, r: 0 };

    allSales.forEach(function(s) {
        if (s.paymentType === 'credit') {
            if (s.customerId) {
                if (!cm[s.customerId]) {
                    // ★ FIX: Deleted customer — use name from sale record
                    cm[s.customerId] = { id: s.customerId, name: s.customerName || 'Unknown', g: 0, r: 0 };
                }
                cm[s.customerId].g += s.total;
            } else {
                // Walk-in credit
                walkinCredit.g += s.total;
            }
        }
    });

    allCreditPayments.forEach(function(p) {
        if (p.customerId && cm[p.customerId]) {
            cm[p.customerId].r += p.amount;
        }
    });

    // Add walk-in if any credit exists
    if (walkinCredit.g > 0) cm['__walkin__'] = walkinCredit;

    var list = Object.values(cm).filter(function(c) { return c.g > 0; });
    list.sort(function(a, b) { return (b.g - b.r) - (a.g - a.r); });

    var tp = 0;
    list.forEach(function(c) { tp += Math.max(0, c.g - c.r); });

    var el = document.getElementById('cTotalPending');
    if (el) el.textContent = '₹' + tp;

    var ct = document.getElementById('creditList');
    if (!ct) return;

    if (!list.length) {
        ct.innerHTML =
            '<div class="empty"><div class="empty-ic">🎉</div><h3>No Pending Credit!</h3>' +
            '<p>All customers have paid up. Great job!</p></div>';
        return;
    }

    var h = '';
    list.forEach(function(c, i) {
        var pending = Math.max(0, c.g - c.r);
        var isCleared = pending === 0;

        h += '<div class="u-card" style="animation-delay:' + (i * 0.04) + 's" ' +
             'onclick="openCreditPay(\'' + c.id + '\')" role="button" tabindex="0">';
        h += '<div class="u-info">';
        h += '<div class="u-name">' + esc(c.name) + '</div>';
        h += '<div class="u-sub">Total: ₹' + c.g + ' • Paid: ₹' + c.r + '</div>';
        h += '</div>';
        h += '<div class="u-amt ' + (isCleared ? 'u-zero' : '') + '">₹' + pending + '</div>';
        h += '</div>';
    });
    ct.innerHTML = h;
}

function openCreditPay(cid) {
    var cust = findInArray(allCustomers, cid);
    var custPayments = allCreditPayments.filter(function(p) { return p.customerId === cid; });

    // Calculate totals
    var g = 0;
    var nameFromSales = '';
    allSales.forEach(function(s) {
        if (s.paymentType === 'credit' && s.customerId === cid) {
            g += s.total;
            if (s.customerName) nameFromSales = s.customerName;
        }
    });
    var r = 0;
    custPayments.forEach(function(p) { r += p.amount; });
    var pending = Math.max(0, g - r);

    // ★ FIX: Resolve name from multiple sources
    var name = cust ? cust.name : nameFromSales;
    if (!name) {
        custPayments.forEach(function(p) {
            if (p.customerName) name = p.customerName;
        });
    }
    if (!name) name = 'Unknown Customer';

    // Handle walk-in credit
    if (cid === '__walkin__') name = '🚶 Walk-in Customers';

    document.getElementById('crpTitle').textContent = name;
    document.getElementById('crpCustId').value = cid;
    document.getElementById('crpCustName').value = name;
    document.getElementById('crpAmount').value = '';
    document.getElementById('crpPay').value = 'cash';

    // Reset payment toggles
    var tg = document.querySelectorAll('#crpForm .tgl');
    tg.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    if (tg[0]) { tg[0].classList.add('active'); tg[0].setAttribute('aria-pressed', 'true'); }

    // Credit summary
    var detailEl = document.getElementById('crpDetail');
    if (detailEl) {
        detailEl.innerHTML =
            '<div class="ud-row"><span class="ud-label">Total Credit</span><span class="ud-val">₹' + g + '</span></div>' +
            '<div class="ud-row"><span class="ud-label">Paid</span><span class="ud-val green">₹' + r + '</span></div>' +
            '<div class="ud-row"><span class="ud-label">Pending</span><span class="ud-val amber">₹' + pending + '</span></div>';
    }

    // Payment history
    var hDiv = document.getElementById('crpHistory');
    if (hDiv) {
        if (!custPayments.length) {
            hDiv.innerHTML = '<div class="no-data">No payments recorded yet</div>';
        } else {
            var histHtml = '';
            custPayments.slice().reverse().forEach(function(p) {
                histHtml += '<div class="aw-item">' +
                    '<span class="aw-item-n">' + fmtDate(p.date) + '</span>' +
                    '<span class="aw-item-v inc">+₹' + p.amount + ' ' +
                    (p.paymentType === 'upi' ? '📱' : '💵') + '</span></div>';
            });
            hDiv.innerHTML = '<div class="aw-card" style="margin:0">' + histHtml + '</div>';
        }
    }

    openOverlay('creditPayOverlay');
}

async function saveCreditPayment(e) {
    e.preventDefault();
    var amt = parseFloat(document.getElementById('crpAmount').value);

    // ★ Validation
    if (!amt || amt <= 0) { showToast('❌ Enter valid amount!', 'error'); return; }

    var btn = document.getElementById('crpSubmitBtn');
    btnLoading(btn, true);

    try {
        await fsAdd('creditPayments', {
            customerId: document.getElementById('crpCustId').value,
            customerName: document.getElementById('crpCustName').value,
            amount: amt,
            paymentType: document.getElementById('crpPay').value,
            date: todayStr()
        });
        showToast('✅ ₹' + amt + ' payment saved!');
        closeOverlay('creditPayOverlay');
    } catch (err) {
        console.error('[Credit]', err);
        showToast('❌ Error saving payment', 'error');
    } finally {
        btnLoading(btn, false);
    }
}


/* ================================================
   END OF PART 2
   Part 3: Reports, Charts, PDF, Settings, Team,
           Import/Export, App Start
   ================================================ */
   /* ================================================
   MERI DUKAAN v4.0 — APP LOGIC (PART 3 of 3)
   Reports, Charts, PDF, Settings, Team,
   Import/Export, App Start
   ================================================ */


// ============ REPORTS ============
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

// ★ FIX: Month overflow when navigating (Jan 31 → Feb = Mar 3 bug)
function changeReportDate(off) {
    var cv = document.getElementById('reportDate').value;
    if (!cv) return;
    var d = new Date(cv + 'T00:00:00');

    if (curReport === 'daily') {
        d.setDate(d.getDate() + off);
    } else if (curReport === 'weekly') {
        d.setDate(d.getDate() + (off * 7));
    } else {
        // ★ FIX: Set to 1st BEFORE changing month to avoid overflow
        d.setDate(1);
        d.setMonth(d.getMonth() + off);
    }

    var t = new Date(); t.setHours(23, 59, 59, 999);
    if (d > t) return;

    var nd = d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(d.getDate());
    setDateInput('reportDate', nd);
    // Don't call updateDateBtn here — loadReport will set the correct format
    loadReport();
}

// ★ FIX: Debounced report loading to prevent flicker on rapid data changes
function loadReport() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(function() {
        _loadReportInternal();
    }, 200);
}

function _loadReportInternal() {
    var date = document.getElementById('reportDate').value;
    if (!date) return;

    var sd, ed, title, btnText;
    var d = new Date(date + 'T00:00:00');
    var mn = ['January','February','March','April','May','June',
              'July','August','September','October','November','December'];

    if (curReport === 'daily') {
        sd = ed = date;
        title = 'Daily Report • ' + fmtDateLong(date);
        btnText = fmtDateBtn(date);
    } else if (curReport === 'weekly') {
        var dy = d.getDay();
        var mon = new Date(d); mon.setDate(d.getDate() - (dy === 0 ? 6 : dy - 1));
        var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        sd = mon.getFullYear() + '-' + S(mon.getMonth() + 1) + '-' + S(mon.getDate());
        ed = sun.getFullYear() + '-' + S(sun.getMonth() + 1) + '-' + S(sun.getDate());
        title = 'Weekly: ' + fmtDate(sd) + ' — ' + fmtDate(ed);
        // ★ FIX: Show week range in date button
        btnText = '📅 ' + fmtDate(sd) + ' — ' + fmtDate(ed);
    } else {
        sd = d.getFullYear() + '-' + S(d.getMonth() + 1) + '-01';
        var ld = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        ed = d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(ld);
        title = mn[d.getMonth()] + ' ' + d.getFullYear();
        // ★ FIX: Show month name in date button
        btnText = '📅 ' + mn[d.getMonth()] + ' ' + d.getFullYear();
    }

    // ★ FIX: Set correct date button format based on report type
    var dateBtn = document.getElementById('reportDateBtn');
    if (dateBtn) dateBtn.textContent = btnText;

    // Filter data for period
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

    // Save for PDF generation
    rptData = {
        title: title, sd: sd, ed: ed,
        tR: tR, tI: tI, tE: tE, profit: profit,
        cI: cI, uI: uI, hI: hI, uRec: uRec,
        cS: cS, cE: cE, wQ: wQ
    };

    // Build report HTML
    var h = '';

    // Title card
    h += '<div class="rp-card"><div class="rp-title">' + esc(title) + '</div></div>';

    // Profit hero
    h += '<div class="rp-card"><div class="rp-hero">';
    h += '<div class="rp-hero-v ' + (profit >= 0 ? 'green' : 'red') + '">';
    h += (profit >= 0 ? '₹' : '-₹') + Math.abs(profit);
    h += '</div><div class="rp-hero-l">Net Profit</div>';
    h += '</div></div>';

    // Summary table
    h += '<div class="rp-card"><div class="rp-title">📋 Summary</div>';
    var rows = [
        ['Total Roti Sold', tR, ''],
        ['Total Income', '₹' + tI, 'green'],
        ['Cash Income', '₹' + cI, ''],
        ['UPI Income', '₹' + uI, ''],
        ['Credit Given', '₹' + hI, 'amber'],
        ['Credit Recovered', '₹' + uRec, 'green'],
        ['Total Expense', '₹' + tE, 'red'],
        ['Waste', wQ + ' roti', 'amber'],
        ['Net Profit', (profit >= 0 ? '₹' : '-₹') + Math.abs(profit), profit >= 0 ? 'green' : 'red']
    ];
    rows.forEach(function(r) {
        h += '<div class="rp-row">';
        h += '<span class="rp-lbl">' + r[0] + '</span>';
        h += '<span class="rp-val ' + r[2] + '">' + r[1] + '</span>';
        h += '</div>';
    });
    h += '</div>';

    // Customer-wise sales
    var ca = Object.keys(cS);
    if (ca.length) {
        h += '<div class="rp-card"><div class="rp-title">👥 Customer Wise Sales</div>';
        ca.sort(function(a, b) { return cS[b].a - cS[a].a; });
        ca.forEach(function(n) {
            h += '<div class="rp-row">';
            h += '<span class="rp-lbl">' + esc(n) + ' (' + cS[n].r + ')</span>';
            h += '<span class="rp-val">₹' + cS[n].a + '</span>';
            h += '</div>';
        });
        h += '</div>';
    }

    // Expense breakdown
    var ea = Object.keys(cE);
    if (ea.length) {
        h += '<div class="rp-card"><div class="rp-title">🛒 Expense Breakdown</div>';
        ea.sort(function(a, b) { return cE[b] - cE[a]; });
        ea.forEach(function(cn) {
            var pct = tE > 0 ? Math.round(cE[cn] / tE * 100) : 0;
            h += '<div class="rp-row">';
            h += '<span class="rp-lbl">' + esc(cn) + ' (' + pct + '%)</span>';
            h += '<span class="rp-val red">₹' + cE[cn] + '</span>';
            h += '</div>';
        });
        h += '</div>';
    }

    var contentEl = document.getElementById('reportContent');
    if (contentEl) contentEl.innerHTML = h;

    // ★ FIX: Delay chart rendering for screen animation
    setTimeout(function() {
        renderCharts(sd, ed);
    }, 150);
}


// ============ CHARTS ============
function renderCharts(sd, ed) {
    // ★ Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        var section = document.getElementById('chartSection');
        if (section) {
            section.innerHTML =
                '<div class="chart-card"><div class="chart-empty">📊 Charts unavailable (offline or loading)</div></div>';
        }
        return;
    }

    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    var textColor = isDark ? '#a0a0a0' : '#666';

    renderSalesChart(sd, ed, gridColor, textColor, isDark);
    renderExpenseChart(sd, ed, textColor, isDark);
}

function renderSalesChart(sd, ed, gridColor, textColor, isDark) {
    var ctx = document.getElementById('salesChart');
    if (!ctx) return;

    // Build data by day
    var salesByDay = {};
    var d = new Date(sd + 'T00:00:00');
    var end = new Date(ed + 'T00:00:00');

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
        // ★ FIX: Destroy previous chart instance first
        if (salesChart) { salesChart.destroy(); salesChart = null; }

        // Check canvas is visible and has dimensions
        var parent = ctx.parentElement;
        if (!parent || parent.offsetHeight === 0) return;

        salesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales (₹)',
                    data: values,
                    backgroundColor: 'rgba(230, 81, 0, 0.7)',
                    hoverBackgroundColor: 'rgba(230, 81, 0, 0.9)',
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#333' : '#fff',
                        titleColor: isDark ? '#fff' : '#333',
                        bodyColor: isDark ? '#ccc' : '#666',
                        borderColor: isDark ? '#555' : '#ddd',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                return '₹' + context.parsed.y;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { size: 10 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { size: 9 }, maxRotation: 45 }
                    }
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

    // Build expense by category
    var expByCat = {};
    dataInRange(allExpenses, sd, ed).forEach(function(e) {
        var cat = catNm(e.category);
        expByCat[cat] = (expByCat[cat] || 0) + e.amount;
    });

    var eLabels = Object.keys(expByCat);
    var eValues = Object.values(expByCat);

    // ★ FIX: Destroy previous chart
    if (expenseChart) { expenseChart.destroy(); expenseChart = null; }

    // ★ FIX: Show message if no expense data
    if (!eValues.length || !eValues.some(function(v) { return v > 0; })) {
        // Reset the card with canvas + empty message
        cardEl.innerHTML =
            '<h4 class="chart-title">🥧 Expense Breakdown</h4>' +
            '<div class="chart-empty">No expenses in this period</div>';
        return;
    }

    // Make sure canvas exists (might have been replaced by empty message)
    if (!cardEl.querySelector('canvas')) {
        cardEl.innerHTML =
            '<h4 class="chart-title">🥧 Expense Breakdown</h4>' +
            '<div class="chart-wrap chart-sm"><canvas id="expenseChart"></canvas></div>';
        ctx = document.getElementById('expenseChart');
    }

    try {
        var parent = ctx.parentElement;
        if (!parent || parent.offsetHeight === 0) return;

        var colors = ['#e65100', '#ff8f00', '#f44336', '#7c4dff', '#2196f3', '#00c853', '#ff5722'];

        expenseChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: eLabels,
                datasets: [{
                    data: eValues,
                    backgroundColor: colors.slice(0, eLabels.length),
                    hoverOffset: 6,
                    borderWidth: 2,
                    borderColor: isDark ? '#1e1e1e' : '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600, easing: 'easeOutQuart' },
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: { size: 11, weight: 600 },
                            padding: 12,
                            usePointStyle: true,
                            pointStyleWidth: 10
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#333' : '#fff',
                        titleColor: isDark ? '#fff' : '#333',
                        bodyColor: isDark ? '#ccc' : '#666',
                        borderColor: isDark ? '#555' : '#ddd',
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


// ============ PDF REPORT ============
function generatePDF() {
    // Check if jsPDF loaded
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
        if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.textContent = '⏳ Generating PDF...'; }

        var W = 210, mL = 14, mR = 14, cW = W - mL - mR;

        // === HEADER ===
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

        // === PROFIT BOX ===
        var pc = rd.profit >= 0 ? [0, 150, 50] : [200, 40, 40];
        doc.setFillColor(pc[0], pc[1], pc[2]);
        doc.roundedRect(mL, y, cW, 18, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text('NET PROFIT', mL + 8, y + 8);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Rs. ' + Math.abs(rd.profit) + (rd.profit < 0 ? ' (Loss)' : ''),
                 W - mR - 8, y + 13, { align: 'right' });
        y += 26;

        // === SUMMARY TABLE ===
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
            columnStyles: {
                0: { cellWidth: cW * 0.6 },
                1: { cellWidth: cW * 0.4, halign: 'right', fontStyle: 'bold' }
            }
        });
        y = doc.lastAutoTable.finalY + 10;

        // === CUSTOMER TABLE ===
        var ca = Object.keys(rd.cS);
        if (ca.length) {
            if (y > 240) { doc.addPage(); y = 20; }
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(230, 81, 0);
            doc.text('CUSTOMER WISE SALES', mL, y);
            y += 3;

            ca.sort(function(a, b) { return rd.cS[b].a - rd.cS[a].a; });
            var cBody = ca.map(function(n) {
                return [n, rd.cS[n].r.toString(), 'Rs. ' + rd.cS[n].a];
            });

            doc.autoTable({
                startY: y,
                margin: { left: mL, right: mR },
                head: [['Customer', 'Roti', 'Amount']],
                body: cBody,
                theme: 'striped',
                headStyles: { fillColor: [26, 26, 46], textColor: 255, fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 9 },
                columnStyles: {
                    0: { cellWidth: cW * 0.45 },
                    1: { cellWidth: cW * 0.2, halign: 'center' },
                    2: { cellWidth: cW * 0.35, halign: 'right', fontStyle: 'bold' }
                }
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // === EXPENSE TABLE ===
        var ea = Object.keys(rd.cE);
        if (ea.length) {
            if (y > 240) { doc.addPage(); y = 20; }
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(200, 40, 40);
            doc.text('EXPENSE BREAKDOWN', mL, y);
            y += 3;

            ea.sort(function(a, b) { return rd.cE[b] - rd.cE[a]; });
            var eBody = ea.map(function(cn) {
                var pct = rd.tE > 0 ? Math.round(rd.cE[cn] / rd.tE * 100) : 0;
                return [cn, pct + '%', 'Rs. ' + rd.cE[cn]];
            });

            doc.autoTable({
                startY: y,
                margin: { left: mL, right: mR },
                head: [['Category', '%', 'Amount']],
                body: eBody,
                theme: 'striped',
                headStyles: { fillColor: [200, 40, 40], textColor: 255, fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 9 },
                columnStyles: {
                    0: { cellWidth: cW * 0.45 },
                    1: { cellWidth: cW * 0.2, halign: 'center' },
                    2: { cellWidth: cW * 0.35, halign: 'right', fontStyle: 'bold' }
                }
            });
        }

        // === FOOTER ON ALL PAGES ===
        var totalPages = doc.internal.getNumberOfPages();
        for (var i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFillColor(245, 245, 245);
            doc.rect(0, 287, W, 10, 'F');
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'normal');
            doc.text('Meri Dukaan v4.0 — Business Report', mL, 292);
            doc.text('Page ' + i + '/' + totalPages, W - mR, 292, { align: 'right' });
        }

        // Save
        doc.save('MeriDukaan_' + curReport + '_' + todayStr() + '.pdf');
        showToast('✅ PDF downloaded!');

    } catch (err) {
        console.error('[PDF]', err);
        showToast('❌ PDF generation failed!', 'error');
    } finally {
        var pdfBtn2 = document.querySelector('.pdf-btn');
        if (pdfBtn2) { pdfBtn2.disabled = false; pdfBtn2.textContent = '📄 Download PDF Report'; }
    }
}


// ============ SETTINGS ============
function loadSettings() {
    if (currentUser) {
        var avatar = document.getElementById('suAvatar');
        if (avatar) {
            if (currentUser.photoURL) {
                avatar.src = currentUser.photoURL;
                avatar.style.display = '';
            } else {
                avatar.style.display = 'none';
            }
        }
        var el;
        el = document.getElementById('suName');
        if (el) el.textContent = currentUser.displayName || 'User';
        el = document.getElementById('suEmail');
        if (el) el.textContent = currentUser.email;
        el = document.getElementById('suRole');
        if (el) el.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
    }

    updateThemeUI();
    updateSyncStatus();

    // Show app version
    var versionEl = document.getElementById('appVersionText');
    if (versionEl) {
        versionEl.textContent = 'v4.0 • PWA • ' + (navigator.onLine ? 'Online' : 'Offline');
    }
}

function updateSyncStatus() {
    var dot = document.getElementById('syncDot');
    var status = document.getElementById('syncStatus');
    if (!dot || !status) return;

    if (navigator.onLine) {
        dot.className = 'sync-dot online';
        status.textContent = 'Connected • Real-time sync active';
    } else {
        dot.className = 'sync-dot offline';
        status.textContent = 'Offline • Changes will sync when online';
    }
}

// Listen for online/offline changes
window.addEventListener('online', function() {
    updateSyncStatus();
    if (isScreenActive('settingScreen')) loadSettings();
});
window.addEventListener('offline', function() {
    updateSyncStatus();
    if (isScreenActive('settingScreen')) loadSettings();
});


// ============ CHANGE PIN ============
function showChangePinUI() {
    if (!canModify() && userRole !== 'admin') {
        showToast('❌ Only owner/admin can change PIN', 'error');
        return;
    }
    document.getElementById('chpOld').value = '';
    document.getElementById('chpNew').value = '';
    document.getElementById('chpConfirm').value = '';
    openOverlay('changePinOverlay');
}

async function saveNewPin(e) {
    e.preventDefault();
    var old = document.getElementById('chpOld').value;
    var nw = document.getElementById('chpNew').value;
    var cf = document.getElementById('chpConfirm').value;

    // Verify current PIN
    var sv = '';
    try { sv = atob(localStorage.getItem('mdPin') || ''); } catch (er) {}
    if (old !== sv) {
        showToast('❌ Current PIN is wrong!', 'error');
        return;
    }

    // Validate new PIN
    if (nw.length !== 4 || !/^\d{4}$/.test(nw)) {
        showToast('❌ PIN must be exactly 4 digits!', 'error');
        return;
    }
    if (nw !== cf) {
        showToast('❌ New PINs do not match!', 'error');
        return;
    }
    if (nw === old) {
        showToast('❌ New PIN must be different!', 'error');
        return;
    }

    var btn = document.getElementById('chpSubmitBtn');
    btnLoading(btn, true);

    var encoded = btoa(nw);
    try {
        await businessRef.update({ pin: encoded });
        localStorage.setItem('mdPin', encoded);
        showToast('✅ PIN changed successfully!');
        closeOverlay('changePinOverlay');
    } catch (err) {
        console.error('[PIN]', err);
        showToast('❌ Error saving PIN', 'error');
    } finally {
        btnLoading(btn, false);
    }
}


// ============ TEAM MANAGEMENT ============
function openTeamManager() {
    if (userRole === 'staff') {
        showToast('❌ Only owner/admin can manage team', 'error');
        return;
    }
    openOverlay('teamOverlay');
    document.getElementById('addMemberForm').style.display = 'none';
    loadTeamMembers();
}

async function loadTeamMembers() {
    try {
        var doc = await businessRef.get();
        var data = doc.data();
        var members = data.members || [];
        var ct = document.getElementById('teamMemberList');
        if (!ct) return;

        // Owner card (always first)
        var h = '<div class="team-card">';
        h += '<div class="tc-avatar">👑</div>';
        h += '<div class="tc-info">';
        h += '<h4>' + esc(data.ownerName || data.ownerEmail) + '</h4>';
        h += '<p>' + esc(data.ownerEmail) + '</p>';
        h += '</div>';
        h += '<span class="tc-role">Owner</span>';
        h += '</div>';

        // Team member cards
        members.forEach(function(m, i) {
            h += '<div class="team-card">';
            h += '<div class="tc-avatar">👤</div>';
            h += '<div class="tc-info">';
            h += '<h4>' + esc(m.email) + '</h4>';
            h += '<p>Role: ' + (m.role === 'admin' ? 'Admin' : 'Staff') +
                 (m.addedAt ? ' • Added: ' + m.addedAt : '') + '</p>';
            h += '</div>';
            h += '<span class="tc-role ' + (m.role === 'staff' ? 'staff' : '') + '">';
            h += (m.role === 'admin' ? '👑 Admin' : '👤 Staff');
            h += '</span>';

            // Only owner can remove members
            if (userRole === 'owner') {
                h += '<button class="tc-remove" onclick="removeTeamMember(' + i + ')" aria-label="Remove member">❌</button>';
            }
            h += '</div>';
        });

        // Empty state
        if (!members.length) {
            h += '<div class="no-data" style="margin-top:12px">No team members added yet</div>';
        }

        ct.innerHTML = h;
    } catch (err) {
        console.error('[Team]', err);
        showToast('❌ Error loading team', 'error');
    }
}

function showAddMember() {
    var formEl = document.getElementById('addMemberForm');
    if (formEl) formEl.style.display = 'block';
    document.getElementById('tmEmail').value = '';
    document.getElementById('tmRole').value = 'admin';

    // Reset toggles
    var tg = document.querySelectorAll('#teamOverlay .tgl');
    tg.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    if (tg[0]) { tg[0].classList.add('active'); tg[0].setAttribute('aria-pressed', 'true'); }

    setTimeout(function() {
        var emailEl = document.getElementById('tmEmail');
        if (emailEl) emailEl.focus();
    }, 300);
}

async function addTeamMember(e) {
    e.preventDefault();
    var email = document.getElementById('tmEmail').value.trim().toLowerCase();
    var role = document.getElementById('tmRole').value;

    // Validation
    if (!email) { showToast('❌ Enter email address!', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('❌ Enter valid email!', 'error');
        return;
    }

    var btn = document.getElementById('tmSubmitBtn');
    btnLoading(btn, true);

    try {
        var doc = await businessRef.get();
        var data = doc.data();
        var members = data.members || [];
        var memberEmails = data.memberEmails || [];

        // Check duplicates
        if (email === (data.ownerEmail || '').toLowerCase()) {
            showToast('❌ This is the owner email!', 'error');
            return;
        }
        if (memberEmails.indexOf(email) !== -1) {
            showToast('❌ Already a team member!', 'error');
            return;
        }

        members.push({ email: email, role: role, addedAt: todayStr() });
        memberEmails.push(email);

        await businessRef.update({ members: members, memberEmails: memberEmails });

        document.getElementById('addMemberForm').style.display = 'none';
        showToast('✅ ' + email + ' added as ' + role + '!');
        loadTeamMembers();
    } catch (err) {
        console.error('[Team]', err);
        showToast('❌ Error adding member', 'error');
    } finally {
        btnLoading(btn, false);
    }
}

function removeTeamMember(index) {
    showConfirm('❌', 'Remove Member?',
        'This person will lose access to your data.',
        async function() {
            try {
                var doc = await businessRef.get();
                var data = doc.data();
                var members = data.members || [];
                var memberEmails = data.memberEmails || [];

                if (index >= 0 && index < members.length) {
                    var email = members[index].email;
                    members.splice(index, 1);
                    var ei = memberEmails.indexOf(email);
                    if (ei !== -1) memberEmails.splice(ei, 1);

                    await businessRef.update({ members: members, memberEmails: memberEmails });
                    showToast('✅ Member removed');
                    loadTeamMembers();
                }
            } catch (err) {
                console.error('[Team]', err);
                showToast('❌ Error removing member', 'error');
            }
        }
    );
}


// ============ DATA EXPORT ============
async function exportData() {
    var exportBtn = document.querySelector('[onclick="exportData()"]');
    if (exportBtn) exportBtn.style.pointerEvents = 'none';

    try {
        var data = {
            app: 'MeriDukaan',
            version: '4.0',
            exportDate: new Date().toISOString(),
            customers: allCustomers.map(cleanForExport),
            sales: allSales.map(cleanForExport),
            expenses: allExpenses.map(cleanForExport),
            waste: allWaste.map(cleanForExport),
            creditPayments: allCreditPayments.map(cleanForExport)
        };

        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'MeriDukaan_Backup_' + todayStr() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('✅ Backup downloaded!');
    } catch (err) {
        console.error('[Export]', err);
        showToast('❌ Export failed', 'error');
    } finally {
        if (exportBtn) exportBtn.style.pointerEvents = '';
    }
}


// ============ DATA IMPORT ============
function importData(e) {
    var file = e.target.files[0];
    if (!file) return;

    if (userRole === 'staff') {
        showToast('❌ Staff cannot import data', 'error');
        e.target.value = '';
        return;
    }

    showConfirm('📥', 'Import Data?',
        'This will REPLACE all current data. Download backup first!',
        function() {
            var reader = new FileReader();
            reader.onload = async function(ev) {
                try {
                    var data = JSON.parse(ev.target.result);

                    // Validate file structure
                    if (!data.customers && !data.sales) {
                        showToast('❌ Invalid backup file!', 'error');
                        return;
                    }

                    showToast('⏳ Importing data...', 'success');

                    // Clear all existing collections
                    await deleteCollection('customers');
                    await deleteCollection('sales');
                    await deleteCollection('expenses');
                    await deleteCollection('waste');
                    await deleteCollection('creditPayments');

                    // Import customers — build ID mapping
                    var custIdMap = {};
                    var custs = data.customers || [];
                    for (var i = 0; i < custs.length; i++) {
                        var c = Object.assign({}, custs[i]);
                        var oldId = c.id;
                        delete c.id;
                        // Clean timestamps
                        if (c.createdAt && typeof c.createdAt === 'string') {
                            delete c.createdAt; // Will be set by fsAdd
                        }
                        var ref = await businessRef.collection('customers').add(c);
                        if (oldId) custIdMap[oldId] = ref.id;
                    }

                    // Import sales
                    var sales = data.sales || [];
                    for (var j = 0; j < sales.length; j++) {
                        var s = Object.assign({}, sales[j]);
                        delete s.id;

                        // ★ FIX: Map customer ID, handle deleted customers
                        if (s.customerId) {
                            if (custIdMap[s.customerId]) {
                                s.customerId = custIdMap[s.customerId];
                            } else {
                                // Old customer was deleted — keep name but clear invalid ID
                                s.customerId = '';
                            }
                        }

                        // v3 compatibility
                        if (s.paymentType === 'udhari') s.paymentType = 'credit';
                        if (!s.saleType) s.saleType = 'regular';

                        if (s.createdAt && typeof s.createdAt === 'string') delete s.createdAt;
                        await businessRef.collection('sales').add(s);
                    }

                    // Import expenses
                    var exps = data.expenses || [];
                    for (var k = 0; k < exps.length; k++) {
                        var x = Object.assign({}, exps[k]);
                        delete x.id;
                        if (x.createdAt && typeof x.createdAt === 'string') delete x.createdAt;
                        await businessRef.collection('expenses').add(x);
                    }

                    // Import waste
                    var wastes = data.waste || [];
                    for (var w = 0; w < wastes.length; w++) {
                        var wt = Object.assign({}, wastes[w]);
                        delete wt.id;
                        if (wt.createdAt && typeof wt.createdAt === 'string') delete wt.createdAt;
                        await businessRef.collection('waste').add(wt);
                    }

                    // Import credit payments (v3: udhariPayments, v4: creditPayments)
                    var pays = data.creditPayments || data.udhariPayments || [];
                    for (var p = 0; p < pays.length; p++) {
                        var py = Object.assign({}, pays[p]);
                        delete py.id;

                        // ★ FIX: Map customer ID for payments too
                        if (py.customerId) {
                            if (custIdMap[py.customerId]) {
                                py.customerId = custIdMap[py.customerId];
                            } else {
                                py.customerId = '';
                            }
                        }

                        if (py.createdAt && typeof py.createdAt === 'string') delete py.createdAt;
                        await businessRef.collection('creditPayments').add(py);
                    }

                    showToast('✅ Data imported successfully! (' +
                        custs.length + ' customers, ' +
                        sales.length + ' sales)');

                } catch (err) {
                    console.error('[Import]', err);
                    showToast('❌ Import failed: ' + (err.message || 'Unknown error'), 'error');
                }
            };
            reader.readAsText(file);
        }
    );
    e.target.value = '';
}

// ★ FIX: Error handling for batch delete
async function deleteCollection(colName) {
    try {
        var snap = await businessRef.collection(colName).get();
        var docs = snap.docs;
        if (!docs.length) return;

        // Firestore batch limit is 500, we use 400 for safety
        for (var i = 0; i < docs.length; i += 400) {
            var batch = fdb.batch();
            docs.slice(i, i + 400).forEach(function(doc) {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
        console.log('[Delete] ' + colName + ': ' + docs.length + ' docs removed');
    } catch (err) {
        console.error('[Delete] Error in ' + colName + ':', err);
        throw err; // Propagate so caller knows
    }
}


// ============ RESET ALL DATA ============
function resetAllData() {
    if (userRole === 'staff') {
        showToast('❌ Only owner can delete all data', 'error');
        return;
    }

    showConfirm('🗑️', 'DELETE ALL DATA?',
        'All data will be permanently removed. This CANNOT be undone! Download backup first.',
        async function() {
            try {
                showToast('⏳ Deleting all data...', 'success');
                await deleteCollection('customers');
                await deleteCollection('sales');
                await deleteCollection('expenses');
                await deleteCollection('waste');
                await deleteCollection('creditPayments');
                showToast('✅ All data deleted!');

                // Refresh current screen
                if (isScreenActive('dashboardScreen')) refreshDash();
                else if (isScreenActive('settingScreen')) goTo('dashboardScreen');
            } catch (err) {
                console.error('[Reset]', err);
                showToast('❌ Error deleting data', 'error');
            }
        }
    );
}


// ============ APP START ============
function startApp() {
    console.log('🫓 Meri Dukaan v4.0 Starting...');
    applyTheme();

    // ★ FIX: Race condition — splash + auth sync
    var splashDone = false;
    var authReady = false;
    var pendingUser = null;

    function proceed() {
        if (!splashDone || !authReady) return;

        if (pendingUser) {
            handleAuthenticated(pendingUser);
        } else {
            goTo('loginScreen');
            // Reset login button
            var btn = document.getElementById('googleBtn');
            if (btn) {
                btn.disabled = false;
                var span = btn.querySelector('span');
                if (span) span.textContent = 'Sign in with Google';
            }
        }
    }

    // Splash timer (minimum 1.5s for brand visibility)
    setTimeout(function() {
        splashDone = true;
        proceed();
    }, 1500);

    // Handle redirect result (for PWA)
    auth.getRedirectResult().then(function(result) {
        // If user came from redirect, onAuthStateChanged handles it
    }).catch(function(err) {
        if (err.code && err.code !== 'auth/popup-closed-by-user') {
            console.warn('[Auth] Redirect:', err.message || err);
        }
    });

    // Main auth listener
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
    '%c🫓 Meri Dukaan v4.0 %c Cloud-powered Business Management ',
    'background:#e65100;color:white;padding:8px 12px;border-radius:8px 0 0 8px;font-weight:bold;font-size:14px',
    'background:#1a1a2e;color:white;padding:8px 12px;border-radius:0 8px 8px 0;font-size:14px'
);