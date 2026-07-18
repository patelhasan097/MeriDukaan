/* MERI DUKAAN v8 — Data: Sales, Customers, Credit, Expenses, Waste */

/* ══════════════════════════════════════════════
   SOFT DELETE
══════════════════════════════════════════════ */
function softDelete(col, id, label, onUndo) {
  fsUpdate(col, id, {deleted:true, deletedAt:serverTimestamp()}).then(function(){
    showToastWithUndo((label||'Item')+' deleted — ', function(){
      fsUpdate(col, id, {deleted:false, deletedAt:null}).then(function(){
        showToast('↩️ Restored!','success');
        if(onUndo) onUndo();
      });
    });
  }).catch(function(){ showToast(t('err_generic'),'error'); });
}

/* ══════════════════════════════════════════════
   SALES
══════════════════════════════════════════════ */
var _sfCustId='', _lastPay={};
var _salesFilter='all', _salesSort='newest', _salesSearch='';
var _searchSalesDb=debounce(function(v){_salesSearch=v||''; renderSales();},250);

function openSaleForm(id) {
  clearFormErrors('saleForm');
  var form=document.getElementById('saleForm');
  if(form) form.reset();
  _sfCustId='';
  document.getElementById('sfId').value='';
  document.getElementById('sfDate').value=todayStr();
  document.getElementById('sfTitle').textContent=id?t('edit_sale'):t('add_sale');
  _renderCustPicker('');
  _updateCustDisplay('');

  if(id){
    var s=findById(AppState.allSales,id);
    if(!s) return;
    document.getElementById('sfId').value=s.id;
    document.getElementById('sfDate').value=s.date;
    document.getElementById('sfQty').value=s.qty;
    document.getElementById('sfRate').value=s.rate;
    var payInputs=document.querySelectorAll('input[name="sfPay"]');
    payInputs.forEach(function(inp){ inp.checked=inp.value===s.payType; });
    _sfCustId=s.customerId;
    _updateCustDisplay(s.customerId);
    _calcTotal();
  }
  openOverlay('saleFormOverlay');
}
function closeSaleForm(){ closeOverlay('saleFormOverlay'); }

function calcTotal(){ _calcTotal(); }
function _calcTotal(){
  var qty=parseInt(document.getElementById('sfQty').value||0,10);
  var rate=parseFloat(document.getElementById('sfRate').value||0);
  var tot=isNaN(qty)||isNaN(rate)?0:qty*rate;
  var el=document.getElementById('sfTotal'); if(el) el.textContent=fmtCurrency(tot);
  var upiBtn=document.getElementById('sfUpiBtn');
  if(upiBtn){ upiBtn.style.display=(AppState.upiVpa&&tot>0)?'flex':'none'; upiBtn.textContent=t('collect_upi',fmtCurrency(tot).replace('₹','')); }
}

function openUpiCollect(){
  var qty=parseInt(document.getElementById('sfQty').value||0,10);
  var rate=parseFloat(document.getElementById('sfRate').value||0);
  var amt=qty*rate;
  if(!AppState.upiVpa||!amt) return;
  window.open(buildUpiLink(AppState.upiVpa,AppState.businessName,amt),'_blank');
}

function saveSale(e){
  e.preventDefault();
  clearFormErrors('saleForm');
  var custId=_sfCustId;
  var date=document.getElementById('sfDate').value||todayStr();
  var qtyRaw=document.getElementById('sfQty').value;
  var rate=parseFloat(document.getElementById('sfRate').value||'');
  var payType=(document.querySelector('input[name="sfPay"]:checked')||{value:'cash'}).value;
  var id=document.getElementById('sfId').value;

  var ok=true;
  if(!custId){setFieldError('sfCustDisplay',t('err_select_cust'));ok=false;}
  var qty=parseInt(qtyRaw,10);
  if(!qtyRaw||isNaN(qty)||qty<1||qty>9999){setFieldError('sfQty',t('err_qty'));ok=false;}
  if(isNaN(rate)||rate<=0){setFieldError('sfRate',t('err_rate'));ok=false;}
  if(!ok) return;

  var data={customerId:custId,date:date,qty:qty,rate:rate,total:qty*rate,payType:payType,deleted:false};
  var btn=document.getElementById('sfSubmitBtn');
  btnLoading(btn,true);

  var p;
  if(id){ p=withRetry(function(){return bizDoc('sales',id).update(data);}); }
  else  { data.createdAt=serverTimestamp(); p=withRetry(function(){return bizCol('sales').add(data);}); }

  p.then(function(){
    _lastPay[custId]=payType;
    showToast(id?t('sale_updated'):t('sale_saved'),'success');
    closeOverlay('saleFormOverlay');
  }).catch(function(err){
    if(err.code==='resource-exhausted') return;
    showToast(navigator.onLine?t('err_save'):t('offline_save'),'info');
    closeOverlay('saleFormOverlay');
  }).finally(function(){ btnLoading(btn,false); });
}

function deleteSale(id){
  if(!canModify()){showToast(t('staff_cannot'),'error');return;}
  var s=findById(AppState.allSales,id);
  if(!s) return;
  var c=findById(AppState.allCustomers,s.customerId);
  softDelete('sales',id,(c?c.name:'Sale'));
}

