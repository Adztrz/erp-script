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
  const { tokensOf } = load(dock, ["CHAT", "tokensOf"]);
  const chat = ["[20/11/2026, 16.13] TEK. BUDI SANTOSO: Testuser0903", "[20/11/2026, 16.14] TEK. BUDI SANTOSO: Testdua0903, Testtiga1001",
    "20/11/26 16.15 - Admin Kantor: Jarmo Sumberagung", "[16.13]", "<Media omitted>", "Testempat0908"].join("\n");
  assert.deepEqual(tokensOf(chat), ["Testuser0903", "Testdua0903", "Testtiga1001", "Jarmo Sumberagung", "Testempat0908"]);
});
