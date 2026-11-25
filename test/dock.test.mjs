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
  const m = new RegExp(`(^|\\n)\\s*((?:async )?function ${name}\\(|const ${name} = )`).exec(src); if (!m) throw new Error(`${name} not found`);
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

test("map redaman: all with dB on, only redaman tinggi with it off, and not twice", () => {
  const store = {}, ls = { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } };
  const el = (tag, cls, text) => ({ cls, text, style: {} });
  const ont = { a: { st: "online", rx: -21.4 }, b: { st: "online", rx: -27.1 }, c: { st: "online", rx: -29.6 }, d: { st: "offline", rx: -30 }, e: { st: "online", rx: -31 } };
  const env = { ls, el, modemOf: (c) => ({ ont: ont[c.u] }), usable: (o) => o.st === "online" && o.rx < 0 && o.rx > -40 };
  const { rxTags } = load(dock, ["RXON", "sigLevel", "rxTags"], env, ["rxTags"]);
  const list = ["a", "b", "c", "d", "e"].map((u, i) => [{ u }, i * 10, 5]), named = new Set([list[4][0]]);
  assert.deepEqual(rxTags(list, named).map((t) => t.text), ["-29,6"]); // off: redaman tinggi only, minus the one already named
  ls.set("erpDock.mapRx", true);
  assert.deepEqual(rxTags(list, named).map((t) => [t.text, t.cls]), [["-21,4", "mrx good"], ["-27,1", "mrx warn"], ["-29,6", "mrx crit"]]);
});

test("bulk lunas: a few customers at once, each one's months in order, override only for skipped older months", async () => {
  const calls = [], live = new Set(); let most = 0;
  const api = async (path, body) => { const no = body.invoiceNumbers[0], who = no.split("-")[0];
    assert.ok(!live.has(who), `${who} paid two months at once`); live.add(who); most = Math.max(most, live.size);
    await new Promise((ok) => setTimeout(ok, 5)); live.delete(who); calls.push([no, !!body.lunasiWalauAdaTertua]); return { summary: { marked: 1 } }; };
  const { limiter } = load(dock, ["limiter"]), pays = limiter(3, 6, 12000);
  const { payQueue } = load(dock, ["timed", "payQueue", "payOne"], { api, pays, settled: async () => null, payingNow: 0, unpaidIdx: null }, ["payQueue"]);
  const row = (u, n, ticks) => ({ user: u, invs: Array.from({ length: n }, (_, i) => ({ no: `${u}-${i}`, period: `m${i}`, on: ticks.includes(i), recharge: false, result: null })) });
  const rows = [row("a", 3, [0, 1, 2]), row("b", 2, [1]), row("c", 1, [0]), row("d", 2, [0, 1]), row("e", 1, [0])];
  const st = { method: "Tunai", note: "di luar kota", date: "", skipOlder: true };
  await payQueue(rows.flatMap((r) => r.invs.filter((v) => v.on).map((v) => [r, v])), st, () => {}, "x");
  assert.ok(most >= 3 && most <= 6, `${most} at once`); assert.equal(st.done, 8); assert.equal(st.phase, "done");
  assert.deepEqual(calls.filter(([n]) => n.startsWith("a")).map(([n]) => n), ["a-0", "a-1", "a-2"]);
  assert.deepEqual(calls.filter(([, o]) => o).map(([n]) => n), ["b-1"]); // only b left an older month unpaid
});

test("bulk SPK: a location after an asset's name goes to a new asset, and the cable length follows", () => {
  const ATYPE = { fdt: "FDT", fat: "FAT" }, akey = (v) => String(v ?? "").toLowerCase().replace(/[\s\-_]+/g, "");
  const typeOf = (name) => ATYPE[(/^\s*(fdt|fat)\b/i.exec(name)?.[1] || "").toLowerCase()] || null;
  const { placeAsset, metres } = load(dock, ["splitCoord", "placeAsset", "metres"], { ATYPE, akey, typeOf }, ["placeAsset", "metres"]);
  const a = placeAsset(new Map(), "FDT TEST 1 -8.2336333, 111.3113602"), b = placeAsset(new Map(), "FAT TEST 1.4 (-8.232568, 111.3132423)");
  assert.deepEqual([a.code, a.planned, a.lat, a.lng], ["FDT TEST 1", true, -8.2336333, 111.3113602]);
  assert.deepEqual([b.code, b.lat], ["FAT TEST 1.4", -8.232568]);
  assert.equal(metres(a, b), 239);
  assert.deepEqual([placeAsset(new Map(), "FAT TEST 1.1").lat, placeAsset(new Map(), "FAT TEST 1.1").code], [null, "FAT TEST 1.1"]); // "1.1" alone isn't a location
  const idx = new Map([[akey("FAT OLD 2"), [{ id: "x", kodeAset: "FAT OLD 2", tipeAset: "FAT" }]]]); // in Network Assets with no location: the typed one is used
  assert.deepEqual([placeAsset(idx, "FAT OLD 2 -8.1, 111.2").id, placeAsset(idx, "FAT OLD 2 -8.1, 111.2").lat], ["x", -8.1]);
});

