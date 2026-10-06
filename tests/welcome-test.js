/* A newcomer opens Zack's bare link, names their own crew, and lands on it.
   Then confirm a returning visitor is not asked again. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

function boot(url, storage) {
  const errs = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url,
    beforeParse(w) {
      w.addEventListener("error", e => errs.push(String(e.error || e.message)));
      w.fetch = (u) => {
        const b = decodeURIComponent(String(u).split("board=")[1] || "");
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: b, people: [] }) });
      };
      try {
        w.localStorage.clear();
        Object.entries(storage || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
      } catch (e) {}
    }
  });
  return { dom, errs };
}

// --- first visit on the bare link
const a = boot("https://iii-points.zstraub65.workers.dev/", {});
setTimeout(() => {
  const d = a.dom.window.document;
  const w = d.getElementById("welcome");
  console.log("errors:", a.errs.length ? a.errs : "none");
  console.log("newcomer is asked which crew:", w && !w.hidden);
  console.log("prompt names the crew they landed on:", /miamiii/.test(w.innerHTML));

  // they name their own
  d.getElementById("wName").value = "Boston Crew!!";
  d.getElementById("wMake").click();
  setTimeout(() => {
    console.log("hash after naming their crew:", a.dom.window.location.hash);
    console.log("name was slugged safely:", a.dom.window.location.hash === "#board=boston-crew");
    console.log("welcome flag set so they are not asked again:", !!a.dom.window.localStorage.getItem("iiip26-welcomed"));
    a.dom.window.close();

    // --- returning visitor
    const b = boot("https://iii-points.zstraub65.workers.dev/#board=boston-crew", { "iiip26-welcomed": "1" });
    setTimeout(() => {
      const d2 = b.dom.window.document;
      const w2 = d2.getElementById("welcome");
      console.log("\nreturning visitor asked again:", w2 && !w2.hidden ? "YES (bug)" : "no");
      console.log("their crew reads as:", JSON.stringify(d2.getElementById("boardName").textContent));
      b.dom.window.close();
    }, 1200);
  }, 300);
}, 1200);
