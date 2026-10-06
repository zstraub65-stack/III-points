/* Simulate Friday night: people check in, time passes, check-ins expire. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

// Friday doors, 4pm ET = 20:00 UTC
const DOORS_FRI = Date.UTC(2026, 9, 16, 20, 0, 0);
const at = (h, m) => DOORS_FRI + ((h - 16) * 60 + m) * 60000;   // wall-clock ET -> ms

let CLOCK = at(23, 30);  // 11:30pm Friday

const board = {
  people: [
    { person: "zack", name: "Zack", sets: ["fri|Hamdi"], at: { s: "fri|Hamdi", t: at(23, 20), fire: false } },
    { person: "vru", name: "Vrushi", sets: ["fri|Parcels"], at: { s: "fri|Hamdi", t: at(23, 25), fire: true } },
    { person: "sum", name: "Sumit", sets: [], at: { s: "fri|Heidi Lawden", t: at(16, 10), fire: false } }, // checked in at doors
    { person: "cara", name: "Cara", sets: [], at: null }
  ]
};

const posts = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/#board=miamiii",
  beforeParse(w) {
    const RealDate = w.Date;
    // freeze the festival clock
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
        if (me && "at" in body) me.at = body.at;           // partial update, like the worker
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: b, people: b === "miamiii" ? board.people : [] }) });
    };
    try { w.localStorage.clear(); w.localStorage.setItem("iiip26-pid", "zack"); } catch (e) {}
  }
});
const w = dom.window, d = w.document;

const live = () => [...d.querySelectorAll(".blk.livehere")].map(b => b.dataset.n);
const badges = () => [...d.querySelectorAll(".livebadge")].map(b => b.textContent.trim());

setTimeout(() => {
  console.log("=== 11:30pm Friday, Hamdi is on (11:15pm-12:15am)");
  console.log("sets showing people live:", live());
  console.log("badges:", badges());

  // Sumit checked in at 4:10pm to a set that ended at 8pm. Should be long gone.
  const sumitStillShown = live().includes("Heidi Lawden");
  console.log("stale 4pm check-in still showing:", sumitStillShown, sumitStillShown ? "(BUG)" : "(correctly expired)");

  // the now line should be on the grid for Friday
  console.log("now line drawn:", !!d.querySelector(".nowline"));

  // open the Now panel
  d.getElementById("nowBtn").click();
  const np = d.getElementById("nowPanel").textContent;
  console.log("\nNow panel mentions Hamdi:", /Hamdi/.test(np));
  console.log("  shows both people there:", /You/.test(np) && /Vrushi/.test(np));
  console.log("  flags it going off:", /going off/.test(np));
  console.log("  excludes the stale one:", !/Heidi/.test(np));

  // check in somewhere else
  d.getElementById("nowBtn").click();
  d.querySelector('.blk[data-n="Levity"]').click();
  const sheet = d.getElementById("sheet").textContent;
  console.log("\nset sheet offers check-in:", /here now/.test(sheet));
  d.querySelector('#sheet button[data-checkin]').click();

  setTimeout(() => {
    const post = posts[posts.length - 1];
    console.log("posted check-in:", JSON.stringify(post.at));
    console.log("  did not send sets (so picks are safe):", !("sets" in post));
    console.log("moved marker to Levity:", live().includes("Levity"));
    console.log("  Vrushi still at Hamdi:", live().includes("Hamdi"));

    // --- now advance the clock past the 90 minute cap
    CLOCK = at(25, 10);  // 1:10am
    board.people[0].at = { s: "fri|Levity", t: at(23, 30), fire: false }; // checked in 100 min ago
    w.eval("draw()");
    console.log("\n=== 1:10am, Zack checked in at 11:30pm (100 min ago)");
    console.log("  Levity runs 12:15am-1:30am, so the set is still on");
    console.log("  check-in still live:", live().includes("Levity"), "(90 min cap should have expired it)");

    // --- a check-in during a long 4-hour set
    CLOCK = at(22, 0);
    board.people[0].at = { s: "fri|Floating Points", t: at(20, 0), fire: false }; // 2h ago, set runs 12am-4am
    w.eval("draw()");
    console.log("\n=== check-in 2h old on a 4-hour set:", live().includes("Floating Points") ? "still live (BUG)" : "expired (correct)");

    dom.window.close();
  }, 300);

  function liveCount() { return d.querySelectorAll(".blk.livehere").length; }
}, 1400);
