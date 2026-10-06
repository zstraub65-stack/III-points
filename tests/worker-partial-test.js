/* Check-ins must not clobber picks, and picks must not clobber check-ins. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const src = fs.readFileSync(WORKER, "utf8").replace(/export default/, "globalThis.__worker =");
const vm = require("vm");
const ctx = { Response, Request, URL, JSON, Date, Object, Array, String, Number, console };
ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const worker = ctx.__worker;

function makeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ops = { get: 0, put: 0, list: 0 };
  return { ops,
    async get(k, t) { ops.get++; const v = store.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); },
    async put(k, v) { ops.put++; store.set(k, v); },
    async delete(k) { store.delete(k); },
    async list({ prefix, limit }) { ops.list++; return { keys: [...store.keys()].filter(k => k.startsWith(prefix)).slice(0, limit).map(name => ({ name })) }; } };
}
const call = (kv, m, b, body) => worker.fetch(new Request("https://x/picks?board=" + b, {
  method: m, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), { PICKS: kv });
const get = async (kv, b) => (await (await call(kv, "GET", b)).json()).people;

(async () => {
  const kv = makeKV();

  await call(kv, "POST", "t", { person: "a", name: "Zack", sets: ["fri|Hamdi", "sat|KETTAMA"] });
  let p = (await get(kv, "t"))[0];
  console.log("1. picks saved:", p.sets.length, "sets | at:", p.at);

  // check in WITHOUT sending sets
  await call(kv, "POST", "t", { person: "a", at: { s: "fri|Hamdi", t: 1000, fire: true } });
  p = (await get(kv, "t"))[0];
  console.log("2. after check-in -> sets still there:", p.sets.length === 2,
    "| name kept:", p.name === "Zack", "| at:", JSON.stringify(p.at));

  // change picks WITHOUT sending at
  await call(kv, "POST", "t", { person: "a", name: "Zack", sets: ["fri|Hamdi", "sat|KETTAMA", "sat|VTSS"] });
  p = (await get(kv, "t"))[0];
  console.log("3. after editing picks -> check-in survived:", p.at && p.at.s === "fri|Hamdi",
    "| sets now:", p.sets.length);

  // move to another set
  await call(kv, "POST", "t", { person: "a", at: { s: "fri|Levity", t: 2000 } });
  p = (await get(kv, "t"))[0];
  console.log("4. moved to:", p.at.s, "| fire reset:", p.at.fire === false);

  // check out
  await call(kv, "POST", "t", { person: "a", at: null });
  p = (await get(kv, "t"))[0];
  console.log("5. checked out -> at:", p.at, "| sets intact:", p.sets.length === 3);

  // junk check-in is rejected, not stored
  await call(kv, "POST", "t", { person: "a", at: { s: 12345 } });
  p = (await get(kv, "t"))[0];
  console.log("6. junk check-in stored as:", p.at);

  // two people check in independently
  await call(kv, "POST", "t", { person: "b", name: "Vrushi", sets: ["fri|Parcels"] });
  await call(kv, "POST", "t", { person: "a", at: { s: "sat|VTSS", t: 3000 } });
  await call(kv, "POST", "t", { person: "b", at: { s: "sat|VTSS", t: 3100, fire: true } });
  const all = await get(kv, "t");
  console.log("7. both at VTSS:", all.filter(x => x.at && x.at.s === "sat|VTSS").length === 2,
    "| b still has picks:", all.find(x => x.person === "b").sets.length === 1);

  /* A cold board costs exactly one list(), the legacy-migration probe, and
     never another. The free tier allows 1,000 a day, so the invariant is
     per-board not per-read. worker-test.js proves steady-state reads cost none. */
  console.log("\nops:", JSON.stringify(kv.ops));
  console.log("at most one list for the whole run:", kv.ops.list <= 1 ? "ok" : "FAIL (" + kv.ops.list + ")");
})();
