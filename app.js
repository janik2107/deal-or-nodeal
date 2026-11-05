'use strict';
const VERSION='dn-v3';
const KEY='dealnodeal-v1';
const $=s=>document.querySelector(s),view=$('#view');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eur=v=>isFinite(v)?Math.round(v).toLocaleString('de-DE')+' €':'–';
const f1=v=>isFinite(v)?(+v).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}):'–';
const f2=v=>(+v).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
const f1n=v=>(+v).toLocaleString('de-DE',{maximumFractionDigits:1});
const sgn=v=>(v>=0?'+':'−')+eur(Math.abs(v));
const num=s=>{const x=parseFloat(String(s).replace(/\s|€|%/g,'').replace(',','.'));return isFinite(x)?x:NaN};
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return''}};

/* ---------- Annahmen (Kaufnebenkosten) ---------- */
const NOTAR=2.0, MAKLER=3.57, BEW=20, AFA_GEB=80;
const afaSatz=bj=>bj&&bj<1925?2.5:bj>=2023?3:2;
const GREST={SN:5.5,ST:5.0,TH:5.0};const LAND={SN:'Sachsen',ST:'Sachsen-Anhalt',TH:'Thüringen'};
const landOf=x=>x.land&&GREST[x.land]?x.land:(String(x.plz||'').startsWith('06')?'ST':'SN');

/* ---------- Speicher ---------- */
function defaults(){return{v:1,settings:{fin:100,zins:5,jahre:30,sort:'score',mode:'MFH',theme:'auto',list:'deal',afa:true,steuer:30,dsort:'t'},L:{},sw:{},hist:[],stand:null,bundled:null}}
function load(){try{const o=JSON.parse(localStorage.getItem(KEY));if(o&&o.L){const d=defaults();o.settings=Object.assign(d.settings,o.settings||{});o.sw=o.sw||{};o.hist=o.hist||[];return o}}catch(e){}return defaults()}
let S=load();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){toast('Speichern fehlgeschlagen')}};
const U={tab:'swipe',busy:false};

/* ---------- Daten / Import ---------- */
const imId=u=>{const m=/immometrica\.com\/(?:[a-z]{2}\/)?offer\/(\d+)/.exec(u||'');return m?'im:'+m[1]:null};
const deriveId=x=>x.id?String(x.id):(imId(x.immometrica)||imId(x.expose)||(x.expose?String(x.expose).trim():null));
const FIELDS=['typ','ort','plz','titel','preis','wfl','we','baujahr','zustand','mieteJahr','brutto','faktor','preisQm','netto','score','expose','immometrica','linkstatus','privat','makler','land'];
const TYPES=[['MFH','MFH','Mehrfamilienhäusern'],['Haus','Haus','Häusern'],['ETW','ETW','Wohnungen']];
const normTyp=t=>{t=String(t||'');return/etw|wohnung/i.test(t)?'ETW':/^(haus|efh|zfh|einfamilien|zweifamilien|reihen|doppel)/i.test(t)?'Haus':'MFH'};
function clean(x){const o={};for(const k of FIELDS)if(x[k]!==undefined&&x[k]!==null&&x[k]!=='')o[k]=x[k];
 for(const k of ['preis','wfl','we','baujahr','mieteJahr','brutto','faktor','preisQm','netto','score','makler'])if(k in o){const v=typeof o[k]==='number'?o[k]:num(o[k]);if(isFinite(v))o[k]=v;else delete o[k]}
 if(o.mieteJahr==null&&isFinite(num(x.mieteMonat)))o.mieteJahr=num(x.mieteMonat)*12;
 o.typ=normTyp(o.typ);o.plz=o.plz!=null?String(o.plz).padStart(5,'0').slice(0,5):'';
 if(o.brutto==null&&o.preis&&o.mieteJahr)o.brutto=+(o.mieteJahr/o.preis*100).toFixed(2);
 if(o.faktor==null&&o.preis&&o.mieteJahr)o.faktor=+(o.preis/o.mieteJahr).toFixed(1);
 if(o.preisQm==null&&o.preis&&o.wfl)o.preisQm=Math.round(o.preis/o.wfl);
 return o}
function merge(list){let neu=0,upd=0,bad=0;const byLink={};for(const[id,x]of Object.entries(S.L)){if(x.expose)byLink[x.expose]=id;if(x.immometrica)byLink[x.immometrica]=id}
 for(const raw of list){if(!raw||typeof raw!=='object'){bad++;continue}const x=clean(raw);let id=deriveId(raw);
  if(!(x.preis>0)||!(x.mieteJahr>=0)||!id||!(x.expose||x.immometrica)){bad++;continue}
  const ex=S.L[id]?id:(byLink[x.expose]||byLink[x.immometrica]||null);
  if(ex){S.L[ex]=Object.assign({},S.L[ex],x,{id:ex});upd++}else{S.L[id]=Object.assign(x,{id});neu++;if(x.expose)byLink[x.expose]=id;if(x.immometrica)byLink[x.immometrica]=id}}
 return{neu,upd,bad}}
