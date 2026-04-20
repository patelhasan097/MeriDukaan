/* ================================================
   MERI DUKAAN v6.0 — ANALYTICS (Phase 2 + 3)
   Customer Profile · Stock Tracker · Price Trend
   Day Heatmap · Unit Economics · Smart Insights
   ================================================ */

var anPayChart=null,anPriceChart=null;

// ============ ANALYTICS MAIN ============
function loadAnalytics(){
    renderStockTracker(); renderPriceTrend('atta');
    renderDayHeatmap(); renderUnitEconomics();
}
function switchPriceCategory(cat,btn){
    document.querySelectorAll('.price-cat-btn').forEach(function(b){b.classList.remove('active');}); btn.classList.add('active'); renderPriceTrend(cat);
}

// ============ CUSTOMER PROFILE ============
function openCustomerProfile(id){
    var c=findInArray(allCustomers,id); if(!c) return;
    var sales=allSales.filter(function(s){return s.customerId===id;}).sort(function(a,b){return a.date>b.date?1:-1;});
    var totalOrders=sales.length,totalRoti=0,totalAmt=0,cashAmt=0,upiAmt=0,creditAmt=0;
    var uniqueDates={},dayCount=[0,0,0,0,0,0,0];
    sales.forEach(function(s){
        totalRoti+=s.quantity;totalAmt+=s.total;uniqueDates[s.date]=true;
        var d=new Date(s.date+'T00:00:00').getDay();dayCount[d]++;
        if(s.paymentType==='cash')cashAmt+=s.total;else if(s.paymentType==='upi')upiAmt+=s.total;else creditAmt+=s.total;
    });
    var activeDays=Object.keys(uniqueDates).length;
    var avgOrder=totalOrders>0?Math.round(totalRoti/totalOrders):0;
    var firstOrder=sales.length?fmtDateLong(sales[0].date):'—';
    var lastOrder=sales.length?fmtDateLong(sales[sales.length-1].date):'—';
    var dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var bestDayIdx=dayCount.indexOf(Math.max.apply(null,dayCount));
    var bestDay=Math.max.apply(null,dayCount)>0?dayNames[bestDayIdx]:'—';
    var creditGiven=0,creditPaid=0;
    allSales.forEach(function(s){if(s.customerId===id&&s.paymentType==='credit')creditGiven+=s.total;});
    allCreditPayments.forEach(function(p){if(p.customerId===id)creditPaid+=p.amount;});
    var creditPending=Math.max(0,creditGiven-creditPaid);
    var reliabilityScore=creditGiven>0?Math.round(Math.min(creditPaid/creditGiven,1)*100):100;

    document.getElementById('cpName').textContent=c.name;
    document.getElementById('cpSub').textContent=(c.orderType==='fixed'?'📋 Fixed '+c.fixedQty+'/day':'🔄 Variable')+' • ₹'+c.rate+'/roti';
    if(c.phone){document.getElementById('cpPhone').textContent='📱 '+c.phone;document.getElementById('cpPhone').style.display='';}else document.getElementById('cpPhone').style.display='none';
    document.getElementById('cpTotalOrders').textContent=totalOrders;
    document.getElementById('cpTotalRoti').textContent=totalRoti.toLocaleString();
    document.getElementById('cpTotalAmt').textContent='₹'+totalAmt.toLocaleString();
    document.getElementById('cpAvgOrder').textContent=avgOrder+' roti';
    document.getElementById('cpActiveDays').textContent=activeDays+' days';
    document.getElementById('cpBestDay').textContent=bestDay;
    document.getElementById('cpFirstOrder').textContent=firstOrder;
    document.getElementById('cpLastOrder').textContent=lastOrder;
    var cpCreditSection=document.getElementById('cpCreditSection');
    if(creditGiven>0){
        cpCreditSection.style.display='';
        document.getElementById('cpCreditGiven').textContent='₹'+creditGiven;
        document.getElementById('cpCreditPaid').textContent='₹'+creditPaid;
        document.getElementById('cpCreditPending').textContent=creditPending>0?'₹'+creditPending:'✅ Clear';
        document.getElementById('cpCreditPending').className='cp-stat-val'+(creditPending>0?' red':' green');
        var scoreEl=document.getElementById('cpReliabilityScore'),scorePct=document.getElementById('cpReliabilityPct');
        if(scoreEl)scoreEl.style.width=reliabilityScore+'%';
        if(scorePct)scorePct.textContent=reliabilityScore+'%';
        if(scoreEl)scoreEl.style.background=reliabilityScore>=80?'var(--gn)':reliabilityScore>=50?'var(--am)':'var(--rd)';
    } else { cpCreditSection.style.display='none'; }
    var recentHtml='';
    sales.slice(-8).reverse().forEach(function(s){
        var pb=payBdg(s.paymentType);
        recentHtml+='<div class="cp-order-row"><div class="cp-order-left"><span class="cp-order-date">'+fmtDateLong(s.date)+'</span><span class="cp-order-qty">'+s.quantity+' roti</span></div><div class="cp-order-right"><span class="cp-order-amt">₹'+s.total+'</span><span class="sl-b '+pb.c+'" style="font-size:10px">'+pb.t+'</span></div></div>';
    });
    document.getElementById('cpRecentOrders').innerHTML=recentHtml||'<div class="no-data">Koi order nahi abhi tak</div>';
    setTimeout(function(){renderPaymentChart(cashAmt,upiAmt,creditAmt);renderCustomerDayChart(dayCount);},120);
    openOverlay('customerProfileOverlay');
}
function renderPaymentChart(cash,upi,credit){
    var ctx=document.getElementById('cpPayChart'); if(!ctx||typeof Chart==='undefined') return;
    if(anPayChart){anPayChart.destroy();anPayChart=null;}
    var total=cash+upi+credit; if(total===0){ctx.parentElement.innerHTML='<div class="no-data" style="padding:20px">Koi sale nahi</div>';return;}
    var isDark=document.documentElement.getAttribute('data-theme')==='dark';
    anPayChart=new Chart(ctx,{type:'doughnut',data:{labels:['💵 Cash','📱 UPI','💳 Credit'],datasets:[{data:[cash,upi,credit],backgroundColor:['#059669','#2563eb','#d97706'],hoverOffset:4,borderWidth:2,borderColor:isDark?'#161726':'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',animation:{duration:500},plugins:{legend:{position:'bottom',labels:{color:isDark?'#9399b8':'#4b5563',font:{size:11,weight:'600'},padding:10,usePointStyle:true}},tooltip:{callbacks:{label:function(ctx){var pct=total>0?Math.round(ctx.parsed/total*100):0;return ctx.label+': ₹'+ctx.parsed+' ('+pct+'%)';}}}}}});
}
function renderCustomerDayChart(dayCount){
    var ctx=document.getElementById('cpDayChart'); if(!ctx||typeof Chart==='undefined') return;
    var isDark=document.documentElement.getAttribute('data-theme')==='dark'; var maxVal=Math.max.apply(null,dayCount);
    var colors=dayCount.map(function(v){return v===maxVal&&v>0?'#e65100':(isDark?'rgba(147,153,184,0.3)':'rgba(75,85,99,0.18)');});
    new Chart(ctx,{type:'bar',data:{labels:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],datasets:[{data:dayCount,backgroundColor:colors,borderRadius:6,maxBarThickness:30}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:450},plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.parsed.y+' orders';}}}},scales:{y:{beginAtZero:true,grid:{display:false},ticks:{display:false}},x:{grid:{display:false},ticks:{color:isDark?'#565d80':'#9ca3af',font:{size:10,weight:'600'}}}}}});
}

