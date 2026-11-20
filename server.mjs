import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FACTIONS, MONTHS } from './engine/content.mjs';
import { advance, factionView, launchEstimates, newGame, order, validSpeed } from './engine/game.mjs';

const STATIC = new Map([
  ['/', ['public/index.html','text/html; charset=utf-8']],
  ['/style.css',['public/style.css','text/css; charset=utf-8']],
  ['/app.mjs',['public/app.mjs','text/javascript; charset=utf-8']],
  ['/map.mjs',['public/map.mjs','text/javascript; charset=utf-8']],
  ['/coastlines.json',['public/coastlines.json','application/json']],
  ['/engine/missions.mjs',['engine/missions.mjs','text/javascript; charset=utf-8']],
  ['/engine/content.mjs',['engine/content.mjs','text/javascript; charset=utf-8']],
  ['/engine/orbit.mjs',['engine/orbit.mjs','text/javascript; charset=utf-8']]
]);
const codePattern = /^[A-Z0-9_-]{8}$/;
const one = seconds=>seconds*1000;
const hash = token=>createHash('sha256').update(token).digest('hex');
const connected = p=>Date.now()-p.seen<one(32);
const timeoutError = (message,status)=>Object.assign(new Error(message),{status});
const need = (condition,message,status=400)=>{if(!condition) throw timeoutError(message,status);};
const ready = room=>room.players.length===(room.expected??2) && room.players.every(p=>p.faction && p.ready && connected(p));
const clockSpeed = room=>Math.min(4,...room.players.filter(connected).map(p=>p.speed));
const safeName = input=>typeof input==='string' ? input.trim().slice(0,24) : '';
const randomToken = bytes=>randomBytes(bytes).toString('base64url');

async function body(req) {
  const chunks=[];
  let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    need(size<=16000,'Order is too large.',413);
    chunks.push(chunk);
  }
  try {
    const parsed=JSON.parse(Buffer.concat(chunks).toString());
    need(parsed && typeof parsed==='object' && !Array.isArray(parsed),'Expected a JSON object.');
    return parsed;
  } catch { throw timeoutError('Expected a JSON object.',400); }
}
function json(res,status,value) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
function player(name) {
  need(safeName(name),'Enter a player name.');
  const token=randomToken(30);
  return { token, seat:{id:randomToken(7), auth:hash(token), name:safeName(name), faction:null, ready:false, speed:4, seen:Date.now()} };
}
function roomView(room,seat) {
  const host=room.host===seat.id;
  return {
    code:room.code, expected:room.expected??2, started:Boolean(room.game), host, player:seat.id, speed:room.game?clockSpeed(room):4,
    players:room.players.map(({id,name,faction,ready,speed,seen})=>({id,name,faction,ready,speed,online:connected({seen}),host:id===room.host})),
    game:room.game?factionView(room.game,seat.faction):null
  };
}

