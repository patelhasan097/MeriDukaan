/* ================================================
   MERI DUKAAN v3.0 - COMPLETE APP LOGIC
   All Fixes + PDF Tables + Multi-Device Sync
   ================================================ */

// ============ DATABASE ============
var db;
function initDB(){
    return new Promise(function(ok,fail){
        var req=indexedDB.open('MeriDukaanDB',3);
        req.onerror=function(){fail(req.error)};
        req.onupgradeneeded=function(e){
            var d=e.target.result;
            if(!d.objectStoreNames.contains('customers'))
                d.createObjectStore('customers',{keyPath:'id',autoIncrement:true});
            if(!d.objectStoreNames.contains('sales')){
                var ss=d.createObjectStore('sales',{keyPath:'id',autoIncrement:true});
                ss.createIndex('date','date',{unique:false});
                ss.createIndex('customerId','customerId',{unique:false});
            }
            if(!d.objectStoreNames.contains('expenses')){
                var es=d.createObjectStore('expenses',{keyPath:'id',autoIncrement:true});
                es.createIndex('date','date',{unique:false});
                es.createIndex('category','category',{unique:false});
            }
            if(!d.objectStoreNames.contains('udhariPayments')){
                var us=d.createObjectStore('udhariPayments',{keyPath:'id',autoIncrement:true});
                us.createIndex('date','date',{unique:false});
                us.createIndex('customerId','customerId',{unique:false});
            }
        };
        req.onsuccess=function(e){db=e.target.result;ok(db)};
    });
}

function dbOp(store,mode,fn){
    return new Promise(function(ok,fail){
        var tx=db.transaction(store,mode);
        var result=fn(tx.objectStore(store));
        if(result && result.onsuccess!==undefined){
            result.onsuccess=function(){ok(result.result)};
            result.onerror=function(){fail(result.error)};
        } else {
            tx.oncomplete=function(){ok()};
            tx.onerror=function(){fail(tx.error)};
        }
    });
}
function dbAdd(s,d){return dbOp(s,'readwrite',function(st){return st.add(d)})}
function dbGetAll(s){return dbOp(s,'readonly',function(st){return st.getAll()})}
function dbGet(s,id){return dbOp(s,'readonly',function(st){return st.get(id)})}
function dbPut(s,d){return dbOp(s,'readwrite',function(st){return st.put(d)})}
function dbDel(s,id){return dbOp(s,'readwrite',function(st){return st.delete(id)})}
function dbClear(s){return dbOp(s,'readwrite',function(st){return st.clear()})}
function dbByIdx(s,idx,val){
    return new Promise(function(ok,fail){
        var tx=db.transaction(s,'readonly');
        var req=tx.objectStore(s).index(idx).getAll(val);
        req.onsuccess=function(){ok(req.result)};
        req.onerror=function(){fail(req.error)};
    });
}