function importData(o){const list=Array.isArray(o)?o:(o&&Array.isArray(o.listings)?o.listings:null);if(!list)throw new Error('Keine „listings“ in der Datei gefunden.');
 const r=merge(list);if(!Array.isArray(o)&&o.stand)S.stand=o.stand;save();return r}
async function loadBundled(force){try{const res=await fetch('data.json',{cache:'no-cache'});if(!res.ok)throw 0;const o=await res.json();
  const tag=(o.stand||'')+'#'+(o.listings||[]).length;if(force||S.bundled!==tag||!Object.keys(S.L).length){const r=importData(o);S.bundled=tag;save();return r}}catch(e){if(!Object.keys(S.L).length)throw e}return null}

/* ---------- Rechnen ---------- */
function calc(x,st=S.settings){const P=x.preis,K=P*st.fin/100,r=st.zins/1200,n=Math.round(st.jahre*12);
 const rate=r>0?K*r/(1-Math.pow(1+r,-n)):K/n;const z1=K*r,t1=rate-z1,zinsGes=rate*n-K;
 const mm=(x.mieteJahr||0)/12,bew=mm*BEW/100,cf=mm-rate-bew;const land=landOf(x),gr=GREST[land];
 const mak=x.makler!=null?x.makler:(x.privat?0:MAKLER),nkq=gr+NOTAR+mak,nk=P*nkq/100,eigen=P-K;
 // Steuer Jahr 1 (vereinfachte Schätzung)
 let B=K,zJ=0;for(let i=0;i<Math.min(12,n);i++){const zi=B*r;zJ+=zi;B-=rate-zi}
 const mJ=x.mieteJahr||0,bewJ=mJ*BEW/100,bj=+x.baujahr||0,afaS=afaSatz(bj),afaB=AFA_GEB/100*(P+nk),afaJ=st.afa!==false?afaB*afaS/100:0;
 const zvE=mJ-zJ-bewJ-afaJ,sq=isFinite(+st.steuer)?+st.steuer:30,stJ=zvE*sq/100,cfJ=cf*12,cfStJ=cfJ-stJ;
 return{K,rate,z1,t1,zinsGes,mm,bew,cf,land,gr,mak,nkq,nk,eigen,ek:nk+eigen,n,zJ,mJ,bewJ,afaS,afaB,afaJ,zvE,sq,stJ,cfJ,cfStJ,cfSt:cfStJ/12}}
const all=()=>Object.values(S.L);
const ofMode=m=>all().filter(x=>x.typ===m);
function sorted(list){const s=S.settings.sort;const k=s==='cfst'?(x=>calc(x).cfSt):s==='cf'?(x=>calc(x).cf):s==='brutto'?(x=>x.brutto||0):(x=>x.score||0);return list.map(x=>[k(x),x]).sort((a,b)=>b[0]-a[0]||(b[1].score||0)-(a[1].score||0)).map(a=>a[1])}
const deck=()=>sorted(ofMode(S.settings.mode).filter(x=>!S.sw[x.id]));
const lastOfMode=()=>{for(let i=S.hist.length-1;i>=0;i--){const x=S.L[S.hist[i]];if(x&&x.typ===S.settings.mode&&S.sw[x.id])return i}return-1};

/* ---------- UI-Helfer ---------- */
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,2200)}
function applyTheme(){const t=S.settings.theme;if(t==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',t)}
const seg=(act,opts,cur)=>`<div class="seg">${opts.map(([v,l])=>`<button class="${String(cur)===String(v)?'on':''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
const row=(k,v,cls='')=>`<div class="row ${cls}"><span>${k}</span><b>${v}</b></div>`;
const STAT={ok:'Original-Link geprüft (erreichbar)',swap:'Original offline → zeigt auf ImmoMetrica (Login nötig)',blk:'Portal blockt Prüfung – Original ungeprüft',im:'ImmoMetrica-Link'};

function render(){applyTheme();document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.tab===U.tab));
 const nd=all().filter(x=>S.sw[x.id]&&S.sw[x.id].d).length;$('#dealcount').textContent=nd||'';
 document.body.classList.toggle('swiping',U.tab==='swipe');
 view.innerHTML=`<div class="tab">${U.tab==='deals'?deals():U.tab==='more'?more():swipe()}</div>`;
 const A=$('#actions');A.hidden=U.tab!=='swipe';if(U.tab==='swipe'){const d=deck();if(!$('#card'))U.anim=null;A.querySelector('.no').disabled=!d.length;A.querySelector('.yes').disabled=!d.length;A.querySelector('.undo').disabled=lastOfMode()<0;bindCard()}}

