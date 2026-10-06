/* Exercise the real page with three fake crews and check the isolation rule:
   you see everyone you follow, each crew sees only itself, and your picks are
   only ever written to your home crew. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const BOARDS = {
  miamiii: [
    { person: "zack", name: "Zack", sets: ["fri|Hamdi", "sat|KETTAMA"] },
    { person: "winston", name: "Winston", sets: ["fri|Parcels"] }
  ],
  boston: [{ person: "bos1", name: "Dana", sets: ["fri|Hamdi", "sat|VTSS"] }],
  stpete: [{ person: "sp1", name: "Marco", sets: ["sat|KETTAMA"] }]
};

const writes = [];
const errs = [];

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/#board=miamiii",
  beforeParse(w) {
    w.addEventListener("error", e => errs.push(String(e.error || e.message)));
    w.fetch = (url, opts) => {
      const b = decodeURIComponent(String(url).split("board=")[1] || "");
      if (opts && opts.method === "POST") {
        writes.push({ board: b, body: JSON.parse(opts.body) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: b, people: BOARDS[b] || [] }) });
    };
    try { w.localStorage.clear(); } catch (e) {}
  }
});

const w = dom.window, d = w.document;

setTimeout(() => {
  console.log("script errors:", errs.length ? errs : "none");

  // follow the two other crews
  d.getElementById("followIn").value = "boston";
  d.getElementById("followBtn").click();
  d.getElementById("followIn").value = "https://iii-points.zstraub65.workers.dev/#board=stpete";
  d.getElementById("followBtn").click();

  setTimeout(() => {
    const boards = [...d.querySelectorAll(".ch-name")].map(e => e.textContent);
    console.log("crews shown in the panel:", boards);

    const names = [...d.querySelectorAll(".person .pn")].map(e => e.textContent);
    console.log("people visible to Zack:", names);

    // a set only a followed crew picked should still show a dot
    const dots = d.querySelectorAll(".blk .crew i").length;
    console.log("crew dots drawn on the grid:", dots);

    // hide one crew and confirm its dots go away
    const before = d.querySelectorAll(".blk .crew i").length;
    const hideBtn = [...d.querySelectorAll("button[data-hide]")].find(b => b.dataset.hide === "boston");
    hideBtn.click();
    const after = d.querySelectorAll(".blk .crew i").length;
    console.log("dots before hiding boston:", before, "after:", after, "| hiding works:", after < before);
    hideBtn.click();

    // tapping a set must only ever write to the home crew
    d.querySelector('.blk[data-n="Tokischa"]').click();
    d.querySelector('#sheet button[data-go="1"]').click();

    setTimeout(() => {
      console.log("POST targets:", writes.map(x => x.board));
      console.log("only ever wrote to the home crew:", writes.every(x => x.board === "miamiii"));
      const unf = [...d.querySelectorAll("button[data-unfollow]")].map(b => b.dataset.unfollow);
      console.log("unfollow offered for:", unf, "| home crew not unfollowable:", !unf.includes("miamiii"));
      w.close();
    }, 900);
  }, 400);
}, 1200);