test("bulk lunas pacing: more at once while answers are quick, half as many when slow or failing", async () => {
  const { limiter } = load(dock, ["limiter"]), L = limiter(3, 6, 1000);
  for (let i = 0; i < 3; i++) L.took(100, true); assert.equal(L.at, 4);
  for (let i = 0; i < 40; i++) L.took(100, true); assert.equal(L.at, 6); // never past the most
  L.took(1500, true); assert.equal(L.at, 3); L.took(100, false); assert.equal(L.at, 1); L.took(100, false); assert.equal(L.at, 1);
  let run = 0, most = 0; const M = limiter(2, 2, 1000);
  await Promise.all(Array.from({ length: 6 }, () => M.add(async () => { most = Math.max(most, ++run); await new Promise((ok) => setTimeout(ok, 5)); run--; })));
  assert.equal(most, 2);
});

test("bulk SPK from a map: each FAT from the FDT its number names, else the nearest; names tidied, repeats flagged", () => {
  const ATYPE = { fdt: "FDT", fat: "FAT", odp: "ODP" }, akey = (v) => String(v ?? "").toLowerCase().replace(/[\s\-_]+/g, "");
  const typeOf = (name) => ATYPE[(/^\s*(fdt|fat|odp)\b/i.exec(name)?.[1] || "").toLowerCase()] || null;
  const { mapRoutes } = load(dock, ["metres", "mapRoutes"], { akey, typeOf }, ["mapRoutes"]);
  const pts = [{ name: "FDT AB 1", lat: -8.2447, lng: 111.3073 }, { name: "FDT AB 2", lat: -8.2453, lng: 111.3091 },
    { name: "FAT AB 2.4", lat: -8.2451, lng: 111.3080 }, { name: "FAT AB 1.1", lat: -8.2447, lng: 111.3074 }, { name: "FAT AB 9.1", lat: -8.2453, lng: 111.3090 }, { name: "FAT AB 1.1", lat: -8.2440, lng: 111.3070 }];
  const byNumber = mapRoutes(pts, false), nearest = mapRoutes(pts, true);
  assert.equal(byNumber.text, "FDT AB 1 -8.2447, 111.3073 ke:\n* FAT AB 1.1 -8.2447, 111.3074\n* FAT AB 1.1 -8.244, 111.307\n\nFDT AB 2 -8.2453, 111.3091 ke:\n* FAT AB 2.4 -8.2451, 111.308\n* FAT AB 9.1 -8.2453, 111.309");
  assert.ok(byNumber.notes.some((n) => n.startsWith("FAT AB 9.1 has no FDT by its number")) && byNumber.notes.some((n) => n.startsWith("FAT AB 1.1 is on the map 2 times")));
  assert.match(nearest.text, /FDT AB 1 [^\n]* ke:\n\* FAT AB 1\.1[^\n]*\n\* FAT AB 1\.1[^\n]*\n\* FAT AB 2\.4/); // 2.4 is nearer FDT AB 1
  assert.throws(() => mapRoutes(pts.filter((p) => p.name.startsWith("FAT")), false), /needs both/);
});

test("approvals: three save at once, never two of one SPK, and a stop lets the running ones finish", async () => {
  const bridgeDock = dock; const { runAll } = load(bridgeDock, ["runAll"]);
  const spk = { a: 1, b: 1, c: 2, d: 3, e: 4, f: 5 }, live = new Set(), log = []; let most = 0;
  const halt = await runAll(Object.keys(spk), {
    atOnce: 3, stopped: () => false, spkOf: (id) => spk[id],
    check: async (id) => (id === "e" ? "photos not on the server yet: open it yourself" : {}),
    save: async (id) => { assert.ok(![...live].some((x) => spk[x] === spk[id]), `${id} saved alongside its SPK`); live.add(id); most = Math.max(most, live.size);
      await new Promise((ok) => setTimeout(ok, id === "a" ? 30 : 10)); live.delete(id); return id === "f" ? "Tidak diizinkan" : "ok"; },
    done: (id, r) => log.push([id, r]),
  });
  assert.equal(halt, ""); assert.equal(most, 3);
  assert.deepEqual(Object.fromEntries(log), { a: "ok", b: "ok", c: "ok", d: "ok", e: "photos not on the server yet: open it yourself", f: "Tidak diizinkan" });
  let stop = false; const started = [];
  await runAll(["p", "q", "r", "s"], { atOnce: 2, stopped: () => stop, spkOf: (id) => id, check: async () => ({}), done: () => {},
    save: async (id) => { started.push(id); stop = true; await new Promise((ok) => setTimeout(ok, 5)); return "ok"; } });
  assert.deepEqual(started, ["p"]); // stopped after the first started: no new ones, the running one finished
  const bad = await runAll(["x", "y"], { atOnce: 2, stopped: () => false, spkOf: (id) => id, check: async (id) => (id === "x" ? "!The report didn't open" : {}), save: async () => "ok", done: () => {} });
  assert.equal(bad, "The report didn't open");
});

