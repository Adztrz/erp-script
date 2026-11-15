    // ---- Weak signal and the PON board: from the OLTs' cached ONT lists (the modem search's index) ----
    // Signal classes are the ERP's own (ONT management): good from −26 dBm, warning to −28, critical below.
    // Readings come from each OLT's last poll, so every row says how old its reading is.
    const ponKey = (o) => `${o.pid}|${o.pon}`;
    const usable = (o) => o.st === "online" && o.rx != null && o.rx < 0 && o.rx > -40; // 0 and −40 are OLTs saying "no reading"
    const sigLevel = (rx) => (rx < -28 ? "crit" : rx < -26 ? "warn" : "good");
    const old = (o) => !o.seen || Date.now() - new Date(o.seen) > 24 * 3600000;
    function ponGroups() {
      if (onts.groups?.at === onts.at) return onts.groups.list;
      const by = new Map();
      for (const o of onts.rows) { const k = ponKey(o); let g = by.get(k); if (!g) by.set(k, (g = { key: k, olt: o.olt, pon: o.pon, pid: o.pid, all: [], off: 0, crit: 0, warn: 0 })); g.all.push(o);
        const t = o.seen ? new Date(o.seen).getTime() : 0; if (t > (g.fresh || 0)) g.fresh = t;
        if (o.st !== "online") g.off++; else if (usable(o)) { const l = sigLevel(o.rx); if (l === "crit") g.crit++; else if (l === "warn") g.warn++; } }
      const list = [...by.values()]; onts.groups = { at: onts.at, list }; return list;
    }
    function boardHead(title, out) {
      const head = el("div", "rhead"), e = el("div", "eyebrow"); e.style.margin = "10px 6px 6px"; e.append(title);
      const tools = el("div", "tools"), again = el("button", "btn", ontsLoading ? "Reading…" : "Read the OLTs again"); again.type = "button"; again.disabled = !!ontsLoading;
      again.onclick = () => { refreshOnts().then(() => drawBody()).catch(() => drawBody()); drawBody(); };
      tools.append(onts ? `OLT lists ${when(onts.at)}` : "", again); head.append(e, tools); out.push(head);
      const back = el("button", "back", "← Back"); back.type = "button"; back.style.marginLeft = "6px";
      back.onclick = () => { if (view.pon) { view.pon = null; if (view.from) { view.mode = view.from; view.from = null; } } else view.mode = null; drawBody(); };
      out.push(back);
    }
    const needOnts = (out) => { if (onts) return true; out.push(el("p", "note ld", "Reading the OLTs' ONT lists… (about 6 seconds the first time)")); ontIndex().then(() => drawBody()).catch((e) => { out.length = 0; }); return false; };
    function ontItem(o, i, right) {
      const c = customerOf(o.sn, o, null), b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(Math.min(i, 14)));
      const lv = o.st !== "online" ? "off" : usable(o) ? { crit: "bad", warn: "drop", good: "on" }[sigLevel(o.rx)] : "";
      b.append(el("span", `dot ${lv}`), el("span", "t", c?.nama || o.name || o.raw), el("span", "r", right ?? (usable(o) ? dbm(o.rx) : o.st)),
        el("span", "s", [`${o.olt} · ${o.pon}:${o.id}`, c?.desa, c?.username || "no customer linked", o.st !== "online" ? o.st : old(o) ? `old reading (${when(o.seen)})` : when(o.seen)].filter(Boolean).join(" · ")));
      b.onclick = () => { if (c) { view.card = c; remember(c); } else view.modem = o.sn; view.sel = 0; draw(); };
      return b;
    }
    function ponItem(g, i, kind) {
      const b = el("button", "item desa rise"); b.type = "button"; b.style.setProperty("--i", String(Math.min(i, 14)));
      const n = g.all.length, v = kind === "weak" ? g.crit : g.off, m = el("span", "meter"), fill = el("i"); fill.style.width = `${Math.round((v / n) * 100)}%`; m.append(fill);
      b.append(el("span", "t", `${g.olt} · ${g.pon}`), m, el("span", "r", kind === "weak" ? `${g.crit} critical · ${g.warn} warn` : `${g.off} / ${n} offline`),
        el("span", "s", g.fresh ? `newest reading on this port ${when(g.fresh)}` : "no reading time"));
      b.onclick = () => { view.from = view.mode; view.mode = "pon"; view.pon = g.key; drawBody(); };
      return b;
    }
    function signalView() {
      const out = []; boardHead("Weak signal", out); if (!needOnts(out)) return out;
      const lvl = view.sigLevel || "crit", seg = el("div", "seg"); seg.style.margin = "4px 6px";
      for (const [k, l] of [["crit", "Critical (below −28)"], ["warn", "Weak (below −26)"]]) { const b = el("button", null, l); b.type = "button"; b.setAttribute("aria-pressed", String(lvl === k)); b.onclick = () => { view.sigLevel = k; drawBody(); }; seg.append(b); }
      out.push(seg);
      const read = onts.rows.filter(usable), weak = read.filter((o) => (lvl === "crit" ? o.rx < -28 : o.rx < -26)).sort((a, b) => a.rx - b.rx);
      const crit = read.filter((o) => o.rx < -28).length, warn = read.filter((o) => o.rx < -26 && o.rx >= -28).length;
      out.push(el("p", "note", `${crit} critical and ${warn} warning of ${read.length.toLocaleString("id-ID")} online modems with a reading. Several weak on one PON port usually means a dirty connector or a bad splitter on that line.`));
      // clusters: PON ports with several weak modems
      const by = new Map(); for (const o of weak) { const k = ponKey(o); by.set(k, [...(by.get(k) || []), o]); }
      const groups = ponGroups(), clusters = [...by].filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
      if (clusters.length) { const e = el("div", "eyebrow"); e.append("PON ports with several weak"); out.push(e);
        clusters.forEach(([k, l], i) => { const g = groups.find((x) => x.key === k), b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
          const avg = l.reduce((a, o) => a + o.rx, 0) / l.length;
          b.append(el("span", `dot ${lvl === "crit" ? "bad" : "drop"}`), el("span", "t", `${g?.olt || l[0].olt} · ${l[0].pon}`), el("span", "r", `${l.length} of ${g?.all.length ?? "?"}`), el("span", "s", `worst ${dbm(l[0].rx)} · average ${dbm(avg)}`));
          b.onclick = () => { view.from = "signal"; view.mode = "pon"; view.pon = k; drawBody(); }; out.push(b); }); }
      const e2 = el("div", "eyebrow"); e2.append(`Weakest`, el("b", null, `${weak.length}`)); out.push(e2);
      weak.slice(0, 60).forEach((o, i) => out.push(ontItem(o, i)));
      if (weak.length > 60) out.push(el("p", "note", `and ${weak.length - 60} more`));
      return out;
    }
    function ponBoard() {
      if (view.pon) return ponDetail(view.pon);
      const out = []; boardHead("PON board", out); if (!needOnts(out)) return out;
      const sort = view.ponSort || "off", seg = el("div", "seg"); seg.style.margin = "4px 6px";
      for (const [k, l] of [["off", "Most offline"], ["weak", "Most weak signal"]]) { const b = el("button", null, l); b.type = "button"; b.setAttribute("aria-pressed", String(sort === k)); b.onclick = () => { view.ponSort = k; drawBody(); }; seg.append(b); }
      out.push(seg);
      // 0/0/0 is how some OLTs list modems without a real port (unregistered or removed): not a line, so not ranked
      const all = ponGroups(), noPort = all.filter((g) => /^(0\/)*0$/.test(g.pon)).reduce((a, g) => a + g.all.length, 0);
      const groups = all.filter((g) => g.all.length >= 3 && !/^(0\/)*0$/.test(g.pon)), isBad = (g) => g.off >= 3 && g.off / g.all.length >= 0.25, bad = groups.filter(isBad);
      out.push(el("p", "note", `${groups.length} PON ports on ${new Set(groups.map((g) => g.pid)).size} OLTs; ${bad.length} with a quarter or more offline (3 at least).${noPort ? ` ${noPort} modems listed without a port (0/0/0) aren't ranked.` : ""} Offline counts are from each OLT's last poll: check the reading age.`));
      const list = [...groups].sort(sort === "weak" ? (a, b) => b.crit - a.crit || b.warn - a.warn : (a, b) => isBad(b) - isBad(a) || b.off - a.off || b.off / b.all.length - a.off / a.all.length);
      list.slice(0, 80).forEach((g, i) => out.push(ponItem(g, i, sort)));
      return out;
    }
    function ponDetail(key) {
      const out = []; boardHead("PON port", out); if (!needOnts(out)) return out;
      const g = ponGroups().find((x) => x.key === key); if (!g) { out.push(el("p", "note", "This port isn't in the OLT lists any more.")); return out; }
      const wrap = el("div", "card"), who = el("div", "who"); who.append(el("h3", null, `${g.olt} · PON ${g.pon}`)); wrap.append(who);
      const stats = el("div", "stats"); stats.style.cssText = "margin-top:12px;padding:0";
      for (const [v, l, c] of [[g.all.length, "modems", ""], [g.off, "offline", g.off ? "off" : ""], [g.crit, "critical signal", g.crit ? "bad" : ""]]) { const d = el("div", `stat ${c}`); d.append(el("b", null, String(v)), el("span", null, l)); stats.append(d); }
      wrap.append(stats);
      const share = g.off / g.all.length;
      wrap.append(el("p", `note ${g.off >= 3 && share >= 0.25 ? "late" : g.crit >= 3 ? "warn" : "good"}`, g.off >= 3 && share >= 0.25 ? `${g.off} of ${g.all.length} down together: most likely the line (PON, splitter or ODP).`
        : g.crit >= 3 ? `${g.crit} modems with critical signal on this port: check the connectors and splitter on this line.` : "This port looks normal."));
      // where they are
      const pts = g.all.map((o) => { const c = customerOf(o.sn, o, null); return c && where(c) ? { c, p: where(c), on: o.st === "online" } : null; }).filter(Boolean);
      if (pts.length) { wrap.append(areaMap(pts, `Map of ${pts.length} customers on this port`, { what: `${g.olt} · PON ${g.pon}` }));
        wrap.append(el("p", "note", `On the map: ${pts.length} of ${g.all.length} modems, the ones linked to a customer with a saved location. The rest have no customer match or no location.`)); }
      else wrap.append(el("p", "note", `None of the ${g.all.length} modems on this port is linked to a customer with a saved location, so there's nothing to map.`));
      out.push(wrap);
      if (g.off) out.push(reportBox({ title: `${g.olt} · PON ${g.pon}`, down: g.off, total: g.all.length, age: g.fresh ? `OLT ${lalu(g.fresh)}` : "",
        custs: g.all.filter((o) => o.st !== "online").map((o) => customerOf(o.sn, o, null)).filter(Boolean) }));
      const order = [...g.all].sort((a, b) => (a.st === "online") - (b.st === "online") || (usable(a) ? a.rx : 0) - (usable(b) ? b.rx : 0));
      const e = el("div", "eyebrow"); e.append("Modems, offline and weakest first"); out.push(e);
      order.forEach((o, i) => out.push(ontItem(o, i)));
      return out;
    }
