/* ================================================
   MERI DUKAAN v8.0 — SETTINGS
   Account · Security · Team · Preferences · Data
   ================================================ */
import { getFirestore, doc, setDoc, getDoc }    from 'firebase/firestore';
import { db, auth, signOutApp }                 from './auth.js';
import { getState, setState, requireBizId,
         canModify }                            from './state.js';
import { t, setLang, getLang }                  from './i18n.js';
import { showToast, showConfirm, sha256,
         openOverlay, closeOverlay,
         setFieldError, clearAllFieldErrors,
         btnLoading, withRetry }               from './core.js';
import { registerBiometric }                    from './auth.js';
import { toggleNotifications }                  from './fcm.js';

const bizDocRef = () => doc(db, 'businesses', requireBizId());

export function loadSettings() {
  const user    = getState('firebaseUser');
  const isOwner = canModify();

  // Account section
  const emailEl = document.getElementById('settingsEmail');
  if (emailEl) emailEl.textContent = user?.email || '';
  const nameEl  = document.getElementById('settingsName');
  if (nameEl)  nameEl.textContent  = user?.displayName || '';
  const bizNameEl = document.getElementById('settingsBizName');
  if (bizNameEl) bizNameEl.textContent = getState('businessName');

  // Theme
  const theme = localStorage.getItem('mdTheme') || 'dark';
  document.querySelectorAll('[data-theme-opt]').forEach(btn =>
    btn.classList.toggle('theme-btn--active', btn.dataset.themeOpt === theme));

  // Language
  const lang = getLang();
  document.querySelectorAll('[data-lang-opt]').forEach(btn =>
    btn.classList.toggle('lang-btn--active', btn.dataset.langOpt === lang));

  // UPI VPA
  const upiEl = document.getElementById('settingsUpiVpa');
  if (upiEl) upiEl.value = getState('upiVpa') || '';

  // Week start
  const wsEl = document.getElementById('settingsWeekStart');
  if (wsEl) wsEl.value = String(getState('weekStart') || 1);

  // Notifications toggle
  const notifEl = document.getElementById('settingsNotifToggle');
  if (notifEl) notifEl.checked = localStorage.getItem('mdNotificationsEnabled') !== 'false';

  // Supplier phone (for stock order WhatsApp)
  const supEl = document.getElementById('settingsSupplierPhone');
  if (supEl) supEl.value = localStorage.getItem('mdSupplierPhone') || '';

  // Sync status
  const syncEl = document.getElementById('settingsSyncStatus');
  if (syncEl) syncEl.textContent = getState('isOnline') ? '✅ Online — synced' : '📴 Offline — will sync when connected';

  // Staff list
  _renderTeam();

  // Show/hide owner-only sections
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = isOwner ? '' : 'none');
}

function _renderTeam() {
  const members = getState('memberEmails') || [];
  const ct = document.getElementById('teamList');
  if (!ct) return;
  if (!members.length) {
    ct.innerHTML = `<p class="empty-mini">No staff members yet. Add staff so they can record sales on your behalf.</p>`;
    return;
  }
  ct.innerHTML = members.map(email =>
    `<div class="team-member">
      <span class="team-member__email">${email}</span>
      <button class="btn btn--ghost btn--sm btn--danger" onclick="removeStaff('${email}')">${t('remove_staff')}</button>
    </div>`).join('');
}

// ── Theme ─────────────────────────────────────────────────────────────────
export function setTheme(theme) {
  localStorage.setItem('mdTheme', theme);
  document.querySelectorAll('[data-theme-opt]').forEach(btn =>
    btn.classList.toggle('theme-btn--active', btn.dataset.themeOpt === theme));

  // Add transition class, apply, remove
  document.body.classList.add('theme-transitioning');
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    document.documentElement.dataset.theme = theme;
  }
  setTimeout(() => document.body.classList.remove('theme-transitioning'), 300);
}

