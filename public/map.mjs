import { EARTH_RADIUS, FACTIONS, MU } from '/engine/content.mjs';
import { groundPoint } from '/engine/orbit.mjs';

let coastline = [];
export const coastReady=fetch('/coastlines.json').then(r=>r.json()).then(data=>{coastline=data;}).catch(()=>{});
const color=id=>FACTIONS.find(f=>f.id===id)?.color||'#7892a0';

export function plot(canvas,game,display={}) {
  const bounds=canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return [];
  const scale=Math.min(2,devicePixelRatio||1);
  const width=bounds.width, height=bounds.height;
  const pixelWidth=Math.round(width*scale), pixelHeight=Math.round(height*scale);
  if (canvas.width!==pixelWidth || canvas.height!==pixelHeight) {
    canvas.width=pixelWidth;
    canvas.height=pixelHeight;
  }
  const ctx=canvas.getContext('2d');
  ctx.setTransform(scale,0,0,scale,0,0);
  ctx.fillStyle='#07151d';
  ctx.fillRect(0,0,width,height);
  const margin=14;
  const mapWidth=width-margin*2, mapHeight=height-margin*2;
  const xy=(lon,lat)=>[margin+(lon+180)*mapWidth/360,margin+(90-lat)*mapHeight/180];
  function line(points) {
    ctx.beginPath();
    let prior=Infinity;
    for (const [lon,lat] of points) {
      const [x,y]=xy(lon,lat);
      if (Math.abs(lon-prior)>180) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
      prior=lon;
    }
    ctx.stroke();
  }
  ctx.strokeStyle='#16333d';
  ctx.lineWidth=1;
  for(let lon=-180;lon<=180;lon+=30) line([[lon,-90],[lon,90]]);
  for(let lat=-90;lat<=90;lat+=30) line([[-180,lat],[0,lat],[180,lat]]);
  ctx.strokeStyle='#3b716f';
  ctx.lineWidth=1.1;
  for (const segment of coastline) line(segment);
  if (!game) {
    ctx.strokeStyle='#39baba64';
    ctx.setLineDash([4,4]);
    for (let orbit=0;orbit<3;orbit++) line(Array.from({length:181},(_,i)=>[i*2-180,Math.sin((i+orbit*30)/33)*[54,33,69][orbit]]));
    ctx.setLineDash([]);
    return [];
  }
  const hits=[];
  const now=game.elapsedSeconds;
  const own=game.ownSats.map(s=>({...s,local:true}));
  const satellites=[...game.contacts,...own].filter(s=>!display.band || s.band===display.band);
  for(const site of FACTIONS) {
    const [x,y]=xy(site.lon,site.lat);
    ctx.strokeStyle=color(site.id)+'bc';
    ctx.strokeRect(x-3,y-3,6,6);
  }
  for (const s of satellites) {
    if (s.travel || !s.orbit) continue;
    const point=groundPoint(s.orbit,now);
    const [x,y]=xy(point.lon,point.lat);
    const selected=s.id===display.selected;
    const tint=color(s.owner);
    if (display.layer==='coverage' && s.local && Object.values(s.design.output).some(Boolean)) {
      const rad=Math.PI/180;
      const elevation=12*rad;
      const angle=Math.acos(EARTH_RADIUS/s.orbit.a*Math.cos(elevation))-elevation;
      const lat=point.lat*rad, lon=point.lon*rad;
      const footprint=Array.from({length:73},(_,i)=>{
        const direction=i*Math.PI/36;
        const north=Math.asin(Math.sin(lat)*Math.cos(angle)+Math.cos(lat)*Math.sin(angle)*Math.cos(direction));
        const east=lon+Math.atan2(Math.sin(direction)*Math.sin(angle)*Math.cos(lat),Math.cos(angle)-Math.sin(lat)*Math.sin(north));
        return [east/rad,north/rad];
      });
      ctx.save();
      ctx.beginPath();ctx.rect(margin,margin,mapWidth,mapHeight);ctx.clip();
      ctx.fillStyle=tint+'14';ctx.strokeStyle=tint+'55';
      for (const offset of [-360,0,360]) {
        ctx.beginPath();
        for (const [i,[east,north]] of footprint.entries()) {
          const [fx,fy]=xy(east+offset,north);
          if(i===0) ctx.moveTo(fx,fy);else ctx.lineTo(fx,fy);
        }
        ctx.closePath();ctx.fill();ctx.stroke();
      }
      ctx.restore();
    }
    if (display.layer!=='coverage' && (selected || (s.local && own.length<=8))) {
      const period=2*Math.PI*Math.sqrt(s.orbit.a**3/MU);
      ctx.lineWidth=selected?1.4:.9;
      ctx.strokeStyle=tint+(selected?'b5':'58');
      ctx.setLineDash(selected?[]:[4,4]);
      line(Array.from({length:76},(_,i)=>{
        const p=groundPoint(s.orbit,now+period*(i-38)/75);
        return [p.lon,p.lat];
      }));
      ctx.setLineDash([]);
    }
    ctx.lineWidth=selected?2:1.1;
    ctx.fillStyle=tint;
    ctx.strokeStyle=tint;
    ctx.beginPath();
    const d=selected?6:4;
    ctx.moveTo(x,y-d);ctx.lineTo(x+d,y);ctx.lineTo(x,y+d);ctx.lineTo(x-d,y);ctx.closePath();
    if (s.local) ctx.fill(); else ctx.stroke();
    if (selected) {
      ctx.strokeRect(x-10,y-10,20,20);
      ctx.font='12px monospace';
      ctx.fillText(s.name||'TRACKED CONTACT',x+14,y-8);
    }
    hits.push({id:s.id,x,y});
  }
  return hits;
}

