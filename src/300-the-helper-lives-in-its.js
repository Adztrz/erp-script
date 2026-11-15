    // ---- the helper lives in its own Dock-style panel next to the Dock button ----
    let helper = null, shown = false, pane = null;
    const panelEl = () => {
      if (pane) return pane;
      pane = el("div", "erp-akt-pane"); pane.setAttribute("role", "region"); pane.setAttribute("aria-label", "Dock: activation helper");
      // the activation form is a modal: keep its "click outside closes" and focus trap away from this panel
      for (const t of ["pointerdown", "mousedown", "keydown", "focusin"]) pane.addEventListener(t, (e) => { if (t !== "keydown" || e.key === "Escape") e.stopPropagation(); });
      return pane;
    };
    function showHelper(on) {
      shown = on;
      if (!on) { pane?.remove(); return; }
      const dlg = [...document.querySelectorAll("[role=dialog]")].find((d) => /Aktivasi Akun & Provisioning OLT/.test(d.querySelector("h2")?.textContent || "")); if (!dlg) { shown = false; return; }
      const p = panelEl(); document.body.append(p); p.style.pointerEvents = "auto";
      const r = document.querySelector(".erp-dock-fab")?.getBoundingClientRect();
      if (r) { const right = Math.max(16, innerWidth - r.right), below = r.top > innerHeight / 2;
        p.style.right = `${right}px`; p.style.left = "auto";
        if (below) { p.style.bottom = `${innerHeight - r.top + 12}px`; p.style.top = "auto"; } else { p.style.top = `${r.bottom + 12}px`; p.style.bottom = "auto"; }
        p.style.maxHeight = `${Math.max(240, Math.min(760, (below ? r.top : innerHeight - r.bottom) - 28))}px`; }
      if (!helper || helper.dlg !== dlg) { p.replaceChildren(el("p", "erp-akt-wait", "Reading the technician's report and the FAT list…")); build(dlg); }
      else if (!p.contains(helper.card)) p.replaceChildren(helper.card);
    }
    // pressing the Dock button while the activation form is open opens the helper instead of the Dock
    for (const t of ["pointerdown", "mousedown"]) addEventListener(t, (e) => { if (e.target.closest?.(".erp-dock-fab.akt")) e.stopPropagation(); }, true);
    addEventListener("click", (e) => { const f = e.target.closest?.(".erp-dock-fab.akt"); if (!f) return; e.stopPropagation(); e.preventDefault(); showHelper(!(shown && pane?.isConnected)); }, true);
    // focus moving into the helper must not be pulled back into the form
    addEventListener("focusout", (e) => { if (e.relatedTarget?.closest?.(".erp-akt-pane")) e.stopImmediatePropagation(); }, true);
    addEventListener("focusin", (e) => { if (e.target.closest?.(".erp-akt-pane")) e.stopImmediatePropagation(); }, true);
    function tick() {
      if (!location.pathname.startsWith(AQ)) { if (shown) showHelper(false); return; }
      // the queue: days waiting next to each install date
      for (const td of document.querySelectorAll("tr td")) {
        if (td.dataset.dockAge || !/^\d{2} [A-Za-z]{3} \d{4}$/.test(td.textContent.trim())) continue;
        const [d, m, y] = td.textContent.trim().split(" "), mi = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"].indexOf(m.toLowerCase());
        if (mi < 0) continue;
        const days = Math.floor((Date.now() - new Date(+y, mi, +d)) / 864e5); td.dataset.dockAge = "1";
        td.append(el("span", `erp-age${days > 30 ? " old" : ""}`, days <= 0 ? "today" : `${days} d${days > 30 ? " · stale" : ""}`));
      }
      const dlg = [...document.querySelectorAll("[role=dialog]")].find((d) => /Aktivasi Akun & Provisioning OLT/.test(d.querySelector("h2")?.textContent || ""));
      // the form stays as the ERP made it: the Dock button only gets a white dot, and pressing it opens the helper
      const fab = document.querySelector(".erp-dock-fab");
      fab?.classList.toggle("akt", !!dlg);
      if (fab) fab.title = dlg ? "Activation helper: FAT, username and modem for this form" : fab.title.startsWith("Activation helper") ? "" : fab.title;
      if (!dlg) { if (helper || shown) { helper = null; showHelper(false); } return; }
      if (helper && helper.dlg !== dlg) { helper = null; if (shown) build(dlg); }
      const chips = helper?.card.querySelector(".chips"); if (!chips) return;
      const now = needs(dlg), sig = JSON.stringify(now); if (chips.dataset.sig === sig) return; chips.dataset.sig = sig;
      // missing is just "to do"; only a taken username is an error
      chips.replaceChildren(...now.map((n) => el("span", `chip ${n.busy ? "busy" : n.ok === true ? "ok" : n.ok === false && n.k === "Username" ? "bad" : ""}`, n.k)));
    }
