/* ================================================
   MERI DUKAAN v8.0 — AUTHENTICATION & NAVIGATION
   Google Auth · PIN (sessionStorage) · WebAuthn
   Firestore listeners with 90-day date limits
   ================================================ */

import { initializeApp }                        from 'firebase/app';
import { getAuth, GoogleAuthProvider,
         signInWithPopup, signOut,
         onAuthStateChanged }                   from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc,
         collection, query, where, orderBy,
         limit, onSnapshot, serverTimestamp }   from 'firebase/firestore';
import { firebaseConfig }                       from './firebase-config.js';
import { getState, setState, subscribe }        from './state.js';
import { t, setLang }                           from './i18n.js';
import { showToast, showConfirm, sha256,
         todayStr, showSkeletons, getGreeting } from './core.js';

// ── Firebase init ────────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── Unsubscribe handles for Firestore listeners ──────────────────────────
const _unsubs = [];
function clearListeners() { _unsubs.forEach(fn => fn()); _unsubs.length = 0; }

// ── Boot sequence ────────────────────────────────────────────────────────
let _splashDone = false;
let _authResult = null;

export function startApp() {
  // Adaptive splash: at most 700ms, proceed as soon as auth resolves
  const splashMinimum = new Promise(r => setTimeout(r, 700));

  onAuthStateChanged(auth, async (user) => {
    _authResult = user;
    await splashMinimum;

    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('splash--hide');

    if (user) {
      await handleAuthenticated(user);
    } else {
      goTo('loginScreen');
    }
  });
}

