    // ---- Pay from the customer card ----
    const bills = new Map(); // username → { row, st, el }
    function payBox(r) {
      let b = bills.get(r.username);
      if (!b || (b.st.phase !== "paying" && Date.now() - b.at > 60000)) { // a minute old: ask again
        b = { at: Date.now(), row: { token: r.username, pick: r.username, state: "looking", invs: [] },
          st: { method: METHODS[0], date: todayIso(), note: "", defaultNote: "Lunas (Dock)", phase: "looking", armed: 0 }, el: el("div", "near bill rise") };
        b.el.style.setProperty("--i", "2"); bills.set(r.username, b);
        const load = async () => { b.row.state = "looking"; b.st.phase = "looking"; billDraw(b); await lookup(b.row); await radius(b.row.invs); b.st.phase = "review"; billDraw(b); };
        b.load = load; load();
      }
      return b.el;
    }
    function billDraw(b) {
      const { row, st } = b, focus = document.activeElement?.dataset?.k, busy = st.phase !== "review" && st.phase !== "done", redraw = () => billDraw(b);
      const open = row.invs.filter((v) => !v.result?.ok), ch = open.filter((v) => v.on), total = ch.reduce((a, v) => a + v.amount, 0);
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "0"; e.append("Pay");
      head.append(e, el("span", "sub", row.state === "found" ? (open.length ? `${open.length} unpaid · ${rupiah(open.reduce((a, v) => a + v.amount, 0))}` : `Nothing unpaid${row.paidTo ? ` · paid to ${row.paidTo}` : ""}`) : ""));
      const parts = [head];
      if (row.state === "looking") parts.push(el("p", "note ld", "Loading this customer's bills…"));
      else if (row.state === "error") { parts.push(el("p", "note late", row.err)); const again = el("button", "btn", "Try again"); again.type = "button"; again.onclick = () => b.load(); parts.push(again); }
      else if (row.state !== "found") parts.push(el("p", "note", "No invoices for this username."));
      else {
        parts.push(...monthRows(row, `c${row.user}`, busy, st, redraw));
        if (open.length) {
          if (open.length > 1 || st.skipOlder) {
            const role = myRole(), may = !role || SKIP_ROLES.includes(role), sk = el("label", "skipold"), cb = el("input"); cb.type = "checkbox"; cb.checked = !!st.skipOlder;
            cb.disabled = busy || !may; cb.dataset.k = `c${row.user}skip`;
            cb.onchange = () => { st.skipOlder = cb.checked; st.armed = 0;
              if (!cb.checked) { const top = open.map((v) => row.invs.indexOf(v)).filter((j) => row.invs[j].on).pop(); if (top != null) row.invs.forEach((v, j) => { if (j <= top && !v.result?.ok) v.on = true; }); } // back to oldest first
              redraw(); };
            const t = el("span"); t.append(el("b", null, "Skip older months"), el("span", "sub", may ? "Pay only the months you tick, for a customer who was away or didn't use the internet. The older months stay unpaid; the note must say why (10+ letters) and the ERP logs it as [OVERRIDE tertua-dulu]."
              : "Only a finance manager or admin can skip older months."));
            sk.append(cb, t); parts.push(sk);
          }
          const f = el("div", "bform"); f.append(...payFields(st, busy, `c${row.user}`, redraw)); parts.push(f);
          const what = ch.length === 1 ? ch[0].period : `${ch.length} months`, rc = ch.filter((v) => v.recharge).length;
          const newest = ch.length ? row.invs.indexOf(ch[ch.length - 1]) : -1, skipped = st.skipOlder ? open.filter((v) => !v.on && row.invs.indexOf(v) < newest).length : 0;
          if (st.phase === "paying") { const s = el("button", "btn wide", `Paying ${Math.min(st.done + 1, st.total)} of ${st.total}…`); s.type = "button"; s.disabled = true; parts.push(s); }
          else { const btn = armButton(st, ch.length ? `Mark ${what} Lunas · ${rupiah(total)}${skipped ? ` · skip ${skipped} older` : ""}${rc ? " · recharge" : ""}` : "Tick a month to pay",
              `Click again: ${what} paid by ${st.method}, ${rupiah(total)}${skipped ? `, ${skipped} older left unpaid` : ""}`, () => payQueue(ch.map((v) => [row, v]), st, redraw, st.defaultNote), redraw, `c${row.user}pay`);
            btn.style.marginTop = "10px"; parts.push(btn);
            const why = el("p", "note warn"); why.hidden = true; parts.push(why);
            // skipping needs the reason first; checked as you type, without redrawing the note you're typing in
            (st.onNote = () => { const short = !!skipped && st.note.trim().length < 10; btn.disabled = !ch.length || short;
              why.hidden = !short; why.textContent = `Write in Note why the older months are skipped (${st.note.trim().length}/10 letters), e.g. "pelanggan di luar kota Oktober".`; })(); }
        } else if (st.phase === "done") parts.push(el("p", "note good", "Paid."));
      }
      b.el.replaceChildren(...parts);
      if (focus && b.el.isConnected) b.el.querySelector(`[data-k="${focus}"]`)?.focus();
    }
    function bulkView() {
      if (bulk.el) return bulk.el;
      const wrap = el("div", "bulk");
      const head = el("div", "head"), e = el("div", "eyebrow"); e.append("Bulk Lunas");
      const back = el("button", "back", "← Back"); back.type = "button"; back.onclick = () => { view.mode = null; drawBody(); panel.querySelector("input")?.focus(); };
      head.append(e, back);
      const ta = el("textarea", "field"); ta.placeholder = "Paste usernames, names with their village, or a WhatsApp chat"; ta.setAttribute("aria-label", "Usernames"); ta.spellcheck = false;
      ta.onpaste = () => setTimeout(() => find(), 0);
      ta.onkeydown = (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); find(); } };
      // while looking: Stop, or Find again once the box has changed
      const go = el("button", "btn", "Find them"); go.type = "button"; go.onclick = () => (bulk.phase === "looking" && ta.value === bulk.lastText ? stopFind() : find());
      ta.oninput = () => findLabel(); go.style.marginTop = "8px"; go.dataset.k = "find";
      wrap.append(head, el("div", "bday"), el("div", "bsent"), ta, go, el("div", "bform"), el("div", "blist"), el("div", "bpay"));
      return (bulk.el = wrap);
    }
    function bulkDraw() {
      if (!bulk?.el) return;
      const list = bulk.el.querySelector(".blist"), form = bulk.el.querySelector(".bform"), foot = bulk.el.querySelector(".bpay"), focus = document.activeElement?.dataset?.k;
      const busy = bulk.phase === "looking";
      dayDraw(bulk.el.querySelector(".bday")); bulk.el.querySelector(".bsent").replaceChildren(...bulk.sent.map(sentView));
      findLabel();
      const rows = [];
      for (const [ri, r] of bulk.rows.entries()) {
        const box = el("div", `brow${r.shown ? "" : " rise"}${r.state === "found" && r.invs.length ? "" : " off"}`); box.style.setProperty("--i", String(Math.min(ri, 12))); r.shown = true;
        const h = el("div", "h");
        if (r.state === "found") {
          h.append(el("b", null, r.name || r.user), el("span", `mono${r.guess ? " warn" : ""}`, r.user.toLowerCase() !== r.token.toLowerCase() ? `${r.token} → ${r.user}` : r.user)); box.append(h);
          if (r.guess && r.invs.length) box.append(el("div", "sub warn", /\s/.test(r.token.trim()) ? "Found by name and village: tick it if this is the right customer" : "Not the exact username you pasted: tick it if this is the right customer"));
          if (r.guess && !busy && !r.invs.some((v) => v.result)) box.append(rowSearch(r, ri));
          box.append(el("div", "sub", [r.where, r.paidTo ? `paid to ${r.paidTo}` : r.paidTo === null ? "" : "nothing paid yet"].filter(Boolean).join(" · ")));
          if (!r.invs.length) box.append(el("div", "sub good", "Nothing unpaid"));
          box.append(...monthRows(r, ri, busy, bulk, bulkDraw));
        } else {
          h.append(el("b", null, r.token), el("span", "mono", { looking: "looking…", none: "not found", pick: "which one?", dupe: "listed twice", error: "failed", stopped: "stopped" }[r.state])); box.append(h);
          if (r.state === "error") box.append(el("div", "sub late", r.err));
          if (r.state === "dupe") box.append(el("div", "sub", "Same customer as a line above: shown once"));
          if (r.state === "stopped") box.append(el("div", "sub", "Not looked up: press Find to look it up"));
          if (r.state === "none") box.append(el("div", "sub", "No invoice has this username or anything close. Check the spelling."));
          if (r.state === "pick") box.append(el("div", "sub", /\s/.test(r.token.trim()) ? "More than one customer fits: which one?" : "No exact username: is it one of these?"));
          if (r.state === "pick" || r.state === "error") {
            const p = el("div", "picks");
            for (const c of r.state === "pick" ? r.cands : [r.pick || r.token]) { const b = el("button", "btn", c), who = r.state === "pick" ? about(c) : ""; if (who) b.append(el("span", "who", ` · ${who}`)); b.type = "button"; b.disabled = busy;
              b.onclick = async () => { r.pick = c; r.guess = false; await lookup(r); await radius(r.invs); bulkDraw(); }; p.append(b); }
            box.append(p);
          }
          if (["pick", "none", "error", "stopped"].includes(r.state) && !busy) box.append(rowSearch(r, ri));
        }
        rows.push(box);
      }
      list.replaceChildren(...rows);
      // the pay bar
      const ch = chosen(), people = new Set(ch.map(([r]) => r.user)).size, total = ch.reduce((a, [, v]) => a + v.amount, 0), recharges = ch.filter(([, v]) => v.recharge).length;
      const parts = [], fields = [];
      if (bulk.rows.length && bulk.phase !== "looking") {
        const found = bulk.rows.filter((r) => r.state === "found").length, open = bulk.rows.length - found - bulk.rows.filter((r) => r.state === "dupe").length;
        const sum = el("div", "sum"); sum.append(el("span", null, `${found} of ${bulk.rows.length} found${open ? ` · ${open} need a look` : ""}`), el("b", null, `${ch.length} invoices · ${rupiah(total)}`));
        fields.push(...payFields(bulk, busy, "", bulkDraw)); parts.push(sum);
        if (bulk.rows.some((r) => r.state === "found" && r.invs.filter((v) => !v.result?.ok).length > 1) || bulk.skipOlder) {
          const role = myRole(), may = !role || SKIP_ROLES.includes(role), sk = el("label", "skipold"), cb = el("input"); cb.type = "checkbox"; cb.checked = !!bulk.skipOlder;
          cb.disabled = busy || !may; cb.dataset.k = "skip";
          cb.onchange = () => { bulk.skipOlder = cb.checked; bulk.armed = 0; for (const r of bulk.rows) if (r.state === "found") latestOnly(r, cb.checked); bulkDraw(); };
          const t = el("span"); t.append(el("b", null, "Latest month only"), el("span", "sub", may ? "Ticks each customer's newest month alone; you can still tick others yourself. The older months stay unpaid; the note must say why (10+ letters) and the ERP logs it as [OVERRIDE tertua-dulu]."
            : "Only a finance manager or admin can skip older months."));
          sk.append(cb, t); fields.push(sk);
        }
        {
          const skipped = bulk.skipOlder ? bulk.rows.filter((r) => r.state === "found").reduce((n, r) => n + skippedOf(r), 0) : 0;
          const btn = armButton(bulk, ch.length ? `Mark ${ch.length} Lunas · ${rupiah(total)}${skipped ? ` · skip ${skipped} older` : ""}${recharges ? ` · ${recharges} recharge` : ""}` : "Tick the months to pay",
            `Click again: mark ${ch.length} paid (${people} customers, ${rupiah(total)})${skipped ? `, ${skipped} older left unpaid` : ""}`, pay, bulkDraw, "pay");
          const why = el("p", "note warn"); why.hidden = true;
          parts.push(btn, why);
          // skipping needs the reason first; checked as you type, without redrawing the note you're typing in
          (bulk.onNote = () => { const short = !!skipped && bulk.note.trim().length < 10; btn.disabled = !ch.length || short;
            why.hidden = !short; why.textContent = `Write in Note why the older months are skipped (${bulk.note.trim().length}/10 letters), e.g. "pelanggan di luar kota".`; })();
        }
      }
      form.replaceChildren(...fields); foot.replaceChildren(...parts); foot.hidden = !parts.length;
      if (bulk.sent.length && !bulk.rows.length) list.replaceChildren(el("p", "note", "Paste the next list: the ones above keep paying meanwhile."));
      if (focus) bulk.el.querySelector(`[data-k="${focus}"]`)?.focus();
    }
    // a list sent to be paid: its own progress and Stop, then what didn't go, to try again
    function sentView(b) {
      const box = el("div", "brow sent"), all = b.rows.flatMap((r) => r.invs.filter((v) => v.result).map((v) => [r, v]));
      const ok = all.filter(([, v]) => v.result.ok).length, bad = b.phase === "done" ? all.filter(([, v]) => !v.result.ok && !v.result.busy) : [];
      const h = el("div", "h"); h.append(el("b", null, b.label), el("span", "mono", b.phase === "paying" ? `${b.done} of ${b.total}` : `${ok} Lunas${bad.length ? ` · ${bad.length} not` : ""}`)); box.append(h);
      const acts = el("div", "picks"), btn = (label, fn) => { const x = el("button", "btn", label); x.type = "button"; x.onclick = fn; acts.append(x); return x; };
      if (b.phase === "paying") {
        const bar = el("div", "bar"), i = el("i"); i.style.width = `${(b.done / b.total) * 100}%`; bar.append(i); box.append(bar);
        btn(b.stop ? "Stopping after the ones in progress…" : "Stop", () => { b.stop = true; bulkDraw(); }).disabled = !!b.stop;
      } else {
        for (const [r, v] of bad) box.append(el("div", "sub late", `${r.name || r.user} · ${v.period || v.no}: ${v.result.text}`));
        const again = bad.filter(([, v]) => !v.result.unsure); // an answer lost without a check: look at the invoice first
        if (again.length) btn(`Try ${again.length} again`, () => { for (const [, v] of again) v.result = null; sendList(b, again.map(([r]) => r).filter((r, i, a) => a.indexOf(r) === i).flatMap((r) => r.invs.filter((v) => v.on && !v.result?.ok && !v.result?.unsure).map((v) => [r, v]))); });
        btn("Clear", () => { bulk.sent = bulk.sent.filter((x) => x !== b); bulkDraw(); });
      }
      if (acts.childNodes.length) box.append(acts);
      return box;
    }
    // the end-of-day check: everyone from today's lists that isn't paid, and the lines never sorted out
    function dayDraw(box) {
      const d = today(), users = Object.entries(d.users), paid = users.filter(([, u]) => u.ok).length;
      const left = [...users.filter(([, u]) => !u.ok).map(([user, u]) => ({ token: user, text: `${u.name || user} · ${u.label}${u.why ? ` · ${u.why}` : ""}` })),
        ...Object.entries(d.open).map(([token, label]) => ({ token, text: `${token} · ${label} · never found` }))];
      if (!users.length && !left.length) { box.replaceChildren(); return; }
      const det = el("details", "dayck"); det.open = !!bulk.dayOpen; det.ontoggle = () => { bulk.dayOpen = det.open; };
      det.append(el("summary", null, `Today: ${paid} paid${left.length ? ` · ${left.length} not yet` : ""}`));
      // per collector: the lists with the same method and note added up
      const by = new Map(); for (const x of Object.values(d.lists || {})) { const t = by.get(x.label) || by.set(x.label, { people: 0, months: 0, total: 0 }).get(x.label); t.people += x.people; t.months += x.months; t.total += x.total; }
      if (by.size) {
        const tot = el("div", "tots"), lines = [...by].sort((a, b) => b[1].total - a[1].total);
        for (const [label, t] of lines) { const r = el("div", "tot"); r.append(el("span", null, label), el("span", "mono", `${t.people} · ${rupiah(t.total)}`)); tot.append(r); }
        const all = lines.reduce((n, [, t]) => n + t.total, 0), sumR = el("div", "tot all"); sumR.append(el("span", null, "All"), el("span", "mono", rupiah(all))); tot.append(sumR);
        const cp = el("button", "btn", "Copy totals"); cp.type = "button";
        cp.onclick = () => copy([`Setoran ${d.day}`, ...lines.map(([label, t]) => `${label}: ${t.people} pelanggan, ${rupiah(t.total)}`), `Total: ${rupiah(all)}`].join("\n"), cp);
        det.append(tot, cp);
      }
      for (const x of left.slice(0, 200)) det.append(el("div", "sub", x.text));
      if (left.length) {
        const acts = el("div", "picks"), b = el("button", "btn", `Put the ${left.length} here to check again`); b.type = "button";
        b.onclick = () => { const ta = bulk.el.querySelector("textarea"); ta.value = [ta.value.trim(), ...left.map((x) => x.token)].filter(Boolean).join("\n"); find(); }; acts.append(b);
        // lines never found (a typo, a chat line read wrong) are forgotten here; what was paid and the totals stay
        const open = Object.keys(d.open).length;
        if (open) { const c = el("button", "btn", `Forget the ${open} never found`); c.type = "button"; c.onclick = () => { dayNote((x) => { x.open = {}; }); bulkDraw(); }; acts.append(c); }
        det.append(acts);
      }
      box.replaceChildren(det);
    }
    function findLabel() {
      const b = bulk?.el?.querySelector('[data-k="find"]'); if (!b) return;
      const looking = bulk.phase === "looking", changed = bulk.el.querySelector("textarea").value !== bulk.lastText;
      b.textContent = looking && changed ? "Find again (drops the old search)" : `${looking ? `Looking… ${bulk.rows.filter((r) => r.state !== "looking").length}/${bulk.rows.length}${bulk.loading ? ` (${bulk.loading.replace(/^Loading /, "").replace(/…/, "")})` : ""}` : bulk.loading || (bulk.rows.length ? "Find again" : "Find them")}${looking ? " · Stop" : ""}`;
    }
    // a line's customer found by hand: type a name, username or phone. The Dock's customer list answers at once; when it
    // has nothing, the ERP's invoices are searched. Picking one looks that customer up for this line.
    function rowSearch(r, ri) {
      const wrap = el("div", "rsearch"), inp = el("input", "field"), out = el("div", "picks");
      inp.placeholder = r.state === "found" ? "Not this one? Search the customer" : "Search the customer: name, username or phone"; inp.value = r.q || ""; inp.dataset.k = `q${ri}`;
      inp.setAttribute("aria-label", `Search the customer for ${r.token}`);
      const pickBtn = ([u, who]) => { const b = el("button", "btn", u); if (who) b.append(el("span", "who", ` · ${who}`)); b.type = "button";
        b.onclick = async () => { r.pick = u; r.guess = false; r.q = ""; r.qres = null; r.state = "looking"; bulkDraw(); await lookup(r); await radius(r.invs); bulkDraw(); }; return b; };
      const who = (name, desa) => [titleCase(name || ""), desa && !fold(name).includes(fold(desa)) ? titleCase(desa) : ""].filter(Boolean).join(" · "); // the village, unless the name has it
      const put = (list) => out.replaceChildren(...(list.length ? list.map(pickBtn) : [el("span", "sub", "No customer matches")]));
      const show = async () => {
        const q = (r.q = inp.value).trim(); clearTimeout(r.qt); if (q.length < 2) { out.replaceChildren(); return; }
        if (r.qres?.q === q) return put(r.qres.list); // the same search, kept through a redraw
        let list = findCustomers(q, 6).map((c) => [c.username, who(c.nama, c.desa)]);
        if (!list.length && q.length >= 3) {
          out.replaceChildren(el("span", "sub", "Searching the ERP…"));
          await new Promise((ok) => { r.qt = setTimeout(ok, 400); }); if (inp.value.trim() !== q) return;
          try { const j = await api(`/api/finance/invoices/list?month=all&year=${new Date().getFullYear()}&page=1&pageSize=50&q=${encodeURIComponent(q)}`), m = new Map();
            for (const v of j.invoices || []) if (v.radiusUsername && !m.has(v.radiusUsername)) m.set(v.radiusUsername, who(v.customerName, v.desa));
            list = [...m].slice(0, 6); } catch { list = []; }
          if (inp.value.trim() !== q) return;
        }
        r.qres = { q, list }; if (inp.isConnected) put(list);
      };
      inp.oninput = show; if (r.q) show();
      wrap.append(inp, out); return wrap;
    }
