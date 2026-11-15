    // ---- Outage report: the text for the technicians' group, and a notice and phone list for the customers ----
    const wib = (t = Date.now()) => new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const lalu = (t) => { const m = Math.floor((Date.now() - new Date(t)) / 60000); return m < 1 ? "baru saja" : m < 120 ? `${m} menit lalu` : m < 2880 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };
    const phone62 = (p) => { let d = String(p ?? "").replace(/\D/g, ""); if (d.startsWith("0")) d = "62" + d.slice(1); return d.length >= 10 ? d : ""; };
