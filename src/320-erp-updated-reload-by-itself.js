  // ---------- ERP updated: reload by itself only when it's safe ----------
  // The "new version" bar is gone (see the top), but a page left open on an old build drifts from the server. Here the
  // build is checked every 2 minutes; once it changes, the Dock button gets a small dot and the page reloads by itself
  // the moment nothing is at stake: no typing on this page for 10 minutes (or since you last moved to another page),
  // no dialog or Dock open, no Dock payment running, and a minute without touching anything.
  {
    let build = null, typed = 0, typedOn = location.pathname;
    for (const t of ["pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(t, (e) => { if (e.isTrusted) touched = Date.now(); }, { capture: true, passive: true });
    // typing into the page's own fields (not the Dock) counts as work in progress
    addEventListener("input", (e) => { if (e.isTrusted && !e.target.closest?.(".erp-dock, .erp-fs")) { typed = Date.now(); typedOn = location.pathname; } }, true);
    const safe = () => payingNow === 0 && !document.querySelector(".erp-dock, [role='dialog'], [role='alertdialog']")
      && Date.now() - touched > 60e3 && !(typed && typedOn === location.pathname && Date.now() - typed < 600e3);
    const mark = () => {
      const fab = document.querySelector(".erp-dock-fab"); if (!fab) return;
      fab.classList.toggle("stale", !!staleSince);
      if (staleSince) fab.title = "The ERP was updated: this page reloads by itself once you're not using it (or press F5)"; else fab.removeAttribute("title");
    };
    async function check() {
      try {
        const j = await (await realFetch("/api/version", { cache: "no-store" })).json(); if (!j?.version) return;
        if (!build) build = j.version;
        else if (j.version !== build && !staleSince) staleSince = Date.now();
      } catch { /* server restarting: next time */ }
      mark();
    }
    check(); setInterval(() => { if (!document.hidden) check(); }, 120e3);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    setInterval(() => { mark(); if (staleSince && safe()) location.reload(); }, 15e3);
    const css = el("style"); css.textContent = `
      .erp-dock-fab.stale::before { content: ""; position: absolute; bottom: 6px; right: 6px; width: 7px; height: 7px; border-radius: 50%; background: #e9e1dc;
        box-shadow: 0 0 0 2px #090b0c; animation: erp-stale 2.4s ease-in-out infinite; }
      @keyframes erp-stale { 50% { opacity: .35; } }
      @media (prefers-reduced-motion: reduce) { .erp-dock-fab.stale::before { animation: none; } }`;
    (document.head || document.documentElement).append(css);
  }

  // the site moves between pages without reloading: redraw when the address changes
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); setTimeout(draw, 0); return r; };
  }
  addEventListener("popstate", () => setTimeout(draw, 0));
  draw();
})();
