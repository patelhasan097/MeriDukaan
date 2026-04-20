/* ================================================
   MERI DUKAAN v6.0 — AUTH
   Google Login (bug fixed) · PIN · Navigation
   Real-time Listeners · Date Picker
   Customer Picker · Firestore Helpers
   ================================================ */


// ============ FIREBASE AUTH ============
function googleSignIn() {
    var btn = document.getElementById('googleBtn');
    if (!btn) return;
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Signing in...';

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(function() {
        var provider = new firebase.auth.GoogleAuthProvider();
        var isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isPWA) {
            return auth.signInWithRedirect(provider);
        } else {
            return auth.signInWithPopup(provider).catch(function(error) {
                btn.disabled = false;
                btn.querySelector('span').textContent = 'Sign in with Google';
                if (error.code === 'auth/popup-blocked') { auth.signInWithRedirect(provider); }
                else if (error.code !== 'auth/popup-closed-by-user') {
                    showToast('❌ Sign in failed: ' + error.message, 'error');
                }
            });
        }
    }).catch(function(error) {
        console.warn('[Auth] Persistence failed (incognito?):', error.code);
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Sign in with Google';
        showToast('❌ Incognito mode mein sign-in nahi hoga. Normal browser use karo.', 'error');
    });
}

function signOutApp() {
    showConfirm('🚪', 'Sign Out?', 'You will be logged out from this device.', function() {
        unsubscribers.forEach(function(u){u();}); unsubscribers=[];
        auth.signOut().then(function() {
            currentUser=null; businessId=null; businessRef=null;
            allCustomers=[]; allSales=[]; allExpenses=[]; allWaste=[]; allCreditPayments=[]; allNotes=[];
            goTo('loginScreen');
            showToast('✅ Signed out');
        });
    });
}

function signOutAndLogin() {
    unsubscribers.forEach(function(u){u();}); unsubscribers=[];
    auth.signOut().then(function() { currentUser=null; businessId=null; businessRef=null; goTo('loginScreen'); });
}

