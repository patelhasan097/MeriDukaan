/* ================================================
   MERI DUKAAN v8.0 — CORE UTILITIES
   Toast queue · Promise-based Confirm · Overlays
   Date helpers · Format helpers · DOM helpers
   ================================================ */

import { t } from './i18n.js';

// ── Toast Queue ──────────────────────────────────────────────────────────
const _toastQueue = [];
let   _toastActive = false;

export function showToast(msg, type = 'info', duration = 3000) {
  _toastQueue.push({ msg, type, duration });
  if (!_toastActive) _processToastQueue();
}

function _processToastQueue() {
  if (!_toastQueue.length) { _toastActive = false; return; }
  _toastActive = true;
  const { msg, type, duration } = _toastQueue.shift();
  const el = document.getElementById('toast');
  if (!el) { _toastActive = false; return; }
  el.textContent   = msg;
  el.className     = `toast toast--${type} toast--show`;
  el.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    el.className = 'toast';
    el.setAttribute('aria-hidden', 'true');
    setTimeout(_processToastQueue, 300);
  }, duration);
}

// ── Promise-based Confirm Dialog ─────────────────────────────────────────
export function showConfirm(icon, title, body, opts = {}) {
  return new Promise((resolve) => {
    const d     = document.getElementById('confirmDialog');
    const iEl   = document.getElementById('cfIcon');
    const tEl   = document.getElementById('cfTitle');
    const bEl   = document.getElementById('cfBody');
    const yBtn  = document.getElementById('cfYes');
    const nBtn  = document.getElementById('cfNo');
    if (!d) { resolve(false); return; }

    if (iEl) iEl.textContent  = icon  || '⚠️';
    if (tEl) tEl.textContent  = title || t('confirm');
    if (bEl) bEl.textContent  = body  || '';
    if (yBtn) yBtn.textContent = opts.yesLabel || t('yes_delete');
    if (nBtn) nBtn.textContent = opts.noLabel  || t('no_cancel');

    // Dangerous action: style the yes button red
    if (yBtn) yBtn.dataset.danger = opts.danger !== false ? 'true' : 'false';

    function cleanup() {
      d.classList.remove('active');
      d.setAttribute('aria-hidden', 'true');
      yBtn && yBtn.removeEventListener('click', onYes);
      nBtn && nBtn.removeEventListener('click', onNo);
      document.removeEventListener('keydown', onKey);
      // restore focus
      if (_confirmPrevFocus) { _confirmPrevFocus.focus(); _confirmPrevFocus = null; }
    }
    function onYes() { cleanup(); resolve(true);  }
    function onNo()  { cleanup(); resolve(false); }
    function onKey(e) { if (e.key === 'Escape') { onNo(); } }

    yBtn && yBtn.addEventListener('click', onYes);
    nBtn && nBtn.addEventListener('click', onNo);
    document.addEventListener('keydown', onKey);

    _confirmPrevFocus = document.activeElement;
    d.classList.add('active');
    d.setAttribute('aria-hidden', 'false');
    // Focus trap: first button
    setTimeout(() => yBtn && yBtn.focus(), 50);
  });
}
let _confirmPrevFocus = null;

// Focus trap inside confirm dialog
document.addEventListener('keydown', (e) => {
  const d = document.getElementById('confirmDialog');
  if (!d || !d.classList.contains('active') || e.key !== 'Tab') return;
  const focusable = d.querySelectorAll('button:not([disabled])');
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// ── Overlay Management ───────────────────────────────────────────────────
const _overlayStack = [];

export function openOverlay(id, opts = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  el.setAttribute('aria-hidden', 'false');
  _overlayStack.push({ id, prevFocus: document.activeElement });

  // Focus first focusable element
  setTimeout(() => {
    const first = el.querySelector('input:not([type=hidden]), textarea, select, button:not([aria-hidden])');
    if (first) first.focus();
  }, 350);

  // Swipe-to-close
  _addSwipeToClose(el);
}

export function closeOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('active');
  el.setAttribute('aria-hidden', 'true');
  const entry = _overlayStack.findIndex(o => o.id === id);
  if (entry !== -1) {
    const { prevFocus } = _overlayStack.splice(entry, 1)[0];
    if (prevFocus) prevFocus.focus();
  }
  // Clear form if present
  const form = el.querySelector('form');
  if (form && !opts.keepData) setTimeout(() => form.reset(), 300);
}

export function closeTopOverlay() {
  if (_overlayStack.length) closeOverlay(_overlayStack[_overlayStack.length - 1].id);
}

// Global ESC key to close top overlay
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _overlayStack.length) closeTopOverlay();
});