export function applyStoredTheme() {
  const theme = localStorage.getItem('mdTheme') || 'dark';
  setTheme(theme);
  // Watch system preference for 'auto' mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('mdTheme') === 'auto') setTheme('auto');
  });
}

// ── Language ─────────────────────────────────────────────────────────────
export function changeLang(lang) {
  setLang(lang);
  document.querySelectorAll('[data-lang-opt]').forEach(btn =>
    btn.classList.toggle('lang-btn--active', btn.dataset.langOpt === lang));
  // Save to Firestore for persistence across devices
  withRetry(() => setDoc(bizDocRef(), { language: lang }, { merge: true })).catch(console.warn);
}

// ── Business name ─────────────────────────────────────────────────────────
export async function saveBizName() {
  const el = document.getElementById('settingsBizNameInput');
  const name = el?.value.trim();
  if (!name) return;
  try {
    await withRetry(() => setDoc(bizDocRef(), { businessName: name }, { merge: true }));
    setState({ businessName: name });
    const disp = document.getElementById('settingsBizName');
    if (disp) disp.textContent = name;
    showToast('✅ Business name updated!', 'success');
    closeOverlay('bizNameOverlay');
  } catch (err) { showToast(t('error_save'), 'error'); }
}

// ── UPI VPA ───────────────────────────────────────────────────────────────
export async function saveUpiVpa() {
  const vpa = document.getElementById('settingsUpiVpa')?.value.trim();
  try {
    await withRetry(() => setDoc(bizDocRef(), { upiVpa: vpa }, { merge: true }));
    setState({ upiVpa: vpa });
    showToast('✅ UPI VPA saved!', 'success');
  } catch (err) { showToast(t('error_save'), 'error'); }
}

// ── Supplier phone ────────────────────────────────────────────────────────
export function saveSupplierPhone() {
  const phone = document.getElementById('settingsSupplierPhone')?.value.trim();
  localStorage.setItem('mdSupplierPhone', phone || '');
  showToast('✅ Supplier phone saved!', 'success');
}

// ── Week start ────────────────────────────────────────────────────────────
export async function saveWeekStart() {
  const val = parseInt(document.getElementById('settingsWeekStart')?.value || '1');
  setState({ weekStart: val });
  await withRetry(() => setDoc(bizDocRef(), { weekStart: val }, { merge: true }));
  showToast('✅ Week start updated!', 'success');
}

// ── PIN Change ────────────────────────────────────────────────────────────
let _newPinStep = 0, _newPin = '';

export function openChangePinOverlay() {
  _newPinStep = 0; _newPin = '';
  document.getElementById('changePinLabel').textContent = 'Enter new PIN';
  document.getElementById('changePinDots').innerHTML = '<i></i><i></i><i></i><i></i>';
  openOverlay('changePinOverlay');
}

export async function changePinKey(digit) {
  if (_newPin.length >= 4) return;
  _newPin += digit;
  const dots = document.querySelectorAll('#changePinDots i');
  dots.forEach((d,i) => d.classList.toggle('pin-dot--filled', i < _newPin.length));

  if (_newPin.length === 4) {
    if (_newPinStep === 0) {
      _newPinStep = 1;
      const first = _newPin;
      _newPin = '';
      dots.forEach(d => d.classList.remove('pin-dot--filled'));
      document.getElementById('changePinLabel').textContent = 'Confirm new PIN';
      _newPin = ''; // store first in closure — simplification: use a state var
      // Store first entry
      document.getElementById('changePinOverlay').dataset.firstPin = first;
    } else {
      const first = document.getElementById('changePinOverlay').dataset.firstPin;
      if (_newPin !== first) {
        showToast(t('pin_mismatch'), 'error');
        _newPinStep = 0; _newPin = '';
        dots.forEach(d => d.classList.remove('pin-dot--filled'));
        document.getElementById('changePinLabel').textContent = 'Enter new PIN';
        return;
      }
      // Save
      const hash = await sha256(_newPin);
      await withRetry(() => setDoc(bizDocRef(), { pin: hash, pinVersion: Date.now() }, { merge: true }));
      // Update session token
      const token = await sha256(requireBizId() + getState('firebaseUser').uid + hash);
      sessionStorage.setItem('mdSessionToken', token);
      showToast(t('pin_changed'), 'success');
      closeOverlay('changePinOverlay');
    }
  }
}

