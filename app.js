/* ================================================
   MERI DUKAAN v2.0 - COMPLETE APP LOGIC
   Professional Business Management
   ================================================ */

// ============ DATABASE ============
var db;

function initDB() {
    return new Promise(function (resolve, reject) {
        var req = indexedDB.open('MeriDukaanDB', 2);
        req.onerror = function () { reject(req.error); };
        req.onupgradeneeded = function (e) {
            var d = e.target.result;
            if (!d.objectStoreNames.contains('customers')) {
                d.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
            }
            if (!d.objectStoreNames.contains('sales')) {
                var ss = d.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
                ss.createIndex('date', 'date');
                ss.createIndex('customerId', 'customerId');
            }
            if (!d.objectStoreNames.contains('expenses')) {
                var es = d.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
                es.createIndex('date', 'date');
                es.createIndex('category', 'category');
            }
            if (!d.objectStoreNames.contains('udhariPayments')) {
                var us = d.createObjectStore('udhariPayments', { keyPath: 'id', autoIncrement: true });
                us.createIndex('date', 'date');
                us.createIndex('customerId', 'customerId');
            }
        };
        req.onsuccess = function (e) { db = e.target.result; resolve(db); };
    });
}

// --- DB Helpers ---
function dbAdd(s, d) {
    return new Promise(function (r, j) {
        var t = db.transaction(s, 'readwrite');
        var q = t.objectStore(s).add(d);
        q.onsuccess = function () { r(q.result); };
        q.onerror = function () { j(q.error); };
    });
}

function dbGetAll(s) {
    return new Promise(function (r, j) {
        var t = db.transaction(s, 'readonly');
        var q = t.objectStore(s).getAll();
        q.onsuccess = function () { r(q.result); };
        q.onerror = function () { j(q.error); };
    });
}

function dbGet(s, id) {
    return new Promise(function (r, j) {
        var t = db.transaction(s, 'readonly');
        var q = t.objectStore(s).get(id);
        q.onsuccess = function () { r(q.result); };
        q.onerror = function () { j(q.error); };
    });
}

function dbPut(s, d) {
    return new Promise(function (r, j) {
        var t = db.transaction(s, 'readwrite');
        var q = t.objectStore(s).put(d);
        q.onsuccess = function () { r(q.result); };
        q.onerror = function () { j(q.error); };
    });
}

function dbDelete(s, id) {
    return new Promise(function (r, j) {
        var t = db.transaction(s, 'readwrite');
        var q = t.objectStore(s).delete(id);
        q.onsuccess = function () { r(); };
        q.onerror = function () { j(q.error); };
    });
}

function dbGetByIndex(s, idx, val) {
    return new Promise(function (r, j) {
        var t = db.transaction(s, 'readonly');
        var q = t.objectStore(s).index(idx).getAll(val);
        q.onsuccess = function () { r(q.result); };
        q.onerror = function () { j(q.error); };
    });
}

function dbClear(s) {
    return new Promise(function (r, j) {
        var t = db.transaction(s, 'readwrite');
        var q = t.objectStore(s).clear();
        q.onsuccess = function () { r(); };
        q.onerror = function () { j(q.error); };
    });
}


// ============ UTILITIES ============
function esc(s) {
    if (!s) return '';
    var m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s).replace(/[&<>"']/g, function (c) { return m[c]; });
}

function showToast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast-notification show ' + (type || 'success');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = 'toast-notification'; }, 2800);
}

function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

function formatDate(str) {
    if (!str) return '';
    var p = str.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
}

function formatDateLong(str) {
    if (!str) return '';
    var d = new Date(str);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function getTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var h = d.getHours();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ampm;
}

function getCatIcon(c) {
    var m = { atta: '🌾', oil: '🛢️', gas: '🔥', poly: '🛍️', other: '📦' };
    return m[c] || '📦';
}

function getCatName(c) {
    var m = { atta: 'Atta', oil: 'Oil / Tel', gas: 'Gas Cylinder', poly: 'Polythene', other: 'Other' };
    return m[c] || c;
}

function getPayBadge(p) {
    if (p === 'cash') return { t: 'Cash', c: 'sb-cash' };
    if (p === 'upi') return { t: 'UPI', c: 'sb-upi' };
    return { t: 'Udhari', c: 'sb-udhari' };
}

function dateShift(dateStr, offset) {
    var d = new Date(dateStr);
    d.setDate(d.getDate() + offset);
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    if (d > t) return null;
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}


// ============ PIN SYSTEM ============
var pinInput = '';
var firstPin = '';

function buildKeypad(cid, onD, onB) {
    var c = document.getElementById(cid);
    c.innerHTML = '';
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    keys.forEach(function (k) {
        var b = document.createElement('button');
        b.className = 'pin-key' + (k === '' ? ' empty' : '');
        b.textContent = k;
        if (k === '⌫') b.onclick = onB;
        else if (k !== '') b.onclick = function () { onD(k); };
        c.appendChild(b);
    });
}

function setDots(did, len) {
    document.querySelectorAll('#' + did + ' .pin-dot').forEach(function (d, i) {
        d.className = 'pin-dot' + (i < len ? ' filled' : '');
    });
}

function showPinErr(did, eid, msg) {
    document.querySelectorAll('#' + did + ' .pin-dot').forEach(function (d) {
        d.className = 'pin-dot error';
    });
    document.getElementById(eid).textContent = msg;
    if (navigator.vibrate) navigator.vibrate(200);
    setTimeout(function () {
        document.querySelectorAll('#' + did + ' .pin-dot').forEach(function (d) {
            d.className = 'pin-dot';
        });
        document.getElementById(eid).textContent = '';
    }, 800);
}

function initSetup() {
    pinInput = '';
    setDots('setupDots', 0);
    buildKeypad('setupPad', function (d) {
        if (pinInput.length < 4) {
            pinInput += d;
            setDots('setupDots', pinInput.length);
            if (pinInput.length === 4) {
                firstPin = pinInput;
                pinInput = '';
                setTimeout(function () { goTo('pinConfirmScreen'); }, 300);
            }
        }
    }, function () {
        if (pinInput.length > 0) {
            pinInput = pinInput.slice(0, -1);
            setDots('setupDots', pinInput.length);
        }
    });
}

function initConfirm() {
    pinInput = '';
    setDots('confirmDots', 0);
    buildKeypad('confirmPad', function (d) {
        if (pinInput.length < 4) {
            pinInput += d;
            setDots('confirmDots', pinInput.length);
            if (pinInput.length === 4) {
                if (pinInput === firstPin) {
                    localStorage.setItem('mdPin', btoa(pinInput));
                    localStorage.setItem('mdPinSet', '1');
                    pinInput = '';
                    firstPin = '';
                    showToast('✅ PIN set ho gaya!');
                    setTimeout(function () { goTo('dashboardScreen'); }, 300);
                } else {
                    pinInput = '';
                    showPinErr('confirmDots', 'confirmErr', 'PIN match nahi hua! Dubara try karein');
                    setTimeout(function () { goTo('pinSetupScreen'); }, 1000);
                }
            }
        }
    }, function () {
        if (pinInput.length > 0) {
            pinInput = pinInput.slice(0, -1);
            setDots('confirmDots', pinInput.length);
        }
    });
}

