const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");
const errs = [];

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/",
  beforeParse(w) {
    w.addEventListener("error", e => errs.push(String(e.error || e.message)));
    w.fetch = u => {
      const b = decodeURIComponent(String(u).split("board=")[1] || "");
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: b, people: [] }) });
    };
    try { w.localStorage.clear(); } catch (e) {}
  }
});

const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};

setTimeout(() => {
  const d = dom.window.document;
  const w = d.getElementById("welcome");
  const btn = d.getElementById("crewsBtn");
  ck("no script errors", errs, []);
  ck("shown on first visit", !w.hidden, true);
  ck("Crews button reads as active", btn.getAttribute("aria-pressed"), "true");

  d.getElementById("wClose").click();
  ck("X hides it", w.hidden, true);
  ck("button goes inactive", btn.getAttribute("aria-pressed"), "false");

  btn.click();
  ck("Crews reopens it", w.hidden, false);
  ck("button active again", btn.getAttribute("aria-pressed"), "true");
  ck("reopened card still asks for a name", !!d.getElementById("wName"), true);

  btn.click();
  ck("Crews closes it again", w.hidden, true);
  ck("button inactive again", btn.getAttribute("aria-pressed"), "false");

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  dom.window.close();
  if (fail.length) process.exit(1);
}, 1300);
