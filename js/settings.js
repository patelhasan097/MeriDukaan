/* ================================================
   MERI DUKAAN v7.0 — SETTINGS
   Settings · Team · Import/Export · Email Alerts

   PHASE 4 ADDITIONS vs Phase 1:
   ✅ renderEmailSettings() — renders email alert config UI
   ✅ saveEmailConfigFromUI() — saves all email settings to localStorage
   ✅ toggleAlertType() — enable/disable individual alert types
   ✅ importData() — FULLY rewritten with Firestore batch writes
      - Phase 1 still used sequential await per record (O(n) requests)
      - Now: customers pre-generate IDs via doc() before commit,
        allowing custIdMap build WITHOUT a network round-trip per customer.
        Then sales/expenses/waste/creditPayments/notes all batched 499/commit.
        For 500 records: ~2 batch commits vs 500 sequential requests.
   ✅ All Phase 1 fixes (notes delete/import, saveNewPin SHA-256) retained
   ================================================ */


function loadSettings() {
    if (currentUser) {
        var avatar = document.getElementById('suAvatar');
        if (avatar) {
            if (currentUser.photoURL) { avatar.src = currentUser.photoURL; avatar.style.display = ''; }
            else avatar.style.display = 'none';
        }
        var el;
        el = document.getElementById('suName');  if (el) el.textContent = currentUser.displayName || 'User';
        el = document.getElementById('suEmail'); if (el) el.textContent = currentUser.email;
        el = document.getElementById('suRole');  if (el) el.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
    }
    updateThemeUI();
    updateSyncStatus();
    renderEmailSettings();
    var vEl = document.getElementById('appVersionText');
    if (vEl) vEl.textContent = 'v7.0 • PWA • ' + (navigator.onLine ? 'Online' : 'Offline');
}

function updateSyncStatus() {
    var dot = document.getElementById('syncDot'), status = document.getElementById('syncStatus');
    if (!dot || !status) return;
    if (navigator.onLine) { dot.className = 'sync-dot online'; status.textContent = 'Connected • Real-time sync active'; }
    else { dot.className = 'sync-dot offline'; status.textContent = 'Offline • Changes will sync when back online'; }
}
window.addEventListener('online',  function() { updateSyncStatus(); if (isScreenActive('settingScreen')) loadSettings(); });
window.addEventListener('offline', function() { updateSyncStatus(); if (isScreenActive('settingScreen')) loadSettings(); });


