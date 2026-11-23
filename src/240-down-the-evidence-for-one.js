    // ---- Down? The evidence for one customer ----
    // When the line went down (the Dock's drop log and the modem's last TR-069 report), who else is down with them (the
    // modems on the same PON port, the neighbours within 300 m, the router), the modem's signal and the session's IP/MAC,
    // open complaints and arrears in one line; then a verdict, and a summary to paste into a ticket or a chat.
    const hist = new Map();
    function forensicBox(r) {
      const box = el("div", "near hist rise"); box.style.setProperty("--i", "2");
      if (!onts) ontIndex().then(() => box.isConnected && draw(box.d)).catch(() => {});
      if (!acs) acsIndex().then(() => box.isConnected && draw(box.d)).catch(() => {});
      function draw(d) {
        box.d = d;
        const e = el("div", "eyebrow"); e.style.margin = "0 0 8px"; e.append("Down?"); const out = [e];
        const { facts, v, text } = forensicRead(r, d);
        out.push(el("p", `verdict ${v[0]}`, v[1]));
        const dl = el("dl", "facts"); for (const [k, x] of facts) dl.append(el("dt", null, k), el("dd", null, x)); out.push(dl);
        if (!d) out.push(el("p", "note ld", "Reading the drop log, complaints and bill…"));
        else {
          const acts = el("div", "actions"), c = el("button", "btn", "Copy summary"); c.type = "button"; c.onclick = () => copy(text, c); acts.append(c);
          const now = el("button", "btn", "Check now"); now.type = "button"; now.onclick = async () => { now.disabled = true; now.textContent = "Reading the sessions…"; live = null; await liveSessions().catch(() => {}); hist.delete(r.username); start(); }; acts.append(now);
          out.push(acts);
          if (!d.dl) out.push(el("p", "note", "The drop log starts with the next reading (every 15 minutes while an ERP tab is open), so times show from then on."));
        }
        box.replaceChildren(...out);
      }
      function start() {
        const kept = hist.get(r.username);
        if (kept && Date.now() - kept.at < 2 * 60000) return draw(kept.d);
        draw(null); forensicLoad(r).then((d) => { hist.set(r.username, { at: Date.now(), d }); if (box.isConnected) draw(d); }).catch(() => box.replaceChildren(el("p", "note", "The ERP didn't answer.")));
      }
      start(); return box;
    }

    async function forensicLoad(r) {
      const [tix, due, dl, tl] = await Promise.all([
        r.customerDocId ? api(`/api/pg-read/tickets?where=customerId%3A${encodeURIComponent(r.customerDocId)}&limit=10&orderBy=createdAt%3Adesc&fields=issue,status,ticketId,createdAt`).catch(() => null) : null,
        api(`/api/customers/status-tagihan?username=${encodeURIComponent(r.username)}`).catch(() => null), dropsOf(),
        r.isolir ? api(`/api/admin/billing/customer-timeline?${r.customerDocId ? `customerId=${encodeURIComponent(r.customerDocId)}` : `username=${encodeURIComponent(r.username)}`}`).catch(() => null) : null]);
      return { tix: (tix?.data || []).filter((t) => t.status !== "Terselesaikan"), due, dl, isoAt: (tl?.events || []).filter((e) => /isolir/i.test(e.type)).map((e) => Date.parse(e.at)).sort((x, y) => y - x)[0] || null };
    }
    // what the evidence says: the facts, the verdict and a summary to paste (the card's "Down?" box, and WhatsApp's Check)
    function forensicRead(r, d) {
      const fmt = (t) => new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const dur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.round(m / 1440)} days`; };
      const u = lower(r.username);
      const { ont: o, dev } = modemOf(r), rec = d?.dl?.u[u], gone = d?.dl?.off[u], sess = live && Date.now() - live.at < 5 * 60000 ? live.by.get(u) : null;
      const online = sess ? true : rec && d.dl.at && !gone && rec.last === d.dl.at ? true : !!r.online;
      // who else: the PON port, the neighbours, the router
      const port = o && onts ? onts.rows.filter((x) => x.pid === o.pid && x.pon === o.pon) : [];
      const portOff = port.filter((x) => !/online|working/i.test(x.st || "")).length;
      const nb = (nearby(r, 300)?.list || []).filter((x) => !x.r.isolir), nbOff = nb.filter((x) => !(live?.by.has(lower(x.r.username)) ?? x.r.online)).length;
      const rad = radar?.list.find((x) => fold(x.name) === fold(r.router || "")), radBad = rad && (rad.level === "down" || rad.level === "drop");
      const day = Date.now() - 86400000, recon = (rec?.s || []).filter((t) => t > day).length, recon7 = (rec?.s || []).length;
      const rx = o?.rx, rxBad = rx != null && rx < -28, rxWeak = rx != null && rx < -26;
      // when
      const facts = [];
      if (r.isolir) facts.push(["State", `Isolir${d?.isoAt ? ` since ${fmt(d.isoAt)}` : ""}`]);
      else if (online) { const st = sess?.start || rec?.s.at(-1); facts.push(["State", st ? `Online since ${fmt(st)} (${dur(Date.now() - st)})` : "Online"]); }
      else {
        const tr = dev?.inform ? Date.parse(dev.inform) : 0;
        const when = gone ? (tr && tr >= gone.from - 60000 && tr <= gone.seen ? `Down since about ${fmt(tr)} (the modem's last report)` : `Down between ${fmt(gone.from)} and ${fmt(gone.seen)}`)
          : tr ? `Down since about ${fmt(tr)} (the modem's last report)` : d?.dl?.first ? `Down since before ${fmt(d.dl.first)}, when the Dock started its drop log` : "Down (the drop log starts with the next reading)";
        facts.push(["State", when]);
      }
      if (recon7 > 1) facts.push(["Reconnects", `${recon} in 24 h, ${recon7 - 1} in 7 days${recon >= 4 ? " · unstable" : ""} · ${(rec.s.slice(-6).reverse().map((t) => fmt(t))).join(", ")}`]);
      if (o) facts.push(["Modem", `${o.olt} · PON ${o.pon} · ${o.st || "?"}${rx != null ? ` · ${rx} dBm${rxBad ? " (critical)" : rxWeak ? " (weak)" : ""}` : ""}${o.seen ? ` · read ${fmt(Date.parse(o.seen))}` : ""}`]);
      if (dev) facts.push(["TR-069", `last report ${fmt(Date.parse(dev.inform))}`]);
      if (port.length) facts.push(["Same port", `${portOff} of ${port.length} modems offline`]);
      if (nb.length) facts.push(["Within 300 m", `${nbOff} of ${nb.length} customers offline`]);
      if (rad) facts.push(["Router", `${rad.name}: ${radBad ? `${rad.level === "down" ? "down" : "dropping"} since ${hhmm(rad.since)}` : "at its usual level"}`]);
      const ss = sess || rec; if (ss && (ss.addr || ss.ip)) facts.push(["Session", [ss.addr || ss.ip, ss.mac, ss.nas || sess?.ip].filter(Boolean).join(" · ")]);
      if (d?.tix.length) facts.push(["Complaints", `${d.tix.length} open · ${d.tix[0].ticketId || ""} ${d.tix[0].issue || ""}`.trim()]);
      if (d?.due?.ok && d.due.jumlahTagihan) facts.push(["Arrears", `${d.due.jumlahTagihan} overdue · Rp ${Number(d.due.totalTunggakan || 0).toLocaleString("id-ID")}`]);
      // the verdict
      const v = r.isolir ? ["iso", "Isolir: cut off for the bill, not a network fault."]
        : radBad ? ["net", `Router ${rad.name} is ${rad.level === "down" ? "down" : "dropping"}: area-wide, not just this customer.`]
        : !online && port.length >= 4 && portOff >= 3 && portOff / port.length >= 0.5 ? ["net", "The whole PON port is down: a line fault before the FAT (see Outage radar → Cause & dispatch)."]
        : !online && nb.length >= 3 && nbOff / nb.length >= 0.5 ? ["net", "Neighbours are down too: the FAT or the line in this area."]
        : !online && rxBad ? ["cut", "Only this customer, and the signal was critical: their drop cable or connector."]
        : !online ? ["off", `Only this customer${rx != null ? `, signal was fine (${rx} dBm)` : ""}: the modem's power or the modem itself. Ask if it's on.`]
        : recon >= 4 ? ["warn", `Online but unstable: ${recon} reconnects in 24 h. ${rxWeak ? "Weak signal: clean or redo the connector." : "Power or the modem."}`]
        : ["ok", `Online and steady${rxWeak ? `, but the signal is weak (${rx} dBm)` : ""}: if they complain, it's inside the house (WiFi, devices) or the plan's speed.`];
      const text = [`*CEK PELANGGAN* · ${r.nama || r.username} (${r.username})`, ...facts.map(([k, x]) => `${k}: ${x}`), `Dugaan: ${v[1]}`, `Dicek ${wib()} WIB`].join("\n");
      return { facts, v, text, online };
    }

    function reportBox({ title, down, total, since, custs, age }) {
      if (!techMap) techIndex().then(() => {}).catch(() => {}); // the team line appears once the map is in
      const box = el("div", "near report"), e = el("div", "eyebrow"); e.style.margin = "0 0 8px"; e.append("Outage report"); box.append(e);
      const title1 = (d) => String(d).toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()); // KASIHAN and Kasihan are one village
      const vil = new Map(); for (const c of custs) { const d = c.desa ? title1(c.desa.trim()) : "?"; vil.set(d, (vil.get(d) || 0) + 1); }
      const villages = [...vil].sort((a, b) => b[1] - a[1]), pts = custs.map(where).filter(Boolean);
      const mid = pts.length ? { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length } : null;
      const text = [`*GANGGUAN* · ${title}`, `${down} dari ${total} offline${since ? ` sejak ${hhmm(since)}` : ""}${age ? ` (data ${age})` : ""}`,
        villages.length ? `Desa: ${villages.slice(0, 8).map(([d, n]) => `${d} (${n})`).join(", ")}${villages.length > 8 ? ", …" : ""}` : "",
        custs.length === down ? `Pelanggan terdampak: ${custs.length}` : `Pelanggan terdampak yang terdata: ${custs.length} dari ${down} modem offline`,
        (() => { const t = [...new Set(villages.slice(0, 3).flatMap(([d]) => teamsFor(d).filter((x) => teamKind(x.name) === "field").map((x) => x.name)))]; return t.length ? `Tim: ${t.join(", ")}` : ""; })(), mid ? `Lokasi: https://www.google.com/maps?q=${mid.lat.toFixed(6)},${mid.lng.toFixed(6)}` : "", `Dilaporkan ${wib()} WIB`].filter(Boolean).join("\n");
      const notice = `Pelanggan Yth, saat ini sedang ada gangguan jaringan di area ${villages.slice(0, 3).map(([d]) => d).filter((d) => d !== "?").join(", ") || "Anda"}. Tim teknisi kami sedang menanganinya. Mohon maaf atas ketidaknyamanannya. Terima kasih.`;
      const phones = [...new Set(custs.map((c) => phone62(c.phone)).filter(Boolean))];
      const pre = el("div", "pw msg"); pre.textContent = text; box.append(pre);
      const acts = el("div", "actions"), btn = (label, fn) => { const b = el("button", "btn", label); b.type = "button"; b.onclick = () => fn(b); acts.append(b); return b; };
      btn("Copy report", (b) => { copy(text, b); incidentNote("Outage report copied for the technicians"); });
      const wa = el("a", "btn primary", "WhatsApp ↗"); wa.href = `https://wa.me/?text=${encodeURIComponent(text)}`; wa.target = "_blank"; wa.rel = "noreferrer noopener"; wa.onclick = () => incidentNote("Outage report sent on WhatsApp"); acts.prepend(wa);
      if (phones.length) btn(`Copy ${phones.length} phone numbers`, (b) => copy(phones.join("\n"), b));
      if (custs.length) btn("Copy customer notice", (b) => copy(notice, b));
      box.append(acts); return box;
    }

