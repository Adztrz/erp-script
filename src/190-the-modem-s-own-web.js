    // ---- the modem's own web page ----
    // The ERP's Remote ONU looks for the session only on the RO the customer record names, and about 1 in 10 online
    // customers are really on another RO (old ARJOSARI/TREMAS records), so it finds nothing. Here the address comes
    // from RADIUS (the live session: its IP and real RO). The page opens through the ERP's temporary port on the RO
    // (5 minutes, logged), which needs the ERP to find the session too.
    function webSection(m, username, dev, redraw) {
      const w = m.web, box = el("div", "webbox");
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "12px 0 0"; e.append("Web page"); head.append(e); box.append(head);
      if (!w) {
        const b = el("button", "btn", "Find the modem's address"); b.type = "button"; b.dataset.k = `${m.key}web`; b.style.marginTop = "8px";
        b.onclick = () => openWeb(m, username, redraw); box.append(b); return box;
      }
      if (w.busy) { box.append(el("p", "note ld", "Reading the live session and asking the ERP…")); return box; }
      if (w.err) box.append(el("p", "note late", w.err));
      const s = w.sess;
      if (!s) { box.append(el("p", "note", "Not online now (no PPPoE session in RADIUS), so the modem can't be reached.")); return box; }
      const facts = el("dl", "facts"), ip = el("dd", "mono", s.addr); const c = el("button", "copy", "Copy"); c.type = "button"; c.onclick = () => copy(s.addr, c); ip.append(c);
      facts.append(el("dt", null, "Modem IP"), ip, el("dt", null, "On"), el("dd", null, `${s.ro} · online ${dur(s.up)}`)); box.append(facts);
      // the RO the session is really on, as the ERP names it: the NAS with the session's NAS address and the same name
      const real = realRo(s);
      if (w.erpRo && real && fold(w.erpRo) !== fold(real)) {
        box.append(el("p", "note warn", `The ERP has this customer on ${w.erpRo}, but the session is on ${real}: the ERP's Remote ONU and its 5-minute access look on ${w.erpRo} and can't find it.`));
        const fx = armButton(w.fix ||= { armed: 0 }, `Fix RO: set to ${real}`, `Click again: set the ERP record to ${real}`, async () => {
          w.fix.armed = 0; w.fixing = true; redraw();
          try {
            const j = await api("/api/admin/ldn-radius/bulk-set-router", { usernames: [username], router: real });
            if (!j?.success && !j?.mapUpdated) throw new Error(j?.error || (j?.errors || []).join("; ") || "not set");
            if (m.r) m.r.router = real;
            shiftNote("pemeliharaan", `Fix RO ${username}: ${w.erpRo} → ${real} (data ERP disamakan dengan sesi)`, username);
            await openWeb(m, username, redraw);
            // Remote ONU reads its own copy of the customer list, which Set Router doesn't refresh right away
            const stale = m.web?.erpRo && fold(m.web.erpRo) !== fold(real);
            m.msg = { good: true, text: `RO set to ${real} (LDN ${j.mapUpdated ?? "?"}, ERP master ${j.fsUpdated ?? "?"}). Only the record changed; the connection stays as it is.${stale ? ` The ERP's Remote ONU still reads ${m.web.erpRo} from its own copy of the customer list, which Set Router doesn't refresh; Remote works once the ERP updates that copy.` : ""}` };
          } catch (err) { m.msg = { bad: true, text: `RO not changed: ${err.message}` }; }
          w.fixing = false; redraw(); }, redraw, `${m.key}fixro`);
        fx.classList.remove("wide"); if (w.fixing) { fx.disabled = true; fx.textContent = "Setting…"; }
        box.append(fx, el("p", "note", "Uses the ERP's own Set Router (LDN → Pelanggan): it changes the record (Router column and ERP master), not the PPPoE connection."));
      } else if (w.erpRo && !real && fold(nameNorm(w.erpRo)) !== fold(nameNorm(s.ro || "")))
        box.append(el("p", "note warn", `The ERP has this customer on ${w.erpRo}, but the session is on ${s.ro}; which ERP router that is isn't certain, so fix it in LDN → Pelanggan → Set Router.`));
      // the router bridge's own access: countdown and Close now
      if (w.own && w.own.until > Date.now()) {
        const p = el("p", "note good"), a = el("a", null, w.own.url); a.href = w.own.url; a.target = "_blank"; a.rel = "noreferrer noopener";
        const cl = el("button", "copy", "Close now"); cl.type = "button"; cl.dataset.k = `${m.key}ownclose`;
        cl.onclick = async () => { cl.disabled = true; try { await bridge("close", { handle: w.own.handle }); w.own = null; m.msg = { good: true, text: "Closed on the router." }; } catch (err) { m.msg = { bad: true, text: `Not closed: ${err.message} (the router removes it by itself at the end).` }; } redraw(); };
        p.append("Open (router bridge): ", a, ` · until ${hhmm(w.own.until)} · `, cl); box.append(p);
      }
      const want = realRo(s) || s.ro;
      if (bridgeInfo && want && !bridgeKnows(want, s.ip)) {
        const su = el("button", "btn primary", `Set up ${want}`); su.type = "button"; su.dataset.k = `${m.key}bsetup`;
        su.onclick = async () => { await bridge("setup", { ro: want }, 600000).catch(() => null); await bridgeStatus(); w.needSetup = null; redraw(); }; // cancelled halfway: still not known, so the button stays
        const p = el("p", "note"); p.append(`The router bridge doesn't know ${want} yet: set it up once (its public address, API port, NAS address and a RouterOS login), then press Remote.`); box.append(p, su);
      }
      // test and 5-minute access, through the ERP when it found the session
      const acts = el("div", "actions");
      if (w.id && w.erpFound) {
        const t = el("button", "btn", w.probing ? "Testing… (~20 s)" : "Test from the RO"); t.type = "button"; t.disabled = !!w.probing; t.dataset.k = `${m.key}probe`;
        t.onclick = async () => { w.probing = true; redraw();
          try { const j = await api("/api/noc/remote-onu", { customerId: w.id, probe: true }); w.probe = j.probe; } catch (err) { w.err = `Test failed: ${err.message}`; }
          w.probing = false; redraw(); };
        acts.append(t);
        if (!w.tunnel || w.tunnel.until < Date.now()) {
          const go = armButton(w.st, roPublic(w.erpRo) ? "Open from anywhere · 5 min" : "Open on the NOC WireGuard · 5 min", "Click again: open a 5-minute port on the RO (logged)", () => {
            let win = null; try { win = window.open("about:blank", "_blank"); if (win) win.opener = null; } catch { /* blocked */ }
            w.st.armed = 0; w.opening = true; redraw();
            w.tunnel = null;
            openTunnel(m, w, win).then(() => { if (ls.get(KEEP_OPEN, false)) { w.keep = true; keepTick(m, w); } }).catch((err) => { win?.close(); w.err = `Access not opened: ${err.message}. Dashbor NOC → Remote ONU → "Buka Akses 5 Menit" sends the same request.`; }).finally(() => { w.opening = false; redraw(); });
          }, redraw, `${m.key}tunnel`);
          go.classList.remove("wide", "primary"); if (w.opening) { go.disabled = true; go.textContent = "Opening…"; } acts.append(go);
        }
      } else if (!w.id) acts.append(el("span", "sub", "The ERP's Remote ONU doesn't know this username, so there's no 5-minute access."));
      box.append(acts);
      if (w.id && (w.tunnel?.ro || w.erpRo)) box.append(roPublicRow(m, w.tunnel?.ro || w.erpRo, redraw));
      if (w.tunnel && w.tunnel.until > Date.now()) {
        const go = w.tunnel.pub || w.tunnel.url, p = el("p", "note good"), a = el("a", null, go); a.href = go; a.target = "_blank"; a.rel = "noreferrer noopener";
        const left = el("b"); p.append(w.tunnel.pub ? "Open from anywhere: " : "Open now: ", a, w.keep ? " · renews in " : " · closes in ", left); box.append(p);
        if (w.tunnel.pub) { const wg = el("p", "note"), b = el("a", null, w.tunnel.url); b.href = w.tunnel.url; b.target = "_blank"; b.rel = "noreferrer noopener"; wg.append("On the NOC WireGuard: ", b); box.append(wg); }
        const kp = el("button", `copy${w.keep ? " on" : ""}`, w.keep ? "Keep open: on" : "Keep open: off"); kp.type = "button"; kp.dataset.k = `${m.key}keep`;
        kp.title = "Ask for the access again before it closes, up to 30 minutes, until the modem's tab is closed (each renewal is logged like a press)";
        kp.onclick = () => { w.keep = !w.keep; ls.set(KEEP_OPEN, w.keep); if (w.keep) { w.tunnel.since = Date.now(); keepTick(m, w); } else clearInterval(w.keepTimer); redraw(); };
        p.append(" ", kp);
        const tick = (first) => { if (!w.tunnel) return; const sLeft = Math.max(0, Math.round((w.tunnel.until - Date.now()) / 1000)); left.textContent = `${Math.floor(sLeft / 60)}:${String(sLeft % 60).padStart(2, "0")}`;
          if (!sLeft && !w.keep) { w.tunnel = null; redraw(); } else if (!sLeft) redraw(); else if (first || left.isConnected) setTimeout(tick, 1000); }; // the first tick runs before the box is on the page
        tick(true);
      }
      if (w.probe) {
        const say = { menjawab: "answers", tidakMenjawab: "no answer", takDiuji: "not tested", takTerbaca: "unclear" };
        const r = el("p", "note"); r.append(`From ${s.ro}: ping ${say[w.probe.ping?.status] || "–"}`);
        for (const x of w.probe.http || []) { r.append(" · "); r.append(el("span", x.status === "menjawab" ? "good" : x.status === "tidakMenjawab" ? "late" : "", `port ${x.port} ${say[x.status] || x.status}${x.http ? ` (${x.http})` : ""}`)); }
        box.append(r);
        if ((w.probe.http || []).length && w.probe.http.every((x) => x.status === "tidakMenjawab")) // only a clear "no" on every port
          box.append(el("p", "note warn", dev ? "This modem doesn't serve its web page on the internet side. Use WiFi password, Change WiFi or Reboot above: they go through TR-069." : "This modem doesn't serve its web page on the internet side, and it isn't on TR-069: it needs a visit, or TR-069 set up on it."));
      }
      return box;
    }
    const dur = (sec) => { const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), mi = Math.floor((sec % 3600) / 60); return d ? `${d} d ${h} h` : h ? `${h} h ${mi} min` : `${mi} min`; };
    // the ERP's router list (LDN → Router (NAS)): name and address. A session's RO is the NAS with the session's NAS
    // address, if its main name agrees too (ARJOSARI and RO ARJOSARI are different routers; the address tells them apart)
    let nasList = null;
    const nasIndex = () => (nasList ? Promise.resolve(nasList) : api("/api/admin/ldn-radius/nas").then((j) => (nasList = j.nas || [])).catch(() => []));
    function realRo(s) {
      if (!s?.ip || !nasList) return null;
      const word = (x) => fold(nameNorm(x)).split(/[\s-]/)[0]; // "PUNUNG" is RO PUNUNG NEW, "RO-NGADIROJO-E2E" is NGADIROJO
      const n = nasList.find((x) => x.nasname === s.ip && (!s.ro || word(x.shortname) === word(s.ro)));
      return n ? String(n.shortname).trim() : null;
    }
    async function openWeb(m, username, redraw) {
      const w = (m.web = { busy: true, st: { armed: 0 } }); redraw();
      const u = lower(username);
      await Promise.all([nasIndex(), bridgeStatus()]); // tiny lists, kept after the first time
      const [lv, erp] = await Promise.all([
        (live && Date.now() - live.at < 30000 ? Promise.resolve(live) : (live = null, liveSessions())).catch((e) => { w.err = `RADIUS sessions not read: ${e.message}`; return null; }),
        api(`/api/noc/remote-onu?q=${encodeURIComponent(username)}`).then(async (j) => { const c = (j.hasil || []).find((x) => lower(x.username) === u); if (!c) return null;
          const d = await api("/api/noc/remote-onu", { customerId: c.customerId, probe: false }); return { id: c.customerId, ro: c.ro, found: d.sumberSesi === "live" || d.sumberSesi === "snapshot", ip: d.sesi?.ip }; }).catch(() => null),
      ]);
      const s = lv?.by.get(u);
      w.sess = s && s.addr ? s : erp?.ip ? { addr: erp.ip, ro: erp.ro, up: 0 } : null;
      w.id = erp?.id; w.erpRo = erp?.ro; w.erpFound = !!erp?.found; w.busy = false; redraw();
    }
    function wifiForm(m, dev, redraw) {
      const f = m.form, form = el("form"); form.onsubmit = (ev) => ev.preventDefault();
      const seg = el("div", "seg");
      for (const [v, l] of [["2.4GHz", "2,4 GHz"], ["5GHz", "5 GHz"], ["keduanya", "Both"]]) { const b = el("button", null, l); b.type = "button"; b.setAttribute("aria-pressed", String(f.pita === v)); b.onclick = () => { f.pita = v; m.wf.armed = 0; redraw(); }; seg.append(b); }
      const lab = (t, x) => { const l = el("label", "lbl"); l.append(t, x); return l; };
      const inp = (k, ph, val) => { const i = el("input", "field"); i.value = val ?? ""; i.placeholder = ph; i.dataset.k = `${m.key}${k}`; i.autocomplete = "off"; i.spellcheck = false; i.oninput = () => { f[k] = i.value; m.wf.armed = 0; }; return i; };
      const parts = [lab("Band", seg)];
      if (f.pita !== "5GHz") parts.push(lab("WiFi name (2,4 GHz)", inp("ssid", "keep as it is", f.ssid)));
      if (f.pita !== "2.4GHz") parts.push(lab("WiFi name (5 GHz)", inp("ssid5", dev.ssid5 ? "keep as it is" : "this modem reports no 5 GHz", f.ssid5)));
      const pw = inp("password", "new password, 8–63 characters (empty keeps it)", f.password);
      const gen = el("button", "copy", "Make one"); gen.type = "button";
      gen.onclick = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; f.password = Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => a[x % a.length]).join(""); m.wf.armed = 0; redraw(); };
      const pl = lab("New password", pw); pl.append(gen); parts.push(pl);
      const body = { action: "wifi-update", pita: f.pita };
      if (f.pita !== "5GHz" && f.ssid?.trim() && f.ssid.trim() !== dev.ssid) body.ssid = f.ssid.trim();
      if (f.pita !== "2.4GHz" && f.ssid5?.trim() && f.ssid5.trim() !== dev.ssid5) body.ssid5g = f.ssid5.trim();
      if (f.password) body.password = f.password;
      const bad = f.password && (f.password.length < 8 || f.password.length > 63), what = [body.ssid || body.ssid5g ? "name" : "", body.password ? "password" : ""].filter(Boolean).join(" and ");
      const go = armButton(m.wf, bad ? "The password needs 8–63 characters" : what ? `Change the WiFi ${what}` : "Change the name or type a new password", `Click again: send to the modem${body.password ? ` (new password: ${body.password})` : ""}`, async () => {
        m.wf.armed = 0; m.msg = { text: "Sending to the modem…" }; redraw();
        try { const j = await api(`/api/olt/acs/devices/${encodeURIComponent(dev.id)}`, body), q = j.data?.status;
          m.msg = { good: true, text: q === "queued-offline" ? "The modem isn't answering TR-069: the change waits until it reports again." : q === "queued-natbound" ? "Queued: it applies at the modem's next report (within ~5 min)." : `Sent. The modem applies it in a few seconds${body.password ? "; the customer's devices need the new password" : ""}.` };
          m.form = null; acs = null; // read the device list again next time
        } catch (err) { m.msg = { bad: true, text: `Not changed: ${err.message}` }; }
        redraw(); }, redraw, `${m.key}wifigo`);
      go.disabled = bad || !what; parts.push(go);
      form.append(...parts); return form;
    }