function renderSales(){
  var custs=AppState.allCustomers;
  var sales=[].concat(AppState.allSales);
  if(_salesFilter!=='all') sales=sales.filter(function(s){return s.payType===_salesFilter;});
  if(_salesSearch){
    var q=_salesSearch.toLowerCase();
    sales=sales.filter(function(s){
      var c=findById(custs,s.customerId);
      return (c?c.name:'').toLowerCase().indexOf(q)!==-1||String(s.total).indexOf(q)!==-1||(s.date||'').indexOf(q)!==-1;
    });
  }
  if(_salesSort==='newest')  sales.sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
  else if(_salesSort==='amount') sales.sort(function(a,b){return (b.total||0)-(a.total||0);});
  else if(_salesSort==='name') sales.sort(function(a,b){var na=(findById(custs,a.customerId)||{name:''}).name,nb=(findById(custs,b.customerId)||{name:''}).name;return na.localeCompare(nb);});

  var ct=document.getElementById('salesList');
  if(!ct) return;
  if(!sales.length){
    ct.innerHTML='<div class="empty-state"><div class="empty-ic">📋</div><h3>'+t('no_sales')+'</h3><button class="btn btn--primary" onclick="openSaleForm()">'+t('add_sale')+'</button></div>';
    return;
  }
  var payIc={cash:'💵',upi:'📱',credit:'📒'};
  ct.innerHTML=sales.map(function(s,i){
    var c=findById(custs,s.customerId);
    return '<div class="sale-card" style="animation-delay:'+(i*0.03)+'s"><div class="sale-card__main"><button class="cust-link" onclick="openCustomerProfile(\''+s.customerId+'\')" aria-label="View profile">'+esc(c?c.name:'—')+'</button><div class="sale-meta">'+s.qty+' roti · '+fmtDate(s.date)+'</div></div><div class="sale-card__right"><span class="sale-total">'+fmtCurrency(s.total)+'</span><span>'+(payIc[s.payType]||'')+'</span><div class="row-acts"><button class="ic-btn" onclick="openSaleForm(\''+s.id+'\')" aria-label="Edit">✏️</button><button class="ic-btn ic-btn--d" onclick="deleteSale(\''+s.id+'\')" aria-label="Delete">🗑️</button></div></div></div>';
  }).join('');
}

function setSalesFilter(f,btn){
  _salesFilter=f;
  document.querySelectorAll('[data-sf]').forEach(function(b){ b.classList.toggle('filter-btn--active',b.dataset.sf===f); });
  renderSales();
}
function setSalesSort(s){
  _salesSort=s; renderSales();
}
function searchSales(v){ _searchSalesDb(v); }

/* ── Customer Picker ── */
var _filterPickerDb=debounce(function(v){_renderCustPicker(v);},200);
function filterCustPicker(v){ _filterPickerDb(v); }
function _renderCustPicker(q){
  var ct=document.getElementById('custPickerList');
  if(!ct) return;
  var custs=AppState.allCustomers.filter(function(c){return c.status!=='inactive';});
  if(q){ var ql=q.toLowerCase(); custs=custs.filter(function(c){return (c.name||'').toLowerCase().indexOf(ql)!==-1;}); }
  ct.innerHTML=custs.map(function(c){
    return '<button class="pick-item'+(c.id===_sfCustId?' pick-item--active':'')+'" onclick="selectCustomer(\''+c.id+'\')" aria-label="Select '+esc(c.name)+'">'+esc(c.name)+'</button>';
  }).join('')||'<p class="empty-mini">'+t('no_custs')+'</p>';
}
function selectCustomer(id){
  _sfCustId=id;
  _updateCustDisplay(id);
  clearFieldError('sfCustDisplay');
  closeOverlay('custPickerOverlay');
  var c=findById(AppState.allCustomers,id);
  if(c){
    var rate=document.getElementById('sfRate');
    if(rate&&!rate.value) rate.value=c.rate||'';
    if(_lastPay[id]){ var pi=document.querySelector('input[name="sfPay"][value="'+_lastPay[id]+'"]'); if(pi) pi.checked=true; }
    _calcTotal();
  }
}
function _updateCustDisplay(id){
  var c=id?findById(AppState.allCustomers,id):null;
  var el=document.getElementById('sfCustDisplay');
  if(el) el.textContent=c?c.name:'Select Customer';
}

/* ══════════════════════════════════════════════
   QUICK SALE
══════════════════════════════════════════════ */
var _qsSkipped=new Set();
var _qsInProgress=false;

