  // ---------- Aktivasi: a helper card in the activation form ----------
  // Technical → Antrean Aktivasi → ⚡ opens "Aktivasi Akun & Provisioning OLT". The card on top of it:
  // - FAT/ODP: the one the technician reported, matched to the database even when written loosely ("\FAT LDN NW15",
  //   "FAT 8BBLH"), and the nearest FATs/ODPs to the install point with distance and ports in use; Use fills the form's
  //   FAT and port fields the way you would by hand;
  // - Modem: Scan all OLTs sets the form to «Semua OLT» and presses its own Scan (every OLT and router at once);
  // - a checklist of what the form still needs, live.
  // On the queue each install date also says how many days it has waited; over 30 days is marked.
  // Everything here only reads or fills the form; Konfirmasi stays yours.
  {
    const AQ = "/technical-dashboard/activation-queue";
    const set = (input, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value"); d.set.call(input, v); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const norm = (x) => String(x ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
    async function get(path) {
      const auth = await fsToken(); if (!auth) throw new Error("not signed in");
      const r = await realFetch(path, { headers: { authorization: auth } }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }
    let queue = null, queueAt = 0, assets = null, lastRow = "";
    // the row whose ⚡ you pressed: its customer id (the small mono text under the name)
    document.addEventListener("pointerdown", (e) => { const tr = e.target.closest?.("tr"); if (tr && location.pathname.startsWith(AQ)) lastRow = tr.textContent; }, true);
    async function loadQueue() {
      if (queue && Date.now() - queueAt < 120e3) return queue;
      const f = "fields=namaPemohon,dataId,installationData,networkSurvey,shareLokasiGmaps,teknologiKoneksi,jadwalPemasangan,desa,kecamatan,kabupaten";
      const parts = await Promise.all(["Menunggu Aktivasi Akun", "Menunggu Aktivasi Account"].map((v) => get(`/api/pg-read/prospectiveCustomers?where=statusVerifikasi%3A${encodeURIComponent(v)}&limit=500&${f}`).then((j) => j.data || []).catch(() => [])));
      queue = parts.flat(); queueAt = Date.now(); return queue;
    }
    // the customer behind the form: the row you pressed, else the name. The list comes from the ERP's Postgres copy, which
    // can trail the live data by minutes; a miss asks again without the cache, then reads the live record directly
    // (the row's text runs together, "BUDI SANTOSOACQ-I-AB12-0001FTTH…", so no word boundaries)
    const rowId = () => /(ACQ-[A-Z0-9]+-[A-Z0-9]{4}-\d{4}|REG\d{3,}|TEST-AKT-[A-Z0-9]+-\d{2})/.exec(lastRow)?.[1] || "";
    async function findCustomer(rows, name) {
      const id = rowId(), pick = (list) => list.find((r) => id && r.dataId === id) || list.find((r) => name && String(r.namaPemohon || "").trim().toUpperCase() === name)
        || list.filter((r) => name && r.namaPemohon && name.startsWith(String(r.namaPemohon).trim().toUpperCase() + " ")).sort((x, y) => y.namaPemohon.length - x.namaPemohon.length)[0] || null;
      let c = pick(rows); if (c) return c;
      queueAt = 0; c = pick(await loadQueue().catch(() => [])); if (c) return c;
      const db = fsDb(); if (!db) return null;
      for (const [field, v] of [["id", id], ["namaPemohon", name]]) {
        if (!v) continue;
        const hit = (await fsList(db, "prospectiveCustomers", { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: v } } }).catch(() => []))[0];
        if (hit) return { ...hit, dataId: hit.id && hit.id.length < 30 ? hit.id : id };
      }
      return null;
    }
    async function loadAssets() {
      if (assets) return assets;
      const [opts, ...geo] = await Promise.all([get("/api/network-assets/odp-options?semua=1"),
        ...["FAT", "ODP"].map((t) => get(`/api/pg-read/networkAssets?where=tipeAset%3A${t}&fields=kodeAset,tipeAset,lokasiKoordinat,desa&limit=20000`).then((j) => j.data || []).catch(() => []))]);
      const at = new Map(geo.flat().map((a) => [a.id, a])), byCode = new Map(geo.flat().map((a) => [norm(a.kodeAset), a]));
      assets = (opts.options || []).filter((o) => o.kodeAset && o.kodeAset.trim() !== "..").map((o) => {
        const g = at.get(o.docId) || byCode.get(norm(o.kodeAset)), p = g?.lokasiKoordinat;
        return { ...o, key: norm(o.kodeAset), lat: p?.latitude ?? null, lng: p?.longitude ?? null };
      });
      return assets;
    }
    const where = (c) => { const m = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{2,3}\.\d{3,})/.exec(String(c?.shareLokasiGmaps || "")); return m ? { lat: +m[1], lng: +m[2] } : null; };
    // the technician's ODP text against the database: exact, then one code containing all of it, then every word found
    function reported(c, list) { return matchText(String(c?.installationData?.odpTerhubung || c?.networkSurvey?.odpTerdekat || ""), list); }
    function matchText(text, list) {
      const said = text.replace(/^[\s\\/]+/, "").trim();
      if (!said || norm(said).length < 3) return { said };
      const k = norm(said), words = said.toUpperCase().split(/[^A-Z0-9.]+/).map(norm).filter((w) => w.length > 1 && !/^(FAT|ODP|LDN)$/.test(w));
      let hits = list.filter((a) => a.key === k);
      if (!hits.length) hits = list.filter((a) => a.key.includes(k) || (k.length > 6 && k.includes(a.key) && a.key.length > 5))
        .sort((x, y) => Math.abs(x.key.length - k.length) - Math.abs(y.key.length - k.length)); // the closest in length first: "JIMAT 4C" before "JIMAT 4"
      if (!hits.length && words.length) hits = list.filter((a) => words.every((w) => a.key.includes(w)));
      return { said, hits: hits.slice(0, 3) };
    }
    async function useFat(dlg, a, port) {
      const btn = dlg.querySelector('[aria-label="Pilih FAT / ODP pelanggan dari database"]'); if (!btn) return false;
      btn.click(); await wait(250);
      const inp = document.querySelector("[cmdk-input]"); if (!inp) return false;
      set(inp, a.kodeAset); await wait(400);
      const item = [...document.querySelectorAll("[cmdk-item]")].find((it) => { const t = it.querySelector(".font-medium")?.firstChild?.textContent?.trim(); return t === a.kodeAset.trim(); });
      if (!item) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return false; }
      item.click(); await wait(300);
      if (port) { const p = dlg.querySelector('input[type="number"][placeholder="mis. 4"]'); if (p) set(p, String(port)); }
      return true;
    }
    async function scanAll(dlg) {
      const sel = [...dlg.querySelectorAll("select")].find((x) => /^Semua OLT/.test(x.options[0]?.textContent || "")); if (!sel) return;
      if (sel.value) { set(sel, ""); await wait(150); }
      [...dlg.querySelectorAll("button")].find((b) => /^Scan OLT/.test(b.textContent.trim()))?.click();
    }
    // what the form still needs, read straight from it
    function needs(dlg) {
      const fatBtn = dlg.querySelector('[aria-label="Pilih FAT / ODP pelanggan dari database"]'), fat = fatBtn && !/^(Pilih FAT|Memuat)/.test(fatBtn.textContent.trim());
      const port = dlg.querySelector('input[type="number"][placeholder="mis. 4"]')?.value;
      const sn = dlg.querySelector('input[placeholder^="Contoh: ZICG"]')?.value.trim();
      const olt = [...dlg.querySelectorAll("select")].find((x) => /^Semua OLT/.test(x.options[0]?.textContent || ""))?.value;
      const text = dlg.textContent, user = /Username "[^"]+" tersedia/.test(text) ? true : /Ganti username|sudah dipakai/i.test(text) ? false : null;
      const scanning = /Sedang memindai/.test(text);
      const name = [...dlg.querySelectorAll("label")].find((l) => l.textContent.trim() === "Nama Pelanggan")?.parentElement?.querySelector("input")?.value || "";
      return [["Name", /STARLITE\s*$/i.test(name)], ["FAT/ODP", !!fat], ["Port", !!port], ["OLT or modem", !!(sn || olt)], ["Modem SN", !!sn], ["Username", user]].map(([k, ok]) => ({ k, ok })).concat(scanning ? [{ k: "Scanning…", ok: null, busy: true }] : []);
    }
    const km = (m) => m == null ? "" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
    async function build(dlg) {
      const card = el("section", "erp-akt"); card.setAttribute("aria-label", "Dock: activation helper");
      const head = el("div", "hd"); head.append(el("span", "ey", "Dock · Aktivasi"), el("span", "chips"));
      const body = el("div", "bd"); body.append(el("p", "ld", "Reading the technician's report and the FAT list…"));
      card.append(head, body);
      const x = el("button", "x", "×"); x.type = "button"; x.title = "Close"; x.onclick = () => showHelper(false); head.append(x);
      helper = { dlg, card }; panelEl().replaceChildren(card);
      try {
        const [list, rows] = await Promise.all([loadAssets(), loadQueue()]);
        const label = [...dlg.querySelectorAll("label")].find((l) => l.textContent.trim() === "Nama Pelanggan");
        const name = label?.parentElement?.querySelector("input")?.value?.trim().toUpperCase();
        const c = await findCustomer(rows, name);
        body.replaceChildren();
        const inst = c?.installationData || {};
        if (c) {
          const facts = [inst.teknisi && `Technician ${inst.teknisi}`, (inst.odpTerhubung || c.networkSurvey?.odpTerdekat) && `ODP reported "${String(inst.odpTerhubung || c.networkSurvey?.odpTerdekat).trim()}"`,
            (inst.portOdp || c.networkSurvey?.portOdp) && `port ${inst.portOdp || c.networkSurvey?.portOdp}`, inst.redaman && `signal ${inst.redaman} dBm`, inst.modemTerpasang && `modem ${inst.modemTerpasang}`].filter(Boolean);
          body.append(el("p", "facts", facts.length ? facts.join(" · ") : "No installation report yet for this customer."));
        } else body.append(el("p", "facts", "Couldn't tell which customer this is: the suggestions below use nothing from the report."));
        const port = inst.portOdp || c?.networkSurvey?.portOdp || null, here = where(c);
        const row = (a, why, p = port, dist = false) => {
          const r = el("div", "opt"), used = `${a.portTerpakai ?? "?"}/${a.kapasitasPort || "?"} used${a.full ? " · FULL" : ""}`;
          const d = dist && here && a.lat != null ? km(metres(here, a)) : "";
          r.append(el("span", "code", a.kodeAset), el("span", "sub", [a.tipeAset, a.desa, used, d, why].filter(Boolean).join(" · ")));
          const b = el("button", null, "Use"); b.type = "button";
          b.onclick = async () => { b.disabled = true; b.textContent = "Filling…"; const ok = await useFat(dlg, a, p); b.textContent = ok ? "Filled" : "Not found in the form"; setTimeout(() => { b.disabled = false; b.textContent = "Use"; }, 2500); };
          r.append(b); return r;
        };
        // FAT/ODP: what the technician sends you first, the install report next, the nearest ones as a cross-check
        const fat = el("div", "blk"); fat.append(el("h4", null, "FAT / ODP"));
        const paste = el("input", "paste"); paste.type = "text"; paste.placeholder = "Paste what the technician sent, e.g. FAT 8BBLH port 6";
        paste.setAttribute("aria-label", "FAT from the technician"); const found = el("div", "blk");
        let tmo = 0;
        paste.oninput = () => { clearTimeout(tmo); tmo = setTimeout(() => {
          const t = paste.value, pm = /\bport\s*:?\s*(\d{1,2})\b/i.exec(t) || /[\/#-]\s*(\d{1,2})\s*$/.exec(t.trim());
          const said = pm ? t.replace(pm[0], " ") : t, m = matchText(said.replace(/\b(nya|nomor|no|di|ke|pakai|masuk|ya|pak|mas)\b\.?:?/gi, " ").replace(/\b(fat|odp)(\s+\1\b)+/gi, "$1"), list);
          const p = pm ? pm[1] : port;
          found.replaceChildren();
          if (!t.trim()) return;
          if (m.hits?.length) m.hits.forEach((a) => found.append(row(a, `matches what you pasted${p ? `, port ${p}` : ""}`, p)));
          else found.append(el("p", "warn", `Nothing in the FAT database matches "${m.said || t.trim()}". Check the code with the technician, or have it added in Aset & Peta.`));
        }, 250); };
        fat.append(paste, found);
        const rep = c ? reported(c, list) : { said: "" };
        if (rep.hits?.length) { fat.append(el("p", "sub", "From the installation report:")); rep.hits.forEach((a) => fat.append(row(a, `matches "${rep.said}"${port ? `, port ${port}` : ""}`))); }
        else if (rep.said) fat.append(el("p", "warn", `The installation report says "${rep.said}", which isn't in the FAT database.`));
        // the nearest ones, folded: a check that the technician's FAT is plausible, not a pick
        const nearBox = el("details", "near"); nearBox.append(el("summary", null, "Nearest FATs to the install point"));
        if (here) {
          list.filter((a) => a.lat != null && !a.full).map((a) => [a, metres(here, a)]).sort((x, y) => x[1] - y[1]).slice(0, 5).forEach(([a]) => nearBox.append(row(a, "", port, true)));
        } else nearBox.append(el("p", "sub", c?.shareLokasiGmaps ? "The install location is a short link, so no distances: open it from the queue map." : "No install location on record."));
        fat.append(nearBox);
        // username: other names in the ERP's own style (first name + initials + village code, 15 at most), each checked
        const un = el("div", "blk"); un.append(el("h4", null, "Username"));
        const ulabel = [...dlg.querySelectorAll("label")].find((l) => l.textContent.trim().startsWith("Username Radius")), uin = ulabel?.parentElement?.querySelector("input");
        const nameNow = [...dlg.querySelectorAll("label")].find((l) => l.textContent.trim() === "Nama Pelanggan")?.parentElement?.querySelector("input")?.value || c?.namaPemohon || "";
        if (uin && nameNow) {
          const words = nameNow.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
          // the village code is what's left after the name part; a trailing 2–9 on a 4-digit code is the form's "already taken" suffix
          const base = (words[0] || "") + words.slice(1).map((w) => w[0]).join(""), v = uin.value.toLowerCase();
          let k = 0; while (k < base.length && v[k] === base[k]) k++;
          let code = /^\d+$/.test(v.slice(k)) ? v.slice(k) : /\d{2,}$/.exec(v)?.[0] || "";
          if (code.length === 5 && /[2-9]$/.test(code)) code = code.slice(0, 4);
          const fit = (b, suf = "") => b.slice(0, Math.max(1, 15 - code.length - suf.length)) + code + suf;
          const desa = String(c?.desa || "").toLowerCase().replace(/[^a-z]/g, "");
          // every idea is name + village code; when the plain name is taken (the form added a 2–9), the village name goes in
          // between instead of the extra number: budisukorejo0601 rather than budis06012
          const taken = /\d{4}[2-9]$/.test(v) || /Ganti username/i.test(ulabel?.parentElement?.textContent || ""); // only the username's own message
          const vil = (b) => desa && fit(b.slice(0, 6) + desa);
          const village = [
            vil(words[0] || ""),                                                     // budisukor0601
            words.length > 1 && vil(base),                                           // budissukor0601
          ];
          const plain = [
            words.length > 1 && fit(words[0] + words[1]),                            // budisantoso0601
            words.length > 1 && fit(words[1] + words[0][0]),                         // santosob0601
            words.length > 1 && fit(words[words.length - 1] + words[0].slice(0, 3)), // wijayabud0601
            words.length > 2 && fit(words[0] + words[1][0] + words[2]),              // budiswijaya0601
            words.length === 1 && fit(words[0].slice(0, 6)),                         // sutris0610
          ];
          const ideas = [...new Set((taken ? [...village, ...plain] : [...plain, ...village]).filter((u) => u && u.length >= 3 && u !== uin.value))].slice(0, 6);
          un.append(el("p", taken ? "warn" : "sub", taken ? `In the form: ${uin.value}: the plain name was taken, so the form added a number. With the village name instead:` : `In the form: ${uin.value || "–"}. Other names with the village code:`));
          for (const u of ideas) {
            const r = el("div", "opt"), st = el("span", "sub", "checking…");
            r.append(el("span", "code", u), st);
            const b = el("button", null, "Use"); b.type = "button"; b.disabled = true;
            b.onclick = () => { set(uin, u); b.textContent = "Filled"; setTimeout(() => (b.textContent = "Use"), 1500); };
            r.append(b); un.append(r);
            get(`/api/admin/ldn-radius/check-username?username=${encodeURIComponent(u)}`).then((j) => {
              const free = j.ok && !j.exists; st.textContent = free ? "free" : j.orphan ? "left over in RADIUS: avoid" : "taken"; st.className = `sub ${free ? "free" : "taken"}`; b.disabled = !free;
            }).catch(() => { st.textContent = "couldn't check"; });
          }
        }
        // the customer's name as the ERP lists it: name + village + STARLITE
        const nm = el("div", "blk"); nm.append(el("h4", null, "Nama Pelanggan"));
        const nin = [...dlg.querySelectorAll("label")].find((l) => l.textContent.trim() === "Nama Pelanggan")?.parentElement?.querySelector("input");
        if (nin && c?.desa) {
          const want = `${String(c.namaPemohon || nin.value).trim()} ${String(c.desa).trim()} STARLITE`.toUpperCase().replace(/\s+/g, " ");
          if (nin.value.trim().toUpperCase() === want) nm.append(el("p", "sub", `${want} (already in the form)`));
          else { const r = el("div", "opt"); r.append(el("span", "code", want), el("span", "sub", `adds the village (${c.desa}${c.kecamatan ? `, Kec. ${c.kecamatan}` : ""}) and STARLITE`));
            const b = el("button", null, "Use"); b.type = "button"; b.onclick = () => { set(nin, want); b.textContent = "Filled"; setTimeout(() => (b.textContent = "Use"), 1500); }; r.append(b); nm.append(r); }
        } else nm.append(el("p", "sub", "No village on record for this customer."));
        body.append(nm, fat, un);
      } catch (e) { body.replaceChildren(el("p", "warn", `Helper not loaded: ${e.message}`)); }
    }
