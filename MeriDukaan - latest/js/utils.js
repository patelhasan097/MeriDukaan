/* ================================================
   MERI DUKAAN v5.0 — UTILITIES & UX ENHANCEMENTS
   Haptics, Confetti, Dates, DOM Helpers
   ================================================ */

// ============ PREMIUM UX (HAPTICS & CONFETTI) ============

// ★ NEW: Haptic Feedback Engine
function triggerHaptic(type) {
    if (!navigator.vibrate) return;
    try {
        if (type === 'success') navigator.vibrate([30, 50, 30]); // Double tap (Save)
        else if (type === 'error') navigator.vibrate([100, 50, 100]); // Heavy buzz
        else if (type === 'light') navigator.vibrate(15); // Subtle tick (Nav/Keys)
    } catch(e) {}
}

// ★ NEW: Confetti Engine (Fires when Udhari is cleared)
function fireConfetti() {
    if (typeof confetti !== 'function') return;
    const duration = 2000;
    const end = Date.now() + duration;

    (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#00c853', '#2196f3', '#ff8f00']
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#00c853', '#2196f3', '#ff8f00']
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

// ============ DOM & UI HELPERS ============

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerHTML = type === 'success' ? `<i data-lucide="check-circle"></i> ${msg}` : `<i data-lucide="alert-circle"></i> ${msg}`;
    lucide.createIcons({ root: t }); // Re-render icon
    t.className = `toast show ${type}`;
    
    triggerHaptic(type);

    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.className = 'toast'; }, 3000);
}

function btnLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn._origHtml = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="spin-icon" style="animation: spin 1s linear infinite;"></i> Processing...`;
        lucide.createIcons({ root: btn });
    } else {
        btn.disabled = false;
        if (btn._origHtml) btn.innerHTML = btn._origHtml;
    }
}

// Security Helper for HTML Injection
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isScreenActive(id) {
    const el = document.getElementById(id);
    return el && el.classList.contains('active');
}

// Add simple CSS spin keyframe dynamically if not present
if (!document.getElementById('spin-keyframes')) {
    const style = document.createElement('style');
    style.id = 'spin-keyframes';
    style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
}

// ============ DATE & TIME ENGINES ============

const S = n => n < 10 ? '0' + n : '' + n;

function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + S(d.getMonth() + 1) + '-' + S(d.getDate());
}

function fmtDate(s) {
    if (!s) return '';
    const p = s.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
}

function fmtDateLong(s) {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
}

function getTime(ts) {
    if (!ts) return '';
    let d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '';
    let h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + S(d.getMinutes()) + ' ' + ap;
}

function getDateRange(period) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let sd, ed = todayStr();
    
    if (period === 'today') {
        sd = ed;
    } else if (period === 'week') {
        const dy = today.getDay();
        const mon = new Date(today);
        mon.setDate(today.getDate() - (dy === 0 ? 6 : dy - 1));
        sd = mon.getFullYear() + '-' + S(mon.getMonth() + 1) + '-' + S(mon.getDate());
    } else if (period === 'month') {
        sd = today.getFullYear() + '-' + S(today.getMonth() + 1) + '-01';
    } else if (period === 'year') {
        sd = today.getFullYear() + '-01-01';
    }
    return { start: sd, end: ed };
}

// ============ OFFLINE/ONLINE DETECTION ============
function updateOfflineBanner() {
    const banner = document.getElementById('offlineBanner');
    if (!banner) return;
    
    if (navigator.onLine) {
        banner.style.display = 'none';
    } else {
        banner.style.display = 'flex';
        triggerHaptic('error');
    }
}

window.addEventListener('online', () => {
    updateOfflineBanner();
    showToast('Back online! Syncing data...', 'success');
});
window.addEventListener('offline', updateOfflineBanner);