// ── Swipe-to-Close ───────────────────────────────────────────────────────
function _addSwipeToClose(el) {
  const sheet = el.querySelector('.overlay-sheet, .sheet');
  if (!sheet || sheet._swipeInitialised) return;
  sheet._swipeInitialised = true;

  let startY = 0, isDragging = false;

  sheet.addEventListener('touchstart', (e) => {
    const handle = sheet.querySelector('.sheet-handle');
    if (!handle || !handle.contains(e.target)) return;
    startY = e.touches[0].clientY;
    isDragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  sheet.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = '';
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) {
      sheet.style.transform = '';
      closeOverlay(el.id);
    } else {
      sheet.style.transform = '';
    }
  });
}

// ── Field Validation Helpers ─────────────────────────────────────────────
export function setFieldError(inputId, msg) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.classList.add('field--error');
  let errEl = input.parentElement.querySelector('.field-error-msg');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'field-error-msg';
    errEl.setAttribute('aria-live', 'polite');
    input.parentElement.appendChild(errEl);
  }
  errEl.textContent = msg;
  // Clear on next input
  input.addEventListener('input', () => clearFieldError(inputId), { once: true });
}

export function clearFieldError(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.classList.remove('field--error');
  const errEl = input.parentElement?.querySelector('.field-error-msg');
  if (errEl) errEl.textContent = '';
}

export function clearAllFieldErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll('.field--error').forEach(el => el.classList.remove('field--error'));
  form.querySelectorAll('.field-error-msg').forEach(el => el.textContent = '');
}

