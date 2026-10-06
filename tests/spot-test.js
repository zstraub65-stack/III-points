/* Friday night, Hamdi is on. Zack checks in, picks a spot, adds a note,
   and sees where his crew is standing. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const DOORS_FRI = Date.UTC(2026, 9, 16, 20, 0, 0);
const at = (h, m) => DOORS_FRI + ((h - 16) * 60 + m) * 60000;
let CLOCK = at(23, 30);                      // 11:30pm Friday

const board = {
  people: [
    { person: "zack", name: "Zack", sets: ["fri|Hamdi"], at: { s: "fri|Hamdi", t: at(23, 20), fire: false } },
    // Vrushi is back-left with a landmark
    { person: "vru", name: "Vrushi", sets: [], at: { s: "fri|Hamdi", t: at(23, 25), fire: true, p: [0, 2], n: "by the sound booth" } },
    // five people in one cell, to check the "+N" overflow
    ...["a", "b", "c", "d", "e"].map((x, i) => ({
      person: "p" + x, name: "Pal" + i, sets: [], at: { s: "fri|Hamdi", t: at(23, 10), fire: false, p: [2, 1] }
    }))
  ]
};

const posts = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/#board=miamiii",
  beforeParse(w) {
    const RealDate = w.Date;
    w.Date = class extends RealDate {
      constructor(...a) { if (!a.length) super(CLOCK); else super(...a); }
      static now() { return CLOCK; }
      static UTC(...a) { return RealDate.UTC(...a); }
    };
    w.fetch = (u, o) => {
      const b = decodeURIComponent(String(u).split("board=")[1] || "");
      if (o && o.method === "POST") {
        const body = JSON.parse(o.body); posts.push(body);
        const me = board.people.find(x => x.person === body.person);
        if (me && "at" in body) me.at = body.at;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: b, people: b === "miamiii" ? board.people : [] }) });
    };
    try { w.localStorage.clear(); w.localStorage.setItem("iiip26-pid", "zack"); } catch (e) {}
  }
});
const w = dom.window, d = w.document;
const open = () => { d.querySelector('.blk[data-n="Hamdi"]').click(); };
const cells = () => [...d.querySelectorAll("#sheet .cell")];
/* mutate the fixture AND the page's own copy, which pull() owns */
const setMine = v => {
  board.people[0].at = v;
  w.eval("(function(){var m=people.find(function(p){return p.person==='zack'});" +
         "if(m)m.at=" + JSON.stringify(v) + ";draw()})()");
};
const fail = [];
const ck = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok ? "" : " [" + got + "]"));
};

setTimeout(() => {
  console.log("=== sheet for Hamdi, I am checked in, no spot set yet");
  open();
  ck("grid rendered", cells().length, 16);
  ck("stage label pinned at top", d.querySelector("#sheet .stagebar").textContent, "STAGE");
  ck("note field present", !!d.getElementById("spotNote"), true);
  ck("no cell marked mine yet", d.querySelectorAll("#sheet .cell.me").length, 0);

  // other people already show up in their cells
  const vruCell = cells().find(c => c.dataset.cell === "0,2");
  ck("Vrushi drawn back-left", vruCell.querySelectorAll("i.mk").length, 1);
  const packed = cells().find(c => c.dataset.cell === "2,1");
  ck("busy cell caps at 4 markers", packed.querySelectorAll("i.mk").length, 4);
  ck("busy cell shows overflow", packed.querySelector("b").textContent, "+1");

  // the chips should say where people are, in words
  const chips = d.getElementById("herenow").textContent;
  ck("chip names Vrushi's quadrant", /back half, far left/.test(chips), true);
  ck("chip carries the landmark", /by the sound booth/.test(chips), true);

  console.log("\n=== tap a cell: front-half, right");
  d.getElementById("spotNote").value = "left of the rail";
  cells().find(c => c.dataset.cell === "2,1").click();

  setTimeout(() => {
    const p = posts[posts.length - 1];
    console.log("  posted:", JSON.stringify(p.at));
    ck("position sent", JSON.stringify(p.at.p), "[2,1]");
    ck("note sent", p.at.n, "left of the rail");
    ck("picks not touched", "sets" in p, false);
    ck("timer not reset by moving", p.at.t, at(23, 20));

    open();
    ck("my cell highlighted", d.querySelectorAll("#sheet .cell.me").length, 1);
    ck("highlight is the right cell", d.querySelector("#sheet .cell.me").dataset.cell, "2,1");
    ck("note persisted into the field", d.getElementById("spotNote").value, "left of the rail");

    console.log("\n=== tapping the same cell again clears the spot");
    d.querySelector("#sheet .cell.me").click();
    setTimeout(() => {
      const p2 = posts[posts.length - 1];
      ck("position cleared", "p" in p2.at, false);
      ck("note kept", p2.at.n, "left of the rail");
      ck("still checked in", p2.at.s, "fri|Hamdi");

      console.log("\n=== going-off toggle must not wipe the spot");
      setMine({ s: "fri|Hamdi", t: at(23, 20), fire: false, p: [1, 3], n: "near the bar" });
      open();
      d.querySelector('#sheet button[data-fire]').click();
      setTimeout(() => {
        const p3 = posts[posts.length - 1];
        ck("fire flag flipped", p3.at.fire, true);
        ck("spot survived", JSON.stringify(p3.at.p), "[1,3]");
        ck("note survived", p3.at.n, "near the bar");

        console.log("\n=== someone else's set: I am not here, but they are");
        setMine(null);
        open();
        ck("grid still shown for viewing", cells().length, 16);
        ck("no note field when not checked in", !!d.getElementById("spotNote"), false);
        ck("no tappable mine", d.querySelectorAll("#sheet .cell.me").length, 0);
        const before = posts.length;
        cells()[5].click();
        ck("tapping does nothing when not checked in", posts.length, before);

        console.log("\n=== Now panel");
        d.getElementById("nowBtn").click();
        const np = d.getElementById("nowPanel").textContent;
        ck("Now panel carries the landmark", /by the sound booth/.test(np), true);
        ck("Now panel carries the quadrant", /back half, far left/.test(np), true);

        console.log("\n=== set with nobody positioned at all");
        board.people.forEach(p => { if (p.at) p.at = { s: p.at.s, t: p.at.t, fire: false }; });
        w.eval('people.forEach(p=>{if(p.at)p.at={s:p.at.s,t:p.at.t,fire:false}});draw()');
        open();
        ck("no grid when nobody has a spot and I am away", cells().length, 0);
        ck("chips still render", !!d.getElementById("herenow"), true);

        console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
        setTimeout(() => dom.window.close(), 200);
      }, 150);
    }, 150);
  }, 200);
}, 1400);
