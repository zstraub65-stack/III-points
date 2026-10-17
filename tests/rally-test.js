/* A rally is crew-level: one place and time everyone sees without digging. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const WORKER = path.join(ROOT, "worker-entry.js");
const src = fs.readFileSync(WORKER, "utf8").replace(/export default/, "globalThis.__worker =");
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
    async list({ prefix, limit }) { return { keys: [...store.keys()].filter(k => k.startsWith(prefix)).slice(0, limit).map(name => ({ name })) }; }
  };
}
const call = (kv, method, board, body) =>
  worker.fetch(new Request("https://x/picks?board=" + board, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }), { PICKS: kv });
const get = async kv => (await (await call(kv, "GET", "miamiii")).json());

const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};

(async () => {
  const kv = makeKV();
  const WHEN = Date.now() + 30 * 60000;
  await call(kv, "POST", "miamiii", { person: "zack", name: "Zack", sets: ["sat|VTSS"] });
  await call(kv, "POST", "miamiii", { person: "v", name: "Vrushi", sets: [] });

  console.log("=== no rally to start");
  ck("none set", (await get(kv)).rally, null);

  console.log("\n=== setting one");
  const r = await (await call(kv, "POST", "miamiii", { person: "zack", rally: { where: "Entrance", when: WHEN, note: "by the tiger", byName: "Zack" } })).json();
  ck("accepted", r.ok, true);
  let board = await get(kv);
  ck("everyone reads the same one", [board.rally.where, board.rally.when, board.rally.note], ["Entrance", WHEN, "by the tiger"]);
  ck("records who set it", [board.rally.by, board.rally.byName], ["zack", "Zack"]);

  console.log("\n=== it does not disturb anything else");
  ck("picks untouched", board.people.find(p => p.person === "zack").sets, ["sat|VTSS"]);
  ck("names untouched", board.people.find(p => p.person === "v").name, "Vrushi");

  console.log("\n=== saying you are in");
  const t = board.rally.t;
  await call(kv, "POST", "miamiii", { person: "v", ack: t });
  board = await get(kv);
  ck("acknowledgement stored", board.people.find(p => p.person === "v").ack, t);
  ck("others unaffected", board.people.find(p => p.person === "zack").ack, 0);
  await call(kv, "POST", "miamiii", { person: "v", sets: ["sat|VTSS"] });
  ck("a later pick does not clear it", (await get(kv)).people.find(p => p.person === "v").ack, t);

  console.log("\n=== replacing it");
  const WHEN2 = Date.now() + 70 * 60000;
  await call(kv, "POST", "miamiii", { person: "v", rally: { where: "Food trucks", when: WHEN2, byName: "Vrushi" } });
  board = await get(kv);
  ck("one rally at a time", board.rally.where, "Food trucks");
  ck("with a new stamp", board.rally.t !== t, true);
  ck("the old acknowledgement no longer matches",
    board.people.find(p => p.person === "v").ack === board.rally.t, false);

  console.log("\n=== calling it off");
  await call(kv, "POST", "miamiii", { person: "zack", rally: null });
  ck("cleared", (await get(kv)).rally, null);

  console.log("\n=== input handling");
  await call(kv, "POST", "miamiii", { person: "zack", rally: { where: "<b>x</b>".repeat(20), when: WHEN, note: "ok", byName: "Zack" } });
  board = await get(kv);
  ck("markup stripped", /[<>]/.test(board.rally.where), false);
  ck("length capped", board.rally.where.length <= 40, true);
  ck("a rally with neither field clears instead of saving junk",
    (await (await call(kv, "POST", "miamiii", { person: "zack", rally: {} })).json()).rally, null);

  console.log("\n=== crews stay separate");
  await call(kv, "POST", "miamiii", { person: "zack", rally: { where: "Entrance", when: WHEN, byName: "Zack" } });
  await call(kv, "POST", "drum-boston", { person: "b", name: "Bethany", sets: [] });
  ck("another crew has its own", (await (await call(kv, "GET", "drum-boston")).json()).rally, null);

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  if (fail.length) process.exitCode = 1;
})();
