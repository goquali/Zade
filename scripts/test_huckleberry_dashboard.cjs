const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const {renderToStaticMarkup} = require("react-dom/server");

function load(path, mocks = {}, env = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  vm.runInNewContext(code, {exports, process:{env}, require:name=> name in mocks ? mocks[name] : require(name)});
  return exports;
}
const view = load("lib/integrations/huckleberry-view.ts");
const fixture = {
  source:"huckleberry", childId:"fixture-private-id",
  sleep:{prefs:{lastSleep:{start:1791676800, duration:5400}}, timer:{active:true,paused:true,timerStartTime:1791676800000}},
  nursing:{prefs:{lastBottle:{start:1791676800,bottleAmount:120,bottleUnits:"ml",bottleType:"Formula"},lastNursing:{start:1791676800,leftDuration:300,rightDuration:420}},timer:{active:true,paused:false,feedStartTime:1791676800}},
  growth:{start:1791676800,weight:4.2,weightUnits:"kg",height:55,heightUnits:"cm",head:37,headUnits:"hcm"},
  history:{feedAvailable:true,diaperAvailable:true,feed:[
    {mode:"bottle",start:1791676800,amount:120,units:"ml",bottleType:"Formula"},
    {mode:"bottle",start:1791759600,amount:2,units:"oz",bottleType:"Breast Milk"},
    {mode:"breast",start:1791761000}
  ],diaper:[
    {mode:"pee",start:1791756000},
    {mode:"poo",start:1791738000},
    {mode:"both",start:1791761400}
  ]},
};
const fixedNow = new Date((1791676800 + 24 * 60 * 60) * 1000);
test("maps API seconds, sleep timer milliseconds, side durations and metric units", () => {
  const data = view.normalizeHuckleberry(fixture);
  assert.equal(data.sleep.duration,"1h 30m");
  assert.equal(data.sleep.startedAt,data.sleep.timer.startedAt);
  assert.equal(data.sleep.timer.state,"Paused");
  assert.equal(data.nursing.duration,"12 min");
  assert.equal(data.nursing.timer.startedAt,data.nursing.startedAt);
  assert.equal(data.growth.weight,"4.2 kg");
  assert.equal(data.growth.height,"55 cm");
  assert.equal(data.growth.head,"37 cm");
});
test("bottle feeds preserve units and do not substitute defaults for missing records", () => {
  const bottle = view.normalizeHuckleberry(fixture).bottle;
  assert.equal(bottle.amount,"120 mL");
  assert.equal(bottle.type,"Formula");
  assert.equal(bottle.recordedAt,view.normalizeHuckleberry(fixture).nursing.startedAt);
  const normalize = lastBottle => view.normalizeHuckleberry({nursing:{prefs:{lastBottle}}}).bottle;
  assert.equal(normalize({bottleAmount:4.5,bottleUnits:"oz"}).amount,"4.5 oz");
  assert.equal(normalize({bottleAmount:0,bottleUnits:"ml"}).amount,"0 mL");
  for(const bottle of [{}, {bottleAmount:-1,bottleUnits:"ml"}, {bottleAmount:"120",bottleUnits:"ml"},
    {bottleAmount:120,bottleUnits:"unknown"}, {bottleAmount:120,bottleUnits:"__proto__"}]) {
    assert.equal(normalize(bottle).amount,null);
  }
  const defaults = view.normalizeHuckleberry({nursing:{prefs:{bottleAmount:120,bottleUnits:"ml",bottleType:"Formula"}}}).bottle;
  assert.equal(defaults.recordedAt,null);
  assert.equal(defaults.amount,null);
  assert.equal(defaults.type,null);
});
test("executive dashboard metrics use event history, projection math and stale diaper windows", () => {
  const data = view.normalizeHuckleberry(fixture, fixedNow);
  assert.equal(data.executive.weight.actual,"4.2 kg");
  assert.equal(data.executive.weight.projected,"9.33 lb");
  assert.equal(data.executive.milk.targetOz,"18.7 oz");
  assert.equal(data.executive.milk.targetMl,"552 mL");
  assert.equal(data.executive.milk.actualMl,"179 mL");
  assert.equal(data.executive.milk.bottleCount,2);
  assert.equal(data.executive.milk.percent,"32%");
  assert.equal(data.executive.diaper.pee.state,"fresh");
  assert.equal(data.executive.diaper.poop.state,"fresh");
  const stale = view.normalizeHuckleberry({...fixture, history:{...fixture.history, diaper:[{mode:"pee",start:1791676800},{mode:"poo",start:1791673200}]}}, fixedNow);
  assert.equal(stale.executive.diaper.pee.state,"stale");
  assert.equal(stale.executive.diaper.poop.state,"stale");
});
test("diaper flags use independent rolling 24-hour cutoffs and flag empty available history", () => {
  const nowSeconds = fixedNow.getTime() / 1000;
  const normalize = diaper => view.normalizeHuckleberry({...fixture,
    history:{...fixture.history,diaper}}, fixedNow).executive.diaper;
  const beforeCutoff = normalize([{mode:"pee",start:nowSeconds - 86400 + 1},
    {mode:"poo",start:nowSeconds - 86400}]);
  assert.equal(beforeCutoff.pee.state,"fresh");
  assert.equal(beforeCutoff.poop.state,"stale");
  const both = normalize([{mode:"both",start:nowSeconds - 12 * 3600}]);
  assert.equal(both.pee.state,"fresh");
  assert.equal(both.poop.state,"fresh");
  const empty = normalize([]);
  assert.equal(empty.pee.state,"stale");
  assert.equal(empty.poop.state,"stale");
  assert.equal(empty.pee.recordedAt,null);
});
test("missing event history is reported as unavailable instead of guessed from summaries", () => {
  const data = view.normalizeHuckleberry({...fixture, history:{feed:[],diaper:[]}}, fixedNow);
  assert.equal(data.executive.milk.historyAvailable,false);
  assert.equal(data.executive.milk.actualMl,null);
  assert.equal(data.executive.diaper.pee.state,"unknown");
});
test("missing, invalid and partial records remain missing instead of invented zero totals", () => {
  for (const payload of [null,{}, {sleep:null,nursing:null,growth:null}]) {
    const data = view.normalizeHuckleberry(payload);
    assert.equal(data.sleep.duration,null);
    assert.equal(data.sleep.startedAt,null);
    assert.equal(data.growth.weight,null);
    assert.equal(data.nursing.timer.state,"Unavailable");
  }
  const data = view.normalizeHuckleberry({sleep:{prefs:{lastSleep:{start:-1,duration:"100"}}},
    nursing:{prefs:{lastNursing:{leftDuration:300}}},growth:{weight:NaN,weightUnits:"kg",height:55,heightUnits:"unknown"}});
  assert.equal(data.sleep.startedAt,null);
  assert.equal(data.sleep.duration,null);
  assert.equal(data.nursing.duration,null);
  assert.equal(data.growth.weight,null);
  assert.equal(data.growth.height,null);
});
test("API imperial unit labels and zero-duration sessions are handled without guessing", () => {
  const data = view.normalizeHuckleberry({growth:{weight:9.5,weightUnits:"lbs.oz",height:22,heightUnits:"ft.in",head:14,headUnits:"hin"},sleep:{prefs:{lastSleep:{duration:0}}}});
  assert.equal(data.growth.weight,"9.5 lb");
  assert.equal(data.growth.height,"22 in");
  assert.equal(data.growth.head,"14 in");
  assert.equal(data.sleep.duration,"0 sec");
});

