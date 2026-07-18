/* MERI DUKAAN v8 — Core Utilities */

/* ── Toast Queue ── */
var _toastQ = [], _toastBusy = false;
function showToast(msg, type, dur) {
  _toastQ.push({msg:msg||'', type:type||'info', dur:dur||3000});
  if (!_toastBusy) _nextToast();
}
function _nextToast() {
  if (!_toastQ.length) { _toastBusy=false; return; }
  _toastBusy = true;
  var item = _toastQ.shift();
  var el = document.getElementById('toast');
  if (!el) { _toastBusy=false; return; }
  el.querySelector(".toast-msg").textContent = item.msg;
  el.className = 'toast toast--'+item.type+' toast--show';
  el.setAttribute('aria-hidden','false');
  // Undo button
  var undoBtn = document.getElementById('toastUndo');
  if (undoBtn) undoBtn.style.display = 'none';
  setTimeout(function() {
    el.className = 'toast';
    el.setAttribute('aria-hidden','true');
    setTimeout(_nextToast, 300);
  }, item.dur);
}

/* ── Soft Delete Undo ── */
var _undoMap = {};
function showToastWithUndo(msg, undoFn) {
  var el = document.getElementById('toast');
  var undoBtn = document.getElementById('toastUndo');
  if (!el) return;
  el.querySelector('.toast-msg').textContent = msg;
  el.className = 'toast toast--info toast--show';
  el.setAttribute('aria-hidden','false');
  if (undoBtn && undoFn) {
    undoBtn.style.display = 'inline-block';
    undoBtn.onclick = function() {
      undoFn();
      el.className = 'toast';
      el.setAttribute('aria-hidden','true');
      if (undoBtn) undoBtn.style.display = 'none';
    };
  }
  setTimeout(function() {
    el.className = 'toast';
    el.setAttribute('aria-hidden','true');
    if (undoBtn) undoBtn.style.display = 'none';
  }, 5000);
}

/* ── Confirm Dialog (Promise-based) ── */
var _cfResolve = null;
function showConfirm(icon, title, body, opts) {
  return new Promise(function(resolve) {
    _cfResolve = resolve;
    var d = document.getElementById('confirmDialog');
    if (!d) { resolve(false); return; }
    var iEl = document.getElementById('cfIcon');
    var tEl = document.getElementById('cfTitle');
    var bEl = document.getElementById('cfBody');
    var yBtn = document.getElementById('cfYes');
    var nBtn = document.getElementById('cfNo');
    if (iEl) iEl.textContent = icon || '⚠️';
    if (tEl) tEl.textContent = title || '';
    if (bEl) bEl.textContent = body || '';
    if (yBtn) yBtn.textContent = (opts && opts.yesLabel) || t('delete');
    if (nBtn) nBtn.textContent = (opts && opts.noLabel) || t('cancel');
    d.classList.add('active');
    d.setAttribute('aria-hidden','false');
    if (yBtn) setTimeout(function(){ yBtn.focus(); }, 50);
  });
}
function onConfirmYes() {
  document.getElementById('confirmDialog').classList.remove('active');
  document.getElementById('confirmDialog').setAttribute('aria-hidden','true');
  if (_cfResolve) { _cfResolve(true); _cfResolve = null; }
}
function onConfirmNo() {
  document.getElementById('confirmDialog').classList.remove('active');
  document.getElementById('confirmDialog').setAttribute('aria-hidden','true');
  if (_cfResolve) { _cfResolve(false); _cfResolve = null; }
}

