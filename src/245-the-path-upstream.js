    // ---- Path: the way from a customer to the internet ----
    // The ERP's router map (Network → Topology → Router map): every router, switch and OLT, the links between them with
    // which end is upstream, dead ports, and each linked port's traffic now (the map reads it every few seconds). From
    // the customer's OLT (their modem's), else their router, it climbs the links to the top, and says where the way is
    // down, full or busy. A line slow because an uplink is full is slow for everyone behind it, not a fault at the house.
    let pathMap = null, pathMapLoading = null, pathLive = null, pathLiveLoading = null;
    function pathMapLoad() {
      if (pathMap && Date.now() - pathMap.at < 2 * 60000) return Promise.resolve(pathMap);
      return (pathMapLoading ||= Promise.all([api("/api/network/peta-router"), api("/api/network/peta-router/olt"), api("/api/network/peta-router/switch").catch(() => null)])
        .then(([b, o, s]) => (pathMap = { at: Date.now(), peta: b.peta || {}, olts: o.olt || [], sws: s?.switch || [] }))
        .finally(() => { pathMapLoading = null; }));
    }
    function pathLiveLoad() {
      if (pathLive && Date.now() - pathLive.at < 20000) return Promise.resolve(pathLive);
      return (pathLiveLoading ||= api("/api/network/peta-router/live").then((j) => (pathLive = { at: Date.now(), port: j.port || {}, router: j.router || {} }))
        .catch(() => pathLive || { at: 0, port: {}, router: {} }).finally(() => { pathLiveLoading = null; }));
    }
    // the radar's topology from the map: routers and switches, each link pointing away from the core. Which end is
    // up is taken from the distance to the top (routers with nothing above them), so a link the map draws backwards
    // doesn't put a switch above the router feeding it; the map's own direction decides a tie
    function erpTopoText(map) {
      const links = [...(map.peta.link || []), ...(map.peta.sambungan || [])].filter((l) => l.roA && l.roB && !/^olt:/.test(l.roA) && !/^olt:/.test(l.roB));
      const name = (id) => String(map.sws.find((x) => x.id === id)?.nama || id).replace(/[,>]/g, " ").trim().toUpperCase();
      const upOf = (l) => (l.hulu === "a" ? l.roA : l.hulu === "b" ? l.roB : null);
      const routers = (map.peta.node || []).map((n) => n.ro), dist = new Map();
      const q = routers.filter((ro) => links.some((l) => l.roA === ro || l.roB === ro) && !links.some((l) => upOf(l) && upOf(l) !== ro && (l.roA === ro || l.roB === ro)));
      for (const t of q) dist.set(t, 0);
      for (let i = 0; i < q.length; i++) for (const l of links) { const o = l.roA === q[i] ? l.roB : l.roB === q[i] ? l.roA : null; if (o && !dist.has(o)) { dist.set(o, dist.get(q[i]) + 1); q.push(o); } }
      const below = new Map();
      for (const l of links) {
        const da = dist.get(l.roA) ?? 99, db = dist.get(l.roB) ?? 99, up = da < db ? l.roA : db < da ? l.roB : upOf(l); if (!up) continue;
        const dn = up === l.roA ? l.roB : l.roA, list = below.get(up) || below.set(up, []).get(up); if (!list.includes(dn)) list.push(dn);
      }
      return [...below].map(([u, d]) => `${name(u)} > ${d.map(name).join(", ")}`).join("\n");
    }
    const capText = (mbps) => (mbps >= 1000 ? `${String(+(mbps / 1000).toFixed(1)).replace(".", ",")} Gbit/s` : `${mbps} Mbit/s`);
    const rateText = (bps) => (bps >= 1e9 ? `${(bps / 1e9).toFixed(1).replace(".", ",")} Gbit/s` : bits(bps));
    // the climb, as data: the hops from the customer's end up, each with the link to the next one up, and a verdict
    function pathRead(r, map, lv, ontPid, reach = () => null) {
      const links = [...(map.peta.link || []), ...(map.peta.sambungan || [])].filter((l) => l.hulu === "a" || l.hulu === "b");
      const upOf = (l) => (l.hulu === "a" ? l.roA : l.roB), downOf = (l) => (l.hulu === "a" ? l.roB : l.roA);
      const nodes = map.peta.node || [], olt = new Map(map.olts.map((o) => [o.id, o])), sw = new Map(map.sws.map((s) => [s.id, s]));
      // the customer's router on the map: the same name, else the longest map name it starts with (RO CONTOH NEW is CONTOH), else the only one with its first word
      const routerNode = (name) => { const k = topoKey(name); if (!k) return null;
        const keys = nodes.map((n) => [topoKey(n.ro), n.ro]), same = keys.find(([t]) => t === k);
        if (same) return same[1];
        const pre = keys.filter(([t]) => k.startsWith(`${t} `)).sort((a, b) => b[0].length - a[0].length)[0]; if (pre) return pre[1];
        const w = keys.filter(([t]) => t.split(" ")[0] === k.split(" ")[0]); return w.length === 1 ? w[0][1] : null; };
      const start = ontPid && olt.has(`olt:${ontPid}`) ? `olt:${ontPid}` : routerNode(r.router);
      if (!start) return { hops: [], v: ["off", `${r.router ? `${r.router} isn't` : "This customer's router isn't"} on the ERP's router map, so the way up can't be followed.`], notes: [] };
      const name = (id) => olt.get(id)?.nama || sw.get(id)?.nama || id;
      const measure = (l, upper) => { // traffic toward the customer, now: the port the map reads is at one end of the link
        if (l.pseudo) return { down: null, cap: null, pct: null, dead: false, stale: false, port: "", unknown: true };
        const p = lv.port?.[l.sumberRo]?.[l.sumberIf], atUp = l.sumberRo === upper, same = upper === upOf(l);
        const down = p ? Number(atUp ? p.outBps : p.inBps) : l.status === "basi" ? NaN : Number(same ? l.keHilirBps : l.keHuluBps), cap = Number(p?.kapMbps) || null;
        const pct = cap && Number.isFinite(down) ? down / (cap * 1e6) : l.utilPct != null && !p && same && l.status !== "basi" ? l.utilPct / 100 : null;
        const dead = l.status === "port_mati" || /down/i.test(p?.oper || "");
        return { down: Number.isFinite(down) ? down : null, cap, pct, dead, stale: l.status === "basi", since: l.portMati?.sejak || null, port: l.sumberRo ? `${name(l.sumberRo)} ${l.sumberIf || ""}`.trim() : "" };
      };
      const state = (id) => {
        if (id.startsWith("olt:")) { const o = olt.get(id), old = o?.diperbarui && Date.now() - Date.parse(o.diperbarui) > 86400000;
          return { kind: "OLT", bad: false, note: o?.ontTotal ? `${o.ontOnline} of ${o.ontTotal} modems online${old ? ` (as of ${new Date(o.diperbarui).toLocaleDateString("id-ID", { day: "numeric", month: "short" })})` : ""}` : o?.status === "tanpa_data" ? "no modem data" : "" }; }
        if (id.startsWith("sw:")) { const s = sw.get(id), off = s && !/online/i.test(s.status || "");
          return { kind: "Switch", bad: off, note: off ? "offline" : s ? `${s.portsUp ?? "?"} ports up${s.portsDown ? `, ${s.portsDown} down` : ""}` : "" }; }
        const n = nodes.find((x) => x.ro === id), x = lv.router?.[id], ok = x ? x.ok !== false : n ? n.hidup !== false : true, cpu = x?.cpu ?? n?.cpu;
        return { kind: "Router", bad: !ok, note: !ok ? "unreachable" : cpu != null ? `CPU ${cpu}%` : "", cpu };
      };
      // an OLT the map draws no link for hangs off its router
      for (const o of map.olts) if (o.ro && !links.some((l) => l.roA === o.id || l.roB === o.id)) links.push({ roA: o.ro, roB: o.id, hulu: "a", pseudo: true });
      // the shortest way to the top (routers with nothing above them): each link up as the map marks it costs 1; one
      // the other way costs 3, for a link the map has drawn backwards (a switch marked above the router feeding it)
      const isRouter = (id) => !/^(olt|sw):/.test(id), top = new Set(nodes.map((n) => n.ro).filter((ro) => !links.some((l) => downOf(l) === ro)));
      const dist = new Map([[start, 0]]), prev = new Map(), todo = new Set([start]);
      while (todo.size) {
        const at = [...todo].reduce((m, x) => (dist.get(x) < dist.get(m) ? x : m)); todo.delete(at);
        if (top.has(at) && isRouter(at)) continue;
        for (const l of links) {
          const end = l.roA === at ? l.roB : l.roB === at ? l.roA : null; if (!end) continue;
          const d = dist.get(at) + (upOf(l) === end ? 1 : 3) + (l.status === "port_mati" ? 0.5 : 0);
          if (!dist.has(end) || d < dist.get(end)) { dist.set(end, d); prev.set(end, { from: at, l }); todo.add(end); }
        }
      }
      const goal = [...top].filter((t) => dist.has(t) && t !== start).sort((a, b) => dist.get(a) - dist.get(b))[0];
      const way = [start]; if (goal) { const up = []; for (let x = goal; x !== start; x = prev.get(x).from) up.unshift(x); way.push(...up); }
      const hops = way.map((id) => ({ id, name: name(id), ...state(id) })), backwards = [];
      for (let i = 0; i < hops.length - 1; i++) {
        const { l } = prev.get(way[i + 1]); hops[i].link = measure(l, way[i + 1]);
        if (!l.pseudo && upOf(l) !== way[i + 1]) backwards.push(`${hops[i].name} – ${hops[i + 1].name}`);
        const others = links.filter((k) => k !== l && downOf(k) === way[i] && !way.includes(upOf(k)) && !k.pseudo && isRouter(upOf(k))).map((k) => name(upOf(k)));
        if (others.length) hops[i].also = others;
      }
      // the verdict: the first trouble from the customer up
      const pc = (x) => `${Math.round(x * 100)}%`, ln = (h, i) => `${h.name} → ${hops[i + 1]?.name || "upstream"}`;
      const downHop = hops.find((h) => h.bad), dead = hops.findIndex((h) => h.link?.dead), full = hops.findIndex((h) => h.link?.pct >= 0.9), busy = hops.findIndex((h) => h.link?.pct >= 0.75);
      const hot = hops.find((h) => h.cpu >= 85), worst = hops.reduce((m, h) => (h.link?.pct != null && h.link.pct > (m?.link.pct ?? -1) ? h : m), null);
      const who = (h) => { const t = reachText(reach(h.id, h.name)); return t ? ` ${t[0].toUpperCase()}${t.slice(1)}.` : ""; };
      const v = downHop ? ["net", `${downHop.kind} ${downHop.name} on their way up is ${downHop.note}: everyone behind it is cut off, not just this customer.${who(downHop)}`]
        : dead >= 0 ? ["net", `The link ${ln(hops[dead], dead)} is down${hops[dead].link.since ? ` since ${hhmm(Date.parse(hops[dead].link.since))}` : ""}${hops[dead].link.port ? ` (${hops[dead].link.port})` : ""}: area-wide, not just this customer.${who(hops[dead])}`]
        : full >= 0 ? ["warn", `The link ${ln(hops[full], full)} is full (${pc(hops[full].link.pct)} of ${capText(hops[full].link.cap || 0)}): everyone behind it is slow now, not just this customer.${who(hops[full])}`]
        : busy >= 0 ? ["warn", `The link ${ln(hops[busy], busy)} is busy (${pc(hops[busy].link.pct)}): it may slow down at peak times.`]
        : hot ? ["warn", `Router ${hot.name} is working hard (CPU ${hot.cpu}%).`]
        : ["ok", `The way up is clear${worst ? ` (busiest link ${pc(worst.link.pct)})` : ""}: if they're slow, it's their own line, their plan or their WiFi.`];
      const notes = [];
      if (backwards.length) notes.push(`The ERP's map marks ${backwards.join(", ")} the other way round; taken as the way up here`);
      if (!goal) notes.push(`The map has no link up from ${name(start)}`);
      if (!start.startsWith("olt:")) notes.push("Their modem's OLT wasn't found, so the way starts at their router");
      const show = hops.map((h) => ({ name: h.name, kind: h.kind, bad: h.bad, note: h.note, also: h.also || null,
        link: h.link ? { pct: h.link.pct, dead: h.link.dead, stale: h.link.stale, unknown: !!h.link.unknown,
          text: h.link.unknown ? "through its router (no measured link)" : h.link.dead ? `down${h.link.since ? ` since ${hhmm(Date.parse(h.link.since))}` : ""}` : h.link.down == null ? "no fresh reading on the map" : `↓ ${rateText(h.link.down)}${h.link.cap ? ` of ${capText(h.link.cap)}` : ""}${h.link.pct != null ? ` · ${pc(h.link.pct)}` : ""}${h.link.stale ? " · old reading" : ""}`,
          port: h.link.port } : null }));
      return { hops: show, v, notes };
    }
    async function pathFor(r) {
      await Promise.all([onts ? 0 : ontIndex().catch(() => {})]);
      const [map, lv] = await Promise.all([pathMapLoad(), pathLiveLoad()]);
      // who is behind a point: an OLT's modems, else the routers below it on the radar's map
      const topo = topology(), t = radar && topo.names.size ? { topo, at: topoState(topo, radar.list) } : null;
      const reach = (id, nm) => { if (id.startsWith("olt:")) { const o = map.olts.find((x) => x.id === id); return o?.ontTotal ? { modems: o.ontTotal } : null; }
        const k = topoKey(String(nm).replace(/[,>]/g, " ")); return t && t.topo.names.has(k) ? behindOf(t, k) : null; };
      return pathRead(r, map, lv, modemOf(r).ont?.pid, reach);
    }
    function pathBox(r) {
      const box = el("div", "near hist path rise"); box.style.setProperty("--i", "2");
      const head = () => { const e = el("div", "eyebrow"); e.style.margin = "0 0 8px"; e.append("Way up"); return e; };
      let timer = null, polls = 0;
      const show = (p) => {
        const parts = [head(), el("p", `verdict ${p.v[0]}`, p.v[1])];
        if (p.hops.length) { const ch = el("div", "chain");
          for (const h of p.hops) {
            const hop = el("div", "hop"); hop.append(el("span", `dot ${h.bad ? "down" : "ok"}`), el("b", null, h.name), el("span", "n", [h.kind, h.note].filter(Boolean).join(" · "))); ch.append(hop);
            if (h.link) { const lk = el("div", `lnk${h.link.dead ? " dead" : ""}`);
              if (h.link.pct != null) { const bar = el("div", `tbar${h.link.pct >= 0.9 ? " full" : h.link.pct >= 0.75 ? " busy" : ""}`), f = el("span"); f.style.width = `${Math.min(100, Math.round(h.link.pct * 100))}%`; bar.append(f); lk.append(bar); }
              const t = el("span", null, h.link.text); if (h.link.port) t.title = h.link.port; lk.append(t);
              if (h.also) lk.append(el("span", "n", `also up through ${h.also.join(", ")}`));
              ch.append(lk); }
          }
          parts.push(ch); }
        for (const n of p.notes) parts.push(el("p", "note", n));
        box.replaceChildren(...parts);
      };
      const poll = async () => {
        if (!box.isConnected && polls) return clearInterval(timer);
        polls++; try { show(await pathFor(r)); } catch (e) { box.replaceChildren(head(), el("p", "note late", `The router map didn't answer: ${e.message}`)); }
        if (polls > 10) clearInterval(timer); // 5 minutes, then it rests
      };
      box.append(head(), el("p", "note ld", "Following the links up from their OLT…"));
      setTimeout(() => { poll(); timer = setInterval(poll, 30000); }, 0);
      return box;
    }

