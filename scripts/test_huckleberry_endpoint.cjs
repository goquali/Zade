const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest } = require("next/server");
const { unstable_doesMiddlewareMatch: doesProxyMatch } = require("next/experimental/testing/server");

function loadRoute(env, rows = []) {
  let queries = 0;
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync("app/api/integrations/huckleberry/route.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText;
  vm.runInNewContext(code, {
    exports, Buffer, process: { env },
    require: (name) => {
      if (name === "@neondatabase/serverless") return { neon: () => async () => { queries++; return rows; } };
      if (name.endsWith("huckleberry-view")) {
        const result = {};
        vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/integrations/huckleberry-view.ts", "utf8"),
          {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:result});
        return result;
      }
      return require(name);
    },
  });
  return { route: exports, queries: () => queries };
}

const token = "fixture-sync-token-with-at-least-32-characters";
const env = { ZADE_SYNC_TOKEN: token, DATABASE_URL: "postgresql://fixture.invalid/test" };
function request(method, authorization, body) {
  return new NextRequest("https://example.invalid/api/integrations/huckleberry", {
    method, headers: authorization ? { authorization } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("only the exact machine endpoint skips Neon; dashboard and adjacent APIs remain protected", () => {
  const source = fs.readFileSync("proxy.ts", "utf8");
  const config = { matcher: [source.match(/matcher: \["([^"]+)"\]/)[1]] };
  for (const path of ["/api/integrations/huckleberry", "/api/integrations/huckleberry/"]) {
    assert.equal(doesProxyMatch({ config, nextConfig: {}, url: path }), false);
  }
  for (const path of ["/", "/api/integrations/other", "/api/integrations/huckleberry/extra",
                      "/api/integrations/huckleberry-other", "/api/auth/callback/google"]) {
    assert.equal(doesProxyMatch({ config, nextConfig: {}, url: path }), true);
  }
});

test("GET and POST reject missing/wrong tokens before any database query", async () => {
  const { route, queries } = loadRoute(env);
  for (const method of ["GET", "POST"]) {
    for (const auth of [undefined, "Bearer incorrect", "Bearer " + token + "x"]) {
      const response = await route[method](request(method, auth));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("x-zade-auth-layer"), "sync-token");
    }
  }
  assert.equal(queries(), 0);
});

test("authenticated GET proves agreement without returning secrets or querying data", async () => {
  const { route, queries } = loadRoute(env);
  const response = await route.GET(request("GET", "Bearer " + token));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(queries(), 0);
});

test("missing configuration fails closed", async () => {
  for (const config of [{}, { ...env, ZADE_SYNC_TOKEN: "short" }, { ZADE_SYNC_TOKEN: token }]) {
    const { route, queries } = loadRoute(config);
    assert.equal((await route.GET(request("GET", "Bearer " + token))).status, 503);
    assert.equal(queries(), 0);
  }
});

test("storage verification is authenticated, read-only and never returns record values", async () => {
  const {route,queries} = loadRoute(env,[{synced_at:"2026-10-11T14:00:00Z", source:"huckleberry",
    sleep_type:"object", nursing_type:"object", growth_type:"object", history_type:"object",
    payload:{childId:"private-fixture-id",sleep:{prefs:{lastSleep:{start:1791676800,duration:5400}}},
      growth:{weight:4.123,weightUnits:"kg"},history:{feedAvailable:true,diaperAvailable:true,feed:[],diaper:[]}}}]);
  const req = authorization => new NextRequest("https://example.invalid/api/integrations/huckleberry?verify=storage",{headers:authorization?{authorization}:{}});
  assert.equal((await route.GET(req())).status,401);
  assert.equal(queries(),0);
  const response=await route.GET(req("Bearer "+token));
  const body=await response.json();
  assert.equal(body.stored,true);
  assert.equal(body.sourceVerified,true);
  assert.equal(body.displayAvailable.sleep,true);
  assert.equal(body.displayAvailable.nursing,false);
  assert.equal(body.displayAvailable.weight,true);
  assert.equal(body.displayAvailable.bottleHistory,true);
  assert.equal(body.displayAvailable.diaperHistory,true);
  assert.equal(JSON.stringify(body).includes("4.123"),false);
  assert.equal(JSON.stringify(body).includes("private-fixture-id"),false);
  assert.equal(queries(),1);
  assert.equal(response.headers.get("cache-control"),"no-store");
});

test("valid snapshots support absent Huckleberry documents; malformed snapshots do not write", async () => {
  const snapshot = { source: "huckleberry", childId: "fixture-child",
    syncedAt: "2026-10-09T00:00:00Z", sleep: null, nursing: null, growth: null,
    history:{feedAvailable:true,diaperAvailable:true,feed:[],diaper:[]} };
  const { route, queries } = loadRoute(env);
  for (const body of [{ ...snapshot, syncedAt: "invalid" }, { ...snapshot, childId: "" },
                      { ...snapshot, sleep: [] }, { ...snapshot, history:{feed:{}} }, { source: "huckleberry" }]) {
    assert.equal((await route.POST(request("POST", "Bearer " + token, body))).status, 400);
  }
  assert.equal(queries(), 0);
  assert.equal((await route.POST(request("POST", "Bearer " + token, snapshot))).status, 200);
  assert.equal(queries(), 2);
});