// ============ STOCK TRACKER ============
function renderStockTracker(){
    var ct=document.getElementById('anStockCards'); if(!ct) return;
    var categories=['atta','oil']; var html='';
    categories.forEach(function(cat){
        var purchases=allExpenses.filter(function(x){return x.category===cat&&x.weight&&x.weight>0;}).sort(function(a,b){return a.date>b.date?1:-1;});
        if(!purchases.length){html+='<div class="stock-card"><div class="sk-header"><span class="sk-icon">'+catIc(cat)+'</span><span class="sk-name">'+catNm(cat)+'</span></div><div class="no-data" style="padding:12px 0;font-size:12px">Koi purchase record nahi</div></div>';return;}
        var last=purchases[purchases.length-1]; var lastRate=(last.amount/last.weight).toFixed(1);
        var firstDate=new Date(purchases[0].date+'T00:00:00'); var today=new Date();today.setHours(0,0,0,0);
        var totalDays=Math.max(1,Math.round((today-firstDate)/86400000));
        var totalRotiSold=0; allSales.forEach(function(s){totalRotiSold+=s.quantity;});
        var dailyKgNeeded=cat==='atta'?(totalRotiSold/totalDays)/8:purchases.reduce(function(a,p){return a+p.weight;},0)/totalDays;
        var lastDate=new Date(last.date+'T00:00:00'); var daysSinceLast=Math.round((today-lastDate)/86400000);
        var kgRemaining=Math.max(0,last.weight-(dailyKgNeeded*daysSinceLast));
        var daysRemaining=dailyKgNeeded>0?Math.round(kgRemaining/dailyKgNeeded):'?';
        var status,statusClass;
        if(typeof daysRemaining==='number'){if(daysRemaining<=2){status='🔴 Khatam hone wala!';statusClass='sk-status-red';}else if(daysRemaining<=5){status='🟡 '+daysRemaining+' din';statusClass='sk-status-amber';}else{status='🟢 '+daysRemaining+' din';statusClass='sk-status-green';}}else{status='—';statusClass='';}
        var pct=last.weight>0?Math.max(0,Math.min(100,(kgRemaining/last.weight)*100)):0;
        var barColor=pct>40?'var(--gn)':pct>15?'var(--am)':'var(--rd)';
        var priceTrendHtml='';
        if(purchases.length>=2){var prev=purchases[purchases.length-2];var prevRate=(prev.amount/prev.weight).toFixed(1);var priceDiff=((lastRate-prevRate)/prevRate*100).toFixed(0);if(priceDiff>0)priceTrendHtml='<span class="sk-price-badge sk-price-up">⬆ '+priceDiff+'%</span>';else if(priceDiff<0)priceTrendHtml='<span class="sk-price-badge sk-price-dn">⬇ '+Math.abs(priceDiff)+'%</span>';}
        html+='<div class="stock-card"><div class="sk-header"><span class="sk-icon">'+catIc(cat)+'</span><span class="sk-name">'+catNm(cat)+'</span><span class="'+statusClass+'">'+status+'</span></div>';
        html+='<div class="sk-bar-wrap"><div class="sk-bar-fill" style="width:'+pct.toFixed(0)+'%;background:'+barColor+'"></div></div>';
        html+='<div class="sk-bar-label"><span>'+kgRemaining.toFixed(1)+'kg remaining</span><span>'+last.weight+'kg last stock</span></div>';
        html+='<div class="sk-stats"><div class="sk-stat"><span class="sk-stat-val">₹'+lastRate+'/kg</span><span class="sk-stat-lbl">Last rate '+priceTrendHtml+'</span></div><div class="sk-stat"><span class="sk-stat-val">'+daysSinceLast+'d ago</span><span class="sk-stat-lbl">Last purchase</span></div><div class="sk-stat"><span class="sk-stat-val">'+(dailyKgNeeded>0?dailyKgNeeded.toFixed(1):'?')+'kg/d</span><span class="sk-stat-lbl">Avg usage</span></div></div>';
        var last3=purchases.slice(-3).reverse();
        html+='<div class="sk-history">'; last3.forEach(function(p){var r=(p.amount/p.weight).toFixed(1);html+='<div class="sk-hist-row"><span class="sk-hist-date">'+fmtDateLong(p.date)+'</span><span class="sk-hist-info">'+p.weight+'kg @ ₹'+r+'/kg = ₹'+p.amount+'</span></div>';}); html+='</div></div>';
    });
    ct.innerHTML=html;
}

