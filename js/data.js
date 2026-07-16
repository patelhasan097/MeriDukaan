/* ================================================
   MERI DUKAAN v8.0 — DATA OPERATIONS
   Sales · Customers · Expenses · Waste · Credit
   Batch writes · Soft delete · Inline validation
   WhatsApp · UPI · Customer statement
   ================================================ */

import { getFirestore, doc, addDoc, updateDoc,
         deleteDoc, writeBatch, collection,
         serverTimestamp, query, where, orderBy,
         getDocs }                              from 'firebase/firestore';
import { db }                                   from './auth.js';
import { getState, setState, canModify,
         requireBizId }                         from './state.js';
import { t }                                    from './i18n.js';
import { showToast, showConfirm, openOverlay,
         closeOverlay, setFieldError, clearAllFieldErrors,
         btnLoading, showSkeletons, todayStr,
         fmtCurrency, fmtDate, fmtDateLong,
         fmtRelativeDate, esc, debounce,
         findById, withRetry, dataInRange,
         buildWhatsAppLink, buildUpiLink,
         shareContent, daysBetween }            from './core.js';

// ── Firestore collection ref ─────────────────────────────────────────────
const biz  = (col) => collection(db, 'businesses', requireBizId(), col);
const docR = (col, id) => doc(db, 'businesses', requireBizId(), col, id);

// ── Soft Delete Queue ────────────────────────────────────────────────────
const _undoQueue = new Map();  // id → { col, data, timer }

async function softDelete(col, id, label) {
  // Mark as deleted in Firestore (hidden by listener query)
  await withRetry(() => updateDoc(docR(col, id), {
    deleted: true, deletedAt: serverTimestamp()
  }));
  // Show UNDO toast for 5 seconds
  showToast(`${label} ${t('sale_deleted')} — `, 'info', 5100);
  const undoBtn = document.getElementById('toastUndoBtn');
  if (undoBtn) {
    undoBtn.style.display = 'inline';
    undoBtn.onclick = () => _undoDelete(col, id, undoBtn);
    const timer = setTimeout(async () => {
      // Permanently delete after 5s
      _undoQueue.delete(id);
      if (undoBtn) undoBtn.style.display = 'none';
      await withRetry(() => deleteDoc(docR(col, id)));
    }, 5000);
    _undoQueue.set(id, { col, timer });
  }
}

async function _undoDelete(col, id, btn) {
  const entry = _undoQueue.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  _undoQueue.delete(id);
  if (btn) btn.style.display = 'none';
  await withRetry(() => updateDoc(docR(col, id), { deleted: false, deletedAt: null }));
  showToast('↩️ ' + t('undo'), 'success');
}

// ── SALES ────────────────────────────────────────────────────────────────
let _saleFormDate = todayStr();
let _saleFormCustId = '';
let _lastPayTypes = {};  // custId → payType (remembered per customer)

export function openSaleForm(id) {
  if (!canModify() && !id) { showToast(t('staff_cannot'), 'error'); return; }
  clearAllFieldErrors('saleForm');
  const form = document.getElementById('saleForm');
  if (form) form.reset();
  const isEdit = !!id;

  document.getElementById('sfTitle').textContent = isEdit ? t('edit_sale') : t('add_sale');
  document.getElementById('sfId').value    = '';
  document.getElementById('sfDate').value  = todayStr();
  _saleFormDate   = todayStr();
  _saleFormCustId = '';

  if (isEdit) {
    const sale = findById(getState('allSales'), id);
    if (!sale) return;
    document.getElementById('sfId').value    = sale.id;
    document.getElementById('sfDate').value  = sale.date;
    document.getElementById('sfQty').value   = sale.qty;
    document.getElementById('sfRate').value  = sale.rate;
    document.getElementById('sfPay').value   = sale.payType;
    _saleFormDate   = sale.date;
    _saleFormCustId = sale.customerId;
    // Pre-select customer in picker
    _updateCustPicker(sale.customerId);
  } else {
    _updateCustPicker('');
  }
  _calcSaleTotal();
  openOverlay('saleFormOverlay');
}

export function closeSaleForm() { closeOverlay('saleFormOverlay'); }

// Live total calculation
export function calcSaleTotal() { _calcSaleTotal(); }
function _calcSaleTotal() {
  const qty  = parseInt(document.getElementById('sfQty')?.value || '0', 10);
  const rate = parseFloat(document.getElementById('sfRate')?.value || '0');
  const tot  = isNaN(qty) || isNaN(rate) ? 0 : qty * rate;
  const el   = document.getElementById('sfTotal');
  if (el) el.textContent = fmtCurrency(tot);

  // Update UPI collect button
  const upiBtn = document.getElementById('sfUpiBtn');
  const upiVpa = getState('upiVpa');
  if (upiBtn) {
    upiBtn.style.display = (upiVpa && tot > 0) ? 'flex' : 'none';
    upiBtn.textContent   = t('collect_upi', fmtCurrency(tot).replace('₹',''));
  }
}

export function openUpiCollect() {
  const qty    = parseInt(document.getElementById('sfQty')?.value || '0', 10);
  const rate   = parseFloat(document.getElementById('sfRate')?.value || '0');
  const amount = qty * rate;
  const upiVpa = getState('upiVpa');
  const bizName= getState('businessName');
  if (!upiVpa || !amount) return;
  window.open(buildUpiLink(upiVpa, bizName, amount), '_blank');
}

