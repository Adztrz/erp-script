    // ---- Shift journal: a draft for the ERP's Jurnal Piket NOC ----
    // The incidents of the shift that's running (with their timelines) and what was done from the Dock (SPKs, Fix RO,
    // reboots) become entries written the way the journal's own example is: time, what happened, what was done, when it
    // came back. Each can be edited and recorded with the journal's own "Catat" (an entri: category, text, reference);
    // closing the shift (serah terima) stays in the ERP.
    const JP_DONE = "erpDock.jpDone", JP_KAT = { gangguan: "Gangguan / insiden", tiket: "Tiket pelanggan", pemantauan: "Pemantauan rutin", pemeliharaan: "Pemeliharaan / konfigurasi", koordinasi: "Koordinasi lapangan", lainnya: "Lain-lain" };
    let jp = null; // { at, shift: { id, shift, mulaiMs, selesaiMs }, err }
    const wibDate = (t = Date.now()) => new Date(t + 7 * 3600000).toISOString().slice(0, 10);
    async function jpLoad() {
      try { const j = await api(`/api/noc/jurnal-piket?tanggal=${wibDate()}`); jp = { at: Date.now(), shift: j.sekarang?.berjalan || null, write: j.bolehTulis !== false }; }
      catch (err) { jp = { at: Date.now(), err: err.message }; }
    }
    function incidentEntry(inc) {
      const notes = inc.log.filter(([, , auto]) => !auto).map(([t, x]) => `${hhmm(t)} ${x}`);
      const what = inc.kind === "router" ? `${inc.title} turun, ${inc.peak} sesi di bawah biasanya` : `${inc.title}: ${inc.peak} pelanggan mati bersamaan${inc.size ? ` (dari ${inc.size} di port)` : ""}`;
      return `${hhmm(inc.start)} ${what}.${notes.length ? ` ${notes.join("; ")}.` : ""} ${inc.state === "open" ? "Masih berlangsung." : `Pulih ${hhmm(inc.end)} (${lama(inc.end - inc.start)}).`}`;
    }
    function journalView() {
      const out = [], head = el("div", "rhead"), e = el("div", "eyebrow"); e.style.margin = "10px 6px 6px"; e.append("Shift journal");
      const erp = el("a", "btn", "Jurnal Piket ↗"); erp.href = "/noc-dashboard/jurnal-piket"; const tools = el("div", "tools"); tools.append(erp); head.append(e, tools);
      const back = el("button", "back", "← Back"); back.type = "button"; back.style.marginLeft = "6px"; back.onclick = () => { view.mode = null; drawBody(); };
      out.push(head, back);
      if (!jp || Date.now() - jp.at > 5 * 60000) { out.push(el("p", "note ld", "Reading the journal's current shift…")); Promise.all([jpLoad(), incList(), idbGet("shiftlog").then((l) => (view.jpLog = l || []))]).then(() => view.mode === "journal" && drawBody()); return out; }
      if (jp.err) { out.push(el("p", "note late", `The journal didn't answer: ${jp.err}`)); return out; }
      const s = jp.shift; if (!s) { out.push(el("p", "note", "No shift is running in the journal right now.")); return out; }
      out.push(el("p", "note", `Shift ${s.shift}, ${hhmm(s.mulaiMs)}–${hhmm(s.selesaiMs)} (${s.tanggalPiket}). Each draft below can be edited, then recorded with Catat; closing the shift stays in the ERP.`));
      const done = new Set(ls.get(JP_DONE, {})[s.id] || []), mark = (k) => { const all = ls.get(JP_DONE, {}); all[s.id] = [...new Set([...(all[s.id] || []), k])]; ls.set(JP_DONE, Object.fromEntries(Object.entries(all).slice(-6))); };
      const drafts = [
        ...(incidents || []).filter((i) => i.start < s.selesaiMs && (i.end || Date.now()) >= s.mulaiMs).map((i) => ({ k: `inc:${i.id}:${i.state}`, t: i.start, kategori: "gangguan", teks: incidentEntry(i), rujukan: i.title })),
        ...(view.jpLog || []).filter((x) => x.t >= s.mulaiMs && x.t < s.selesaiMs).map((x) => ({ k: `log:${x.t}`, t: x.t, kategori: x.kategori, teks: `${hhmm(x.t)} ${x.teks}`, rujukan: x.rujukan })),
      ].sort((a, b) => a.t - b.t);
      if (!drafts.length) { out.push(el("p", "note", "Nothing from the Dock in this shift yet: incidents, SPKs, Fix RO and reboots show up here.")); return out; }
      if (!jp.write) out.push(el("p", "note warn", "Your account can read the journal but not write to it: copy the drafts instead."));
      const st = (view.jpSt ||= {});
      drafts.forEach((d, i) => {
        const box = el("div", `near jp rise${done.has(d.k) ? " done" : ""}`); box.style.setProperty("--i", String(Math.min(i, 10)));
        const f = (st[d.k] ||= { kategori: d.kategori, teks: d.teks, rujukan: d.rujukan });
        const sel = el("select", "field"); for (const [k, l] of Object.entries(JP_KAT)) { const o = el("option", null, l); o.value = k; o.selected = f.kategori === k; sel.append(o); }
        sel.onchange = () => { f.kategori = sel.value; };
        const ta = el("textarea", "field"); ta.rows = 3; ta.value = f.teks; ta.dataset.k = `jp${i}`; ta.oninput = () => { f.teks = ta.value; };
        const ref = el("input", "field"); ref.value = f.rujukan; ref.placeholder = "Rujukan (opsional): tiket / router / OLT"; ref.oninput = () => { f.rujukan = ref.value; };
        const acts = el("div", "actions");
        if (done.has(d.k)) acts.append(el("span", "sub", "Recorded in the journal"));
        else {
          const rec = el("button", "btn primary", f.busy ? "Recording…" : "Catat"); rec.type = "button"; rec.disabled = !!f.busy || !jp.write;
          rec.onclick = async () => { f.busy = true; drawBody();
            try { await api("/api/noc/jurnal-piket", { aksi: "entri", jurnalId: s.id, kategori: f.kategori, teks: f.teks.trim(), rujukan: f.rujukan.trim() }); mark(d.k); f.err = ""; }
            catch (err) { f.err = `Not recorded: ${err.message}`; }
            f.busy = false; drawBody(); };
          const cp = el("button", "btn", "Copy"); cp.type = "button"; cp.onclick = () => copy(f.teks, cp);
          const skip = el("button", "copy", "Skip"); skip.type = "button"; skip.onclick = () => { mark(d.k); drawBody(); };
          acts.append(rec, cp, skip);
        }
        box.append(sel, ta, ref, acts); if (f.err) box.append(el("p", "note late", f.err)); out.push(box);
      });
      // a summary for closing the shift in the ERP (serah terima)
      const open = (incidents || []).filter((i) => i.state === "open");
      const sum = [`Shift ${s.shift} ${s.tanggalPiket}: ${drafts.filter((d) => d.kategori === "gangguan").length} gangguan, ${drafts.length - drafts.filter((d) => d.kategori === "gangguan").length} tindakan lain.`,
        open.length ? `Masih menggantung: ${open.map((i) => i.title).join(", ")}.` : "Tidak ada gangguan yang menggantung."].join(" ");
      const sb = el("div", "near rise"), se = el("div", "eyebrow"); se.style.margin = "0 0 6px"; se.append("For the handover"); const pre = el("div", "pw msg"); pre.textContent = sum;
      const c = el("button", "btn", "Copy summary"); c.type = "button"; c.onclick = () => copy(sum, c); const a = el("div", "actions"); a.append(c);
      sb.append(se, pre, a); out.push(sb);
      return out;
    }
    function journalItem(i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(svg("M6 3h10l3 3v15H6zM9 8h7M9 12h7M9 16h4"), el("span", "t", "Shift journal"), el("span", "r", "Jurnal Piket"), el("span", "s", "This shift's incidents and actions, drafted for the NOC journal"));
      b.onclick = () => { view.mode = "journal"; view.card = null; jp = null; drawBody(); }; return b;
    }