/* ---------- Swipen ---------- */
function settingsPanel(){const s=S.settings;const sl={score:'Score',cf:'Cashflow',cfst:'Cashflow n. Steuer',brutto:'Rendite'}[s.sort]||'Score';
 return`<details class="panel" id="panel" ${U.panel?'open':''}><summary><span class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></span><span class="t"><b>Finanzierung, Steuer & Sortierung</b><small>${s.fin} % · ${f2(s.zins)} % Zins · ${s.jahre} J. · Steuer ${f1n(s.steuer)} %${s.afa!==false?' + AfA':''} · nach ${sl}</small></span><span class="chev">›</span></summary>
 <div class="pbody"><div class="pl">Finanzierung</div>${seg('fin',[[100,'100 %'],[90,'90 %'],[80,'80 %']],s.fin)}
 <div class="steps"><div style="flex:1"><div class="pl">Sollzins p.a.</div><div class="stp"><button data-act="zins" data-v="-0.25" aria-label="Zins senken">−</button><input id="zins" inputmode="decimal" value="${f2(s.zins)}"><span class="u">%</span><button data-act="zins" data-v="0.25" aria-label="Zins erhöhen">+</button></div></div>
 <div style="flex:1"><div class="pl">Laufzeit</div><div class="stp"><button data-act="jahre" data-v="-1" aria-label="Laufzeit kürzer">−</button><input id="jahre" inputmode="numeric" value="${s.jahre}"><span class="u">J.</span><button data-act="jahre" data-v="1" aria-label="Laufzeit länger">+</button></div></div></div>
 <div class="steps"><div style="flex:1"><div class="pl">Steuersatz</div><div class="stp"><button data-act="steuer" data-v="-1" aria-label="Steuersatz senken">−</button><input id="steuer" inputmode="decimal" value="${f1n(s.steuer)}"><span class="u">%</span><button data-act="steuer" data-v="1" aria-label="Steuersatz erhöhen">+</button></div></div>
 <div style="flex:1"><div class="pl">AfA (Annahme)</div>${seg('afa',[['1','An'],['0','Aus']],s.afa!==false?'1':'0')}</div></div>
 <div class="pl">Sortieren nach</div>${seg('sort',[['score','Score'],['cf','Cashflow'],['cfst','n. Steuer'],['brutto','Rendite']],s.sort)}</div></details>`}
function cardHtml(x){const k=calc(x),s=S.settings;const imSame=x.immometrica&&x.immometrica===x.expose;
 return`<div class="stamp deal">Deal</div><div class="stamp nodeal">NoDeal</div>
 <div class="tags"><span class="tag">${x.typ}${x.we?' · '+x.we+' WE':''}</span><span class="tag score ${x.score>=75?'hi':''}">Score ${x.score??'–'}</span>${x.privat?'<span class="tag">privat · ohne Makler</span>':''}</div>
 <div class="loc">${esc((x.plz?x.plz+' ':'')+(x.ort||''))}</div><div class="title">${esc(x.titel||'Ohne Titel')}</div>
 <div class="bigs"><div class="big"><span>Kaufpreis</span><b>${eur(x.preis)}</b><small>${x.preisQm?eur(x.preisQm)+'/m²':'&nbsp;'}</small></div>
 <div class="big"><span>Miete / Monat</span><b>${eur(k.mm)}</b><small>${eur(x.mieteJahr)} pro Jahr</small></div>
 <div class="big"><span>Bruttorendite</span><b>${f1(x.brutto)} %</b><small>Faktor ${f1(x.faktor)}</small></div>
 <div class="big"><span>Cashflow / Monat</span><b class="${k.cf>=0?'pos':'neg'}">${sgn(k.cf)}</b><small>${k.cf>=0?'positiv':'negativ'} vor Steuer</small></div>
 <div class="big wide st"><span>Cashflow nach Steuer / Monat</span><b class="${k.cfSt>=0?'pos':'neg'}">${sgn(k.cfSt)}</b><small>${sgn(k.cfStJ)} pro Jahr · Jahr 1 · ${f1n(k.sq)} % Steuer${s.afa!==false?' · mit AfA':' · ohne AfA'}</small></div></div>
 <div class="grp"><div class="gh">Objekt</div>${row('Wohneinheiten',x.we||'k. A.')}${row('Wohnfläche',x.wfl?Math.round(x.wfl).toLocaleString('de-DE')+' m²':'k. A.')}${row('Baujahr',x.baujahr||'k. A.')}${row('Zustand',esc(x.zustand||'k. A.'))}${x.netto!=null?row('Nettorendite (grob)',f1(x.netto)+' %'):''}</div>
 <div class="grp"><div class="gh"><span>Kredit</span><span>${s.fin} % · ${f2(s.zins)} % · ${s.jahre} J.</span></div>
 ${row('Darlehen',eur(k.K))}${row('Monatsrate (Annuität)',eur(k.rate),'tot')}${row('Zinsanteil 1. Monat',eur(k.z1))}${row('Tilgung 1. Monat',eur(k.t1))}${row('Zinsen gesamt ('+s.jahre+' J.)',eur(k.zinsGes))}
 ${row('Miete / Monat',eur(k.mm))}${row('− Rate',eur(k.rate))}${row('− Bewirtschaftung '+BEW+' %',eur(k.bew))}${row('= Cashflow / Monat',`<span class="${k.cf>=0?'pos':'neg'}">${sgn(k.cf)}</span>`,'tot')}</div>
 <div class="grp"><div class="gh"><span>Eigenkapital</span><span>${LAND[k.land]}</span></div>
 ${row('Grunderwerbsteuer '+f1(k.gr)+' %',eur(x.preis*k.gr/100),'sm')}${row('Notar & Grundbuch '+f1(NOTAR)+' %',eur(x.preis*NOTAR/100),'sm')}${row('Makler '+f2(k.mak)+' %'+(x.makler!=null?'':x.privat?' (privat)':' (angenommen)'),eur(x.preis*k.mak/100),'sm')}
 ${k.eigen>0?row('Eigenanteil Kaufpreis '+(100-s.fin)+' %',eur(k.eigen),'sm'):''}${row('Eigenkapital gesamt',eur(k.ek),'tot')}</div>
 ${taxHtml(x,k)}
 <div class="btns"><a class="pill" href="${esc(x.expose||x.immometrica)}" target="_blank" rel="noopener" data-link>Exposé öffnen</a>${x.immometrica&&!imSame?`<a class="pill sec" href="${esc(x.immometrica)}" target="_blank" rel="noopener" data-link>ImmoMetrica</a>`:''}</div>
 <div class="lnote">${esc([STAT[x.linkstatus],host(x.expose||x.immometrica)].filter(Boolean).join(' · '))}</div>`}