export async function saveSale(e) {
  e.preventDefault();
  clearAllFieldErrors('saleForm');

  // ── Validation ──
  let valid = true;
  const custId = _saleFormCustId;
  const date   = document.getElementById('sfDate')?.value || todayStr();
  const qtyRaw = document.getElementById('sfQty')?.value || '';
  const rate   = parseFloat(document.getElementById('sfRate')?.value || '');
  const payType= document.getElementById('sfPay')?.value || 'cash';
  const id     = document.getElementById('sfId')?.value || '';

  if (!custId)                    { setFieldError('sfCustDisplay', t('err_select_cust'));  valid = false; }
  if (!qtyRaw)                    { setFieldError('sfQty', t('err_qty_required'));          valid = false; }
  const qty = parseInt(qtyRaw, 10);
  if (isNaN(qty) || qty < 1 || qty > 9999) { setFieldError('sfQty', t('err_qty_range')); valid = false; }
  if (isNaN(rate) || rate <= 0)   { setFieldError('sfRate', t('err_rate_required'));        valid = false; }
  if (!valid) return;

  // Duplicate check (same customer, same date) — only for new sales
  if (!id) {
    const existing = getState('allSales').find(s => s.customerId === custId && s.date === date && !s.deleted);
    if (existing) {
      const ok = await showConfirm('⚠️', t('sale_duplicate_warn'), '', {
        yesLabel: 'Yes, add another', noLabel: t('cancel'), danger: false
      });
      if (!ok) return;
    }
  }

  const data = { customerId: custId, date, qty, rate, total: qty * rate, payType, deleted: false };
  const btn  = document.getElementById('sfSubmitBtn');
  btnLoading(btn, true);

  try {
    if (id) {
      await withRetry(() => updateDoc(docR('sales', id), data));
      showToast(t('sale_updated'), 'success');
    } else {
      await withRetry(() => addDoc(biz('sales'), { ...data, createdAt: serverTimestamp() }));
      showToast(t('sale_saved'), 'success');
    }
    // Remember payment type for this customer
    _lastPayTypes[custId] = payType;
    closeOverlay('saleFormOverlay');
  } catch (err) {
    console.error('[data] saveSale', err);
    showToast(t('error_save'), 'error');
  } finally {
    btnLoading(btn, false);
  }
}

export async function deleteSale(id) {
  if (!canModify()) { showToast(t('staff_cannot'), 'error'); return; }
  const sale = findById(getState('allSales'), id);
  if (!sale) return;
  const cust = findById(getState('allCustomers'), sale.customerId);
  await softDelete('sales', id, cust?.name || 'Sale');
}

// ── Sales List Rendering ─────────────────────────────────────────────────
let _salesFilter = 'all';
let _salesSort   = 'newest';
let _salesSearch = '';
const _searchSalesDebounced = debounce((v) => { _salesSearch = v || ''; renderSales(); }, 250);

export function setSalesFilter(f, btn) {
  _salesFilter = f;
  document.querySelectorAll('[data-sales-filter]').forEach(b => b.classList.toggle('filter-btn--active', b.dataset.salesFilter === f));
  renderSales();
}

export function setSalesSort(s) {
  _salesSort = s;
  document.querySelectorAll('[data-sales-sort]').forEach(b => b.classList.toggle('sort-btn--active', b.dataset.salesSort === s));
  renderSales();
}

export function searchSales(v) { _searchSalesDebounced(v); }

