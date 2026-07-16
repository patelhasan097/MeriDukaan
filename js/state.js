/* ================================================
   MERI DUKAAN v8.0 — REACTIVE STATE STORE
   Centralized state. Subscribe to changes.
   No more 13 global vars leaking across files.
   ================================================ */

const _state = {
  // Auth
  firebaseUser:    null,
  bizId:           null,
  isOwner:         false,
  businessName:    'My Business',
  ownerEmail:      '',

  // Business settings
  upiVpa:          '',
  weekStart:       1,          // 1=Monday, 0=Sunday
  language:        'en',
  theme:           'dark',
  memberEmails:    [],

  // Data collections (updated by Firestore listeners)
  allSales:         [],
  allExpenses:      [],
  allCustomers:     [],
  allCreditPayments:[],
  allNotes:         [],
  allWaste:         [],

  // UI state
  currentScreen:    'loginScreen',
  isOnline:         navigator.onLine,
  dataLoading:      true,
  pendingWrites:    0,          // queued offline writes

  // Filters / sort (ephemeral — not persisted)
  salesFilter:      'all',     // all | cash | upi | credit
  salesSort:        'newest',  // newest | amount | name
  salesSearch:      '',
  custSearch:       '',
  creditSort:       'balance',
  analyticsWindow:  30,        // days

  // Undo queue
  undoQueue:        [],        // [{ type, id, data, timer }]
};

const _subs = {};  // key → Set of callbacks

/** Read a state value */
export function getState(key) {
  return _state[key];
}

/** Get snapshot of all state (for debugging) */
export function getFullState() {
  return { ..._state };
}

/** Update state and notify subscribers */
export function setState(updates) {
  const changed = [];
  for (const [key, value] of Object.entries(updates)) {
    if (_state[key] !== value) {
      _state[key] = value;
      changed.push(key);
    }
  }
  changed.forEach(key => {
    (_subs[key] || new Set()).forEach(cb => {
      try { cb(value, key); } catch(e) { console.error('[state] subscriber error', e); }
    });
    (_subs['*'] || new Set()).forEach(cb => {
      try { cb(_state[key], key); } catch(e) { console.error('[state] subscriber error', e); }
    });
  });
}

/** Subscribe to a state key. Returns unsubscribe function. */
export function subscribe(key, callback) {
  if (!_subs[key]) _subs[key] = new Set();
  _subs[key].add(callback);
  return () => _subs[key].delete(callback);
}

/** Helper — get current bizId or throw */
export function requireBizId() {
  const id = _state.bizId;
  if (!id) throw new Error('No bizId — user not authenticated');
  return id;
}

/** Helper — check if current user is owner */
export function canModify() {
  return _state.isOwner;
}

console.log('[state] Meri Dukaan v8.0 — state store ready');
