/* ================================================
   MERI DUKAAN v8.0 — NOTEBOOK
   Search · Pin · Copy · Firebase sync · i18n
   ================================================ */
import { getState }                             from './state.js';
import { db }                                   from './auth.js';
import { requireBizId, canModify }              from './state.js';
import { addDoc, updateDoc, deleteDoc,
         collection, doc, serverTimestamp }      from 'firebase/firestore';
import { t }                                    from './i18n.js';
import { showToast, showConfirm, openOverlay,
         closeOverlay, setFieldError,
         clearAllFieldErrors, btnLoading,
         debounce, findById, esc,
         fmtDateLong, todayStr, withRetry }     from './core.js';

const biz  = (col) => collection(db, 'businesses', requireBizId(), col);
const docR = (col, id) => doc(db, 'businesses', requireBizId(), col, id);

const CATS = {
  general:  { label: 'General',  icon: '📝' },
  reminder: { label: 'Reminder', icon: '🔔' },
  idea:     { label: 'Idea',     icon: '💡' },
  supplier: { label: 'Supplier', icon: '🏪' },
};

let _searchQ = '';
const _searchDebounced = debounce((v) => { _searchQ = v||''; loadNotes(); }, 250);

export function loadNotes() {
  let notes = getState('allNotes');
  const countEl = document.getElementById('noteCount');
  if (countEl) countEl.textContent = `${notes.length} note${notes.length!==1?'s':''}`;

  if (_searchQ) {
    const q = _searchQ.toLowerCase();
    notes = notes.filter(n =>
      (n.title||'').toLowerCase().includes(q) || (n.content||'').toLowerCase().includes(q));
  }

  const pinned = notes.filter(n => n.pinned);
  const rest   = notes.filter(n => !n.pinned);
  const sorted = [...pinned, ...rest];

  const ct = document.getElementById('noteList');
  if (!ct) return;

  if (!getState('allNotes').length) {
    ct.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">📓</div>
      <h3>${t('no_notes')}</h3>
      <p>Save supplier numbers, reminders, ideas — anything you want to remember.</p>
      <button class="btn btn--primary" onclick="openNoteForm()">+ ${t('add_note')}</button>
    </div>`;
    return;
  }
  if (!sorted.length && _searchQ) {
    ct.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">🔍</div>
      <h3>${t('no_notes_search', esc(_searchQ))}</h3>
    </div>`;
    return;
  }

  ct.innerHTML = sorted.map((note, i) => {
    const cat     = CATS[note.category] || CATS.general;
    const preview = (note.content||'').substring(0,120) + ((note.content||'').length>120?'…':'');
    return `<div class="note-card${note.pinned?' note-card--pinned':''}" style="animation-delay:${i*0.04}s">
      <div class="note-card__top">
        ${note.title ? `<div class="note-card__title">${esc(note.title)}</div>` : ''}
        <div class="note-card__meta">
          <span class="badge badge--outline">${cat.icon} ${cat.label}</span>
          ${note.pinned ? '<span class="note-pin-badge" aria-label="Pinned">📌</span>' : ''}
        </div>
      </div>
      <div class="note-card__body">${esc(preview)}</div>
      <div class="note-card__foot">
        <span class="note-card__date">${fmtDateLong(note.date||'')}</span>
        <div class="note-card__actions">
          <button class="ic-btn" onclick="copyNote('${note.id}')" aria-label="${t('copy')}">📋</button>
          <button class="ic-btn" onclick="togglePinNote('${note.id}')" aria-label="${note.pinned?t('unpin_note'):t('pin_note')}">${note.pinned?'📍':'📌'}</button>
          ${canModify()?`<button class="ic-btn" onclick="openNoteForm('${note.id}')" aria-label="${t('edit')}">✏️</button>
          <button class="ic-btn ic-btn--danger" onclick="deleteNote('${note.id}')" aria-label="${t('delete')}">🗑️</button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

export function searchNotes(v) { _searchDebounced(v); }
export function clearNoteSearch() {
  _searchQ = '';
  const el = document.getElementById('noteSearch');
  if (el) el.value = '';
  loadNotes();
}

export function openNoteForm(id) {
  clearAllFieldErrors('noteForm');
  const form = document.getElementById('noteForm');
  if (form) form.reset();
  document.getElementById('nfId').value       = '';
  document.getElementById('nfCategory').value = 'general';
  document.getElementById('nfPinned').checked  = false;
  document.getElementById('nfFormTitle').textContent = id ? t('edit_note') : t('add_note');
  document.querySelectorAll('#noteForm .cat-btn').forEach(b => b.classList.toggle('cat-btn--active', b.dataset.cat==='general'));

  if (id) {
    const note = findById(getState('allNotes'), id);
    if (!note) return;
    document.getElementById('nfId').value       = note.id;
    document.getElementById('nfTitle').value    = note.title   || '';
    document.getElementById('nfContent').value  = note.content || '';
    document.getElementById('nfCategory').value = note.category|| 'general';
    document.getElementById('nfPinned').checked  = !!note.pinned;
    document.querySelectorAll('#noteForm .cat-btn').forEach(b =>
      b.classList.toggle('cat-btn--active', b.dataset.cat === note.category));
  }
  openOverlay('noteFormOverlay');
}

export function closeNoteForm() { closeOverlay('noteFormOverlay'); }

export function setNoteCategory(cat, btn) {
  document.getElementById('nfCategory').value = cat;
  document.querySelectorAll('#noteForm .cat-btn').forEach(b => b.classList.remove('cat-btn--active'));
  btn.classList.add('cat-btn--active');
}

export async function saveNote(e) {
  e.preventDefault();
  const content = document.getElementById('nfContent')?.value.trim();
  if (!content) { setFieldError('nfContent', t('note_content_req')); return; }

  const data = {
    title:    document.getElementById('nfTitle')?.value.trim() || '',
    content,
    category: document.getElementById('nfCategory')?.value || 'general',
    pinned:   document.getElementById('nfPinned')?.checked  || false,
    date:     todayStr(),
  };
  const id  = document.getElementById('nfId')?.value || '';
  const btn = document.getElementById('nfSubmitBtn');
  btnLoading(btn, true);
  try {
    if (id) { await withRetry(()=>updateDoc(docR('notes',id),data)); showToast(t('note_saved'),'success'); }
    else    { await withRetry(()=>addDoc(biz('notes'),{...data,createdAt:serverTimestamp()})); showToast(t('note_saved'),'success'); }
    closeOverlay('noteFormOverlay');
  } catch (err) { showToast(t('error_save'),'error'); }
  finally { btnLoading(btn, false); }
}

export async function deleteNote(id) {
  if (!canModify()) { showToast(t('staff_cannot'),'error'); return; }
  const note = findById(getState('allNotes'), id);
  if (!note) return;
  const ok = await showConfirm('🗑️', t('delete'), `"${note.title||note.content.substring(0,40)}" will be deleted.`);
  if (!ok) return;
  try { await withRetry(()=>deleteDoc(docR('notes',id))); showToast(t('note_deleted'),'success'); }
  catch(err) { showToast(t('error_delete'),'error'); }
}

export async function togglePinNote(id) {
  const note = findById(getState('allNotes'), id);
  if (!note) return;
  await withRetry(()=>updateDoc(docR('notes',id),{ pinned: !note.pinned }));
}

export function copyNote(id) {
  const note = findById(getState('allNotes'), id);
  if (!note) return;
  const text = (note.title?note.title+'\n':'') + (note.content||'');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(()=>showToast(t('note_copied'))).catch(()=>_fallbackCopy(text));
  } else { _fallbackCopy(text); }
}

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText='position:fixed;top:-9999px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast(t('note_copied')); }
  catch { showToast(t('err_generic'),'error'); }
  document.body.removeChild(ta);
}

const _globals = { loadNotes, searchNotes, clearNoteSearch, openNoteForm, closeNoteForm, saveNote, deleteNote, togglePinNote, copyNote, setNoteCategory };
Object.assign(window, _globals);
console.log('[notebook] Meri Dukaan v8.0 ready');