const row3=(k,m,y,cls='')=>`<div class="row r3 ${cls}"><span>${k}</span><b>${m}</b><b>${y}</b></div>`;
function taxHtml(x,k){const s=S.settings,on=s.afa!==false,sp=k.stJ<0;const neg=v=>'−'+eur(Math.abs(v));
 return`<div class="grp tax"><div class="gh"><span>Steuer · Jahr 1</span><span>${f1n(k.sq)} % Steuersatz</span></div>
 ${row3('','Monat','Jahr','hd')}
 ${row3('Miete (Ist)',eur(k.mJ/12),eur(k.mJ))}
 ${row3('− Zinsen Jahr 1',neg(k.zJ/12),neg(k.zJ))}
 ${row3('− Bewirtschaftung '+BEW+' %',neg(k.bewJ/12),neg(k.bewJ))}
 ${on?row3('− AfA '+f1n(k.afaS)+' % (Annahme)',neg(k.afaJ/12),neg(k.afaJ)):row3('AfA (abgeschaltet)','–','–','sm')}
 ${row3('= zu versteuerndes Ergebnis',sgn(k.zvE/12),sgn(k.zvE),'tot')}
 ${sp?row3('Steuerersparnis (Verrechnung mit anderen Einkünften)','<span class="pos">+'+eur(-k.stJ/12)+'</span>','<span class="pos">+'+eur(-k.stJ)+'</span>'):row3('Steuer '+f1n(k.sq)+' %',neg(k.stJ/12),neg(k.stJ))}
 ${row3('Cashflow vor Steuer',sgn(k.cf),sgn(k.cfJ),'sm')}
 ${row3('= Cashflow nach Steuer',`<span class="${k.cfSt>=0?'pos':'neg'}">${sgn(k.cfSt)}</span>`,`<span class="${k.cfStJ>=0?'pos':'neg'}">${sgn(k.cfStJ)}</span>`,'tot big2')}
 <div class="tnote">${on?`AfA-Annahme: Gebäudeanteil ${AFA_GEB} % von Kaufpreis + Nebenkosten = ${eur(k.afaB)}, ${f1n(k.afaS)} % p.a. (Baujahr ${x.baujahr||'k. A.'}; vor 1925: 2,5 %, ab 2023: 3 %, sonst 2 %). `:'AfA abgeschaltet. '}Zinsen = Summe der 12 Zinsanteile, Tilgung nicht absetzbar. Vereinfachte Schätzung, keine Steuerberatung.</div></div>`}