test("review count: decided reports still count, so the position goes up and the total stays", () => {
  const rv = { type: "", all: ["a", "b", "c"].map((id) => ({ id, type: id === "c" ? "Tiang" : "FAT" })), gone: [], i: 0 };
  const { queue, gone, decide } = load(dock, ["queue", "gone", "decide"], { rv });
  const at = () => `${gone() + rv.i + 1} / ${gone() + queue().length}`;
  assert.equal(at(), "1 / 3"); decide("a"); assert.equal(at(), "2 / 3"); decide("b"); assert.equal(at(), "3 / 3");
  rv.type = "Tiang"; assert.equal(at(), "1 / 1"); // a type counts only its own
});

test("bulk lunas: a pasted WhatsApp chat gives just the usernames and names", () => {
  const { tokensOf } = load(dock, ["CHAT", "USERISH", "MONTH_WORDS", "EXTRA", "lineUser", "tokensOf"]);
  // only the username: months, amounts and words after it are left out, and a repeat becomes one line
  assert.deepEqual([...new Set(tokensOf("Testsatu0903 b November\nTestdua0903 Oktober\nTestdua0903 November\nTesttiga1001 110rb\nTestempat0908 110.000 nov\nJarmo Sumberagung November 110rb"))],
    ["Testsatu0903", "Testdua0903", "Testtiga1001", "Testempat0908", "Jarmo Sumberagung"]);
  assert.deepEqual(tokensOf("-contoh0107\n\u200e-contoh0207\n\u200e-contoh0307\u00a0\n\u200bcontoh0407\ufeff"), ["contoh0107", "contoh0207", "contoh0307", "contoh0407"]); // WhatsApp's invisible marks
  assert.deepEqual(tokensOf("1. contoh1007\n2) contoh2007\n- contoh3007\n10. k. contoh1007"), ["contoh1007", "contoh2007", "contoh3007", "k. contoh1007"]); // a numbered list
  const chat = ["[20/11/2026, 16.13] TEK. BUDI SANTOSO: Testuser0903", "[20/11/2026, 16.14] TEK. BUDI SANTOSO: Testdua0903, Testtiga1001",
    "20/11/26 16.15 - Admin Kantor: Jarmo Sumberagung", "[16.13]", "<Media omitted>", "Testempat0908"].join("\n");
  assert.deepEqual(tokensOf(chat), ["Testuser0903", "Testdua0903", "Testtiga1001", "Jarmo Sumberagung", "Testempat0908"]);
  // the time first, as WhatsApp on a computer copies it, and a line already cut at its comma
  assert.deepEqual(tokensOf("[16.13, 20/11/2026] TEK. BUDI SANTOSO: Testlima0903\n[16.14, 20/11/2026] TEK. BUDI: Testenam0903, Testtujuh0903\n20/11/2026] TEK. BUDI SANTOSO: Testdelapan0903\n[16.13\n[4:05 PM, 11/20/2026] Budi: Testsembilan0903"),
    ["Testlima0903", "Testenam0903", "Testtujuh0903", "Testdelapan0903", "Testsembilan0903"]);
});

test("search: Indonesian spellings of one name sound the same", () => {
  const { sound } = load(dock, ["sound"]);
  for (const [a, b] of [["sugiyarti", "sugiarti"], ["suwarno", "suarno"], ["soemarno", "sumarno"], ["rachmat", "rahmat"], ["akhmad", "ahmad"], ["ridho", "rido"], ["rudy", "rudi"], ["winna", "wina"]]) assert.equal(sound(a), sound(b), `${a} / ${b}`);
  assert.notEqual(sound("sugiarti"), sound("sugiarto"));
  assert.equal(sound("mulyadi"), "mulyadi"); // a y after a consonant stays
});

