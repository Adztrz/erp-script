// Builds erp-fast.user.js from src/: the parts joined in file-name order, exactly as written. The script is one
// closure, so the parts aren't modules: each is a stretch of that closure, cut at the script's own section headings,
// and joining them gives back the same code. Tampermonkey installs the built file.
//
//   node build.mjs          write erp-fast.user.js
//   node build.mjs --check  fail if erp-fast.user.js isn't what src/ builds (run before committing)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "erp-fast.user.js";
const parts = readdirSync("src").filter((f) => /^\d{3}-.+\.js$/.test(f)).sort();
const built = parts.map((f) => readFileSync(`src/${f}`, "utf8")).join("");

if (process.argv.includes("--check")) {
  if (readFileSync(OUT, "utf8") !== built) { console.error(`${OUT} is out of date: run node build.mjs`); process.exit(1); }
  console.log(`${OUT} matches src/ (${parts.length} parts)`);
} else {
  writeFileSync(OUT, built);
  execFileSync(process.execPath, ["--check", OUT], { stdio: "inherit" }); // a syntax error stops here, not in Tampermonkey
  console.log(`built ${OUT} from ${parts.length} parts, ${built.split("\n").length} lines`);
}
