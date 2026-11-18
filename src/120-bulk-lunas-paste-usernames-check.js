    // ---- Bulk Lunas: paste usernames, check each one's unpaid months, mark them paid ----
    // The same request as the ERP's own Tandai Lunas Manual: one invoice per request with its RADIUS recharge, under the
    // server's oldest-first rule. Three customers are paid at once; one customer's months go one after another, oldest
    // first. "Latest month only" ticks each customer's newest month and skips the older ones (the ERP's own override,
    // with a note). Nothing is sent until you press the button twice.
    const METHODS = ["Tunai", "Transfer Bank", "Setor Reseller", "Setor Teknisi"];
    const UNPAID = new Set(["Belum Lunas", "Jatuh Tempo"]);
    const todayIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
    let bulk = null;
    // a fresh sign-in token: Firebase's own copy while it's valid, else the last one the page used
    async function token() {
      try {
        const db = await new Promise((ok, no) => { const q = indexedDB.open("firebaseLocalStorageDb"); q.onupgradeneeded = () => q.transaction.abort(); q.onsuccess = () => ok(q.result); q.onerror = no; });
        const all = await new Promise((ok, no) => { const q = db.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll(); q.onsuccess = () => ok(q.result); q.onerror = no; });
        db.close();
        const t = all.map((x) => x.value?.stsTokenManager).find((m) => m?.accessToken && m.expirationTime > Date.now() + 60000);
        if (t) return `Bearer ${t.accessToken}`;
      } catch {}
      return lastAuth;
    }
    async function api(path, body) {
      const auth = await token(); if (!auth) throw new Error("Not signed in yet: let the page load, then try again");
      const r = await realFetch(path, body ? { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { authorization: auth } });
      const text = await r.text().catch(() => ""); let j = {};
      try { j = text ? JSON.parse(text) : {}; } catch { /* not JSON: a gateway error page or a crash */ }
      if (!r.ok || j.success === false) {
        const page = /<title>([^<]*)<\/title>/i.exec(text)?.[1].replace(/\s*\|\s*/g, ": ").trim(); // an HTML error page (Cloudflare): its title says enough
        const said = j.error || j.message || j.alasan || j.pesan || page || text.replace(/\s+/g, " ").trim().slice(0, 160);
        throw new Error(`${said || "no reason given"} (HTTP ${r.status}${r.status >= 500 ? ", on the ERP server's side" : ""})`);
      }
      return j;
    }
    const newBulk = () => ({ phase: "input", rows: [], method: METHODS[0], date: todayIso(), note: "", defaultNote: "Bulk Lunas (Dock)", armed: 0, stop: false, el: null });
    function openBulk(text) {
      if (!bulk || (bulk.phase !== "paying" && text)) bulk = newBulk();
      view.mode = "bulk"; view.card = null; drawBody();
      const ta = bulk.el.querySelector("textarea");
      if (text) { ta.value = text.trim(); find(); } else if (bulk.phase === "input") ta.focus();
    }
    async function find() {
      const lines = bulk.el.querySelector("textarea").value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
      const seen = new Set(); bulk.rows = [];
      for (const t of lines) { const k = t.toLowerCase(); if (seen.has(k)) continue; seen.add(k); bulk.rows.push({ token: t, state: "looking", invs: [] }); }
      if (!bulk.rows.length) return;
      bulk.phase = "looking"; bulk.armed = 0; bulkDraw();
      const queue = [...bulk.rows];
      await Promise.all([0, 1, 2, 3, 4].map(async () => { while (queue.length) await lookup(queue.shift()); }));
      // one customer listed twice: keep the first
      const users = new Set();
      for (const r of bulk.rows) if (r.state === "found") { if (users.has(r.user)) { r.state = "dupe"; r.invs = []; } else users.add(r.user); }
      await radius(bulk.rows.flatMap((r) => r.invs));
      bulk.phase = "review"; bulkDraw();
    }
    // "Djarmo Sumberagung": a name and a village, read the way the customer search reads it. The village (the last word
    // or two, when they name one) narrows to its customers; each name word must match the name, exactly, by its start or
    // by sound (Djarmo = Jarmo). Usernames in a village mostly end in its code (Sumberagung 0904), which breaks ties;
    // the code alone isn't enough, since two villages can share one.
    let villages = null;
    function villageIndex() {
      if (villages?.rows === customers) return villages;
      const by = new Map(), codes = new Map();
      for (const r of customers) { const k = vkey(r.desa || ""); if (!k) continue; (by.get(k) || by.set(k, []).get(k)).push(r);
        const c = codeOf(r.username); if (c) { const m = codes.get(k) || codes.set(k, new Map()).get(k); m.set(c, (m.get(c) || 0) + 1); } }
      const code = new Map(); for (const [k, m] of codes) { const [c, n] = [...m].sort((a, b) => b[1] - a[1])[0]; if (n >= by.get(k).length / 2) code.set(k, c); }
      return (villages = { rows: customers, by, code });
    }
    const codeOf = (u) => String(u || "").toLowerCase().match(/(\d{3,})[a-z]?$/)?.[1] || "";
    function nameLookup(q) {
      if (!customers) return [];
      const words = fold(q).split(" ").filter((w) => w && !/^\d+$/.test(w)), vi = villageIndex(); if (!words.length) return [];
      let vil = "", name = words;
      for (const n of [2, 1]) { const k = words.slice(-n).join(""); if (words.length > n && vi.by.has(k)) { vil = k; name = words.slice(0, -n); break; } }
      const code = vil ? vi.code.get(vil) : "", pool = vil ? vi.by.get(vil) : customers;
      const out = [];
      for (const r of pool) {
        const mine = r._name.split(" "); let score = 0;
        for (const w of name) { const sw = sound(w);
          const hit = mine.includes(w) ? 3 : mine.some((x) => w.length >= 3 && (x.startsWith(w) || (x.length >= 4 && w.startsWith(x)))) || mine.some((x) => sound(x) === sw) ? 2
            : w.length >= 4 && fuzzyHit(sw, mine.map(sound), w.length >= 9 ? 2 : 1) ? 1 : 0;
          if (!hit) { score = -1; break; } score += hit; }
        if (score < 0) continue;
        if (code && codeOf(r.username) === code) score += 1;
        if (sound(String(r.username).toLowerCase().match(/^[a-z]+/)?.[0] || "") === sound(name.join(""))) score += 1; // aprin0904 for "Aprin"
        if (r.isInactive) score -= 2;
        out.push({ r, score });
      }
      return out.sort((a, b) => b.score - a.score || (a.r._name < b.r._name ? -1 : 1)).map((x) => ({ ...x, vil, top: name.length * 3 }));
    }
    const about = (u) => { const r = customers?.find((x) => String(x.username).toLowerCase() === String(u).toLowerCase()); return r ? `${titleCase(r.nama || "")}${r.desa && !fold(r.nama).includes(fold(r.desa)) ? ` · ${titleCase(r.desa)}` : ""}` : ""; };
    async function lookup(row) {
      row.state = "looking"; row.err = "";
      try {
        // every month of that customer in one request (with month=all the server ignores the year); ~3 s each
        const q = row.pick || row.token, low = q.toLowerCase();
        if (!row.pick && /\s/.test(q.trim()) && customers) {
          const hits = nameLookup(q);
          // one clear best (a better score than the next, every name word matching well): taken, but left unticked
          if (hits.length && (hits.length === 1 || hits[0].score > hits[1].score) && hits[0].score >= hits[0].top - 1 && (hits[0].vil || hits.length === 1)) {
            row.pick = hits[0].r.username; row.guess = true; return await lookup(row); }
          if (hits.length) { row.state = "pick"; row.cands = hits.slice(0, 6).map((h) => h.r.username); return; }
        }
        const get = (text) => api(`/api/finance/invoices/list?month=all&year=${new Date().getFullYear()}&page=1&pageSize=200&q=${encodeURIComponent(text)}`).then((j) => j.invoices || []);
        const all = [...new Map((await get(q)).map((v) => [v.invoiceNumber, v])).values()];
        const mine = all.filter((v) => String(v.radiusUsername || "").toLowerCase() === low);
        if (!mine.length && !row.pick) {
          // not an exact username: one that starts with it (yudianto0904 → yudianto0904a) is taken but left unticked;
          // otherwise look the name up (liani0904 → "liani") and offer the closest, same area code first
          const starts = [...new Set(all.map((v) => v.radiusUsername).filter((u) => u && u.toLowerCase().startsWith(low)))];
          if (starts.length === 1) { row.pick = starts[0]; row.guess = true; return await lookup(row); }
          let cands = starts;
          if (!cands.length) {
            const letters = low.replace(/[^a-z]+/g, ""), tail = low.match(/\d+[a-z]?$/)?.[0] ?? "";
            const near = letters.length >= 3 ? await get(letters) : [], score = new Map();
            for (const v of near) { const u = String(v.radiusUsername || ""); if (!u) continue;
              const n = (tail && u.toLowerCase().endsWith(tail.replace(/[a-z]$/, "")) || u.toLowerCase().replace(/[a-z]$/, "").endsWith(tail) ? 2 : 0)
                + (u.toLowerCase().startsWith(letters.slice(0, 4)) ? 1 : 0) + (fold(v.customerName).split(" ").some((w) => w === letters || (letters.length >= 5 && w.startsWith(letters.slice(0, -1)))) ? 1 : 0);
              if (n >= 2) score.set(u, Math.max(score.get(u) ?? 0, n)); }
            cands = [...score].sort((a, b) => b[1] - a[1]).map(([u]) => u);
            for (const r of findCustomers(q, 3)) if (!cands.includes(r.username)) cands.push(r.username);
          }
          row.state = cands.length ? "pick" : "none"; row.cands = cands.slice(0, 6); return;
        }
        if (!mine.length) { row.state = "none"; return; }
        mine.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        const last = mine[mine.length - 1];
        row.user = last.radiusUsername; row.name = last.customerName; row.where = [last.desa, last.paket].filter(Boolean).join(" · ");
        row.paidTo = [...mine].reverse().find((v) => v.status === "Lunas")?.period || "";
        row.invs = mine.filter((v) => UNPAID.has(v.status)).map((v, i) => ({ no: v.invoiceNumber, period: v.period, amount: Number(v.amount) || 0, status: v.status,
          hutang: v.dihutangiSampai || "", on: i === 0 && !row.guess, recharge: false, radius: null, result: null }));
        row.state = "found"; if (bulk?.skipOlder && bulk.rows.includes(row)) latestOnly(row, true);
      } catch (e) { row.state = "error"; row.err = e.message; }
      finally { bulkDraw(); }
    }
    // what paying would do in RADIUS (the ERP's own preview): recharge on where it can and isn't already covered
    async function radius(invs) {
      for (let i = 0; i < invs.length; i += 20) {
        const part = invs.slice(i, i + 20);
        try {
          const j = await api("/api/finance/invoices/mark-paid-radius-preview", { invoiceNumbers: part.map((v) => v.no) });
          for (const it of j.items || []) { const v = part.find((x) => x.no === it.invoiceNumber); if (v) { v.radius = it; v.recharge = !!it.canRecharge && !it.alreadyCovered; } }
        } catch { for (const v of part) v.radius = { failed: true }; }
      }
    }
    // ticking a month ticks the older ones too (the server pays oldest first); unticking clears the newer ones. With
    // "skip older months" on, each month is ticked on its own.
    function tickMonth(row, i, on, st, redraw) { row.invs.forEach((v, j) => { if (st.skipOlder ? j === i : on ? j <= i : j >= i) v.on = on; }); st.armed = 0; redraw(); }
    // The ERP's own exception to oldest-first (Finance → Invoices, "Lunasi walau ada tagihan lebih tua"): for a customer
    // who pays only this month (away, didn't use the internet). The older months stay unpaid; the server wants a note of
    // 10+ letters and logs it as [OVERRIDE tertua-dulu]; only finance manager / admin / super admin may.
    const SKIP_ROLES = ["super_admin", "admin", "finance_manager"];
    const myRole = () => { try { return String(JSON.parse(localStorage.getItem("user") || "{}").role || ""); } catch { return ""; } };
    // the default ticks: the oldest month, or with "latest month only" the newest one alone (a guessed customer stays unticked)
    function latestOnly(row, on) {
      const open = row.invs.filter((v) => !v.result?.ok); if (row.guess || !open.length) return;
      for (const v of open) v.on = on ? v === open[open.length - 1] : v === open[0];
    }
    // months left unpaid below a ticked one: those need the override and a note
    const skippedOf = (row) => { const top = row.invs.map((v) => v.on && !v.result?.ok).lastIndexOf(true); return row.invs.filter((v, j) => j < top && !v.on && !v.result?.ok).length; };
    const chosen = () => bulk.rows.filter((r) => r.state === "found").flatMap((r) => r.invs.filter((v) => v.on && !v.result?.ok).map((v) => [r, v]));
    const pay = () => payQueue(chosen(), bulk, bulkDraw, "Bulk Lunas (Dock)");
    // pays a list of [row, invoice], one request each; three customers at a time, each customer's months in order (the
    // server pays oldest first). st holds the method, date, note and progress. A month with an unpaid older one left
    // out goes with the ERP's override, only when st.skipOlder is on.
    const PAY_AT_ONCE = 3;
    async function payQueue(queue, st, redraw, defaultNote) {
      if (!queue.length) return;
      st.phase = "paying"; st.stop = false; st.armed = 0; st.done = 0; st.total = queue.length; redraw();
      const groups = [...queue.reduce((m, [row, v]) => (m.get(row) || m.set(row, []).get(row)).push(v) && m, new Map())];
      payingNow++;
      try { await Promise.all(Array.from({ length: Math.min(PAY_AT_ONCE, groups.length) }, async () => {
        for (let g; (g = groups.shift()) && !st.stop;) { const [row, invs] = g;
          for (const v of invs) { if (st.stop) break; const ok = await payOne(row, v, st, redraw, defaultNote); st.done++; redraw(); if (!ok) break; } } // a month that didn't go: the newer ones would be refused
      })); } finally { payingNow--; }
      st.phase = "done"; redraw();
    }
    async function payOne(row, v, st, redraw, defaultNote) {
      v.result = { busy: true }; redraw();
      const over = !!st.skipOlder && row.invs.slice(0, row.invs.indexOf(v)).some((x) => !x.on && !x.result?.ok);
      try {
        const j = await api("/api/finance/invoices/bulk-mark-paid", { invoiceNumbers: [v.no], paymentMethod: st.method, notes: st.note.trim() || defaultNote,
          paymentDate: st.date || undefined, rechargeMap: v.recharge ? { [v.no]: true } : {}, ...(over ? { lunasiWalauAdaTertua: true } : {}) });
        const sum = j.summary || {}, older = (j.tertuaDulu || [])[0], waiting = (j.results || []).find((x) => x?.belumDiproses), failed = (j.rechargeGagal || [])[0];
        const skip = (j.results || []).find((x) => x?.status === "skip" || x?.status === "error");
        if (sum.marked) row.paidTo = v.period || row.paidTo;
        v.result = sum.marked ? { ok: true, text: sum.recharged ? "Lunas · recharged" : "Lunas", warn: failed ? `RADIUS recharge failed: ${failed.reason}` : "" }
          : older ? { text: `Skipped: ${older.reason}` } : waiting ? { text: "Not processed yet (server restarting): try again" } : { text: `Skipped${skip?.reason ? `: ${skip.reason}` : ""}` };
      } catch (e) {
        // the request failed, but the server may have saved it anyway (a deploy restarting it mid-request):
        // ask the ERP what the invoice says now, so a retry can't pay it twice
        v.result = { busy: true }; redraw();
        const now = await settled(v.no);
        if (now === "Lunas") { row.paidTo = v.period || row.paidTo; v.result = { ok: true, text: "Lunas (saved, though the answer was lost)" }; }
        else v.result = { text: `${e.message || "Failed"} · ${now ? `checked: still ${now}, safe to try again` : "couldn't check: look at the invoice before trying again"}` };
      }
      return !!v.result.ok;
    }
    // an invoice's status straight from the ERP, retried a few times while the server comes back
    async function settled(no) {
      for (let i = 0; i < 4; i++) {
        await new Promise((ok) => setTimeout(ok, 2500 + i * 2500));
        try {
          const j = await api(`/api/finance/invoices/list?month=all&year=${new Date().getFullYear()}&page=1&pageSize=20&q=${encodeURIComponent(no)}`);
          const v = (j.invoices || []).find((x) => x.invoiceNumber === no); if (v) return v.status;
        } catch {}
      }
      return null;
    }
    // a customer's unpaid months, each with its RADIUS recharge and, once paid, the result
    function monthRows(r, key, busy, st, redraw) {
      return r.invs.map((v, i) => {
        const m = el("label", "mrow"), cb = el("input"); cb.type = "checkbox"; cb.checked = v.on; cb.disabled = busy || v.result?.ok; cb.dataset.k = `${key}-${i}`;
        cb.onchange = () => tickMonth(r, i, cb.checked, st, redraw);
        const t = el("span"); t.append(v.period || v.no, " ", el("span", v.status === "Jatuh Tempo" ? "late" : "sub", v.status === "Jatuh Tempo" ? "· overdue" : ""));
        m.append(cb, t, el("span", "mono", rupiah(v.amount)));
        const x = el("span", "x");
        if (v.radius?.canRecharge) {
          const l = el("label"), rc = el("input"); rc.type = "checkbox"; rc.checked = v.recharge; rc.disabled = busy || v.result?.ok; rc.dataset.k = `${key}-${i}-r`;
          rc.onchange = () => { v.recharge = rc.checked; st.armed = 0; redraw(); }; rc.onclick = (ev) => ev.stopPropagation();
          l.append(rc, v.radius.alreadyCovered ? "recharge (already covered)" : `recharge RADIUS (expires ${v.radius.expiryDate || "?"})`); x.append(l);
        } else if (v.radius) x.append(el("span", null, v.radius.failed ? "RADIUS preview failed: pays without recharge" : "no RADIUS account linked"));
        if (v.hutang) x.append(el("span", "warn", `promised to pay by ${String(v.hutang).slice(0, 10)}`));
        if (v.result?.busy) x.append(el("span", null, "Paying…"));
        else if (v.result) { x.append(el("span", v.result.ok ? "good" : "late", v.result.text)); if (v.result.warn) x.append(el("span", "warn", v.result.warn)); }
        m.append(x); return m;
      });
    }
    // method, payment date and note
    function payFields(st, busy, key, redraw) {
      const method = el("select", "field"); method.disabled = busy; method.dataset.k = `${key}method`;
      for (const m of METHODS) { const o = el("option", null, m); o.value = m; o.selected = m === st.method; method.append(o); }
      method.onchange = () => { st.method = method.value; st.armed = 0; redraw(); };
      const date = el("input", "field"); date.type = "date"; date.value = st.date; date.max = todayIso(); date.disabled = busy; date.dataset.k = `${key}date`;
      date.onchange = () => { st.date = date.value; st.armed = 0; redraw(); };
      const note = el("input", "field"); note.placeholder = st.defaultNote; note.value = st.note; note.disabled = busy; note.dataset.k = `${key}note`;
      note.oninput = () => { st.note = note.value; st.armed = 0; st.onNote?.(); };
      const lab = (t, f) => { const l = el("label", "lbl"); l.append(t, f); return l; };
      const two = el("div", "row2"); two.append(lab("Method", method), lab("Payment date", date));
      return [two, lab("Note", note)];
    }
    // press once to arm (5 s), again to pay
    function armButton(st, label, armedLabel, onPay, redraw, key) {
      const armed = st.armed > Date.now();
      const btn = el("button", `btn wide ${armed ? "arm" : "primary"}`, armed ? armedLabel : label); btn.type = "button"; btn.dataset.k = key;
      btn.onclick = () => { if (st.armed > Date.now()) onPay(); else { st.armed = Date.now() + 5000; redraw(); setTimeout(() => { if (st.armed && st.armed <= Date.now()) { st.armed = 0; redraw(); } }, 5100); } };
      return btn;
    }
