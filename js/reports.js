/* MERI DUKAAN v8 — Reports */
var _rptTab='daily', _rptDate='';

function loadReport(){
  _rptDate = _rptDate||todayStr();
  _renderReport();
}
function setReportTab(tab){
  _rptTab=tab;
  document.querySelectorAll('[data-rt]').forEach(function(b){ b.classList.toggle('tab-btn--active',b.dataset.rt===tab); });
  if(tab!=='custom') _rptDate=todayStr();
  _renderReport();
}
function rptPickDate(ds){ _rptDate=ds; _renderReport(); }

function _getRange(){
  var ws=AppState.weekStart;
  if(_rptTab==='daily')   return getPeriodRange('daily',  _rptDate,ws);
  if(_rptTab==='weekly')  return getPeriodRange('weekly', _rptDate,ws);
  if(_rptTab==='monthly') return getPeriodRange('monthly',_rptDate,ws);
  return getPeriodRange('daily',_rptDate,ws);
}
function _getLabel(){
  var r=_getRange();
  if(_rptTab==='daily')   return fmtDateLong(r.start);
  if(_rptTab==='weekly')  return fmtDate(r.start)+' – '+fmtDate(r.end);
  if(_rptTab==='monthly'){var d=toDate(r.start);return d?d.toLocaleDateString('en-IN',{month:'long',year:'numeric'}):'';}
  return fmtDateLong(r.start);
}

