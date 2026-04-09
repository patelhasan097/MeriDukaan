/* ================================================
   MERI DUKAAN v5.0 — SALES ENGINE
   Handles Add/Edit/Delete & Quick Toggles
   ================================================ */

function loadSales() {
    const date = document.getElementById('salesDate').value;
    if (!date) return;
    
    let all = allSales.filter(s => s.date === date);

    // Apply Search Filter
    const query = (document.getElementById('salesSearch').value || '').toLowerCase();
    if (query) {
        all = all.filter(s => (s.customerName || 'Walk-in').toLowerCase().includes(query));
    }

    let roti = 0, inc = 0, cash = 0, cred = 0;
    all.forEach(s => {
        roti += s.quantity; 
        inc += s.total;
        if (s.paymentType === 'credit') cred += s.total;
        else cash += s.total;
    });

    document.getElementById('sRoti').textContent = roti;
    document.getElementById('sIncome').textContent = '₹' + inc;
    document.getElementById('sCash').textContent = '₹' + cash;
    document.getElementById('sCredit').textContent = '₹' + cred;

    renderSales(all, query !== '');
}

function filterSales() {
    loadSales(); // Re-trigger load to apply search string
}

function openSaleForm(id) {
    const form = document.getElementById('saleForm');
    if (form) form.reset();
    document.getElementById('sfId').value = '';
    
    // Reset to defaults
    document.getElementById('sfCustGroup').style.display = 'block';
    document.getElementById('sfWalkinGroup').style.display = 'none';
    document.getElementById('sfRate').setAttribute('readonly', 'readonly');
    document.getElementById('sfTotal').textContent = '₹0';
    document.getElementById('sfDupWarn').style.display = 'none';

    if (id) {
        document.getElementById('sfTitle').textContent = 'Edit Sale';
        const s = allSales.find(x => x.id === id);
        if (s) {
            document.getElementById('sfId').value = s.id;
            document.getElementById('sfRate').value = s.rate;
            document.getElementById('sfQty').value = s.quantity;
            
            // Re-calc UI
            calcSaleTotal();
        }
    } else {
        document.getElementById('sfTitle').textContent = 'New Sale';
    }
    openOverlay('saleFormOverlay');
}

function setSaleType(type, btn) {
    triggerHaptic('light');
    document.getElementById('sfType').value = type;
    
    // Visual toggle
    btn.parentElement.querySelectorAll('.tgl').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // UI State
    document.getElementById('sfCustGroup').style.display = type === 'regular' ? 'block' : 'none';
    document.getElementById('sfWalkinGroup').style.display = type === 'walkin' ? 'block' : 'none';
    document.getElementById('sfDupWarn').style.display = 'none';

    if (type === 'walkin') {
        document.getElementById('sfRate').removeAttribute('readonly');
        document.getElementById('sfRate').value = localStorage.getItem('mdLastWalkinRate') || '';
    } else {
        document.getElementById('sfRate').setAttribute('readonly', 'readonly');
    }
    calcSaleTotal();
}

function calcSaleTotal() {
    const r = parseFloat(document.getElementById('sfRate').value) || 0;
    const q = parseInt(document.getElementById('sfQty').value) || 0;
    document.getElementById('sfTotal').textContent = '₹' + (r * q);
}