// ============ UTILITIES ============
function esc(s){
    if(!s)return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function showToast(msg,type){
    var t=document.getElementById('toast');
    t.textContent=msg;
    t.className='toast show '+(type||'success');
    clearTimeout(t._tm);
    t._tm=setTimeout(function(){t.className='toast'},2500);
}
function todayStr(){
    var d=new Date();
    return d.getFullYear()+'-'+S(d.getMonth()+1)+'-'+S(d.getDate());
}
function S(n){return n<10?'0'+n:''+n}
function fmtDate(s){if(!s)return '';var p=s.split('-');return p[2]+'/'+p[1]+'/'+p[0]}
function fmtDateLong(s){
    if(!s)return '';var d=new Date(s);
    var m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate()+' '+m[d.getMonth()]+' '+d.getFullYear();
}
function getTime(iso){
    if(!iso)return '';var d=new Date(iso);
    var h=d.getHours(),ap=h>=12?'PM':'AM';h=h%12||12;
    return h+':'+S(d.getMinutes())+' '+ap;
}
function catIc(c){return{atta:'🌾',oil:'🛢️',gas:'🔥',poly:'🛍️',other:'📦'}[c]||'📦'}
function catNm(c){return{atta:'Atta',oil:'Oil/Tel',gas:'Gas Cylinder',poly:'Polythene',other:'Other'}[c]||c}
function payBdg(p){
    if(p==='cash')return{t:'💵 Cash',c:'slb-c'};
    if(p==='upi')return{t:'📱 UPI',c:'slb-u'};
    return{t:'💳 Udhari',c:'slb-h'};
}
function dateShift(ds,off){
    var d=new Date(ds);d.setDate(d.getDate()+off);
    var t=new Date();t.setHours(0,0,0,0);
    if(d>t)return null;
    return d.getFullYear()+'-'+S(d.getMonth()+1)+'-'+S(d.getDate());
}
function Rs(n){return 'Rs.'+n}

// ============ PIN ============
var pinIn='',pin1='';
function buildPad(cid,onD,onB){
    var c=document.getElementById(cid);c.innerHTML='';
    '1,2,3,4,5,6,7,8,9,,0,⌫'.split(',').forEach(function(k){
        var b=document.createElement('button');
        b.className='pin-key'+(k===''?' empty':'');
        b.textContent=k;
        if(k==='⌫')b.onclick=onB;
        else if(k!=='')b.onclick=function(){onD(k)};
        c.appendChild(b);
    });
}
function setDots(did,len){
    document.querySelectorAll('#'+did+' i').forEach(function(d,i){
        d.className=i<len?'filled':'';
    });
}
function pinErr(did,eid,msg){
    document.querySelectorAll('#'+did+' i').forEach(function(d){d.className='error'});
    document.getElementById(eid).textContent=msg;
    if(navigator.vibrate)navigator.vibrate(200);
    setTimeout(function(){
        document.querySelectorAll('#'+did+' i').forEach(function(d){d.className=''});
        document.getElementById(eid).textContent='';
    },800);
}
function initSetup(){
    pinIn='';setDots('setupDots',0);
    buildPad('setupPad',function(d){
        if(pinIn.length<4){pinIn+=d;setDots('setupDots',pinIn.length);
            if(pinIn.length===4){pin1=pinIn;pinIn='';setTimeout(function(){goTo('pinConfirmScreen')},300)}}
    },function(){if(pinIn.length>0){pinIn=pinIn.slice(0,-1);setDots('setupDots',pinIn.length)}});
}
function initConfirm(){
    pinIn='';setDots('confirmDots',0);
    buildPad('confirmPad',function(d){
        if(pinIn.length<4){pinIn+=d;setDots('confirmDots',pinIn.length);
            if(pinIn.length===4){
                if(pinIn===pin1){
                    localStorage.setItem('mdPin',btoa(pinIn));
                    localStorage.setItem('mdPinSet','1');
                    pinIn='';pin1='';showToast('✅ PIN set ho gaya!');
                    setTimeout(function(){goTo('dashboardScreen')},300);
                }else{pinIn='';pinErr('confirmDots','confirmErr','PIN match nahi hua!');
                    setTimeout(function(){goTo('pinSetupScreen')},1000)}
            }}
    },function(){if(pinIn.length>0){pinIn=pinIn.slice(0,-1);setDots('confirmDots',pinIn.length)}});
}
function initLogin(){
    pinIn='';setDots('loginDots',0);
    buildPad('loginPad',function(d){
        if(pinIn.length<4){pinIn+=d;setDots('loginDots',pinIn.length);
            if(pinIn.length===4){
                var sv='';try{sv=atob(localStorage.getItem('mdPin')||'')}catch(e){}
                if(pinIn===sv){pinIn='';setTimeout(function(){goTo('dashboardScreen')},200)}
                else{pinIn='';pinErr('loginDots','loginErr','Galat PIN!')}
            }}
    },function(){if(pinIn.length>0){pinIn=pinIn.slice(0,-1);setDots('loginDots',pinIn.length)}});
}

// ============ NAVIGATION ============
var pinScr=['pinSetupScreen','pinConfirmScreen','pinLoginScreen','splashScreen'];
var curReport='daily';
function goTo(id){
    document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active')});
    document.getElementById(id).classList.add('active');
    var nav=document.getElementById('bottomNav');
    nav.classList.toggle('show',pinScr.indexOf(id)===-1);
    document.querySelectorAll('.bn-i').forEach(function(n){n.classList.toggle('active',n.dataset.s===id)});
    if(id==='pinSetupScreen')initSetup();
    if(id==='pinConfirmScreen')initConfirm();
    if(id==='pinLoginScreen')initLogin();
    if(id==='dashboardScreen')refreshDash();
    if(id==='customerScreen')loadCusts();
    if(id==='salesScreen'){document.getElementById('salesDate').value=todayStr();loadSales()}
    if(id==='expenseScreen'){document.getElementById('expDate').value=todayStr();loadExps()}
    if(id==='udhariScreen')loadUdhari();
    if(id==='reportScreen'){document.getElementById('reportDate').value=todayStr();loadReport()}
    if(id==='settingScreen')loadSyncInfo();
    window.scrollTo(0,0);
}
function lockApp(){goTo('pinLoginScreen')}
function closeOverlay(id){document.getElementById(id).classList.remove('active');document.getElementById('bottomNav').classList.add('show')}
function openOverlay(id){document.getElementById(id).classList.add('active');document.getElementById('bottomNav').classList.remove('show')}

// ============ DASHBOARD ============
async function refreshDash(){
    var now=new Date();
    var days=['Ravivaar','Somvaar','Mangalvaar','Budhvaar','Guruvaar','Shukravaar','Shanivaar'];
    var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('todayDate').textContent=days[now.getDay()]+', '+now.getDate()+' '+months[now.getMonth()]+' '+now.getFullYear();
    var hr=now.getHours();
    document.getElementById('dashGreeting').textContent=hr<12?'Good Morning!':hr<17?'Good Afternoon!':'Good Evening!';

    var today=todayStr();
    var ts=await dbByIdx('sales','date',today);
    var te=await dbByIdx('expenses','date',today);
    var roti=0,inc=0,exp=0;
    ts.forEach(function(s){roti+=s.quantity;inc+=s.total});
    te.forEach(function(x){exp+=x.amount});
    var profit=inc-exp;

    document.getElementById('dRoti').textContent=roti;
    document.getElementById('dIncome').textContent='₹'+inc;
    document.getElementById('dExpense').textContent='₹'+exp;
    var pEl=document.getElementById('dProfit');
    pEl.textContent=(profit>=0?'₹':'-₹')+Math.abs(profit);
    pEl.className=profit>=0?'':'neg';

    var allS=await dbGetAll('sales'),allP=await dbGetAll('udhariPayments');
    var uG=0,uR=0;
    allS.forEach(function(s){if(s.paymentType==='udhari')uG+=s.total});
    allP.forEach(function(p){uR+=p.amount});
    document.getElementById('dUdhari').textContent='₹'+Math.max(0,uG-uR);

    var rs=document.getElementById('recentSales');
    if(!ts.length)rs.innerHTML='<div class="no-data">Aaj koi sale nahi hui</div>';
    else{var h='';ts.slice(-5).reverse().forEach(function(s){
        var pi=s.paymentType==='cash'?'💵':s.paymentType==='upi'?'📱':'💳';
        h+='<div class="aw-item"><span class="aw-item-n">'+esc(s.customerName)+' ('+s.quantity+')</span><span class="aw-item-v inc">'+pi+' ₹'+s.total+'</span></div>';
    });rs.innerHTML=h}

    var re=document.getElementById('recentExp');
    if(!te.length)re.innerHTML='<div class="no-data">Aaj koi kharcha nahi</div>';
    else{var h2='';te.slice(-5).reverse().forEach(function(x){
        h2+='<div class="aw-item"><span class="aw-item-n">'+catIc(x.category)+' '+catNm(x.category)+'</span><span class="aw-item-v exp">-₹'+x.amount+'</span></div>';
    });re.innerHTML=h2}
}

// ============ CUSTOMERS ============
function openCustomerForm(id){
    document.getElementById('customerForm').reset();
    document.getElementById('cfId').value='';
    document.getElementById('cfOrderType').value='fixed';
    document.getElementById('fixedQtyGroup').style.display='block';
    var tg=document.querySelectorAll('#customerForm .tgl');
    tg.forEach(function(b){b.classList.remove('active')});tg[0].classList.add('active');
    if(id){
        document.getElementById('cfTitle').textContent='Edit Customer';
        dbGet('customers',id).then(function(c){
            if(!c)return;
            document.getElementById('cfId').value=c.id;
            document.getElementById('cfName').value=c.name;
            document.getElementById('cfRate').value=c.rate;
            document.getElementById('cfPhone').value=c.phone||'';
            document.getElementById('cfOrderType').value=c.orderType;
            document.getElementById('cfQty').value=c.fixedQty||'';
            tg.forEach(function(b){b.classList.remove('active')});
            if(c.orderType==='variable'){tg[1].classList.add('active');document.getElementById('fixedQtyGroup').style.display='none'}
            else tg[0].classList.add('active');
        });
    }else document.getElementById('cfTitle').textContent='New Customer';
    openOverlay('customerFormOverlay');
}
function setOrderType(t,btn){
    document.getElementById('cfOrderType').value=t;
    document.querySelectorAll('#customerForm .tgl').forEach(function(b){b.classList.remove('active')});
    btn.classList.add('active');
    document.getElementById('fixedQtyGroup').style.display=t==='fixed'?'block':'none';
    if(t!=='fixed')document.getElementById('cfQty').value='';
}
async function saveCustomer(e){
    e.preventDefault();
    var n=document.getElementById('cfName').value.trim();
    var r=parseFloat(document.getElementById('cfRate').value);
    var ot=document.getElementById('cfOrderType').value;
    var fq=ot==='fixed'?parseInt(document.getElementById('cfQty').value):null;
    if(!n||!r){showToast('❌ Naam aur Rate daalein!','error');return}
    if(ot==='fixed'&&(!fq||fq<1)){showToast('❌ Daily roti daalein!','error');return}
    var data={name:n,rate:r,phone:document.getElementById('cfPhone').value.trim(),orderType:ot,fixedQty:fq,updatedAt:new Date().toISOString()};
    var idV=document.getElementById('cfId').value;
    if(idV){data.id=parseInt(idV);var ex=await dbGet('customers',data.id);data.createdAt=ex.createdAt;await dbPut('customers',data);showToast('✅ '+n+' updated!')}
    else{data.createdAt=new Date().toISOString();await dbAdd('customers',data);showToast('✅ '+n+' added!')}
    closeOverlay('customerFormOverlay');loadCusts();
}
async function loadCusts(){
    var cs=await dbGetAll('customers');
    document.getElementById('custCount').textContent=cs.length+' Customer'+(cs.length!==1?'s':'');
    var ct=document.getElementById('customerList');
    if(!cs.length){ct.innerHTML='<div class="empty"><div class="empty-ic">👥</div><h3>Koi Customer Nahi</h3><p>Pehla customer add karein</p><button class="empty-btn" onclick="openCustomerForm()">+ Add</button></div>';return}
    var h='';cs.forEach(function(c,i){
        var tt=c.orderType==='fixed'?'Fixed: '+c.fixedQty+'/day':'Roz Alag';
        var tc=c.orderType==='fixed'?'cb-f':'cb-v';
        h+='<div class="c-card" style="animation-delay:'+(i*.04)+'s"><div class="c-info"><div class="c-name">'+esc(c.name)+'</div><div class="c-dets"><span class="c-b cb-r">₹'+c.rate+'/roti</span><span class="c-b '+tc+'">'+tt+'</span></div>'+(c.phone?'<div class="c-ph">📱 '+esc(c.phone)+'</div>':'')+'</div><div class="c-acts"><button class="ic-btn ib-e" onclick="openCustomerForm('+c.id+')">✏️</button><button class="ic-btn ib-d" onclick="confirmDelCust('+c.id+')">🗑️</button></div></div>';
    });ct.innerHTML=h;
}
async function confirmDelCust(id){
    var c=await dbGet('customers',id);if(!c)return;
    showConfirm('🗑️','Delete?',c.name+' ko delete karna hai?',async function(){await dbDel('customers',id);showToast('✅ Deleted!');loadCusts()});
}

// ============ CUSTOM PICKER ============
var pickerMode='';
var allCustomers=[];
function openCustPicker(mode){
    pickerMode=mode;
    dbGetAll('customers').then(function(cs){
        allCustomers=cs;
        renderPickerList(cs);
        document.getElementById('custSearch').value='';
        document.getElementById('custPickerSheet').classList.add('active');
    });
}
function closeCustPicker(){document.getElementById('custPickerSheet').classList.remove('active')}
function filterCustPicker(val){
    val=val.toLowerCase();
    var filtered=allCustomers.filter(function(c){return c.name.toLowerCase().indexOf(val)!==-1});
    renderPickerList(filtered);
}
function renderPickerList(cs){
    var ct=document.getElementById('custPickerList');
    if(!cs.length){ct.innerHTML='<div class="no-data">Koi customer nahi mila</div>';return}
    var h='';cs.forEach(function(c){
        h+='<div class="bts-item" onclick="selectCust('+c.id+',\''+esc(c.name).replace(/'/g,"\\'")+'\','+c.rate+',\''+(c.orderType||'variable')+'\','+(c.fixedQty||0)+')"><span class="bts-item-name">'+esc(c.name)+'</span><span class="bts-item-rate">₹'+c.rate+'</span></div>';
    });ct.innerHTML=h;
}
function selectCust(id,name,rate,type,qty){
    if(pickerMode==='sale'){
        document.getElementById('sfCustomerId').value=id;
        document.getElementById('sfCustomerName').value=name;
        document.getElementById('sfCustLabel').textContent=name+' (₹'+rate+')';
        document.getElementById('sfCustBtn').classList.add('selected');
        document.getElementById('sfRate').value=rate;
        if(type==='fixed'&&qty>0)document.getElementById('sfQty').value=qty;
        else{document.getElementById('sfQty').value='';document.getElementById('sfQty').focus()}
        calcSaleTotal();
    }
    closeCustPicker();
}

// ============ SALES ============
async function loadSales(){
    var date=document.getElementById('salesDate').value;if(!date)return;
    var all=await dbByIdx('sales','date',date);
    var roti=0,inc=0,cash=0,udh=0;
    all.forEach(function(s){roti+=s.quantity;inc+=s.total;if(s.paymentType==='udhari')udh+=s.total;else cash+=s.total});
    document.getElementById('sRoti').textContent=roti;
    document.getElementById('sIncome').textContent='₹'+inc;
    document.getElementById('sCash').textContent='₹'+cash;
    document.getElementById('sUdhari').textContent='₹'+udh;
    renderSales(all);
}
function loadSalesForDate(){loadSales()}
function changeSalesDate(off){var inp=document.getElementById('salesDate');var nd=dateShift(inp.value,off);if(nd){inp.value=nd;loadSales()}}

async function openSaleForm(id){
    document.getElementById('saleForm').reset();
    document.getElementById('sfId').value='';
    document.getElementById('sfCustomerId').value='';
    document.getElementById('sfCustomerName').value='';
    document.getElementById('sfCustLabel').textContent='-- Customer Chunein --';
    document.getElementById('sfCustBtn').classList.remove('selected');
    document.getElementById('sfPay').value='cash';
    document.getElementById('sfTotal').textContent='₹0';
    document.getElementById('sfRate').value='';
    var tg=document.querySelectorAll('#saleForm .tgl');
    tg.forEach(function(b){b.classList.remove('active')});tg[0].classList.add('active');
    if(id){
        document.getElementById('sfTitle').textContent='Edit Sale';
        var s=await dbGet('sales',id);if(s){
            document.getElementById('sfId').value=s.id;
            document.getElementById('sfCustomerId').value=s.customerId;
            document.getElementById('sfCustomerName').value=s.customerName;
            document.getElementById('sfCustLabel').textContent=s.customerName+' (₹'+s.rate+')';
            document.getElementById('sfCustBtn').classList.add('selected');
            document.getElementById('sfRate').value=s.rate;
            document.getElementById('sfQty').value=s.quantity;
            document.getElementById('sfPay').value=s.paymentType;
            calcSaleTotal();
            tg.forEach(function(b){b.classList.remove('active')});
            if(s.paymentType==='cash')tg[0].classList.add('active');
            else if(s.paymentType==='upi')tg[1].classList.add('active');
            else tg[2].classList.add('active');
        }
    }else document.getElementById('sfTitle').textContent='New Sale';
    openOverlay('saleFormOverlay');
}
function onSaleCustomerSelect(){}
function calcSaleTotal(){
    var r=parseFloat(document.getElementById('sfRate').value)||0;
    var q=parseInt(document.getElementById('sfQty').value)||0;
    document.getElementById('sfTotal').textContent='₹'+(r*q);
}
function setPayType(hid,val,btn){
    document.getElementById(hid).value=val;
    btn.parentElement.querySelectorAll('.tgl').forEach(function(b){b.classList.remove('active')});
    btn.classList.add('active');
}
async function saveSale(e){
    e.preventDefault();
    var cid=parseInt(document.getElementById('sfCustomerId').value);
    var cname=document.getElementById('sfCustomerName').value;
    if(!cid||!cname){showToast('❌ Customer select karein!','error');return}
    var r=parseFloat(document.getElementById('sfRate').value);
    var q=parseInt(document.getElementById('sfQty').value);
    if(!r||!q){showToast('❌ Rate aur Quantity daalein!','error');return}
    var data={customerId:cid,customerName:cname,date:document.getElementById('salesDate').value||todayStr(),rate:r,quantity:q,total:r*q,paymentType:document.getElementById('sfPay').value,updatedAt:new Date().toISOString()};
    var idV=document.getElementById('sfId').value;
    if(idV){data.id=parseInt(idV);var ex=await dbGet('sales',data.id);data.createdAt=ex.createdAt;await dbPut('sales',data);showToast('✅ Sale updated!')}
    else{data.createdAt=new Date().toISOString();await dbAdd('sales',data);showToast('✅ '+cname+' - '+q+' roti saved!')}
    closeOverlay('saleFormOverlay');loadSales();
}
function renderSales(sales){
    var ct=document.getElementById('salesList');
    if(!sales.length){ct.innerHTML='<div class="empty"><div class="empty-ic">🫓</div><h3>Koi Sale Nahi</h3><p>Is din ki koi sale nahi</p><button class="empty-btn" onclick="openSaleForm()">+ Add</button></div>';return}
    var h='';sales.forEach(function(s,i){
        var pb=payBdg(s.paymentType);
        h+='<div class="sale-card" style="animation-delay:'+(i*.04)+'s"><div class="sl-top"><div class="sl-name">'+esc(s.customerName)+'</div><div class="sl-amt">₹'+s.total+'</div></div><div class="sl-badges"><span class="sl-b slb-q">'+s.quantity+' roti</span><span class="sl-b slb-r">₹'+s.rate+'/roti</span><span class="sl-b '+pb.c+'">'+pb.t+'</span></div><div class="sl-foot"><span class="sl-time">'+getTime(s.createdAt)+'</span><div class="sl-acts"><button class="ic-btn ib-e" onclick="openSaleForm('+s.id+')">✏️</button><button class="ic-btn ib-d" onclick="confirmDelSale('+s.id+')">🗑️</button></div></div></div>';
    });ct.innerHTML=h;
}
async function confirmDelSale(id){var s=await dbGet('sales',id);if(!s)return;showConfirm('🗑️','Delete Sale?',s.customerName+' - '+s.quantity+' roti delete?',async function(){await dbDel('sales',id);showToast('✅ Deleted!');loadSales()})}

// ============ EXPENSES ============
async function loadExps(){
    var date=document.getElementById('expDate').value;if(!date)return;
    var all=await dbByIdx('expenses','date',date);
    var total=0;all.forEach(function(x){total+=x.amount});
    document.getElementById('eTotal').textContent='₹'+total;
    document.getElementById('eCount').textContent=all.length;
    renderExps(all);
}
function loadExpForDate(){loadExps()}
function changeExpDate(off){var inp=document.getElementById('expDate');var nd=dateShift(inp.value,off);if(nd){inp.value=nd;loadExps()}}

async function openExpenseForm(id){
    document.getElementById('expForm').reset();
    document.getElementById('efId').value='';document.getElementById('efCat').value='atta';
    document.getElementById('efPay').value='cash';document.getElementById('efDetailGrp').style.display='none';
    document.getElementById('efWeightGrp').style.display='block';document.getElementById('efRateInfo').style.display='none';
    document.querySelectorAll('.cat').forEach(function(b){b.classList.remove('active')});
    document.querySelectorAll('.cat')[0].classList.add('active');
    var tg=document.querySelectorAll('#expForm .tgl');tg.forEach(function(b){b.classList.remove('active')});tg[0].classList.add('active');
    if(id){
        document.getElementById('efTitle').textContent='Edit Kharcha';
        var x=await dbGet('expenses',id);if(x){
            document.getElementById('efId').value=x.id;document.getElementById('efCat').value=x.category;
            document.getElementById('efDetail').value=x.detail||'';document.getElementById('efWeight').value=x.weight||'';
            document.getElementById('efAmount').value=x.amount;document.getElementById('efPay').value=x.paymentType||'cash';
            setExpCatUI(x.category);
            document.querySelectorAll('.cat').forEach(function(b){b.classList.remove('active');
                if(b.textContent.toLowerCase().indexOf(x.category)!==-1||(x.category==='oil'&&b.textContent.indexOf('Oil')!==-1)||(x.category==='poly'&&b.textContent.indexOf('Poly')!==-1))b.classList.add('active')});
            tg.forEach(function(b){b.classList.remove('active')});
            if(x.paymentType==='upi')tg[1].classList.add('active');else tg[0].classList.add('active');
            showLastRate(x.category);
        }
    }else{document.getElementById('efTitle').textContent='New Kharcha';showLastRate('atta')}
    openOverlay('expFormOverlay');
}
function setExpCat(cat,btn){
    document.getElementById('efCat').value=cat;
    document.querySelectorAll('.cat').forEach(function(b){b.classList.remove('active')});
    btn.classList.add('active');setExpCatUI(cat);showLastRate(cat);
}
function setExpCatUI(cat){
    document.getElementById('efDetailGrp').style.display=cat==='other'?'block':'none';
    document.getElementById('efWeightGrp').style.display=(cat==='atta'||cat==='oil')?'block':'none';
}
async function showLastRate(cat){
    var ri=document.getElementById('efRateInfo');
    if(cat!=='atta'&&cat!=='oil'){ri.style.display='none';return}
    var all=await dbByIdx('expenses','category',cat);
    all=all.filter(function(x){return x.weight&&x.weight>0});
    all.sort(function(a,b){return a.date>b.date?1:-1});
    if(!all.length){ri.style.display='none';return}
    var last=all[all.length-1];var lr=(last.amount/last.weight).toFixed(1);
    var msg='📊 Last: Rs.'+lr+'/kg ('+last.weight+'kg = Rs.'+last.amount+') on '+fmtDate(last.date);
    if(all.length>=2){
        var prev=all[all.length-2];var pr=(prev.amount/prev.weight);
        var ch=(((last.amount/last.weight)-pr)/pr*100).toFixed(1);
        if(ch>0){msg+='\n⬆️ '+ch+'% price INCREASE (was Rs.'+(pr).toFixed(1)+'/kg)';ri.className='rate-box up'}
        else if(ch<0){msg+='\n⬇️ '+Math.abs(ch)+'% price decrease (was Rs.'+(pr).toFixed(1)+'/kg)';ri.className='rate-box down'}
        else{msg+='\n➡️ Same price';ri.className='rate-box neutral'}
    }else ri.className='rate-box neutral';
    ri.textContent=msg;ri.style.whiteSpace='pre-line';ri.style.display='block';
}
function calcExpRate(){var cat=document.getElementById('efCat').value;if(cat==='atta'||cat==='oil')showLastRate(cat)}
async function saveExpense(e){
    e.preventDefault();var cat=document.getElementById('efCat').value;
    var amt=parseFloat(document.getElementById('efAmount').value);
    if(!amt){showToast('❌ Amount daalein!','error');return}
    var data={category:cat,detail:document.getElementById('efDetail').value.trim(),weight:parseFloat(document.getElementById('efWeight').value)||null,amount:amt,paymentType:document.getElementById('efPay').value,date:document.getElementById('expDate').value||todayStr(),updatedAt:new Date().toISOString()};
    var idV=document.getElementById('efId').value;
    if(idV){data.id=parseInt(idV);var ex=await dbGet('expenses',data.id);data.createdAt=ex.createdAt;await dbPut('expenses',data);showToast('✅ Updated!')}
    else{data.createdAt=new Date().toISOString();await dbAdd('expenses',data);showToast('✅ '+catNm(cat)+' Rs.'+amt+' saved!')}
    closeOverlay('expFormOverlay');loadExps();
}
function renderExps(exps){
    var ct=document.getElementById('expList');
    if(!exps.length){ct.innerHTML='<div class="empty"><div class="empty-ic">🛒</div><h3>Koi Kharcha Nahi</h3><p>Is din ka koi kharcha nahi</p><button class="empty-btn" onclick="openExpenseForm()">+ Add</button></div>';return}
    var h='';exps.forEach(function(x,i){
        var pb=payBdg(x.paymentType);var det='';
        if(x.weight)det=x.weight+'kg • Rs.'+(x.amount/x.weight).toFixed(1)+'/kg';
        else if(x.detail)det=x.detail;
        h+='<div class="exp-card" style="animation-delay:'+(i*.04)+'s"><div class="ex-top"><div class="ex-cat">'+catIc(x.category)+' '+catNm(x.category)+'</div><div class="ex-amt">-₹'+x.amount+'</div></div>'+(det?'<div class="ex-det">'+esc(det)+'</div>':'')+'<div class="ex-badges"><span class="sl-b '+pb.c+'">'+pb.t+'</span></div><div class="ex-foot"><span class="sl-time">'+getTime(x.createdAt)+'</span><div class="sl-acts"><button class="ic-btn ib-e" onclick="openExpenseForm('+x.id+')">✏️</button><button class="ic-btn ib-d" onclick="confirmDelExp('+x.id+')">🗑️</button></div></div></div>';
    });ct.innerHTML=h;
}
async function confirmDelExp(id){var x=await dbGet('expenses',id);if(!x)return;showConfirm('🗑️','Delete?',catNm(x.category)+' Rs.'+x.amount+' delete?',async function(){await dbDel('expenses',id);showToast('✅ Deleted!');loadExps()})}

// ============ UDHARI ============
async function loadUdhari(){
    var allS=await dbGetAll('sales'),allP=await dbGetAll('udhariPayments'),custs=await dbGetAll('customers');
    var cm={};custs.forEach(function(c){cm[c.id]={id:c.id,name:c.name,g:0,r:0}});
    allS.forEach(function(s){if(s.paymentType==='udhari'){if(!cm[s.customerId])cm[s.customerId]={id:s.customerId,name:s.customerName,g:0,r:0};cm[s.customerId].g+=s.total}});
    allP.forEach(function(p){if(cm[p.customerId])cm[p.customerId].r+=p.amount});
    var list=Object.values(cm).filter(function(c){return c.g>0});
    list.sort(function(a,b){return(b.g-b.r)-(a.g-a.r)});
    var tp=0;list.forEach(function(c){tp+=Math.max(0,c.g-c.r)});
    document.getElementById('uTotalPending').textContent='₹'+tp;
    var ct=document.getElementById('udhariList');
    if(!list.length){ct.innerHTML='<div class="empty"><div class="empty-ic">🎉</div><h3>Koi Udhari Nahi!</h3><p>Sab clear hai</p></div>';return}
    var h='';list.forEach(function(c,i){
        var p=Math.max(0,c.g-c.r);
        h+='<div class="u-card" style="animation-delay:'+(i*.04)+'s" onclick="openUdhariPay('+c.id+')"><div class="u-info"><div class="u-name">'+esc(c.name)+'</div><div class="u-sub">Total: ₹'+c.g+' • Paid: ₹'+c.r+'</div></div><div class="u-amt '+(p===0?'u-zero':'')+'">₹'+p+'</div></div>';
    });ct.innerHTML=h;
}
async function openUdhariPay(cid){
    var cust=await dbGet('customers',cid);var allS=await dbGetAll('sales');
    var allP=await dbByIdx('udhariPayments','customerId',cid);
    var g=0;allS.forEach(function(s){if(s.paymentType==='udhari'&&s.customerId===cid)g+=s.total});
    var r=0;allP.forEach(function(p){r+=p.amount});var p=Math.max(0,g-r);
    var name=cust?cust.name:'Customer';
    document.getElementById('upTitle').textContent=name;
    document.getElementById('upCustId').value=cid;document.getElementById('upCustName').value=name;
    document.getElementById('upAmount').value='';document.getElementById('upPay').value='cash';
    var tg=document.querySelectorAll('#upForm .tgl');tg.forEach(function(b){b.classList.remove('active')});tg[0].classList.add('active');
    document.getElementById('upDetail').innerHTML='<div class="ud-row"><span class="ud-label">Total Udhari</span><span class="ud-val">₹'+g+'</span></div><div class="ud-row"><span class="ud-label">Paid</span><span class="ud-val green">₹'+r+'</span></div><div class="ud-row"><span class="ud-label">Baaki</span><span class="ud-val amber">₹'+p+'</span></div>';
    var hDiv=document.getElementById('upHistory');
    if(!allP.length)hDiv.innerHTML='<div class="no-data">Koi payment nahi mili</div>';
    else{var h='';allP.slice().reverse().forEach(function(p){
        h+='<div class="aw-item"><span class="aw-item-n">'+fmtDate(p.date)+'</span><span class="aw-item-v inc">+₹'+p.amount+' '+(p.paymentType==='upi'?'📱':'💵')+'</span></div>';
    });hDiv.innerHTML='<div class="aw-card" style="margin:0">'+h+'</div>'}
    openOverlay('udhariPayOverlay');
}
async function saveUdhariPayment(e){
    e.preventDefault();var amt=parseFloat(document.getElementById('upAmount').value);
    if(!amt||amt<1){showToast('❌ Amount daalein!','error');return}
    await dbAdd('udhariPayments',{customerId:parseInt(document.getElementById('upCustId').value),customerName:document.getElementById('upCustName').value,amount:amt,paymentType:document.getElementById('upPay').value,date:todayStr(),createdAt:new Date().toISOString()});
    showToast('✅ Rs.'+amt+' payment saved!');closeOverlay('udhariPayOverlay');loadUdhari();
}

// ============ REPORTS ============
function switchReport(type,btn){curReport=type;document.querySelectorAll('.rp-t').forEach(function(t){t.classList.remove('active')});btn.classList.add('active');loadReport()}
function changeReportDate(off){
    var inp=document.getElementById('reportDate');var d=new Date(inp.value);
    if(curReport==='daily')d.setDate(d.getDate()+off);
    else if(curReport==='weekly')d.setDate(d.getDate()+(off*7));
    else d.setMonth(d.getMonth()+off);
    var t=new Date();t.setHours(0,0,0,0);if(d>t)return;
    inp.value=d.getFullYear()+'-'+S(d.getMonth()+1)+'-'+S(d.getDate());loadReport();
}
var rptData={};
async function loadReport(){
    var date=document.getElementById('reportDate').value;if(!date)return;
    var allS=await dbGetAll('sales'),allE=await dbGetAll('expenses'),allP=await dbGetAll('udhariPayments');
    var sd,ed,title;var d=new Date(date);
    if(curReport==='daily'){sd=ed=date;title='Daily Report • '+fmtDateLong(date)}
    else if(curReport==='weekly'){
        var dy=d.getDay();var mon=new Date(d);mon.setDate(d.getDate()-(dy===0?6:dy-1));
        var sun=new Date(mon);sun.setDate(mon.getDate()+6);
        sd=mon.getFullYear()+'-'+S(mon.getMonth()+1)+'-'+S(mon.getDate());
        ed=sun.getFullYear()+'-'+S(sun.getMonth()+1)+'-'+S(sun.getDate());
        title='Weekly: '+fmtDate(sd)+' - '+fmtDate(ed);
    }else{
        sd=d.getFullYear()+'-'+S(d.getMonth()+1)+'-01';
        var ld=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
        ed=d.getFullYear()+'-'+S(d.getMonth()+1)+'-'+S(ld);
        var mn=['January','February','March','April','May','June','July','August','September','October','November','December'];
        title=mn[d.getMonth()]+' '+d.getFullYear();
    }
    var fS=allS.filter(function(s){return s.date>=sd&&s.date<=ed});
    var fE=allE.filter(function(x){return x.date>=sd&&x.date<=ed});
    var fP=allP.filter(function(p){return p.date>=sd&&p.date<=ed});
    var tR=0,tI=0,tE=0,cI=0,uI=0,hI=0;var cS={};
    fS.forEach(function(s){tR+=s.quantity;tI+=s.total;if(s.paymentType==='cash')cI+=s.total;else if(s.paymentType==='upi')uI+=s.total;else hI+=s.total;if(!cS[s.customerName])cS[s.customerName]={r:0,a:0};cS[s.customerName].r+=s.quantity;cS[s.customerName].a+=s.total});
    var cE={};fE.forEach(function(x){tE+=x.amount;var cn=catNm(x.category);if(!cE[cn])cE[cn]=0;cE[cn]+=x.amount});
    var profit=tI-tE;var uRec=0;fP.forEach(function(p){uRec+=p.amount});
    rptData={title:title,sd:sd,ed:ed,tR:tR,tI:tI,tE:tE,profit:profit,cI:cI,uI:uI,hI:hI,uRec:uRec,cS:cS,cE:cE};

    var h='<div class="rp-card"><div class="rp-title">'+title+'</div></div>';
    h+='<div class="rp-card"><div class="rp-hero"><div class="rp-hero-v '+(profit>=0?'green':'red')+'">'+(profit>=0?'₹':'-₹')+Math.abs(profit)+'</div><div class="rp-hero-l">Net Profit</div></div></div>';
    h+='<div class="rp-card"><div class="rp-title">Summary</div>';
    [['Total Roti',tR,''],['Total Income','₹'+tI,'green'],['Cash','₹'+cI,''],['UPI','₹'+uI,''],['Udhari Given','₹'+hI,'amber'],['Udhari Recovered','₹'+uRec,'green'],['Total Kharcha','₹'+tE,'red'],['Net Profit',(profit>=0?'₹':'-₹')+Math.abs(profit),profit>=0?'green':'red']].forEach(function(r){
        h+='<div class="rp-row"><span class="rp-lbl">'+r[0]+'</span><span class="rp-val '+r[2]+'">'+r[1]+'</span></div>';
    });h+='</div>';

    var ca=Object.keys(cS);
    if(ca.length){h+='<div class="rp-card"><div class="rp-title">Customer Wise</div>';ca.sort(function(a,b){return cS[b].a-cS[a].a});ca.forEach(function(n){h+='<div class="rp-row"><span class="rp-lbl">'+esc(n)+' ('+cS[n].r+')</span><span class="rp-val">₹'+cS[n].a+'</span></div>'});h+='</div>'}

    var ea=Object.keys(cE);
    if(ea.length){h+='<div class="rp-card"><div class="rp-title">Kharcha Breakdown</div>';ea.sort(function(a,b){return cE[b]-cE[a]});ea.forEach(function(cn){var pct=tE>0?Math.round(cE[cn]/tE*100):0;h+='<div class="rp-row"><span class="rp-lbl">'+cn+' ('+pct+'%)</span><span class="rp-val red">₹'+cE[cn]+'</span></div>'});h+='</div>'}

    var aE=allE.filter(function(x){return x.category==='atta'&&x.weight>0});
    aE.sort(function(a,b){return a.date>b.date?1:-1});
    if(aE.length){h+='<div class="rp-card"><div class="rp-title">Atta Price History</div>';aE.slice(-8).reverse().forEach(function(x){h+='<div class="rp-row"><span class="rp-lbl">'+fmtDate(x.date)+' ('+x.weight+'kg)</span><span class="rp-val">Rs.'+(x.amount/x.weight).toFixed(1)+'/kg</span></div>'});h+='</div>'}
    document.getElementById('reportContent').innerHTML=h;
}

// ============ PDF ============
function generatePDF(){
    try{
        var jsPDF=window.jspdf.jsPDF;var doc=new jsPDF('p','mm','a4');
        var rd=rptData;if(!rd.title){showToast('❌ Pehle report load karein!','error');return}
        var W=210,mL=14,mR=14,cW=W-mL-mR;

        // Header
        doc.setFillColor(26,26,46);doc.rect(0,0,W,40,'F');
        doc.setFillColor(230,81,0);doc.rect(0,38,W,3,'F');
        doc.setTextColor(255,255,255);doc.setFontSize(20);doc.setFont('helvetica','bold');
        doc.text('MERI DUKAAN',mL,17);
        doc.setFontSize(9);doc.setFont('helvetica','normal');doc.text('Business Report',mL,23);
        doc.setFontSize(11);doc.setFont('helvetica','bold');doc.text(rd.title,mL,33);
        doc.setFontSize(7);doc.setFont('helvetica','normal');
        doc.text('Generated: '+new Date().toLocaleString(),W-mR,33,{align:'right'});

        var y=50;

        // Profit Box
        var pc=rd.profit>=0?[0,150,50]:[200,40,40];
        doc.setFillColor(pc[0],pc[1],pc[2]);doc.roundedRect(mL,y,cW,18,3,3,'F');
        doc.setTextColor(255,255,255);doc.setFontSize(9);doc.text('NET PROFIT',mL+8,y+8);
        doc.setFontSize(16);doc.setFont('helvetica','bold');
        doc.text('Rs. '+Math.abs(rd.profit)+(rd.profit<0?' (Loss)':''),W-mR-8,y+13,{align:'right'});
        y+=26;

        // Summary Table
        doc.setTextColor(26,26,46);doc.setFontSize(12);doc.setFont('helvetica','bold');
        doc.text('SUMMARY',mL,y);y+=3;

        doc.autoTable({
            startY:y,margin:{left:mL,right:mR},
            head:[['Item','Value']],
            body:[
                ['Total Roti Sold',rd.tR.toString()],
                ['Total Income','Rs. '+rd.tI],
                ['Cash Income','Rs. '+rd.cI],
                ['UPI Income','Rs. '+rd.uI],
                ['Udhari Given','Rs. '+rd.hI],
                ['Udhari Recovered','Rs. '+rd.uRec],
                ['Total Kharcha','Rs. '+rd.tE],
                ['Net Profit','Rs. '+(rd.profit>=0?'':'-')+Math.abs(rd.profit)]
            ],
            theme:'grid',
            headStyles:{fillColor:[230,81,0],textColor:255,fontStyle:'bold',fontSize:9},
            bodyStyles:{fontSize:9,textColor:[40,40,40]},
            alternateRowStyles:{fillColor:[255,248,240]},
            columnStyles:{0:{cellWidth:cW*0.6},1:{cellWidth:cW*0.4,halign:'right',fontStyle:'bold'}}
        });
        y=doc.lastAutoTable.finalY+10;

        // Customer Table
        var ca=Object.keys(rd.cS);
        if(ca.length){
            if(y>240){doc.addPage();y=20}
            doc.setFontSize(12);doc.setFont('helvetica','bold');doc.setTextColor(230,81,0);
            doc.text('CUSTOMER WISE SALES',mL,y);y+=3;
            ca.sort(function(a,b){return rd.cS[b].a-rd.cS[a].a});
            var cBody=ca.map(function(n){return[n,rd.cS[n].r.toString(),'Rs. '+rd.cS[n].a]});
            doc.autoTable({
                startY:y,margin:{left:mL,right:mR},
                head:[['Customer','Roti','Amount']],body:cBody,
                theme:'striped',
                headStyles:{fillColor:[26,26,46],textColor:255,fontStyle:'bold',fontSize:9},
                bodyStyles:{fontSize:9},
                alternateRowStyles:{fillColor:[240,242,245]},
                columnStyles:{0:{cellWidth:cW*0.45},1:{cellWidth:cW*0.2,halign:'center'},2:{cellWidth:cW*0.35,halign:'right',fontStyle:'bold'}}
            });
            y=doc.lastAutoTable.finalY+10;
        }

        // Expense Table
        var ea=Object.keys(rd.cE);
        if(ea.length){
            if(y>240){doc.addPage();y=20}
            doc.setFontSize(12);doc.setFont('helvetica','bold');doc.setTextColor(200,40,40);
            doc.text('KHARCHA BREAKDOWN',mL,y);y+=3;
            ea.sort(function(a,b){return rd.cE[b]-rd.cE[a]});
            var eBody=ea.map(function(cn){var pct=rd.tE>0?Math.round(rd.cE[cn]/rd.tE*100):0;return[cn,pct+'%','Rs. '+rd.cE[cn]]});
            doc.autoTable({
                startY:y,margin:{left:mL,right:mR},
                head:[['Category','%','Amount']],body:eBody,
                theme:'striped',
                headStyles:{fillColor:[200,40,40],textColor:255,fontStyle:'bold',fontSize:9},
                bodyStyles:{fontSize:9},
                alternateRowStyles:{fillColor:[255,245,245]},
                columnStyles:{0:{cellWidth:cW*0.45},1:{cellWidth:cW*0.2,halign:'center'},2:{cellWidth:cW*0.35,halign:'right',fontStyle:'bold'}}
            });
        }

        // Footer
        var pc2=doc.internal.getNumberOfPages();
        for(var i=1;i<=pc2;i++){
            doc.setPage(i);doc.setFillColor(245,245,245);doc.rect(0,287,W,10,'F');
            doc.setFontSize(7);doc.setTextColor(150,150,150);doc.setFont('helvetica','normal');
            doc.text('Meri Dukaan - Business Report',mL,292);
            doc.text('Page '+i+'/'+pc2,W-mR,292,{align:'right'});
        }

        doc.save('MeriDukaan_'+curReport+'_'+todayStr()+'.pdf');
        showToast('✅ PDF downloaded!');
    }catch(err){console.error('PDF:',err);showToast('❌ PDF error! Internet check karein','error')}
}

// ============ SETTINGS ============
function showChangePinUI(){
    document.getElementById('cpOld').value='';document.getElementById('cpNew').value='';
    document.getElementById('cpConfirm').value='';openOverlay('changePinOverlay');
}
function saveNewPin(e){
    e.preventDefault();var old=document.getElementById('cpOld').value;
    var nw=document.getElementById('cpNew').value;var cf=document.getElementById('cpConfirm').value;
    var sv='';try{sv=atob(localStorage.getItem('mdPin')||'')}catch(er){}
    if(old!==sv){showToast('❌ Purana PIN galat!','error');return}
    if(nw.length!==4){showToast('❌ 4 digit chahiye!','error');return}
    if(nw!==cf){showToast('❌ PIN match nahi!','error');return}
    localStorage.setItem('mdPin',btoa(nw));showToast('✅ PIN changed!');closeOverlay('changePinOverlay');
}

// ============ MULTI-DEVICE SYNC ============
async function getFullData(){
    return{
        app:'MeriDukaan',v:'3.0',
        customers:await dbGetAll('customers'),
        sales:await dbGetAll('sales'),
        expenses:await dbGetAll('expenses'),
        udhariPayments:await dbGetAll('udhariPayments'),
        exportDate:new Date().toISOString()
    };
}
async function exportData(){
    var data=await getFullData();
    var json=JSON.stringify(data);
    var blob=new Blob([json],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;
    a.download='MeriDukaan_Backup_'+todayStr()+'.json';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);showToast('✅ Backup downloaded!');
}
async function syncShare(){
    try{
        var data=await getFullData();
        var json=JSON.stringify(data);
        var blob=new Blob([json],{type:'application/json'});
        var file=new File([blob],'MeriDukaan_Sync_'+todayStr()+'.json',{type:'application/json'});
        if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
            await navigator.share({title:'Meri Dukaan Data',text:'Ye file doosre phone mein Import karo',files:[file]});
            showToast('✅ Shared!');
        }else{
            exportData();
            showToast('📤 File download hui - WhatsApp/Email se bhejein');
        }
    }catch(err){
        if(err.name!=='AbortError'){exportData();showToast('📤 File download hui - share karein')}
    }
}
async function importData(e){
    var file=e.target.files[0];if(!file)return;
    showConfirm('📥','Import Data?','Current data REPLACE ho jayega! Sure?',function(){
        var reader=new FileReader();
        reader.onload=async function(ev){
            try{
                var data=JSON.parse(ev.target.result);
                if(!data.customers&&!data.sales){showToast('❌ Invalid file!','error');return}
                await dbClear('customers');await dbClear('sales');await dbClear('expenses');await dbClear('udhariPayments');
                var stores=['customers','sales','expenses','udhariPayments'];
                for(var si=0;si<stores.length;si++){
                    var items=data[stores[si]]||[];
                    for(var j=0;j<items.length;j++){var it=Object.assign({},items[j]);delete it.id;await dbAdd(stores[si],it)}
                }
                showToast('✅ Data imported!');refreshDash();
            }catch(err){console.error(err);showToast('❌ Invalid file!','error')}
        };reader.readAsText(file);
    });e.target.value='';
}
function resetAllData(){
    showConfirm('🗑️','DELETE ALL?','Saara data permanently jayega! Backup liya?',async function(){
        await dbClear('customers');await dbClear('sales');await dbClear('expenses');await dbClear('udhariPayments');
        showToast('✅ All data deleted!');refreshDash();
    });
}
async function loadSyncInfo(){
    var cs=await dbGetAll('customers');var ss=await dbGetAll('sales');
    document.getElementById('syncInfo').innerHTML='<strong>📊 Current Data:</strong> '+cs.length+' customers, '+ss.length+' sales entries<br><br><strong>📱 Multi-Device Use:</strong><br>1. "Share Data" dabao → WhatsApp se bhejo<br>2. Doosre phone mein app kholo → Settings<br>3. "Import Data" se file select karo<br>4. Done! Dono phone mein same data!<br><br><strong>⚠️ Note:</strong> Import se purana data replace hota hai. Dono phones pe alag alag entry mat karo - ek phone mein karo, phir share karo.';
}

// ============ CONFIRM ============
var cfCb=null;
function showConfirm(ic,tt,msg,fn){
    document.getElementById('confirmIcon').textContent=ic;
    document.getElementById('confirmTitle').textContent=tt;
    document.getElementById('confirmMsg').textContent=msg;
    cfCb=fn;document.getElementById('confirmDialog').classList.add('active');
}
function hideConfirm(){document.getElementById('confirmDialog').classList.remove('active');cfCb=null}
function onConfirmYes(){if(cfCb)cfCb();hideConfirm()}

// ============ START ============
async function startApp(){
    try{
        await initDB();console.log('✅ Meri Dukaan v3.0 Ready');
        setTimeout(function(){
            if(localStorage.getItem('mdPinSet')==='1')goTo('pinLoginScreen');
            else goTo('pinSetupScreen');
        },1500);
    }catch(err){
        console.error(err);
        // If DB version conflict, delete and retry
        indexedDB.deleteDatabase('MeriDukaanDB');
        location.reload();
    }
}
startApp();