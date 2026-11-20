import { customers, incidentCustomer, assessFleet, payloadProfile, escalationChance } from './missions.mjs';
import { BANDS, BAND, BUS, END, FACTIONS, MONTHS, PARTS, POLICIES, ROCKETS, SOURCE_LINKS, SPEEDS, START, TECH, YEAR_SECONDS } from './content.mjs';
import { INCIDENTS } from './history.mjs';
import { orbitFor, phasing, remainingDeltaV, risk, transfer, transitPath } from './orbit.mjs';

const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const values = Object.values;
const keys = Object.keys;
const round = (n,p=1)=>Number(n.toFixed(p));
const lookup = (definitions,id)=>Object.hasOwn(definitions,id)?definitions[id]:undefined;
const requireRule = (condition,message)=>{ if (!condition) throw new Error(message); };
const id = (game,prefix)=>prefix+game.serial++;
const has = (nation,tech)=>!tech || nation.tech.includes(tech);
const year = game=>START+Math.floor(game.month/12);
const readyTech = (nation,key)=>!has(nation,key) && TECH[key].req.every(req=>has(nation,req));
const progressLimit = nation => nation.tech.includes('foundry')?3:nation.tech.includes('manufacture')?2:1;
const bandwidth = nation => nation.tech.includes('rapid')?2:1;
const totalOutput = design=>values(design.output).reduce((a,b)=>a+b,0);
function random(game) {
  game.seed = (Math.imul(1664525,game.seed)+1013904223)>>>0;
  return game.seed/4294967296;
}
function log(game,title,body,audience=null,kind='info') {
  game.events.push({ id:id(game,'e'), month:game.month,title,body,audience,kind });
  if (game.events.length>360) game.events.splice(0,game.events.length-360);
}
function score(nation,key,points) {
  nation.score[key] = Math.max(0,(nation.score[key]??0)+points);
}
const tally = nation => Math.max(0, Math.round(values(nation.score).reduce((a,b)=>a+b,0)));

