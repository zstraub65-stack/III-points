/* The page half: leaving has to silence this browser, and being removed by
   somebody else has to silence it too, without the leaver doing anything. */
const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(PAGE, "utf8");

const DOORS_FRI = Date.UTC(2026, 9, 16, 20, 0, 0);
const at = (h, m) => DOORS_FRI + ((h - 16) * 60 + m) * 60000;
let CLOCK = at(23, 30);
let BLOCK = false;                       // flip on to make the server refuse writes

const board = {
  people: [
    { person: "zack", name: "Zack", sets: ["fri|Hamdi"], at: null },
    { person: "cowork", name: "Dev", sets: [], at: null }
  ]
};

const posts = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iii-points.zstraub65.workers.dev/#board=miamiii",
  beforeParse(w) {
    const RealDate = w.Date;
    w.Date = class extends RealDate {
      constructor(...a) { if (!a.length) super(CLOCK); else super(...a); }
      static now() { return CLOCK; }
      static UTC(...a) { return RealDate.UTC(...a); }
    };
    w.fetch = (u, o) => {
      const b = decodeURIComponent(String(u).split("board=")[1] || "");
      if (o && o.method === "POST") {
        const body = JSON.parse(o.body); posts.push(body);
        if (BLOCK && !body.rejoin && !body.leave && !body.remove)
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, blocked: true }) });
        if (body.leave) board.people = board.people.filter(x => x.person !== body.person);
        if (body.remove) board.people = board.people.filter(x => x.person !== body.remove);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: b, people: b === "miamiii" ? board.people : [] }) });
    };
    try { w.localStorage.clear(); w.localStorage.setItem("iiip26-pid", "zack"); } catch (e) {}
  }
});
const w = dom.window, d = w.document;
const leaveBtn = () => d.getElementById("leaveBtn");
const since = n => posts.slice(n);
const fail = [];
const ck = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail.push(label + " -> got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log((ok ? "  ok   " : "  FAIL ") + label);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

setTimeout(async () => {
  console.log("=== before leaving, picks still save normally");
  let n = posts.length;
  d.querySelector('.blk[data-n="Levity"]').click();
  d.querySelector('#sheet button[data-go="1"]').click();
  await wait(800);
  ck("a pick is pushed", since(n).some(p => Array.isArray(p.sets)), true);

  console.log("\n=== first tap only arms the button");
  n = posts.length;
  leaveBtn().click();
  await wait(100);
  ck("nothing sent yet", since(n).length, 0);
  ck("button asks again", leaveBtn().textContent, "Tap again to remove yourself");

  console.log("\n=== second tap leaves");
  leaveBtn().click();
  await wait(200);
  ck("leave sent", since(n).some(p => p.leave === true), true);
  ck("flag stored", JSON.parse(w.localStorage.getItem("iiip26-left")), ["miamiii"]);
  ck("button offers a way back", leaveBtn().textContent, "Rejoin this crew");

  console.log("\n=== this is what used to resurrect him");
  n = posts.length;
  d.querySelector('.blk[data-n="Hamdi"]').click();
  d.querySelector('#sheet button[data-go="1"]').click();
  await wait(800);
  ck("toggling a pick sends nothing", since(n).length, 0);

  d.querySelector('.blk[data-n="Hamdi"]').click();
  const sheetTxt = d.getElementById("sheet").textContent;
  d.querySelector('#sheet button[data-checkin]').click();
  await wait(200);
  ck("checking in sends nothing", since(n).length, 0);

  w.dispatchEvent(new w.Event("online"));
  await wait(800);
  ck("the online event sends nothing", since(n).filter(p => !!p.sets || !!p.name).length, 0);
  ck("picks still kept on this device", w.localStorage.getItem("iiip26-mine").length > 2, true);

  console.log("\n=== rejoining");
  n = posts.length;
  leaveBtn().click();
  await wait(300);
  const rj = since(n).find(p => p.rejoin);
  ck("rejoin sent", !!rj, true);
  ck("carries the picks back up", Array.isArray(rj.sets), true);
  ck("flag cleared", JSON.parse(w.localStorage.getItem("iiip26-left")), []);
  n = posts.length;
  d.querySelector('.blk[data-n="Levity"]').click();
  d.querySelector('#sheet button[data-go="0"]').click();
  await wait(800);
  ck("writes work again", since(n).some(p => Array.isArray(p.sets)), true);

  console.log("\n=== removed by somebody else, with no action from me");
  BLOCK = true;
  n = posts.length;
  d.querySelector('.blk[data-n="Levity"]').click();
  d.querySelector('#sheet button[data-go="1"]').click();
  await wait(800);
  ck("the refusal is believed", JSON.parse(w.localStorage.getItem("iiip26-left")), ["miamiii"]);
  n = posts.length;
  w.dispatchEvent(new w.Event("online"));
  await wait(800);
  ck("and it stops trying", since(n).filter(p => !!p.sets).length, 0);
  BLOCK = false;
  leaveBtn().click(); await wait(300);          // back on for the next part

  console.log("\n=== removing somebody else");
  // the leave tests above deleted zack from the fake board; put the crew back
  board.people = [
    { person: "zack", name: "Zack", sets: ["fri|Hamdi"], at: null },
    { person: "cowork", name: "Dev", sets: [], at: null }
  ];
  w.eval("pull()");
  await wait(300);
  w.eval("openPerson('cowork')");
  let sh = d.getElementById("sheet");
  ck("their card offers it", !!sh.querySelector("button[data-drop]"), true);
  n = posts.length;
  sh.querySelector("button[data-drop]").click();
  await wait(50);
  ck("first tap only arms", since(n).length, 0);
  sh.querySelector("button[data-drop]").click();
  await wait(300);
  ck("removal sent", since(n).some(p => p.remove === "cowork"), true);
  ck("he is off the crew", board.people.map(p => p.person), ["zack"]);

  console.log("\n=== you cannot remove yourself from your own card");
  w.eval("openPerson('zack')");
  ck("no button on your own card", !!d.getElementById("sheet").querySelector("button[data-drop]"), false);

  console.log(fail.length ? "\n" + fail.length + " FAILURES:\n" + fail.join("\n") : "\nall assertions passed");
  setTimeout(() => dom.window.close(), 200);
}, 1400);