// ── Google Sign In ───────────────────────────────────────────────────────
export async function signInWithGoogle() {
  const btn = document.getElementById('googleSignInBtn');
  if (btn) btn.disabled = true;
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // onAuthStateChanged will fire and call handleAuthenticated
  } catch (err) {
    console.error('[auth] sign-in error', err);
    const friendly = {
      'auth/popup-closed-by-user':       'Sign-in was cancelled.',
      'auth/popup-blocked':              'Pop-up was blocked. Please allow pop-ups for this site.',
      'auth/network-request-failed':     'Network error. Check your connection.',
      'auth/web-storage-unsupported':    'Your browser blocks storage. Try Chrome or Safari.',
    };
    showToast(friendly[err.code] || `Sign-in failed: ${err.message}`, 'error', 5000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Sign Out ─────────────────────────────────────────────────────────────
export async function signOutApp() {
  const confirmed = await showConfirm('👋', 'Sign Out?', 'You will need to sign in and enter your PIN again.');
  if (!confirmed) return;
  clearListeners();
  setState({ firebaseUser: null, bizId: null, allSales: [], allExpenses: [],
             allCustomers: [], allCreditPayments: [], allNotes: [], allWaste: [] });
  sessionStorage.removeItem('mdSessionToken');
  await signOut(auth);
  goTo('loginScreen');
}

// ── Handle authenticated user ────────────────────────────────────────────
let _isSettingUp = false;
async function handleAuthenticated(user) {
  if (_isSettingUp) return;   // prevent double-fire from onAuthStateChanged
  _isSettingUp = true;

  try {
    setState({ firebaseUser: user, ownerEmail: user.email || '' });

    // Load or create business document
    const snap = await _findOrCreateBiz(user);
    const biz  = snap.data();

    setState({
      bizId:        snap.id,
      isOwner:      biz.ownerUid === user.uid,
      businessName: biz.businessName || 'My Business',
      upiVpa:       biz.upiVpa      || '',
      weekStart:    biz.weekStart   !== undefined ? biz.weekStart : 1,
      memberEmails: biz.memberEmails || [],
    });

    // Language preference
    const savedLang = localStorage.getItem('mdLang') || biz.language || 'en';
    setLang(savedLang);

    // Check for session token (already PIN'd this session)
    const sessionToken = sessionStorage.getItem('mdSessionToken');
    const expectedToken = await sha256(snap.id + user.uid + biz.pin || '');
    if (biz.pin && sessionToken === expectedToken) {
      // Already verified this session — go straight to app
      await _afterPinSuccess(snap.id, biz);
      return;
    }

    // Show PIN screen (or setup screen if no PIN yet)
    if (!biz.pin) {
      goTo('pinSetupScreen');
    } else {
      goTo('pinScreen');
    }

  } catch (err) {
    console.error('[auth] handleAuthenticated error', err);
    showToast(t('error_load'), 'error');
    goTo('loginScreen');
  } finally {
    _isSettingUp = false;
  }
}

async function _findOrCreateBiz(user) {
  // Check if user is an OWNER of a business
  const ownerRef = collection(db, 'businesses');
  const ownerQ   = query(ownerRef, where('ownerUid', '==', user.uid), limit(1));
  const ownerSnap = await new Promise((resolve, reject) => {
    const unsub = onSnapshot(ownerQ, snap => { unsub(); resolve(snap); }, reject);
  });

  if (!ownerSnap.empty) return ownerSnap.docs[0];

  // Check if user is a STAFF member (email in memberEmails)
  const staffQ  = query(ownerRef, where('memberEmails', 'array-contains', user.email), limit(1));
  const staffSnap = await new Promise((resolve, reject) => {
    const unsub = onSnapshot(staffQ, snap => { unsub(); resolve(snap); }, reject);
  });
  if (!staffSnap.empty) return staffSnap.docs[0];

  // New user — create business document
  const bizRef = doc(collection(db, 'businesses'));
  const bizData = {
    ownerUid:     user.uid,
    ownerEmail:   user.email,
    ownerName:    user.displayName || '',
    businessName: 'My Roti Business',
    memberEmails: [],
    pin:          '',
    pinVersion:   0,
    upiVpa:       '',
    weekStart:    1,
    language:     'en',
    createdAt:    serverTimestamp(),
  };
  await setDoc(bizRef, bizData);
  return { id: bizRef.id, data: () => bizData };
}

// ── PIN Screen ───────────────────────────────────────────────────────────
let _pinIn        = '';
let _pinTarget    = '';      // for setup: 1st entry
let _pinVerifying = false;
let _pinAttempts  = 0;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS   = 30 * 60 * 1000;

export function pinKey(digit) {
  if (_pinVerifying) return;
  if (_pinIn.length >= 4) return;
  _pinIn += digit;
  _updatePinDots(_pinIn.length);
  if (_pinIn.length === 4) setTimeout(_handlePinComplete, 80);
}

export function pinBackspace() {
  if (_pinIn.length === 0) return;
  _pinIn = _pinIn.slice(0, -1);
  _updatePinDots(_pinIn.length);
}

function _updatePinDots(count) {
  const dots = document.querySelectorAll('#pinDots .pin-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('pin-dot--filled', i < count);
  });
  // Screen-reader announcement
  const sr = document.getElementById('pinSrStatus');
  if (sr) sr.textContent = t('pin_attempts_left', count === 4 ? 'Checking…' : `${count} of 4 digits entered`);
}

async function _handlePinComplete() {
  const screen = getState('currentScreen');

  if (screen === 'pinSetupScreen') {
    // First entry
    if (!_pinTarget) {
      _pinTarget = _pinIn;
      _pinIn     = '';
      _updatePinDots(0);
      // Change label to "Confirm PIN"
      const lbl = document.getElementById('pinScreenLabel');
      if (lbl) lbl.textContent = t('confirm_pin');
      return;
    }
    // Second entry: confirm
    if (_pinIn !== _pinTarget) {
      _pinTarget = '';
      _pinIn     = '';
      _updatePinDots(0);
      _pinShake();
      showToast(t('pin_mismatch'), 'error');
      const lbl = document.getElementById('pinScreenLabel');
      if (lbl) lbl.textContent = t('setup_pin');
      return;
    }
    // Match: save PIN
    await _savePinAndProceed(_pinIn);
    return;
  }

  // Normal PIN verification
  if (screen === 'pinScreen') {
    await _verifyPin(_pinIn);
  }
}

async function _verifyPin(entered) {
  if (_pinVerifying) return;

  // Lockout check
  const lockUntil = parseInt(sessionStorage.getItem('mdPinLockUntil') || '0');
  if (Date.now() < lockUntil) {
    const mins = Math.ceil((lockUntil - Date.now()) / 60000);
    showToast(`${t('pin_locked')} (${mins}m remaining)`, 'error', 5000);
    _pinIn = ''; _updatePinDots(0);
    return;
  }

  _pinVerifying = true;
  try {
    const bizId   = getState('bizId');
    const bizSnap = await getDoc(doc(db, 'businesses', bizId));
    if (!bizSnap.exists()) throw new Error('Business not found');
    const storedHash = bizSnap.data().pin;
    const enteredHash = await sha256(entered);

    if (enteredHash === storedHash) {
      // ✅ Correct
      _pinAttempts = 0;
      sessionStorage.removeItem('mdPinLockUntil');
      // Haptic
      if (navigator.vibrate) navigator.vibrate(50);
      // Store session token so we skip PIN on refresh within session
      const token = await sha256(bizId + getState('firebaseUser').uid + storedHash);
      sessionStorage.setItem('mdSessionToken', token);
      await _afterPinSuccess(bizId, bizSnap.data());
    } else {
      // ❌ Wrong
      _pinAttempts++;
      _pinIn = ''; _updatePinDots(0);
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      _pinShake();

      if (_pinAttempts >= PIN_MAX_ATTEMPTS) {
        sessionStorage.setItem('mdPinLockUntil', Date.now() + PIN_LOCKOUT_MS);
        _pinAttempts = 0;
        showToast(t('pin_locked'), 'error', 6000);
      } else {
        const left = PIN_MAX_ATTEMPTS - _pinAttempts;
        showToast(`${t('pin_wrong')} — ${t('pin_attempts_left', left)}`, 'error');
      }
    }
  } catch (err) {
    console.error('[auth] pin verify error', err);
    showToast(t('err_generic'), 'error');
    _pinIn = ''; _updatePinDots(0);
  } finally {
    _pinVerifying = false;
  }
}

async function _savePinAndProceed(pin) {
  const bizId = getState('bizId');
  const hash  = await sha256(pin);
  await setDoc(doc(db, 'businesses', bizId), { pin: hash, pinVersion: 1 }, { merge: true });
  showToast('✅ PIN set successfully!', 'success');
  const token = await sha256(bizId + getState('firebaseUser').uid + hash);
  sessionStorage.setItem('mdSessionToken', token);
  await _afterPinSuccess(bizId, { pin: hash });
}

function _pinShake() {
  const dots = document.getElementById('pinDots');
  if (!dots) return;
  dots.classList.add('pin-shake');
  setTimeout(() => dots.classList.remove('pin-shake'), 500);
}

// ── WebAuthn Biometric ───────────────────────────────────────────────────
export async function tryBiometricLogin() {
  if (!window.PublicKeyCredential) return false;
  const bizId = getState('bizId');
  const credId = localStorage.getItem(`mdBioCredId_${bizId}`);
  if (!credId) return false;

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: _base64ToBuffer(credId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 30000
      }
    });
    if (assertion) {
      if (navigator.vibrate) navigator.vibrate(50);
      const bizSnap = await getDoc(doc(db, 'businesses', bizId));
      const token   = await sha256(bizId + getState('firebaseUser').uid + bizSnap.data().pin);
      sessionStorage.setItem('mdSessionToken', token);
      await _afterPinSuccess(bizId, bizSnap.data());
      return true;
    }
  } catch (err) {
    if (err.name !== 'NotAllowedError') console.warn('[auth] biometric error', err);
  }
  return false;
}