function initLogin() {
    pinInput = '';
    setDots('loginDots', 0);
    buildKeypad('loginPad', function (d) {
        if (pinInput.length < 4) {
            pinInput += d;
            setDots('loginDots', pinInput.length);
            if (pinInput.length === 4) {
                var saved = '';
                try { saved = atob(localStorage.getItem('mdPin') || ''); } catch (e) { }
                if (pinInput === saved) {
                    pinInput = '';
                    setTimeout(function () { goTo('dashboardScreen'); }, 200);
                } else {
                    pinInput = '';
                    showPinErr('loginDots', 'loginErr', 'Galat PIN! Dubara try karein');
                }
            }
        }
    }, function () {
        if (pinInput.length > 0) {
            pinInput = pinInput.slice(0, -1);
            setDots('loginDots', pinInput.length);
        }
    });
}


// ============ NAVIGATION ============
var pinScreens = ['pinSetupScreen', 'pinConfirmScreen', 'pinLoginScreen', 'splashScreen'];
var currentReport = 'daily';

function goTo(id) {
    document.querySelectorAll('.screen').forEach(function (s) {
        s.classList.remove('active');
    });
    document.getElementById(id).classList.add('active');

    var nav = document.getElementById('bottomNav');
    var showNav = pinScreens.indexOf(id) === -1;
    nav.classList.toggle('show', showNav);

    document.querySelectorAll('.bb-item').forEach(function (n) {
        n.classList.toggle('active', n.dataset.s === id);
    });

    if (id === 'pinSetupScreen') initSetup();
    if (id === 'pinConfirmScreen') initConfirm();
    if (id === 'pinLoginScreen') initLogin();
    if (id === 'dashboardScreen') refreshDashboard();
    if (id === 'customerScreen') loadCustomers();
    if (id === 'salesScreen') {
        document.getElementById('salesDate').value = todayStr();
        loadSalesForDate();
    }
    if (id === 'expenseScreen') {
        document.getElementById('expDate').value = todayStr();
        loadExpForDate();
    }
    if (id === 'udhariScreen') loadUdhari();
    if (id === 'reportScreen') {
        document.getElementById('reportDate').value = todayStr();
        loadReport();
    }

    window.scrollTo(0, 0);
}

function lockApp() { goTo('pinLoginScreen'); }

function hideNav() { document.getElementById('bottomNav').classList.remove('show'); }
function showNav() { document.getElementById('bottomNav').classList.add('show'); }


