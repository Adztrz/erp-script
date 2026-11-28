    // ---- data from what's kept ----
    let customers = null, custAt = 0, invoices = null, invKey = "";
    const prep = (rows) => { for (const r of rows) { r._name = fold(r.nama); r._hay = ` ${r._name} ${fold(r.username)} ${fold(r.address)} ${fold(r.desa)} ${fold(r.kecamatanErp)} ${fold(r.router)} ${fold(r.paket)} ${digits(r.phone)} ${fold(r.ip)} ${fold(r.ontSerial)} `;
      r._words = [...new Set(r._hay.trim().split(" ").filter((x) => x.length > 1 && !/^\d+$/.test(x)).map(sound))]; r._sound = ` ${r._words.join(" ")} `; } return rows; };
    // Customers the ERP has but LDN RADIUS doesn't (its master list, 215 on 28 Nov 2026: 40 of them Aktif): the
    // customer list comes from LDN, so they were never found. Once per 12 hours the master list is read (only the
    // fields shown here, ~6 MB) and those missing from LDN are kept, so a search still finds them, marked. Merged
    // duplicates ("Digabung") are left out.
    let outside = null, outsideAt = 0, outsideLoading = null;
    const OUTSIDE_FIELDS = "id,name,desa,kecamatan,router,status,phone,noWa,address,pppoeUsername,radiusUsername,radiusRouter,radiusPlanName,ontSerialNumber,radiusSyncedAt";
    const tsOf = (v) => (v?.seconds ? v.seconds * 1000 : v ? Date.parse(v) || 0 : 0);
    function outsideRefresh() {
      return (outsideLoading ||= (async () => {
        if (!customers?.length) return;
        const j = await api(`/api/pg-read/customers?limit=50000&fields=${OUTSIDE_FIELDS}`);
        const ids = new Set(customers.map((r) => r.customerDocId).filter(Boolean)), us = new Set(customers.map((r) => lower(r.username)));
        const rows = (j.data || []).filter((c) => c.status !== "Digabung" && !ids.has(c.id) && !us.has(lower(c.pppoeUsername || c.radiusUsername || "")))
          .map((c) => ({ username: c.pppoeUsername || c.radiusUsername || "", nama: c.name || "", phone: c.phone || c.noWa || "", address: c.address || "", desa: c.desa || "",
            kecamatanErp: c.kecamatan || "", router: c.radiusRouter || c.router || "", paket: c.radiusPlanName || "", ontSerial: c.ontSerialNumber || "", customerDocId: c.id,
            isolir: c.status === "Terisolir", online: false, outside: c.status || "no status", syncedAt: tsOf(c.radiusSyncedAt) }));
        const v = { at: Date.now(), rows }; await idbPut("outside", v); outside = prep(rows); outsideAt = v.at;
      })().catch(() => {}).finally(() => { outsideLoading = null; }));
    }
    async function data() {
      const kept = await idbGet("all");
      if (kept?.rows && kept.at !== custAt) { customers = prep(kept.rows); custAt = kept.at; }
      if (!outside) { const o = await idbGet("outside"); if (o?.rows) { outside = prep(o.rows); outsideAt = o.at; } }
      if (customers && Date.now() - outsideAt > 12 * 3600000 && !outsideLoading) outsideRefresh().then(() => { if (panel && view.q) drawBody(); });
      const now = new Date(), key = `inv-${now.getFullYear()}-${now.getMonth() + 1}`;
      if (key !== invKey || !invoices) { const k = await idbGet(key); if (k?.rows) { invoices = k.rows; invKey = key; } }
    }
    let findMemo = null; // what the last full search found (see narrows)
    function findCustomers(q, max = 6) {
      if (!customers) return [];
      const words = fold(q).split(" ").filter(Boolean), num = digits(q); if (!words.length) return [];
      const narrowed = !!findMemo && findMemo.rows === customers && narrows(findMemo, words, num), pool = narrowed ? findMemo.all : customers;
      const sounds = words.map(sound), out = [], seen = new Set();
      for (const r of pool) {
        let score = -1;
        if (num.length >= 6 && r._hay.includes(num)) score = 0;
        else if (words.every((w) => r._hay.includes(w))) score = r._name.startsWith(words.join(" ")) ? 0 : words.every((w) => r._name.includes(w)) ? 1 : 2;
        else if (words.every((w, i) => r._hay.includes(w) || (w.length >= 4 && r._sound.includes(" " + sounds[i])))) score = 3;
        if (score >= 0) { out.push([score, r]); seen.add(r); }
      }
      const full = out.length < 3;
      if (full) for (const r of pool) {
        if (seen.has(r)) continue;
        if (words.every((w, i) => r._hay.includes(w) || (w.length >= 4 && fuzzyHit(sounds[i], r._words, w.length >= 9 ? 2 : 1)))) out.push([4, r]);
      }
      if (full) findMemo = { words, num, rows: customers, all: out.map((x) => x[1]) }; else if (!narrowed) findMemo = null;
      // then the ERP's customers missing from LDN (marked on the result), after every LDN match
      if (out.length < max && outside?.length) for (const r of outside) {
        if ((num.length >= 6 && r._hay.includes(num)) || words.every((w, i) => r._hay.includes(w) || (w.length >= 4 && r._sound.includes(" " + sounds[i])))) out.push([5, r]);
      }
      return out.sort((a, b) => a[0] - b[0] || (a[1]._name < b[1]._name ? -1 : 1)).slice(0, max).map((x) => x[1]);
    }
    const pages = () => { const m = new Map(START); for (const [h, t] of Object.entries(ls.get(PAGES, {}))) m.set(h, t); return [...m]; };
    function findPages(q, max = 5) {
      const words = fold(q).split(" ").filter(Boolean); if (!words.length) return [];
      return pages().map(([h, t]) => { const hay = ` ${fold(t)} ${fold(h)} `; const ok = words.every((w) => hay.includes(w)); return ok ? [fold(t).startsWith(words[0]) ? 0 : 1, h, t] : null; })
        .filter(Boolean).sort((a, b) => a[0] - b[0] || a[2].length - b[2].length).slice(0, max).map(([, h, t]) => ({ h, t }));
    }
    // learn the pages from the sidebar as they show up
    const learn = () => { const m = ls.get(PAGES, {}); let n = 0;
      for (const a of document.querySelectorAll('a[href^="/"]')) { const t = a.innerText.trim().replace(/\s+/g, " "); const h = a.getAttribute("href");
        if (!t || t.length > 60 || /^\d|^CTR-/.test(t) || h.includes("?") || m[h] === t) continue; m[h] = t; n++; }
      if (n) ls.set(PAGES, m); };

