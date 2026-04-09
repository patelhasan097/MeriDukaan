/* ================================================
   MERI DUKAAN v5.0 — CUSTOMERS & CREDIT ENGINE
   Confetti on Zero Debt, Quick Sales
   ================================================ */

// ============ CUSTOMERS CRUD ============
function loadCusts() {
    const ct = document.getElementById('customerList');
    if (!ct) return;

    if (!allCustomers.length) {
        ct.innerHTML = `
            <div class="empty">
                <div class="empty-ic"><i data-lucide="users" style="width:40px;height:40px;"></i></div>
                <h3>No Customers</h3>
                <p>Add your first customer to start tracking.</p>
                <button class="empty-btn" onclick="openCustomerForm()">+ Add Customer</button>
            </div>`;
        lucide.createIcons();
        return;
    }

    let h = '';
    allCustomers.forEach(c => {
        const isFixed = c.orderType === 'fixed';
        h += `
        <div class="c-card">
            <div class="c-info">
                <div class="c-name" style="display:flex;align-items:center;gap:6px;">
                    <i data-lucide="user"></i> ${esc(c.name)}
                </div>
                <div style="display:flex;gap:6px;margin:6px 0;">
                    <span style="font-size:11px;background:var(--prb);color:var(--pr);padding:4px 10px;border-radius:12px;font-weight:600;">₹${c.rate}/roti</span>
                    <span style="font-size:11px;background:var(--blb);color:var(--bl);padding:4px 10px;border-radius:12px;font-weight:600;">
                        ${isFixed ? `📋 Fixed: ${c.fixedQty}` : '🔄 Variable'}
                    </span>
                </div>
                ${c.phone ? `<div style="font-size:11px;color:var(--tx2);margin-top:4px;"><i data-lucide="phone" style="width:12px;height:12px;display:inline;"></i> ${esc(c.phone)}</div>` : ''}
            </div>
            ${canModify() ? `
            <div style="display:flex;gap:8px;">
                <button class="ic-btn" onclick="openCustomerForm('${c.id}')"><i data-lucide="edit-2" style="width:16px;height:16px;"></i></button>
            </div>` : ''}
        </div>`;
    });
    ct.innerHTML = h;
    lucide.createIcons();
}

function openCustomerForm(id) {
    const form = document.getElementById('customerForm');
    if (form) form.reset();
    document.getElementById('cfId').value = '';
    
    // Set defaults
    document.getElementById('fixedQtyGroup').style.display = 'block';

    if (id) {
        document.getElementById('cfTitle').textContent = 'Edit Customer';
        const c = allCustomers.find(x => x.id === id);
        if (c) {
            document.getElementById('cfId').value = c.id;
            document.getElementById('cfName').value = c.name;
            document.getElementById('cfRate').value = c.rate;
            document.getElementById('cfPhone').value = c.phone || '';
            document.getElementById('cfQty').value = c.fixedQty || '';
            // Toggles
            const ot = c.orderType || 'fixed';
            document.getElementById('cfOrderType').value = ot;
            document.getElementById('fixedQtyGroup').style.display = ot === 'fixed' ? 'block' : 'none';
        }
    } else {
        document.getElementById('cfTitle').textContent = 'New Customer';
    }
    openOverlay('customerFormOverlay');
}

async function saveCustomer(e) {
    e.preventDefault();
    const n = document.getElementById('cfName').value.trim();
    const r = parseFloat(document.getElementById('cfRate').value);
    const ot = document.getElementById('cfOrderType').value;
    const fq = ot === 'fixed' ? parseInt(document.getElementById('cfQty').value) : null;

    if (!n) { showToast('Enter customer name!', 'error'); return; }
    if (!r || r <= 0) { showToast('Rate must be positive!', 'error'); return; }

    const data = { name: n, rate: r, phone: document.getElementById('cfPhone').value.trim(), orderType: ot, fixedQty: fq };
    const btn = document.getElementById('cfSubmitBtn');
    btnLoading(btn, true);

    try {
        const idV = document.getElementById('cfId').value;
        if (idV) {
            await fsUpdate('customers', idV, data);
            showToast('Customer updated!');
        } else {
            await fsAdd('customers', data);
            showToast('Customer added successfully!');
            triggerHaptic('success');
        }
        closeOverlay('customerFormOverlay');
    } catch (err) { showToast('Error saving', 'error'); } 
    finally { btnLoading(btn, false); }
}