function swipe(){const s=S.settings,m=s.mode,L=ofMode(m),d=deck();if(U.front){const i=d.findIndex(x=>x.id===U.front);if(i>0)d.unshift(d.splice(i,1)[0])}const sw=L.filter(x=>S.sw[x.id]),nd=sw.filter(x=>S.sw[x.id].d).length;
 const top=d[0];
 return`<h1>Deal or NoDeal<span class="sub">Sachsen & Halle · → Deal · ← NoDeal</span></h1>
 ${seg('mode',TYPES.filter(([t])=>t===m||ofMode(t).length).map(([t,l])=>[t,l+' ('+ofMode(t).length+')']),m)}
 ${settingsPanel()}
 <div class="meta"><span>${top?`Karte <b>${sw.length+1}</b> von ${L.length}`:`${L.length} von ${L.length} bewertet`}</span><span><span class="h">♥ ${nd}</span> &nbsp; <span class="x">✕ ${sw.length-nd}</span></span></div>
 ${top?`<div class="stack">${d[2]?'<div class="under u2"></div>':''}${d[1]?'<div class="under"></div>':''}<div class="card ${U.anim||''}" id="card" data-id="${esc(top.id)}">${cardHtml(top)}</div></div>
 <div class="assume">Annahmen: Annuitätendarlehen, Kaufnebenkosten aus Eigenkapital (Grunderwerbsteuer Sachsen 5,5 % / Sachsen-Anhalt 5,0 %, Notar & Grundbuch 2 %, Makler 3,57 % falls nicht privat). Cashflow = Ist-Miete − Rate − 20 % Bewirtschaftung; „nach Steuer“ zusätzlich mit Zinsen Jahr 1, AfA-Annahme und Steuersatz. Vereinfachte Schätzung, keine Steuerberatung. Details unter „Mehr“.</div>`
 :`<div class="empty"><div class="e">🎉</div><h2>Alles bewertet</h2><p>${nd} Deals von ${L.length} ${(TYPES.find(t=>t[0]===m)||TYPES[0])[2]}.</p><button class="pill" style="display:inline-flex;padding:13px 26px" data-act="tab" data-v="deals">Deals ansehen</button></div>`}`}
function decide(d,via){if(U.busy)return;const c=$('#card');if(!c)return;const id=c.dataset.id;U.busy=true;
 const w=window.innerWidth;c.classList.add('anim');c.style.transform=`translateX(${d?1.4*w:-1.4*w}px) rotate(${d?22:-22}deg)`;c.style.opacity='0';
 const st=c.querySelector(d?'.stamp.deal':'.stamp.nodeal');if(st)st.style.opacity=1;
 S.sw[id]={d:!!d,t:Date.now()};U.front=null;S.hist=S.hist.filter(h=>h!==id);S.hist.push(id);save();if(navigator.vibrate)try{navigator.vibrate(8)}catch(e){}
 setTimeout(()=>{U.busy=false;U.anim='enter';render()},via==='drag'?260:300)}
function undo(){if(U.busy)return;const i=lastOfMode();if(i<0)return;const id=S.hist[i],was=S.sw[id];S.hist.splice(i,1);delete S.sw[id];save();
 // zurückgeholte Karte immer oben zeigen
 U.front=id;U.anim='back';U.backFrom=was&&was.d?1:-1;render();toast('Rückgängig: '+(was&&was.d?'Deal':'NoDeal'))}
function bindCard(){const c=$('#card');if(!c)return;if(U.anim==='back'){c.style.setProperty('--from',(U.backFrom>0?'120%':'-120%'));c.style.setProperty('--rot',(U.backFrom>0?'12deg':'-12deg'))}U.anim=null;
 const sd=c.querySelector('.stamp.deal'),sn=c.querySelector('.stamp.nodeal');let P=null;
 const set=dx=>{c.style.transform=`translateX(${dx}px) rotate(${dx/18}deg)`;sd.style.opacity=Math.max(0,Math.min(1,dx/90));sn.style.opacity=Math.max(0,Math.min(1,-dx/90))};
 c.addEventListener('pointerdown',e=>{if(U.busy||e.button>0||e.target.closest('[data-link],a,button,input'))return;P={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId,lock:null,dx:0}});
 c.addEventListener('pointermove',e=>{if(!P||e.pointerId!==P.id)return;const dx=e.clientX-P.x,dy=e.clientY-P.y;
  if(P.lock==null&&(Math.abs(dx)>6||Math.abs(dy)>6)){P.lock=Math.abs(dx)>Math.abs(dy)?'x':'y';if(P.lock==='x'){try{c.setPointerCapture(e.pointerId)}catch(_){}c.classList.remove('anim','enter','back');c.classList.add('drag')}else{P=null;return}}
  if(P.lock==='x'){e.preventDefault();P.dx=dx;P.vx=dx/Math.max(1,performance.now()-P.t);set(dx)}});
 const end=e=>{if(!P||P.lock!=='x'){P=null;return}c.classList.remove('drag');const dx=P.dx,v=P.vx||0;P=null;
  if(dx>110||(dx>40&&v>0.6))decide(true,'drag');else if(dx<-110||(dx<-40&&v<-0.6))decide(false,'drag');else{c.classList.add('anim');set(0);setTimeout(()=>c.classList.remove('anim'),400)}};
 c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
 c.addEventListener('click',e=>{if(c.classList.contains('drag'))e.preventDefault()},true)}

