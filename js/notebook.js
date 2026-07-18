/* MERI DUKAAN v8 — Notebook */
var _noteSearch='', _noteSearchDb=debounce(function(v){_noteSearch=v||'';loadNotes();},250);
var NOTE_CATS={general:{label:'General',icon:'📝'},reminder:{label:'Reminder',icon:'🔔'},idea:{label:'Idea',icon:'💡'},supplier:{label:'Supplier',icon:'🏪'}};

function loadNotes(){
  var notes=[].concat(AppState.allNotes);
  var ce=document.getElementById('noteCount'); if(ce) ce.textContent=notes.length+' note'+(notes.length!==1?'s':'');
  if(_noteSearch){var q=_noteSearch.toLowerCase();notes=notes.filter(function(n){return (n.title||'').toLowerCase().indexOf(q)!==-1||(n.content||'').toLowerCase().indexOf(q)!==-1;});}
  var pinned=notes.filter(function(n){return n.pinned;}),rest=notes.filter(function(n){return !n.pinned;});
  var sorted=pinned.concat(rest);
  var ct=document.getElementById('noteList'); if(!ct) return;
  if(!AppState.allNotes.length){ct.innerHTML='<div class="empty-state"><div class="empty-ic">📓</div><h3>No notes yet</h3><p>Save supplier numbers, reminders, ideas.</p><button class="btn btn--primary" onclick="openNoteForm()">+ Write Note</button></div>';return;}
  if(!sorted.length&&_noteSearch){ct.innerHTML='<div class="empty-state"><div class="empty-ic">🔍</div><h3>No results for "'+esc(_noteSearch)+'"</h3></div>';return;}
  ct.innerHTML=sorted.map(function(note,i){
    var cat=NOTE_CATS[note.category]||NOTE_CATS.general;
    var preview=(note.content||'').substring(0,120)+((note.content||'').length>120?'…':'');
    return '<div class="note-card'+(note.pinned?' note-card--pin':'')+'" style="animation-delay:'+(i*0.04)+'s"><div class="note-card__top">'+(note.title?'<div class="note-title">'+esc(note.title)+'</div>':'')+'<div class="note-meta"><span class="badge badge--outline">'+cat.icon+' '+cat.label+'</span>'+(note.pinned?'<span class="note-pin">📌</span>':'')+'</div></div><div class="note-body">'+esc(preview)+'</div><div class="note-foot"><span class="note-date">'+fmtDateLong(note.date||'')+'</span><div class="row-acts"><button class="ic-btn" onclick="copyNote(\''+note.id+'\')" aria-label="Copy">📋</button><button class="ic-btn" onclick="togglePin(\''+note.id+'\')" aria-label="'+(note.pinned?'Unpin':'Pin')+'">'+(note.pinned?'📍':'📌')+'</button>'+(canModify()?'<button class="ic-btn" onclick="openNoteForm(\''+note.id+'\')" aria-label="Edit">✏️</button><button class="ic-btn ic-btn--d" onclick="deleteNote(\''+note.id+'\')" aria-label="Delete">🗑️</button>':'')+'</div></div></div>';
  }).join('');
}
function searchNotes(v){_noteSearchDb(v);}
function clearNoteSearch(){_noteSearch='';var el=document.getElementById('noteSearch');if(el)el.value='';loadNotes();}

function openNoteForm(id){
  clearFormErrors('noteForm');var f=document.getElementById('noteForm');if(f)f.reset();
  document.getElementById('nfId').value='';
  document.getElementById('nfCat').value='general';
  document.getElementById('nfPin').checked=false;
  document.getElementById('nfFormTitle').textContent=id?'Edit Note':'New Note';
  document.querySelectorAll('#noteForm .cat-btn').forEach(function(b){b.classList.toggle('cat-btn--active',b.dataset.cat==='general');});
  if(id){
    var note=findById(AppState.allNotes,id); if(!note) return;
    document.getElementById('nfId').value=note.id;
    document.getElementById('nfTitle').value=note.title||'';
    document.getElementById('nfContent').value=note.content||'';
    document.getElementById('nfCat').value=note.category||'general';
    document.getElementById('nfPin').checked=!!note.pinned;
    document.querySelectorAll('#noteForm .cat-btn').forEach(function(b){b.classList.toggle('cat-btn--active',b.dataset.cat===note.category);});
  }
  openOverlay('noteFormOverlay');
}
function closeNoteForm(){closeOverlay('noteFormOverlay');}
function setNoteCat(cat,btn){
  document.getElementById('nfCat').value=cat;
  document.querySelectorAll('#noteForm .cat-btn').forEach(function(b){b.classList.remove('cat-btn--active');});
  btn.classList.add('cat-btn--active');
}
function saveNote(e){
  e.preventDefault();
  var content=(document.getElementById('nfContent').value||'').trim();
  if(!content){setFieldError('nfContent',t('note_content_req'));return;}
  var data={title:(document.getElementById('nfTitle').value||'').trim(),content:content,category:document.getElementById('nfCat').value||'general',pinned:document.getElementById('nfPin').checked,date:todayStr()};
  var id=document.getElementById('nfId').value;
  var btn=document.getElementById('nfSubmitBtn');btnLoading(btn,true);
  var p=id?withRetry(function(){return bizDoc('notes',id).update(data);}):withRetry(function(){return bizCol('notes').add(Object.assign({},data,{createdAt:serverTimestamp()}));});
  p.then(function(){showToast(t('note_saved'),'success');closeOverlay('noteFormOverlay');}).catch(function(){showToast(t('err_save'),'error');}).finally(function(){btnLoading(btn,false);});
}
function deleteNote(id){
  if(!canModify()){showToast(t('staff_cannot'),'error');return;}
  var note=findById(AppState.allNotes,id); if(!note) return;
  showConfirm('🗑️','Delete Note?','"'+(note.title||note.content.substring(0,40))+'" will be deleted.').then(function(ok){
    if(!ok) return;
    withRetry(function(){return bizDoc('notes',id).delete();}).then(function(){showToast(t('note_deleted'),'success');}).catch(function(){showToast(t('err_generic'),'error');});
  });
}
function togglePin(id){
  var note=findById(AppState.allNotes,id); if(!note) return;
  withRetry(function(){return bizDoc('notes',id).update({pinned:!note.pinned});});
}
function copyNote(id){
  var note=findById(AppState.allNotes,id); if(!note) return;
  var text=(note.title?note.title+'\n':'')+(note.content||'');
  if(navigator.clipboard){navigator.clipboard.writeText(text).then(function(){showToast(t('note_copied'),'success');}).catch(function(){_fallbackCopy(text);});}
  else _fallbackCopy(text);
}
function _fallbackCopy(text){
  var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:-9999px';
  document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');showToast(t('note_copied'),'success');}
  catch(e){showToast(t('err_generic'),'error');}
  document.body.removeChild(ta);
}
