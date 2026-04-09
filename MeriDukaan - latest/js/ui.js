/* ================================================
   MERI DUKAAN v5.0 — UI & NAVIGATION ENGINE
   Routing, Modals, Theme & Date Picker
   ================================================ */

const authScreens = ['splashScreen', 'loginScreen', 'pinSetupScreen', 'pinConfirmScreen', 'pinLoginScreen'];

// ============ ROUTING (NAVIGATION) ============
function goTo(id) {
    triggerHaptic('light');

    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    // Show target screen
    const screen = document.getElementById(id);
    if (screen) screen.classList.add('active');

    // Refresh Lucide Icons to ensure they render on new elements
    setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 50);

    // Bottom Nav Visibility
    const nav = document.getElementById('bottomNav');
    if (nav) {
        if (authScreens.includes(id)) {
            nav.style.display = 'none';
        } else {
            nav.style.display = 'flex';
            document.querySelectorAll('.bn-i').forEach(n => {
                n.classList.toggle('active', n.getAttribute('onclick').includes(id));
            });
        }
    }

    // Call screen initializers dynamically
    switch (id) {
        case 'dashboardScreen': if (typeof refreshDash === 'function') refreshDash(); break;
        case 'customerScreen': if (typeof loadCusts === 'function') loadCusts(); break;
        case 'quickSaleScreen': if (typeof loadQuickSale === 'function') loadQuickSale(); break;
        case 'salesScreen': 
            setDateInput('salesDate', todayStr()); 
            if (typeof loadSales === 'function') loadSales(); 
            break;
        case 'expenseScreen': 
            setDateInput('expDate', todayStr()); 
            if (typeof loadExps === 'function') loadExps(); 
            break;
        case 'wasteScreen': 
            setDateInput('wasteDate', todayStr()); 
            if (typeof loadWasteList === 'function') loadWasteList(); 
            break;
        case 'creditScreen': if (typeof loadCredit === 'function') loadCredit(); break;
        case 'reportScreen': 
            setDateInput('reportDate', todayStr()); 
            if (typeof loadReport === 'function') loadReport(); 
            break;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function lockApp() {
    triggerHaptic('light');
    goTo('pinLoginScreen');
}

// ============ MODALS & BOTTOM SHEETS ============
function openOverlay(id) {
    triggerHaptic('light');
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    setTimeout(() => lucide.createIcons(), 50); // Refresh icons inside modal
}

function closeOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

// Confirm Dialog
let confirmCallback = null;
function showConfirm(iconHtml, title, msg, fn) {
    triggerHaptic('error'); // Get attention
    
    // Fallback if confirmDialog doesn't exist in HTML yet
    if(!document.getElementById('confirmDialog')) {
        if(confirm(`${title}\n${msg}`)) fn();
        return;
    }
    
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    confirmCallback = fn;
    
    const dialog = document.getElementById('confirmDialog');
    dialog.classList.add('active');
}

function hideConfirm() {
    document.getElementById('confirmDialog').classList.remove('active');
    confirmCallback = null;
}

function onConfirmYes() {
    if (confirmCallback) confirmCallback();
    hideConfirm();
}

// ============ THEME SYSTEM (DARK/LIGHT) ============
function applyTheme() {
    if (currentTheme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', currentTheme);
    }
    
    // Redraw charts if on report screen to update colors
    if (isScreenActive('reportScreen') && typeof loadReport === 'function') {
        setTimeout(loadReport, 200);
    }
}

function cycleTheme() {
    triggerHaptic('light');
    if (currentTheme === 'auto') currentTheme = 'light';
    else if (currentTheme === 'light') currentTheme = 'dark';
    else currentTheme = 'auto';
    
    localStorage.setItem('mdTheme', currentTheme);
    applyTheme();
    showToast(`Theme: ${currentTheme.toUpperCase()}`, 'success');
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'auto') applyTheme();
});


// ============ AIRBNB-STYLE DATE PICKER ============
let dpTarget = '';
let dpViewDate = new Date();
let dpSelectedDate = '';

function setDateInput(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
    // Update display button if it exists
    const btn = document.getElementById(id + 'Btn');
    if (btn) btn.innerHTML = `<i data-lucide="calendar"></i> ${fmtDateLong(val)}`;
    lucide.createIcons();
}

function openDatePicker(target) {
    triggerHaptic('light');
    dpTarget = target;
    const input = document.getElementById(target + 'Date');
    dpSelectedDate = input ? input.value : todayStr();
    dpViewDate = new Date(dpSelectedDate + 'T00:00:00');
    
    renderCalendar();
    document.getElementById('datePickerSheet').classList.add('active');
}

function closeDatePicker() {
    document.getElementById('datePickerSheet').classList.remove('active');
}

function dpMonth(offset) {
    triggerHaptic('light');
    const newDate = new Date(dpViewDate);
    newDate.setMonth(newDate.getMonth() + offset);
    
    // Block future months
    const now = new Date();
    if (newDate.getFullYear() > now.getFullYear() || 
       (newDate.getFullYear() === now.getFullYear() && newDate.getMonth() > now.getMonth())) {
        return;
    }
    
    dpViewDate = newDate;
    renderCalendar();
}

function renderCalendar() {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    document.getElementById('dpMonthLabel').textContent = `${months[dpViewDate.getMonth()]} ${dpViewDate.getFullYear()}`;

    const year = dpViewDate.getFullYear();
    const month = dpViewDate.getMonth();
    
    let firstDay = new Date(year, month, 1).getDay();
    firstDay = firstDay === 0 ? 6 : firstDay - 1; // Start Monday
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayS = todayStr();
    
    let html = '';
    
    // Empty cells
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="dp-day empty"></div>`;
    }
    
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${year}-${S(month + 1)}-${S(d)}`;
        const dateObj = new Date(year, month, d);
        const isFuture = dateObj > new Date();
        
        let cls = 'dp-day';
        if (ds === todayS) cls += ' today';
        if (ds === dpSelectedDate) cls += ' selected';
        if (isFuture) cls += ' future';
        
        html += `<button class="${cls}" ${isFuture ? 'disabled' : `onclick="pickDate('${ds}')"`}>${d}</button>`;
    }
    
    document.getElementById('dpDays').innerHTML = html;
}

function pickDate(ds) {
    triggerHaptic('success');
    dpSelectedDate = ds;
    setDateInput(dpTarget + 'Date', ds);
    closeDatePicker();
    
    // Reload active data
    if (dpTarget === 'sales' && typeof loadSales === 'function') loadSales();
    if (dpTarget === 'expense' && typeof loadExps === 'function') loadExps();
    if (dpTarget === 'waste' && typeof loadWasteList === 'function') loadWasteList();
    if (dpTarget === 'report' && typeof loadReport === 'function') loadReport();
}