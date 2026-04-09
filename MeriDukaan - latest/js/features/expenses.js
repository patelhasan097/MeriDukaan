/* ================================================
   MERI DUKAAN v5.0 — EXPENSE & INVENTORY TRACKER
   Includes: Smart Stock Insights & Price Comparison
   ================================================ */

function loadExps() {
    const date = document.getElementById('expDate').value;
    if (!date) return;
    
    // Filter expenses for selected date
    const dailyExps = allExpenses.filter(x => x.date === date);

    let total = 0;
    dailyExps.forEach(x => { total += x.amount; });

    document.getElementById('eTotal').textContent = '₹' + total;
    document.getElementById('eCount').textContent = dailyExps.length;

    renderExps(dailyExps);
}

// ★ NEW FEATURE: Smart Inventory Insights
function updateExpComparison() {
    const cat = document.getElementById('efCat').value;
    const infoBox = document.getElementById('efRateInfo');
    if (!infoBox) return;

    // Only analyze major inventory items
    if (!['atta', 'oil', 'gas'].includes(cat)) {
        infoBox.style.display = 'none';
        return;
    }

    const weight = parseFloat(document.getElementById('efWeight').value) || 0;
    const amount = parseFloat(document.getElementById('efAmount').value) || 0;
    const currentDate = document.getElementById('expDate').value || todayStr();

    // Find previous purchases of the SAME category BEFORE the current date
    const pastPurchases = allExpenses.filter(x => x.category === cat && x.date < currentDate);
    pastPurchases.sort((a, b) => a.date > b.date ? 1 : -1); // Sort oldest to newest

    if (pastPurchases.length === 0) {
        if (weight > 0 && amount > 0) {
            const currentRate = (amount / weight).toFixed(1);
            infoBox.innerHTML = `<i data-lucide="info"></i> First time adding ${cat}. Rate: ₹${currentRate}/unit`;
            infoBox.className = 'rate-box neutral';
            infoBox.style.display = 'block';
            lucide.createIcons({ root: infoBox });
        } else {
            infoBox.style.display = 'none';
        }
        return;
    }

    const last = pastPurchases[pastPurchases.length - 1]; // Immediately previous purchase
    
    // 1. Calculate Days Lasted
    const d1 = new Date(last.date + 'T00:00:00');
    const d2 = new Date(currentDate + 'T00:00:00');
    const diffTime = Math.abs(d2 - d1);
    const daysLasted = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let html = `<div style="margin-bottom:6px;"><i data-lucide="calendar-clock" style="width:16px;height:16px;display:inline;"></i> <strong>Stock Usage:</strong> Previous ${last.weight ? last.weight+' unit ' : ''}lasted for <strong>${daysLasted} days</strong>.</div>`;

    // 2. Calculate Rate Difference (If weight is provided)
    if (weight > 0 && amount > 0 && last.weight && last.amount) {
        const currentRate = (amount / weight);
        const lastRate = (last.amount / last.weight);
        const diffPct = (((currentRate - lastRate) / lastRate) * 100).toFixed(1);

        html += `<div><i data-lucide="trending-up" style="width:16px;height:16px;display:inline;"></i> <strong>Price Compare:</strong> Current ₹${currentRate.toFixed(1)}/u vs Last ₹${lastRate.toFixed(1)}/u. `;

        if (diffPct > 0) {
            html += `<span style="color:var(--rd);">Price UP by ${diffPct}% ⬆️</span></div>`;
            infoBox.className = 'rate-box up';
        } else if (diffPct < 0) {
            html += `<span style="color:var(--gn);">Price DOWN by ${Math.abs(diffPct)}% ⬇️</span></div>`;
            infoBox.className = 'rate-box down';
        } else {
            html += `<span>Same price.</span></div>`;
            infoBox.className = 'rate-box neutral';
        }
    } else {
        infoBox.className = 'rate-box neutral';
    }

    infoBox.innerHTML = html;
    infoBox.style.display = 'block';
    lucide.createIcons({ root: infoBox });
}

function openExpenseForm(id) {
    const form = document.getElementById('expForm');
    if (form) form.reset();
    document.getElementById('efId').value = '';
    
    // Set Defaults
    setExpCat('atta', document.querySelector('#expForm .cat'));
    
    if (id) {
        document.getElementById('efTitle').textContent = 'Edit Expense';
        const x = allExpenses.find(e => e.id === id);
        if (x) {
            document.getElementById('efId').value = x.id;
            document.getElementById('efDetail').value = x.detail || '';
            document.getElementById('efWeight').value = x.weight || '';
            document.getElementById('efAmount').value = x.amount;
            
            // Set Category
            const cats = document.querySelectorAll('#expForm .cat');
            cats.forEach(c => {
                if (c.textContent.toLowerCase().includes(x.category)) setExpCat(x.category, c);
            });
        }
    } else {
        document.getElementById('efTitle').textContent = 'New Expense';
    }
    
    updateExpComparison();
    openOverlay('expFormOverlay');
}

