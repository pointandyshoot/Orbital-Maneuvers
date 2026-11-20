// All coefficients are game balance assumptions. Resolution and revisit requirements
// are relative to the customer; they are not specifications for real missions.
import { BAND } from './content.mjs';

export const customers = {land:'Land forces',naval:'Surface fleet',submarine:'Submarine service',air:'Air forces'};
const saturate = strength => -Math.expm1(-Math.max(0,strength));
export const incidentCustomer={afghan:'land',gulf:'air',strait:'naval',beacons:'submarine',grid:'land'};
export function payloadProfile(parts) {
  const count = id => parts.filter(p=>p===id).length;
  return {
    optical:count('camera')*.55+count('widecam')*1.05+count('adaptive')*2+count('detail')*2.2,
    narrow:count('detail')>0, radar:count('radar'), chart:count('altimeter'), processing:count('processor'),
    persistent:count('reactor')>0, mesh:count('mesh')+count('optical')
  };
}
export function assessFleet(nation,fleet,cloud,disrupted) {
  let optical=0,radar=0,chart=0,mesh=0,shield=0;
  const navPlanes=new Set();
  const passes=[];
  let surveyWidth=0;
  for(const sat of fleet){
    const profile=sat.design.payload??payloadProfile(nation.blueprints.find(b=>b.id===sat.blueprint)?.parts??[]);
    shield+=sat.design.shield??0;
    if(sat.design.output?.nav) navPlanes.add(Math.floor(sat.node*6));
    const scale=BAND[sat.band].service.imaging;
    const duty=profile.persistent?1:.76;
    const freshness=(profile.processing?1.2:1)*sat.condition;
    optical+=saturate(profile.optical*scale)*freshness*(1-cloud)*duty;
    radar+=saturate(profile.radar*scale)*freshness*duty;
    chart+=profile.chart*scale*sat.condition;
    if(profile.mesh) mesh++;
    if(profile.optical||profile.radar) {
      passes.push((sat.phase+sat.node)%1);
      surveyWidth+=profile.narrow?.62:1;
    }
  }
  passes.sort((a,b)=>a-b);
  const maxGap=passes.length?Math.max(...passes.map((x,i)=>(i+1<passes.length?passes[i+1]:passes[0]+1)-x)):1;
  const cadence=saturate(surveyWidth*.75)*(1-.48*maxGap);
  const photography=saturate(optical)*cadence, allWeather=saturate(radar)*cadence;
  const imagery=Math.min(1,photography+allWeather-.55*photography*allWeather);
  const comm=nation.services.comm;
  const nav=nation.services.nav*(.38+.62*Math.min(1,navPlanes.size/4));
  const links=comm*(disrupted?(mesh>=2?.88:.55):1);
  const charts=Math.max(nation.chartArchive??0,saturate(chart));
  const readiness={
    land:.30*links+.38*nav+.32*Math.min(1,imagery+.35*photography), naval:.29*links+.27*nav+.29*imagery+.15*charts,
    submarine:.20*links+.25*nav+.55*charts, air:.22*links+.56*nav+.22*imagery
  };
  const priority=nation.assignment??'balanced';
  for(const k of Object.keys(readiness)) readiness[k]=Math.min(1,readiness[k]*(priority==='balanced'?1:k===priority?1.50:.82));
  return {readiness,imagery,charts,photography,allWeather,cadence,mesh,nav,protection:fleet.length?shield/fleet.length:0};
}
export function escalationChance(game) {
  const crisis=game.crises.find(c=>c.type==='proxy');
  if(!crisis||game.war||game.month-game.lastWar<60) return 0;
  const nations=Object.values(game.nations);
  const deterrence=nations.reduce((sum,n)=>sum+n.resilience+(n.missions?.protection??0)+(n.policy==='readiness'?.35:0),0)/4;
  return Math.min(.15, (.001+.065*(game.tension/100)**2+(crisis.asset?.neutralized ? .035 : 0))*(1-.7*Math.min(1,deterrence)));
}
