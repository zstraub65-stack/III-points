/* The ten minute heads-up. It has to fire for your own picks only, on the day
   the festival is actually on, and get out of the way the rest of the time. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const DOORS_FRI = Date.UTC(2026, 10, 6, 18, 0, 0);
const DOORS_SAT = Date.UTC(2026, 10, 7, 18, 0, 0);
const fri = (h, m) => DOORS_FRI + ((h - 13) * 60 + m) * 60000;   // wall clock ET
const sat = (h, m) => DOORS_SAT + ((h - 13) * 60 + m) * 60000;
let CLOCK = fri(21, 0);

const board = { people: [{ person: "zack", name: "Zack", sets: [], at: null }] };
const dom = (() => {
  const vc = new VirtualConsole(); vc.sendTo(console, { omitJSDOMErrors: true });
  return new JSDOM(html, {
    virtualConsole: vc, runScripts: "dangerously",
    url: "https://iii-points.zstraub65.workers.dev/#board=edc",
    beforeParse(w) {
      const R = w.Date;
      w.Date = class extends R {
        constructor(...a) { if (!a.length) super(CLOCK); else super(...a); }
        static now() { return CLOCK; }
        static UTC(...a) { return R.UTC(...a); }
      };
      w.fetch = (u, o) => o && o.method === "POST"
        ? Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve({ board: "edc", people: board.people }) });
      try { w.localStorage.clear(); w.localStorage.setItem("edc26-pid", "zack"); } catch (e) {}
    }
  });
})();
const w = dom.window, d = w.document;
const line = () => d.getElementById("who").textContent.trim();
const pick = keys => w.eval("mine=new Set(" + JSON.stringify(keys) + ");");
const tick = () => w.eval("draw()");
const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};

setTimeout(() => {
  // Levity runs 11:15pm-12:15am Friday, Wooli 12:15am-1:30am
  console.log("=== 9:27pm Friday, Levity is picked and starts 9:35pm");
  CLOCK = fri(21, 27); pick(["fri|Levity"]); tick();
  ck("warns with the name", /Levity/.test(line()), true);
  ck("says how long", /in 8 min/.test(line()), true);
  ck("names the stage", /Kinetic Field|Circuit Grounds|S3QUENC3|Stereo Bloom|Main|Melt/.test(line()) || line().split("·").length > 1, true);
  ck("the usual count is out of the way", /others on this board/.test(line()), false);

  console.log("\n=== quiet when it should be");
  CLOCK = fri(21, 5); tick();
  ck("30 minutes out, nothing", /Levity/.test(line()), false);
  ck("normal line is back", /on this board|first one here/.test(line()), true);

  CLOCK = fri(21, 40); tick();
  ck("after it started, nothing", /Levity/.test(line()), false);

  CLOCK = fri(21, 27); pick([]); tick();
  ck("not one of your picks, nothing", /Levity/.test(line()), false);

  console.log("\n=== already standing there");
  pick(["fri|Levity"]);
  w.eval("people.find(p=>p.person==='zack').at={s:'fri|Levity',t:" + fri(21, 25) + ",fire:false};draw()");
  ck("checked in at it, so no nag", /Levity/.test(line()), false);
  w.eval("people.find(p=>p.person==='zack').at=null;draw()");
  ck("but warns again once you leave", /Levity/.test(line()), true);

  console.log("\n=== two at once");
  // Mau P 9:13pm and MPH 9:15pm, both inside the window
  pick(["fri|Mau P", "fri|MPH"]);
  CLOCK = fri(21, 5); tick();
  ck("soonest first", /Mau P/.test(line()), true);
  ck("counts the other", /\+1 more/.test(line()), true);

  console.log("\n=== outside the festival");
  CLOCK = Date.UTC(2026, 10, 1, 18, 0, 0); tick();
  ck("a week before, normal line", /Levity/.test(line()), false);
  CLOCK = fri(21, 27); tick();

  console.log("\n=== viewing Saturday while Friday is running");
  CLOCK = fri(21, 27); pick(["fri|Levity"]); tick();
  w.eval("day='sat';draw()");
  ck("still warns about tonight, not the viewed day", /Levity/.test(line()), true);
  w.eval("day='fri';draw()");

  console.log("\n=== a Saturday set does not leak into Friday");
  pick(["sat|Franky Rizardo"]); tick();
  ck("wrong day, nothing", /Franky Rizardo/.test(line()), false);

  console.log("\n=== works with no signal, since it is computed locally");
  pick(["fri|Levity"]);
  w.eval("online=false;draw()");
  ck("warning beats the offline message", /Levity/.test(line()), true);
  w.eval("online=true;");

  console.log("\n=== starting right now");
  CLOCK = fri(21, 35); pick(["fri|Levity"]); tick();
  ck("reads as starting now", /starting now/.test(line()), true);

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  setTimeout(() => dom.window.close(), 100);
  if (fail.length) process.exitCode = 1;
}, 1400);
