/* ================================================
   MERI DUKAAN v6.0 — DATA
   Dashboard · Quick Sale · Customers · Sales
   Expenses · Waste · Credit (Phase 0 Fixed)
   Phase 3: Debounced Search · Batch Delete
   Advance Credit Suggestion
   ================================================ */


// ============ FORM HELPERS ============
function setPayType(hid, val, btn) {
    var el=document.getElementById(hid); if(el) el.value=val;
    btn.parentElement.querySelectorAll('.tgl').forEach(function(b){ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
}
function setOrderType(t, btn) {
    document.getElementById('cfOrderType').value=t;
    document.querySelectorAll('#customerForm .tgl').forEach(function(b){ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
    document.getElementById('fixedQtyGroup').style.display=t==='fixed'?'block':'none';
    if(t!=='fixed') document.getElementById('cfQty').value='';
}
function setSaleType(type, btn) {
    document.getElementById('sfType').value=type;
    btn.parentElement.querySelectorAll('.tgl').forEach(function(b){ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
    document.getElementById('sfCustGroup').style.display=type==='regular'?'block':'none';
    document.getElementById('sfWalkinGroup').style.display=type==='walkin'?'block':'none';
    var warn=document.getElementById('sfDupWarn'); if(warn) warn.style.display='none';
    if(type==='walkin') {
        document.getElementById('sfRate').removeAttribute('readonly');
        document.getElementById('sfQty').value=''; document.getElementById('sfCustomerId').value=''; document.getElementById('sfCustomerName').value='';
        document.getElementById('sfRate').value=localStorage.getItem('mdLastWalkinRate')||'';
    } else { document.getElementById('sfRate').setAttribute('readonly','readonly'); }
    calcSaleTotal();
}
function setExpCat(cat, btn) {
    document.getElementById('efCat').value=cat;
    document.querySelectorAll('#expForm .cat').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active'); setExpCatUI(cat);
    if(typeof showLastRate==='function') showLastRate(cat);
}
function setExpCatUI(cat) {
    document.getElementById('efDetailGrp').style.display=cat==='other'?'block':'none';
    document.getElementById('efWeightGrp').style.display=(cat==='atta'||cat==='oil')?'block':'none';
}
function setWasteReason(reason, btn) {
    document.getElementById('wfReason').value=reason;
    document.querySelectorAll('#wasteForm .cat').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
}
function calcSaleTotal() {
    var r=parseFloat(document.getElementById('sfRate').value)||0;
    var q=parseInt(document.getElementById('sfQty').value)||0;
    var el=document.getElementById('sfTotal'); if(el) el.textContent='₹'+(r*q);
}


// ============ DASHBOARD ============
function setPeriod(period, btn) {
    currentPeriod=period;
    document.querySelectorAll('.pt').forEach(function(b){ b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected','true');
    refreshDash();
}
function refreshDash() {
    var now=new Date();
    var days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
    var dateEl=document.getElementById('todayDate');
    if(dateEl) dateEl.textContent=days[now.getDay()]+', '+now.getDate()+' '+months[now.getMonth()]+' '+now.getFullYear();
    var hr=now.getHours();
    var greetEl=document.getElementById('dashGreeting');
    if(greetEl) greetEl.textContent=hr<12?'Good Morning!':hr<17?'Good Afternoon!':'Good Evening!';

    var range=getDateRange(currentPeriod);
    var fs=dataInRange(allSales,range.start,range.end);
    var fe=dataInRange(allExpenses,range.start,range.end);
    var fw=dataInRange(allWaste,range.start,range.end);
    var roti=0,inc=0,exp=0,wasteQty=0;
    fs.forEach(function(s){ roti+=s.quantity; inc+=s.total; });
    fe.forEach(function(x){ exp+=x.amount; });
    fw.forEach(function(w){ wasteQty+=(w.quantity||0); });
    var profit=inc-exp;

    var el;
    el=document.getElementById('dRoti'); if(el) el.textContent=roti;
    el=document.getElementById('dIncome'); if(el) el.textContent='₹'+inc;
    el=document.getElementById('dExpense'); if(el) el.textContent='₹'+exp;
    var pEl=document.getElementById('dProfit');
    if(pEl){ pEl.textContent=(profit>=0?'₹':'-₹')+Math.abs(profit); pEl.className=profit>=0?'':'neg'; }
    el=document.getElementById('dWaste'); if(el) el.textContent=wasteQty;

    var creditByCust={};
    allSales.forEach(function(s){ if(s.paymentType==='credit'){ var key=s.customerId||'__walkin__'; if(!creditByCust[key]) creditByCust[key]={g:0,r:0}; creditByCust[key].g+=s.total; } });
    allCreditPayments.forEach(function(p){ var key=p.customerId||'__walkin__'; if(creditByCust[key]) creditByCust[key].r+=p.amount; });
    var tcp=0;
    Object.values(creditByCust).forEach(function(c){ tcp+=Math.max(0,c.g-c.r); });
    el=document.getElementById('dCredit'); if(el) el.textContent='₹'+tcp;

    var todaySalesList=salesForDate(todayStr());
    var rs=document.getElementById('recentSales');
    if(rs) {
        if(!todaySalesList.length) { rs.innerHTML='<div class="no-data">No sales today</div>'; }
        else {
            var h='';
            todaySalesList.slice(-5).reverse().forEach(function(s) {
                var pi=s.paymentType==='cash'?'💵':s.paymentType==='upi'?'📱':'💳';
                h+='<div class="aw-item"><span class="aw-item-n">'+esc(s.customerName||'Walk-in')+' ('+s.quantity+')</span><span class="aw-item-v inc">'+pi+' ₹'+s.total+'</span></div>';
            });
            rs.innerHTML=h;
        }
    }
    var todayExpsList=expensesForDate(todayStr());
    var re=document.getElementById('recentExp');
    if(re) {
        if(!todayExpsList.length) { re.innerHTML='<div class="no-data">No expenses today</div>'; }
        else {
            var h2='';
            todayExpsList.slice(-5).reverse().forEach(function(x){ h2+='<div class="aw-item"><span class="aw-item-n">'+catIc(x.category)+' '+catNm(x.category)+'</span><span class="aw-item-v exp">-₹'+x.amount+'</span></div>'; });
            re.innerHTML=h2;
        }
    }
    // Phase 3: Smart insights
    if(typeof renderSmartInsights==='function') renderSmartInsights();
}


// ============ QUICK SALE ============
function loadQuickSale() {
    var today=todayStr();
    var labelEl=document.getElementById('quickDateLabel'); if(labelEl) labelEl.textContent='📅 '+fmtDateLong(today);
    var todaySales=salesForDate(today); var saleMap={};
    todaySales.forEach(function(s){ if(s.customerId) saleMap[s.customerId]=s; });
    var pendingInputs={};
    allCustomers.forEach(function(c) {
        if(saleMap[c.id]) return;
        var qtyEl=document.getElementById('qq_'+c.id), payEl=document.getElementById('qp_'+c.id);
        if(qtyEl&&qtyEl.value) pendingInputs[c.id]={qty:qtyEl.value,pay:payEl?payEl.getAttribute('data-pay'):'cash'};
    });
    var doneCount=0,pendingCount=0,totalAmt=0;
    todaySales.forEach(function(s){ totalAmt+=s.total; });
    allCustomers.forEach(function(c){ if(saleMap[c.id]) doneCount++; else pendingCount++; });
    var el;
    el=document.getElementById('qsDone'); if(el) el.textContent=doneCount;
    el=document.getElementById('qsPending'); if(el) el.textContent=pendingCount;
    el=document.getElementById('qsTotal'); if(el) el.textContent='₹'+totalAmt;
    var listEl=document.getElementById('quickSaleList'); if(!listEl) return;
    if(!allCustomers.length) { listEl.innerHTML='<div class="empty"><div class="empty-ic">👥</div><h3>No Customers</h3><p>Add customers first to use Quick Sale</p><button class="empty-btn" onclick="goTo(\'customerScreen\')">Add Customer</button></div>'; return; }
    var h='';
    allCustomers.forEach(function(c,i) {
        var isDone=!!saleMap[c.id]; var sale=saleMap[c.id];
        var isFixed=c.orderType==='fixed'; var qty=isDone?sale.quantity:(isFixed?c.fixedQty:'');
        var amt=isDone?sale.total:(qty?qty*c.rate:0);
        h+='<div class="quick-row'+(isDone?' done':'')+'" style="animation-delay:'+(i*0.03)+'s">';
        h+='<div class="qr-info"><div class="qr-name">'+esc(c.name)+'</div>';
        h+='<div class="qr-details">'+(isFixed?'📋 Fixed • '+c.fixedQty+' roti':'🔄 Variable')+'</div>';
        h+='<div class="qr-rate">₹'+c.rate+'/roti</div></div>';
        if(isDone) {
            h+='<div class="qr-amt">₹'+amt+'</div><button class="qr-status" disabled aria-label="Completed">✅</button>';
        } else {
            h+='<input type="number" class="qr-qty" id="qq_'+c.id+'" value="'+(qty||'')+'" '+(isFixed?'':'placeholder="Qty"')+' min="1" inputmode="numeric" data-cid="'+c.id+'" data-rate="'+c.rate+'" oninput="quickCalcAmt(this)">';
            h+='<button class="qr-pay" id="qp_'+c.id+'" data-pay="cash" data-cid="'+c.id+'" onclick="cycleQuickPay(this)" aria-label="Payment">💵</button>';
            h+='<div class="qr-amt" id="qa_'+c.id+'">₹'+amt+'</div>';
            h+='<button class="qr-status" data-cid="'+c.id+'" data-rate="'+c.rate+'" onclick="quickSaveSaleBtn(this)" aria-label="Save sale for '+esc(c.name)+'">💾</button>';
        }
        h+='</div>';
    });
    listEl.innerHTML=h;
    Object.keys(pendingInputs).forEach(function(cid) {
        var saved=pendingInputs[cid];
        var qtyEl=document.getElementById('qq_'+cid), payEl=document.getElementById('qp_'+cid), amtEl=document.getElementById('qa_'+cid);
        if(qtyEl){ qtyEl.value=saved.qty; var c=findInArray(allCustomers,cid); if(c&&amtEl) amtEl.textContent='₹'+(parseInt(saved.qty)*c.rate); }
        if(payEl){ payEl.setAttribute('data-pay',saved.pay); payEl.textContent=saved.pay==='cash'?'💵':saved.pay==='upi'?'📱':'💳'; }
    });
}
function quickCalcAmt(el) {
    var rate=parseFloat(el.getAttribute('data-rate'))||0, qty=parseInt(el.value)||0;
    var amtEl=document.getElementById('qa_'+el.getAttribute('data-cid'));
    if(amtEl) amtEl.textContent='₹'+(qty*rate);
}
function cycleQuickPay(btn) {
    var cur=btn.getAttribute('data-pay'), next, icon;
    if(cur==='cash'){next='upi';icon='📱';}else if(cur==='upi'){next='credit';icon='💳';}else{next='cash';icon='💵';}
    btn.setAttribute('data-pay',next); btn.textContent=icon;
}
function quickSaveSaleBtn(btn) {
    var cid=btn.getAttribute('data-cid'), rate=parseFloat(btn.getAttribute('data-rate'))||0;
    var cust=findInArray(allCustomers,cid); if(!cust){showToast('❌ Customer not found','error');return;}
    quickSaveSale(cid,cust.name,rate,btn);
}
async function quickSaveSale(custId, custName, rate, btn) {
    var qtyEl=document.getElementById('qq_'+custId); var qty=parseInt(qtyEl?qtyEl.value:0)||0;
    if(qty<1){showToast('❌ Enter quantity!','error');return;}
    var payBtn=document.getElementById('qp_'+custId); var payType=payBtn?payBtn.getAttribute('data-pay'):'cash';
    if(btn){btn.disabled=true;btn.textContent='⏳';}
    try {
        await fsAdd('sales',{customerId:custId,customerName:custName,date:todayStr(),rate:rate,quantity:qty,total:rate*qty,paymentType:payType,saleType:'regular',source:'quick'});
        showToast('✅ '+custName+' — '+qty+' roti saved!');
    } catch(err) { console.error('[QuickSale]',err); showToast('❌ Error saving','error'); if(btn){btn.disabled=false;btn.textContent='💾';} }
}
async function markAllFixedDone() {
    var today=todayStr(); var todaySales=salesForDate(today); var saleMap={};
    todaySales.forEach(function(s){ if(s.customerId) saleMap[s.customerId]=true; });
    var pending=allCustomers.filter(function(c){ return c.orderType==='fixed'&&c.fixedQty>0&&!saleMap[c.id]; });
    if(!pending.length){showToast('✅ All fixed orders already done!');return;}
    showConfirm('✅','Mark All Done?',pending.length+' fixed orders will be saved as Cash.',async function() {
        var qaBtn=document.querySelector('.qa-btn'); if(qaBtn){qaBtn.disabled=true;qaBtn.textContent='⏳ Saving...';}
        try {
            for(var i=0;i<pending.length;i++){var c=pending[i];await fsAdd('sales',{customerId:c.id,customerName:c.name,date:today,rate:c.rate,quantity:c.fixedQty,total:c.rate*c.fixedQty,paymentType:'cash',saleType:'regular',source:'quick'});}
            showToast('✅ '+pending.length+' orders saved!');
        } catch(err){console.error('[MarkAll]',err);showToast('❌ Error saving orders','error');}
        finally{if(qaBtn){qaBtn.disabled=false;qaBtn.textContent='✅ Mark All Fixed as Done';}}
    });
}


// ============ CUSTOMERS ============
function loadCusts() {
    var countEl=document.getElementById('custCount');
    if(countEl) countEl.textContent=allCustomers.length+' Customer'+(allCustomers.length!==1?'s':'');
    var ct=document.getElementById('customerList'); if(!ct) return;
    if(!allCustomers.length){
        ct.innerHTML='<div class="empty"><div class="empty-ic">👥</div><h3>No Customers</h3><p>Add your first customer to start tracking</p><button class="empty-btn" onclick="openCustomerForm()">+ Add Customer</button></div>';
        return;
    }
    var h='';
    allCustomers.forEach(function(c,i) {
        var tt=c.orderType==='fixed'?'📋 Fixed: '+c.fixedQty+'/day':'🔄 Variable';
        var tc=c.orderType==='fixed'?'cb-f':'cb-v';
        h+='<div class="c-card" style="animation-delay:'+(i*0.04)+'s" onclick="openCustomerProfile(\''+c.id+'\')" role="button" tabindex="0" aria-label="View '+esc(c.name)+' profile">';
        h+='<div class="c-info"><div class="c-name">'+esc(c.name)+'</div>';
        h+='<div class="c-dets"><span class="c-b cb-r">₹'+c.rate+'/roti</span><span class="c-b '+tc+'">'+tt+'</span></div>';
        if(c.phone) h+='<div class="c-ph">📱 '+esc(c.phone)+'</div>';
        h+='</div>';
        if(canModify()){
            h+='<div class="c-acts">';
            h+='<button class="ic-btn ib-e" onclick="event.stopPropagation();openCustomerForm(\''+c.id+'\')" aria-label="Edit '+esc(c.name)+'">✏️</button>';
            h+='<button class="ic-btn ib-d" onclick="event.stopPropagation();confirmDelCust(\''+c.id+'\')" aria-label="Delete '+esc(c.name)+'">🗑️</button>';
            h+='</div>';
        }
        h+='</div>';
    });
    ct.innerHTML=h;
}
function openCustomerForm(id) {
    var form=document.getElementById('customerForm'); if(form) form.reset();
    document.getElementById('cfId').value=''; document.getElementById('cfOrderType').value='fixed'; document.getElementById('fixedQtyGroup').style.display='block';
    var tg=document.querySelectorAll('#customerForm .tgl');
    tg.forEach(function(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');}); if(tg[0]){tg[0].classList.add('active');tg[0].setAttribute('aria-pressed','true');}
    if(id) {
        document.getElementById('cfTitle').textContent='Edit Customer';
        var c=findInArray(allCustomers,id);
        if(c){
            document.getElementById('cfId').value=c.id; document.getElementById('cfName').value=c.name; document.getElementById('cfRate').value=c.rate; document.getElementById('cfPhone').value=c.phone||''; document.getElementById('cfOrderType').value=c.orderType||'fixed'; document.getElementById('cfQty').value=c.fixedQty||'';
            tg.forEach(function(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');});
            if(c.orderType==='variable'){if(tg[1]){tg[1].classList.add('active');tg[1].setAttribute('aria-pressed','true');}document.getElementById('fixedQtyGroup').style.display='none';}
            else{if(tg[0]){tg[0].classList.add('active');tg[0].setAttribute('aria-pressed','true');}}
        }
    } else { document.getElementById('cfTitle').textContent='New Customer'; }
    openOverlay('customerFormOverlay');
}
async function saveCustomer(e) {
    e.preventDefault();
    var n=document.getElementById('cfName').value.trim(), r=parseFloat(document.getElementById('cfRate').value);
    var ot=document.getElementById('cfOrderType').value, fq=ot==='fixed'?parseInt(document.getElementById('cfQty').value):null;
    if(!n){showToast('❌ Enter customer name!','error');return;}
    if(!r||r<=0){showToast('❌ Rate must be positive!','error');return;}
    if(ot==='fixed'&&(!fq||fq<1)){showToast('❌ Enter daily roti count!','error');return;}
    var data={name:n,rate:r,phone:document.getElementById('cfPhone').value.trim(),orderType:ot,fixedQty:fq};
    var btn=document.getElementById('cfSubmitBtn'); btnLoading(btn,true);
    try {
        var idV=document.getElementById('cfId').value;
        if(idV){await fsUpdate('customers',idV,data);showToast('✅ '+n+' updated!');}
        else{await fsAdd('customers',data);showToast('✅ '+n+' added!');}
        closeOverlay('customerFormOverlay');
    }catch(err){console.error('[Customer]',err);showToast('❌ Error saving customer','error');}
    finally{btnLoading(btn,false);}
}
function confirmDelCust(id) {
    if(!canModify()){showToast('❌ Staff cannot delete','error');return;}
    var c=findInArray(allCustomers,id); if(!c) return;
    showConfirm('🗑️','Delete Customer?','Delete "'+c.name+'"? This cannot be undone.',async function(){
        try{await fsDelete('customers',id);showToast('✅ '+c.name+' deleted!');}
        catch(err){showToast('❌ Error deleting','error');}
    });
}


// ============ SALES ============
// Phase 3: Batch delete state
var _batchSelected = {};
var _batchMode = false;

function enterBatchMode() {
    _batchMode=true; _batchSelected={};
    var toolbar=document.getElementById('batchToolbar'); if(toolbar) toolbar.classList.add('active');
    var btn=document.getElementById('batchBtn'); if(btn){btn.textContent='Cancel';btn.onclick=exitBatchMode;}
    loadSales(); // re-render with checkboxes
}
function exitBatchMode() {
    _batchMode=false; _batchSelected={};
    var toolbar=document.getElementById('batchToolbar'); if(toolbar) toolbar.classList.remove('active');
    var btn=document.getElementById('batchBtn'); if(btn){btn.textContent='Select';btn.onclick=enterBatchMode;}
    var cntEl=document.getElementById('batchCount'); if(cntEl) cntEl.textContent='0 selected';
    loadSales();
}
function toggleSaleSelect(id) {
    if(_batchSelected[id]) delete _batchSelected[id]; else _batchSelected[id]=true;
    var count=Object.keys(_batchSelected).length;
    var cntEl=document.getElementById('batchCount'); if(cntEl) cntEl.textContent=count+' selected';
    var delBtn=document.getElementById('batchDeleteBtn'); if(delBtn) delBtn.disabled=count===0;
    // Update card visual
    var card=document.querySelector('[data-sid="'+id+'"]'); if(card) card.classList.toggle('sale-selected',!!_batchSelected[id]);
}
function selectAllSales() {
    var date=document.getElementById('salesDate').value; if(!date) return;
    var all=salesForDate(date);
    all.forEach(function(s){ _batchSelected[s.id]=true; });
    var count=Object.keys(_batchSelected).length;
    var cntEl=document.getElementById('batchCount'); if(cntEl) cntEl.textContent=count+' selected';
    var delBtn=document.getElementById('batchDeleteBtn'); if(delBtn) delBtn.disabled=count===0;
    loadSales();
}
function batchDeleteSelected() {
    var ids=Object.keys(_batchSelected);
    if(!ids.length){showToast('Koi sale select nahi ki','error');return;}
    showConfirm('🗑️','Delete '+ids.length+' Sales?','Ye '+ids.length+' sales permanently delete hongi. Undo nahi hoga.',async function(){
        try {
            showToast('⏳ Deleting...','success');
            for(var i=0;i<ids.length;i++) await fsDelete('sales',ids[i]);
            showToast('✅ '+ids.length+' sales deleted!');
            exitBatchMode();
        } catch(err){console.error('[BatchDel]',err);showToast('❌ Error deleting','error');}
    });
}

function changeSalesDate(off) {
    var cv=document.getElementById('salesDate').value, nd=dateShift(cv,off);
    if(nd){setDateInput('salesDate',nd);updateDateBtn('salesDateBtn',nd);clearSearch('salesSearch');if(_batchMode)exitBatchMode();loadSales();}
}
function loadSales() {
    var date=document.getElementById('salesDate').value; if(!date) return;
    var all=salesForDate(date);
    var roti=0,inc=0,cash=0,cred=0;
    all.forEach(function(s){roti+=s.quantity;inc+=s.total;if(s.paymentType==='credit')cred+=s.total;else cash+=s.total;});
    var el;
    el=document.getElementById('sRoti');if(el)el.textContent=roti;
    el=document.getElementById('sIncome');if(el)el.textContent='₹'+inc;
    el=document.getElementById('sCash');if(el)el.textContent='₹'+cash;
    el=document.getElementById('sCredit');if(el)el.textContent='₹'+cred;
    renderSales(all);
}
var _filterSalesDebounced=null;
function filterSales(query) {
    if(!_filterSalesDebounced) _filterSalesDebounced=debounce(function(q){
        var date=document.getElementById('salesDate').value; if(!date) return;
        var all=salesForDate(date);
        if(q&&q.trim()){var ql=q.toLowerCase();all=all.filter(function(s){return(s.customerName||'Walk-in').toLowerCase().indexOf(ql)!==-1;});}
        renderSales(all);
    },280);
    _filterSalesDebounced(query);
}
function openSaleForm(id) {
    var form=document.getElementById('saleForm'); if(form) form.reset();
    document.getElementById('sfId').value=''; document.getElementById('sfCustomerId').value=''; document.getElementById('sfCustomerName').value='';
    document.getElementById('sfCustLabel').textContent='-- Select Customer --'; document.getElementById('sfCustBtn').classList.remove('selected');
    document.getElementById('sfType').value='regular'; document.getElementById('sfPay').value='cash'; document.getElementById('sfTotal').textContent='₹0';
    document.getElementById('sfRate').value=''; document.getElementById('sfQty').value='';
    document.getElementById('sfCustGroup').style.display='block'; document.getElementById('sfWalkinGroup').style.display='none';
    document.getElementById('sfWalkinName').value=''; document.getElementById('sfRate').setAttribute('readonly','readonly');
    var warn=document.getElementById('sfDupWarn'); if(warn) warn.style.display='none';
    var advBanner=document.getElementById('sfAdvanceBanner'); if(advBanner) advBanner.style.display='none';
    document.querySelectorAll('#saleForm .tgl-row').forEach(function(row){
        var btns=row.querySelectorAll('.tgl'); btns.forEach(function(b,i){b.classList.toggle('active',i===0);b.setAttribute('aria-pressed',i===0?'true':'false');});
    });
    if(id){
        document.getElementById('sfTitle').textContent='Edit Sale';
        var s=findInArray(allSales,id);
        if(s){
            document.getElementById('sfId').value=s.id; document.getElementById('sfRate').value=s.rate; document.getElementById('sfQty').value=s.quantity; document.getElementById('sfPay').value=s.paymentType;
            if(s.saleType==='walkin'){
                document.getElementById('sfType').value='walkin'; document.getElementById('sfCustGroup').style.display='none'; document.getElementById('sfWalkinGroup').style.display='block'; document.getElementById('sfWalkinName').value=s.customerName||''; document.getElementById('sfRate').removeAttribute('readonly');
                var typeTgls=document.querySelectorAll('#saleForm .tgl-row')[0].querySelectorAll('.tgl'); typeTgls.forEach(function(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');}); if(typeTgls[1]){typeTgls[1].classList.add('active');typeTgls[1].setAttribute('aria-pressed','true');}
            } else {
                document.getElementById('sfCustomerId').value=s.customerId; document.getElementById('sfCustomerName').value=s.customerName; document.getElementById('sfCustLabel').textContent=s.customerName+' (₹'+s.rate+')'; document.getElementById('sfCustBtn').classList.add('selected');
            }
            calcSaleTotal();
            var payTgls=document.querySelectorAll('#saleForm .tgl3 .tgl'); payTgls.forEach(function(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');}); var payIdx=s.paymentType==='cash'?0:s.paymentType==='upi'?1:2; if(payTgls[payIdx]){payTgls[payIdx].classList.add('active');payTgls[payIdx].setAttribute('aria-pressed','true');}
        }
    } else { document.getElementById('sfTitle').textContent='New Sale'; }
    openOverlay('saleFormOverlay');
}

// Phase 3: Advance notice when customer selected
function showAdvanceNotice(cid) {
    var advBanner=document.getElementById('sfAdvanceBanner'); if(!advBanner) return;
    var advance=getCustomerAdvance(cid); // positive = customer has advance
    if(advance>0) {
        advBanner.textContent='💚 Is customer ke paas ₹'+advance+' advance hai. Iski sale credit se adjust hogi.';
        advBanner.style.display='block';
    } else { advBanner.style.display='none'; }
}
function checkDuplicateSale(custId, custName) {
    var dateVal=document.getElementById('salesDate').value||todayStr();
    var existing=allSales.find(function(s){return s.customerId===custId&&s.date===dateVal;});
    var warn=document.getElementById('sfDupWarn'), warnText=document.getElementById('sfDupText');
    if(warn&&existing){warnText.textContent=esc(custName)+' already has '+existing.quantity+' roti sale today (₹'+existing.total+')';warn.style.display='block';}
    else if(warn){warn.style.display='none';}
}

async function saveSale(e) {
    e.preventDefault();
    var saleType=document.getElementById('sfType').value, cid=document.getElementById('sfCustomerId').value, cname=document.getElementById('sfCustomerName').value;
    var r=parseFloat(document.getElementById('sfRate').value), q=parseInt(document.getElementById('sfQty').value);
    if(saleType==='walkin'){cname=document.getElementById('sfWalkinName').value.trim()||'Walk-in';cid='';if(!r||r<=0){showToast('❌ Enter valid rate!','error');return;}}
    else{if(!cid||!cname){showToast('❌ Select customer!','error');return;}}
    if(!r||r<=0){showToast('❌ Rate must be positive!','error');return;}
    if(!q||q<1){showToast('❌ Quantity must be at least 1!','error');return;}
    var data={customerId:cid,customerName:cname,date:document.getElementById('salesDate').value||todayStr(),rate:r,quantity:q,total:r*q,paymentType:document.getElementById('sfPay').value,saleType:saleType};
    if(saleType==='walkin'&&r>0) localStorage.setItem('mdLastWalkinRate',r.toString());
    var btn=document.getElementById('sfSubmitBtn'); btnLoading(btn,true);
    try {
        var idV=document.getElementById('sfId').value;
        if(idV){await fsUpdate('sales',idV,data);showToast('✅ Sale updated!');}
        else{await fsAdd('sales',data);showToast('✅ '+cname+' — '+q+' roti saved!');}
        closeOverlay('saleFormOverlay');
    }catch(err){console.error('[Sale]',err);showToast('❌ Error saving sale','error');}
    finally{btnLoading(btn,false);}
}
function renderSales(sales) {
    var ct=document.getElementById('salesList'); if(!ct) return;
    if(!sales.length){
        var searchEl=document.getElementById('salesSearch'); var isSearching=searchEl&&searchEl.value.trim();
        ct.innerHTML='<div class="empty"><div class="empty-ic">🫓</div><h3>'+(isSearching?'No Results':'No Sales')+'</h3><p>'+(isSearching?'Try a different search':'No sales on this date')+'</p>'+(isSearching?'':'<button class="empty-btn" onclick="openSaleForm()">+ Add Sale</button>')+'</div>';
        return;
    }
    var h='';
    sales.forEach(function(s,i) {
        var pb=payBdg(s.paymentType); var isWalkin=s.saleType==='walkin'; var isSelected=_batchSelected[s.id];
        h+='<div class="sale-card'+(isWalkin?' walkin':'')+(isSelected?' sale-selected':'')+'" data-sid="'+s.id+'" style="animation-delay:'+(i*0.04)+'s">';
        if(_batchMode) h+='<input type="checkbox" class="batch-chk" '+(isSelected?'checked':'')+' onclick="toggleSaleSelect(\''+s.id+'\')" aria-label="Select sale">';
        h+='<div class="sl-top"><div class="sl-name">'+esc(s.customerName||'Walk-in')+'</div><div class="sl-amt">₹'+s.total+'</div></div>';
        h+='<div class="sl-badges"><span class="sl-b slb-q">'+s.quantity+' roti</span><span class="sl-b slb-r">₹'+s.rate+'/roti</span><span class="sl-b '+pb.c+'">'+pb.t+'</span>'+(isWalkin?'<span class="sl-b slb-w">🚶 Walk-in</span>':'')+'</div>';
        h+='<div class="sl-foot"><span class="sl-time">'+getTime(s.createdAt)+'</span>';
        if(canModify()&&!_batchMode){h+='<div class="sl-acts"><button class="ic-btn ib-e" onclick="openSaleForm(\''+s.id+'\')" aria-label="Edit">✏️</button><button class="ic-btn ib-d" onclick="confirmDelSale(\''+s.id+'\')" aria-label="Delete">🗑️</button></div>';}
        h+='</div></div>';
    });
    ct.innerHTML=h;
}
function confirmDelSale(id) {
    if(!canModify()){showToast('❌ Staff cannot delete','error');return;}
    var s=findInArray(allSales,id); if(!s) return;
    showConfirm('🗑️','Delete Sale?',(s.customerName||'Walk-in')+' — '+s.quantity+' roti (₹'+s.total+')?',async function(){
        try{await fsDelete('sales',id);showToast('✅ Sale deleted!');}
        catch(err){showToast('❌ Error deleting','error');}
    });
}


// ============ EXPENSES ============
function changeExpDate(off) {
    var cv=document.getElementById('expDate').value, nd=dateShift(cv,off);
    if(nd){setDateInput('expDate',nd);updateDateBtn('expDateBtn',nd);loadExps();}
}
function loadExps() {
    var date=document.getElementById('expDate').value; if(!date) return;
    var all=expensesForDate(date); var total=0; all.forEach(function(x){total+=x.amount;});
    var el; el=document.getElementById('eTotal');if(el)el.textContent='₹'+total; el=document.getElementById('eCount');if(el)el.textContent=all.length;
    renderExps(all);
}
function openExpenseForm(id) {
    var form=document.getElementById('expForm'); if(form) form.reset();
    document.getElementById('efId').value=''; document.getElementById('efCat').value='atta'; document.getElementById('efPay').value='cash';
    document.getElementById('efDetailGrp').style.display='none'; document.getElementById('efWeightGrp').style.display='block'; document.getElementById('efRateInfo').style.display='none';
    document.querySelectorAll('#expForm .cat').forEach(function(b){b.classList.remove('active');}); var firstCat=document.querySelectorAll('#expForm .cat')[0]; if(firstCat) firstCat.classList.add('active');
    var tg=document.querySelectorAll('#expForm .tgl'); tg.forEach(function(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');}); if(tg[0]){tg[0].classList.add('active');tg[0].setAttribute('aria-pressed','true');}
    if(id){
        document.getElementById('efTitle').textContent='Edit Expense';
        var x=findInArray(allExpenses,id);
        if(x){
            document.getElementById('efId').value=x.id; document.getElementById('efCat').value=x.category; document.getElementById('efDetail').value=x.detail||''; document.getElementById('efWeight').value=x.weight||''; document.getElementById('efAmount').value=x.amount; document.getElementById('efPay').value=x.paymentType||'cash'; setExpCatUI(x.category);
            var catMap={atta:0,oil:1,gas:2,poly:3,other:4}; document.querySelectorAll('#expForm .cat').forEach(function(b){b.classList.remove('active');}); var ci=catMap[x.category]; if(ci!==undefined){var catBtns=document.querySelectorAll('#expForm .cat');if(catBtns[ci])catBtns[ci].classList.add('active');}
            tg.forEach(function(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');}); var payIdx=x.paymentType==='upi'?1:0; if(tg[payIdx]){tg[payIdx].classList.add('active');tg[payIdx].setAttribute('aria-pressed','true');}
            showLastRate(x.category);
        }
    } else { document.getElementById('efTitle').textContent='New Expense'; showLastRate('atta'); }
    openOverlay('expFormOverlay');
}
function showLastRate(cat) {
    var ri=document.getElementById('efRateInfo'); if(!ri) return;
    if(cat!=='atta'&&cat!=='oil'){ri.style.display='none';return;}
    var all=allExpenses.filter(function(x){return x.category===cat&&x.weight&&x.weight>0;}).sort(function(a,b){return a.date>b.date?1:-1;});
    if(!all.length){ri.style.display='none';return;}
    var last=all[all.length-1]; var lr=(last.amount/last.weight).toFixed(1);
    var msg='📊 Last: ₹'+lr+'/kg ('+last.weight+'kg = ₹'+last.amount+') on '+fmtDate(last.date);
    if(all.length>=2){var prev=all[all.length-2];var ch=(((last.amount/last.weight)-(prev.amount/prev.weight))/(prev.amount/prev.weight)*100).toFixed(1);if(ch>0){msg+='\n⬆️ '+ch+'% price INCREASE';ri.className='rate-box up';}else if(ch<0){msg+='\n⬇️ '+Math.abs(ch)+'% price decrease';ri.className='rate-box down';}else{msg+='\n➡️ Same price';ri.className='rate-box neutral';}}else{ri.className='rate-box neutral';}
    ri.textContent=msg; ri.style.whiteSpace='pre-line'; ri.style.display='block';
}
function updateExpComparison() {
    var cat=document.getElementById('efCat').value; var ri=document.getElementById('efRateInfo'); if(!ri||(cat!=='atta'&&cat!=='oil')) return;
    var weight=parseFloat(document.getElementById('efWeight').value)||0; var amount=parseFloat(document.getElementById('efAmount').value)||0;
    if(weight<=0||amount<=0){showLastRate(cat);return;}
    var currentRate=(amount/weight).toFixed(1);
    var all=allExpenses.filter(function(x){return x.category===cat&&x.weight&&x.weight>0;}).sort(function(a,b){return a.date>b.date?1:-1;});
    if(!all.length){ri.textContent='📊 Current rate: ₹'+currentRate+'/kg';ri.className='rate-box neutral';ri.style.display='block';return;}
    var last=all[all.length-1]; var lastRate=(last.amount/last.weight).toFixed(1); var diff=((currentRate-lastRate)/lastRate*100).toFixed(1);
    var msg='📊 Current: ₹'+currentRate+'/kg\n📊 Last: ₹'+lastRate+'/kg ('+last.weight+'kg = ₹'+last.amount+')';
    if(diff>0){msg+='\n⬆️ '+diff+'% MORE expensive';ri.className='rate-box up';}else if(diff<0){msg+='\n⬇️ '+Math.abs(diff)+'% CHEAPER';ri.className='rate-box down';}else{msg+='\n➡️ Same rate';ri.className='rate-box neutral';}
    ri.textContent=msg; ri.style.whiteSpace='pre-line'; ri.style.display='block';
}
async function saveExpense(e) {
    e.preventDefault();
    var cat=document.getElementById('efCat').value, amt=parseFloat(document.getElementById('efAmount').value);
    if(!amt||amt<=0){showToast('❌ Enter valid amount!','error');return;}
    var weight=parseFloat(document.getElementById('efWeight').value)||null;
    if(weight!==null&&weight<=0){showToast('❌ Weight must be positive!','error');return;}
    var data={category:cat,detail:document.getElementById('efDetail').value.trim(),weight:weight,amount:amt,paymentType:document.getElementById('efPay').value,date:document.getElementById('expDate').value||todayStr()};
    var btn=document.getElementById('efSubmitBtn'); btnLoading(btn,true);
    try{var idV=document.getElementById('efId').value;if(idV){await fsUpdate('expenses',idV,data);showToast('✅ Expense updated!');}else{await fsAdd('expenses',data);showToast('✅ '+catNm(cat)+' ₹'+amt+' saved!');} closeOverlay('expFormOverlay');}
    catch(err){console.error('[Expense]',err);showToast('❌ Error saving expense','error');}finally{btnLoading(btn,false);}
}
function renderExps(exps) {
    var ct=document.getElementById('expList'); if(!ct) return;
    if(!exps.length){ct.innerHTML='<div class="empty"><div class="empty-ic">🛒</div><h3>No Expenses</h3><p>No expenses recorded on this date</p><button class="empty-btn" onclick="openExpenseForm()">+ Add Expense</button></div>';return;}
    var h='';
    exps.forEach(function(x,i){
        var pb=payBdg(x.paymentType); var det='';
        if(x.weight&&x.weight>0) det=x.weight+'kg • ₹'+(x.amount/x.weight).toFixed(1)+'/kg'; else if(x.detail) det=x.detail;
        h+='<div class="exp-card" style="animation-delay:'+(i*0.04)+'s"><div class="ex-top"><div class="ex-cat">'+catIc(x.category)+' '+catNm(x.category)+'</div><div class="ex-amt">-₹'+x.amount+'</div></div>';
        if(det) h+='<div class="ex-det">'+esc(det)+'</div>';
        h+='<div class="ex-badges"><span class="sl-b '+pb.c+'">'+pb.t+'</span></div><div class="ex-foot"><span class="sl-time">'+getTime(x.createdAt)+'</span>';
        if(canModify()){h+='<div class="sl-acts"><button class="ic-btn ib-e" onclick="openExpenseForm(\''+x.id+'\')" aria-label="Edit">✏️</button><button class="ic-btn ib-d" onclick="confirmDelExp(\''+x.id+'\')" aria-label="Delete">🗑️</button></div>';}
        h+='</div></div>';
    });
    ct.innerHTML=h;
}
function confirmDelExp(id) {
    if(!canModify()){showToast('❌ Staff cannot delete','error');return;}
    var x=findInArray(allExpenses,id); if(!x) return;
    showConfirm('🗑️','Delete Expense?',catNm(x.category)+' ₹'+x.amount+' — Delete?',async function(){try{await fsDelete('expenses',id);showToast('✅ Expense deleted!');}catch(err){showToast('❌ Error deleting','error');}});
}


// ============ WASTE ============
function changeWasteDate(off){var cv=document.getElementById('wasteDate').value,nd=dateShift(cv,off);if(nd){setDateInput('wasteDate',nd);updateDateBtn('wasteDateBtn',nd);loadWasteList();}}
function loadWasteList() {
    var date=document.getElementById('wasteDate').value; if(!date) return;
    var all=wasteForDate(date); var totalQty=0; all.forEach(function(w){totalQty+=(w.quantity||0);});
    var avgRate=0; if(allSales.length){var tA=0,tQ=0;allSales.forEach(function(s){tA+=s.total;tQ+=s.quantity;});avgRate=tQ>0?tA/tQ:0;}
    var el; el=document.getElementById('wQty');if(el)el.textContent=totalQty; el=document.getElementById('wCost');if(el)el.textContent='₹'+Math.round(totalQty*avgRate);
    var ct=document.getElementById('wasteList'); if(!ct) return;
    if(!all.length){ct.innerHTML='<div class="empty"><div class="empty-ic">🗑️</div><h3>No Waste</h3><p>No waste recorded on this date</p><button class="empty-btn" onclick="openWasteForm()">+ Add Waste</button></div>';return;}
    var h='';
    all.forEach(function(w,i){
        h+='<div class="waste-card" style="animation-delay:'+(i*0.04)+'s"><div class="wc-top"><div class="wc-reason">'+wasteReasonText(w.reason)+'</div><div class="wc-qty">'+w.quantity+' roti</div></div>';
        if(w.notes) h+='<div class="wc-notes">'+esc(w.notes)+'</div>';
        h+='<div class="wc-foot"><span class="sl-time">'+getTime(w.createdAt)+'</span>';
        if(canModify()){h+='<div class="sl-acts"><button class="ic-btn ib-e" onclick="openWasteForm(\''+w.id+'\')" aria-label="Edit">✏️</button><button class="ic-btn ib-d" onclick="confirmDelWaste(\''+w.id+'\')" aria-label="Delete">🗑️</button></div>';}
        h+='</div></div>';
    });
    ct.innerHTML=h;
}
function openWasteForm(id) {
    var form=document.getElementById('wasteForm'); if(form) form.reset();
    document.getElementById('wfId').value=''; document.getElementById('wfReason').value='burnt';
    document.querySelectorAll('#wasteForm .cat').forEach(function(b){b.classList.remove('active');}); var firstCat=document.querySelectorAll('#wasteForm .cat')[0]; if(firstCat) firstCat.classList.add('active');
    var titleEl=document.getElementById('wfFormTitle');
    if(id){
        if(titleEl) titleEl.textContent='Edit Waste Entry';
        var w=findInArray(allWaste,id);
        if(w){
            document.getElementById('wfId').value=w.id; document.getElementById('wfQty').value=w.quantity; document.getElementById('wfNotes').value=w.notes||''; document.getElementById('wfReason').value=w.reason||'burnt';
            var rmap={burnt:0,extra:1,returned:2,other:3}; document.querySelectorAll('#wasteForm .cat').forEach(function(b){b.classList.remove('active');}); var ri=rmap[w.reason]; if(ri!==undefined){var rBtns=document.querySelectorAll('#wasteForm .cat');if(rBtns[ri])rBtns[ri].classList.add('active');}
        }
    } else { if(titleEl) titleEl.textContent='Add Waste Entry'; }
    openOverlay('wasteFormOverlay');
}
async function saveWaste(e) {
    e.preventDefault(); var qty=parseInt(document.getElementById('wfQty').value);
    if(!qty||qty<1){showToast('❌ Enter valid quantity!','error');return;}
    var data={quantity:qty,reason:document.getElementById('wfReason').value,notes:document.getElementById('wfNotes').value.trim(),date:document.getElementById('wasteDate').value||todayStr()};
    var btn=document.getElementById('wfSubmitBtn'); btnLoading(btn,true);
    try{var idV=document.getElementById('wfId').value;if(idV){await fsUpdate('waste',idV,data);showToast('✅ Waste entry updated!');}else{await fsAdd('waste',data);showToast('✅ Waste entry saved!');} closeOverlay('wasteFormOverlay');}
    catch(err){console.error('[Waste]',err);showToast('❌ Error saving waste','error');}finally{btnLoading(btn,false);}
}
function confirmDelWaste(id){
    if(!canModify()){showToast('❌ Staff cannot delete','error');return;}
    var w=findInArray(allWaste,id); if(!w) return;
    showConfirm('🗑️','Delete Waste?',w.quantity+' roti ('+wasteReasonText(w.reason)+') — Delete?',async function(){try{await fsDelete('waste',id);showToast('✅ Waste deleted!');}catch(err){showToast('❌ Error deleting','error');}});
}


// ============ CREDIT (Phase 0 Fully Fixed) ============
function loadCredit() {
    var cm={};
    allCustomers.forEach(function(c){cm[c.id]={id:c.id,name:c.name,g:0,r:0};});
    var walkinCredit={id:'__walkin__',name:'🚶 Walk-in Customers',g:0,r:0};
    allSales.forEach(function(s){
        if(s.paymentType==='credit'){
            if(s.customerId){if(!cm[s.customerId])cm[s.customerId]={id:s.customerId,name:s.customerName||'Unknown',g:0,r:0};cm[s.customerId].g+=s.total;}
            else{walkinCredit.g+=s.total;}
        }
    });
    // ★ PHASE 0 FIX: Walk-in payments properly counted
    allCreditPayments.forEach(function(p){
        if(!p.customerId||p.customerId==='__walkin__'){walkinCredit.r+=p.amount;}
        else if(cm[p.customerId]){cm[p.customerId].r+=p.amount;}
    });
    if(walkinCredit.g>0||walkinCredit.r>0) cm['__walkin__']=walkinCredit;
    var list=Object.values(cm).filter(function(c){return c.g>0;});
    list.sort(function(a,b){var ba=b.g-b.r,aa=a.g-a.r;if(ba>0&&aa<=0)return-1;if(aa>0&&ba<=0)return 1;return Math.abs(ba)-Math.abs(aa);});
    var totalPending=0,totalAdvance=0;
    list.forEach(function(c){var bal=c.g-c.r;if(bal>0)totalPending+=bal;else if(bal<0)totalAdvance+=Math.abs(bal);});
    var heroEl=document.getElementById('cTotalPending'); if(heroEl) heroEl.textContent='₹'+totalPending;
    var heroAdv=document.getElementById('cTotalAdvance'); if(heroAdv) heroAdv.textContent='₹'+totalAdvance;
    var advSec=document.getElementById('cAdvanceSection'); if(advSec) advSec.style.display=totalAdvance>0?'':'none';
    var ct=document.getElementById('creditList'); if(!ct) return;
    if(!list.length){ct.innerHTML='<div class="empty"><div class="empty-ic">🎉</div><h3>No Pending Credit!</h3><p>All customers have paid up. Great job!</p></div>';return;}
    var h='';
    list.forEach(function(c,i){
        var balance=c.g-c.r; var isAdvance=balance<0; var isCleared=balance===0;
        var cardClass='u-card'+(isAdvance?' u-advance-card':isCleared?' u-cleared-card':'');
        h+='<div class="'+cardClass+'" style="animation-delay:'+(i*0.04)+'s" onclick="openCreditPay(\''+c.id+'\')" role="button" tabindex="0">';
        h+='<div class="u-info"><div class="u-name">'+esc(c.name)+'</div><div class="u-sub">Credit: ₹'+c.g+' • Paid: ₹'+c.r+'</div></div>';
        if(isAdvance){h+='<div class="u-amt u-advance">💚 +₹'+Math.abs(balance)+'<br><span class="adv-badge">Advance</span></div>';}
        else if(isCleared){h+='<div class="u-amt u-cleared">✅ Cleared</div>';}
        else{h+='<div class="u-amt">₹'+balance+'</div>';}
        h+='</div>';
    });
    ct.innerHTML=h;
}
function openCreditPay(cid) {
    var cust=findInArray(allCustomers,cid);
    var custPayments=allCreditPayments.filter(function(p){if(cid==='__walkin__')return!p.customerId||p.customerId==='__walkin__';return p.customerId===cid;});
    var g=0,nameFromSales='';
    allSales.forEach(function(s){
        if(s.paymentType!=='credit') return;
        var matches=(cid==='__walkin__')?(!s.customerId||s.customerId==='__walkin__'):(s.customerId===cid);
        if(matches){g+=s.total;if(s.customerName) nameFromSales=s.customerName;}
    });
    var r=0; custPayments.forEach(function(p){r+=p.amount;});
    var balance=g-r; var isAdvance=balance<0;
    var name=cust?cust.name:nameFromSales;
    if(!name) custPayments.forEach(function(p){if(p.customerName)name=p.customerName;});
    if(!name) name='Unknown Customer';
    if(cid==='__walkin__') name='🚶 Walk-in Customers';
    document.getElementById('crpTitle').textContent=name;
    document.getElementById('crpCustId').value=cid; document.getElementById('crpCustName').value=name;
    document.getElementById('crpAmount').value=''; document.getElementById('crpPayId').value='';
    var crpDate=document.getElementById('crpDate'); if(crpDate){crpDate.value=todayStr();crpDate.max=todayStr();}
    document.getElementById('crpPay').value='cash';
    var tg=document.querySelectorAll('#crpForm .tgl'); tg.forEach(function(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');}); if(tg[0]){tg[0].classList.add('active');tg[0].setAttribute('aria-pressed','true');}
    var detailEl=document.getElementById('crpDetail');
    if(detailEl){
        var balLabel=isAdvance?'Advance Balance':(balance===0?'Status':'Pending');
        var balClass=isAdvance?'advance':(balance===0?'green':'amber');
        var balText=isAdvance?'💚 ₹'+Math.abs(balance)+' advance':(balance===0?'✅ Cleared':'₹'+balance);
        detailEl.innerHTML='<div class="ud-row"><span class="ud-label">Total Credit Given</span><span class="ud-val">₹'+g+'</span></div><div class="ud-row"><span class="ud-label">Total Paid</span><span class="ud-val green">₹'+r+'</span></div><div class="ud-row"><span class="ud-label">'+balLabel+'</span><span class="ud-val '+balClass+'">'+balText+'</span></div>';
        if(isAdvance) detailEl.innerHTML+='<div style="background:var(--gnb);border-radius:var(--rx);padding:10px 12px;margin-top:8px;font-size:12px;color:var(--gnd);font-weight:600">💡 Is advance ko agli sale mein adjust karein</div>';
    }
    var hDiv=document.getElementById('crpHistory');
    if(hDiv){
        if(!custPayments.length){hDiv.innerHTML='<div class="no-data">No payments recorded yet</div>';}
        else{
            var histHtml='';
            custPayments.slice().sort(function(a,b){var ta=a.createdAt?(typeof a.createdAt.toDate==='function'?a.createdAt.toDate():new Date(a.createdAt)):new Date(a.date);var tb=b.createdAt?(typeof b.createdAt.toDate==='function'?b.createdAt.toDate():new Date(b.createdAt)):new Date(b.date);return tb-ta;}).forEach(function(p){
                var modeIcon=p.paymentType==='upi'?'📱 UPI':'💵 Cash'; var timeStr=getTime(p.createdAt)||'';
                histHtml+='<div class="pay-hist-item"><div class="phi-left"><div class="phi-date">'+fmtDateLong(p.date)+'</div>'+(timeStr?'<div class="phi-time">'+timeStr+'</div>':'')+'</div><div class="phi-right"><span class="phi-amount">+₹'+p.amount+'</span><span class="phi-mode">'+modeIcon+'</span>';
                if(canModify()) histHtml+='<div class="phi-actions"><button class="ic-btn ib-d" onclick="deleteCreditPayment(\''+p.id+'\')" aria-label="Delete payment" style="width:28px;height:28px;font-size:12px">🗑️</button></div>';
                histHtml+='</div></div>';
            });
            hDiv.innerHTML=histHtml;
        }
    }
    openOverlay('creditPayOverlay');
}
function deleteCreditPayment(pid){
    if(!canModify()){showToast('❌ Permission nahi hai','error');return;}
    showConfirm('🗑️','Payment Delete Karo?','Ye payment permanently delete hogi.',async function(){
        try{await fsDelete('creditPayments',pid);showToast('✅ Payment delete ho gayi!');closeOverlay('creditPayOverlay');}
        catch(err){showToast('❌ Error deleting payment','error');}
    });
}
async function saveCreditPayment(e) {
    e.preventDefault();
    var amt=parseFloat(document.getElementById('crpAmount').value);
    if(!amt||amt<=0){showToast('❌ Enter valid amount!','error');return;}
    var btn=document.getElementById('crpSubmitBtn'); btnLoading(btn,true);
    try{
        var dateEl=document.getElementById('crpDate');
        await fsAdd('creditPayments',{
            customerId:document.getElementById('crpCustId').value,
            customerName:document.getElementById('crpCustName').value,
            amount:amt,
            paymentType:document.getElementById('crpPay').value,
            date:(dateEl&&dateEl.value)?dateEl.value:todayStr()
        });
        showToast('✅ ₹'+amt+' payment saved!'); closeOverlay('creditPayOverlay');
    }catch(err){console.error('[Credit]',err);showToast('❌ Error saving payment','error');}
    finally{btnLoading(btn,false);}
}

console.log('[Data] Data module loaded');