// ============ DASHBOARD ============
async function refreshDashboard() {
    var now = new Date();
    var days = ['Ravivaar', 'Somvaar', 'Mangalvaar', 'Budhvaar',
        'Guruvaar', 'Shukravaar', 'Shanivaar'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    document.getElementById('todayDate').textContent =
        days[now.getDay()] + ', ' + now.getDate() + ' ' +
        months[now.getMonth()] + ' ' + now.getFullYear();

    // Greeting
    var hr = now.getHours();
    var greet = hr < 12 ? 'Good Morning!' : (hr < 17 ? 'Good Afternoon!' : 'Good Evening!');
    document.getElementById('dashGreeting').textContent = greet;

    var today = todayStr();

    // Today's data
    var todaySales = await dbGetByIndex('sales', 'date', today);
    var todayExps = await dbGetByIndex('expenses', 'date', today);

    var roti = 0, income = 0, expense = 0;
    todaySales.forEach(function (s) { roti += s.quantity; income += s.total; });
    todayExps.forEach(function (x) { expense += x.amount; });
    var profit = income - expense;

    document.getElementById('dRoti').textContent = roti;
    document.getElementById('dIncome').textContent = '\u20B9' + income;
    document.getElementById('dExpense').textContent = '\u20B9' + expense;

    var profitEl = document.getElementById('dProfit');
    if (profit >= 0) {
        profitEl.textContent = '\u20B9' + profit;
        profitEl.className = 'stat-val';
    } else {
        profitEl.textContent = '-\u20B9' + Math.abs(profit);
        profitEl.className = 'stat-val negative';
    }

    // Udhari total
    var allS = await dbGetAll('sales');
    var allP = await dbGetAll('udhariPayments');
    var uG = 0, uR = 0;
    allS.forEach(function (s) { if (s.paymentType === 'udhari') uG += s.total; });
    allP.forEach(function (p) { uR += p.amount; });
    var udhariPending = Math.max(0, uG - uR);
    document.getElementById('dUdhari').textContent = '\u20B9' + udhariPending;

    // Recent Sales
    var rsDiv = document.getElementById('recentSales');
    if (todaySales.length === 0) {
        rsDiv.innerHTML = '<div class="no-data">Aaj koi sale nahi hui</div>';
    } else {
        var h = '';
        todaySales.slice(-5).reverse().forEach(function (s) {
            var pi = s.paymentType === 'cash' ? '💵' : (s.paymentType === 'upi' ? '📱' : '💳');
            h += '<div class="act-item">' +
                '<span class="act-item-name">' + esc(s.customerName) + ' (' + s.quantity + ')</span>' +
                '<span class="act-item-val income">' + pi + ' \u20B9' + s.total + '</span>' +
                '</div>';
        });
        rsDiv.innerHTML = h;
    }

    // Recent Expense
    var reDiv = document.getElementById('recentExp');
    if (todayExps.length === 0) {
        reDiv.innerHTML = '<div class="no-data">Aaj koi kharcha nahi</div>';
    } else {
        var h2 = '';
        todayExps.slice(-5).reverse().forEach(function (x) {
            h2 += '<div class="act-item">' +
                '<span class="act-item-name">' + getCatIcon(x.category) + ' ' + getCatName(x.category) + '</span>' +
                '<span class="act-item-val expense">-\u20B9' + x.amount + '</span>' +
                '</div>';
        });
        reDiv.innerHTML = h2;
    }
}


// ============ CUSTOMERS ============
function openCustomerForm(id) {
    document.getElementById('customerForm').reset();
    document.getElementById('cfId').value = '';
    document.getElementById('cfOrderType').value = 'fixed';
    document.getElementById('fixedQtyGroup').style.display = 'block';
    var tg = document.querySelectorAll('#customerForm .tgl-btn');
    tg.forEach(function (b) { b.classList.remove('active'); });
    tg[0].classList.add('active');

    if (id) {
        document.getElementById('cfTitle').textContent = 'Edit Customer';
        dbGet('customers', id).then(function (c) {
            if (!c) return;
            document.getElementById('cfId').value = c.id;
            document.getElementById('cfName').value = c.name;
            document.getElementById('cfRate').value = c.rate;
            document.getElementById('cfPhone').value = c.phone || '';
            document.getElementById('cfOrderType').value = c.orderType;
            document.getElementById('cfQty').value = c.fixedQty || '';
            tg.forEach(function (b) { b.classList.remove('active'); });
            if (c.orderType === 'variable') {
                tg[1].classList.add('active');
                document.getElementById('fixedQtyGroup').style.display = 'none';
            } else {
                tg[0].classList.add('active');
            }
        });
    } else {
        document.getElementById('cfTitle').textContent = 'New Customer';
    }
    document.getElementById('customerFormOverlay').classList.add('active');
    hideNav();
}

function closeCustomerForm() {
    document.getElementById('customerFormOverlay').classList.remove('active');
    showNav();
}

function setOrderType(t, btn) {
    document.getElementById('cfOrderType').value = t;
    document.querySelectorAll('#customerForm .tgl-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');
    document.getElementById('fixedQtyGroup').style.display = t === 'fixed' ? 'block' : 'none';
    if (t !== 'fixed') document.getElementById('cfQty').value = '';
}

async function saveCustomer(e) {
    e.preventDefault();
    var n = document.getElementById('cfName').value.trim();
    var r = parseFloat(document.getElementById('cfRate').value);
    var ot = document.getElementById('cfOrderType').value;
    var fq = ot === 'fixed' ? parseInt(document.getElementById('cfQty').value) : null;

    if (!n || !r) { showToast('❌ Naam aur Rate daalein!', 'error'); return; }
    if (ot === 'fixed' && (!fq || fq < 1)) { showToast('❌ Daily roti quantity daalein!', 'error'); return; }

    var data = {
        name: n, rate: r,
        phone: document.getElementById('cfPhone').value.trim(),
        orderType: ot, fixedQty: fq,
        updatedAt: new Date().toISOString()
    };

    var idV = document.getElementById('cfId').value;
    if (idV) {
        data.id = parseInt(idV);
        var ex = await dbGet('customers', data.id);
        data.createdAt = ex.createdAt;
        await dbPut('customers', data);
        showToast('✅ ' + n + ' updated!');
    } else {
        data.createdAt = new Date().toISOString();
        await dbAdd('customers', data);
        showToast('✅ ' + n + ' added!');
    }
    closeCustomerForm();
    loadCustomers();
}

async function loadCustomers() {
    var cs = await dbGetAll('customers');
    document.getElementById('custCount').textContent = cs.length + ' Customer' + (cs.length !== 1 ? 's' : '');

    var ct = document.getElementById('customerList');
    if (cs.length === 0) {
        ct.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div>' +
            '<h3>Koi Customer Nahi</h3><p>Pehla customer add karein</p>' +
            '<button class="empty-btn" onclick="openCustomerForm()">+ Add Customer</button></div>';
        return;
    }

    var h = '';
    cs.forEach(function (c, i) {
        var tt = c.orderType === 'fixed' ? 'Fixed: ' + c.fixedQty + '/day' : 'Roz Alag';
        var tc = c.orderType === 'fixed' ? 'cb-fixed' : 'cb-variable';
        h += '<div class="c-card" style="animation-delay:' + (i * 0.05) + 's">' +
            '<div class="c-info"><div class="c-name">' + esc(c.name) + '</div>' +
            '<div class="c-details">' +
            '<span class="c-badge cb-rate">\u20B9' + c.rate + '/roti</span>' +
            '<span class="c-badge ' + tc + '">' + tt + '</span></div>' +
            (c.phone ? '<div class="c-phone">📱 ' + esc(c.phone) + '</div>' : '') +
            '</div><div class="c-actions">' +
            '<button class="icon-btn ib-edit" onclick="openCustomerForm(' + c.id + ')">✏️</button>' +
            '<button class="icon-btn ib-del" onclick="confirmDelCust(' + c.id + ')">🗑️</button>' +
            '</div></div>';
    });
    ct.innerHTML = h;
}

async function confirmDelCust(id) {
    var c = await dbGet('customers', id);
    if (!c) return;
    showConfirm('🗑️', 'Delete Customer?', c.name + ' ko delete karna hai? Iska saara sale data bhi rahega.',
        async function () {
            await dbDelete('customers', id);
            showToast('✅ ' + c.name + ' deleted!');
            loadCustomers();
        });
}


// ============ SALES ============
async function loadSalesForDate() {
    var date = document.getElementById('salesDate').value;
    if (!date) return;
    var all = await dbGetByIndex('sales', 'date', date);
    var roti = 0, inc = 0, cash = 0, udh = 0;
    all.forEach(function (s) {
        roti += s.quantity;
        inc += s.total;
        if (s.paymentType === 'udhari') udh += s.total;
        else cash += s.total;
    });
    document.getElementById('sRoti').textContent = roti;
    document.getElementById('sIncome').textContent = '\u20B9' + inc;
    document.getElementById('sCash').textContent = '\u20B9' + cash;
    document.getElementById('sUdhari').textContent = '\u20B9' + udh;
    renderSalesList(all);
}

function changeSalesDate(off) {
    var inp = document.getElementById('salesDate');
    var nd = dateShift(inp.value, off);
    if (nd) { inp.value = nd; loadSalesForDate(); }
}

async function openSaleForm(id) {
    document.getElementById('saleForm').reset();
    document.getElementById('sfId').value = '';
    document.getElementById('sfPayment').value = 'cash';
    document.getElementById('sfTotal').textContent = '\u20B90';
    document.getElementById('sfRate').value = '';
    var tg = document.querySelectorAll('#saleForm .tgl-btn');
    tg.forEach(function (b) { b.classList.remove('active'); });
    tg[0].classList.add('active');

    var cs = await dbGetAll('customers');
    var sel = document.getElementById('sfCustomer');
    sel.innerHTML = '<option value="">-- Customer Chunein --</option>';
    cs.forEach(function (c) {
        var o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name + ' (\u20B9' + c.rate + ')';
        o.dataset.rate = c.rate;
        o.dataset.qty = c.fixedQty || '';
        o.dataset.name = c.name;
        o.dataset.type = c.orderType;
        sel.appendChild(o);
    });

    if (id) {
        document.getElementById('sfTitle').textContent = 'Edit Sale';
        var s = await dbGet('sales', id);
        if (s) {
            document.getElementById('sfId').value = s.id;
            sel.value = s.customerId;
            document.getElementById('sfRate').value = s.rate;
            document.getElementById('sfQty').value = s.quantity;
            document.getElementById('sfPayment').value = s.paymentType;
            calcSaleTotal();
            tg.forEach(function (b) { b.classList.remove('active'); });
            if (s.paymentType === 'cash') tg[0].classList.add('active');
            else if (s.paymentType === 'upi') tg[1].classList.add('active');
            else tg[2].classList.add('active');
        }
    } else {
        document.getElementById('sfTitle').textContent = 'New Sale';
    }
    document.getElementById('saleFormOverlay').classList.add('active');
    hideNav();
}

function closeSaleForm() {
    document.getElementById('saleFormOverlay').classList.remove('active');
    showNav();
}

function onSaleCustomerSelect() {
    var sel = document.getElementById('sfCustomer');
    var opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
        document.getElementById('sfRate').value = opt.dataset.rate;
        if (opt.dataset.type === 'fixed' && opt.dataset.qty) {
            document.getElementById('sfQty').value = opt.dataset.qty;
        } else {
            document.getElementById('sfQty').value = '';
            document.getElementById('sfQty').focus();
        }
        calcSaleTotal();
    }
}

