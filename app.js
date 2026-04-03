/* ================================================
   MERI DUKAAN v4.0 - APP LOGIC (PART 1 of 2)
   Firebase, Auth, Core Infrastructure
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

// Enable offline support
fdb.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
    if (err.code === 'failed-precondition') {
        console.log('Persistence: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.log('Persistence: Browser not supported');
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
var splashDone = false;
var authResult = null;


// ============ UTILITIES ============
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || 'success');
    clearTimeout(t._tm);
    t._tm = setTimeout(function() { t.className = 'toast'; }, 2500);
}

function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(d.getDate());
}

function S(n) { return n < 10 ? '0' + n : '' + n; }

function fmtDate(s) {
    if (!s) return '';
    var p = s.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
}

function fmtDateLong(s) {
    if (!s) return '';
    var d = new Date(s + 'T00:00:00');
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
}

function fmtDateBtn(s) {
    if (!s) return 'Select Date';
    var d = new Date(s + 'T00:00:00');
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var today = todayStr();
    if (s === today) return '📅 Today, ' + d.getDate() + ' ' + m[d.getMonth()];
    var yd = new Date();
    yd.setDate(yd.getDate() - 1);
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
    return { atta: '🌾', oil: '🛢️', gas: '🔥', poly: '🛍️', other: '📦' }[c] || '📦';
}

function catNm(c) {
    return { atta: 'Atta', oil: 'Oil', gas: 'Gas Cylinder', poly: 'Polythene', other: 'Other' }[c] || c;
}

function payBdg(p) {
    if (p === 'cash') return { t: '💵 Cash', c: 'slb-c' };
    if (p === 'upi') return { t: '📱 UPI', c: 'slb-u' };
    return { t: '💳 Credit', c: 'slb-h' };
}

function wasteReasonText(r) {
    return { burnt: '🔥 Burnt', extra: '📦 Extra Made', returned: '↩️ Returned', other: '❓ Other' }[r] || r;
}

function dateShift(ds, off) {
    var d = new Date(ds + 'T00:00:00');
    d.setDate(d.getDate() + off);
    var t = new Date();
    t.setHours(23, 59, 59, 999);
    if (d > t) return null;
    return d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(d.getDate());
}

function getDateRange(period) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
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

function isScreenActive(id) {
    var el = document.getElementById(id);
    return el && el.classList.contains('active');
}


// ============ THEME / DARK MODE ============
function applyTheme() {
    var theme = currentTheme;
    if (theme === 'auto') {
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    updateThemeUI();
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

    var el1 = document.getElementById('themeTogBtn');
    if (el1) el1.textContent = icon;
    var el2 = document.getElementById('setThemeIc');
    if (el2) el2.textContent = icon;
    var el3 = document.getElementById('setThemeLabel');
    if (el3) el3.textContent = label;
    var el4 = document.getElementById('setThemeBadge');
    if (el4) el4.textContent = badge;
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (currentTheme === 'auto') applyTheme();
});

// Apply theme immediately on load
applyTheme();


// ============ FIREBASE AUTH ============
function googleSignIn() {
    var btn = document.getElementById('googleBtn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Signing in...';

    var provider = new firebase.auth.GoogleAuthProvider();

    // PWA uses redirect, browser uses popup
    var isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true;

    if (isPWA) {
        auth.signInWithRedirect(provider);
    } else {
        auth.signInWithPopup(provider).then(function() {
            // onAuthStateChanged handles the rest
        }).catch(function(error) {
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
            currentUser = null;
            businessId = null;
            businessRef = null;
            allCustomers = [];
            allSales = [];
            allExpenses = [];
            allWaste = [];
            allCreditPayments = [];
            goTo('loginScreen');
            showToast('✅ Signed out');
        });
    });
}

function signOutAndLogin() {
    unsubscribers.forEach(function(u) { u(); });
    unsubscribers = [];
    auth.signOut().then(function() {
        currentUser = null;
        businessId = null;
        businessRef = null;
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
            // User is the owner
            businessId = ownerSnap.docs[0].id;
            userRole = 'owner';
        } else {
            // Check if user is a team member
            var memberSnap = await fdb.collection('businesses')
                .where('memberEmails', 'array-contains', user.email.toLowerCase()).get();

            if (!memberSnap.empty) {
                // User is a team member
                businessId = memberSnap.docs[0].id;
                var bData = memberSnap.docs[0].data();
                var member = (bData.members || []).find(function(m) {
                    return m.email.toLowerCase() === user.email.toLowerCase();
                });
                userRole = member ? member.role : 'staff';
            } else {
                // New user — create new business
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

        // Start real-time listeners
        setupListeners();

        // Check if PIN exists
        var bizDoc = await businessRef.get();
        var bizData = bizDoc.data();

        if (!bizData.pin) {
            // First time — create PIN
            goTo('pinSetupScreen');
        } else {
            // Cache PIN for offline
            localStorage.setItem('mdPin', bizData.pin);
            goTo('pinLoginScreen');

            // Show user info on PIN screen
            var pinUser = document.getElementById('pinUserInfo');
            if (pinUser) {
                var img = user.photoURL ? '<img src="' + user.photoURL + '">' : '';
                pinUser.innerHTML = img + '<span>' + esc(user.email) + '</span>';
            }
        }
    } catch (err) {
        console.error('Auth setup error:', err);
        showToast('❌ Connection error. Try again.', 'error');

        // Reset login button
        var btn = document.getElementById('googleBtn');
        if (btn) {
            btn.disabled = false;
            btn.querySelector('span').textContent = 'Sign in with Google';
        }
        goTo('loginScreen');
    }
}


// ============ REAL-TIME LISTENERS ============
function setupListeners() {
    // Clear old listeners
    unsubscribers.forEach(function(u) { u(); });
    unsubscribers = [];
    if (!businessRef) return;

    // Customers — real-time sync
    unsubscribers.push(
        businessRef.collection('customers').orderBy('name').onSnapshot(function(snap) {
            allCustomers = [];
            snap.forEach(function(doc) {
                allCustomers.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('customerScreen')) loadCusts();
            if (isScreenActive('quickSaleScreen')) loadQuickSale();
        }, function(err) { console.error('Customers sync:', err); })
    );

    // Sales — real-time sync
    unsubscribers.push(
        businessRef.collection('sales').onSnapshot(function(snap) {
            allSales = [];
            snap.forEach(function(doc) {
                allSales.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('salesScreen')) loadSales();
            if (isScreenActive('dashboardScreen')) refreshDash();
            if (isScreenActive('quickSaleScreen')) loadQuickSale();
            if (isScreenActive('creditScreen')) loadCredit();
        }, function(err) { console.error('Sales sync:', err); })
    );

    // Expenses — real-time sync
    unsubscribers.push(
        businessRef.collection('expenses').onSnapshot(function(snap) {
            allExpenses = [];
            snap.forEach(function(doc) {
                allExpenses.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('expenseScreen')) loadExps();
            if (isScreenActive('dashboardScreen')) refreshDash();
        }, function(err) { console.error('Expenses sync:', err); })
    );

    // Waste — real-time sync
    unsubscribers.push(
        businessRef.collection('waste').onSnapshot(function(snap) {
            allWaste = [];
            snap.forEach(function(doc) {
                allWaste.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('wasteScreen')) loadWasteList();
            if (isScreenActive('dashboardScreen')) refreshDash();
        }, function(err) { console.error('Waste sync:', err); })
    );

    // Credit Payments — real-time sync
    unsubscribers.push(
        businessRef.collection('creditPayments').onSnapshot(function(snap) {
            allCreditPayments = [];
            snap.forEach(function(doc) {
                allCreditPayments.push(Object.assign({ id: doc.id }, doc.data()));
            });
            if (isScreenActive('creditScreen')) loadCredit();
            if (isScreenActive('dashboardScreen')) refreshDash();
        }, function(err) { console.error('Credit sync:', err); })
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

function fsGet(col, docId) {
    return businessRef.collection(col).doc(docId).get().then(function(doc) {
        return doc.exists ? Object.assign({ id: doc.id }, doc.data()) : null;
    });
}

// Local array filters (no network needed)
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


// ============ PIN SYSTEM ============
function buildPad(cid, onD, onB) {
    var c = document.getElementById(cid);
    c.innerHTML = '';
    '1,2,3,4,5,6,7,8,9,,0,⌫'.split(',').forEach(function(k) {
        var b = document.createElement('button');
        b.className = 'pin-key' + (k === '' ? ' empty' : '');
        b.textContent = k;
        if (k === '⌫') b.onclick = onB;
        else if (k !== '') b.onclick = function() { onD(k); };
        c.appendChild(b);
    });
}

function setDots(did, len) {
    document.querySelectorAll('#' + did + ' i').forEach(function(d, i) {
        d.className = i < len ? 'filled' : '';
    });
}

function pinErr(did, eid, msg) {
    document.querySelectorAll('#' + did + ' i').forEach(function(d) {
        d.className = 'error';
    });
    document.getElementById(eid).textContent = msg;
    if (navigator.vibrate) navigator.vibrate(200);
    setTimeout(function() {
        document.querySelectorAll('#' + did + ' i').forEach(function(d) {
            d.className = '';
        });
        document.getElementById(eid).textContent = '';
    }, 800);
}

function initSetup() {
    pinIn = '';
    setDots('setupDots', 0);
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
    buildPad('confirmPad', function(d) {
        if (pinIn.length < 4) {
            pinIn += d;
            setDots('confirmDots', pinIn.length);
            if (pinIn.length === 4) {
                if (pinIn === pin1) {
                    // Save PIN to cloud
                    var encoded = btoa(pinIn);
                    businessRef.update({ pin: encoded }).then(function() {
                        localStorage.setItem('mdPin', encoded);
                        pinIn = '';
                        pin1 = '';
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
    buildPad('loginPad', function(d) {
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
    var check = function(encoded) {
        var sv = '';
        try { sv = atob(encoded || ''); } catch (e) {}
        if (entered === sv) {
            pinIn = '';
            setTimeout(function() { goTo('dashboardScreen'); }, 200);
        } else {
            pinIn = '';
            pinErr('loginDots', 'loginErr', 'Wrong PIN!');
        }
    };

    // Try cloud first, fallback to local cache
    if (businessRef) {
        businessRef.get().then(function(doc) {
            if (doc.exists) {
                check(doc.data().pin);
            } else {
                check(localStorage.getItem('mdPin'));
            }
        }).catch(function() {
            check(localStorage.getItem('mdPin'));
        });
    } else {
        check(localStorage.getItem('mdPin'));
    }
}


// ============ NAVIGATION ============
var authScreens = ['splashScreen', 'loginScreen', 'pinSetupScreen', 'pinConfirmScreen', 'pinLoginScreen'];

function goTo(id) {
    document.querySelectorAll('.screen').forEach(function(s) {
        s.classList.remove('active');
    });
    document.getElementById(id).classList.add('active');

    // Show/hide bottom nav
    var nav = document.getElementById('bottomNav');
    nav.classList.toggle('show', authScreens.indexOf(id) === -1);

    // Highlight active nav button
    document.querySelectorAll('.bn-i').forEach(function(n) {
        n.classList.toggle('active', n.dataset.s === id);
    });

    // Screen-specific initialization (Part 2 functions)
    switch (id) {
        case 'pinSetupScreen': initSetup(); break;
        case 'pinConfirmScreen': initConfirm(); break;
        case 'pinLoginScreen': initLogin(); break;
        case 'dashboardScreen': if (typeof refreshDash === 'function') refreshDash(); break;
        case 'customerScreen': if (typeof loadCusts === 'function') loadCusts(); break;
        case 'quickSaleScreen': if (typeof loadQuickSale === 'function') loadQuickSale(); break;
        case 'salesScreen':
            setDateInput('salesDate', todayStr());
            updateDateBtn('salesDateBtn', todayStr());
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
    document.getElementById(id).classList.remove('active');
    document.getElementById('bottomNav').classList.add('show');
}

function openOverlay(id) {
    document.getElementById(id).classList.add('active');
    document.getElementById('bottomNav').classList.remove('show');
}

function setDateInput(id, val) {
    document.getElementById(id).value = val;
}

function updateDateBtn(id, val) {
    document.getElementById(id).textContent = fmtDateBtn(val);
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
    dpViewDate.setMonth(dpViewDate.getMonth() + off);
    renderCalendar();
}

function renderCalendar() {
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

    document.getElementById('dpMonthLabel').textContent =
        months[dpViewDate.getMonth()] + ' ' + dpViewDate.getFullYear();

    var year = dpViewDate.getFullYear();
    var month = dpViewDate.getMonth();
    var firstDay = new Date(year, month, 1).getDay();
    firstDay = firstDay === 0 ? 6 : firstDay - 1; // Monday = 0
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = new Date();
    today.setHours(23, 59, 59, 999);
    var todayS = todayStr();
    var h = '';

    // Empty cells before first day
    for (var e = 0; e < firstDay; e++) {
        h += '<button class="dp-day empty"></button>';
    }

    // Day cells
    for (var d = 1; d <= daysInMonth; d++) {
        var ds = year + '-' + S(month + 1) + '-' + S(d);
        var dateObj = new Date(year, month, d);
        var cls = 'dp-day';
        if (ds === todayS) cls += ' today';
        if (ds === dpSelectedDate) cls += ' selected';
        if (dateObj > today) cls += ' future';
        h += '<button class="' + cls + '" onclick="pickDate(\'' + ds + '\')">' + d + '</button>';
    }

    document.getElementById('dpDays').innerHTML = h;
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
        var y = new Date();
        y.setDate(y.getDate() - 1);
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
        setDateInput('salesDate', ds);
        updateDateBtn('salesDateBtn', ds);
        if (typeof loadSales === 'function') loadSales();
    } else if (dpTarget === 'expense') {
        setDateInput('expDate', ds);
        updateDateBtn('expDateBtn', ds);
        if (typeof loadExps === 'function') loadExps();
    } else if (dpTarget === 'waste') {
        setDateInput('wasteDate', ds);
        updateDateBtn('wasteDateBtn', ds);
        if (typeof loadWasteList === 'function') loadWasteList();
    } else if (dpTarget === 'report') {
        setDateInput('reportDate', ds);
        updateDateBtn('reportDateBtn', ds);
        if (typeof loadReport === 'function') loadReport();
    }
}


// ============ CUSTOMER PICKER ============
function openCustPicker(mode) {
    pickerMode = mode;
    renderPickerList(allCustomers);
    document.getElementById('custSearch').value = '';
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

function renderPickerList(cs) {
    var ct = document.getElementById('custPickerList');
    if (!cs.length) {
        ct.innerHTML = '<div class="no-data">No customer found</div>';
        return;
    }
    var h = '';
    cs.forEach(function(c) {
        h += '<div class="bts-item" onclick="selectCust(\'' + c.id + '\',\'' +
             esc(c.name).replace(/'/g, "\\'") + '\',' + c.rate + ',\'' +
             (c.orderType || 'variable') + '\',' + (c.fixedQty || 0) + ')">' +
             '<span class="bts-item-name">' + esc(c.name) + '</span>' +
             '<span class="bts-item-rate">₹' + c.rate + '</span></div>';
    });
    ct.innerHTML = h;
}

function selectCust(id, name, rate, type, qty) {
    if (pickerMode === 'sale') {
        document.getElementById('sfCustomerId').value = id;
        document.getElementById('sfCustomerName').value = name;
        document.getElementById('sfCustLabel').textContent = name + ' (₹' + rate + ')';
        document.getElementById('sfCustBtn').classList.add('selected');
        document.getElementById('sfRate').value = rate;
        if (type === 'fixed' && qty > 0) {
            document.getElementById('sfQty').value = qty;
        } else {
            document.getElementById('sfQty').value = '';
            setTimeout(function() { document.getElementById('sfQty').focus(); }, 300);
        }
        calcSaleTotal();
    }
    closeCustPicker();
}


// ============ FORM HELPERS ============
function setPayType(hid, val, btn) {
    document.getElementById(hid).value = val;
    btn.parentElement.querySelectorAll('.tgl').forEach(function(b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');
}

function setOrderType(t, btn) {
    document.getElementById('cfOrderType').value = t;
    document.querySelectorAll('#customerForm .tgl').forEach(function(b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');
    document.getElementById('fixedQtyGroup').style.display = t === 'fixed' ? 'block' : 'none';
    if (t !== 'fixed') document.getElementById('cfQty').value = '';
}

function setSaleType(type, btn) {
    document.getElementById('sfType').value = type;
    btn.parentElement.querySelectorAll('.tgl').forEach(function(b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');

    document.getElementById('sfCustGroup').style.display = type === 'regular' ? 'block' : 'none';
    document.getElementById('sfWalkinGroup').style.display = type === 'walkin' ? 'block' : 'none';

    if (type === 'walkin') {
        document.getElementById('sfRate').removeAttribute('readonly');
        document.getElementById('sfRate').value = '';
        document.getElementById('sfQty').value = '';
        document.getElementById('sfCustomerId').value = '';
        document.getElementById('sfCustomerName').value = '';
    } else {
        document.getElementById('sfRate').setAttribute('readonly', true);
    }
    calcSaleTotal();
}

function setExpCat(cat, btn) {
    document.getElementById('efCat').value = cat;
    document.querySelectorAll('#expForm .cat').forEach(function(b) {
        b.classList.remove('active');
    });
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
    document.querySelectorAll('#wasteForm .cat').forEach(function(b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');
}

function calcSaleTotal() {
    var r = parseFloat(document.getElementById('sfRate').value) || 0;
    var q = parseInt(document.getElementById('sfQty').value) || 0;
    document.getElementById('sfTotal').textContent = '₹' + (r * q);
}


// ============ CONFIRM & TOAST ============
function showConfirm(ic, tt, msg, fn) {
    document.getElementById('confirmIcon').textContent = ic;
    document.getElementById('confirmTitle').textContent = tt;
    document.getElementById('confirmMsg').textContent = msg;
    cfCb = fn;
    document.getElementById('confirmDialog').classList.add('active');
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
   ⚠️ DO NOT add startApp() here!
   Part 2 will continue below with all business logic...
   ================================================ */
   /* ================================================
   MERI DUKAAN v4.0 - APP LOGIC (PART 2 of 2)
   Business Logic, Features, Start
   Append this BELOW Part 1 in same app.js
   ================================================ */

