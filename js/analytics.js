/* MERI DUKAAN v8 — Analytics (all 6 sections update together) */
var _aWindow = 30;

function renderAnalytics() {
  var scr = document.getElementById('analyticsScreen');
  if (!scr || !scr.classList.contains('screen--active')) return;
  var sales = AppState.allSales, exps = AppState.allExpenses;
  var waste = AppState.allWaste, custs = AppState.allCustomers;
  var nd = document.getElementById('analyticsNoData');
  if (sales.length < 3) { if(nd) nd.style.display='block'; return; }
  if(nd) nd.style.display='none';
  var end = todayStr();
  var sd = new Date(); sd.setDate(sd.getDate()-(_aWindow===9999?36500:_aWindow));
  var start = sd.getFullYear()+'-'+pad2(sd.getMonth()+1)+'-'+pad2(sd.getDate());
  var ws = dataInRange(sales,start,end), we = dataInRange(exps,start,end), ww = dataInRange(waste,start,end);
  _renderPerRoti(ws,we,ww);
  _renderRevChart(ws);
  _renderStockTracker(exps,sales);
  _renderCustInsights(ws,custs);
  _renderSmartInsights(ws,we,custs,ww);
}

function setAnalyticsWindow(days,btn) {
  _aWindow = days;
  document.querySelectorAll('[data-aw]').forEach(function(b){ b.classList.toggle('window-btn--active',parseInt(b.dataset.aw)===days); });
  renderAnalytics();
}