export async function registerBiometric() {
  if (!window.PublicKeyCredential) { showToast('Biometric not supported on this device', 'error'); return; }
  const bizId = getState('bizId');
  const user  = getState('firebaseUser');
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp:      { name: 'Meri Dukaan', id: location.hostname },
        user:    { id: new TextEncoder().encode(bizId), name: user.email, displayName: user.displayName || 'Owner' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { userVerification: 'required', requireResidentKey: false },
        timeout: 30000
      }
    });
    const credId = _bufferToBase64(cred.rawId);
    localStorage.setItem(`mdBioCredId_${bizId}`, credId);
    showToast('✅ Fingerprint unlock enabled!', 'success');
  } catch (err) {
    showToast('Could not register biometric — ' + err.message, 'error');
  }
}

function _bufferToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function _base64ToBuffer(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
}

// ── After successful PIN ─────────────────────────────────────────────────
async function _afterPinSuccess(bizId, biz) {
  setState({ dataLoading: true });
  goTo('dashboardScreen');
  showSkeletons('dashboardSalesPreview', 4);
  showSkeletons('dashboardExpPreview',   3);
  await _setupListeners(bizId);
  _updateDashboardGreeting();
  // Try to register FCM
  const { initFCM } = await import('./fcm.js');
  initFCM().catch(e => console.warn('[auth] FCM init:', e));
}

