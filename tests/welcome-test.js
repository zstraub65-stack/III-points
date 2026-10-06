/* Boot sanity on the bare link: right default board, no script errors, and the
   crews panel agrees with the URL. The modal's own behaviour is covered in
   welcome-name-test.js. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

function boot(url, storage) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.sendTo(console, { omitJSDOMErrors: true });
  vc.on("jsdomError", e => { if (!/Not implemented: navigation/.test(e.message)) errs.push(String(e.message)); });
  const dom = new JSDOM(html, {
    virtualConsole: vc, runScripts: "dangerously", url,
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
const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("=== bare link, first visit");
  let a = boot("https://iii-points.zstraub65.workers.dev/", {});
  await wait(1300);
  let d = a.dom.window.document;
  ck("no script errors", a.errs, []);
  ck("defaults to the main crew", d.getElementById("boardName").textContent, "miamiii");
  ck("newcomer is prompted", !d.getElementById("welcome").hidden, true);
  ck("prompt names the crew they landed on", /miamiii/.test(d.getElementById("welcome").innerHTML), true);
  ck("grid rendered", d.querySelectorAll(".blk").length > 100, true);
  a.dom.window.close();

  console.log("\n=== a crew link, returning visitor");
  a = boot("https://iii-points.zstraub65.workers.dev/#board=boston-crew", { "iiip26-welcomed": "1" });
  await wait(1300);
  d = a.dom.window.document;
  ck("no script errors", a.errs, []);
  ck("not prompted again", d.getElementById("welcome").hidden, true);
  ck("crews panel reads the crew from the URL", d.getElementById("boardName").textContent, "boston-crew");
  a.dom.window.close();

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  if (fail.length) process.exit(1);
})();