// ── Button Loading State ─────────────────────────────────────────────────
export function btnLoading(btn, loading, loadingText) {
  if (!btn) return;
  if (loading) {
    btn.dataset.origText = btn.textContent;
    btn.textContent = loadingText || t('saving');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  } else {
    btn.textContent = btn.dataset.origText || btn.textContent;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

// ── Skeleton Loaders ─────────────────────────────────────────────────────
export function showSkeletons(containerId, count = 3) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array.from({ length: count }, () =>
    '<div class="skeleton-card"><div class="sk-line sk-line--title"></div>' +
    '<div class="sk-line sk-line--body"></div>' +
    '<div class="sk-line sk-line--short"></div></div>'
  ).join('');
}

// ── Date Utilities ───────────────────────────────────────────────────────
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function toDateObj(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(str) {
  if (!str) return '';
  const d = toDateObj(str);
  if (!d) return str;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function fmtDateLong(str) {
  if (!str) return '';
  const d = toDateObj(str);
  if (!d) return str;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtRelativeDate(str) {
  if (!str) return '';
  const d = toDateObj(str);
  if (!d) return str;
  const today  = new Date(); today.setHours(0,0,0,0);
  const target = new Date(d); target.setHours(0,0,0,0);
  const diff   = Math.round((today - target) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff  <  7) return `${diff} days ago`;
  if (diff  < 30) return `${Math.round(diff/7)} weeks ago`;
  if (diff  < 365)return `${Math.round(diff/30)} months ago`;
  return fmtDateLong(str);
}

export function daysBetween(strA, strB) {
  const a = toDateObj(strA), b = toDateObj(strB);
  if (!a || !b) return 0;
  return Math.round(Math.abs((b - a) / 86400000));
}

export function dataInRange(items, startDate, endDate) {
  return items.filter(x => {
    if (!x.date || typeof x.date !== 'string') return false;
    return x.date >= startDate && x.date <= endDate;
  });
}

export function getPeriodRange(type, refDate, weekStart = 1) {
  const d   = refDate ? toDateObj(refDate) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;

  if (type === 'daily') {
    const s = fmt(d);
    return { start: s, end: s };
  }
  if (type === 'weekly') {
    const day = d.getDay();
    const diff = (day - weekStart + 7) % 7;
    const mon  = new Date(d); mon.setDate(d.getDate() - diff);
    const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: fmt(mon), end: fmt(sun) };
  }
  if (type === 'monthly') {
    const s = new Date(d.getFullYear(), d.getMonth(), 1);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: fmt(s), end: fmt(e) };
  }
  if (type === 'yearly') {
    return {
      start: `${d.getFullYear()}-01-01`,
      end:   `${d.getFullYear()}-12-31`
    };
  }
  return null;
}

// ── Number / Currency Formatters ─────────────────────────────────────────
export function fmtCurrency(n, decimals = 0) {
  if (isNaN(n)) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function fmtNumber(n) {
  if (isNaN(n)) return '0';
  return Number(n).toLocaleString('en-IN');
}

// ── HTML Escaping ────────────────────────────────────────────────────────
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Array Utilities ──────────────────────────────────────────────────────
export function findById(arr, id) {
  return arr.find(x => x.id === id) || null;
}

// ── Debounce ─────────────────────────────────────────────────────────────
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Retry with Exponential Backoff ───────────────────────────────────────
export async function withRetry(fn, maxAttempts = 3) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (err.code === 'permission-denied' || err.code === 'unauthenticated') throw err; // don't retry auth errors
      if (err.code === 'resource-exhausted') { showToast(t('quota_exceeded'), 'error', 5000); throw err; }
      if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

// ── Greeting based on time ───────────────────────────────────────────────
export function getGreeting(name) {
  const h = new Date().getHours();
  if (h < 12) return t('good_morning', name);
  if (h < 18) return t('good_afternoon', name);
  return t('good_evening', name);
}

// ── SHA-256 (for PIN hashing) ────────────────────────────────────────────
export async function sha256(str) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── WhatsApp link builder ────────────────────────────────────────────────
export function buildWhatsAppLink(phone, message) {
  const cleaned = String(phone || '').replace(/\D/g, '');
  const num     = cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

// ── UPI deep link builder ────────────────────────────────────────────────
export function buildUpiLink(vpa, name, amount, note = 'Roti payment') {
  const params = new URLSearchParams({
    pa: vpa, pn: name, am: String(amount), tn: note, cu: 'INR'
  });
  return `upi://pay?${params.toString()}`;
}

// ── navigator.share() wrapper ────────────────────────────────────────────
export async function shareContent({ title, text, url, files }) {
  if (navigator.share) {
    try {
      if (files && navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ title, text, files });
      } else {
        await navigator.share({ title, text, url });
      }
      return true;
    } catch(e) {
      if (e.name !== 'AbortError') console.warn('[share]', e);
      return false;
    }
  }
  // Fallback: copy to clipboard
  const content = text || url || '';
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(content);
    showToast(t('note_copied'));
  }
  return false;
}

// ── Online / Offline status ──────────────────────────────────────────────
import { setState } from './state.js';

window.addEventListener('online',  () => {
  setState({ isOnline: true });
  showToast(t('synced'), 'success');
  document.getElementById('offlineBanner')?.classList.remove('visible');
});
window.addEventListener('offline', () => {
  setState({ isOnline: false });
  showToast(t('offline_banner'), 'warning', 4000);
  document.getElementById('offlineBanner')?.classList.add('visible');
});

// ── Animation helper ─────────────────────────────────────────────────────
export function animateCounter(el, from, to, duration = 400) {
  if (!el) return;
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const ease     = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const value    = Math.round(from + (to - from) * ease);
    el.textContent = value.toLocaleString('en-IN');
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = to.toLocaleString('en-IN');
  };
  requestAnimationFrame(update);
}

console.log('[core] Meri Dukaan v8.0 — core utilities ready');
