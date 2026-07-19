/* MERI DUKAAN v8 — Auth, PIN, Navigation, Dashboard
   FIX: signInWithRedirect instead of signInWithPopup
   (GitHub Pages has COOP headers that block popups)        */

var _unsubs    = [];
var _splashMin = new Promise(function(r) { setTimeout(r, 700); });
var _isSetup   = false;

/* ── Boot ── */
window.addEventListener('DOMContentLoaded', function() {

  /* ✅ FIX: Check redirect result FIRST (GitHub Pages auth fix) */
  auth.getRedirectResult().then(function(result) {
    if (result && result.user) {
      console.log('[auth] Redirect sign-in successful');
    }
  }).catch(function(err) {
    /* Ignore "no redirect" errors — they fire on every normal page load */
    if (err.code !== 'auth/no-auth-event' &&
        err.code !== 'auth/null-user'      &&
        err.code !== 'auth/cancelled-popup-request') {
      console.warn('[auth] Redirect result error:', err.code, err.message);
    }
  });

  /* Auth state listener — fires after redirect OR normal login */
  auth.onAuthStateChanged(function(user) {
    _splashMin.then(function() {
      _hideSplash();
      if (user) { handleAuthenticated(user); }
      else       { goTo('loginScreen'); }
    });
  });
});

function _hideSplash() {
  var s = document.getElementById('splash');
  if (s) { s.classList.add('splash--hide'); setTimeout(function(){ s.style.display='none'; }, 400); }
}

/* ── Google Sign-in (REDIRECT — works on GitHub Pages) ── */
function signInWithGoogle() {
  var btn = document.getElementById('googleSignInBtn');
  if (btn) {
    btn.disabled    = true;
    btn.textContent = 'Redirecting to Google…';
  }
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  /* signInWithRedirect: page navigates to Google, then comes back.
     No popup = no COOP errors on GitHub Pages.                     */
  auth.signInWithRedirect(provider).catch(function(err) {
    console.error('[auth] redirect error:', err);
    showToast('Sign-in error: ' + err.message, 'error', 5000);
    if (btn) { btn.disabled = false; btn.textContent = 'Sign in with Google'; }
  });
}

/* ── Sign Out ── */
function signOutApp() {
  showConfirm('👋', 'Sign Out?', 'You will need to sign in again.').then(function(ok) {
    if (!ok) return;
    _clearListeners();
    AppState.firebaseUser    = null;
    AppState.bizId           = null;
    AppState.allSales        = [];
    AppState.allExpenses     = [];
    AppState.allCustomers    = [];
    AppState.allCreditPayments = [];
    AppState.allNotes        = [];
    AppState.allWaste        = [];
    sessionStorage.removeItem('mdSess');
    auth.signOut().then(function() { goTo('loginScreen'); });
  });
}

/* ── Handle Authenticated User ── */
function handleAuthenticated(user) {
  if (_isSetup) return;
  _isSetup = true;
  AppState.firebaseUser = user;
  AppState.ownerEmail   = user.email || '';

  _findOrCreateBiz(user).then(function(snap) {
    var biz = snap.data();
    AppState.bizId        = snap.id;
    AppState.isOwner      = biz.ownerUid === user.uid;
    AppState.businessName = biz.businessName || 'My Business';
    AppState.upiVpa       = biz.upiVpa       || '';
    AppState.weekStart    = biz.weekStart !== undefined ? biz.weekStart : 1;
    AppState.memberEmails = biz.memberEmails  || [];

    var lang = localStorage.getItem('mdLang') || biz.language || 'en';
    setLang(lang);

    return sha256(snap.id + user.uid + (biz.pin || '')).then(function(expected) {
      var sess = sessionStorage.getItem('mdSess');
      if (biz.pin && sess === expected) { return _afterPin(); }
      if (!biz.pin) { _isSetup = false; goTo('pinSetupScreen'); }
      else          { _isSetup = false; goTo('pinScreen'); }
    });
  }).catch(function(err) {
    console.error('[auth] handleAuthenticated error:', err.code, err.message);
    _isSetup = false;
    /* Permissions error = Firestore rules not published yet */
    if (err.code === 'permission-denied' || err.message.indexOf('permission') !== -1) {
      showToast('⚠️ Firestore rules not published — see instructions below', 'error', 8000);
      _showRulesHelper();
    } else {
      showToast('Error: ' + err.message, 'error', 5000);
    }
    goTo('loginScreen');
  });
}