export function renderSales() {
  let sales = [...getState('allSales')];
  const custs = getState('allCustomers');

  // Filter by pay type
  if (_salesFilter !== 'all') sales = sales.filter(s => s.payType === _salesFilter);

  // Search
  if (_salesSearch) {
    const q = _salesSearch.toLowerCase();
    sales = sales.filter(s => {
      const cust = custs.find(c => c.id === s.customerId);
      return (cust?.name || '').toLowerCase().includes(q) ||
             (s.date || '').includes(q) ||
             String(s.total || '').includes(q);
    });
  }

  // Sort
  if (_salesSort === 'newest')       sales.sort((a,b) => b.date.localeCompare(a.date));
  else if (_salesSort === 'amount')  sales.sort((a,b) => (b.total||0) - (a.total||0));
  else if (_salesSort === 'name')    sales.sort((a,b) => {
    const na = custs.find(c=>c.id===a.customerId)?.name||'';
    const nb = custs.find(c=>c.id===b.customerId)?.name||'';
    return na.localeCompare(nb);
  });

  const ct = document.getElementById('salesList');
  if (!ct) return;

  if (!sales.length) {
    ct.innerHTML = `<div class="empty-state"><div class="empty-state__icon">📋</div>
      <h3>${t('no_sales')}</h3>
      <button class="btn btn--primary" onclick="openSaleForm()">${t('add_sale')}</button></div>`;
    return;
  }

  const payIcon = { cash: '💵', upi: '📱', credit: '📒' };
  ct.innerHTML = sales.map((s, i) => {
    const cust = custs.find(c => c.id === s.customerId);
    return `<div class="sale-card" style="animation-delay:${i*0.03}s">
      <div class="sale-card__main">
        <button class="sale-card__cust-link" onclick="openCustomerProfile('${s.customerId}')"
          aria-label="View ${esc(cust?.name||'')} profile">${esc(cust?.name || '—')}</button>
        <div class="sale-card__meta">${s.qty} roti · ${fmtDate(s.date)}</div>
      </div>
      <div class="sale-card__right">
        <span class="sale-card__total">${fmtCurrency(s.total)}</span>
        <span class="sale-card__pay" title="${s.payType}">${payIcon[s.payType]||''}</span>
        <div class="sale-card__actions">
          <button class="ic-btn" onclick="openSaleForm('${s.id}')" aria-label="${t('edit_sale')}">✏️</button>
          <button class="ic-btn ic-btn--danger" onclick="deleteSale('${s.id}')" aria-label="${t('delete')}">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Customer Picker ──────────────────────────────────────────────────────
const _filterCustPickerDebounced = debounce((v) => _renderCustPicker(v || ''), 200);

export function filterCustPicker(v) { _filterCustPickerDebounced(v); }

function _renderCustPicker(query) {
  const ct = document.getElementById('custPickerList');
  if (!ct) return;
  let custs = getState('allCustomers').filter(c => c.status !== 'inactive');
  if (query) {
    const q = query.toLowerCase();
    custs = custs.filter(c => (c.name||'').toLowerCase().includes(q));
  }
  ct.innerHTML = custs.map(c =>
    `<button class="cust-pick-item${c.id === _saleFormCustId ? ' cust-pick-item--active' : ''}"
       onclick="selectCustomer('${c.id}')">${esc(c.name)}</button>`
  ).join('') || `<div class="empty-mini">${t('no_customers')}</div>`;
}

function _updateCustPicker(custId) {
  _saleFormCustId = custId;
  _renderCustPicker('');
  const cust = findById(getState('allCustomers'), custId);
  const display = document.getElementById('sfCustDisplay');
  if (display) display.textContent = cust?.name || t('field_customer');

  if (cust) {
    // Pre-fill rate, remembered payment type
    const rate = document.getElementById('sfRate');
    if (rate && !rate.value) rate.value = cust.rate || '';
    const pay = document.getElementById('sfPay');
    if (pay && _lastPayTypes[custId]) pay.value = _lastPayTypes[custId];
    _calcSaleTotal();
  }
}

export function selectCustomer(custId) {
  _updateCustPicker(custId);
  clearFieldError('sfCustDisplay');
}

// ── QUICK SALE ───────────────────────────────────────────────────────────
let _qsSkipped = new Set();  // custIds skipped today

export function loadQuickSale() {
  const custs = getState('allCustomers').filter(c => c.orderType === 'fixed' && c.status !== 'inactive');
  const today = todayStr();
  const todaySales = getState('allSales').filter(s => s.date === today);
  const doneCustIds = new Set(todaySales.map(s => s.customerId));

  const pending = custs.filter(c => !doneCustIds.has(c.id) && !_qsSkipped.has(c.id));
  const done    = custs.filter(c =>  doneCustIds.has(c.id));
  const skipped = custs.filter(c => _qsSkipped.has(c.id));

  // Stats
  const pendingEl = document.getElementById('qsPendingCount');
  const doneEl    = document.getElementById('qsDoneCount');
  if (pendingEl) pendingEl.textContent = pending.length;
  if (doneEl)    doneEl.textContent    = done.length;

  const ct = document.getElementById('quickSaleList');
  if (!ct) return;

  if (!custs.length) {
    ct.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">🍞</div>
      <h3>${t('no_fixed_custs')}</h3>
      <button class="btn btn--primary" onclick="openCustForm()">${t('add_customer_cta')}</button>
    </div>`;
    return;
  }

  let html = '';

  // Pending rows
  pending.forEach((c, i) => {
    html += `
    <div class="qs-row" id="qsRow_${c.id}" style="animation-delay:${i*0.04}s">
      <div class="qs-row__swipe-hint">Skip ➜</div>
      <div class="qs-row__inner">
        <div class="qs-row__cust">
          <button class="qs-row__name-link" onclick="openCustomerProfile('${c.id}')">${esc(c.name)}</button>
          <span class="qs-row__sub">${c.qty} roti · ${fmtCurrency(c.qty * c.rate)}</span>
        </div>
        <div class="qs-row__controls">
          <select class="qs-pay-sel" id="qsPay_${c.id}" aria-label="Payment type for ${esc(c.name)}">
            <option value="cash"${(_lastPayTypes[c.id]||'cash')==='cash'?' selected':''}>💵 ${t('pay_cash')}</option>
            <option value="upi" ${(_lastPayTypes[c.id]||'')==='upi'?' selected':''} >📱 ${t('pay_upi')}</option>
            <option value="credit"${(_lastPayTypes[c.id]||'')==='credit'?' selected':''}>📒 ${t('pay_credit')}</option>
          </select>
          <button class="btn btn--success btn--sm qs-done-btn" onclick="qsMarkDone('${c.id}')">
            ✓ ${t('done')}
          </button>
        </div>
        <button class="qs-skip-btn" onclick="qsSkip('${c.id}')" aria-label="${t('skip_today')}">${t('skip_today')}</button>
      </div>
    </div>`;
  });

  // Done rows
  done.forEach(c => {
    const sale = todaySales.find(s => s.customerId === c.id);
    const payIcon = { cash: '💵', upi: '📱', credit: '📒' }[sale?.payType || 'cash'];
    html += `<div class="qs-row qs-row--done">
      <div class="qs-row__inner qs-row__inner--done">
        <span class="qs-done-check">✅</span>
        <span class="qs-row__name-done">${esc(c.name)}</span>
        <span class="qs-row__meta-done">${sale?.qty||c.qty} roti · ${fmtCurrency(sale?.total||0)} ${payIcon}</span>
      </div>
    </div>`;
  });

  // Skipped rows
  skipped.forEach(c => {
    html += `<div class="qs-row qs-row--skipped">
      <div class="qs-row__inner">
        <span class="qs-row__name-done">${esc(c.name)}</span>
        <span class="badge badge--muted">${t('skipped')}</span>
        <button class="btn btn--ghost btn--xs" onclick="qsUndoSkip('${c.id}')">${t('undo_skip')}</button>
      </div>
    </div>`;
  });

  ct.innerHTML = html;

  // Swipe-to-skip gesture
  document.querySelectorAll('.qs-row:not(.qs-row--done):not(.qs-row--skipped)').forEach(_addQsSwipe);

  // Mark all done button
  const markAllBtn = document.getElementById('qsMarkAllBtn');
  if (markAllBtn) markAllBtn.style.display = pending.length > 0 ? 'flex' : 'none';
}

function _addQsSwipe(row) {
  let startX = 0;
  row.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  row.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    if (dx < 0) row.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  row.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    row.style.transition = 'transform 0.25s ease';
    row.style.transform  = '';
    setTimeout(() => row.style.transition = '', 300);
    if (dx < -70) {
      const custId = row.id.replace('qsRow_', '');
      qsSkip(custId);
    }
  });
}

export async function qsMarkDone(custId) {
  const cust    = findById(getState('allCustomers'), custId);
  if (!cust) return;
  const payType = document.getElementById(`qsPay_${custId}`)?.value || _lastPayTypes[custId] || 'cash';
  _lastPayTypes[custId] = payType;

  const data = {
    customerId: custId,
    date:       todayStr(),
    qty:        cust.qty,
    rate:       cust.rate,
    total:      cust.qty * cust.rate,
    payType,
    deleted:    false,
    createdAt:  serverTimestamp(),
  };

  const row = document.getElementById(`qsRow_${custId}`);
  if (row) {
    row.classList.add('qs-row--saving');
    row.querySelector('.qs-done-btn').disabled = true;
  }

  try {
    await withRetry(() => addDoc(biz('sales'), data));
    // Satisfying animation
    if (row) {
      row.classList.add('qs-row--success');
      if (navigator.vibrate) navigator.vibrate(40);
      await new Promise(r => setTimeout(r, 500));
      row.classList.remove('qs-row--saving');
    }
    // loadQuickSale is triggered by Firestore listener — no manual call needed
  } catch (err) {
    if (row) row.classList.remove('qs-row--saving', 'qs-row--success');
    showToast(t('error_save'), 'error');
  }
}

