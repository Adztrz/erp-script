    // ---- Outage → cause → dispatch ----
    // The customers down on a router, grouped by the PON port their modem is on, each port with what the OLT says (LOS =
    // a cut or bent fibre, dying gasp = no power), how much of the port is down, the FAT/ODP most likely at fault (from
    // Planning's asset list) and a verdict; then an SPK for the area's team in two presses (the same record as
    // Planning's manual form, Bukan proyek, saved with your own sign-in) and a ready message for the team.
    const DISPATCH_TYPES = ["Maintenance Jaringan Umum", "Perbaikan Kabel Backbone", "Survey Lokasi", "Lain-lain"];
    let fsTeams = null;
    function causeOf(g, portSize) {
      const n = g.custs.length, { los = 0, pwr = 0 } = g.n, share = portSize ? n / portSize : 0;
      if (!g.o) return { v: "Modem not found on any OLT", hint: "These customers' modems aren't in the OLT lists (Data health shows how old they are).", dispatch: false };
      if (pwr >= 2 && pwr >= n * 0.6) return { v: "Power cut", hint: `${pwr} modems sent a dying gasp: the electricity is off there. It usually comes back by itself.`, dispatch: false };
      if (los >= 3 && share >= 0.5) return { v: "Fibre cut on this port's line", hint: `${los} LOS, ${Math.round(share * 100)}% of the port down together: the cable before the FAT (feeder or distribution).`, dispatch: true, short: "putus jalur" };
      if (los >= 2) return { v: "Fibre problem near one FAT", hint: `${los} LOS on part of the port: a FAT, a splitter or the cable just before it.`, dispatch: true, short: "LOS di FAT" };
      if (los === 1 && n <= 2) return { v: "One drop cable", hint: "A single LOS: that customer's own cable or connector.", dispatch: false, short: "drop cable" };
      if (n >= 5 && share >= 0.3) return { v: "Many down, cause unknown", hint: `${Math.round(share * 100)}% of the port down without LOS or dying gasp: check the port, the ODC or the router.`, dispatch: true, short: "banyak offline" };
      return { v: "Scattered", hint: `${n} of ${portSize || "?"} on the port: most likely their own modems switched off, not the network.`, dispatch: false, short: "offline" };
    }
    function causeBox(off, ro) {
      const box = el("div", "near cause"), st = { open: null, team: "", type: DISPATCH_TYPES[0], title: "", armed: false, busy: false, done: {}, msg: "" };
      if (!onts) ontIndex().then(() => draw()).catch(() => {});
      if (!techMap) techIndex().then(() => draw()).catch(() => {});
      let groups = [];
      const group = () => { // again once the OLT lists are in
        const m = new Map();
        for (const c of off) { const o = modemOf(c).ont, key = o ? `${o.olt} · PON ${o.pon}` : "", g = m.get(key) || { key, o, custs: [], n: {} };
          const k = health(c, false); g.n[k] = (g.n[k] || 0) + 1; g.custs.push(c); m.set(key, g); }
        groups = [...m.values()].sort((a, b) => !a.key - !b.key || (b.n.los || 0) - (a.n.los || 0) || b.custs.length - a.custs.length);
      };
      const titleOf = (g, c) => `GANGGUAN ${ro} · ${g.key || "tanpa data OLT"} · ${c.short || "cek"}${g.fault ? ` · cek ${g.fault.code}` : ""}`.toUpperCase();
      const msgOf = (g, c, team) => {
        const vil = [...new Set(g.custs.map((x) => x.desa && titleCase(x.desa.trim())).filter(Boolean))].slice(0, 5);
        const at = g.fault?.p || g.mid;
        return [`*SPK GANGGUAN* · ${ro}`, `${g.custs.length} pelanggan mati di ${g.key || "router ini"}${g.n.los ? ` (${g.n.los} LOS` : ""}${g.n.pwr ? `${g.n.los ? ", " : " ("}${g.n.pwr} mati listrik` : ""}${g.n.los || g.n.pwr ? ")" : ""}`,
          `Dugaan: ${c.v.toLowerCase()}`, g.fault ? `Cek: ${g.fault.code} (rata-rata ${g.fault.avg} m dari yang mati)` : "", vil.length ? `Desa: ${vil.join(", ")}` : "",
          at ? `Lokasi: https://www.google.com/maps?q=${at.lat.toFixed(6)},${at.lng.toFixed(6)}` : "", team ? `Tim: ${team}` : "", `Dikirim ${wib()} WIB`].filter(Boolean).join("\n");
      };
      async function teamList() {
        if (fsTeams) return fsTeams;
        const db = fsDb(); if (!db) throw new Error("open Planning or Approvals once, so the Dock can reach the ERP's database");
        return (fsTeams = (await fsList(db, "technicianTeams")).sort((a, b) => String(a.namaTim || "").localeCompare(String(b.namaTim || ""), "id")));
      }
      async function create(g, c) {
        const db = fsDb(), t = fsTeams?.find((x) => x.id === st.team); if (!db || !t) return;
        st.busy = true; st.msg = ""; draw();
        const id = Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[n % 62]).join("");
        try {
          await fsCall(`${db}/documents:commit`, { writes: [{ update: { name: `${db}/documents/workOrders/${id}`, fields: {
            name: S(st.title.trim()), status: S("Baru"), workOrderType: S(st.type), scheduledDate: { timestampValue: new Date().toISOString() },
            assignedTeamId: S(t.id), assignmentType: S("team"), assignedEmployeeIds: { arrayValue: {} }, assignedEmployeeNames: { arrayValue: {} },
            tasks: { arrayValue: {} }, installationTasks: { arrayValue: {} }, progress: { mapValue: { fields: { total: I(1), completed: I(0) } } },
            target: { mapValue: { fields: { type: S("manual") } } }, projectId: { nullValue: null }, bukanProyek: B(true),
            ...((t.anggotaIds || []).length ? {} : { teamEmptyAtCreate: B(true) }) } },
            updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }, { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }], currentDocument: { exists: false } }] });
          st.done[g.key] = { id, team: t.namaTim };
          realFetch("/api/spk/mirror", { method: "POST", headers: { authorization: await fsToken() } }).catch(() => {}); // into Daftar SPK straight away
        } catch (err) { st.msg = `Not made: ${err.message}`; }
        st.busy = false; st.armed = false; draw();
      }
      function draw() {
        if (!groups.length || groups.n !== !!onts) { const keep = new Map(groups.map((g) => [g.key, g.fault])); group(); groups.n = !!onts; groups.forEach((g) => { if (keep.has(g.key)) g.fault = keep.get(g.key); }); }
        const e = el("div", "eyebrow"); e.style.margin = "0 0 8px"; e.append("Cause & dispatch", el("b", null, `${off.length} down`)); const out = [e];
        if (!onts) out.push(el("p", "note ld", "Reading the OLTs' modem lists to see why they're down…"));
        for (const g of groups.slice(0, 6)) {
          const port = g.o ? onts.rows.filter((x) => x.pid === g.o.pid && x.pon === g.o.pon) : [];
          const pts = g.custs.map((c) => ({ p: where(c) })).filter((z) => z.p);
          g.fault = g.fault === undefined ? suspect(pts) : g.fault;
          g.mid = pts.length ? { lat: pts.reduce((a, z) => a + z.p.lat, 0) / pts.length, lng: pts.reduce((a, z) => a + z.p.lng, 0) / pts.length } : null;
          const c = causeOf(g, port.length), row = el("div", "cz");
          const counts = ["los", "pwr", "off"].filter((k) => g.n[k]).map((k) => `${g.n[k]} ${KIND[k][0].toLowerCase()}`).join(" · ");
          row.append(el("div", "cv", c.v), el("div", "cs", [g.key || "No OLT data", `${g.custs.length}${port.length ? ` of ${port.length} on the port` : ""} down`, counts].filter(Boolean).join(" · ")), el("p", "note", c.hint));
          if (g.fault) { const f = el("p", "cf"); f.append(`Cek ${g.fault.code}`, el("span", null, ` · ${g.fault.avg} m on average from the dead ones · `));
            const a = el("a", null, "map ↗"); a.href = `https://www.google.com/maps?q=${g.fault.p.lat},${g.fault.p.lng}`; a.target = "_blank"; a.rel = "noreferrer"; f.append(a); row.append(f); }
          const done = st.done[g.key], acts = el("div", "actions");
          const btn = (label, fn, cls = "btn") => { const b = el("button", cls, label); b.type = "button"; b.onclick = () => fn(b); acts.append(b); return b; };
          if (done) {
            row.append(el("p", "note good", `SPK made for ${done.team}. It's in Daftar SPK; the team hears about it from you:`));
            const m = msgOf(g, c, done.team), pre = el("div", "pw msg"); pre.textContent = m; row.append(pre);
            const wa = el("a", "btn primary", "WhatsApp ↗"); wa.href = `https://wa.me/?text=${encodeURIComponent(m)}`; wa.target = "_blank"; wa.rel = "noreferrer noopener"; acts.append(wa);
            btn("Copy message", (b) => copy(m, b)); const o = el("a", "btn", "Daftar SPK"); o.href = "/work-orders"; acts.append(o);
          } else if (st.open === g.key) {
            const form = el("div", "dform");
            const sel = el("select"); sel.setAttribute("aria-label", "Team");
            const sug = [...new Set(g.custs.flatMap((x) => (x.desa ? teamsFor(x.desa) : [])).filter((t) => teamKind(t.name) === "field").map((t) => t.name))];
            const fill = () => { sel.replaceChildren(new Option(fsTeams ? "Choose a team…" : "Loading teams…", ""));
              const og = (label, list) => { if (!list.length) return; const o = document.createElement("optgroup"); o.label = label; list.forEach((t) => o.append(new Option(t.namaTim || t.id, t.id, false, t.id === st.team))); sel.append(o); };
              const near = (fsTeams || []).filter((t) => sug.some((n) => fold(n) === fold(t.namaTim))); og("Covers these villages", near); og("All teams", (fsTeams || []).filter((t) => !near.includes(t)));
              if (!st.team && near.length) st.team = near[0].id; sel.value = st.team; };
            fill(); if (!fsTeams) teamList().then(() => draw()).catch((err) => { st.msg = `Teams didn't load: ${err.message}`; draw(); });
            sel.onchange = () => { st.team = sel.value; st.armed = false; draw(); };
            const ty = el("select"); ty.setAttribute("aria-label", "Job type"); DISPATCH_TYPES.forEach((t) => ty.append(new Option(t, t, false, t === st.type))); ty.onchange = () => { st.type = ty.value; st.armed = false; };
            const ti = el("input"); ti.value = st.title || titleOf(g, c); st.title = ti.value; ti.setAttribute("aria-label", "SPK title"); ti.oninput = () => { st.title = ti.value; st.armed = false; };
            form.append(el("label", null, "Team"), sel, el("label", null, "Type"), ty, el("label", null, "Title"), ti); row.append(form);
            const team = fsTeams?.find((x) => x.id === st.team);
            if (team && !(team.anggotaIds || []).length) row.append(el("p", "note warn", `${team.namaTim} has no members on file: the SPK won't reach anyone's dashboard.`));
            const ok = !!(team && st.title.trim()) && !st.busy;
            const go = btn(st.busy ? "Making the SPK…" : !team ? "Choose a team" : st.armed ? `Press again: SPK for ${team.namaTim}, today, Bukan proyek` : "Make SPK", () => {
              if (!st.armed) { st.armed = true; draw(); setTimeout(() => { if (st.armed) { st.armed = false; draw(); } }, 6000); return; }
              create(g, c); }, `btn primary${st.armed ? " arm" : ""}`);
            go.disabled = !ok; btn("Cancel", () => { st.open = null; st.armed = false; draw(); });
            if (st.msg) row.append(el("p", "note warn", st.msg));
          } else {
            btn("Make SPK", () => { st.open = g.key; st.title = ""; st.team = ""; st.armed = false; st.msg = ""; draw(); }, c.dispatch ? "btn primary" : "btn"); // highlighted for a real cluster
            btn("Copy for the team", (b) => copy(msgOf(g, c, ""), b));
          }
          row.append(acts); out.push(row);
        }
        const rest = groups.slice(6), none = rest.find((g) => !g.key);
        if (rest.length) out.push(el("p", "note", [rest.filter((g) => g.key).length ? `${rest.filter((g) => g.key).length} more ports with a few down each` : "", none ? `${none.custs.length} whose modem isn't in the OLT lists` : ""].filter(Boolean).join(" · ")));
        box.replaceChildren(...out);
      }
      draw(); return box;
    }

