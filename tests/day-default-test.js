/* The page should open on the day you are actually standing in. During III
   Points this was hard-wired to the first day, so on the Saturday the owner
   had to hunt for the right tab in the dark. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const DOORS = {
  fri: Date.UTC(2026, 10, 6, 18, 0, 0),
  sat: Date.UTC(2026, 10, 7, 18, 0, 0),
  sun: Date.UTC(2026, 10, 8, 18, 0, 0)
};
const at = (d, h, m) => DOORS[d] + ((h - 13) * 60 + m) * 60000;

const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

/* Boot the real page with the clock frozen, and report which day it landed on
   plus which tab is lit, so a mismatch between the two cannot hide. */
async function boot(clock) {
  const vc = new VirtualConsole(); vc.sendTo(console, { omitJSDOMErrors: true });
  const dom = new JSDOM(html, {
    virtualConsole: vc, runScripts: "dangerously",
    url: "https://iii-points.zstraub65.workers.dev/#board=edc",
    beforeParse(w) {
      const R = w.Date;
      w.Date = class extends R {
        constructor(...a) { if (!a.length) super(clock); else super(...a); }
        static now() { return clock; }
        static UTC(...a) { return R.UTC(...a); }
      };
      w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ board: "edc", people: [] }) });
      try {
        w.localStorage.clear();
        w.localStorage.setItem("edc26-pid", "zack");
        w.localStorage.setItem("edc26-welcomed", "1");
      } catch (e) {}
    }
  });
  await wait(900);
  const w = dom.window, d = w.document;
  const lit = [...d.querySelectorAll("#dayseg button[data-day]")]
    .filter(b => b.getAttribute("aria-pressed") === "true")
    .map(b => b.dataset.day);
  const out = {
    day: w.eval("day"), lit,
    heading: d.getElementById("dayseg").textContent,
    big: d.getElementById("dayBig").textContent,
    date: d.getElementById("dayDate").textContent,
    accent: [...d.body.classList].filter(c => /^d-/.test(c))
  };
  setTimeout(() => dom.window.close(), 50);
  return out;
}

(async () => {
  console.log("=== standing in the middle of a day");
  let r = await boot(at("sat", 21, 0));            // 9pm Saturday, peak
  ck("opens on Saturday", r.day, "sat");
  ck("and exactly one tab is lit", r.lit, ["sat"]);
  ck("all three days offered", r.heading, "FRISATSUN");
  ck("the title says Saturday too", r.big, "SATURDAY");
  ck("with the right date", r.date, "NOVEMBER 7");
  ck("and the day accent follows", r.accent, ["d-sat"]);

  r = await boot(at("sun", 14, 30));
  ck("Sunday afternoon opens on Sunday", r.day, "sun");
  ck("tab agrees", r.lit, ["sun"]);
  ck("title agrees", r.big, "SUNDAY");
  ck("date agrees", r.date, "NOVEMBER 8");
  ck("accent agrees", r.accent, ["d-sun"]);

  console.log("\n=== the edges of a day");
  r = await boot(DOORS.sat - 150 * 60000);         // 2.5h before doors, still queueing
  ck("before doors still counts as that day", r.day, "sat");
  r = await boot(DOORS.sat + (660 + 30) * 60000);  // half an hour after the last set
  ck("just after close is still that day", r.day, "sat");

  console.log("\n=== outside the festival");
  r = await boot(Date.UTC(2026, 9, 30, 18, 0, 0)); // a week out
  ck("before it starts, the first day", r.day, "fri");
  r = await boot(Date.UTC(2026, 10, 7, 10, 0, 0)); // Saturday morning, between days
  ck("the morning between days looks ahead", r.day, "sat");
  r = await boot(Date.UTC(2026, 10, 20, 18, 0, 0)); // after it is all over
  ck("once it is over, the last day", r.day, "sun");

  console.log("\n=== a manual switch still wins");
  const vc = new VirtualConsole(); vc.sendTo(console, { omitJSDOMErrors: true });
  const clock = at("sat", 21, 0);
  const dom = new JSDOM(html, {
    virtualConsole: vc, runScripts: "dangerously",
    url: "https://iii-points.zstraub65.workers.dev/#board=edc",
    beforeParse(w) {
      const R = w.Date;
      w.Date = class extends R {
        constructor(...a) { if (!a.length) super(clock); else super(...a); }
        static now() { return clock; }
        static UTC(...a) { return R.UTC(...a); }
      };
      w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ board: "edc", people: [] }) });
      try { w.localStorage.clear(); w.localStorage.setItem("edc26-welcomed", "1"); } catch (e) {}
    }
  });
  await wait(900);
  const d = dom.window.document;
  d.querySelector('#dayseg button[data-day="fri"]').click();
  await wait(120);
  ck("tapping Friday moves there", dom.window.eval("day"), "fri");
  ck("and the grid follows", /Zack Martino/.test(d.getElementById("grid").textContent), true);
  ck("and so does the title", d.getElementById("dayBig").textContent, "FRIDAY");
  ck("and the accent", [...d.body.classList].filter(c => /^d-/.test(c)), ["d-fri"]);
  setTimeout(() => dom.window.close(), 50);

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  if (fail.length) process.exitCode = 1;
})();