function calcSaleTotal() {
    var r = parseFloat(document.getElementById('sfRate').value) || 0;
    var q = parseInt(document.getElementById('sfQty').value) || 0;
    document.getElementById('sfTotal').textContent = '\u20B9' + (r * q);
}

function setPayType(hid, val, btn) {
    document.getElementById(hid).value = val;
    btn.parentElement.querySelectorAll('.tgl-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');
}

async function saveSale(e) {
    e.preventDefault();
    var sel = document.getElementById('sfCustomer');
    var cid = parseInt(sel.value);
    if (!cid) { showToast('❌ Customer select karein!', 'error'); return; }
    var opt = sel.options[sel.selectedIndex];
    var r = parseFloat(document.getElementById('sfRate').value);
    var q = parseInt(document.getElementById('sfQty').value);
    if (!r || !q) { showToast('❌ Rate aur Quantity daalein!', 'error'); return; }

    var data = {
        customerId: cid, customerName: opt.dataset.name,
        date: document.getElementById('salesDate').value || todayStr(),
        rate: r, quantity: q, total: r * q,
        paymentType: document.getElementById('sfPayment').value,
        updatedAt: new Date().toISOString()
    };

    var idV = document.getElementById('sfId').value;
    if (idV) {
        data.id = parseInt(idV);
        var ex = await dbGet('sales', data.id);
        data.createdAt = ex.createdAt;
        await dbPut('sales', data);
        showToast('✅ Sale updated!');
    } else {
        data.createdAt = new Date().toISOString();
        await dbAdd('sales', data);
        showToast('✅ ' + data.customerName + ' - ' + q + ' roti saved!');
    }
    closeSaleForm();
    loadSalesForDate();
}

function renderSalesList(sales) {
    var ct = document.getElementById('salesList');
    if (sales.length === 0) {
        ct.innerHTML = '<div class="empty-state"><div class="empty-icon">🫓</div>' +
            '<h3>Koi Sale Nahi</h3><p>Is din ki koi sale nahi hai</p>' +
            '<button class="empty-btn" onclick="openSaleForm()">+ Add Sale</button></div>';
        return;
    }
    var h = '';
    sales.forEach(function (s, i) {
        var pb = getPayBadge(s.paymentType);
        h += '<div class="sale-card" style="animation-delay:' + (i * 0.05) + 's">' +
            '<div class="sale-top"><div class="sale-name">' + esc(s.customerName) + '</div>' +
            '<div class="sale-amount">\u20B9' + s.total + '</div></div>' +
            '<div class="sale-badges">' +
            '<span class="s-badge sb-qty">' + s.quantity + ' roti</span>' +
            '<span class="s-badge sb-rate">\u20B9' + s.rate + '/roti</span>' +
            '<span class="s-badge ' + pb.c + '">' + pb.t + '</span></div>' +
            '<div class="sale-footer"><span class="sale-time">' + getTime(s.createdAt) + '</span>' +
            '<div class="sale-actions">' +
            '<button class="icon-btn ib-edit" onclick="openSaleForm(' + s.id + ')">✏️</button>' +
            '<button class="icon-btn ib-del" onclick="confirmDelSale(' + s.id + ')">🗑️</button>' +
            '</div></div></div>';
    });
    ct.innerHTML = h;
}

async function confirmDelSale(id) {
    var s = await dbGet('sales', id);
    if (!s) return;
    showConfirm('🗑️', 'Delete Sale?',
        s.customerName + ' ki ' + s.quantity + ' roti delete karni hai?',
        async function () {
            await dbDelete('sales', id);
            showToast('✅ Sale deleted!');
            loadSalesForDate();
        });
}


// ============ EXPENSES ============
async function loadExpForDate() {
    var date = document.getElementById('expDate').value;
    if (!date) return;
    var all = await dbGetByIndex('expenses', 'date', date);
    var total = 0;
    all.forEach(function (x) { total += x.amount; });
    document.getElementById('eTotal').textContent = '\u20B9' + total;
    document.getElementById('eCount').textContent = all.length;
    renderExpList(all);
}

function changeExpDate(off) {
    var inp = document.getElementById('expDate');
    var nd = dateShift(inp.value, off);
    if (nd) { inp.value = nd; loadExpForDate(); }
}

async function openExpenseForm(id) {
    document.getElementById('expForm').reset();
    document.getElementById('efId').value = '';
    document.getElementById('efCat').value = 'atta';
    document.getElementById('efPay').value = 'cash';
    document.getElementById('efDetailGroup').style.display = 'none';
    document.getElementById('efWeightGroup').style.display = 'block';
    document.getElementById('efRateInfo').style.display = 'none';

    var cbs = document.querySelectorAll('.cat-pill');
    cbs.forEach(function (b) { b.classList.remove('active'); });
    cbs[0].classList.add('active');

    var tg = document.querySelectorAll('#expForm .tgl-btn');
    tg.forEach(function (b) { b.classList.remove('active'); });
    tg[0].classList.add('active');

    if (id) {
        document.getElementById('efTitle').textContent = 'Edit Kharcha';
        var x = await dbGet('expenses', id);
        if (x) {
            document.getElementById('efId').value = x.id;
            document.getElementById('efCat').value = x.category;
            document.getElementById('efDetail').value = x.detail || '';
            document.getElementById('efWeight').value = x.weight || '';
            document.getElementById('efAmount').value = x.amount;
            document.getElementById('efPay').value = x.paymentType || 'cash';
            setExpCatUI(x.category);
            cbs.forEach(function (b) { b.classList.remove('active'); });
            cbs.forEach(function (b) {
                if (b.textContent.toLowerCase().indexOf(x.category) !== -1 ||
                    (x.category === 'oil' && b.textContent.indexOf('Oil') !== -1) ||
                    (x.category === 'atta' && b.textContent.indexOf('Atta') !== -1) ||
                    (x.category === 'gas' && b.textContent.indexOf('Gas') !== -1) ||
                    (x.category === 'poly' && b.textContent.indexOf('Poly') !== -1) ||
                    (x.category === 'other' && b.textContent.indexOf('Other') !== -1)) {
                    b.classList.add('active');
                }
            });
            tg.forEach(function (b) { b.classList.remove('active'); });
            if (x.paymentType === 'upi') tg[1].classList.add('active');
            else tg[0].classList.add('active');
            showLastRate(x.category);
        }
    } else {
        document.getElementById('efTitle').textContent = 'New Kharcha';
        showLastRate('atta');
    }
    document.getElementById('expFormOverlay').classList.add('active');
    hideNav();
}