// ── Firestore Listeners (90-day window) ──────────────────────────────────
async function _setupListeners(bizId) {
  clearListeners();

  // 90 days ago
  const d90 = new Date(); d90.setDate(d90.getDate() - 90);
  const ago90 = `${d90.getFullYear()}-${String(d90.getMonth()+1).padStart(2,'0')}-${String(d90.getDate()).padStart(2,'0')}`;

  const biz = (col) => collection(db, 'businesses', bizId, col);

  // Sales — last 90 days, excluding soft-deleted
  const salesQ = query(biz('sales'),
    where('date', '>=', ago90),
    where('deleted', '!=', true),
    orderBy('date', 'desc'));

  // Expenses — last 90 days
  const expQ = query(biz('expenses'), where('date', '>=', ago90), orderBy('date', 'desc'));

  // Waste — last 90 days
  const wasteQ = query(biz('waste'), where('date', '>=', ago90), orderBy('date', 'desc'));

  // Customers, notes, creditPayments — no date limit (small collections)
  const custQ   = query(biz('customers'),       orderBy('name'));
  const creditQ = query(biz('creditPayments'),  orderBy('date', 'desc'));
  const notesQ  = query(biz('notes'),           orderBy('date', 'desc'));

  function toArr(snap) {
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const listeners = [
    [salesQ,   'allSales'],
    [expQ,     'allExpenses'],
    [wasteQ,   'allWaste'],
    [custQ,    'allCustomers'],
    [creditQ,  'allCreditPayments'],
    [notesQ,   'allNotes'],
  ];

  let loadedCount = 0;
  listeners.forEach(([q, key]) => {
    const unsub = onSnapshot(q,
      snap => {
        setState({ [key]: toArr(snap) });
        loadedCount++;
        if (loadedCount >= listeners.length) {
          setState({ dataLoading: false });
          _onDataReady();
        }
        // Refresh current screen
        _refreshCurrentScreen(key);
      },
      err => console.error(`[auth] listener error (${key})`, err)
    );
    _unsubs.push(unsub);
  });
}

function _onDataReady() {
  _updateDashboardGreeting();
  _updateDashboard();
}

function _refreshCurrentScreen(changedKey) {
  const screen = getState('currentScreen');
  const refreshMap = {
    allSales:         ['dashboardScreen', 'salesScreen', 'quickSaleScreen', 'reportScreen', 'analyticsScreen'],
    allExpenses:      ['dashboardScreen', 'expenseScreen', 'reportScreen', 'analyticsScreen'],
    allCustomers:     ['customerScreen', 'quickSaleScreen'],
    allCreditPayments:['creditScreen'],
    allNotes:         ['notebookScreen'],
    allWaste:         ['wasteScreen', 'analyticsScreen'],
  };
  if ((refreshMap[changedKey] || []).includes(screen)) {
    _callScreenRefresh(screen);
  }
}

function _callScreenRefresh(screen) {
  const map = {
    dashboardScreen: _updateDashboard,
    salesScreen:     () => import('./data.js').then(m => m.renderSales()),
    quickSaleScreen: () => import('./data.js').then(m => m.loadQuickSale()),
    customerScreen:  () => import('./data.js').then(m => m.loadCusts()),
    creditScreen:    () => import('./data.js').then(m => m.loadCredit()),
    expenseScreen:   () => import('./data.js').then(m => m.loadExps()),
    wasteScreen:     () => import('./data.js').then(m => m.loadWasteList()),
    notebookScreen:  () => import('./notebook.js').then(m => m.loadNotes()),
    reportScreen:    () => import('./reports.js').then(m => m.loadReport()),
    analyticsScreen: () => import('./analytics.js').then(m => m.renderAnalytics()),
  };
  if (map[screen]) map[screen]();
}

// ── Navigation ───────────────────────────────────────────────────────────
export function goTo(screenId, opts = {}) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('screen--active');
    s.setAttribute('aria-hidden', 'true');
  });

  const el = document.getElementById(screenId);
  if (!el) { console.warn('[auth] screen not found:', screenId); return; }
  el.classList.add('screen--active');
  el.setAttribute('aria-hidden', 'false');

  setState({ currentScreen: screenId });

  // Show/hide bottom nav
  const nav = document.getElementById('bottomNav');
  const noNav = ['loginScreen', 'pinScreen', 'pinSetupScreen', 'splash'];
  if (nav) nav.classList.toggle('nav--hidden', noNav.includes(screenId));

  // Update nav active state
  document.querySelectorAll('[data-nav-screen]').forEach(btn => {
    btn.classList.toggle('nav-btn--active', btn.dataset.navScreen === screenId);
    btn.setAttribute('aria-current', btn.dataset.navScreen === screenId ? 'page' : 'false');
  });

  // Screen-specific init
  _callScreenRefresh(screenId);
}

