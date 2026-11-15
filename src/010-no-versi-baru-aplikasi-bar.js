  // ---------- no "Versi baru aplikasi" bar ----------
  // The ERP is deployed many times an hour, and each deploy raised a blue bar asking to reload (or reloaded an idle page
  // by itself). Two triggers, both switched off here, before the page's own scripts run:
  // - its version check (every 30 min and on returning to the tab) stays quiet while its own "Nanti" snooze is set, so the
  //   snooze is set far ahead, for this tab;
  // - a new service worker taking over fires "controllerchange", which shows the bar and reloads; the page's listener for
  //   that event is never added.
  // The new version still arrives with any reload or new tab you open yourself.
  try { sessionStorage.setItem("sw_update_snooze_until", String(Date.now() + 10 * 365 * 864e5)); } catch {}
  try {
    const sw = navigator.serviceWorker, add = sw && sw.addEventListener;
    if (add) sw.addEventListener = function (type, fn, opts) { if (type === "controllerchange") return; return add.call(this, type, fn, opts); };
  } catch {}

