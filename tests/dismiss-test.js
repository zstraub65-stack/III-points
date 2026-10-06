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

setTimeout(() => {
  const d = dom.window.document;
  const w = d.getElementById("welcome");
  const btn = d.getElementById("crewsBtn");
  console.log("errors:", errs.length ? errs : "none");
  console.log("shown on first visit:", !w.hidden);
  console.log("Crews button reads as active:", btn.getAttribute("aria-pressed"));

  d.getElementById("wClose").click();
  console.log("after tapping X  -> hidden:", w.hidden, "| button:", btn.getAttribute("aria-pressed"));

  btn.click();
  console.log("after tapping Crews -> hidden:", w.hidden, "| button:", btn.getAttribute("aria-pressed"));
  console.log("reopened card still offers naming:", !!d.getElementById("wName"));

  btn.click();
  console.log("tapping Crews again -> hidden:", w.hidden, "| button:", btn.getAttribute("aria-pressed"));

  // and it stays reachable after picking a set
  btn.click();
  d.querySelector('.blk[data-n="Tokischa"]').click();
  d.querySelector('#sheet button[data-go="1"]').click();
  console.log("hidden after picking a set:", d.getElementById("welcome").hidden);
  btn.click();
  console.log("still reopenable afterwards:", !d.getElementById("welcome").hidden);
  dom.window.close();
}, 1300);
