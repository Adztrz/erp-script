    // ---- Above the core: the upstream, the POPs' busy hours and the backbone fibre ----
    // The ERP's Bandwidth page (NOC → Bandwidth) measures what the router map doesn't: the metro and IX links above the
    // core, each POP's VLAN in the busy hours over 14 days, and the fibre toward the upstream. Way up ends with the
    // upstream; a POP or upstream link that's full most evenings is a peak the Answer can name; the radar warns when the
    // backbone fibre's light fades, before it breaks. Read only: the page's own switches are never touched.
    let bw = { at: 0, histAt: 0, fibreAt: 0 }, bwLoading = null;
    function bwLoad(fibre) {
      const now = Date.now(), want = [now - bw.at > 2 * 60000, now - bw.histAt > 30 * 60000, !!fibre && now - bw.fibreAt > 5 * 60000];
      if (!want.some(Boolean)) return Promise.resolve(bw);
      return (bwLoading ||= Promise.all([want[0] ? api("/api/noc/bandwidth").catch(() => null) : null, want[1] ? api("/api/noc/bandwidth/history?hari=14").catch(() => null) : null,
        want[2] ? api("/api/noc/bandwidth/demarkasi").catch(() => null) : null]).then(([n, h, f]) => {
        if (n?.data) bw = { ...bw, now: n.data, at: Date.now() }; if (h?.data) bw = { ...bw, hist: h.data, histAt: Date.now() }; if (f?.data) bw = { ...bw, fibre: f.data, fibreAt: Date.now() };
        return bw; }).finally(() => { bwLoading = null; }));
    }
    const busyHours = (b) => (b?.hist?.jam_sibuk || []).map(Number).filter((h) => h >= 0 && h < 24).sort((x, y) => x - y);
    // Way up, from the ERP: the POP link's busy hours on each hop, the upstream at the top, and its peaks
    async function aboveCore(p) {
      const b = await bwLoad(); if (!b.now || !p.hops.length) return;
      const hrs = busyHours(b), span = spanText(hrs);
      // a POP's VLAN: its size from the Bandwidth page, so its % means something; full now is said as the map's full links are
      for (const h of p.hops) {
        const pop = h.link?.vlan !== false && h.link?.down != null ? (b.now.pops || []).find((x) => x.nama && x.cap && (h.link.port || "").includes(x.nama)) : null; if (!pop) continue;
        h.link.cap = pop.cap; h.link.pct = h.link.down / (pop.cap * 1e6); h.link.text = linkText(h.link);
        if (h.link.pct >= 0.9 && (p.v[0] === "ok" || / is busy /.test(p.v[1]))) p.v = ["warn", `The link ${h.name} → ${p.hops[p.hops.indexOf(h) + 1]?.name || "upstream"} is full (${Math.round(h.link.pct * 100)}% of ${capText(pop.cap)}): everyone behind it is slow now, not just this customer.`];
      }
      if (p.v[0] === "ok") { const top = Math.max(-1, ...p.hops.map((h) => (h.link?.pct != null ? h.link.pct : -1))); if (top >= 0) p.v = ["ok", p.v[1].replace(/\(busiest link \d+%\)/, `(busiest link ${Math.round(top * 100)}%)`)]; }
      for (const h of p.hops) {
        const port = h.link?.port || "", st = (b.hist?.pop_sibuk_stat || []).find((x) => x.label && port.includes(x.label)); if (!st || !(st.pakai_p95_pct >= 75)) continue;
        h.link.text += ` · ${Math.round(st.pakai_p95_pct)}% in the busy hours (${span})`;
        if (st.pakai_p95_pct >= 90) p.peaks.push({ name: st.label, span, hrs, say: `their POP link ${st.label} runs at ${Math.round(st.pakai_p95_pct)}% in the busy hours (${span}) most days` });
      }
      const ups = (b.now.links || []).filter((l) => l.grup === "metro" || l.grup === "upstream"); if (!ups.length) return;
      const top = p.hops[p.hops.length - 1], metro = b.now.metro, full = ups.filter((l) => l.util >= 90), busy = (b.hist?.jam_sibuk_stat || []).filter((x) => x.pakai_p95_pct >= 90);
      top.link = { pct: metro?.util != null ? metro.util / 100 : null, dead: false, stale: false, unknown: false, key: null, port: ups.map((l) => `${l.label} ${Math.round(l.util)}%`).join(" · "),
        text: `metro ${Math.round(metro?.util ?? 0)}% now${busy.length ? ` · ${busy.map((x) => `${x.label} ${Math.round(x.pakai_p95_pct)}%`).join(", ")} in the busy hours (${span})` : ""}` };
      p.hops.push({ name: "Upstream (metro + IX)", kind: "Internet", bad: false, note: full.length ? `${full.map((l) => l.label).join(", ")} full now` : `${ups.length} links, the busiest ${Math.round(Math.max(...ups.map((l) => l.util)))}%`, also: null, link: null });
      if (full.length && (p.v[0] === "ok" || / is busy /.test(p.v[1]))) p.v = ["warn", `The upstream is full now (${full.map((l) => `${l.label} ${Math.round(l.util)}%`).join(", ")}): everyone on the network is slow, not just this customer.`];
      for (const x of busy) p.peaks.push({ name: x.label, span, hrs, up: true, say: `the upstream ${x.label} runs at ${Math.round(x.pakai_p95_pct)}% in the busy hours (${span}) most days` });
    }
    // the radar: the upstream links that fill up in the busy hours, and the ERP's capacity verdicts
    function upstreamRows(b) {
      const span = spanText(busyHours(b)), keb = new Map((b.now?.kebutuhan || []).map((k) => [k.label, k])), out = [];
      for (const x of b.hist?.jam_sibuk_stat || []) {
        const k = keb.get(x.label); if (!(x.pakai_p95_pct >= 75) && k?.status !== "crit") continue;
        out.push({ name: x.label, full: x.pakai_p95_pct >= 90, text: `${Math.round(x.pakai_p95_pct)}% in the busy hours (${span}, p95)${k ? ` · peaked ${Math.round(k.pakai_puncak_pct)}% this week · ${k.rekom}` : ""}` });
      }
      for (const x of b.hist?.pop_sibuk_stat || []) if (x.pakai_p95_pct >= 75) out.push({ name: x.label, full: x.pakai_p95_pct >= 90, text: `POP link · ${Math.round(x.pakai_p95_pct)}% in the busy hours (${span}, p95) · ${x.vonis}` });
      return out.sort((a, c) => c.full - a.full);
    }
    // the backbone fibre toward the upstream: a span whose light has faded, or that is down
    function fibreAlerts(b) {
      const f = b.fibre; if (!f) return [];
      const step = (f.rinci?.verdict?.langkah || [])[0] || "";
      return (f.rinci?.ruas || []).filter((x) => x.kode && x.kode !== "ok").map((x) => ({ down: x.status !== "link-ok", head: `Fibre ${x.nama}: ${x.label}`, body: `${x.sebab}${x.link_downs ? ` Dropped ${x.link_downs}× since ${x.sejak}.` : ""}${step ? ` ${step}` : ""}` }));
    }