// ============ HELPERS ============
function findInArray(arr, id) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return arr[i];
    }
    return null;
}

function safeStr(s) {
    return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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


// ============ DASHBOARD ============
function setPeriod(period, btn) {
    currentPeriod = period;
    document.querySelectorAll('.pt').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    refreshDash();
}

function refreshDash() {
    var now = new Date();
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

    document.getElementById('todayDate').textContent =
        days[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();

    var hr = now.getHours();
    document.getElementById('dashGreeting').textContent =
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

    document.getElementById('dRoti').textContent = roti;
    document.getElementById('dIncome').textContent = '₹' + inc;
    document.getElementById('dExpense').textContent = '₹' + exp;

    var pEl = document.getElementById('dProfit');
    pEl.textContent = (profit >= 0 ? '₹' : '-₹') + Math.abs(profit);
    pEl.className = profit >= 0 ? '' : 'neg';

    document.getElementById('dWaste').textContent = wasteQty;

    // Credit — all time pending
    var cGiven = 0, cPaid = 0;
    allSales.forEach(function(s) { if (s.paymentType === 'credit') cGiven += s.total; });
    allCreditPayments.forEach(function(p) { cPaid += p.amount; });
    document.getElementById('dCredit').textContent = '₹' + Math.max(0, cGiven - cPaid);

    // Recent sales (today only)
    var todaySalesList = salesForDate(todayStr());
    var rs = document.getElementById('recentSales');
    if (!todaySalesList.length) {
        rs.innerHTML = '<div class="no-data">No sales today</div>';
    } else {
        var h = '';
        todaySalesList.slice(-5).reverse().forEach(function(s) {
            var pi = s.paymentType === 'cash' ? '💵' : s.paymentType === 'upi' ? '📱' : '💳';
            h += '<div class="aw-item"><span class="aw-item-n">' + esc(s.customerName || 'Walk-in') +
                 ' (' + s.quantity + ')</span><span class="aw-item-v inc">' + pi + ' ₹' + s.total + '</span></div>';
        });
        rs.innerHTML = h;
    }

    // Recent expenses (today only)
    var todayExpsList = expensesForDate(todayStr());
    var re = document.getElementById('recentExp');
    if (!todayExpsList.length) {
        re.innerHTML = '<div class="no-data">No expenses today</div>';
    } else {
        var h2 = '';
        todayExpsList.slice(-5).reverse().forEach(function(x) {
            h2 += '<div class="aw-item"><span class="aw-item-n">' + catIc(x.category) + ' ' +
                  catNm(x.category) + '</span><span class="aw-item-v exp">-₹' + x.amount + '</span></div>';
        });
        re.innerHTML = h2;
    }
}


// ============ QUICK SALE ============
function loadQuickSale() {
    var today = todayStr();
    document.getElementById('quickDateLabel').textContent = '📅 ' + fmtDateLong(today);

    var todaySales = salesForDate(today);
    var saleMap = {};
    todaySales.forEach(function(s) {
        if (s.customerId) saleMap[s.customerId] = s;
    });

    var doneCount = 0, pendingCount = 0, totalAmt = 0;
    todaySales.forEach(function(s) { totalAmt += s.total; });
    allCustomers.forEach(function(c) {
        if (saleMap[c.id]) doneCount++;
        else pendingCount++;
    });

    document.getElementById('qsDone').textContent = doneCount;
    document.getElementById('qsPending').textContent = pendingCount;
    document.getElementById('qsTotal').textContent = '₹' + totalAmt;

    if (!allCustomers.length) {
        document.getElementById('quickSaleList').innerHTML =
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

        h += '<div class="quick-row' + (isDone ? ' done' : '') + '" style="animation-delay:' + (i * 0.03) + 's">';
        h += '<div class="qr-info"><div class="qr-name">' + esc(c.name) + '</div>';
        h += '<div class="qr-details">' + (isFixed ? 'Fixed • ' + c.fixedQty + ' roti' : 'Variable') + '</div>';
        h += '<div class="qr-rate">₹' + c.rate + '/roti</div></div>';

        if (isDone) {
            h += '<div class="qr-amt">₹' + amt + '</div>';
            h += '<button class="qr-status" disabled>✅</button>';
        } else {
            h += '<input type="number" class="qr-qty" id="qq_' + c.id + '" value="' + (qty || '') + '" ' +
                 (isFixed ? '' : 'placeholder="Qty"') + ' min="1" inputmode="numeric" ' +
                 'oninput="quickCalcAmt(\'' + c.id + '\',' + c.rate + ')">';
            h += '<button class="qr-pay" id="qp_' + c.id + '" data-pay="cash" ' +
                 'onclick="cycleQuickPay(\'' + c.id + '\')">💵</button>';
            h += '<div class="qr-amt" id="qa_' + c.id + '">₹' + amt + '</div>';
            h += '<button class="qr-status" onclick="quickSaveSale(\'' + c.id + '\',\'' +
                 safeStr(c.name) + '\',' + c.rate + ')">💾</button>';
        }
        h += '</div>';
    });

    document.getElementById('quickSaleList').innerHTML = h;
}

function quickCalcAmt(custId, rate) {
    var qty = parseInt(document.getElementById('qq_' + custId).value) || 0;
    document.getElementById('qa_' + custId).textContent = '₹' + (qty * rate);
}

function cycleQuickPay(custId) {
    var btn = document.getElementById('qp_' + custId);
    var cur = btn.getAttribute('data-pay');
    var next, icon;
    if (cur === 'cash') { next = 'upi'; icon = '📱'; }
    else if (cur === 'upi') { next = 'credit'; icon = '💳'; }
    else { next = 'cash'; icon = '💵'; }
    btn.setAttribute('data-pay', next);
    btn.textContent = icon;
}

async function quickSaveSale(custId, custName, rate) {
    var qtyEl = document.getElementById('qq_' + custId);
    var qty = parseInt(qtyEl ? qtyEl.value : 0) || 0;
    if (qty < 1) { showToast('❌ Enter quantity!', 'error'); return; }

    var payBtn = document.getElementById('qp_' + custId);
    var payType = payBtn ? payBtn.getAttribute('data-pay') : 'cash';

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
        console.error(err);
        showToast('❌ Error saving', 'error');
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

    showConfirm('✅', 'Mark All Done?', pending.length + ' fixed orders will be saved as Cash.', async function() {
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
            console.error(err);
            showToast('❌ Error saving orders', 'error');
        }
    });
}


