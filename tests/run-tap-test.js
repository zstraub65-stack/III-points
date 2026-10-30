/* The running order should say who is joining you, and open the set when you
   tap it. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const people = [
  { person: "zack", name: "Zack", sets: ["fri|Levity", "fri|Wooli"], at: null },
  { person: "v", name: "Vrushi", sets: ["fri|Levity"], at: null },
  { person: "s", name: "Sumit", sets: ["fri|Levity"], at: null },
  { person: "n", name: "Nicolas", sets: ["fri|Wooli"], at: null }
];
const vc = new VirtualConsole(); vc.sendTo(console, { omitJSDOMErrors: true });
const dom = new JSDOM(html, {
  virtualConsole: vc, runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/#board=edc",
  beforeParse(w) {
    w.fetch = (u, o) => o && o.method === "POST"
      ? Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      : Promise.resolve({ ok: true, json: () => Promise.resolve({ board: "edc", people }) });
    try {
      w.localStorage.clear();
      w.localStorage.setItem("edc26-pid", "zack");
      w.localStorage.setItem("edc26-welcomed", "1");
      w.localStorage.setItem("edc26-mine", JSON.stringify(["fri|Levity", "fri|Wooli"]));
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
const rowFor = n => [...d.querySelectorAll("#run [data-run]")].find(x => x.dataset.run === n);

(async () => {
  await wait(1400);
  console.log("=== the running order");
  ck("lists your picks", d.querySelectorAll("#run [data-run]").length, 2);
  ck("rows are reachable by keyboard", rowFor("Levity").getAttribute("tabindex"), "0");
  ck("and announced as controls", rowFor("Levity").getAttribute("role"), "button");

  console.log("\n=== who is joining you");
  ck("two others on Levity", rowFor("Levity").querySelectorAll(".runmk").length, 2);
  ck("one on Wooli", rowFor("Wooli").querySelectorAll(".runmk").length, 1);
  ck("named in the tooltip", [...rowFor("Levity").querySelectorAll(".runmk")].map(i => i.getAttribute("title")).sort(), ["Sumit", "Vrushi"]);
  ck("the bare count is gone", /with 2/.test(rowFor("Levity").textContent), false);

  console.log("\n=== tapping opens that set");
  rowFor("Levity").click();
  await wait(120);
  const sheet = d.getElementById("sheet");
  ck("sheet opened", sheet.classList.contains("on"), true);
  ck("on the right set", sheet.dataset.n, "Levity");
  ck("and lists them by name", /Vrushi/.test(sheet.textContent) && /Sumit/.test(sheet.textContent), true);
  ck("without the one who is not going", /Nicolas/.test(sheet.textContent), false);
  d.querySelector("#sheet button[data-close]").click();
  await wait(80);

  console.log("\n=== keyboard");
  const ev = new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true });
  rowFor("Wooli").dispatchEvent(ev);
  await wait(120);
  ck("Enter opens it too", d.getElementById("sheet").dataset.n, "Wooli");
  ck("shows who is on that one", /Nicolas/.test(d.getElementById("sheet").textContent), true);
  d.querySelector("#sheet button[data-close]").click();
  await wait(80);

  console.log("\n=== a set nobody else picked");
  w.eval("mine.add('fri|Azzeca');draw()");
  await wait(80);
  const solo = rowFor("Azzeca");
  ck("still listed", !!solo, true);
  ck("no markers", solo.querySelectorAll(".runmk").length, 0);
  ck("still tappable", (solo.click(), d.getElementById("sheet").dataset.n), "Azzeca");

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  setTimeout(() => dom.window.close(), 100);
  if (fail.length) process.exitCode = 1;
})();
