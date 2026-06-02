/* ================================================
   MERI DUKAAN v7.0 — NOTEBOOK
   Notes CRUD · Search · Pin · Copy · Firebase sync

   PHASE 2 CHANGES:
   ✅ 100% English — all Hindi/Hinglish text removed
   ✅ Empty states use professional English copy
   ✅ Toast messages in English
   ================================================ */

var notebookSearchQuery = '';
var noteCats = {
    general:  { label: 'General',  icon: '📝' },
    reminder: { label: 'Reminder', icon: '🔔' },
    idea:     { label: 'Idea',     icon: '💡' },
    supplier: { label: 'Supplier', icon: '🏪' }
};

function loadNotes() {
    var filtered = filterNotes(allNotes, notebookSearchQuery);
    var pinned   = filtered.filter(function(n) { return n.pinned; });
    var rest     = filtered.filter(function(n) { return !n.pinned; });
    var sorted   = pinned.concat(rest);

    var countEl = document.getElementById('noteCount');
    if (countEl) countEl.textContent = allNotes.length + ' note' + (allNotes.length !== 1 ? 's' : '');

    var ct = document.getElementById('noteList');
    if (!ct) return;

    if (!allNotes.length) {
        ct.innerHTML =
            '<div class="empty">' +
            '<div class="empty-ic">📓</div>' +
            '<h3>No Notes Yet</h3>' +
            '<p>Save supplier numbers, reminders, ideas — anything you want to remember.</p>' +
            '<button class="empty-btn" onclick="openNoteForm()">+ Write First Note</button>' +
            '</div>';
        return;
    }

    if (!sorted.length && notebookSearchQuery) {
        ct.innerHTML =
            '<div class="empty">' +
            '<div class="empty-ic">🔍</div>' +
            '<h3>No Results</h3>' +
            '<p>No notes found for "' + esc(notebookSearchQuery) + '"</p>' +
            '</div>';
        return;
    }

    var h = '';
    sorted.forEach(function(note, i) {
        var cat     = noteCats[note.category] || noteCats.general;
        var preview = (note.content || '').substring(0, 120) + ((note.content || '').length > 120 ? '…' : '');

        h += '<div class="note-card' + (note.pinned ? ' note-pinned' : '') + '" style="animation-delay:' + (i * 0.04) + 's">';
        h += '<div class="note-top">';
        if (note.title) h += '<div class="note-title">' + esc(note.title) + '</div>';
        h += '<div class="note-meta">' +
             '<span class="note-cat">' + cat.icon + ' ' + cat.label + '</span>' +
             (note.pinned ? '<span class="note-pin-badge">📌</span>' : '') +
             '</div></div>';
        h += '<div class="note-body">' + esc(preview) + '</div>';
        h += '<div class="note-foot">' +
             '<span class="note-date">' + fmtDateLong(note.date || '') + '</span>' +
             '<div class="note-acts">';
        h += '<button class="ic-btn ib-copy" onclick="copyNote(\'' + note.id + '\')" aria-label="Copy note">📋</button>';
        if (canModify()) {
            h += '<button class="ic-btn ib-e" onclick="openNoteForm(\'' + note.id + '\')" aria-label="Edit note">✏️</button>';
            h += '<button class="ic-btn ib-d" onclick="confirmDelNote(\'' + note.id + '\')" aria-label="Delete note">🗑️</button>';
        }
        h += '</div></div></div>';
    });
    ct.innerHTML = h;
}

function filterNotes(notes, query) {
    if (!query || !query.trim()) return notes;
    var q = query.toLowerCase().trim();
    return notes.filter(function(n) {
        return (n.title   || '').toLowerCase().indexOf(q) !== -1 ||
               (n.content || '').toLowerCase().indexOf(q) !== -1;
    });
}

var _searchNotesDebounced = null;
function searchNotes(val) {
    if (!_searchNotesDebounced) {
        _searchNotesDebounced = debounce(function(v) {
            notebookSearchQuery = v || '';
            loadNotes();
        }, 250);
    }
    _searchNotesDebounced(val);
}