// ============ CUSTOMERS ============
function loadCusts() {
    document.getElementById('custCount').textContent =
        allCustomers.length + ' Customer' + (allCustomers.length !== 1 ? 's' : '');

    var ct = document.getElementById('customerList');
    if (!allCustomers.length) {
        ct.innerHTML = '<div class="empty"><div class="empty-ic">👥</div><h3>No Customers</h3>' +
            '<p>Add your first customer</p>' +
            '<button class="empty-btn" onclick="openCustomerForm()">+ Add</button></div>';
        return;
    }

    var h = '';
    allCustomers.forEach(function(c, i) {
        var tt = c.orderType === 'fixed' ? 'Fixed: ' + c.fixedQty + '/day' : 'Variable';
        var tc = c.orderType === 'fixed' ? 'cb-f' : 'cb-v';
        h += '<div class="c-card" style="animation-delay:' + (i * 0.04) + 's">' +
             '<div class="c-info"><div class="c-name">' + esc(c.name) + '</div>' +
             '<div class="c-dets"><span class="c-b cb-r">₹' + c.rate + '/roti</span>' +
             '<span class="c-b ' + tc + '">' + tt + '</span></div>' +
             (c.phone ? '<div class="c-ph">📱 ' + esc(c.phone) + '</div>' : '') +
             '</div><div class="c-acts">' +
             '<button class="ic-btn ib-e" onclick="openCustomerForm(\'' + c.id + '\')">✏️</button>' +
             '<button class="ic-btn ib-d" onclick="confirmDelCust(\'' + c.id + '\')">🗑️</button>' +
             '</div></div>';
    });
    ct.innerHTML = h;
}