/* Show a helpful overlay when rules are missing */
function _showRulesHelper() {
  var el = document.getElementById('rulesHelperMsg');
  if (el) el.style.display = 'block';
}

function _findOrCreateBiz(user) {
  var ref = db.collection('businesses');
  return ref.where('ownerUid', '==', user.uid).limit(1).get()
    .then(function(snap) {
      if (!snap.empty) return snap.docs[0];
      return ref.where('memberEmails', 'array-contains', user.email).limit(1).get()
        .then(function(s2) {
          if (!s2.empty) return s2.docs[0];
          /* New user — create business */
          var newRef = ref.doc();
          var data = {
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
            createdAt:    serverTimestamp()
          };
          return newRef.set(data).then(function() {
            return { id: newRef.id, data: function() { return data; } };
          });
        });
    });
}

/* ── PIN ── */
var _pinIn = '', _pinVerifying = false, _pinAttempts = 0, _pinTarget = '';
var PIN_MAX = 5, PIN_LOCKOUT = 30 * 60 * 1000;

function pinKey(d) {
  if (_pinVerifying || _pinIn.length >= 4) return;
  _pinIn += d;
  _updateDots(_pinIn.length);
  if (_pinIn.length === 4) setTimeout(_handlePin, 80);
}
function pinBackspace() {
  if (!_pinIn.length) return;
  _pinIn = _pinIn.slice(0, -1);
  _updateDots(_pinIn.length);
}
function _updateDots(n) {
  document.querySelectorAll('.pin-dot').forEach(function(d, i) {
    d.classList.toggle('pin-dot--filled', i < n);
  });
  var sr = document.getElementById('pinSr');
  if (sr) sr.textContent = n + ' of 4 digits entered';
}
function _pinShake() {
  var d = document.getElementById('pinDots');
  if (!d) return;
  d.classList.add('pin-shake');
  setTimeout(function() { d.classList.remove('pin-shake'); }, 500);
}

function _handlePin() {
  var screen = AppState.currentScreen;
  if (screen === 'pinSetupScreen') {
    if (!_pinTarget) {
      _pinTarget = _pinIn; _pinIn = ''; _updateDots(0);
      var lbl = document.getElementById('pinLabel');
      if (lbl) lbl.textContent = t('confirm_pin');
    } else {
      if (_pinIn !== _pinTarget) {
        _pinTarget = ''; _pinIn = ''; _updateDots(0);
        _pinShake();
        showToast(t('pin_mismatch'), 'error');
        var lbl2 = document.getElementById('pinLabel');
        if (lbl2) lbl2.textContent = t('setup_pin');
        return;
      }
      _savePin(_pinIn);
    }
    return;
  }
  _verifyPin(_pinIn);
}

function _verifyPin(entered) {
  if (_pinVerifying) return;
  var lockUntil = parseInt(sessionStorage.getItem('mdPinLock') || '0');
  if (Date.now() < lockUntil) {
    var mins = Math.ceil((lockUntil - Date.now()) / 60000);
    showToast(t('pin_locked') + ' (' + mins + 'm)', 'error', 5000);
    _pinIn = ''; _updateDots(0);
    return;
  }
  _pinVerifying = true;
  bizRef().get().then(function(snap) {
    if (!snap.exists) throw new Error('Business not found');
    return sha256(entered).then(function(hash) {
      if (hash === snap.data().pin) {
        _pinAttempts = 0;
        sessionStorage.removeItem('mdPinLock');
        if (navigator.vibrate) navigator.vibrate(50);
        return sha256(AppState.bizId + AppState.firebaseUser.uid + snap.data().pin).then(function(tok) {
          sessionStorage.setItem('mdSess', tok);
          return _afterPin();
        });
      } else {
        _pinAttempts++;
        _pinIn = ''; _updateDots(0);
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        _pinShake();
        if (_pinAttempts >= PIN_MAX) {
          sessionStorage.setItem('mdPinLock', Date.now() + PIN_LOCKOUT);
          _pinAttempts = 0;
          showToast(t('pin_locked'), 'error', 6000);
        } else {
          var left = PIN_MAX - _pinAttempts;
          showToast(t('pin_wrong') + ' — ' + left + ' attempt' + (left === 1 ? '' : 's') + ' left', 'error');
        }
      }
    });
  }).catch(function(err) {
    console.error('[PIN]', err);
    showToast(t('err_generic'), 'error');
    _pinIn = ''; _updateDots(0);
  }).finally(function() { _pinVerifying = false; });
}

