/* The modal has to get people named. The old one asked for a crew name and
   threw the text away when you pressed "Stay", which is why three of seven
   people on the real board show as "Someone". */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "public", "index.html");
const { JSDOM, VirtualConsole } = require("jsdom");

/* hashchange calls location.reload(), which jsdom cannot do. That is the real
   behaviour and the test asserts the hash, so swallow only that complaint. */
const quiet = () => {
  const vc = new VirtualConsole();
  vc.sendTo(console, { omitJSDOMErrors: true });
  vc.on("jsdomError", e => {
    if (!/Not implemented: navigation/.test(e.message)) console.error(e);
  });
  return vc;
};
const html = fs.readFileSync(PAGE, "utf8");

const posts = [];
let store = {};
function boot(hash, seed) {
  posts.length = 0;
  store = Object.assign({ "iiip26-pid": "nico" }, seed || {});
  const dom = new JSDOM(html, {
    virtualConsole: quiet(),
    runScripts: "dangerously",
    url: "https://iii-points.zstraub65.workers.dev/" + (hash || ""),
    beforeParse(w) {
      w.fetch = (u, o) => {
        if (o && o.method === "POST") { posts.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: "miamiii", people: [] }) });
      };
      try { w.localStorage.clear(); Object.entries(store).forEach(([k, v]) => w.localStorage.setItem(k, v)); } catch (e) {}
    }
  });
  return dom;
}
const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("=== a new person lands on the shared link");
  let dom = boot(), w = dom.window, d = w.document;
  await wait(1200);
  ck("modal shows", !d.getElementById("welcome").hidden, true);
  ck("asks for their name, not a crew name", d.getElementById("wName").placeholder, "your name");
  ck("crew field is not shown up front", d.getElementById("wCrewBox").hidden, true);
  ck("primary button names the crew", d.getElementById("wJoin").textContent, "Join miamiii");

  console.log("\n=== they type their name and join");
  d.getElementById("wName").value = "Nico";
  d.getElementById("wJoin").click();
  await wait(900);
  const named = posts.find(p => p.name === "Nico");
  ck("name reaches the server", !!named, true);
  ck("stored locally", w.localStorage.getItem("iiip26-name"), "Nico");
  ck("Crews panel field agrees", d.getElementById("nameIn").value, "Nico");
  ck("modal closed", d.getElementById("welcome").hidden, true);
  ck("will not nag again", w.localStorage.getItem("iiip26-welcomed"), "1");
  dom.window.close();

  console.log("\n=== empty name is refused, nothing is silently lost");
  dom = boot(); w = dom.window; d = w.document;
  await wait(1200);
  d.getElementById("wJoin").click();
  await wait(400);
  ck("modal stays open", d.getElementById("welcome").hidden, false);
  ck("no name posted", posts.filter(p => p.name).length, 0);
  ck("nothing marked as welcomed yet", w.localStorage.getItem("iiip26-welcomed"), null);

  console.log("\n=== the different-group path still works, and keeps the name");
  d.getElementById("wName").value = "Bethany";
  d.getElementById("wOther").click();
  ck("crew field revealed on request", d.getElementById("wCrewBox").hidden, false);
  d.getElementById("wCrew").value = "Drum Boston";
  d.getElementById("wMake").click();
  await wait(900);
  ck("name saved before navigating", w.localStorage.getItem("iiip26-name"), "Bethany");
  ck("slugged and moved to the new crew", w.location.hash, "#board=drum-boston");
  dom.window.close();

  console.log("\n=== a returning person who opens it from Crews");
  dom = boot("", { "iiip26-name": "Zack", "iiip26-welcomed": "1" }); w = dom.window; d = w.document;
  await wait(1200);
  ck("not shown unprompted", d.getElementById("welcome").hidden, true);
  d.getElementById("crewsBtn").click();
  await wait(100);
  ck("opens on demand", d.getElementById("welcome").hidden, false);
  ck("prefilled with their name", d.getElementById("wName").value, "Zack");
  ck("the X still closes it", (d.getElementById("wClose").click(), d.getElementById("welcome").hidden), true);
  dom.window.close();

  console.log("\n=== the old trap: typing a name then dismissing");
  dom = boot(); w = dom.window; d = w.document;
  await wait(1200);
  ck("no button that discards the field", !!d.getElementById("wStay"), false);
  dom.window.close();

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  if (fail.length) process.exit(1);
})();