function openCustomerForm(id) {
    document.getElementById('customerForm').reset();
    document.getElementById('cfId').value = '';
    document.getElementById('cfOrderType').value = 'fixed';
    document.getElementById('fixedQtyGroup').style.display = 'block';
    var tg = document.querySelectorAll('#customerForm .tgl');
    tg.forEach(function(b) { b.classList.remove('active'); });
    tg[0].classList.add('active');

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
            tg.forEach(function(b) { b.classList.remove('active'); });
            if (c.orderType === 'variable') {
                tg[1].classList.add('active');
                document.getElementById('fixedQtyGroup').style.display = 'none';
            } else {
                tg[0].classList.add('active');
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

    if (!n || !r) { showToast('❌ Name and Rate required!', 'error'); return; }
    if (ot === 'fixed' && (!fq || fq < 1)) { showToast('❌ Enter daily roti count!', 'error'); return; }

    var data = {
        name: n, rate: r,
        phone: document.getElementById('cfPhone').value.trim(),
        orderType: ot, fixedQty: fq
    };

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
        console.error(err);
        showToast('❌ Error saving customer', 'error');
    }
}

function confirmDelCust(id) {
    if (userRole === 'staff') { showToast('❌ Staff cannot delete', 'error'); return; }
    var c = findInArray(allCustomers, id);
    if (!c) return;
    showConfirm('🗑️', 'Delete?', 'Delete ' + c.name + '?', async function() {
        try {
            await fsDelete('customers', id);
            showToast('✅ Deleted!');
        } catch (err) { showToast('❌ Error', 'error'); }
    });
}


// ============ SALES ============
function changeSalesDate(off) {
    var cv = document.getElementById('salesDate').value;
    var nd = dateShift(cv, off);
    if (nd) { setDateInput('salesDate', nd); updateDateBtn('salesDateBtn', nd); loadSales(); }
}

function loadSales() {
    var date = document.getElementById('salesDate').value;
    if (!date) return;
    var all = salesForDate(date);

    var roti = 0, inc = 0, cash = 0, cred = 0;
    all.forEach(function(s) {
        roti += s.quantity; inc += s.total;
        if (s.paymentType === 'credit') cred += s.total; else cash += s.total;
    });

    document.getElementById('sRoti').textContent = roti;
    document.getElementById('sIncome').textContent = '₹' + inc;
    document.getElementById('sCash').textContent = '₹' + cash;
    document.getElementById('sCredit').textContent = '₹' + cred;
    renderSales(all);
}

function openSaleForm(id) {
    document.getElementById('saleForm').reset();
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

    // Reset all toggles
    document.querySelectorAll('#saleForm .tgl-row').forEach(function(row) {
        var btns = row.querySelectorAll('.tgl');
        btns.forEach(function(b, i) { b.classList.toggle('active', i === 0); });
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
                typeTgls[0].classList.remove('active');
                typeTgls[1].classList.add('active');
            } else {
                document.getElementById('sfCustomerId').value = s.customerId;
                document.getElementById('sfCustomerName').value = s.customerName;
                document.getElementById('sfCustLabel').textContent = s.customerName + ' (₹' + s.rate + ')';
                document.getElementById('sfCustBtn').classList.add('selected');
            }

            calcSaleTotal();

            var payTgls = document.querySelectorAll('#saleForm .tgl3 .tgl');
            payTgls.forEach(function(b) { b.classList.remove('active'); });
            if (s.paymentType === 'cash') payTgls[0].classList.add('active');
            else if (s.paymentType === 'upi') payTgls[1].classList.add('active');
            else payTgls[2].classList.add('active');
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

    if (saleType === 'walkin') {
        cname = document.getElementById('sfWalkinName').value.trim() || 'Walk-in';
        cid = '';
        if (!r) { showToast('❌ Enter rate!', 'error'); return; }
    } else {
        if (!cid || !cname) { showToast('❌ Select customer!', 'error'); return; }
    }
    if (!r || !q) { showToast('❌ Rate and Quantity required!', 'error'); return; }

    var data = {
        customerId: cid,
        customerName: cname,
        date: document.getElementById('salesDate').value || todayStr(),
        rate: r, quantity: q, total: r * q,
        paymentType: document.getElementById('sfPay').value,
        saleType: saleType
    };

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
        console.error(err);
        showToast('❌ Error saving sale', 'error');
    }
}

function renderSales(sales) {
    var ct = document.getElementById('salesList');
    if (!sales.length) {
        ct.innerHTML = '<div class="empty"><div class="empty-ic">🫓</div><h3>No Sales</h3>' +
            '<p>No sales on this date</p>' +
            '<button class="empty-btn" onclick="openSaleForm()">+ Add Sale</button></div>';
        return;
    }

    var h = '';
    sales.forEach(function(s, i) {
        var pb = payBdg(s.paymentType);
        var isWalkin = s.saleType === 'walkin';
        h += '<div class="sale-card' + (isWalkin ? ' walkin' : '') + '" style="animation-delay:' + (i * 0.04) + 's">' +
             '<div class="sl-top"><div class="sl-name">' + esc(s.customerName || 'Walk-in') +
             '</div><div class="sl-amt">₹' + s.total + '</div></div>' +
             '<div class="sl-badges"><span class="sl-b slb-q">' + s.quantity + ' roti</span>' +
             '<span class="sl-b slb-r">₹' + s.rate + '/roti</span>' +
             '<span class="sl-b ' + pb.c + '">' + pb.t + '</span>' +
             (isWalkin ? '<span class="sl-b slb-w">🚶 Walk-in</span>' : '') +
             '</div><div class="sl-foot"><span class="sl-time">' + getTime(s.createdAt) + '</span>' +
             '<div class="sl-acts">' +
             '<button class="ic-btn ib-e" onclick="openSaleForm(\'' + s.id + '\')">✏️</button>' +
             '<button class="ic-btn ib-d" onclick="confirmDelSale(\'' + s.id + '\')">🗑️</button>' +
             '</div></div></div>';
    });
    ct.innerHTML = h;
}

function confirmDelSale(id) {
    if (userRole === 'staff') { showToast('❌ Staff cannot delete', 'error'); return; }
    var s = findInArray(allSales, id);
    if (!s) return;
    showConfirm('🗑️', 'Delete Sale?', (s.customerName || 'Walk-in') + ' — ' + s.quantity + ' roti delete?', async function() {
        try { await fsDelete('sales', id); showToast('✅ Deleted!'); }
        catch (err) { showToast('❌ Error', 'error'); }
    });
}


// ============ EXPENSES ============
function changeExpDate(off) {
    var cv = document.getElementById('expDate').value;
    var nd = dateShift(cv, off);
    if (nd) { setDateInput('expDate', nd); updateDateBtn('expDateBtn', nd); loadExps(); }
}

function loadExps() {
    var date = document.getElementById('expDate').value;
    if (!date) return;
    var all = expensesForDate(date);
    var total = 0;
    all.forEach(function(x) { total += x.amount; });
    document.getElementById('eTotal').textContent = '₹' + total;
    document.getElementById('eCount').textContent = all.length;
    renderExps(all);
}

