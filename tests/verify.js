const fs = require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PAGE=path.join(ROOT,"public","index.html");
const WORKER=path.join(ROOT,"worker-entry.js");
const s = fs.readFileSync(PAGE, "utf8");
const js = s.slice(s.indexOf("<script>") + 8, s.lastIndexOf("</script>"));

function obj(name) {
  const start = js.indexOf("const " + name + "={");
  const i = js.indexOf("{", start);
  let depth = 0, inStr = false, esc = false;
  for (let p = i; p < js.length; p++) {
    const c = js[p];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") depth++;
    if (c === "}") { depth--; if (!depth) return eval("(" + js.slice(i, p + 1) + ")"); }
  }
}
function arr(name) {
  const i = js.indexOf("const " + name + "=[");
  const j = js.indexOf("\n];", i);
  return eval(js.slice(i + ("const " + name + "=").length, j + 2));
}

const FRI = arr("FRI"), SAT = arr("SAT");
const REC = obj("REC"), NOTE = obj("NOTE"), INFO = obj("INFO");

const keys = new Set([...Object.keys(REC), ...Object.keys(NOTE), ...Object.keys(INFO)]);
const all = [...FRI.map(r => "fri|" + r[1]), ...SAT.map(r => "sat|" + r[1])];
const matched = all.filter(k => keys.has(k));
const orphan = [...keys].filter(k => !all.includes(k));

console.log("REC", Object.keys(REC).length, "| NOTE", Object.keys(NOTE).length, "| INFO", Object.keys(INFO).length);
console.log("sets carrying a note:", matched.length, "of", all.length);
console.log("notes matching no set on the grid:", orphan.length ? orphan : "none");
