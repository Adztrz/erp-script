    // ---- Answer: one verdict for a complaint, and the reply to send ----
    // The card's three readings joined, in the order a NOC checks them. Offline: the way up (a router, switch or link
    // down is an area outage), then the PON port and the neighbours, then the signal (their cable), then the modem's
    // power. Online: an uplink that's full (the area is busy), then their own line full (their use), then reconnects
    // (power or connector), then hardly any traffic (WiFi or devices). Each answer has the next step and a reply in
    // Indonesian to send the customer.
    function triageRead(r, f, t, p, due, now = Date.now()) {
      const kak = `Kak ${titleCase(String(r.nama || r.username).split(/\s+/).slice(0, 2).join(" "))}`, area = r.desa ? titleCase(r.desa.trim()) : "Anda";
      const say = (tone, kind, cause, step, reply, waiting = false) => ({ tone, kind, cause, step, reply, waiting });
      const rate = t?.rate || null, plan = t?.plan || 0, pct = rate && plan ? rate.down / (plan * 1e6) : null;
      const pathNet = p?.v[0] === "net", pathFull = p?.v[0] === "warn" && / is full /.test(p.v[1]);
      const AREA = `Mohon maaf ${kak}, saat ini sedang ada gangguan jaringan di area ${area}. Tim teknisi kami sedang menanganinya dan kami kabari kembali setelah normal. Terima kasih atas kesabarannya.`;
      if (r.isolir) {
        const owed = due?.ok && due.jumlahTagihan ? ` (${due.jumlahTagihan} tagihan, Rp ${Number(due.totalTunggakan || 0).toLocaleString("id-ID")})` : "";
        return say("iso", "Isolir", `Cut off for the bill${owed ? `: ${due.jumlahTagihan} overdue` : ""}, not a network fault.`, "Confirm the payment, or mark it paid with Pay.",
          `${kak}, layanan internet sedang terisolir karena ada tagihan yang belum terbayar${owed}. Setelah pembayaran, layanan akan aktif kembali. Terima kasih.`);
      }
      if (!f.online) {
        if (pathNet) return say("net", "Down · area outage", p.v[1], "Send the outage notice to the area (Outage radar → report) and dispatch to that link or router.", AREA);
        if (f.v[0] === "net") return say("net", "Down · area outage", f.v[1], "Send the outage notice to the area and dispatch to the port or FAT.", AREA);
        if (f.v[0] === "cut") return say("cut", "Down · their cable", f.v[1], "Schedule a technician for the drop cable or connector at the house.",
          `Mohon maaf ${kak}, dari pantauan kami ada kendala pada kabel menuju rumah ${kak}. Kami jadwalkan teknisi untuk pengecekan. Terima kasih.`);
        return say("off", "Down · their modem", f.v[1], "Ask whether the modem is on and which lights show (a red LOS is the cable), then a restart.",
          `${kak}, modem ${kak} terpantau offline dari sisi kami, sementara jaringan di area ${area} normal. Mohon cek apakah modem menyala dan lampu apa saja yang menyala (apakah ada lampu LOS merah?). Coba cabut listrik modem 10 detik lalu nyalakan lagi, lalu kabari kami ya.`);
      }
      if (pathFull) return say("warn", "Slow · the area is busy", p.v[1], "Not their line: tell them it's peak time in their area, and log the link for more capacity.",
        `Mohon maaf ${kak}, saat ini jalur jaringan di area ${area} sedang padat sehingga kecepatan bisa menurun di jam sibuk. Tim kami sedang menanganinya. Terima kasih atas pengertiannya.`);
      if (pct != null && pct >= 0.85) return say("warn", "Slow · their line is full", `Using ${Math.round(pct * 100)}% of the ${plan} Mbps plan right now: their own use fills it.`, "Fewer downloads or devices at once, or a bigger plan.",
        `${kak}, dari pantauan kami pemakaian internet ${kak} saat ini sedang penuh (sekitar ${bits(rate.down)} dari paket ${plan} Mbps), sehingga terasa lambat. Biasanya karena streaming, download, atau banyak perangkat sekaligus. Jika sering terjadi, ${kak} bisa upgrade paket.`);
      if (f.v[0] === "warn") return say("warn", "Unstable", f.v[1], "Check the modem's power first (loose socket, shared power strip), then the connector.",
        `${kak}, koneksi ${kak} terpantau sering putus-sambung. Mohon pastikan listrik modem stabil (colokan tidak longgar, tidak berbagi terminal dengan alat lain). Jika masih terjadi, kami jadwalkan teknisi untuk pengecekan.`);
      if (rate && rate.down < 50000) return say("off", "Slow · WiFi or devices", "Online and the way up is clear, but almost no traffic reaches the modem.", "A modem restart; their device near the modem; 5 GHz WiFi if they have it.",
        `${kak}, koneksi internet sampai ke modem ${kak} normal dari sisi kami. Mohon coba restart modem (cabut listrik 10 detik lalu nyalakan lagi) dan gunakan perangkat di dekat modem. Jika masih lambat, kabari kami ya.`);
      // a peak counts when it's the busy hour now (or the hour around it); otherwise it's a note on a clear line
      const hr = new Date(now).getHours(), inHour = (x) => !x.hrs?.length || x.hrs.some((h) => Math.abs(h - hr) <= 1 || Math.abs(h - hr) === 23);
      const pk = (p?.peaks || []).find(inHour), later = !pk && p?.peaks?.[0];
      if (pk) return say("warn", "Slow at peak hours", `Fine right now, but ${pk.say}: if it's slow mostly then, that's the cause.`,
        pk.up ? "Not their line: the network's upstream fills up at busy hours (the NOC's Bandwidth page has it); tell them it's the busy hours." : "Not their line: log the link for more capacity; tell them it's the busy hours in their area.",
        `${kak}, dari sisi kami koneksi ${kak} normal. Namun jalur jaringan ${pk.up ? "kami" : `di area ${area}`} memang sering padat pada jam ${pk.span} sehingga kecepatan bisa menurun di jam tersebut. Tim kami sedang menanganinya. Terima kasih atas pengertiannya.`);
      const also = later ? ` Later: ${later.say}.` : "";
      const CLEAR = `${kak}, dari sisi kami koneksi ${kak} normal dan jaringan di area ${area} lancar. Boleh dibantu kirim screenshot speedtest di dekat modem, dan perangkat mana yang terasa lambat?`;
      if (!rate) return say("ok", "Online", `Online and steady${p && p.v[0] === "ok" ? ", the way up clear" : ""}; the traffic reading comes with the next 5-minute report.${also}`, "Ask for a speed test near the modem meanwhile.", CLEAR, true);
      return say("ok", "Line is fine", `Online, steady, the way up clear${pct != null ? `, using ${Math.round(pct * 100)}% of the plan` : ""}.${also}`, "Most likely WiFi or one device: a speed test near the modem tells which.", CLEAR);
    }
    async function triageLoad(r, fresh) {
      await Promise.all([onts ? 0 : ontIndex().catch(() => {}), acs ? 0 : acsIndex().catch(() => {})]);
      const kept = hist.get(r.username);
      const d = !fresh && kept && Date.now() - kept.at < 2 * 60000 ? kept.d : await forensicLoad(r).then((x) => { hist.set(r.username, { at: Date.now(), d: x }); return x; });
      const [t, p] = await Promise.all([trafficRead(r, false).catch(() => null), pathFor(r).catch(() => null)]);
      return triageRead(r, forensicRead(r, d), t, p, d.due);
    }
    function answerBox(r) {
      const box = el("div", "near hist answer rise"); box.style.setProperty("--i", "1");
      const head = () => { const e = el("div", "eyebrow"); e.style.margin = "0 0 8px"; e.append("Answer"); return e; };
      let timer = null, polls = 0;
      const show = (a) => {
        const v = el("div", `verdict ${a.tone}`); v.append(el("b", null, a.kind), el("span", null, a.cause));
        const reply = el("blockquote", "reply", a.reply), acts = el("div", "actions"), c = el("button", "btn", "Copy reply"); c.type = "button"; c.onclick = () => copy(a.reply, c); acts.append(c);
        box.replaceChildren(head(), v, el("p", "step", `Next: ${a.step}`), reply, acts, ...(a.waiting ? [el("p", "note ld", "Watching for the traffic reading…")] : []));
      };
      const poll = async () => {
        if (!box.isConnected && polls) return clearInterval(timer);
        polls++; try { show(await triageLoad(r, false)); } catch (e) { box.replaceChildren(head(), el("p", "note late", e.message)); }
        if (polls > 10) clearInterval(timer);
      };
      box.append(head(), el("p", "note ld", "Reading the line, its traffic and the way up…"));
      setTimeout(() => { poll(); timer = setInterval(poll, 30000); }, 0);
      return box;
    }

