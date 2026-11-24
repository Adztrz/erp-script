    // ---- the map as a brief for a technician ----
    // What's wrong, where, and how bad, readable on the map itself and in the picture it shares: a strip with the
    // severity and the counts, a legend, the problem customers named, labelled rings and a scale bar, the network boxes
    // from Planning's asset list (cached when Planning was opened in this browser), and the box most likely at fault.
    // Words on the map are Indonesian like the outage report, since the picture goes to the technicians.
    // A customer's condition: the customer list says online or not; the OLT's modem list says why it's down (LOS is a
    // cut or bent fibre, dying gasp is the power) and how strong the signal is (critical below −28 dBm, the ERP's line).
    // isolir red, offline white, online green; for an offline modem the colour here is its ring (why it's down)
    const KIND = { los: ["Putus (LOS)", "#f12614"], pwr: ["Mati listrik", "#8a8b8a"], off: ["Offline", "#efefed"], weak: ["Redaman tinggi", "#e0b252"], iso: ["Isolir", "#f12614"], on: ["Online", "#55bc82"] };
    const RANK = { on: 0, iso: 1, weak: 2, off: 3, pwr: 3, los: 4 }, DOWN = new Set(["los", "pwr", "off"]);
    const LEVEL = { high: ["BERAT", "#f12614"], mid: ["SEDANG", "#e0b252"], low: ["RINGAN", "#a3a4a3"], ok: ["NORMAL", "#55bc82"] };
    function health(c, on = !!c.online) {
      if (c.isolir) return "iso";
      const o = modemOf(c).ont;
      if (!on) return o && /los/i.test(o.st) ? "los" : o && /dying|power/i.test(o.st) ? "pwr" : "off";
      return o && usable(o) && o.rx < -28 ? "weak" : "on";
    }
    const detail = (z) => (z.k === "weak" ? dbm(modemOf(z.c).ont?.rx) : `${z.k === "los" ? "LOS" : z.k === "pwr" ? "mati listrik" : "offline"}${z.t ? ` ${lama(Date.now() - z.t)}` : ""}`);
    // one customer's dot on a canvas, as the buttons look: down white with its ring, the rest filled; an online one small
    // and dark-edged; a dashed amber ring when it keeps reconnecting
    function paintDot(g, x, y, kind, r = 6, unst = false) {
      g.beginPath(); g.arc(x, y, r, 0, 7);
      if (DOWN.has(kind)) { g.fillStyle = "#efefed"; g.fill(); g.lineWidth = kind === "los" ? 2.5 : 2; g.strokeStyle = kind === "off" ? "rgba(7,9,11,.9)" : KIND[kind][1]; if (kind === "pwr") g.setLineDash([2, 2]); g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = KIND[kind][1]; g.fill(); g.lineWidth = kind === "on" ? (r < 4 ? 1 : 1.5) : 2; g.strokeStyle = kind === "on" ? "rgba(7,9,11,.85)" : "rgba(255,255,255,.9)"; g.stroke(); }
      if (unst) { g.beginPath(); g.arc(x, y, r + 3.5, 0, 7); g.setLineDash([3, 2]); g.lineWidth = 2; g.strokeStyle = "#e0b252"; g.stroke(); g.setLineDash([]); }
    }
    const shortName = (c) => String(c.nama || c.username || "").trim().split(/\s+/).slice(0, 2).join(" ");
    // From the drop log and the modem's own TR-069 report: when an offline customer went down (0 = unknown), and whether
    // an online one keeps reconnecting (4+ new sessions in 24 h, as on the Down? box)
    function downAt(c) {
      const u = lower(c.username), gone = drops?.off[u], inf = modemOf(c).dev?.inform, tr = inf ? Date.parse(inf) || 0 : 0;
      if (gone) return tr && tr >= gone.from - 60000 && tr <= gone.seen ? tr : gone.from;
      return tr;
    }
    const unstable = (c) => (drops?.u[lower(c.username)]?.s || []).filter((t) => t > Date.now() - 86400000).length >= 4;
    const lama = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} mnt` : m < 2880 ? `${Math.round(m / 60)} jam` : `${Math.round(m / 1440)} hari`; };
    const FRESH = 30 * 60000;
    function mark(z, replay) { // t: down since; u: unstable. Neither while replaying (they describe now)
      z.t = !replay && DOWN.has(z.k) ? downAt(z.c) : 0; z.u = !replay && (z.k === "on" || z.k === "weak") && unstable(z.c); return z;
    }
    // Replay: who was offline at time T. Someone down now was already down then if they were last seen online before T;
    // then the readings since T are wound back for those who went down and came back in between
    function offAt(T) {
      const off = new Set(Object.entries(drops?.off || {}).filter(([, o]) => o.from <= T).map(([u]) => u));
      for (const [t, gone, back] of [...(drops?.ev || [])].reverse()) { if (t <= T) break; for (const u of gone) off.delete(u); for (const u of back) off.add(u); }
      return off;
    }
    function replayBar(box) {
      const first = drops?.first || 0; if (!first || Date.now() - first < 15 * 60000) return null; // the log needs a past to replay
      const step = 15 * 60000, t0 = Math.max(first, Date.now() - 86400000), n = Math.max(1, Math.round((Date.now() - t0) / step));
      const bar = el("div", "replay"), lab = el("span"), rng = el("input"); rng.type = "range"; rng.min = "0"; rng.max = String(n); rng.step = "1";
      rng.setAttribute("aria-label", "Replay the last 24 hours");
      const at = (v) => (+v >= n ? 0 : t0 + +v * step), say = (v) => { const T = at(v); lab.textContent = T ? `Putar ulang · ${hhmm(T)}` : "Putar ulang · sekarang"; };
      rng.value = String(box.replayT ? Math.max(0, Math.round((box.replayT - t0) / step)) : n); say(rng.value);
      rng.oninput = () => say(rng.value);
      rng.onchange = () => { box.replayT = at(rng.value); box.replayFocus = true; box.redraw(); };
      if (box.replayFocus) { box.replayFocus = false; setTimeout(() => rng.focus(), 0); }
      bar.append(lab, rng); return bar;
    }
    // each customer's nearest FAT/ODP within 250 m, through a grid of ~330 m cells so a big router stays quick
    let boxGrid = null;
    function nearestBox(p) {
      if (!netList?.length) return null;
      if (boxGrid?.list !== netList) { const g = new Map();
        for (const a of netList) if (/FAT|ODP/.test(a.type)) { const k = `${Math.floor(a.p.lat / 0.003)},${Math.floor(a.p.lng / 0.003)}`; if (!g.has(k)) g.set(k, []); g.get(k).push(a); }
        boxGrid = { list: netList, g }; }
      const i = Math.floor(p.lat / 0.003), j = Math.floor(p.lng / 0.003); let best = null, bd = 250;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const x of boxGrid.g.get(`${i + a},${j + b}`) || []) { const d = metres(p, x.p); if (d < bd) { bd = d; best = x; } }
      return best;
    }
    // FAT/ODP/FDT/ODC with a location, from Planning's cached asset list; [] when Planning hasn't been opened here
    let netList = null, netLoading = null;
    const netAssets = () => (netLoading ||= (async () => {
      try { const cache = await caches.open(CACHE);
        for (const req of await cache.keys()) {
          if (!/networkAssets/.test(req.url) || !/OLT.*FAT|FAT.*OLT/.test(decodeURIComponent(req.url))) continue;
          const j = await (await cache.match(req)).json(), seen = new Set(), out = [];
          for (const a of j.data || []) {
            const type = String(a.tipeAset || "").toUpperCase(); if (seen.has(a.id) || !/^(FAT|ODP|FDT|ODC)$/.test(type)) continue; seen.add(a.id);
            const lat = num(a.lokasiKoordinat?.latitude ?? a.lat), lng = num(a.lokasiKoordinat?.longitude ?? a.lng); if (!lat || !lng) continue;
            const code = String(a.kodeAset || "").trim(); out.push({ type, code: code.toUpperCase().startsWith(type) ? code : `${type} ${code}`, p: { lat, lng }, desa: a.desa || "" });
          }
          return (netList = out);
        }
      } catch {}
      return (netList = []);
    })());
    // the modem list and the asset list arrive after the first drawing: draw once more when they're in
    function waitForBrief(box) {
      if (!netList && !box.netWait) { box.netWait = true; netAssets().then(() => box.isConnected && box.redraw?.()); }
      if (!onts && !box.ontWait) { box.ontWait = true; ontIndex().then(() => box.isConnected && box.redraw?.()).catch(() => {}); }
      if (!box.moreWait) { box.moreWait = true; Promise.all([dropsOf(), acsIndex(), techIndex().catch(() => {})]).then(() => box.isConnected && box.redraw?.()).catch(() => {}); }
    }
    // The box most likely at fault: with two or more customers down, the FAT/ODP closest to all of them (least total
    // distance), if it's within 400 m of them on average. A pointer for where to look first, not a proof.
    function suspect(down) {
      if (down.length < 2 || !netList?.length) return null;
      const mid = { lat: down.reduce((a, z) => a + z.p.lat, 0) / down.length, lng: down.reduce((a, z) => a + z.p.lng, 0) / down.length };
      let best = null;
      for (const a of netList) { if (!/FAT|ODP/.test(a.type) || metres(mid, a.p) > 800) continue;
        const sum = down.reduce((t, z) => t + metres(z.p, a.p), 0); if (!best || sum < best.sum) best = { a, sum }; }
      return best && best.sum / down.length <= 400 ? { ...best.a, avg: Math.round(best.sum / down.length) } : null;
    }
    function severity(pts) {
      const n = {}; for (const z of pts) n[z.k] = (n[z.k] || 0) + 1;
      const act = pts.filter((z) => z.k !== "iso").length, down = (n.los || 0) + (n.pwr || 0) + (n.off || 0), weak = n.weak || 0;
      const lv = down >= 5 || (down >= 3 && down / Math.max(1, act) >= 0.25) || (n.los || 0) >= 3 ? "high" : down >= 2 || weak >= 3 ? "mid" : down || weak ? "low" : "ok";
      return { n, act, down, weak, lv };
    }
    // Everything the brief shows, in map pixels, so the map on screen and the shared picture are drawn from one plan.
    function briefScene({ pts, at, mpp, w, h, rings = [], me = null, about = {} }) {
      for (const z of pts) if (z.t === undefined) mark(z, about.replay);
      const sev = severity(pts), probs = pts.filter((z) => z.k !== "on" && z.k !== "iso").sort((a, b) => RANK[b.k] - RANK[a.k]);
      const down = pts.filter((z) => DOWN.has(z.k)), fault = suspect(down);
      const vil = new Map(); for (const z of (probs.length ? probs : pts)) { const d = z.c.desa ? titleCase(z.c.desa.trim()) : ""; if (d) vil.set(d, (vil.get(d) || 0) + 1); }
      const villages = [...vil].sort((a, b) => b[1] - a[1]);
      const title = sev.down ? `${sev.down} dari ${sev.act} pelanggan mati` : sev.weak ? `${sev.weak} dari ${sev.act} redaman tinggi` : `Semua ${sev.act} pelanggan online`;
      const counts = ["los", "pwr", "off", "weak", "iso", "on"].filter((k) => sev.n[k]).map((k) => `${sev.n[k]} ${KIND[k][0].toLowerCase()}`).join(" · ");
      const sub = [about.what, villages.slice(0, 3).map(([d]) => d).join(", "), about.replay ? `per ${hhmm(about.replay)} (putar ulang)` : about.since ? `sejak ${hhmm(about.since)}` : `per ${hhmm(Date.now())}`].filter(Boolean).join(" · ");
      const inView = ([x, y], m = 0) => x >= -m && y >= -m && x <= w + m && y <= h + m;
      let assets = (netList || []).map((a) => ({ ...a, xy: at(a.p) })).filter((a) => inView(a.xy, 10));
      // zoomed out, hundreds of boxes bury the customers: keep the ones near a problem (200 m), at most 80
      // (the problems put in ~330 m cells first: every box against every problem froze the whole-network map)
      if (assets.length > 80) { const cell = new Map(), key = (p, a = 0, b = 0) => `${Math.floor(p.lat / 0.003) + a},${Math.floor(p.lng / 0.003) + b}`;
        for (const z of probs) { const k = key(z.p); (cell.get(k) || cell.set(k, []).get(k)).push(z); }
        const near = (a) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const z of cell.get(key(a.p, i, j)) || []) if (metres(z.p, a.p) <= 200) return true; return false; };
        const out = []; for (const a of assets) { if (near(a)) out.push(a); if (out.length >= 80) break; } assets = out; }
      const faultXY = fault ? at(fault.p) : null;
      // name the problems where there's room: beside the dot, else the other side, above or below; never over the strip,
      // the legend or another name
      const used = [[0, 0, w, about.bar ? 100 : 72], [0, h - 58, w, h]], labels = [];
      const free = (r) => r[0] >= 4 && r[2] <= w - 40 && used.every((u) => r[2] < u[0] || r[0] > u[2] || r[3] < u[1] || r[1] > u[3]);
      // each customer's nearest FAT/ODP: a line from every down customer to theirs, and on each box with any down a count
      // of down / all its customers on this map ("3/5"); half or more down with 2+ is the box to suspect
      const groups = new Map();
      for (const z of pts) { if (z.k === "iso" || z.me && !DOWN.has(z.k)) continue; const a = nearestBox(z.p); if (!a) continue; z.box = a;
        let g = groups.get(a.code); if (!g) groups.set(a.code, (g = { a, down: 0, all: 0, desa: new Map() })); g.all++; if (DOWN.has(z.k)) g.down++;
        if (z.c.desa) g.desa.set(z.c.desa, (g.desa.get(z.c.desa) || 0) + 1); }
      const fats = [...groups.values()].filter((g) => g.down).map((g) => ({ ...g, bad: g.down >= 2 && g.down / g.all >= 0.5, xy: at(g.a.p) }))
        .sort((a, b) => b.bad - a.bad || b.down - a.down || b.down / b.all - a.down / a.all);
      const links = down.filter((z) => z.box).map((z) => [at(z.p), at(z.box.p)]).filter(([a, b]) => inView(a, 40) || inView(b, 40));
      if (faultXY) used.push([faultXY[0] - 18, faultXY[1] - 18, faultXY[0] + 18, faultXY[1] + 18], [faultXY[0] - 75, faultXY[1] + 18, faultXY[0] + 75, faultXY[1] + 40]); // the ring and its tag
      for (const z of probs) { if (labels.length >= 14) break;
        const [x, y] = at(z.p); if (!inView([x, y])) continue;
        const text = `${shortName(z.c)} · ${detail(z)}`, tw = text.length * 6.3 + 12, th = 18;
        const r = [[x + 9, y - th / 2], [x - 9 - tw, y - th / 2], [x - tw / 2, y - 12 - th], [x - tw / 2, y + 12]].map(([a, b]) => [a, b, a + tw, b + th]).find(free);
        if (r) { used.push(r); labels.push({ x: r[0], y: r[1], w: tw, text, k: z.k, c: z.c }); }
      }
      // villages (where 3+ of the map's customers live), named at their middle with the field team that covers them
      const vg = new Map();
      for (const z of pts) { if (!z.c.desa) continue; const d = titleCase(z.c.desa.trim()); let v = vg.get(d); if (!v) vg.set(d, (v = { n: 0, la: 0, lo: 0 })); v.n++; v.la += z.p.lat; v.lo += z.p.lng; }
      const vlabels = [];
      for (const [d, v] of [...vg].sort((a, b) => b[1].n - a[1].n)) { if (v.n < 3 || vlabels.length >= 12) continue;
        const [x, y] = at({ lat: v.la / v.n, lng: v.lo / v.n }); if (!inView([x, y])) continue;
        const tl = teamsFor(d), team = (tl.find((t) => teamKind(t.name) === "field") || tl[0])?.name || "";
        const tw = Math.max(d.length * 6.6, team.length * 5.4) + 8, hh = team ? 13 : 7; // at the middle, else nudged until it's clear
        const spot = [[0, 0], [0, -28], [0, 28], [-tw * 0.7, 0], [tw * 0.7, 0], [-tw * 0.6, -26], [tw * 0.6, 26], [tw * 0.6, -26], [-tw * 0.6, 26]]
          .map(([dx, dy]) => [x + dx, y + dy]).find(([a, b]) => free([a - tw / 2, b - 13, a + tw / 2, b + hh]));
        if (!spot) continue; used.push([spot[0] - tw / 2, spot[1] - 13, spot[0] + tw / 2, spot[1] + hh]); vlabels.push({ x: spot[0], y: spot[1], d, team }); }
      // the counts last (names and villages first), only on boxes with 2+ down: a lone "1/1" is just the line
      const badges = [];
      for (const g of fats) { if (badges.length >= 15 || g.down < 2 || !inView(g.xy)) continue; const text = `${g.down}/${g.all}`, tw = text.length * 6 + 10, r = [g.xy[0] + 6, g.xy[1] - 20, g.xy[0] + 6 + tw, g.xy[1] - 4];
        if (!free(r) && !g.bad) continue; used.push(r); badges.push({ x: r[0], y: r[1], w: tw, text, bad: g.bad, code: g.a.code }); }
      const shown = assets.length <= 30; // codes only when they fit; the squares always
      const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].filter((m) => m / mpp <= 110).pop() || 10;
      const legend = ["los", "pwr", "off", "weak", "iso", "on"].filter((k) => sev.n[k]).map((k) => [k, KIND[k][0]]);
      if (assets.length) legend.push(["box", "FAT / ODP"]);
      if (fault) legend.push(["fault", "Cek di sini"]);
      if (links.length) legend.push(["link", "Garis ke FAT/ODP terdekat · mati/semua"]);
      if (pts.some((z) => z.t && Date.now() - z.t < FRESH)) legend.push(["fresh", "Baru mati (< 30 mnt)"]);
      if (pts.some((z) => z.u)) legend.push(["unst", "Tidak stabil (4+ sambung ulang/24 jam)"]);
      const dots = pts.map((z) => ({ ...z, xy: at(z.p) })).filter((z) => inView(z.xy, 8)).sort((a, b) => RANK[a.k] - RANK[b.k]);
      return { w, h, dots, sev, title, counts, sub, villages, probs, labels, rings, me, assets, shown, fault, faultXY, legend, scale: { px: nice / mpp, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` }, about, noNet: netList && !netList.length, fats, links, badges, vlabels };
    }
    // below the dots: the network boxes and the suspected one; above them: names, strip, legend, scale
    function briefUnder(s) {
      const out = [], NS = "http://www.w3.org/2000/svg";
      for (const v of s.vlabels) { const d = el("span", "vlbl", v.d); d.style.left = `${v.x}px`; d.style.top = `${v.y}px`; if (v.team) d.append(el("small", null, v.team)); out.push(d); }
      if (s.links.length) { const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "links"); svg.setAttribute("width", s.w); svg.setAttribute("height", s.h);
        for (const [[x1, y1], [x2, y2]] of s.links) { const l = document.createElementNS(NS, "line"); l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2); svg.append(l); }
        out.push(svg); }
      for (const a of s.assets) { const d = el("span", `asset ${a.type.toLowerCase()}`); d.style.left = `${a.xy[0]}px`; d.style.top = `${a.xy[1]}px`; d.title = a.code;
        if (s.shown && a.code !== s.fault?.code) d.append(el("i", null, a.code)); out.push(d); }
      if (s.faultXY) { const f = el("span", "fault"); f.style.left = `${s.faultXY[0]}px`; f.style.top = `${s.faultXY[1]}px`; f.append(el("i", null, `Cek di sini · ${s.fault.code}`)); out.push(f); }
      return out;
    }
    function briefOver(s) {
      const out = [];
      for (const b of s.badges) { const d = el("span", `fcnt${b.bad ? " bad" : ""}`, b.text); d.style.left = `${b.x}px`; d.style.top = `${b.y}px`; d.title = `${b.code}: ${b.text} pelanggan mati`; out.push(d); }
      for (const [x, y, R, t] of s.rings) { const l = el("span", "ringlbl", t); l.style.left = `${x}px`; l.style.top = `${y - R}px`; out.push(l); }
      if (s.me) { const l = el("span", "melbl", s.me[2]); l.style.left = `${s.me[0]}px`; l.style.top = `${s.me[1]}px`; out.push(l); }
      for (const l of s.labels) { const d = el("span", `plbl ${l.k}`, l.text); d.style.left = `${l.x}px`; d.style.top = `${l.y}px`; out.push(d); }
      const strip = el("div", "brief"), lv = LEVEL[s.sev.lv], badge = el("b", `lv ${s.sev.lv}`, lv[0]);
      const t = el("div", "bt"); t.append(badge, el("span", null, s.title)); strip.append(t, el("div", "bs", s.sub));
      if (s.fault) strip.append(el("div", "bf", `Cek di sini: ${s.fault.code} (rata-rata ${s.fault.avg} m dari yang mati)`));
      out.push(strip);
      const leg = el("div", "legend"); for (const [k, label] of s.legend) { const i = el("span"); i.append(el("i", `k ${k}`), label); leg.append(i); }
      if (s.about.replay) strip.classList.add("replaying");
      const sc = el("div", "scale"), north = el("span", "north", "U"); north.title = "Utara: atas peta selalu utara"; north.setAttribute("aria-label", "North is up");
      sc.append(el("i"), s.scale.label, north); sc.firstChild.style.width = `${Math.round(s.scale.px)}px`;
      const foot = el("div", "foot"); foot.append(sc, leg); out.push(foot);
      return out;
    }
    // The note that goes with the picture: severity, where to look, and the problem customers with phone and location.
    function briefText(s) {
      const link = (p) => `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
      const lines = [`*GANGGUAN ${LEVEL[s.sev.lv][0]}* · ${s.title}`, s.about.what || "", s.counts];
      if (s.villages.length) lines.push(`Desa: ${s.villages.slice(0, 6).map(([d, n]) => { const tl = teamsFor(d), t = (tl.find((x) => teamKind(x.name) === "field") || tl[0])?.name; return `${d} (${n}${t ? `, ${t}` : ""})`; }).join(", ")}`);
      if (s.fats.length) lines.push(`Per FAT/ODP terdekat: ${s.fats.slice(0, 6).map((g) => `${g.a.code} ${g.down}/${g.all} mati`).join(", ")}`);
      if (s.fault) lines.push(`Cek di sini: ${s.fault.code} (perkiraan) ${link(s.fault.p)}`);
      for (const k of ["los", "pwr", "off", "weak"]) {
        const l = s.probs.filter((z) => z.k === k); if (!l.length) continue;
        lines.push("", `${KIND[k][0]} (${l.length}):`);
        l.slice(0, 20).forEach((z, i) => lines.push(`${i + 1}. ${z.c.nama || z.c.username} (${z.c.username})${k === "weak" ? ` · ${detail(z)}` : z.t ? ` · mati ${lama(Date.now() - z.t)}` : ""}${z.c.phone ? ` · ${z.c.phone}` : ""} · ${link(z.p)}`));
        if (l.length > 20) lines.push(`… dan ${l.length - 20} lagi`);
      }
      lines.push("", `Dibuat ${wib()} WIB`);
      return lines.filter((x, i, a) => x !== "" || (i > 0 && a[i - 1] !== "")).join("\n");
    }
    // The picture: the map's own tiles (those that allow it; Google's satellite doesn't, so that one shares on plain
    // dark) with the brief drawn on top, at twice the size for a phone screen.
    async function briefPng(box) {
      const s = box.scene, w = s.w, h = s.h, k = 2, cv = el("canvas"); cv.width = w * k; cv.height = h * k;
      const g = cv.getContext("2d"); g.scale(k, k); g.fillStyle = "#0f1214"; g.fillRect(0, 0, w, h);
      const imgs = [...box.querySelectorAll(".tiles:not(.ghost) img")]; // not the old view on its way out
      g.filter = imgs[0] ? getComputedStyle(imgs[0]).filter : "none";
      await Promise.all(imgs.map((im) => new Promise((ok) => { const i = new Image(); i.crossOrigin = "anonymous";
        i.onload = () => { try { g.drawImage(i, parseFloat(im.style.left), parseFloat(im.style.top), 256, 256); } catch {} ok(); }; i.onerror = () => ok(); i.src = im.src; })));
      g.filter = "none";
      const font = (wt, px) => { g.font = `${wt} ${px}px Inter, ui-sans-serif, system-ui, sans-serif`; };
      const pill = (x, y, ww, hh, r, fill) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); g.fillStyle = fill; g.fill(); };
      const dot = (x, y, kind, r = 6) => paintDot(g, x, y, kind, r);
      for (const [x, y, R] of s.rings) { g.beginPath(); g.arc(x, y, R, 0, 7); g.lineWidth = 1.5; g.strokeStyle = "rgba(233,225,220,.6)"; g.stroke(); }
      g.shadowColor = "#000"; g.shadowBlur = 3; g.textAlign = "center";
      for (const v of s.vlabels) { font(600, 10); g.fillStyle = "rgba(233,225,220,.7)"; g.fillText(v.d.toUpperCase(), v.x, v.y + (v.team ? -1 : 3)); if (v.team) { font(500, 9); g.fillStyle = "rgba(170,200,255,.85)"; g.fillText(v.team, v.x, v.y + 10); } }
      g.shadowBlur = 0; g.textAlign = "start";
      g.beginPath(); for (const [[x1, y1], [x2, y2]] of s.links) { g.moveTo(x1, y1); g.lineTo(x2, y2); } g.lineWidth = 1; g.strokeStyle = "rgba(239,239,237,.45)"; g.stroke();
      for (const a of s.assets) { g.fillStyle = "#3e7edf"; g.strokeStyle = "#07090b"; g.lineWidth = 1.5; g.fillRect(a.xy[0] - 4, a.xy[1] - 4, 8, 8); g.strokeRect(a.xy[0] - 4, a.xy[1] - 4, 8, 8);
        if (s.shown && a.code !== s.fault?.code) { font(500, 10); g.fillStyle = "rgba(170,200,255,.95)"; g.fillText(a.code, a.xy[0] + 7, a.xy[1] + 3); } }
      if (s.faultXY) { const [x, y] = s.faultXY; g.beginPath(); g.arc(x, y, 16, 0, 7); g.setLineDash([4, 3]); g.lineWidth = 2.5; g.strokeStyle = "#f12614"; g.stroke(); g.setLineDash([]);
        font(600, 11); const t = `Cek di sini · ${s.fault.code}`, tw = g.measureText(t).width + 12; pill(x - tw / 2, y + 20, tw, 18, 4, "#f12614"); g.fillStyle = "#fff"; g.fillText(t, x - tw / 2 + 6, y + 33); }
      const unst = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.setLineDash([3, 2]); g.lineWidth = 2; g.strokeStyle = "#e0b252"; g.stroke(); g.setLineDash([]); };
      for (const z of s.dots) if (!z.me) { dot(z.xy[0], z.xy[1], z.k, RANK[z.k] > 1 ? 6.5 : 5); if (z.u) unst(z.xy[0], z.xy[1], 9.5);
        if (z.t && Date.now() - z.t < FRESH) { g.beginPath(); g.arc(z.xy[0], z.xy[1], 11, 0, 7); g.lineWidth = 1.5; g.strokeStyle = "rgba(239,239,237,.7)"; g.stroke(); } }
      for (const b of s.badges) { font(700, 10); pill(b.x, b.y, b.w, 16, 3, b.bad ? "#f12614" : "rgba(9,11,12,.92)"); g.fillStyle = b.bad ? "#fff" : "#efefed"; g.fillText(b.text, b.x + 5, b.y + 12); }
      if (s.me) { const [x, y, name] = s.me; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fillStyle = "#e9e1dc"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#07090b"; g.stroke();
        font(600, 12); const tw = g.measureText(name).width + 12; pill(x - tw / 2, y + 12, tw, 20, 4, "rgba(233,225,220,.95)"); g.fillStyle = "#07090b"; g.fillText(name, x - tw / 2 + 6, y + 26); }
      for (const [x, y, R, t] of s.rings) { font(500, 10); const tw = g.measureText(t).width + 8; pill(x - tw / 2, y - R - 8, tw, 16, 3, "rgba(9,11,12,.85)"); g.fillStyle = "#e9e1dc"; g.fillText(t, x - tw / 2 + 4, y - R + 4); }
      for (const l of s.labels) { font(500, 11); pill(l.x, l.y, l.w, 18, 4, "rgba(9,11,12,.9)"); g.fillStyle = KIND[l.k][1]; g.fillRect(l.x, l.y + 3, 2.5, 12); g.fillStyle = "#efefed"; g.fillText(l.text, l.x + 7, l.y + 13); }
      // strip
      pill(8, 8, w - 16, s.fault ? 62 : 46, 6, "rgba(9,11,12,.92)");
      const lv = LEVEL[s.sev.lv]; font(700, 11); const bw = g.measureText(lv[0]).width + 12; pill(16, 15, bw, 18, 3, lv[1]); g.fillStyle = s.sev.lv === "high" ? "#fff" : "#07090b"; g.fillText(lv[0], 22, 28);
      font(600, 13); g.fillStyle = "#efefed"; g.fillText(s.title, 16 + bw + 8, 28, w - bw - 48);
      font(400, 11); g.fillStyle = "#b3b0af"; g.fillText(s.sub, 16, 46, w - 32);
      if (s.fault) { font(500, 11); g.fillStyle = "#ff8a7a"; g.fillText(`Cek di sini: ${s.fault.code} (rata-rata ${s.fault.avg} m dari yang mati)`, 16, 62, w - 32); }
      // legend and scale
      font(500, 11); const items = [], lines = [[]]; let x = 0;
      for (const [k, l] of s.legend) { const iw = g.measureText(l).width + 13; if (x && x + iw > w - 40) { lines.push([]); x = 0; } lines.at(-1).push([k, l, x]); x += iw + 10; }
      const fh = 30 + lines.length * 16; pill(8, h - fh - 6, w - 16, fh, 6, "rgba(9,11,12,.88)");
      const sy = h - fh + 12; g.fillStyle = "#e9e1dc"; g.fillRect(16, sy, s.scale.px, 1.5); g.fillRect(16, sy - 5, 1.5, 6); g.fillRect(16 + s.scale.px - 1.5, sy - 5, 1.5, 6); g.fillText(s.scale.label, 22 + s.scale.px, sy + 4);
      // north arrow at the scale's right end (U = utara)
      const nx = w - 24; g.beginPath(); g.moveTo(nx, sy - 12); g.lineTo(nx - 5, sy - 4); g.lineTo(nx + 5, sy - 4); g.closePath(); g.fill();
      font(700, 10); g.textAlign = "center"; g.fillText("U", nx, sy + 7); g.textAlign = "start"; font(500, 11);
      lines.forEach((row, i) => { const ly = sy + 22 + i * 16; for (const [k, l, lx] of row) { const x0 = 16 + lx;
        if (k === "box") { g.fillStyle = "#3e7edf"; g.fillRect(x0, ly - 8, 8, 8); }
        else if (k === "fault") { g.beginPath(); g.arc(x0 + 4, ly - 4, 5, 0, 7); g.setLineDash([2, 2]); g.lineWidth = 1.5; g.strokeStyle = "#f12614"; g.stroke(); g.setLineDash([]); }
        else if (k === "link") { g.fillStyle = "rgba(239,239,237,.6)"; g.fillRect(x0 - 1, ly - 4.5, 10, 1); }
        else if (k === "unst") { dot(x0 + 4, ly - 4, "on", 3); unst(x0 + 4, ly - 4, 5.5); }
        else if (k === "fresh") { dot(x0 + 4, ly - 4, "off", 3); g.beginPath(); g.arc(x0 + 4, ly - 4, 5.5, 0, 7); g.lineWidth = 1; g.strokeStyle = "rgba(239,239,237,.7)"; g.stroke(); }
        else dot(x0 + 4, ly - 4, k, 4);
        g.fillStyle = "#e9e1dc"; g.fillText(l, x0 + 13, ly); } });
      return cv;
    }
    // each online modem's redaman by its dot: the dB button shows them all (kept in this browser); redaman tinggi (below
    // −28 dBm) shows either way, unless its name label already says it. Past 600 in view only those, until you zoom in.
    const RXON = "erpDock.mapRx";
    function rxTags(list, named = new Set()) { // [customer, x, y] on the map
      const all = !!ls.get(RXON, false), out = []; let n = 0;
      for (const [c, x, y] of list) { const o = modemOf(c).ont; if (!o || !usable(o)) continue; const crit = o.rx < -28;
        if (crit ? named.has(c) : !all || n++ >= 600) continue;
        const t = el("span", `mrx ${sigLevel(o.rx)}`, o.rx.toFixed(1).replace(".", ",")); t.style.left = `${x}px`; t.style.top = `${y}px`; out.push(t); }
      return out;
    }
    function rxButton(box) {
      const on = !!ls.get(RXON, false), b = el("button", `bm${on ? " on" : ""}`, "dB"); b.type = "button"; b.setAttribute("aria-pressed", String(on));
      b.title = on ? "Hide the redaman (redaman tinggi stays)" : "Show every modem's redaman"; b.setAttribute("aria-label", "Redaman on the map");
      b.onclick = () => { ls.set(RXON, !on); box.redraw(); }; return b;
    }
    function baseButton(box, kind) {
      const b = el("button", "bm", kind === "sat" ? "Map" : "Sat"); b.type = "button"; b.title = kind === "sat" ? "Street map" : "Satellite";
      b.onclick = () => { ls.set(BASEMAP, kind === "sat" ? "dark" : "sat"); box.redraw(); }; return b;
    }
    // Maintenance SPKs from the map: with SPK on, every box with customers down gets a + to pick it, and each picked box
    // becomes one Maintenance Jaringan Umum SPK for the chosen team, at the box's place (the form's own manual SPK with a
    // location), titled for the technician: "Perbaikan FAT X · 5/8 pelanggan mati". Saved as Bulk SPK saves them.
    function spkButton(box) {
      const on = !!box.spk, b = el("button", `bm${on ? " on" : ""}`, "SPK"); b.type = "button"; b.setAttribute("aria-pressed", String(on));
      b.title = on ? "Stop making SPKs" : "Make Maintenance SPKs: pick the boxes with customers down"; b.setAttribute("aria-label", "Make SPKs from the map");
      b.onclick = () => { box.spk = on ? null : { picked: new Map(), team: "", date: todayIso(), armed: 0, msg: "" }; box.redraw(); }; return b;
    }
    let spkTeams = null; // Planning's own team list, read once
    const boxDesa = (g) => g.a.desa || [...(g.desa || [])].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const spkTitle = (g) => `Perbaikan ${g.a.code} · ${g.down}/${g.all} pelanggan mati`;
    function spkLayer(box, s) {
      const st = box.spk; if (!st) return [];
      const out = [];
      for (const g of s.fats) {
        const k = g.a.code, on = st.picked.has(k), b = el("button", `spkpick${on ? " on" : ""}`, on ? "✓" : "+"); b.type = "button";
        b.style.left = `${g.xy[0]}px`; b.style.top = `${g.xy[1]}px`; b.title = `${k}: ${g.down}/${g.all} pelanggan mati`; b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", `SPK for ${k}`);
        b.onclick = (e) => { e.stopPropagation(); if (on) st.picked.delete(k); else st.picked.set(k, g); st.armed = 0; st.msg = ""; box.redraw(); };
        out.push(b);
      }
      out.push(spkSheet(box));
      return out;
    }
    function spkSheet(box) {
      const st = box.spk, list = [...st.picked.values()], sheet = el("div", "spksheet");
      sheet.addEventListener("pointerdown", (e) => e.stopPropagation());
      const btn = (t, fn, cls = "copy") => { const b = el("button", cls, t); b.type = "button"; b.onclick = fn; return b; };
      sheet.append(el("b", null, list.length ? `${list.length} SPK${list.length > 1 ? "s" : ""}, Maintenance Jaringan Umum` : "SPK: click + on the boxes to send a technician to"));
      for (const g of list) sheet.append(el("span", "sub", spkTitle(g)));
      if (st.msg) sheet.append(el("span", st.ok ? "good" : "late", st.msg));
      const row = el("span", "acts");
      if (list.length && !st.ok) {
        const sel = el("select"); sel.setAttribute("aria-label", "Team");
        if (!spkTeams) { sel.append(new Option("Loading teams…", "")); spkTeams = spkLists().catch((e) => ({ err: e.message })); spkTeams.then(() => box.isConnected && box.redraw()); }
        else spkTeams.then((L) => {
          if (L.err) { sel.append(new Option(`No teams: ${L.err}`, "")); return; }
          // the field team that covers the first box's village, until one is picked
          if (!st.team) { const vil = fold(boxDesa(list[0])), want = vil && teamsFor(vil).filter((t) => teamKind(t.name) === "field").map((t) => fold(t.name));
            st.team = L.teams.find((t) => want?.includes(fold(t.namaTim || "")))?.id || ""; }
          sel.append(new Option("Team…", ""));
          for (const t of L.teams) sel.append(new Option(t.namaTim || t.id, t.id, false, t.id === st.team));
        });
        sel.onchange = () => { st.team = sel.value; st.armed = 0; };
        const date = el("input"); date.type = "date"; date.value = st.date; date.onchange = () => { st.date = date.value; st.armed = 0; };
        const go = btn(st.armed > Date.now() ? `Press again: make ${list.length}` : `Make ${list.length} SPK${list.length > 1 ? "s" : ""}`, () => {
          if (!st.team) { st.msg = "Pick the team first."; return box.redraw(); }
          if (!(st.armed > Date.now())) { st.armed = Date.now() + 5000; box.redraw(); setTimeout(() => box.isConnected && box.redraw(), 5100); return; }
          spkMake(box, list);
        }, "copy primary");
        row.append(sel, date, go);
      }
      row.append(btn(st.ok ? "Done" : "Cancel", () => { box.spk = null; box.redraw(); }));
      sheet.append(row);
      return sheet;
    }
    // all the picked boxes in one save (all made, or none), then Daftar SPK's copy refreshed, as Bulk SPK does
    async function spkMake(box, list) {
      const st = box.spk; st.armed = 0; st.msg = "Making the SPKs…"; box.redraw();
      try {
        const L = await spkTeams, db = L.db, team = L.teams.find((t) => t.id === st.team);
        const [y, m, d] = st.date.split("-").map(Number), day = new Date(y, m - 1, d), now = new Date(), when = day.toDateString() === now.toDateString() ? now : day;
        const writes = list.map((g) => {
          const id = Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[n % 62]).join("");
          return { update: { name: `${db}/documents/workOrders/${id}`, fields: {
              name: S(spkTitle(g)), status: S("Baru"), workOrderType: S("Maintenance Jaringan Umum"), scheduledDate: { timestampValue: when.toISOString() },
              assignedTeamId: S(st.team), assignmentType: S("team"), assignedEmployeeIds: { arrayValue: {} }, assignedEmployeeNames: { arrayValue: {} },
              tasks: { arrayValue: {} }, installationTasks: { arrayValue: {} }, progress: { mapValue: { fields: { total: I(1), completed: I(0) } } },
              target: { mapValue: { fields: { type: S("manual"), lat: D(g.a.p.lat), lng: D(g.a.p.lng) } } }, projectId: { nullValue: null }, bukanProyek: B(true),
              ...(team && !(team.anggotaIds || []).length ? { teamEmptyAtCreate: B(true) } : {}) } },
            updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }, { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
            currentDocument: { exists: false } };
        });
        await fsCall(`${db}/documents:commit`, { writes });
        const auth = await fsToken(), res = await realFetch("/api/spk/mirror", { method: "POST", headers: auth ? { authorization: auth } : {} }).catch(() => null);
        st.ok = true; st.msg = `${list.length} SPK${list.length > 1 ? "s" : ""} made for ${team?.namaTim || "the team"}${res?.ok ? "" : ", not in Daftar SPK yet (opening Technical → Misi adds them)"}.`; st.picked.clear();
      } catch (e) { st.msg = `Not made: ${e.message}`; }
      box.redraw();
    }
    function shareButton(box) {
      const b = el("button", null, "⇪"); b.type = "button"; b.title = "Share with a technician: copies a picture of this map, then the note"; b.setAttribute("aria-label", "Share with a technician");
      b.onclick = () => {
        const png = briefPng(box).then((cv) => new Promise((ok) => cv.toBlob(ok, "image/png")));
        const sheet = el("div", "sharesheet"), msg = el("span", null, "Making the picture…"), acts = el("span");
        const done = el("button", "copy", "Close"); done.type = "button"; done.onclick = () => sheet.remove();
        const note = el("button", "copy", "Copy note"); note.type = "button"; note.onclick = () => copy(briefText(box.scene), note);
        const save = el("button", "copy", "Save PNG"); save.type = "button";
        save.onclick = () => png.then((bl) => { const a = el("a"); a.href = URL.createObjectURL(bl); a.download = `gangguan-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
        acts.append(note, save, done); sheet.append(msg, acts); box.querySelector(".sharesheet")?.remove(); box.append(sheet);
        sheet.addEventListener("pointerdown", (e) => e.stopPropagation());
        (navigator.clipboard?.write ? navigator.clipboard.write([new ClipboardItem({ "image/png": png })]) : Promise.reject())
          .then(() => { msg.textContent = "Picture copied: paste it into the chat, then the note."; })
          .catch(() => { msg.textContent = "Couldn't copy the picture here: save it instead."; });
      };
      return b;
    }
    // the customers on the same OLT PON port: when many of them are down together it's the line (PON, splitter, ODP),
    // not one house. Statuses come from the OLTs' cached ONT lists (kept 2 hours).
    // F over the map (or its ⤢ button) fills the window with it, F or Esc puts it back; the tiles are drawn again
    // for the new size. A window-filling layer rather than the browser's full screen, so it works in every browser.
    // (the map moves into a layer of its own on the page: inside the Dock, the Dock's animation would box it in)
    const fullMap = () => document.querySelector(".erp-dock-full .map");
    const dropFull = () => document.querySelector(".erp-dock-full")?.remove();
    function toggleFull(box) {
      if (!box) return;
      const layer = document.querySelector(".erp-dock-full");
      if (layer) { box.classList.remove("full"); box.fullHome?.replaceWith(box); layer.remove(); }
      else { const spot = el("span"); box.fullHome = spot; box.replaceWith(spot); const l = el("div", "erp-dock erp-dock-full"); box.classList.add("full"); l.append(box); document.body.append(l); }
      box.redraw?.();
    }
    // paste your CARTO key once; it stays in this browser's storage and goes only to CARTO's tile server
    function cartoKeyRow(redraw) {
      const row = el("div", "keyrow"), key = ls.get(CARTO_KEY, "");
      if (key) { // CARTO or the darkened OSM map, without losing the key; Remove forgets it
        const seg = el("div", "seg"), off = ls.get(CARTO_OFF, false);
        for (const [label, v] of [["CARTO", false], ["OSM", true]]) { const b = el("button", null, label); b.type = "button"; b.setAttribute("aria-pressed", String(off === v));
          b.onclick = () => { ls.set(CARTO_OFF, v); ls.set(BASEMAP, "dark"); redraw(); }; seg.append(b); }
        const rm = el("button", "copy", "Remove key"); rm.type = "button"; rm.onclick = () => { ls.set(CARTO_KEY, ""); ls.set(CARTO_OFF, false); redraw(); };
        row.append("Dark map", seg, rm); return row; }
      if (!view.keyOpen) { const b = el("button", "copy", "Use a CARTO key"); b.type = "button"; b.onclick = () => { view.keyOpen = true; redraw(); }; row.append(b); return row; }
      const inp = el("input", "field"); inp.type = "password"; inp.placeholder = "CARTO API key"; inp.autocomplete = "off"; inp.setAttribute("aria-label", "CARTO API key"); inp.dataset.k = "cartokey";
      const save = el("button", "btn", "Save"); save.type = "button";
      save.onclick = () => { const v = inp.value.trim(); if (!v) return; ls.set(CARTO_KEY, v); ls.set(CARTO_OFF, false); ls.set(BASEMAP, "dark"); view.keyOpen = false; redraw(); };
      inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); save.click(); } };
      row.append(inp, save); setTimeout(() => inp.focus(), 0); return row;
    }
    function ponLine(box, r, map) {
      if (!onts) { box.replaceChildren(el("p", "note ld", "Finding this customer's PON port on the OLTs… (the first time takes ~6 s)"));
        ontIndex().then(() => { if (box.isConnected) ponLine(box, r, map); }).catch(() => box.replaceChildren()); return; }
      const ont = modemOf(r).ont;
      if (!ont) { box.replaceChildren(el("p", "note", "This customer's modem isn't on any OLT's list, so there's no PON port to compare.")); return; }
      const same = onts.rows.filter((o) => o.pid === ont.pid && o.pon === ont.pon), off = same.filter((o) => o.st !== "online");
      const users = new Set(); for (const o of same) { const c = customerOf(o.sn, o, null); if (c) users.add(c.username); }
      map.ponSet = users; map.pon?.(users);
      const share = same.length ? off.length / same.length : 0, mine = ont.st !== "online";
      const verdict = off.length >= 3 && share >= 0.25 ? ["late", `${off.length} of ${same.length} down on this port together: most likely the line (PON, splitter or ODP), not one house.`]
        : mine && off.length <= 2 ? ["warn", "This modem is down but its PON is fine: most likely this house (power, modem, drop cable)."]
        : ["good", "This PON port looks normal."];
      const open = view.ponFor === r.username && view.ponOpen;
      const head = el("button", "item ponrow"); head.type = "button"; head.setAttribute("aria-expanded", String(!!open));
      head.append(el("span", `dot ${off.length >= 3 && share >= 0.25 ? "bad" : off.length ? "drop" : "on"}`), el("span", "t", `Same PON · ${ont.olt} · ${ont.pon}`),
        el("span", "r", `${off.length} / ${same.length} offline`), el("span", "s", `${same.length - off.length} online · ${users.size} matched to customers, outlined on the map · OLT list ${when(onts.at)}`));
      head.onclick = () => { view.ponFor = r.username; view.ponOpen = !open; ponLine(box, r, map); };
      const parts = [head, el("p", `note ${verdict[0]}`, verdict[1])];
      if (open) {
        if (!off.length) parts.push(el("p", "note", "Everyone on this port is online."));
        off.sort((a, b) => a.id - b.id).slice(0, 40).forEach((o, i) => {
          const c = customerOf(o.sn, o, null), b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
          b.append(el("span", `dot ${o.st === "offline" ? "off" : ""}`), el("span", "t", c?.nama || o.name || o.raw), el("span", "r", `ONU ${o.id}`),
            el("span", "s", [o.raw, o.st, o.seen ? `seen ${when(o.seen)}` : "", c ? c.username : "no customer linked"].filter(Boolean).join(" · ")));
          b.onclick = () => { if (c) { view.card = c; remember(c); } else view.modem = o.sn; view.sel = 0; draw(); };
          parts.push(b);
        });
      }
      box.replaceChildren(...parts);
    }

    // keys: Alt+K opens and closes; in the Dock, arrows move, Enter picks, Esc goes back or closes
    document.addEventListener("keydown", (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "k") { e.preventDefault(); panel ? close() : open(); return; }
      if (!panel || !panel.contains(document.activeElement) && document.activeElement !== document.body) return;
      // F over the map: full screen (the search box always has focus, so over the map F wins over typing)
      if ((e.key === "r" || e.key === "R") && view.card && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "")) { e.preventDefault(); remoteGo(view.card); return; }
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey && (panel.querySelector(".map:hover") || fullMap())
        && (document.activeElement === panel.querySelector(".top input") || !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? ""))) { e.preventDefault(); e.stopPropagation(); toggleFull(fullMap() || panel.querySelector(".map:hover")); return; }
      if (e.key === "Escape" && fullMap()) { e.preventDefault(); e.stopPropagation(); toggleFull(fullMap()); return; }
      // typing anywhere in the open Dock goes to its search box, no click needed
      if (view.mode !== "bulk" && /^\S$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "") && !document.activeElement?.isContentEditable) {
        if (view.card || view.mode || view.modem) { view.card = null; view.mode = null; view.modem = null; drawBody(); }
        panel.querySelector("input")?.focus(); return; // the key then lands in the box
      }
      if (e.key === "Escape") { e.preventDefault(); if (view.mode === "bulk" && bulk?.phase !== "paying") { view.mode = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.modem && !view.card) { view.modem = null; drawBody(); panel.querySelector("input")?.focus(); } else if ((view.mode === "signal" || view.mode === "pon" || view.mode === "health" || view.mode === "map" || view.mode === "incident" || view.mode === "journal") && !view.card) { if (view.pon) { view.pon = null; if (view.from) { view.mode = view.from; view.from = null; } } else view.mode = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.mode === "radar" && !view.card) { if (view.nas) view.nas = null; else view.mode = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.card) { view.card = null; drawBody(); panel.querySelector("input")?.focus(); } else { close(); fab?.focus(); } }
      else if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "") && document.activeElement !== panel.querySelector(".top input")) return; // a form field in the Dock keeps its keys
      else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) { e.preventDefault(); view.sel = (view.sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((x, i) => x.setAttribute("aria-selected", String(i === view.sel))); items[view.sel].scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter" && document.activeElement?.tagName === "INPUT" && items[view.sel]) { e.preventDefault(); items[view.sel].click(); }
    }, true);
    document.addEventListener("pointerdown", (e) => { if (panel && !panel.contains(e.target) && !fab.contains(e.target) && !e.target.closest?.(".erp-dock-full")) close(); }, true);
    addEventListener("resize", place);
    addEventListener("erp-fast-saved", () => { if (panel) data().then(drawBody); }); // a fresher list was just saved

    const tick = () => { if (!document.body) return; mount(); learn(); runPending(); place(); };
    for (const m of ["pushState", "replaceState"]) { const orig = history[m]; history[m] = function () { const r = orig.apply(this, arguments); setTimeout(tick, 300); setTimeout(runPending, 1200); return r; }; }
    addEventListener("popstate", () => setTimeout(tick, 300));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(tick, 600)); else setTimeout(tick, 600);
    // Opened from WhatsApp (erp-whatsapp.user.js, "Open in the Dock"): #dock=<username> opens that customer's card. The
    // address is cleaned at once, so a reload doesn't open it again; the same tab is reused for the next customer.
    async function fromHash() {
      const m = /^#dock=([^&]+)/.exec(location.hash); if (!m || !document.body) return;
      const u = decodeURIComponent(m[1]).toLowerCase();
      history.replaceState(history.state, "", location.pathname + location.search);
      await data(); const c = customers?.find((r) => String(r.username || "").toLowerCase() === u); if (!c) return;
      mount(); if (!panel) await open();
      view.card = c; view.sel = 0; view.mode = null; remember(c); draw();
    }
    setTimeout(fromHash, 1500); addEventListener("hashchange", fromHash);
    // Asked from WhatsApp (erp-whatsapp.user.js passes the request into this tab): check a line, load and pay bills, make
    // the login link, with the same code as the customer card. Each request has an id, and one already run is answered
    // from memory instead of run again, so a payment can't go twice.
    const waDone = new Map();
    const waReply = (id, res) => postMessage("erp-wa-res:" + JSON.stringify({ id, ...res }), location.origin);
    addEventListener("message", async (e) => {
      if (e.source !== window || e.origin !== location.origin || typeof e.data !== "string" || !e.data.startsWith("erp-wa:")) return;
      let q; try { q = JSON.parse(e.data.slice(7)); } catch { return; }
      if (!q?.id) return;
      if (waDone.has(q.id)) { const was = waDone.get(q.id); if (was !== "busy") waReply(q.id, was); return; }
      waDone.set(q.id, "busy");
      let res; try { res = { ok: true, data: await waOp(q.op, q.args || {}) }; } catch (err) { res = { ok: false, err: err?.message || String(err) }; }
      waDone.set(q.id, res); waReply(q.id, res);
    });
    const waBill = (row) => ({ state: row.state, err: row.err || "", paidTo: row.paidTo || "", invs: (row.invs || []).map((v) => ({ no: v.no, period: v.period, amount: v.amount, status: v.status,
      hutang: v.hutang, recharge: !!v.recharge, canRecharge: !!v.radius?.canRecharge, covered: !!v.radius?.alreadyCovered, expiry: v.radius?.expiryDate || "", result: v.result || null })) });
    async function waOp(op, a) {
      if (op === "ping") return { version: typeof GM_info !== "undefined" ? GM_info.script?.version : "" };
      if (op === "outages") { // the radar's alerts and the open PON incidents, as the Dock's home shows them
        if (!radar) await radarTick().catch(() => {});
        await incList();
        return { at: radar?.at || 0, off: radarOff || "", wide: !!radar?.wide,
          routers: (radar?.alerts || []).map((x) => ({ ip: x.ip, name: x.name, level: x.level, since: x.since, gap: x.gap, open: x.open, usual: x.usual })),
          pons: incOpen().filter((x) => x.kind === "pon").map((x) => ({ id: x.id, title: x.title, start: x.start, affected: x.affected, users: x.users.length, size: x.size || 0 })) };
      }
      if (op === "live") { // who of these is online now (RADIUS sessions under a minute old), and since when the others are down
        if (!live || Date.now() - live.at > 60000) { live = null; await liveSessions(); }
        drops = (await idbGet("drops")) || drops;
        const us = (a.usernames || []).slice(0, 500).map(lower), down = {};
        for (const x of us) { const g = drops?.off?.[x]; if (g && !live.by.has(x)) down[x] = g.from; }
        return { at: live.at, on: us.filter((x) => live.by.has(x)), down };
      }
      if (op === "outage") { // one outage's report for the technicians and the notice for customers, from who is offline now
        await data(); if (!customers) throw new Error("The ERP tab has no customer list yet");
        if (!techMap) await techIndex().catch(() => {});
        if (a.kind === "router") {
          if (!live || Date.now() - live.at > 60000) { live = null; await liveSessions(); }
          const { mine, off } = routerOff(a.ip, live), rx = radar?.list.find((x) => x.ip === a.ip);
          return { ...reportText({ title: x_name(a.ip), down: off.length, total: mine.length, since: rx?.level === "down" || rx?.level === "drop" ? rx.since : null, custs: off }), down: off.length, total: mine.length };
        }
        const inc = (await incList()).find((x) => x.id === a.id); if (!inc) throw new Error("This incident isn't open any more");
        drops = (await idbGet("drops")) || drops;
        const by = new Map(customers.map((c) => [lower(c.username), c])), custs = inc.users.map((x) => by.get(x)).filter(Boolean), down = custs.filter((c) => drops?.off[lower(c.username)]);
        return { ...reportText({ title: inc.title, down: down.length, total: inc.size || custs.length, since: inc.start, custs: down }), down: down.length, total: inc.size || custs.length };
      }
      await data(); const u = String(a.username || "").toLowerCase(), r = customers?.find((x) => String(x.username || "").toLowerCase() === u);
      if (!r) throw new Error("Not in the ERP tab's customer list");
      if (op === "check") { // fresh sessions, then the card's "Down?" evidence
        live = null; await liveSessions().catch(() => {});
        await Promise.all([onts ? 0 : ontIndex().catch(() => {}), acs ? 0 : acsIndex().catch(() => {})]);
        const d = await forensicLoad(r); hist.set(r.username, { at: Date.now(), d });
        const { facts, v, text, online } = forensicRead(r, d); return { facts, verdict: v, text, online };
      }
      if (op === "bills") {
        const row = { token: r.username, pick: r.username, state: "looking", invs: [] };
        await lookup(row); if (row.state === "found") await radius(row.invs);
        const role = myRole(); return { ...waBill(row), methods: METHODS, today: todayIso(), maySkip: !role || SKIP_ROLES.includes(role) };
      }
      if (op === "pay") { // the months asked for, checked against what the ERP says now, under the card's rules
        const row = { token: r.username, pick: r.username, state: "looking", invs: [] };
        await lookup(row); if (row.state !== "found") throw new Error(row.err || "No unpaid invoices found");
        const want = new Set(a.nos || []); for (const v of row.invs) v.on = want.has(v.no);
        const ch = row.invs.filter((v) => v.on);
        if (!ch.length || ch.length !== want.size) throw new Error("A month you ticked isn't unpaid any more: load the bills again");
        if (!METHODS.includes(a.method)) throw new Error("Unknown payment method");
        const top = row.invs.indexOf(ch[ch.length - 1]), skipped = row.invs.filter((v, j) => j < top && !v.on).length;
        if (skipped && !a.skipOlder) throw new Error("Older months are unpaid: tick them too, or skip older months with a note");
        if (skipped && myRole() && !SKIP_ROLES.includes(myRole())) throw new Error("Only a finance manager or admin can skip older months");
        if (skipped && String(a.note || "").trim().length < 10) throw new Error("Skipping older months needs a note of 10+ letters");
        if (ch.some((v) => a.recharge?.[v.no])) await radius(ch);
        for (const v of ch) v.recharge = !!a.recharge?.[v.no] && !!v.radius?.canRecharge;
        await payQueue(ch.map((v) => [row, v]), { method: a.method, date: a.date || todayIso(), note: String(a.note || ""), skipOlder: !!a.skipOlder }, () => {}, "Lunas (Dock · WhatsApp)");
        bills.delete(r.username); // the customer card asks the ERP again
        return waBill(row);
      }
      if (op === "extras") { // the card's technicians and modem: who covers the village, the ONT and its PON port
        await Promise.all([techMap ? 0 : techIndex().catch(() => {}), onts ? 0 : ontIndex().catch(() => {}), acs ? 0 : acsIndex().catch(() => {})]);
        const { teams, how } = techMap ? guessTeams(r) : { teams: [], how: "The technician map couldn't be read" };
        const { ont: o, dev } = modemOf(r), port = o && onts ? onts.rows.filter((x) => x.pid === o.pid && x.pon === o.pon) : [];
        return { how, teams: teams.map((t) => ({ name: t.name, kind: teamKind(t.name), members: t.members.map((m) => `${titleCase(m.n)}${m.lead ? " (lead)" : ""}`) })),
          modem: o ? { olt: o.olt, pon: o.pon, st: o.st || "", rx: o.rx ?? null, seen: o.seen || "", sn: o.sn || "" } : null, tr069: dev ? { inform: dev.inform || "", model: dev.model || dev.productClass || "" } : null,
          port: port.length ? { all: port.length, off: port.filter((x) => !/online|working/i.test(x.st || "")).length } : null };
      }
      if (op === "traffic") { // the card's Traffic: the rate now against the plan, this session, since the start
        const t = await trafficRead(r, false), say = trafficSay(t, r);
        return { ...say, plan: t.plan, down: t.rate?.down ?? null, watching: t.watching };
      }
      if (op === "path") return pathFor(r); // the card's Way up: the links from their OLT to the internet, where it's down or full
      if (op === "remote") { // the ERP's 5-minute port on the RO to the modem's own page (logged, as the card's Remote)
        const j = await api(`/api/noc/remote-onu?q=${encodeURIComponent(r.username)}`), c = (j.hasil || []).find((x) => lower(x.username) === u);
        if (!c) throw new Error("The ERP's Remote ONU doesn't know this username");
        const t = await api("/api/noc/remote-modem", { customerId: c.customerId });
        return { url: String(t.url || ""), secs: Number(t.kedaluwarsaDetik) || (Number(t.menit) > 0 ? Number(t.menit) : 5) * 60, ro: c.ro || "" };
      }
      if (op === "link") {
        if (!r.customerDocId) throw new Error("Needs the customer list refreshed (LDN → Pelanggan → Update)");
        const j = await api(`/api/admin/customers/${encodeURIComponent(r.customerDocId)}/resend-login-link`, {});
        return { waSent: !!j.waSent, waError: j.waError || "", link: j.magicLink || "", message: j.waMessageText || j.magicLink || "", phone: j.phone || r.phone };
      }
      throw new Error(`Unknown request: ${op}`);
    }
    setInterval(() => { if (document.visibilityState === "visible") { mount(); place(); learn(); } }, 5000);
    setTimeout(() => radarTick(), 8000); setInterval(() => radarTick(), 60000);
    setTimeout(() => dropTick(), 20000); setInterval(() => dropTick(), 60000);
  })();

