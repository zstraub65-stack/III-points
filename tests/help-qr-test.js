/* The ? panel, the two QR codes, and the check-in flow no longer bouncing the
   sheet shut before you can say where you are. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const DOORS_FRI = Date.UTC(2026, 9, 16, 20, 0, 0);
const fri = (h, m) => DOORS_FRI + ((h - 16) * 60 + m) * 60000;
let CLOCK = fri(23, 30);                       // Hamdi is on

const posts = [];
function boot(hash, seed) {
  const vc = new VirtualConsole(); vc.sendTo(console, { omitJSDOMErrors: true });
  return new JSDOM(html, {
    virtualConsole: vc, runScripts: "dangerously",
    url: "https://iii-points.zstraub65.workers.dev/" + (hash || "#board=miamiii"),
    beforeParse(w) {
      const R = w.Date;
      w.Date = class extends R {
        constructor(...a) { if (!a.length) super(CLOCK); else super(...a); }
        static now() { return CLOCK; }
        static UTC(...a) { return R.UTC(...a); }
      };
      /* persist like the worker does, otherwise the next pull wipes the
         check-in the page just made and the grid never appears */
      const row = { person: "zack", name: "Zack", sets: [], at: null };
      w.fetch = (u, o) => {
        if (o && o.method === "POST") {
          const body = JSON.parse(o.body); posts.push(body);
          if ("at" in body) row.at = body.at;
          if (Array.isArray(body.sets)) row.sets = body.sets;
          if (body.name !== undefined) row.name = body.name;
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: "miamiii", people: [JSON.parse(JSON.stringify(row))] }) });
      };
      try { w.localStorage.clear(); Object.entries(seed || {}).forEach(([k, v]) => w.localStorage.setItem(k, v)); w.localStorage.setItem("iiip26-pid", "zack"); } catch (e) {}
    }
  });
}
const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let dom = boot("#board=miamiii", { "iiip26-welcomed": "1" });
  let w = dom.window, d = w.document;
  await wait(1400);

  console.log("=== the ? panel");
  ck("button is in the bar", !!d.getElementById("helpBtn"), true);
  ck("hidden until asked", d.getElementById("helpPanel").hidden, true);
  d.getElementById("helpBtn").click();
  await wait(60);
  const h = d.getElementById("helpPanel").textContent;
  ck("opens", d.getElementById("helpPanel").hidden, false);
  ck("explains checking in", /I'm here now/.test(h), true);
  ck("explains the grid", /square you are standing in/.test(h), true);
  ck("explains going off", /going off/.test(h), true);
  ck("says you never check out", /clears itself/.test(h), true);
  ck("explains the ten minute warning", /ten minutes/.test(h), true);
  ck("keeps the schedule caveat", /typed in by hand/.test(h), true);
  d.getElementById("helpClose").click();
  await wait(40);
  ck("closes again", d.getElementById("helpPanel").hidden, true);

  console.log("\n=== checking in no longer shuts the sheet");
  d.querySelector('.blk[data-n="Hamdi"]').click();
  ck("sheet open", d.getElementById("sheet").classList.contains("on"), true);
  d.querySelector('#sheet button[data-checkin]').click();
  await wait(300);
  ck("still open after checking in", d.getElementById("sheet").classList.contains("on"), true);
  ck("the crowd grid is right there", d.querySelectorAll("#sheet .cell").length, 16);
  ck("so is the landmark box", !!d.getElementById("spotNote"), true);
  ck("and the going-off toggle", !!d.querySelector("#sheet button[data-fire]"), true);
  const cells = [...d.querySelectorAll("#sheet .cell")];
  cells.find(c => c.dataset.cell === "1,2").click();
  await wait(250);
  ck("placing yourself is the next tap", JSON.stringify((posts[posts.length - 1].at || {}).p), "[1,2]");

  console.log("\n=== both QR codes");
  d.querySelector('button[data-act="qr"]').click();
  await wait(120);
  ck("join code drawn", d.querySelectorAll("#qrwrap svg").length, 1);
  ck("start-your-own code drawn", d.querySelectorAll("#qrwrapNew svg").length, 1);
  ck("join code points at this crew", /#board=miamiii$/.test(d.getElementById("qrUrl").textContent), true);
  ck("other code points at #new", /#new$/.test(d.getElementById("qrUrlNew").textContent), true);
  ck("the two differ", d.getElementById("qrUrl").textContent !== d.getElementById("qrUrlNew").textContent, true);
  dom.window.close();

  console.log("\n=== scanning the start-your-own code");
  dom = boot("#new"); w = dom.window; d = w.document;
  await wait(1400);
  ck("prompt opens", d.getElementById("welcome").hidden, false);
  ck("crew field already showing", d.getElementById("wCrewBox").hidden, false);
  ck("no need to hunt for the link", d.getElementById("wOther").style.display, "none");
  ck("still lets them just join instead", !!d.getElementById("wJoin"), true);
  d.getElementById("wName").value = "Dana";
  d.getElementById("wCrew").value = "Tampa Crew";
  d.getElementById("wMake").click();
  await wait(400);
  ck("lands on their own crew", w.location.hash, "#board=tampa-crew");
  ck("with their name kept", w.localStorage.getItem("iiip26-name"), "Dana");
  dom.window.close();

  console.log("\n=== a returning person is not re-prompted by a plain link");
  dom = boot("#board=miamiii", { "iiip26-welcomed": "1" }); w = dom.window; d = w.document;
  await wait(1400);
  ck("left alone", d.getElementById("welcome").hidden, true);
  dom.window.close();

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  if (fail.length) process.exitCode = 1;
})();
