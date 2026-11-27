  // ---------- critical alarm: a quiet cue instead of the siren ----------
  // The siren of "Alarm Insiden Kritis" is muted (010), so an alarm in a tab you're not looking at would go unseen.
  // Instead, once per new alarm: one soft two-note chime (one tab chimes, not every open ERP tab), and while the red
  // screen is up the tab's title blinks "🔴 <the alarm>" and its icon turns into a red dot, so it shows in the tab
  // strip. Both go back as soon as the alarm is handled (Matikan Alarm / Saya tangani, here or in any tab).
  try {
    const CHIMED = "erpDock.alarmChimed";
    const read = () => {
      const s = document.querySelector('[data-layar-wajib][aria-label="Alarm insiden kritis"]');
      return s ? (s.querySelector("h2")?.textContent || "Alarm insiden kritis").replace(/^[\s🔴🚨]+/u, "").trim() : null;
    };
    const chime = (title) => {
      // one chime per alarm across tabs: the first tab to claim it in localStorage plays it
      let kept = {}; try { kept = JSON.parse(localStorage.getItem(CHIMED)) || {}; } catch {}
      const now = Date.now(); for (const k in kept) if (now - kept[k] > 6 * 3600000) delete kept[k];
      if (kept[title]) return;
      kept[title] = now; try { localStorage.setItem(CHIMED, JSON.stringify(kept)); } catch {}
      if (!rawConnect) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        [[660, 0], [880, 0.18]].forEach(([hz, at]) => {
          const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at;
          o.type = "sine"; o.frequency.value = hz;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
          rawConnect.call(o, g); rawConnect.call(g, ctx.destination); o.start(t); o.stop(t + 0.5);
        });
        setTimeout(() => ctx.close().catch(() => {}), 1200);
      } catch {}
    };
    const DOT = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#e5484d"/></svg>');
    let up = null, own = "", plain = document.title, flip = false, icon = null;
    const restore = () => {
      if (document.title === own) document.title = plain;
      icon?.remove(); icon = null; up = null;
    };
    setInterval(() => {
      const title = read();
      if (!title) { if (up) restore(); return; }
      if (title !== up) { up = title; chime(title); }
      if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; icon.href = DOT; icon.dataset.erpAlarm = ""; document.head.append(icon); }
      else if (document.head.lastElementChild !== icon && document.head.querySelector('link[rel~="icon"]:not([data-erp-alarm])')) document.head.append(icon);
      if (document.title !== own) plain = document.title; // the ERP changed it (another page): keep the new one to restore
      flip = !flip; own = flip ? `🔴 ${title}` : plain; document.title = own;
    }, 1200);
  } catch {}