function closeExpForm() {
    document.getElementById('expFormOverlay').classList.remove('active');
    showNav();
}

function setExpCat(cat, btn) {
    document.getElementById('efCat').value = cat;
    document.querySelectorAll('.cat-pill').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    setExpCatUI(cat);
    showLastRate(cat);
}

function setExpCatUI(cat) {
    document.getElementById('efDetailGroup').style.display = cat === 'other' ? 'block' : 'none';
    document.getElementById('efWeightGroup').style.display =
        (cat === 'atta' || cat === 'oil') ? 'block' : 'none';
}

async function showLastRate(cat) {
    var ri = document.getElementById('efRateInfo');

    if (cat !== 'atta' && cat !== 'oil') {
        ri.style.display = 'none';
        return;
    }

    var all = await dbGetByIndex('expenses', 'category', cat);
    all = all.filter(function (x) { return x.weight && x.weight > 0; });

    if (all.length === 0) {
        ri.style.display = 'none';
        return;
    }

    // Sort by date
    all.sort(function (a, b) { return a.date > b.date ? 1 : -1; });

    var last = all[all.length - 1];
    var lastRate = (last.amount / last.weight).toFixed(1);

    var msg = '📊 Last purchase: \u20B9' + lastRate + '/kg (' + last.weight + 'kg = \u20B9' + last.amount + ') on ' + formatDate(last.date);

    if (all.length >= 2) {
        var prev = all[all.length - 2];
        var prevRate = (prev.amount / prev.weight).toFixed(1);
        var change = (((last.amount / last.weight) - (prev.amount / prev.weight)) / (prev.amount / prev.weight) * 100).toFixed(1);

        if (change > 0) {
            msg += '\n⬆️ ' + change + '% price increase (was \u20B9' + prevRate + '/kg)';
            ri.className = 'price-compare up';
        } else if (change < 0) {
            msg += '\n⬇️ ' + Math.abs(change) + '% price decrease (was \u20B9' + prevRate + '/kg)';
            ri.className = 'price-compare down';
        } else {
            msg += '\n➡️ Same price as before';
            ri.className = 'price-compare neutral';
        }
    } else {
        ri.className = 'price-compare neutral';
    }

    ri.textContent = msg;
    ri.style.whiteSpace = 'pre-line';
    ri.style.display = 'block';
}

function calcExpRate() {
    var cat = document.getElementById('efCat').value;
    if (cat === 'atta' || cat === 'oil') {
        showLastRate(cat);
    }
}

async function saveExpense(e) {
    e.preventDefault();
    var cat = document.getElementById('efCat').value;
    var amt = parseFloat(document.getElementById('efAmount').value);
    if (!amt) { showToast('❌ Amount daalein!', 'error'); return; }

    var data = {
        category: cat,
        detail: document.getElementById('efDetail').value.trim(),
        weight: parseFloat(document.getElementById('efWeight').value) || null,
        amount: amt,
        paymentType: document.getElementById('efPay').value,
        date: document.getElementById('expDate').value || todayStr(),
        updatedAt: new Date().toISOString()
    };

    var idV = document.getElementById('efId').value;
    if (idV) {
        data.id = parseInt(idV);
        var ex = await dbGet('expenses', data.id);
        data.createdAt = ex.createdAt;
        await dbPut('expenses', data);
        showToast('✅ Kharcha updated!');
    } else {
        data.createdAt = new Date().toISOString();
        await dbAdd('expenses', data);
        showToast('✅ ' + getCatName(cat) + ' \u20B9' + amt + ' saved!');
    }
    closeExpForm();
    loadExpForDate();
}

function renderExpList(exps) {
    var ct = document.getElementById('expList');
    if (exps.length === 0) {
        ct.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div>' +
            '<h3>Koi Kharcha Nahi</h3><p>Is din ka koi kharcha nahi</p>' +
            '<button class="empty-btn" onclick="openExpenseForm()">+ Add Kharcha</button></div>';
        return;
    }
    var h = '';
    exps.forEach(function (x, i) {
        var pb = getPayBadge(x.paymentType);
        var detail = '';
        if (x.weight) {
            detail = x.weight + 'kg \u2022 \u20B9' + (x.amount / x.weight).toFixed(1) + '/kg';
        } else if (x.detail) {
            detail = x.detail;
        }
        h += '<div class="exp-card" style="animation-delay:' + (i * 0.05) + 's">' +
            '<div class="exp-top"><div class="exp-cat">' + getCatIcon(x.category) + ' ' + getCatName(x.category) + '</div>' +
            '<div class="exp-amt">-\u20B9' + x.amount + '</div></div>' +
            (detail ? '<div class="exp-detail">' + esc(detail) + '</div>' : '') +
            '<div class="exp-badges"><span class="s-badge ' + pb.c + '">' + pb.t + '</span></div>' +
            '<div class="exp-footer"><span class="sale-time">' + getTime(x.createdAt) + '</span>' +
            '<div class="sale-actions">' +
            '<button class="icon-btn ib-edit" onclick="openExpenseForm(' + x.id + ')">✏️</button>' +
            '<button class="icon-btn ib-del" onclick="confirmDelExp(' + x.id + ')">🗑️</button>' +
            '</div></div></div>';
    });
    ct.innerHTML = h;
}

async function confirmDelExp(id) {
    var x = await dbGet('expenses', id);
    if (!x) return;
    showConfirm('🗑️', 'Delete Kharcha?',
        getCatName(x.category) + ' \u20B9' + x.amount + ' delete?',
        async function () {
            await dbDelete('expenses', id);
            showToast('✅ Deleted!');
            loadExpForDate();
        });
}


// ============ UDHARI ============
async function loadUdhari() {
    var allS = await dbGetAll('sales');
    var allP = await dbGetAll('udhariPayments');
    var custs = await dbGetAll('customers');

    var custMap = {};
    custs.forEach(function (c) {
        custMap[c.id] = { id: c.id, name: c.name, given: 0, received: 0 };
    });

    allS.forEach(function (s) {
        if (s.paymentType === 'udhari') {
            if (!custMap[s.customerId]) {
                custMap[s.customerId] = { id: s.customerId, name: s.customerName, given: 0, received: 0 };
            }
            custMap[s.customerId].given += s.total;
        }
    });

    allP.forEach(function (p) {
        if (custMap[p.customerId]) custMap[p.customerId].received += p.amount;
    });

    var list = Object.values(custMap).filter(function (c) { return c.given > 0; });
    list.sort(function (a, b) { return (b.given - b.received) - (a.given - a.received); });

    var totalPending = 0;
    list.forEach(function (c) { totalPending += Math.max(0, c.given - c.received); });
    document.getElementById('uTotalPending').textContent = '\u20B9' + totalPending;

    var ct = document.getElementById('udhariList');
    if (list.length === 0) {
        ct.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div>' +
            '<h3>Koi Udhari Nahi!</h3><p>Sab payments clear hain</p></div>';
        return;
    }

    var h = '';
    list.forEach(function (c, i) {
        var pending = Math.max(0, c.given - c.received);
        h += '<div class="u-card" style="animation-delay:' + (i * 0.05) + 's" onclick="openUdhariPay(' + c.id + ')">' +
            '<div class="u-info"><div class="u-name">' + esc(c.name) + '</div>' +
            '<div class="u-sub">Total: \u20B9' + c.given + ' \u2022 Paid: \u20B9' + c.received + '</div></div>' +
            '<div class="u-amount ' + (pending === 0 ? 'u-zero' : '') + '">\u20B9' + pending + '</div></div>';
    });
    ct.innerHTML = h;
}

