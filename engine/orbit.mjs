import { BANDS, BAND, EARTH_RADIUS, MU } from './content.mjs';

const rad = Math.PI / 180;
const tau = 2 * Math.PI;
const earthDay = 86164.0905;
const v = r => Math.sqrt(MU/r);
export function orbitFor(id, phase=0, node=0) {
  const band = BAND[id];
  return { a:EARTH_RADIUS+band.km*1000, i:band.inc*rad, node:node*tau, phase:phase*tau, epoch:0 };
}
export function groundPoint(orbit, seconds) {
  const rate = Math.sqrt(MU/orbit.a**3);
  const u = orbit.phase + (seconds-orbit.epoch)*rate;
  const x = Math.cos(u);
  const y = Math.sin(u)*Math.cos(orbit.i);
  return {
    lon: (((Math.atan2(y,x)+orbit.node-seconds*tau/earthDay)/rad+180)%360+360)%360-180,
    lat: Math.asin(Math.sin(u)*Math.sin(orbit.i))/rad
  };
}
export function transfer(from, to, electric, efficient) {
  if (from===to) return { deltaV:0, months:0 };
  const r1 = orbitFor(from).a;
  const r2 = orbitFor(to).a;
  const axis = (r1+r2)/2;
  const first = Math.abs(Math.sqrt(MU*(2/r1-1/axis))-v(r1));
  const arrival = Math.sqrt(MU*(2/r2-1/axis));
  const turn = Math.abs(BAND[to].inc-BAND[from].inc)*rad;
  const second = Math.sqrt((arrival-v(r2))**2+2*arrival*v(r2)*(1-Math.cos(turn)));
  return { deltaV:Math.round((first+second)*(efficient?.9:1)), months:electric?4:2 };
}
export function phasing(orbit, slots, electric) {
  const turns = electric ? 40 : 18;
  const phase = slots * tau / 12;
  const radius = orbit.a;
  const axis = radius * (1-phase/(turns*tau))**(2/3);
  return {
    deltaV:Math.ceil(2*Math.abs(Math.sqrt(MU*(2/radius-1/axis))-v(radius))),
    months:electric?2:1,
    phase
  };
}
export function remainingDeltaV(design, fuel) {
  return design.isp ? Math.floor(design.isp * 9.80665 * Math.log1p(fuel/design.dryMass)) : 0;
}
export function risk(band, index, years, shield=0, area=1) {
  const rate = (band.flux + .000040 * index) * Math.max(.15,1-shield)*area;
  return -Math.expm1(-rate*years);
}
export function transitPath(origin, destination) {
  const target = BANDS.findIndex(b=>b.id===destination);
  const start = origin ? BANDS.findIndex(b=>b.id===origin) : -1;
  return BANDS.slice(Math.max(0, Math.min(start,target)),Math.max(start,target)+1);
}
