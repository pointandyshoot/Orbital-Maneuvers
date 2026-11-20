import {customers,incidentCustomer,payloadProfile,assessFleet} from '/engine/missions.mjs';
import { BANDS, BAND, BRANCHES, BUS, END, FACTIONS, PARTS, POLICIES, ROCKETS, SERVICES, SPEEDS, START, TECH } from '/engine/content.mjs';
import { phasing, remainingDeltaV } from '/engine/orbit.mjs';
import { coastReady, plot, schematic } from '/map.mjs';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const entries=Object.entries;
const pct=n=>Math.round(n*100)+'%';
const num=n=>Math.round(n).toLocaleString('en');
const period=(n)=>new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(START,n,1)));
const getFaction=id=>FACTIONS.find(f=>f.id===id);
const plain=(id)=>getFaction(id)?.short||'—';
const known=(part)=>!part.tech || room.game.nation.tech.includes(part.tech);
const opts=(record,active)=>entries(record).map(([id,item])=>`<option value="${id}" ${active===id?'selected':''}>${esc(item.name??item)}</option>`).join('');
const section=(label,title,desc='')=>`<div class="section-title"><span class="eyebrow">${label}</span><h1>${title}</h1>${desc?'<p>'+desc+'</p>':''}</div>`;
const panel=(title,body)=>`<section class="panel"><h2>${title}</h2>${body}</section>`;
const none=(msg)=>`<p class="empty">${msg}</p>`;
const gauge=(label,percent,caption)=>`<div class="gauge"><div><span>${label}</span><strong>${caption}</strong></div><div class="meter"><i style="width:${clamp(percent,0,100)}%"></i></div></div>`;
const chip=(text,tint='')=>`<span class="chip ${tint}">${text}</span>`;
const actionBtn=(title,type,data='',klass='',disabled=false)=>`<button type="button" class="${klass}" data-action="${type}" ${data} ${disabled?'disabled':''}>${title}</button>`;
const stations=[['command','Command'],['design','Spacecraft'],['research','Research'],['launch','Production & launch'],['intelligence','Intelligence & events'],['economy','Economy']];
const objectiveNames={readiness:'Military readiness',campaigns:'Conflict contribution',services:'Civil services',economy:'Economic impact',intelligence:'Intelligence',operations:'Crisis operations',resilience:'Resilience',stewardship:'Stewardship'};
const invite=new URLSearchParams(location.search).get('room')?.toUpperCase();
let session=null,room=null,tab='command',pending=false,polling=false,signature='',noticeTimer,mapHits=[],revision=0;
let display={selected:null,band:'',layer:'tracks'};
let build={bus:'scout',name:'',slots:[null,null,null,null],active:0,category:'all'};
let assembly={bp:null,rocket:'pioneer',band:'lower',quantity:1,desired:3,estimates:null};
let filters={branch:'all',research:'all',tacticalTransfer:'',phase:null,policy:null,budget:null,declared:null};
let playerName=localStorage.getItem('orbital-name')||'';
const getStored=key=>{try{return JSON.parse(localStorage.getItem('orbital-seat-'+key));}catch{return null;}};
if (invite) session=getStored(invite);
else {
  const last=localStorage.getItem('orbital-last');
  if(last) session=getStored(last);
}
function signal(message,error=false) {
  clearTimeout(noticeTimer);
  $('notice').textContent=message;
  $('notice').classList.toggle('error',error);
  $('notice').classList.add('shown');
  noticeTimer=setTimeout(()=>$('notice').classList.remove('shown'),4200);
}
async function api(path,options={}) {
  const headers=options.body?{'Content-Type':'application/json'}:{};
  if (session?.token) headers.Authorization='Bearer '+session.token;
  const response=await fetch(path,{...options,headers,body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
  const data=await response.json();
  if(!response.ok) throw Object.assign(new Error(data.error),{status:response.status});
  return data;
}
const endpoint=path=>'/api/rooms/'+session.code+'/'+path;
function saveSeat(data) {
  session={code:data.state.code,token:data.token};
  localStorage.setItem('orbital-seat-'+session.code,JSON.stringify(session));
  localStorage.setItem('orbital-last',session.code);
  localStorage.setItem('orbital-name',playerName);
  history.replaceState(null,'','/?room='+session.code);
}
function leaveView() {
  localStorage.removeItem('orbital-last');
  session=null;room=null;signature='';
  history.replaceState(null,'','/');
  location.reload();
}
function receive(next,force=false) {
  if(next.game?.result&&!room?.game?.result) {
    tab='command';
    signal('The 2060 final assessment is ready.');
  }
  room=next;
  const stamp=JSON.stringify([next.started,next.speed,next.expected,next.players,next.game?.month]);
  if(force || stamp!==signature) {
    signature=stamp;
    $('lobby').hidden=next.started;
    $('campaign').hidden=!next.started;
    $('mast-actions').innerHTML=`<span class="status"><i></i> ${next.game?.result?'CAMPAIGN COMPLETE':next.started?'CAMPAIGN LIVE':'PRIVATE ROOM'} / ${esc(next.code)}</span>${actionBtn('Invite','invite')}${actionBtn('Home','home')}`;
    if(next.started) renderGame(); else renderLobby();
  }
}
async function refresh() {
  if(!session || pending || polling) return;
  polling=true;
  const token=session.token;
  const requestedAt=revision;
  try {
    const next=await api(endpoint('state'));
    if (!pending && revision===requestedAt && session?.token===token) receive(next);
  } catch(e) {
    if(e.status===401 || e.status===404) {
      session=null;room=null;renderLobby();signal(e.message,true);
    }
  } finally {polling=false;}
}
async function command(action,success) {
  if(pending || !session) return;
  pending=true;
  revision++;
  try {
    receive(await api(endpoint('command'),{method:'POST',body:action}),true);
    if(success) signal(success);
    if(room.started && tab==='launch') void estimates();
  } catch(e) { signal(e.message,true); }
  finally {pending=false;}
}
function renderLobby() {
  $('lobby').hidden=false;
  $('campaign').hidden=true;
  if(!room) {
    $('mast-actions').innerHTML='<span class="status"><i></i> EARTH / 1975—2060</span>';
    const currentInvite=new URLSearchParams(location.search).get('room');
    $('lobby-content').innerHTML=`<div class="hero"><div class="hero-copy"><span class="eyebrow"><i class="tick"></i> 1975–2060 / EARTH THEATRE</span>
      <h1>ORBITAL<br><em>COMMAND</em></h1><p>Build a space programme through the Cold War and into an uncertain future. The infrastructure you put in orbit will shape what survives the next crisis.</p>
      <div class="hero-specs"><span>04 FACTIONS</span><span>01 SHARED CLOCK</span><span>2060 FINAL ASSESSMENT</span></div></div>
      <form id="transmit" class="panel lobby-form"><span class="eyebrow">CAMPAIGN ACCESS</span><h2>${currentInvite?'Join a campaign':'Open a campaign'}</h2>
      <label>Call sign<input name="name" maxlength="24" required value="${esc(playerName)}" placeholder="Your player name"></label>
      ${currentInvite?`<p>Room <strong class="mono">${esc(currentInvite)}</strong></p><button class="primary" name="play" value="join">Join campaign</button>`:
        `<button class="primary" name="play" value="create">Create private room</button>
        <div class="join-field"><input name="code" maxlength="8" aria-label="Room code" placeholder="ENTER ROOM CODE"><button name="play" value="join">Join</button></div>`}
      </form></div>`;
  } else {
    const seat=room.players.find(p=>p.id===room.player);
    $('lobby-content').innerHTML=`<div class="briefing"><div class="section-title"><span class="eyebrow">PRIVATE ROOM / ${esc(room.code)}</span><h1>Mission briefing</h1>
      <p>Choose a faction and mark yourself ready. The campaign starts as soon as all expected players are ready. AI runs the unclaimed factions.</p></div>
      <div class="faction-grid">${FACTIONS.map(f=>{
        const owner=room.players.find(p=>p.faction===f.id);
        return `<button type="button" class="faction-card ${owner?.id===room.player?'chosen':''}" style="--faction:${f.color}" data-action="faction" data-id="${f.id}" ${owner&&owner.id!==room.player?'disabled':''}>
          <span class="faction-code">${f.short}</span><strong>${f.name}</strong><span>${f.site}</span><small>${{us:'Favourable · largest initial budget',su:'Competitive · nuclear radar, succession risk',eu:'Hard · industrial base and efficient production',cn:'Very hard · smallest economy'}[f.id]}</small><small>${owner?esc(owner.name)+(owner.ready?' / ready':' / claimed'):'Available'}</small></button>`;
      }).join('')}</div>
      <div class="briefing-actions"><div class="roster">${room.players.map(p=>`<span>${esc(p.name)} ${p.ready?'· READY':''} ${!p.online?'· OFFLINE':''} ${room.host&&!p.host?actionBtn('×','remove',`data-id="${esc(p.id)}" aria-label="Remove ${esc(p.name)}"`,'quiet'):''}</span>`).join('')}</div>
      <div class="button-row"><span class="subtle">${room.players.length} / ${room.expected} players</span>
      ${room.host?`<label class="roster-size">Human players<select id="expected-players">${[1,2,3,4].map(i=>`<option value="${i}" ${i===room.expected?'selected':''} ${i<room.players.length?'disabled':''}>${i}</option>`).join('')}</select></label>`:''}
      ${actionBtn(seat.ready?'Undo ready':'Ready','ready',`data-value="${seat.ready?'false':'true'}"`,'primary',!seat.faction)}</div></div></div>`;
  }
  draw();
}
function renderGame() {
  const g=room.game,n=g.nation;
  const seat=room.players.find(p=>p.id===room.player);
  $('topbar').innerHTML=`<div class="campaign-info"><div class="faction-id" style="--faction:${getFaction(n.id).color}">${esc(n.name)}</div><strong>${period(g.month)}</strong><span class="phase ${g.phase==='total war'?'danger':''}">${esc(g.phase)}</span>
    <div class="top-stat"><span>RESERVES</span><b>${num(n.cash)} cr</b></div><div class="top-stat"><span>STRATEGIC SCORE</span><b>${num(g.ownScore)}</b></div></div>
    <div class="clock"><span>SHARED ${room.speed?room.speed+'×':'PAUSED'}</span><div class="speeds">${SPEEDS.map(s=>actionBtn(s?s+'×':'Ⅱ','speed',`data-value="${s}" aria-label="${s?s+' times speed':'Pause'}" aria-pressed="${seat.speed===s}"`,'',!!g.result)).join('')}</div></div>`;
  $('nav').innerHTML=stations.map(([id,label])=>actionBtn(label,'tab',`data-id="${id}" aria-current="${id===tab?'page':'false'}"`)).join('');
  for(const [id] of stations) $(id).hidden=id!==tab;
  const render={command:renderCommand,design:renderDesign,research:renderResearch,launch:renderLaunch,intelligence:renderIntelligence,economy:renderEconomy};
  const active=document.activeElement;
  const identity=active?.closest('.station')?.id===tab && ['INPUT','SELECT'].includes(active.tagName)?active.id:'';
  const cursor=identity&&active.type==='text'?[active.selectionStart,active.selectionEnd]:null;
  render[tab](g,n);
  if(identity && $(identity)) {
    $(identity).focus({preventScroll:true});
    if(cursor) $(identity).setSelectionRange(...cursor);
  }
}
function renderCommand(g,n) {
  if (!g.ownSats.some(s=>s.id===display.selected) && !g.contacts.some(s=>s.id===display.selected) && g.ownSats.length) display.selected=g.ownSats[0].id;
  const sat=g.ownSats.find(s=>s.id===display.selected);
  const contact=g.contacts.find(s=>s.id===display.selected);
  if(filters.tacticalTransfer && !sat?.transfers[filters.tacticalTransfer]) filters.tacticalTransfer='';
  const plan=sat?.transfers[filters.tacticalTransfer];
  const phasePlan=sat&&filters.phase?phasing(sat.orbit,filters.phase,sat.design.electric):null;
  $('map-footer').innerHTML=`<span><i class="legend own"></i> OWN SPACECRAFT</span><span><i class="legend"></i> FOREIGN CONTACT</span><span><i class="legend site"></i> LAUNCH SITE</span><span class="map-caption">EARTH FIXED / GROUND TRACKS</span>`;
  $('command-side').innerHTML=panel('Military customer orders',entries(n.missions?.readiness??{}).map(([k,v])=>gauge(customers[k],v*100,pct(v))).join('')+
    `<label>Tasking priority<select id="military-assignment">${opts({balanced:'Balanced allocation',...customers},n.assignment??'balanced')}</select></label>
    <p class="subtle">Priority tasking concentrates support on one command and reduces the share available to the others.</p>`)+panel('Space services',entries(n.services).map(([k,v])=>gauge(SERVICES[k],v*100,pct(v))).join('')+
    `<div class="economy-pair"><div><span>GDP EFFECT</span><strong>+${(n.economicBonus*100).toFixed(1)}%</strong></div><div><span>RESILIENCE</span><strong>${pct(n.resilience)}</strong></div></div>`)+
    panel('Orbital environment',`<div class="tension-line">${gauge('Global tension',g.tension,Math.round(g.tension)+' / 100')}</div><div class="band-list"><button data-action="band" data-id="" class="${!display.band?'active':''}"><span>All orbital bands</span><span>YEARLY RISK</span></button>`+
    g.bands.map(b=>`<button class="${display.band===b.id?'active':''}" data-action="band" data-id="${b.id}"><span>${BAND[b.id].name}</span><b class="${b.annualRisk>2?'warning':''}">${b.annualRisk.toFixed(2)}%</b></button>`).join('')+'</div>')+
    panel('Latest dispatches',(g.month<5?`<p class="subtle">Build a relay, queue a research programme and set a replenishment order for your starting fleet.</p>`:'')+g.events.slice(-3).reverse().map(e=>`<div class="dispatch"><span>${period(e.month)}</span><strong>${esc(e.title)}</strong></div>`).join('')+actionBtn('All events','tab','data-id="intelligence"','secondary'));
  $('command-bottom').innerHTML=(g.result?panel('Final assessment',results(g.result)):'')+`<div class="bottom-grid">`+
    panel('Fleet register',`<div class="fleet-list">${g.ownSats.map(s=>`<button type="button" data-action="select-sat" data-id="${s.id}" class="${s.id===display.selected?'active':''}"><span>${esc(s.name)}</span><span>${s.travel?'In transfer':s.phasing?'Phasing':BAND[s.band].name}</span><b>${pct(s.condition)}</b></button>`).join('')||none('No active spacecraft. Build or launch a replacement.')}</div>`)+
    panel(sat?esc(sat.name):'Selection',sat?`<div class="detail-stats"><div><span>ORBIT</span><b>${BAND[sat.band].name}</b></div><div><span>ΔV REMAINING</span><b>${num(sat.deltaV)} m/s</b></div><div><span>SERVICE THROUGH</span><b>${period(sat.lifeUntil)}</b></div></div>
      <div class="button-row"><select id="tactical-transfer" aria-label="Transfer destination"><option value="">Transfer orbit…</option>${opts(Object.fromEntries(entries(BAND).filter(([id])=>id!==sat.band)),filters.tacticalTransfer)}</select>
      ${actionBtn('Transfer','transfer',`data-id="${sat.id}"`,'secondary',!plan||plan.deltaV>sat.deltaV||!!sat.travel||!!sat.phasing)}
      ${actionBtn('Service','refit',`data-id="${sat.id}"`,'quiet',!n.tech.includes('servicing'))}
      ${actionBtn('Retire','retire',`data-id="${sat.id}"`,'quiet')}</div>
      ${plan?`<p class="${plan.deltaV>sat.deltaV?'warning':'subtle'}">Estimated ${num(plan.deltaV)} m/s · ${plan.months} months${plan.deltaV>sat.deltaV?' · insufficient reserve':''}</p>`:''}
      <div class="button-row phase-tools"><select id="phase-selection" aria-label="Same-plane phase change"><option value="">Shift along orbit…</option>${opts({'-2':'Back 60°','-1':'Back 30°','1':'Forward 30°','2':'Forward 60°'},String(filters.phase))}</select>
      ${actionBtn('Adjust spacing','phase',`data-id="${sat.id}"`,'secondary',!phasePlan||phasePlan.deltaV>sat.deltaV||!!sat.travel||!!sat.phasing)}
      ${phasePlan?`<span class="${phasePlan.deltaV>sat.deltaV?'warning':'subtle'}">${phasePlan.deltaV} m/s · ${phasePlan.months} mo</span>`:''}</div>`:
    contact?`<p>${esc(plain(contact.owner))} · ${esc(contact.declared)} · ${pct(contact.confidence)} confidence.</p><p>${esc(contact.assessment||'Mission uncertain.')}</p>`:
    none('Select a marker or spacecraft from the register.'))+'</div>';
  draw();
}
function designStats() {
  const bus=BUS[build.bus];
  const design={dryMass:bus.mass,power:bus.power,heat:bus.heat,cost:bus.cost,fuel:0,isp:0,mission:false};
  for(const id of build.slots.filter(Boolean)) {
    const p=PARTS[id];
    design.dryMass+=p.mass;design.power+=p.power;design.heat+=p.heat;design.cost+=p.cost;design.fuel+=p.fuel||0;design.isp=Math.max(design.isp,p.isp||0);
    design.mission ||= Boolean(p.output||p.intel||p.support||p.operations);
  }
  const tech=room.game.nation.tech;
  design.cost=Math.ceil(design.cost*(tech.includes('solar')?.93:1)*(tech.includes('manufacture')?.84:1)*(tech.includes('foundry')?.8:1));
  const errors=[];
  if(design.power<0) errors.push('Power deficit');
  if(design.heat<0) errors.push('Heat rejection deficit');
  if(!design.mission) errors.push('Add a mission payload');
  if(design.fuel&&!design.isp) errors.push('Fuel storage requires a thruster');
  return {design,errors};
}
function renderDesign(g,n) {
  const {design,errors}=designStats();
  const sample={phase:0,node:0,band:'polar',condition:1,design:{payload:payloadProfile(build.slots)}};
  const forecast=cloud=>assessFleet({...n,chartArchive:0},[sample],cloud,false);
  const clear=forecast(.1),cloudy=forecast(.75);
  const categories=Object.fromEntries([...new Set(Object.values(PARTS).map(p=>p.kind))].map(k=>[k,k]));
  const filtered=entries(PARTS).filter(([,p])=>known(p)&&(build.category==='all'||p.kind===build.category));
  $('design').innerHTML=section('ENGINEERING','Spacecraft designer','Install researched equipment, verify the margins and save a reusable spacecraft class.')+
  `<div class="design-layout">`+panel('Module inventory',`<label class="inline-label">Filter<select id="part-category"><option value="all">All equipment</option>${opts(categories,build.category)}</select></label>
    <div class="module-list">${filtered.map(([id,p])=>`<button class="module" draggable="true" data-module="${id}" data-action="install" data-id="${id}"><span class="part-icon">${esc(p.kind.slice(0,2).toUpperCase())}</span><span><strong>${esc(p.name)}</strong><small>${p.mass} kg · ${p.power>0?'+':''}${p.power} power · ${p.heat>0?'+':''}${p.heat} thermal</small></span></button>`).join('')||none('Research more equipment in this category.')}</div>`)+
  panel('Assembly blueprint',`<div class="designer-top"><label>Spacecraft bus<select id="bus-select">${opts(Object.fromEntries(entries(BUS).filter(([,b])=>known(b))),build.bus)}</select></label>
    <label>Class name<input id="class-name" placeholder="e.g. Horizon Mk I" maxlength="40" value="${esc(build.name)}"></label></div>
    <canvas id="schematic" aria-label="Spacecraft assembly blueprint" role="img"></canvas>
    <div class="slots">${build.slots.map((id,i)=>`<div class="slot ${i===build.active?'active':''}" data-slot="${i}"><button data-action="slot" data-value="${i}"><span>0${i+1}</span>${id?esc(PARTS[id].name):'Empty slot'}</button>${id?actionBtn('×','uninstall',`data-value="${i}" aria-label="Remove module from slot ${i+1}"`,'quiet'):''}</div>`).join('')}</div>
    <p class="subtle">Drag a module into a slot or select a slot and click a module.</p>
    <div class="detail-stats design-stats"><div><span>WET MASS</span><b>${design.dryMass+(design.isp?design.fuel:0)} kg</b></div><div><span>POWER MARGIN</span><b class="${design.power<0?'warning':''}">${design.power}</b></div>
    <div><span>THERMAL MARGIN</span><b class="${design.heat<0?'warning':''}">${design.heat}</b></div><div><span>ΔV RESERVE</span><b>${num(remainingDeltaV(design,design.fuel))} m/s</b></div><div><span>UNIT COST</span><b>${design.cost} cr</b></div></div>
    <p class="subtle">Single-spacecraft polar survey estimate · clear ${pct(clear.imagery)} · cloudy ${pct(cloudy.imagery)} · chart support ${pct(clear.charts)}. Values indicate share of reference demand.</p><div class="design-foot"><span class="${errors.length?'warning':'accent'}">${errors.join(' · ')||'Design passes engineering checks'}</span>${actionBtn('Save class','save-class','','primary',!!errors.length)}</div>`)+
  panel('Class catalogue',n.blueprints.map(b=>`<div class="catalogue"><strong>${esc(b.name)}</strong><span>${esc(BUS[b.bus].name)} · ${b.design.wetMass} kg</span>${actionBtn('Load as variant','edit-class',`data-id="${b.id}"`,'quiet')}${actionBtn('Production','open-class',`data-id="${b.id}"`,'quiet')}</div>`).join(''))+'</div>';
  draw();
}
function renderResearch(g,n) {
  const visible=entries(TECH).filter(([id,t])=>{
    const eligible=t.req.every(r=>n.tech.includes(r))&&!n.tech.includes(id);
    return (filters.branch==='all'||t.branch===filters.branch) && (filters.research==='all'||(filters.research==='available'&&eligible)||(filters.research==='known'&&n.tech.includes(id)));
  });
  $('research').innerHTML=section('SCIENCE DIRECTORATE','Research & development',n.tech.length+' of '+entries(TECH).length+' programmes completed.')+
  `<div class="research-layout">`+panel('Research queue',n.research.map(({id,remaining,total},i)=>gauge(esc(TECH[id].name),(1-remaining/total)*100,i===0?Math.ceil(remaining)+' work months':'QUEUED')).join('')||none('Choose an available programme to begin research.'))+
  `<div><div class="toolbar"><label>Branch<select id="technology-branch"><option value="all">All branches</option>${opts(Object.fromEntries(BRANCHES.map(k=>[k,k])),filters.branch)}</select></label>
  <label>Status<select id="technology-status">${opts({all:'All programmes',available:'Available',known:'Completed'},filters.research)}</select></label></div>
  <div class="tech-grid">${visible.map(([id,t])=>{
    const complete=n.tech.includes(id),queued=n.research.some(r=>r.id===id),open=t.req.every(r=>n.tech.includes(r));
    return `<article class="tech-card ${complete?'completed':open?'open':''}"><div class="tech-header"><span>${esc(t.branch)}</span>${chip(complete?'COMPLETE':queued?'QUEUED':open?'AVAILABLE':'LOCKED',open?'good':'')}</div>
      <h2>${esc(t.name)}</h2><p>${esc(t.text)}</p><p class="prereq">${t.req.map(k=>`<span class="${n.tech.includes(k)?'accent':''}">${esc(TECH[k].name)}</span>`).join('')}</p>
      <div class="tech-foot"><span>${t.cost} cr · ${t.months} work months</span>${actionBtn('Queue','research',`data-id="${id}"`,'secondary',!open||queued||complete||n.cash<t.cost)}</div></article>`;
  }).join('')||none('No programmes match these filters.')}</div></div></div>`;
}
function renderLaunch(g,n) {
  assembly.bp=n.blueprints.some(b=>b.id===assembly.bp)?assembly.bp:n.blueprints[0]?.id;
  const current=n.blueprints.find(b=>b.id===assembly.bp);
  const qty=assembly.quantity;
  const rocket=ROCKETS[assembly.rocket];
  const band=BAND[assembly.band];
  const estimate=assembly.estimates?.[assembly.bp]?.[assembly.rocket]?.[assembly.band];
  const cost=rocket.cost+(band.launchMonths-1)*8;
  const cap=rocket.cap-band.cap;
  const mass=current?.design.wetMass*qty;
  const options=opts(Object.fromEntries(n.blueprints.map(b=>[b.id,b])),assembly.bp);
  const queue=(jobs,form)=>jobs.map(j=>`<li><span>${j.quantity} × ${esc(n.blueprints.find(b=>b.id===j.blueprint)?.name)} ${form==='launch'?'· '+BAND[j.band].name:''}</span><b>${j.remaining} mo</b></li>`).join('');
  $('launch').innerHTML=section('FLIGHT DIRECTORATE','Production & launch','Manufacture a batch, set its orbital destination and reserve a launcher. Use standing orders to replenish critical constellations.')+
    `<div class="work-grid">`+panel('Manifest',`<label>Spacecraft class<select id="manifest-class">${options}</select></label><div class="input-grid">
    <label>Launcher<select id="manifest-rocket">${opts(Object.fromEntries(entries(ROCKETS).filter(([,r])=>known(r))),assembly.rocket)}</select></label>
    <label>Destination<select id="manifest-band">${opts(BAND,assembly.band)}</select></label><label>Batch size<input id="manifest-qty" type="number" min="1" max="6" value="${qty}"></label></div>
    <div class="detail-stats"><div><span>STORED</span><b>${n.stock[assembly.bp]||0} units</b></div><div><span>MANIFEST</span><b class="${mass>cap?'warning':''}">${num(mass)} / ${cap} kg</b></div>
    <div><span>LAUNCH COST</span><b>${cost} cr</b></div><div><span>TRANSIT RISK</span><b>${estimate?estimate.risk.toFixed(3)+'%':'Calculating'}</b></div></div>
    ${g.groundReview||estimate?.hold?'<p class="warning">Launches are temporarily on hold for this manifest.</p>':''}
    <div class="button-row">${actionBtn('Build batch','production','','secondary',n.cash<current.design.cost*qty)}${actionBtn('Queue launch','launch','','primary',mass>cap||(n.stock[assembly.bp]||0)<qty||g.groundReview||estimate?.hold||n.cash<cost)}</div>`)+
    panel('Standing replenishment orders',`<p>Maintain a target number of this class in the selected band using the launcher above.</p><div class="button-row"><label>Target fleet<input id="desired" type="number" min="1" max="10" value="${assembly.desired}"></label>
    ${actionBtn('Add standing order','doctrine','','secondary',current?.design.wetMass>cap)}</div><ul class="queue">${(n.doctrines||[]).map(d=>`<li><span>${d.quantity} × ${esc(n.blueprints.find(b=>b.id===d.blueprint)?.name)} · ${BAND[d.band].name}</span>${actionBtn('Remove','undoctrine',`data-id="${d.id}"`,'quiet')}</li>`).join('')||'<li class="empty">No standing orders</li>'}</ul>`)+
    panel('Manufacturing queue',`<ul class="queue">${queue(n.production,'build')||'<li class="empty">No manufacturing jobs</li>'}</ul>`)+
    panel('Launch queue',`<ul class="queue">${queue(n.launches,'launch')||'<li class="empty">No launches scheduled</li>'}</ul>`)+'</div>';
}
async function estimates() {
  if(!session || !room?.started) return;
  try {
    const fresh=await api(endpoint('estimates'));
    const changed=JSON.stringify(fresh)!==JSON.stringify(assembly.estimates);
    assembly.estimates=fresh;
    if(changed && tab==='launch' && !['manifest-qty','desired'].includes(document.activeElement?.id)) renderLaunch(room.game,room.game.nation);
  } catch { /* The next poll retries estimates. */ }
}
function renderIntelligence(g,n) {
  const signalStrength=g.ownSats.some(s=>s.design.intel && !s.travel && s.disabledUntil<=g.month);
  $('intelligence').innerHTML=section('SITUATION ROOM','Intelligence & events','Historical milestones can create openings and crises. Events after the historical period are speculative.')+
    `<div class="intel-layout">`+panel('Open incidents',g.crises.map(c=>{
      const responseAsset=g.ownSats.some(s=>s.band===c.band && s.design.operations && !s.travel && s.disabledUntil<=g.month);
      const act=(label,id,disabled)=>actionBtn(label,'incident',`data-id="${c.id}" data-choice="${id}"`,'secondary',disabled||c.actions.includes(id));
      return `<article class="incident"><div><span class="eyebrow">${esc(c.region)} · ${c.future?'SPECULATIVE':'HISTORICAL'}</span><h3>${esc(c.name)}</h3></div><p>${esc(c.text)}</p>
      ${c.type==='proxy'?`<p>Command request · ${customers[incidentCustomer[c.id]]??'Joint forces'} · monthly escalation chance ${(100*g.escalation).toFixed(1)}%. Sustained support counts throughout the crisis.</p>`:''}<div class="subtle">Closes ${period(c.until)} ${c.band?'· '+BAND[c.band].name:''} ${c.source?`· <a href="${esc(c.source)}" target="_blank" rel="noopener">Historical record</a>`:''}</div>
      <div class="button-row">${act('Negotiate','negotiate',n.cash<12)}${act('Commit support','support',n.cash<14||!Object.values(n.services).some(v=>v>=.12))}
      ${c.band?act('Assess communications','signals',n.cash<12||!signalStrength):''}${c.asset?act(c.asset.neutralized?'Asset lost':'Destroy crisis asset','intervene',g.tension<45||n.cash<32||!responseAsset||c.asset.neutralized):''}</div>
      ${c.asset&&!c.asset.neutralized&&!responseAsset?'<small>Intervention requires a crisis response package in the objective band.</small>':''}</article>`;
    }).join('')||none('No open incidents. Check back as the campaign advances.'))+
    panel('Contact estimates',`<div class="contact-list">${g.contacts.slice().sort((a,b)=>b.confidence-a.confidence).map(c=>`<div class="contact"><div><b style="color:${getFaction(c.owner)?.color}">${plain(c.owner)}</b> <span>${BAND[c.band].name} · ${esc(c.declared)}</span><small>${esc(c.assessment||'Mission unknown')}</small></div>
      <div><strong>${pct(c.confidence)}</strong>${actionBtn('Review','observe',`data-id="${c.id}"`,'quiet',n.cash<10)}</div></div>`).join('')||none('No usable foreign observations.')}</div>`)+
    panel('Dispatch archive',`<div class="event-list">${g.events.slice().reverse().map(e=>`<article class="event ${e.kind}"><time>${period(e.month)}</time><div><h3>${esc(e.title)}</h3><p>${esc(e.body)}</p></div></article>`).join('')}</div>`)+'</div>';
}
function results(rows) {
  return `<div class="result-list">${rows.map((r,i)=>`<article><div><span class="eyebrow">${i===0?'CAMPAIGN LEADER':'RANK '+(i+1)}</span><h3>${esc(r.name)}</h3></div><strong>${num(r.total)} pts</strong><p>${entries(r.score).map(([k,v])=>objectiveNames[k]+' '+num(v)).join(' · ')}</p></article>`).join('')}</div>`;
}
function renderEconomy(g,n) {
  $('economy').innerHTML=section('PROGRAMME ADMINISTRATION','Economy & infrastructure','Working services raise productivity over time. A distributed ground network improves service delivery and resilience.')+
    `<div class="work-grid">`+panel('National programme',`<div class="detail-stats"><div><span>GDP INDEX</span><b>${num(n.gdp)}</b></div><div><span>SPACE SERVICE LIFT</span><b>+${(n.economicBonus*100).toFixed(1)}%</b></div><div><span>MAINTENANCE</span><b>${n.maintenance.toFixed(1)} cr/mo</b></div></div>
    <p>Programme reserves: <strong>${num(n.cash)} cr</strong></p><div class="input-grid"><label>Funding policy<select id="policy">${opts(POLICIES,filters.policy??n.policy)}</select></label>
    <label>Research allocation<input id="budget" type="number" min="0" max="40" value="${filters.budget??n.budget}"></label></div>
    <p class="subtle">${esc(POLICIES[filters.policy??n.policy].note)}</p>${actionBtn('Apply policy','policy','','primary')}`)+
    panel('Ground network',`<p>${esc(getFaction(n.id).site)} · Network level <b>${n.ground}/6</b></p>${actionBtn('Expand ground network · '+(45*n.ground)+' cr','ground','','secondary',n.ground>=6||n.cash<45*n.ground)}
    <label class="declaration">Declaration for future launches<select id="declaration">${opts(Object.fromEntries(['Civil services','Scientific mission','Strategic reserve','Undeclared'].map(s=>[s,s])),filters.declared??n.declaration)}</select></label>
    ${actionBtn('Publish declaration','declare','','secondary')}`)+
    panel('Civilian adoption',`<p>Navigation supports transport and timing, communications supports connectivity, and mapping supports forecasting and ocean science. Adoption raises GDP gradually. The larger tax base funds later budgets.</p>
    <div class="steward"><span>Current productivity lift</span><strong>+${(n.economicBonus*100).toFixed(2)}%</strong></div>`)+
    panel('Orbital stewardship',g.bands.map(b=>`<div class="steward"><span>${BAND[b.id].name} · ${b.annualRisk.toFixed(2)}% annual risk</span>${actionBtn('Remediate · 38 cr','remediate',`data-id="${b.id}"`,'quiet',!n.tech.includes('stewardship')||n.cash<38||b.index<=45)}</div>`).join(''))+
    panel('Strategic assessment',entries(n.score).map(([k,v])=>`<div class="steward"><span>${objectiveNames[k]}</span><strong>${num(v)}</strong></div>`).join(''))+
    (g.result?panel('Final standings',results(g.result)):'')+'</div>';
}
function draw() {
  if (!room?.started) { plot($('lobby-map'),null);return; }
  if (tab==='command') mapHits=plot($('orbit-map'),room.game,display);
  if (tab==='design') schematic($('schematic'),BUS[build.bus],build.slots,PARTS,build.active);
}
function tabTo(id) {
  tab=id;
  renderGame();
  if(id==='launch') void estimates();
}
function install(id,slot=build.active) {
  if(!PARTS[id]||!known(PARTS[id])) return;
  build.slots[slot]=id;
  const empty=build.slots.findIndex((p,i)=>!p&&i>slot);
  build.active=empty===-1?slot:empty;
  renderDesign(room.game,room.game.nation);
}
document.addEventListener('submit',async e=>{
  if(e.target.id!=='transmit') return;
  e.preventDefault();
  if(pending) return;
  const form=new FormData(e.target);
  playerName=String(form.get('name')).trim();
  const type=e.submitter.value;
  const code=(new URLSearchParams(location.search).get('room')||String(form.get('code')||'')).trim().toUpperCase();
  if(type==='join'&&!/^[A-Z0-9_-]{8}$/.test(code)) return signal('Enter the eight-character room code.',true);
  pending=true;
  try {
    const next=await api(type==='create'?'/api/rooms':'/api/rooms/'+code+'/join',{method:'POST',body:{name:playerName}});
    saveSeat(next);receive(next.state,true);
  } catch(err) {signal(err.message,true);}
  finally {pending=false;}
});
document.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-action],button[data-layer]');
  if(!button) return;
  if(button.dataset.layer) {
    display.layer=button.dataset.layer;
    for(const layer of document.querySelectorAll('[data-layer]')) layer.setAttribute('aria-pressed',layer===button);
    draw();return;
  }
  const {action,id,value,choice}=button.dataset;
  switch(action) {
    case 'home': leaveView(); break;
    case 'invite': {
      const link=new URL('/?room='+room.code,location.origin).href;
      try { await navigator.clipboard.writeText(link);signal('Invite link copied.'); }
      catch { window.prompt('Copy this invite link',link); }
      break;
    }
    case 'tab': tabTo(id);break;
    case 'band': display.band=id;renderCommand(room.game,room.game.nation);break;
    case 'select-sat': display.selected=id;filters.tacticalTransfer='';renderCommand(room.game,room.game.nation);break;
    case 'slot': build.active=Number(value);renderDesign(room.game,room.game.nation);break;
    case 'install': install(id);break;
    case 'uninstall': build.slots[Number(value)]=null;build.active=Number(value);renderDesign(room.game,room.game.nation);break;
    case 'save-class':
      await command({type:'blueprint',name:build.name,bus:build.bus,parts:build.slots},'Spacecraft class saved.');
      break;
    case 'edit-class': {
      const b=room.game.nation.blueprints.find(bp=>bp.id===id);
      build={...build,bus:b.bus,name:(b.name+' variant').slice(0,40),slots:Array.from({length:BUS[b.bus].slots},(_,i)=>b.parts[i]??null),active:0};
      renderDesign(room.game,room.game.nation);break;
    }
    case 'open-class': assembly.bp=id;tabTo('launch');break;
    case 'ready': await command({type:action,value:value==='true'});break;
    case 'speed': await command({type:action,value:Number(value)});break;
    case 'incident': await command({type:action,crisis:id,choice},'Incident response submitted.');break;
    case 'phase': await command({type:action,id,slots:filters.phase},'Spacing adjustment scheduled.');break;
    case 'transfer': await command({type:action,id,band:filters.tacticalTransfer},'Transfer scheduled.');break;
    case 'retire': if(window.confirm('Retire this spacecraft from your fleet?')) await command({type:action,id},'Spacecraft retired.');break;
    case 'launch': case 'production': case 'doctrine':
      await command({type:action,id:assembly.bp,band:assembly.band,rocket:assembly.rocket,quantity:action==='doctrine'?assembly.desired:assembly.quantity},'Order accepted.');break;
    case 'policy':
      await command({type:action,id:filters.policy??room.game.nation.policy,budget:filters.budget??room.game.nation.budget},'Budget policy applied.');break;
    case 'declare': await command({type:action,id:filters.declared??room.game.nation.declaration},'Declaration published.');break;
    default: await command({type:action,id},['research','ground','observe','remediate','refit'].includes(action)?'Order accepted.':undefined);
  }
});
document.addEventListener('input',e=>{
  const {id,value}=e.target;
  if(id==='class-name') build.name=value;
  if(id==='budget') filters.budget=clamp(Number(value),0,40);
  if(id==='manifest-qty') assembly.quantity=clamp(Number(value)||1,1,6);
  if(id==='desired') assembly.desired=clamp(Number(value)||1,1,10);
});
document.addEventListener('change',e=>{
  const {id,value}=e.target;
  if(id==='expected-players') {
    void command({type:'expected',value:Number(value)});
    return;
  }
  if(!room?.started) return;
  const {game}=room;
  if(id==='military-assignment') {void command({type:'assignment',id:value},'Tasking order received.');return;}
  if(id==='bus-select') {build.bus=value;build.slots=Array.from({length:BUS[value].slots},(_,i)=>build.slots[i]||null);build.active=0;renderDesign(game,game.nation);}
  if(id==='part-category') {build.category=value;renderDesign(game,game.nation);}
  if(id==='technology-branch') {filters.branch=value;renderResearch(game,game.nation);}
  if(id==='technology-status') {filters.research=value;renderResearch(game,game.nation);}
  if(id==='phase-selection') {filters.phase=Number(value)||null;renderCommand(game,game.nation);}
  if(id==='tactical-transfer') {filters.tacticalTransfer=value;renderCommand(game,game.nation);}
  if(id==='manifest-class') {assembly.bp=value;renderLaunch(game,game.nation);}
  if(id==='manifest-rocket') {assembly.rocket=value;renderLaunch(game,game.nation);}
  if(id==='manifest-band') {assembly.band=value;renderLaunch(game,game.nation);}
  if(id==='manifest-qty'||id==='desired') {
    setTimeout(()=>{ if(tab==='launch' && !document.activeElement?.closest('#launch button')) renderLaunch(room.game,room.game.nation); },100);
  }
  if(id==='policy') {filters.policy=value;renderEconomy(game,game.nation);}
  if(id==='declaration') filters.declared=value;
});
document.addEventListener('dragstart',e=>{
  const module=e.target.closest('[data-module]');
  if (module) e.dataTransfer.setData('text/plain',module.dataset.module);
});
document.addEventListener('dragover',e=>{if(e.target.closest('[data-slot]')) e.preventDefault();});
document.addEventListener('drop',e=>{
  const slot=e.target.closest('[data-slot]');
  if(!slot) return;
  e.preventDefault();install(e.dataTransfer.getData('text/plain'),Number(slot.dataset.slot));
});
$('orbit-map').addEventListener('click',e=>{
  const bounds=e.currentTarget.getBoundingClientRect();
  const hit=mapHits.map(p=>({...p,distance:Math.hypot(p.x-e.clientX+bounds.left,p.y-e.clientY+bounds.top)})).sort((a,b)=>a.distance-b.distance)[0];
  if(hit?.distance<15) {display.selected=hit.id;filters.tacticalTransfer='';renderCommand(room.game,room.game.nation);}
});
new ResizeObserver(draw).observe($('workspace'));
window.addEventListener('resize',draw);
coastReady.then(draw);
renderLobby();
if (session) void refresh();
setInterval(()=>{void refresh();},1100);
setInterval(()=>{if(tab==='launch'&&room?.started) void estimates();},6000);
