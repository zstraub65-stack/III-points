/* The Map tab: every stage drawn, tappable, and showing what is on, who has
   picks there, and who is standing there now. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const DOORS_FRI = Date.UTC(2026, 10, 6, 18, 0, 0);
const fri = (h, m) => DOORS_FRI + ((h - 13) * 60 + m) * 60000;
let CLOCK = fri(22, 0);                        // Levity on Circuit Grounds runs 9:35-10:45pm

const people = [
  { person: "zack", name: "Zack", sets: ["fri|Levity"], at: null },
  { person: "v", name: "Vrushi", sets: ["fri|Levity"], at: { s: "fri|Levity", t: fri(23, 20), fire: false } },
  { person: "s", name: "Sumit", sets: ["fri|Levity"], at: null },
  { person: "n", name: "Nicolas", sets: [], at: { s: "fri|Mau P", t: fri(23, 35), fire: true } }
];
const vc = new VirtualConsole(); vc.sendTo(console, { omitJSDOMErrors: true });
const dom = new JSDOM(html, {
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
      : Promise.resolve({ ok: true, json: () => Promise.resolve({ board: "edc", people }) });
    try {
      w.localStorage.clear();
      w.localStorage.setItem("edc26-pid", "zack");
      w.localStorage.setItem("edc26-welcomed", "1");
      w.localStorage.setItem("edc26-mine", JSON.stringify(["fri|Levity"]));
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
const stage = n => [...d.querySelectorAll("#mapPanel [data-stage]")].find(g => g.dataset.stage === n);

(async () => {
  await wait(1400);
  console.log("=== the tab");
  ck("button is in the bar", !!d.getElementById("mapBtn"), true);
  ck("hidden until asked", d.getElementById("mapPanel").hidden, true);
  d.getElementById("mapBtn").click();
  await wait(100);
  ck("opens", d.getElementById("mapPanel").hidden, false);

  console.log("\n=== the stage list, since EDC has no site plan loaded");
  const drawn = [...d.querySelectorAll("#mapPanel [data-stage]")].map(g => g.dataset.stage).sort();
  const stages = Object.keys(w.eval("ST")).sort();
  ck("every stage is on it", drawn, stages);
  ck("Circuit Grounds flags your pick", !!stage("Circuit Grounds").querySelector(".sr"), true);
  ck("Circuit Grounds shows a live count", stage("Circuit Grounds").querySelector(".sn").textContent, "1 here");
  ck("says the map is not loaded", /No site map loaded for EDC ORLANDO/.test(d.getElementById("mapPanel").textContent), true);
  ck("a quiet stage has no count", !!stage("Neon Garden").querySelector(".sn"), false);

  console.log("\n=== tapping a stage");
  stage("Circuit Grounds").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  const sheet = d.getElementById("sheet");
  ck("sheet opens", sheet.classList.contains("on"), true);
  ck("named", /Circuit Grounds/.test(sheet.textContent), true);
  ck("says what is on now", /Levity/.test(sheet.textContent) && /On now/.test(sheet.textContent), true);
  ck("lists who is standing there", /Vrushi/.test(sheet.textContent), true);
  ck("lists who is down for what", /you/.test(sheet.textContent) && /Sumit/.test(sheet.textContent), true);
  ck("not someone at another stage", /Nicolas/.test(sheet.textContent), false);
  d.querySelector("#sheet button[data-close]").click();
  await wait(80);

  console.log("\n=== a stage with nobody on it");
  stage("Neon Garden").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  ck("still opens", /Neon Garden/.test(d.getElementById("sheet").textContent), true);
  ck("says nobody is there", /Nobody from your crews/.test(d.getElementById("sheet").textContent), true);
  d.querySelector("#sheet button[data-close]").click();
  await wait(80);

  console.log("\n=== keyboard");
  stage("Kinetic Field").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await wait(120);
  ck("Enter opens a stage", /Kinetic Field/.test(d.getElementById("sheet").textContent), true);
  d.querySelector("#sheet button[data-close]").click();
  await wait(80);

  console.log("\n=== outside festival hours");
  CLOCK = Date.UTC(2026, 9, 12, 18, 0, 0);
  w.eval("draw()");
  await wait(80);
  stage("Circuit Grounds").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  ck("no 'On now' when nothing is on", /On now/.test(d.getElementById("sheet").textContent), false);
  ck("but picks still listed", /Levity/.test(d.getElementById("sheet").textContent), true);
  d.querySelector("#sheet button[data-close]").click();
  CLOCK = fri(22, 0);                          // back inside Levity, as the sections below assume

  console.log("\n=== closing");
  ck("still open from earlier", d.getElementById("mapPanel").hidden, false);
  d.getElementById("mapBtn").click(); await wait(60);
  ck("the button toggles it shut", d.getElementById("mapPanel").hidden, true);
  d.getElementById("mapBtn").click(); await wait(60);
  ck("and back open", d.getElementById("mapPanel").hidden, false);
  d.getElementById("mapClose").click(); await wait(60);
  ck("the X closes it too", d.getElementById("mapPanel").hidden, true);

  console.log("\n=== the whole lineup toggle");
  d.getElementById("mapBtn").click(); await wait(100);   // reopen, the last section closed it
  stage("Stereo Bloom").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  let sh = d.getElementById("sheet");
  const total = w.eval("setsAt('Stereo Bloom').length");
  ck("defaults to your crew", sh.querySelector('[data-smode="crew"]').getAttribute("aria-pressed"), "true");
  ck("nobody picked anything there", /Nobody you can see has picked/.test(sh.textContent), true);
  ck("so no rows yet", sh.querySelectorAll(".lineup .row").length, 0);

  sh.querySelector('[data-smode="all"]').click();
  await wait(120);
  sh = d.getElementById("sheet");
  ck("switches to everything", sh.querySelector('[data-smode="all"]').getAttribute("aria-pressed"), "true");
  ck("lists the stage's whole night", sh.querySelectorAll(".lineup .row").length, total);
  ck("a real lineup, not a couple of rows", total > 5, true);
  ck("still the same stage", /Stereo Bloom/.test(sh.textContent), true);

  sh.querySelector('[data-smode="crew"]').click();
  await wait(120);
  ck("switches back", d.getElementById("sheet").querySelectorAll(".lineup .row").length, 0);

  console.log("\n=== a stage where your crew is going");
  d.querySelector("#sheet button[data-close]").click(); await wait(60);
  stage("Circuit Grounds").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  sh = d.getElementById("sheet");
  ck("crew view shows just the picked set", sh.querySelectorAll(".lineup .row").length, 1);
  ck("and marks what is on now", sh.querySelectorAll(".lineup .row.nowrow").length, 1);
  sh.querySelector('[data-smode="all"]').click();
  await wait(120);
  sh = d.getElementById("sheet");
  const rc95 = w.eval("setsAt('Circuit Grounds').length");
  ck("everything shows the full Circuit Grounds night", sh.querySelectorAll(".lineup .row").length, rc95);
  ck("your pick is starred in it", /\u2605/.test(sh.textContent), true);
  ck("names carried over", /Vrushi/.test(sh.textContent), true);
  ck("what is on is still marked", sh.querySelectorAll(".lineup .row.nowrow").length, 1);

  console.log("\n=== the choice sticks while browsing");
  d.querySelector("#sheet button[data-close]").click(); await wait(60);
  stage("Neon Garden").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  ck("opens straight into everything", d.getElementById("sheet").querySelector('[data-smode="all"]').getAttribute("aria-pressed"), "true");
  d.getElementById("sheet").querySelector('[data-smode="crew"]').click(); await wait(100);
  d.querySelector("#sheet button[data-close]").click(); await wait(60);
  d.getElementById("mapClose").click(); await wait(60);   // leave it shut, as the next section expects

  console.log("\n=== an image alone is not enough");
  d.getElementById("mapBtn").click(); await wait(60);        // open
  w.eval("MAP_SRC='map.jpeg';mapImgOK=true;renderMap()");    // pretend a map file loaded
  await wait(80);
  ck("no image without stage coordinates", !!d.querySelector(".mapimg img"), false);
  ck("still the stage list", d.querySelectorAll("#mapPanel .stagerow").length, 4);

  console.log("\n=== once somebody places the stages on it");
  w.eval("Object.assign(MAPIMG,{'Kinetic Field':[0.3,0.3],'Circuit Grounds':[0.7,0.3],'Neon Garden':[0.3,0.7],'Stereo Bloom':[0.7,0.7]});renderMap()");
  await wait(80);
  ck("shows the image", !!d.querySelector(".mapimg img"), true);
  ck("uses the name that actually loaded", d.querySelector(".mapimg img").getAttribute("src"), "map.jpeg");
  const hits = [...d.querySelectorAll(".mapimg .hit")].map(b => b.dataset.stage).sort();
  ck("a tap target per stage", hits, Object.keys(w.eval("ST")).sort());
  const rc = [...d.querySelectorAll(".mapimg .hit")].find(b => b.dataset.stage === "Circuit Grounds");
  ck("positioned, not stacked", rc.style.left !== "" && rc.style.top !== "", true);
  ck("still flags your pick", !!rc.querySelector(".hs"), true);
  ck("still counts who is there", rc.querySelector(".hn").textContent, "1");
  rc.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  ck("tapping it opens the same sheet", /Circuit Grounds/.test(d.getElementById("sheet").textContent), true);
  d.querySelector("#sheet button[data-close]").click(); await wait(60);
  w.eval("Object.keys(MAPIMG).forEach(k=>delete MAPIMG[k]);mapImgOK=false;renderMap()");
  await wait(80);
  ck("back to the list when neither is there", d.querySelectorAll("#mapPanel .stagerow").length, 4);

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  setTimeout(() => dom.window.close(), 100);
  if (fail.length) process.exitCode = 1;
})();