/* ── Overlays ── */
var _overlayStack = [];
function openOverlay(id) {
  var el = document.getElementById(id);
  if (!el) return;
  _overlayStack.push({id:id, prev: document.activeElement});
  el.classList.add('active');
  el.setAttribute('aria-hidden','false');
  setTimeout(function() {
    var f = el.querySelector('input:not([type=hidden]),textarea,select,button:not([aria-hidden])');
    if (f) f.focus();
  }, 320);
  _addSwipeClose(el);
}
function closeOverlay(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('active');
  el.setAttribute('aria-hidden','true');
  var idx = _overlayStack.findIndex(function(o){ return o.id===id; });
  if (idx !== -1) {
    var prev = _overlayStack.splice(idx,1)[0].prev;
    if (prev && prev.focus) prev.focus();
  }
}
function _addSwipeClose(el) {
  var sheet = el.querySelector('.sheet');
  if (!sheet || sheet._swipe) return;
  sheet._swipe = true;
  var sy = 0, dragging = false;
  sheet.addEventListener('touchstart', function(e) {
    var h = sheet.querySelector('.sheet-handle');
    if (!h || !h.contains(e.target)) return;
    sy = e.touches[0].clientY; dragging = true;
    sheet.style.transition = 'none';
  }, {passive:true});
  sheet.addEventListener('touchmove', function(e) {
    if (!dragging) return;
    var dy = Math.max(0, e.touches[0].clientY - sy);
    sheet.style.transform = 'translateY('+dy+'px)';
  }, {passive:true});
  sheet.addEventListener('touchend', function(e) {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    var dy = e.changedTouches[0].clientY - sy;
    if (dy > 80) { sheet.style.transform=''; closeOverlay(el.id); }
    else sheet.style.transform = '';
  });
}
document.addEventListener('keydown', function(e) {
  if (e.key==='Escape' && _overlayStack.length) closeOverlay(_overlayStack[_overlayStack.length-1].id);
});

/* ── Inline Field Errors ── */
function setFieldError(id, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.add('field--error');
  var err = el.parentElement && el.parentElement.querySelector('.field-err');
  if (!err) {
    err = document.createElement('div');
    err.className = 'field-err';
    if (el.parentElement) el.parentElement.appendChild(err);
  }
  err.textContent = msg;
  el.addEventListener('input', function(){ clearFieldError(id); }, {once:true});
}
function clearFieldError(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('field--error');
  var err = el.parentElement && el.parentElement.querySelector('.field-err');
  if (err) err.textContent = '';
}
function clearFormErrors(formId) {
  var f = document.getElementById(formId);
  if (!f) return;
  f.querySelectorAll('.field--error').forEach(function(el){ el.classList.remove('field--error'); });
  f.querySelectorAll('.field-err').forEach(function(el){ el.textContent = ''; });
}

/* ── Button Loading ── */
function btnLoading(btn, on, txt) {
  if (!btn) return;
  if (on) {
    btn.dataset.orig = btn.textContent;
    btn.textContent = txt || t('saving');
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.orig || btn.textContent;
    btn.disabled = false;
  }
}

/* ── Skeleton Loaders ── */
function showSkeletons(id, n) {
  var el = document.getElementById(id);
  if (!el) return;
  var h = '';
  for (var i=0; i<(n||3); i++) {
    h += '<div class="sk-card"><div class="sk-line sk-title"></div><div class="sk-line sk-body"></div><div class="sk-line sk-short"></div></div>';
  }
  el.innerHTML = h;
}