function openExpenseForm(id) {
    document.getElementById('expForm').reset();
    document.getElementById('efId').value = '';
    document.getElementById('efCat').value = 'atta';
    document.getElementById('efPay').value = 'cash';
    document.getElementById('efDetailGrp').style.display = 'none';
    document.getElementById('efWeightGrp').style.display = 'block';
    document.getElementById('efRateInfo').style.display = 'none';

    document.querySelectorAll('#expForm .cat').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('#expForm .cat')[0].classList.add('active');
    var tg = document.querySelectorAll('#expForm .tgl');
    tg.forEach(function(b) { b.classList.remove('active'); });
    tg[0].classList.add('active');

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

            document.querySelectorAll('#expForm .cat').forEach(function(b) {
                b.classList.remove('active');
            });
            var catMap = { atta: 0, oil: 1, gas: 2, poly: 3, other: 4 };
            var ci = catMap[x.category];
            if (ci !== undefined) document.querySelectorAll('#expForm .cat')[ci].classList.add('active');

            tg.forEach(function(b) { b.classList.remove('active'); });
            if (x.paymentType === 'upi') tg[1].classList.add('active');
            else tg[0].classList.add('active');

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

async function saveExpense(e) {
    e.preventDefault();
    var cat = document.getElementById('efCat').value;
    var amt = parseFloat(document.getElementById('efAmount').value);
    if (!amt) { showToast('❌ Enter amount!', 'error'); return; }

    var data = {
        category: cat,
        detail: document.getElementById('efDetail').value.trim(),
        weight: parseFloat(document.getElementById('efWeight').value) || null,
        amount: amt,
        paymentType: document.getElementById('efPay').value,
        date: document.getElementById('expDate').value || todayStr()
    };

    try {
        var idV = document.getElementById('efId').value;
        if (idV) {
            await fsUpdate('expenses', idV, data);
            showToast('✅ Updated!');
        } else {
            await fsAdd('expenses', data);
            showToast('✅ ' + catNm(cat) + ' ₹' + amt + ' saved!');
        }
        closeOverlay('expFormOverlay');
    } catch (err) {
        console.error(err);
        showToast('❌ Error saving', 'error');
    }
}

function renderExps(exps) {
    var ct = document.getElementById('expList');
    if (!exps.length) {
        ct.innerHTML = '<div class="empty"><div class="empty-ic">🛒</div><h3>No Expenses</h3>' +
            '<p>No expenses on this date</p>' +
            '<button class="empty-btn" onclick="openExpenseForm()">+ Add</button></div>';
        return;
    }

    var h = '';
    exps.forEach(function(x, i) {
        var pb = payBdg(x.paymentType);
        var det = '';
        if (x.weight) det = x.weight + 'kg • ₹' + (x.amount / x.weight).toFixed(1) + '/kg';
        else if (x.detail) det = x.detail;

        h += '<div class="exp-card" style="animation-delay:' + (i * 0.04) + 's">' +
             '<div class="ex-top"><div class="ex-cat">' + catIc(x.category) + ' ' + catNm(x.category) +
             '</div><div class="ex-amt">-₹' + x.amount + '</div></div>' +
             (det ? '<div class="ex-det">' + esc(det) + '</div>' : '') +
             '<div class="ex-badges"><span class="sl-b ' + pb.c + '">' + pb.t + '</span></div>' +
             '<div class="ex-foot"><span class="sl-time">' + getTime(x.createdAt) + '</span>' +
             '<div class="sl-acts">' +
             '<button class="ic-btn ib-e" onclick="openExpenseForm(\'' + x.id + '\')">✏️</button>' +
             '<button class="ic-btn ib-d" onclick="confirmDelExp(\'' + x.id + '\')">🗑️</button>' +
             '</div></div></div>';
    });
    ct.innerHTML = h;
}

function confirmDelExp(id) {
    if (userRole === 'staff') { showToast('❌ Staff cannot delete', 'error'); return; }
    var x = findInArray(allExpenses, id);
    if (!x) return;
    showConfirm('🗑️', 'Delete?', catNm(x.category) + ' ₹' + x.amount + ' delete?', async function() {
        try { await fsDelete('expenses', id); showToast('✅ Deleted!'); }
        catch (err) { showToast('❌ Error', 'error'); }
    });
}


// ============ WASTE ============
function changeWasteDate(off) {
    var cv = document.getElementById('wasteDate').value;
    var nd = dateShift(cv, off);
    if (nd) { setDateInput('wasteDate', nd); updateDateBtn('wasteDateBtn', nd); loadWasteList(); }
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

    document.getElementById('wQty').textContent = totalQty;
    document.getElementById('wCost').textContent = '₹' + Math.round(totalQty * avgRate);

    var ct = document.getElementById('wasteList');
    if (!all.length) {
        ct.innerHTML = '<div class="empty"><div class="empty-ic">🫓</div><h3>No Waste</h3>' +
            '<p>No waste recorded on this date</p>' +
            '<button class="empty-btn" onclick="openWasteForm()">+ Add</button></div>';
        return;
    }

    var h = '';
    all.forEach(function(w, i) {
        h += '<div class="waste-card" style="animation-delay:' + (i * 0.04) + 's">' +
             '<div class="wc-top"><div class="wc-reason">' + wasteReasonText(w.reason) +
             '</div><div class="wc-qty">' + w.quantity + ' roti</div></div>' +
             (w.notes ? '<div class="wc-notes">' + esc(w.notes) + '</div>' : '') +
             '<div class="wc-foot"><span class="sl-time">' + getTime(w.createdAt) + '</span>' +
             '<div class="sl-acts">' +
             '<button class="ic-btn ib-d" onclick="confirmDelWaste(\'' + w.id + '\')">🗑️</button>' +
             '</div></div></div>';
    });
    ct.innerHTML = h;
}

function openWasteForm() {
    document.getElementById('wasteForm').reset();
    document.getElementById('wfId').value = '';
    document.getElementById('wfReason').value = 'burnt';
    document.querySelectorAll('#wasteForm .cat').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('#wasteForm .cat')[0].classList.add('active');
    openOverlay('wasteFormOverlay');
}

async function saveWaste(e) {
    e.preventDefault();
    var qty = parseInt(document.getElementById('wfQty').value);
    if (!qty || qty < 1) { showToast('❌ Enter quantity!', 'error'); return; }

    var data = {
        quantity: qty,
        reason: document.getElementById('wfReason').value,
        notes: document.getElementById('wfNotes').value.trim(),
        date: document.getElementById('wasteDate').value || todayStr()
    };

    try {
        await fsAdd('waste', data);
        showToast('✅ Waste entry saved!');
        closeOverlay('wasteFormOverlay');
    } catch (err) {
        console.error(err);
        showToast('❌ Error saving', 'error');
    }
}

function confirmDelWaste(id) {
    if (userRole === 'staff') { showToast('❌ Staff cannot delete', 'error'); return; }
    showConfirm('🗑️', 'Delete?', 'Delete this waste entry?', async function() {
        try { await fsDelete('waste', id); showToast('✅ Deleted!'); }
        catch (err) { showToast('❌ Error', 'error'); }
    });
}


// ============ CREDIT ============
function loadCredit() {
    var cm = {};
    allCustomers.forEach(function(c) { cm[c.id] = { id: c.id, name: c.name, g: 0, r: 0 }; });

    allSales.forEach(function(s) {
        if (s.paymentType === 'credit' && s.customerId) {
            if (!cm[s.customerId]) cm[s.customerId] = { id: s.customerId, name: s.customerName, g: 0, r: 0 };
            cm[s.customerId].g += s.total;
        }
    });

    allCreditPayments.forEach(function(p) {
        if (cm[p.customerId]) cm[p.customerId].r += p.amount;
    });

    var list = Object.values(cm).filter(function(c) { return c.g > 0; });
    list.sort(function(a, b) { return (b.g - b.r) - (a.g - a.r); });

    var tp = 0;
    list.forEach(function(c) { tp += Math.max(0, c.g - c.r); });
    document.getElementById('cTotalPending').textContent = '₹' + tp;

    var ct = document.getElementById('creditList');
    if (!list.length) {
        ct.innerHTML = '<div class="empty"><div class="empty-ic">🎉</div><h3>No Pending Credit!</h3><p>All clear</p></div>';
        return;
    }

    var h = '';
    list.forEach(function(c, i) {
        var p = Math.max(0, c.g - c.r);
        h += '<div class="u-card" style="animation-delay:' + (i * 0.04) + 's" onclick="openCreditPay(\'' + c.id + '\')">' +
             '<div class="u-info"><div class="u-name">' + esc(c.name) +
             '</div><div class="u-sub">Total: ₹' + c.g + ' • Paid: ₹' + c.r +
             '</div></div><div class="u-amt ' + (p === 0 ? 'u-zero' : '') + '">₹' + p + '</div></div>';
    });
    ct.innerHTML = h;
}

async function openCreditPay(cid) {
    var cust = findInArray(allCustomers, cid);
    var custPayments = allCreditPayments.filter(function(p) { return p.customerId === cid; });

    var g = 0;
    allSales.forEach(function(s) {
        if (s.paymentType === 'credit' && s.customerId === cid) g += s.total;
    });
    var r = 0;
    custPayments.forEach(function(p) { r += p.amount; });
    var pending = Math.max(0, g - r);
    var name = cust ? cust.name : 'Customer';

    document.getElementById('crpTitle').textContent = name;
    document.getElementById('crpCustId').value = cid;
    document.getElementById('crpCustName').value = name;
    document.getElementById('crpAmount').value = '';
    document.getElementById('crpPay').value = 'cash';
    var tg = document.querySelectorAll('#crpForm .tgl');
    tg.forEach(function(b) { b.classList.remove('active'); });
    tg[0].classList.add('active');

    document.getElementById('crpDetail').innerHTML =
        '<div class="ud-row"><span class="ud-label">Total Credit</span><span class="ud-val">₹' + g + '</span></div>' +
        '<div class="ud-row"><span class="ud-label">Paid</span><span class="ud-val green">₹' + r + '</span></div>' +
        '<div class="ud-row"><span class="ud-label">Pending</span><span class="ud-val amber">₹' + pending + '</span></div>';

    var hDiv = document.getElementById('crpHistory');
    if (!custPayments.length) {
        hDiv.innerHTML = '<div class="no-data">No payments recorded</div>';
    } else {
        var h = '';
        custPayments.slice().reverse().forEach(function(p) {
            h += '<div class="aw-item"><span class="aw-item-n">' + fmtDate(p.date) +
                 '</span><span class="aw-item-v inc">+₹' + p.amount + ' ' +
                 (p.paymentType === 'upi' ? '📱' : '💵') + '</span></div>';
        });
        hDiv.innerHTML = '<div class="aw-card" style="margin:0">' + h + '</div>';
    }

    openOverlay('creditPayOverlay');
}

async function saveCreditPayment(e) {
    e.preventDefault();
    var amt = parseFloat(document.getElementById('crpAmount').value);
    if (!amt || amt < 1) { showToast('❌ Enter amount!', 'error'); return; }

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
        showToast('❌ Error', 'error');
    }
}