function setExpCat(cat, btn) {
    triggerHaptic('light');
    document.getElementById('efCat').value = cat;
    document.querySelectorAll('#expForm .cat').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    // UI Toggles based on category
    document.getElementById('efDetailGrp').style.display = cat === 'other' ? 'block' : 'none';
    document.getElementById('efWeightGrp').style.display = ['atta', 'oil', 'gas'].includes(cat) ? 'block' : 'none';
    
    updateExpComparison();
}

async function saveExpense(e) {
    e.preventDefault();
    const cat = document.getElementById('efCat').value;
    const amt = parseFloat(document.getElementById('efAmount').value);

    if (!amt || amt <= 0) { showToast('Enter valid amount!', 'error'); return; }

    const weight = parseFloat(document.getElementById('efWeight').value) || null;

    const data = {
        category: cat,
        detail: document.getElementById('efDetail').value.trim(),
        weight: weight,
        amount: amt,
        paymentType: document.getElementById('efPay').value,
        date: document.getElementById('expDate').value || todayStr()
    };

    const btn = document.getElementById('efSubmitBtn');
    btnLoading(btn, true);

    try {
        const idV = document.getElementById('efId').value;
        if (idV) {
            await fsUpdate('expenses', idV, data);
            showToast('Expense updated successfully!');
        } else {
            await fsAdd('expenses', data);
            showToast(`Saved ₹${amt} expense!`);
            triggerHaptic('success');
        }
        closeOverlay('expFormOverlay');
    } catch (err) {
        showToast('Error saving expense', 'error');
    } finally {
        btnLoading(btn, false);
    }
}

function renderExps(exps) {
    const ct = document.getElementById('expList');
    if (!ct) return;

    if (!exps.length) {
        ct.innerHTML = `
            <div class="empty">
                <div class="empty-ic"><i data-lucide="shopping-bag" style="width:40px;height:40px;"></i></div>
                <h3>No Expenses</h3>
                <p>No expenses recorded on this date.</p>
                <button class="empty-btn" onclick="openExpenseForm()">+ Add Expense</button>
            </div>`;
        lucide.createIcons();
        return;
    }

    const catIcons = { atta: 'wheat', oil: 'droplet', gas: 'flame', poly: 'shopping-bag', other: 'box' };

    let h = '';
    exps.forEach(x => {
        const icon = catIcons[x.category] || 'box';
        const isModifiable = canModify();

        h += `
        <div class="exp-card">
            <div class="ex-top">
                <div class="ex-cat" style="display:flex;align-items:center;gap:6px;">
                    <i data-lucide="${icon}"></i> <span style="text-transform:capitalize;">${x.category}</span>
                </div>
                <div class="ex-amt">-₹${x.amount}</div>
            </div>
            ${x.weight ? `<div class="ex-det">${x.weight} Unit • ₹${(x.amount/x.weight).toFixed(1)}/Unit</div>` : ''}
            ${x.detail ? `<div class="ex-det">${esc(x.detail)}</div>` : ''}
            
            <div class="ex-foot" style="margin-top:12px;border-top:1px solid var(--bg);padding-top:8px;">
                <span style="font-size:11px;color:var(--tx3);"><i data-lucide="clock" style="width:12px;height:12px;display:inline;"></i> ${getTime(x.createdAt)}</span>
                ${isModifiable ? `
                <div style="display:flex;gap:8px;">
                    <button class="ic-btn" onclick="openExpenseForm('${x.id}')"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
                    <button class="ic-btn" style="background:var(--rdb);color:var(--rd);" onclick="confirmDelExp('${x.id}')"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                </div>` : ''}
            </div>
        </div>`;
    });
    ct.innerHTML = h;
    lucide.createIcons();
}

function confirmDelExp(id) {
    if (!canModify()) { showToast('Staff cannot delete', 'error'); return; }
    showConfirm('🗑️', 'Delete Expense?', 'Are you sure you want to delete this expense?', async () => {
        try {
            await fsDelete('expenses', id);
            showToast('Expense deleted!');
        } catch (err) { showToast('Error deleting', 'error'); }
    });
}