// ============ CREDIT / UDHARI ENGINE ============
function loadCredit() {
    let cm = {};
    allCustomers.forEach(c => { cm[c.id] = { id: c.id, name: c.name, g: 0, r: 0 }; });
    let walkinCredit = { id: '__walkin__', name: 'Walk-in Customers', g: 0, r: 0 };

    allSales.forEach(s => {
        if (s.paymentType === 'credit') {
            if (s.customerId) {
                if (!cm[s.customerId]) cm[s.customerId] = { id: s.customerId, name: s.customerName || 'Unknown', g: 0, r: 0 };
                cm[s.customerId].g += s.total;
            } else {
                walkinCredit.g += s.total;
            }
        }
    });

    allCreditPayments.forEach(p => {
        if (p.customerId && cm[p.customerId]) cm[p.customerId].r += p.amount;
    });

    if (walkinCredit.g > 0) cm['__walkin__'] = walkinCredit;

    let list = Object.values(cm).filter(c => c.g > 0);
    list.sort((a, b) => (b.g - b.r) - (a.g - a.r));

    let tp = 0;
    list.forEach(c => { tp += Math.max(0, c.g - c.r); });
    document.getElementById('cTotalPending').textContent = '₹' + tp;

    const ct = document.getElementById('creditList');
    if (!ct) return;

    if (!list.length) {
        ct.innerHTML = `
            <div class="empty">
                <div class="empty-ic"><i data-lucide="party-popper" style="width:40px;height:40px;color:var(--gn)"></i></div>
                <h3>No Pending Credit!</h3>
                <p>All customers have paid their dues. Great job!</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    let h = '';
    list.forEach(c => {
        const pending = Math.max(0, c.g - c.r);
        const isCleared = pending === 0;

        h += `
        <div class="u-card" onclick="openCreditPay('${c.id}')" style="border-left-color: ${isCleared ? 'var(--gn)' : 'var(--am)'}">
            <div class="u-info">
                <div class="u-name">${esc(c.name)}</div>
                <div class="u-sub">Total Given: ₹${c.g} • Paid: ₹${c.r}</div>
            </div>
            <div class="u-amt ${isCleared ? 'green' : ''}">₹${pending}</div>
        </div>`;
    });
    ct.innerHTML = h;
}

function openCreditPay(cid) {
    // Logic to open payment modal...
    // Set variables, update UI, show modal
    document.getElementById('crpCustId').value = cid;
    document.getElementById('crpAmount').value = '';
    openOverlay('creditPayOverlay');
}

async function saveCreditPayment(e) {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('crpAmount').value);
    const cid = document.getElementById('crpCustId').value;

    if (!amt || amt <= 0) { showToast('Enter valid amount!', 'error'); return; }

    const btn = document.getElementById('crpSubmitBtn');
    btnLoading(btn, true);

    try {
        await fsAdd('creditPayments', {
            customerId: cid,
            amount: amt,
            paymentType: document.getElementById('crpPay').value,
            date: todayStr()
        });

        // 🌟 CHECK IF DEBT IS CLEARED TO FIRE CONFETTI 🌟
        let g = 0, r = 0;
        allSales.forEach(s => { if(s.paymentType === 'credit' && s.customerId === cid) g += s.total; });
        allCreditPayments.forEach(p => { if(p.customerId === cid) r += p.amount; });
        r += amt; // Add current payment

        if (g - r <= 0) {
            fireConfetti(); // 🎊 TRIGGER EXPERT DOPAMINE UX
            showToast('Account Cleared! Awesome!', 'success');
        } else {
            showToast(`₹${amt} payment saved!`, 'success');
        }

        closeOverlay('creditPayOverlay');
    } catch (err) { showToast('Error saving payment', 'error'); }
    finally { btnLoading(btn, false); }
}