/* ---------- Deals ---------- */
function decided(dv){return all().filter(x=>S.sw[x.id]&&S.sw[x.id].d===dv).sort((a,b)=>S.sw[b.id].t-S.sw[a.id].t)}
function dsorted(L){const d=S.settings.dsort;if(d!=='cf'&&d!=='cfst')return L;const f=d==='cf'?(x=>calc(x).cf):(x=>calc(x).cfSt);return L.map(x=>[f(x),x]).sort((a,b)=>b[0]-a[0]).map(a=>a[1])}
function deals(){const l=S.settings.list,D=decided(true),N=decided(false),L=dsorted(l==='nodeal'?N:D);
 return`<h1>${l==='nodeal'?'NoDeals':'Deals'}</h1>${seg('list',[['deal','♥ Deals ('+D.length+')'],['nodeal','✕ NoDeals ('+N.length+')']],l)}
 ${L.length?`<div class="pl" style="margin:12px 2px 6px">Sortieren nach</div>${seg('dsort',[['t','Neueste'],['cf','Cashflow'],['cfst','Cashflow n. Steuer']],S.settings.dsort||'t')}`:''}
 ${L.length?`<div class="exp"><button data-act="csv">CSV</button><button data-act="copy">Text kopieren</button>${navigator.share?'<button data-act="share">Teilen</button>':''}</div>`:''}
 ${L.length?L.map(x=>{const k=calc(x);const imSame=x.immometrica&&x.immometrica===x.expose;return`<div class="deal"><div class="h"><div><b>${esc(x.titel)}</b><div class="s">${esc((x.plz?x.plz+' ':'')+x.ort)} · ${x.typ}${x.we?' · '+x.we+' WE':''} · Score ${x.score??'–'}</div></div></div>
  <div class="k"><span>Preis <b>${eur(x.preis)}</b></span><span>Miete <b>${eur(k.mm)}</b>/M.</span><span>Brutto <b>${f1(x.brutto)} %</b></span><span>Cashflow <b class="${k.cf>=0?'pos':'neg'}">${sgn(k.cf)}</b></span></div>
  <div class="kst"><span>Cashflow nach Steuer</span><b class="${k.cfSt>=0?'pos':'neg'}">${sgn(k.cfSt)}/M.</b><small>${sgn(k.cfStJ)}/Jahr</small></div>
  <details class="dtax"><summary>Steuer Jahr 1 (Schätzung)</summary>${taxHtml(x,k)}</details>
  <div class="btns"><a class="pill" href="${esc(x.expose||x.immometrica)}" target="_blank" rel="noopener">Exposé</a>${x.immometrica&&!imSame?`<a class="pill sec" href="${esc(x.immometrica)}" target="_blank" rel="noopener">ImmoMetrica</a>`:''}<button class="mv ${l==='nodeal'?'pos':'neg'}" data-act="flip" data-id="${esc(x.id)}" aria-label="${l==='nodeal'?'Zu Deals':'Zu NoDeals'}">${l==='nodeal'?'♥':'✕'}</button><button class="mv" data-act="unswipe" data-id="${esc(x.id)}" aria-label="Zurück in den Stapel">↶</button></div></div>`}).join('')
 :`<div class="empty"><div class="e">${l==='nodeal'?'✕':'♥'}</div><h2>Noch keine ${l==='nodeal'?'NoDeals':'Deals'}</h2><p>Wische Karten ${l==='nodeal'?'nach links':'nach rechts'}.</p></div>`}
 ${L.length?`<div class="gh2">Als Text</div><pre class="txt" id="txt">${esc(exportText(L))}</pre><div class="foot">Kopieren und in den Chat einfügen. „✕“/„♥“ verschiebt eine Karte, „↶“ legt sie zurück in den Stapel.</div>`:''}`}
function exportText(L){const s=S.settings;return L.map((x,i)=>{const k=calc(x);return`${i+1}. ${x.ort} (${x.plz}) – ${x.titel}\n   ${eur(x.preis)} · Miete ${eur(k.mm)}/Monat · Brutto ${f1(x.brutto)} % · Faktor ${f1(x.faktor)} · Cashflow ${sgn(k.cf)}/Monat (${s.fin} %, ${f2(s.zins)} %, ${s.jahre} J.) · nach Steuer ${sgn(k.cfSt)}/Monat (Jahr 1, ${f1n(k.sq)} %${s.afa!==false?', mit AfA':', ohne AfA'}; Schätzung)\n   Exposé: ${x.expose||x.immometrica}${x.immometrica&&x.immometrica!==x.expose?'\n   ImmoMetrica: '+x.immometrica:''}`}).join('\n\n')}
function exportCSV(L){const n=v=>isFinite(v)?(+v.toFixed(2)).toLocaleString('de-DE',{useGrouping:false,maximumFractionDigits:2}):'';const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const H=['Entscheidung','Typ','Ort','PLZ','Titel','Kaufpreis','Wohnfläche','WE','Baujahr','Zustand','Miete Monat','Miete Jahr','Bruttorendite %','Faktor','Score','Darlehen','Rate Monat','Cashflow Monat','Zinsen Jahr 1','AfA Jahr 1','zu verst. Ergebnis Jahr 1','Steuer Jahr 1 (negativ = Ersparnis)','Cashflow nach Steuer Monat','Cashflow nach Steuer Jahr 1','Eigenkapital','Exposé','ImmoMetrica','Bewertet am'];
 const R=L.map(x=>{const k=calc(x),w=S.sw[x.id];return[q(w&&w.d?'Deal':'NoDeal'),q(x.typ),q(x.ort),q(x.plz),q(x.titel),n(x.preis),n(x.wfl),n(x.we),n(x.baujahr),q(x.zustand),n(k.mm),n(x.mieteJahr),n(x.brutto),n(x.faktor),n(x.score),n(k.K),n(k.rate),n(k.cf),n(k.zJ),n(k.afaJ),n(k.zvE),n(k.stJ),n(k.cfSt),n(k.cfStJ),n(k.ek),q(x.expose),q(x.immometrica),q(w?new Date(w.t).toLocaleString('de-DE'):'')].join(';')});
 return'\ufeff'+[H.map(q).join(';'),...R].join('\r\n')}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