test("whatsapp: numbers, bills and replies", () => {
  const waSrc = readFileSync("erp-whatsapp.user.js", "utf8");
  const data = { bills: { budi0101: [["Oktober 2026", 150000, "Belum Lunas"], ["November 2026", 150000, "Jatuh Tempo"], ["September 2026", 150000, "Lunas"]] } };
  const { phoneKey, fill, parseReplies, billsOf } = load(waSrc, ["phoneKey", "rupiah", "paid", "titleCase", "periodTime", "billsOf", "fill", "parseReplies"],
    { data, MONTHS: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] }, ["phoneKey", "fill", "parseReplies", "billsOf"]);
  for (const p of ["+62 812-3456-7890", "6281234567890", "081234567890", "81234567890"]) assert.equal(phoneKey(p), "081234567890");
  assert.equal(phoneKey("12345"), "");
  const r = { nama: "BUDI SANTOSO", username: "budi0101", desa: "SUKAMAJU", _user: "budi0101" };
  assert.deepEqual(billsOf(r).unpaid.map((b) => b.period), ["Oktober 2026", "November 2026"]);
  assert.equal(fill("Kak {nama}, {username}: {bulan} {tagihan} di {desa} {x}", r), "Kak Budi, budi0101: Oktober 2026, November 2026 Rp 300.000 di Sukamaju {x}");
  assert.deepEqual(parseReplies("## A\none\ntwo\n\n## B\nthree\n## C\n"), [["A", "one\ntwo"], ["B", "three"]]);
});

test("whatsapp: a group message's sender and the customer their saved name points to", () => {
  const waSrc = readFileSync("erp-whatsapp.user.js", "utf8");
  const fold = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const mk = (nama, username, desa, router) => { const r = { nama, username, desa, router, _name: fold(nama), _user: username };
    r._hay = ` ${r._name} ${username} ${fold(desa)} ${fold(router)} `; r._sound = ` ${r._hay.trim().split(" ").join(" ")} `; r._nsound = ` ${r._name} `; return r; };
  const rows = [mk("BUDI SANTOSO", "budi0101", "CONTOH", "RO CONTOH"), mk("SANTOSO WIBOWO", "santo0102", "CONTOH", "RO CONTOH"), mk("SITI AMINAH", "siti0201", "LAINNYA", "RO LAINNYA")];
  const { nameGuess } = load(waSrc, ["sound", "nameGuess"], { fold, rows, guessMemo: new Map() }, ["nameGuess"]);
  assert.deepEqual(nameGuess("BUDI SANTOSO CONTOH R9 Budi").map((r) => r.username), ["budi0101"]);
  assert.deepEqual(nameGuess("Pak RT Contoh"), []); // only the village: nobody's name
});

