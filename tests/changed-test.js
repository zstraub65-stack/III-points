/* The 16 Oct set-time update: the data must match the new posters, every key
   must survive so nobody loses a pick, and the moves must be visible. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const DOORS_SAT = Date.UTC(2026, 9, 17, 20, 0, 0);
const sat = (h, m) => DOORS_SAT + ((h - 16) * 60 + m) * 60000;
let CLOCK = sat(26, 0);                       // 2:00am Saturday night

const people = [{ person: "zack", name: "Zack", sets: ["sat|Charlotte de Witte", "sat|999999999", "sat|VTSS"], at: null }];
const vc = new VirtualConsole(); vc.sendTo(console, { omitJSDOMErrors: true });
const dom = new JSDOM(html, {
  virtualConsole: vc, runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/#board=miamiii",
  beforeParse(w) {
    const R = w.Date;
    w.Date = class extends R {
      constructor(...a) { if (!a.length) super(CLOCK); else super(...a); }
      static now() { return CLOCK; }
      static UTC(...a) { return R.UTC(...a); }
    };
    w.fetch = (u, o) => o && o.method === "POST"
      ? Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      : Promise.resolve({ ok: true, json: () => Promise.resolve({ board: "miamiii", people }) });
    try {
      w.localStorage.clear();
      w.localStorage.setItem("iiip26-pid", "zack");
      w.localStorage.setItem("iiip26-welcomed", "1");
      w.localStorage.setItem("iiip26-mine", JSON.stringify(people[0].sets));
    } catch (e) {}
  }
});
const w = dom.window, d = w.document;
const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const row = (day, name) => w.eval("(DATA['" + day + "'].find(r=>r[1]===" + JSON.stringify(name) + ")||null)");

(async () => {
  await wait(1400);

  console.log("=== the swap matches the new poster");
  ck("Charlotte de Witte moved earlier", row("sat", "Charlotte de Witte").slice(2, 4), ["1:30am", "2:45am"]);
  ck("999999999 now closes RC95", row("sat", "999999999").slice(2, 4), ["2:45am", "4:00am"]);
  ck("both still on RC95", [row("sat", "Charlotte de Witte")[0], row("sat", "999999999")[0]], ["RC95", "RC95"]);
  ck("VTSS untouched", row("sat", "VTSS").slice(2, 4), ["12:30am", "1:30am"]);
  ck("no gap or overlap after VTSS", row("sat", "VTSS")[3], row("sat", "Charlotte de Witte")[2]);
  ck("Saraga off the Friday B2B", row("fri", "Miguelle & Tons")[4], undefined);
  ck("but its slot is unchanged", row("fri", "Miguelle & Tons").slice(2, 4), ["9:30pm", "11:00pm"]);

  console.log("\n=== nobody loses a pick");
  // the key is the name, so every existing key must still resolve to a set
  const keys = ["sat|Charlotte de Witte", "sat|999999999", "sat|VTSS", "fri|Miguelle & Tons"];
  keys.forEach(key => ck("key still resolves: " + key, !!w.eval("rowFor(" + JSON.stringify(key) + ")"), true));
  ck("my picks all still land on a set", w.eval("[...mine].every(x=>!!rowFor(x))"), true);
  ck("whole schedule still 231 sets", w.eval("DATA.fri.length+DATA.sat.length"), 231);
  ck("no duplicate names within a day",
    w.eval("['fri','sat'].every(d=>new Set(DATA[d].map(r=>r[1])).size===DATA[d].length)"), true);

  console.log("\n=== the change is visible");
  d.querySelector('#dayseg button[data-day="sat"]').click();
  await wait(150);
  const blk = d.querySelector('.blk[data-n="Charlotte de Witte"]');
  ck("grid block is flagged", blk.classList.contains("moved"), true);
  ck("with a badge on it", !!blk.querySelector(".movedtag"), true);
  ck("999999999 flagged too", d.querySelector('.blk[data-n="999999999"]').classList.contains("moved"), true);
  ck("an unchanged set is not flagged", d.querySelector('.blk[data-n="VTSS"]').classList.contains("moved"), false);

  blk.click();
  await wait(120);
  const sheet = d.getElementById("sheet");
  ck("sheet explains the move", /Changed 16 Oct/.test(sheet.textContent), true);
  ck("and says what it was", /2:45am/.test(sheet.textContent) && /1:30am/.test(sheet.textContent), true);
  d.querySelector("#sheet button[data-close]").click();
  await wait(80);

  ck("running order flags it", /time changed/.test(d.getElementById("run").textContent), true);

  console.log("\n=== an unchanged set says nothing about changes");
  d.querySelector('.blk[data-n="VTSS"]').click();
  await wait(120);
  ck("no stray notice", /Changed 16 Oct/.test(d.getElementById("sheet").textContent), false);

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  setTimeout(() => dom.window.close(), 100);
  if (fail.length) process.exitCode = 1;
})();
