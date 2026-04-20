/* ================================================
   MERI DUKAAN v6.0 — SETTINGS
   Settings · Team · Import/Export · App Start
   ================================================ */

function loadSettings() {
    if(currentUser){
        var avatar=document.getElementById('suAvatar');
        if(avatar){if(currentUser.photoURL){avatar.src=currentUser.photoURL;avatar.style.display='';}else avatar.style.display='none';}
        var el;
        el=document.getElementById('suName');if(el)el.textContent=currentUser.displayName||'User';
        el=document.getElementById('suEmail');if(el)el.textContent=currentUser.email;
        el=document.getElementById('suRole');if(el)el.textContent=userRole.charAt(0).toUpperCase()+userRole.slice(1);
    }
    updateThemeUI(); updateSyncStatus();
    var vEl=document.getElementById('appVersionText');
    if(vEl) vEl.textContent='v6.0 • PWA • '+(navigator.onLine?'Online':'Offline');
}
function updateSyncStatus(){
    var dot=document.getElementById('syncDot'),status=document.getElementById('syncStatus');
    if(!dot||!status) return;
    if(navigator.onLine){dot.className='sync-dot online';status.textContent='Connected • Real-time sync active';}
    else{dot.className='sync-dot offline';status.textContent='Offline • Changes will sync when online';}
}
window.addEventListener('online',function(){updateSyncStatus();if(isScreenActive('settingScreen'))loadSettings();});
window.addEventListener('offline',function(){updateSyncStatus();if(isScreenActive('settingScreen'))loadSettings();});

// ============ CHANGE PIN ============
function showChangePinUI(){
    if(!canModify()&&userRole!=='admin'){showToast('❌ Only owner/admin can change PIN','error');return;}
    document.getElementById('chpOld').value=''; document.getElementById('chpNew').value=''; document.getElementById('chpConfirm').value='';
    openOverlay('changePinOverlay');
}
async function saveNewPin(e){
    e.preventDefault();
    var old=document.getElementById('chpOld').value,nw=document.getElementById('chpNew').value,cf=document.getElementById('chpConfirm').value;
    var sv=''; try{sv=atob(localStorage.getItem('mdPin')||'');}catch(er){}
    if(old!==sv){showToast('❌ Current PIN is wrong!','error');return;}
    if(nw.length!==4||!/^\d{4}$/.test(nw)){showToast('❌ PIN must be exactly 4 digits!','error');return;}
    if(nw!==cf){showToast('❌ New PINs do not match!','error');return;}
    if(nw===old){showToast('❌ New PIN must be different!','error');return;}
    var btn=document.getElementById('chpSubmitBtn'); btnLoading(btn,true);
    var encoded=btoa(nw);
    try{await businessRef.update({pin:encoded});localStorage.setItem('mdPin',encoded);showToast('✅ PIN changed!');closeOverlay('changePinOverlay');}
    catch(err){console.error('[PIN]',err);showToast('❌ Error saving PIN','error');}finally{btnLoading(btn,false);}
}

