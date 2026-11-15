    // ---- the router bridge (erp-router-bridge.user.js, a second userscript) ----
    // With it installed and the session's RO set up there, Remote opens the modem without the ERP: a port on the RO
    // itself, only for your own IP, which the router removes after 30 minutes. The bridge keeps the router logins in
    // Tampermonkey's storage and builds the router commands itself; the Dock can only ask it to open or close.
    const bridgeCalls = new Map(); let bridgeN = 0;
    window.addEventListener("message", (e) => { const d = e.data; if (e.source !== window || d?.erpBridge !== "res") return;
      const c = bridgeCalls.get(d.id); if (!c) return; bridgeCalls.delete(d.id); if (d.ok) c.ok(d.data); else { const err = new Error(d.error); err.code = d.code; c.no(err); } });
    const bridge = (op, args = {}, ms = 45000) => new Promise((ok, no) => { const id = `b${++bridgeN}`; bridgeCalls.set(id, { ok, no });
      window.postMessage({ erpBridge: "req", id, op, ...args }, "*"); setTimeout(() => { if (bridgeCalls.delete(id)) no(Object.assign(new Error("router bridge not installed"), { code: "none" })); }, ms); });
    let bridgeInfo = null; // { ros: [{ name, nas }] } once the bridge answered; null when it isn't installed
    const bridgeKnows = (ro, nas) => !!bridgeInfo?.ros.some((c) => (nas && c.nas === nas) || fold(nameNorm(c.name)).split(/[\s-]/)[0] === fold(nameNorm(ro || "")).split(/[\s-]/)[0]);
    const bridgeStatus = () => bridge("status", {}, 700).then((x) => (bridgeInfo = x)).catch(() => (bridgeInfo = null));
    async function remoteOwn(m, r, s, win, copied) { // true when the bridge handled it (opened, or failed with a reason)
      if (!(await bridgeStatus())) return false;
      m.msg = { text: "Remote: opening a port on the RO through the router bridge…" }; modemDraw(m);
      try {
        const o = await bridge("open", { ro: s.ro, nas: s.ip, modemIp: s.addr, minutes: 30, tag: r.username });
        m.web.own = o; m.web.tunnel = null;
        if (win && !win.closed) win.location.replace(o.url); else window.open(o.url, "_blank", "noopener");
        m.msg = { good: true, text: `Remote: opened ${o.url} on ${o.ro} without the ERP, for your IP (${o.me}) only; the router removes it in 30 minutes.${copied}` };
      } catch (err) {
        if (err.code === "noro") { // not set up for this RO yet: offer the setup instead of the ERP's access (WireGuard-only, 2 a 10 min)
          m.web.needSetup = realRo(s) || s.ro; win?.close(); m.msg = { text: `Remote: the router bridge doesn't know ${m.web.needSetup} yet. Press "Set up ${m.web.needSetup}" under Web page, then Remote again.` }; modemDraw(m); return true; }
        win?.close(); m.msg = { bad: true, text: `Remote (router bridge): ${err.message}` };
      }
      modemDraw(m); return true;
    }
    async function remoteGo(r) {
      const key = `u:${r.username}`, m = mods.get(key); if (!m) return;
      let win = null; try { win = window.open("about:blank", "_blank"); if (win) win.opener = null; } catch { /* blocked: the access opens in a new tab instead */ }
      const redraw = () => modemDraw(m);
      m.msg = { text: "Remote: finding the modem…" }; redraw(); m.el.scrollIntoView({ block: "nearest" });
      await openWeb(m, r.username, redraw);
      const w = m.web, s = w.sess, { ont, dev } = modemOf(r), login = loginFor(ont?.model || dev?.model);
      if (!s) { win?.close(); m.msg = { bad: true, text: `Remote: not online now (no PPPoE session), so the modem can't be reached.${ont || dev ? " Reboot still works through TR-069 or the OLT." : ""}` }; return redraw(); }
      const copied = login ? " Login password copied." : "";
      if (login) navigator.clipboard?.writeText(login.p).catch(() => {});
      if (s.ip && await remoteOwn(m, r, s, win, copied)) return;
      if (!w.id || !w.erpFound) { win?.close(); m.msg = { bad: true, text: `Remote: the ERP's Remote ONU can't find this session${w.erpRo && w.erpRo !== s.ro ? ` (it has the customer on ${w.erpRo}, the session is on ${s.ro}: correct the RO in the ERP)` : ""}, so the 5-minute access can't be opened.${realRo(s) && w.erpRo && fold(w.erpRo) !== fold(realRo(s)) ? " Fix RO under Web page, then press Remote again." : ""}` }; return redraw(); }
      try {
        w.tunnel = null; await openTunnel(m, w, win);
        if (ls.get(KEEP_OPEN, false)) { w.keep = true; keepTick(m, w); }
        // the ERP's "from anywhere" address is often inside the NOC WireGuard (10.99.98.x), so it opens only on a PC on it
        const inner = /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(w.tunnel?.url || "");
        m.msg = { good: !inner, text: `Remote: opened through the ERP's 5-minute access${w.keep ? ", kept open while this tab is" : ""}.${inner ? ` Its address (${w.tunnel.url}) is inside the NOC WireGuard, so it only loads on a PC connected to it; elsewhere it times out. The router bridge opens on the RO's public address instead.` : ""}${copied}` };
      } catch (err) { win?.close(); m.msg = { bad: true, text: `Remote: access not opened (${err.message}).` }; }
      redraw();
    }
    // The ERP's access is a port on the RO that the router removes after 5 minutes, on purpose. Keep open (off unless you
    // turn it on) asks for it again ~30 s before it closes, as pressing the button again would (each one logged), for
    // at most 30 minutes, and stops as soon as the modem's tab is closed; when the new access has another address, the
    // modem's tab is moved to it (its login may need entering again).
    async function openTunnel(m, w, win) {
      const j = await api("/api/noc/remote-modem", { customerId: w.id }), min = Number(j.menit) > 0 ? Number(j.menit) : 5, secs = Number(j.kedaluwarsaDetik) || min * 60;
      const url = String(j.url), moved = w.tunnel && w.tunnel.url !== url;
      w.tunnel = { url, until: Date.now() + secs * 1000, note: j.keterangan || "", since: w.tunnel?.since || Date.now() };
      if (win) w.win = win;
      if (w.win && !w.win.closed) { if (!w.renewing || moved) try { w.win.location.replace(url); } catch { window.open(url, "_blank", "noopener"); } }
      else if (!w.renewing) window.open(url, "_blank", "noopener");
      return moved;
    }
    function keepTick(m, w) {
      clearInterval(w.keepTimer);
      w.keepTimer = setInterval(async () => {
        const t = w.tunnel;
        if (!w.keep || !t) return clearInterval(w.keepTimer);
        const stop = (text) => { w.keep = false; m.msg = { text }; modemDraw(m); clearInterval(w.keepTimer); };
        if (w.win?.closed) return stop("Keep open stopped: the modem's tab was closed, so the access closes when its time runs out.");
        if (Date.now() - t.since > 30 * 60000) return stop("Keep open stopped after 30 minutes; press Remote again if you still need the modem.");
        if (t.until - Date.now() > 30000 || w.renewing) return;
        w.renewing = true;
        try { const moved = await openTunnel(m, w); m.msg = { good: true, text: moved ? "Access renewed at a new address: the modem's tab was moved there (log in again if it asks)." : "Access renewed for another 5 minutes." }; }
        catch (err) { w.keep = false; m.msg = { bad: true, text: `Access not renewed (${err.message}); it closes when the time runs out.` }; }
        w.renewing = false; modemDraw(m);
      }, 5000);
    }
    function loginRow(m, model) {
      const box = el("span"), f = m.login, saved = loginFor(model);
      if (f) { // the form: model (or just the brand, for all its models), user, password
        const inp = (k, ph, type = "text") => { const i = el("input", "field"); i.type = type; i.placeholder = ph; i.value = f[k] || ""; i.autocomplete = "off"; i.dataset.k = `${m.key}lg${k}`; i.setAttribute("aria-label", ph); i.oninput = () => { f[k] = i.value; }; return i; };
        const save = el("button", "copy", "Save"); save.type = "button";
        save.onclick = () => { const k = modelKey(f.model); if (!k || !f.u) return; const all = ls.get(LOGINS, {}); all[k] = { u: f.u.trim(), p: f.p || "" }; ls.set(LOGINS, all); m.login = null; modemDraw(m); };
        const cancel = el("button", "copy", "Cancel"); cancel.type = "button"; cancel.onclick = () => { m.login = null; modemDraw(m); };
        const form = el("span", "loginform"); form.append(inp("model", "model, or brand for all"), inp("u", "user"), inp("p", "password", "password"), save, cancel,
          el("span", "sub", "Kept unencrypted in this browser: save it only on your own PC, never a shared one.")); box.append(form);
        return box; }
      if (saved) {
        box.append(el("span", "mono", `${saved.u} · ${"•".repeat(Math.min(8, saved.p.length || 1))}`));
        const cu = el("button", "copy", "Copy user"); cu.type = "button"; cu.onclick = () => copy(saved.u, cu);
        const cp = el("button", "copy", "Copy password"); cp.type = "button"; cp.onclick = () => copy(saved.p, cp);
        const ed = el("button", "copy", "Edit"); ed.type = "button"; ed.onclick = () => { m.login = { model: saved.key, u: saved.u, p: saved.p }; modemDraw(m); };
        const rm = el("button", "copy", "Remove"); rm.type = "button"; rm.onclick = () => { const all = ls.get(LOGINS, {}); delete all[saved.key]; ls.set(LOGINS, all); modemDraw(m); };
        box.append(cu, cp, ed, rm); if (saved.key !== modelKey(model)) box.append(el("span", "sub", ` (saved for all ${saved.key.toUpperCase()})`)); return box; }
      const add = el("button", "copy", model ? `Save a login for ${model}` : "Save a login"); add.type = "button";
      add.onclick = () => { m.login = { model: model || "", u: "", p: "" }; modemDraw(m); }; box.append(add); return box;
    }
    function modemBox(key, r) {
      let m = mods.get(key);
      if (!m) { m = { el: el("div", "near modem rise"), rb: { armed: 0 }, wf: { armed: 0 }, key, r }; m.el.style.setProperty("--i", "3"); mods.set(key, m); } // reboot and WiFi each arm on their own
      m.r = r; modemDraw(m);
      if (!onts || !acs) Promise.all([ontIndex(), acsIndex()]).then(() => modemDraw(m)).catch((e) => { m.msg = { bad: true, text: e.message }; modemDraw(m); });
      return m.el;
    }
    function modemDraw(m) {
      const redraw = () => modemDraw(m), focus = document.activeElement?.dataset?.k, parts = [];
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "0"; e.append("Modem"); head.append(e); parts.push(head);
      if (!onts || !acs) { parts.push(el("p", "note ld", "Looking the modem up on the OLTs… (the first time takes about 10 seconds)")); m.el.replaceChildren(...parts); return; }
      const { sn, ont, dev } = m.r ? modemOf(m.r) : { sn: m.key, ont: onts.bySn.get(m.key), dev: acs.bySn.get(m.key) };
      if (!ont && !dev) { parts.push(el("p", "note", sn ? `${sn} isn't on any OLT's list or on TR-069.` : "No modem serial on file, and no ONT or TR-069 modem logs in with this username."));
        if (m.r) { const b = el("button", "btn primary", "Remote ↗"); b.type = "button"; b.dataset.k = `${m.key}remote`; b.onclick = () => remoteGo(m.r); const a = el("div", "actions"); a.append(b); parts.push(a);
          parts.push(webSection(m, m.r.username, null, redraw)); }
        if (m.msg) parts.push(el("p", `note ${m.msg.bad ? "late" : m.msg.good ? "good" : ""}`, m.msg.text));
        m.el.replaceChildren(...parts); return; }
      const live = m.live, st = live?.status || ont?.st, pill = el("span", "pill");
      pill.append(el("span", `dot ${ontState({ st })}`), st ? st[0].toUpperCase() + st.slice(1) : "TR-069 only"); head.append(pill);
      const facts = el("dl", "facts"), fact = (label, value, opts = {}) => { if (!value) return; const dd = el("dd", opts.cls || null);
        if (value instanceof Node) dd.append(value); else dd.append(value);
        if (opts.copy) { const c = el("button", "copy", "Copy"); c.type = "button"; c.onclick = () => copy(String(opts.copy), c); dd.append(c); }
        if (opts.extra) dd.append(opts.extra); facts.append(el("dt", null, label), dd); };
      fact("SN", ont?.raw || sn, { cls: "mono", copy: ont?.raw || sn });
      fact("Model", ont?.model || dev?.model);
      if (ont) fact("OLT", `${ont.olt} · PON ${ont.pon} · ONU ${ont.id}`);
      if (ont) {
        const rx = live?.rxPower ?? ont.rx, sig = el("span"); sig.append(el("span", `rx ${rxClass(rx)}`, dbm(rx)));
        const more = [live?.rxPowerOlt ? `OLT side ${dbm(live.rxPowerOlt)}` : "", (live?.distance ?? ont.dist) ? `${Math.round(live?.distance ?? ont.dist)} m` : "", live ? (live.lastUpdated ? when(live.lastUpdated) : "now") : when(ont.seen)].filter(Boolean);
        if (more.length) sig.append(el("span", "sub", ` · ${more.join(" · ")}`));
        const read = el("button", "copy", m.reading ? "Reading…" : "Read now"); read.type = "button"; read.disabled = !!m.reading; read.dataset.k = `${m.key}read`;
        read.onclick = async () => { m.reading = true; redraw();
          try { const j = await api(`/api/olt/profiles/${ont.pid}/onts/${encodeURIComponent(ont.raw)}/signal`); m.live = j.data || null; m.msg = j.cached ? { text: "The OLT only had a stored reading." } : null; }
          catch (err) { m.msg = { bad: true, text: `Couldn't read the signal: ${err.message}` }; }
          m.reading = false; redraw(); };
        fact("Signal", sig, { extra: read });
      }
      if (dev) fact("TR-069", `last report ${when(dev.inform) || "never"}${dev.ssid ? ` · WiFi ${dev.ssid}${dev.ssid5 ? ` / ${dev.ssid5}` : ""}` : ""}`);
      else fact("TR-069", "not connected: WiFi can't be changed from here, reboot goes through the OLT");
      if (m.r && ont?.pppoe && lower(ont.pppoe) !== lower(m.r.username)) fact("Note", `the OLT has this ONT under ${ont.pppoe}`, { cls: "warn" });
      fact("Login", loginRow(m, ont?.model || dev?.model || ""));
      parts.push(facts);
      // actions
      const acts = el("div", "actions"), btn = (label, fn, k) => { const b = el("button", "btn", label); b.type = "button"; b.onclick = fn; b.dataset.k = `${m.key}${k}`; acts.append(b); return b; };
      if (m.r) { const b = btn("Remote ↗", () => remoteGo(m.r), "remote"); b.classList.add("primary"); b.title = "Open the modem's page (R on the card)"; }
      if (dev) {
        btn(m.pw ? "Hide password" : m.pwBusy ? "Opening…" : "WiFi password", async () => {
          if (m.pw) { m.pw = null; return redraw(); }
          m.pwBusy = true; redraw();
          try { const j = await api(`/api/olt/acs/devices/${encodeURIComponent(dev.id)}/sandi-wifi`, {}); m.pw = j.data?.sandi ? j.data : { none: true }; clearTimeout(m.pwTimer); m.pwTimer = setTimeout(() => { m.pw = null; redraw(); }, 30000); }
          catch (err) { m.msg = { bad: true, text: `Password not shown: ${err.message}` }; }
          m.pwBusy = false; redraw(); }, "pw");
        btn(m.form ? "Cancel" : "Change WiFi", () => { m.form = m.form ? null : { pita: dev.ssid5 ? "keduanya" : "2.4GHz", ssid: dev.ssid, ssid5: dev.ssid5, password: "" }; m.wf.armed = 0; redraw(); }, "wifi");
      }
      const viaAcs = dev && Date.now() - new Date(dev.inform) < 15 * 60000, via = viaAcs ? "TR-069" : ont ? "the OLT" : null;
      if (via) {
        const rb = armButton(m.rb, `Reboot (via ${via})`, "Click again: reboot · offline ~1 min", async () => {
          m.rb.armed = 0; m.msg = { text: "Sending the reboot…" }; redraw();
          try {
            const j = viaAcs ? await api(`/api/olt/acs/devices/${encodeURIComponent(dev.id)}`, { action: "reboot" }) : await api("/api/admin/reboot-onu-by-sn", { serialNumber: ont.raw });
            const q = j.data?.status;
            shiftNote("tiket", `Reboot modem ${m.r?.username || ont?.raw || m.key} lewat ${via}`, m.r?.username || "");
            m.msg = { good: true, text: q === "queued-offline" ? "The modem isn't answering TR-069: the reboot waits until it does." : q === "queued-natbound" ? "Queued: it reboots at the modem's next report (within ~5 min)." : `Reboot sent via ${via}. Back in 1–3 minutes.` };
          } catch (err) { m.msg = { bad: true, text: `Reboot failed: ${err.message}` }; }
          redraw(); }, redraw, `${m.key}reboot`);
        rb.classList.remove("wide", "primary"); if (!rb.classList.contains("arm")) rb.classList.add("btn"); acts.append(rb);
      }
      parts.push(acts);
      { const u = m.r?.username || ont?.pppoe || dev?.pppoe; if (u) parts.push(webSection(m, u, dev, redraw)); }
      if (m.pw) { const box = el("div", "pw"); if (m.pw.none) box.append(el("span", null, "No WiFi password on record for this modem."));
        else { box.append(el("span", null, `${m.pw.ssid ? `${m.pw.ssid} · ` : ""}${m.pw.sandi}`)); const c = el("button", "copy", "Copy"); c.type = "button"; c.onclick = () => copy(m.pw.sandi, c); box.append(c); }
        parts.push(box, el("p", "note", "Hidden again in 30 seconds. Only give it to this modem's customer.")); }
      if (m.form && dev) parts.push(wifiForm(m, dev, redraw));
      if (m.msg) parts.push(el("p", `note ${m.msg.bad ? "late" : m.msg.good ? "good" : ""}`, m.msg.text));
      m.el.replaceChildren(...parts);
      if (focus && m.el.isConnected) m.el.querySelector(`[data-k="${focus}"]`)?.focus();
    }
