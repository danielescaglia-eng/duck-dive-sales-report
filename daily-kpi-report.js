#!/usr/bin/env node
/**
 * Duck Dive Sales Report — v3
 * Fonte: "Visite clienti" + "Venduto totale" da CRM Duck Dive
 * Usage: node scripts/daily-kpi-report.js [--output-dir <path>]
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SHEET_ID = '13kGrvnOMhQL264pLBBrZMEBIjKPfPXzZ30le21_ho2g';
const BASE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=`;
const GID = { visite: '264267460', venduto: '1742510672' };

const TARGETS = {
  visite_nuovi: { mese: 60, week: 15 },
  conversione_nuovi: { mese: 8, week: 2 },
  visite_attivi: { mese: 90, week: 23 },
  conversione_attivi: { mese: 40, week: 10 },
  fatt_nuovi: { Beppe: { mese: 800, week: 200 }, 'Dimitri Gennuso': { mese: 800, week: 200 } },
  fatt_riordini: { Beppe: { mese: 9000, week: 2250 }, 'Dimitri Gennuso': { mese: 7000, week: 1750 } },
};
const ML = { 'nov-25':'Nov 25','dic-25':'Dic 25','gen-26':'Gen 26','feb-26':'Feb 26','mar-26':'Mar 26','apr-26':'Apr 26' };
const MO = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];

// ── CSV ─────────────────────────────────────────────────────────────
function fetchCSV(url, n=5) {
  return new Promise((res, rej) => {
    if (n<=0) return rej(new Error('redirects'));
    const c = url.startsWith('https') ? https : http;
    c.get(url, {headers:{'User-Agent':'DD/1'}}, r => {
      if (r.statusCode>=300&&r.statusCode<400&&r.headers.location) return res(fetchCSV(r.headers.location,n-1));
      if (r.statusCode!==200) return rej(new Error('HTTP '+r.statusCode));
      let d=''; r.on('data',ch=>d+=ch); r.on('end',()=>res(d));
    }).on('error',rej);
  });
}
function parseCSV(t) {
  const rows=[]; let cur='',op=false;
  for (const l of t.split('\n')) { cur=op?cur+'\n'+l:l; let q=0; for(let i=0;i<cur.length;i++)if(cur[i]==='"')q++; op=q%2!==0; if(!op){rows.push(pL(cur.replace(/\r$/,'')));cur='';} }
  return rows;
}
function pL(l) {
  const c=[]; let cur='',inQ=false;
  for(let i=0;i<l.length;i++){const ch=l[i];if(inQ){if(ch==='"'&&l[i+1]==='"'){cur+='"';i++;}else if(ch==='"')inQ=false;else cur+=ch;}else{if(ch==='"')inQ=true;else if(ch===','){c.push(cur.trim());cur='';}else cur+=ch;}}
  c.push(cur.trim()); return c;
}
function pn(s){if(!s||s==='-')return 0;let c=s.replace(/[€\s]/g,'').trim();if(c.includes('.')&&c.includes(','))c=c.replace(/\./g,'').replace(',','.');else if(c.includes(','))c=c.replace(',','.');return parseFloat(c)||0;}
function fmt(n){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:0,maximumFractionDigits:0}).format(n);}

// ── Process ─────────────────────────────────────────────────────────
function processData(visiteRows, vendutoRows) {
  const data = {}; // { mese: { agent: { vN, vE, fN, fR, convN(Set), convR(Set), ordN, ordR, weeks:{w:{vN,vE,fN,fR,cN(Set),cR(Set)}} } } }

  // Visite: col1=mese, col3=week, col5=tipo, col9=sales
  for (let i=1; i<visiteRows.length; i++) {
    const r=visiteRows[i], m=(r[1]||'').trim().toLowerCase(), a=(r[9]||'').trim(), w=(r[3]||'').trim();
    if(!m||!a) continue;
    if(!data[m]) data[m]={};
    if(!data[m][a]) data[m][a]=initAgent();
    const isN=(r[5]||'').toLowerCase().includes('nuovo');
    if(isN) data[m][a].vN++; else data[m][a].vE++;
    if(w) { ensureWeek(data[m][a],w); if(isN) data[m][a].weeks[w].vN++; else data[m][a].weeks[w].vE++; }
  }

  // Build set of visited clients per agent per month for cross-reference
  const visitedNew = {}; // { mese: { agent: Set(clientName) } }
  for (let i=1; i<visiteRows.length; i++) {
    const r=visiteRows[i], m=(r[1]||'').trim().toLowerCase(), a=(r[9]||'').trim();
    if(!m||!a) continue;
    if(!(r[5]||'').toLowerCase().includes('nuovo')) continue;
    const nome=(r[6]||r[7]||r[0]||'').toLowerCase().trim();
    if(!nome) continue;
    if(!visitedNew[m]) visitedNew[m]={};
    if(!visitedNew[m][a]) visitedNew[m][a]=new Set();
    visitedNew[m][a].add(nome);
  }

  // Venduto: col2=mese, col4=client, col6=prezzo, col8=data ordine, col22=canale, col23=tipo, col24=sales, col31=week
  // SALES KPI = solo HORECA. Fatturato totale tutti canali = metrica separata.
  // channelTotals = { mese: { canale: revenue } } per il fatturato complessivo
  const channelTotals = {};

  for (let i=1; i<vendutoRows.length; i++) {
    const r=vendutoRows[i], m=(r[2]||'').trim().toLowerCase(), a=(r[24]||'').trim();
    const rev=pn(r[6]), client=(r[4]||r[3]||'').toLowerCase().trim(), tipo=(r[23]||'').toLowerCase();
    const w=(r[31]||'').trim(), dataOrd=(r[8]||'').trim();
    const canale=(r[22]||'').trim().toUpperCase();
    if(!m||rev===0) continue;

    // Track ALL channel revenue (regardless of agent)
    if(!channelTotals[m]) channelTotals[m]={};
    if(!channelTotals[m][canale]) channelTotals[m][canale]=0;
    channelTotals[m][canale]+=rev;

    // Agent KPI = SOLO HORECA
    if(!a || canale!=='HORECA') continue;
    if(!data[m]) data[m]={};
    if(!data[m][a]) data[m][a]=initAgent();
    const d=data[m][a];
    const isN=tipo.includes('nuovo');
    const orderKey=dataOrd+'|'+client;

    if(isN){
      d.fN+=rev; d.convN.add(client);
      if(!d.ordiniNSet) d.ordiniNSet=new Set();
      d.ordiniNSet.add(orderKey);
    } else {
      d.fR+=rev; d.convR.add(client);
      if(!d.ordiniRSet) d.ordiniRSet=new Set();
      d.ordiniRSet.add(orderKey);
    }

    if(w){
      ensureWeek(d,w);
      const wk=d.weeks[w];
      if(isN){wk.fN+=rev;wk.cN.add(client);}else{wk.fR+=rev;wk.cR.add(client);}
      if(!wk.ordSet) wk.ordSet=new Set();
      wk.ordSet.add(orderKey);
    }
  }

  // Post-process: calculate true conversioni (visited+ordered) and ordini counts
  for(const m of Object.keys(data)){
    for(const a of Object.keys(data[m])){
      const d=data[m][a];
      // Ordini unici
      d.ordN=(d.ordiniNSet?d.ordiniNSet.size:0);
      d.ordR=(d.ordiniRSet?d.ordiniRSet.size:0);
      // True conversione nuovi = clienti visitati come nuovo E che hanno ordinato come nuovo
      const vSet=visitedNew[m]?.[a]||new Set();
      d.trueConvN=new Set();
      for(const c of d.convN){
        for(const v of vSet){ if(v.includes(c)||c.includes(v)||v===c){d.trueConvN.add(c);break;} }
      }
    }
  }
  return { agents: data, channelTotals };
}
function initAgent(){return{vN:0,vE:0,fN:0,fR:0,convN:new Set(),convR:new Set(),ordN:0,ordR:0,weeks:{}};}
function ensureWeek(a,w){if(!a.weeks[w])a.weeks[w]={vN:0,vE:0,fN:0,fR:0,cN:new Set(),cR:new Set()};}

// ── HTML ────────────────────────────────────────────────────────────
function generateHTML({ agents: data, channelTotals }) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const wn = getISOWeek(today), wr = getWeekRange(today);

  const allM = Object.keys(data).filter(m=>m.match(/^[a-z]+-\d+$/)).sort((a,b)=>{
    const[am,ay]=a.split('-'),[bm,by]=b.split('-');
    return ay!==by?parseInt(ay)-parseInt(by):MO.indexOf(am)-MO.indexOf(bm);
  });
  const months = allM.slice(-5);
  const agents = getActive(data, months.slice(-3));
  const latest = (() => {
    for (let i=months.length-1;i>=0;i--) {
      const tot = agents.reduce((s,a)=>(data[months[i]]?.[a]?.vN||0)+(data[months[i]]?.[a]?.vE||0)+s,0);
      if (tot > 50) return months[i];
    }
    return months[months.length-1];
  })();

  // Channel totals per month (all channels, all agents)
  const jChannels = {};
  for (const m of months) {
    jChannels[m] = {};
    let tot = 0;
    for (const [ch, rev] of Object.entries(channelTotals[m] || {})) {
      jChannels[m][ch] = Math.round(rev * 100) / 100;
      tot += rev;
    }
    jChannels[m]._TOTALE = Math.round(tot * 100) / 100;
  }

  const subject = `[Duck Dive] Sales Report S${wn} — ${today.toLocaleDateString('it-IT')}`;

  // Serialize data to JSON for JS interactivity (convert Sets to sizes)
  const jData = {};
  for (const m of months) {
    jData[m] = {};
    for (const a of agents) {
      const d = data[m]?.[a];
      if (!d) { jData[m][a] = null; continue; }
      jData[m][a] = { vN:d.vN,vE:d.vE,fN:Math.round(d.fN*100)/100,fR:Math.round(d.fR*100)/100,
        convN:d.trueConvN?d.trueConvN.size:d.convN.size,convR:d.convR.size,
        ordN:d.ordN,ordR:d.ordR,
        weeks: {} };
      for (const[w,wd] of Object.entries(d.weeks)) {
        jData[m][a].weeks[w] = {vN:wd.vN,vE:wd.vE,fN:Math.round(wd.fN*100)/100,fR:Math.round(wd.fR*100)/100,
          cN:wd.cN.size,cR:wd.cR.size,
          ord:wd.ordSet?wd.ordSet.size:0};
      }
    }
  }

  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"><\/script>
<style>
:root {
  --bg: #0f1117;
  --card: #1a1d27;
  --card-hover: #22263a;
  --border: #2a2e3d;
  --text: #e4e6eb;
  --text-muted: #8b8fa3;
  --accent: #f59e0b;
  --green: #22c55e;
  --red: #ef4444;
  --blue: #3b82f6;
  --purple: #a855f7;
}
* { box-sizing:border-box; margin:0; padding:0; }
body { background: var(--bg); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--text); font-size: 13px; line-height: 1.5; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 24px; }
.hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.hdr h1 { font-size: 28px; font-weight: 700; color: var(--text); }
.hdr h1 span { color: var(--accent); }
.hdr .sub { text-align: right; color: var(--text-muted); font-size: 13px; }
.card { background: var(--card); border-radius: 12px; margin-bottom: 24px; overflow: hidden; border: 1px solid var(--border); transition: border-color .2s; }
.card:hover { border-color: var(--accent); }
.card-h { padding: 16px 20px; font-size: 14px; font-weight: 600; color: var(--text); border-bottom: 1px solid var(--border); }
.card-b { padding: 20px; }
.tabs { display: flex; gap: 4px; margin-bottom: 24px; background: var(--card); border-radius: 12px; padding: 4px; overflow-x: auto; }
.tab { padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text-muted); transition: all .2s; border: none; background: none; }
.tab:hover { color: var(--text); background: var(--card-hover); }
.tab.active { color: var(--bg); background: var(--accent); font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
th { padding: 12px 16px; text-align: left; font-weight: 600; color: var(--text-muted); border-bottom: 2px solid var(--border); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; background: var(--card); position: sticky; top: 0; }
td { padding: 10px 16px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; color: var(--text); font-size: 13px; }
tr:hover { background: var(--card-hover); }
.g { color: var(--green); }.r { color: var(--red); }.y { color: var(--accent); }
.pill { display: inline-block; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; }
.ov-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 28px; }
.ov-card { background: var(--card); border-radius: 12px; padding: 20px; border: 1px solid var(--border); text-align: center; }
.ov-val { font-size: 26px; font-weight: 700; color: var(--text); }
.ov-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
.footer { text-align: center; padding: 24px; font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border); margin-top: 32px; }
</style></head><body>
<div class="wrap">
<div class="hdr"><h1><span>Duck Dive</span> — Sales Report</h1><div class="sub">Settimana ${wn} · ${wr.start} – ${wr.end} · ${dateStr}</div></div>

<!-- Month tabs -->
<div class="tabs" id="monthTabs">
${months.map(m=>`<div class="tab${m===latest?' active':''}" data-m="${m}">${ML[m]||m}</div>`).join('')}
</div>

<!-- Overview -->
<div id="overview"></div>

<!-- KPI Grid -->
<div id="kpiGrid"></div>

<!-- Weekly Detail (collapsible) -->
<div id="weeklyDetail"></div>

<!-- Performance Sales (all months) -->
<div id="perfSection"></div>

<!-- Grafici -->
<div class="card"><div class="card-h" style="border-left:3px solid #7c3aed;">Andamento Fatturato</div>
<div class="card-b"><canvas id="chartRevenue" height="220"></canvas></div></div>
<div class="card"><div class="card-h" style="border-left:3px solid #0891b2;">Andamento Visite</div>
<div class="card-b"><canvas id="chartVisite" height="220"></canvas></div></div>
<div class="card"><div class="card-h" style="border-left:3px solid #059669;">Andamento Conversioni</div>
<div class="card-b"><canvas id="chartConversioni" height="220"></canvas></div></div>

<div class="footer">Generato ${today.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} · Fonte: Visite clienti + Venduto totale</div>
</div>

<script>
const D=${JSON.stringify(jData)};
const AGENTS=${JSON.stringify(agents)};
const MONTHS=${JSON.stringify(months)};
const ML=${JSON.stringify(ML)};
const T=${JSON.stringify(TARGETS)};
const CH=${JSON.stringify(jChannels)};

let curMonth='${latest}';

function fmt(n){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:0,maximumFractionDigits:0}).format(n);}
function fmtD(n){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);}
function cls(v,t){return v>=t?'g':v>=t*.6?'y':'r';}
function pct(v,t){return t>0?Math.round(v/t*100):0;}
function sortW(ws){return[...ws].sort((a,b)=>parseInt(a)-parseInt(b));}
function bestPrev(metric,agent){
  let best=0;
  for(const m of MONTHS){
    if(m===curMonth)continue;
    const d=D[m]?.[agent];if(!d)continue;
    let v=0;
    if(metric==='vN')v=d.vN;else if(metric==='vE')v=d.vE;
    else if(metric==='fN')v=d.fN;else if(metric==='fR')v=d.fR;
    else if(metric==='convN')v=d.convN;else if(metric==='convR')v=d.convR;
    if(v>best)best=v;
  }
  return best;
}

function render(){
  renderOverview();
  renderKPI();
  renderWeekly();
  renderPerf();
  renderCharts();
}

function renderOverview(){
  // Fatturato totale TUTTI I CANALI (separato dai sales)
  const chData=CH[curMonth]||{};
  const fatTotale=chData._TOTALE||0;
  const fatHoreca=chData.HORECA||0;
  const fatAltri=fatTotale-fatHoreca;
  // Prev month for trend
  const mi=MONTHS.indexOf(curMonth);
  const pm=mi>0?MONTHS[mi-1]:null;
  const prevChData=pm?CH[pm]||{}:{};
  const prevFatTot=prevChData._TOTALE||0;
  const deltaTot=prevFatTot>0?Math.round((fatTotale-prevFatTot)/prevFatTot*100):0;
  const deltaTotCol=deltaTot>5?'#16a34a':deltaTot<-5?'#dc2626':'#64748b';
  const deltaTotArr=deltaTot>5?'↑':deltaTot<-5?'↓':'→';

  let totRev=0,totVis=0,totOrd=0;
  const agentData=AGENTS.map(a=>{
    const d=D[curMonth]?.[a];
    if(!d)return{name:a,rev:0,vis:0,ord:0,delta:0};
    const rev=d.fN+d.fR,vis=d.vN+d.vE,ord=d.ordN+d.ordR;
    totRev+=rev;totVis+=vis;totOrd+=ord;
    const pd=pm?D[pm]?.[a]:null;
    const prevRev=pd?(pd.fN+pd.fR):0;
    const delta=prevRev>0?Math.round((rev-prevRev)/prevRev*100):0;
    return{name:a,rev,vis,ord,delta};
  });

  let h='<div class="ov-grid">';
  // Fatturato TOTALE tutti canali — KPI principale in alto
  h+='<div class="ov-card" style="border-left:4px solid #7c3aed;text-align:left;">';
  h+='<div style="font-size:28px;font-weight:800;color:#1e293b;">'+fmtD(fatTotale)+'</div>';
  h+='<div class="ov-label" style="text-align:left;">Fatturato Totale (tutti i canali)</div>';
  h+='<div style="display:flex;gap:8px;margin-top:4px;font-size:11px;">';
  h+='<span style="color:#64748b;">Horeca: <strong>'+fmt(fatHoreca)+'</strong></span>';
  if(fatAltri>0) h+='<span style="color:#94a3b8;">· Altri: '+fmt(fatAltri)+'</span>';
  h+='</div>';
  h+='<div class="ov-trend" style="color:'+deltaTotCol+';margin-top:2px;">'+deltaTotArr+' '+(deltaTot>0?'+':'')+deltaTot+'% vs mese prec.</div>';
  h+='</div>';
  // Team Horeca + Visite + Ordini
  h+='<div class="ov-card"><div class="ov-val">'+fmt(totRev)+'</div><div class="ov-label">Fatt. Team Horeca</div></div>';
  h+='<div class="ov-card"><div class="ov-val">'+totVis+'</div><div class="ov-label">Visite Totali</div></div>';
  h+='</div><div class="ov-grid">';
  for(const a of agentData){
    const col=a.delta>5?'#16a34a':a.delta<-5?'#dc2626':'#64748b';
    const arrow=a.delta>5?'↑':a.delta<-5?'↓':'→';
    const maxRev=Math.max(...agentData.map(x=>x.rev),1);
    h+='<div class="ov-card" style="text-align:left;"><div style="font-weight:700;font-size:13px;margin-bottom:6px;">'+a.name+' <span style="font-size:10px;color:#94a3b8;font-weight:400;">Horeca</span></div>';
    h+='<div style="display:flex;justify-content:space-between;"><span style="font-size:18px;font-weight:800;">'+fmtD(a.rev)+'</span><span class="ov-trend" style="color:'+col+';">'+arrow+' '+(a.delta>0?'+':'')+a.delta+'%</span></div>';
    h+='<div style="font-size:11px;color:#64748b;margin-top:2px;">'+a.vis+' visite · '+a.ord+' ordini</div>';
    h+='<div class="bar-wrap"><div class="bar" style="width:'+Math.round(a.rev/maxRev*100)+'%;background:linear-gradient(90deg,#6366f1,#818cf8);"></div></div>';
    h+='</div>';
  }
  h+='</div>';
  document.getElementById('overview').innerHTML=h;
}

function renderKPI(){
  const kpis=[
    {label:'Visite nuovi clienti',key:'vN',tM:T.visite_nuovi.mese,tW:T.visite_nuovi.week,wKey:'vN'},
    {label:'Conversione nuovi clienti',key:'convN',tM:T.conversione_nuovi.mese,tW:T.conversione_nuovi.week,wKey:'cN'},
    {label:'Visite clienti attivi',key:'vE',tM:T.visite_attivi.mese,tW:T.visite_attivi.week,wKey:'vE'},
    {label:'Conversione clienti attivi',key:'convR',tM:T.conversione_attivi.mese,tW:T.conversione_attivi.week,wKey:'cR'},
    {label:'Fatturato nuovi (Horeca)',key:'fN',tM:a=>T.fatt_nuovi[a]?.mese||800,tW:a=>T.fatt_nuovi[a]?.week||200,wKey:'fN',cur:true},
    {label:'Fatturato riordini (Horeca)',key:'fR',tM:a=>T.fatt_riordini[a]?.mese||7000,tW:a=>T.fatt_riordini[a]?.week||1750,wKey:'fR',cur:true},
  ];

  // collect weeks
  const ws=new Set();
  AGENTS.forEach(a=>{const d=D[curMonth]?.[a];if(d)Object.keys(d.weeks).forEach(w=>ws.add(w));});
  const weeks=sortW(ws);

  let h='';
  for(const kpi of kpis){
    h+='<div class="card"><div class="card-h" style="border-left:3px solid #6366f1;">'+kpi.label+'</div><div class="card-b" style="padding:6px 10px;overflow-x:auto;"><table><thead><tr><th>Agente</th><th>Target</th><th>Actual</th><th>vs Target</th><th>vs Best</th>';
    for(const w of weeks) h+='<th>W'+w.split('/')[0]+'</th>';
    h+='</tr></thead><tbody>';

    for(const a of AGENTS){
      const d=D[curMonth]?.[a];
      const tM=typeof kpi.tM==='function'?kpi.tM(a):kpi.tM;
      const tW=typeof kpi.tW==='function'?kpi.tW(a):kpi.tW;
      const actual=d?d[kpi.key]:0;
      const p=pct(actual,tM);
      const best=bestPrev(kpi.key,a);
      const vsBest=best>0?Math.round((actual-best)/best*100):0;
      const vbCol=vsBest>0?'#16a34a':vsBest<0?'#dc2626':'#64748b';
      const fv=kpi.cur?fmt:v=>v;

      h+='<tr><td>'+a.split(' ')[0]+'</td>';
      h+='<td>'+fv(tM)+'</td>';
      h+='<td class="'+cls(actual,tM)+'"><strong>'+fv(actual)+'</strong></td>';
      h+='<td><span class="pill '+cls(actual,tM)+'">'+p+'%</span></td>';
      h+='<td style="color:'+vbCol+';font-weight:600;font-size:11px;">'+(vsBest>0?'+':'')+vsBest+'%</td>';

      for(const w of weeks){
        const wv=d?.weeks?.[w]?.[kpi.wKey]||0;
        const wVal=typeof wv==='object'?0:wv; // safety
        h+='<td'+(wVal>=tW?' class="g"':wVal>0&&wVal<tW*.6?' class="r"':'')+'>'+(wVal>0?fv(wVal):'-')+'</td>';
      }
      h+='</tr>';
    }
    h+='</tbody></table></div></div>';
  }
  document.getElementById('kpiGrid').innerHTML=h;
}

function renderWeekly(){
  const ws=new Set();
  AGENTS.forEach(a=>{const d=D[curMonth]?.[a];if(d)Object.keys(d.weeks).forEach(w=>ws.add(w));});
  const weeks=sortW(ws);

  let h='<div class="card"><div class="card-h" onclick="this.nextElementSibling.classList.toggle(\\'open\\')" style="border-left:3px solid #059669;">';
  h+='<span>Dettaglio Completo Settimanale</span><span class="toggle">Espandi ▼</span></div>';
  h+='<div class="card-b collapse">';

  for(const a of AGENTS){
    const d=D[curMonth]?.[a]; if(!d)continue;
    h+='<div style="margin-bottom:14px;"><div style="font-weight:700;padding:4px 8px;background:#f1f5f9;border-radius:6px;margin-bottom:4px;">'+a+'</div>';
    h+='<table><thead><tr><th></th>';
    for(const w of weeks) h+='<th>W'+w.split('/')[0]+'</th>';
    h+='<th style="font-weight:700;">Totale</th></tr></thead><tbody>';

    const rows=[
      {label:'Visite nuovi',fn:w=>d.weeks[w]?.vN||0,tW:T.visite_nuovi.week,tM:T.visite_nuovi.mese,tot:d.vN},
      {label:'Visite attivi',fn:w=>d.weeks[w]?.vE||0,tW:T.visite_attivi.week,tM:T.visite_attivi.mese,tot:d.vE},
      {label:'VISITE TOT',fn:w=>(d.weeks[w]?.vN||0)+(d.weeks[w]?.vE||0),tW:T.visite_nuovi.week+T.visite_attivi.week,tM:T.visite_nuovi.mese+T.visite_attivi.mese,tot:d.vN+d.vE,bold:true},
      {label:'Conv. nuovi',fn:w=>d.weeks[w]?.cN||0,tW:T.conversione_nuovi.week,tM:T.conversione_nuovi.mese,tot:d.convN},
      {label:'Conv. attivi',fn:w=>d.weeks[w]?.cR||0,tW:T.conversione_attivi.week,tM:T.conversione_attivi.mese,tot:d.convR},
      {label:'% Conv. nuovi',fn:w=>{const vn=d.weeks[w]?.vN||0,cn=d.weeks[w]?.cN||0;return vn>0?Math.round(cn/vn*100):0;},isPct:true,tot:d.vN>0?Math.round(d.convN/d.vN*100):0},
      {label:'% Conv. attivi',fn:w=>{const ve=d.weeks[w]?.vE||0,cr=d.weeks[w]?.cR||0;return ve>0?Math.round(cr/ve*100):0;},isPct:true,tot:d.vE>0?Math.round(d.convR/d.vE*100):0},
      {label:'Fatt. nuovi',fn:w=>d.weeks[w]?.fN||0,tW:T.fatt_nuovi[a]?.week||200,tM:T.fatt_nuovi[a]?.mese||800,tot:d.fN,cur:true},
      {label:'Fatt. riordini',fn:w=>d.weeks[w]?.fR||0,tW:T.fatt_riordini[a]?.week||1750,tM:T.fatt_riordini[a]?.mese||7000,tot:d.fR,cur:true},
      {label:'FATT. TOTALE',fn:w=>(d.weeks[w]?.fN||0)+(d.weeks[w]?.fR||0),tW:(T.fatt_nuovi[a]?.week||200)+(T.fatt_riordini[a]?.week||1750),tM:(T.fatt_nuovi[a]?.mese||800)+(T.fatt_riordini[a]?.mese||7000),tot:d.fN+d.fR,cur:true,bold:true},
    ];

    for(const row of rows){
      const s=row.bold?'font-weight:700;border-top:2px solid #e2e8f0;':'';
      h+='<tr style="'+s+'"><td style="font-size:11px;'+(row.bold?'font-weight:700;':'')+'">'+row.label+'</td>';
      for(const w of weeks){
        const v=row.fn(w);
        let c='';
        if(row.isPct){c=v>=30?'g':v>=15?'y':v>0?'r':'';}
        else if(row.tW){c=v>=row.tW?'g':v>=row.tW*.6?'y':'';}
        const disp=v>0?(row.cur?fmt(v):row.isPct?v+'%':v):'-';
        h+='<td'+(c?' class="'+c+'"':'')+'>'+disp+'</td>';
      }
      let tc='';
      if(row.isPct)tc=row.tot>=30?'g':row.tot>=15?'y':row.tot>0?'r':'';
      else if(row.tM)tc=cls(row.tot,row.tM);
      const totDisp=row.tot>0?(row.cur?fmt(row.tot):row.isPct?row.tot+'%':row.tot):'-';
      h+='<td class="'+tc+'" style="font-weight:700;">'+totDisp+'</td></tr>';
    }
    h+='</tbody></table></div>';
  }
  h+='</div></div>';
  document.getElementById('weeklyDetail').innerHTML=h;
}

function renderPerf(){
  let h='<div class="card"><div class="card-h" style="border-left:3px solid #d97706;">Performance Sales — Trend Mensile</div><div class="card-b">';

  // Table: agent x months with key metrics
  h+='<table><thead><tr><th>Agente</th><th>Metrica</th>';
  for(const m of MONTHS) h+='<th>'+ML[m]+'</th>';
  h+='</tr></thead><tbody>';

  for(const a of AGENTS){
    const metrics=[
      {label:'Visite totali',fn:m=>{const d=D[m]?.[a];return d?(d.vN+d.vE):0;}},
      {label:'Fatt. nuovi',fn:m=>D[m]?.[a]?.fN||0,cur:true},
      {label:'Fatt. riordini',fn:m=>D[m]?.[a]?.fR||0,cur:true},
      {label:'FATTURATO',fn:m=>{const d=D[m]?.[a];return d?(d.fN+d.fR):0;},cur:true,bold:true},
      {label:'Ordini',fn:m=>{const d=D[m]?.[a];return d?(d.ordN+d.ordR):0;}},
      {label:'Conv. nuovi',fn:m=>D[m]?.[a]?.convN||0},
      {label:'Conv. attivi',fn:m=>D[m]?.[a]?.convR||0},
    ];

    for(let mi=0;mi<metrics.length;mi++){
      const met=metrics[mi];
      const vals=MONTHS.map(m=>met.fn(m));
      const maxV=Math.max(...vals,1);
      h+='<tr'+(met.bold?' style="border-top:2px solid #e2e8f0;"':'')+'>';
      if(mi===0) h+='<td rowspan="'+metrics.length+'" style="font-weight:700;vertical-align:top;padding-top:6px;">'+a.split(' ')[0]+'</td>';
      h+='<td style="font-size:11px;'+(met.bold?'font-weight:700;':'')+'">'+met.label+'</td>';
      for(const v of vals){
        const disp=v>0?(met.cur?fmt(v):v):'-';
        h+='<td style="'+(met.bold?'font-weight:700;':'')+'">'+disp+'</td>';
      }
      h+='</tr>';
    }
  }

  // Team totals
  h+='<tr style="background:#f8fafc;border-top:3px solid #4f46e5;"><td colspan="2" style="font-weight:800;color:#4f46e5;">TEAM Fatturato</td>';
  for(const m of MONTHS){
    let t=0;AGENTS.forEach(a=>{const d=D[m]?.[a];if(d)t+=d.fN+d.fR;});
    h+='<td style="font-weight:800;color:#4f46e5;">'+(t>0?fmt(t):'-')+'</td>';
  }
  h+='</tr><tr style="background:#f8fafc;"><td colspan="2" style="font-weight:800;color:#4f46e5;">TEAM Visite</td>';
  for(const m of MONTHS){
    let t=0;AGENTS.forEach(a=>{const d=D[m]?.[a];if(d)t+=d.vN+d.vE;});
    h+='<td style="font-weight:800;color:#4f46e5;">'+(t>0?t:'-')+'</td>';
  }
  h+='</tr>';

  h+='</tbody></table></div></div>';
  document.getElementById('perfSection').innerHTML=h;
}

// Charts
let charts={};
function renderCharts(){
  const colors=['#f59e0b','#3b82f6','#22c55e','#ef4444'];
  const labels=MONTHS.map(m=>ML[m]||m);

  // Destroy existing
  Object.values(charts).forEach(c=>{if(c)c.destroy();});

  // Revenue chart — agents (Horeca) + totale tutti canali
  const revDS=AGENTS.map((a,i)=>({
    label:a+' (Horeca)',
    data:MONTHS.map(m=>{const d=D[m]?.[a];return d?Math.round(d.fN+d.fR):0;}),
    backgroundColor:colors[i%colors.length]+'33',
    borderColor:colors[i%colors.length],
    borderWidth:2,fill:true,tension:0.3
  }));
  revDS.push({
    label:'Team Horeca',
    data:MONTHS.map(m=>{let t=0;AGENTS.forEach(a=>{const d=D[m]?.[a];if(d)t+=d.fN+d.fR;});return Math.round(t);}),
    backgroundColor:'#1e293b22',borderColor:'#1e293b',borderWidth:2,borderDash:[5,3],fill:false,tension:0.3
  });
  revDS.push({
    label:'Totale Tutti Canali',
    data:MONTHS.map(m=>Math.round(CH[m]?._TOTALE||0)),
    backgroundColor:'#7c3aed22',borderColor:'#7c3aed',borderWidth:3,fill:false,tension:0.3,
    pointRadius:5,pointBackgroundColor:'#7c3aed'
  });
  charts.rev=new Chart(document.getElementById('chartRevenue'),{
    type:'line',data:{labels,datasets:revDS},
    options:{responsive:true,plugins:{legend:{position:'bottom',labels:{font:{size:11}}}},
      scales:{y:{beginAtZero:true,ticks:{callback:v=>'\\u20ac'+v.toLocaleString('it-IT')}}}}
  });

  // Visite chart
  const visDS=AGENTS.map((a,i)=>({
    label:a,
    data:MONTHS.map(m=>{const d=D[m]?.[a];return d?d.vN+d.vE:0;}),
    backgroundColor:colors[i%colors.length],borderColor:colors[i%colors.length],borderWidth:1
  }));
  charts.vis=new Chart(document.getElementById('chartVisite'),{
    type:'bar',data:{labels,datasets:visDS},
    options:{responsive:true,plugins:{legend:{position:'bottom',labels:{font:{size:11}}}},
      scales:{y:{beginAtZero:true}}}
  });

  // Conversioni chart
  const convDS=[];
  AGENTS.forEach((a,i)=>{
    convDS.push({
      label:a+' (nuovi)',
      data:MONTHS.map(m=>D[m]?.[a]?.convN||0),
      backgroundColor:colors[i%colors.length]+'88',borderColor:colors[i%colors.length],borderWidth:1,
      stack:'stack'+i
    });
    convDS.push({
      label:a+' (attivi)',
      data:MONTHS.map(m=>D[m]?.[a]?.convR||0),
      backgroundColor:colors[i%colors.length]+'44',borderColor:colors[i%colors.length],borderWidth:1,
      stack:'stack'+i
    });
  });
  charts.conv=new Chart(document.getElementById('chartConversioni'),{
    type:'bar',data:{labels,datasets:convDS},
    options:{responsive:true,plugins:{legend:{position:'bottom',labels:{font:{size:10}}}},
      scales:{y:{beginAtZero:true,stacked:true},x:{stacked:true}}}
  });
}

// Tabs
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    curMonth=tab.dataset.m;
    renderOverview();
    renderKPI();
    renderWeekly();
  });
});

render();
</script>
</body></html>`;
  return { subject, html, months, agents, latest };
}

function getActive(data, months) {
  const a = new Set();
  for (const m of months) {
    if (!data[m]) continue;
    for (const [name, d] of Object.entries(data[m])) {
      if (d.vN + d.vE > 10 || d.ordN + d.ordR > 5) a.add(name);
    }
  }
  return [...a].sort();
}

function getISOWeek(d){const date=new Date(d);date.setHours(0,0,0,0);date.setDate(date.getDate()+3-((date.getDay()+6)%7));const w1=new Date(date.getFullYear(),0,4);return 1+Math.round(((date-w1)/864e5-3+((w1.getDay()+6)%7))/7);}
function getWeekRange(d){const date=new Date(d);const day=date.getDay();const diff=date.getDate()-day+(day===0?-6:1);const mon=new Date(date);mon.setDate(diff);const fri=new Date(mon);fri.setDate(mon.getDate()+4);return{start:mon.toLocaleDateString('it-IT',{day:'numeric',month:'short'}),end:fri.toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'})};}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const outputDir = args.includes('--output-dir') ? args[args.indexOf('--output-dir') + 1]
    : '/home/node/.openclaw/workspace/public/duck-dive';

  console.log('Fetching...');
  const [v, s] = await Promise.all([fetchCSV(BASE + GID.visite), fetchCSV(BASE + GID.venduto)]);
  const vr = parseCSV(v), sr = parseCSV(s);
  console.log('Visite: '+(vr.length-1)+', Venduto: '+(sr.length-1));

  const result = processData(vr, sr);
  const { subject, html, months, agents, latest } = generateHTML(result);
  const data = result.agents;

  console.log('Focus: '+latest+', Agenti: '+agents.join(', ')+ ' (SOLO HORECA)');
  for (const a of agents) {
    const d=data[latest]?.[a];
    if(d) console.log('  '+a+': vN='+d.vN+' vE='+d.vE+' fN='+d.fN.toFixed(2)+' fR='+d.fR.toFixed(2)+' trueConvN='+(d.trueConvN?.size||0)+' convR='+d.convR.size);
  }
  // Channel totals
  const ch = result.channelTotals[latest] || {};
  const chTot = Object.values(ch).reduce((s,v)=>s+v,0);
  console.log('Fatt. totale tutti canali: '+fmt(chTot)+' (Horeca: '+fmt(ch.HORECA||0)+')');

  if(!fs.existsSync(outputDir)) fs.mkdirSync(outputDir,{recursive:true});
  const slug=new Date().toISOString().split('T')[0];
  const fp=path.join(outputDir,'daily-kpi-'+slug+'.html');
  const lp=path.join(outputDir,'latest.html');
  fs.writeFileSync(fp,html,'utf-8');
  fs.writeFileSync(lp,html,'utf-8');
  fs.writeFileSync(path.join(outputDir,'latest-meta.json'),JSON.stringify({
    generated:new Date().toISOString(),subject,reportFile:fp,latestFile:lp,
    recipients:[],focusMonth:latest,
    agents:agents.map(a=>{const d=data[latest]?.[a];return{name:a,vN:d?.vN||0,vE:d?.vE||0,fN:d?Math.round(d.fN*100)/100:0,fR:d?Math.round(d.fR*100)/100:0};})
  },null,2),'utf-8');

  console.log('Report: '+fp);
  console.log('Subject: '+subject);
}

main().then(()=>process.exit(0)).catch(e=>{console.error('Errore:',e);process.exit(1);});