export function qsSkip(custId) {
  _qsSkipped.add(custId);
  loadQuickSale();
}

export function qsUndoSkip(custId) {
  _qsSkipped.delete(custId);
  loadQuickSale();
}

let _markAllInProgress = false;
export async function markAllFixedDone() {
  if (_markAllInProgress) return;

  const custs   = getState('allCustomers').filter(c => c.orderType === 'fixed' && c.status !== 'inactive');
  const today   = todayStr();
  const doneCustIds = new Set(getState('allSales').filter(s => s.date === today).map(s => s.customerId));
  const toSave  = custs.filter(c => !doneCustIds.has(c.id) && !_qsSkipped.has(c.id));

  if (!toSave.length) { showToast(t('all_done'), 'success'); return; }

  const ok = await showConfirm('✅', t('mark_all_done'),
    `Mark ${toSave.length} customers as done for today?`, { danger: false, yesLabel: 'Mark All Done' });
  if (!ok) return;

  _markAllInProgress = true;
  const btn = document.getElementById('qsMarkAllBtn');
  btnLoading(btn, true, t('marking_done'));

  try {
    // ✅ BATCH WRITES — not sequential awaits (v7 bug fixed)
    // Firestore batch max = 499 ops — chunk if needed
    const CHUNK = 499;
    for (let i = 0; i < toSave.length; i += CHUNK) {
      const chunk = toSave.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      chunk.forEach(c => {
        const ref = doc(collection(db, 'businesses', requireBizId(), 'sales'));
        batch.set(ref, {
          customerId: c.id,
          date:       today,
          qty:        c.qty,
          rate:       c.rate,
          total:      c.qty * c.rate,
          payType:    _lastPayTypes[c.id] || 'cash',
          deleted:    false,
          createdAt:  serverTimestamp(),
        });
      });
      await withRetry(() => batch.commit());
    }
    showToast(t('all_done'), 'success');
    if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
  } catch (err) {
    console.error('[data] markAllFixedDone', err);
    showToast(t('error_save'), 'error');
  } finally {
    _markAllInProgress = false;
    btnLoading(btn, false);
  }
}

// ── CUSTOMERS ────────────────────────────────────────────────────────────
const _searchCustDebounced = debounce((v) => { _renderCusts(v||''); }, 250);

export function loadCusts() { _renderCusts(''); }

export function searchCustomers(v) { _searchCustDebounced(v); }