function loadQuickSale(){
  var custs=AppState.allCustomers.filter(function(c){return c.orderType==='fixed'&&c.status!=='inactive';});
  var today=todayStr();
  var doneCusts=new Set(AppState.allSales.filter(function(s){return s.date===today;}).map(function(s){return s.customerId;}));
  var pending=custs.filter(function(c){return !doneCusts.has(c.id)&&!_qsSkipped.has(c.id);});
  var done   =custs.filter(function(c){return  doneCusts.has(c.id);});
  var skipped=custs.filter(function(c){return _qsSkipped.has(c.id);});

  var pEl=document.getElementById('qsPendingCount');
  var dEl=document.getElementById('qsDoneCount');
  if(pEl) pEl.textContent=pending.length;
  if(dEl) dEl.textContent=done.length;

  var btn=document.getElementById('qsMarkAllBtn');
  if(btn) btn.style.display=pending.length>0?'flex':'none';

  var ct=document.getElementById('quickSaleList');
  if(!ct) return;
  if(!custs.length){
    ct.innerHTML='<div class="empty-state"><div class="empty-ic">🍞</div><h3>'+t('no_fixed_custs')+'</h3><button class="btn btn--primary" onclick="openCustForm()">+ '+t('add_customer')+'</button></div>';
    return;
  }
  var h='';
  pending.forEach(function(c,i){
    var lastPay=_lastPay[c.id]||'cash';
    h+='<div class="qs-row" id="qsr_'+c.id+'" style="animation-delay:'+(i*0.04)+'s"><div class="qs-row__inner"><div class="qs-cust"><button class="cust-link" onclick="openCustomerProfile(\''+c.id+'\')">'+esc(c.name)+'</button><span class="qs-sub">'+c.qty+' roti · '+fmtCurrency(c.qty*c.rate)+'</span></div><div class="qs-ctrls"><select class="qs-pay" id="qsp_'+c.id+'"><option value="cash"'+(lastPay==='cash'?' selected':'')+'>💵</option><option value="upi"'+(lastPay==='upi'?' selected':'')+'>📱</option><option value="credit"'+(lastPay==='credit'?' selected':'')+'>📒</option></select><button class="btn btn--success btn--sm" onclick="qsMarkDone(\''+c.id+'\')" id="qsb_'+c.id+'">✓ '+t('done')+'</button></div></div><button class="qs-skip" onclick="qsSkip(\''+c.id+'\')" aria-label="'+t('skip_today')+'">'+t('skip_today')+'</button></div>';
  });
  done.forEach(function(c){
    var s=AppState.allSales.find(function(x){return x.customerId===c.id&&x.date===today;});
    var pi={cash:'💵',upi:'📱',credit:'📒'}[(s&&s.payType)||'cash'];
    h+='<div class="qs-row qs-row--done"><div class="qs-row__inner"><span class="qs-check">✅</span><span class="qs-done-name">'+esc(c.name)+'</span><span class="qs-done-meta">'+(s?s.qty:c.qty)+' roti · '+fmtCurrency(s?s.total:0)+' '+pi+'</span></div></div>';
  });
  skipped.forEach(function(c){
    h+='<div class="qs-row qs-row--skipped"><div class="qs-row__inner"><span class="qs-done-name">'+esc(c.name)+'</span><span class="badge badge--muted">'+t('skipped')+'</span><button class="btn btn--ghost btn--xs" onclick="qsUndoSkip(\''+c.id+'\')">Undo</button></div></div>';
  });
  ct.innerHTML=h;
}

function qsMarkDone(custId){
  var c=findById(AppState.allCustomers,custId);
  if(!c) return;
  var pay=document.getElementById('qsp_'+custId);
  var payType=pay?pay.value:(_lastPay[custId]||'cash');
  _lastPay[custId]=payType;
  var row=document.getElementById('qsr_'+custId);
  var btn=document.getElementById('qsb_'+custId);
  if(btn) btn.disabled=true;
  if(row) row.classList.add('qs-saving');
  withRetry(function(){
    return bizCol('sales').add({
      customerId:custId,date:todayStr(),qty:c.qty,rate:c.rate,
      total:c.qty*c.rate,payType:payType,deleted:false,
      createdAt:serverTimestamp()
    });
  }).then(function(){
    if(navigator.vibrate) navigator.vibrate(40);
    if(row){ row.classList.remove('qs-saving'); row.classList.add('qs-success'); }
  }).catch(function(){
    if(btn) btn.disabled=false;
    if(row) row.classList.remove('qs-saving');
    showToast(navigator.onLine?t('err_save'):t('offline_save'),'info');
  });
}
function qsSkip(id){ _qsSkipped.add(id); loadQuickSale(); }
function qsUndoSkip(id){ _qsSkipped.delete(id); loadQuickSale(); }

function markAllFixedDone(){
  if(_qsInProgress) return;
  var today=todayStr();
  var doneCusts=new Set(AppState.allSales.filter(function(s){return s.date===today;}).map(function(s){return s.customerId;}));
  var custs=AppState.allCustomers.filter(function(c){return c.orderType==='fixed'&&c.status!=='inactive'&&!doneCusts.has(c.id)&&!_qsSkipped.has(c.id);});
  if(!custs.length){ showToast(t('all_done'),'success'); return; }
  showConfirm('✅',t('mark_all_done'),'Mark '+custs.length+' customers done for today?',{yesLabel:'Mark All',danger:false}).then(function(ok){
    if(!ok) return;
    _qsInProgress=true;
    var btn=document.getElementById('qsMarkAllBtn');
    btnLoading(btn,true,t('saving'));
    var CHUNK=499;
    var chunks=[];
    for(var i=0;i<custs.length;i+=CHUNK) chunks.push(custs.slice(i,i+CHUNK));
    var doChunk=function(idx){
      if(idx>=chunks.length){
        _qsInProgress=false; btnLoading(btn,false);
        showToast(t('all_done'),'success');
        if(navigator.vibrate) navigator.vibrate([50,50,100]);
        return;
      }
      var batch=batchWrite();
      chunks[idx].forEach(function(c){
        var ref=bizCol('sales').doc();
        batch.set(ref,{customerId:c.id,date:today,qty:c.qty,rate:c.rate,total:c.qty*c.rate,payType:_lastPay[c.id]||'cash',deleted:false,createdAt:serverTimestamp()});
      });
      batch.commit().then(function(){ doChunk(idx+1); }).catch(function(err){
        _qsInProgress=false; btnLoading(btn,false);
        showToast(navigator.onLine?t('err_save'):t('offline_save'),'info');
      });
    };
    doChunk(0);
  });
}