async function openUdhariPay(custId) {
    var cust = await dbGet('customers', custId);
    var allS = await dbGetAll('sales');
    var allP = await dbGetByIndex('udhariPayments', 'customerId', custId);

    var given = 0;
    allS.forEach(function (s) {
        if (s.paymentType === 'udhari' && s.customerId === custId) given += s.total;
    });
    var received = 0;
    allP.forEach(function (p) { received += p.amount; });
    var pending = Math.max(0, given - received);

    var name = cust ? cust.name : 'Customer';
    document.getElementById('upTitle').textContent = name;
    document.getElementById('upCustId').value = custId;
    document.getElementById('upCustName').value = name;
    document.getElementById('upAmount').value = '';
    document.getElementById('upPay').value = 'cash';

    var tg = document.querySelectorAll('#upForm .tgl-btn');
    tg.forEach(function (b) { b.classList.remove('active'); });
    tg[0].classList.add('active');

    document.getElementById('upDetail').innerHTML =
        '<div class="usc-row"><span class="usc-label">Total Udhari</span><span class="usc-val">\u20B9' + given + '</span></div>' +
        '<div class="usc-row"><span class="usc-label">Total Paid</span><span class="usc-val green">\u20B9' + received + '</span></div>' +
        '<div class="usc-row"><span class="usc-label">Baaki Hai</span><span class="usc-val amber">\u20B9' + pending + '</span></div>';

    var hDiv = document.getElementById('upHistory');
    if (allP.length === 0) {
        hDiv.innerHTML = '<div class="no-data">Koi payment nahi mili abhi tak</div>';
    } else {
        var h = '';
        allP.slice().reverse().forEach(function (p) {
            h += '<div class="act-item">' +
                '<span class="act-item-name">' + formatDate(p.date) + '</span>' +
                '<span class="act-item-val income">+\u20B9' + p.amount + ' ' +
                (p.paymentType === 'upi' ? '📱' : '💵') + '</span></div>';
        });
        hDiv.innerHTML = '<div class="act-card" style="margin:0">' + h + '</div>';
    }

    document.getElementById('udhariPayOverlay').classList.add('active');
    hideNav();
}

function closeUdhariPay() {
    document.getElementById('udhariPayOverlay').classList.remove('active');
    showNav();
}

async function saveUdhariPayment(e) {
    e.preventDefault();
    var amt = parseFloat(document.getElementById('upAmount').value);
    if (!amt || amt < 1) { showToast('❌ Amount daalein!', 'error'); return; }

    var data = {
        customerId: parseInt(document.getElementById('upCustId').value),
        customerName: document.getElementById('upCustName').value,
        amount: amt,
        paymentType: document.getElementById('upPay').value,
        date: todayStr(),
        createdAt: new Date().toISOString()
    };

    await dbAdd('udhariPayments', data);
    showToast('✅ \u20B9' + amt + ' payment saved!');
    closeUdhariPay();
    loadUdhari();
}


// ============ REPORTS ============
function switchReport(type, btn) {
    currentReport = type;
    document.querySelectorAll('.rt-btn').forEach(function (t) { t.classList.remove('active'); });
    btn.classList.add('active');
    loadReport();
}

function changeReportDate(off) {
    var inp = document.getElementById('reportDate');
    var d = new Date(inp.value);
    if (currentReport === 'daily') d.setDate(d.getDate() + off);
    else if (currentReport === 'weekly') d.setDate(d.getDate() + (off * 7));
    else d.setMonth(d.getMonth() + off);
    var t = new Date(); t.setHours(0, 0, 0, 0);
    if (d > t) return;
    inp.value = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    loadReport();
}

var reportData = {};

