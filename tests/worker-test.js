/* Run the real worker against a fake KV that counts operations, so the quota
   claim is measured rather than assumed. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const path = WORKER;
const src = fs.readFileSync(path, "utf8").replace(/export default/, "globalThis.__worker =");
const vm = require("vm");
const ctx = { Response, Request, URL, JSON, Date, Object, Array, String, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const worker = ctx.__worker;

function makeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ops = { get: 0, put: 0, list: 0, delete: 0 };
  return {
    ops, store,
    async get(k, t) { ops.get++; const v = store.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); },
    async put(k, v) { ops.put++; store.set(k, v); },
    async delete(k) { ops.delete++; store.delete(k); },
    async list({ prefix, limit }) {
      ops.list++;
      return { keys: [...store.keys()].filter(k => k.startsWith(prefix)).slice(0, limit).map(name => ({ name })) };
    }
  };
}
const call = (kv, method, board, body) =>
  worker.fetch(new Request("https://x/picks?board=" + board, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }), { PICKS: kv });

(async () => {
  // --- migration from the live per-person layout
  const legacy = {
    "b:miamiii:zack": JSON.stringify({ person: "zack", name: "Zack", sets: ["fri|Hamdi"], updated: 1 }),
    "b:miamiii:winston": JSON.stringify({ person: "winston", name: "Winston", sets: ["sat|VTSS"], updated: 2 })
  };
  const kv = makeKV(legacy);
  let r = await call(kv, "GET", "miamiii");
  let j = await r.json();
  console.log("MIGRATION");
  console.log("  people carried over:", j.people.map(p => p.name).join(", "));
  console.log("  their sets survived:", JSON.stringify(j.people.map(p => p.sets)));
  console.log("  ops:", JSON.stringify(kv.ops));

  const before = { ...kv.ops };
  await call(kv, "GET", "miamiii");
  const listsAfter = kv.ops.list - before.list;
  console.log("  further reads cost extra list ops:", listsAfter, listsAfter === 0 ? "(good)" : "(BAD)");

  // --- steady state cost
  const kv2 = makeKV();
  await call(kv2, "POST", "t", { person: "a", name: "A", sets: ["fri|Hamdi"] });
  const base = { ...kv2.ops };
  for (let i = 0; i < 10; i++) await call(kv2, "GET", "t");
  const d = { get: kv2.ops.get - base.get, list: kv2.ops.list - base.list };
  console.log("\nSTEADY STATE");
  console.log("  10 reads cost:", JSON.stringify(d), d.list === 0 ? "(no list ops)" : "(BAD)");

  // --- two people writing do not clobber each other
  const kv3 = makeKV();
  await call(kv3, "POST", "t", { person: "a", name: "A", sets: ["fri|Hamdi"] });
  await call(kv3, "POST", "t", { person: "b", name: "B", sets: ["sat|VTSS"] });
  j = await (await call(kv3, "GET", "t")).json();
  console.log("\nCONCURRENT WRITERS");
  console.log("  both present:", j.people.length === 2, j.people.map(p => p.name).join(","));
  await call(kv3, "POST", "t", { person: "a", name: "A", sets: ["fri|Hamdi", "sat|KETTAMA"] });
  j = await (await call(kv3, "GET", "t")).json();
  const a = j.people.find(p => p.person === "a"), b = j.people.find(p => p.person === "b");
  console.log("  A updated:", a.sets.length === 2, "| B untouched:", b.sets[0] === "sat|VTSS");

  // --- leaving
  await call(kv3, "POST", "t", { person: "b", leave: true });
  j = await (await call(kv3, "GET", "t")).json();
  console.log("  after B leaves:", j.people.map(p => p.person).join(",") || "(empty)");

  // --- boards stay separate
  await call(kv3, "POST", "boston", { person: "c", name: "C", sets: ["sat|Underworld"] });
  const t = await (await call(kv3, "GET", "t")).json();
  const bos = await (await call(kv3, "GET", "boston")).json();
  console.log("\nISOLATION");
  console.log("  crew t:", t.people.map(p => p.person).join(",") , "| crew boston:", bos.people.map(p => p.person).join(","));

  // --- bad input
  console.log("\nINPUT HANDLING");
  console.log("  no board ->", (await (await call(kv3, "GET", "")).json()).error);
  console.log("  no person ->", (await (await call(kv3, "POST", "t", { name: "x" })).json()).error);
  const nasty = await call(kv3, "POST", "t", { person: "x", name: "<script>bad</script>", sets: ["fri|Hamdi", 42, "y".repeat(200)] });
  console.log("  dirty payload accepted:", (await nasty.json()).ok);
  j = await (await call(kv3, "GET", "t")).json();
  const x = j.people.find(p => p.person === "x");
  console.log("  name stripped to:", JSON.stringify(x.name), "| sets kept:", JSON.stringify(x.sets));
})();