function _renderCusts(query) {
  let custs = getState('allCustomers');
  if (query) {
    const q = query.toLowerCase();
    custs = custs.filter(c => (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q));
  }

  const ct = document.getElementById('custList');
  if (!ct) return;

  if (!custs.length) {
    ct.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">👥</div>
      <h3>${t('no_customers')}</h3>
      <button class="btn btn--primary" onclick="openCustForm()">${t('add_customer')}</button>
    </div>`;
    return;
  }

  ct.innerHTML = custs.map((c, i) => {
    const statusClass = c.status === 'inactive' ? 'badge--muted' : c.status === 'seasonal' ? 'badge--warning' : 'badge--success';
    const daily  = c.orderType === 'fixed' ? fmtCurrency(c.qty * c.rate) : null;
    return `<div class="cust-card${c.status !== 'active' ? ' cust-card--inactive' : ''}" style="animation-delay:${i*0.04}s">
      <div class="cust-card__top">
        <button class="cust-card__name" onclick="openCustomerProfile('${c.id}')">${esc(c.name)}</button>
        <span class="badge ${statusClass}">${t('status_' + (c.status||'active'))}</span>
      </div>
      <div class="cust-card__meta">
        <span>₹${c.rate}/roti</span>
        ${c.orderType === 'fixed' ? `<span>Fixed: ${c.qty}/day</span>` : '<span>Variable</span>'}
        ${daily ? `<span class="cust-card__daily">${t('expected_daily', daily.replace('₹',''))}</span>` : ''}
      </div>
      ${c.phone ? `<div class="cust-card__phone">📞 ${esc(c.phone)}</div>` : ''}
      <div class="cust-card__actions">
        <button class="ic-btn" onclick="openCustForm('${c.id}')" aria-label="${t('edit_customer')}">✏️</button>
        <button class="ic-btn ic-btn--danger" onclick="deleteCust('${c.id}')" aria-label="${t('delete')}">🗑️</button>
        <button class="ic-btn" onclick="toggleCustStatus('${c.id}')" aria-label="Change status">⚙️</button>
      </div>
    </div>`;
  }).join('');
}

export function openCustForm(id) {
  if (!canModify()) { showToast(t('staff_cannot'), 'error'); return; }
  clearAllFieldErrors('custForm');
  const form = document.getElementById('custForm');
  if (form) form.reset();
  document.getElementById('cfId').value = '';
  document.getElementById('cfFormTitle').textContent = id ? t('edit_customer') : t('add_customer');
  document.getElementById('cfFixedGroup').style.display = 'none';

  if (id) {
    const c = findById(getState('allCustomers'), id);
    if (!c) return;
    document.getElementById('cfId').value      = c.id;
    document.getElementById('cfName').value    = c.name   || '';
    document.getElementById('cfAddr').value    = c.address || '';
    document.getElementById('cfPhone').value   = c.phone  || '';
    document.getElementById('cfRate').value    = c.rate   || '';
    document.getElementById('cfType').value    = c.orderType || 'variable';
    document.getElementById('cfStatus').value  = c.status || 'active';
    if (c.orderType === 'fixed') {
      document.getElementById('cfFixedGroup').style.display = '';
      document.getElementById('cfQty').value = c.qty || '';
    }
  }
  openOverlay('custFormOverlay');
}

export function closeCustForm() { closeOverlay('custFormOverlay'); }

export function setCustOrderType(type) {
  document.getElementById('cfFixedGroup').style.display = type === 'fixed' ? '' : 'none';
  if (type !== 'fixed') {
    const qty = document.getElementById('cfQty');
    if (qty) qty.value = '';
  }
}

export async function saveCustomer(e) {
  e.preventDefault();
  clearAllFieldErrors('custForm');

  const name    = document.getElementById('cfName')?.value.trim() || '';
  const addr    = document.getElementById('cfAddr')?.value.trim() || '';
  const phone   = document.getElementById('cfPhone')?.value.replace(/\s/g,'') || '';
  const rate    = parseFloat(document.getElementById('cfRate')?.value || '');
  const type    = document.getElementById('cfType')?.value || 'variable';
  const qty     = type === 'fixed' ? parseInt(document.getElementById('cfQty')?.value||'0',10) : 0;
  const status  = document.getElementById('cfStatus')?.value || 'active';
  const id      = document.getElementById('cfId')?.value || '';

  let valid = true;
  if (!name)                         { setFieldError('cfName',  t('err_name_required')); valid = false; }
  if (phone && !/^\d{10}$/.test(phone)) { setFieldError('cfPhone', t('err_phone_invalid')); valid = false; }
  if (isNaN(rate)||rate<1||rate>500) { setFieldError('cfRate',  t('err_rate_cust'));      valid = false; }
  if (type==='fixed' && (isNaN(qty)||qty<1||qty>9999)) { setFieldError('cfQty', t('err_qty_cust')); valid = false; }
  if (!valid) return;

  const data = { name, address: addr, phone, rate, orderType: type, qty: type==='fixed'?qty:0, status };
  const btn  = document.getElementById('cfSubmitBtn');
  btnLoading(btn, true);

  try {
    if (id) {
      await withRetry(() => updateDoc(docR('customers', id), data));
      showToast(t('cust_saved'), 'success');
    } else {
      await withRetry(() => addDoc(biz('customers'), { ...data, createdAt: serverTimestamp() }));
      showToast(t('cust_saved'), 'success');
    }
    closeOverlay('custFormOverlay');
  } catch (err) {
    console.error('[data] saveCustomer', err);
    showToast(t('error_save'), 'error');
  } finally {
    btnLoading(btn, false);
  }
}

export async function deleteCust(id) {
  if (!canModify()) { showToast(t('staff_cannot'), 'error'); return; }
  const cust = findById(getState('allCustomers'), id);
  if (!cust) return;
  const ok = await showConfirm('🗑️', t('confirm_delete', cust.name), t('confirm_delete_msg'));
  if (!ok) return;
  try { await withRetry(() => deleteDoc(docR('customers', id))); showToast(t('cust_deleted'), 'success'); }
  catch (err) { showToast(t('error_delete'), 'error'); }
}

export async function toggleCustStatus(id) {
  if (!canModify()) return;
  const cust = findById(getState('allCustomers'), id);
  if (!cust) return;
  const next = { active: 'inactive', inactive: 'seasonal', seasonal: 'active' };
  const newStatus = next[cust.status || 'active'];
  await withRetry(() => updateDoc(docR('customers', id), { status: newStatus }));
  showToast(`Customer marked ${newStatus}`, 'info');
}

// ── CREDIT ───────────────────────────────────────────────────────────────
export function loadCredit() {
  const custs   = getState('allCustomers');
  const sales   = getState('allSales');
  const payments= getState('allCreditPayments');

  // Build credit summary per customer
  const summary = {};
  sales.filter(s => s.payType === 'credit').forEach(s => {
    if (!summary[s.customerId]) summary[s.customerId] = { given:0, paid:0, lastCreditDate:'', lastPayDate:'' };
    summary[s.customerId].given += s.total || 0;
    if (!summary[s.customerId].lastCreditDate || s.date > summary[s.customerId].lastCreditDate)
      summary[s.customerId].lastCreditDate = s.date;
  });
  payments.forEach(p => {
    if (!summary[p.customerId]) summary[p.customerId] = { given:0, paid:0, lastCreditDate:'', lastPayDate:'' };
    summary[p.customerId].paid += p.amount || 0;
    if (!summary[p.customerId].lastPayDate || p.date > summary[p.customerId].lastPayDate)
      summary[p.customerId].lastPayDate = p.date;
  });

  // Filter to only customers with credit activity
  let rows = Object.entries(summary)
    .map(([custId, data]) => {
      const cust    = custs.find(c => c.id === custId);
      const balance = data.given - data.paid;
      const daysSincePayment = data.lastPayDate ?
        daysBetween(data.lastPayDate, todayStr()) : null;
      return { custId, cust, ...data, balance, daysSincePayment };
    })
    .filter(r => r.balance !== 0 || r.given > 0);

  // Sort
  const sort = getState('creditSort') || 'balance';
  if (sort === 'balance')  rows.sort((a,b) => (b.balance||0) - (a.balance||0));
  if (sort === 'oldest')   rows.sort((a,b) => (b.daysSincePayment||0) - (a.daysSincePayment||0));
  if (sort === 'name')     rows.sort((a,b) => (a.cust?.name||'').localeCompare(b.cust?.name||''));

  // Header totals
  const totalGiven   = rows.reduce((s,r) => s + r.given, 0);
  const totalPaid    = rows.reduce((s,r) => s + r.paid, 0);
  const totalBalance = rows.reduce((s,r) => s + r.balance, 0);

  const _set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  _set('creditTotalGiven',   fmtCurrency(totalGiven));
  _set('creditTotalPaid',    fmtCurrency(totalPaid));
  _set('creditTotalBalance', fmtCurrency(totalBalance));

  const ct = document.getElementById('creditList');
  if (!ct) return;

  if (!rows.length) {
    ct.innerHTML = `<div class="empty-state"><div class="empty-state__icon">✅</div>
      <h3>${t('no_credit')}</h3></div>`;
    return;
  }

  ct.innerHTML = rows.map((r, i) => {
    if (!r.cust) return '';
    const balClass   = r.balance > 0 ? 'credit-card__bal--owed' : 'credit-card__bal--cleared';
    const urgency    = r.daysSincePayment === null ? '' :
      r.daysSincePayment > 30 ? 'credit-card--urgent' :
      r.daysSincePayment > 7  ? 'credit-card--warn'   : '';
    const payAgeText = r.daysSincePayment === null
      ? t('last_credit', fmtDate(r.lastCreditDate))
      : r.daysSincePayment > 30
        ? t('no_payment_days', r.daysSincePayment)
        : t('last_payment', fmtRelativeDate(r.lastPayDate));

    return `<div class="credit-card ${urgency}" style="animation-delay:${i*0.04}s">
      <div class="credit-card__top">
        <button class="credit-card__name" onclick="openCustomerProfile('${r.custId}')">${esc(r.cust.name)}</button>
        <span class="credit-card__bal ${balClass}">${fmtCurrency(r.balance)}</span>
      </div>
      <div class="credit-card__stats">
        <span>Given: ${fmtCurrency(r.given)}</span>
        <span>Paid: ${fmtCurrency(r.paid)}</span>
      </div>
      <div class="credit-card__age">${payAgeText}</div>
      <div class="credit-card__actions">
        ${r.balance > 0 ? `<button class="btn btn--primary btn--sm" onclick="openCreditPayment('${r.custId}',${r.balance})">${t('collect_payment')}</button>` : ''}
        ${r.cust.phone ? `<button class="btn btn--whatsapp btn--sm" onclick="sendWhatsAppReminder('${r.custId}',${r.balance})">${t('whatsapp_remind')}</button>` : ''}
        <button class="btn btn--ghost btn--sm" onclick="shareCreditStatement('${r.custId}')">${t('share_statement')}</button>
      </div>
    </div>`;
  }).join('');
}

export function openCreditPayment(custId, balance) {
  const cust = findById(getState('allCustomers'), custId);
  if (!cust) return;
  document.getElementById('crpCustId').value   = custId;
  document.getElementById('crpCustName').textContent = cust.name;
  document.getElementById('crpBalance').textContent  = fmtCurrency(balance);
  document.getElementById('crpFullBtn').textContent  = t('collect_full', fmtCurrency(balance).replace('₹',''));
  document.getElementById('crpAmount').value = '';
  clearFieldError('crpAmount');
  openOverlay('creditPaymentOverlay');
}

export function crpSetFull() {
  const bal = getState('allSales')
    .filter(s => s.customerId === document.getElementById('crpCustId')?.value && s.payType === 'credit')
    .reduce((s,x) => s + (x.total||0), 0)
    - getState('allCreditPayments')
      .filter(p => p.customerId === document.getElementById('crpCustId')?.value)
      .reduce((s,x) => s + (x.amount||0), 0);
  const el = document.getElementById('crpAmount');
  if (el) el.value = Math.max(0, Math.round(bal));
}

export async function saveCreditPayment(e) {
  e.preventDefault();
  clearFieldError('crpAmount');
  const custId  = document.getElementById('crpCustId')?.value;
  const amount  = parseFloat(document.getElementById('crpAmount')?.value || '');
  const date    = todayStr();

  if (isNaN(amount) || amount <= 0) { setFieldError('crpAmount', t('err_pay_amount')); return; }

  const btn = document.getElementById('crpSubmitBtn');
  btnLoading(btn, true);
  try {
    await withRetry(() => addDoc(biz('creditPayments'), { customerId: custId, amount, date, createdAt: serverTimestamp() }));
    showToast(t('credit_cleared'), 'success');

    // Check if fully cleared
    const cust = findById(getState('allCustomers'), custId);
    const totalGiven = getState('allSales').filter(s=>s.customerId===custId&&s.payType==='credit').reduce((s,x)=>s+(x.total||0),0);
    const totalPaid  = getState('allCreditPayments').filter(p=>p.customerId===custId).reduce((s,x)=>s+(x.amount||0),0) + amount;
    const newBal = totalGiven - totalPaid;

    if (newBal <= 0) {
      showToast(t('paid_fully'), 'success', 2000);
      setTimeout(() => closeOverlay('creditPaymentOverlay'), 1500);
    } else {
      closeOverlay('creditPaymentOverlay');
    }
  } catch (err) {
    showToast(t('error_save'), 'error');
  } finally {
    btnLoading(btn, false);
  }
}

export function sendWhatsAppReminder(custId, balance) {
  const cust = findById(getState('allCustomers'), custId);
  if (!cust?.phone) return;
  const bizName = getState('businessName');
  const lang    = localStorage.getItem('mdLang') || 'en';
  const msg = lang === 'hi'
    ? `नमस्ते ${cust.name} जी! आपका ${bizName} में ₹${Math.round(balance)} बाकी है। कृपया भुगतान करें। धन्यवाद 🙏`
    : `Hello ${cust.name}! Your outstanding balance at ${bizName} is ₹${Math.round(balance)}. Kindly arrange payment. Thank you! 🙏`;
  window.open(buildWhatsAppLink(cust.phone, msg), '_blank');
}

export async function shareCreditStatement(custId) {
  const cust     = findById(getState('allCustomers'), custId);
  if (!cust) return;
  const sales    = getState('allSales').filter(s => s.customerId === custId && s.payType === 'credit');
  const payments = getState('allCreditPayments').filter(p => p.customerId === custId);
  const totalGiven= sales.reduce((s,x)=>s+(x.total||0),0);
  const totalPaid = payments.reduce((s,x)=>s+(x.amount||0),0);
  const balance   = totalGiven - totalPaid;
  const bizName   = getState('businessName');

  const text = [
    `📋 Credit Statement — ${bizName}`,
    `Customer: ${cust.name}`,
    `As of: ${fmtDateLong(todayStr())}`,
    '─────────────────────',
    `Total Credit: ${fmtCurrency(totalGiven)}`,
    `Total Paid:   ${fmtCurrency(totalPaid)}`,
    `Outstanding:  ${fmtCurrency(balance)}`,
    '─────────────────────',
    balance > 0 ? `Please arrange payment of ${fmtCurrency(balance)}` : '✅ Account fully cleared',
    `\nSent via Meri Dukaan`
  ].join('\n');

  await shareContent({ title: `${cust.name} — Credit Statement`, text });
}

// ── EXPENSES ─────────────────────────────────────────────────────────────
export function loadExps() {
  const exps = getState('allExpenses');
  const ct   = document.getElementById('expenseList');
  if (!ct) return;

  if (!exps.length) {
    ct.innerHTML = `<div class="empty-state"><div class="empty-state__icon">💸</div>
      <h3>${t('no_expenses')}</h3>
      <button class="btn btn--primary" onclick="openExpForm()">${t('add_expense')}</button></div>`;
    return;
  }

  ct.innerHTML = exps.map((e, i) =>
    `<div class="exp-card" style="animation-delay:${i*0.04}s">
      <div class="exp-card__main">
        <span class="exp-card__cat">${esc(e.category)}</span>
        ${e.note ? `<span class="exp-card__note">${esc(e.note)}</span>` : ''}
        <span class="exp-card__date">${fmtDate(e.date)}</span>
      </div>
      <div class="exp-card__right">
        <span class="exp-card__amt">${fmtCurrency(e.amount)}</span>
        <div class="exp-card__actions">
          <button class="ic-btn" onclick="openExpForm('${e.id}')" aria-label="${t('edit_expense')}">✏️</button>
          <button class="ic-btn ic-btn--danger" onclick="deleteExp('${e.id}')" aria-label="${t('delete')}">🗑️</button>
        </div>
      </div>
    </div>`
  ).join('');
}

export function openExpForm(id) {
  clearAllFieldErrors('expForm');
  const form = document.getElementById('expForm');
  if (form) form.reset();
  document.getElementById('efId').value = '';
  document.getElementById('efDate').value = todayStr();
  document.getElementById('efFormTitle').textContent = id ? t('edit_expense') : t('add_expense');

  if (id) {
    const exp = findById(getState('allExpenses'), id);
    if (!exp) return;
    document.getElementById('efId').value       = exp.id;
    document.getElementById('efCategory').value = exp.category || '';
    document.getElementById('efAmount').value   = exp.amount   || '';
    document.getElementById('efNote').value     = exp.note     || '';
    document.getElementById('efDate').value     = exp.date     || todayStr();
    if (exp.qty)  document.getElementById('efQty').value  = exp.qty;
    if (exp.unit) document.getElementById('efUnit').value = exp.unit;
  }
  openOverlay('expFormOverlay');
}

export function closeExpForm() { closeOverlay('expFormOverlay'); }

export async function saveExp(e) {
  e.preventDefault();
  clearAllFieldErrors('expForm');

  const category = document.getElementById('efCategory')?.value.trim() || '';
  const amount   = parseFloat(document.getElementById('efAmount')?.value || '');
  const note     = document.getElementById('efNote')?.value.trim() || '';
  const date     = document.getElementById('efDate')?.value || todayStr();
  const qty      = document.getElementById('efQty')?.value || '';
  const unit     = document.getElementById('efUnit')?.value || '';
  const id       = document.getElementById('efId')?.value || '';

  let valid = true;
  if (!category)              { setFieldError('efCategory', t('err_generic')); valid = false; }
  if (isNaN(amount)||amount<=0){ setFieldError('efAmount', t('err_exp_amount')); valid = false; }
  if (!valid) return;

  const data = { category, amount, note, date, ...(qty?{qty:parseFloat(qty)}:{}), ...(unit?{unit}:{}) };
  const btn  = document.getElementById('efSubmitBtn');
  btnLoading(btn, true);

  try {
    if (id) {
      await withRetry(() => updateDoc(docR('expenses', id), data));
      showToast(t('exp_saved'), 'success');
    } else {
      await withRetry(() => addDoc(biz('expenses'), { ...data, createdAt: serverTimestamp() }));
      showToast(t('exp_saved'), 'success');
    }
    closeOverlay('expFormOverlay');
  } catch (err) { showToast(t('error_save'), 'error'); }
  finally { btnLoading(btn, false); }
}

export async function deleteExp(id) {
  if (!canModify()) { showToast(t('staff_cannot'), 'error'); return; }
  const exp = findById(getState('allExpenses'), id);
  if (!exp) return;
  await softDelete('expenses', id, exp.category);
}

// ── WASTE ────────────────────────────────────────────────────────────────
export function loadWasteList() {
  const waste = getState('allWaste');
  const sales = getState('allSales');
  const ct    = document.getElementById('wasteList');
  if (!ct) return;

  if (!waste.length) {
    ct.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🗑️</div>
      <h3>${t('no_waste')}</h3>
      <button class="btn btn--primary" onclick="openWasteForm()">${t('add_waste')}</button></div>`;
    return;
  }

  // TODAY'S rate (not all-time average) for cost calculation
  const today     = todayStr();
  const todaySales= sales.filter(s => s.date === today);
  const todayRate = todaySales.length
    ? todaySales.reduce((s,x) => s + (x.total||0), 0) / todaySales.reduce((s,x) => s + (x.qty||0), 0)
    : 0;

  ct.innerHTML = waste.map((w, i) => {
    const rateForDay = todayRate; // TODO: could use that day's rate for older entries
    const cost = w.qty * rateForDay;
    return `<div class="waste-card" style="animation-delay:${i*0.04}s">
      <div class="waste-card__main">
        <span class="waste-card__qty">${w.qty} roti wasted</span>
        <span class="waste-card__date">${fmtDate(w.date)}</span>
        ${w.note ? `<span class="waste-card__note">${esc(w.note)}</span>` : ''}
      </div>
      <div class="waste-card__right">
        ${cost > 0 ? `<span class="waste-card__cost">${fmtCurrency(cost)} lost</span>` : ''}
        <button class="ic-btn ic-btn--danger" onclick="deleteWaste('${w.id}')" aria-label="${t('delete')}">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

export function openWasteForm(id) {
  clearAllFieldErrors('wasteForm');
  const form = document.getElementById('wasteForm');
  if (form) form.reset();
  document.getElementById('wfId').value    = '';
  document.getElementById('wfDate').value  = todayStr();
  document.getElementById('wfFormTitle').textContent = id ? t('edit_waste') : t('add_waste');

  // Show today's production context
  const today      = todayStr();
  const todayTotal = getState('allSales').filter(s=>s.date===today).reduce((s,x)=>s+(x.qty||0),0);
  const ctxEl      = document.getElementById('wfProductionCtx');
  if (ctxEl) ctxEl.textContent = t('today_production', todayTotal);

  if (id) {
    const w = findById(getState('allWaste'), id);
    if (!w) return;
    document.getElementById('wfId').value   = w.id;
    document.getElementById('wfQty').value  = w.qty;
    document.getElementById('wfNote').value = w.note || '';
    document.getElementById('wfDate').value = w.date;
  }
  openOverlay('wasteFormOverlay');
}

export function closeWasteForm() { closeOverlay('wasteFormOverlay'); }

export async function saveWaste(e) {
  e.preventDefault();
  clearAllFieldErrors('wasteForm');

  const qty  = parseInt(document.getElementById('wfQty')?.value||'0', 10);
  const note = document.getElementById('wfNote')?.value.trim()||'';
  const date = document.getElementById('wfDate')?.value||todayStr();
  const id   = document.getElementById('wfId')?.value||'';

  if (isNaN(qty)||qty<1||qty>9999) { setFieldError('wfQty', t('err_waste_qty')); return; }

  // Warn if waste > 30% of today's production
  const today      = todayStr();
  const todayTotal = getState('allSales').filter(s=>s.date===today).reduce((s,x)=>s+(x.qty||0),0);
  if (todayTotal > 0 && qty / todayTotal > 0.3) {
    const ok = await showConfirm('⚠️', t('waste_high_warn'),
      `${qty} waste on ${todayTotal} produced (${Math.round(qty/todayTotal*100)}%).`, { danger: false });
    if (!ok) return;
  }

  const data = { qty, note, date };
  const btn  = document.getElementById('wfSubmitBtn');
  btnLoading(btn, true);
  try {
    if (id) {
      await withRetry(() => updateDoc(docR('waste', id), data));
    } else {
      await withRetry(() => addDoc(biz('waste'), { ...data, createdAt: serverTimestamp() }));
    }
    showToast(t('waste_saved'), 'success');
    closeOverlay('wasteFormOverlay');
  } catch (err) { showToast(t('error_save'), 'error'); }
  finally { btnLoading(btn, false); }
}

export async function deleteWaste(id) {
  if (!canModify()) { showToast(t('staff_cannot'), 'error'); return; }
  const w = findById(getState('allWaste'), id);
  if (!w) return;
  await softDelete('waste', id, 'Waste record');
}

// ── Customer Profile ──────────────────────────────────────────────────────
export function openCustomerProfile(custId) {
  const cust = findById(getState('allCustomers'), custId);
  if (!cust) return;

  const sales    = getState('allSales').filter(s => s.customerId === custId);
  const payments = getState('allCreditPayments').filter(p => p.customerId === custId);
  const given    = sales.filter(s=>s.payType==='credit').reduce((s,x)=>s+(x.total||0),0);
  const paid     = payments.reduce((s,x)=>s+(x.amount||0),0);
  const balance  = given - paid;

  const container = document.getElementById('customerProfileContent');
  if (!container) return;

  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-name">${esc(cust.name)}</div>
      <span class="badge badge--${cust.status==='active'?'success':cust.status==='inactive'?'muted':'warning'}">${t('status_'+(cust.status||'active'))}</span>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><span class="profile-stat__label">Rate</span><span class="profile-stat__val">₹${cust.rate}/roti</span></div>
      <div class="profile-stat"><span class="profile-stat__label">Order</span><span class="profile-stat__val">${cust.orderType==='fixed'?`Fixed ${cust.qty}/day`:'Variable'}</span></div>
      <div class="profile-stat"><span class="profile-stat__label">Total sales</span><span class="profile-stat__val">${sales.length}</span></div>
      <div class="profile-stat"><span class="profile-stat__label">Balance</span><span class="profile-stat__val${balance>0?' stat--owed':''}">${fmtCurrency(balance)}</span></div>
    </div>
    ${cust.phone ? `<div class="profile-phone"><a href="tel:${esc(cust.phone)}">${esc(cust.phone)}</a></div>` : ''}
    <div class="profile-actions">
      <button class="btn btn--primary btn--sm" onclick="openSaleForm();selectCustomer('${custId}');closeOverlay('customerProfileOverlay')">${t('add_sale')}</button>
      ${balance>0?`<button class="btn btn--sm" onclick="openCreditPayment('${custId}',${balance});closeOverlay('customerProfileOverlay')">${t('collect_payment')}</button>`:''}
      ${cust.phone?`<button class="btn btn--whatsapp btn--sm" onclick="sendWhatsAppReminder('${custId}',${balance})">${t('whatsapp_remind')}</button>`:''}
    </div>
    <div class="profile-recent-title">Recent Sales</div>
    ${sales.slice(0,10).map(s=>`
      <div class="preview-row">
        <div class="preview-row__info">
          <span class="preview-row__name">${fmtDate(s.date)} · ${s.qty} roti</span>
          <span class="preview-row__meta">${s.payType}</span>
        </div>
        <span class="preview-row__amt">${fmtCurrency(s.total)}</span>
      </div>`).join('') || '<p class="empty-mini">No sales yet</p>'}
  `;
  openOverlay('customerProfileOverlay');
}

// ── Batch delete (with 499-op chunking) ──────────────────────────────────
export async function batchDeleteSelected(col, ids) {
  if (!canModify()) { showToast(t('staff_cannot'), 'error'); return; }
  if (!ids.length) return;
  const CHUNK = 499;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach(id => batch.delete(docR(col, id)));
    await withRetry(() => batch.commit());
  }
}

// Make functions global for HTML onclick
const _globals = {
  openSaleForm, closeSaleForm, saveSale, deleteSale, calcSaleTotal, openUpiCollect,
  filterCustPicker, selectCustomer, searchSales, setSalesFilter, setSalesSort,
  openCustForm, closeCustForm, saveCustomer, deleteCust, toggleCustStatus, searchCustomers,
  openCreditPayment, saveCreditPayment, crpSetFull, sendWhatsAppReminder, shareCreditStatement,
  openExpForm, closeExpForm, saveExp, deleteExp,
  openWasteForm, closeWasteForm, saveWaste, deleteWaste,
  markAllFixedDone, qsMarkDone, qsSkip, qsUndoSkip,
  openCustomerProfile, renderSales, loadCusts, loadCredit, loadExps, loadWasteList, loadQuickSale,
};
Object.assign(window, _globals);

export { loadQuickSale };
console.log('[data] Meri Dukaan v8.0 — data module ready');