export function inspectDesign(nation,busId,parts) {
  const bus = lookup(BUS,busId);
  requireRule(bus && has(nation,bus.tech),'That spacecraft bus has not been unlocked.');
  requireRule(Array.isArray(parts) && parts.length<=bus.slots,'There are too many module slots.');
  const design = {dryMass:bus.mass,wetMass:bus.mass,power:bus.power,heat:bus.heat,cost:bus.cost,life:bus.life,
    shield:bus.shield,isp:0,electric:false,fuel:0,output:{comm:0,imaging:0,nav:0},intel:0,support:0,operations:0};
  for (const partId of parts) {
    if (!partId) continue;
    const part = lookup(PARTS,partId);
    requireRule(part && has(nation,part.tech),'A module has not been unlocked.');
    design.dryMass+=part.mass;
    design.power+=part.power;
    design.heat+=part.heat;
    design.cost+=part.cost;
    design.fuel+=part.fuel||0;
    if (part.isp>design.isp) { design.isp=part.isp; design.electric=partId==='ion'; }
    if (Object.hasOwn(design.output,part.kind)) design.output[part.kind]+=part.output;
    design.intel+=part.intel||0;
    design.support+=part.support||0;
    design.operations+=part.operations||0;
    design.shield+=part.shield||0;
  }
  design.wetMass=design.dryMass+(design.isp?design.fuel:0);
  design.shield=Math.min(.83,design.shield);
  design.cost=Math.ceil(design.cost*(has(nation,'solar')?.93:1)*(has(nation,'manufacture')?.84:1)*(has(nation,'foundry')?.8:1));
  design.payload=payloadProfile(parts);
  design.errors=[];
  if (design.power<0) design.errors.push('Power deficit');
  if (design.heat<0) design.errors.push('Heat rejection deficit');
  if (design.fuel && !design.isp) design.errors.push('Fuel storage requires a thruster');
  if (!totalOutput(design) && !design.intel && !design.operations && !design.support) design.errors.push('Add a mission payload');
  design.deltaV=remainingDeltaV(design,design.fuel);
  return design;
}
function blueprint(game,nation,name,bus,parts) {
  const design=inspectDesign(nation,bus,parts);
  requireRule(!design.errors.length,design.errors.join(' · '));
  const result={id:id(game,'bp'),name,bus,parts,design};
  nation.blueprints.push(result);
  return result;
}
function place(game,nation,bp,band) {
  const phase=random(game), node=random(game);
  const satellite={id:id(game,'s'),owner:nation.id,name:bp.name+' '+(nation.launchSerial++),blueprint:bp.id,
    band,orbit:orbitFor(band,phase,node),phase,node,design:structuredClone(bp.design),fuel:bp.design.fuel,condition:1,
    born:game.month,lifeUntil:game.month+12*bp.design.life,disabledUntil:0,declared:nation.declaration};
  game.satellites.push(satellite);
  return satellite;
}
export function newGame(seed=1975) {
  const game={version:1,month:0,seed:seed>>>0,serial:1,phase:'peace',tension:17,war:null,lastWar:-999,
    debris:Object.fromEntries(BANDS.map((b,i)=>[b.id,[14,20,8,2,4][i]])),satellites:[],events:[],crises:[],
    transform:false,nations:{}};
  for (const def of FACTIONS) {
    const nation={id:def.id,name:def.name,baseGdp:def.gdp,gdp:def.gdp,economicBonus:0,cash:def.cash,
      budget:16,policy:'balanced',declaration:'Civil services',tech:[...def.start],research:[],blueprints:[],
      production:[],stock:{},launches:[],doctrines:[],launchSerial:1,ground:1,contacts:{},maintenance:0,
      services:{comm:0,imaging:0,nav:0},resilience:0,industryPause:0,
      score:{readiness:0,campaigns:0,intelligence:0,operations:0,resilience:0,stewardship:0}};
    game.nations[nation.id]=nation;
    const comm=blueprint(game,nation,'Pathfinder relay','scout',['radio','motor']);
    const observe=nation.id==='su'?blueprint(game,nation,'Ocean survey platform','scout',['radar','reactor','radiator','radiator']):
      blueprint(game,nation,'Surveyor','scout',['camera','motor']);
    nation.stock[observe.id]=1;
    place(game,nation,comm,'lower');
    place(game,nation,observe,'polar');
    updateServices(game,nation);
  }
  log(game,'Campaign opened','Four programmes enter a shared orbital environment. The campaign closes in '+END+'.');
  return game;
}
function own(game,nation,satId) {
  const sat=game.satellites.find(s=>s.id===satId && s.owner===nation.id);
  requireRule(sat,'Select a spacecraft from your fleet.');
  return sat;
}
function spend(nation,price) {
  requireRule(nation.cash>=price,'Insufficient programme credits.');
  nation.cash=round(nation.cash-price);
}
function count(value,max=6) {
  requireRule(Number.isInteger(value) && value>=1 && value<=max,'Quantity is outside the allowed range.');
  return value;
}
function getBlueprint(nation,blueprintId) {
  const bp=nation.blueprints.find(b=>b.id===blueprintId);
  requireRule(bp,'Select a saved spacecraft class.');
  return bp;
}
function getCrisis(game,action) {
  const crisis=game.crises.find(c=>c.id===action.crisis && c.until>game.month && !c.resolved);
  requireRule(crisis,'That incident has ended.');
  return crisis;
}
function estimateLaunch(game,nation,bp,rocket,band,quantity) {
  const mass=bp.design.wetMass*quantity;
  const capacity=rocket.cap-BAND[band].cap;
  const expectedMonths=Math.max(1,rocket.months+BAND[band].launchMonths-(has(nation,'cadence')?1:0)-(has(nation,'rapid')?1:0));
  const price=rocket.cost+(BAND[band].launchMonths-1)*8;
  const hold=game.debris[band]>BAND[band].half*4+650 && !has(nation,'stewardship');
  return {mass,capacity,expectedMonths,price,hold,risk:round(100*transitRisk(game,null,band,bp.design,mass,.08),3)};
}
export function launchEstimates(game,nation) {
  return Object.fromEntries(nation.blueprints.map(bp=>[bp.id,Object.fromEntries(Object.entries(ROCKETS)
    .filter(([,rocket])=>has(nation,rocket.tech))
    .map(([rocketId,rocket])=>[rocketId,Object.fromEntries(BANDS.map(b=>[b.id,estimateLaunch(game,nation,bp,rocket,b.id,1)]))]))]));
}
function transitRisk(game,from,to,design,mass,protection) {
  return 1-transitPath(from,to).reduce((safe,b)=>safe*(1-risk(b,game.debris[b.id],from?.002:.00012,design.shield,
    Math.sqrt(mass/300)*protection)),1);
}
function availableTransfer(nation,sat,band) {
  return transfer(sat.band,band,sat.design.electric,has(nation,'green'));
}
function startTransfer(game,nation,sat,band) {
  requireRule(lookup(BAND,band) && sat.band!==band && !sat.travel && !sat.phasing,'Choose a different orbit for an available spacecraft.');
  const plan=availableTransfer(nation,sat,band);
  requireRule(plan.deltaV<=remainingDeltaV(sat.design,sat.fuel),'This spacecraft lacks the propellant reserve for that transfer.');
  useFuel(sat,plan.deltaV);
  sat.travel={band,due:game.month+plan.months};
}
function useFuel(sat,deltaV) {
  const finalMass=(sat.design.dryMass+sat.fuel)*Math.exp(-deltaV/(9.80665*sat.design.isp));
  sat.fuel=Math.max(0,finalMass-sat.design.dryMass);
}
export function order(game,nationId,action) {
  const nation=lookup(game.nations,nationId);
  requireRule(nation && action && typeof action==='object','Invalid order.');
  requireRule(game.month<MONTHS,'The campaign has ended.');
  switch (action.type) {
    case 'research': {
      const t=lookup(TECH,action.id);
      requireRule(t && readyTech(nation,action.id) && !nation.research.some(r=>r.id===action.id),'Research prerequisites are missing or the project is queued.');
      requireRule(nation.research.length<6,'The research queue is full.');
      spend(nation,t.cost);
      nation.research.push({id:action.id,remaining:t.months,total:t.months});
      break;
    }
    case 'blueprint': {
      requireRule(typeof action.name==='string' && action.name.trim().length>0 && action.name.trim().length<=40,'Name this class using at most 40 characters.');
      requireRule(nation.blueprints.length<40,'The class catalogue is full.');
      blueprint(game,nation,action.name.trim(),action.bus,Array.isArray(action.parts)?action.parts.map(p=>typeof p==='string'?p:null):action.parts);
      break;
    }
    case 'production': {
      const bp=getBlueprint(nation,action.id);
      const quantity=count(action.quantity);
      requireRule(nation.production.length<10,'The production queue is full.');
      spend(nation,bp.design.cost*quantity);
      nation.production.push({id:id(game,'p'), blueprint:bp.id,quantity,remaining:Math.max(2,Math.ceil(bp.design.wetMass/185))+quantity-1});
      break;
    }
    case 'launch': {
      const bp=getBlueprint(nation,action.id);
      const rocket=lookup(ROCKETS,action.rocket);
      const quantity=count(action.quantity);
      requireRule(rocket && has(nation,rocket.tech) && lookup(BAND,action.band),'Select an available launcher and orbit.');
      requireRule(nation.launches.length<10,'The launch queue is full.');
      requireRule(nation.industryPause<=game.month,'A launch review is temporarily holding new orders.');
      requireRule((nation.stock[bp.id]||0)>=quantity,'You need completed spacecraft in storage.');
      const plan=estimateLaunch(game,nation,bp,rocket,action.band,quantity);
      requireRule(!plan.hold,'Orbital safety review is holding launches into this band. Try a cleaner orbit or fund remediation.');
      requireRule(plan.mass<=plan.capacity,'This manifest is too heavy for that launcher and orbit.');
      spend(nation,plan.price);
      nation.stock[bp.id]-=quantity;
      nation.launches.push({id:id(game,'l'), blueprint:bp.id,rocket:action.rocket,band:action.band,quantity,remaining:plan.expectedMonths});
      break;
    }
    case 'transfer': startTransfer(game,nation,own(game,nation,action.id),action.band); break;
    case 'phase': {
      const sat=own(game,nation,action.id);
      requireRule(!sat.travel && !sat.phasing && [-2,-1,1,2].includes(action.slots),'Select a valid phase change for an available spacecraft.');
      const plan=phasing(sat.orbit,action.slots,sat.design.electric);
      requireRule(plan.deltaV<=remainingDeltaV(sat.design,sat.fuel),'This spacecraft lacks the propellant reserve for phasing.');
      useFuel(sat,plan.deltaV);
      sat.phasing={...plan,due:game.month+plan.months};
      break;
    }
    case 'retire': {
      const sat=own(game,nation,action.id);
      requireRule(!sat.travel && !sat.phasing,'Wait for the current manoeuvre to finish.');
      game.satellites=game.satellites.filter(s=>s.id!==sat.id);
      score(nation,'stewardship',has(nation,'green')?4:1);
      break;
    }
    case 'refit': {
      const sat=own(game,nation,action.id);
      requireRule(has(nation,'servicing') && !sat.travel && sat.disabledUntil<=game.month,'Servicing is unavailable.');
      requireRule(game.satellites.some(other=>other.owner===nation.id && other.band===sat.band && other.design.support && !other.travel && other.disabledUntil<=game.month),'Deploy a service adapter in this orbit first.');
      requireRule(sat.condition<.95 || sat.lifeUntil-game.month<42 || sat.fuel<sat.design.fuel*.85,'This spacecraft does not need servicing.');
      const advanced=has(nation,'logistics');
      spend(nation,advanced?16:26);
      sat.condition=Math.min(1,sat.condition+.5);
      sat.fuel=sat.design.fuel;
      sat.lifeUntil=Math.max(sat.lifeUntil,game.month)+36;
      sat.disabledUntil=game.month+(advanced?1:3);
      break;
    }
    case 'policy': {
      requireRule(lookup(POLICIES,action.id),'Choose an available funding policy.');
      requireRule(Number.isInteger(action.budget) && action.budget>=0 && action.budget<=40,'Research allocation must be 0–40.');
      nation.policy=action.id;
      nation.budget=action.budget;
      break;
    }
    case 'doctrine': {
      const bp=getBlueprint(nation,action.id);
      const rocket=lookup(ROCKETS,action.rocket);
      requireRule(rocket && has(nation,rocket.tech) && lookup(BAND,action.band),'Select a launcher and orbit.');
      count(action.quantity,10);
      requireRule(estimateLaunch(game,nation,bp,rocket,action.band,1).mass<=rocket.cap-BAND[action.band].cap,'This launcher cannot lift the spacecraft to this orbit.');
      const doctrines=nation.doctrines??=[];
      requireRule(doctrines.length<6,'At most six replenishment rules can run at a time.');
      requireRule(!doctrines.some(d=>d.blueprint===bp.id && d.band===action.band),'A rule already exists for this class and orbit.');
      doctrines.push({id:id(game,'d'),blueprint:bp.id,rocket:action.rocket,band:action.band,quantity:action.quantity});
      break;
    }
    case 'undoctrine': {
      nation.doctrines=(nation.doctrines??[]).filter(d=>d.id!==action.id);
      break;
    }
    case 'declare': {
      requireRule(['Civil services','Scientific mission','Strategic reserve','Undeclared'].includes(action.id),'Choose a declaration.');
      nation.declaration=action.id;
      break;
    }
    case 'assignment':
      requireRule(action.id==='balanced'||Object.hasOwn(customers,action.id),'Unknown customer.');
      nation.assignment=action.id;
      break;
    case 'ground': {
      requireRule(nation.ground<6,'The ground network is fully developed.');
      spend(nation,45*nation.ground);
      nation.ground++;
      break;
    }
    case 'remediate': {
      requireRule(has(nation,'stewardship') && lookup(BAND,action.band),'Orbital stewardship is required.');
      requireRule(game.debris[action.band]>45,'This band does not need priority remediation.');
      spend(nation,38);
      game.debris[action.band]*=.91;
      score(nation,'stewardship',8);
      break;
    }
    case 'observe': {
      const contact=nation.contacts[action.id];
      requireRule(lookup(nation.contacts,action.id) && contact && contact.last>=game.month-8,'Tracking has lost that contact.');
      requireRule((contact.reviewed??-99)<=game.month-6,'This contact was reviewed recently.');
      spend(nation,10);
      contact.reviewed=game.month;
      contact.confidence=Math.min(.98,contact.confidence+.16);
      if (!contact.credited) { score(nation,'intelligence',8); contact.credited=true; }
      break;
    }
    case 'incident': respond(game,nation,action); break;
    default: throw new Error('Unknown campaign order.');
  }
}
function respond(game,nation,action) {
  const crisis=getCrisis(game,action);
  requireRule(!crisis.actions[nation.id]?.includes(action.choice),'Your faction has already taken that action.');
  const active=game.satellites.filter(s=>s.owner===nation.id && !s.travel && s.disabledUntil<=game.month);
  switch (action.choice) {
    case 'negotiate':
      spend(nation,12);
      game.tension=clamp(game.tension-7,0,100);
      score(nation,'stewardship',6);
      break;
    case 'support':
      requireRule(values(nation.services).some(x=>x>=.12),'A working space service is required.');
      spend(nation,14);
      crisis.committed??={};
      crisis.committed[nation.id]=true;
      if(crisis.type!=='proxy') game.tension=clamp(game.tension-2,0,100);
      break;
    case 'signals': {
      const capacity=active.reduce((a,s)=>a+s.design.intel*s.condition,0);
      requireRule(crisis.band && capacity>0,'Deploy a working signals payload for this objective.');
      spend(nation,12);
      const success=random(game)<Math.min(.92,.30+.093*capacity);
      score(nation,'intelligence',success?Math.min(105,52+7*capacity):3);
      if (success && crisis.future) game.tension=clamp(game.tension-3,0,100);
      log(game,success?'Military communications assessed':'Partial communications assessment',
        success?'Analysts recovered actionable intelligence from the fictional incident.' :'The assessment produced little useful intelligence.',nation.id,'intel');
      break;
    }
    case 'intervene': {
      requireRule(crisis.asset && !crisis.asset.neutralized && game.tension>=45,'No authorised incident asset is available.');
      requireRule(active.some(s=>s.band===crisis.band && s.design.operations),'A working crisis response spacecraft in the objective band is required.');
      spend(nation,32);
      crisis.asset.neutralized=true;
      crisis.asset.neutralizedBy=nation.id;
      game.debris[crisis.band]+=350;
      game.tension=clamp(game.tension+13,0,100);
      score(nation,'operations',30);
      log(game,'Incident asset destroyed','The designated uncrewed asset was lost. Debris is spreading through '+BAND[crisis.band].name+'.',null,'alert');
      break;
    }
    default: throw new Error('Unknown incident response.');
  }
  (crisis.actions[nation.id]??=[]).push(action.choice);
}
function updateServices(game,nation) {
  const fleet=game.satellites.filter(s=>s.owner===nation.id && !s.travel && s.disabledUntil<=game.month);
  const pressure=Object.fromEntries(keys(nation.services).map(k=>[k,0]));
  const counts={comm:0,imaging:0,nav:0};
  for (const sat of fleet) {
    const exposed=game.crises.some(c=>c.type==='proxy' && c.band===sat.band && game.tension>=38);
    const continuity=exposed ? Math.min(1,.68+sat.design.shield*.35+(has(nation,'assurance')?.12:0)) : 1;
    for (const service of keys(pressure)) {
      const output=sat.design.output[service]*BAND[sat.band].service[service]*sat.condition*continuity;
      pressure[service]+=output;
      if (output) counts[service]++;
    }
  }
  const ground=nation.ground*13+(has(nation,'assurance')?18:0);
  const demand=38+game.month*.032;
  for (const k of keys(pressure)) nation.services[k]=Math.min(1,(1-Math.exp(-pressure[k]/demand))*(.68+.32*Math.min(1,ground/(9+pressure[k]*.22))));
  nation.resilience=keys(counts).reduce((sum,k)=>sum+Math.min(1,Math.max(0,counts[k]-1)/3)*nation.services[k],0)/3;
  const cloudy=game.crises.some(c=>c.type==='proxy')?.72:.36;
  nation.missions=assessFleet(nation,fleet,cloudy,Boolean(game.war||game.crises.some(c=>c.type==='proxy')));
  nation.chartArchive=Math.max((nation.chartArchive??0)*.998,nation.missions.charts*.94);
  nation.maintenance=round(fleet.reduce((sum,s)=>sum+.23+(s.design.wetMass/1700),0));
}
function updateEconomy(game,nation) {
  const policy=POLICIES[nation.policy];
  const services=nation.services;
  const gain=(services.comm*.43+nation.missions.imagery*(has(nation,'forecasting')?.31:.23)+nation.missions.charts*.09+nation.missions.nav*.25)*policy.growth;
  nation.economicBonus += (gain*.115-nation.economicBonus)*.016;
  nation.gdp=round(nation.baseGdp*Math.pow(1.015,game.month/12)*(1+nation.economicBonus),0);
  const income=8.8+Math.sqrt(nation.gdp)*.16;
  const crisisDrag=game.war ? 5 : 0;
  nation.cash=clamp(round(nation.cash+income*policy.funding-nation.maintenance-nation.budget*.08-crisisDrag),0,900);
  const readiness=values(nation.missions.readiness);
  score(nation,'readiness',readiness.reduce((a,b)=>a+b,0)*.22);
  score(nation,'resilience',nation.resilience*(game.war?1.5:.23));
}
function runQueues(game,nation) {
  if (nation.budget>0 && nation.research.length) {
    const project=nation.research[0];
    const prior=values(game.nations).some(n=>n.id!==nation.id && has(n,project.id)) ? .23 : 0;
    project.remaining-=.55+nation.budget/29+prior;
    if (project.remaining<=0) {
      nation.research.shift();
      nation.tech.push(project.id);
      log(game,'Research complete',TECH[project.id].name+' is now available.',nation.id,'research');
    }
  }
  for (const job of nation.production.slice(0,progressLimit(nation))) {
    if (--job.remaining>0) continue;
    nation.production=nation.production.filter(j=>j.id!==job.id);
    const built=job.quantity-(job.quantity>2 && !has(nation,'quality') && random(game)<.1?1:0);
    nation.stock[job.blueprint]=(nation.stock[job.blueprint]||0)+built;
    log(game,'Production complete',built+' × '+getBlueprint(nation,job.blueprint).name+' in storage.',nation.id);
  }
  if (nation.industryPause>game.month) return;
  for (const job of nation.launches.slice(0,bandwidth(nation))) {
    if (--job.remaining>0) continue;
    nation.launches=nation.launches.filter(j=>j.id!==job.id);
    const bp=getBlueprint(nation,job.blueprint);
    const rocket=ROCKETS[job.rocket];
    const transit=transitRisk(game,null,job.band,bp.design,bp.design.wetMass*job.quantity,.08);
    if (random(game)>rocket.reliability+(has(nation,'quality')?.025:0) || random(game)<transit) {
      log(game,'Launch lost',bp.name+' failed to deploy.',nation.id,'alert');
      continue;
    }
    for (let unit=0;unit<job.quantity;unit++) place(game,nation,bp,job.band);
    log(game,'Spacecraft deployed',job.quantity+' × '+bp.name+' deployed to '+BAND[job.band].name+'.',nation.id);
  }
}
function replenish(game,nation) {
  for (const rule of nation.doctrines??[]) {
    const inOrbit=game.satellites.filter(s=>s.owner===nation.id && s.blueprint===rule.blueprint && (s.travel?.band??s.band)===rule.band && s.lifeUntil>game.month+12).length;
    const launching=nation.launches.filter(j=>j.blueprint===rule.blueprint && j.band===rule.band).reduce((sum,j)=>sum+j.quantity,0);
    const desired=rule.quantity-inOrbit-launching;
    if (desired<=0 || nation.cash<55) continue;
    try {
      if (nation.stock[rule.blueprint]>0) order(game,nation.id,{type:'launch',id:rule.blueprint,rocket:rule.rocket,band:rule.band,quantity:1});
      else if (!nation.production.some(j=>j.blueprint===rule.blueprint)) order(game,nation.id,{type:'production',id:rule.blueprint,quantity:Math.min(3,desired)});
    } catch {
      // This order is reconsidered as funds, stock, and orbital access change.
    }
  }
}
function processFleet(game) {
  const survivors=[];
  for (const sat of game.satellites) {
    const nation=game.nations[sat.owner];
    if (sat.phasing && sat.phasing.due<=game.month) {
      sat.phase=(sat.phase+sat.phasing.phase/(2*Math.PI)+1)%1;
      sat.orbit.phase=sat.phase*2*Math.PI;
      sat.phasing=null;
      log(game,'Orbit spacing adjusted',sat.name+' completed its same-plane phasing order.',nation.id);
    }
    if (sat.travel && sat.travel.due<=game.month) {
      if (random(game)<transitRisk(game,sat.band,sat.travel.band,sat.design,sat.design.wetMass,1)) {
        log(game,'Transfer loss',sat.name+' was lost in transit.',nation.id,'alert');
        continue;
      }
      sat.band=sat.travel.band;
      sat.orbit=orbitFor(sat.band,sat.phase,sat.node);
      sat.travel=null;
      log(game,'Transfer complete',sat.name+' arrived in '+BAND[sat.band].name+'.',nation.id);
    }
    if (sat.lifeUntil<=game.month) {
      if (!has(nation,'green') && random(game)<.09) game.debris[sat.band]+=15;
      log(game,'End of service',sat.name+' reached its design lifetime.',nation.id);
      continue;
    }
    if (!sat.travel && random(game)<risk(BAND[sat.band],game.debris[sat.band],1/12,sat.design.shield,Math.sqrt(sat.design.wetMass/270))) {
      sat.condition-=random(game)<.33?.26:1;
      if (sat.condition<=0) {
        game.debris[sat.band]+=100+sat.design.wetMass*.12;
        log(game,'Orbital breakup',sat.name+' was lost. Debris increased in '+BAND[sat.band].name+'.',nation.id,'alert');
        continue;
      }
      log(game,'Debris impact',sat.name+' is operational at reduced capacity.',nation.id,'alert');
    }
    survivors.push(sat);
  }
  game.satellites=survivors;
}
function updateContacts(game,nation) {
  const sensors=nation.services.imaging + nation.ground*.05+(has(nation,'tracking')?.13:0);
  for (const sat of game.satellites) {
    if (sat.owner===nation.id || sat.travel) continue;
    const probability=Math.min(.92,(.60+sensors)*(sat.band==='geo'?.38:.69));
    if (random(game)>=probability) continue;
    const contact=nation.contacts[sat.id]??={id:sat.id,owner:sat.owner,confidence:.19};
    contact.last=game.month;
    contact.band=sat.band;
    contact.declared=sat.declared;
    contact.orbit=sat.orbit;
    contact.confidence=Math.min(.98,contact.confidence+.09+sensors*.08);
    if (contact.confidence>.7) contact.assessment=sat.design.operations?'Strategic capability suspected':
      sat.design.intel?'Signals capability suspected':'Service payload likely';
  }
  for (const contact of values(nation.contacts)) {
    if (contact.last<game.month-24) delete nation.contacts[contact.id];
  }
}
function openCrisis(game,incident) {
  const until=game.month+(incident.type==='proxy'?26:17);
  game.crises.push({...incident,until,actions:{},asset:incident.type==='proxy'?{neutralized:false}:null});
  game.tension=clamp(game.tension+(incident.type==='proxy'?(incident.future?36:19):0),0,100);
  log(game,incident.name,incident.text,null,incident.type==='proxy'?'alert':'history');
}
function historicalEvents(game) {
  for (const incident of INCIDENTS) {
    if (game.month!==(incident.year-START)*12+incident.month) continue;
    openCrisis(game,incident);
    if (incident.id==='challenges') game.nations.us.industryPause=game.month+8;
    if (incident.id==='congestion') game.debris.upper+=180;
  }
  const soviet=game.nations.su;
  if (year(game)>=1989 && year(game)<=2004 && game.month%12===0 && !game.transform) {
    const stress=.79+(year(game)-1991)*.11+Math.max(0,.33-soviet.services.comm)*.28+game.tension*.001;
    const support=soviet.economicBonus*8+soviet.resilience*1.05+Math.min(.30,soviet.cash/1500);
    if (stress>support || year(game)===2004) {
      game.transform=true;
      soviet.name='Russian Federation';
      soviet.baseGdp*=.82;
      soviet.cash*=.68;
      soviet.industryPause=game.month+6;
      log(game,'Soviet Union dissolves','Fiscal and institutional strain splits the union. The Russian Federation retains the programme, fleet and research.',null,'history');
    } else if (year(game)===1991) {
      log(game,'Soviet succession delayed','Resilient services and fiscal capacity slow the political transition. The pressure will be reassessed annually.',null,'history');
    }
  }
  if (game.month===(1993-START)*12+10) {
    game.nations.eu.name='European Union';
    log(game,'European integration','The European programme gains a common political framework.',null,'history');
  }
  for(const c of game.crises) if(c.type==='proxy' && c.until===game.month) resolveConflict(game,c.id,c.name);
  game.crises=game.crises.filter(c=>c.until>game.month);
}
function recordContribution(game,nation) {
  const assessments=game.assessments??={};
  const crises=game.crises.filter(c=>c.type==='proxy');
  const objectives=game.war?[...crises,{id:'general'}]:crises;
  for(const crisis of objectives){
    const customer=incidentCustomer[crisis.id];
    const ratings=nation.missions.readiness;
    const value=customer?ratings[customer]:values(ratings).reduce((a,b)=>a+b,0)/4;
    const ledger=assessments[crisis.id]??={};
    const row=ledger[nation.id]??={sum:0,months:0};
    row.sum+=Math.min(1,value*(crisis.committed?.[nation.id]?1.25:1));
    row.months++;
  }
}
function resolveConflict(game,id,title) {
  const ledger=game.assessments?.[id];
  if(!ledger) return;
  const averages=values(ledger).map(row=>row.sum/row.months);
  const benchmark=.10+.42*Math.max(...averages)+.08*random(game);
  for(const [key,row] of Object.entries(ledger)){
    const nation=game.nations[key], contribution=row.sum/row.months;
    const success=contribution>=benchmark;
    score(nation,'campaigns',(id==='general'?570:205)*contribution*(success?1.35:.75));
    if(!success) nation.baseGdp*=id==='general'?.94:.984;
    log(game,title+' assessment',Math.round(contribution*100)+'% of command demand served. '+(success?'Mission objectives met.':'Command fell short; economic capacity fell '+(id==='general'?'6':'1.6')+'%.'),key,'history');
  }
  delete game.assessments[id];
}
function warStep(game) {
  const chance=escalationChance(game);
  if(chance && random(game)<chance) {
    game.war={start:game.month,until:game.month+18};
    for (const band of BANDS) game.debris[band.id]+=[930,1600,1900,1120,940][BANDS.indexOf(band)];
    for (const nation of values(game.nations)) {
      nation.cash*=.66;
      nation.industryPause=game.month+18;
    }
    game.satellites=game.satellites.filter(s=>{
      const policy=POLICIES[game.nations[s.owner].policy];
      const protection=(s.design.shield+game.nations[s.owner].ground*.037)*policy.defence;
      if (random(game)<.66-protection*.60) return false;
      s.condition*=.8;
      s.disabledUntil=game.month+Math.floor(random(game)*7);
      return true;
    });
    log(game,'General orbital war','Programmes across Earth suffer fleet losses, launch stand-downs and shared debris. Surviving services are now critical.',null,'alert');
  }
  if (game.war && game.month>=game.war.until) {
    resolveConflict(game,'general','General war');
    game.war=null;
    game.lastWar=game.month;
    game.tension=39;
    log(game,'General ceasefire','The launch stand-down ends. The orbital environment remains hazardous and intact infrastructure is at a premium.',null,'alert');
  }
  if (game.war && game.month%3===0) {
    for (const band of BANDS) game.debris[band.id]+=36;
  } else if (game.month%4===0) {
    game.tension=clamp(game.tension-(game.crises.some(c=>c.type==='proxy')?.5:1.5),8,100);
  }
  game.phase=game.war?'total war':game.tension>=56?'crisis':game.tension>=31?'tension':'peace';
}
function ai(game,nation,index) {
  if ((game.month+index)%3!==0) return;
  const tryOrder = action=>{try { order(game,nation.id,action); return true; } catch { return false; }};
  const priority=[
    ['broadcast','timing','modular','arrays','wideband','quality','manufacture','analysis','tracking','signals','response'],
    ['tracking','signals','analysis','precision','altimetry','response','modular','quality','manufacture','lift','assurance','shield'],
    ['modular','quality','manufacture','tracking','assurance','arrays','timing','shield','precision','servicing','green','harden','stewardship'],
    ['quality','modular','manufacture','solar','arrays','optical','radar','timing','lift','tracking','signals','analysis','response']
  ][index];
  if (nation.research.length<2) {
    const choice=[...priority,...keys(TECH)].find(k=>readyTech(nation,k) && !nation.research.some(r=>r.id===k));
    if (choice) tryOrder({type:'research',id:choice});
  }
  if (nation.cash>160 && nation.ground<5 && game.month%18===index*3) tryOrder({type:'ground'});
  const fleet=game.satellites.filter(s=>s.owner===nation.id);
  const activeCrisis=game.crises.find(c=>c.type==='proxy' && c.asset && c.until>game.month);
  if (activeCrisis) {
    nation.assignment=incidentCustomer[activeCrisis.id]??'balanced';
    if (index===2) tryOrder({type:'incident',choice:'negotiate',crisis:activeCrisis.id});
    else if (index!==0 && game.tension>=45) tryOrder({type:'incident',choice:'intervene',crisis:activeCrisis.id});
    else if (index===0 && (!has(nation,'response') || game.tension<44)) tryOrder({type:'incident',choice:'negotiate',crisis:activeCrisis.id});
    if (index!==2) tryOrder({type:'incident',choice:'signals',crisis:activeCrisis.id});
    tryOrder({type:'incident',choice:'support',crisis:activeCrisis.id});
  }
  if(!activeCrisis) nation.assignment='balanced';
  if (nation.cash<55 || fleet.length+nation.launches.length>13) return;
  const best=[
    {kind:'comm',band:has(nation,'lift')?'geo':'lower',part:has(nation,'wideband')?'relay':has(nation,'broadcast')?'dish':'radio'},
    {kind:'imaging',band:'polar',part:has(nation,'radar')?'radar':has(nation,'optical')?'widecam':'camera'},
    {kind:'nav',band:'meo',part:has(nation,'atomic')?'navstar':'beacon'}
  ].filter(t=>has(nation,PARTS[t.part].tech)).sort((a,b)=>nation.services[a.kind]-nation.services[b.kind])[0];
  if (best.kind==='nav' && !has(nation,'lift') && !has(nation,'reusable')) best.band='lower';
  const strategicBand=activeCrisis?.band;
  const response=has(nation,'response') && strategicBand && !fleet.some(s=>s.design.operations && s.band===strategicBand);
  if (response) best.band=strategicBand;
  const intel=has(nation,'signals') && !fleet.some(s=>s.design.intel);
  if(nation.id==='su' && !fleet.some(s=>s.design.payload?.chart) && has(nation,'altimetry')) {
    best.part='altimeter';best.band='polar';
  }
  const parts=[response?'response':intel?'receiver':best.part,has(nation,'film')?'film':has(nation,'junction')?'junction':has(nation,'arrays')?'arrays':has(nation,'mono')?'mono':'panel','radiator','motor'];
  const bus=has(nation,'modular')?'relay':'scout';
  const designName=PARTS[parts[0]].name+' '+bus;
  let bp=nation.blueprints.find(b=>b.name===designName);
  if (!bp && tryOrder({type:'blueprint',name:designName,bus,parts})) bp=nation.blueprints.at(-1);
  if (!bp) return;
  if (nation.stock[bp.id]>0 && !nation.launches.length) {
    for (const rocket of ['meridian','titan','pioneer']) {
      if (tryOrder({type:'launch',id:bp.id,rocket,band:best.band,quantity:1})) break;
    }
  } else if (!nation.production.length && !nation.stock[bp.id]) {
    tryOrder({type:'production',id:bp.id,quantity:1});
  }
}
export function advance(game,aiFactions=[]) {
  if (game.month>=MONTHS) return;
  game.month++;
  historicalEvents(game);
  warStep(game);
  for (const band of BANDS) game.debris[band.id]*=Math.exp(-Math.LN2/(band.half*12));
  processFleet(game);
  for (const nation of values(game.nations)) {
    runQueues(game,nation);
    if (game.month%2===0 && game.month<MONTHS) replenish(game,nation);
    updateServices(game,nation);
    recordContribution(game,nation);
    updateEconomy(game,nation);
    if (game.month%2===0) updateContacts(game,nation);
  }
  for (const [i,def] of FACTIONS.entries()) if (aiFactions.includes(def.id)) ai(game,game.nations[def.id],i);
  if (game.month===MONTHS) {
    for(const key of keys(game.assessments??{})) resolveConflict(game,key,'Closing campaign');
    for (const nation of values(game.nations)) {
      score(nation,'resilience',150*nation.resilience);
    }
    log(game,'Campaign complete','The '+END+' assessment is now available to all participants.',null,'history');
  }
}
export function factionView(game,nationId) {
  const nation=lookup(game.nations,nationId);
  requireRule(nation,'A faction is required.');
  const ownSats=game.satellites.filter(s=>s.owner===nationId).map(s=>({...s,deltaV:remainingDeltaV(s.design,s.fuel),
    transfers:Object.fromEntries(BANDS.filter(b=>b.id!==s.band).map(b=>[b.id,availableTransfer(nation,s,b.id)]))}));
  const elapsedSeconds=game.month*YEAR_SECONDS/12;
  const result=game.month===MONTHS?values(game.nations).map(n=>({id:n.id,name:n.name,total:tally(n),score:n.score})).sort((a,b)=>b.total-a.total):null;
  return {
    month:game.month,year:year(game),elapsedSeconds,phase:game.phase,escalation:escalationChance(game),tension:round(game.tension),finish:END,
    groundReview:nation.industryPause>game.month, nation:{...nation,contacts:undefined}, ownSats,
    contacts:values(nation.contacts).filter(c=>c.last>=game.month-12).map(c=>({...c,reviewed:undefined})),
    bands:BANDS.map(b=>({id:b.id,index:round(game.debris[b.id]),annualRisk:round(100*risk(b,game.debris[b.id],1),2)})),
    factions:values(game.nations).map(n=>({id:n.id,name:n.name})),
    events:game.events.filter(e=>!e.audience || e.audience===nationId).slice(-65),
    crises:game.crises.map(c=>({...c,source:SOURCE_LINKS[c.source],committed:undefined,actions:c.actions[nationId]||[]})),
    ownScore:tally(nation), result
  };
}
export const validSpeed = value=>SPEEDS.includes(value);