test("way up: climbs from the OLT to the core, crosses a backwards link, names the first full link", () => {
  const topoKey = (s) => String(s || "").toUpperCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/^RO /, "");
  const { pathRead } = load(dock, ["pathRead", "capText", "rateText", "reachText", "linkText", "HOUSE_UNCHECKED"], { topoKey, hhmm: () => "10:00",
    bits: (bps) => (bps >= 1e6 ? `${(bps / 1e6).toFixed(bps >= 1e7 ? 0 : 1).replace(".", ",")} Mbit/s` : `${Math.round(bps / 1000)} kbit/s`) }, ["pathRead"]);
  const map = { peta: { node: [{ ro: "CONTOH", hidup: true, cpu: 10 }, { ro: "DIST", hidup: true, cpu: 20 }, { ro: "CORE", hidup: true, cpu: 5 }],
    link: [{ roA: "CORE", roB: "DIST", hulu: "a", status: "hidup", sumberRo: "CORE", sumberIf: "to-dist" },
      { roA: "DIST", roB: "sw:1", hulu: "b", status: "hidup", sumberRo: "DIST", sumberIf: "to-sw" }, // drawn backwards: the switch marked above DIST
      { roA: "CONTOH", roB: "sw:1", hulu: "b", status: "hidup", sumberRo: "CONTOH", sumberIf: "uplink" },
      { roA: "CONTOH", roB: "olt:A", hulu: "a", status: "hidup", sumberRo: "CONTOH", sumberIf: "to-olt" }], sambungan: [] },
    olts: [{ id: "olt:A", nama: "OLT CONTOH", ro: "CONTOH", ontOnline: 9, ontTotal: 10 }], sws: [{ id: "sw:1", nama: "SW CONTOH", status: "online", portsUp: 4 }] };
  const lv = { port: { CORE: { "to-dist": { outBps: 2e9, inBps: 1e8, kapMbps: 10000 } }, DIST: { "to-sw": { outBps: 9.5e8, inBps: 1e7, kapMbps: 1000 } },
    CONTOH: { uplink: { inBps: 5e8, outBps: 1e7, kapMbps: 1000 }, "to-olt": { outBps: 4e8, inBps: 1e7, kapMbps: 1000 } } }, router: {} };
  const p = pathRead({ router: "RO CONTOH NEW" }, map, lv, "A");
  assert.deepEqual(p.hops.map((h) => h.name), ["OLT CONTOH", "CONTOH", "SW CONTOH", "DIST", "CORE"]);
  assert.equal(p.hops[1].link.text, "↓ 500 Mbit/s of 1 Gbit/s · 50%"); // measured at CONTOH, the lower end: what comes in
  // a link whose map reading went stale, no port named: either end's own port in the live feed
  const stale = { ...map, peta: { ...map.peta, link: map.peta.link.map((l) => (l.roA === "CONTOH" && l.roB === "sw:1" ? { ...l, status: "basi", sumberRo: null, sumberIf: null, ifA: "uplink" } : l)) } };
  const ps = pathRead({ router: "RO CONTOH NEW" }, stale, lv, "A");
  assert.equal(ps.hops[1].link.text, "↓ 500 Mbit/s of 1 Gbit/s · 50%"); assert.equal(ps.hops[1].link.stale, false);
  lv.port.DIST["to-sw"].outBps = 2e5; // the switch's way up carries next to nothing while 500 Mbit/s comes from below
  assert.match(pathRead({ router: "RO CONTOH NEW" }, map, lv, "A").notes.join(), /SW CONTOH's link up carries 200 kbit\/s while 500 Mbit\/s comes up from below/);
  lv.port.DIST["to-sw"].outBps = 9.5e8;
  assert.equal(p.v[0], "warn"); assert.match(p.v[1], /SW CONTOH → DIST is full \(95%/);
  assert.match(p.notes.join(), /marks SW CONTOH – DIST the other way round/);
  lv.router.DIST = { ok: false };
  assert.match(pathRead({ router: "RO CONTOH NEW" }, map, lv, "A").v[1], /^Router DIST .* unreachable/);
  assert.equal(pathRead({ router: "RO CONTOH NEW" }, map, lv, null).hops[0].name, "CONTOH"); // no modem found: from their router
  lv.router.DIST = { ok: true }; lv.port.DIST["to-sw"].outBps = 1e8;
  const seen = pathRead({ router: "RO CONTOH NEW" }, map, lv, "A"), blind = pathRead({ router: "RO CONTOH NEW" }, map, lv, null);
  assert.equal(seen.house, true); assert.match(seen.v[1], /^The way up is clear/); assert.doesNotMatch(seen.notes.join(), /isn't checked/);
  // without their modem "clear" says it's only from the router up, and the note says how to find the modem
  assert.equal(blind.house, false); assert.match(blind.v[1], /^The way up from their router is clear .*to the house isn't checked\.$/);
  assert.ok(blind.notes.includes("The way from their router to the house isn't checked: their modem wasn't found. Find it by serial in Modem / Search."));
  lv.router.DIST = { ok: false }; lv.port.DIST["to-sw"].outBps = 9.5e8;
  const reach = (id) => (id === "DIST" ? { usual: 1250, now: 40, routers: 3 } : null);
  assert.match(pathRead({ router: "RO CONTOH NEW" }, map, lv, "A", reach).v[1], /unreachable: .*\. About 1\.250 customers are usually online behind it, 40 now\.$/);
});

test("radar topology from the router map: links point away from the core, even one the map draws backwards", () => {
  const { erpTopoText } = load(dock, ["erpTopoText"]);
  const map = { peta: { node: [{ ro: "CORE" }, { ro: "DIST" }, { ro: "CONTOH" }, { ro: "CONTOH DUA" }],
    link: [{ roA: "CORE", roB: "DIST", hulu: "a" }, { roA: "DIST", roB: "sw:1", hulu: "b" }, // the switch marked above DIST
      { roA: "CONTOH", roB: "sw:1", hulu: "b" }, { roA: "CONTOH DUA", roB: "sw:1", hulu: "b" }, { roA: "CONTOH", roB: "olt:A", hulu: "a" }], sambungan: [] },
    sws: [{ id: "sw:1", nama: "SW-CONTOH, LAMA" }] };
  assert.equal(erpTopoText(map), "CORE > DIST\nDIST > SW-CONTOH  LAMA\nSW-CONTOH  LAMA > CONTOH, CONTOH DUA");
});

test("answer: the first cause in the NOC's order, with a reply that names the customer and village", () => {
  const titleCase = (x) => String(x).toLowerCase().replace(/(^|[\s(])[^\s(]/g, (c) => c.toUpperCase());
  const { triageRead } = load(dock, ["triageRead", "capOf"], { titleCase, bits: (b) => `${b / 1e6} Mbit/s` }, ["triageRead"]);
  const r = { username: "budi0101", nama: "BUDI CONTOH SANTOSO", desa: "CONTOH", isolir: false };
  const ok = { online: true, v: ["ok", "Online and steady"] }, clear = { v: ["ok", "The way up is clear"] };
  const down = triageRead(r, { online: false, v: ["off", "Only this customer"] }, null, { v: ["net", "The link X → Y is down since 10:00"] });
  assert.equal(down.kind, "Down · area outage"); assert.match(down.reply, /^Mohon maaf Kak Budi Contoh, .* area Contoh\./);
  assert.equal(triageRead(r, { online: false, v: ["off", "Only this customer"] }, null, clear).kind, "Down · their modem");
  assert.equal(triageRead(r, ok, { rate: { down: 9e6 }, plan: 10 }, { v: ["warn", "The link X → Y is full (95% of 1 Gbit/s): …"] }).kind, "Slow · the area is busy");
  assert.equal(triageRead(r, ok, { rate: { down: 9e6 }, plan: 10 }, clear).kind, "Slow · their line is full");
  assert.equal(triageRead(r, ok, { rate: { down: 2e4 }, plan: 10 }, clear).kind, "Slow · WiFi or devices");
  const wait = triageRead(r, ok, { rate: null, plan: 10 }, clear); assert.equal(wait.waiting, true);
  assert.equal(triageRead({ ...r, isolir: true }, ok, null, clear, { ok: true, jumlahTagihan: 2, totalTunggakan: 220000 }).tone, "iso");
  const peak = triageRead(r, ok, { rate: { down: 3e6 }, plan: 10 }, { v: ["ok", "clear"], peaks: [{ name: "CONTOH → DIST", span: "19–22", full: 5, of: 7 }] });
  assert.equal(peak.kind, "Slow at peak hours"); assert.match(peak.reply, /padat pada jam 19–22/);
  // their modem wasn't found: "fine" says the router → house part isn't checked, and the step says how to find the modem
  const blind = { v: ["ok", "The way up from their router is clear"], house: false };
  const fine = triageRead(r, ok, { rate: { down: 3e6 }, plan: 10 }, blind);
  assert.equal(fine.kind, "Line is fine"); assert.match(fine.cause, /way up from their router clear.*The way from their router to the house isn't checked: their modem wasn't found\.$/);
  assert.match(fine.step, /^Find their modem by serial in Modem \/ Search/);
  assert.match(triageRead(r, ok, { rate: null, plan: 10 }, blind).cause, /isn't checked/);
  assert.doesNotMatch(triageRead(r, ok, { rate: { down: 3e6 }, plan: 10 }, { ...clear, house: true }).cause, /isn't checked/);
});

test("answer: a RADIUS speed cap under the plan, or the isolir profile on a paid customer, comes before \"fine\"", () => {
  const titleCase = (x) => String(x).toLowerCase().replace(/(^|[\s(])[^\s(]/g, (c) => c.toUpperCase());
  const { triageRead, capOf } = load(dock, ["triageRead", "capOf"], { titleCase, bits: (b) => `${b / 1e6} Mbit/s` }, ["triageRead", "capOf"]);
  assert.deepEqual(capOf({ rateLimit: "10/10" }), { up: 10, down: 10 });
  assert.deepEqual(capOf({ rateLimit: "512k/2M" }), { up: 0.512, down: 2 });
  assert.deepEqual(capOf({ rateLimit: "1G/1G 2G/2G" }), { up: 1000, down: 1000 });
  assert.equal(capOf({ rateLimit: null }), null); assert.equal(capOf({}), null);
  const r = { username: "budi0101", nama: "BUDI CONTOH", desa: "CONTOH", isolir: false, groupname: "PAKET_10_MBPS_CONTOH" };
  const ok = { online: true, v: ["ok", "Online and steady"] }, clear = { v: ["ok", "The way up is clear"], house: true }, t = { rate: { down: 4.8e6 }, plan: 35 };
  const low = triageRead({ ...r, rateLimit: "10/10" }, ok, t, clear);
  assert.equal(low.kind, "Slow · speed cap below the plan"); assert.match(low.cause, /caps the session at 10 Mbps down \(profile PAKET_10_MBPS_CONTOH\), but the plan is 35 Mbps/);
  assert.equal(low.step, "Fix the PPPoE profile / rate-limit in RADIUS, then reconnect the session."); assert.match(low.reply, /dibatasi 10 Mbps, belum sesuai paket 35 Mbps/);
  assert.equal(triageRead({ ...r, rateLimit: "35/35" }, ok, t, clear).kind, "Line is fine"); // as the plan
  assert.equal(triageRead({ ...r, rateLimit: "200/200" }, ok, t, clear).kind, "Line is fine"); // above it is fine
  assert.equal(triageRead(r, ok, t, clear).kind, "Line is fine"); // no cap readable: nothing said
  assert.equal(triageRead({ ...r, rateLimit: "32/32" }, ok, t, clear).kind, "Line is fine"); // a little under: not "well below"
  const iso = triageRead({ ...r, groupname: "CONTOH-ISOLIR", rateLimit: null }, ok, t, clear);
  assert.equal(iso.kind, "Slow · on the isolir profile"); assert.match(iso.cause, /CONTOH-ISOLIR profile instead of the 35 Mbps plan/);
  assert.equal(triageRead({ ...r, rateLimit: "10/10" }, { online: false, v: ["off", "Only this customer"] }, t, clear).kind, "Down · their modem"); // offline: the cap waits
});

test("affected customers: a point on the map and everything below it, usual and now", () => {
  const { behindOf } = load(dock, ["behindOf"]);
  const t = { topo: { down: new Map([["DIST", ["SW", "CONTOH"]], ["SW", ["CONTOH DUA", "CONTOH"]]]) },
    at: new Map([["CONTOH", { usual: 300, open: 10 }], ["CONTOH DUA", { usual: 200, open: 0 }], ["DIST", { usual: 50, open: 50 }]]) };
  assert.deepEqual(behindOf(t, "DIST"), { usual: 550, now: 60, routers: 3 }); // CONTOH counted once, though it hangs off both
  assert.deepEqual(behindOf(t, "SW"), { usual: 500, now: 10, routers: 2 });
  assert.equal(behindOf(t, "NOWHERE"), null);
});

test("peaks: the hours a link reaches 90% on most days, and how it's said", () => {
  const { linkPeaks, peakText } = load(dock, ["linkPeaks", "spanText", "peakText"], { hourOf: (k) => Date.parse(`${k.replace(" ", "T")}:00`) }, ["linkPeaks", "peakText"]);
  const b = {}, now = Date.parse("2026-11-24T00:30:00");
  for (const day of ["17", "18", "19", "20", "21", "22", "23"]) for (let h = 0; h < 24; h++) b[`2026-11-${day} ${String(h).padStart(2, "0")}`] = [h >= 19 && h <= 21 && day !== "22" ? 95 : 40, 0, 1];
  b["2026-11-01 20"] = [99, 0, 1]; // older than the week: left out
  const [x] = linkPeaks({ l: { "CONTOH|olt:A": { name: "CONTOH – OLT CONTOH", cap: 1000, b } } }, 7, now);
  assert.equal(x.of, 7); assert.equal(x.full, 6); assert.equal(x.span, "19–22"); assert.equal(x.hours[20], 95); assert.equal(x.hours[3], 40);
  assert.equal(peakText(x), "90%+ at 19–22 on 6 of the last 7 days");
  assert.equal(peakText({ full: 0, busy: 1, of: 3 }), "");
});

test("open from anywhere: the ERP's WireGuard link moved to the RO's public address, only when one is saved", () => {
  const saved = { contoh: "203.0.113.7" };
  const fold = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const { publicUrl } = load(dock, ["publicUrl", "roPubKey", "innerUrl", "roPublic"], { RO_PUBLIC: "x", ls: { get: () => saved }, fold, nameNorm: (n) => String(n || "").toUpperCase().replace(/^RO[\s-]+/, "").trim() }, ["publicUrl"]);
  assert.equal(publicUrl("http://10.99.98.21:20417/", "RO CONTOH"), "http://203.0.113.7:20417/");
  assert.equal(publicUrl("http://10.99.98.21:20417/", "RO LAIN"), null); // nothing saved for that RO
  assert.equal(publicUrl("http://198.51.100.4:20417/", "RO CONTOH"), null); // already public: left as it is
});

test("above the core: the POP's busy hours on its hop, the upstream at the top, a peak counted only near its hours", async () => {
  const b = { now: { links: [{ label: "Metro Contoh 5G", grup: "metro", util: 62 }, { label: "IX Contoh 6G", grup: "upstream", util: 40 }], metro: { util: 62 },
      kebutuhan: [{ label: "Metro Contoh 5G", status: "crit", pakai_puncak_pct: 105, rekom: "UPGRADE segera" }] },
    hist: { jam_sibuk: [18, 19, 20, 21], jam_sibuk_stat: [{ label: "Metro Contoh 5G", pakai_p95_pct: 99 }, { label: "IX Contoh 6G", pakai_p95_pct: 40 }],
      pop_sibuk_stat: [{ label: "VID-700-POP-CONTOH", pakai_p95_pct: 92, vonis: "PENUH" }] },
    fibre: { rinci: { verdict: { langkah: ["Bersihkan konektor."] }, ruas: [{ kode: "ok", nama: "A↔B" }, { kode: "redup", status: "link-ok", nama: "B↔C", label: "NYALA, SINYAL MELEMAH", sebab: "Cahaya turun 3 dB.", link_downs: 64, sejak: "2026-11-19" }] } } };
  const { aboveCore, upstreamRows, fibreAlerts } = load(dock, ["aboveCore", "busyHours", "spanText", "upstreamRows", "fibreAlerts", "linkText", "capText", "rateText"], { bwLoad: async () => b, hhmm: () => "", bits: (x) => `${x / 1e6} Mbit/s` }, ["aboveCore", "upstreamRows", "fibreAlerts"]);
  b.now.pops = [{ nama: "VID-700-POP-CONTOH", cap: 1000 }];
  const p = { v: ["ok", "The way up is clear"], peaks: [], hops: [{ name: "CONTOH", link: { vlan: true, down: 9.5e8, port: "DIST VID-700-POP-CONTOH" } }, { name: "CORE" }] };
  await aboveCore(p);
  assert.equal(p.hops[0].link.text, "↓ 950 Mbit/s of 1 Gbit/s · 95% · 92% in the busy hours (18–22)"); // the POP's own size, not the trunk's
  assert.match(p.v[1], /^The link CONTOH → CORE is full \(95% of 1 Gbit\/s\)/);
  assert.equal(p.hops.at(-1).name, "Upstream (metro + IX)"); assert.match(p.hops[1].link.text, /^metro 62% now · Metro Contoh 5G 99% in the busy hours/);
  assert.deepEqual(p.peaks.map((x) => [x.name, !!x.up]), [["VID-700-POP-CONTOH", false], ["Metro Contoh 5G", true]]);
  assert.deepEqual(upstreamRows(b).map((x) => x.name), ["Metro Contoh 5G", "VID-700-POP-CONTOH"]);
  assert.match(fibreAlerts(b)[0].body, /Dropped 64× .* Bersihkan konektor\.$/);
  const titleCase = (x) => String(x).toLowerCase().replace(/(^|[\s(])[^\s(]/g, (c) => c.toUpperCase());
  const { triageRead } = load(dock, ["triageRead", "capOf"], { titleCase, bits: (x) => `${x / 1e6} Mbit/s` }, ["triageRead"]);
  const r = { username: "budi0101", nama: "BUDI CONTOH", desa: "CONTOH" }, ok = { online: true, v: ["ok", "Online and steady"] }, t = { rate: { down: 3e6 }, plan: 10 };
  p.v = ["ok", "clear"];
  const evening = triageRead(r, ok, t, p, null, new Date(2026, 10, 24, 19, 30).getTime()), morning = triageRead(r, ok, t, p, null, new Date(2026, 10, 24, 10, 0).getTime());
  assert.equal(evening.kind, "Slow at peak hours"); assert.match(evening.cause, /POP link VID-700-POP-CONTOH/);
  assert.equal(morning.kind, "Line is fine"); assert.match(morning.cause, /Later: their POP link/);
});

test("a router the map can't reach is down on the radar at once, though RADIUS still counts its sessions", () => {
  const topoKey = (s) => String(s || "").toUpperCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/^RO /, "");
  const { applyMapDown } = load(dock, ["applyMapDown"], { topoKey });
  const a = { name: "RO-CONTOH-E2E", open: 438, usual: 440, level: "ok" }, old = { name: "CONTOH", open: 0, usual: 0, level: "silent" }, b = { name: "RO LAIN", open: 300, usual: 300, level: "ok" };
  const rd = { list: [a, old, b], alerts: [] };
  applyMapDown(rd, [{ ro: "CONTOH", since: 1000, up: "its link's port on SW CONTOH (sfp3) is down" }]);
  assert.equal(a.level, "down"); assert.equal(a.since, 1000); assert.deepEqual(rd.alerts, [a]); assert.equal(b.level, "ok"); assert.equal(old.level, "silent");
});