async function handleAuthenticated(user) {
    currentUser = user;
    try {
        var ownerSnap = await fdb.collection('businesses').where('ownerUid','==',user.uid).get();
        if (!ownerSnap.empty) {
            businessId = ownerSnap.docs[0].id; userRole = 'owner';
        } else {
            var memberSnap;
            try {
                memberSnap = await fdb.collection('businesses').where('memberEmails','array-contains',user.email.toLowerCase()).get();
            } catch(qErr) {
                console.warn('[Auth] Member query failed:', qErr.code);
                memberSnap = { empty: true, docs: [] };
            }
            if (!memberSnap.empty) {
                businessId = memberSnap.docs[0].id;
                var bData = memberSnap.docs[0].data();
                var member = (bData.members||[]).find(function(m){ return m.email.toLowerCase()===user.email.toLowerCase(); });
                userRole = member ? member.role : 'staff';
            } else {
                businessId = user.uid;
                await fdb.collection('businesses').doc(businessId).set({
                    ownerUid: user.uid, ownerEmail: user.email,
                    ownerName: user.displayName||'Owner', ownerPhoto: user.photoURL||'',
                    pin:'', members:[], memberEmails:[],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                userRole = 'owner';
            }
        }
        businessRef = fdb.collection('businesses').doc(businessId);
        localStorage.setItem('mdBusinessId', businessId);
        setupListeners();
        var bizDoc = await businessRef.get();
        var bizData = bizDoc.data();
        if (!bizData.pin) {
            goTo('pinSetupScreen');
        } else {
            localStorage.setItem('mdPin', bizData.pin);
            goTo('pinLoginScreen');
            var pinUser = document.getElementById('pinUserInfo');
            if (pinUser) {
                var img = user.photoURL ? '<img src="'+esc(user.photoURL)+'" alt="">' : '';
                pinUser.innerHTML = img + '<span>'+esc(user.email)+'</span>';
            }
        }
    } catch(err) {
        console.error('[Auth] Setup error:', err);
        var cachedBizId = localStorage.getItem('mdBusinessId');
        var cachedPin = localStorage.getItem('mdPin');
        if (cachedBizId && cachedPin) {
            businessId = cachedBizId;
            businessRef = fdb.collection('businesses').doc(businessId);
            setupListeners();
            goTo('pinLoginScreen');
            var pu2 = document.getElementById('pinUserInfo');
            if (pu2) pu2.innerHTML = '<span>'+esc(user.email)+'</span><span style="color:#ff8a80;font-size:10px;margin-left:4px">Offline</span>';
            showToast('📴 Offline mode mein kaam ho raha hai', 'error');
        } else {
            showToast('❌ Pehli baar ke liye internet zaroori hai', 'error');
            var gb = document.getElementById('googleBtn');
            if (gb) { gb.disabled=false; gb.querySelector('span').textContent='Sign in with Google'; }
            goTo('loginScreen');
        }
    }
}


// ============ REAL-TIME LISTENERS ============
function setupListeners() {
    unsubscribers.forEach(function(u){u();}); unsubscribers=[];
    if (!businessRef) return;

    unsubscribers.push(
        businessRef.collection('customers').orderBy('name').onSnapshot(function(snap) {
            allCustomers=[];
            snap.forEach(function(doc){ allCustomers.push(Object.assign({id:doc.id},doc.data())); });
            if(isScreenActive('customerScreen')&&typeof loadCusts==='function') loadCusts();
            if(isScreenActive('quickSaleScreen')&&typeof loadQuickSale==='function') loadQuickSale();
        }, function(err){ console.error('[Sync] Customers:',err); })
    );
    unsubscribers.push(
        businessRef.collection('sales').onSnapshot(function(snap) {
            allSales=[];
            snap.forEach(function(doc){ allSales.push(Object.assign({id:doc.id},doc.data())); });
            if(isScreenActive('salesScreen')&&typeof loadSales==='function') loadSales();
            if(isScreenActive('dashboardScreen')&&typeof refreshDash==='function') refreshDash();
            if(isScreenActive('quickSaleScreen')&&typeof loadQuickSale==='function') loadQuickSale();
            if(isScreenActive('creditScreen')&&typeof loadCredit==='function') loadCredit();
        }, function(err){ console.error('[Sync] Sales:',err); })
    );
    unsubscribers.push(
        businessRef.collection('expenses').onSnapshot(function(snap) {
            allExpenses=[];
            snap.forEach(function(doc){ allExpenses.push(Object.assign({id:doc.id},doc.data())); });
            if(isScreenActive('expenseScreen')&&typeof loadExps==='function') loadExps();
            if(isScreenActive('dashboardScreen')&&typeof refreshDash==='function') refreshDash();
        }, function(err){ console.error('[Sync] Expenses:',err); })
    );
    unsubscribers.push(
        businessRef.collection('waste').onSnapshot(function(snap) {
            allWaste=[];
            snap.forEach(function(doc){ allWaste.push(Object.assign({id:doc.id},doc.data())); });
            if(isScreenActive('wasteScreen')&&typeof loadWasteList==='function') loadWasteList();
            if(isScreenActive('dashboardScreen')&&typeof refreshDash==='function') refreshDash();
        }, function(err){ console.error('[Sync] Waste:',err); })
    );
    unsubscribers.push(
        businessRef.collection('creditPayments').onSnapshot(function(snap) {
            allCreditPayments=[];
            snap.forEach(function(doc){ allCreditPayments.push(Object.assign({id:doc.id},doc.data())); });
            if(isScreenActive('creditScreen')&&typeof loadCredit==='function') loadCredit();
            if(isScreenActive('dashboardScreen')&&typeof refreshDash==='function') refreshDash();
        }, function(err){ console.error('[Sync] Credit:',err); })
    );
    unsubscribers.push(
        businessRef.collection('notes').orderBy('createdAt','desc').onSnapshot(function(snap) {
            allNotes=[];
            snap.forEach(function(doc){ allNotes.push(Object.assign({id:doc.id},doc.data())); });
            if(isScreenActive('notebookScreen')&&typeof loadNotes==='function') loadNotes();
        }, function(err){ console.error('[Sync] Notes:',err); })
    );
}


// ============ FIRESTORE HELPERS ============
function fsAdd(col, data) {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.createdBy = currentUser ? currentUser.email : '';
    return businessRef.collection(col).add(data);
}
function fsUpdate(col, docId, data) {
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedBy = currentUser ? currentUser.email : '';
    return businessRef.collection(col).doc(docId).update(data);
}
function fsDelete(col, docId) {
    return businessRef.collection(col).doc(docId).delete();
}


// ============ PIN SYSTEM ============
function buildPad(cid, onD, onB) {
    var c = document.getElementById(cid); if(!c) return; c.innerHTML='';
    '1,2,3,4,5,6,7,8,9,,0,⌫'.split(',').forEach(function(k) {
        var b = document.createElement('button');
        b.type='button'; b.className='pin-key'+(k===''?' empty':''); b.textContent=k;
        b.setAttribute('aria-label', k==='⌫'?'Backspace':k);
        if(k==='⌫') b.onclick=onB;
        else if(k!=='') b.onclick=function(){ onD(k); };
        c.appendChild(b);
    });
}
function setDots(did, len) {
    document.querySelectorAll('#'+did+' i').forEach(function(d,i){ d.className=i<len?'filled':''; });
}
function pinErr(did, eid, msg) {
    document.querySelectorAll('#'+did+' i').forEach(function(d){ d.className='error'; });
    var el=document.getElementById(eid); if(el) el.textContent=msg;
    if(navigator.vibrate) navigator.vibrate(200);
    setTimeout(function(){ document.querySelectorAll('#'+did+' i').forEach(function(d){d.className='';}); if(el)el.textContent=''; }, 800);
}
function initSetup() {
    pinIn=''; setDots('setupDots',0); var er=document.getElementById('setupErr'); if(er) er.textContent='';
    buildPad('setupPad', function(d) {
        if(pinIn.length<4) { pinIn+=d; setDots('setupDots',pinIn.length); if(pinIn.length===4){ pin1=pinIn; pinIn=''; setTimeout(function(){goTo('pinConfirmScreen');},300); } }
    }, function(){ if(pinIn.length>0){ pinIn=pinIn.slice(0,-1); setDots('setupDots',pinIn.length); } });
}
function initConfirm() {
    pinIn=''; setDots('confirmDots',0); var er=document.getElementById('confirmErr'); if(er) er.textContent='';
    buildPad('confirmPad', function(d) {
        if(pinIn.length<4) { pinIn+=d; setDots('confirmDots',pinIn.length);
            if(pinIn.length===4) {
                if(pinIn===pin1) {
                    var encoded=btoa(pinIn);
                    businessRef.update({pin:encoded}).then(function(){ localStorage.setItem('mdPin',encoded); pinIn=''; pin1=''; showToast('✅ PIN set!'); setTimeout(function(){goTo('dashboardScreen');},300); }).catch(function(){ showToast('❌ Error saving PIN','error'); });
                } else { pinIn=''; pinErr('confirmDots','confirmErr','PIN does not match!'); setTimeout(function(){goTo('pinSetupScreen');},1000); }
            }
        }
    }, function(){ if(pinIn.length>0){ pinIn=pinIn.slice(0,-1); setDots('confirmDots',pinIn.length); } });
}
function initLogin() {
    pinIn=''; setDots('loginDots',0); var er=document.getElementById('loginErr'); if(er) er.textContent='';
    buildPad('loginPad', function(d) {
        if(Date.now()<pinLockUntil) { var rem=Math.ceil((pinLockUntil-Date.now())/1000); var el=document.getElementById('loginErr'); if(el) el.textContent='🔒 Locked! Wait '+rem+'s'; return; }
        if(pinIn.length<4) { pinIn+=d; setDots('loginDots',pinIn.length); if(pinIn.length===4) verifyPin(pinIn); }
    }, function(){ if(pinIn.length>0){ pinIn=pinIn.slice(0,-1); setDots('loginDots',pinIn.length); } });
}
function verifyPin(entered) {
    var doCheck = function(stored) {
        var sv=''; try{ sv=atob(stored||''); }catch(e){}
        if(entered===sv) { pinIn=''; pinAttempts=0; setTimeout(function(){goTo('dashboardScreen');},200); }
        else { pinIn=''; pinAttempts++; if(pinAttempts>=5){ pinLockUntil=Date.now()+30000; pinErr('loginDots','loginErr','🔒 Too many attempts! Wait 30s'); pinAttempts=0; } else { pinErr('loginDots','loginErr','Wrong PIN! ('+(5-pinAttempts)+' left)'); } }
    };
    if(businessRef) { businessRef.get().then(function(doc){ doCheck(doc.exists?doc.data().pin:localStorage.getItem('mdPin')); }).catch(function(){ doCheck(localStorage.getItem('mdPin')); }); }
    else { doCheck(localStorage.getItem('mdPin')); }
}


// ============ NAVIGATION ============
var authScreens = ['splashScreen','loginScreen','pinSetupScreen','pinConfirmScreen','pinLoginScreen'];

function goTo(id) {
    document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
    var screen = document.getElementById(id); if(screen) screen.classList.add('active');
    var nav = document.getElementById('bottomNav'); if(nav) nav.classList.toggle('show', authScreens.indexOf(id)===-1);
    document.querySelectorAll('.bn-i').forEach(function(n) {
        var isActive = n.dataset.s===id;
        n.classList.toggle('active', isActive);
        n.setAttribute('aria-current', isActive?'page':'false');
    });
    // Exit batch select mode when navigating away from sales
    if(id !== 'salesScreen' && typeof exitBatchMode === 'function') exitBatchMode();
    switch(id) {
        case 'pinSetupScreen':   initSetup();   break;
        case 'pinConfirmScreen': initConfirm(); break;
        case 'pinLoginScreen':   initLogin();   break;
        case 'dashboardScreen':  if(typeof refreshDash==='function') refreshDash(); break;
        case 'customerScreen':   if(typeof loadCusts==='function') loadCusts(); break;
        case 'quickSaleScreen':  if(typeof loadQuickSale==='function') loadQuickSale(); break;
        case 'salesScreen':
            setDateInput('salesDate',todayStr()); updateDateBtn('salesDateBtn',todayStr());
            clearSearch('salesSearch'); if(typeof loadSales==='function') loadSales(); break;
        case 'expenseScreen':
            setDateInput('expDate',todayStr()); updateDateBtn('expDateBtn',todayStr());
            if(typeof loadExps==='function') loadExps(); break;
        case 'wasteScreen':
            setDateInput('wasteDate',todayStr()); updateDateBtn('wasteDateBtn',todayStr());
            if(typeof loadWasteList==='function') loadWasteList(); break;
        case 'creditScreen':
            var crpD=document.getElementById('crpDate'); if(crpD) crpD.max=todayStr();
            if(typeof loadCredit==='function') loadCredit(); break;
        case 'reportScreen':
            setDateInput('reportDate',todayStr()); updateDateBtn('reportDateBtn',todayStr());
            if(typeof loadReport==='function') loadReport(); break;
        case 'settingScreen':    if(typeof loadSettings==='function') loadSettings(); break;
        case 'notebookScreen':   if(typeof loadNotes==='function') loadNotes(); break;
        case 'analyticsScreen':  if(typeof loadAnalytics==='function') loadAnalytics(); break;
    }
    window.scrollTo(0,0);
}

function lockApp() { goTo('pinLoginScreen'); }

function closeOverlay(id) {
    var el=document.getElementById(id); if(el) el.classList.remove('active');
    var nav=document.getElementById('bottomNav'); if(nav) nav.classList.add('show');
}
function openOverlay(id) {
    var el=document.getElementById(id); if(el) el.classList.add('active');
    var nav=document.getElementById('bottomNav'); if(nav) nav.classList.remove('show');
}
function setDateInput(id, val) { var el=document.getElementById(id); if(el) el.value=val; }
function updateDateBtn(id, val) { var el=document.getElementById(id); if(el) el.textContent=fmtDateBtn(val); }
function clearSearch(id) { var el=document.getElementById(id); if(el) el.value=''; }


// ============ CUSTOM DATE PICKER ============
function openDatePicker(target) {
    dpTarget=target; var cv='';
    if(target==='sales') cv=document.getElementById('salesDate').value;
    else if(target==='expense') cv=document.getElementById('expDate').value;
    else if(target==='waste') cv=document.getElementById('wasteDate').value;
    else if(target==='report') cv=document.getElementById('reportDate').value;
    dpSelectedDate=cv||todayStr(); dpViewDate=new Date(dpSelectedDate+'T00:00:00');
    renderCalendar(); document.getElementById('datePickerSheet').classList.add('active');
}
function closeDatePicker() { document.getElementById('datePickerSheet').classList.remove('active'); }
function dpMonth(off) {
    var nd=new Date(dpViewDate); nd.setMonth(nd.getMonth()+off);
    var now=new Date();
    if(nd.getFullYear()>now.getFullYear()||(nd.getFullYear()===now.getFullYear()&&nd.getMonth()>now.getMonth())) return;
    dpViewDate=nd; renderCalendar();
}
function renderCalendar() {
    var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('dpMonthLabel').textContent=months[dpViewDate.getMonth()]+' '+dpViewDate.getFullYear();
    var year=dpViewDate.getFullYear(), month=dpViewDate.getMonth();
    var firstDay=new Date(year,month,1).getDay(); firstDay=firstDay===0?6:firstDay-1;
    var daysInMonth=new Date(year,month+1,0).getDate();
    var today=new Date(); today.setHours(23,59,59,999); var todayS=todayStr(); var h='';
    for(var e=0;e<firstDay;e++) h+='<button class="dp-day empty" aria-hidden="true"></button>';
    for(var d=1;d<=daysInMonth;d++) {
        var ds=year+'-'+S(month+1)+'-'+S(d); var dateObj=new Date(year,month,d); var cls='dp-day';
        if(ds===todayS) cls+=' today'; if(ds===dpSelectedDate) cls+=' selected'; if(dateObj>today) cls+=' future';
        h+='<button class="'+cls+'" onclick="pickDate(\''+ds+'\')" aria-label="'+d+' '+months[month]+' '+year+'">'+d+'</button>';
    }
    document.getElementById('dpDays').innerHTML=h;
    var now2=new Date(); var nextBtn=document.getElementById('dpNextBtn');
    if(nextBtn) nextBtn.disabled=(dpViewDate.getFullYear()>=now2.getFullYear()&&dpViewDate.getMonth()>=now2.getMonth());
    var infoEl=document.getElementById('dpSelectedInfo');
    if(infoEl&&dpSelectedDate) {
        var selDate=new Date(dpSelectedDate+'T00:00:00');
        if(selDate.getMonth()!==month||selDate.getFullYear()!==year){ infoEl.textContent='✓ Selected: '+fmtDateLong(dpSelectedDate); infoEl.style.display='block'; }
        else infoEl.style.display='none';
    }
}
function pickDate(ds) { dpSelectedDate=ds; applyPickedDate(ds); closeDatePicker(); }
function pickQuickDate(type) {
    var ds;
    if(type==='today') ds=todayStr();
    else if(type==='yesterday') { var y=new Date(); y.setDate(y.getDate()-1); ds=y.getFullYear()+'-'+S(y.getMonth()+1)+'-'+S(y.getDate()); }
    else if(type==='week') { var t=new Date(); var dy=t.getDay(); t.setDate(t.getDate()-(dy===0?6:dy-1)); ds=t.getFullYear()+'-'+S(t.getMonth()+1)+'-'+S(t.getDate()); }
    applyPickedDate(ds); closeDatePicker();
}
function applyPickedDate(ds) {
    if(dpTarget==='sales'){ setDateInput('salesDate',ds); updateDateBtn('salesDateBtn',ds); if(typeof loadSales==='function') loadSales(); }
    else if(dpTarget==='expense'){ setDateInput('expDate',ds); updateDateBtn('expDateBtn',ds); if(typeof loadExps==='function') loadExps(); }
    else if(dpTarget==='waste'){ setDateInput('wasteDate',ds); updateDateBtn('wasteDateBtn',ds); if(typeof loadWasteList==='function') loadWasteList(); }
    else if(dpTarget==='report'){ setDateInput('reportDate',ds); updateDateBtn('reportDateBtn',ds); if(typeof loadReport==='function') loadReport(); }
}


// ============ CUSTOMER PICKER ============
function openCustPicker(mode) {
    pickerMode=mode; renderPickerList(allCustomers);
    var el=document.getElementById('custSearch'); if(el) el.value='';
    document.getElementById('custPickerSheet').classList.add('active');
}
function closeCustPicker() { document.getElementById('custPickerSheet').classList.remove('active'); }

var _filterCustDebounced = null;
function filterCustPicker(val) {
    if(!_filterCustDebounced) _filterCustDebounced = debounce(function(v) {
        var filtered=allCustomers.filter(function(c){ return c.name.toLowerCase().indexOf((v||'').toLowerCase())!==-1; });
        renderPickerList(filtered);
    }, 200);
    _filterCustDebounced(val);
}
function renderPickerList(cs) {
    var ct=document.getElementById('custPickerList'); if(!ct) return;
    if(!cs.length){ ct.innerHTML='<div class="no-data">No customer found</div>'; return; }
    var h='';
    cs.forEach(function(c) {
        h+='<div class="bts-item" role="option" data-cid="'+c.id+'">'+
           '<span class="bts-item-name">'+esc(c.name)+'</span>'+
           '<span class="bts-item-rate">₹'+c.rate+'</span></div>';
    });
    ct.innerHTML=h;
}
document.addEventListener('DOMContentLoaded', function() {
    var pl=document.getElementById('custPickerList');
    if(pl) pl.addEventListener('click', function(e) {
        var item=e.target.closest('.bts-item'); if(!item) return;
        var cid=item.getAttribute('data-cid'); if(!cid) return;
        var c=findInArray(allCustomers,cid); if(c) selectCust(c);
    });
});
function selectCust(c) {
    if(pickerMode==='sale') {
        document.getElementById('sfCustomerId').value=c.id;
        document.getElementById('sfCustomerName').value=c.name;
        document.getElementById('sfCustLabel').textContent=c.name+' (₹'+c.rate+')';
        document.getElementById('sfCustBtn').classList.add('selected');
        document.getElementById('sfRate').value=c.rate;
        if(c.orderType==='fixed'&&c.fixedQty>0) document.getElementById('sfQty').value=c.fixedQty;
        else { document.getElementById('sfQty').value=''; setTimeout(function(){document.getElementById('sfQty').focus();},300); }
        if(typeof calcSaleTotal==='function') calcSaleTotal();
        if(typeof checkDuplicateSale==='function') checkDuplicateSale(c.id,c.name);
        // Phase 3: Show advance notice if customer has advance
        if(typeof showAdvanceNotice==='function') showAdvanceNotice(c.id);
    }
    closeCustPicker();
}

console.log('[Auth] Auth module loaded');