export const START = 1975;
export const END = 2060;
export const MONTHS = (END - START) * 12;
export const YEAR_SECONDS = 365.25 * 86400;
export const EARTH_RADIUS = 6371000;
export const MU = 3.986004418e14;
export const SPEEDS = [0, 1, 2, 4];
export const FACTIONS = [
  { id:'us', name:'United States', short:'USA', color:'#65daf7', gdp:1690, cash:310, site:'Cape Canaveral', lat:28.5, lon:-80.6, start:['broadcast','precision'] },
  { id:'su', name:'Soviet Union', short:'USSR', color:'#ff927e', gdp:1180, cash:290, site:'Baikonur', lat:45.6, lon:63.3, start:['optical','lift'] },
  { id:'eu', name:'Europe', short:'EUR', color:'#e2cf83', gdp:1390, cash:275, site:'Guiana', lat:5.2, lon:-52.8, start:['broadcast','solar'] },
  { id:'cn', name:'China', short:'CHN', color:'#bdabff', gdp:470, cash:260, site:'Jiuquan', lat:41, lon:100.3, start:['optical','solar'] }
];

export const BANDS = [
  { id:'lower', name:'Lower LEO', km:500, inc:52, half:3, cap:100, service:{ comm:.48, imaging:1.25, nav:.43 }, launchMonths:1, flux:.0014 },
  { id:'polar', name:'Polar LEO', km:850, inc:97, half:12, cap:175, service:{ comm:.63, imaging:1.54, nav:.52 }, launchMonths:1, flux:.0018 },
  { id:'upper', name:'Upper LEO', km:1500, inc:60, half:35, cap:235, service:{ comm:1.05, imaging:.84, nav:.75 }, launchMonths:2, flux:.0011 },
  { id:'meo', name:'MEO', km:20200, inc:55, half:150, cap:450, service:{ comm:1.02, imaging:.32, nav:1.54 }, launchMonths:2, flux:.0006 },
  { id:'geo', name:'GEO', km:35786, inc:0, half:350, cap:530, service:{ comm:1.58, imaging:.32, nav:.81 }, launchMonths:3, flux:.0005 }
];
export const BAND = Object.fromEntries(BANDS.map(i=>[i.id,i]));
export const SERVICES = { comm:'Communications', imaging:'Observation', nav:'Navigation' };
export const BUS = {
  scout:{ name:'Scout bus', mass:130, power:50, heat:25, slots:4, cost:22, life:8, shield:0 },
  relay:{ name:'Relay bus', mass:310, power:95, heat:55, slots:6, cost:39, life:12, shield:.12, tech:'modular' },
  heavy:{ name:'Platform bus', mass:635, power:160, heat:110, slots:8, cost:72, life:16, shield:.22, tech:'heavybus' },
  swarm:{ name:'Distributed bus', mass:175, power:74, heat:48, slots:5, cost:32, life:12, shield:.13, tech:'distributed' }
};
function part(name, kind, mass, power, heat, cost, properties = {}) {
  return {name,kind,mass,power,heat,cost,...properties};
}
export const PARTS = {
  radio:part('VHF relay','comm',46,-24,-14,12,{output:12}),
  camera:part('Survey camera','imaging',67,-27,-16,15,{output:13}),
  panel:part('Solar array','power',34,67,0,13),
  radiator:part('Radiator','thermal',22,0,53,8),
  motor:part('Chemical thruster','propulsion',55,-9,-5,14,{fuel:14,isp:295}),
  dish:part('Broadcast dish','comm',92,-49,-32,26,{output:28,tech:'broadcast'}),
  widecam:part('Multispectral imager','imaging',105,-56,-36,27,{output:29,tech:'optical'}),
  beacon:part('Timing beacon','nav',73,-34,-23,25,{output:23,tech:'timing'}),
  receiver:part('Passive receiver','intel',54,-31,-23,21,{intel:2,tech:'signals'}),
  tank:part('Auxiliary tank','propulsion',43,0,0,13,{fuel:38,tech:'precision'}),
  ion:part('Electric thruster','propulsion',76,-55,-30,31,{fuel:21,isp:1100,tech:'electric'}),
  armor:part('Shield package','defence',110,0,0,25,{shield:.36,tech:'shield'}),
  arrays:part('Advanced solar wings','power',42,143,0,24,{tech:'arrays'}),
  cooling:part('Heat transport loop','thermal',48,-7,146,27,{tech:'thermal'}),
  navstar:part('Atomic timing package','nav',86,-41,-30,41,{output:45,tech:'atomic'}),
  radar:part('All-weather mapper','imaging',148,-91,-71,44,{output:49,tech:'radar'}),
  relay:part('High-capacity relay','comm',118,-77,-53,48,{output:53,tech:'wideband'}),
  decoder:part('Spectrum analyst','intel',86,-61,-42,41,{intel:5,tech:'analysis'}),
  resilience:part('Resilience controller','defence',59,-24,-16,32,{shield:.25,tech:'autonomy'}),
  service:part('Service adapter','support',74,-31,-20,43,{support:1,tech:'servicing'}),
  response:part('Crisis response package','operations',104,-68,-45,49,{operations:1,tech:'response'}),
  mesh:part('Mesh network node','comm',65,-48,-31,49,{output:38,tech:'mesh'}),
  vault:part('Hardened avionics','defence',91,-34,-26,50,{shield:.47,tech:'harden'}),
  adaptive:part('Adaptive payload','imaging',105,-62,-42,65,{output:68,tech:'fusion'}),
  optical:part('Optical trunk relay','comm',112,-71,-41,67,{output:80,tech:'lasercom'}),
  clocks:part('Precision clock cluster','nav',92,-51,-32,64,{output:73,tech:'clocks'})
};
function tech(name, branch, months, cost, req, text) { return {name,branch,months,cost,req,text}; }
export const TECH = {
  lift:tech('Heavy lift','Launch & industry',19,55,[],'Unlocks the Titan-class lifter.'),
  quality:tech('Quality assurance','Launch & industry',15,43,[],'Improves launch reliability and manufacturing yield.'),
  modular:tech('Modular structures','Spacecraft systems',16,54,[],'Unlocks the six-slot Relay bus.'),
  solar:tech('Solar cell production','Spacecraft systems',13,34,[],'Reduces spacecraft production cost.'),
  optical:tech('Multispectral optics','Observation & intelligence',17,47,[],'Unlocks the multispectral imager.'),
  broadcast:tech('Direct broadcast','Communications & timing',16,45,[],'Unlocks the broadcast dish.'),
  precision:tech('Precision propulsion','Orbital mobility',15,46,[],'Unlocks auxiliary tanks.'),
  tracking:tech('Tracking networks','Security & resilience',14,38,[],'Improves tracking range and contact confidence.'),
  timing:tech('Satellite timing','Communications & timing',21,57,['broadcast'],'Unlocks the timing beacon.'),
  signals:tech('Signals observation','Observation & intelligence',20,50,['tracking'],'Unlocks the passive receiver.'),
  arrays:tech('Efficient solar wings','Spacecraft systems',23,66,['solar','modular'],'Unlocks advanced solar wings.'),
  thermal:tech('Thermal control loops','Spacecraft systems',19,58,['modular'],'Unlocks the heat transport loop.'),
  cadence:tech('Launch standardisation','Launch & industry',23,66,['quality'],'Reduces launch preparation by one month.'),
  manufacture:tech('Modular manufacturing','Launch & industry',24,74,['quality','modular'],'Adds a production line and reduces unit costs.'),
  shield:tech('Debris shielding','Security & resilience',20,58,['modular'],'Unlocks the shield package.'),
  electric:tech('Electric propulsion','Orbital mobility',26,89,['precision','arrays'],'Unlocks the electric thruster. Efficient, with slower transfers.'),
  atomic:tech('Orbital atomic clocks','Communications & timing',27,89,['timing','arrays'],'Unlocks the atomic timing package.'),
  radar:tech('Spaceborne radar','Observation & intelligence',24,83,['optical','arrays'],'Unlocks the all-weather mapper.'),
  wideband:tech('Digital wideband relay','Communications & timing',24,83,['broadcast','arrays'],'Unlocks the high-capacity relay.'),
  heavybus:tech('Large orbital platforms','Spacecraft systems',29,98,['thermal','lift'],'Unlocks the eight-slot Platform bus.'),
  analysis:tech('Spectrum analysis','Observation & intelligence',23,80,['signals','tracking'],'Unlocks the spectrum analyst.'),
  assurance:tech('Distributed ground stations','Security & resilience',26,80,['tracking','quality'],'Improves service resilience and post-crisis recovery.'),
  reusable:tech('Recoverable launch stages','Launch & industry',35,128,['lift','cadence','precision'],'Unlocks the reusable low-cost Meridian.'),
  servicing:tech('Orbital servicing','Orbital mobility',33,122,['precision','tracking','modular'],'Unlocks the service adapter and life extension.'),
  autonomy:tech('Autonomous fault recovery','Security & resilience',28,105,['shield','analysis'],'Unlocks the resilience controller.'),
  response:tech('Crisis response systems','Security & resilience',32,119,['analysis','tracking','precision'],'Unlocks abstract operations against designated crisis assets.'),
  distributed:tech('Distributed spacecraft','Spacecraft systems',34,127,['arrays','manufacture','autonomy'],'Unlocks the Distributed bus.'),
  rapid:tech('Responsive launch reserves','Launch & industry',31,120,['cadence','manufacture'],'Adds a launch lane and reduces preparation.'),
  mesh:tech('Orbital mesh networks','Communications & timing',33,132,['wideband','distributed'],'Unlocks the mesh network node.'),
  fusion:tech('Distributed sensor fusion','Observation & intelligence',32,136,['radar','analysis','distributed'],'Unlocks the adaptive payload.'),
  harden:tech('Radiation-tolerant avionics','Security & resilience',33,129,['autonomy','thermal'],'Unlocks hardened avionics.'),
  green:tech('Clean disposal standards','Orbital mobility',31,110,['servicing','electric'],'Reduces routine debris and makes relocation cheaper.'),
  lasercom:tech('Optical trunk networks','Communications & timing',36,148,['mesh','thermal'],'Unlocks the optical trunk relay.'),
  clocks:tech('Resilient time constellations','Communications & timing',36,143,['atomic','mesh'],'Unlocks the precision clock cluster.'),
  foundry:tech('Automated orbital supply chains','Launch & industry',38,154,['rapid','servicing','distributed'],'Adds a production line and dramatically lowers costs.'),
  stewardship:tech('Orbital stewardship','Security & resilience',38,154,['green','harden','assurance'],'Enables funded debris remediation and improves sustainability.'),
  forecasting:tech('Integrated Earth forecasting','Observation & intelligence',35,148,['fusion','mesh'],'Raises the economic value of observation services.'),
  logistics:tech('Orbital logistics infrastructure','Orbital mobility',38,156,['servicing','rapid','green'],'Improves refuelling and servicing turnaround.')
};
export const BRANCHES = [...new Set(Object.values(TECH).map(t=>t.branch))];
export const ROCKETS = {
  pioneer:{name:'Pioneer',cap:580,cost:32,reliability:.94,months:2},
  titan:{name:'Titan',cap:1450,cost:58,reliability:.95,months:3,tech:'lift'},
  meridian:{name:'Meridian',cap:1900,cost:43,reliability:.97,months:2,tech:'reusable'}
};
export const POLICIES = {
  growth:{name:'Commercial growth',note:'More GDP from working services.',growth:1.25,funding:1,defence:.9},
  balanced:{name:'Balanced programme',note:'Steady funding and civilian benefits.',growth:1,funding:1,defence:1},
  readiness:{name:'Strategic reserve',note:'More funding and recovery capacity.',growth:.83,funding:1.13,defence:1.17}
};
export const SOURCE_LINKS = {
  apollo:'https://www.nasa.gov/missions/apollo-soyuz/the-apollo-soyuz-mission/',
  detente:'https://history.state.gov/milestones/1969-1976/detente',
  afghanistan:'https://history.state.gov/milestones/1977-1980/soviet-invasion-afghanistan',
  soviet:'https://history.state.gov/milestones/1989-1992/collapse-soviet-union',
  shuttle:'https://www.nasa.gov/reference/the-space-shuttle/',
  iss:'https://www.nasa.gov/history/space-station-assembly/',
  timeline:'https://www.nasa.gov/specials/timeline/topics.html'
};