async function loadReport() {
    var date = document.getElementById('reportDate').value;
    if (!date) return;

    var allS = await dbGetAll('sales');
    var allE = await dbGetAll('expenses');
    var allP = await dbGetAll('udhariPayments');

    var startDate, endDate, title;
    var d = new Date(date);

    if (currentReport === 'daily') {
        startDate = endDate = date;
        title = 'Daily Report \u2022 ' + formatDateLong(date);
    } else if (currentReport === 'weekly') {
        var day = d.getDay();
        var mon = new Date(d);
        mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        var sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        startDate = mon.getFullYear() + '-' + String(mon.getMonth() + 1).padStart(2, '0') + '-' + String(mon.getDate()).padStart(2, '0');
        endDate = sun.getFullYear() + '-' + String(sun.getMonth() + 1).padStart(2, '0') + '-' + String(sun.getDate()).padStart(2, '0');
        title = 'Weekly Report \u2022 ' + formatDate(startDate) + ' - ' + formatDate(endDate);
    } else {
        startDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
        var lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        endDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
        var mNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        title = mNames[d.getMonth()] + ' ' + d.getFullYear();
    }

    var fS = allS.filter(function (s) { return s.date >= startDate && s.date <= endDate; });
    var fE = allE.filter(function (x) { return x.date >= startDate && x.date <= endDate; });
    var fP = allP.filter(function (p) { return p.date >= startDate && p.date <= endDate; });

    var totalRoti = 0, totalIncome = 0, totalExp = 0;
    var cashInc = 0, upiInc = 0, udhariInc = 0;
    var custSales = {};

    fS.forEach(function (s) {
        totalRoti += s.quantity;
        totalIncome += s.total;
        if (s.paymentType === 'cash') cashInc += s.total;
        else if (s.paymentType === 'upi') upiInc += s.total;
        else udhariInc += s.total;
        if (!custSales[s.customerName]) custSales[s.customerName] = { roti: 0, amount: 0 };
        custSales[s.customerName].roti += s.quantity;
        custSales[s.customerName].amount += s.total;
    });

    var catExp = {};
    fE.forEach(function (x) {
        totalExp += x.amount;
        var cn = getCatName(x.category);
        if (!catExp[cn]) catExp[cn] = 0;
        catExp[cn] += x.amount;
    });

    var profit = totalIncome - totalExp;
    var udhariRecovered = 0;
    fP.forEach(function (p) { udhariRecovered += p.amount; });

    // Store for PDF
    reportData = {
        title: title, startDate: startDate, endDate: endDate,
        totalRoti: totalRoti, totalIncome: totalIncome, totalExp: totalExp,
        profit: profit, cashInc: cashInc, upiInc: upiInc,
        udhariInc: udhariInc, udhariRecovered: udhariRecovered,
        custSales: custSales, catExp: catExp
    };

    // Build report HTML
    var h = '';

    // Title
    h += '<div class="rp-card"><div class="rp-title">' + title + '</div></div>';

    // Profit Hero
    h += '<div class="rp-card"><div class="rp-hero">' +
        '<div class="rp-hero-val ' + (profit >= 0 ? 'green' : 'red') + '">' +
        (profit >= 0 ? '\u20B9' : '-\u20B9') + Math.abs(profit) + '</div>' +
        '<div class="rp-hero-lbl">Net Profit</div></div></div>';

    // Summary
    h += '<div class="rp-card"><div class="rp-title">Summary</div>' +
        '<div class="rp-row"><span class="rp-label">Total Roti Sold</span><span class="rp-val">' + totalRoti + '</span></div>' +
        '<div class="rp-row"><span class="rp-label">Total Income</span><span class="rp-val green">\u20B9' + totalIncome + '</span></div>' +
        '<div class="rp-row"><span class="rp-label">Cash Income</span><span class="rp-val">\u20B9' + cashInc + '</span></div>' +
        '<div class="rp-row"><span class="rp-label">UPI Income</span><span class="rp-val">\u20B9' + upiInc + '</span></div>' +
        '<div class="rp-row"><span class="rp-label">Udhari Given</span><span class="rp-val amber">\u20B9' + udhariInc + '</span></div>' +
        '<div class="rp-row"><span class="rp-label">Udhari Recovered</span><span class="rp-val green">\u20B9' + udhariRecovered + '</span></div>' +
        '<div class="rp-row"><span class="rp-label">Total Kharcha</span><span class="rp-val red">\u20B9' + totalExp + '</span></div>' +
        '<div class="rp-row"><span class="rp-label">Net Profit</span><span class="rp-val ' + (profit >= 0 ? 'green' : 'red') + '">' +
        (profit >= 0 ? '\u20B9' : '-\u20B9') + Math.abs(profit) + '</span></div></div>';

    // Customer breakdown
    var custArr = Object.keys(custSales);
    if (custArr.length > 0) {
        h += '<div class="rp-card"><div class="rp-title">Customer Wise Sales</div>';
        custArr.sort(function (a, b) { return custSales[b].amount - custSales[a].amount; });
        custArr.forEach(function (name) {
            var cs = custSales[name];
            h += '<div class="rp-row"><span class="rp-label">' + esc(name) + ' (' + cs.roti + ' roti)</span>' +
                '<span class="rp-val">\u20B9' + cs.amount + '</span></div>';
        });
        h += '</div>';
    }

    // Expense breakdown
    var catArr = Object.keys(catExp);
    if (catArr.length > 0) {
        h += '<div class="rp-card"><div class="rp-title">Kharcha Breakdown</div>';
        catArr.sort(function (a, b) { return catExp[b] - catExp[a]; });
        catArr.forEach(function (cn) {
            var pct = totalExp > 0 ? Math.round(catExp[cn] / totalExp * 100) : 0;
            h += '<div class="rp-row"><span class="rp-label">' + cn + ' (' + pct + '%)</span>' +
                '<span class="rp-val red">\u20B9' + catExp[cn] + '</span></div>';
        });
        h += '</div>';
    }

    // Atta price history
    var attaExps = allE.filter(function (x) { return x.category === 'atta' && x.weight > 0; });
    attaExps.sort(function (a, b) { return a.date > b.date ? 1 : -1; });
    if (attaExps.length > 0) {
        h += '<div class="rp-card"><div class="rp-title">Atta Price History</div>';
        attaExps.slice(-8).reverse().forEach(function (x) {
            var rpk = (x.amount / x.weight).toFixed(1);
            h += '<div class="rp-row"><span class="rp-label">' + formatDate(x.date) + ' (' + x.weight + 'kg)</span>' +
                '<span class="rp-val">\u20B9' + rpk + '/kg</span></div>';
        });
        h += '</div>';
    }

    document.getElementById('reportContent').innerHTML = h;
}