function reader({authorized=true,rows=[],fail=false,configured=true}={}) {
  let queries=0;
  const module=load("lib/integrations/huckleberry.ts", {
    "server-only":{}, "../auth/authorization":{getAuthorizedFamilyUser:async()=>authorized ? {email:"fixture@example.invalid"} : null},
    "./huckleberry-view":view,
    "@neondatabase/serverless":{neon:()=>async()=>{queries++;if(fail)throw new Error("fixture database error");return rows;}},
  }, configured ? {DATABASE_URL:"postgresql://fixture.invalid/test"} : {});
  return {module,queries:()=>queries};
}
test("unauthorized readers cannot query private snapshots", async () => {
  const {module,queries}=reader({authorized:false});
  await assert.rejects(module.getHuckleberryDashboard(),/authorization required/);
  await assert.rejects(module.getHuckleberryStatus(),/authorization required/);
  assert.equal(queries(),0);
});
test("storage distinguishes empty, missing configuration and query failures", async () => {
  assert.equal((await reader().module.getHuckleberryDashboard()).state,"empty");
  assert.equal((await reader({configured:false}).module.getHuckleberryDashboard()).state,"unavailable");
  assert.equal((await reader({fail:true}).module.getHuckleberryDashboard()).state,"unavailable");
});
test("storage returns normalized data and database timestamp, with stale status", async () => {
  const result=await reader({rows:[{synced_at:"2020-01-01T00:00:00Z",payload:fixture}]}).module.getHuckleberryDashboard();
  assert.equal(result.state,"ready");
  assert.equal(result.stale,true);
  assert.equal(result.syncedAt,"2020-01-01T00:00:00.000Z");
  assert.equal(result.data.sleep.duration,"1h 30m");
  assert.equal(result.data.executive.milk.historyAvailable,true);
  assert.equal(JSON.stringify(result).includes("fixture-private-id"),false);
});
const Dashboard=load("app/components/huckleberry-dashboard.tsx",{"../../lib/integrations/huckleberry-view":view}).default;
test("care lanes keep over-target intake visible while bounding visual meters",()=>{
  const data=view.normalizeHuckleberry({...fixture,history:{...fixture.history,
    feed:[{mode:"bottle",start:fixedNow.getTime()/1000 - 60,amount:1200,units:"ml"}]}},fixedNow);
  assert.ok(data.executive.milk.percentValue > 100);
  const markup=renderToStaticMarkup(React.createElement(Dashboard,{snapshot:{state:"ready",syncedAt:fixedNow.toISOString(),stale:false,data}}));
  assert.ok(markup.includes(`${data.executive.milk.percent} of tracking target`));
  assert.ok(markup.includes('width:100%'));
  assert.ok(markup.includes('Above tracking target'));
});
test("dashboard renders saved data and timestamp without sample totals or child IDs",()=>{
  const markup=renderToStaticMarkup(React.createElement(Dashboard,{snapshot:{state:"ready",syncedAt:"2026-10-11T14:00:00Z",stale:false,data:view.normalizeHuckleberry(fixture, fixedNow)}}));
  for(const text of ["179 mL","32%","552 mL","Projected weight","Logged within 24 hours","Breast Milk","4.2 kg","Last successful sync"])assert.ok(markup.includes(text));
  for(const text of ["510","15h 10m","Sample data","fixture-private-id","Nursing","Timer at last sync"])assert.ok(!markup.includes(text));
});
test("dashboard renders missing measurements, empty storage, outage and stale warnings",()=>{
  const render=snapshot=>renderToStaticMarkup(React.createElement(Dashboard,{snapshot}));
  assert.match(render({state:"empty"}),/Waiting for the first sync/);
  assert.match(render({state:"unavailable"}),/Care data unavailable/);
  const html=render({state:"ready",syncedAt:"2020-01-01T00:00:00Z",stale:true,data:view.normalizeHuckleberry(null)});
  assert.match(html,/Bottle history is unavailable/);
  assert.doesNotMatch(html,/Nursing|nursing record|Timer at last sync/);
  assert.match(html,/No bottle summary available/);
  assert.match(html,/Not recorded/);
  assert.match(html,/over an hour old/);
});
test("a bottle feed with no volume retains its recorded time and milk type",()=>{
  const data = view.normalizeHuckleberry({nursing:{prefs:{lastBottle:{start:1791676800,bottleUnits:"ml",bottleType:"Breast Milk"}}}});
  const html = renderToStaticMarkup(React.createElement(Dashboard,{snapshot:{state:"ready",syncedAt:"2026-10-11T14:00:00Z",stale:false,data}}));
  assert.match(html,/Amount not recorded/);
  assert.match(html,/Breast Milk/);
  assert.match(html,/Last summary bottle feed/);
});
test("page redirects unauthenticated and unapproved users before reading data",async()=>{
  for(const [session,approved,target] of [[null,false,"/sign-in"],[{user:{email:"fixture@example.invalid"}},false,"/unauthorized"]]){
    let reads=0;
    const page=load("app/page.tsx",{
      "./components/huckleberry-dashboard":{default:Dashboard},
      "./components/snapshot-refresh":{default:()=>null},
      "next/navigation":{redirect:path=>{throw new Error(path);}},
      "../lib/auth/server":{auth:{getSession:async()=>({data:session})}},
      "../lib/auth/authorization":{getAuthorizedFamilyUser:async()=>approved},
      "../lib/integrations/huckleberry":{getHuckleberryDashboard:async()=>{reads++;return {state:"empty"};}},
    });
    await assert.rejects(page.default(),new RegExp(target));
    assert.equal(reads,0);
  }
});
