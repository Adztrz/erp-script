// Tests for the logic where a mistake would cost most: the build, the router bridge's scheduling and address check,
// replay, how long a customer has been down, and Fix RO's router matching. The functions are taken from the built
// scripts by name and run on their own, so what's tested is what Tampermonkey installs.
//
//   node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const dock = readFileSync("erp-fast.user.js", "utf8"), bridge = readFileSync("erp-router-bridge.user.js", "utf8");

// a named function or const from a script's source: `function name(…) {…}` to its closing brace, or `const name = …;`
function take(src, name) {
  const m = new RegExp(`(^|\\n)\\s*(function ${name}\\(|const ${name} = )`).exec(src); if (!m) throw new Error(`${name} not found`);
  const start = m.index + m[1].length;
  if (m[2].startsWith("const") && !/=>\s*\{/.test(src.slice(start, src.indexOf("\n", start)))) return src.slice(start, src.indexOf("\n", start)).replace(/;\s*\/\/.*$/, ";");
  let i = src.indexOf("{", src.indexOf(m[2].startsWith("const") ? "=>" : ")", start)), depth = 0;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  return src.slice(start, i + 1) + (m[2].startsWith("const") ? ";" : "");
}
// run the taken pieces together, with what they read from outside passed in
const load = (src, names, env = {}, ret = names) => new Function(...Object.keys(env), `${names.map((n) => take(src, n)).join("\n")}\nreturn { ${ret.join(", ")} };`)(...Object.values(env));

test("the parts in src/ build exactly erp-fast.user.js", () => {
  execFileSync(process.execPath, ["build.mjs", "--check"], { stdio: "pipe" });
});

test("bridge: the removal is scheduled in the router's own clock and date format", () => {
  const { later } = load(bridge, ["later"], { MON: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] });
  assert.deepEqual(later({ date: "2026-11-16", time: "02:40:05" }, 30), { date: "2026-11-16", time: "03:10:05" });
  assert.deepEqual(later({ date: "2026-12-31", time: "23:50:00" }, 30), { date: "2027-01-01", time: "00:20:00" }); // over midnight and the year
  assert.deepEqual(later({ date: "nov/30/2026", time: "23:45:00" }, 20), { date: "dec/01/2026", time: "00:05:00" }); // RouterOS before 7.10
  assert.throws(() => later({ date: "16.11.2026", time: "01:00:00" }, 5));
});

test("bridge: only forwards to customer (private) addresses", () => {
  const { privateIp } = load(bridge, ["privateIp"]);
  for (const ip of ["172.16.129.17", "172.31.0.1", "10.99.98.6", "192.168.1.1", "100.64.0.9"]) assert.equal(privateIp(ip), true, ip);
  for (const ip of ["172.32.0.1", "8.8.8.8", "103.186.193.143", "100.128.0.1", "10.0.0", "300.1.1.1", "localhost"]) assert.equal(privateIp(ip), false, ip);
});

test("replay: who was down at a past time", () => {
  const H = 3600000, now = Date.now();
  const drops = { off: { a: { from: now - 10 * H }, b: { from: now - H } }, ev: [[now - 5 * H, ["x"], []], [now - 2 * H, [], ["x"]]] };
  const { offAt } = load(dock, ["offAt"], { drops });
  const at = (h) => [...offAt(now - h * H)].sort().join(",");
  assert.equal(at(12), "");      // before anyone went down
  assert.equal(at(6), "a");      // a went down 10 h ago
  assert.equal(at(3), "a,x");    // x was down from 5 h to 2 h ago
  assert.equal(at(0.5), "a,b");  // x back, b down an hour ago
});

test("down for: minutes, hours, days", () => {
  const { lama } = load(dock, ["lama"]);
  assert.equal(lama(20000), "1 mnt");
  assert.equal(lama(23 * 60000), "23 mnt");
  assert.equal(lama(5 * 3600000), "5 jam");
  assert.equal(lama(3 * 86400000), "3 hari");
});

test("Fix RO: the session's router by its NAS address and main name", () => {
  const nasList = [{ shortname: "ARJOSARI", nasname: "103.186.193.143" }, { shortname: "RO ARJOSARI", nasname: "10.200.0.56" },
    { shortname: "RO BELAH", nasname: "10.200.0.58" }, { shortname: "RO PUNUNG NEW", nasname: "10.200.0.73" }, { shortname: "RO-NGADIROJO-E2E", nasname: "10.200.0.30" }];
  const { realRo } = load(dock, ["fold", "nameNorm", "realRo"], { nasList }, ["realRo"]);
  assert.equal(realRo({ ip: "10.200.0.73", ro: "PUNUNG" }), "RO PUNUNG NEW");
  assert.equal(realRo({ ip: "10.200.0.56", ro: "ARJOSARI" }), "RO ARJOSARI"); // not the old ARJOSARI: the address decides
  assert.equal(realRo({ ip: "10.200.0.30", ro: "RO-NGADIROJO-E2E" }), "RO-NGADIROJO-E2E");
  assert.equal(realRo({ ip: "10.200.0.58", ro: "TREMAS" }), null); // address and name disagree: no guess
  assert.equal(realRo({ ro: "PUNUNG" }), null);
});