// ============ REPORTS ============
function switchReport(type, btn) {
    curReport = type;
    document.querySelectorAll('.rp-t').forEach(function(t) { t.classList.remove('active'); });
    btn.classList.add('active');
    loadReport();
}

function changeReportDate(off) {
    var cv = document.getElementById('reportDate').value;
    var d = new Date(cv + 'T00:00:00');
    if (curReport === 'daily') d.setDate(d.getDate() + off);
    else if (curReport === 'weekly') d.setDate(d.getDate() + (off * 7));
    else d.setMonth(d.getMonth() + off);
    var t = new Date(); t.setHours(23, 59, 59, 999);
    if (d > t) return;
    var nd = d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(d.getDate());
    setDateInput('reportDate', nd);
    updateDateBtn('reportDateBtn', nd);
    loadReport();
}

function loadReport() {
    var date = document.getElementById('reportDate').value;
    if (!date) return;

    var sd, ed, title;
    var d = new Date(date + 'T00:00:00');
    var mn = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'];

    if (curReport === 'daily') {
        sd = ed = date;
        title = 'Daily Report • ' + fmtDateLong(date);
    } else if (curReport === 'weekly') {
        var dy = d.getDay();
        var mon = new Date(d); mon.setDate(d.getDate() - (dy === 0 ? 6 : dy - 1));
        var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        sd = mon.getFullYear() + '-' + S(mon.getMonth() + 1) + '-' + S(mon.getDate());
        ed = sun.getFullYear() + '-' + S(sun.getMonth() + 1) + '-' + S(sun.getDate());
        title = 'Weekly: ' + fmtDate(sd) + ' — ' + fmtDate(ed);
    } else {
        sd = d.getFullYear() + '-' + S(d.getMonth() + 1) + '-01';
        var ld = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        ed = d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(ld);
        title = mn[d.getMonth()] + ' ' + d.getFullYear();
    }

    var fS = dataInRange(allSales, sd, ed);
    var fE = dataInRange(allExpenses, sd, ed);
    var fP = dataInRange(allCreditPayments, sd, ed);
    var fW = dataInRange(allWaste, sd, ed);

    var tR = 0, tI = 0, tE = 0, cI = 0, uI = 0, hI = 0, wQ = 0;
    var cS = {};
    fS.forEach(function(s) {
        tR += s.quantity; tI += s.total;
        if (s.paymentType === 'cash') cI += s.total;
        else if (s.paymentType === 'upi') uI += s.total;
        else hI += s.total;
        var nm = s.customerName || 'Walk-in';
        if (!cS[nm]) cS[nm] = { r: 0, a: 0 };
        cS[nm].r += s.quantity; cS[nm].a += s.total;
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

    rptData = { title: title, sd: sd, ed: ed, tR: tR, tI: tI, tE: tE, profit: profit,
                cI: cI, uI: uI, hI: hI, uRec: uRec, cS: cS, cE: cE, wQ: wQ };

    // Build report HTML
    var h = '<div class="rp-card"><div class="rp-title">' + title + '</div></div>';
    h += '<div class="rp-card"><div class="rp-hero"><div class="rp-hero-v ' +
         (profit >= 0 ? 'green' : 'red') + '">' + (profit >= 0 ? '₹' : '-₹') + Math.abs(profit) +
         '</div><div class="rp-hero-l">Net Profit</div></div></div>';

    h += '<div class="rp-card"><div class="rp-title">Summary</div>';
    var rows = [
        ['Total Roti Sold', tR, ''], ['Total Income', '₹' + tI, 'green'],
        ['Cash', '₹' + cI, ''], ['UPI', '₹' + uI, ''],
        ['Credit Given', '₹' + hI, 'amber'], ['Credit Recovered', '₹' + uRec, 'green'],
        ['Total Expense', '₹' + tE, 'red'], ['Waste', wQ + ' roti', 'amber'],
        ['Net Profit', (profit >= 0 ? '₹' : '-₹') + Math.abs(profit), profit >= 0 ? 'green' : 'red']
    ];
    rows.forEach(function(r) {
        h += '<div class="rp-row"><span class="rp-lbl">' + r[0] + '</span><span class="rp-val ' + r[2] + '">' + r[1] + '</span></div>';
    });
    h += '</div>';

    var ca = Object.keys(cS);
    if (ca.length) {
        h += '<div class="rp-card"><div class="rp-title">Customer Wise Sales</div>';
        ca.sort(function(a, b) { return cS[b].a - cS[a].a; });
        ca.forEach(function(n) {
            h += '<div class="rp-row"><span class="rp-lbl">' + esc(n) + ' (' + cS[n].r + ')</span><span class="rp-val">₹' + cS[n].a + '</span></div>';
        });
        h += '</div>';
    }

    var ea = Object.keys(cE);
    if (ea.length) {
        h += '<div class="rp-card"><div class="rp-title">Expense Breakdown</div>';
        ea.sort(function(a, b) { return cE[b] - cE[a]; });
        ea.forEach(function(cn) {
            var pct = tE > 0 ? Math.round(cE[cn] / tE * 100) : 0;
            h += '<div class="rp-row"><span class="rp-lbl">' + cn + ' (' + pct + '%)</span><span class="rp-val red">₹' + cE[cn] + '</span></div>';
        });
        h += '</div>';
    }

    document.getElementById('reportContent').innerHTML = h;

    // Render charts
    renderCharts(sd, ed);
}

function renderCharts(sd, ed) {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    var textColor = isDark ? '#a0a0a0' : '#666';

    // Sales bar chart
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

    var labels = Object.keys(salesByDay).map(function(d) {
        var p = d.split('-');
        return p[2] + '/' + p[1];
    });
    var values = Object.values(salesByDay);

    try {
        var ctx1 = document.getElementById('salesChart');
        if (!ctx1) return;

        if (salesChart) salesChart.destroy();
        salesChart = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales (₹)',
                    data: values,
                    backgroundColor: 'rgba(230, 81, 0, 0.7)',
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: textColor, font: { size: 9 }, maxRotation: 45 } }
                }
            }
        });
    } catch (err) { console.error('Sales chart:', err); }

    // Expense pie chart
    var expByCat = {};
    dataInRange(allExpenses, sd, ed).forEach(function(e) {
        var cat = catNm(e.category);
        expByCat[cat] = (expByCat[cat] || 0) + e.amount;
    });

    try {
        var ctx2 = document.getElementById('expenseChart');
        if (!ctx2) return;

        if (expenseChart) expenseChart.destroy();
        var eLabels = Object.keys(expByCat);
        var eValues = Object.values(expByCat);

        if (eValues.some(function(v) { return v > 0; })) {
            expenseChart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: eLabels,
                    datasets: [{
                        data: eValues,
                        backgroundColor: ['#e65100', '#ff8f00', '#f44336', '#7c4dff', '#2196f3'],
                        borderWidth: 2,
                        borderColor: isDark ? '#1e1e1e' : '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 12 } }
                    }
                }
            });
        }
    } catch (err) { console.error('Expense chart:', err); }
}