/* ── Date Helpers ── */
function todayStr() {
  var d = new Date();
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
}
function pad2(n){ return n<10?'0'+n:String(n); }
function toDate(str) {
  if (!str || typeof str!=='string') return null;
  var p = str.split('-');
  if (p.length!==3) return null;
  var d = new Date(+p[0], +p[1]-1, +p[2]);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(str) {
  var d = toDate(str);
  if (!d) return str||'';
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
}
function fmtDateLong(str) {
  var d = toDate(str);
  if (!d) return str||'';
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function fmtRelDate(str) {
  var d = toDate(str);
  if (!d) return str||'';
  var today = new Date(); today.setHours(0,0,0,0);
  var dt = new Date(d); dt.setHours(0,0,0,0);
  var diff = Math.round((today-dt)/86400000);
  if (diff===0) return 'Today';
  if (diff===1) return 'Yesterday';
  if (diff<7)   return diff+' days ago';
  if (diff<30)  return Math.round(diff/7)+' weeks ago';
  if (diff<365) return Math.round(diff/30)+' months ago';
  return fmtDateLong(str);
}
function daysBetween(a,b) {
  var da=toDate(a), db=toDate(b);
  if (!da||!db) return 0;
  return Math.round(Math.abs((db-da)/86400000));
}
function dataInRange(arr, s, e) {
  return arr.filter(function(x){
    return x.date && typeof x.date==='string' && x.date>=s && x.date<=e;
  });
}
function getPeriodRange(type, ref, ws) {
  var d = ref ? (toDate(ref)||new Date()) : new Date();
  ws = ws||1;
  var f = function(dt){ return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate()); };
  if (type==='daily') { var s=f(d); return {start:s,end:s}; }
  if (type==='weekly') {
    var day=d.getDay(), off=(day-ws+7)%7;
    var mon=new Date(d); mon.setDate(d.getDate()-off);
    var sun=new Date(mon); sun.setDate(mon.getDate()+6);
    return {start:f(mon),end:f(sun)};
  }
  if (type==='monthly') {
    var s2=new Date(d.getFullYear(),d.getMonth(),1);
    var e2=new Date(d.getFullYear(),d.getMonth()+1,0);
    return {start:f(s2),end:f(e2)};
  }
  if (type==='yearly') return {start:d.getFullYear()+'-01-01',end:d.getFullYear()+'-12-31'};
  return null;
}

/* ── Format Helpers ── */
function fmtCurrency(n, dec) {
  if (isNaN(n)) return '₹0';
  return '₹'+Number(n).toLocaleString('en-IN',{minimumFractionDigits:dec||0,maximumFractionDigits:dec||0});
}
function esc(s) {
  if (s===null||s===undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function findById(arr, id) { return arr.find(function(x){return x.id===id;})||null; }
function debounce(fn, delay) {
  var t; return function(){ var a=arguments; clearTimeout(t); t=setTimeout(function(){fn.apply(null,a);},delay); };
}

/* ── Retry ── */
function withRetry(fn, max) {
  max = max||3;
  var attempt = function(n) {
    return fn().catch(function(err) {
      if (err.code==='permission-denied'||err.code==='unauthenticated') return Promise.reject(err);
      if (err.code==='resource-exhausted') { showToast(t('quota_exceeded'),'error',5000); return Promise.reject(err); }
      if (n<max) return new Promise(function(r){setTimeout(r,500*Math.pow(2,n-1));}).then(function(){ return attempt(n+1); });
      return Promise.reject(err);
    });
  };
  return attempt(1);
}

/* ── SHA-256 ── */
function sha256(str) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
    .then(function(buf){
      return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
    });
}

/* ── WhatsApp / UPI ── */
function buildWhatsAppLink(phone, msg) {
  var n = String(phone||'').replace(/\D/g,'');
  if (!n.startsWith('91')) n = '91'+n;
  return 'https://wa.me/'+n+'?text='+encodeURIComponent(msg);
}
function buildUpiLink(vpa, name, amount) {
  return 'upi://pay?pa='+encodeURIComponent(vpa)+'&pn='+encodeURIComponent(name)+'&am='+amount+'&cu=INR';
}

/* ── Share ── */
function shareContent(obj) {
  if (navigator.share) {
    return navigator.share(obj).catch(function(){});
  }
  if (navigator.clipboard && obj.text) {
    return navigator.clipboard.writeText(obj.text).then(function(){ showToast('📋 Copied!','success'); });
  }
  return Promise.resolve();
}

/* ── Greeting ── */
function getGreeting(name) {
  var h = new Date().getHours();
  if (h<12) return t('good_morning',name);
  if (h<18) return t('good_afternoon',name);
  return t('good_evening',name);
}

/* ── Online/Offline (don't fire on initial load) ── */
var _appReady = false;
setTimeout(function(){ _appReady=true; }, 3000);
window.addEventListener('online', function(){
  AppState.isOnline=true;
  if (_appReady) showToast('✅ Back online — syncing','success');
  var b=document.getElementById('offlineBanner');
  if(b) b.classList.remove('visible');
});
window.addEventListener('offline', function(){
  AppState.isOnline=false;
  if (_appReady) showToast('📴 You are offline','warning',4000);
  var b=document.getElementById('offlineBanner');
  if(b) b.classList.add('visible');
});

/* ── Theme ── */
function applyTheme(theme) {
  localStorage.setItem('mdTheme',theme);
  document.body.classList.add('theme-anim');
  if (theme==='auto') {
    document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark':'light';
  } else {
    document.documentElement.dataset.theme = theme;
  }
  setTimeout(function(){ document.body.classList.remove('theme-anim'); },300);
  document.querySelectorAll('[data-theme-btn]').forEach(function(b){
    b.classList.toggle('active', b.dataset.themeBtn===theme);
  });
}
(function(){
  var th=localStorage.getItem('mdTheme')||'dark';
  document.documentElement.dataset.theme = th==='auto'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):th;
})();
