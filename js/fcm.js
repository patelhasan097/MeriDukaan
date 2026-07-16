/* ================================================
   MERI DUKAAN v8.0 — FCM PUSH NOTIFICATIONS
   Replaces EmailJS. Unlimited, free, native push.
   Works when app is closed. No user setup needed.
   ================================================ */
import { getMessaging, getToken, onMessage }    from 'firebase/messaging';
import { getFirestore, doc, setDoc }            from 'firebase/firestore';
import { db }                                   from './auth.js';
import { getState, requireBizId }               from './state.js';
import { t }                                    from './i18n.js';
import { showToast, todayStr }                  from './core.js';
import { VAPID_KEY }                            from './firebase-config.js';

let _messaging = null;

export async function initFCM() {
  // Only init if notifications are enabled in settings
  const enabled = localStorage.getItem('mdNotificationsEnabled');
  if (enabled === 'false') return;
  if (!('Notification' in window)) return;
  if (!navigator.serviceWorker) return;

  try {
    const { initializeApp, getApp } = await import('firebase/app');
    _messaging = getMessaging(getApp());

    // Request permission (only shown once, after PIN success)
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return;
    }
    if (Notification.permission !== 'granted') return;

    // Get FCM token and save to Firestore
    const sw = await navigator.serviceWorker.ready;
    const token = await getToken(_messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: sw });
    if (token) {
      await setDoc(doc(db, 'businesses', requireBizId()), { fcmToken: token }, { merge: true });
      localStorage.setItem('mdFcmToken', token);
    }

    // Foreground messages (when app is open)
    onMessage(_messaging, (payload) => {
      const { title, body } = payload.notification || {};
      showToast(`${title}: ${body}`, 'info', 5000);
      // Add to in-app notification center
      _addToNotifCenter({ title, body, date: todayStr(), read: false });
    });

  } catch (err) {
    console.warn('[FCM] init error (non-fatal):', err.message);
  }
}

// ── Notification Center (in-app) ─────────────────────────────────────────
function _addToNotifCenter(notif) {
  const key   = 'mdNotifCenter';
  const notifs = JSON.parse(localStorage.getItem(key)||'[]');
  notifs.unshift({ ...notif, id: Date.now() });
  // Keep last 30 notifications
  localStorage.setItem(key, JSON.stringify(notifs.slice(0, 30)));
  _updateNotifBadge(notifs.filter(n=>!n.read).length);
}

function _updateNotifBadge(count) {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  badge.textContent = count > 0 ? count : '';
  badge.style.display = count > 0 ? 'flex' : 'none';
}

export function loadNotifications() {
  const notifs = JSON.parse(localStorage.getItem('mdNotifCenter')||'[]');
  const ct = document.getElementById('notifList');
  if (!ct) return;

  // Mark all as read
  notifs.forEach(n => n.read = true);
  localStorage.setItem('mdNotifCenter', JSON.stringify(notifs));
  _updateNotifBadge(0);

  if (!notifs.length) {
    ct.innerHTML = '<div class="empty-mini">No notifications yet.<br>Enable daily summary in Settings.</div>';
    return;
  }
  ct.innerHTML = notifs.map(n =>
    `<div class="notif-item${n.read?'':' notif-item--unread'}">
      <div class="notif-item__title">${n.title||'Notification'}</div>
      <div class="notif-item__body">${n.body||''}</div>
      <div class="notif-item__date">${n.date||''}</div>
    </div>`).join('');
}

// ── Toggle notifications setting ──────────────────────────────────────────
export async function toggleNotifications(enabled) {
  localStorage.setItem('mdNotificationsEnabled', enabled ? 'true' : 'false');
  if (enabled) {
    await initFCM();
    showToast('🔔 Notifications enabled!', 'success');
  } else {
    showToast('🔕 Notifications disabled', 'info');
  }
}

// ── Init notification badge on load ──────────────────────────────────────
const unread = JSON.parse(localStorage.getItem('mdNotifCenter')||'[]').filter(n=>!n.read).length;
_updateNotifBadge(unread);

window.loadNotifications  = loadNotifications;
window.toggleNotifications= toggleNotifications;
export { initFCM };
console.log('[fcm] Meri Dukaan v8.0 — FCM module ready');