// ============ TEAM ============
function openTeamManager(){
    if(userRole==='staff'){showToast('❌ Only owner/admin can manage team','error');return;}
    openOverlay('teamOverlay'); document.getElementById('addMemberForm').style.display='none'; loadTeamMembers();
}
async function loadTeamMembers(){
    try{
        var doc=await businessRef.get(); var data=doc.data(); var members=data.members||[];
        var ct=document.getElementById('teamMemberList'); if(!ct) return;
        var h='<div class="team-card"><div class="tc-avatar">👑</div><div class="tc-info"><h4>'+esc(data.ownerName||data.ownerEmail)+'</h4><p>'+esc(data.ownerEmail)+'</p></div><span class="tc-role">Owner</span></div>';
        members.forEach(function(m,i){
            h+='<div class="team-card"><div class="tc-avatar">👤</div><div class="tc-info"><h4>'+esc(m.email)+'</h4><p>Role: '+(m.role==='admin'?'Admin':'Staff')+(m.addedAt?' • Added: '+m.addedAt:'')+'</p></div>';
            h+='<span class="tc-role '+(m.role==='staff'?'staff':'')+'">'+( m.role==='admin'?'👑 Admin':'👤 Staff')+'</span>';
            if(userRole==='owner') h+='<button class="tc-remove" onclick="removeTeamMember('+i+')" aria-label="Remove member">❌</button>';
            h+='</div>';
        });
        if(!members.length) h+='<div class="no-data" style="margin-top:12px">No team members added yet</div>';
        ct.innerHTML=h;
    }catch(err){console.error('[Team]',err);showToast('❌ Error loading team','error');}
}
function showAddMember(){
    var formEl=document.getElementById('addMemberForm'); if(formEl) formEl.style.display='block';
    document.getElementById('tmEmail').value=''; document.getElementById('tmRole').value='admin';
    var tg=document.querySelectorAll('#teamOverlay .tgl'); tg.forEach(function(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');}); if(tg[0]){tg[0].classList.add('active');tg[0].setAttribute('aria-pressed','true');}
    setTimeout(function(){var el=document.getElementById('tmEmail');if(el)el.focus();},300);
}
async function addTeamMember(e){
    e.preventDefault();
    var email=document.getElementById('tmEmail').value.trim().toLowerCase(), role=document.getElementById('tmRole').value;
    if(!email){showToast('❌ Enter email address!','error');return;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){showToast('❌ Enter valid email!','error');return;}
    var btn=document.getElementById('tmSubmitBtn'); btnLoading(btn,true);
    try{
        var doc=await businessRef.get(); var data=doc.data(); var members=data.members||[]; var memberEmails=data.memberEmails||[];
        if(email===(data.ownerEmail||'').toLowerCase()){showToast('❌ This is the owner email!','error');return;}
        if(memberEmails.indexOf(email)!==-1){showToast('❌ Already a team member!','error');return;}
        members.push({email:email,role:role,addedAt:todayStr()}); memberEmails.push(email);
        await businessRef.update({members:members,memberEmails:memberEmails});
        document.getElementById('addMemberForm').style.display='none';
        showToast('✅ '+email+' added as '+role+'!'); loadTeamMembers();
    }catch(err){console.error('[Team]',err);showToast('❌ Error adding member','error');}finally{btnLoading(btn,false);}
}
function removeTeamMember(index){
    showConfirm('❌','Remove Member?','This person will lose access to your data.',async function(){
        try{
            var doc=await businessRef.get(); var data=doc.data(); var members=data.members||[]; var memberEmails=data.memberEmails||[];
            if(index>=0&&index<members.length){
                var email=members[index].email; members.splice(index,1); var ei=memberEmails.indexOf(email); if(ei!==-1)memberEmails.splice(ei,1);
                await businessRef.update({members:members,memberEmails:memberEmails}); showToast('✅ Member removed'); loadTeamMembers();
            }
        }catch(err){console.error('[Team]',err);showToast('❌ Error removing member','error');}
    });
}

// ============ EXPORT ============
async function exportData(){
    var exportBtn=document.querySelector('[onclick="exportData()"]'); if(exportBtn) exportBtn.style.pointerEvents='none';
    try{
        var data={app:'MeriDukaan',version:'6.0',exportDate:new Date().toISOString(),
            customers:allCustomers.map(cleanForExport),sales:allSales.map(cleanForExport),
            expenses:allExpenses.map(cleanForExport),waste:allWaste.map(cleanForExport),
            creditPayments:allCreditPayments.map(cleanForExport),notes:allNotes.map(cleanForExport)};
        var json=JSON.stringify(data,null,2);
        var blob=new Blob([json],{type:'application/json'});
        var url=URL.createObjectURL(blob); var a=document.createElement('a');
        a.href=url; a.download='MeriDukaan_Backup_'+todayStr()+'.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast('✅ Backup downloaded!');
    }catch(err){console.error('[Export]',err);showToast('❌ Export failed','error');}
    finally{if(exportBtn) exportBtn.style.pointerEvents='';}
}

// ============ IMPORT ============
function importData(e){
    var file=e.target.files[0]; if(!file) return;
    if(userRole==='staff'){showToast('❌ Staff cannot import data','error');e.target.value='';return;}
    showConfirm('📥','Import Data?','This will REPLACE all current data. Download backup first!',function(){
        var reader=new FileReader();
        reader.onload=async function(ev){
            try{
                var data=JSON.parse(ev.target.result);
                if(!data.customers&&!data.sales){showToast('❌ Invalid backup file!','error');return;}
                showToast('⏳ Importing data...','success');
                await deleteCollection('customers'); await deleteCollection('sales'); await deleteCollection('expenses'); await deleteCollection('waste'); await deleteCollection('creditPayments');
                var custIdMap={};
                var custs=data.customers||[];
                for(var i=0;i<custs.length;i++){var c=Object.assign({},custs[i]);var oldId=c.id;delete c.id;if(c.createdAt&&typeof c.createdAt==='string')delete c.createdAt;var ref=await businessRef.collection('customers').add(c);if(oldId)custIdMap[oldId]=ref.id;}
                var sales=data.sales||[];
                for(var j=0;j<sales.length;j++){var s=Object.assign({},sales[j]);delete s.id;if(s.customerId)s.customerId=custIdMap[s.customerId]||'';if(s.paymentType==='udhari')s.paymentType='credit';if(!s.saleType)s.saleType='regular';if(s.createdAt&&typeof s.createdAt==='string')delete s.createdAt;await businessRef.collection('sales').add(s);}
                var exps=data.expenses||[];
                for(var k=0;k<exps.length;k++){var x=Object.assign({},exps[k]);delete x.id;if(x.createdAt&&typeof x.createdAt==='string')delete x.createdAt;await businessRef.collection('expenses').add(x);}
                var wastes=data.waste||[];
                for(var w=0;w<wastes.length;w++){var wt=Object.assign({},wastes[w]);delete wt.id;if(wt.createdAt&&typeof wt.createdAt==='string')delete wt.createdAt;await businessRef.collection('waste').add(wt);}
                var pays=data.creditPayments||data.udhariPayments||[];
                for(var p=0;p<pays.length;p++){var py=Object.assign({},pays[p]);delete py.id;if(py.customerId)py.customerId=custIdMap[py.customerId]||'';if(py.createdAt&&typeof py.createdAt==='string')delete py.createdAt;await businessRef.collection('creditPayments').add(py);}
                showToast('✅ Imported! ('+custs.length+' customers, '+sales.length+' sales)');
            }catch(err){console.error('[Import]',err);showToast('❌ Import failed: '+(err.message||'Unknown error'),'error');}
        };
        reader.readAsText(file);
    });
    e.target.value='';
}
async function deleteCollection(colName){
    try{
        var snap=await businessRef.collection(colName).get(); var docs=snap.docs; if(!docs.length) return;
        for(var i=0;i<docs.length;i+=400){var batch=fdb.batch();docs.slice(i,i+400).forEach(function(doc){batch.delete(doc.ref);});await batch.commit();}
    }catch(err){console.error('[Delete] Error in '+colName+':',err);throw err;}
}
function resetAllData(){
    if(userRole==='staff'){showToast('❌ Only owner can delete all data','error');return;}
    showConfirm('🗑️','DELETE ALL DATA?','All data will be permanently removed. This CANNOT be undone! Download backup first.',async function(){
        try{
            showToast('⏳ Deleting all data...','success');
            await deleteCollection('customers');await deleteCollection('sales');await deleteCollection('expenses');await deleteCollection('waste');await deleteCollection('creditPayments');
            showToast('✅ All data deleted!');
            if(isScreenActive('dashboardScreen'))refreshDash();else if(isScreenActive('settingScreen'))goTo('dashboardScreen');
        }catch(err){console.error('[Reset]',err);showToast('❌ Error deleting data','error');}
    });
}

// ============ APP START ============
function startApp(){
    console.log('🫓 Meri Dukaan v6.0 Starting...');
    applyTheme();
    var splashDone=false,authReady=false,pendingUser=null;
    function proceed(){
        if(!splashDone||!authReady) return;
        if(pendingUser){handleAuthenticated(pendingUser);}
        else{goTo('loginScreen');var btn=document.getElementById('googleBtn');if(btn){btn.disabled=false;var span=btn.querySelector('span');if(span)span.textContent='Sign in with Google';}}
    }
    setTimeout(function(){splashDone=true;proceed();},1500);
    auth.getRedirectResult().then(function(){}).catch(function(err){if(err.code&&err.code!=='auth/popup-closed-by-user')console.warn('[Auth] Redirect:',err.message||err);});
    auth.onAuthStateChanged(function(user){pendingUser=user;authReady=true;proceed();});
}

startApp();

console.log('%c🫓 Meri Dukaan v6.0 %c World-Class PWA','background:#e65100;color:white;padding:8px 12px;border-radius:8px 0 0 8px;font-weight:bold;font-size:14px','background:#1a1a2e;color:white;padding:8px 12px;border-radius:0 8px 8px 0;font-size:14px');