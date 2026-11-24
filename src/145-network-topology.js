    // ---- Network topology: where an outage starts ----
    // The links between routers as the NOC's map draws them, kept in this browser only (Outage radar → Topology), one
    // line per router and what hangs below it: "RO UPSTREAM > RO A, RO B". A name alone on a line is a router with
    // nothing below it. With the map, routers that fall together are read as one fault: the highest one down and
    // everything behind it, rather than an alert each. A router the feed doesn't report (an aggregation router with no
    // customers of its own) still links what's below it; two or more of its branches failing at once points at it.
    const TOPO = "erpDock.topology", TOPO_ERP = "erpDock.topologyErp"; // pasted by hand; else the ERP's router map, as text (kept by the radar)
    const topoKey = (s) => String(s || "").toUpperCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/^RO /, "");
    let topoMemo = null;
    function topology() {
      const own = String(ls.get(TOPO, "") || ""), text = own || String(ls.get(TOPO_ERP)?.text || "");
      if (topoMemo?.text === text) return topoMemo;
      const up = new Map(), down = new Map(), names = new Map(), add = (s) => { const k = topoKey(s); if (k && !names.has(k)) names.set(k, s.trim().toUpperCase()); return k; };
      for (const line of text.split("\n")) {
        const [a, b] = line.split(">"), p = add(a || ""); if (!p || b == null) continue;
        for (const c of b.split(",")) { const k = add(c); if (!k || k === p) continue;
          (up.get(k) || up.set(k, []).get(k)).push(p); const d = down.get(p) || down.set(p, []).get(p); if (!d.includes(k)) d.push(k); }
      }
      return (topoMemo = { text, up, down, names, erp: !own && !!text });
    }
    // each node's reading in the feed: the same name, else the longest name it starts with (RO PUNUNG NEW is PUNUNG),
    // else the only node starting with the same word (RO PACITAN 2116 is PACITAN KOTA); of several feed routers on one node, the busiest (an old one sits at 0)
    function topoState(topo, list) {
      const first = new Map(); for (const k of topo.names.keys()) { const w = k.split(" ")[0]; first.set(w, first.has(w) ? null : k); }
      const at = new Map();
      const pre = (k) => [...topo.names.keys()].filter((t) => k.startsWith(`${t} `)).sort((a, b) => b.length - a.length)[0];
      for (const x of list) { const k = topoKey(x.name), node = topo.names.has(k) ? k : pre(k) || first.get(k.split(" ")[0]);
        if (node && (!at.has(node) || (x.usual ?? x.open) > (at.get(node).usual ?? at.get(node).open))) at.set(node, x); }
      return at;
    }
    const topoBad = (x) => !!x && (x.level === "down" || x.level === "nofeed" || x.level === "drop");
    // the faults: each failing router whose upstream is fine heads one, with everything failing behind it; a router the
    // feed doesn't see, or one that is fine, with two or more failing branches, heads the lot instead
    function topoFaults(radar) {
      const topo = topology(); if (!topo.names.size || !radar) return null;
      const at = topoState(topo, radar.list), bad = (k) => topoBad(at.get(k));
      // only a router that is down (or silent) explains what's behind it; one merely dropping doesn't take in a branch
      // that is down below it: that branch is its own fault (RO A −15% and RO B under it at 5%: start at B)
      const severe = (k) => ["down", "nofeed"].includes(at.get(k)?.level);
      const heads = [...topo.names.keys()].filter((k) => bad(k) && !(topo.up.get(k) || []).some(severe));
      const behind = (k, out = []) => { for (const c of topo.down.get(k) || []) { if (heads.includes(c)) continue; if (bad(c)) out.push(c); behind(c, out); } return out; };
      const faults = [], taken = new Set();
      // shared parents first, deepest first, so a split under a split names the nearer one
      const depth = (k, seen = new Set()) => { if (seen.has(k)) return 0; seen.add(k); return 1 + Math.max(0, ...(topo.up.get(k) || []).map((p) => depth(p, seen))); };
      const parents = [...new Set(heads.flatMap((k) => topo.up.get(k) || []))].sort((a, b) => depth(b) - depth(a));
      for (const p of parents) {
        const mine = heads.filter((k) => !taken.has(k) && (topo.up.get(k) || []).includes(p));
        if (mine.length < 2) continue;
        for (const k of mine) taken.add(k);
        faults.push({ at: p, x: at.get(p) || null, split: true, heads: mine, behind: mine.flatMap((k) => [k, ...behind(k)]) });
      }
      for (const k of heads) if (!taken.has(k)) faults.push({ at: k, x: at.get(k), split: false, heads: [k], behind: behind(k) });
      const under = (k, p) => (topo.up.get(k) || []).some((u) => u === p || under(u, p));
      for (const f of faults) f.apart = faults.filter((g) => g !== f && !f.split && under(g.at, f.at)).map((g) => g.at); // branches below with a card of their own
      for (const f of faults) f.lost = [...(f.x && topoBad(f.x) ? [f.x] : []), ...f.behind.map((k) => at.get(k)).filter(Boolean)].reduce((n, x) => n + Math.max(0, x.gap || 0), 0);
      return { topo, at, faults: faults.sort((a, b) => b.lost - a.lost) };
    }
    const topoName = (topo, k) => topo.names.get(k) || k;
    // the customers behind a point on the map: it and everything below it, each router's usual count (online on a normal
    // day) and how many are online now; an outage there reaches about that many
    function behindOf(t, k) {
      const all = [], walk = (x) => { if (all.includes(x)) return; all.push(x); for (const c of t.topo.down.get(x) || []) walk(c); }; walk(k);
      const rs = all.map((x) => t.at.get(x)).filter(Boolean);
      return rs.length ? { usual: rs.reduce((n, x) => n + (x.usual ?? x.open ?? 0), 0), now: rs.reduce((n, x) => n + (x.open || 0), 0), routers: rs.length } : null;
    }
    function reachText(x) {
      return !x ? "" : x.modems ? `${x.modems.toLocaleString("id-ID")} modems hang off it`
        : x.usual ? `about ${x.usual.toLocaleString("id-ID")} customers are usually online behind it${x.now < x.usual * 0.9 ? `, ${x.now.toLocaleString("id-ID")} now` : ""}` : "";
    }
    // one sentence per fault, for the radar and the copied report
    function faultText(t, f) {
      const n = (k) => topoName(t.topo, k), lv = (x) => (x ? { down: "down", nofeed: "no data", drop: "dropping" }[x.level] || "" : "");
      const list = f.behind.map((k) => `${n(k)} (${lv(t.at.get(k))})`);
      if (f.split) {
        const self = !f.x ? "reports no customers of its own" : topoBad(f.x) ? `is ${lv(f.x)} too` : "is fine";
        return { head: `Likely at ${n(f.at)}: ${f.heads.length} branches below it failing at once`,
          body: `${n(f.at)} ${self}. Behind it: ${list.join(", ")}. The fault is most likely ${f.x && !topoBad(f.x) ? `on ${n(f.at)}'s ports or links toward them` : `${n(f.at)} itself or its uplink`}.` };
      }
      const ups = (t.topo.up.get(f.at) || []).map(n).join(" / "), upBad = (t.topo.up.get(f.at) || []).filter((k) => topoBad(t.at.get(k)));
      const also = upBad.length ? ` ${upBad.map((k) => `${n(k)} upstream is ${lv(t.at.get(k))} too`).join("; ")}.` : "";
      return { head: `${n(f.at)} ${lv(f.x)}${f.behind.length ? ` and ${f.behind.length} behind it` : ""}`,
        body: (f.behind.length ? `Behind it: ${list.join(", ")}: those follow from ${n(f.at)}, so start there${ups ? ` (or its link from ${ups})` : ""}.`
          : `${f.apart.length ? `Apart from ${f.apart.map(n).join(", ")} (a card of its own), nothing below it is failing` : "Nothing below it on the map is failing"}${ups && !upBad.length ? `; ${ups} upstream is fine` : ""}: the fault is at ${n(f.at)}${ups ? `, its link from ${ups}` : ""} or on its own customers' side.`) + also };
    }
    // the map as an indented list with each router's state, from the top
    function topoTree(t, open) {
      const box = el("div", "topo"), seen = new Set();
      const tops = [...t.topo.names.keys()].filter((k) => !(t.topo.up.get(k) || []).length);
      const row = (k, d) => {
        if (seen.has(k)) return; seen.add(k);
        const x = t.at.get(k), b = el("button", "item trow"); b.type = "button"; b.style.paddingLeft = `${10 + d * 16}px`;
        const st = !x ? "" : x.level === "nofeed" ? "drop" : x.level === "learning" ? "" : x.level;
        b.append(el("span", `dot ${st}`), el("span", "t", topoName(t.topo, k)),
          el("span", "n", !x ? (/^OLT\b/.test(k) ? "OLT" : "no feed") : x.level === "nofeed" ? "no data" : `${x.open}${x.usual != null ? ` / ${x.usual}` : ""}`));
        if (x) b.onclick = () => open(x.ip); else b.disabled = true;
        box.append(b);
        for (const c of t.topo.down.get(k) || []) row(c, d + 1);
      };
      for (const k of tops) row(k, 0);
      return box;
    }
    // the editor: paste the map as text; shows which names found a router in the feed
    function topoEditor(done) {
      const box = el("div", "card topoedit"), ta = el("textarea", "field"); ta.value = topology().text; ta.rows = 14; ta.spellcheck = false;
      ta.placeholder = "RO UPSTREAM > RO A, RO B\nRO A > RO C, OLT D\nRO LONE";
      const said = el("p", "note");
      const check = () => { const keep = topoMemo, saved = ls.get(TOPO, ""); topoMemo = null; ls.set(TOPO, ta.value);
        const t = topology(), at = topoState(t, radar?.list || []); ls.set(TOPO, saved); topoMemo = keep;
        const miss = [...t.names.keys()].filter((k) => !at.has(k) && !/^OLT\b/.test(k));
        said.textContent = !t.names.size ? "One line per router: the router, then > and the routers and OLTs below it, separated by commas."
          : `${t.names.size} names, ${at.size} found in the router feed${miss.length ? `. Not in the feed (fine for an aggregation router with no customers): ${miss.map((k) => t.names.get(k)).join(", ")}` : ""}.`; };
      ta.oninput = check; check();
      const acts = el("div", "actions"), save = el("button", "btn primary", "Save"), cancel = el("button", "btn", "Cancel"); save.type = cancel.type = "button";
      save.onclick = () => { ls.set(TOPO, ta.value.trim()); topoMemo = null; done(); }; cancel.onclick = done;
      acts.append(save, cancel);
      const erp = ls.get(TOPO_ERP);
      box.append(el("div", "eyebrow", "Network topology"), el("p", "note", erp?.text ? `Empty: the ERP's router map is used (Network → Topology, read ${ago(erp.at)}). Text here replaces it, in this browser only. Each line: a router, then > and what's below it.` : "Kept in this browser only. Each line: a router, then > and what's below it."), ta, said, acts);
      return box;
    }