// ── Dashboard updates ────────────────────────────────────────────────────
function _updateDashboardGreeting() {
  const el = document.getElementById('dashGreeting');
  if (el) el.textContent = getGreeting(getState('businessName'));
}

let _dashPeriod = 'today';
export function setDashPeriod(period) {
  _dashPeriod = period;
  document.querySelectorAll('[data-dash-period]').forEach(btn => {
    btn.classList.toggle('period-btn--active', btn.dataset.dashPeriod === period);
  });
  _updateDashboard();
}

function _updateDashboard() {
  const { allSales, allExpenses, allCreditPayments, weekStart } = {
    allSales:          getState('allSales'),
    allExpenses:       getState('allExpenses'),
    allCreditPayments: getState('allCreditPayments'),
    weekStart:         getState('weekStart'),
  };

  const today = todayStr();
  let range;
  if (_dashPeriod === 'today')  range = { start: today, end: today };
  if (_dashPeriod === 'week')   { const { getPeriodRange } = require('./core.js'); range = getPeriodRange('weekly',  today, weekStart); }
  if (_dashPeriod === 'month')  { const { getPeriodRange } = require('./core.js'); range = getPeriodRange('monthly', today, weekStart); }
  if (_dashPeriod === 'year')   range = { start: `${new Date().getFullYear()}-01-01`, end: today };

  const { dataInRange, fmtCurrency, animateCounter } = {
    dataInRange:   require('./core.js').dataInRange,
    fmtCurrency:   require('./core.js').fmtCurrency,
    animateCounter:require('./core.js').animateCounter,
  };

  const sales = dataInRange(allSales, range.start, range.end);
  const exps  = dataInRange(allExpenses, range.start, range.end);

  const totalRevenue = sales.reduce((s, x) => s + (x.total  || 0), 0);
  const cashRevenue  = sales.filter(x => x.payType === 'cash').reduce((s,x) => s + (x.total||0), 0);
  const upiRevenue   = sales.filter(x => x.payType === 'upi' ).reduce((s,x) => s + (x.total||0), 0);
  const creditGiven  = sales.filter(x => x.payType === 'credit').reduce((s,x) => s + (x.total||0), 0);
  const totalExp     = exps.reduce((s, x) => s + (x.amount || 0), 0);
  const cashExp      = exps.filter(x => (x.note||'').includes('cash') || true).reduce((s,x) => s + (x.amount||0), 0);
  const profit       = totalRevenue - totalExp;
  const cashInHand   = cashRevenue - totalExp; // simplified

  const _setCard = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtCurrency(val);
  };

  _setCard('dashRevenue', totalRevenue);
  _setCard('dashExpenses', totalExp);
  _setCard('dashProfit', profit);
  _setCard('dashCashInHand', cashInHand);
  _setCard('dashUpiReceived', upiRevenue);
  _setCard('dashCreditGiven', creditGiven);

  // Profit card color
  const profitCard = document.getElementById('dashProfitCard');
  if (profitCard) profitCard.classList.toggle('stat-card--loss', profit < 0);

  // Recent sales/expenses previews
  _renderRecentSales(sales.slice(0, 5));
  _renderRecentExps(exps.slice(0, 4));
}

function _renderRecentSales(sales) {
  const el = document.getElementById('dashboardSalesPreview');
  if (!el) return;
  const { fmtCurrency, fmtDate, esc } = require('./core.js');
  const custs = getState('allCustomers');

  if (!sales.length) {
    el.innerHTML = `<div class="empty-mini"><p>${t('no_sales_today')}</p></div>`;
    return;
  }
  el.innerHTML = sales.map(s => {
    const cust = custs.find(c => c.id === s.customerId);
    const custName = cust ? esc(cust.name) : 'Unknown';
    const payIcon  = s.payType === 'cash' ? '💵' : s.payType === 'upi' ? '📱' : '📒';
    return `<div class="preview-row">
      <div class="preview-row__info">
        <span class="preview-row__name">${custName}</span>
        <span class="preview-row__meta">${s.qty} roti · ${fmtDate(s.date)}</span>
      </div>
      <div class="preview-row__right">
        <span class="preview-row__amt">${fmtCurrency(s.total)}</span>
        <span class="preview-row__pay">${payIcon}</span>
      </div>
    </div>`;
  }).join('');
}

