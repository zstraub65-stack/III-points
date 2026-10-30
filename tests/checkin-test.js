/* Simulate Friday night: people check in, time passes, check-ins expire. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

// Friday doors, 4pm ET = 20:00 UTC
const DOORS_FRI = Date.UTC(2026, 10, 6, 18, 0, 0);
const at = (h, m) => DOORS_FRI + ((h - 13) * 60 + m) * 60000;   // wall-clock ET -> ms

let CLOCK = at(22, 0);   // 10:00pm Friday, Levity is on

const board = {
  people: [
    { person: "zack", name: "Zack", sets: ["fri|Levity"], at: { s: "fri|Levity", t: at(21, 50), fire: false } },
    { person: "vru", name: "Vrushi", sets: ["fri|Afrojack"], at: { s: "fri|Levity", t: at(21, 55), fire: true } },
    { person: "sum", name: "Sumit", sets: [], at: { s: "fri|Matthias", t: at(13, 10), fire: false } }, // checked in at doors
    { person: "cara", name: "Cara", sets: [], at: null }
  ]
};

const posts = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/#board=edc",
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
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: b, people: b === "edc" ? board.people : [] }) });
    };
    try { w.localStorage.clear(); w.localStorage.setItem("edc26-pid", "zack"); } catch (e) {}
  }
});
const w = dom.window, d = w.document;

const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};
const live = () => [...d.querySelectorAll(".blk.livehere")].map(b => b.dataset.n);
const badges = () => [...d.querySelectorAll(".livebadge")].map(b => b.textContent.trim());

setTimeout(() => {
  console.log("=== 10:00pm Friday, Levity is on (9:35-10:45pm)");
  ck("the live set is the one that is on", live(), ["Levity"]);
  ck("with a going-off badge", /2 here/.test(badges().join(" ")), true);

  // Sumit checked in at 4:10pm to a set that ended at 8pm. Should be long gone.
  ck("a check-in from doors has expired by 10pm", live().includes("Matthias"), false);

  // the now line should be on the grid for Friday
  ck("now line drawn", !!d.querySelector(".nowline"), true);

  // open the Now panel
  d.getElementById("nowBtn").click();
  const np = d.getElementById("nowPanel").textContent;
  ck("Now panel names the set", /Levity/.test(np), true);
  ck("shows both people there", /You/.test(np) && /Vrushi/.test(np), true);
  ck("flags it going off", /going off/.test(np), true);
  console.log("  excludes the stale one:", !/Heidi/.test(np));

  // check in somewhere else
  d.getElementById("nowBtn").click();
  d.querySelector('.blk[data-n="Wooli"]').click();
  const sheet = d.getElementById("sheet").textContent;
  ck("set sheet offers check-in", /here now/.test(sheet), true);
  d.querySelector('#sheet button[data-checkin]').click();

  setTimeout(() => {
    const post = posts[posts.length - 1];
    console.log("posted check-in:", JSON.stringify(post.at));
    ck("did not send sets, so picks are safe", "sets" in post, false);
    ck("moved marker to Wooli", live().includes("Wooli"), true);
    ck("Vrushi still at Levity", live().includes("Levity"), true);

    // --- now advance the clock past the 90 minute cap
    CLOCK = at(23, 30);  // 11:30pm
    board.people[0].at = { s: "fri|Wooli", t: at(21, 50), fire: false }; // checked in 100 min ago
    w.eval("draw()");
    console.log("\n=== 11:30pm, Zack checked in at 9:50pm (100 min ago)");
    console.log("  Wooli runs 10:45pm-12:00am, so the set is still on");
    ck("the 90 minute cap expired it even though the set is still on", live().includes("Wooli"), false);

    // --- a check-in during a long 4-hour set
    CLOCK = at(15, 0);
    board.people[0].at = { s: "fri|Matthias", t: at(13, 0), fire: false }; // 2h ago, set runs 1-3pm
    w.eval("draw()");
    console.log("\n=== check-in 2h old on a 2-hour set:", live().includes("Azzeca") ? "still live (BUG)" : "expired (correct)");

    console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
    if (fail.length) process.exitCode = 1;
    dom.window.close();
  }, 300);

  function liveCount() { return d.querySelectorAll(".blk.livehere").length; }
}, 1400);