async function copy(t){try{await navigator.clipboard.writeText(t);return true}catch(e){const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}ta.remove();return ok}}

/* ---------- Mehr ---------- */
function more(){const s=S.settings,n=all().length,sw=Object.keys(S.sw).length,d=Object.values(S.sw).filter(x=>x.d).length;
 return`<h1>Mehr</h1>
 <div class="gh2">Darstellung</div>${seg('theme',[['auto','Automatisch'],['light','Hell'],['dark','Dunkel']],s.theme)}
 <div class="gh2">Daten</div><div class="group"><div class="cell"><div class="l">Objekte<small>Stand ${esc(S.stand||'–')}</small></div><div class="r">${n}<small style="color:var(--sec)">${TYPES.map(([t])=>ofMode(t).length+' '+t).join(' · ')}</small></div></div>
 <button class="cell btn" data-act="import">Daten importieren (JSON)</button><button class="cell btn" data-act="reload">Mitgelieferte Daten neu laden</button></div>
 <div class="foot">Neue Objekte werden hinzugefügt, bekannte (gleiche ID bzw. gleicher Exposé-/ImmoMetrica-Link) aktualisiert. Deine Swipes bleiben erhalten.</div>
 <div class="gh2">Swipes</div><div class="group"><div class="cell"><div class="l">Bewertet</div><div class="r">${sw} <small style="color:var(--sec)">♥ ${d} · ✕ ${sw-d}</small></div></div>
 <button class="cell btn" data-act="csvall">Alle Bewertungen als CSV</button><button class="cell btn danger" data-act="reset">Alle Swipes zurücksetzen</button></div>
 <div class="gh2">Annahmen</div><div class="group" style="padding:12px 14px;font-size:14px;line-height:1.45;color:var(--sec)">
 <b style="color:var(--text)">Kredit:</b> Annuitätendarlehen, Rate = K·r / (1 − (1+r)^−n) mit r = Zins/12 und n = Jahre·12. Standard 100 % des Kaufpreises, 5 % Zins, 30 Jahre. Zinsen gesamt = Rate·n − Darlehen.<br><br>
 <b style="color:var(--text)">Cashflow:</b> Ist-Jahresmiete aus dem Inserat / 12 − Monatsrate − ${BEW} % der Miete für Bewirtschaftung (Hausgeld/Verwaltung, Instandhaltung, Mietausfall). Vor Steuern, Tilgung nicht als Vermögen gerechnet.<br><br>
 <b style="color:var(--text)">Steuer (Jahr 1, vereinfachte Schätzung, keine Steuerberatung):</b> zu versteuerndes Ergebnis = Ist-Jahresmiete − Darlehenszinsen des 1. Jahres (Summe der 12 Zinsanteile; Tilgung nicht absetzbar) − ${BEW} % Bewirtschaftung − AfA. AfA (Annahme, abschaltbar): Gebäudeanteil ${AFA_GEB} % von Kaufpreis + Kaufnebenkosten, 2 % p.a.; 2,5 % bei Baujahr vor 1925; 3 % ab Baujahr 2023; ohne Baujahr 2 %. Steuer = Ergebnis × Steuersatz (Standard 30 %). Ein negatives Ergebnis wird als Steuerersparnis durch Verrechnung mit anderen Einkünften gerechnet. Cashflow nach Steuer = Cashflow − Steuer bzw. + Ersparnis.<br><br>
 <b style="color:var(--text)">Eigenkapital:</b> Kaufnebenkosten + nicht finanzierter Kaufpreisanteil. Grunderwerbsteuer Sachsen 5,5 %, Sachsen-Anhalt (PLZ 06…, Raum Halle) 5,0 %; Notar & Grundbuch ${f1(NOTAR)} %; Makler ${f2(MAKLER)} % (übliche Käuferhälfte inkl. MwSt.), 0 % bei Privatanbietern. Steht im Datensatz ein eigener Maklersatz, wird er verwendet.<br><br>
 <b style="color:var(--text)">Daten:</b> öffentliche Inseratsdaten (ImmoMetrica-Export + Recherche). Mieten sind Angaben der Anbieter, nicht geprüft. Links am 4.11.2026 geprüft; offline gegangene Inserate zeigen auf ImmoMetrica (Login nötig).</div>
 <div class="foot" style="text-align:center;margin-top:18px">Deal or NoDeal · ${VERSION} · Daten nur auf diesem Gerät</div>`}

