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

test("radar: a stopped feed with its count frozen is 'no data', a real collapse is 'down'", () => {
  const { assess } = load(dock, ["median", "assess"]);
  const now = Date.now(), stop = new Date(now - 107 * 60000).toISOString(), s = [];
  for (let t = now - 115 * 60000; t <= now; t += 5 * 60000) s.push({ t, c: { "10.0.0.1": 1981, "10.0.0.2": t > now - 15 * 60000 ? 40 : 600, "10.0.0.3": 500 } });
  const r = assess({ at: now, s, feed: [
    { ip: "10.0.0.1", name: "RO A", open: 1981, healthy: false, newest: stop }, // feed stopped, count frozen
    { ip: "10.0.0.2", name: "RO B", open: 40, healthy: true, newest: new Date(now).toISOString() }, // sessions really gone
    { ip: "10.0.0.3", name: "RO C", open: 500, healthy: true, newest: new Date(now).toISOString() } ] });
  const lv = Object.fromEntries(r.list.map((x) => [x.name, x.level]));
  assert.deepEqual(lv, { "RO B": "down", "RO A": "nofeed", "RO C": "ok" });
  assert.equal(r.list.find((x) => x.name === "RO A").since, Date.parse(stop));
  assert.equal(r.alerts.length, 2);
});

test("customers on a router with no data show unknown, not online", () => {
  const feedStuck = new Map([["PUNUNG", 1]]);
  const { state } = load(dock, ["roWord", "stuckSince", "state"], { feedStuck });
  assert.equal(state({ router: "RO PUNUNG NEW", online: true }), "unk");
  assert.equal(state({ router: "RO PUNUNG", online: false }), "unk");
  assert.equal(state({ router: "RO PUNUNG NEW", online: true, isolir: true }), "iso");
  assert.equal(state({ router: "RO JATIGUNUNG", online: true }), "on");
  assert.equal(state({ router: "RO JATIGUNUNG", online: false }), "off");
});

test("activation: the install location's coordinates, also when Maps is a short link", () => {
  const { installAt: where } = load(dock, ["installAt"]);
  assert.deepEqual(where({ shareLokasiGmaps: "-8.131233, 111.164841" }), { lat: -8.131233, lng: 111.164841 });
  assert.deepEqual(where({ shareLokasiGmaps: "https://maps.app.goo.gl/abc", lokasiLat: -8.2055714, lokasiLng: 111.3296527 }), { lat: -8.2055714, lng: 111.3296527 });
  assert.deepEqual(where({ shareLokasiGmaps: "https://maps.app.goo.gl/abc", installationLocationCheck: { registrationCoord: { lat: -8.1, lng: 111.2 } } }), { lat: -8.1, lng: 111.2 });
  assert.equal(where({ shareLokasiGmaps: "https://maps.app.goo.gl/abc" }), null);
});

test("radar: a router's crew is the field teams and KA covering most of its customers", () => {
  const field1 = { name: "TIM KARANG 1 (ANDI)", members: [{ n: "ANDI WIJAYA", lead: true }, { n: "BUDI SANTOSO" }] };
  const field2 = { name: "TIM KARANG 2 (CAHYO)", members: [{ n: "CAHYO PRATAMA" }] };
  const ka = { name: "KA KARANG MULYO", members: [{ n: "DEDI KURNIA" }] }, other = { name: "TIM KOTA 1", members: [{ n: "EKO" }] };
  const copy = (t) => ({ ...t, members: [...t.members] }); // every village has its own copy of a team, as in techIndex
  const map = { karang: [field1, ka], sumber: [field2, copy(ka)], kota: [other], wetan: [copy(field1)], kulon: [copy(field1)], lor: [{ name: "Tanpa tim", members: [{ n: "FAJAR" }] }] };
  const customers = [...Array(40)].map((_, i) => ({ router: "RO KARANG", desa: i < 8 ? "Karang" : i < 16 ? "Wetan" : i < 25 ? "Kulon" : i < 36 ? "Sumber" : i < 38 ? "Kota" : "Lor" }))
    .concat([{ router: "RO KARANG", desa: "Kota", isInactive: true }, { router: "RO LAIN", desa: "Kota" }]);
  const { crewOf, crewLine } = load(dock, ["crews", "crewOf", "crewLine", "teamKind", "titleCase"],
    { techMap: { at: 1 }, customers, teamsFor: (d) => map[d.toLowerCase()] || [] }, ["crewOf", "crewLine"]);
  const crew = crewOf("RO KARANG");
  assert.deepEqual(crew.field.map((t) => t.name), ["TIM KARANG 1 (ANDI)", "TIM KARANG 2 (CAHYO)"]); // TIM KARANG 1 counted over its three villages; TIM KOTA 1 has 2 of 40
  assert.deepEqual(crew.ka.map((t) => t.name), ["KA KARANG MULYO"]);
  assert.equal(crewLine(crew), "Tim Karang 1 (Andi), Tim Karang 2 (Cahyo) · KA Dedi Kurnia");
  assert.equal(crewOf("RO NONE"), null);
});