export async function createHost({ dataDir=process.env.DATA_DIR || 'data', monthMs=Number(process.env.MONTH_MS || 6000), tickMs=250 }={}) {
  const data=resolve(dataDir);
  await mkdir(data,{recursive:true});
  const rooms=new Map();
  const pending=new Map();
  async function load(name) {
    const saved=JSON.parse(await readFile(resolve(data,name),'utf8'));
    if (saved.format!==1 || !codePattern.test(saved.code) || !Array.isArray(saved.players) || (saved.game && saved.game.version!==1)) throw new Error('Unrecognized save format');
    saved.players.forEach(seat=>{seat.seen=0;});
    rooms.set(saved.code,{...saved,clockAt:Date.now(),credit:0});
  }
  for (const name of await readdir(data)) {
    if (!/^[A-Z0-9_-]{8}\.json$/.test(name)) continue;
    try { await load(name); } catch (e) { console.error('Could not load '+name+': '+e.message); }
  }
  function save(room) {
    const serialized=JSON.stringify({format:1,code:room.code,host:room.host,players:room.players,expected:room.expected,game:room.game});
    const job=(pending.get(room.code)||Promise.resolve()).catch(()=>{}).then(async()=>{
      const dest=resolve(data,room.code+'.json');
      await writeFile(dest+'.tmp',serialized,{mode:0o600});
      await rename(dest+'.tmp',dest);
    });
    pending.set(room.code,job);
    job.catch(e=>console.error('Room save failed:',e.message)).finally(()=>{ if (pending.get(room.code)===job) pending.delete(room.code); });
    return job;
  }
  function startWhenReady(room) {
    if (room.game || !ready(room)) return false;
    room.game=newGame(randomBytes(4).readUInt32LE());
    room.clockAt=Date.now();
    return true;
  }
  function runner(room,now) {
    const elapsed=Math.min(now-room.clockAt,one(2));
    room.clockAt=now;
    if (!room.game || room.game.month>=MONTHS || !room.players.some(connected)) return;
    const speed=clockSpeed(room);
    if (!speed) return;
    room.credit+=elapsed*(speed/4);
    if (room.credit<monthMs) return;
    room.credit-=monthMs;
    const occupied=new Set(room.players.map(p=>p.faction));
    advance(room.game,FACTIONS.filter(f=>!occupied.has(f.id)).map(f=>f.id));
    void save(room);
  }
  const loop=setInterval(()=>{ for(const room of rooms.values()) runner(room,Date.now()); },tickMs);
  loop.unref();
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
      if (req.method==='GET' && STATIC.has(url.pathname)) {
        const [file,mime]=STATIC.get(url.pathname);
        const bytes=await readFile(new URL('./'+file,import.meta.url));
        res.writeHead(200,{'Content-Type':mime,'Cache-Control':file.includes('coastlines')?'public, max-age=86400':'no-cache'});
        return res.end(bytes);
      }
      if (req.method==='GET' && url.pathname==='/health') return json(res,200,{ok:true});
      if (req.method==='POST' && url.pathname==='/api/rooms') {
        const payload=await body(req);
        const {seat,token}=player(payload.name);
        let code;
        do { code=randomToken(6).toUpperCase(); } while(rooms.has(code));
        const room={code,host:seat.id,players:[seat],expected:2,game:null,clockAt:Date.now(),credit:0};
        rooms.set(code,room);
        await save(room);
        return json(res,201,{token,state:roomView(room,seat)});
      }
      const match=url.pathname.match(/^\/api\/rooms\/([A-Z0-9_-]{8})\/(join|state|command|estimates)$/);
      if (!match) return json(res,404,{error:'Page not found.'});
      const room=rooms.get(match[1]);
      need(room,'Room not found.',404);
      const endpoint=match[2];
      if (endpoint==='join' && req.method==='POST') {
        const payload=await body(req);
        need(!room.game,'This campaign has already started.',409);
        need(room.players.length<(room.expected??2),'This room is full.',409);
        const {seat,token}=player(payload.name);
        room.players.push(seat);
        await save(room);
        return json(res,200,{token,state:roomView(room,seat)});
      }
      const token=String(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{40})$/)?.[1];
      const seat=token?room.players.find(p=>p.auth===hash(token)):null;
      need(seat,'Your seat credential is missing or invalid.',401);
      seat.seen=Date.now();
      if (endpoint==='state' && req.method==='GET') {
        if (startWhenReady(room)) await save(room);
        return json(res,200,roomView(room,seat));
      }
      if (endpoint==='estimates' && req.method==='GET') {
        need(room.game,'Start the campaign first.');
        return json(res,200,launchEstimates(room.game,room.game.nations[seat.faction]));
      }
      need(endpoint==='command' && req.method==='POST','Method not allowed.',405);
      const action=await body(req);
      if (action.type==='faction') {
        need(!room.game,'Factions are locked.');
        need(FACTIONS.some(f=>f.id===action.id),'Unknown faction.');
        need(!room.players.some(p=>p!==seat && p.faction===action.id),'That faction already has a player.');
        seat.faction=action.id;
        seat.ready=false;
      } else if (action.type==='ready') {
        need(!room.game && seat.faction,'Choose a faction first.');
        seat.ready=action.value===true;
      } else if (action.type==='remove') {
        need(room.host===seat.id && !room.game,'Only the host can remove players before the campaign.');
        const remove=room.players.find(p=>p.id===action.id && p.id!==room.host);
        need(remove,'Player not found.');
        room.players=room.players.filter(p=>p!==remove);
      } else if (action.type==='expected') {
        need(!room.game && room.host===seat.id,'Only the host can change the player count.');
        need(Number.isInteger(action.value) && action.value>=room.players.length && action.value<=4,'Choose between the current player count and four.');
        room.expected=action.value;
      } else if (action.type==='speed') {
        need(room.game && validSpeed(action.value),'Choose a supported campaign speed.');
        seat.speed=action.value;
      } else {
        need(room.game,'Start the campaign first.');
        order(room.game,seat.faction,action);
      }
      startWhenReady(room);
      await save(room);
      json(res,200,roomView(room,seat));
    } catch(e) {
      if (res.headersSent || res.destroyed) return;
      json(res,e.status||400,{error:e.message});
    }
  });
  server.once('close',()=>clearInterval(loop));
  return {server,waitForSaves:()=>Promise.allSettled([...pending.values()])};
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const {server,waitForSaves}=await createHost();
  const port=Number(process.env.PORT||8787);
  const host=process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log('Orbital Command listening at http://'+host+':'+port));
  function shutdown() {
    server.close(async()=>{await waitForSaves();process.exitCode=0;});
  }
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
}