function _savePin(pin) {
  sha256(pin).then(function(hash) {
    return bizRef().update({ pin: hash, pinVersion: serverTimestamp() }).then(function() {
      showToast('✅ PIN set!', 'success');
      return sha256(AppState.bizId + AppState.firebaseUser.uid + hash).then(function(tok) {
        sessionStorage.setItem('mdSess', tok);
        return _afterPin();
      });
    });
  }).catch(function() { showToast(t('err_save'), 'error'); });
}

function _afterPin() {
  AppState.dataLoading = true;
  goTo('dashboardScreen');
  showSkeletons('dashSalesPreview', 4);
  showSkeletons('dashExpPreview', 3);
  _setupListeners();
}

/* ── Firestore Listeners ── */
function _clearListeners() { _unsubs.forEach(function(u) { u(); }); _unsubs.length = 0; }

function _setupListeners() {
  _clearListeners();
  var d90 = new Date(); d90.setDate(d90.getDate() - 90);
  var ago = d90.getFullYear() + '-' + pad2(d90.getMonth() + 1) + '-' + pad2(d90.getDate());
  var bizId = AppState.bizId;
  var b = function(col) { return db.collection('businesses').doc(bizId).collection(col); };
  var loaded = 0, total = 6;

  function onLoad() {
    loaded++;
    if (loaded >= total) {
      AppState.dataLoading = false;
      _updateDashboard();
    }
  }
  function toArr(snap) {
    return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
  }
  function listen(q, key, extra) {
    var unsub = q.onSnapshot(function(snap) {
      var arr = toArr(snap);
      if (key === 'allSales') arr = arr.filter(function(s) { return !s.deleted; });
      AppState[key] = arr;
      onLoad();
      _refreshCurrentScreen(key);
      if (extra) extra();
    }, function(err) { console.error('[listener]', key, err.code); onLoad(); });
    _unsubs.push(unsub);
  }

  listen(b('sales').where('date', '>=', ago).orderBy('date', 'desc'),          'allSales');
  listen(b('expenses').where('date', '>=', ago).orderBy('date', 'desc'),        'allExpenses');
  listen(b('waste').where('date', '>=', ago).orderBy('date', 'desc'),           'allWaste');
  listen(b('customers').orderBy('name'),                                          'allCustomers');
  listen(b('creditPayments').orderBy('date', 'desc'),                            'allCreditPayments');
  listen(b('notes').orderBy('date', 'desc'),                                     'allNotes');
}

function _refreshCurrentScreen(key) {
  var s = AppState.currentScreen;
  var map = {
    allSales:          ['dashboardScreen','salesScreen','quickSaleScreen','reportScreen','analyticsScreen'],
    allExpenses:       ['dashboardScreen','expenseScreen','reportScreen','analyticsScreen'],
    allCustomers:      ['customerScreen','quickSaleScreen'],
    allCreditPayments: ['creditScreen'],
    allNotes:          ['notebookScreen'],
    allWaste:          ['wasteScreen','analyticsScreen']
  };
  if (map[key] && map[key].indexOf(s) !== -1) {
    if (s === 'dashboardScreen')  _updateDashboard();
    if (s === 'salesScreen')      typeof renderSales !== 'undefined' && renderSales();
    if (s === 'quickSaleScreen')  typeof loadQuickSale !== 'undefined' && loadQuickSale();
    if (s === 'customerScreen')   typeof loadCusts !== 'undefined' && loadCusts();
    if (s === 'creditScreen')     typeof loadCredit !== 'undefined' && loadCredit();
    if (s === 'expenseScreen')    typeof loadExps !== 'undefined' && loadExps();
    if (s === 'wasteScreen')      typeof loadWasteList !== 'undefined' && loadWasteList();
    if (s === 'notebookScreen')   typeof loadNotes !== 'undefined' && loadNotes();
    if (s === 'reportScreen')     typeof loadReport !== 'undefined' && loadReport();
    if (s === 'analyticsScreen')  typeof renderAnalytics !== 'undefined' && renderAnalytics();
  }
}