/* ---------- Events ---------- */
document.addEventListener('click',async e=>{const tb=e.target.closest('[data-tab]');if(tb){U.tab=tb.dataset.tab;U.anim='enter';render();scrollTo(0,0);return}
 const a=e.target.closest('[data-act]');if(!a)return;const v=a.dataset.v,id=a.dataset.id,s=S.settings;
 switch(a.dataset.act){
 case'yes':decide(true);break;case'no':decide(false);break;case'undo':undo();break;
 case'tab':U.tab=v;render();scrollTo(0,0);break;
 case'mode':s.mode=v;save();U.anim='enter';render();break;
 case'fin':s.fin=+v;save();render();break;
 case'afa':s.afa=v==='1';save();render();break;
 case'steuer':s.steuer=Math.max(0,Math.min(60,Math.round(((+s.steuer||0)+ +v)*10)/10));save();render();break;
 case'dsort':s.dsort=v;save();render();break;
 case'sort':s.sort=v;save();U.anim='enter';render();break;
 case'zins':s.zins=Math.max(0,Math.min(20,Math.round((s.zins+ +v)*100)/100));save();render();break;
 case'jahre':s.jahre=Math.max(1,Math.min(50,s.jahre+ +v));save();render();break;
 case'list':s.list=v;save();render();break;
 case'theme':s.theme=v;save();render();break;
 case'flip':S.sw[id]={d:!S.sw[id].d,t:Date.now()};save();toast(S.sw[id].d?'Zu Deals verschoben':'Zu NoDeals verschoben');render();break;
 case'unswipe':delete S.sw[id];S.hist=S.hist.filter(h=>h!==id);save();toast('Zurück im Stapel');render();break;
 case'csv':{const L=decided(s.list!=='nodeal');download((s.list==='nodeal'?'nodeals':'deals')+'-'+new Date().toISOString().slice(0,10)+'.csv',exportCSV(L),'text/csv;charset=utf-8');toast('CSV erstellt');break}
 case'csvall':{const L=[...decided(true),...decided(false)];if(!L.length){toast('Noch nichts bewertet');break}download('bewertungen-'+new Date().toISOString().slice(0,10)+'.csv',exportCSV(L),'text/csv;charset=utf-8');toast('CSV erstellt');break}
 case'copy':{const ok=await copy(exportText(decided(s.list!=='nodeal')));toast(ok?'Liste kopiert':'Bitte Text unten markieren und kopieren');break}
 case'share':try{await navigator.share({title:'Deal or NoDeal',text:exportText(decided(s.list!=='nodeal'))})}catch(_){}break;
 case'import':$('#file').click();break;
 case'reload':try{const r=await loadBundled(true);toast(r?`${r.neu} neu · ${r.upd} aktualisiert`:'Keine Daten');render()}catch(_){toast('Offline – Daten konnten nicht geladen werden')}break;
 case'reset':if(confirm('Alle Swipes (Deals und NoDeals) löschen? Die Objekte bleiben.')){S.sw={};S.hist=[];save();toast('Zurückgesetzt');render()}break;
 }});
document.addEventListener('change',e=>{const t=e.target,s=S.settings;
 if(t.id==='zins'){const x=num(t.value);if(isFinite(x)&&x>=0&&x<=20)s.zins=Math.round(x*100)/100;save();render()}
 if(t.id==='steuer'){const x=num(t.value);if(isFinite(x)&&x>=0&&x<=60)s.steuer=Math.round(x*10)/10;save();render()}
 if(t.id==='jahre'){const x=Math.round(num(t.value));if(x>=1&&x<=50)s.jahre=x;save();render()}});
document.addEventListener('toggle',e=>{if(e.target.id==='panel')U.panel=e.target.open},true);
$('#file').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
 try{const o=JSON.parse(await f.text());const r=importData(o);toast(`Import: ${r.neu} neu · ${r.upd} aktualisiert${r.bad?' · '+r.bad+' ungültig':''}`);render()}catch(err){alert('Import fehlgeschlagen: '+(err.message||err))}});
document.addEventListener('keydown',e=>{if(U.tab!=='swipe'||/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;
 if(e.key==='ArrowRight')decide(true);else if(e.key==='ArrowLeft')decide(false);else if(e.key==='Backspace'||(e.key==='z'&&(e.metaKey||e.ctrlKey))){e.preventDefault();undo()}});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>render());

/* ---------- Start ---------- */
(async()=>{render();try{const r=await loadBundled(false);if(r)render()}catch(e){if(!all().length)view.innerHTML='<h1>Deal or NoDeal</h1><div class="empty"><div class="e">📡</div><h2>Keine Daten</h2><p>Bitte einmal mit Internet öffnen oder unter „Mehr“ eine JSON-Datei importieren.</p></div>'}
 if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{})})();