function _renderReport(){
  var r=_getRange();
  var sales=dataInRange(AppState.allSales,   r.start,r.end);
  var exps =dataInRange(AppState.allExpenses, r.start,r.end);
  var custs=AppState.allCustomers;
  var totalRoti=sales.reduce(function(s,x){return s+(x.qty||0);},0);
  var totalRev =sales.reduce(function(s,x){return s+(x.total||0);},0);
  var cashRev  =sales.filter(function(s){return s.payType==='cash';  }).reduce(function(s,x){return s+(x.total||0);},0);
  var upiRev   =sales.filter(function(s){return s.payType==='upi';   }).reduce(function(s,x){return s+(x.total||0);},0);
  var credRev  =sales.filter(function(s){return s.payType==='credit';}).reduce(function(s,x){return s+(x.total||0);},0);
  var totalExp =exps.reduce(function(s,x){return s+(x.amount||0);},0);
  var profit   =totalRev-totalExp;
  function se(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  se('rptLabel',  _getLabel());
  se('rptRoti',   totalRoti.toLocaleString('en-IN'));
  se('rptRev',    fmtCurrency(totalRev));
  se('rptExp',    fmtCurrency(totalExp));
  se('rptProfit', fmtCurrency(profit));
  se('rptCash',   fmtCurrency(cashRev));
  se('rptUpi',    fmtCurrency(upiRev));
  se('rptCredit', fmtCurrency(credRev));
  var pc=document.getElementById('rptProfitCard');
  if(pc) pc.classList.toggle('card--loss',profit<0);
  var nd=document.getElementById('rptNoData');
  if(nd) nd.style.display=(!sales.length&&!exps.length)?'block':'none';
  _renderSalesByCust(sales,custs);
  _renderExpByCat(exps);
  _renderRptChart(sales,exps);
}
function _renderSalesByCust(sales,custs){
  var ct=document.getElementById('rptByCust');
  if(!ct) return;
  var map={};
  sales.forEach(function(s){if(!map[s.customerId])map[s.customerId]={qty:0,total:0};map[s.customerId].qty+=s.qty||0;map[s.customerId].total+=s.total||0;});
  var rows=Object.entries(map).map(function(e){return {c:findById(custs,e[0]),qty:e[1].qty,total:e[1].total};}).filter(function(r){return r.c;}).sort(function(a,b){return b.total-a.total;});
  ct.innerHTML=rows.length?rows.map(function(r){return '<div class="rpt-row"><span class="rpt-row__n">'+esc(r.c.name)+'</span><span class="rpt-row__q">'+r.qty+' roti</span><span class="rpt-row__a">'+fmtCurrency(r.total)+'</span></div>';}).join(''):'<p class="empty-mini">No sales</p>';
}
function _renderExpByCat(exps){
  var ct=document.getElementById('rptByCat');
  if(!ct) return;
  var map={};
  exps.forEach(function(e){map[e.category]=(map[e.category]||0)+(e.amount||0);});
  var rows=Object.entries(map).sort(function(a,b){return b[1]-a[1];});
  ct.innerHTML=rows.length?rows.map(function(r){return '<div class="rpt-row"><span class="rpt-row__n">'+esc(r[0])+'</span><span class="rpt-row__a">'+fmtCurrency(r[1])+'</span></div>';}).join(''):'<p class="empty-mini">No expenses</p>';
}
function _renderRptChart(sales,exps){
  var canvas=document.getElementById('rptChart');
  if(!canvas||typeof Chart==='undefined') return;
  if(window._rptChart){window._rptChart.destroy();window._rptChart=null;}
  if(!sales.length&&!exps.length) return;
  var allDates=[].concat(sales.map(function(s){return s.date;}),exps.map(function(e){return e.date;}));
  allDates=[...new Set(allDates)].sort();
  var rbd={},ebd={};
  sales.forEach(function(s){rbd[s.date]=(rbd[s.date]||0)+(s.total||0);});
  exps.forEach(function(e){ebd[e.date]=(ebd[e.date]||0)+(e.amount||0);});
  window._rptChart=new Chart(canvas,{
    type:'bar',
    data:{
      labels:allDates.map(function(d){return fmtDate(d);}),
      datasets:[
        {label:'Revenue',data:allDates.map(function(d){return rbd[d]||0;}),backgroundColor:'rgba(230,81,0,0.75)',borderRadius:3},
        {label:'Expenses',data:allDates.map(function(d){return ebd[d]||0;}),backgroundColor:'rgba(220,38,38,0.5)',borderRadius:3}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{tooltip:{callbacks:{label:function(ctx){return ctx.dataset.label+': '+fmtCurrency(ctx.raw);}}},legend:{labels:{color:'#9399b8',font:{size:11}}}},
      scales:{x:{ticks:{color:'#565d80',maxTicksLimit:10},grid:{display:false}},y:{ticks:{color:'#565d80',callback:function(v){return '₹'+Math.round(v);}},grid:{color:'rgba(255,255,255,0.04)'}}}
    }
  });
}

function showExportSummary(){
  var r=_getRange();
  var sales=dataInRange(AppState.allSales,r.start,r.end);
  var exps =dataInRange(AppState.allExpenses,r.start,r.end);
  var totalRoti=sales.reduce(function(s,x){return s+(x.qty||0);},0);
  var rev=sales.reduce(function(s,x){return s+(x.total||0);},0);
  var exp=exps.reduce(function(s,x){return s+(x.amount||0);},0);
  var ct=document.getElementById('exportSumContent');
  if(ct) ct.innerHTML='<div class="exp-sum"><div class="exp-sum__period">'+_getLabel()+'</div><div class="es-row"><span>🫓 Roti sold</span><strong>'+totalRoti.toLocaleString('en-IN')+'</strong></div><div class="es-row"><span>💰 Revenue</span><strong>'+fmtCurrency(rev)+'</strong></div><div class="es-row"><span>💸 Expenses</span><strong>'+fmtCurrency(exp)+'</strong></div><div class="es-row es-row--profit"><span>📈 Profit</span><strong>'+fmtCurrency(rev-exp)+'</strong></div><div class="es-row"><span>👥 Customers</span><strong>'+new Set(sales.map(function(s){return s.customerId;})).size+'</strong></div></div>';
  openOverlay('exportSumOverlay');
}

function downloadPdf(){
  var btn=document.getElementById('rptPdfBtn');
  btnLoading(btn,true,'Building PDF…');
  closeOverlay('exportSumOverlay');
  function loadScript(src){
    return new Promise(function(res,rej){
      if(document.querySelector('script[src="'+src+'"]')){res();return;}
      var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);
    });
  }
  Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js')
  ]).then(function(){
    var r=_getRange();
    var sales=dataInRange(AppState.allSales,r.start,r.end);
    var exps =dataInRange(AppState.allExpenses,r.start,r.end);
    var custs=AppState.allCustomers;
    var rev=sales.reduce(function(s,x){return s+(x.total||0);},0);
    var exp=exps.reduce(function(s,x){return s+(x.amount||0);},0);
    var roti=sales.reduce(function(s,x){return s+(x.qty||0);},0);
    var profit=rev-exp;
    var pdf=new window.jspdf.jsPDF('p','mm','a4');
    var pr=[191,54,12];
    pdf.setFillColor(pr[0],pr[1],pr[2]);pdf.rect(0,0,210,28,'F');
    pdf.setTextColor(255,255,255);pdf.setFontSize(18);pdf.setFont('helvetica','bold');
    pdf.text(AppState.businessName||'Meri Dukaan',14,12);
    pdf.setFontSize(10);pdf.setFont('helvetica','normal');
    pdf.text('Report — '+_getLabel(),14,20);
    pdf.text(new Date().toLocaleString('en-IN'),140,20,{align:'right'});
    pdf.setTextColor(50,50,50);
    var cards=[{l:'Roti Sold',v:roti.toLocaleString('en-IN')},{l:'Revenue',v:'Rs.'+Math.round(rev).toLocaleString('en-IN')},{l:'Expenses',v:'Rs.'+Math.round(exp).toLocaleString('en-IN')},{l:'Profit',v:'Rs.'+Math.round(profit).toLocaleString('en-IN')}];
    cards.forEach(function(card,i){
      var x=14+i*46;
      pdf.setFillColor(245,245,245);pdf.roundedRect(x,34,44,20,2,2,'F');
      pdf.setFontSize(7);pdf.setTextColor(120,120,120);pdf.text(card.l,x+22,40,{align:'center'});
      pdf.setFontSize(11);pdf.setFont('helvetica','bold');pdf.setTextColor(50,50,50);
      pdf.text(card.v,x+22,48,{align:'center'});
    });
    pdf.setFontSize(12);pdf.setFont('helvetica','bold');pdf.setTextColor(50,50,50);pdf.text('Sales Detail',14,64);
    pdf.autoTable({head:[['Date','Customer','Qty','Rate','Total','Payment']],body:sales.map(function(s){var c=findById(custs,s.customerId);return [fmtDate(s.date),c?c.name:'—',s.qty,'Rs.'+s.rate,'Rs.'+s.total,s.payType];}),startY:68,styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:pr,textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[248,248,248]}});
    var fy=pdf.lastAutoTable.finalY+8;
    pdf.setFontSize(12);pdf.setFont('helvetica','bold');pdf.text('Expenses',14,fy);
    pdf.autoTable({head:[['Date','Category','Note','Amount']],body:exps.length?exps.map(function(e){return [fmtDate(e.date),e.category,e.note||'—','Rs.'+e.amount];}):[['-','-','No expenses','-']],startY:fy+4,styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[60,60,60],textColor:255},alternateRowStyles:{fillColor:[248,248,248]}});
    var pc=pdf.getNumberOfPages();
    for(var p2=1;p2<=pc;p2++){pdf.setPage(p2);pdf.setFontSize(7);pdf.setTextColor(160,160,160);pdf.text('Meri Dukaan v8 — Page '+p2+' of '+pc,105,292,{align:'center'});}
    pdf.save('meri-dukaan-'+_rptTab+'-'+_rptDate+'.pdf');
    showToast('✅ PDF downloaded!','success');
  }).catch(function(){showToast('PDF error — check internet','error');})
  .finally(function(){btnLoading(btn,false);});
}
function printReport(){ window.print(); }
function shareReport(){
  var r=_getRange();
  var sales=dataInRange(AppState.allSales,r.start,r.end);
  var exps=dataInRange(AppState.allExpenses,r.start,r.end);
  var rev=sales.reduce(function(s,x){return s+(x.total||0);},0);
  var exp=exps.reduce(function(s,x){return s+(x.amount||0);},0);
  var roti=sales.reduce(function(s,x){return s+(x.qty||0);},0);
  shareContent({title:'Meri Dukaan — '+_getLabel(),text:['📊 '+AppState.businessName+' — '+_getLabel(),'🫓 Roti: '+roti.toLocaleString('en-IN'),'💰 Revenue: '+fmtCurrency(rev),'💸 Expenses: '+fmtCurrency(exp),'📈 Profit: '+fmtCurrency(rev-exp),'Sent via Meri Dukaan'].join('\n')});
}