const shapes = {
  comm(ctx) { ctx.arc(0,0,14,Math.PI*.1,Math.PI*.9);ctx.moveTo(-6,8);ctx.lineTo(0,-8);ctx.lineTo(6,8); },
  imaging(ctx) { ctx.rect(-12,-9,24,18);ctx.moveTo(5,0);ctx.arc(0,0,5,0,Math.PI*2); },
  nav(ctx) { ctx.rect(-10,-10,20,20);ctx.moveTo(-14,0);ctx.lineTo(14,0);ctx.moveTo(0,-14);ctx.lineTo(0,14); },
  power(ctx) { ctx.rect(-15,-10,30,20);for(let i=-10;i<=10;i+=5){ctx.moveTo(i,-10);ctx.lineTo(i,10);} },
  thermal(ctx) { for(let i=-12;i<=12;i+=6){ctx.moveTo(i,-11);ctx.lineTo(i,11);} },
  propulsion(ctx) { ctx.moveTo(-11,11);ctx.lineTo(-5,-7);ctx.lineTo(5,-7);ctx.lineTo(11,11);ctx.closePath(); },
  defence(ctx) { ctx.moveTo(0,-13);ctx.lineTo(12,-7);ctx.lineTo(8,7);ctx.lineTo(0,13);ctx.lineTo(-8,7);ctx.lineTo(-12,-7);ctx.closePath(); },
  intel(ctx) { ctx.moveTo(-13,0);ctx.lineTo(-7,0);ctx.lineTo(-3,-9);ctx.lineTo(2,8);ctx.lineTo(6,-3);ctx.lineTo(13,-3); },
  support(ctx) { ctx.rect(-9,-9,18,18);ctx.moveTo(-9,-9);ctx.lineTo(9,9);ctx.moveTo(9,-9);ctx.lineTo(-9,9); },
  operations(ctx) { ctx.rect(-9,-9,18,18);ctx.moveTo(0,-15);ctx.lineTo(0,15);ctx.moveTo(-15,0);ctx.lineTo(15,0); }
};
export function schematic(canvas,bus,modules,parts,active) {
  if (!canvas) return;
  const box=canvas.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(box.width*ratio);
  canvas.height=Math.round(box.height*ratio);
  const ctx=canvas.getContext('2d');
  ctx.scale(ratio,ratio);
  const w=box.width,h=box.height;
  ctx.fillStyle='#071820';
  ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#153440';
  ctx.lineWidth=1;
  for(let x=0;x<w;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  const columns=Math.ceil(bus.slots/2), scale=Math.min(.92,w/(columns*86+100));
  ctx.translate(w/2,h/2);
  ctx.scale(scale,scale);
  const length=columns*65+20;
  ctx.strokeStyle='#66c3b3';ctx.lineWidth=1.2;
  const installed=modules.filter(Boolean).map(id=>parts[id].kind);
  if(installed.includes('power')){
    for(const sign of [-1,1]){
      const x=sign*(length/2+21);
      ctx.beginPath();ctx.moveTo(sign*length/2,0);ctx.lineTo(sign*(length/2+42),0);ctx.stroke();
      ctx.strokeRect(x-16,-61,32,122);
      for(let y=-51;y<61;y+=10){ctx.beginPath();ctx.moveTo(x-16,y);ctx.lineTo(x+16,y);ctx.stroke();}
    }
  }
  if(installed.includes('propulsion')){
    ctx.beginPath();ctx.moveTo(-16,52);ctx.lineTo(-23,66);ctx.lineTo(23,66);ctx.lineTo(16,52);ctx.stroke();
  }
  if(installed.includes('comm')){
    ctx.beginPath();ctx.moveTo(0,-52);ctx.lineTo(0,-67);ctx.moveTo(-20,-73);ctx.quadraticCurveTo(0,-53,20,-73);ctx.stroke();
  }
  ctx.strokeStyle='#65dac3';
  ctx.strokeRect(-length/2,-52,length,104);
  ctx.strokeStyle='#2e6367';
  ctx.strokeRect(-length/2+5,-47,length-10,94);
  ctx.beginPath();
  ctx.setLineDash([3,4]);ctx.moveTo(-length/2-22,0);ctx.lineTo(length/2+22,0);ctx.stroke();ctx.setLineDash([]);
  modules.forEach((id,i)=>{
    const x=(i%columns-(columns-1)/2)*65;
    const y=i<columns?-25:25;
    ctx.save();ctx.translate(x,y);
    ctx.strokeStyle=active===i?'#e5cca5':id?'#96f7df':'#2e6268';
    ctx.strokeRect(-29,-18,58,36);
    ctx.beginPath();
    if(id) shapes[parts[id].kind]?.(ctx);
    else {ctx.moveTo(-4,0);ctx.lineTo(4,0);ctx.moveTo(0,-4);ctx.lineTo(0,4);}
    ctx.stroke();
    ctx.restore();
  });
}
