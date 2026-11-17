    // ---- Data health: which numbers to trust ----
    // OLT polling age (a list not read for days makes the PON board and signal watch stale), routers whose session feed
    // is dead (the radar can't see them), and customers whose RO on file isn't where their session is (Remote ONU and
    // the radar's RO grouping go wrong for them).
    let polling = new Set(), wrongRo = null;
    async function readOlt(pid, name) {
      polling.add(pid); drawBody();
      try {
        const j = await api(`/api/olt/profiles/${pid}/onts`), d = j.data || [], p = { id: pid, name, vendor: "" };
        if (j.stale || j.fallback) view.healthMsg = { bad: true, text: `${name}: the ERP couldn't reach the OLT (${j.message || "no reason given"}), so it gave its old copy. The OLT's connection needs fixing on the ERP side.` };
        else { const rows = [...onts.rows.filter((o) => o.pid !== pid), ...d.filter((o) => o.serialNumber).map((o) => ontRow(o, p))];
          const v = { at: onts.at, rows, olts: onts.olts }; idbPut("onts", v); onts = indexOnts(v); view.healthMsg = { good: true, text: `${name}: read ${d.length} modems from the OLT just now.` }; }
      } catch (err) { view.healthMsg = { bad: true, text: `${name} didn't answer: ${err.message}` }; }
      polling.delete(pid); drawBody();
    }
    function healthView() {
      const out = []; boardHead("Data health", out); if (!needOnts(out)) return out;
      if (view.healthMsg) out.push(el("p", `note ${view.healthMsg.bad ? "late" : "good"}`, view.healthMsg.text));
      // 1. OLT lists by age
      const olts = new Map(); for (const o of onts.rows) { let g = olts.get(o.pid); if (!g) olts.set(o.pid, (g = { pid: o.pid, olt: o.olt, n: 0, newest: 0 })); g.n++; const t = o.seen ? new Date(o.seen).getTime() : 0; if (t > g.newest) g.newest = t; }
      const list = [...olts.values()].sort((a, b) => a.newest - b.newest), age = (g) => Date.now() - g.newest;
      const stale = list.filter((g) => age(g) > 24 * 3600000).length;
      const e1 = el("div", "eyebrow"); e1.append("OLT lists ", el("b", null, stale ? `${stale} of ${list.length} older than a day` : `all ${list.length} read within a day`)); out.push(e1);
      list.forEach((g, i) => {
        const row = el("div", "item hrow rise"); row.style.setProperty("--i", String(Math.min(i, 14)));
        const a = age(g), lv = !g.newest || a > 3 * 86400000 ? "bad" : a > 24 * 3600000 ? "drop" : a > 6 * 3600000 ? "" : "on";
        const read = el("button", "copy", polling.has(g.pid) ? "Reading…" : "Read now"); read.type = "button"; read.disabled = polling.has(g.pid);
        read.title = "Ask the OLT for its modem list now (read-only; up to ~50 s)"; read.onclick = () => readOlt(g.pid, g.olt);
        const info = onts.olts.find((x) => x.id === g.pid), why = a > 24 * 3600000 && info && info.ok === false && info.err ? ` · the ERP can't reach it${info.ip ? ` (${info.ip})` : ""}: ${info.err.replace(/\s+/g, " ").slice(0, 110)}…` : "";
        row.append(el("span", `dot ${lv}`), el("span", "t", g.olt), read, el("span", "s", `${g.n} modems · newest reading ${g.newest ? when(g.newest) : "never"}${why}`));
        out.push(row);
      });
      // 2. router session feeds (from the radar)
      const e2 = el("div", "eyebrow"); e2.append("Router session feeds"); out.push(e2);
      if (!radar) { out.push(el("p", "note ld", "Reading the routers…")); radarTick(true).then(() => view.mode === "health" && drawBody()); }
      else {
        if (!areas) areaNames().then(() => view.mode === "health" && drawBody());
        const dead = radar.list.filter((x) => !x.healthy || x.level === "silent");
        if (!dead.length) out.push(el("p", "note good", `All ${radar.list.length} routers are reporting sessions.`));
        dead.forEach((x) => { const a = areaOf(x.name), row = el("div", "item hrow");
          row.append(el("span", `dot ${(a?.active ?? 0) >= 20 ? "bad" : ""}`), el("span", "t", x.name), el("span", "r", `${x.open} sessions`),
            el("span", "s", (a?.active ?? 0) >= 20 ? `feed ${x.healthy ? "quiet" : "stopped"}, yet ${a.active} active customers on file: their sessions are counted on another router, or the feed is broken` : `feed ${x.healthy ? "quiet" : "stopped"}; few or no customers on file (likely retired)`));
          out.push(row); });
      }
      // 3. customers on the wrong RO
      const e3 = el("div", "eyebrow"); e3.append("Customers on the wrong RO"); out.push(e3);
      if (!customers) out.push(el("p", "note", "Needs the customer list: open LDN Radius → Pelanggan once."));
      else if (!wrongRo) { const b = el("button", "btn", "Check now (reads the live sessions, ~1 s)"); b.type = "button"; b.style.margin = "0 6px";
        b.onclick = async () => { b.disabled = true; b.textContent = "Checking…"; try { wrongRo = findWrongRo(await liveSessions()); } catch (err) { view.healthMsg = { bad: true, text: err.message }; } drawBody(); }; out.push(b); }
      else {
        out.push(el("p", "note", `${wrongRo.list.length} of ${wrongRo.online.toLocaleString("id-ID")} online customers have a different RO on file than where their session is. The ERP's Remote ONU can't find them, and the radar counts them on the other router.`));
        const csv = ["username,nama,ro_di_data,ro_sesi", ...wrongRo.list.map((x) => [x.c.username, `"${String(x.c.nama || "").replace(/"/g, "'")}"`, x.from || "(kosong)", x.to].join(","))].join("\n");
        const acts = el("div", "actions"); acts.style.margin = "0 6px 6px"; const c = el("button", "btn", "Copy the list (CSV)"); c.type = "button"; c.onclick = () => copy(csv, c); acts.append(c); out.push(acts);
        wrongRo.pairs.slice(0, 12).forEach(([k, l], i) => {
          const b = el("button", "item desa rise"); b.type = "button"; b.style.setProperty("--i", String(i));
          const m = el("span", "meter"), f = el("i"); f.style.width = `${Math.round((l.length / wrongRo.pairs[0][1].length) * 100)}%`; m.append(f);
          b.append(el("span", "t", k), m, el("span", "r", String(l.length))); b.onclick = () => { view.roPair = view.roPair === k ? null : k; drawBody(); }; out.push(b);
          if (view.roPair === k) l.slice(0, 50).forEach((x, j) => out.push(custItem(x.c, j)));
        });
      }
      return out;
    }
    function findWrongRo(lv) {
      const word = (x) => String(x || "").toUpperCase().replace(/^RO[\s-]+/, "").split(/[\s-]/)[0];
      const list = []; let online = 0;
      for (const c of customers) { const s = lv.by.get(String(c.username).toLowerCase()); if (!s || s.type !== "pppoe") continue; online++;
        if (word(c.router) !== word(s.ro)) list.push({ c, from: c.router || "", to: s.ro }); }
      const by = new Map(); for (const x of list) { const k = `${x.from || "(kosong)"} → ${x.to}`; by.set(k, [...(by.get(k) || []), x]); }
      return { at: Date.now(), online, list, pairs: [...by].sort((a, b) => b[1].length - a[1].length) };
    }
    // The whole network on one map (Map Terpadu in the Dock): every active customer with a saved location, online from the
    // live session list (else the customer list), with the same brief, villages, boxes and replay as a router's map.
    // From the Go to tile it opens full screen.
    function mapView() {
      const out = [], head = el("div", "rhead"), e = el("div", "eyebrow"); e.style.margin = "10px 6px 6px"; e.append("Network map");
      const erp = el("button", "btn", "ERP's Peta Terpadu"); erp.type = "button"; erp.onclick = () => go("/customer-map");
      const tools = el("div", "tools"); tools.append(erp); head.append(e, tools);
      const back = el("button", "back", "← Back"); back.type = "button"; back.style.marginLeft = "6px"; back.onclick = () => { view.mode = null; drawBody(); };
      out.push(head, back);
      if (!customers) { out.push(el("p", "note", "Open LDN Radius → Pelanggan once so the customer list is kept here.")); return out; }
      const on = (c) => (live && Date.now() - live.at < 10 * 60000 ? live.by.has(lower(c.username)) : !!c.online);
      const pts = customers.filter((c) => !c.isInactive).map((c) => ({ c, p: where(c), on: on(c) })).filter((z) => z.p);
      const map = areaMap(pts, `Map of ${pts.length} customers`, { what: "Semua pelanggan" });
      // the live list arrives after: update who's online in place (a fresh drawBody would close full screen)
      if (!live || Date.now() - live.at > 10 * 60000) liveSessions().then(() => { for (const z of pts) z.on = on(z.c); map.isConnected && map.redraw(); }).catch(() => {});
      out.push(map, el("p", "note", `${pts.length} of ${customers.length} customers have a saved location. Problems are framed and named; F or ⤢ for full screen.`));
      if (view.mapFull) { view.mapFull = false; setTimeout(() => map.isConnected && toggleFull(map), 50); }
      return out;
    }
    function boardItem(i, mode) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      const [t, s, icon] = { signal: ["Weak signal", "Modems below −28 / −26 dBm, and PON ports where several are weak", "M4 18h2M8 14h2v4H8zM12 10h2v8h-2zM16 6h2v12h-2z"],
        pon: ["PON board", "Every PON port by share offline or weak signal; open one for its modems and map", "M4 6h16M4 12h16M4 18h16M8 4v4M14 10v4M10 16v4"],
        health: ["Data health", "Which numbers to trust: OLT polling age, router session feeds, customers on the wrong RO", "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM9 12l2 2 4-4"] }[mode];
      b.append(svg(icon), el("span", "t", t), el("span", "r", ""), el("span", "s", s));
      b.onclick = () => { view.mode = mode; view.pon = null; view.from = null; view.card = null; drawBody(); }; return b;
    }

    function draw() {
      if (!panel) return;
      const top = el("div", "top"), input = el("input"); input.placeholder = "Customer, modem SN, page or tool…"; input.value = view.q; input.setAttribute("aria-label", "Search the Dock");
      input.oninput = () => { view.q = input.value; view.sel = 0; view.card = null; view.mode = null; view.modem = null; drawBody(); };
      input.onpaste = (e) => { const t = e.clipboardData?.getData("text") || ""; if (t.split("\n").filter((x) => x.trim()).length >= 2) { e.preventDefault(); openBulk(t); } }; // a pasted list: Bulk Lunas
      const shut = el("button", "shut"); shut.type = "button"; shut.setAttribute("aria-label", "Close the Dock"); shut.title = "Close (Esc)"; shut.append(svg(ICON.x)); shut.onclick = () => { close(); fab?.focus(); };
      const mono = el("button", "shut"); mono.type = "button"; mono.setAttribute("aria-label", "Monochrome theme"); mono.setAttribute("aria-pressed", String(monoOn()));
      mono.title = monoOn() ? "Monochrome on: back to the ERP's colours" : "Monochrome: the whole site in black and bone";
      mono.append(svg("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 3v18M12 8h4M12 12h5M12 16h4")); mono.onclick = () => { monoToggle(); draw(); };
      top.append(svg(ICON.search), input, el("kbd", null, "Esc"), mono, shut);
      const body = el("div", "scroll"), foot = el("div", "foot");
      foot.append(el("span", null, customers ? `${customers.length.toLocaleString("id-ID")} customers · ${ago(custAt)}` : "Customer list: open LDN → Pelanggan once"), el("span", null, invoices ? `Invoices ${MONTHS_ID[Number(invKey.split("-")[2]) - 1]} kept` : "Invoices: open Invoices once"));
      const was = document.activeElement, keep = was === document.body || !was || panel.contains(was); // focus was in the Dock: the new box takes it
      panel.replaceChildren(top, body, foot);
      drawBody();
      if (keep && bulk?.el?.contains(was) && was.isConnected) was.focus();
      else if (keep) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
    // a redraw (the radar's minute, an OLT list arriving) rebuilds the maps: each new one keeps the old one's zoom and
    // place, and a map open full screen stays open and takes the new data instead of closing under you
    let mapWas = null;
    function drawBody() {
      const body = panel?.querySelector(".scroll"); if (!body) return;
      const was = (mapWas = new Map([...document.querySelectorAll(".erp-dock .map[data-what]")].map((m) => [m.dataset.what, m])));
      const full = fullMap(); if (full) full.kept = false;
      queueMicrotask(() => { if (mapWas === was) mapWas = null; if (fullMap() && !fullMap().kept) dropFull(); });
      items = []; const parts = [];
      if (panel.classList.toggle("wide", view.mode === "bulk") !== panel.classList.contains("was-wide")) { panel.classList.toggle("was-wide"); place(); }
      if (view.mode === "bulk") { parts.push(bulkView()); body.replaceChildren(...parts); items = []; return bulkDraw(); }
      if (view.card) parts.push(cardView(view.card));
      else if (view.modem) { const w = el("div", "card"), back = el("button", "back", "← Back"); back.type = "button"; back.onclick = () => { view.modem = null; drawBody(); };
        w.append(back, modemBox(view.modem, null)); parts.push(w); }
      else if (view.mode === "radar") parts.push(...radarView());
      else if (view.mode === "signal") parts.push(...signalView());
      else if (view.mode === "pon") parts.push(...ponBoard());
      else if (view.mode === "health") parts.push(...healthView());
      else if (view.mode === "map") parts.push(...mapView());
      else if (view.mode === "incident") parts.push(incidentView(view.inc));
      else if (view.mode === "journal") parts.push(...journalView());
      else if (view.mode === "history") parts.push(...historyView());
      else if (!view.q.trim()) parts.push(...homeView());
      else parts.push(...resultsView(view.q));
      body.replaceChildren(...parts);
      items = [...body.querySelectorAll(".item, .tile")];
      items.forEach((x, i) => x.setAttribute("aria-selected", String(i === view.sel)));
    }
    function homeView() {
      const out = [...incidentRows()];
      if (customers) {
        const on = customers.filter((r) => r.online && !r.isolir).length, iso = customers.filter((r) => r.isolir).length;
        const e = el("div", "eyebrow"); e.append("Customers ", el("b", null, ago(custAt))); out.push(e);
        const s = el("div", "stats");
        for (const [cls, n, l] of [["", customers.length, "customers"], ["on", on, "online"], ["iso", iso, "isolir"]]) { const d = el("div", `stat ${cls} rise`); d.append(el("b", null, k(n)), el("span", null, l)); s.append(d); }
        out.push(s);
      }
      const e2 = el("div", "eyebrow"); e2.append("Go to"); out.push(e2);
      const g = el("div", "grid");
      SHORTCUTS.forEach(([label, path, icon], i) => { const t = el("button", "tile rise"); t.type = "button"; t.style.setProperty("--i", String(i)); t.append(svg(icon), label);
        t.onclick = path === "/customer-map" ? () => { view.mode = "map"; view.mapFull = true; view.card = null; drawBody(); } : () => go(path); g.append(t); }); // Map Terpadu: the Dock's own map
      out.push(g);
      const e4 = el("div", "eyebrow"); e4.append("Tools"); out.push(e4, radarItem(0), historyItem(1), journalItem(2), boardItem(3, "pon"), boardItem(4, "signal"), boardItem(5, "health"), spkToolItem(6, "bulk"), spkToolItem(7, "review")); // Bulk Lunas shows when searched (or a list is pasted)
      const recent = ls.get(RECENT, []).map((u) => customers?.find((r) => r.username === u)).filter(Boolean);
      if (recent.length) { const e3 = el("div", "eyebrow"); e3.append("Recent customers"); out.push(e3, ...recent.slice(0, 5).map(custItem)); }
      if (!customers) out.push(el("p", "note", "To look customers up here, open LDN Radius → Pelanggan once: its fast search keeps the list in this browser."));
      return out;
    }
    function resultsView(q) {
      const sn = snLike(q), out = [], cs = sn ? findCustomers(q).filter((r) => r._hay.includes(fold(q))) : findCustomers(q), ps = sn ? [] : findPages(q);
      if (cs.length) { const e = el("div", "eyebrow"); e.append("Customers"); out.push(e, ...cs.map(custItem)); }
      if (ps.length) { const e = el("div", "eyebrow"); e.append("Pages"); out.push(e, ...ps.map(pageItem)); }
      if (sn) {
        if (onts && acs) { const ms = findModems(q); if (ms.length) { const e = el("div", "eyebrow"); e.append("Modems"); out.unshift(e, ...ms.map(modemItem)); } }
        else { out.push(el("p", "note ld", "Looking modems up on the OLTs…")); Promise.all([ontIndex(), acsIndex()]).then(() => { if (view.q === q && !view.card) drawBody(); }); }
      }
      const tool = /^(bul|lun|bay|tan|pay|mas|mar)/.test(fold(q)), net = /^(rad|out|gan|mat|rou|off|jar|dow|put)/.test(fold(q));
      const sig = /^(sig|sin|red|rx|lem|wea|dbm|red)/.test(fold(q)), pn = /^(pon|odp|spl|olt|lin)/.test(fold(q)), hl = /^(dat|hea|sta|pol|wro|sal|kes)/.test(fold(q));
      const hs = /^(his|riw|sej|ula|rep|ser)/.test(fold(q)), sb = /^(spk|bul|akt|tar|tia|cek|wor|pla|buat)/.test(fold(q)), rq = /^(rev|app|set|que|ver|lap|qc|per)/.test(fold(q));
      if (sb || rq) { const e = el("div", "eyebrow"); e.append("SPK tools"); out.push(e); if (sb) out.push(spkToolItem(0, "bulk")); if (rq) out.push(spkToolItem(1, "review")); }
      if (tool || net || sig || pn || hl || hs) { const e = el("div", "eyebrow"); e.append("Tools"); out.push(e); if (net) out.push(radarItem(0)); if (net || hs) out.push(historyItem(0)); if (pn) out.push(boardItem(1, "pon")); if (sig) out.push(boardItem(2, "signal")); if (hl) out.push(boardItem(3, "health")); if (tool) out.push(toolItem(4)); }
      if (!cs.length && !ps.length && !tool && !net && !sig && !pn && !hl && !sb && !rq && !hs && !snLike(q)) out.push(el("p", "note", customers ? "Nothing matches all of those words." : "No customer list yet: open LDN Radius → Pelanggan once."));
      return out;
    }
    function cardView(r) {
      const wrap = el("div", "card");
      const back = el("button", "back", "← Back"); back.type = "button"; back.onclick = () => { view.card = null; drawBody(); panel.querySelector("input")?.focus(); };
      const who = el("div", "who rise"); const pill = el("span", "pill"); pill.append(el("span", `dot ${state(r)}`), r.isolir ? "Isolir" : stuckSince(r) ? `Unknown since ${hhmm(stuckSince(r))}` : r.online ? "Online" : "Offline");
      if (!r.isolir && stuckSince(r)) pill.title = `${r.router} stopped reporting sessions at ${hhmm(stuckSince(r))}, so whether this customer is online isn't known (the ERP still says ${r.online ? "online" : "offline"}).`;
      who.append(el("h3", null, r.nama || r.username), pill);
      const facts = el("dl", "facts rise"); facts.style.setProperty("--i", "1");
      const fact = (label, value, opts = {}) => { if (!value) return; const dd = el("dd", opts.mono ? "mono" : null, value);
        if (opts.copy) { const c = el("button", "copy", "Copy"); c.type = "button"; c.onclick = () => copy(String(value), c); dd.append(c); }
        if (opts.link) { const a = el("a", "copy", opts.link[0]); a.href = opts.link[1]; a.target = "_blank"; a.rel = "noreferrer"; dd.append(a); }
        facts.append(el("dt", null, label), dd); };
      fact("Username", r.username, { mono: true, copy: true });
      fact("Phone", r.phone, { mono: true, copy: true, link: wa(r.phone) ? ["WhatsApp", wa(r.phone)] : null });
      fact("Address", r.address); fact("Area", [r.desa, r.kecamatanErp].filter(Boolean).join(", "));
      fact("Plan", r.paket); fact("Router", r.router); fact("IP", r.ip, { mono: true, copy: true });
      fact("Active since", r.tglAktif && !isNaN(new Date(r.tglAktif)) ? new Date(r.tglAktif).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : r.tglAktif); fact("Expires", r.expirasi && !isNaN(new Date(r.expirasi)) ? new Date(r.expirasi).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : r.expirasi); fact("ONT", r.ontSerial, { mono: true, copy: true }); fact("Partner", r.mitra);
      const tech = techBox(r);
      const acts = el("div", "actions rise"); acts.style.setProperty("--i", "2");
      const act = (label, fn, primary) => { const b = el("button", `btn${primary ? " primary" : ""}`, label); b.type = "button"; b.onclick = fn; acts.append(b); };
      act("Open in LDN", () => openIn.ldn(r), true); act("Remote ↗", () => remoteGo(r)); act("Invoices", () => openIn.invoices(r)); act("Map Terpadu", () => openIn.map(r)); act("Master", () => openIn.master(r));
      const loc = where(r); if (loc) { const a = el("a", "btn", "Google Maps"); a.href = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`; a.target = "_blank"; a.rel = "noreferrer"; acts.append(a); }
      const bill = payBox(r); billDraw(bills.get(r.username));
      wrap.append(back, who, facts, tech, acts, forensicBox(r), bill, modemBox(`u:${r.username}`, r), nearView(r));
      return wrap;
    }
    function nearView(r) {
      const box = el("div", "near rise"); box.style.setProperty("--i", "3");
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "0"; e.append("Nearby");
      const seg = el("div", "seg"); for (const m of [100, 300, 1000]) { const b = el("button", null, m < 1000 ? `${m} m` : "1 km"); b.type = "button"; b.setAttribute("aria-pressed", String(view.radius === m)); b.onclick = () => { view.radius = m; view.zoom = 0; drawBody(); }; seg.append(b); }
      head.append(e, seg); box.append(head);
      const n = nearby(r, view.radius);
      if (!n) { box.append(el("p", "note", customers && !("lat" in r) ? "Locations arrive with the next refresh of the customer list (LDN → Pelanggan → Update)." : "This customer has no location saved.")); return box; }
      const map = el("div", "map"); map.setAttribute("role", "group"); map.setAttribute("aria-label", `Map of ${n.list.length} customers within ${view.radius} metres`);
      const pon = el("div", "ponbox");
      box.append(map, cartoKeyRow(() => drawBody()), pon);
      const rows = [];
      for (const [i, x] of n.list.slice(0, 8).entries()) { const it = custItem(x.r, i); it.querySelector(".r").textContent = `${Math.round(x.d)} m`;
        it.addEventListener("mouseenter", () => map.hl?.(i, true)); it.addEventListener("mouseleave", () => map.hl?.(i, false)); rows.push(it); box.append(it); }
      setTimeout(() => { tileMap(map, r, n, view.radius, rows); ponLine(pon, r, map); }, 0); // once the card is on the page (a frame may not come while the tab is hidden)
      if (n.list.length > 8) box.append(el("p", "note", `and ${n.list.length - 8} more within ${view.radius < 1000 ? `${view.radius} m` : "1 km"}`));
      return box;
    }
    // A tile map drawn without a map library: a dark street map (OpenStreetMap's own tiles, darkened here; no key) where the status colours
    // stand out, or the satellite view Peta Terpadu uses (Google hybrid) for finding the house. This customer in the
    // middle, rings at half and full radius, every neighbour a dot; a dot and its row in the list light up together,
    // a dot opens that customer, and customers on the same PON port are outlined.
    const BASEMAP = "erpDock.basemap", CARTO_KEY = "erpDock.cartoKey", CARTO_OFF = "erpDock.cartoOff"; // your own CARTO key, kept only in this browser (the script is public)
    const TILES = {
      dark: { url: (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, max: 19, attr: "© OpenStreetMap" }, // CARTO now wants a key
      sat: { url: (x, y, z) => `https://mt${(x + y) % 4}.google.com/vt/lyrs=y&hl=id&x=${x}&y=${y}&z=${z}`, max: 20, attr: "Google" },
    };
    function tileSource() {
      const kind = ls.get(BASEMAP, "dark") === "sat" ? "sat" : "dark", key = ls.get(CARTO_KEY, ""), carto = kind === "dark" && !!key && !ls.get(CARTO_OFF, false); // the key stays when you switch to OSM
      const T = carto ? { url: (x, y, z) => `https://basemaps.cartocdn.com/rastertiles/dark_all/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`, max: 20, attr: "© OpenStreetMap © CARTO" } : TILES[kind];
      return { kind, carto, T };
    }
    // the same map for a group of customers (a PON port, a router's offline customers): fitted to where they are,
    // isolir red, offline white, online green; a dot shows the name and opens the customer
    function areaMap(pts, label, about = {}) {
      const key = about.what || label, old = mapWas?.get(key);
      if (old?.classList.contains("full")) { // open full screen: it stays, with the new data; this spot is where it goes back to
        const spot = el("span"); old.fullHome = spot; old.kept = true; old.setAttribute("aria-label", label);
        old.redraw = () => drawAreaMap(old, pts, about); old.redraw(); spot.redraw = () => old.redraw(); return spot;
      }
      const box = el("div", "map"); box.setAttribute("role", "group"); box.setAttribute("aria-label", label); box.dataset.what = key;
      if (old) { box.zoom = old.zoom; box.ctr = old.ctr; }
      box.redraw = () => drawAreaMap(box, pts, about); setTimeout(box.redraw, 0); return box;
    }
    function drawAreaMap(box, pts, about = {}) {
      const w = box.clientWidth, h = box.clientHeight; if (!w || !pts.length) return;
      const { kind, carto, T } = tileSource(), q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))];
      // with customers in trouble the map frames them (the rest still show where they fall), so they can be named
      const rp = box.replayT || 0, offT = rp ? offAt(rp) : null;
      const kinds = pts.map((z0) => { let on = z0.on ?? !!z0.c.online;
        if (offT) { const u = lower(z0.c.username); if (drops?.u[u] || drops?.off[u]) on = !offT.has(u); }
        const k = !on && offT && !z0.c.isolir && (z0.on ?? !!z0.c.online) ? "off" : health(z0.c, on); // online now, down then: no OLT reason for back then
        return mark({ ...z0, k }, rp); }), focus = kinds.filter((z0) => RANK[z0.k] > 1), fit = focus.length ? focus : kinds;
      const la = fit.map((z) => z.p.lat).sort((a, b) => a - b), lo = fit.map((z) => z.p.lng).sort((a, b) => a - b), cut = fit.length > 20 ? 0.02 : 0;
      const b = { s: q(la, cut), n: q(la, 1 - cut), w: q(lo, cut), e: q(lo, 1 - cut) }, mid = { lat: (b.s + b.n) / 2, lng: (b.w + b.e) / 2 };
      const proj = (p, z) => { const size = 256 * 2 ** z, sin = Math.sin(p.lat * Math.PI / 180); return [((p.lng + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size]; };
      let z = Math.min(T.max, 17); while (z > 8) { const [x0, y0] = proj({ lat: b.n, lng: b.w }, z), [x1, y1] = proj({ lat: b.s, lng: b.e }, z); if (x1 - x0 <= w - 96 && y1 - y0 <= h - 150) break; z--; } // clear of the strip and the legend
      z = Math.max(8, Math.min(T.max, z + (box.zoom || 0)));
      const size = 256 * 2 ** z, [cx, cy] = box.ctr ? [box.ctr[0] * size, box.ctr[1] * size] : proj(mid, z), left = cx - w / 2, top = cy - h / 2 - (box.ctr ? 0 : 6), tiles = el("div", "tiles");
      box.geo = { size, cx, cy, left, top }; panMap(box);
      for (let tx = Math.floor((left - 256) / 256); tx * 256 < left + w + 256; tx++) for (let ty = Math.floor((top - 256) / 256); ty * 256 < top + h + 256; ty++) {
        const img = el("img"); img.src = T.url(tx, ty, z); img.alt = ""; img.draggable = false; img.style.left = `${tx * 256 - left}px`; img.style.top = `${ty * 256 - top}px`; tiles.append(img); }
      const tip = el("span", "tip"); tip.hidden = true;
      waitForBrief(box);
      // only dots within the view and its tile margin are made; past 1500 of them, the online ones are painted on one
      // canvas (no name on hover) and only the others are buttons, so the whole network stays quick to draw and drag
      const M = 260, near = [...kinds].sort((a, c) => RANK[a.k] - RANK[c.k]).map((z0) => [z0, proj(z0.p, z)])
        .filter(([, [px, py]]) => px - left > -M && py - top > -M && px - left < w + M && py - top < h + M);
      const many = near.length > 1500;
      let paint = null;
      if (many) { const dpr = devicePixelRatio || 1; paint = el("canvas", "bgdots"); paint.width = (w + 2 * M) * dpr; paint.height = (h + 2 * M) * dpr;
        Object.assign(paint.style, { left: `${-M}px`, top: `${-M}px`, width: `${w + 2 * M}px`, height: `${h + 2 * M}px` });
        const g = paint.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = "#55bc82"; g.strokeStyle = "rgba(7,9,11,.85)"; g.lineWidth = 1;
        for (const [z0, [px, py]] of near) if (z0.k === "on") { g.beginPath(); g.arc(px - left + M, py - top + M, 3, 0, 7); g.fill(); g.stroke(); } }
      const dots = near.filter(([z0]) => !(many && z0.k === "on")).map(([z0, [px, py]]) => { // problems drawn last, on top
        const d = el("button", `mdot ${z0.k}${z0.u ? " unst" : ""}${z0.t && Date.now() - z0.t < FRESH ? " fresh" : ""}`); d.type = "button"; d.tabIndex = -1; d.style.left = `${px - left}px`; d.style.top = `${py - top}px`;
        const name = `${z0.c.nama || z0.c.username} · ${KIND[z0.k][0].toLowerCase()}${z0.t ? ` ${lama(Date.now() - z0.t)}` : ""}${z0.u ? " · tidak stabil" : ""}`; d.setAttribute("aria-label", name);
        d.onmouseenter = () => { tip.textContent = name; tip.style.left = d.style.left; tip.style.top = d.style.top; tip.classList.toggle("low", py - top < 34); tip.hidden = false; d.classList.add("hl"); };
        d.onmouseleave = () => { tip.hidden = true; d.classList.remove("hl"); };
        d.onclick = () => { view.card = z0.c; view.sel = 0; remember(z0.c); draw(); }; return d; });
      const zoom = el("div", "zoom"), full = box.classList.contains("full"), fs = el("button", null, full ? "⤡" : "⤢"); fs.type = "button"; fs.title = full ? "Back (F or Esc)" : "Full screen (F)"; fs.onclick = () => toggleFull(box); zoom.append(fs);
      for (const [t, dz, label] of [["+", 1, "Zoom in"], ["−", -1, "Zoom out"]]) { const bt = el("button", null, t); bt.type = "button"; bt.setAttribute("aria-label", label);
        bt.disabled = (dz > 0 && z >= T.max) || (dz < 0 && z <= 8); bt.onclick = () => { box.zoom = (box.zoom || 0) + dz; box.redraw(); }; zoom.append(bt); }
      zoom.append(recentre(box), rxButton(box), baseButton(box, kind), shareButton(box));
      box.classList.toggle("sat", kind === "sat"); box.classList.toggle("carto", carto);
      const mpp = 156543.03392 * Math.cos(mid.lat * Math.PI / 180) / 2 ** z;
      const bar = replayBar(box);
      const scene = briefScene({ pts: kinds, at: (p) => { const [x, y] = proj(p, z); return [x - left, y - top]; }, mpp, w, h, about: { ...about, replay: rp, bar: !!bar } });
      box.scene = scene;
      const tags = rxTags(near.map(([z0, [px, py]]) => [z0.c, px - left, py - top]), new Set(scene.labels.map((l) => l.c)));
      mapLayers(box, [tiles, ...briefUnder(scene), ...(paint ? [paint] : []), ...dots, ...tags, ...briefOver(scene), tip, zoom, el("span", "attr", T.attr)]);
      if (bar) box.querySelector(".brief").append(bar);
      swapTiles(box, tiles, { z, kind: carto ? "carto" : kind, left, top, id: `area:${box.dataset.what}` });
    }
    function tileMap(box, r, n, radius, rows) {
      const w = box.clientWidth, h = box.clientHeight; if (!w) return;
      if (view.zoomFor !== r.username) { view.zoom = 0; view.zoomFor = r.username; }
      const mpp0 = 156543.03392 * Math.cos(n.c.lat * Math.PI / 180); // metres per pixel at zoom 0
      const { kind, carto, T } = tileSource();
      const z = Math.max(12, Math.min(T.max, Math.floor(Math.log2((mpp0 * Math.min(w, h - 120) * 0.6) / radius)) + (view.zoom || 0)));
      const size = 256 * 2 ** z, world = (p) => { const sin = Math.sin(p.lat * Math.PI / 180); return [((p.lng + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size]; };
      if (box.ctrFor !== r.username) { box.ctr = null; box.ctrFor = r.username; }
      const [cx, cy] = box.ctr ? [box.ctr[0] * size, box.ctr[1] * size] : world(n.c), left = cx - w / 2, top = cy - h / 2, mpp = mpp0 / 2 ** z;
      box.geo = { size, cx, cy, left, top }; panMap(box);
      const [mx, my] = world(n.c), hx = mx - left, hy = my - top; // this customer, wherever the map has been dragged
      const tiles = el("div", "tiles");
      for (let tx = Math.floor((left - 256) / 256); tx * 256 < left + w + 256; tx++) for (let ty = Math.floor((top - 256) / 256); ty * 256 < top + h + 256; ty++) {
        const img = el("img"); img.src = T.url(tx, ty, z); img.alt = ""; img.draggable = false; img.style.left = `${tx * 256 - left}px`; img.style.top = `${ty * 256 - top}px`; tiles.append(img); }
      const ring = (f, cls) => { const d = el("span", `ring ${cls}`), R = (radius * f) / mpp; d.style.cssText = `width:${2 * R}px;height:${2 * R}px;left:${hx - R}px;top:${hy - R}px`; return d; };
      const tip = el("span", "tip"); tip.hidden = true;
      waitForBrief(box);
      n.list.forEach((x) => { x.k = health(x.r); x.t = DOWN.has(x.k) ? downAt(x.r) : 0; x.u = (x.k === "on" || x.k === "weak") && unstable(x.r); });
      const dots = n.list.map((x, i) => {
        const [px, py] = world(x.p), b = el("button", `mdot ${x.k}${x.u ? " unst" : ""}${x.t && Date.now() - x.t < FRESH ? " fresh" : ""}`); b.type = "button"; b.tabIndex = -1; b.style.zIndex = RANK[x.k] > 1 ? "1" : "";
        b.style.left = `${px - left}px`; b.style.top = `${py - top}px`; b.style.setProperty("--d", `${Math.round(Math.min(1, x.d / radius) * 350)}ms`);
        b.setAttribute("aria-label", `${x.r.nama || x.r.username}, ${KIND[x.k][0].toLowerCase()}, ${Math.round(x.d)} m`);
        b.onmouseenter = () => hl(i, true); b.onmouseleave = () => hl(i, false);
        b.onclick = () => { view.card = x.r; view.sel = 0; remember(x.r); draw(); };
        return b;
      });
      function hl(i, on) {
        const d = dots[i], x = n.list[i]; if (!d) return;
        d.classList.toggle("hl", on); rows[i]?.setAttribute("aria-selected", String(on));
        tip.hidden = !on; if (on) { tip.textContent = `${x.r.nama || x.r.username} · ${Math.round(x.d)} m`; tip.style.left = d.style.left; tip.style.top = d.style.top; tip.classList.toggle("low", parseFloat(d.style.top) < 34); }
      }
      box.hl = hl;
      box.redraw = () => tileMap(box, r, n, radius, rows); // after going full screen and back
      box.pon = (set) => { box.ponSet = set; dots.forEach((d, i) => d.classList.toggle("pon", set.has(n.list[i].r.username))); };
      if (box.ponSet) box.pon(box.ponSet);
      const me = el("span", "mdot me"); me.style.left = `${hx}px`; me.style.top = `${hy}px`;
      const zoom = el("div", "zoom");
      const full = box.classList.contains("full"), fs = el("button", null, full ? "⤡" : "⤢"); fs.type = "button"; fs.title = full ? "Back (F or Esc)" : "Full screen (F)";
      fs.setAttribute("aria-label", full ? "Leave full screen" : "Full screen"); fs.onclick = () => toggleFull(box); zoom.append(fs);
      for (const [t, dz, label] of [["+", 1, "Zoom in"], ["−", -1, "Zoom out"]]) { const b = el("button", null, t); b.type = "button"; b.setAttribute("aria-label", label);
        b.disabled = (dz > 0 && z >= T.max) || (dz < 0 && z <= 12); b.onclick = () => { view.zoom = (view.zoom || 0) + dz; tileMap(box, r, n, radius, rows); }; zoom.append(b); }
      zoom.append(recentre(box), rxButton(box), baseButton(box, kind), shareButton(box));
      box.classList.toggle("sat", kind === "sat"); box.classList.toggle("carto", !!carto);
      const at = (p) => { const [x, y] = world(p); return [x - left, y - top]; };
      const scene = briefScene({ pts: [{ c: r, p: n.c, k: health(r), me: true }, ...n.list.map((x) => ({ c: x.r, p: x.p, k: x.k, t: x.t, u: x.u }))], at, mpp, w, h,
        rings: [[hx, hy, radius / 2 / mpp, `${radius / 2} m`], [hx, hy, radius / mpp, radius < 1000 ? `${radius} m` : "1 km"]],
        me: [hx, hy, r.nama || r.username], about: { what: `Radius ${radius < 1000 ? `${radius} m` : "1 km"} dari ${r.nama || r.username}`, near: r } });
      box.scene = scene;
      const tags = rxTags(n.list.map((x) => { const [px, py] = world(x.p); return [x.r, px - left, py - top]; }), new Set(scene.labels.map((l) => l.c)));
      mapLayers(box, [tiles, ring(0.5, "half"), ring(1, ""), ...briefUnder(scene), ...dots, ...tags, me, ...briefOver(scene), tip, zoom, el("span", "attr", T.attr)]);
      swapTiles(box, tiles, { z, kind: carto ? "carto" : kind, left, top, id: `near:${r.username}` });
    }
    // Drag a map to pan it: the picture follows the pointer, and every ~100 px (and on release) the tiles are drawn
    // again around the new centre, kept as a share of the world so zooming keeps the place. A press that moves less
    // than 4 px is still a click (a dot opens its customer). ◎ goes back to the start.
    // What moves with the map goes in one layer (.pan) and a drag moves only that layer, on the graphics card: moving the
    // ~900 dots and labels one by one cost ~23 ms a step on a big router. The strip, legend and buttons stay put.
    const MAP_FIXED = ".zoom, .seg, .attr, .tip, .brief, .foot, .sharesheet";
    function mapLayers(box, items) {
      const pan = el("div", "pan"), fixed = [];
      for (const c of items) if (c.matches(MAP_FIXED)) fixed.push(c); else pan.append(c);
      box.replaceChildren(pan, ...fixed);
    }
    function panMap(box) {
      if (box.panReady) return; box.panReady = true;
      let start = null, moved = false;
      const shift = (dx, dy) => { const p = box.querySelector(":scope > .pan"); if (p) p.style.transform = dx || dy ? `translate3d(${dx}px, ${dy}px, 0)` : ""; };
      const commit = (dx, dy) => { const g = box.geo; if (!g) return; box.ctr = [(g.cx - dx) / g.size, (g.cy - dy) / g.size]; box.redraw?.(); };
      box.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".zoom, .seg, .replay, .sharesheet")) return; // the slider and the share sheet aren't the map
        start = { x: e.clientX, y: e.clientY }; moved = false;
      });
      box.addEventListener("pointermove", (e) => {
        if (!start) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        if (!moved) { moved = true; box.classList.add("panning"); try { box.setPointerCapture(e.pointerId); } catch {} }
        if (Math.abs(dx) > 240 || Math.abs(dy) > 240) { commit(dx, dy); start = { x: e.clientX, y: e.clientY }; return; } // past the tile margin: fresh tiles around the new centre
        shift(dx, dy);
      });
      const end = (e) => {
        if (!start) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null; box.classList.remove("panning");
        if (!moved) return;
        box.addEventListener("click", (c) => { c.stopPropagation(); c.preventDefault(); }, { capture: true, once: true }); // the drag isn't a click on a dot
        commit(dx, dy);
      };
      box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
      // a click on the map itself (not a dot, a button or a drag) copies that spot's Google Maps link, for a technician
      box.addEventListener("click", (e) => {
        const g = box.geo; if (e.defaultPrevented || !(e.target === box || e.target.matches(".pan, .tiles")) || !g || g.left == null) return;
        const r = box.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, x = g.left + px, y = g.top + py;
        const lng = (x / g.size) * 360 - 180, lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / g.size))) * 180) / Math.PI, url = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
        box.querySelector(".mpin")?.remove();
        const pin = el("span", "mpin", "Lokasi disalin"); pin.style.left = `${px}px`; pin.style.top = `${py}px`; box.append(pin);
        navigator.clipboard?.writeText(url).catch(() => { pin.textContent = url; });
        setTimeout(() => pin.remove(), 1800);
      });
      // Ctrl + wheel zooms (instead of the whole page), one level per notch, keeping the place under the pointer still
      let acc = 0, last = 0;
      box.addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault(); acc += e.deltaY;
        if (Math.abs(acc) < 40 || Date.now() - last < 180) return; // a touchpad sends many small steps
        const dz = acc < 0 ? 1 : -1; acc = 0; last = Date.now();
        const btn = box.querySelector(`.zoom button[aria-label="${dz > 0 ? "Zoom in" : "Zoom out"}"]`), g = box.geo;
        if (!btn || btn.disabled) return;
        if (g) { const r = box.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, ns = g.size * 2 ** dz;
          box.ctr = [(g.cx + dx) / g.size - dx / ns, (g.cy + dy) / g.size - dy / ns]; }
        btn.click();
      }, { passive: false });
    }
