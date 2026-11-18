  // ---------- Bulk SPK on Planning: routes and activation counts, per technician ----------
  // Two kinds of SPK come in messages. Route types (Tarik & Aktivasi FAT/FDT, Tarik Kabel, Perbaikan, Splicing) need
  // a DARI → KE pair: "FDT DAYU ke: * FAT DAYU 1 * FAT DAYU 2 …", one SPK per route, titled after where it goes. Plain
  // types (Aktivasi ODP/FAT, Aktivasi FDT…) are just a number: "Budi santoso 10 spk". One message can mix both, with a
  // heading saying the type and a technician's name above their routes. Paste it, pick project and date, press Create
  // twice: no form to fill. A route SPK is the same record Planning's manual form saves for a team (read off its code and checked against
  // SPKs made by hand on 11 Nov 2026: only the title and the KE asset differ between them): status Baru, the team, the
  // project, no tasks or equipment, progress 0/1, and the route under both target and cableRoute, with the cable length
  // set to the straight line rounded to 10 m as the form pre-fills it. Saved through Firestore's REST API with your own
  // sign-in, so the database's rules apply as for the page, and only as new documents. No WhatsApp or push notice is sent.
  const SPK_TPL = "erpFast.spkTitle", SPK_PICK = "erpFast.spkPick";
  const spkTpl = () => { try { return localStorage.getItem(SPK_TPL) || "PENARIKAN {dari} KE {ke}"; } catch { return "PENARIKAN {dari} KE {ke}"; } };
  const ROUTE_TYPES = ["Tarik & Aktivasi FAT", "Tarik & Aktivasi FDT", "Tarik Kabel Distribusi", "Tarik Kabel Backbone", "Perbaikan Kabel Backbone", "Splicing Fiber"];
  let spk = null; // { text, routes, phase: "input" | "creating" | "done", team, project, type, date, armed, note }
  const bulkSpkOpen = () => !!document.getElementById("erp-bulk-spk");
  const akey = (v) => String(v ?? "").toLowerCase().replace(/[\s\-_]+/g, ""); // "FAT-SDY8A" = "FAT SDY8A"; dots kept (1.1 ≠ 11)
  const ATYPE = { fdt: "FDT", fat: "FAT", odp: "ODP", odc: "ODC", olt: "OLT", joinbox: "Joinbox", jb: "Joinbox", tiang: "Tiang" };
  const typeOf = (name) => ATYPE[(/^\s*(fdt|fat|odp|odc|olt|joinbox|jb|tiang)\b/i.exec(name)?.[1] || "").toLowerCase()] || null;

  // every Tipe Pekerjaan in Planning's manual form (read off its list on 13 Nov 2026)
  const ALL_TYPES = ["Instalasi OLT", "Aktivasi FDT", "Aktivasi ODP/FAT", "Instalasi Tiang", "Instalasi Joinbox", "Tarik Kabel Backbone", "Tarik Kabel Distribusi",
    "Tarik & Aktivasi FAT", "Tarik & Aktivasi FDT", "Splicing Fiber", "Survey Lokasi", "Perbaikan Kabel Backbone", "Migrasi HTB ke FTTH",
    "Visit Pelanggan Isolir atau Dismantle", "Maintenance Jaringan Umum", "Audit Tiang Existing", "Pemasangan CCTV HiView", "Pengecekan Port ODP", "Lain-lain"];
  // types the form makes from picked customers or a camera's purpose: bulk leaves them to the form
  const FORM_ONLY = { "Migrasi HTB ke FTTH": "picks the customers to migrate", "Visit Pelanggan Isolir atau Dismantle": "picks the customers to visit",
    "Pemasangan CCTV HiView": "is 1 SPK per camera, with what the camera is for" };
  // what manual mode offers: the types a plain count makes
  const MANUAL_TYPES = ALL_TYPES.filter((t) => !ROUTE_TYPES.includes(t) && !FORM_ONLY[t]);
  // manual mode: rows of type, team and how many, made into the same count jobs a message gives
  const manualJobs = () => { spk.jobs = spk.rows.map((r) => ({ kind: "count", manual: true, head: "", who: "", type: r.type, team: r.team, n: Math.floor(+r.n) || 0 })); };
  // the type a heading names ("Tarik & aktivasi FAT", "Aktivasi FDT", "Cek port"…), or null when the line isn't a heading
  function headType(line) {
    const t = String(line).toLowerCase(), f = fold(line);
    const exact = ALL_TYPES.find((x) => fold(x) === f); if (exact) return exact;
    return /perbaikan/.test(t) ? "Perbaikan Kabel Backbone" : /splic/.test(t) ? "Splicing Fiber"
      : /tarik.*akti[vf]asi.*fdt/.test(t) ? "Tarik & Aktivasi FDT" : /tarik.*akti[vf]asi/.test(t) ? "Tarik & Aktivasi FAT"
      : /tarik.*backbone/.test(t) ? "Tarik Kabel Backbone" : /tarik.*distribusi/.test(t) ? "Tarik Kabel Distribusi"
      : /migrasi/.test(t) ? "Migrasi HTB ke FTTH" : /isolir|dismant/.test(t) ? "Visit Pelanggan Isolir atau Dismantle" : /cctv/.test(t) ? "Pemasangan CCTV HiView"
      : /(cek|pengecekan).*port/.test(t) ? "Pengecekan Port ODP" : /audit.*tiang/.test(t) ? "Audit Tiang Existing"
      : /akti[vf]asi.*fdt/.test(t) ? "Aktivasi FDT" : /akti[vf]asi/.test(t) ? "Aktivasi ODP/FAT"
      : /joinbox/.test(t) ? "Instalasi Joinbox" : /(instalasi|tanam|pasang).*tiang/.test(t) ? "Instalasi Tiang" : /instalasi.*olt/.test(t) ? "Instalasi OLT"
      : /^surve[iy]\b/.test(t) ? "Survey Lokasi" : /^(maintenance|pemeliharaan)\b/.test(t) ? "Maintenance Jaringan Umum" : /^lain/.test(t) ? "Lain-lain" : null;
  }
  // the message → jobs, in order. A heading sets the type for what follows; a plain line is a technician (or team) for
  // the routes under it; "Name 10 spk" is that many SPKs for that person; an asset line with "ke" after it (or a plain
  // one) is where cables start and the bullet lines under it are where they go; "FDT A ke FAT B" on one line also works.
  function parseJobs(text) {
    const lines = String(text).split(/\r?\n/).map((raw) => {
      const t = raw.trim(), bare = t.replace(/^(?:[*\-•·>]+|\d+[.)])\s*/, "").trim();
      return { bullet: bare !== t, line: bare };
    }).filter((x) => x.line);
    const jobs = []; let head = "", who = "", from = null;
    lines.forEach((x, i) => {
      let { line } = x;
      if (/^ke\s*:?$/i.test(line)) return;
      // under a tiang heading, "Sudimoro 5-24" is poles 5 to 24 there, one SPK each, named as the form names them
      const poles = headType(head) === "Instalasi Tiang" && /^(?:tanam\s+tiang\s+)?(?:wilayah\s+)?(.+?)\s+(?:no\.?\s*)?(\d+)\s*(?:-|–|s\.?\s*\/?\s*d\.?|sampai)\s*(\d+)$/i.exec(line);
      if (poles && +poles[3] >= +poles[2]) { from = null; jobs.push({ kind: "poles", who, head, area: poles[1].trim(), first: +poles[2], n: +poles[3] - +poles[2] + 1 }); return; }
      const cnt = /^(.+?)\s*[:=\-–]?\s*(\d+)\s*spk\b\.?$/i.exec(line);
      // under a heading, "Name 10" needs no "spk" ("Tim 2" alone stays a team name)
      const bare = head && /^(.+?)\s*[:=\-–]?\s*(\d+)\s*x?\.?$/i.exec(line);
      const n = cnt || (bare && !/^(?:tim|team|no\.?)$/i.test(bare[1].trim()) && !headType(bare[1]) ? bare : null);
      if (n && +n[2] > 0 && !typeOf(n[1])) { from = null; jobs.push({ kind: "count", who: n[1].trim(), head, n: +n[2] }); return; }
      const pair = line.split(/\s+(?:ke|->|→|=>)\s*:?\s+/i);
      if (pair.length === 2 && typeOf(pair[0]) && typeOf(pair[1])) { from = pair[0].trim(); jobs.push({ kind: "route", who, head, from, to: pair[1].trim() }); return; }
      const endsKe = /\s+ke\s*:?$/i.test(line); line = line.replace(/\s+ke\s*:?$/i, "").trim();
      if (typeOf(line)) {
        const nextKe = /^ke\s*:?$/i.test(lines[i + 1]?.line || "");
        if (endsKe || nextKe || !x.bullet || !from) from = line; else jobs.push({ kind: "route", who, head, from, to: line });
        return;
      }
      from = null;
      // "Penarikan" alone is a heading too: routes of the panel's route type
      if (headType(line) || /^(?:penarikan|tarik(?:an)?)\b/i.test(line)) { head = line; who = ""; } else who = line.replace(/[:,.]+$/, "").trim();
    });
    return jobs;
  }
  // a job's SPK type: the heading's, made to fit the job (an Aktivasi heading over routes means Tarik & Aktivasi), else
  // the panel's route type for routes and Aktivasi ODP/FAT for counts
  function jobType(j) {
    const h = headType(j.head);
    if (j.kind === "route") return ROUTE_TYPES.includes(h) ? h : h === "Aktivasi FDT" ? "Tarik & Aktivasi FDT" : h === "Aktivasi ODP/FAT" ? "Tarik & Aktivasi FAT" : spk.type;
    if (j.kind === "poles") return "Instalasi Tiang";
    return h || "Aktivasi ODP/FAT";
  }
  const countTitle = (j) => j.kind === "poles" ? `Tanam Tiang wilayah ${j.area} no ${j.first}${j.n > 1 ? `–${j.first + j.n - 1}` : ""}`
    : j.type === "Pengecekan Port ODP" ? "Pengecekan Port ODP" : (j.head || (j.type === "Aktivasi ODP/FAT" ? "Aktivasi FAT" : j.type)).replace(/\s+/g, " ").trim().toUpperCase();
  // why a count can't be made here, if it can't (the form's own limits)
  const countBad = (j) => ROUTE_TYPES.includes(j.type) ? `${j.type} needs a DARI → KE route, not a count`
    : FORM_ONLY[j.type] ? `${j.type} ${FORM_ONLY[j.type]}: use the form` : j.kind === "poles" && j.n > 200 ? "200 poles at most in one go"
    : j.type === "Pengecekan Port ODP" && j.n > 100 ? "100 Pengecekan Port ODP at most in one go" : j.n > 100 ? "100 SPKs at most per line" : "";

  // a typed name → the teams of the employees it fits: each typed word starts a word of the name, or sounds close to one
  // (SETIYAWAN = SETIAWAN); several fits are narrowed to teams named after the project's area, then to technicians
  function teamsFor(who, emps, teams, projectName) {
    const typed = fold(who).split(" ").filter(Boolean);
    const spelt = (x, w) => x === w || (w.length >= 3 && x.startsWith(w)), close = (x, w) => sound(x) === sound(w) || (w.length >= 5 && near(sound(w), sound(x), w.length >= 8 ? 2 : 1));
    const fits = (name, how) => { const words = fold(name).split(" "); return typed.every((w) => words.some((x) => how(x, w))); };
    // "Tim Ngadirojo 2" names a team, not a person
    const named = teams.filter((t) => fits(t.namaTim || "", spelt)).map((t) => ({ team: t.id, teamName: t.namaTim || t.id, emp: "", role: "" }));
    if (/^tim\b/i.test(who) || named.length === 1 && typed.length > 1) return named;
    const live = emps.filter((e) => !/non ?aktif|keluar|resign/i.test(e.status || ""));
    // a name spelt as typed beats one that only sounds close (HARIYANTO, not HERIYANTO)
    const exact = live.filter((e) => fits(e.name, spelt)), people = exact.length ? exact : live.filter((e) => fits(e.name, (x, w) => spelt(x, w) || close(x, w)));
    const hits = [];
    for (const e of people) for (const t of teams) if ((t.anggotaIds || []).includes(e.id) || t.leaderId === e.id) hits.push({ team: t.id, teamName: t.namaTim || t.id, emp: e.name, role: e.role || "" });
    if (hits.length < 2) return hits;
    const area = new Set(fold(projectName).split(" ").filter((w) => w.length >= 4));
    const local = hits.filter((h) => fold(h.teamName).split(" ").some((w) => area.has(w)));
    const pool = local.length ? local : hits, tech = pool.filter((h) => /teknisi/i.test(h.role));
    return tech.length ? tech : pool;
  }

  // Planning's own asset list (kept by the cache above), every district
  async function assetIndex() {
    const box = await caches.open(CACHE);
    for (const req of await box.keys()) {
      if (!/networkAssets/.test(req.url) || !/OLT.*FAT|FAT.*OLT/.test(decodeURIComponent(req.url))) continue; // the endpoint list, not the OLT-only one
      const j = await (await box.match(req)).json(), idx = new Map();
      for (const a of j.data || []) for (const k of new Set([akey(a.kodeAset), akey(`${a.tipeAset} ${a.kodeAset}`)])) { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(a); }
      return idx;
    }
    return null;
  }
  // "FAT X -8.2337, 111.3114" (as Google Maps copies a point, brackets allowed): where the asset stands, like the form's
  // Titik Koordinat. A Calon Aset gets it, and so does an existing one with no location saved; the cable length follows.
  function splitCoord(name) {
    const m = /\s*[(@]?\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*\)?\s*$/.exec(name);
    return m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180 ? { name: name.slice(0, m.index).trim(), lat: +m[1], lng: +m[2] } : { name, lat: null, lng: null };
  }
  function placeAsset(idx, typed) {
    const { name, lat, lng } = splitCoord(typed);
    const hits = [...new Map((idx?.get(akey(name)) || []).map((a) => [a.id, a])).values()], want = typeOf(name); // the list repeats some rows
    const same = hits.filter((a) => !want || String(a.tipeAset).toLowerCase() === want.toLowerCase());
    const list = same.length ? same : hits;
    if (list.length === 1) { const a = list[0], p = a.lokasiKoordinat;
      return { ok: true, id: a.id, code: a.kodeAset, type: a.tipeAset, desa: a.desa || null, planned: false, lat: p?.latitude ?? a.lat ?? lat, lng: p?.longitude ?? a.lng ?? lng }; }
    if (list.length > 1) return { ok: false, why: `${list.length} assets are called ${name}` };
    if (!want) return { ok: false, why: `${name}: type unclear (start with FDT, FAT, ODP…)` };
    return { ok: true, id: null, code: name.trim().replace(/\s+/g, " "), type: want, desa: null, planned: true, lat, lng }; // not in Network Assets yet: a Calon Aset, as the form does it
  }
  const title = (r) => spkTpl().replace(/\{dari\}/g, r.a?.code || r.from).replace(/\{ke\}/g, r.b?.code || r.to).replace(/\s+/g, " ").trim();
  const metres = (a, b) => {
    if ([a.lat, a.lng, b.lat, b.lng].some((v) => v == null)) return null;
    const R = 6371000, rad = Math.PI / 180, dLa = (b.lat - a.lat) * rad, dLo = (b.lng - a.lng) * rad;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLo / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  };

  // A Google My Maps link (shared with "anyone with the link") pasted in the box: its points are read (Google gives any
  // site the map as KML) and written into the box as routes, each FAT/ODP from its FDT with both locations, to check
  // before creating. A FAT goes to the FDT its number names (FAT DAYU 1.4 → FDT DAYU 1); with no such FDT, or with
  // "nearest" picked, to the closest FDT. Lines and areas on the map are left out.
  const MAPLINK = /https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\/d\/\S*?[?&]mid=([\w-]+)\S*/;
  async function mapPoints(mid) {
    const r = await realFetch(`https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`).catch(() => null);
    if (!r?.ok) throw new Error(`Google didn't give the map${r ? ` (HTTP ${r.status})` : ""}: is it shared with anyone with the link?`);
    const doc = new DOMParser().parseFromString(await r.text(), "text/xml"), tag = (e, t) => e.getElementsByTagName(t)[0];
    return [...doc.getElementsByTagName("Placemark")].map((p) => {
      const c = tag(tag(p, "Point") || p, "coordinates")?.textContent.trim().split(","); if (!tag(p, "Point") || !c) return null;
      return { name: (tag(p, "name")?.textContent || "").trim().replace(/\.\s+(?=\d)/g, ".").replace(/\s+/g, " "), lng: +c[0], lat: +c[1] }; // "FAT X 1. 2" → "FAT X 1.2"
    }).filter((p) => p && typeOf(p.name));
  }
  function mapRoutes(pts, nearest) {
    const fdts = pts.filter((p) => typeOf(p.name) === "FDT"), ends = pts.filter((p) => ["FAT", "ODP"].includes(typeOf(p.name)));
    if (!fdts.length || !ends.length) throw new Error(`the map has ${fdts.length} FDT and ${ends.length} FAT/ODP points: it needs both`);
    const by = new Map(), notes = [], count = new Map();
    for (const p of ends) {
      count.set(p.name, (count.get(p.name) || 0) + 1);
      const m = /^(?:FAT|ODP)\s+(.+?)\s+(\d+)\.\d+$/i.exec(p.name), named = m && fdts.find((f) => akey(f.name) === akey(`FDT ${m[1]} ${m[2]}`));
      const close = fdts.reduce((a, f) => metres(f, p) < metres(a, p) ? f : a), f = !nearest && named ? named : close;
      if (!nearest && !named) notes.push(`${p.name} has no FDT by its number: from the nearest, ${close.name}`);
      (by.get(f) || by.set(f, []).get(f)).push(p);
    }
    for (const [n, k] of count) if (k > 1) notes.push(`${n} is on the map ${k} times: rename one in the box`);
    const at = (p) => `${p.name} ${p.lat}, ${p.lng}`, order = (a, b) => a.name.localeCompare(b.name, "id", { numeric: true });
    const text = [...by].sort((a, b) => order(a[0], b[0])).map(([f, list]) => [`${at(f)} ke:`, ...list.sort(order).map((p) => `* ${at(p)}`)].join("\n")).join("\n\n");
    return { text, notes, n: ends.length, fdts: fdts.length };
  }
  // the routes written in place of the link (or of the last ones written, when the pairing changes)
  async function fromMap(ta) {
    const link = MAPLINK.exec(ta.value); if (!link && !spk.map) return;
    if (link) { spk.text = ta.value; spk.map = { note: "Reading the map…" }; spkDraw();
      try { spk.map = { pts: await mapPoints(link[1]), text: link[0] }; } catch (e) { spk.map = { note: `Couldn't read the map: ${e.message}` }; return; } }
    if (!spk.map.pts) return;
    try { const m = mapRoutes(spk.map.pts, spk.mapNearest);
      if (!ta.value.includes(spk.map.text)) { spk.map = null; return; } // the routes were edited away: done with the map
      ta.value = ta.value.replace(spk.map.text, m.text); spk.text = ta.value; spk.map.text = m.text;
      spk.map.note = `${m.n} routes from ${m.fdts} FDTs on the map${m.notes.length ? `. ${m.notes.join(". ")}.` : "."}`;
    } catch (e) { spk.map = { note: `Couldn't use the map: ${e.message}` }; }
  }

  async function fsToken() {
    try {
      const db = await new Promise((ok, no) => { const q = indexedDB.open("firebaseLocalStorageDb"); q.onupgradeneeded = () => q.transaction.abort(); q.onsuccess = () => ok(q.result); q.onerror = no; });
      const all = await new Promise((ok, no) => { const q = db.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll(); q.onsuccess = () => ok(q.result); q.onerror = no; });
      db.close();
      const t = all.map((x) => x.value?.stsTokenManager).find((m) => m?.accessToken && m.expirationTime > Date.now() + 60000);
      if (t) return `Bearer ${t.accessToken}`;
    } catch {}
    return lastAuth;
  }
  const FS = "https://firestore.googleapis.com/v1/";
  async function fsCall(path, body) {
    const auth = await fsToken(); if (!auth) throw new Error("Not signed in");
    const r = await realFetch(FS + path, body ? { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { authorization: auth } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
    return j;
  }

  // the database path, read off the page's own Firestore traffic (so no project name lives in this script)
  function fsDb() {
    for (const e of performance.getEntriesByType("resource")) {
      const m = /database=(projects%2F[^&]+%2Fdatabases%2F[^&]+)/.exec(e.name); if (m) return decodeURIComponent(m[1]);
    }
    return null;
  }
  const fromFs = (v) => v == null ? null : "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue
    : "booleanValue" in v ? v.booleanValue : "arrayValue" in v ? (v.arrayValue.values || []).map(fromFs) : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)])) : null;
  async function fsList(db, collection, where) {
    const q = { from: [{ collectionId: collection }], limit: 500 };
    if (where) q.where = where;
    const rows = await fsCall(`${db}/documents:runQuery`, { structuredQuery: q });
    return rows.filter((r) => r.document).map((r) => ({ id: r.document.name.split("/").pop(), ...fromFs({ mapValue: { fields: r.document.fields } }) }));
  }
  // the same lists the form offers: teams, and projects that are planned or running
  async function spkLists() {
    const db = fsDb(); if (!db) throw new Error("Let Planning finish loading first");
    const [teams, projects] = await Promise.all([fsList(db, "technicianTeams"),
      fsList(db, "projects", { fieldFilter: { field: { fieldPath: "status" }, op: "IN", value: { arrayValue: { values: [{ stringValue: "Direncakan" }, { stringValue: "Berjalan" }] } } } })]);
    const byName = (a, b) => String(a.namaTim ?? a.name ?? "").localeCompare(String(b.namaTim ?? b.name ?? ""), "id");
    // employees come from the ERP's read copy (the database doesn't list them to a browser)
    const emps = await realFetch("/api/pg-read/employees?fields=name,role,status&limit=5000", { headers: { authorization: await fsToken() } }).then((r) => r.json()).then((j) => j.data || []).catch(() => []);
    return { db, teams: teams.sort(byName), projects: projects.sort(byName), emps };
  }
  const S = (v) => v == null ? { nullValue: null } : { stringValue: String(v) }, I = (n) => n == null ? { nullValue: null } : { integerValue: String(Math.round(n)) };
  const D = (n) => n == null ? { nullValue: null } : { doubleValue: n }, B = (b) => ({ booleanValue: !!b });
  function spkDoc(db, r) {
    const line = metres(r.a, r.b), route = { odpAkhirCore: I(1), coreCount: I(null), notes: S(null), straightLineMeters: I(line), cableLengthMeters: I(line == null ? null : Math.round(line / 10) * 10) };
    for (const [side, x] of [["from", r.a], ["to", r.b]]) Object.assign(route, { [`${side}AssetId`]: S(x.id), [`${side}AssetCode`]: S(x.code), [`${side}AssetType`]: S(x.type),
      [`${side}AssetDesa`]: S(x.desa), [`${side}AssetPlanned`]: B(x.planned), [`${side}AssetLat`]: D(x.lat), [`${side}AssetLng`]: D(x.lng) });
    // today: now (the form's default date); another day: that day's local midnight (what the form's calendar gives)
    const [y, m, d] = spk.date.split("-").map(Number), day = new Date(y, m - 1, d), now = new Date();
    const when = day.toDateString() === now.toDateString() ? now : day;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[n % 62]).join("");
    return { id, write: {
      update: { name: `${db}/documents/workOrders/${id}`, fields: {
        name: S(title(r)), status: S("Baru"), workOrderType: S(r.type), scheduledDate: { timestampValue: when.toISOString() },
        assignedTeamId: S(r.team), assignmentType: S("team"), assignedEmployeeIds: { arrayValue: {} }, assignedEmployeeNames: { arrayValue: {} },
        tasks: { arrayValue: {} }, installationTasks: { arrayValue: {} }, progress: { mapValue: { fields: { total: I(1), completed: I(0) } } },
        target: { mapValue: { fields: { type: S("cable-route"), ...route } } }, cableRoute: { mapValue: { fields: route } }, ...projField() } },
      updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }, { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: { exists: false } } };
  }
  // the same record the manual form saves for a team with no route: target manual, no tasks, progress 0/1
  // the project, or the form's «Bukan proyek»
  const projField = () => spk.project === "-" ? { projectId: { nullValue: null }, bukanProyek: B(true) } : { projectId: S(spk.project) };
  function countDoc(db, p, k = 0) {
    const [y, m, d] = spk.date.split("-").map(Number), day = new Date(y, m - 1, d), now = new Date();
    const when = day.toDateString() === now.toDateString() ? now : day;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[n % 62]).join("");
    const team = spk.lists.teams.find((t) => t.id === p.team);
    return { update: { name: `${db}/documents/workOrders/${id}`, fields: {
        name: S(p.kind === "poles" ? `Tanam Tiang wilayah ${p.area} no ${p.first + k}` : p.type === "Pengecekan Port ODP" ? (p.n > 1 ? `Pengecekan Port ODP (${k + 1}/${p.n})` : "Pengecekan Port ODP") : p.title),
        status: S("Baru"), workOrderType: S(p.type), scheduledDate: { timestampValue: when.toISOString() },
        assignedTeamId: S(p.team), assignmentType: S("team"), assignedEmployeeIds: { arrayValue: {} }, assignedEmployeeNames: { arrayValue: {} },
        tasks: { arrayValue: {} }, installationTasks: { arrayValue: {} }, progress: { mapValue: { fields: { total: I(1), completed: I(0) } } },
        // Pengecekan Port ODP: the technician picks each ODP when reporting, so the SPK only says which one of how many it is
        target: { mapValue: { fields: p.type === "Pengecekan Port ODP" ? { type: S("cek-port-odp"), urutan: I(k + 1), dari: I(p.n) } : { type: S("manual") } } }, ...projField(), ...(team && !(team.anggotaIds || []).length ? { teamEmptyAtCreate: B(true) } : {}) } },
      updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }, { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: { exists: false } };
  }
  // a count job's SPKs go in one commit (all of them are made, or none); a route is one SPK
  async function spkCreate() {
    spk.phase = "creating"; spk.stop = false; spk.note = ""; spkDraw();
    const db = spk.lists.db;
    for (const j of spk.jobs) {
      if (spk.stop) break;
      if (j.state === "ok") continue;
      j.state = "busy"; j.why = ""; spkDraw();
      try { await fsCall(`${db}/documents:commit`, { writes: j.kind === "route" ? [spkDoc(db, j).write] : Array.from({ length: j.n }, (_, k) => countDoc(db, j, k)) }); j.state = "ok"; }
      catch (e) { j.state = "err"; j.why = e.message; }
      spkDraw();
    }
    // Daftar SPK reads a copy of the SPKs that the ERP refreshes when its own pages call this sync (Misi, SPK
    // monitor); without it new SPKs stay out of the list until someone opens one of those
    if (spk.jobs.some((j) => j.state === "ok")) {
      spk.note = "Adding them to Daftar SPK…"; spkDraw();
      try {
        const auth = await fsToken(), res = await realFetch("/api/spk/mirror", { method: "POST", headers: auth ? { authorization: auth } : {} });
        const j = await res.json().catch(() => null);
        spk.note = res.ok && j?.ok !== false ? "" : "They're saved, but didn't reach Daftar SPK yet: opening Technical → Misi adds them.";
      } catch { spk.note = "They're saved, but didn't reach Daftar SPK yet: opening Technical → Misi adds them."; }
    }
    spk.phase = "done"; spkDraw();
  }

  function bulkSpkToggle() {
    if (bulkSpkOpen()) { document.getElementById("erp-bulk-spk").remove(); draw(); dispatchEvent(new Event("erp-fast-panel")); return; }
    if (!spk) {
      let pick = {}; try { pick = JSON.parse(localStorage.getItem(SPK_PICK) || "{}"); } catch {}
      const t = new Date(); spk = { text: "", jobs: [], picks: {}, phase: "input", team: pick.team || "", project: pick.project || "", type: pick.type || ROUTE_TYPES[0], mode: pick.mode || "paste", rows: [{ type: "Aktivasi ODP/FAT", team: "", n: 10 }],
        date: new Date(t - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10) };
    }
    const p = document.createElement("div"); p.id = "erp-bulk-spk"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Bulk SPK");
    document.body.append(p); spkDraw(); draw(); dispatchEvent(new Event("erp-fast-panel"));
    p.querySelector("textarea")?.focus();
    if (spk.mode === "manual") { manualJobs(); jobsResolve(); spkDraw(); }
    if (!spk.lists) spkLists().then((l) => { spk.lists = l; jobsResolve(); spkDraw(); }, (e) => { spk.note = `Couldn't read teams and projects: ${e.message}`; spkDraw(); });
  }
  const remember = () => { try { localStorage.setItem(SPK_PICK, JSON.stringify({ team: spk.team, project: spk.project, type: spk.type, mode: spk.mode })); } catch {} };
  // a panel redrawn from scratch keeps where it (and its scrolling boxes) were scrolled to
  function keepScroll(id, boxes, drawNow) {
    const p = document.getElementById(id); if (!p) return drawNow();
    const at = [p.scrollTop, ...boxes.map((b) => p.querySelector(b)?.scrollTop || 0)];
    drawNow();
    p.scrollTop = at[0]; boxes.forEach((b, i) => { const e = p.querySelector(b); if (e) e.scrollTop = at[i + 1]; });
  }
  const spkDraw = () => keepScroll("erp-bulk-spk", [".list", ".ex"], spkDrawNow);
  function spkDrawNow() {
    const p = document.getElementById("erp-bulk-spk"); if (!p || !spk) return;
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (t, run, cls = "") => { const b = mk("button", cls, t); b.type = "button"; b.onclick = run; return b; };
    const field = (label, control) => { const l = mk("label", "row"); l.append(mk("span", null, label), control); p.append(l); return control; };
    const sel = (opts, value, on) => { const s = mk("select"); for (const [v, t] of opts) s.append(new Option(t, v, false, v === value)); s.value = value; s.onchange = () => on(s.value); return s; };
    const again = () => { spk.armed = false; jobsResolve(); spkDraw(); };
    // a team picker you can type in: pick from the list as you type, or type any words of the name (any order) and
    // press Enter; a text that fits no single team goes back to what was there
    const teamFind = (value, on, ph) => {
      const teams = spk.lists?.teams || [], name = (t) => t.namaTim || t.id;
      let dl = document.getElementById("erp-team-list");
      if (!dl) { dl = document.createElement("datalist"); dl.id = "erp-team-list"; document.body.append(dl); }
      if (dl.childElementCount !== teams.length) dl.replaceChildren(...teams.map((t) => new Option(name(t))));
      const i = mk("input", "tf"); i.setAttribute("list", dl.id); i.autocomplete = "off"; i.placeholder = teams.length ? ph : "Loading…";
      const was = value ? name(teams.find((t) => t.id === value) || { id: value }) : ""; i.value = was;
      i.onfocus = () => i.select();
      i.oninput = () => { const t = teams.find((t) => name(t) === i.value); if (t) on(t.id); }; // picked from the list
      i.onchange = () => {
        if (!i.value.trim()) return on("");
        const w = fold(i.value).split(" "), exact = teams.find((t) => fold(name(t)) === fold(i.value));
        const hits = exact ? [exact] : teams.filter((t) => { const f = ` ${fold(name(t))} `; return w.every((x) => f.includes(x)); });
        if (hits.length === 1) return on(hits[0].id);
        i.value = was; i.title = hits.length ? `${hits.length} teams fit: type more of the name` : "No team has that name";
      };
      return i;
    };
    p.replaceChildren();
    const head = mk("div", "hd"); head.append(mk("span", "tag", "Bulk SPK"), btn("✕", bulkSpkToggle, "x")); head.lastChild.setAttribute("aria-label", "Close"); p.append(head);
    const editing = spk.phase === "input", manual = spk.mode === "manual";
    // paste a message, or fill rows of type / team / how many by hand
    const modes = mk("div", "seg"); modes.setAttribute("role", "group"); modes.setAttribute("aria-label", "How to enter SPKs");
    for (const [m, t] of [["paste", "Paste message"], ["manual", "Manual"]]) {
      const b = btn(t, async () => { if (spk.mode === m) return; spk.mode = m; spk.armed = false; remember(); if (m === "manual") { manualJobs(); jobsResolve(); } else await spkPlan(); spkDraw(); }, spk.mode === m ? "on" : "");
      b.setAttribute("aria-pressed", String(spk.mode === m)); b.disabled = !editing; modes.append(b);
    }
    p.append(modes);
    if (manual) {
      const box = mk("div", "man"), L0 = spk.lists;
      spk.rows.forEach((r, i) => {
        const row = mk("div", "mr"), j = spk.jobs[i];
        const ty = sel(MANUAL_TYPES.map((t) => [t, t]), r.type, (v) => { r.type = v; manualJobs(); again(); }); ty.setAttribute("aria-label", "Type");
        const tm = teamFind(r.team, (v) => { r.team = v; manualJobs(); again(); }, "Type a team…"); tm.setAttribute("aria-label", "Team");
        const n = mk("input"); n.inputMode = "numeric"; n.value = r.n; n.dataset.f = `n${i}`; n.setAttribute("aria-label", "How many SPKs");
        n.oninput = () => { r.n = n.value.replace(/\D/g, ""); const at = n.selectionStart; manualJobs(); again(); const n2 = document.querySelector(`#erp-bulk-spk [data-f="n${i}"]`); n2?.focus(); n2?.setSelectionRange(at, at); };
        const x = btn("✕", () => { spk.rows.splice(i, 1); manualJobs(); again(); }, "x"); x.setAttribute("aria-label", "Remove row");
        for (const c of [ty, tm, n, x]) c.disabled = !editing;
        row.append(ty, tm, n, x);
        if (j?.bad) row.append(mk("span", "s bad", j.bad));
        else if (j && r.team) { const t = L0?.teams.find((t) => t.id === r.team); if (t && !(t.anggotaIds || []).length) row.append(mk("span", "s", `${t.namaTim} has no members on file`)); }
        box.append(row);
      });
      const add = btn("+ Add row", () => { const last = spk.rows.at(-1); spk.rows.push({ type: last?.type || "Aktivasi ODP/FAT", team: "", n: last?.n || 10 }); manualJobs(); again(); }, "add");
      add.disabled = !editing; box.append(add); p.append(box);
    }
    const ta = mk("textarea"); ta.rows = 7; ta.value = spk.text; ta.disabled = !editing;
    ta.placeholder = "Paste the message…";
    ta.oninput = async () => {
      if (MAPLINK.test(ta.value)) await fromMap(ta);
      spk.text = ta.value; spk.armed = false; await spkPlan();
      const at = ta.selectionStart; spkDraw(); // redraw, then put the caret back where it was
      const t2 = document.querySelector("#erp-bulk-spk textarea"); t2?.focus(); t2?.setSelectionRange(at, at);
    };
    if (!manual) p.append(ta);
    if (!manual && spk.map?.note) {
      p.append(mk("p", "hint", spk.map.note));
      if (spk.map.pts) { // which FDT a FAT comes from
        const sel = mk("select"); sel.disabled = !editing;
        for (const [v, t] of [["", "FAT from the FDT its number names (1.4 → FDT 1)"], ["n", "FAT from the nearest FDT"]]) { const o = mk("option", null, t); o.value = v; o.selected = !!spk.mapNearest === !!v; sel.append(o); }
        sel.onchange = async () => { spk.mapNearest = !!sel.value; const t = document.querySelector("#erp-bulk-spk textarea"); await fromMap(t); spk.armed = false; await spkPlan(); spkDraw(); };
        p.append(sel);
      }
    }
    // how to write each kind, in its own scrolling box (open while the box above is empty)
    const guide = mk("details", "guide"); guide.open = spk.guide ?? !spk.text.trim();
    const sum = mk("summary", null, "How to write it"); sum.onclick = () => { spk.guide = !guide.open; }; // opened or closed by hand stays so
    guide.append(sum);
    const ex = mk("div", "ex");
    for (const [h, body] of [
      ["Routes: one SPK per DARI → KE", "Tarik & aktivasi FAT\nBudi santoso\nFDT DAYU ke :\n* FAT DAYU 1\n* FAT DAYU 2"],
      ["Or paste a Google My Maps link (shared with anyone with the link): its FDT and FAT points become the routes", "Tarik kabel distribusi\nBudi santoso\nhttps://www.google.com/maps/d/edit?mid=…"],
      ["New assets with their location (Google Maps' lat, lng)", "FDT DAYU -8.2336, 111.3114 ke:\n* FAT DAYU 1 -8.2337, 111.3114"],
      ["A number of SPKs per technician", "Aktivasi FAT\nAgus setiawan 10\nJoko susilo 15 spk"],
      ["Pengecekan Port ODP (1/n…)", "Cek port\nAgus setiawan 10 spk"],
      ["One SPK per pole", "Instalasi tiang\nJoko susilo\nSudimoro 5-24"],
      ["Other types", "Survey lokasi · Maintenance · Audit tiang · Instalasi OLT · Instalasi joinbox · Lain-lain, each with \u201cname 10 spk\u201d lines. Migrasi HTB, Visit isolir and CCTV stay in the form."]]) {
      ex.append(mk("b", null, h), mk("pre", null, body));
    }
    guide.append(ex); if (!manual) p.append(guide);
    const L = spk.lists, J = spk.jobs || [], routes = J.filter((j) => j.kind === "route");
    // the panel's team only serves routes with no technician above them; its type only routes with no type heading
    const viaPanel = routes.some((j) => j.viaPanel), plainType = routes.some((j) => !ROUTE_TYPES.includes(headType(j.head)) && !/akti[vf]asi/i.test(j.head));
    const ctl = [];
    if (viaPanel) ctl.push(field("Team", teamFind(spk.team, (v) => { spk.team = v; remember(); again(); }, "Type a team…")));
    ctl.push(field("Project", sel([["", L ? "Choose a project…" : "Loading…"], ["-", "Bukan proyek (outside any project)"], ...(L?.projects || []).map((t) => [t.id, t.name || t.id])], spk.project, (v) => { spk.project = v; remember(); again(); })));
    if (plainType) ctl.push(field("Route type", sel(ROUTE_TYPES.map((t) => [t, t]), spk.type, (v) => { spk.type = v; remember(); again(); })));
    const dateIn = mk("input"); dateIn.type = "date"; dateIn.value = spk.date; dateIn.onchange = () => { spk.date = dateIn.value; spk.armed = false; }; ctl.push(field("Date", dateIn));
    if (routes.length) {
      const ti = mk("input"); ti.value = spkTpl(); ti.oninput = () => { try { localStorage.setItem(SPK_TPL, ti.value); } catch {} spk.armed = false; jobsResolve(); listDraw(); }; ctl.push(field("Route title", ti));
      p.append(mk("p", "hint", "{dari} and {ke} become the asset names."));
    }
    for (const c of ctl) c.disabled = !editing;
    const team = L?.teams.find((t) => t.id === spk.team);
    if (viaPanel && team && !(team.anggotaIds || []).length) p.append(mk("p", "note", `${team.namaTim} has no members on file: its SPKs won't reach anyone's dashboard.`));
    const proj = L?.projects.find((t) => t.id === spk.project);
    if (proj && /internet rakyat/i.test(`${proj.name} ${proj.program || ""}`)) p.append(mk("p", "note", "This looks like an Internet Rakyat project: those SPKs are normally issued from Pemecah SPK per desa."));
    const list = mk("div", "list"); p.append(list);
    function listDraw() {
      list.replaceChildren();
      if (!J.length) { if (spk.text.trim()) list.append(mk("p", "hint", "No routes, \u201cname 10\u201d or pole-range lines found in this text yet. Is there a type heading (\u201cAktivasi FAT\u201d) above the names? Or use Manual.")); return; }
      J.forEach((j, i) => {
        const row = mk("div", `rt ${j.state || ""}`), tn = L?.teams.find((t) => t.id === j.team)?.namaTim || "";
        row.append(mk("span", "n", { ok: "✓", err: "✕", busy: "…" }[j.state] ?? String(i + 1)), mk("span", "t", j.kind === "route" ? title(j) : j.kind === "poles" ? `${j.title} (${j.n})` : `${j.title} × ${j.n}`));
        const bits = [j.type, j.emp && j.emp !== tn ? j.emp : ""];
        if (j.bad) bits.push(j.bad);
        const side = (x) => x?.ok === false ? x.why : x?.planned ? `${x.code}: new (Calon Aset${x.lat == null ? ", no location" : ""})` : "";
        if (j.kind === "route") { const m = metres(j.a || {}, j.b || {}); bits.push(side(j.a), side(j.b), m == null ? "" : `${m} m`); }
        if (j.why) bits.push(j.why);
        if (L && editing && j.who && (!j.opts.length && j.kind !== "route" || j.opts.length > 1 || spk.picks[j.who])) {
          // nobody or several fit: pick the team here, once per name (every team when the name wasn't found)
          // a few fits: a short list; nobody found: search every team
          const s = j.opts.length ? sel([["", `${j.opts.length} teams fit ${j.who}: choose one…`], ...j.opts.map((o) => [o.team, o.emp ? `${o.teamName} (${o.emp})` : o.teamName])], j.team, (v) => { spk.picks[j.who] = v; again(); })
            : teamFind(j.team, (v) => { spk.picks[j.who] = v; again(); }, `No technician called ${j.who}: type a team…`);
          s.classList.add("s"); s.setAttribute("aria-label", `Team for ${j.who}`); row.append(s);
        } else bits.splice(1, 0, tn || (L ? "" : "Loading teams…"));
        const sub = bits.filter(Boolean).join(" · ");
        if (sub) row.append(mk("span", "s", sub));
        list.append(row);
      });
    }
    if (!manual || !editing) listDraw();
    if (spk.note) p.append(mk("p", "note", spk.note));
    const foot = mk("div", "ft"), many = (j) => j.kind === "route" ? 1 : j.n, total = J.reduce((n, j) => n + many(j), 0);
    if (editing) {
      const assets = routes.some((j) => j.a?.ok === false || j.b?.ok === false), bad = J.find((j) => j.bad), noTeam = J.find((j) => !j.team);
      const missing = !J.length ? (manual ? "Add a row" : "Paste a message") : !L ? "Loading teams…" : assets ? "Fix the names marked above" : bad ? "Fix the line marked above"
        : noTeam ? (noTeam.manual ? "Choose a team on each row" : noTeam.viaPanel ? "Choose a team" : `Choose a team for ${noTeam.who}`) : !spk.project ? "Choose a project"
        : spk.project === "-" && J.some((j) => j.type === "Audit Tiang Existing") ? "Audit Tiang Existing needs a project" : !spk.date ? "Choose a date" : routes.length && !spk.idx ? "Assets still loading" : "";
      const teams = new Set(J.map((j) => j.team)).size;
      const go = btn(missing || (spk.armed ? `Press again: create ${total} SPK${total > 1 ? "s" : ""} for ${teams} team${teams > 1 ? "s" : ""}` : `Create ${total} SPK${total > 1 ? "s" : ""}`), () => {
        if (!spk.armed) { spk.armed = true; spkDraw(); setTimeout(() => { if (spk.armed && spk.phase === "input") { spk.armed = false; spkDraw(); } }, 6000); return; }
        spk.armed = false; spkCreate();
      }, "primary");
      go.disabled = !!missing; foot.append(go);
    } else if (spk.phase === "creating") {
      foot.append(mk("span", "hint", `Making SPKs… ${J.filter((j) => j.state === "ok").reduce((n, j) => n + many(j), 0)} of ${total}`), btn("Stop", () => { spk.stop = true; }));
    } else {
      const ok = J.filter((j) => j.state === "ok").reduce((n, j) => n + many(j), 0), err = J.filter((j) => j.state === "err").length;
      foot.append(mk("span", "hint", `${ok} SPK${ok === 1 ? "" : "s"} made${err ? `, ${err} line${err > 1 ? "s" : ""} failed` : ""}${spk.stop ? " (stopped)" : ""}.`));
      if (err) foot.append(btn("Retry failed", () => spkCreate()));
      const open = mk("a", "lnk", "Open Daftar SPK"); open.href = "/work-orders"; foot.append(open);
      foot.append(btn("New list", () => { spk = { ...spk, text: "", jobs: [], phase: "input", note: "", stop: false }; if (spk.mode === "manual") { manualJobs(); jobsResolve(); } spkDraw(); }));
    }
    p.append(foot);
  }
  async function spkPlan() {
    const jobs = parseJobs(spk.text);
    if (!spk.idx && jobs.some((j) => j.kind === "route")) spk.idx = await assetIndex().catch(() => null);
    spk.jobs = jobs.map((j) => j.kind === "route" ? { ...j, a: placeAsset(spk.idx, j.from), b: placeAsset(spk.idx, j.to) } : j);
    jobsResolve();
  }
  // each job's type, title and team: the technician's team, a team picked by hand for that name, or (for routes with
  // nobody named above them) the panel's team
  function jobsResolve() {
    const L = spk.lists, proj = L?.projects.find((t) => t.id === spk.project)?.name || "", seen = new Map();
    for (const j of spk.jobs || []) {
      if (j.manual) { j.title = countTitle(j); j.bad = j.n > 0 ? countBad(j) : "How many?"; j.opts = []; j.emp = ""; continue; }
      j.type = jobType(j); j.bad = "";
      if (j.kind !== "route") { j.title = countTitle(j); j.bad = countBad(j); }
      if (!L) { j.opts = []; j.team = ""; continue; }
      if (!seen.has(j.who)) seen.set(j.who, j.who ? teamsFor(j.who, L.emps, L.teams, proj) : []);
      j.opts = seen.get(j.who);
      j.viaPanel = j.kind === "route" && !j.opts.length && !spk.picks[j.who];
      j.team = spk.picks[j.who] || (j.opts.length === 1 ? j.opts[0].team : j.viaPanel ? spk.team : "");
      j.emp = j.opts.find((o) => o.team === j.team)?.emp || "";
    }
  }

