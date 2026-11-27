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


  // ---------- no "Aktifkan Izin Dulu" screen ----------
  // The ERP covers the whole page with a dark "Aktifkan Izin Dulu" screen (data-layar-wajib) when the browser has
  // Location or Notifications blocked. A desk needs neither, so the screen is hidden (not removed, so the page's own
  // code keeps working) and the page scrolls as usual under it. Allowing both in the browser still works the same.
  try {
    const css = document.createElement("style");
    css.textContent = "[data-layar-wajib]{display:none!important}html:has([data-layar-wajib]),body:has([data-layar-wajib]){overflow:auto!important}";
    (document.head || document.documentElement).append(css);
  } catch {}
