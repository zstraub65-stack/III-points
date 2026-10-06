/* Check the first and last sets sit inside the track with room to spare, and
   that every block still lines up with its real time. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/#board=t",
  beforeParse(w) {
    w.fetch = u => {
      const b = decodeURIComponent(String(u).split("board=")[1] || "");
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: b, people: [] }) });
    };
    try { w.localStorage.clear(); } catch (e) {}
  }
});

setTimeout(() => {
  const d = dom.window.document;
  const px = el => parseFloat(el.style.top);

  const blocks = [...d.querySelectorAll(".blk")];
  const tops = blocks.map(px);
  console.log("blocks:", blocks.length);
  console.log("highest block top:", Math.min(...tops), "px  (0 would mean flush against the header)");

  const track = d.querySelector(".col .track");
  const h = parseFloat(track.style.height);
  const lowest = Math.max(...blocks.map(b => px(b) + parseFloat(b.style.height)));
  console.log("track height:", h, "| lowest block bottom:", lowest.toFixed(1), "| fits:", lowest <= h);

  // the 4PM tick should also clear the top
  const ticks = [...d.querySelectorAll(".tick")];
  console.log("first hour label:", JSON.stringify(ticks[0].textContent), "at top", px(ticks[0]));

  // spot-check that a known set still maps to its real time
  const PPM = 1.5, PAD = 18;
  const check = (name, startMin) => {
    const el = blocks.find(b => b.dataset.n === name);
    const want = startMin * PPM + PAD;
    console.log(name + ": top", px(el), "expected", want, "|", px(el) === want ? "correct" : "WRONG");
  };
  check("Ackdaddy", 0);            // 4:00pm, first slot of the day
  check("Parcels", (20 * 60) + 45 - (16 * 60));  // 8:45pm
  dom.window.close();
}, 1300);
