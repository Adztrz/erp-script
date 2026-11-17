    // ---- Outage history: where and when the outages keep happening ----
    // From the incidents this browser recorded (kept 90 days): router incidents that started within 15 minutes of each
    // other are one event, placed with the network map at its top (the highest router in it, or the router above two or
    // more of its branches); without a map each router counts on its own. Per place: how many, how long, the time of
    // day, and whether they were real drops or the router only going quiet (no data). PON ports have their own list.
    const HIST_GAP = 15 * 60000;
    function histEvents(list, since) {
      const topo = topology(), map = topo.names.size > 0;
      const nodeOf = (name) => { if (!map) return null; const at = topoState(topo, [{ name, open: 0, usual: 0 }]); return [...at.keys()][0] || null; };
      const routers = list.filter((i) => i.kind === "router" && (i.end || Date.now()) > since).sort((a, b) => a.start - b.start), events = [];
      for (const inc of routers) {
        const name = inc.title.replace(/^Router /, ""), e = events.find((x) => inc.start - x.start <= HIST_GAP && !x.incs.some((y) => y.key === inc.key));
        const row = { inc, name, node: nodeOf(name) };
        if (e) { e.incs.push(inc); e.rows.push(row); } else events.push({ start: inc.start, incs: [inc], rows: [row] });
      }
      for (const e of events) {
        e.end = Math.max(...e.incs.map((i) => i.end || Date.now())); e.open = e.incs.some((i) => i.state === "open");
        e.level = e.incs.some((i) => i.level === "down" || /down/.test(i.log?.map((l) => l[1]).join(" ") || "")) ? "down" : e.incs.every((i) => i.level === "nofeed") ? "nofeed" : "drop";
        e.lost = e.incs.reduce((n, i) => n + (i.peak || 0) * ((i.end || Date.now()) - i.start) / 3600000, 0); // session-hours
        // where it starts: the routers in it with no ancestor in it; two or more under one parent name the parent
        const nodes = new Set(e.rows.map((r) => r.node).filter(Boolean)), anc = (k, seen = new Set()) => (topo.up.get(k) || []).flatMap((p) => (seen.has(p) ? [] : (seen.add(p), [p, ...anc(p, seen)])));
        let tops = [...nodes].filter((k) => !anc(k).some((a) => nodes.has(a)));
        const parents = [...new Set(tops.flatMap((k) => topo.up.get(k) || []))].filter((p) => tops.filter((k) => (topo.up.get(k) || []).includes(p)).length >= 2);
        if (parents.length === 1 && tops.length >= 2) tops = [parents[0]];
        e.where = tops.length ? tops.map((k) => topoName(topo, k)) : [...new Set(e.rows.filter((r) => !r.node).map((r) => r.name))];
        e.where.push(...e.rows.filter((r) => !r.node && tops.length).map((r) => r.name).filter((n) => !e.where.includes(n)));
        e.behind = e.rows.length - 1;
      }
      return { events: events.filter((e) => e.end > since), map };
    }
    function historyView() {
      const out = [], head = el("div", "rhead"), eb = el("div", "eyebrow"); eb.style.margin = "10px 6px 6px"; eb.append("Outage history");
      const days = view.histDays || 30, seg = el("div", "tools");
      for (const d of [7, 30, 90]) { const b = el("button", `btn${d === days ? " primary" : ""}`, `${d} days`); b.type = "button"; b.onclick = () => { view.histDays = d; drawBody(); }; seg.append(b); }
      head.append(eb, seg); out.push(head);
      if (!incidents) { out.push(el("p", "note ld", "Reading the incident log…")); incList().then(() => view.mode === "history" && drawBody()); return out; }
      const since = Date.now() - days * 86400000, { events, map } = histEvents(incidents, since);
      const first = Math.min(...incidents.map((i) => i.start)), kept = Number.isFinite(first) ? Math.round((Date.now() - first) / 86400000) : 0;
      if (kept < days) out.push(el("p", "note", `This browser has ${kept ? `${kept} day${kept === 1 ? "" : "s"}` : "no days"} of incidents so far (the log keeps 90 days from Dock 3.6 on, 7 before). It fills in while an ERP tab is open.`));
      if (!map) out.push(el("p", "note warn", "No network map yet (Outage radar → Add topology): each router counts on its own instead of outages being traced to where they start."));
      if (!events.length) { out.push(el("div", "rok", `No router outages recorded in the last ${days} days.`)); }
      else {
        const hrs = events.reduce((n, e) => n + (e.end - e.start), 0) / 3600000, real = events.filter((e) => e.level !== "nofeed");
        const stats = el("div", "stats rise"), stat = (v, l) => { const d = el("div", "stat"); d.append(el("b", null, String(v)), el("span", null, l)); stats.append(d); };
        stat(real.length, "outages"); stat(events.length - real.length, "data stops"); stat(`${Math.round(hrs)} h`, "in total"); out.push(stats);
        // per place
        const by = new Map();
        for (const e of events) for (const w of e.where.slice(0, 1)) { const p = by.get(w) || { w, n: 0, nofeed: 0, ms: 0, long: 0, last: 0, lost: 0, behind: 0 };
          p.n++; if (e.level === "nofeed") p.nofeed++; p.ms += e.end - e.start; p.long = Math.max(p.long, e.end - e.start); p.last = Math.max(p.last, e.start); p.lost += e.lost; p.behind += e.behind; by.set(w, p); }
        const e1 = el("div", "eyebrow"); e1.append(map ? "Where they start" : "By router"); out.push(e1);
        [...by.values()].sort((a, b) => b.n - a.n || b.ms - a.ms).slice(0, 15).forEach((p, i) => {
          const b = el("div", "item hrow rise"); b.style.setProperty("--i", String(Math.min(i, 12)));
          const n = el("span", "n"); n.append(String(p.n), el("small", null, p.n === 1 ? "time" : "times"));
          b.append(el("span", `dot ${p.nofeed === p.n ? "drop" : "down"}`), el("span", "t", p.w), n,
            el("span", "s", [`${lama(p.ms)} in all, longest ${lama(p.long)}`, p.nofeed ? `${p.nofeed} only data stops` : "", p.behind ? `took ${p.behind} router${p.behind === 1 ? "" : "s"} behind it` : "", `last ${ago(p.last)}`].filter(Boolean).join(" · ")));
          out.push(b);
        });
        // time of day (WIB, the browser's clock)
        const hours = Array(24).fill(0); for (const e of real) hours[new Date(e.start).getHours()]++;
        const e2 = el("div", "eyebrow"); e2.append("Time of day"); const bars = el("div", "hbars"), max = Math.max(1, ...hours);
        hours.forEach((v, h) => { const c = el("div", "hb"); c.title = `${String(h).padStart(2, "0")}:00 · ${v} outage${v === 1 ? "" : "s"}`; const f = el("i"); f.style.height = `${(v / max) * 100}%`; c.append(f); bars.append(c); });
        const ticks = el("div", "ticks"); for (const h of [0, 6, 12, 18, 23]) ticks.append(el("span", null, `${String(h).padStart(2, "0")}:00`));
        const worst = hours.indexOf(max); out.push(e2, bars, ticks, el("p", "note", real.length ? `Most often around ${String(worst).padStart(2, "0")}:00 (${max} of ${real.length}).` : "Only data stops so far."));
        // recent events
        const e3 = el("div", "eyebrow"); e3.append("Recent"); out.push(e3);
        [...events].reverse().slice(0, 12).forEach((e) => {
          const b = el("button", "item"); b.type = "button";
          const when = new Date(e.start).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
          b.append(el("span", `dot ${e.open ? (e.level === "nofeed" ? "drop" : "down") : "ok"}`), el("span", "t", e.where.join(", ")), el("span", "n", e.open ? "open" : lama(e.end - e.start)),
            el("span", "s", [when, { down: "down", drop: "dropping", nofeed: "no data" }[e.level], e.behind ? `${e.rows.length} routers` : ""].filter(Boolean).join(" · ")));
          b.onclick = () => { view.mode = "incident"; view.inc = e.incs[0].id; drawBody(); }; out.push(b);
        });
      }
      // PON ports that keep failing
      const pons = new Map(); for (const i of incidents.filter((x) => x.kind === "pon" && x.start > since)) { const p = pons.get(i.title) || { t: i.title, n: 0, ms: 0 }; p.n++; p.ms += (i.end || Date.now()) - i.start; pons.set(i.title, p); }
      if (pons.size) { const e4 = el("div", "eyebrow"); e4.append("PON ports"); out.push(e4);
        [...pons.values()].sort((a, b) => b.n - a.n).slice(0, 8).forEach((p) => { const r = el("div", "item hrow"); const n = el("span", "n"); n.append(String(p.n), el("small", null, p.n === 1 ? "time" : "times"));
          r.append(el("span", "dot drop"), el("span", "t", p.t), n, el("span", "s", `${lama(p.ms)} in all`)); out.push(r); }); }
      return out;
    }
    function historyItem(i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(svg("M12 7v5l3 2M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"), el("span", "t", "Outage history"), el("span", "r", "Riwayat"), el("span", "s", "Where and when outages keep happening, traced with the network map"));
      b.onclick = () => { view.mode = "history"; view.card = null; drawBody(); }; return b;
    }