function _renderPerRoti(sales,exps,waste){
  var qty=sales.reduce(function(s,x){return s+(x.qty||0);},0);
  var rev=sales.reduce(function(s,x){return s+(x.total||0);},0);
  if(!qty) return;
  var rpr=rev/qty;
  var totalExp=exps.reduce(function(s,x){return s+(x.amount||0);},0);
  var cpr=totalExp/qty;
  var wq=waste.reduce(function(s,x){return s+(x.qty||0);},0);
  var wcr=(wq/qty)*rpr;
  var profit=rpr-cpr;
  var margin=rev>0?Math.round(profit/rpr*100):0;
  function se(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  se('arRevPR',fmtCurrency(rpr,2));se('arCostPR',fmtCurrency(cpr,2));
  se('arWastePR',fmtCurrency(wcr,2));se('arProfitPR',fmtCurrency(profit,2));
  se('arMargin',margin+'%');
  var catCost={};
  exps.forEach(function(e){catCost[e.category]=(catCost[e.category]||0)+(e.amount||0);});
  var totalC=Object.values(catCost).reduce(function(s,v){return s+v;},0);
  var bd=document.getElementById('arBreakdown');
  if(bd&&qty){
    bd.innerHTML=Object.entries(catCost).sort(function(a,b){return b[1]-a[1];}).map(function(entry){
      var cat=entry[0],amt=entry[1];
      var pct=totalC>0?Math.round(amt/totalC*100):0;
      return '<div class="cbr"><span class="cbr__l">'+esc(cat)+'</span><div class="cbr__t"><div class="cbr__f" style="width:'+pct+'%"></div></div><span class="cbr__v">'+fmtCurrency(amt/qty,2)+'/roti</span></div>';
    }).join('');
  }
}

function _renderRevChart(sales){
  var canvas=document.getElementById('revChart');
  if(!canvas||typeof Chart==='undefined') return;
  var byDate={};
  sales.forEach(function(s){byDate[s.date]=(byDate[s.date]||0)+(s.total||0);});
  var dates=Object.keys(byDate).sort();
  var revs=dates.map(function(d){return byDate[d];});
  var rolling=revs.map(function(_,i){
    var sl=revs.slice(Math.max(0,i-6),i+1);
    return sl.reduce(function(s,v){return s+v;},0)/sl.length;
  });
  if(window._revChart) window._revChart.destroy();
  window._revChart=new Chart(canvas,{
    type:'bar',
    data:{
      labels:dates.map(function(d){return fmtDate(d);}),
      datasets:[
        {label:'Revenue',data:revs,backgroundColor:'rgba(230,81,0,0.7)',borderRadius:3,order:2},
        {label:'7-day avg',data:rolling,type:'line',borderColor:'#ff9d5c',borderWidth:2,pointRadius:0,fill:false,tension:0.4,order:1}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        tooltip:{enabled:true,callbacks:{label:function(ctx){return ctx.dataset.label+': '+fmtCurrency(ctx.raw);}}},
        legend:{labels:{color:'#9399b8',font:{size:11}}}
      },
      scales:{
        x:{ticks:{color:'#565d80',maxTicksLimit:8},grid:{display:false}},
        y:{ticks:{color:'#565d80',callback:function(v){return '₹'+Math.round(v);}},grid:{color:'rgba(255,255,255,0.04)'}}
      }
    }
  });
}

function _renderStockTracker(allExps,allSales){
  var ct=document.getElementById('stockContent');
  if(!ct) return;
  var today=todayStr();
  var d30=new Date();d30.setDate(d30.getDate()-30);
  var s30=d30.getFullYear()+'-'+pad2(d30.getMonth()+1)+'-'+pad2(d30.getDate());
  var re=dataInRange(allExps,s30,today);
  var rs=dataInRange(allSales,s30,today);
  var totalRoti=rs.reduce(function(s,x){return s+(x.qty||0);},0);
  var attaBuys=re.filter(function(e){return /atta|flour|maida|wheat|gehu/i.test(e.category||'');});
  var totalKg=attaBuys.reduce(function(s,e){return s+(e.unit==='kg'&&e.qty?parseFloat(e.qty):0);},0);
  var kgPR=0.023;
  if(totalKg>0&&totalRoti>100){var c2=totalKg/totalRoti;if(c2>=0.005&&c2<=0.15) kgPR=c2;}
  var dailyRoti=totalRoti/30, dailyKg=dailyRoti*kgPR;
  var lastAtta=attaBuys.sort(function(a,b){return (b.date||'').localeCompare(a.date||'');})[0];
  var attaDays=0;
  if(lastAtta&&lastAtta.qty&&lastAtta.unit==='kg'){
    var dSince=daysBetween(lastAtta.date,today);
    var kgLeft=Math.max(0,parseFloat(lastAtta.qty)-dSince*dailyKg);
    attaDays=dailyKg>0?Math.round(kgLeft/dailyKg):0;
  }
  var gasBuys=re.filter(function(e){return /gas|cylinder|lpg/i.test(e.category||'');});
  var lastGas=gasBuys.sort(function(a,b){return (b.date||'').localeCompare(a.date||'');})[0];
  var gasDays=lastGas?Math.max(0,28-daysBetween(lastGas.date,today)):null;
  var urgC=function(d){return d===null?'stock--unknown':d<=2?'stock--crit':d<=5?'stock--low':'stock--ok';};
  var supPhone=localStorage.getItem('mdSupPhone')||'';
  var orderBtn=function(item){return supPhone?'<button class="btn btn--wa btn--sm" onclick="orderStock(\''+item+'\')">Order Now 📱</button>':'';};
  ct.innerHTML='<div class="stock-item '+urgC(attaDays)+'"><span class="stock-ic">🌾</span><div class="stock-info"><div class="stock-name">Atta (Wheat Flour)</div><div class="stock-days">'+(attaDays>0?'~'+attaDays+' days remaining':'Unknown — add purchase')+'</div><div class="stock-sub">'+(dailyKg*1000).toFixed(0)+'g/roti · '+dailyKg.toFixed(1)+'kg/day</div></div>'+(attaDays>0&&attaDays<=5?orderBtn('Atta'):'')+'</div><div class="stock-item '+urgC(gasDays)+'"><span class="stock-ic">🔥</span><div class="stock-info"><div class="stock-name">Gas Cylinder</div><div class="stock-days">'+(gasDays!==null?'~'+gasDays+' days remaining':'Unknown — add purchase')+'</div><div class="stock-sub">Based on last refill date</div></div>'+(gasDays!==null&&gasDays<=3?orderBtn('Gas'):'')+'</div>';
}

function orderStock(item){
  var phone=localStorage.getItem('mdSupPhone')||'';
  if(!phone){showToast('Add supplier phone in Settings','warning');return;}
  var msg='Hello! '+AppState.businessName+' needs '+item+'. Please arrange delivery. Thank you.';
  window.open(buildWhatsAppLink(phone,msg),'_blank');
}

function _renderCustInsights(sales,custs){
  var ct=document.getElementById('custInsights');
  if(!ct) return;
  var map={};
  sales.forEach(function(s){
    if(!map[s.customerId]) map[s.customerId]={qty:0,rev:0,days:new Set()};
    map[s.customerId].qty+=s.qty||0;
    map[s.customerId].rev+=s.total||0;
    map[s.customerId].days.add(s.date);
  });
  var ranked=Object.entries(map).map(function(entry){
    var id=entry[0],d=entry[1];
    return {id:id,cust:findById(custs,id),qty:d.qty,rev:d.rev,dc:d.days.size};
  }).filter(function(r){return r.cust;}).sort(function(a,b){return b.rev-a.rev;});
  if(!ranked.length){ct.innerHTML='<p class="empty-mini">Not enough data yet</p>';return;}
  var maxR=ranked[0].rev;
  ct.innerHTML=ranked.slice(0,8).map(function(r,i){
    var pct=maxR>0?Math.round(r.rev/maxR*100):0;
    return '<div class="ci-row"><span class="ci-rank">'+(i+1)+'</span><div class="ci-info"><button class="cust-link" onclick="openCustomerProfile(\''+r.id+'\')">'+esc(r.cust.name)+'</button><div class="ci-bar"><div class="ci-fill" style="width:'+pct+'%"></div></div><span class="ci-meta">'+r.qty+' roti · '+r.dc+' days</span></div><span class="ci-rev">'+fmtCurrency(r.rev)+'</span></div>';
  }).join('');
}

function _linearReg(xs,ys){
  var n=xs.length,sx=0,sy=0,sxy=0,sxx=0;
  xs.forEach(function(_,i){sx+=xs[i];sy+=ys[i];sxy+=xs[i]*ys[i];sxx+=xs[i]*xs[i];});
  var den=n*sxx-sx*sx;
  if(den===0) return {slope:0,intercept:sy/n,r2:0,predict:function(){return sy/n;}};
  var slope=(n*sxy-sx*sy)/den,intercept=(sy-slope*sx)/n;
  var yMean=sy/n,ssTot=ys.reduce(function(s,v){return s+Math.pow(v-yMean,2);},0);
  var ssRes=ys.reduce(function(s,v,i){return s+Math.pow(v-(slope*xs[i]+intercept),2);},0);
  var r2=ssTot>0?1-ssRes/ssTot:0;
  return {slope:slope,intercept:intercept,r2:r2,predict:function(x){return slope*x+intercept;}};
}

function _renderSmartInsights(sales,exps,custs,waste){
  var ct=document.getElementById('smartInsights');
  if(!ct) return;
  var insights=[],today=todayStr();
  var n=new Set(sales.map(function(s){return s.date;})).size;
  if(n>=14){
    var byDay=Array.from({length:7},function(){return {r:0,c:0};});
    sales.forEach(function(s){var d=new Date(s.date).getDay();byDay[d].r+=s.total||0;byDay[d].c++;});
    var dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var avgAll=byDay.filter(function(d){return d.c>0;}).reduce(function(s,d){return s+d.r/d.c;},0)/byDay.filter(function(d){return d.c>0;}).length;
    var best=byDay.reduce(function(b,d,i){return d.c>0&&d.r/d.c>b.avg?{i:i,avg:d.r/d.c}:b;},{i:-1,avg:0});
    if(best.i>=0&&avgAll>0){
      var pct=Math.round((best.avg/avgAll-1)*100);
      insights.push({icon:'📅',type:'info',title:dayNames[best.i]+' is your best day (+'+pct+'% vs avg)',body:'Consider higher production on '+dayNames[best.i]+'s',conf:n>=30?'high':'medium'});
    }
  }
  custs.filter(function(c){return c.status==='active';}).forEach(function(c){
    var last=sales.filter(function(s){return s.customerId===c.id;}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');})[0];
    if(last){
      var d=daysBetween(last.date,today);
      if(d>=5&&d<60) insights.push({icon:'👤',type:'warning',title:c.name+' hasn\'t ordered in '+d+' days',body:'Last sale: '+fmtDate(last.date),conf:'high',action:c.phone?{label:t('whatsapp_remind'),fn:'sendWhatsAppReminder(\''+c.id+'\',0)'}:null});
    }
  });
  var totalQ=sales.reduce(function(s,x){return s+(x.qty||0);},0);
  var totalW=waste.reduce(function(s,x){return s+(x.qty||0);},0);
  if(totalQ>0&&totalW/totalQ>0.1) insights.push({icon:'♻️',type:'warning',title:'Waste rate: '+Math.round(totalW/totalQ*100)+'% of production',body:totalW+' wasted of '+totalQ+' produced',conf:'high'});
  if(n>=14){
    var daily=[];
    var sorted2=[].concat([...new Set(sales.map(function(s){return s.date;}))]).sort();
    sorted2.forEach(function(d2){daily.push(sales.filter(function(s){return s.date===d2;}).reduce(function(s,x){return s+(x.total||0);},0));});
    var reg=_linearReg(daily.map(function(_,i){return i;}),daily);
    if(reg.r2>0.25&&reg.slope!==0){
      var dir=reg.slope>0?'📈 growing':'📉 declining';
      insights.push({icon:'📊',type:reg.slope>0?'success':'warning',title:'Revenue is '+dir,body:'~₹'+Math.abs(Math.round(reg.slope))+'/day change · Confidence: '+Math.round(reg.r2*100)+'%',conf:reg.r2>0.5?'high':'medium'});
    }
  }
  if(!insights.length){ct.innerHTML='<p class="empty-mini">Keep recording data — insights appear after 14+ days.</p>';return;}
  ct.innerHTML=insights.map(function(ins){
    return '<div class="ins-card ins-card--'+ins.type+'"><div class="ins-top"><span class="ins-ic">'+ins.icon+'</span><div class="ins-body"><div class="ins-title">'+ins.title+'</div><div class="ins-text">'+ins.body+'</div>'+(ins.action?'<button class="btn btn--wa btn--sm" onclick="'+ins.action.fn+'" style="margin-top:6px">'+ins.action.label+'</button>':'')+'</div></div><div class="ins-meta"><span class="ins-conf ins-conf--'+ins.conf+'">'+ins.conf+' confidence</span></div></div>';
  }).join('');
}
