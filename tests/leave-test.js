/* The bug: leaving deleted the row, then the next write from that browser put
   it straight back. These are the cases that have to hold now. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const src = fs.readFileSync(WORKER, "utf8")
  .replace(/export default/, "globalThis.__worker =");
const vm = require("vm");
const ctx = { Response, Request, URL, JSON, Date, Object, Array, String, Number, console };
ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const worker = ctx.__worker;

function makeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(k, t) { const v = store.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
    async list({ prefix, limit }) {
      return { keys: [...store.keys()].filter(k => k.startsWith(prefix)).slice(0, limit).map(name => ({ name })) };
    }
  };
}
const call = (kv, method, board, body) =>
  worker.fetch(new Request("https://x/picks?board=" + board, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }), { PICKS: kv });
const names = async kv => (await (await call(kv, "GET", "miamiii")).json()).people.map(p => p.person);

const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};

(async () => {
  const kv = makeKV();
  await call(kv, "POST", "miamiii", { person: "zack", name: "Zack", sets: ["fri|Hamdi"] });
  await call(kv, "POST", "miamiii", { person: "cowork", name: "Dev", sets: ["fri|Levity"] });
  ck("both on the crew", await names(kv), ["zack", "cowork"]);

  console.log("\n=== the coworker leaves");
  const left = await (await call(kv, "POST", "miamiii", { person: "cowork", leave: true })).json();
  ck("leave acknowledged", [left.removed, left.left], [true, true]);
  ck("gone from the crew", await names(kv), ["zack"]);

  console.log("\n=== this is the bug: his browser writes again");
  const a = await (await call(kv, "POST", "miamiii", { person: "cowork", name: "Dev", sets: [] })).json();
  ck("picks write refused", a.blocked, true);
  ck("still gone", await names(kv), ["zack"]);

  const b = await (await call(kv, "POST", "miamiii", { person: "cowork", at: { s: "fri|Hamdi", t: Date.now() } })).json();
  ck("check-in write refused", b.blocked, true);
  ck("no ghost with 0 sets", await names(kv), ["zack"]);

  const c = await (await call(kv, "POST", "miamiii", { person: "cowork", name: "Dev" })).json();
  ck("name write refused", c.blocked, true);
  ck("still gone", await names(kv), ["zack"]);

  console.log("\n=== he decides to come back");
  await call(kv, "POST", "miamiii", { person: "cowork", rejoin: true, name: "Dev", sets: ["fri|Levity"] });
  ck("back on the crew", await names(kv), ["zack", "cowork"]);
  const back = (await (await call(kv, "GET", "miamiii")).json()).people.find(p => p.person === "cowork");
  ck("with his name", back.name, "Dev");
  ck("and his picks", back.sets.length, 1);
  await call(kv, "POST", "miamiii", { person: "cowork", name: "Dev", sets: ["fri|Levity", "sat|VTSS"] });
  const grew = (await (await call(kv, "GET", "miamiii")).json()).people.find(p => p.person === "cowork");
  ck("ordinary writes work again", grew.sets.length, 2);

  console.log("\n=== Zack removes him instead, without his help");
  const d = await (await call(kv, "POST", "miamiii", { person: "zack", remove: "cowork" })).json();
  ck("removal acknowledged", [d.removed, d.person], [true, "cowork"]);
  ck("gone", await names(kv), ["zack"]);
  const e = await (await call(kv, "POST", "miamiii", { person: "cowork", name: "Dev", sets: ["fri|Levity"] })).json();
  ck("his browser cannot undo it", e.blocked, true);
  ck("still gone", await names(kv), ["zack"]);

  console.log("\n=== the person doing the removing is unaffected");
  const zack = (await (await call(kv, "GET", "miamiii")).json()).people.find(p => p.person === "zack");
  ck("Zack keeps his picks", zack.sets.length, 1);
  await call(kv, "POST", "miamiii", { person: "zack", sets: ["fri|Hamdi", "sat|Hamdi"] });
  ck("and can still write", (await (await call(kv, "GET", "miamiii")).json())
    .people.find(p => p.person === "zack").sets.length, 2);

  console.log("\n=== edges");
  ck("removing a nobody is harmless", (await (await call(kv, "POST", "miamiii", { person: "zack", remove: "nosuch" })).json()).removed, true);
  ck("empty target rejected", (await call(kv, "POST", "miamiii", { person: "zack", remove: "!!!!" })).status, 400);
  ck("leaving a crew does not touch another", await (async () => {
    await call(kv, "POST", "boston", { person: "cowork", name: "Dev", sets: ["fri|Levity"] });
    return (await (await call(kv, "GET", "boston")).json()).people.map(p => p.person);
  })(), ["cowork"]);

  console.log("\n=== the gone list cannot grow without bound");
  const kv2 = makeKV();
  for (let i = 0; i < 140; i++) await call(kv2, "POST", "miamiii", { person: "p" + i, leave: true });
  const agg = JSON.parse(kv2.store.get("board:miamiii"));
  ck("capped at 100", Object.keys(agg.gone).length, 100);
  ck("kept the most recent", agg.gone["p139"] !== undefined, true);
  ck("dropped the oldest", agg.gone["p0"], undefined);

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
})();