// ============ PDF GENERATION ============
function generatePDF() {
    try {
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF('p', 'mm', 'a4');

        var rd = reportData;
        if (!rd.title) {
            showToast('❌ Pehle report load karein!', 'error');
            return;
        }

        var pageW = 210;
        var marginL = 15;
        var marginR = 15;
        var contentW = pageW - marginL - marginR;
        var y = 20;

        // Header
        doc.setFillColor(26, 26, 46);
        doc.rect(0, 0, pageW, 45, 'F');
        doc.setFillColor(230, 81, 0);
        doc.rect(0, 42, pageW, 3, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Meri Dukaan', marginL, 18);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Business Report', marginL, 25);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(rd.title, marginL, 35);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Generated: ' + new Date().toLocaleString(), pageW - marginR, 35, { align: 'right' });

        y = 55;

        // Profit Box
        var profitColor = rd.profit >= 0 ? [0, 150, 50] : [200, 40, 40];
        doc.setFillColor(profitColor[0], profitColor[1], profitColor[2]);
        doc.roundedRect(marginL, y, contentW, 22, 4, 4, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text('NET PROFIT', marginL + 10, y + 9);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        var profitText = (rd.profit >= 0 ? '\u20B9' : '-\u20B9') + Math.abs(rd.profit);
        doc.text(profitText, pageW - marginR - 10, y + 15, { align: 'right' });

        y += 30;

        // Summary Table
        doc.setTextColor(26, 26, 46);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Summary', marginL, y);
        y += 7;

        doc.setDrawColor(230, 230, 230);

        var summaryRows = [
            ['Total Roti Sold', rd.totalRoti.toString()],
            ['Total Income', '\u20B9' + rd.totalIncome],
            ['Cash Income', '\u20B9' + rd.cashInc],
            ['UPI Income', '\u20B9' + rd.upiInc],
            ['Udhari Given', '\u20B9' + rd.udhariInc],
            ['Udhari Recovered', '\u20B9' + rd.udhariRecovered],
            ['Total Kharcha', '\u20B9' + rd.totalExp],
            ['Net Profit', (rd.profit >= 0 ? '\u20B9' : '-\u20B9') + Math.abs(rd.profit)]
        ];

        doc.setFontSize(10);
        summaryRows.forEach(function (row) {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(row[0], marginL, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(26, 26, 46);
            doc.text(row[1], pageW - marginR, y, { align: 'right' });
            y += 1;
            doc.setDrawColor(240, 240, 240);
            doc.line(marginL, y, pageW - marginR, y);
            y += 6;
        });

        y += 5;

        // Check page break
        function checkPage() {
            if (y > 265) {
                doc.addPage();
                y = 20;
            }
        }

        // Customer Sales
        var custArr = Object.keys(rd.custSales);
        if (custArr.length > 0) {
            checkPage();
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(230, 81, 0);
            doc.text('Customer Wise Sales', marginL, y);
            y += 7;

            custArr.sort(function (a, b) { return rd.custSales[b].amount - rd.custSales[a].amount; });

            doc.setFontSize(10);
            custArr.forEach(function (name) {
                checkPage();
                var cs = rd.custSales[name];
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 100, 100);
                doc.text(name + ' (' + cs.roti + ' roti)', marginL, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(26, 26, 46);
                doc.text('\u20B9' + cs.amount, pageW - marginR, y, { align: 'right' });
                y += 1;
                doc.setDrawColor(240, 240, 240);
                doc.line(marginL, y, pageW - marginR, y);
                y += 6;
            });
            y += 5;
        }

        // Expense Breakdown
        var catArr = Object.keys(rd.catExp);
        if (catArr.length > 0) {
            checkPage();
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(200, 40, 40);
            doc.text('Kharcha Breakdown', marginL, y);
            y += 7;

            catArr.sort(function (a, b) { return rd.catExp[b] - rd.catExp[a]; });

            doc.setFontSize(10);
            catArr.forEach(function (cn) {
                checkPage();
                var pct = rd.totalExp > 0 ? Math.round(rd.catExp[cn] / rd.totalExp * 100) : 0;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 100, 100);
                doc.text(cn + ' (' + pct + '%)', marginL, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(200, 40, 40);
                doc.text('\u20B9' + rd.catExp[cn], pageW - marginR, y, { align: 'right' });
                y += 1;
                doc.setDrawColor(240, 240, 240);
                doc.line(marginL, y, pageW - marginR, y);
                y += 6;
            });
        }

        // Footer
        var pageCount = doc.internal.getNumberOfPages();
        for (var i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFillColor(245, 245, 245);
            doc.rect(0, 287, pageW, 10, 'F');
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'normal');
            doc.text('Meri Dukaan - Business Report', marginL, 293);
            doc.text('Page ' + i + ' of ' + pageCount, pageW - marginR, 293, { align: 'right' });
        }

        // Save
        var fileName = 'MeriDukaan_' + currentReport + '_' + todayStr() + '.pdf';
        doc.save(fileName);
        showToast('✅ PDF downloaded: ' + fileName);

    } catch (err) {
        console.error('PDF Error:', err);
        showToast('❌ PDF error! Internet check karein (jsPDF load hona chahiye)', 'error');
    }
}


// ============ SETTINGS ============
function showChangePinUI() {
    document.getElementById('cpOld').value = '';
    document.getElementById('cpNew').value = '';
    document.getElementById('cpConfirm').value = '';
    document.getElementById('changePinOverlay').classList.add('active');
    hideNav();
}

function closeChangePin() {
    document.getElementById('changePinOverlay').classList.remove('active');
    showNav();
}

function saveNewPin(e) {
    e.preventDefault();
    var old = document.getElementById('cpOld').value;
    var nw = document.getElementById('cpNew').value;
    var cf = document.getElementById('cpConfirm').value;
    var saved = '';
    try { saved = atob(localStorage.getItem('mdPin') || ''); } catch (er) { }

    if (old !== saved) { showToast('❌ Purana PIN galat hai!', 'error'); return; }
    if (nw.length !== 4) { showToast('❌ PIN 4 digit ka hona chahiye!', 'error'); return; }
    if (nw !== cf) { showToast('❌ Naya PIN match nahi hua!', 'error'); return; }

    localStorage.setItem('mdPin', btoa(nw));
    showToast('✅ PIN change ho gaya!');
    closeChangePin();
}

async function exportData() {
    try {
        var data = {
            appName: 'Meri Dukaan',
            version: '2.0',
            customers: await dbGetAll('customers'),
            sales: await dbGetAll('sales'),
            expenses: await dbGetAll('expenses'),
            udhariPayments: await dbGetAll('udhariPayments'),
            exportDate: new Date().toISOString()
        };

        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'MeriDukaan_Backup_' + todayStr() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('✅ Backup file downloaded!');
    } catch (err) {
        showToast('❌ Export error!', 'error');
    }
}

async function importData(e) {
    var file = e.target.files[0];
    if (!file) return;

    showConfirm('📥', 'Import Backup?',
        'Current data REPLACE ho jayega new backup se. Sure hain?',
        function () {
            var reader = new FileReader();
            reader.onload = async function (ev) {
                try {
                    var data = JSON.parse(ev.target.result);

                    if (!data.customers && !data.sales) {
                        showToast('❌ Invalid backup file!', 'error');
                        return;
                    }

                    await dbClear('customers');
                    await dbClear('sales');
                    await dbClear('expenses');
                    await dbClear('udhariPayments');

                    var items = data.customers || [];
                    for (var i = 0; i < items.length; i++) {
                        var item = Object.assign({}, items[i]);
                        delete item.id;
                        await dbAdd('customers', item);
                    }

                    items = data.sales || [];
                    for (var j = 0; j < items.length; j++) {
                        var item2 = Object.assign({}, items[j]);
                        delete item2.id;
                        await dbAdd('sales', item2);
                    }

                    items = data.expenses || [];
                    for (var k = 0; k < items.length; k++) {
                        var item3 = Object.assign({}, items[k]);
                        delete item3.id;
                        await dbAdd('expenses', item3);
                    }

                    items = data.udhariPayments || [];
                    for (var l = 0; l < items.length; l++) {
                        var item4 = Object.assign({}, items[l]);
                        delete item4.id;
                        await dbAdd('udhariPayments', item4);
                    }

                    showToast('✅ Data import successful!');
                    refreshDashboard();
                } catch (err) {
                    console.error('Import error:', err);
                    showToast('❌ Invalid file format!', 'error');
                }
            };
            reader.readAsText(file);
        });

    e.target.value = '';
}

function resetAllData() {
    showConfirm('🗑️', 'DELETE ALL DATA?',
        'Saara data PERMANENTLY delete ho jayega! Ye undo nahi hoga. Pehle backup lein!',
        async function () {
            await dbClear('customers');
            await dbClear('sales');
            await dbClear('expenses');
            await dbClear('udhariPayments');
            showToast('✅ All data deleted!');
            refreshDashboard();
        });
}


// ============ CONFIRM DIALOG ============
var confirmCallback = null;

function showConfirm(icon, title, msg, onYes) {
    document.getElementById('confirmIcon').textContent = icon;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    confirmCallback = onYes;
    document.getElementById('confirmDialog').classList.add('active');
}

function hideConfirm() {
    document.getElementById('confirmDialog').classList.remove('active');
    confirmCallback = null;
}

function onConfirmYes() {
    if (confirmCallback) confirmCallback();
    hideConfirm();
}


// ============ START APP ============
async function startApp() {
    try {
        await initDB();
        console.log('✅ Meri Dukaan DB Ready');

        // Show splash screen for 1.5 seconds
        setTimeout(function () {
            if (localStorage.getItem('mdPinSet') === '1') {
                goTo('pinLoginScreen');
            } else {
                goTo('pinSetupScreen');
            }
        }, 1500);

    } catch (err) {
        console.error('DB Error:', err);
        alert('Database Error! Chrome ya Edge browser use karein.');
    }
}

startApp();