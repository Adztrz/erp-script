    // ---- Technicians by village: the ERP's own map (HRD → Pemetaan Wilayah Teknisi), kept 6 hours ----
    // A village usually has a field team, an area head (KA …) and a backbone team; the field team comes first.
    // Villages come two ways: a team's own list, and each technician's individual placement ("data individu", e.g.
    // TIM DONOROJO 1 has no team list; its two technicians cover Nglampeng and four more by placement). Both count.
    let techMap = null, techLoading = null;
    function techIndex() {
      if (techMap && Date.now() - techMap.at < 6 * 3600000) return Promise.resolve(techMap);
      return (techLoading ||= (async () => {
        let kept = await idbGet("tech2");
        if (!kept || Date.now() - kept.at > 6 * 3600000) {
          const j = await api("/api/hrd/technician-area-map");
          kept = { at: Date.now(), teams: (j.teams || []).filter((t) => t.jumlahAnggota > 0).map((t) => ({ name: t.namaTim, desa: t.assignedDesa || [],
            members: (t.anggota || []).map((a) => ({ n: a.nama, lead: !!a.isKetua || a.id === t.kepalaTeknisId })) })),
            techs: (j.teknisi || []).map((t) => ({ n: t.nama, team: t.timLabel || t.teams?.[0]?.namaTim || "Tanpa tim", lead: (t.teams || []).some((x) => /ketua|kepala/i.test(x.peran || "")),
              desa: (t.desaList || []).map((x) => x.label || x.desa) })) };
          idbPut("tech2", kept);
        }
        // village → its teams, each with the members who cover it
        const by = new Map(), add = (desa, team, member) => { const k = vkey(desa); let m = by.get(k); if (!m) by.set(k, (m = new Map()));
          let t = m.get(team); if (!t) m.set(team, (t = { name: team, members: [] })); if (member && !t.members.some((x) => x.n === member.n)) t.members.push(member); };
        for (const t of kept.teams) for (const d of t.desa) { add(d, t.name); for (const mb of t.members) add(d, t.name, mb); }
        for (const tc of kept.techs || []) for (const d of tc.desa) add(d, tc.team, { n: tc.n, lead: tc.lead });
        for (const [k, m] of by) by.set(k, [...m.values()]);
        const teams = new Map(); for (const l of by.values()) for (const t of l) teams.set(t.name, t);
        return (techMap = { at: kept.at, by, teams: [...teams.values()] });
      })().finally(() => { techLoading = null; }));
    }
    const teamKind = (n) => (/^KA\b/i.test(n) ? "area" : /BACKBONE/i.test(n) ? "backbone" : /\b(NOC|ADMIN|KANTOR|CS|GUDANG)\b/i.test(n) ? "office" : "field");
    const vkey = (d) => fold(d).replace(/ /g, ""); // "Jetiskidul" and "Jetis Kidul" are one village
    const byKind = (l) => { const order = { field: 0, area: 1, backbone: 2, office: 3 }; return [...l].sort((a, b) => order[teamKind(a.name)] - order[teamKind(b.name)]); };
    const teamsFor = (desa) => byKind(techMap?.by.get(vkey(desa)) || []);
    // the village on file, else the village most of the nearest customers are in, else the area head for the district
    function guessTeams(r) {
      if (r.desa && teamsFor(r.desa).length) return { teams: teamsFor(r.desa), how: "" };
      const lead = r.desa ? `No team covers ${titleCase(r.desa)}` : "No village on file";
      const near = where(r) && customers ? (nearby(r, 1500)?.list || []).slice(0, 25) : [];
      const votes = new Map(); for (const x of near) if (x.r.desa && teamsFor(x.r.desa).length) { const d = titleCase(x.r.desa.trim()); votes.set(d, (votes.get(d) || 0) + 1); }
      const best = [...votes].sort((a, b) => b[1] - a[1])[0];
      if (best) return { teams: teamsFor(best[0]), how: `${lead}: going by the nearest customers, ${best[1]} of ${near.length} of them in ${best[0]}.`, desa: best[0] };
      const dist = r.kecamatanErp || r.district || "", w = fold(dist).split(" ")[0];
      const ka = w ? (techMap?.teams || []).filter((t) => teamKind(t.name) === "area" && fold(t.name).split(" ").includes(w)) : [];
      if (ka.length) return { teams: ka, how: `${lead} and no location: the area head for ${titleCase(dist)}.`, desa: "" };
      // last: the customers on the same router, when most of them are in one village
      if (r.router && customers) {
        const same = customers.filter((c) => c.router === r.router && c.desa && teamsFor(c.desa).length), v = new Map();
        for (const c of same) { const d = titleCase(c.desa.trim()); v.set(d, (v.get(d) || 0) + 1); }
        const top = [...v].sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] >= 10 && top[1] / same.length >= 0.4) return { teams: teamsFor(top[0]), how: `${lead}, no location or district: going by ${r.router}, where ${Math.round((top[1] / same.length) * 100)}% of customers are in ${top[0]}. A guess: check the address.`, desa: top[0] };
      }
      return { teams: [], how: "" };
    }
    // a router's crew: the field teams and the KA covering most of its customers' villages (each at least a quarter of them)
    const crews = new Map();
    function crewOf(router) {
      if (!techMap || !customers || !router) return null;
      const memo = crews.get(router); if (memo && memo.at === techMap.at && memo.rows === customers) return memo.crew;
      const n = new Map(); let total = 0;
      for (const c of customers) { if (c.router !== router || c.isInactive || !c.desa) continue;
        const l = teamsFor(c.desa); if (l.length) total++;
        for (const t of l) { if (t.name === "Tanpa tim") continue; // individually placed: no team to name
          const e = n.get(t.name) || { t: { name: t.name, members: [] }, k: 0 }; e.k++; n.set(t.name, e);
          for (const m of t.members) if (!e.t.members.some((x) => x.n === m.n)) e.t.members.push(m); } }
      const top = (kind) => [...n.values()].filter((e) => teamKind(e.t.name) === kind && e.k >= total / 4).sort((a, b) => b.k - a.k).map((e) => e.t);
      const crew = total ? { field: top("field"), ka: top("area") } : null;
      crews.set(router, { at: techMap.at, rows: customers, crew }); return crew;
    }
    // "Tim Bandar 1 (Hendri), Tim Bandar 2 (Suparlin) · KA Nur Suhudi"
    function crewLine(crew) {
      if (!crew) return "";
      const f = crew.field.slice(0, 2).map((t) => titleCase(t.name)).join(", ") + (crew.field.length > 2 ? ` +${crew.field.length - 2}` : "");
      const ka = [...new Set(crew.ka.map((t) => `KA ${t.members.map((m) => titleCase(m.n)).join(" / ") || titleCase(t.name.replace(/^KA\s+/i, ""))}`))].slice(0, 2).join(", ");
      return [f, ka].filter(Boolean).join(" · ");
    }
    const titleCase = (x) => String(x).toLowerCase().replace(/(^|[\s(])[^\s(]/g, (c) => c.toUpperCase()); // "Tim Bandar 1 (Hendri)"
    function techBox(r) {
      const box = el("div", "techs rise"); box.style.setProperty("--i", "2");
      const fill = () => {
        const head = el("div", "eyebrow"); head.style.margin = "0 0 6px"; head.append("Technicians", el("b", null, r.desa ? ` · ${titleCase(r.desa)}` : ""));
        const { teams, how } = guessTeams(r);
        if (!teams.length) return box.replaceChildren(head, el("p", "note warn", r.desa ? `No team covers ${titleCase(r.desa)} yet, and nothing nearby to go by (HRD → Pemetaan Wilayah Teknisi).` : "No village or location on file, so no team can be matched."));
        const rows = teams.map((t) => { const row = el("div", "team"), kind = teamKind(t.name);
          const names = t.members.map((m) => (m.lead ? `${titleCase(m.n)} (lead)` : titleCase(m.n))).join(", ");
          row.append(el("span", `tag k-${kind}`, /* not "field": that is the input style */ { field: "Field", area: "Area head", backbone: "Backbone", office: "Office" }[kind]), el("b", null, t.name === "Tanpa tim" ? "Placed individually (no team)" : t.name), el("span", "sub", names || "no members"));
          return row; });
        box.replaceChildren(head, ...(how ? [el("p", "note warn", how)] : []), ...rows);
      };
      if (techMap) fill(); else { box.append(el("p", "note ld", "Finding this area's technicians…")); techIndex().then(fill).catch((e) => box.replaceChildren(el("p", "note late", `Technician map not read: ${e.message}`))); }
      return box;
    }

