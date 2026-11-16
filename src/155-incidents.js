    // ---- Incidents ----
    // An outage becomes one incident with its own record: a router well below its usual level (the radar), or a PON
    // port where several customers went down in the same drop-log reading. The tab that took the reading opens,
    // updates and closes them (so one desktop alert, not one per tab); each keeps a timeline of what happened and what
    // was done, which the shift journal turns into Jurnal Piket entries. Kept 7 days, in this browser.
    const INC_KEEP = 7 * 86400000, NOTIFY = "erpDock.notify";
    let incidents = null;
    const incList = async () => (incidents = (await idbGet("incidents")) || []);
    const incSave = (l) => { incidents = l.filter((x) => x.state === "open" || (x.end || x.start) > Date.now() - INC_KEEP); idbPut("incidents", incidents); };
    const incOpen = () => (incidents || []).filter((x) => x.state === "open");
    function notify(title, body, inc) { // a desktop alert, when you've switched them on
      if (!ls.get(NOTIFY, false) || !("Notification" in window) || Notification.permission !== "granted") return;
      try { const n = new Notification(title, { body, tag: inc ? `erpdock-${inc.id}` : undefined, silent: false });
        n.onclick = async () => { window.focus(); n.close(); if (!panel) await open(); view.mode = "incident"; view.inc = inc?.id; view.card = null; drawBody(); }; } catch { /* not allowed here */ }
    }
    // from each radar reading: routers that dropped open an incident, deeper drops are logged, routers back close it
    async function incRadar(r) {
      if (!r || r.learning) return;
      const l = await incList(), now = Date.now();
      for (const x of r.alerts) {
        let inc = l.find((i) => i.state === "open" && i.kind === "router" && i.key === x.ip);
        const what = x.level === "nofeed" ? `${x.name}: no session data since ${x.since ? hhmm(x.since) : "?"} (count frozen at ${x.open})` : `${x.name} ${x.level === "down" ? "down" : "dropping"}: ${x.open} online, usually ${x.usual}`;
        if (!inc) {
          inc = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind: "router", key: x.ip, title: `Router ${x.name}`, start: x.since || now, state: "open", level: x.level, affected: x.gap, peak: x.gap, log: [[x.since || now, what, 1]] };
          l.push(inc); notify(x.level === "nofeed" ? `Tanpa data: ${inc.title}` : `Gangguan: ${inc.title}`, x.level === "nofeed" ? `Data sesi berhenti sejak ${x.since ? hhmm(x.since) : "?"}: cek router atau OLT` : `${x.gap} sesi hilang · ${x.open} online, biasanya ${x.usual}`, inc);
        } else {
          if (x.level !== inc.level) inc.log.push([now, what, 1]);
          inc.level = x.level; inc.affected = x.gap; inc.peak = Math.max(inc.peak || 0, x.gap);
        }
      }
      for (const inc of l.filter((i) => i.state === "open" && i.kind === "router" && !r.alerts.some((x) => x.ip === i.key))) {
        const x = r.list.find((y) => y.ip === inc.key);
        inc.state = "recovered"; inc.end = now; inc.affected = 0; inc.log.push([now, `Back to its usual level${x ? `: ${x.open} online` : ""}`, 1]);
        notify(`Pulih: ${inc.title}`, `Setelah ${lama(now - inc.start)}`, inc);
      }
      incSave(l); incDrawn();
    }
    // from each drop-log reading: 3+ customers of one PON port going down together (and a quarter of the port) open a
    // PON incident; it closes when 80% of them are back online
    async function incDrops(gone, d) {
      const l = await incList(), now = Date.now();
      if (gone.length && customers && (onts || (await ontIndex().catch(() => null)))) {
        const byUser = new Map(customers.map((c) => [lower(c.username), c])), ports = new Map();
        for (const u of gone) { const c = byUser.get(u), o = c && modemOf(c).ont; if (!o) continue;
          const k = `${o.pid}|${o.pon}`; if (!ports.has(k)) ports.set(k, { o, users: [] }); ports.get(k).users.push(u); }
        for (const [k, p] of ports) {
          const size = onts.rows.filter((x) => x.pid === p.o.pid && x.pon === p.o.pon).length;
          let inc = l.find((i) => i.state === "open" && i.kind === "pon" && i.key === k);
          if (inc) { const add = p.users.filter((u) => !inc.users.includes(u)); if (add.length) { inc.users.push(...add); inc.log.push([now, `${add.length} more down`, 1]); } }
          else if (p.users.length >= 3 && p.users.length >= size * 0.25) {
            inc = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind: "pon", key: k, title: `${p.o.olt} · PON ${p.o.pon}`, start: d.off[p.users[0]]?.from || now, state: "open", users: [...p.users], size, log: [[now, `${p.users.length} of ${size} on the port down together`, 1]] };
            l.push(inc); notify(`Gangguan: ${inc.title}`, `${p.users.length} dari ${size} pelanggan di port ini mati bersamaan`, inc);
          }
          if (inc) { inc.affected = inc.users.filter((u) => d.off[u]).length; inc.peak = Math.max(inc.peak || 0, inc.users.length); }
        }
      }
      for (const inc of l.filter((i) => i.state === "open" && i.kind === "pon")) {
        inc.affected = inc.users.filter((u) => d.off[u]).length;
        if (inc.affected <= inc.users.length * 0.2) { inc.state = "recovered"; inc.end = now; inc.log.push([now, `${inc.users.length - inc.affected} of ${inc.users.length} back online`, 1]); notify(`Pulih: ${inc.title}`, `Setelah ${lama(now - inc.start)}`, inc); }
      }
      incSave(l); incDrawn();
    }
    // what was done, from the Dock's own buttons: into the incident on screen, and the shift's own list for the journal
    function incidentNote(text) {
      const inc = view.mode === "incident" && (incidents || []).find((x) => x.id === view.inc); if (!inc) return;
      inc.log.push([Date.now(), text]); incSave(incidents);
    }
    function shiftNote(kategori, teks, rujukan = "") {
      idbGet("shiftlog").then((l) => { l = (l || []).filter((x) => x.t > Date.now() - 2 * 86400000); l.push({ t: Date.now(), kategori, teks, rujukan }); idbPut("shiftlog", l); });
    }
    const incDrawn = () => { if (panel && (view.mode === "incident" || (!view.q.trim() && !view.card && !view.mode))) drawBody(); };

    // the open incidents at the top of the home view
    function incidentRows() {
      const out = [], list = incOpen().sort((a, b) => b.start - a.start);
      if (!incidents) { incList().then(() => incOpen().length && incDrawn()); return out; }
      if (!list.length) return out;
      const e = el("div", "eyebrow"); e.append("Incidents ", el("b", null, `${list.length} open`)); out.push(e);
      list.forEach((inc, i) => {
        const b = el("button", "item rise incident"); b.type = "button"; b.style.setProperty("--i", String(i));
        b.append(el("span", "dot down"), el("span", "t", inc.title), el("span", "r", `${lama(Date.now() - inc.start)}`),
          el("span", "s", inc.kind === "router" ? `${inc.level === "nofeed" ? "no session data" : `${inc.affected} sessions below usual`} · since ${hhmm(inc.start)}` : `${inc.affected} of ${inc.users.length} still down · since ${hhmm(inc.start)}`));
        b.onclick = () => { view.mode = "incident"; view.inc = inc.id; view.card = null; drawBody(); }; out.push(b);
      });
      if ("Notification" in window && (!ls.get(NOTIFY, false) || Notification.permission !== "granted")) {
        const n = el("button", "copy", "Desktop alerts for new incidents"); n.type = "button";
        n.onclick = async () => { const p = await Notification.requestPermission().catch(() => "denied"); ls.set(NOTIFY, p === "granted"); drawBody(); };
        const p = el("p", "note"); p.append(n); out.push(p);
      }
      return out;
    }

    // one incident: what, since when, the timeline, notes, and the tools for it (cause & dispatch, report, map)
    function incidentView(id) {
      const inc = (incidents || []).find((x) => x.id === id), wrap = el("div", "card");
      const back = el("button", "back", "← Back"); back.type = "button"; back.onclick = () => { view.mode = null; view.inc = null; drawBody(); }; wrap.append(back);
      if (!inc) { wrap.append(el("p", "note", "This incident isn't kept any more.")); return wrap; }
      const who = el("div", "who rise"), pill = el("span", "pill"); pill.append(el("span", `dot ${inc.state === "open" ? "down" : "on"}`), inc.state === "open" ? "Open" : "Recovered");
      who.append(el("h3", null, inc.title), pill); wrap.append(who);
      const facts = el("dl", "facts rise"), fact = (k, v) => { if (v) facts.append(el("dt", null, k), el("dd", null, v)); };
      fact("Since", `${hhmm(inc.start)} · ${lama((inc.end || Date.now()) - inc.start)}${inc.end ? ` · recovered ${hhmm(inc.end)}` : ""}`);
      fact("Affected", inc.kind === "router" ? (inc.level === "nofeed" ? "Not known: the ERP stopped receiving this router's sessions" : `${inc.affected} sessions below usual now · ${inc.peak} at the worst`) : `${inc.affected} of ${inc.users.length} still down · ${inc.size || "?"} on the port`);
      wrap.append(facts);
      // timeline and a note
      const tl = el("div", "near timeline rise"), e = el("div", "eyebrow"); e.style.margin = "0 0 6px"; e.append("Timeline"); tl.append(e);
      for (const [t, text, auto] of [...inc.log].sort((a, b) => a[0] - b[0])) { const r = el("div", `tl${auto ? " auto" : ""}`); r.append(el("span", "mono", hhmm(t)), el("span", null, text)); tl.append(r); }
      const note = el("input", "field"); note.placeholder = "Add a note: who you called, what they found…"; note.dataset.k = `inc${inc.id}note`;
      const add = () => { const v = note.value.trim(); if (!v) return; inc.log.push([Date.now(), v]); incSave(incidents); drawBody(); };
      note.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); add(); } };
      const acts = el("div", "actions"), btn = (l, f) => { const b = el("button", "btn", l); b.type = "button"; b.onclick = f; acts.append(b); return b; };
      btn("Add note", add);
      if (inc.state === "open") btn("Mark resolved", () => { inc.state = "recovered"; inc.end = Date.now(); inc.log.push([inc.end, "Marked resolved"]); incSave(incidents); drawBody(); });
      tl.append(note, acts); wrap.append(tl);
      // the tools: for a router, its own view; for a PON, its customers here
      if (inc.kind === "router") {
        const go = el("button", "btn primary", "Who's offline, cause & dispatch, report, map"); go.type = "button"; go.style.marginTop = "8px";
        go.onclick = () => { view.mode = "radar"; view.nas = inc.key; drawBody(); }; wrap.append(go);
      } else if (customers) {
        const byUser = new Map(customers.map((c) => [lower(c.username), c])), custs = inc.users.map((u) => byUser.get(u)).filter(Boolean);
        const down = custs.filter((c) => drops?.off[lower(c.username)]);
        if (down.length) wrap.append(causeBox(down, inc.title), reportBox({ title: inc.title, down: down.length, total: inc.size || custs.length, since: inc.start, custs: down }));
        const pts = custs.map((c) => ({ c, p: where(c), on: !drops?.off[lower(c.username)] })).filter((z) => z.p);
        if (pts.length) wrap.append(areaMap(pts, `Map of ${inc.title}`, { what: inc.title, since: inc.start }));
      }
      const rm = el("button", "copy", "Remove this incident"); rm.type = "button"; rm.style.marginTop = "10px";
      rm.onclick = () => { incSave(incidents.filter((x) => x.id !== inc.id)); view.mode = null; view.inc = null; drawBody(); }; wrap.append(rm);
      setTimeout(() => wrap.querySelector(`[data-k="inc${inc.id}note"]`) && document.activeElement === document.body && note.focus(), 0);
      return wrap;
    }