// ── Team Management ───────────────────────────────────────────────────────
export async function addStaff() {
  if (!canModify()) { showToast(t('staff_cannot'), 'error'); return; }
  const email = document.getElementById('staffEmailInput')?.value.trim().toLowerCase();
  if (!email || !email.includes('@')) { showToast('Enter a valid email', 'error'); return; }

  const members = [...(getState('memberEmails')||[])];
  if (members.includes(email)) { showToast('Already a member', 'error'); return; }
  members.push(email);

  await withRetry(() => setDoc(bizDocRef(), { memberEmails: members }, { merge: true }));
  setState({ memberEmails: members });
  const inp = document.getElementById('staffEmailInput');
  if (inp) inp.value = '';
  showToast(t('staff_added'), 'success');
  _renderTeam();
}

export async function removeStaff(email) {
  if (!canModify()) { showToast(t('staff_cannot'), 'error'); return; }
  const ok = await showConfirm('👤', t('remove_staff'), `Remove ${email} from your team?`);
  if (!ok) return;
  const members = (getState('memberEmails')||[]).filter(e => e !== email);
  await withRetry(() => setDoc(bizDocRef(), { memberEmails: members }, { merge: true }));
  setState({ memberEmails: members });
  showToast(t('staff_removed'), 'success');
  _renderTeam();
}

// ── Data Export ───────────────────────────────────────────────────────────
export async function exportAllData() {
  const data = {
    exportedAt: new Date().toISOString(),
    bizId:      requireBizId(),
    sales:      getState('allSales'),
    expenses:   getState('allExpenses'),
    customers:  getState('allCustomers'),
    creditPayments: getState('allCreditPayments'),
    notes:      getState('allNotes'),
    waste:      getState('allWaste'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `meri-dukaan-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Data exported!', 'success');
}

// ── Data Import ───────────────────────────────────────────────────────────
export async function importDataFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const ok = await showConfirm('⚠️', 'Import Data?',
    'Importing will ADD data from the file to your current data. This cannot be undone.');
  if (!ok) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // ✅ Schema validation before write (v7 bug fixed)
    const required = ['sales','expenses','customers'];
    for (const key of required) {
      if (!Array.isArray(data[key])) throw new Error(`Missing or invalid field: ${key}`);
    }

    const { getFirestore, collection, writeBatch, doc } = await import('firebase/firestore');
    const bizId = requireBizId();
    const CHUNK = 499;

    for (const [col, items] of [['sales',data.sales],['expenses',data.expenses],['customers',data.customers]]) {
      for (let i=0; i<items.length; i+=CHUNK) {
        const batch = writeBatch(db);
        items.slice(i,i+CHUNK).forEach(item => {
          const { id, ...rest } = item;
          batch.set(doc(db,'businesses',bizId,col,id||doc(collection(db,'x')).id), rest);
        });
        await batch.commit();
      }
    }
    showToast('✅ Data imported!', 'success');
  } catch (err) {
    console.error('[settings] import error', err);
    showToast('❌ Import failed: ' + err.message, 'error', 5000);
  }
}

const _globals = { loadSettings, setTheme, applyStoredTheme, changeLang, saveBizName,
  saveUpiVpa, saveSupplierPhone, saveWeekStart, openChangePinOverlay, changePinKey,
  addStaff, removeStaff, exportAllData, importDataFile, registerBiometric,
  toggleNotifications };
Object.assign(window, _globals);
export { loadSettings, applyStoredTheme };
console.log('[settings] Meri Dukaan v8.0 ready');