// ============ EMAIL SETTINGS UI ============
function renderEmailSettings() {
    var ct = document.getElementById('emailSettingsBody');
    if (!ct) return;

    var cfg = getEmailConfig(); // from email.js

    var h = '';

    // Master toggle
    h += '<div class="set-row" style="padding:14px 0">';
    h += '<div class="set-info"><div class="set-label">Enable Email Alerts</div>';
    h += '<div class="set-sub">Receive automated alerts for stock, prices, and customers</div></div>';
    h += '<label class="toggle-switch" aria-label="Enable email alerts">';
    h += '<input type="checkbox" id="emailEnabled" ' + (cfg.enabled ? 'checked' : '') + ' onchange="onEmailEnabledChange(this)">';
    h += '<span class="toggle-track"></span></label></div>';

    // Credentials (shown only when enabled)
    h += '<div id="emailCredsSection" style="display:' + (cfg.enabled ? 'block' : 'none') + '">';

    h += '<div class="set-section-mini">EmailJS Credentials</div>';
    h += '<div class="email-setup-tip">';
    h += '💡 <strong>Setup:</strong> Create a free account at ';
    h += '<span style="color:var(--pr)">emailjs.com</span>, connect your Gmail/Outlook, ';
    h += 'create a template, then paste the credentials below.';
    h += '</div>';

    var fields = [
        { id: 'emailPublicKey',  label: 'Public Key',   ph: 'user_xxxxxxxxxxxxxxxxx',     val: cfg.publicKey  },
        { id: 'emailServiceId',  label: 'Service ID',   ph: 'service_xxxxxxxx',            val: cfg.serviceId  },
        { id: 'emailTemplateId', label: 'Template ID',  ph: 'template_xxxxxxxx',           val: cfg.templateId },
        { id: 'emailOwnerEmail', label: 'Your Email',   ph: 'you@gmail.com',               val: cfg.ownerEmail }
    ];
    fields.forEach(function(f) {
        h += '<div class="form-group" style="margin-bottom:12px">';
        h += '<label class="form-label" for="' + f.id + '">' + f.label + '</label>';
        h += '<input class="form-input" type="' + (f.id === 'emailOwnerEmail' ? 'email' : 'text') + '" ';
        h += 'id="' + f.id + '" placeholder="' + f.ph + '" value="' + esc(f.val || '') + '" ';
        h += 'autocomplete="off" autocorrect="off" spellcheck="false">';
        h += '</div>';
    });

    h += '<button class="set-btn" onclick="saveEmailConfigFromUI()" style="margin-bottom:8px">💾 Save Email Settings</button>';
    h += '<button class="set-btn set-btn-sec" id="emailTestBtn" onclick="sendTestEmail()">📧 Send Test Email</button>';

    // Alert toggles
    h += '<div class="set-section-mini" style="margin-top:20px">Alert Types</div>';
    var alertTypes = [
        { key: 'stock',      label: 'Stock Running Low',         sub: 'Alert when atta or oil ≤ 2 days remaining'       },
        { key: 'price',      label: 'Price Increase ≥ 10%',      sub: 'Alert when supplier price spikes significantly'  },
        { key: 'inactivity', label: 'Customer Inactive 5+ Days', sub: 'Alert when a customer stops ordering'            },
        { key: 'credit',     label: 'Credit Pending > ₹1000',    sub: 'Alert when total outstanding credit is high'     },
        { key: 'weekly',     label: 'Weekly Revenue Summary',     sub: 'Every Monday — full week business summary'       }
    ];
    alertTypes.forEach(function(at) {
        h += '<div class="set-row" style="padding:12px 0;border-bottom:1px solid var(--br)">';
        h += '<div class="set-info"><div class="set-label">' + at.label + '</div>';
        h += '<div class="set-sub">' + at.sub + '</div></div>';
        h += '<label class="toggle-switch" aria-label="' + at.label + '">';
        h += '<input type="checkbox" data-alert-key="' + at.key + '" ';
        h += (cfg.alerts[at.key] ? 'checked' : '') + ' onchange="toggleAlertType(\'' + at.key + '\', this.checked)">';
        h += '<span class="toggle-track"></span></label></div>';
    });

    h += '</div>'; // end emailCredsSection
    ct.innerHTML = h;
}

function onEmailEnabledChange(checkbox) {
    var cfg = getEmailConfig();
    cfg.enabled = checkbox.checked;
    saveEmailConfig(cfg);
    var credsEl = document.getElementById('emailCredsSection');
    if (credsEl) credsEl.style.display = cfg.enabled ? 'block' : 'none';
    if (cfg.enabled && typeof initEmailSystem === 'function') initEmailSystem();
    showToast(cfg.enabled ? '✅ Email alerts enabled' : '✅ Email alerts disabled');
}

function toggleAlertType(key, value) {
    var cfg = getEmailConfig();
    cfg.alerts[key] = value;
    saveEmailConfig(cfg);
}

function saveEmailConfigFromUI() {
    var publicKey   = (document.getElementById('emailPublicKey')  || {}).value  || '';
    var serviceId   = (document.getElementById('emailServiceId')  || {}).value  || '';
    var templateId  = (document.getElementById('emailTemplateId') || {}).value  || '';
    var ownerEmail  = (document.getElementById('emailOwnerEmail') || {}).value  || '';

    if (!publicKey || !serviceId || !templateId || !ownerEmail) {
        showToast('❌ Please fill in all 4 credential fields', 'error');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
        showToast('❌ Enter a valid email address', 'error');
        return;
    }

    var cfg = getEmailConfig();
    cfg.publicKey  = publicKey.trim();
    cfg.serviceId  = serviceId.trim();
    cfg.templateId = templateId.trim();
    cfg.ownerEmail = ownerEmail.trim().toLowerCase();
    saveEmailConfig(cfg);

    // Re-initialize EmailJS with new key
    if (typeof initEmailSystem === 'function') initEmailSystem();
    showToast('✅ Email settings saved!');
}


// ============ CHANGE PIN ============
function showChangePinUI() {
    if (!canModify() && userRole !== 'admin') { showToast('❌ Only owner/admin can change PIN', 'error'); return; }
    document.getElementById('chpOld').value = '';
    document.getElementById('chpNew').value = '';
    document.getElementById('chpConfirm').value = '';
    openOverlay('changePinOverlay');
}