/* ── Navigation ── */
function goTo(screenId) {
  document.querySelectorAll('.screen').forEach(function(s) {
    s.classList.remove('screen--active');
    s.setAttribute('aria-hidden', 'true');
  });
  var el = document.getElementById(screenId);
  if (!el) return;
  el.classList.add('screen--active');
  el.setAttribute('aria-hidden', 'false');
  AppState.currentScreen = screenId;
  var noNav = ['loginScreen', 'pinScreen', 'pinSetupScreen'];
  var nav = document.getElementById('bottomNav');
  if (nav) nav.style.display = noNav.indexOf(screenId) !== -1 ? 'none' : 'flex';
  document.querySelectorAll('[data-nav]').forEach(function(b) {
    b.classList.toggle('nav-btn--active', b.dataset.nav === screenId);
  });
  if (screenId === 'dashboardScreen' && !AppState.dataLoading) _updateDashboard();
  if (screenId === 'salesScreen')      typeof renderSales !== 'undefined'      && renderSales();
  if (screenId === 'quickSaleScreen')  typeof loadQuickSale !== 'undefined'    && loadQuickSale();
  if (screenId === 'customerScreen')   typeof loadCusts !== 'undefined'         && loadCusts();
  if (screenId === 'creditScreen')     typeof loadCredit !== 'undefined'        && loadCredit();
  if (screenId === 'expenseScreen')    typeof loadExps !== 'undefined'          && loadExps();
  if (screenId === 'wasteScreen')      typeof loadWasteList !== 'undefined'     && loadWasteList();
  if (screenId === 'notebookScreen')   typeof loadNotes !== 'undefined'         && loadNotes();
  if (screenId === 'reportScreen')     typeof loadReport !== 'undefined'        && loadReport();
  if (screenId === 'analyticsScreen')  typeof renderAnalytics !== 'undefined'   && renderAnalytics();
  if (screenId === 'settingsScreen')   typeof loadSettings !== 'undefined'      && loadSettings();
}

/* ── Dashboard ── */
var _dashPeriod = 'today';
function setDashPeriod(p) {
  _dashPeriod = p;
  document.querySelectorAll('[data-period]').forEach(function(b) {
    b.classList.toggle('period-btn--active', b.dataset.period === p);
  });
  _updateDashboard();
}