// ============ PRICE TREND ============
function renderPriceTrend(cat){
    var ct=document.getElementById('anPriceContent'); if(!ct) return;
    var purchases=allExpenses.filter(function(x){return x.category===cat&&x.weight&&x.weight>0;}).sort(function(a,b){return a.date>b.date?1:-1;});
    if(purchases.length<2){ct.innerHTML='<div class="no-data" style="padding:24px">Kam se kam 2 purchases chahiye trend ke liye</div>';return;}
    ct.innerHTML='<div class="chart-wrap" style="height:180px"><canvas id="priceChartCanvas"></canvas></div><div id="priceSummary" class="price-summary"></div>';
    var rates=purchases.map(function(p){return parseFloat((p.amount/p.weight).toFixed(1));});
    var labels=purchases.map(function(p){var d=p.date.split('-');return d[2]+'/'+d[1];});
    var minRate=Math.min.apply(null,rates),maxRate=Math.max.apply(null,rates);
    var avgRate=(rates.reduce(function(a,b){return a+b;},0)/rates.length).toFixed(1);
    var lastRate=rates[rates.length-1],prevRate=rates[rates.length-2];
    var pctChange=((lastRate-prevRate)/prevRate*100).toFixed(1);
    var isDark=document.documentElement.getAttribute('data-theme')==='dark';
    if(anPriceChart){anPriceChart.destroy();anPriceChart=null;}
    setTimeout(function(){
        var ctx2=document.getElementById('priceChartCanvas'); if(!ctx2) return;
        anPriceChart=new Chart(ctx2,{type:'line',data:{labels:labels,datasets:[{label:'₹/kg',data:rates,borderColor:'#e65100',backgroundColor:'rgba(230,81,0,0.07)',borderWidth:2.5,pointBackgroundColor:rates.map(function(r){if(r===minRate)return'#059669';if(r===maxRate)return'#dc2626';return'#e65100';}),pointRadius:5,pointHoverRadius:7,fill:true,tension:0.35}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return'₹'+c.parsed.y+'/kg';}}}},scales:{y:{grid:{color:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)'},ticks:{color:isDark?'#565d80':'#9ca3af',font:{size:10},callback:function(v){return'₹'+v;}}},x:{grid:{display:false},ticks:{color:isDark?'#565d80':'#9ca3af',font:{size:10}}}}}});
        var pctClass=pctChange>0?'price-up':pctChange<0?'price-dn':'';
        var pctIcon=pctChange>0?'⬆':pctChange<0?'⬇':'→';
        document.getElementById('priceSummary').innerHTML='<div class="price-badge-row"><div class="price-badge"><span class="pb-val">₹'+lastRate+'</span><span class="pb-lbl">Current</span></div><div class="price-badge '+pctClass+'"><span class="pb-val">'+pctIcon+' '+Math.abs(pctChange)+'%</span><span class="pb-lbl">vs last</span></div><div class="price-badge pb-best"><span class="pb-val">₹'+minRate+'</span><span class="pb-lbl">Best price</span></div><div class="price-badge"><span class="pb-val">₹'+avgRate+'</span><span class="pb-lbl">Avg/kg</span></div></div>';
    },80);
}

// ============ DAY HEATMAP ============
function renderDayHeatmap(){
    var ct=document.getElementById('anHeatmapContent'); if(!ct) return;
    var dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var dayShort=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var dayRev=[0,0,0,0,0,0,0],dayCnt=[0,0,0,0,0,0,0];
    allSales.forEach(function(s){var d=new Date(s.date+'T00:00:00').getDay();dayRev[d]+=s.total;dayCnt[d]++;});
    var maxRev=Math.max.apply(null,dayRev); if(maxRev===0){ct.innerHTML='<div class="no-data" style="padding:20px">Sales data nahi — pehle kuch sales add karo</div>';return;}
    var bestDayIdx=dayRev.indexOf(maxRev);
    var filtered=dayRev.filter(function(v){return v>0;}); var worstRev=filtered.length?Math.min.apply(null,filtered):0; var worstDayIdx=dayRev.indexOf(worstRev);
    var html='<div class="heatmap-grid">';
    for(var i=0;i<7;i++){
        var pct=maxRev>0?(dayRev[i]/maxRev):0; var isBest=i===bestDayIdx&&dayRev[i]>0; var isWorst=i===worstDayIdx&&dayRev[i]>0&&i!==bestDayIdx;
        html+='<div class="hm-cell'+(isBest?' hm-best':isWorst?' hm-worst':'')+'"><div class="hm-bar" style="height:'+Math.max(4,pct*80).toFixed(0)+'px;background:'+(isBest?'var(--gn)':isWorst?'var(--rd)':'var(--pr)')+';opacity:'+Math.max(0.15,pct)+'"></div>';
        html+='<div class="hm-day">'+dayShort[i]+'</div><div class="hm-rev">'+(dayRev[i]>0?'₹'+dayRev[i].toLocaleString():'—')+'</div><div class="hm-cnt">'+(dayCnt[i]>0?dayCnt[i]+' orders':'')+'</div>';
        if(isBest) html+='<div class="hm-badge">🏆 Best</div>';
        if(isWorst&&dayRev[i]>0) html+='<div class="hm-badge hm-badge-low">📉 Low</div>';
        html+='</div>';
    }
    html+='</div><div class="hm-summary"><div class="hms-item"><span class="hms-val">'+dayNames[bestDayIdx]+'</span><span class="hms-lbl">Best day</span></div>';
    if(worstDayIdx!==bestDayIdx&&worstRev>0)html+='<div class="hms-item"><span class="hms-val">'+dayNames[worstDayIdx]+'</span><span class="hms-lbl">Slow day</span></div>';
    var totalRev=dayRev.reduce(function(a,b){return a+b;},0),totalOrders=dayCnt.reduce(function(a,b){return a+b;},0);
    html+='<div class="hms-item"><span class="hms-val">₹'+(totalOrders>0?Math.round(totalRev/totalOrders):0)+'</span><span class="hms-lbl">Avg/order</span></div></div>';
    ct.innerHTML=html;
}

// ============ UNIT ECONOMICS ============
function renderUnitEconomics(){
    var ct=document.getElementById('anUnitContent'); if(!ct) return;
    var totalRoti=0,totalRevenue=0;
    allSales.forEach(function(s){totalRoti+=s.quantity;totalRevenue+=s.total;});
    var totalAttaCost=0,totalAttaKg=0;
    allExpenses.forEach(function(x){if(x.category==='atta'&&x.weight>0){totalAttaCost+=x.amount;totalAttaKg+=x.weight;}});
    if(totalRoti===0||totalAttaKg===0){ct.innerHTML='<div class="no-data" style="padding:20px">Sales aur Atta expenses dono chahiye calculations ke liye</div>';return;}
    var avgSellingRate=totalRevenue/totalRoti,costPerRoti=totalAttaCost/totalRoti,profitPerRoti=avgSellingRate-costPerRoti;
    var marginPct=avgSellingRate>0?(profitPerRoti/avgSellingRate*100):0;
    var isProfit=profitPerRoti>=0;
    var gaugeAngle=Math.max(0,Math.min(180,marginPct*1.8));
    ct.innerHTML='<div class="ue-gauge-wrap"><div class="ue-gauge"><div class="ue-gauge-bg"></div><div class="ue-gauge-fill" style="transform:rotate('+(gaugeAngle-90)+'deg);background:'+(marginPct>30?'var(--gn)':marginPct>10?'var(--am)':'var(--rd)')+'"></div><div class="ue-gauge-center"><span class="ue-margin-pct">'+marginPct.toFixed(1)+'%</span><span class="ue-margin-lbl">Margin</span></div></div></div>'+
    '<div class="ue-stats"><div class="ue-row"><span class="ue-lbl">Avg selling rate</span><span class="ue-val green">₹'+avgSellingRate.toFixed(2)+'/roti</span></div><div class="ue-row"><span class="ue-lbl">Atta cost/roti</span><span class="ue-val red">₹'+costPerRoti.toFixed(2)+'</span></div><div class="ue-row ue-row-total"><span class="ue-lbl">Profit per roti</span><span class="ue-val '+(isProfit?'green':'red')+'">₹'+Math.abs(profitPerRoti).toFixed(2)+(isProfit?'':' Loss')+'</span></div></div>'+
    '<div class="ue-detail"><div class="ue-row"><span class="ue-lbl">Total roti sold</span><span class="ue-val">'+totalRoti.toLocaleString()+'</span></div><div class="ue-row"><span class="ue-lbl">Total atta used</span><span class="ue-val">'+totalAttaKg.toFixed(1)+' kg</span></div><div class="ue-row"><span class="ue-lbl">Atta avg rate</span><span class="ue-val">₹'+(totalAttaCost/totalAttaKg).toFixed(1)+'/kg</span></div><div class="ue-row"><span class="ue-lbl">Total revenue</span><span class="ue-val green">₹'+totalRevenue.toLocaleString()+'</span></div></div>'+
    '<div class="ue-note">* Sirf atta cost include hai. Oil, gas, poly alag hain.</div>';
}

// ============ SMART INSIGHTS (Phase 3) ============
function renderSmartInsights(){
    var ct=document.getElementById('dashInsights'); if(!ct) return;
    var insights=[]; var today=new Date();today.setHours(0,0,0,0);

    // 1. Atta stock warning
    var attaPurchases=allExpenses.filter(function(x){return x.category==='atta'&&x.weight>0;}).sort(function(a,b){return a.date>b.date?1:-1;});
    if(attaPurchases.length>0){
        var last=attaPurchases[attaPurchases.length-1];
        var totalRoti=0; allSales.forEach(function(s){totalRoti+=s.quantity;});
        var firstSaleDate=allSales.length?allSales.reduce(function(m,s){return s.date<m?s.date:m;},allSales[0].date):todayStr();
        var dateDays=Math.max(1,Math.round((today-new Date(firstSaleDate+'T00:00:00'))/86400000));
        var dailyRoti=totalRoti/dateDays; var lastDate=new Date(last.date+'T00:00:00');
        var daysSince=Math.round((today-lastDate)/86400000);
        var kgLeft=Math.max(0,last.weight-(dailyRoti/8)*daysSince);
        var daysLeft=dailyRoti>0?Math.round(kgLeft/(dailyRoti/8)):99;
        if(daysLeft<=3) insights.push({icon:'🌾',text:'Atta sirf '+daysLeft+' din bacha hai — jaldi order karo!',color:'var(--rd)',urgent:true});
        else if(daysLeft<=7) insights.push({icon:'🌾',text:'Atta lagbhag '+daysLeft+' din aur chalega',color:'var(--am)'});
    }

    // 2. Inactive customer (fixed 7 days)
    var sevenDaysAgo=new Date(today);sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7);
    var sevenStr=sevenDaysAgo.getFullYear()+'-'+S(sevenDaysAgo.getMonth()+1)+'-'+S(sevenDaysAgo.getDate());
    allCustomers.forEach(function(c){
        if(c.orderType!=='fixed') return;
        var custSales=allSales.filter(function(s){return s.customerId===c.id;}).sort(function(a,b){return b.date>a.date?1:-1;});
        if(custSales.length>0&&custSales[0].date<sevenStr){
            var d=Math.round((today-new Date(custSales[0].date+'T00:00:00'))/86400000);
            insights.push({icon:'👤',text:esc(c.name)+' ne '+d+' din se order nahi kiya',color:'var(--am)'});
        }
    });

    // 3. Today revenue vs 7-day avg
    var todaySales=allSales.filter(function(s){return s.date===todayStr();});
    var todayInc=todaySales.reduce(function(a,s){return a+s.total;},0);
    if(todaySales.length>0){
        var last7=[]; for(var i=1;i<=7;i++){var dd=new Date(today);dd.setDate(dd.getDate()-i);var ds=dd.getFullYear()+'-'+S(dd.getMonth()+1)+'-'+S(dd.getDate());var dRev=allSales.filter(function(s){return s.date===ds;}).reduce(function(a,s){return a+s.total;},0);if(dRev>0)last7.push(dRev);}
        if(last7.length>0){var avgRev=last7.reduce(function(a,b){return a+b;},0)/last7.length;var diffPct=Math.round(((todayInc-avgRev)/avgRev)*100);if(diffPct>=20)insights.push({icon:'📈',text:'Aaj ka revenue '+diffPct+'% above average hai! 🎉',color:'var(--gn)'});else if(diffPct<=-20)insights.push({icon:'📉',text:'Aaj ka revenue '+Math.abs(diffPct)+'% below average hai',color:'var(--am)'});}
    }

    // 4. Oil price increase
    var oilP=allExpenses.filter(function(x){return x.category==='oil'&&x.weight>0;}).sort(function(a,b){return a.date>b.date?1:-1;});
    if(oilP.length>=2){var oL=oilP[oilP.length-1],oP=oilP[oilP.length-2];var oDiff=Math.round(((oL.amount/oL.weight)-(oP.amount/oP.weight))/(oP.amount/oP.weight)*100);if(oDiff>=10)insights.push({icon:'🛢️',text:'Oil price '+oDiff+'% badh gayi last purchase se',color:'var(--rd)'});}

    if(!insights.length){ct.style.display='none';return;}
    ct.style.display='';
    var insHtml='<h3 class="sec-t" style="padding-top:0;margin-bottom:10px">💡 Smart Insights</h3>';
    insights.slice(0,3).forEach(function(ins){
        insHtml+='<div class="insight-card" onclick="goTo(\'analyticsScreen\')" style="border-left:3px solid '+ins.color+'">'+
            '<span class="insight-ic">'+ins.icon+'</span>'+
            '<div class="insight-text">'+ins.text+'</div>'+
            '</div>';
    });
    ct.innerHTML=insHtml;
}

console.log('[Analytics] Analytics module loaded');