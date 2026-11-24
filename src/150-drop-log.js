    // ---- Drop log ----
    // The ERP keeps no history of when a customer's line went down (RADIUS only counts sessions, the OLT lists say online
    // or offline). So every 15 minutes one ERP tab reads the live session list (6 MB, ~1 s) and keeps, per customer, the
    // start of every session seen in the last 7 days (each new one is a reconnect, at its exact time) and the last time
    // they were seen online; someone online in one reading and gone in the next went down between the two.
    const DROP_AT = "erpDock.dropAt", DROP_EVERY = 15 * 60000, DROP_KEEP = 7 * 86400000;
    let drops = null;
    async function dropTick(force) {
      if (!force && Date.now() - Number(ls.get(DROP_AT, 0)) < DROP_EVERY) return;
      ls.set(DROP_AT, Date.now()); // the other tabs wait
      try {
        live = null; const lv = await liveSessions(), t = Date.now(), d = (await idbGet("drops")) || { first: t, u: {}, off: {} }, seen = new Set(), was = new Set(Object.keys(d.off));
        for (const [u, x] of lv.by) { seen.add(u); const r = d.u[u] ||= { s: [] };
          if (x.start && !r.s.includes(x.start)) r.s.push(x.start);
          r.s = r.s.filter((v) => v > t - DROP_KEEP).slice(-40); Object.assign(r, { last: t, ip: x.addr, mac: x.mac, nas: x.ip, ro: x.ro }); delete d.off[u]; }
        for (const [u, r] of Object.entries(d.u)) {
          if (!seen.has(u) && !d.off[u]) d.off[u] = { from: r.last, seen: t };
          if (r.last < t - DROP_KEEP) { delete d.u[u]; delete d.off[u]; } }
        // who went down and who came back since the last reading, 24 h of them, so a map can be wound back (Replay)
        const now = Object.keys(d.off), gone = now.filter((u) => !was.has(u)), back = [...was].filter((u) => !d.off[u] && d.u[u]);
        d.ev = [...(d.ev || []).filter((e) => e[0] > t - 86400000), [t, gone, back]];
        d.at = t; idbPut("drops", d); drops = d;
        incDrops(gone, d).catch(() => {});
      } catch { /* the next reading tries again */ }
    }
    const dropsOf = async () => (drops && Date.now() - drops.at < DROP_EVERY) ? drops : (drops = (await idbGet("drops")) || drops);
    // the ERP's own row for a feed router: the same name when it's a real one, else the biggest look-alike
    // (RO ARJOSARI and the old ARJOSARI are different routers; RO-NGADIROJO-E2E is NGADIROJO)
    function areaOf(name) {
      const rows = areas?.rows ?? [], n = nameNorm(name), exact = rows.find((r) => r.router === name);
      if (exact && exact.active >= 50) return exact;
      const like = rows.filter((r) => r.router && r.router !== "(?)" && (nameNorm(r.router) === n || n.includes(nameNorm(r.router)) || nameNorm(r.router).includes(n)));
      return like.sort((a, b) => b.active - a.active)[0] || exact || null;
    }
    function spark(cv, series, usual, big) {
      requestAnimationFrame(() => {
        const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || series.length < 2) return;
        cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
        const vs = series.map(([, v]) => v), max = Math.max(...vs, usual ?? 0, 1) * 1.08, t0 = Date.now() - 24 * 3600000;
        const X = (t) => ((t - t0) / (24 * 3600000)) * w, Y = (v) => h - 2 - (v / max) * (h - 4);
        if (usual != null) { g.strokeStyle = "#363738"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, Y(usual)); g.lineTo(w, Y(usual)); g.stroke(); g.setLineDash([]); }
        g.strokeStyle = "#b3b0af"; g.lineWidth = big ? 1.5 : 1; g.beginPath();
        series.forEach(([t, v], i) => (i && t - series[i - 1][0] < 20 * 60000 ? g.lineTo(X(t), Y(v)) : g.moveTo(X(t), Y(v)))); g.stroke();
        const [lt, lv] = series[series.length - 1]; g.fillStyle = lv < (usual ?? 0) * 0.9 ? "#ff6a5c" : "#e9e1dc"; g.beginPath(); g.arc(X(lt), Y(lv), big ? 3 : 2, 0, Math.PI * 2); g.fill();
      });
    }
    function radarView() {
      if (view.nas) return [routerView(view.nas)];
      if (view.topoEdit) return [topoEditor(() => { view.topoEdit = false; drawBody(); })];
      const out = [], head = el("div", "rhead"), e = el("div", "eyebrow"); e.style.margin = "10px 6px 6px"; e.append("Outage radar");
      const tools = el("div", "tools"), again = el("button", "btn", "Check now"); again.type = "button";
      again.onclick = async () => { again.disabled = true; again.textContent = "Checking…"; await radarTick(true); drawBody(); };
      const mapBtn = el("button", "btn", topology().names.size ? "Topology" : "Add topology"); mapBtn.type = "button"; mapBtn.title = "The links between routers, so an outage is traced to where it starts";
      mapBtn.onclick = () => { view.topoEdit = true; drawBody(); };
      tools.append(radar?.at ? `checked ${ago(radar.at)}` : "", mapBtn, again); head.append(e, tools); out.push(head);
      if (radarOff) { out.push(el("p", "note late", radarOff)); if (!radar) return out; }
      if (!radar) { out.push(el("p", "note ld", "Reading the routers…")); radarTick(true); return out; }
      radarDrawn = radar.at;
      const said = (x) => `${x.open} online · usually ${x.usual}${x.since ? ` · since ${hhmm(x.since)}` : ""}`;
      if (radar.wide) out.push(el("div", "ralert", "Most routers dropped at once: more likely the central link or the RADIUS server than one area."));
      const stuck = radar.alerts.filter((x) => x.level === "nofeed");
      if (stuck.length > 1 && new Set(stuck.map((x) => x.since)).size === 1) out.push(el("div", "ralert drop", `${stuck.length} routers stopped reporting at the same moment (${hhmm(stuck[0].since)}): more likely the RADIUS accounting link or the ERP's reader than ${stuck.length} outages.`));
      // with the map: one card per fault, and the routers behind it aren't repeated as alerts of their own
      const tf = topoFaults(radar), covered = new Set();
      for (const f of tf?.faults || []) {
        const t = faultText(tf, f), b = el("button", `ralert item${[f.x, ...f.behind.map((k) => tf.at.get(k))].some((x) => x?.level === "down") ? "" : " drop"}`); b.type = "button";
        const reach = behindOf(tf, f.at);
        b.append(el("b", null, `${t.head}${reach?.usual ? ` · ≈${reach.usual.toLocaleString("id-ID")} customers` : ""}`), el("span", null, t.body));
        if (reach?.usual) b.append(el("span", "reach", `${reachText(reach)[0].toUpperCase()}${reachText(reach).slice(1)}.`));
        for (const k of f.behind) { const x = tf.at.get(k); if (x) covered.add(x.ip); }
        if (f.x && topoBad(f.x)) covered.add(f.x.ip);
        const crew = crewLine(crewOf(areaOf(f.x?.name || tf.at.get(f.heads[0])?.name || "")?.router)); if (crew) b.append(el("span", "crew", crew));
        const go = f.x || tf.at.get(f.heads[0]); if (go) b.onclick = () => { view.nas = go.ip; drawBody(); }; out.push(b);
      }
      for (const x of radar.alerts) {
        if (covered.has(x.ip)) continue;
        const b = el("button", `ralert item${x.level === "down" ? "" : " drop"}`); b.type = "button";
        if (x.level === "nofeed") b.append(el("b", null, `${x.name}: no data since ${x.since ? hhmm(x.since) : "?"}`), el("span", null, `count frozen at ${x.open} (usually ${x.usual}): the ERP stopped hearing from this router, so whether its customers are online isn't known. Check the router, or its OLT's ONT list.`));
        else b.append(el("b", null, `${x.name}: ${x.level === "down" ? "down" : `${x.gap} fewer online`}`), el("span", null, x.healthy ? said(x) : `${said(x)} · its session feed has stopped`));
        const crew = crewLine(crewOf(areaOf(x.name)?.router)); if (crew) b.append(el("span", "crew", crew));
        b.onclick = () => { view.nas = x.ip; drawBody(); }; out.push(b);
      }
      if (!radar.alerts.length && !radar.learning) out.push(el("div", "rok", `All ${radar.list.filter((x) => x.level !== "silent").length} routers at their usual level.`));
      if (radar.learning) out.push(el("p", "note", "Learning each router's usual level from a reading every 5 minutes while an ERP tab is open. Alerts start after about 25 minutes; the lines fill in over a day."));
      if (tf) { const e3 = el("div", "eyebrow"); e3.append("Network"); out.push(e3, topoTree(tf, (ip) => { view.nas = ip; drawBody(); })); }
      // the links' load by hour over the last week: the ones that fill up, and when
      if (!linkHist) linkHistLoad().then(() => { if (panel) drawBody(); }).catch(() => {});
      else { const lk = linkPeaks(linkHist), days = Math.max(0, ...lk.map((x) => x.of)), hot = lk.filter((x) => x.full >= 2 || x.busy >= 2).slice(0, 8);
        const e4 = el("div", "eyebrow"); e4.append("Uplinks at peak"); out.push(e4);
        if (days < 2) out.push(el("p", "note", "Each link's load is noted every 5 minutes while an ERP tab is open; the hours it fills up show after two days."));
        else if (!hot.length) out.push(el("div", "rok", `No link reached 75% on two or more of the last ${days} days.`));
        for (const x of hot) { const row = el("div", "peak"); row.append(el("b", null, x.name), el("span", null, `${peakText(x)} · ${capText(x.cap)}`), hourStrip(x.hours)); out.push(row); }
      }
      const e2 = el("div", "eyebrow"); e2.append("Routers"); out.push(e2);
      radar.list.forEach((x, i) => {
        const b = el("button", "item rrow rise"); b.type = "button"; b.style.setProperty("--i", String(Math.min(i, 14)));
        const area = areaOf(x.name);
        const cv = el("canvas"); cv.setAttribute("aria-hidden", "true");
        const n = el("span", "n"); n.append(String(x.open));
        const dark = x.level === "silent" && (area?.active ?? 0) >= 20; // nothing reported, yet customers on file: the feed or the router
        n.append(el("small", x.level === "down" ? "late" : x.level === "drop" || x.level === "nofeed" || dark ? "warn" : null, dark ? "no sessions: check" : x.level === "nofeed" ? "no data" : x.level === "silent" ? "no sessions" : x.usual == null ? "learning" : x.gap > 0 ? `−${x.gap} vs ${x.usual}` : `usual ${x.usual}`));
        b.append(el("span", `dot ${x.level === "learning" ? "" : x.level === "nofeed" ? "drop" : x.level}`), el("span", "t", x.name), cv, n, el("span", "s", [area?.district, area ? `${area.active} active customers` : ""].filter(Boolean).join(" · ") || " "));
        const crew = crewLine(crewOf(area?.router)); if (crew) b.append(el("span", "s crew", crew));
        b.onclick = () => { view.nas = x.ip; drawBody(); };
        out.push(b); spark(cv, x.series, x.usual);
      });
      if (!areas) areaNames().then(() => view.mode === "radar" && !view.nas && drawBody());
      if (!techMap) techIndex().then(() => view.mode === "radar" && drawBody()).catch(() => {}); // the crew lines come in after
      return out;
    }
    function routerView(ip) {
      const x = radar?.list.find((r) => r.ip === ip), wrap = el("div", "card");
      const back = el("button", "back", "← All routers"); back.type = "button"; back.onclick = () => { view.nas = null; view.desa = null; drawBody(); };
      wrap.append(back);
      if (!x) { wrap.append(el("p", "note", "This router isn't in the feed any more.")); return wrap; }
      const who = el("div", "who rise"), pill = el("span", "pill");
      pill.append(el("span", `dot ${x.level === "nofeed" ? "drop" : x.level}`), { down: "Down", drop: "Dropping", nofeed: "No data", ok: "Normal", learning: "Learning", silent: "No sessions" }[x.level]);
      who.append(el("h3", null, x.name), pill); wrap.append(who);
      const crew = crewOf(areaOf(x.name)?.router);
      if (crew && (crew.field.length || crew.ka.length)) {
        const box = el("div", "techs rise"); box.style.cssText = "margin-top:10px"; box.style.setProperty("--i", "1");
        for (const t of [...crew.field, ...crew.ka]) { const row = el("div", "team"), kind = teamKind(t.name);
          row.append(el("span", `tag k-${kind}`, kind === "area" ? "KA" : "Field"), el("b", null, titleCase(t.name).replace(/^Ka /, "KA ")), el("span", "sub", t.members.map((m) => (m.lead ? `${titleCase(m.n)} (lead)` : titleCase(m.n))).join(", ") || "no members"));
          box.append(row); }
        wrap.append(box);
      }
      const stats = el("div", "stats rise"); stats.style.cssText = "margin-top:12px;padding:0"; stats.style.setProperty("--i", "1");
      const stat = (v, l, cls = "") => { const d = el("div", `stat ${cls}`); d.append(el("b", null, String(v)), el("span", null, l)); stats.append(d); return d; };
      stat(x.open, "online now", x.level === "down" || x.level === "drop" ? "bad" : "on"); stat(x.usual ?? "–", "usually"); const back15 = stat("…", "reconnected ≤15 min");
      wrap.append(stats);
      const chart = el("div", "near rise"); chart.style.setProperty("--i", "2");
      const cv = el("canvas", "big"); cv.setAttribute("aria-label", `${x.name} sessions over the last 24 hours`);
      const ticks = el("div", "ticks"); for (const hAgo of [24, 18, 12, 6, 0]) ticks.append(el("span", null, hAgo ? hhmm(Date.now() - hAgo * 3600000) : "now"));
      chart.append(el("div", "sub", `Sessions, last 24 hours${x.usual != null ? " · dashed: usual level" : ""}${x.since ? ` · dropping since ${hhmm(x.since)}` : ""}`), cv, ticks);
      wrap.append(chart); spark(cv, x.series, x.usual, true);
      const who2 = el("div", "near rise"); who2.style.setProperty("--i", "3"); wrap.append(who2);
      if (!customers) { who2.append(el("p", "note", "To see who's offline, open LDN Radius → Pelanggan once so the customer list is kept here.")); return wrap; }
      who2.append(el("p", "note ld", "Reading the live sessions…"));
      liveSessions().then((lv) => { if (view.nas === ip && who2.isConnected) offlineView(who2, back15, ip, lv); }).catch((e) => { who2.replaceChildren(el("p", "note late", e.message)); });
      return wrap;
    }
    // which customers belong to this router: online ones by their session, offline ones by their LDN router name
    // (each name goes to the router most of its online customers are on)
    function routerOff(ip, lv) {
      const votes = {};
      for (const c of customers) { const s = lv.by.get(String(c.username).toLowerCase()); if (s) { const v = (votes[c.router] ||= {}); v[s.ip] = (v[s.ip] || 0) + 1; } }
      const home = {}; for (const [r, v] of Object.entries(votes)) home[r] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
      const mine = [], off = []; let fresh = 0;
      for (const c of customers) {
        if (c.isolir || c.isInactive) continue;
        const s = lv.by.get(String(c.username).toLowerCase());
        if (s ? s.ip === ip : home[c.router] === ip) { mine.push(c); if (!s) off.push(c); else if (s.up < 900) fresh++; }
      }
      return { mine, off, fresh };
    }
    function offlineView(box, back15, ip, lv) {
      const { mine, off, fresh } = routerOff(ip, lv);
      back15.querySelector("b").textContent = String(fresh);
      const parts = [];
      const e = el("div", "eyebrow"); e.style.margin = "0 0 8px"; e.append(`Offline now `, el("b", null, `${off.length} of ${mine.length} active customers`)); parts.push(e);
      if (fresh >= 10) parts.push(el("p", "note good", `${fresh} customers reconnected in the last 15 minutes: the line is coming back.`));
      const rx = radar?.list.find((r) => r.ip === ip);
      if (off.length) parts.push(causeBox(off, x_name(ip)));
      if (off.length) parts.push(reportBox({ title: x_name(ip), down: off.length, total: mine.length, since: rx?.level === "down" || rx?.level === "drop" ? rx.since : null, custs: off }));
      // where the offline ones are, on the map
      const pts = mine.map((c) => ({ c, p: where(c), on: !off.includes(c) })).filter((z) => z.p);
      if (pts.length) { parts.push(areaMap(pts, `${off.length} offline customers on a map of ${x_name(ip)}`, { what: `Router ${x_name(ip)}`, since: rx?.level === "down" || rx?.level === "drop" ? rx.since : null }));
        parts.push(el("p", "note", `On the map: ${pts.length} of ${mine.length} customers (the ones with a saved location), problems named on the map.`)); }
      // villages, most offline first
      const by = new Map(); for (const c of mine) { const d = c.desa || "No village"; const g = by.get(d) || { all: 0, off: [] }; g.all++; if (off.includes(c)) g.off.push(c); by.set(d, g); }
      const rows = [...by].filter(([, g]) => g.off.length).sort((a, b) => b[1].off.length - a[1].off.length || b[1].off.length / b[1].all - a[1].off.length / a[1].all);
      if (!rows.length) parts.push(el("p", "note", "Everyone on this router is online."));
      rows.slice(0, 15).forEach(([d, g], i) => {
        const b = el("button", "item desa rise"); b.type = "button"; b.style.setProperty("--i", String(i));
        const m = el("span", "meter"), fill = el("i"); fill.style.width = `${Math.round((g.off.length / g.all) * 100)}%`; m.append(fill);
        b.append(el("span", "t", d), m, el("span", "r", `${g.off.length} / ${g.all}`));
        b.onclick = () => { view.desa = view.desa === d ? null : d; offlineView(box, back15, ip, lv); };
        parts.push(b);
        if (view.desa === d) parts.push(...g.off.slice(0, 40).map((c, j) => custItem(c, j)));
      });
      box.replaceChildren(...parts);
      items = [...panel.querySelectorAll(".scroll .item, .scroll .tile")];
    }
    const x_name = (ip) => radar?.list.find((r) => r.ip === ip)?.name || "this router";
    function radarItem(i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      const a = radar?.alerts ?? [];
      b.append(el("span", `dot ${a.some((x) => x.level === "down") ? "down" : a.length ? "drop" : radar && !radar.learning ? "ok" : ""}`), el("span", "t", "Outage radar"),
        el("span", "r", a.length ? `${a.length} alert${a.length > 1 ? "s" : ""}` : radar?.learning ? "learning" : radar ? "all normal" : ""),
        el("span", "s", a.length ? a.map((x) => `${x.name} ${x.level === "down" ? "down" : x.level === "nofeed" ? "no data" : `−${x.gap}`}`).join(" · ") : "Routers against their usual level; who's offline, by village and on a map"));
      b.onclick = () => { view.mode = "radar"; view.nas = null; view.card = null; drawBody(); }; return b;
    }

