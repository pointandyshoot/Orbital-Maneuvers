import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND, BANDS, BRANCHES, MONTHS, TECH } from '../engine/content.mjs';
import { advance, factionView, inspectDesign, newGame, order } from '../engine/game.mjs';
import { groundPoint, orbitFor, risk, transfer, transitPath } from '../engine/orbit.mjs';

test('tech definitions form a connected set of unlockable branches',()=>{
  const visited=new Set();
  while (visited.size<Object.keys(TECH).length) {
    const open=Object.entries(TECH).filter(([id,t])=>!visited.has(id)&&t.req.every(r=>visited.has(r)));
    assert.ok(open.length);
    for(const [id] of open) visited.add(id);
  }
  assert.equal(BRANCHES.length,6);
  assert.equal(visited.size,45);
});
test('invalid spacecraft and invalid budget changes do not mutate the programme',()=>{
  const game=newGame();
  const nation=game.nations.us;
  const n=nation.blueprints.length;
  assert.throws(()=>order(game,'us',{type:'blueprint',name:'Bad power',bus:'scout',parts:['dish','dish']}),/Power deficit/);
  assert.throws(()=>inspectDesign(nation,'scout',['vault']),/unlocked/);
  assert.throws(()=>order(game,'us',{type:'policy',id:'readiness',budget:900}),/allocation/);
  assert.equal(nation.blueprints.length,n);
  assert.equal(nation.policy,'balanced');
});
test('research and automated replenishment use the regular production and launch rules',()=>{
  const game=newGame(6);
  const nation=game.nations.us;
  const bp=nation.blueprints[0];
  order(game,'us',{type:'research',id:'modular'});
  order(game,'us',{type:'doctrine',id:bp.id,rocket:'pioneer',band:'lower',quantity:3});
  assert.throws(()=>order(game,'us',{type:'launch',id:bp.id,rocket:'pioneer',band:'lower',quantity:1}),/storage/);
  for(let i=0;i<40;i++) advance(game);
  assert.ok(nation.tech.includes('modular'));
  assert.ok(game.satellites.filter(s=>s.owner==='us'&&s.blueprint===bp.id).length>=3);
});
test('faction views only expose own ground truth',()=>{
  const game=newGame(194);
  order(game,'su',{type:'research',id:'tracking'});
  for(let i=0;i<8;i++) advance(game);
  order(game,'su',{type:'incident',crisis:'handshake',choice:'support'});
  const view=factionView(game,'us');
  const encoded=JSON.stringify(view);
  assert.ok(view.ownSats.every(s=>s.owner==='us'));
  assert.ok(view.contacts.length);
  assert.ok(view.contacts.every(c=>!('design' in c)&&!('fuel' in c)));
  assert.equal(view.crises.find(c=>c.id==='handshake').actions.length,0);
  assert.equal(view.crises.find(c=>c.id==='handshake').actions.su,undefined);
  assert.equal(encoded.includes('"seed":'),false);
  assert.deepEqual(view.factions.find(n=>n.id==='su'),{id:'su',name:'Soviet Union'});
});
test('circular projection and hazard exposure have the expected scale',()=>{
  const earthDay=86164.0905;
  const geo=orbitFor('geo',.34,.2);
  const pos=groundPoint(geo,0);
  assert.ok(Math.abs(groundPoint(geo,earthDay).lon-pos.lon)<.2);
  assert.deepEqual(transitPath(null,'meo').map(b=>b.id),['lower','polar','upper','meo']);
  assert.ok(transfer('lower','polar',false,false).deltaV>transfer('lower','upper',false,false).deltaV);
  assert.ok(risk(BAND.lower,200,1)>risk(BAND.lower,20,1));
  assert.ok(risk(BAND.lower,200,1)>100*risk(BAND.lower,200,.001));
  const game=newGame();
  assert.throws(()=>order(game,'us',{type:'transfer',id:game.satellites[0].id,band:'geo'}),/propellant/);
});
test('Soviet succession is sensitive to space-driven economic strength',()=>{
  const vulnerable=newGame();
  const resilient=newGame();
  for(const g of [vulnerable,resilient]) g.month=(1991-1975)*12-1;
  resilient.nations.su.economicBonus=.155;
  resilient.nations.su.resilience=.63;
  advance(vulnerable);advance(resilient);
  assert.equal(vulnerable.nations.su.name,'Russian Federation');
  assert.equal(resilient.nations.su.name,'Soviet Union');
});
test('a regional incident can cause general war, shared losses and enduring replacement constraints',()=>{
  const game=newGame(10);
  game.month=(2038-1975)*12+8;
  game.tension=75;
  game.seed=1972; // A low first random draw exercises the escalation branch.
  for(const nation of [game.nations.us,game.nations.su]) {
    nation.tech.push('response');
    nation.services.comm=.75;
  }
  advance(game);
  assert.ok(game.war);
  assert.equal(game.phase,'total war');
  assert.ok(game.satellites.length<8);
  const high=game.debris.upper;
  for(let i=0;i<22;i++) advance(game);
  assert.equal(game.war,null);
  assert.ok(game.debris.upper>high*.9);
  assert.ok(BANDS.filter(b=>game.debris[b.id]>b.half*4+650).length>=2);
});
test('a saved seeded campaign produces identical world and final standings',()=>{
  const game=newGame(42);
  const ai=['us','su','eu','cn'];
  for(let i=0;i<360;i++) advance(game,ai);
  const reloaded=JSON.parse(JSON.stringify(game));
  for(let i=360;i<MONTHS;i++) {
    advance(game,ai);
    advance(reloaded,ai);
  }
  assert.deepEqual(reloaded,game);
  const standings=factionView(game,'us').result;
  assert.equal(standings.length,4);
  assert.equal(factionView(game,'us').year,2060);
  assert.ok(standings[0].total>=standings.at(-1).total);
  assert.throws(()=>order(game,'us',{type:'ground'}),/ended/);
});
