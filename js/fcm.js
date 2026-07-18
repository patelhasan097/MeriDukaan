/* MERI DUKAAN v8 — FCM Push Notifications (optional) */
function initFCM(){
  if(localStorage.getItem('mdNotif')==='false') return;
  if(!('Notification' in window)||!navigator.serviceWorker) return;
  if(typeof firebase==='undefined'||!firebase.messaging) return;
  try{
    var messaging=firebase.messaging();
    if(Notification.permission==='default'){
      Notification.requestPermission().then(function(p){
        if(p==='granted') _getFCMToken(messaging);
      });
    } else if(Notification.permission==='granted'){
      _getFCMToken(messaging);
    }
    messaging.onMessage(function(payload){
      var n=payload.notification||{};
      showToast((n.title||'Alert')+': '+(n.body||''),'info',5000);
      _addNotif({title:n.title||'Alert',body:n.body||'',date:todayStr(),read:false});
    });
  }catch(err){ console.warn('[FCM]',err.message); }
}
function _getFCMToken(messaging){
  if(!VAPID_KEY) return;
  navigator.serviceWorker.ready.then(function(sw){
    messaging.getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:sw}).then(function(token){
      if(token) bizRef().update({fcmToken:token}).catch(function(){});
    }).catch(function(){});
  });
}
function _addNotif(n){
  var list=JSON.parse(localStorage.getItem('mdNotifs')||'[]');
  list.unshift(Object.assign({},n,{id:Date.now()}));
  localStorage.setItem('mdNotifs',JSON.stringify(list.slice(0,30)));
  _updateNotifBadge(list.filter(function(x){return !x.read;}).length);
}
function _updateNotifBadge(n){
  var b=document.getElementById('notifBadge');
  if(b){b.textContent=n>0?n:'';b.style.display=n>0?'flex':'none';}
}
function loadNotifications(){
  var list=JSON.parse(localStorage.getItem('mdNotifs')||'[]');
  list.forEach(function(n){n.read=true;});
  localStorage.setItem('mdNotifs',JSON.stringify(list));
  _updateNotifBadge(0);
  var ct=document.getElementById('notifList'); if(!ct) return;
  ct.innerHTML=list.length?list.map(function(n){return '<div class="notif-item"><div class="notif-title">'+esc(n.title||'')+'</div><div class="notif-body">'+esc(n.body||'')+'</div><div class="notif-date">'+fmtDate(n.date||'')+'</div></div>';}).join(''):'<p class="empty-mini">No notifications yet.</p>';
}
// Init badge on load
(function(){ var u=JSON.parse(localStorage.getItem('mdNotifs')||'[]').filter(function(n){return !n.read;}).length; _updateNotifBadge(u); })();
