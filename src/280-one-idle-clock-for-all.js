  // ---------- one idle clock for all ERP tabs ----------
  // The ERP logs out after 120 minutes without a click, key, touch or scroll, counted in each tab on its own; and a
  // logout in any tab signs out every tab. So with ten tabs open and work in one, a forgotten tab ends everyone's
  // session. Here real activity in one tab is passed to the others (at most every 30 s), where it counts as a scroll,
  // which the ERP's idle timer listens for. Only real input is passed on: 120 minutes of really doing nothing still
  // logs you out, as the ERP intends.
  try {
    const chan = new BroadcastChannel("erp-fast-activity");
    let sent = 0;
    const real = (e) => {
      if (!e.isTrusted) return; // the scroll this script raises itself doesn't travel on
      const now = Date.now();
      if (now - sent < 30000) return;
      sent = now; chan.postMessage(now);
    };
    for (const t of ["mousedown", "keydown", "touchstart", "scroll"]) addEventListener(t, real, { capture: true, passive: true });
    chan.onmessage = () => dispatchEvent(new Event("scroll"));
  } catch { /* no BroadcastChannel: each tab keeps its own clock */ }

