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
  nursing:{prefs:{lastNursing:{start:1791676800,leftDuration:300,rightDuration:420}},timer:{active:true,paused:false,feedStartTime:1791676800}},
  growth:{start:1791676800,weight:4.2,weightUnits:"kg",height:55,heightUnits:"cm",head:37,headUnits:"hcm"},
};
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
  assert.equal(JSON.stringify(result).includes("fixture-private-id"),false);
});
const Dashboard=load("app/components/huckleberry-dashboard.tsx",{"../../lib/integrations/huckleberry-view":view}).default;
test("dashboard renders saved data and timestamp without sample totals or child IDs",()=>{
  const markup=renderToStaticMarkup(React.createElement(Dashboard,{snapshot:{state:"ready",syncedAt:"2026-10-11T14:00:00Z",stale:false,data:view.normalizeHuckleberry(fixture)}}));
  for(const text of ["1h 30m","12 min","4.2 kg","Last successful sync","Timer at last sync"])assert.ok(markup.includes(text));
  for(const text of ["510","15h 10m","Sample data","fixture-private-id"])assert.ok(!markup.includes(text));
});
test("dashboard renders missing measurements, empty storage, outage and stale warnings",()=>{
  const render=snapshot=>renderToStaticMarkup(React.createElement(Dashboard,{snapshot}));
  assert.match(render({state:"empty"}),/Waiting for the first sync/);
  assert.match(render({state:"unavailable"}),/Care data unavailable/);
  const html=render({state:"ready",syncedAt:"2020-01-01T00:00:00Z",stale:true,data:view.normalizeHuckleberry(null)});
  assert.match(html,/No completed sleep record available/);
  assert.match(html,/No completed nursing record available/);
  assert.match(html,/Not recorded/);
  assert.match(html,/over an hour old/);
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