async function saveNewPin(e) {
    e.preventDefault();
    var old = document.getElementById('chpOld').value;
    var nw  = document.getElementById('chpNew').value;
    var cf  = document.getElementById('chpConfirm').value;

    if (nw.length !== 4 || !/^\d{4}$/.test(nw)) { showToast('❌ PIN must be exactly 4 digits!', 'error'); return; }
    if (nw !== cf) { showToast('❌ New PINs do not match!', 'error'); return; }

    var btn = document.getElementById('chpSubmitBtn');
    btnLoading(btn, true);
    try {
        var doc     = await businessRef.get();
        var bizData = doc.data();
        var stored  = bizData.pin || localStorage.getItem('mdPin') || '';
        var version = bizData.pinVersion || localStorage.getItem('mdPinVersion') || 'v1';
        var salt    = businessId || 'default';

        var oldIsCorrect = false;
        if (version === 'v2') {
            var oldHash = await hashPin(old, salt);
            oldIsCorrect = (oldHash === stored);
        } else {
            var sv = ''; try { sv = atob(stored); } catch (e2) {}
            oldIsCorrect = (old === sv);
        }
        if (!oldIsCorrect) { showToast('❌ Current PIN is incorrect!', 'error'); btnLoading(btn, false); return; }

        var newHash   = await hashPin(nw, salt);
        var oldHashV2 = await hashPin(old, salt);
        if (newHash === oldHashV2) { showToast('❌ New PIN must differ from current PIN!', 'error'); btnLoading(btn, false); return; }

        await businessRef.update({ pin: newHash, pinVersion: 'v2' });
        localStorage.setItem('mdPin', newHash);
        localStorage.setItem('mdPinVersion', 'v2');
        showToast('✅ PIN updated successfully!');
        closeOverlay('changePinOverlay');
    } catch (err) {
        console.error('[PIN Change]', err);
        showToast('❌ Error updating PIN', 'error');
    } finally { btnLoading(btn, false); }
}


