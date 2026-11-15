    // ---- Outage radar ----
    // Every 5 minutes one ERP tab reads the LDN panel's router feed (how many sessions each router has open right now,
    // 20 KB) and keeps 48 hours of it, so each router has its own usual level; well below its last two hours is an
    // outage, and the Dock button gets a red dot. Opening a router reads the live session list (6 MB, ~1 s) to show
    // which of its customers are offline, by village and on a map.
    const RADAR_AT = "erpDock.radarAt", RADAR_EVERY = 5 * 60000, RADAR_KEEP = 48 * 3600000;
    let radar = null, radarOff = "", radarDrawn = 0, areas = null, live = null, liveLoading = null;
    const median = (a) => { const x = a.filter((v) => v != null).sort((p, q) => p - q); return x.length ? x[Math.floor(x.length / 2)] : null; };
    const hhmm = (t) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    async function radarTick(force) {
      if (radarOff && !force) return;
      const last = Number(ls.get(RADAR_AT, 0));
      if (force || Date.now() - last >= RADAR_EVERY) {
        ls.set(RADAR_AT, Date.now()); // the other tabs wait
        try {
          const ov = await api("/api/admin/ldn-radius/panel?view=overview");
          const hist = (await idbGet("radar")) || { s: [] }, c = {};
          for (const f of ov.feed || []) c[f.nasname] = Number(f.open) || 0;
          hist.s = [...hist.s.filter((x) => x.t > Date.now() - RADAR_KEEP), { t: Date.now(), c }];
          hist.feed = (ov.feed || []).map((f) => ({ ip: f.nasname, name: f.shortname, open: Number(f.open) || 0, healthy: !!f.healthy, newest: f.newest }));
          hist.at = Date.now(); radarOff = "";
          await idbPut("radar", hist);
        } catch (e) {
          ls.set(RADAR_AT, last);
          if (/HTTP 40[13]|izin|akses|forbidden/i.test(e.message)) radarOff = "Your account can't read the LDN panel, so the radar can't run.";
          else if (force) radarOff = e.message;
        }
      }
      const hist = await idbGet("radar");
      radar = hist ? assess(hist) : null;
      if (fab) { const a = radar?.alerts ?? []; fab.classList.toggle("alert", a.length > 0); fab.title = a.length ? `Dock (Alt+K): outage on ${a.map((x) => x.name).join(", ")}` : "Dock (Alt+K)"; }
      if (panel && (view.mode === "radar" || (!view.q.trim() && !view.card && !view.mode)) && radar?.at !== radarDrawn) drawBody();
    }
    // each router against its own last two hours (ignoring the latest 20 minutes): down below 30%, a drop from 8 or 10%
    function assess(hist) {
      const now = Date.now(), samples = hist.s || [], list = [];
      for (const f of hist.feed || []) {
        const vals = samples.map((x) => [x.t, x.c[f.ip]]).filter(([, v]) => v != null);
        const usual = median(vals.filter(([t]) => t < now - 20 * 60000 && t > now - 120 * 60000).map(([, v]) => v));
        const cur = f.open, gap = usual == null ? 0 : usual - cur, step = usual == null ? 0 : Math.max(8, usual * 0.1);
        let level = "ok";
        if (usual == null) level = cur > 0 ? "learning" : "silent";
        else if (usual < 5 && cur < 5) level = "silent";
        else if (cur <= usual * 0.3 || (!f.healthy && usual >= 10)) level = "down";
        else if (gap >= step) level = "drop";
        let since = null; // when the dip began
        if (level === "down" || level === "drop") for (let i = vals.length - 1; i >= 0 && vals[i][1] <= usual - step / 2; i--) since = vals[i][0];
        list.push({ ...f, usual, gap, level, since, series: vals.filter(([t]) => t > now - 24 * 3600000) });
      }
      const rank = { down: 0, drop: 1, learning: 2, ok: 3, silent: 4 };
      list.sort((a, b) => rank[a.level] - rank[b.level] || b.open - a.open);
      const alerts = list.filter((x) => x.level === "down" || x.level === "drop"), watched = list.filter((x) => x.level !== "silent");
      return { at: hist.at, list, alerts, wide: watched.length >= 4 && alerts.length >= watched.length * 0.6, learning: !samples.length || now - samples[0].t < 25 * 60000 };
    }
    const nameNorm = (n) => String(n || "").toUpperCase().replace(/^RO[\s-]+/, "").trim();
    async function areaNames() {
      if (areas && Date.now() - areas.at < 30 * 60000) return areas;
      try { const j = await api("/api/admin/ldn-radius/panel?view=area-summary"); areas = { at: Date.now(), rows: j.rows || [] }; } catch { areas = { at: Date.now(), rows: [] }; }
      return areas;
    }
    // the live sessions: who is online right now, on which router, for how long
    function liveSessions() {
      if (live && Date.now() - live.at < 2 * 60000) return Promise.resolve(live);
      return (liveLoading ||= api("/api/admin/ldn-radius/panel?view=online").then((j) => {
        const by = new Map(); for (const x of j.sessions || []) by.set(String(x.username).toLowerCase(), { ip: x.nasipaddress, up: Number(x.uptimeSec) || 0, addr: x.framedipaddress, ro: x.router, type: x.userType,
          start: Date.parse(x.acctstarttime) || 0, upd: Date.parse(x.acctupdatetime) || 0, mac: x.mac || "" });
        return (live = { at: Date.now(), by });
      }).finally(() => { liveLoading = null; }));
    }