test("bulk lunas: a pasted name and village finds the customer there, the village code breaking ties", () => {
  const rows = [["darmo0904", "DJARMO KARANGREJO", "Karangrejo"], ["jarmo0904", "JARMO SUMBERAGUNG", "Sumberagung"], ["jarmo0511", "JARMO WETAN", "Wetan"],
    ["sutini0904", "SUTINI SUMBERAGUNG", "Sumberagung"], ["sutini0612", "SUTINI ASIH SUMBERAGUNG", "Sumberagung"], ["budi0904", "BUDI SUMBERAGUNG", "Sumberagung"]];
  const { fold } = load(dock, ["fold"]);
  const customers = rows.map(([username, nama, desa]) => ({ username, nama, desa, _name: fold(nama) }));
  const { nameLookup: byName } = load(dock, ["codeOf", "villageIndex", "nameLookup", "sound", "vkey"], { customers, fold, villages: null, fuzzyHit: () => false }, ["nameLookup"]);
  const best = byName("Djarmo Sumberagung");
  assert.equal(best[0].r.username, "jarmo0904"); // the Jarmo in that village, not darmo0904 elsewhere
  assert.equal(best.length, 1);
  const two = byName("Sutini Sumberagung");
  assert.deepEqual(two.map((h) => h.r.username), ["sutini0904", "sutini0612"]); // both fit; the village's code first
  assert.equal(byName("Jarmo")[0].vil, ""); // no village named: every Jarmo
  assert.equal(best[0].score, 4); // sounds like the name (2), the village's code (1), the username spells the name (1)
});

test("topology: routers that fail together are traced to where it starts", () => {
  const map = "RO CORE > RO HUB, RO NORTH, RO EAST\nRO HUB > RO ALPHA, RO BETA, RO GAMMA\nRO ALPHA > RO ALPHA SATU, RO ALPHA DUA, OLT ALPHA\nRO LONE";
  const names = ["TOPO", "topoKey", "topology", "topoState", "topoBad", "topoFaults", "faultText", "topoName"];
  const run = (levels) => {
    const list = Object.entries(levels).map(([name, level], i) => ({ name, ip: `10.0.0.${i}`, level, open: level === "ok" ? 100 : 5, usual: 100, gap: level === "ok" ? 0 : 95 }));
    const { topoFaults, faultText } = load(dock, names, { ls: { get: () => map }, topoMemo: null }, ["topoFaults", "faultText"]);
    const t = topoFaults({ list }); return { t, ft: faultText, f: t.faults, text: t.faults.map((f) => faultText(t, f).head) };
  };
  // a router and its whole branch: one fault, at the top of it
  let r = run({ "RO HUB": "ok", "RO ALPHA": "down", "RO ALPHA SATU": "down", "RO ALPHA DUA NEW": "down", "RO BETA": "ok", "RO NORTH": "ok" });
  assert.deepEqual(r.text, ["RO ALPHA down and 2 behind it"]);
  // two branches of a router that is fine: the fault is on that router's side
  r = run({ "RO HUB": "ok", "RO ALPHA": "ok", "RO BETA": "down", "RO GAMMA": "drop", "RO NORTH": "ok" });
  assert.deepEqual(r.text, ["Likely at RO HUB: 2 branches below it failing at once"]);
  // the core reports nothing (no customers of its own): its failing branches point at it
  r = run({ "RO HUB": "down", "RO NORTH": "down", "RO EAST": "ok", "RO ALPHA": "down" });
  assert.equal(r.f.length, 1); assert.equal(r.f[0].at, "CORE"); assert.deepEqual(r.f[0].behind, ["HUB", "ALPHA", "NORTH"]);
  // a router only dropping doesn't swallow a branch that is down below it: two faults, the deeper one named for its branch
  r = run({ "RO HUB": "drop", "RO ALPHA": "down", "RO ALPHA SATU": "down", "RO BETA": "ok", "RO NORTH": "ok" });
  assert.deepEqual(r.f.map((f) => [f.at, f.behind]).sort(), [["ALPHA", ["ALPHA SATU"]], ["HUB", []]]);
  assert.match(r.ft(r.t, r.f.find((f) => f.at === "ALPHA")).body, /RO HUB upstream is dropping too/);
  // nothing on the map failing: no faults
  assert.equal(run({ "RO HUB": "ok", "RO LONE": "ok" }).f.length, 0);
});

test("outage history: routers failing within 15 minutes are one event, placed at the top of the branch", () => {
  const map = "RO CORE > RO HUB, RO NORTH\nRO HUB > RO ALPHA, RO BETA\nRO ALPHA > RO ALPHA SATU";
  const { histEvents } = load(dock, ["TOPO", "topoKey", "topology", "topoState", "topoName", "HIST_GAP", "histEvents"], { ls: { get: () => map }, topoMemo: null }, ["histEvents"]);
  const t0 = Date.now() - 86400000, m = 60000;
  const inc = (name, start, mins, level = "down") => ({ kind: "router", key: name, title: `Router ${name}`, start: t0 + start * m, end: t0 + (start + mins) * m, state: "recovered", level, peak: 100, log: [] });
  const { events } = histEvents([
    inc("RO ALPHA", 0, 60), inc("RO ALPHA SATU", 5, 50),       // one branch: one event at ALPHA
    inc("RO ALPHA", 300, 20, "nofeed"), inc("RO BETA", 310, 20, "nofeed"), // two branches of HUB together: at HUB
    inc("RO NORTH", 600, 30), inc("RO LAIN", 900, 10),          // on its own; one not on the map
  ], t0 - m);
  assert.deepEqual(events.map((e) => [e.where.join("+"), e.behind, e.level]), [["RO ALPHA", 1, "down"], ["RO HUB", 1, "nofeed"], ["RO NORTH", 0, "down"], ["RO LAIN", 0, "down"]]);
});
