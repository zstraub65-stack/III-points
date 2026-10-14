/* The Map tab: every stage drawn, tappable, and showing what is on, who has
   picks there, and who is standing there now. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const DOORS_FRI = Date.UTC(2026, 9, 16, 20, 0, 0);
const fri = (h, m) => DOORS_FRI + ((h - 16) * 60 + m) * 60000;
let CLOCK = fri(23, 30);                       // Hamdi on RC95 runs 11:15pm-12:15am

const people = [
  { person: "zack", name: "Zack", sets: ["fri|Hamdi"], at: null },
  { person: "v", name: "Vrushi", sets: ["fri|Hamdi"], at: { s: "fri|Hamdi", t: fri(23, 20), fire: false } },
  { person: "s", name: "Sumit", sets: ["fri|Hamdi"], at: null },
  { person: "n", name: "Nicolas", sets: [], at: { s: "fri|Cloonee", t: fri(23, 35), fire: true } }
];
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
      w.localStorage.setItem("iiip26-mine", JSON.stringify(["fri|Hamdi"]));
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

  console.log("\n=== the drawing");
  const drawn = [...d.querySelectorAll("#mapPanel [data-stage]")].map(g => g.dataset.stage).sort();
  const stages = Object.keys(w.eval("ST")).sort();
  ck("every stage is on it", drawn, stages);
  ck("entrance is marked", /ENTRANCE/.test(d.getElementById("mapSvg").textContent), true);
  ck("RC95 flags your pick", !!stage("RC95").querySelector("text"), true);
  ck("RC95 shows a live count", stage("RC95").querySelector("circle").nextSibling.textContent, "1");
  ck("and is outlined as hot", stage("RC95").querySelector("rect").classList.contains("hot"), true);
  ck("a quiet stage has no count", !!stage("Vertex").querySelector("circle"), false);

  console.log("\n=== tapping a stage");
  stage("RC95").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  const sheet = d.getElementById("sheet");
  ck("sheet opens", sheet.classList.contains("on"), true);
  ck("named", /RC95/.test(sheet.textContent), true);
  ck("says what is on now", /Hamdi/.test(sheet.textContent) && /On now/.test(sheet.textContent), true);
  ck("lists who is standing there", /Vrushi/.test(sheet.textContent), true);
  ck("lists who is down for what", /you/.test(sheet.textContent) && /Sumit/.test(sheet.textContent), true);
  ck("not someone at another stage", /Nicolas/.test(sheet.textContent), false);
  d.querySelector("#sheet button[data-close]").click();
  await wait(80);

  console.log("\n=== a stage with nobody on it");
  stage("Vertex").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  ck("still opens", /Vertex/.test(d.getElementById("sheet").textContent), true);
  ck("says nobody is there", /Nobody from your crews/.test(d.getElementById("sheet").textContent), true);
  d.querySelector("#sheet button[data-close]").click();
  await wait(80);

  console.log("\n=== keyboard");
  stage("Grand Central").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await wait(120);
  ck("Enter opens a stage", /Grand Central/.test(d.getElementById("sheet").textContent), true);
  d.querySelector("#sheet button[data-close]").click();
  await wait(80);

  console.log("\n=== outside festival hours");
  CLOCK = Date.UTC(2026, 9, 12, 18, 0, 0);
  w.eval("draw()");
  await wait(80);
  stage("RC95").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  ck("no 'On now' when nothing is on", /On now/.test(d.getElementById("sheet").textContent), false);
  ck("but picks still listed", /Hamdi/.test(d.getElementById("sheet").textContent), true);
  d.querySelector("#sheet button[data-close]").click();
  CLOCK = fri(23, 30);

  console.log("\n=== closing");
  ck("still open from earlier", d.getElementById("mapPanel").hidden, false);
  d.getElementById("mapBtn").click(); await wait(60);
  ck("the button toggles it shut", d.getElementById("mapPanel").hidden, true);
  d.getElementById("mapBtn").click(); await wait(60);
  ck("and back open", d.getElementById("mapPanel").hidden, false);
  d.getElementById("mapClose").click(); await wait(60);
  ck("the X closes it too", d.getElementById("mapPanel").hidden, true);

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  setTimeout(() => dom.window.close(), 100);
  if (fail.length) process.exitCode = 1;
})();