// ============ PDF ============
function generatePDF() {
    try {
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF('p', 'mm', 'a4');
        var rd = rptData;
        if (!rd.title) { showToast('❌ Load a report first!', 'error'); return; }

        var W = 210, mL = 14, mR = 14, cW = W - mL - mR;

        // Header
        doc.setFillColor(26, 26, 46); doc.rect(0, 0, W, 40, 'F');
        doc.setFillColor(230, 81, 0); doc.rect(0, 38, W, 3, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
        doc.text('MERI DUKAAN', mL, 17);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('Business Report', mL, 23);
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(rd.title, mL, 33);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('Generated: ' + new Date().toLocaleString(), W - mR, 33, { align: 'right' });

        var y = 50;

        // Profit box
        var pc = rd.profit >= 0 ? [0, 150, 50] : [200, 40, 40];
        doc.setFillColor(pc[0], pc[1], pc[2]); doc.roundedRect(mL, y, cW, 18, 3, 3, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.text('NET PROFIT', mL + 8, y + 8);
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.text('Rs. ' + Math.abs(rd.profit) + (rd.profit < 0 ? ' (Loss)' : ''), W - mR - 8, y + 13, { align: 'right' });
        y += 26;

        // Summary table
        doc.setTextColor(26, 26, 46); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text('SUMMARY', mL, y); y += 3;

        doc.autoTable({
            startY: y, margin: { left: mL, right: mR },
            head: [['Item', 'Value']],
            body: [
                ['Total Roti Sold', rd.tR.toString()],
                ['Total Income', 'Rs. ' + rd.tI], ['Cash', 'Rs. ' + rd.cI],
                ['UPI', 'Rs. ' + rd.uI], ['Credit Given', 'Rs. ' + rd.hI],
                ['Credit Recovered', 'Rs. ' + rd.uRec],
                ['Total Expense', 'Rs. ' + rd.tE], ['Waste', rd.wQ + ' roti'],
                ['Net Profit', 'Rs. ' + (rd.profit >= 0 ? '' : '-') + Math.abs(rd.profit)]
            ],
            theme: 'grid',
            headStyles: { fillColor: [230, 81, 0], textColor: 255, fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
            alternateRowStyles: { fillColor: [255, 248, 240] },
            columnStyles: { 0: { cellWidth: cW * 0.6 }, 1: { cellWidth: cW * 0.4, halign: 'right', fontStyle: 'bold' } }
        });
        y = doc.lastAutoTable.finalY + 10;

        // Customer table
        var ca = Object.keys(rd.cS);
        if (ca.length) {
            if (y > 240) { doc.addPage(); y = 20; }
            doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(230, 81, 0);
            doc.text('CUSTOMER WISE SALES', mL, y); y += 3;
            ca.sort(function(a, b) { return rd.cS[b].a - rd.cS[a].a; });
            var cBody = ca.map(function(n) { return [n, rd.cS[n].r.toString(), 'Rs. ' + rd.cS[n].a]; });
            doc.autoTable({
                startY: y, margin: { left: mL, right: mR },
                head: [['Customer', 'Roti', 'Amount']], body: cBody,
                theme: 'striped',
                headStyles: { fillColor: [26, 26, 46], textColor: 255, fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 9 },
                columnStyles: { 0: { cellWidth: cW * 0.45 }, 1: { cellWidth: cW * 0.2, halign: 'center' },
                                2: { cellWidth: cW * 0.35, halign: 'right', fontStyle: 'bold' } }
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // Expense table
        var ea = Object.keys(rd.cE);
        if (ea.length) {
            if (y > 240) { doc.addPage(); y = 20; }
            doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 40, 40);
            doc.text('EXPENSE BREAKDOWN', mL, y); y += 3;
            ea.sort(function(a, b) { return rd.cE[b] - rd.cE[a]; });
            var eBody = ea.map(function(cn) {
                var pct = rd.tE > 0 ? Math.round(rd.cE[cn] / rd.tE * 100) : 0;
                return [cn, pct + '%', 'Rs. ' + rd.cE[cn]];
            });
            doc.autoTable({
                startY: y, margin: { left: mL, right: mR },
                head: [['Category', '%', 'Amount']], body: eBody,
                theme: 'striped',
                headStyles: { fillColor: [200, 40, 40], textColor: 255, fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 9 },
                columnStyles: { 0: { cellWidth: cW * 0.45 }, 1: { cellWidth: cW * 0.2, halign: 'center' },
                                2: { cellWidth: cW * 0.35, halign: 'right', fontStyle: 'bold' } }
            });
        }

        // Footer
        var pc2 = doc.internal.getNumberOfPages();
        for (var i = 1; i <= pc2; i++) {
            doc.setPage(i); doc.setFillColor(245, 245, 245); doc.rect(0, 287, W, 10, 'F');
            doc.setFontSize(7); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal');
            doc.text('Meri Dukaan v4.0 — Business Report', mL, 292);
            doc.text('Page ' + i + '/' + pc2, W - mR, 292, { align: 'right' });
        }

        doc.save('MeriDukaan_' + curReport + '_' + todayStr() + '.pdf');
        showToast('✅ PDF downloaded!');
    } catch (err) {
        console.error('PDF:', err);
        showToast('❌ PDF error!', 'error');
    }
}


// ============ SETTINGS ============
function loadSettings() {
    if (currentUser) {
        var avatar = document.getElementById('suAvatar');
        if (currentUser.photoURL) avatar.src = currentUser.photoURL;
        else avatar.style.display = 'none';
        document.getElementById('suName').textContent = currentUser.displayName || 'User';
        document.getElementById('suEmail').textContent = currentUser.email;
        document.getElementById('suRole').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
    }
    updateThemeUI();
    updateSyncStatus();
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

window.addEventListener('online', updateSyncStatus);
window.addEventListener('offline', updateSyncStatus);

function showChangePinUI() {
    if (userRole === 'staff') { showToast('❌ Only owner/admin can change PIN', 'error'); return; }
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

    var sv = '';
    try { sv = atob(localStorage.getItem('mdPin') || ''); } catch (er) {}
    if (old !== sv) { showToast('❌ Current PIN wrong!', 'error'); return; }
    if (nw.length !== 4) { showToast('❌ PIN must be 4 digits!', 'error'); return; }
    if (nw !== cf) { showToast('❌ PINs do not match!', 'error'); return; }

    var encoded = btoa(nw);
    try {
        await businessRef.update({ pin: encoded });
        localStorage.setItem('mdPin', encoded);
        showToast('✅ PIN changed!');
        closeOverlay('changePinOverlay');
    } catch (err) {
        showToast('❌ Error saving PIN', 'error');
    }
}


// ============ TEAM ============
function openTeamManager() {
    if (userRole === 'staff') { showToast('❌ Only owner/admin can manage team', 'error'); return; }
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

        var h = '<div class="team-card"><div class="tc-avatar">👑</div>' +
                '<div class="tc-info"><h4>' + esc(data.ownerName || data.ownerEmail) + '</h4>' +
                '<p>' + esc(data.ownerEmail) + '</p></div>' +
                '<span class="tc-role">Owner</span></div>';

        members.forEach(function(m, i) {
            h += '<div class="team-card"><div class="tc-avatar">👤</div>' +
                 '<div class="tc-info"><h4>' + esc(m.email) + '</h4>' +
                 '<p>Role: ' + (m.role === 'admin' ? 'Admin' : 'Staff') + '</p></div>' +
                 '<span class="tc-role ' + (m.role === 'staff' ? 'staff' : '') + '">' +
                 (m.role === 'admin' ? '👑 Admin' : '👤 Staff') + '</span>';
            if (userRole === 'owner') {
                h += '<button class="tc-remove" onclick="removeTeamMember(' + i + ')">❌</button>';
            }
            h += '</div>';
        });

        ct.innerHTML = h;
    } catch (err) {
        console.error(err);
    }
}

function showAddMember() {
    document.getElementById('addMemberForm').style.display = 'block';
    document.getElementById('tmEmail').value = '';
    document.getElementById('tmRole').value = 'admin';
    var tg = document.querySelectorAll('#teamOverlay .tgl');
    tg.forEach(function(b) { b.classList.remove('active'); });
    tg[0].classList.add('active');
    setTimeout(function() { document.getElementById('tmEmail').focus(); }, 300);
}

async function addTeamMember(e) {
    e.preventDefault();
    var email = document.getElementById('tmEmail').value.trim().toLowerCase();
    var role = document.getElementById('tmRole').value;
    if (!email) { showToast('❌ Enter email!', 'error'); return; }

    try {
        var doc = await businessRef.get();
        var data = doc.data();
        var members = data.members || [];
        var memberEmails = data.memberEmails || [];

        if (email === (data.ownerEmail || '').toLowerCase()) {
            showToast('❌ This is the owner email!', 'error'); return;
        }
        if (memberEmails.indexOf(email) !== -1) {
            showToast('❌ Already a member!', 'error'); return;
        }

        members.push({ email: email, role: role, addedAt: todayStr() });
        memberEmails.push(email);
        await businessRef.update({ members: members, memberEmails: memberEmails });

        document.getElementById('addMemberForm').style.display = 'none';
        showToast('✅ ' + email + ' added as ' + role + '!');
        loadTeamMembers();
    } catch (err) {
        console.error(err);
        showToast('❌ Error adding member', 'error');
    }
}

function removeTeamMember(index) {
    showConfirm('❌', 'Remove Member?', 'This person will lose access.', async function() {
        try {
            var doc = await businessRef.get();
            var data = doc.data();
            var members = data.members || [];
            var memberEmails = data.memberEmails || [];

            if (index < members.length) {
                var email = members[index].email;
                members.splice(index, 1);
                var ei = memberEmails.indexOf(email);
                if (ei !== -1) memberEmails.splice(ei, 1);
                await businessRef.update({ members: members, memberEmails: memberEmails });
                showToast('✅ Member removed');
                loadTeamMembers();
            }
        } catch (err) { showToast('❌ Error', 'error'); }
    });
}


// ============ DATA (Export/Import/Reset) ============
async function exportData() {
    try {
        var data = {
            app: 'MeriDukaan', v: '4.0',
            customers: allCustomers.map(cleanForExport),
            sales: allSales.map(cleanForExport),
            expenses: allExpenses.map(cleanForExport),
            waste: allWaste.map(cleanForExport),
            creditPayments: allCreditPayments.map(cleanForExport),
            exportDate: new Date().toISOString()
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
        console.error(err);
        showToast('❌ Export error', 'error');
    }
}

async function deleteCollection(colName) {
    var snap = await businessRef.collection(colName).get();
    var docs = snap.docs;
    for (var i = 0; i < docs.length; i += 400) {
        var batch = fdb.batch();
        docs.slice(i, i + 400).forEach(function(doc) { batch.delete(doc.ref); });
        await batch.commit();
    }
}

function importData(e) {
    var file = e.target.files[0];
    if (!file) return;

    showConfirm('📥', 'Import Data?', 'This will REPLACE all current data. Are you sure?', function() {
        var reader = new FileReader();
        reader.onload = async function(ev) {
            try {
                var data = JSON.parse(ev.target.result);
                if (!data.customers && !data.sales) { showToast('❌ Invalid file!', 'error'); return; }

                showToast('⏳ Importing...', 'success');

                // Clear existing
                await deleteCollection('customers');
                await deleteCollection('sales');
                await deleteCollection('expenses');
                await deleteCollection('waste');
                await deleteCollection('creditPayments');

                // Import customers with ID mapping
                var custIdMap = {};
                var custs = data.customers || [];
                for (var i = 0; i < custs.length; i++) {
                    var c = Object.assign({}, custs[i]);
                    var oldId = c.id;
                    delete c.id;
                    var ref = await businessRef.collection('customers').add(c);
                    if (oldId) custIdMap[oldId] = ref.id;
                }

                // Import sales
                var sales = data.sales || [];
                for (var j = 0; j < sales.length; j++) {
                    var s = Object.assign({}, sales[j]);
                    var oldSId = s.id;
                    delete s.id;
                    // Map old customer ID → new ID
                    if (s.customerId && custIdMap[s.customerId]) {
                        s.customerId = custIdMap[s.customerId];
                    }
                    // Convert v3 'udhari' → 'credit'
                    if (s.paymentType === 'udhari') s.paymentType = 'credit';
                    if (!s.saleType) s.saleType = 'regular';
                    await businessRef.collection('sales').add(s);
                }

                // Import expenses
                var exps = data.expenses || [];
                for (var k = 0; k < exps.length; k++) {
                    var x = Object.assign({}, exps[k]);
                    delete x.id;
                    await businessRef.collection('expenses').add(x);
                }

                // Import waste
                var wastes = data.waste || [];
                for (var w = 0; w < wastes.length; w++) {
                    var wt = Object.assign({}, wastes[w]);
                    delete wt.id;
                    await businessRef.collection('waste').add(wt);
                }

                // Import credit payments (v3: udhariPayments, v4: creditPayments)
                var pays = data.creditPayments || data.udhariPayments || [];
                for (var p = 0; p < pays.length; p++) {
                    var py = Object.assign({}, pays[p]);
                    delete py.id;
                    if (py.customerId && custIdMap[py.customerId]) {
                        py.customerId = custIdMap[py.customerId];
                    }
                    await businessRef.collection('creditPayments').add(py);
                }

                showToast('✅ Data imported successfully!');
            } catch (err) {
                console.error('Import error:', err);
                showToast('❌ Import failed!', 'error');
            }
        };
        reader.readAsText(file);
    });
    e.target.value = '';
}

function resetAllData() {
    if (userRole === 'staff') { showToast('❌ Only owner can delete data', 'error'); return; }
    showConfirm('🗑️', 'DELETE ALL DATA?', 'All data will be permanently removed. Download backup first!', async function() {
        try {
            showToast('⏳ Deleting...', 'success');
            await deleteCollection('customers');
            await deleteCollection('sales');
            await deleteCollection('expenses');
            await deleteCollection('waste');
            await deleteCollection('creditPayments');
            showToast('✅ All data deleted!');
            if (isScreenActive('dashboardScreen')) refreshDash();
        } catch (err) {
            console.error(err);
            showToast('❌ Error deleting data', 'error');
        }
    });
}


// ============ APP START ============
function startApp() {
    console.log('🫓 Meri Dukaan v4.0 Starting...');
    applyTheme();

    // After splash animation completes
    setTimeout(function() {
        // Handle redirect result first (for PWA Google Sign-In)
        auth.getRedirectResult().then(function(result) {
            // If result.user exists, onAuthStateChanged will handle it
        }).catch(function(err) {
            console.log('Redirect:', err.message || err);
        });

        // Listen for auth state changes
        auth.onAuthStateChanged(function(user) {
            if (user) {
                handleAuthenticated(user);
            } else {
                goTo('loginScreen');
                // Reset login button
                var btn = document.getElementById('googleBtn');
                if (btn) {
                    btn.disabled = false;
                    btn.querySelector('span').textContent = 'Sign in with Google';
                }
            }
        });
    }, 1500);
}

// ============ LAUNCH ============
startApp();