/* ══════════════════════════════════════════════
   CUSTOMERS
══════════════════════════════════════════════ */
var _searchCustDb=debounce(function(v){_renderCusts(v||'');},250);
function loadCusts(){ _renderCusts(''); }
function searchCustomers(v){ _searchCustDb(v); }

function _renderCusts(q){
  var custs=[].concat(AppState.allCustomers);
  if(q){ var ql=q.toLowerCase(); custs=custs.filter(function(c){return (c.name||'').toLowerCase().indexOf(ql)!==-1||(c.phone||'').indexOf(q)!==-1;}); }
  var ct=document.getElementById('custList');
  if(!ct) return;
  if(!custs.length){
    ct.innerHTML='<div class="empty-state"><div class="empty-ic">👥</div><h3>No customers yet</h3><button class="btn btn--primary" onclick="openCustForm()">'+t('add_customer')+'</button></div>';
    return;
  }
  ct.innerHTML=custs.map(function(c,i){
    var status=c.status||'active';
    var bc=status==='active'?'badge--success':status==='seasonal'?'badge--warn':'badge--muted';
    var daily=c.orderType==='fixed'?('<span class="cust-daily">'+t('expected_daily',fmtCurrency(c.qty*c.rate).replace('₹',''))+'</span>'):'';
    return '<div class="cust-card'+(status!=='active'?' cust-card--dim':'')+'" style="animation-delay:'+(i*0.04)+'s"><div class="cust-card__top"><button class="cust-link" onclick="openCustomerProfile(\''+c.id+'\')">'+esc(c.name)+'</button><span class="badge '+bc+'">'+t('status_'+status)+'</span></div><div class="cust-meta"><span>₹'+c.rate+'/roti</span>'+(c.orderType==='fixed'?'<span>Fixed: '+c.qty+'/day</span>':'<span>Variable</span>')+daily+(c.phone?'<span>📞 '+esc(c.phone)+'</span>':'')+'</div><div class="row-acts"><button class="ic-btn" onclick="openCustForm(\''+c.id+'\')" aria-label="Edit">✏️</button><button class="ic-btn ic-btn--d" onclick="deleteCust(\''+c.id+'\')" aria-label="Delete">🗑️</button><button class="ic-btn" onclick="cycleCustStatus(\''+c.id+'\')" title="Change status">🔄</button></div></div>';
  }).join('');
}

function openCustForm(id){
  if(!canModify()){showToast(t('staff_cannot'),'error');return;}
  clearFormErrors('custForm');
  var form=document.getElementById('custForm');
  if(form) form.reset();
  document.getElementById('cfId').value='';
  document.getElementById('cfFormTitle').textContent=id?t('edit_customer'):t('add_customer');
  document.getElementById('cfFixedGrp').style.display='none';
  if(id){
    var c=findById(AppState.allCustomers,id);
    if(!c) return;
    document.getElementById('cfId').value=c.id;
    document.getElementById('cfName').value=c.name||'';
    document.getElementById('cfPhone').value=c.phone||'';
    document.getElementById('cfAddr').value=c.address||'';
    document.getElementById('cfRate').value=c.rate||'';
    document.getElementById('cfType').value=c.orderType||'variable';
    document.getElementById('cfStatus').value=c.status||'active';
    if(c.orderType==='fixed'){
      document.getElementById('cfFixedGrp').style.display='';
      document.getElementById('cfQty').value=c.qty||'';
    }
  }
  openOverlay('custFormOverlay');
}
function closeCustForm(){ closeOverlay('custFormOverlay'); }
function setCustType(t2){
  document.getElementById('cfFixedGrp').style.display=t2==='fixed'?'':'none';
  if(t2!=='fixed'){ var q=document.getElementById('cfQty'); if(q) q.value=''; }
}

