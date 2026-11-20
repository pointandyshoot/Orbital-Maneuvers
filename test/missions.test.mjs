import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFleet, escalationChance, payloadProfile } from '../engine/missions.mjs';
import { newGame, advance, order } from '../engine/game.mjs';

test('cloud, spacing and power change the useful observations returned',()=>{
  const n=newGame().nations.su;
  const craft=(parts,phase)=>({phase,node:0,condition:1,band:'polar',design:{payload:payloadProfile(parts)}});
  const survey=(fleet,cloud)=>assessFleet(n,fleet,cloud,false).imagery;
  const photo=craft(['camera'],0),radar=craft(['radar'],.5);
  assert.ok(survey([photo],.8)<survey([photo],.1));
  assert.equal(survey([radar],.8),survey([radar],.1));
  assert.ok(survey([photo,radar],.8)>survey([photo,{...radar,phase:0}],.8));
  assert.ok(survey([photo,radar],.8)>survey([radar],.8));
  assert.ok(survey([craft(['reactor','radar'],0)],.8)>survey([radar],.8));
});
test('aggression raises the same crisis roll while a defensive posture lowers it',()=>{
  const g=newGame();
  g.crises=[{type:'proxy',asset:{neutralized:false}}];
  const initial=escalationChance(g);
  g.nations.su.policy='readiness';
  assert.ok(escalationChance(g)<initial);
  g.crises[0].asset.neutralized=true;
  assert.ok(escalationChance(g)>initial);
});
test('paired campaigns reward sustained customer support while preserving a route to recovery',()=>{
  const a=newGame(47),b=structuredClone(a);
  for(const g of [a,b]) {
    g.month=(1979-1975)*12+10;
    order(g,'us',{type:'assignment',id:g===a?'land':'submarine'});
    for(let i=0;i<29;i++) advance(g);
  }
  assert.ok(a.nations.us.score.campaigns>b.nations.us.score.campaigns);
  assert.equal(a.nations.us.score.economy,undefined);
  assert.ok(a.nations.us.economicBonus>0);
  assert.ok(b.month<1020);
});