function clearNoteSearch() {
    notebookSearchQuery = '';
    var el = document.getElementById('noteSearch');
    if (el) el.value = '';
    loadNotes();
}


// ============ NOTE FORM ============
function openNoteForm(id) {
    var form = document.getElementById('noteForm');
    if (form) form.reset();
    document.getElementById('nfId').value       = '';
    document.getElementById('nfCategory').value = 'general';
    document.getElementById('nfPinned').checked = false;

    document.querySelectorAll('#noteForm .note-cat-btn').forEach(function(b) {
        b.classList.remove('active');
    });
    var firstCat = document.querySelector('#noteForm .note-cat-btn');
    if (firstCat) firstCat.classList.add('active');

    var titleEl = document.getElementById('nfFormTitle');

    if (id) {
        if (titleEl) titleEl.textContent = 'Edit Note';
        var note = findInArray(allNotes, id);
        if (note) {
            document.getElementById('nfId').value       = note.id;
            document.getElementById('nfTitle').value    = note.title   || '';
            document.getElementById('nfContent').value  = note.content || '';
            document.getElementById('nfCategory').value = note.category || 'general';
            document.getElementById('nfPinned').checked = !!note.pinned;
            document.querySelectorAll('#noteForm .note-cat-btn').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-cat') === note.category);
            });
        }
    } else {
        if (titleEl) titleEl.textContent = 'New Note';
    }

    openOverlay('noteFormOverlay');
    setTimeout(function() {
        var c = document.getElementById('nfContent');
        if (c) c.focus();
    }, 350);
}

function setNoteCategory(cat, btn) {
    document.getElementById('nfCategory').value = cat;
    document.querySelectorAll('#noteForm .note-cat-btn').forEach(function(b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');
}

async function saveNote(e) {
    e.preventDefault();
    var content = document.getElementById('nfContent').value.trim();
    if (!content) { showToast('❌ Note content cannot be empty!', 'error'); return; }

    var data = {
        title:    document.getElementById('nfTitle').value.trim(),
        content:  content,
        category: document.getElementById('nfCategory').value || 'general',
        pinned:   document.getElementById('nfPinned').checked,
        date:     todayStr()
    };

    var btn = document.getElementById('nfSubmitBtn');
    btnLoading(btn, true);
    try {
        var idV = document.getElementById('nfId').value;
        if (idV) { await fsUpdate('notes', idV, data); showToast('✅ Note updated!'); }
        else     { await fsAdd('notes', data);          showToast('✅ Note saved!'); }
        closeOverlay('noteFormOverlay');
    } catch (err) {
        console.error('[Notebook]', err);
        showToast('❌ Error saving note', 'error');
    } finally {
        btnLoading(btn, false);
    }
}

function confirmDelNote(id) {
    if (!canModify()) { showToast('❌ Staff cannot delete notes', 'error'); return; }
    var note    = findInArray(allNotes, id);
    if (!note) return;
    var preview = note.title || (note.content || '').substring(0, 40);
    showConfirm('🗑️', 'Delete Note?', '"' + preview + '" will be permanently deleted.', async function() {
        try   { await fsDelete('notes', id); showToast('✅ Note deleted!'); }
        catch (err) { showToast('❌ Error deleting note', 'error'); }
    });
}

function copyNote(id) {
    var note = findInArray(allNotes, id);
    if (!note) return;
    var text = (note.title ? note.title + '\n' : '') + (note.content || '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(function()  { showToast('📋 Note copied to clipboard!'); })
            .catch(function() { fallbackCopy(text); });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    var ta       = document.createElement('textarea');
    ta.value     = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('📋 Note copied!');
    } catch (e) {
        showToast('❌ Could not copy note', 'error');
    }
    document.body.removeChild(ta);
}

console.log('[Notebook] Meri Dukaan v7.0 — Notebook loaded');
