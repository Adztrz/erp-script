    // ---- Modems: any ONT by its SN, its OLT port and signal, and remote work on it ----
    // The ERP's own calls: each OLT's cached ONT list (46 OLTs, ~11,000 ONTs, kept 2 hours), live signal per ONT,
    // reboot through the OLT by SN, and for modems on TR-069 (GenieACS): the WiFi password, a WiFi change and a reboot.
    // Nothing on a modem changes until its button is pressed twice.
    let onts = null, ontsLoading = null, acs = null, acsLoading = null;
    const snNorm = (x) => String(x ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const lower = (x) => String(x ?? "").toLowerCase().trim();
    function refreshOnts() {
      return (ontsLoading ||= (async () => {
        const pr = (await api("/api/olt/profiles")).data || [], rows = [], queue = [...pr];
        await Promise.all([0, 1, 2, 3].map(async () => { while (queue.length) { const p = queue.shift();
          try { for (const o of (await api(`/api/olt/profiles/${p.id}/onts?cached=1`)).data || []) if (o.serialNumber) rows.push(ontRow(o, p)); } catch { /* that OLT is skipped */ } } }));
        // each OLT's own record: whether the ERP can reach it, and why not
        const olts = pr.map((p) => ({ id: p.id, name: p.name, ip: p.ipAddress || "", ok: p.lastTestSuccess, err: p.lastDiscoveryError || p.lastTestError || "", disc: p.lastDiscoveryAt || null }));
        const v = { at: Date.now(), rows, olts }; idbPut("onts", v); onts = indexOnts(v);
        if (panel && !document.activeElement?.closest?.(".modem")) drawBody();
        return onts;
      })().finally(() => { ontsLoading = null; }));
    }
    const ontRow = (o, p) => ({ sn: snNorm(o.serialNumber), raw: o.serialNumber, pid: p.id, olt: p.name, pon: [o.frame, o.slot, o.port].filter((x) => x != null).join("/"), id: o.ontId,
      st: o.status, rx: o.rxPower ?? null, dist: o.distance ?? o.signalDistance ?? null, pppoe: o.pppoeUsername || "", name: o.customerName || "", model: o.model || o.vendor || p.vendor || "",
      seen: o.signalPolledAt || o.lastSeenAt || null });
    const indexOnts = (v) => ({ at: v.at, rows: v.rows, olts: v.olts || [], bySn: new Map(v.rows.map((o) => [o.sn, o])), byUser: new Map(v.rows.filter((o) => o.pppoe).map((o) => [lower(o.pppoe), o])) });
    async function ontIndex() {
      if (!onts) { const kept = await idbGet("onts"); if (kept?.rows) onts = indexOnts(kept); }
      if (!onts || Date.now() - onts.at > 2 * 3600000) { const p = refreshOnts(); if (!onts) await p; }
      return onts;
    }
    function acsIndex() {
      if (acs && Date.now() - acs.at < 15 * 60000) return Promise.resolve(acs);
      return (acsLoading ||= api("/api/olt/acs/devices").then((j) => {
        const rows = (j.data || []).map((d) => ({ id: d._id, sn: snNorm(d.serialNumber), model: [d.manufacturer, d.productClass].filter(Boolean).join(" "), inform: d.lastInform,
          ssid: d.ssid24 || d.ssid || "", ssid5: d.ssid5g || "", pppoe: d.pppoeUsername || d.wan?.usernameModem || "", mgmt: d.externalIpAddress || d.wan?.ip || "" }));
        return (acs = { at: Date.now(), bySn: new Map(rows.map((d) => [d.sn, d])), byUser: new Map(rows.filter((d) => d.pppoe).map((d) => [lower(d.pppoe), d])) });
      }).catch(() => (acs = { at: Date.now(), bySn: new Map(), byUser: new Map(), failed: true })).finally(() => { acsLoading = null; }));
    }
    // a customer's modem: the SN on file, else the ONT or TR-069 device that logs in with their username
    function modemOf(r) {
      const sn = snNorm(r.ontSerial), u = lower(r.username);
      const ont = (sn && onts?.bySn.get(sn)) || onts?.byUser.get(u) || null;
      const dev = acs?.bySn.get(ont?.sn || sn) || acs?.byUser.get(u) || null;
      return { sn: ont?.sn || dev?.sn || sn, ont, dev };
    }
    let custBySn = null;
    function customerOf(sn, ont, dev) {
      if (!customers) return null;
      if (!custBySn || custBySn.n !== customers) { custBySn = new Map(customers.filter((c) => c.ontSerial).map((c) => [snNorm(c.ontSerial), c])); custBySn.n = customers; }
      const u = lower(ont?.pppoe || dev?.pppoe);
      return custBySn.get(sn) || (u && customers.find((c) => lower(c.username) === u)) || null;
    }
    const snLike = (q) => { const t = q.trim(); return /^[a-z0-9:-]{5,}$/i.test(t) && /\d/.test(t) && !/^0?8\d{8,}$/.test(t); };
    function findModems(q, max = 6) {
      const n = snNorm(q), out = [], seen = new Set();
      for (const o of onts?.rows ?? []) { if (out.length >= max) break; if (o.sn.includes(n) && !seen.has(o.sn)) { seen.add(o.sn); out.push({ sn: o.sn, ont: o, dev: acs?.bySn.get(o.sn) }); } }
      for (const d of acs?.bySn.values() ?? []) { if (out.length >= max) break; if (d.sn.includes(n) && !seen.has(d.sn)) { seen.add(d.sn); out.push({ sn: d.sn, ont: null, dev: d }); } }
      for (const c of customers ?? []) { if (out.length >= max) break; const sn = snNorm(c.ontSerial); if (sn && sn.includes(n) && !seen.has(sn)) { seen.add(sn); out.push({ sn, ont: null, dev: null, cust: c }); } }
      return out.map((m) => ({ ...m, cust: m.cust || customerOf(m.sn, m.ont, m.dev) }));
    }
    const rxClass = (rx) => (rx == null ? "" : rx >= -26 ? "good" : rx >= -28 ? "warn" : "late");
    const dbm = (rx) => (rx == null || rx === 0 ? "–" : `${Number(rx).toFixed(1).replace(".", ",")} dBm`);
    const when = (t) => { if (!t) return ""; const m = Math.floor((Date.now() - new Date(t)) / 60000); return m < 1 ? "just now" : m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
    const ontState = (o) => (!o ? "" : /online|working/i.test(o.st) ? "on" : /los|dying|offline/i.test(o.st) ? "off" : "");
    function modemItem(m, i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(el("span", `dot ${ontState(m.ont)}`), el("span", "t", m.cust?.nama || m.ont?.name || m.dev?.model || m.sn), el("span", "r", m.ont?.raw || m.sn),
        el("span", "s", [m.ont?.model || m.dev?.model, m.ont && `${m.ont.olt} · ${m.ont.pon}:${m.ont.id}`, m.ont?.rx ? dbm(m.ont.rx) : "", m.cust ? m.cust.username : "no customer linked"].filter(Boolean).join(" · ")));
      b.onclick = () => { if (m.cust) { view.card = m.cust; remember(m.cust); } else view.modem = m.sn; view.sel = 0; draw(); };
      return b;
    }
    // the modem box: on a customer's card, or alone for a modem no customer is linked to
    const mods = new Map(); // key → { el, st, live, pw, form, msg }
