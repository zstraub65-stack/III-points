/* Three crews, several people each. Check shapes are per-crew, colours are unique
   within a crew, and tapping a person shows their lineup with shared sets marked. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const BOARDS = {
  miamiii: [
    { person: "p-zack", name: "Zack", sets: ["fri|Hamdi", "sat|KETTAMA", "sat|VTSS"] },
    { person: "p-winston", name: "Winston", sets: ["fri|Parcels", "sat|KETTAMA"] },
    { person: "p-cara", name: "Cara", sets: ["fri|Hamdi"] }
  ],
  boston: [
    { person: "b-dana", name: "Dana", sets: ["fri|Hamdi", "sat|Underworld"] },
    { person: "b-lee", name: "Lee", sets: ["sat|VTSS"] }
  ],
  stpete: [{ person: "s-marco", name: "Marco", sets: ["sat|KETTAMA"] }]
};

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/#board=miamiii",
  beforeParse(w) {
    w.fetch = (u, o) => {
      const b = decodeURIComponent(String(u).split("board=")[1] || "");
      if (o && o.method === "POST") return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: b, people: BOARDS[b] || [] }) });
    };
    try { w.localStorage.clear(); w.localStorage.setItem("iiip26-pid", "p-zack"); w.localStorage.setItem("iiip26-mine", JSON.stringify(["fri|Hamdi","sat|KETTAMA","sat|VTSS"])); } catch (e) {}
  }
});

const d = dom.window.document;

setTimeout(() => {
  d.getElementById("followIn").value = "boston";
  d.getElementById("followBtn").click();
  d.getElementById("followIn").value = "stpete";
  d.getElementById("followBtn").click();

  setTimeout(() => {
    // shapes per crew
    const rows = [...d.querySelectorAll(".person[data-pid]")];
    const byCrew = {};
    rows.forEach(r => {
      const pid = r.dataset.pid;
      const crew = pid.startsWith("p-") ? "miamiii" : pid.startsWith("b-") ? "boston" : "stpete";
      const shape = [...r.querySelector(".dot").classList].find(c => c.startsWith("mk-"));
      const colour = r.querySelector(".dot").style.background;
      (byCrew[crew] = byCrew[crew] || []).push({ pid, shape, colour });
    });
    Object.entries(byCrew).forEach(([crew, mem]) => {
      const shapes = new Set(mem.map(m => m.shape));
      const colours = new Set(mem.map(m => m.colour));
      console.log(crew + ": shape(s)", [...shapes].join(","), "| one shape per crew:", shapes.size === 1,
        "| distinct colours:", colours.size === mem.length);
    });
    const allShapes = Object.values(byCrew).map(m => m[0].shape);
    console.log("crews use different shapes:", new Set(allShapes).size === allShapes.length, allShapes);
    console.log("your crew is the triangle:", byCrew.miamiii[0].shape === "mk-tri");

    // grid markers carry shapes too
    const gm = d.querySelector(".blk .crew i");
    console.log("grid marker has a shape class:", gm && [...gm.classList].some(c => c.startsWith("mk-")));

    // tap a person
    const dana = rows.find(r => r.dataset.pid === "b-dana");
    dana.click();
    const sheet = d.getElementById("sheet");
    const txt = sheet.textContent;
    console.log("\nopened Dana:", /Dana/.test(txt), "| shows her crew:", /boston/.test(txt));
    console.log("lists her sets:", /Hamdi/.test(txt) && /Underworld/.test(txt));
    console.log("flags the one you share:", /you too/.test(txt));
    console.log("counts shared sets:", /both down for 1 set/.test(txt));

    // a person with nothing in common
    d.querySelector('#sheet button[data-close]').click();
    rows.find(r => r.dataset.pid === "b-lee").click();
    const leeTxt=d.getElementById("sheet").textContent;
    console.log("Lee shares VTSS, so wording is:", /both down for 1 set/.test(leeTxt)?"shared count":/Nothing in common/.test(leeTxt)?"nothing in common":"?");
    // and someone with genuinely no overlap
    d.querySelector("#sheet button[data-close]").click();
    rows.find(r=>r.dataset.pid==="p-winston").click();
    const wTxt=d.getElementById("sheet").textContent;
    console.log("Winston (shares KETTAMA) wording:", /both down for 1 set/.test(wTxt));

    dom.window.close();
  }, 500);
}, 1300);
