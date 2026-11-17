    // ---- after Konfirmasi: is it really working? ----
    // Pressing Konfirmasi keeps a note of what was activated. Once the form closes, a card in the corner checks every
    // 20 s for up to 15 minutes: the PPPoE session in RADIUS (online, IP, router) and the modem on its OLT (status,
    // signal). It ends with a verdict and a WhatsApp-ready note; a weak signal (below −27 dBm) is flagged while the
    // technician is still on site. Kept for this tab, so a reload doesn't lose it.
    const CHK = "erpDock.aktChecks";
    const checks = () => { try { return JSON.parse(sessionStorage.getItem(CHK) || "[]"); } catch { return []; } };
    const keep = (list) => { try { sessionStorage.setItem(CHK, JSON.stringify(list.slice(-4))); } catch {} };
    let armed = null; // what the form held when Konfirmasi was pressed
    document.addEventListener("pointerdown", (e) => {
      const b = e.target.closest?.("button"); if (!b || !/^Konfirmasi/.test(b.textContent.trim()) || b.disabled) return;
      const dlg = b.closest("[role=dialog]"); if (!dlg || !/Aktivasi Akun/.test(dlg.textContent)) return;
      const val = (label) => { const l = [...dlg.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith(label)); return l?.parentElement?.querySelector("input")?.value?.trim() || ""; };
      const olt = [...dlg.querySelectorAll("select")].find((x) => /^Semua OLT/.test(x.options[0]?.textContent || ""));
      armed = { at: Date.now(), name: val("Nama Pelanggan"), user: val("Username Radius"), sn: dlg.querySelector('input[placeholder^="Contoh: ZICG"]')?.value.trim() || "",
        fat: dlg.querySelector('[aria-label="Pilih FAT / ODP pelanggan dari database"]')?.textContent.replace(/·.*$/, "").trim() || "",
        port: dlg.querySelector('input[type="number"][placeholder="mis. 4"]')?.value || "", olt: olt?.value ? olt.selectedOptions[0].textContent : "" };
    }, true);
    function confirmWatch() {
      if (!armed) return;
      // the ERP keeps a closed copy of the form in the page (data-state="closed"), so only an open one counts
      const open = [...document.querySelectorAll("[role=dialog]")].some((d) => d.dataset.state !== "closed" && /Aktivasi Akun/.test(d.textContent));
      if (open) { if (Date.now() - armed.at > 180e3) armed = null; return; } // still open long after: it failed, nothing to check
      if (armed.user) {
        const a = { ...armed, start: Date.now() };
        keep([...checks().filter((c) => c.user !== a.user), a]); drawChecks();
        // the technician and the location come from the calon pelanggan record of the same name
        loadQueue().then((rows) => findCustomer(rows, a.name.toUpperCase())).then((r) => {
          if (!r) return;
          const at = installAt(r);
          const ka = kaOf(r.desa);
          keep(checks().map((c) => c.user === a.user ? { ...c, base: r.namaPemohon || "", tech: r.installationData?.teknisi || "", desa: r.desa || "", kec: r.kecamatan || "", ka, maps: at ? `${at.lat.toFixed(6)}, ${at.lng.toFixed(6)}` : /^https?:/.test(r.shareLokasiGmaps || "") ? r.shareLokasiGmaps : "" } : c));
          drawChecks();
          if (!ka) loadKa().then(() => { const k = kaOf(r.desa); if (k) { keep(checks().map((c) => c.user === a.user ? { ...c, ka: k } : c)); drawChecks(); } });
        }).catch(() => {});
      }
      armed = null;
    }
    let sessions = null, ontCache = null;
    async function sessionOf(user) {
      if (!sessions || Date.now() - sessions.at > 15e3) { const j = await get("/api/admin/ldn-radius/panel?view=online"); sessions = { at: Date.now(), by: new Map((j.sessions || []).map((x) => [String(x.username).toLowerCase(), x])) }; }
      return sessions.by.get(user.toLowerCase()) || null;
    }
    // the modem on its OLT: the one named in the form first, the rest only if it isn't there
    async function ontOf(sn, oltName) {
      const want = norm(sn); if (!want) return null;
      if (!ontCache || Date.now() - ontCache.at > 600e3) ontCache = { at: Date.now(), profiles: (await get("/api/olt/profiles")).data || [] };
      const pr = [...ontCache.profiles].sort((a, b) => (b.name === oltName) - (a.name === oltName));
      for (let i = 0; i < pr.length; i += 6) {
        const found = (await Promise.all(pr.slice(i, i + 6).map((p) => get(`/api/olt/profiles/${p.id}/onts?cached=1`).then((j) => {
          const o = (j.data || []).find((x) => norm(x.serialNumber) === want); return o ? { ...o, olt: p.name } : null; }).catch(() => null)))).find(Boolean);
        if (found) return found;
      }
      return null;
    }
    const hm = (t) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    let box = null, polling = false;
    async function pollChecks() {
      if (polling || document.hidden) return; polling = true;
      try {
        const list = checks(); let changed = false;
        for (const c of list) {
          if (c.done || c.closed) continue;
          try {
            const s = await sessionOf(c.user);
            c.sess = s ? { ip: s.framedipaddress || "", ro: s.router || s.nasipaddress || "", up: Number(s.uptimeSec) || 0 } : null;
            if (c.sn) { const o = await ontOf(c.sn, c.olt); c.ont = o ? { olt: o.olt, pon: [o.frame, o.slot, o.port].filter((x) => x != null).join("/"), id: o.ontId, st: o.status || "", rx: o.rxPower ?? null, at: o.signalPolledAt || o.lastSeenAt || null } : null; }
            c.err = "";
          } catch (e) { c.err = e.message; }
          c.last = Date.now();
          if ((c.sess && (!c.sn || c.ont?.rx != null)) || Date.now() - c.start > 15 * 60e3) c.done = true;
          changed = true;
        }
        if (changed) { keep(list); drawChecks(); }
      } finally { polling = false; }
    }
    function verdict(c) {
      const rx = c.ont?.rx != null && c.ont.rx !== 0 ? Number(c.ont.rx) : null;
      if (c.sess && rx != null && rx < -27) return { cls: "warn", t: `Online, but the signal is weak (${rx.toFixed(1)} dBm): have the technician check the connectors before leaving` };
      if (c.sess) return { cls: "ok", t: rx != null ? `Working: online and the signal is good (${rx.toFixed(1)} dBm)` : "Online: the PPPoE session is up" };
      if (c.done) return { cls: "bad", t: "Not online after 15 minutes: check the activation went through, the modem's PPPoE settings and the cable" };
      return { cls: "wait", t: "Waiting for the modem to log in…" };
    }
    // the KA of a village: the kepala teknis whose wilayahPenempatan lists it (a village name shared by two kecamatan can give two)
    let kas = null;
    const loadKa = () => kas ? Promise.resolve(kas) : get("/api/pg-read/employees?where=role%3Akepala_teknis&fields=name,wilayahPenempatan&limit=100")
      .then((j) => (kas = (j.data || []).map((e) => ({ name: e.name, desa: new Set((e.wilayahPenempatan || []).map((d) => String(d).trim().toLowerCase())) })))).catch(() => (kas = []));
    loadKa();
    const kaOf = (desa) => !kas || !desa ? "" : kas.filter((k) => k.desa.has(String(desa).trim().toLowerCase())).map((k) => k.name).join(" / ");
    // the snippet to paste: modem SN, name (+ village + STARLITE), username, technician, location, KA
    function fields(c) {
      const loc = [c.desa && `Desa ${c.desa}`, c.kec && `Kec. ${c.kec}`].filter(Boolean).join(", ");
      const name = String(c.name || c.base || "").trim().toUpperCase().replace(/\s+/g, " ");
      const full = !name || /STARLITE$/.test(name) || !c.desa ? name : `${name} ${String(c.desa).toUpperCase()} STARLITE`;
      return [["SN Modem", c.sn || "-"], ["Nama", full || "-"], ["Username", c.user], ["Teknisi", c.tech || "-"], ["Lokasi", loc || "-"], ["KA", c.ka || "-"], [/^https?:/.test(c.maps || "") ? "Maps" : "Koordinat", c.maps]].filter((f) => f[1]);
    }
    const note = (c) => fields(c).map(([k, v]) => k === "Maps" ? v : `${k}: ${v}`).join("\n");
    // copy text and say so on the button for a moment
    // (falls back to the old copy command when the clipboard API is refused)
    const oldCopy = (text) => { const t = el("textarea"); t.value = text; t.style.cssText = "position:fixed;opacity:0"; document.body.append(t); t.select(); const ok = document.execCommand("copy"); t.remove(); if (!ok) throw 0; };
    const copyTo = (b, text) => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => oldCopy(text)).then(() => {
      b.classList.remove("fail"); b.classList.add("did"); if (b.classList.contains("all")) b.textContent = "Copied";
      setTimeout(() => { b.classList.remove("did"); if (b.classList.contains("all")) b.textContent = "Copy all"; }, 1200);
    }).catch(() => { b.classList.add("fail"); if (b.classList.contains("all")) b.textContent = "Couldn't copy: select the text"; });
    function drawChecks() {
      const list = checks().filter((c) => !c.closed);
      if (!list.length) { box?.remove(); box = null; return; }
      if (!box) { box = el("aside", "erp-akt erp-akt-after"); box.setAttribute("aria-label", "After activation"); box.setAttribute("aria-live", "polite"); document.body.append(box); }
      box.replaceChildren(...list.map((c) => {
        const v = verdict(c), it = el("div", "aft");
        const hd = el("div", "hd"); hd.append(el("span", "ey", "After activation"), el("span", "who", c.name || c.user));
        const x = el("button", "x", "×"); x.type = "button"; x.title = "Close"; x.onclick = () => { keep(checks().map((k) => k.user === c.user ? { ...k, closed: true } : k)); drawChecks(); }; hd.append(x);
        const bd = el("div", "bd");
        bd.append(el("p", `verdict ${v.cls}`, v.t));
        const lines = [
          ["PPPoE", c.sess ? `online · ${c.sess.ro}${c.sess.ip ? ` · ${c.sess.ip}` : ""} · up ${Math.round(c.sess.up / 60)} min` : `${c.user} not online yet`],
          ["Modem", !c.sn ? "no SN in the form: authorise the ONT in the OLT module" : c.ont ? `${c.ont.st || "?"} · ${c.ont.olt} PON ${c.ont.pon}:${c.ont.id ?? "?"}${c.ont.rx ? ` · ${Number(c.ont.rx).toFixed(1)} dBm` : ""}${c.ont.at ? ` · read ${when(c.ont.at)}` : ""}` : `${c.sn} not on an OLT list yet`],
          ["FAT", c.fat ? `${c.fat}${c.port ? ` port ${c.port}` : ""}` : "–"]];
        for (const [k, t] of lines) { const r = el("p", "kv"); r.append(el("b", null, k), t); bd.append(r); }
        if (c.err) bd.append(el("p", "warn", c.err));
        bd.append(el("p", "sub", c.done ? `Checked ${hm(c.last)}` : `Checking every 20 s since ${hm(c.start)}${c.last ? ` · last ${hm(c.last)}` : ""}`));
        // each line copies just its value; Copy all still gives the whole snippet
        const snip = el("div", "snip");
        for (const [k, v] of fields(c)) {
          const r = el("button", "ln"); r.type = "button"; r.title = `Copy ${k}`;
          r.append(el("span", "k", k), el("span", "v", v)); r.onclick = () => copyTo(r, v);
          snip.append(r);
        }
        const cp = el("button", "all", "Copy all"); cp.type = "button"; cp.onclick = () => copyTo(cp, note(c));
        bd.append(snip, cp); it.append(hd, bd); return it;
      }));
    }
    const when = (t) => { const m = Math.floor((Date.now() - new Date(t)) / 60000); return m < 1 ? "just now" : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
    setInterval(() => { tick(); confirmWatch(); }, 600);
    setInterval(pollChecks, 20e3);
    setTimeout(() => { if (checks().some((c) => !c.closed)) { drawChecks(); pollChecks(); } }, 1500);
    const css = el("style"); css.textContent = `
      .erp-akt-pane { position: fixed; z-index: 2147483003; width: min(440px, calc(100vw - 32px)); max-height: min(78vh, 760px); overflow: auto; border-radius: 10px;
        background: #090b0c; box-shadow: inset 0 0 0 1px #363738, 0 40px 32px rgba(0,0,0,.18), 0 22px 18px rgba(0,0,0,.2), 0 6px 5px rgba(0,0,0,.18);
        animation: erp-akt-in .32s cubic-bezier(.22, 1, .36, 1) both; }
      @keyframes erp-akt-in { from { opacity: 0; transform: translateY(8px); clip-path: inset(100% 0 0 0 round 10px); } to { opacity: 1; transform: none; clip-path: inset(0 0 0 0 round 10px); } }
      .erp-akt-pane > .erp-akt { margin: 0; box-shadow: none; background: none; }
      .erp-akt-pane .x { margin-left: 4px; padding: 0 8px; background: none; color: #8a8b8a; font-size: 18px; line-height: 1; }
      .erp-akt-pane .x:hover { color: #efefed; }
      .erp-akt-wait { margin: 0; padding: 16px; color: #8a8b8a; font: 400 13px Inter, system-ui, sans-serif; }
      .erp-dock-fab.akt { pointer-events: auto; }
      .erp-dock-fab.akt::after { content: ""; position: absolute; top: 6px; left: 6px; width: 9px; height: 9px; border-radius: 50%; background: #fff;
        box-shadow: 0 0 0 2px #090b0c, 0 0 0 0 rgba(255,255,255,.6); animation: erp-akt-dot 1.8s ease-out infinite; }
      @keyframes erp-akt-dot { 70% { box-shadow: 0 0 0 2px #090b0c, 0 0 0 8px rgba(255,255,255,0); } 100% { box-shadow: 0 0 0 2px #090b0c, 0 0 0 0 rgba(255,255,255,0); } }
      @media (prefers-reduced-motion: reduce) { .erp-akt-pane, .erp-dock-fab.akt::after { animation: none; } }
      .erp-akt-after { position: fixed; left: 16px; bottom: 16px; z-index: 2147483000; width: min(380px, calc(100vw - 32px)); max-height: 70vh; overflow: auto; margin: 0;
        box-shadow: inset 0 0 0 1px #363738, 0 22px 18px rgba(0,0,0,.2), 0 6px 5px rgba(0,0,0,.18); }
      .erp-akt-after .aft + .aft { border-top: 1px solid var(--hair); }
      .erp-akt-after .who { color: var(--paper); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
      .erp-akt-after .x { margin-left: auto; padding: 0 8px; background: none; color: var(--muted); font-size: 18px; line-height: 1; }
      .erp-akt-after .x:hover { color: var(--paper); }
      .erp-akt-after .verdict { margin: 0; font-weight: 500; }
      .erp-akt-after .verdict.ok { color: var(--green); } .erp-akt-after .verdict.warn { color: var(--amber); } .erp-akt-after .verdict.bad { color: #ff8a7a; } .erp-akt-after .verdict.wait { color: var(--paper); }
      .erp-akt-after .kv { margin: 0; font-size: 12px; } .erp-akt-after .kv b { display: inline-block; width: 52px; font-weight: 500; color: var(--muted); }
      .erp-akt-after .bd > button { justify-self: start; }
      .erp-akt-after .snip { margin: 2px 0 0; padding: 8px 10px; border-radius: 6px; background: #1a1d1e; box-shadow: inset 0 0 0 1px #363738; color: #efefed;
        font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; display: grid; padding: 4px; }
      .erp-akt-after .snip .ln { all: unset; box-sizing: border-box; display: grid; grid-template-columns: 64px 1fr auto; gap: 8px; padding: 4px 6px; border-radius: 4px; cursor: copy; }
      .erp-akt-after .snip .ln:hover, .erp-akt-after .snip .ln:focus-visible { background: #262727; }
      .erp-akt-after .snip .ln:focus-visible { box-shadow: inset 0 0 0 1px #8a8b8a; }
      .erp-akt-after .snip .k { color: #8a8b8a; } .erp-akt-after .snip .v { color: #efefed; word-break: break-all; }
      .erp-akt-after .snip .ln::after { content: "copy"; color: #8a8b8a; opacity: 0; transition: opacity .15s; }
      .erp-akt-after .snip .ln:hover::after, .erp-akt-after .snip .ln:focus-visible::after { opacity: 1; }
      .erp-akt-after .snip .ln.did::after { content: "copied"; color: #55bc82; opacity: 1; }
      .erp-akt-after .snip .ln.fail::after { content: "couldn't copy"; color: #ff8a7a; opacity: 1; }
      .erp-akt-after .snip .ln, .erp-akt-after .snip .v { user-select: text; }
      .erp-akt-after .all.did { color: #55bc82; }
      .erp-akt { --bone: #e9e1dc; --paper: #efefed; --body: #b3b0af; --muted: #8a8b8a; --hair: #262727; --edge: #363738; --green: #55bc82; --red: #f12614; --amber: #e0b04f;
        margin: 4px 0 8px; border-radius: 8px; background: #090b0c; box-shadow: inset 0 0 0 1px var(--edge); color: var(--body); font: 400 13px/1.45 Inter, ui-sans-serif, system-ui, sans-serif; }
      .erp-akt .hd { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 14px; border-bottom: 1px solid var(--hair); }
      .erp-akt .ey { font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); display: inline-flex; align-items: center; gap: 8px; }
      .erp-akt .ey::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); }
      .erp-akt .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
      .erp-akt .chip { padding: 2px 8px; border-radius: 999px; font-size: 12px; box-shadow: inset 0 0 0 1px var(--edge); color: var(--muted); }
      .erp-akt .chip::before { content: "○ "; } .erp-akt .chip.ok { color: var(--green); } .erp-akt .chip.ok::before { content: "✓ "; }
      .erp-akt .chip.bad { color: #ff8a7a; } .erp-akt .chip.bad::before { content: "✕ "; } .erp-akt .chip.busy { color: var(--paper); } .erp-akt .chip.busy::before { content: "◌ "; }
      .erp-akt .bd { padding: 10px 14px 12px; display: grid; gap: 10px; }
      .erp-akt .facts { margin: 0; color: var(--paper); }
      .erp-akt .blk { display: grid; gap: 4px; }
      .erp-akt h4 { margin: 4px 0 2px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
      .erp-akt .opt { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 12px; align-items: center; padding: 6px 8px; border-radius: 6px; }
      .erp-akt .opt:hover { background: #1a1d1e; }
      .erp-akt .paste { width: 100%; box-sizing: border-box; height: 36px; padding: 0 10px; border: 0; border-radius: 6px; background: #1a1d1e; color: var(--paper);
        box-shadow: inset 0 0 0 1px var(--edge); font: 400 13px Inter, system-ui, sans-serif; }
      .erp-akt .paste:focus { outline: none; box-shadow: inset 0 0 0 1px var(--bone); }
      .erp-akt .sub.free { color: var(--green); } .erp-akt .sub.taken { color: var(--muted); text-decoration: line-through; }
      .erp-akt details.near summary { cursor: pointer; font-size: 12px; color: var(--muted); padding: 4px 0; }
      .erp-akt details.near summary:hover { color: var(--paper); }
      .erp-akt .code { color: var(--paper); font: 500 13px/1.4 "JetBrains Mono", ui-monospace, monospace; }
      .erp-akt .opt .sub { grid-column: 1; }
      .erp-akt .opt button { grid-row: 1 / 3; grid-column: 2; }
      .erp-akt .sub { margin: 0; font-size: 12px; color: var(--muted); }
      .erp-akt .warn { margin: 0; font-size: 12px; color: var(--amber); }
      .erp-akt button { border: 0; border-radius: 6px; padding: 6px 12px; font: 500 12px Inter, system-ui, sans-serif; cursor: pointer; background: var(--bone); color: #07090b; }
      .erp-akt button:disabled { opacity: .6; cursor: default; }
      .erp-akt button.wide { justify-self: start; }
      .erp-akt .ld { margin: 0; color: var(--muted); }
      .erp-akt .ld::before { content: ""; display: inline-block; vertical-align: -1px; width: 31px; height: 9px; margin-right: 8px;
        background: radial-gradient(circle, var(--bone) 0 1.2px, transparent 1.7px) 0 0 / 5px 5px; opacity: .6; animation: erp-akt-ld 1.2s ease-in-out infinite; }
      @keyframes erp-akt-ld { 50% { opacity: .2; } }
      .erp-age { display: inline-block; margin-left: 8px; padding: 1px 6px; border-radius: 999px; font-size: 11px; color: #8a8b8a; box-shadow: inset 0 0 0 1px #363738; white-space: nowrap; }
      .erp-age.old { color: #e0b04f; box-shadow: inset 0 0 0 1px rgba(224,176,79,.5); }
      @media (prefers-reduced-motion: reduce) { .erp-akt .ld::before { animation: none; } }`;
    (document.head || document.documentElement).append(css);
  }

