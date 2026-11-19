import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHost } from '../server.mjs';

test('friends join a ready-gated room, share the lowest speed, and keep the same seats after restart',async t=>{
  const dataDir=await mkdtemp(join(tmpdir(),'orbital-host-test-'));
  let instance;
  const close=async()=>{
    if(!instance?.server.listening) return;
    const closing=new Promise(resolve=>instance.server.close(resolve));
    instance.server.closeAllConnections();
    await closing;
    await instance.waitForSaves();
  };
  t.after(async()=>{await close();await rm(dataDir,{recursive:true,force:true});});
  async function start() {
    instance=await createHost({dataDir,monthMs:200,tickMs:20});
    await new Promise(resolve=>instance.server.listen(0,'127.0.0.1',resolve));
    return 'http://127.0.0.1:'+instance.server.address().port;
  }
  let base=await start();
  async function request(path,body,token) {
    const headers={};
    if(body) headers['Content-Type']='application/json';
    if(token) headers.Authorization='Bearer '+token;
    const res=await fetch(base+'/api/rooms'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
    return {status:res.status,body:await res.json()};
  }
  const made=(await request('',{name:'Host'})).body;
  const room='/'+made.state.code;
  const friend=(await request(room+'/join',{name:'Friend'})).body;
  const action=(who,body)=>request(room+'/command',body,who.token);
  const state=who=>request(room+'/state',undefined,who.token);
  assert.equal((await request(room+'/state')).status,401);
  assert.equal((await action(made,{type:'faction',id:'us'})).status,200);
  assert.equal((await action(friend,{type:'faction',id:'us'})).status,400);
  assert.equal((await action(friend,{type:'faction',id:'cn'})).status,200);
  assert.equal((await action(made,{type:'ready',value:true})).status,200);
  assert.equal((await state(made)).body.started,false);
  const begun=(await action(friend,{type:'ready',value:true})).body;
  assert.equal(begun.started,true);
  assert.equal(begun.speed,4);
  assert.equal((await request(room+'/join',{name:'Latecomer'})).status,409);
  assert.equal((await action(friend,{type:'speed',value:1})).body.speed,1);
  const paused=(await action(friend,{type:'speed',value:0})).body;
  await new Promise(resolve=>setTimeout(resolve,250));
  const hostState=(await state(made)).body;
  assert.equal(hostState.speed,0);
  assert.equal(hostState.game.month,paused.game.month);
  assert.equal(hostState.game.nation.id,'us');
  assert.equal(paused.game.nation.id,'cn');
  await close();
  base=await start();
  const restored=(await state(friend)).body;
  assert.equal(restored.speed,0);
  assert.equal(restored.game.month,paused.game.month);
  assert.equal(restored.game.nation.id,'cn');
  assert.equal((await action(friend,{type:'speed',value:4})).body.speed,4);
});
