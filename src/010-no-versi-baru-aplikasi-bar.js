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
  // The red "Alarm Insiden Kritis" screen uses the same mark but has an aria-label, so it stays.
  try {
    const css = document.createElement("style"), izin = "[data-layar-wajib]:not([aria-label])";
    css.textContent = `${izin}{display:none!important}html:has(${izin}),body:has(${izin}){overflow:auto!important}`;
    (document.head || document.documentElement).append(css);
  } catch {}

  // ---------- the critical alarm, without its siren ----------
  // "Alarm Insiden Kritis" also plays a square-wave siren (880/620 Hz, every 450 ms) and vibrates until someone presses
  // Matikan Alarm. The red screen and its buttons stay; only the siren is muted: while that screen is up, nothing
  // reaches the speakers through Web Audio, and the vibration is skipped. The Dock's own soft chime for the alarm
  // (285) goes through the browser's connect, kept here as rawConnect.
  const alarmUp = () => !!document.querySelector('[data-layar-wajib][aria-label="Alarm insiden kritis"]');
  const rawConnect = typeof AudioNode === "function" ? AudioNode.prototype.connect : null;
  try {
    const connect = rawConnect;
    AudioNode.prototype.connect = function (to, ...rest) {
      if (to instanceof AudioDestinationNode && alarmUp()) return to;
      return connect.call(this, to, ...rest);
    };
    const vibrate = navigator.vibrate;
    if (vibrate) navigator.vibrate = function (p) { return alarmUp() && p ? true : vibrate.call(this, p); };
  } catch {}