// ============ TEAM ============
function openTeamManager() {
    if (userRole === 'staff') { showToast('❌ Only owner/admin can manage team', 'error'); return; }
    openOverlay('teamOverlay');
    document.getElementById('addMemberForm').style.display = 'none';
    loadTeamMembers();
}
async function loadTeamMembers() {
    try {
        var doc = await businessRef.get(); var data = doc.data(); var members = data.members || [];
        var ct = document.getElementById('teamMemberList'); if (!ct) return;
        var h = '<div class="team-card"><div class="tc-avatar">👑</div><div class="tc-info"><h4>' + esc(data.ownerName || data.ownerEmail) + '</h4><p>' + esc(data.ownerEmail) + '</p></div><span class="tc-role">Owner</span></div>';
        members.forEach(function(m, i) {
            h += '<div class="team-card"><div class="tc-avatar">👤</div><div class="tc-info"><h4>' + esc(m.email) + '</h4><p>Role: ' + (m.role === 'admin' ? 'Admin' : 'Staff') + (m.addedAt ? ' • Added: ' + m.addedAt : '') + '</p></div>';
            h += '<span class="tc-role ' + (m.role === 'staff' ? 'staff' : '') + '">' + (m.role === 'admin' ? '👑 Admin' : '👤 Staff') + '</span>';
            if (userRole === 'owner') h += '<button class="tc-remove" onclick="removeTeamMember(' + i + ')" aria-label="Remove member">❌</button>';
            h += '</div>';
        });
        if (!members.length) h += '<div class="no-data" style="margin-top:12px">No team members added yet</div>';
        ct.innerHTML = h;
    } catch (err) { console.error('[Team]', err); showToast('❌ Error loading team', 'error'); }
}
function showAddMember() {
    var formEl = document.getElementById('addMemberForm'); if (formEl) formEl.style.display = 'block';
    document.getElementById('tmEmail').value = ''; document.getElementById('tmRole').value = 'admin';
    var tg = document.querySelectorAll('#teamOverlay .tgl'); tg.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); }); if (tg[0]) { tg[0].classList.add('active'); tg[0].setAttribute('aria-pressed', 'true'); }
    setTimeout(function() { var el = document.getElementById('tmEmail'); if (el) el.focus(); }, 300);
}
async function addTeamMember(e) {
    e.preventDefault();
    var email = document.getElementById('tmEmail').value.trim().toLowerCase();
    var role  = document.getElementById('tmRole').value;
    if (!email) { showToast('❌ Enter email address!', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('❌ Enter a valid email!', 'error'); return; }
    var btn = document.getElementById('tmSubmitBtn'); btnLoading(btn, true);
    try {
        var doc = await businessRef.get(); var data = doc.data(); var members = data.members || []; var memberEmails = data.memberEmails || [];
        if (email === (data.ownerEmail || '').toLowerCase()) { showToast('❌ This is the owner email!', 'error'); return; }
        if (memberEmails.indexOf(email) !== -1) { showToast('❌ Already a team member!', 'error'); return; }
        members.push({ email: email, role: role, addedAt: todayStr() }); memberEmails.push(email);
        await businessRef.update({ members: members, memberEmails: memberEmails });
        document.getElementById('addMemberForm').style.display = 'none';
        showToast('✅ ' + email + ' added as ' + role + '!'); loadTeamMembers();
    } catch (err) { console.error('[Team]', err); showToast('❌ Error adding member', 'error'); }
    finally { btnLoading(btn, false); }
}
function removeTeamMember(index) {
    showConfirm('❌', 'Remove Member?', 'This person will lose access to your data.', async function() {
        try {
            var doc = await businessRef.get(); var data = doc.data(); var members = data.members || []; var memberEmails = data.memberEmails || [];
            if (index >= 0 && index < members.length) {
                var email = members[index].email; members.splice(index, 1); var ei = memberEmails.indexOf(email); if (ei !== -1) memberEmails.splice(ei, 1);
                await businessRef.update({ members: members, memberEmails: memberEmails }); showToast('✅ Member removed'); loadTeamMembers();
            }
        } catch (err) { console.error('[Team]', err); showToast('❌ Error removing member', 'error'); }
    });
}


// ============ EXPORT ============
async function exportData() {
    var exportBtn = document.querySelector('[onclick="exportData()"]');
    if (exportBtn) exportBtn.style.pointerEvents = 'none';
    try {
        var data = {
            app: 'MeriDukaan', version: '7.0', exportDate: new Date().toISOString(),
            customers: allCustomers.map(cleanForExport), sales: allSales.map(cleanForExport),
            expenses: allExpenses.map(cleanForExport), waste: allWaste.map(cleanForExport),
            creditPayments: allCreditPayments.map(cleanForExport), notes: allNotes.map(cleanForExport)
        };
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url; a.download = 'MeriDukaan_Backup_' + todayStr() + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast('✅ Backup downloaded!');
    } catch (err) { console.error('[Export]', err); showToast('❌ Export failed', 'error'); }
    finally { if (exportBtn) exportBtn.style.pointerEvents = ''; }
}


// ============ IMPORT — Phase 4: Full Firestore Batch Writes ============
/**
 * importData — Phase 4 rewrite
 *
 * Phase 1 used sequential await per record (500 records = 500 network requests).
 * Phase 4 uses Firestore batch writes: up to 499 operations per commit.
 *
 * KEY TECHNIQUE for customers:
 *   businessRef.collection('customers').doc() — generates a new DocumentReference
 *   with a unique Firestore ID WITHOUT making a network request. This lets us
 *   build the custIdMap (old ID → new ID) BEFORE committing, so all dependent
 *   collections (sales, creditPayments) can be batched too.
 *
 * Result: importing 500 records goes from ~500 round-trips to ~2-3 batch commits.
 */
function importData(e) {
    var file = e.target.files[0]; if (!file) return;
    if (userRole === 'staff') { showToast('❌ Staff cannot import data', 'error'); e.target.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { showToast('❌ Backup file too large (max 10MB)', 'error'); e.target.value = ''; return; }

    showConfirm('📥', 'Import Data?', 'This will REPLACE all current data. Download a backup first!', function() {
        var reader = new FileReader();
        reader.onload = async function(ev) {
            var importBtn = document.querySelector('[onclick*="importData"]');
            if (importBtn) { importBtn.disabled = true; importBtn.textContent = '⏳ Importing...'; }
            try {
                var data = JSON.parse(ev.target.result);
                if (!data.customers && !data.sales) { showToast('❌ Invalid backup file!', 'error'); return; }

                showToast('⏳ Deleting existing data...', 'success');
                await deleteCollection('customers');
                await deleteCollection('sales');
                await deleteCollection('expenses');
                await deleteCollection('waste');
                await deleteCollection('creditPayments');
                await deleteCollection('notes');

                // ── CUSTOMERS — pre-generate IDs, build map, then batch commit ──
                var custIdMap  = {};
                var custs      = data.customers || [];
                var custBatch  = fdb.batch();
                var custCount  = 0;

                showToast('⏳ Importing customers...', 'success');
                for (var i = 0; i < custs.length; i++) {
                    var c     = Object.assign({}, custs[i]);
                    var oldId = c.id; delete c.id;
                    if (c.createdAt && typeof c.createdAt === 'string') delete c.createdAt;
                    // doc() generates new ID locally — NO network round-trip
                    var newRef       = businessRef.collection('customers').doc();
                    custIdMap[oldId] = newRef.id;
                    custBatch.set(newRef, c);
                    custCount++;
                    if (custCount === 499) {
                        await custBatch.commit();
                        custBatch = fdb.batch(); custCount = 0;
                    }
                }
                if (custCount > 0) await custBatch.commit();

                // ── HELPER: batch-import any collection ──
                async function batchImport(colName, records, transformFn) {
                    var batch = fdb.batch(); var count = 0;
                    for (var j = 0; j < records.length; j++) {
                        var rec = transformFn ? transformFn(Object.assign({}, records[j])) : Object.assign({}, records[j]);
                        if (!rec) continue; // transformFn can return null to skip
                        delete rec.id;
                        if (rec.createdAt && typeof rec.createdAt === 'string') delete rec.createdAt;
                        var ref = businessRef.collection(colName).doc();
                        batch.set(ref, rec); count++;
                        if (count === 499) { await batch.commit(); batch = fdb.batch(); count = 0; }
                    }
                    if (count > 0) await batch.commit();
                }

                // ── SALES ──
                showToast('⏳ Importing sales...', 'success');
                await batchImport('sales', data.sales || [], function(s) {
                    if (s.customerId)           s.customerId  = custIdMap[s.customerId] || '';
                    if (s.paymentType === 'udhari') s.paymentType = 'credit';
                    if (!s.saleType)            s.saleType    = 'regular';
                    return s;
                });

                // ── EXPENSES ──
                showToast('⏳ Importing expenses...', 'success');
                await batchImport('expenses', data.expenses || [], null);

                // ── WASTE ──
                await batchImport('waste', data.waste || [], null);

                // ── CREDIT PAYMENTS ──
                showToast('⏳ Importing credit payments...', 'success');
                await batchImport('creditPayments', data.creditPayments || data.udhariPayments || [], function(p) {
                    if (p.customerId) p.customerId = custIdMap[p.customerId] || '';
                    return p;
                });

                // ── NOTES ──
                await batchImport('notes', data.notes || [], null);

                var counts = {
                    c: custs.length,
                    s: (data.sales || []).length,
                    n: (data.notes || []).length
                };
                showToast('✅ Imported! (' + counts.c + ' customers, ' + counts.s + ' sales' + (counts.n ? ', ' + counts.n + ' notes' : '') + ')');

            } catch (err) {
                console.error('[Import]', err);
                showToast('❌ Import failed: ' + (err.message || 'Unknown error'), 'error');
            } finally {
                if (importBtn) { importBtn.disabled = false; importBtn.textContent = '📥 Import Backup'; }
            }
        };
        reader.readAsText(file);
    });
    e.target.value = '';
}


// ============ DELETE COLLECTION (batch, 499 per commit) ============
async function deleteCollection(colName) {
    try {
        var snap = await businessRef.collection(colName).get();
        var docs = snap.docs; if (!docs.length) return;
        var BATCH_SIZE = 499;
        for (var i = 0; i < docs.length; i += BATCH_SIZE) {
            var batch = fdb.batch();
            docs.slice(i, i + BATCH_SIZE).forEach(function(doc) { batch.delete(doc.ref); });
            await batch.commit();
        }
    } catch (err) { console.error('[Delete] Collection "' + colName + '":', err); throw err; }
}


// ============ RESET ALL DATA ============
function resetAllData() {
    if (userRole === 'staff') { showToast('❌ Only owner can delete all data', 'error'); return; }
    showConfirm('🗑️', 'DELETE ALL DATA?', 'ALL data will be permanently removed. This CANNOT be undone! Download a backup first.', async function() {
        try {
            showToast('⏳ Deleting all data...', 'success');
            await deleteCollection('customers'); await deleteCollection('sales');
            await deleteCollection('expenses');  await deleteCollection('waste');
            await deleteCollection('creditPayments'); await deleteCollection('notes');
            showToast('✅ All data deleted successfully!');
            if (isScreenActive('dashboardScreen')) refreshDash(); else goTo('dashboardScreen');
        } catch (err) { console.error('[Reset]', err); showToast('❌ Error deleting data', 'error'); }
    });
}

console.log('[Settings] Meri Dukaan v7.0 — Settings + Email module loaded');