function saveCustomer(e){
  e.preventDefault();
  clearFormErrors('custForm');
  var name=(document.getElementById('cfName').value||'').trim();
  var phone=(document.getElementById('cfPhone').value||'').replace(/\s/g,'');
  var addr =(document.getElementById('cfAddr').value||'').trim();
  var rate =parseFloat(document.getElementById('cfRate').value||'');
  var type =document.getElementById('cfType').value||'variable';
  var qty  =type==='fixed'?parseInt(document.getElementById('cfQty').value||0,10):0;
  var status=document.getElementById('cfStatus').value||'active';
  var id   =document.getElementById('cfId').value;

  var ok=true;
  if(!name){setFieldError('cfName',t('err_name'));ok=false;}
  if(phone&&!/^\d{10}$/.test(phone)){setFieldError('cfPhone',t('err_phone'));ok=false;}
  if(isNaN(rate)||rate<1||rate>500){setFieldError('cfRate','Rate must be ₹1–₹500');ok=false;}
  if(type==='fixed'&&(isNaN(qty)||qty<1||qty>9999)){setFieldError('cfQty',t('err_qty'));ok=false;}
  if(!ok) return;

  var data={name:name,phone:phone,address:addr,rate:rate,orderType:type,qty:type==='fixed'?qty:0,status:status};
  var btn=document.getElementById('cfSubmitBtn');
  btnLoading(btn,true);
  var p=id?withRetry(function(){return bizDoc('customers',id).update(data);}):withRetry(function(){return bizCol('customers').add(Object.assign({},data,{createdAt:serverTimestamp()}));});
  p.then(function(){showToast(t('cust_saved'),'success');closeOverlay('custFormOverlay');})
   .catch(function(){showToast(t('err_save'),'error');})
   .finally(function(){btnLoading(btn,false);});
}

function deleteCust(id){
  if(!canModify()){showToast(t('staff_cannot'),'error');return;}
  var c=findById(AppState.allCustomers,id);
  if(!c) return;
  showConfirm('🗑️',t('confirm_delete',c.name),t('confirm_delete_msg')).then(function(ok){
    if(!ok) return;
    withRetry(function(){return bizDoc('customers',id).delete();}).then(function(){showToast('Customer deleted','success');}).catch(function(){showToast(t('err_generic'),'error');});
  });
}

function cycleCustStatus(id){
  if(!canModify()) return;
  var c=findById(AppState.allCustomers,id);
  if(!c) return;
  var next={active:'inactive',inactive:'seasonal',seasonal:'active'};
  var ns=next[c.status||'active'];
  withRetry(function(){return bizDoc('customers',id).update({status:ns});}).then(function(){showToast('Marked '+ns,'info');});
}

function openCustomerProfile(custId){
  var c=findById(AppState.allCustomers,custId);
  if(!c) return;
  var sales=AppState.allSales.filter(function(s){return s.customerId===custId;});
  var pays =AppState.allCreditPayments.filter(function(p){return p.customerId===custId;});
  var given=sales.filter(function(s){return s.payType==='credit';}).reduce(function(s,x){return s+(x.total||0);},0);
  var paid =pays.reduce(function(s,x){return s+(x.amount||0);},0);
  var bal  =given-paid;
  var ct=document.getElementById('custProfileContent');
  if(!ct) return;
  ct.innerHTML='<div class="profile-hdr"><div class="profile-name">'+esc(c.name)+'</div><span class="badge badge-'+(c.status==='active'?'success':'muted')+'">'+t('status_'+(c.status||'active'))+'</span></div><div class="profile-stats"><div class="ps"><span>Rate</span><strong>₹'+c.rate+'/roti</strong></div><div class="ps"><span>Order</span><strong>'+(c.orderType==='fixed'?'Fixed '+c.qty+'/day':'Variable')+'</strong></div><div class="ps"><span>Total sales</span><strong>'+sales.length+'</strong></div><div class="ps"><span>Balance</span><strong class="'+(bal>0?'text-danger':'')+'">'+fmtCurrency(bal)+'</strong></div></div>'+(c.phone?'<a class="profile-phone" href="tel:'+esc(c.phone)+'">📞 '+esc(c.phone)+'</a>':'')+
  '<div class="profile-acts"><button class="btn btn--primary btn--sm" onclick="openSaleForm();_sfCustId=\''+custId+'\';selectCustomer(\''+custId+'\');closeOverlay(\'custProfileOverlay\')">'+t('add_sale')+'</button>'+(bal>0?'<button class="btn btn--sm" onclick="openCreditPayment(\''+custId+'\','+bal+');closeOverlay(\'custProfileOverlay\')">'+t('collect_payment')+'</button>':'')+(c.phone?'<button class="btn btn--wa btn--sm" onclick="sendWhatsAppReminder(\''+custId+'\','+bal+')">'+t('whatsapp_remind')+'</button>':'')+'</div><div class="profile-recent-title">Recent Sales</div>'+sales.slice(0,8).map(function(s){return '<div class="prev-row"><div class="prev-row__info"><span class="prev-name">'+fmtDate(s.date)+' · '+s.qty+' roti</span><span class="prev-meta">'+s.payType+'</span></div><span class="prev-amt">'+fmtCurrency(s.total)+'</span></div>';}).join('')+'';
  openOverlay('custProfileOverlay');
}

/* ══════════════════════════════════════════════
   CREDIT
══════════════════════════════════════════════ */
var _creditSort='balance';