async function saveSale(e) {
    e.preventDefault();
    const saleType = document.getElementById('sfType').value;
    let cid = document.getElementById('sfCustomerId').value;
    let cname = document.getElementById('sfCustomerName').value;
    const r = parseFloat(document.getElementById('sfRate').value);
    const q = parseInt(document.getElementById('sfQty').value);

    // Validation
    if (saleType === 'walkin') {
        cname = document.getElementById('sfWalkinName').value.trim() || 'Walk-in';
        cid = '';
    } else {
        if (!cid) { showToast('Select a customer!', 'error'); return; }
    }
    if (!r || r <= 0) { showToast('Enter valid rate!', 'error'); return; }
    if (!q || q < 1) { showToast('Enter valid quantity!', 'error'); return; }

    const data = {
        customerId: cid,
        customerName: cname,
        date: document.getElementById('salesDate').value || todayStr(),
        rate: r,
        quantity: q,
        total: r * q,
        paymentType: document.getElementById('sfPay').value,
        saleType: saleType
    };

    if (saleType === 'walkin') localStorage.setItem('mdLastWalkinRate', r.toString());

    const btn = document.getElementById('sfSubmitBtn');
    btnLoading(btn, true);

    try {
        const idV = document.getElementById('sfId').value;
        if (idV) {
            await fsUpdate('sales', idV, data);
            showToast('Sale updated!');
        } else {
            await fsAdd('sales', data);
            showToast(`₹${r * q} Sale saved!`);
            triggerHaptic('success');
        }
        closeOverlay('saleFormOverlay');
    } catch (err) {
        showToast('Error saving sale', 'error');
    } finally {
        btnLoading(btn, false);
    }
}

function renderSales(sales, isSearching) {
    const ct = document.getElementById('salesList');
    if (!ct) return;

    if (!sales.length) {
        ct.innerHTML = `
            <div class="empty">
                <div class="empty-ic"><i data-lucide="receipt" style="width:40px;height:40px;"></i></div>
                <h3>${isSearching ? 'No Results' : 'No Sales'}</h3>
                <p>${isSearching ? 'Try another search.' : 'No sales recorded today.'}</p>
                ${!isSearching ? `<button class="empty-btn" onclick="openSaleForm()">+ Add Sale</button>` : ''}
            </div>`;
        lucide.createIcons();
        return;
    }

    let h = '';
    sales.forEach(s => {
        const isWalkin = s.saleType === 'walkin';
        const payIcon = s.paymentType === 'cash' ? 'banknote' : (s.paymentType === 'upi' ? 'smartphone' : 'credit-card');
        const payColor = s.paymentType === 'credit' ? 'var(--am)' : 'var(--gn)';

        h += `
        <div class="sale-card ${isWalkin ? 'walkin' : ''}">
            <div class="sl-top">
                <div class="sl-name" style="display:flex;align-items:center;gap:6px;">
                    <i data-lucide="${isWalkin ? 'user-x' : 'user'}"></i> ${esc(s.customerName || 'Walk-in')}
                </div>
                <div class="sl-amt">₹${s.total}</div>
            </div>
            
            <div style="display:flex;gap:8px;margin-bottom:12px;">
                <span style="font-size:12px;background:var(--bg);padding:4px 10px;border-radius:12px;"><strong>${s.quantity}</strong> roti</span>
                <span style="font-size:12px;background:var(--bg);padding:4px 10px;border-radius:12px;">₹${s.rate}/roti</span>
                <span style="font-size:12px;background:var(--bg);padding:4px 10px;border-radius:12px;color:${payColor};display:flex;align-items:center;gap:4px;">
                    <i data-lucide="${payIcon}" style="width:12px;height:12px;"></i> ${s.paymentType.toUpperCase()}
                </span>
            </div>

            <div class="sl-foot" style="border-top:1px solid var(--bg);padding-top:8px;">
                <span style="font-size:11px;color:var(--tx3);"><i data-lucide="clock" style="width:12px;height:12px;display:inline;"></i> ${getTime(s.createdAt)}</span>
                ${canModify() ? `
                <div style="display:flex;gap:8px;">
                    <button class="ic-btn" onclick="openSaleForm('${s.id}')"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
                    <button class="ic-btn" style="background:var(--rdb);color:var(--rd);" onclick="confirmDelSale('${s.id}')"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                </div>` : ''}
            </div>
        </div>`;
    });
    ct.innerHTML = h;
    lucide.createIcons();
}

function confirmDelSale(id) {
    if (!canModify()) { showToast('Staff cannot delete', 'error'); return; }
    showConfirm('🗑️', 'Delete Sale?', 'Remove this sale entry from the records?', async () => {
        try {
            await fsDelete('sales', id);
            showToast('Sale deleted!');
        } catch (err) { showToast('Error deleting', 'error'); }
    });
}