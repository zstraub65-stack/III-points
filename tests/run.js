#!/usr/bin/env node
/* Runs every *-test.js plus verify.js, and fails loudly. Needs jsdom:
   npm install --no-save jsdom   */
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");

const files = fs.readdirSync(__dirname)
  .filter(f => (f.endsWith("-test.js") || f === "verify.js"))
  .sort();

let bad = [];
for (const f of files) {
  let out = "";
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, f)], {
      encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "") + "\nFAIL process exited non-zero: " + e.message;
  }
  // A test fails if it says so, throws, or reports a bug. It ALSO fails if it
  // prints a bare `false`, because older tests log booleans instead of
  // asserting, and one of those sat green for hours while quietly failing.
  const hits = out.split("\n").filter(l =>
    /\bFAIL\b|\(BUG\)|^\s*Error:|Cannot read|not ok/.test(l) ||
    /:\s*false\s*$/.test(l));
  if (hits.length) bad.push({ f, hits: hits.slice(0, 6) });
  console.log((hits.length ? "FAIL  " : "ok    ") + f);
}
if (bad.length) {
  console.log("\n" + bad.length + " file(s) with failures:");
  bad.forEach(b => console.log("\n--- " + b.f + "\n" + b.hits.join("\n")));
  process.exit(1);
}
console.log("\nall " + files.length + " test files clean");
