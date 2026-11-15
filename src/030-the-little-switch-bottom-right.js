  // ---------- the little switch, bottom-right ----------
  let assetsAt = 0;
  function noteTrimmed() { draw(); }
  // Approvals has no request to hook, so the bar follows page changes and the row count on its own (cheap: one count a second)
  let lastPath = "", rowCount = -1;
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const moved = location.pathname !== lastPath; lastPath = location.pathname;
    if (moved ? onApprovals() || document.getElementById("erp-fast-rows") || document.getElementById("erp-fast")?.getAttribute("aria-label")?.startsWith("Approval")
      : onApprovals() && document.querySelectorAll("main table tbody > tr").length !== rowCount) draw();
  }, 1000);
  function showAssets(at) { assetsAt = at; draw(); }

  // Faust's Night Ledger: a ledger card floating on the page (the Float shadow, 8px corners), a bone tag-with-dot label,
  // 8px segment buttons with the active one in raised graphite, transit-blue focus, the soft Column curve on entry.
  const css = `
    #erp-fast { --canvas: #07090b; --card: #090b0c; --raised: #1a1d1e; --edge: #363738; --hair: #262727; --bone: #e9e1dc;
      --paper: #efefed; --body: #b3b0af; --muted: #8a8b8a; --blue: #3e7edf;
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; display: flex; align-items: center; gap: 12px;
      padding: 6px 6px 6px 14px; border-radius: 8px; background: var(--card); color: var(--body);
      font: 400 14px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-feature-settings: "cv11", "tnum";
      box-shadow: inset 0 0 0 1px var(--edge), 0 40px 32px rgba(0,0,0,.18), 0 22px 18px rgba(0,0,0,.2), 0 12px 10px rgba(0,0,0,.2),
        0 6px 5px rgba(0,0,0,.18), 0 2px 2px rgba(0,0,0,.2);
      animation: erp-fast-in .7s cubic-bezier(.1, 0, .1, 1) both; -webkit-font-smoothing: antialiased; }
    @keyframes erp-fast-in { from { opacity: 0; transform: translateY(12px); filter: blur(2px); } }
    #erp-fast .tag { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; letter-spacing: .06em;
      text-transform: uppercase; color: var(--muted); white-space: nowrap; }
    #erp-fast .tag::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); }
    #erp-fast .tag b { font-size: 13px; font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--paper); }
    #erp-fast select { height: 30px; max-width: 210px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--canvas); color: var(--paper);
      box-shadow: inset 0 0 0 1px var(--edge); font: inherit; font-size: 13px; cursor: pointer; }
    #erp-fast select:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    #erp-bulk-spk { --canvas: #07090b; --card: #090b0c; --raised: #1a1d1e; --edge: #363738; --hair: #262727; --bone: #e9e1dc;
      --paper: #efefed; --body: #b3b0af; --muted: #8a8b8a; --blue: #3e7edf; --green: #55bc82; --red: #ff6a5c;
      position: fixed; right: 16px; bottom: 70px; z-index: 2147483000; width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 110px);
      display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 8px; background: var(--card); color: var(--body); overflow: auto;
      font: 400 14px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-feature-settings: "cv11", "tnum";
      box-shadow: inset 0 0 0 1px var(--edge), 0 40px 32px rgba(0,0,0,.18), 0 22px 18px rgba(0,0,0,.2), 0 12px 10px rgba(0,0,0,.2), 0 2px 2px rgba(0,0,0,.2);
      animation: erp-fast-in .5s cubic-bezier(.1, 0, .1, 1) both; -webkit-font-smoothing: antialiased; }
    #erp-bulk-spk .hd { display: flex; justify-content: space-between; align-items: center; }
    #erp-bulk-spk .tag { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    #erp-bulk-spk .tag::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); }
    #erp-bulk-spk select { width: 100%; height: 32px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--canvas); color: var(--paper);
      box-shadow: inset 0 0 0 1px var(--hair); font: 13px Inter, ui-sans-serif, system-ui, sans-serif; }
    #erp-bulk-spk select:focus { outline: 2px solid var(--blue); outline-offset: 1px; } #erp-bulk-spk select:disabled { opacity: .55; }
    #erp-bulk-spk .row > span { min-width: 56px; }
    #erp-bulk-spk textarea, #erp-bulk-spk input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 0; border-radius: 6px; background: var(--canvas);
      color: var(--paper); box-shadow: inset 0 0 0 1px var(--hair); font: 13px/1.5 "JetBrains Mono", ui-monospace, monospace; resize: vertical; }
    #erp-bulk-spk textarea:focus, #erp-bulk-spk input:focus { outline: 2px solid var(--blue); outline-offset: 1px; }
    #erp-bulk-spk textarea:disabled, #erp-bulk-spk input:disabled { opacity: .55; }
    #erp-bulk-spk .row { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center; font-size: 13px; color: var(--muted); }
    #erp-bulk-spk .hint { margin: 0; font-size: 12px; color: var(--muted); }
    #erp-bulk-spk .guide summary { cursor: pointer; font-size: 12px; color: var(--muted); }
    #erp-bulk-spk .guide summary:hover { color: var(--paper); }
    #erp-bulk-spk .guide .ex { max-height: 150px; overflow: auto; overscroll-behavior: contain; margin-top: 6px; padding: 8px 10px; border-radius: 6px;
      background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); display: grid; gap: 4px; }
    #erp-bulk-spk .guide b { font-size: 12px; font-weight: 500; color: var(--paper); } #erp-bulk-spk .guide b:not(:first-child) { margin-top: 6px; }
    #erp-bulk-spk .guide pre { margin: 0; font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; color: var(--body); white-space: pre-wrap; }
    #erp-bulk-spk .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 2px; border-radius: 8px; background: var(--canvas); }
    #erp-bulk-spk .seg button { height: 28px; box-shadow: none; color: var(--muted); } #erp-bulk-spk .seg button.on { background: var(--raised); color: var(--paper); }
    #erp-bulk-spk .man { display: grid; gap: 6px; }
    #erp-bulk-spk .mr { display: grid; grid-template-columns: minmax(0, 1fr) 64px 32px; gap: 6px; align-items: center; padding: 6px; border-radius: 8px; background: var(--canvas); }
    #erp-bulk-spk .mr select[aria-label="Type"] { grid-column: 1 / -1; } #erp-bulk-spk .mr select, #erp-bulk-spk .mr input { background: var(--raised); }
    #erp-bulk-spk .mr input.tf, #erp-bulk-spk .rt input.tf { text-align: left; } #erp-bulk-spk .rt input.tf { grid-column: 2; font-size: 13px; color: var(--paper); margin-top: 4px; height: 28px; padding: 0 8px; }
    #erp-bulk-spk .mr input { height: 32px; padding: 0 8px; text-align: right; font-variant-numeric: tabular-nums; }
    #erp-bulk-spk .mr .s { grid-column: 1 / -1; font-size: 12px; color: var(--muted); } #erp-bulk-spk .mr .bad { color: var(--red); }
    #erp-bulk-spk button.add { justify-self: start; }
    #erp-bulk-spk .note { margin: 0; padding: 8px 10px; border-radius: 6px; font-size: 13px; color: var(--paper); box-shadow: inset 0 0 0 1px rgba(224,178,82,.4); background: rgba(224,178,82,.07); }
    #erp-bulk-spk .list { display: grid; gap: 2px; }
    #erp-bulk-spk .rt { display: grid; grid-template-columns: 28px 1fr; gap: 0 8px; padding: 6px 8px; border-radius: 6px; background: var(--canvas); }
    #erp-bulk-spk .rt .n { font: 12px "JetBrains Mono", ui-monospace, monospace; color: var(--muted); padding-top: 1px; }
    #erp-bulk-spk .rt .t { color: var(--paper); font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
    #erp-bulk-spk .rt .s { grid-column: 2; font-size: 12px; color: var(--muted); }
    #erp-bulk-spk .rt select.s { margin-top: 4px; height: 28px; color: var(--paper); }
    #erp-bulk-spk .rt.ok .n, #erp-bulk-spk .rt.form .n { color: var(--green); } #erp-bulk-spk .rt.err .n, #erp-bulk-spk .rt.err .s { color: var(--red); }
    #erp-bulk-spk .ft { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    #erp-bulk-spk .steps { flex-basis: 100%; margin: 0; padding-left: 18px; font-size: 13px; color: var(--body); }
    #erp-bulk-spk .steps li + li { margin-top: 4px; }
    #erp-bulk-spk button { height: 32px; padding: 0 12px; border: 0; border-radius: 6px; background: none; color: var(--paper); box-shadow: inset 0 0 0 1px var(--edge);
      font: 500 13px/1 Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
    #erp-bulk-spk button:hover { box-shadow: inset 0 0 0 1px #696a68; }
    #erp-bulk-spk button.primary { background: var(--bone); color: var(--canvas); box-shadow: none; }
    #erp-bulk-spk button:disabled { opacity: .4; cursor: default; }
    #erp-bulk-spk button.x { width: 32px; padding: 0; box-shadow: none; color: var(--muted); }
    #erp-bulk-spk button:focus-visible, #erp-bulk-spk .lnk:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    #erp-bulk-spk .lnk { color: var(--paper); font-size: 13px; }
    @media (prefers-reduced-motion: reduce) { #erp-bulk-spk { animation: none; } }
    #erp-review-hud { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); z-index: 2147483001; pointer-events: none;
      width: max-content; max-width: calc(100vw - 32px); padding: 8px 14px; border-radius: 8px; background: #090b0c; color: #b3b0af;
      font: 400 13px/1.5 Inter, ui-sans-serif, system-ui, sans-serif; font-feature-settings: "cv11", "tnum"; -webkit-font-smoothing: antialiased;
      box-shadow: inset 0 0 0 1px #363738, 0 12px 10px rgba(0,0,0,.25), 0 2px 2px rgba(0,0,0,.2); }
    #erp-review .pick { max-height: 300px; overflow: auto; overscroll-behavior: contain; }
    #erp-review .pick .rt { grid-template-columns: 20px 1fr; cursor: pointer; } #erp-review .pick input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: #e9e1dc; }
    #erp-review-hud b { color: #efefed; font-weight: 500; } #erp-review-hud .k { color: #8a8b8a; font-size: 12px; }
    #erp-review-hud kbd { display: inline-block; min-width: 16px; padding: 0 4px; border-radius: 4px; background: #1a1d1e; color: #efefed; font: 12px/18px "JetBrains Mono", ui-monospace, monospace; text-align: center; }
    #erp-review-hud .m { color: #e0b252; } #erp-review-hud .m:empty { display: none; }
    #erp-fast .of { padding-right: 8px; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
    #erp-fast .seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
    #erp-fast button { height: 30px; min-width: 44px; padding: 0 12px; border: 0; border-radius: 6px; background: none; color: var(--muted);
      font-family: inherit; font-size: 13px; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums; cursor: pointer;
      transition: color .2s cubic-bezier(.22, 1, .36, 1), background .2s cubic-bezier(.22, 1, .36, 1), transform .1s; }
    #erp-fast button:hover { color: var(--paper); background: rgba(255,255,255,.03); }
    #erp-fast button:active { transform: scale(.96); }
    #erp-fast .tag::before { animation: erp-fast-dot 2.4s cubic-bezier(.1, 0, .1, 1) 1; }
    @keyframes erp-fast-dot { 30% { transform: scale(1.8); opacity: .5; } }
    #erp-fast button[aria-pressed="true"] { background: var(--raised); color: var(--paper); }
    #erp-fast .solo { box-shadow: inset 0 0 0 1px var(--edge); color: var(--paper); }
    #erp-fast .solo:hover { box-shadow: inset 0 0 0 1px #696a68; }
    #erp-fast button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    @media (max-width: 760px) { #erp-fast { left: 16px; right: 16px; justify-content: space-between; } #erp-fast button { height: 36px; } }
    @media (prefers-reduced-motion: reduce) { #erp-fast, #erp-fast .tag::before { animation: none; } #erp-fast button { transition: none; } }`;

  function draw() {
    if (!document.body) return void document.addEventListener("DOMContentLoaded", draw, { once: true });
    if (!document.getElementById("erp-fast-css")) {
      const s = document.createElement("style"); s.id = "erp-fast-css";
      // the review panel wears the Bulk SPK panel's rules
      s.textContent = css + (css.match(/[^{}]*#erp-bulk-spk[^{]*\{[^{}]*\}/g) || []).map((r) => r.replaceAll("#erp-bulk-spk", "#erp-review")).join("\n"); document.head.append(s);
    }
    let bar = document.getElementById("erp-fast");
    const onWO = location.pathname.startsWith("/work-orders"), onPlan = location.pathname.startsWith("/planning"), onAp = onApprovals();
    let cut = document.getElementById("erp-fast-rows");
    if (onAp && rowsShown() !== "all") {
      if (!cut) { cut = document.createElement("style"); cut.id = "erp-fast-rows"; document.head.append(cut); }
      cut.textContent = `main table tbody > tr:nth-child(n+${Number(rowsShown()) + 1}) { display: none; }`;
    } else cut?.remove();
    if (!onPlan) document.getElementById("erp-bulk-spk")?.remove();
    if (!onAp && (rv?.run || reviewOpen())) reviewStop(true);
    if (!onWO && !onPlan && !onAp) { bar?.remove(); return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "erp-fast"; bar.setAttribute("role", "group"); document.body.append(bar); }
    bar.replaceChildren();
    // tag-with-dot label: a word, then the part that matters in paper white
    const label = (word, value) => { const s = document.createElement("span"); s.className = "tag"; s.append(word); if (value) { const b = document.createElement("b"); b.textContent = value; s.append(" ", b); } bar.append(s); };
    const button = (parent, t, on, run, cls) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; if (on !== null) b.setAttribute("aria-pressed", String(on)); if (cls) b.className = cls; b.onclick = run; parent.append(b); };

    if (onAp) {
      bar.setAttribute("aria-label", "Approval reports to show");
      const n = document.querySelectorAll("main table tbody > tr").length, want = rowsShown();
      label("Show first", "");
      const seg = document.createElement("span"); seg.className = "seg"; bar.append(seg);
      for (const v of ["50", "100", "all"]) button(seg, v === "all" ? "All" : v, want === v, () => { try { localStorage.setItem(ROWS, v); } catch {} draw(); });
      if (n) { const of = document.createElement("span"); of.className = "of"; of.textContent = `of ${n}`; bar.append(of); }
      button(bar, "Review queue", reviewOpen(), () => reviewToggle(), "solo");
      rowCount = n;
    } else if (onWO) {
      bar.setAttribute("aria-label", "Work orders to load");
      label("Show newest", ""); // the chosen amount is the pressed button beside it
      const seg = document.createElement("span"); seg.className = "seg"; bar.append(seg);
      for (const v of ["500", "1000", "all"]) button(seg, v === "all" ? "All" : v, limit() === v, () => { try { localStorage.setItem(KEY, v); } catch {} location.reload(); });
    } else {
      bar.setAttribute("aria-label", "Planning network assets");
      const mins = assetsAt ? Math.floor((Date.now() - assetsAt) / 60000) : null;
      label("Assets", mins === null ? "Loading" : mins < 1 ? "Fresh" : `${mins} min old`);
      button(bar, "Refresh", null, async () => { try { await caches.delete(CACHE); } catch {} location.reload(); }, "solo");
      button(bar, "Bulk SPK", bulkSpkOpen(), () => bulkSpkToggle(), "solo");
      if (areas?.length) {
        const pick = document.createElement("select"); pick.title = "District whose assets the DARI / KE lists show (reloads the page)";
        pick.setAttribute("aria-label", "District for asset lists");
        pick.append(new Option(`All districts · ${areaAll.toLocaleString("id-ID")}`, ""));
        for (const [k, n] of areas) pick.append(new Option(`${k} · ${n.toLocaleString("id-ID")}`, k, false, k.toLowerCase() === area().toLowerCase()));
        if (!areaKept) pick.value = "";
        pick.onchange = () => { try { localStorage.setItem(AREA, pick.value); } catch {} location.reload(); };
        bar.append(pick);
      }
    }
  }

