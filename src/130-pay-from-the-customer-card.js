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
              `Click again: ${what} paid by ${st.method}, ${rupiah(total)}${skipped ? `, ${skipped} older left unpaid` : ""}`, () => (st.override = skipped > 0, payQueue(ch.map((v) => [row, v]), st, redraw, st.defaultNote)), redraw, `c${row.user}pay`);
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
      const ta = el("textarea", "field"); ta.placeholder = "Paste usernames, one per line"; ta.setAttribute("aria-label", "Usernames"); ta.spellcheck = false;
      ta.onpaste = () => setTimeout(() => bulk.phase !== "paying" && find(), 0);
      ta.onkeydown = (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); find(); } };
      const go = el("button", "btn", "Find them"); go.type = "button"; go.onclick = () => find(); go.style.marginTop = "8px"; go.dataset.k = "find";
      wrap.append(head, ta, go, el("div", "bform"), el("div", "blist"), el("div", "bpay"));
      return (bulk.el = wrap);
    }
    function bulkDraw() {
      if (!bulk?.el) return;
      const list = bulk.el.querySelector(".blist"), form = bulk.el.querySelector(".bform"), foot = bulk.el.querySelector(".bpay"), focus = document.activeElement?.dataset?.k;
      const busy = bulk.phase === "paying" || bulk.phase === "looking";
      bulk.el.querySelector("textarea").disabled = bulk.phase === "paying";
      const findBtn = bulk.el.querySelector('[data-k="find"]'); findBtn.disabled = busy;
      findBtn.textContent = bulk.phase === "looking" ? `Looking… ${bulk.rows.filter((r) => r.state !== "looking").length}/${bulk.rows.length}` : bulk.rows.length ? "Find again" : "Find them";
      const rows = [];
      for (const [ri, r] of bulk.rows.entries()) {
        const box = el("div", `brow${r.shown ? "" : " rise"}${r.state === "found" && r.invs.length ? "" : " off"}`); box.style.setProperty("--i", String(Math.min(ri, 12))); r.shown = true;
        const h = el("div", "h");
        if (r.state === "found") {
          h.append(el("b", null, r.name || r.user), el("span", `mono${r.guess ? " warn" : ""}`, r.user.toLowerCase() !== r.token.toLowerCase() ? `${r.token} → ${r.user}` : r.user)); box.append(h);
          if (r.guess && r.invs.length) box.append(el("div", "sub warn", "Not the exact username you pasted: tick it if this is the right customer"));
          box.append(el("div", "sub", [r.where, r.paidTo ? `paid to ${r.paidTo}` : "nothing paid yet"].filter(Boolean).join(" · ")));
          if (!r.invs.length) box.append(el("div", "sub good", "Nothing unpaid"));
          box.append(...monthRows(r, ri, busy, bulk, bulkDraw));
        } else {
          h.append(el("b", null, r.token), el("span", "mono", { looking: "looking…", none: "not found", pick: "which one?", dupe: "listed twice", error: "failed" }[r.state])); box.append(h);
          if (r.state === "error") box.append(el("div", "sub late", r.err));
          if (r.state === "dupe") box.append(el("div", "sub", "Same customer as a line above: shown once"));
          if (r.state === "none") box.append(el("div", "sub", "No invoice has this username or anything close. Check the spelling."));
          if (r.state === "pick") box.append(el("div", "sub", "No exact username: is it one of these?"));
          if (r.state === "pick" || r.state === "error") {
            const p = el("div", "picks");
            for (const c of r.state === "pick" ? r.cands : [r.pick || r.token]) { const b = el("button", "btn", c); b.type = "button"; b.disabled = busy;
              b.onclick = async () => { r.pick = c; r.guess = false; await lookup(r); await radius(r.invs); bulkDraw(); }; p.append(b); }
            box.append(p);
          }
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
        if (bulk.phase === "paying") {
          const bar = el("div", "bar"), i = el("i"); i.style.width = `${(bulk.done / bulk.total) * 100}%`; bar.append(i);
          const stop = el("button", "btn wide", bulk.stop ? "Stopping after this one…" : `Paying ${bulk.done + 1} of ${bulk.total} · Stop`); stop.type = "button"; stop.disabled = bulk.stop;
          stop.onclick = () => { bulk.stop = true; bulkDraw(); }; stop.dataset.k = "pay";
          parts.push(bar, stop, el("div", "sub", "Keep this tab open until it's done."));
        } else {
          if (bulk.phase === "done") {
            const all = bulk.rows.flatMap((r) => r.invs.filter((v) => v.result)), ok = all.filter((v) => v.result.ok).length;
            parts.push(el("div", `sum ${ok === all.length ? "good" : "warn"}`, `${ok} marked Lunas${all.length - ok ? ` · ${all.length - ok} not: see the red lines` : ""}`));
          }
          const btn = armButton(bulk, ch.length ? `Mark ${ch.length} Lunas · ${rupiah(total)}${recharges ? ` · ${recharges} recharge` : ""}` : "Tick the months to pay",
            `Click again: mark ${ch.length} paid (${people} customers, ${rupiah(total)})`, pay, bulkDraw, "pay");
          btn.disabled = !ch.length;
          parts.push(btn);
        }
      }
      form.replaceChildren(...fields); foot.replaceChildren(...parts); foot.hidden = !parts.length;
      if (focus) bulk.el.querySelector(`[data-k="${focus}"]`)?.focus();
    }