function _renderRecentExps(exps) {
  const el = document.getElementById('dashboardExpPreview');
  if (!el) return;
  const { fmtCurrency, fmtDate, esc } = require('./core.js');
  if (!exps.length) {
    el.innerHTML = `<div class="empty-mini"><p>${t('no_expenses_today')}</p></div>`;
    return;
  }
  el.innerHTML = exps.map(e =>
    `<div class="preview-row">
      <div class="preview-row__info">
        <span class="preview-row__name">${esc(e.category)}</span>
        <span class="preview-row__meta">${esc(e.note || '')} · ${fmtDate(e.date)}</span>
      </div>
      <span class="preview-row__amt preview-row__amt--exp">${fmtCurrency(e.amount)}</span>
    </div>`
  ).join('');
}

// ── Date Picker (reusable, replaces auth.js calendar in v7) ──────────────
let _dpCallback = null;
let _dpViewYear = 0;
let _dpViewMonth = 0;
let _dpMaxDate = '';

export function openDatePicker(currentDate, onPick, opts = {}) {
  const d = currentDate ? new Date(currentDate) : new Date();
  _dpViewYear  = d.getFullYear();
  _dpViewMonth = d.getMonth();
  _dpCallback  = onPick;
  _dpMaxDate   = opts.maxDate || '';
  _renderCalendar();
  const { openOverlay } = require('./core.js');
  openOverlay('datepickerOverlay');
}

export function dpNavMonth(delta) {
  _dpViewMonth += delta;
  if (_dpViewMonth < 0)  { _dpViewMonth = 11; _dpViewYear--; }
  if (_dpViewMonth > 11) { _dpViewMonth = 0;  _dpViewYear++; }
  _renderCalendar();
}

export function dpPickDate(dateStr) {
  if (_dpCallback) _dpCallback(dateStr);
  const { closeOverlay } = require('./core.js');
  closeOverlay('datepickerOverlay');
}

const _MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const _DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function _renderCalendar() {
  const grid   = document.getElementById('dpGrid');
  const title  = document.getElementById('dpMonthTitle');
  if (!grid || !title) return;

  title.textContent = `${_MONTH_NAMES[_dpViewMonth]} ${_dpViewYear}`;

  const weekStart = getState('weekStart');
  const today     = todayStr();
  const maxDate   = _dpMaxDate || today;

  const firstDay = new Date(_dpViewYear, _dpViewMonth, 1).getDay();
  const daysInMo = new Date(_dpViewYear, _dpViewMonth + 1, 0).getDate();
  const offset   = (firstDay - weekStart + 7) % 7;
  const pad      = (n) => String(n).padStart(2, '0');
  const fmt      = (y, m, d) => `${y}-${pad(m+1)}-${pad(d)}`;

  // Day labels
  const labels = Array.from({ length: 7 }, (_, i) => _DAY_LABELS[(weekStart + i) % 7]);

  let h = labels.map(l => `<div class="dp-day-label">${l}</div>`).join('');
  for (let i = 0; i < offset; i++) h += '<div></div>';
  for (let day = 1; day <= daysInMo; day++) {
    const ds      = fmt(_dpViewYear, _dpViewMonth, day);
    const isToday = ds === today;
    const isFuture = ds > maxDate;
    h += `<button class="dp-day${isToday ? ' dp-day--today' : ''}${isFuture ? ' dp-day--disabled' : ''}"
            ${isFuture ? 'disabled' : ''}
            onclick="dpPickDate('${ds}')"
            aria-label="${fmtDateLong(ds)}">${day}</button>`;
  }
  grid.innerHTML = h;
}

// Make navigation functions global so HTML onclick works
window.signInWithGoogle = signInWithGoogle;
window.signOutApp       = signOutApp;
window.goTo             = goTo;
window.pinKey           = pinKey;
window.pinBackspace     = pinBackspace;
window.dpNavMonth       = dpNavMonth;
window.dpPickDate       = dpPickDate;
window.tryBiometricLogin = tryBiometricLogin;
window.registerBiometric = registerBiometric;
window.setDashPeriod    = setDashPeriod;

console.log('[auth] Meri Dukaan v8.0 — auth module ready');
// Start the app
startApp();