function loadCredit(){
  var custs=AppState.allCustomers;
  var sales=AppState.allSales;
  var pays =AppState.allCreditPayments;
  var summary={};
  sales.filter(function(s){return s.payType==='credit';}).forEach(function(s){
    if(!summary[s.customerId]) summary[s.customerId]={given:0,paid:0,lastCred:'',lastPay:''};
    summary[s.customerId].given+=s.total||0;
    if(!summary[s.customerId].lastCred||s.date>summary[s.customerId].lastCred) summary[s.customerId].lastCred=s.date;
  });
  pays.forEach(function(p){
    if(!summary[p.customerId]) summary[p.customerId]={given:0,paid:0,lastCred:'',lastPay:''};
    summary[p.customerId].paid+=p.amount||0;
    if(!summary[p.customerId].lastPay||p.date>summary[p.customerId].lastPay) summary[p.customerId].lastPay=p.date;
  });

  var rows=Object.entries(summary).map(function(entry){
    var cid=entry[0], d=entry[1];
    var c=findById(custs,cid);
    var bal=d.given-d.paid;
    var daysSinceP=d.lastPay?daysBetween(d.lastPay,todayStr()):null;
    return {custId:cid,cust:c,given:d.given,paid:d.paid,bal:bal,lastCred:d.lastCred,lastPay:d.lastPay,dsp:daysSinceP};
  }).filter(function(r){return r.cust&&(r.bal!==0||r.given>0);});

  if(_creditSort==='balance')  rows.sort(function(a,b){return (b.bal||0)-(a.bal||0);});
  if(_creditSort==='oldest')   rows.sort(function(a,b){return (b.dsp||0)-(a.dsp||0);});
  if(_creditSort==='name')     rows.sort(function(a,b){return (a.cust.name||'').localeCompare(b.cust.name||'');});

  var tg=rows.reduce(function(s,r){return s+r.given;},0);
  var tp=rows.reduce(function(s,r){return s+r.paid;},0);
  var tb=rows.reduce(function(s,r){return s+r.bal;},0);
  function setEl(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  setEl('crTotalGiven',fmtCurrency(tg));setEl('crTotalPaid',fmtCurrency(tp));setEl('crTotalBal',fmtCurrency(tb));

  var ct=document.getElementById('creditList');
  if(!ct) return;
  if(!rows.length){ct.innerHTML='<div class="empty-state"><div class="empty-ic">✅</div><h3>No credit transactions</h3></div>';return;}

  ct.innerHTML=rows.map(function(r,i){
    if(!r.cust) return '';
    var urgClass=r.dsp===null?'':(r.dsp>30?'cr-card--urgent':r.dsp>7?'cr-card--warn':'');
    var ageText=r.dsp===null?t('last_payment',fmtDate(r.lastCred)):(r.dsp>30?t('no_payment_days',r.dsp):t('last_payment',fmtRelDate(r.lastPay)));
    return '<div class="cr-card '+urgClass+'" style="animation-delay:'+(i*0.04)+'s"><div class="cr-card__top"><button class="cust-link" onclick="openCustomerProfile(\''+r.custId+'\')">'+esc(r.cust.name)+'</button><span class="cr-bal'+(r.bal>0?' cr-bal--owed':'')+'">'+fmtCurrency(r.bal)+'</span></div><div class="cr-stats"><span>Given: '+fmtCurrency(r.given)+'</span><span>Paid: '+fmtCurrency(r.paid)+'</span></div><div class="cr-age">'+ageText+'</div><div class="cr-acts">'+(r.bal>0?'<button class="btn btn--primary btn--sm" onclick="openCreditPayment(\''+r.custId+'\','+r.bal+')">'+t('collect_payment')+'</button>':'')+(r.cust.phone?'<button class="btn btn--wa btn--sm" onclick="sendWhatsAppReminder(\''+r.custId+'\','+r.bal+')">'+t('whatsapp_remind')+'</button>':'')+'<button class="btn btn--ghost btn--sm" onclick="shareCreditStatement(\''+r.custId+'\')">'+t('share_statement')+'</button></div></div>';
  }).join('');
}

function setCreditSort(s){_creditSort=s;loadCredit();}

function openCreditPayment(custId,balance){
  var c=findById(AppState.allCustomers,custId);
  if(!c) return;
  document.getElementById('crpCustId').value=custId;
  document.getElementById('crpName').textContent=c.name;
  document.getElementById('crpBal').textContent=fmtCurrency(balance);
  document.getElementById('crpFullBtn').textContent=t('collect_full_btn',Math.round(balance));
  document.getElementById('crpAmount').value='';
  clearFieldError('crpAmount');
  openOverlay('creditPayOverlay');
}
function crpSetFull(){
  var id=document.getElementById('crpCustId').value;
  var given=AppState.allSales.filter(function(s){return s.customerId===id&&s.payType==='credit';}).reduce(function(s,x){return s+(x.total||0);},0);
  var paid =AppState.allCreditPayments.filter(function(p){return p.customerId===id;}).reduce(function(s,x){return s+(x.amount||0);},0);
  var el=document.getElementById('crpAmount');
  if(el) el.value=Math.max(0,Math.round(given-paid));
}
function saveCreditPayment(e){
  e.preventDefault();
  clearFieldError('crpAmount');
  var custId=document.getElementById('crpCustId').value;
  var amount=parseFloat(document.getElementById('crpAmount').value||'');
  if(isNaN(amount)||amount<=0){setFieldError('crpAmount',t('err_amount'));return;}
  var btn=document.getElementById('crpSubmitBtn');
  btnLoading(btn,true);
  withRetry(function(){
    return bizCol('creditPayments').add({customerId:custId,amount:amount,date:todayStr(),createdAt:serverTimestamp()});
  }).then(function(){
    showToast('✅ Payment recorded!','success');
    var given=AppState.allSales.filter(function(s){return s.customerId===custId&&s.payType==='credit';}).reduce(function(s,x){return s+(x.total||0);},0);
    var paid =AppState.allCreditPayments.filter(function(p){return p.customerId===custId;}).reduce(function(s,x){return s+(x.amount||0);},0)+amount;
    if(given-paid<=0){ showToast(t('paid_fully'),'success',2000); setTimeout(function(){closeOverlay('creditPayOverlay');},1500); }
    else closeOverlay('creditPayOverlay');
  }).catch(function(){showToast(t('err_save'),'error');}).finally(function(){btnLoading(btn,false);});
}

function sendWhatsAppReminder(custId,balance){
  var c=findById(AppState.allCustomers,custId);
  if(!c||!c.phone) return;
  var lang=getLang();
  var msg=lang==='hi'
    ?'नमस्ते '+c.name+' जी! '+AppState.businessName+' में ₹'+Math.round(balance)+' बाकी है। कृपया भुगतान करें। 🙏'
    :'Hello '+c.name+'! Your outstanding balance at '+AppState.businessName+' is ₹'+Math.round(balance)+'. Kindly arrange payment. Thank you! 🙏';
  window.open(buildWhatsAppLink(c.phone,msg),'_blank');
}

function shareCreditStatement(custId){
  var c=findById(AppState.allCustomers,custId);
  if(!c) return;
  var sales=AppState.allSales.filter(function(s){return s.customerId===custId&&s.payType==='credit';});
  var pays =AppState.allCreditPayments.filter(function(p){return p.customerId===custId;});
  var given=sales.reduce(function(s,x){return s+(x.total||0);},0);
  var paid =pays.reduce(function(s,x){return s+(x.amount||0);},0);
  var bal  =given-paid;
  var text=['📋 Credit Statement — '+AppState.businessName,'Customer: '+c.name,'As of: '+fmtDateLong(todayStr()),'─────────────────','Total Credit: '+fmtCurrency(given),'Total Paid: '+fmtCurrency(paid),'Outstanding: '+fmtCurrency(bal),'─────────────────',bal>0?'Please arrange payment of '+fmtCurrency(bal):'✅ Account fully cleared','Sent via Meri Dukaan'].join('\n');
  shareContent({title:c.name+' — Credit Statement',text:text});
}

/* ══════════════════════════════════════════════
   EXPENSES
══════════════════════════════════════════════ */
function loadExps(){
  var ct=document.getElementById('expenseList');
  if(!ct) return;
  var exps=AppState.allExpenses;
  if(!exps.length){ct.innerHTML='<div class="empty-state"><div class="empty-ic">💸</div><h3>No expenses</h3><button class="btn btn--primary" onclick="openExpForm()">'+t('add_expense')+'</button></div>';return;}
  ct.innerHTML=exps.map(function(e,i){
    return '<div class="exp-card" style="animation-delay:'+(i*0.04)+'s"><div class="exp-main"><span class="exp-cat">'+esc(e.category)+'</span>'+(e.note?'<span class="exp-note">'+esc(e.note)+'</span>':'')+((e.qty&&e.unit)?'<span class="exp-note">'+e.qty+' '+e.unit+'</span>':'')+'<span class="exp-date">'+fmtDate(e.date)+'</span></div><div class="exp-right"><span class="exp-amt">'+fmtCurrency(e.amount)+'</span><div class="row-acts"><button class="ic-btn" onclick="openExpForm(\''+e.id+'\')" aria-label="Edit">✏️</button><button class="ic-btn ic-btn--d" onclick="deleteExp(\''+e.id+'\')" aria-label="Delete">🗑️</button></div></div></div>';
  }).join('');
}
function openExpForm(id){
  clearFormErrors('expForm');
  var f=document.getElementById('expForm');
  if(f) f.reset();
  document.getElementById('efId').value='';
  document.getElementById('efDate').value=todayStr();
  document.getElementById('efTitle').textContent=id?t('edit_expense'):t('add_expense');
  if(id){
    var e=findById(AppState.allExpenses,id);
    if(!e) return;
    document.getElementById('efId').value=e.id;
    document.getElementById('efCategory').value=e.category||'';
    document.getElementById('efAmount').value=e.amount||'';
    document.getElementById('efNote').value=e.note||'';
    document.getElementById('efDate').value=e.date||todayStr();
    if(e.qty) document.getElementById('efQty').value=e.qty;
    if(e.unit) document.getElementById('efUnit').value=e.unit;
  }
  openOverlay('expFormOverlay');
}
function closeExpForm(){ closeOverlay('expFormOverlay'); }
function saveExp(e){
  e.preventDefault();
  clearFormErrors('expForm');
  var cat=(document.getElementById('efCategory').value||'').trim();
  var amt=parseFloat(document.getElementById('efAmount').value||'');
  var note=(document.getElementById('efNote').value||'').trim();
  var date=document.getElementById('efDate').value||todayStr();
  var qty=document.getElementById('efQty').value;
  var unit=document.getElementById('efUnit').value;
  var id=document.getElementById('efId').value;
  var ok=true;
  if(!cat){setFieldError('efCategory','Category is required');ok=false;}
  if(isNaN(amt)||amt<=0){setFieldError('efAmount',t('err_amount'));ok=false;}
  if(!ok) return;
  var data={category:cat,amount:amt,note:note,date:date};
  if(qty) data.qty=parseFloat(qty);
  if(unit) data.unit=unit;
  var btn=document.getElementById('efSubmitBtn');
  btnLoading(btn,true);
  var p=id?withRetry(function(){return bizDoc('expenses',id).update(data);}):withRetry(function(){return bizCol('expenses').add(Object.assign({},data,{createdAt:serverTimestamp()}));});
  p.then(function(){showToast(t('exp_saved'),'success');closeOverlay('expFormOverlay');}).catch(function(){showToast(t('err_save'),'error');}).finally(function(){btnLoading(btn,false);});
}
function deleteExp(id){
  var e=findById(AppState.allExpenses,id);
  if(!e) return;
  softDelete('expenses',id,e.category);
}

/* ══════════════════════════════════════════════
   WASTE
══════════════════════════════════════════════ */
function loadWasteList(){
  var ct=document.getElementById('wasteList');
  if(!ct) return;
  var waste=AppState.allWaste;
  if(!waste.length){ct.innerHTML='<div class="empty-state"><div class="empty-ic">♻️</div><h3>No waste recorded</h3><button class="btn btn--primary" onclick="openWasteForm()">'+t('add_waste')+'</button></div>';return;}
  var today=todayStr();
  var todaySales=AppState.allSales.filter(function(s){return s.date===today;});
  var todayQty =todaySales.reduce(function(s,x){return s+(x.qty||0);},0);
  var todayAmt =todaySales.reduce(function(s,x){return s+(x.total||0);},0);
  var todayRate =todayQty>0?todayAmt/todayQty:0;
  ct.innerHTML=waste.map(function(w,i){
    var cost=todayRate>0?w.qty*todayRate:0;
    return '<div class="waste-card" style="animation-delay:'+(i*0.04)+'s"><div class="waste-main"><span class="waste-qty">'+w.qty+' roti wasted</span><span class="waste-date">'+fmtDate(w.date)+'</span>'+(w.note?'<span class="waste-note">'+esc(w.note)+'</span>':'')+' </div><div class="waste-right">'+(cost>0?'<span class="waste-cost">~'+fmtCurrency(cost)+' lost</span>':'')+'<button class="ic-btn ic-btn--d" onclick="deleteWaste(\''+w.id+'\')" aria-label="Delete">🗑️</button></div></div>';
  }).join('');
}
function openWasteForm(id){
  clearFormErrors('wasteForm');
  var f=document.getElementById('wasteForm');
  if(f) f.reset();
  document.getElementById('wfId').value='';
  document.getElementById('wfDate').value=todayStr();
  document.getElementById('wfTitle').textContent=id?'Edit Waste':t('add_waste');
  var today=todayStr();
  var todayTotal=AppState.allSales.filter(function(s){return s.date===today;}).reduce(function(s,x){return s+(x.qty||0);},0);
  var ctx=document.getElementById('wfCtx');
  if(ctx) ctx.textContent=t('today_made',todayTotal);
  if(id){
    var w=findById(AppState.allWaste,id);
    if(!w) return;
    document.getElementById('wfId').value=w.id;
    document.getElementById('wfQty').value=w.qty;
    document.getElementById('wfNote').value=w.note||'';
    document.getElementById('wfDate').value=w.date;
  }
  openOverlay('wasteFormOverlay');
}
function closeWasteForm(){ closeOverlay('wasteFormOverlay'); }
function saveWaste(e){
  e.preventDefault();
  clearFormErrors('wasteForm');
  var qty=parseInt(document.getElementById('wfQty').value||0,10);
  var note=(document.getElementById('wfNote').value||'').trim();
  var date=document.getElementById('wfDate').value||todayStr();
  var id=document.getElementById('wfId').value;
  if(isNaN(qty)||qty<1||qty>9999){setFieldError('wfQty',t('err_qty'));return;}
  var today=todayStr();
  var todayTotal=AppState.allSales.filter(function(s){return s.date===today;}).reduce(function(s,x){return s+(x.qty||0);},0);
  var doSave=function(){
    var data={qty:qty,note:note,date:date};
    var btn=document.getElementById('wfSubmitBtn');
    btnLoading(btn,true);
    var p=id?withRetry(function(){return bizDoc('waste',id).update(data);}):withRetry(function(){return bizCol('waste').add(Object.assign({},data,{createdAt:serverTimestamp()}));});
    p.then(function(){showToast(t('waste_saved'),'success');closeOverlay('wasteFormOverlay');}).catch(function(){showToast(t('err_save'),'error');}).finally(function(){btnLoading(btn,false);});
  };
  if(todayTotal>0&&qty/todayTotal>0.3){
    showConfirm('⚠️',t('waste_high'),qty+' wasted / '+todayTotal+' made = '+Math.round(qty/todayTotal*100)+'%',{danger:false}).then(function(ok){if(ok) doSave();});
  } else { doSave(); }
}
function deleteWaste(id){
  softDelete('waste',id,'Waste record');
}