function _updateDashboard() {
  if (AppState.dataLoading) return;
  var today = todayStr(), range;
  if (_dashPeriod === 'today') range = { start: today, end: today };
  else if (_dashPeriod === 'week')  range = getPeriodRange('weekly',  today, AppState.weekStart);
  else if (_dashPeriod === 'month') range = getPeriodRange('monthly', today, AppState.weekStart);
  else if (_dashPeriod === 'year')  range = { start: today.slice(0,4) + '-01-01', end: today };

  var sales = dataInRange(AppState.allSales,    range.start, range.end);
  var exps  = dataInRange(AppState.allExpenses, range.start, range.end);

  var totalRev = sales.reduce(function(s,x){return s+(x.total||0);},0);
  var cashRev  = sales.filter(function(s){return s.payType==='cash';}).reduce(function(s,x){return s+(x.total||0);},0);
  var upiRev   = sales.filter(function(s){return s.payType==='upi'; }).reduce(function(s,x){return s+(x.total||0);},0);
  var credGiven= sales.filter(function(s){return s.payType==='credit';}).reduce(function(s,x){return s+(x.total||0);},0);
  var totalExp = exps.reduce(function(s,x){return s+(x.amount||0);},0);
  var profit   = totalRev - totalExp;
  var cashHand = cashRev  - totalExp;

  function setEl(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  setEl('dashRevenue', fmtCurrency(totalRev));
  setEl('dashExpenses',fmtCurrency(totalExp));
  setEl('dashProfit',  fmtCurrency(profit));
  setEl('dashCashHand',fmtCurrency(cashHand));
  setEl('dashUpi',     fmtCurrency(upiRev));
  setEl('dashCredit',  fmtCurrency(credGiven));

  var pc = document.getElementById('dashProfitCard');
  if (pc) pc.classList.toggle('card--loss', profit < 0);

  var gr = document.getElementById('dashGreeting');
  if (gr) gr.textContent = getGreeting(AppState.businessName);

  _renderRecentSales(sales.slice(0,5));
  _renderRecentExps(exps.slice(0,4));
}

function _renderRecentSales(sales) {
  var el = document.getElementById('dashSalesPreview'); if (!el) return;
  if (!sales.length) { el.innerHTML = '<p class="empty-mini">' + t('no_sales_today') + '</p>'; return; }
  var payIc = {cash:'💵',upi:'📱',credit:'📒'};
  el.innerHTML = sales.map(function(s) {
    var c = findById(AppState.allCustomers, s.customerId);
    return '<div class="prev-row"><div class="prev-row__info"><span class="prev-name">' + esc(c?c.name:'—') + '</span><span class="prev-meta">' + s.qty + ' roti · ' + fmtDate(s.date) + '</span></div><div class="prev-right"><span class="prev-amt">' + fmtCurrency(s.total) + '</span><span>' + (payIc[s.payType]||'') + '</span></div></div>';
  }).join('');
}
function _renderRecentExps(exps) {
  var el = document.getElementById('dashExpPreview'); if (!el) return;
  if (!exps.length) { el.innerHTML = '<p class="empty-mini">' + t('no_expenses_today') + '</p>'; return; }
  el.innerHTML = exps.map(function(e) {
    return '<div class="prev-row"><div class="prev-row__info"><span class="prev-name">' + esc(e.category) + '</span><span class="prev-meta">' + (e.note ? esc(e.note) + ' · ' : '') + fmtDate(e.date) + '</span></div><span class="prev-amt prev-amt--exp">' + fmtCurrency(e.amount) + '</span></div>';
  }).join('');
}

/* ── Date Picker ── */
var _dpCb=null, _dpYear=0, _dpMonth=0, _dpMax='';
var _MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

function openDatePicker(current, cb, opts) {
  var d = current ? (toDate(current) || new Date()) : new Date();
  _dpYear=d.getFullYear(); _dpMonth=d.getMonth();
  _dpCb=cb; _dpMax=(opts&&opts.maxDate!==undefined)?opts.maxDate:todayStr();
  _renderCal(); openOverlay('datepickerOverlay');
}
function dpNavMonth(delta) {
  _dpMonth+=delta;
  if(_dpMonth<0){_dpMonth=11;_dpYear--;} if(_dpMonth>11){_dpMonth=0;_dpYear++;}
  _renderCal();
}
function dpPickDate(ds) { if(_dpCb)_dpCb(ds); closeOverlay('datepickerOverlay'); }
function _renderCal() {
  var grid=document.getElementById('dpGrid'), title=document.getElementById('dpTitle');
  if(!grid||!title) return;
  title.textContent=_MONTHS[_dpMonth]+' '+_dpYear;
  var today=todayStr(), ws=AppState.weekStart;
  var days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var labels=Array.from({length:7},function(_,i){return days[(ws+i)%7];});
  var firstDay=new Date(_dpYear,_dpMonth,1).getDay();
  var daysInMo=new Date(_dpYear,_dpMonth+1,0).getDate();
  var offset=(firstDay-ws+7)%7;
  var h=labels.map(function(l){return '<div class="dp-lbl">'+l+'</div>';}).join('');
  for(var i=0;i<offset;i++) h+='<div></div>';
  for(var day=1;day<=daysInMo;day++){
    var ds=_dpYear+'-'+pad2(_dpMonth+1)+'-'+pad2(day);
    var isT=ds===today, isFut=_dpMax&&ds>_dpMax;
    h+='<button class="dp-day'+(isT?' dp-today':'')+(isFut?' dp-dis':'')+'" '+(isFut?'disabled':'')+' onclick="dpPickDate(\''+ds+'\')">'+day+'</button>';
  }
  grid.innerHTML=h;
}
