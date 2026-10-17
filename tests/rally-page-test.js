/* The point of a rally is that nobody has to go looking for it. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const DOORS_SAT = Date.UTC(2026, 9, 17, 20, 0, 0);
const sat = (h, m) => DOORS_SAT + ((h - 16) * 60 + m) * 60000;
let CLOCK = sat(22, 0);                       // 10pm Saturday

let board = { rally: null, people: [
  { person: "zack", name: "Zack", sets: [], at: null, ack: 0 },
  { person: "v", name: "Vrushi", sets: [], at: null, ack: 0 }
] };
const posts = [];
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
    w.fetch = (u, o) => {
      if (o && o.method === "POST") {
        const b = JSON.parse(o.body); posts.push(b);
        if ("rally" in b) {
          board.rally = (b.rally && (b.rally.where || b.rally.when))
            ? { where: b.rally.where, when: b.rally.when, note: b.rally.note || "", by: b.person, byName: b.rally.byName || "", t: CLOCK }
            : null;
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, rally: board.rally }) });
        }
        if ("ack" in b) { const m = board.people.find(p => p.person === b.person); if (m) m.ack = b.ack; }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      const bn = decodeURIComponent(String(u).split("board=")[1] || "");
      return Promise.resolve({ ok: true, json: () => Promise.resolve(
        bn === "miamiii" ? { board: bn, people: board.people, rally: board.rally } : { board: bn, people: [], rally: null }) });
    };
    try {
      w.localStorage.clear();
      w.localStorage.setItem("iiip26-pid", "zack");
      w.localStorage.setItem("iiip26-name", "Zack");
      w.localStorage.setItem("iiip26-welcomed", "1");
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
const bar = () => d.getElementById("rallyBar");

(async () => {
  await wait(1400);
  console.log("=== nothing set yet");
  ck("no bar in the way", bar().hidden, true);
  d.getElementById("rallyBtn").click(); await wait(80);
  ck("panel explains it", /Everyone on miamiii sees it/.test(d.getElementById("rallyPanel").textContent), true);
  ck("offers somewhere to meet", d.querySelectorAll("#rallyWhere button").length > 10, true);
  ck("and quick times", d.querySelectorAll("#rallyWhen button").length, 5);

  console.log("\n=== setting one in two taps and a time");
  d.querySelector('#rallyWhere button[data-where="Entrance"]').click();
  ck("where filled by tapping", d.getElementById("rWhere").value, "Entrance");
  d.querySelector('#rallyWhen button[data-mins="30"]').click();
  ck("when filled by tapping", d.getElementById("rWhen").value, "22:30");
  d.getElementById("rNote").value = "by the tiger";
  d.getElementById("rallySet").click();
  await wait(250);
  const sent = posts.find(p => p.rally);
  ck("sent to the crew", [sent.rally.where, sent.rally.note], ["Entrance", "by the tiger"]);
  ck("time is tonight 10:30pm", new w.Date(sent.rally.when).getHours(), 22);

  console.log("\n=== and now it is on every screen");
  ck("bar showing", bar().hidden, false);
  ck("says where", /Entrance/.test(bar().textContent), true);
  ck("and how long", /in 30 min/.test(bar().textContent), true);
  ck("carries the note", /by the tiger/.test(bar().textContent), true);
  ck("nobody in yet", /0 in/.test(bar().textContent), true);

  console.log("\n=== saying you are in");
  d.getElementById("rallyIn").click();
  await wait(250);
  ck("counted", /1 in/.test(bar().textContent), true);
  ck("button reflects it", /You are in/.test(d.getElementById("rallyIn").textContent), true);
  ck("named in the panel", /Zack|You/.test(d.getElementById("rallyWho").textContent), true);

  console.log("\n=== it gets louder as the time comes");
  CLOCK = sat(22, 25); w.eval("draw()"); await wait(60);
  ck("five minutes out, urgent styling", d.querySelector(".rallystrip").classList.contains("soonish"), true);
  ck("counts down", /in 5 min/.test(bar().textContent), true);

  console.log("\n=== and gets out of the way afterwards");
  CLOCK = sat(23, 20); w.eval("draw()"); await wait(60);
  ck("50 minutes past, bar gone", bar().hidden, true);
  CLOCK = sat(22, 25); w.eval("draw()"); await wait(60);

  console.log("\n=== a rally from someone else, read-only until you act");
  board.rally = { where: "Food trucks", when: sat(23, 0), note: "", by: "v", byName: "Vrushi", t: CLOCK };
  board.people.find(p => p.person === "zack").ack = 0;
  w.eval("pull()"); await wait(250);
  ck("replaces the old one", /Food trucks/.test(bar().textContent), true);
  d.getElementById("rallyBtn").click(); await wait(60);   // close
  d.getElementById("rallyBtn").click(); await wait(80);   // reopen fresh
  ck("says who set it", /Vrushi/.test(d.getElementById("rallyPanel").textContent), true);
  ck("your old yes does not carry over", /You are in/.test(d.getElementById("rallyIn").textContent), false);

  console.log("\n=== calling it off");
  d.getElementById("rallyClear").click();
  await wait(250);
  ck("bar gone", bar().hidden, true);
  ck("cleared on the crew", board.rally, null);

  console.log("\n=== it never touches picks");
  ck("no rally post carried sets", posts.filter(p => p.rally !== undefined && "sets" in p).length, 0);
  ck("no ack post carried sets", posts.filter(p => p.ack !== undefined && "sets" in p).length, 0);

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  setTimeout(() => dom.window.close(), 100);
  if (fail.length) process.exitCode = 1;
})();
