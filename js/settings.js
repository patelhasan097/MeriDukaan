/* MERI DUKAAN v8 — Settings */
function loadSettings(){
  var u=AppState.firebaseUser;
  function se(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  function sv(id,v){var el=document.getElementById(id);if(el)el.value=v;}
  se('setEmail',u?u.email:'');se('setName',u?u.displayName||'':'');
  se('setBizNameDisp',AppState.businessName);
  sv('setUpiVpa',AppState.upiVpa||'');
  sv('setWeekStart',String(AppState.weekStart||1));
  sv('setSupPhone',localStorage.getItem('mdSupPhone')||'');
  var ni=document.getElementById('setNotifToggle');
  if(ni) ni.checked=localStorage.getItem('mdNotif')!=='false';
  var ss=document.getElementById('setSyncStatus');
  if(ss) ss.textContent=AppState.isOnline?'✅ Online':'📴 Offline';
  document.querySelectorAll('[data-theme-btn]').forEach(function(b){ b.classList.toggle('active',b.dataset.themeBtn===(localStorage.getItem('mdTheme')||'dark')); });
  document.querySelectorAll('[data-lang-btn]').forEach(function(b){ b.classList.toggle('active',b.dataset.langBtn===getLang()); });
  _renderTeamList();
  document.querySelectorAll('.owner-only').forEach(function(el){ el.style.display=canModify()?'':'none'; });
}

function _renderTeamList(){
  var ct=document.getElementById('teamList'); if(!ct) return;
  var m=AppState.memberEmails||[];
  ct.innerHTML=m.length?m.map(function(e){return '<div class="team-row"><span>'+esc(e)+'</span><button class="btn btn--sm btn--ghost" onclick="removeStaff(\''+esc(e)+'\')" style="color:var(--rd)">Remove</button></div>';}).join(''):'<p class="empty-mini">No staff members yet.</p>';
}

function changeLang(lang){
  setLang(lang);
  document.querySelectorAll('[data-lang-btn]').forEach(function(b){ b.classList.toggle('active',b.dataset.langBtn===lang); });
  withRetry(function(){return bizRef().update({language:lang});}).catch(function(){});
}

function saveBizName(){
  var el=document.getElementById('setBizNameInput');
  var name=(el?el.value:'').trim();
  if(!name) return;
  withRetry(function(){return bizRef().update({businessName:name});}).then(function(){
    AppState.businessName=name;
    var d=document.getElementById('setBizNameDisp'); if(d) d.textContent=name;
    showToast('✅ Business name updated!','success');
    closeOverlay('bizNameOverlay');
  }).catch(function(){showToast(t('err_save'),'error');});
}

function saveUpiVpa(){
  var v=(document.getElementById('setUpiVpa')||{value:''}).value.trim();
  withRetry(function(){return bizRef().update({upiVpa:v});}).then(function(){
    AppState.upiVpa=v; showToast(t('upi_saved'),'success');
  }).catch(function(){showToast(t('err_save'),'error');});
}
function saveSupPhone(){
  var v=(document.getElementById('setSupPhone')||{value:''}).value.trim();
  localStorage.setItem('mdSupPhone',v);
  showToast('✅ Supplier phone saved!','success');
}
function saveWeekStart(){
  var v=parseInt((document.getElementById('setWeekStart')||{value:'1'}).value,10);
  AppState.weekStart=v;
  withRetry(function(){return bizRef().update({weekStart:v});}).then(function(){ showToast('✅ Week start saved!','success'); }).catch(function(){});
}
function toggleNotif(on){
  localStorage.setItem('mdNotif',on?'true':'false');
  if(on&&typeof initFCM==='function') initFCM();
  showToast(on?'🔔 Notifications enabled!':'🔕 Notifications off','info');
}

/* ── PIN Change ── */
var _cpStep=0,_cpFirst='';
function openChangePinOverlay(){
  _cpStep=0;_cpFirst='';
  document.getElementById('cpLabel').textContent='Enter new PIN';
  document.querySelectorAll('#cpDots .pin-dot').forEach(function(d){d.classList.remove('pin-dot--filled');});
  openOverlay('changePinOverlay');
}
var _cpIn='';
function cpKey(d){
  if(_cpIn.length>=4) return;
  _cpIn+=d;
  document.querySelectorAll('#cpDots .pin-dot').forEach(function(dot,i){ dot.classList.toggle('pin-dot--filled',i<_cpIn.length); });
  if(_cpIn.length===4) setTimeout(_cpHandle,80);
}
function cpBack(){ if(_cpIn.length){_cpIn=_cpIn.slice(0,-1);document.querySelectorAll('#cpDots .pin-dot').forEach(function(d,i){d.classList.toggle('pin-dot--filled',i<_cpIn.length);});} }
function _cpHandle(){
  if(_cpStep===0){ _cpFirst=_cpIn;_cpIn=''; _cpStep=1; document.getElementById('cpLabel').textContent=t('confirm_pin'); document.querySelectorAll('#cpDots .pin-dot').forEach(function(d){d.classList.remove('pin-dot--filled');}); return; }
  if(_cpIn!==_cpFirst){ _cpStep=0;_cpIn='';_cpFirst=''; document.querySelectorAll('#cpDots .pin-dot').forEach(function(d){d.classList.remove('pin-dot--filled');}); document.getElementById('cpLabel').textContent='Enter new PIN'; showToast(t('pin_mismatch'),'error'); return; }
  sha256(_cpIn).then(function(hash){
    return bizRef().update({pin:hash,pinVersion:serverTimestamp()}).then(function(){
      return sha256(AppState.bizId+AppState.firebaseUser.uid+hash).then(function(tok){ sessionStorage.setItem('mdSess',tok); });
    });
  }).then(function(){ showToast(t('pin_changed'),'success'); closeOverlay('changePinOverlay'); _cpIn=''; })
  .catch(function(){ showToast(t('err_save'),'error'); });
}

/* ── Team ── */
function addStaff(){
  var el=document.getElementById('staffEmailInput');
  var email=(el?el.value:'').trim().toLowerCase();
  if(!email||!email.includes('@')){ showToast('Enter a valid email','error'); return; }
  var m=[].concat(AppState.memberEmails||[]);
  if(m.indexOf(email)!==-1){ showToast('Already a member','error'); return; }
  m.push(email);
  withRetry(function(){return bizRef().update({memberEmails:m});}).then(function(){ AppState.memberEmails=m; if(el) el.value=''; showToast(t('staff_added'),'success'); _renderTeamList(); }).catch(function(){showToast(t('err_save'),'error');});
}
function removeStaff(email){
  showConfirm('👤','Remove Staff','Remove '+email+' from your team?').then(function(ok){
    if(!ok) return;
    var m=(AppState.memberEmails||[]).filter(function(e){return e!==email;});
    withRetry(function(){return bizRef().update({memberEmails:m});}).then(function(){ AppState.memberEmails=m; showToast(t('staff_removed'),'success'); _renderTeamList(); }).catch(function(){showToast(t('err_generic'),'error');});
  });
}

/* ── Data Export/Import ── */
function exportAllData(){
  var data={exportedAt:new Date().toISOString(),bizId:AppState.bizId,sales:AppState.allSales,expenses:AppState.allExpenses,customers:AppState.allCustomers,creditPayments:AppState.allCreditPayments,notes:AppState.allNotes,waste:AppState.allWaste};
  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='meri-dukaan-export-'+todayStr()+'.json';a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Data exported!','success');
}
function importDataFile(e){
  var file=e.target.files&&e.target.files[0];
  if(!file) return;
  showConfirm('⚠️','Import Data?','This will ADD data from the file. Cannot be undone.').then(function(ok){
    if(!ok) return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var data=JSON.parse(ev.target.result);
        if(!Array.isArray(data.sales)||!Array.isArray(data.customers)) throw new Error('Invalid format');
        var cols=[['sales',data.sales],['expenses',data.expenses||[]],['customers',data.customers]];
        var doCol=function(i){
          if(i>=cols.length){showToast('✅ Data imported!','success');return;}
          var name=cols[i][0],items=cols[i][1];
          var CHUNK=499,chunks=[];
          for(var j=0;j<items.length;j+=CHUNK) chunks.push(items.slice(j,j+CHUNK));
          var doChunk=function(ci){
            if(ci>=chunks.length){doCol(i+1);return;}
            var batch=batchWrite();
            chunks[ci].forEach(function(item){var ref=bizCol(name).doc();var d2=Object.assign({},item);delete d2.id;batch.set(ref,d2);});
            batch.commit().then(function(){doChunk(ci+1);}).catch(function(err){showToast('Import error: '+err.message,'error');});
          };
          doChunk(0);
        };
        doCol(0);
      }catch(err){showToast('Import failed: '+err.message,'error',5000);}
    };
    reader.readAsText(file);
  });
}
