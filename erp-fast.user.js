// ==UserScript==
// @name         ERP — Dock, fast search, faster Work Orders and Planning
// @namespace    adztrz
// @version      2.52
// @description  Work Orders: loads the newest 500 of each list instead of 8,000 (1000 or All any time). Approvals: shows the first 50 waiting reports (100 or All any time). Planning: reuses the 11 MB of network assets for 15 minutes, and a district picker keeps the cable route lists short so the form stops lagging; Bulk SPK makes one SPK per FDT → FAT route from a pasted message, no form needed. LDN Radius → Pelanggan and Finance → Invoices: instant search as you type, any word order, spacing and punctuation ignored, forgiving of spelling (winna = wina).
// @match        https://*/*
// @run-at       document-start
// @grant        none
// @homepageURL  https://github.com/Adztrz/erp-script
// @updateURL    https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-fast.user.js
// @downloadURL  https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-fast.user.js
// ==/UserScript==

(() => {
  "use strict";
  // Runs only on the one ERP site: its hostname's FNV-1a hash is kept here instead of the address itself.
  // Anywhere else the script stops at this line.
  const SITE = "bd1fa6a8";
  let h = 0x811c9dc5;
  for (const c of location.hostname) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  if (h.toString(16) !== SITE) return;

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

  // ---------- Monochrome: the whole site in Faust's black and bone (Dock → the half-circle button) ----------
  // The ERP is shadcn: its colours are HSL variables (--background, --primary, …), swapped here for Faust's palette:
  // near-black canvas #07090b, graphite cards, bone #e9e1dc as the one "colour" (primary buttons, focus, links).
  // Panels that hard-code Tailwind blues/violets/cyans (BOQ box, route cards, badges) are rewritten from the site's own
  // stylesheets: every such colour becomes a warm grey of the same lightness. Red, green and amber stay, slightly muted,
  // so errors and status still read. Applied at page start (no flash) and to each stylesheet a page loads later.
  const MONO = "erpDock.mono";
  const monoOn = () => { try { return localStorage.getItem(MONO) === "1"; } catch { return false; } };
  const MONO_VARS = `
    html.erp-mono, html.erp-mono.dark { color-scheme: dark;
      --background: 210 22% 4%; --foreground: 40 8% 93%; --card: 200 14% 4.5%; --card-foreground: 40 8% 93%;
      --popover: 200 14% 5%; --popover-foreground: 40 8% 93%;
      --primary: 23 23% 89%; --primary-foreground: 210 22% 4%; --primary-text: 23 23% 89%; --primary-text-terang: 23 23% 89%; --primary-text-gelap: 23 23% 89%;
      --secondary: 200 7% 11%; --secondary-foreground: 40 8% 93%; --muted: 200 5% 13%; --muted-foreground: 20 3% 62%;
      --accent: 200 6% 16%; --accent-foreground: 40 8% 93%;
      --destructive: 5 70% 50%; --destructive-foreground: 0 0% 98%; --danger-foreground: 5 100% 75%; --danger-muted: 5 30% 13%;
      --success: 146 42% 53%; --success-foreground: 146 40% 72%; --success-muted: 146 20% 12%;
      --warning: 40 69% 60%; --warning-foreground: 40 70% 76%; --warning-muted: 40 25% 12%;
      --info: 23 10% 70%; --info-foreground: 23 15% 82%; --info-muted: 200 5% 13%;
      --border: 180 1% 15%; --border-strong: 210 2% 22%; --input: 200 5% 14%; --ring: 23 23% 89%;
      --sidebar-background: 200 14% 4%; --sidebar-foreground: 40 8% 90%; --sidebar-primary: 23 23% 89%; --sidebar-primary-foreground: 210 22% 4%;
      --sidebar-accent: 200 7% 11%; --sidebar-accent-foreground: 40 8% 96%; --sidebar-border: 180 1% 14%; --sidebar-ring: 23 23% 89%; }
    html.erp-mono body { background: #07090b; }
    html.erp-mono ::selection { background: rgba(233,225,220,.25); }`;
  let monoSheet = null;
  const monoDone = new WeakSet();
  // a colour literal → its warm-grey twin, unless it is red, green or amber (those are only toned down a little)
  function monoColour(r, g, b, a) {
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2, d = max - min;
    if (d < 0.08) return null; // already grey
    let hue = 0; const R = r / 255, G = g / 255, B = b / 255;
    hue = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4; hue = (hue * 60 + 360) % 360;
    const keep = hue < 50 || hue >= 335 || (hue >= 85 && hue < 170); // red/orange/amber, green
    if (keep) return null;
    const L = Math.round(l * 100);
    return `hsl(30 ${L > 50 ? 6 : 4}% ${L}%${a != null && a !== "1" ? ` / ${a}` : ""})`;
  }
  const hexRgb = (h) => { h = h.slice(1); if (h.length <= 4) h = [...h].map((c) => c + c).join(""); const n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length === 8 ? String(+(parseInt(h.slice(6), 16) / 255).toFixed(3)) : null]; };
  function monoValue(v) {
    let changed = false;
    const out = v.replace(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[,/]\s*([^)]+))?\)/gi, (m, r, g, b, a) => {
      const [R, G, B, A] = r ? [+r, +g, +b, a?.trim() ?? null] : hexRgb(m);
      const t = monoColour(R, G, B, A); if (!t) return m; changed = true; return t;
    });
    return changed ? out : null;
  }
  function monoSweep() {
    if (!monoOn() || !monoSheet) return;
    const add = [];
    const walk = (rules, wrap) => {
      for (const r of rules) {
        if (r.cssRules && !r.selectorText) { const cond = r.conditionText || r.media?.mediaText; walk(r.cssRules, cond && r.constructor.name.includes("Media") ? `@media ${cond}` : wrap); continue; }
        if (!r.selectorText || !r.style) continue;
        const decl = [];
        for (const prop of r.style) { const v = r.style.getPropertyValue(prop); if (!/#|rgb/i.test(v)) continue; const t = monoValue(v); if (t) decl.push(`${prop}: ${t}${r.style.getPropertyPriority(prop) ? " !important" : ""}`); }
        if (!decl.length) continue;
        const sel = r.selectorText.split(/,(?![^(]*\))/).map((x) => /^\s*(html|:root)\b/.test(x) ? x.replace(/^\s*(html|:root)/, "html.erp-mono") : `html.erp-mono ${x.trim()}`).join(", ");
        const rule = `${sel} { ${decl.join("; ")} }`;
        add.push(wrap ? `${wrap} { ${rule} }` : rule);
      }
    };
    for (const sh of document.styleSheets) {
      if (sh.ownerNode?.id?.startsWith("erp-") || monoDone.has(sh)) continue;
      try { walk(sh.cssRules, null); monoDone.add(sh); } catch { /* another origin's sheet: skipped */ }
    }
    if (add.length) monoSheet.textContent += "\n" + add.join("\n");
  }
  function monoApply() {
    const on = monoOn(), root = document.documentElement;
    root.classList.toggle("erp-mono", on);
    if (on && !monoSheet) {
      // !important: the ERP also writes its brand colours inline on <html> (tenant theme), which beats a plain rule
      monoSheet = document.createElement("style"); monoSheet.id = "erp-mono"; monoSheet.textContent = MONO_VARS.replace(/(--[\w-]+: [^;]+);/g, "$1 !important;");
      (document.head || root).append(monoSheet);
    }
    if (on) monoSweep();
  }
  monoApply();
  // pages load more stylesheets as you move around: sweep each once it has loaded
  new MutationObserver((ms) => { if (!monoOn()) return; for (const m of ms) for (const n of m.addedNodes) if (n.tagName === "LINK" || n.tagName === "STYLE") { n.tagName === "LINK" ? n.addEventListener("load", monoSweep, { once: true }) : setTimeout(monoSweep, 0); } })
    .observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("load", () => monoApply());
  const monoToggle = () => { try { localStorage.setItem(MONO, monoOn() ? "0" : "1"); } catch {} monoApply(); };

  // Measured on 10 Nov 2026: Work Orders asked for limit=5000 (all recent) and limit=3000 (open), 11.6 MB, drew 6,347 rows
  // (205,000 elements) and froze the tab ~4.9 s. With 500 of each: 589 rows, 19,000 elements, ~0.4 s.
  // Planning downloads networkAssets twice (7.4 MB backbone + 3.8 MB OLT/ODP/…) every visit.
  const KEY = "erpFast.limit";          // "500" | "1000" | "all"
  const TTL = 15 * 60 * 1000;           // how long Planning's asset lists are reused
  const CACHE = "erp-fast-assets";
  const limit = () => { try { return localStorage.getItem(KEY) || "500"; } catch { return "500"; } };
  // Measured 11 Nov 2026: Technical → Approvals draws every waiting report (275 rows, 8,300 elements) and redraws them all on
  // each click, freezing ~0.3 s per filter open. Showing the first 50 (rest hidden, data untouched) brings that to ~0.05 s.
  const ROWS = "erpFast.rows";          // "50" | "100" | "all"
  const rowsShown = () => { try { return localStorage.getItem(ROWS) || "50"; } catch { return "50"; } };
  const onApprovals = () => location.pathname.startsWith("/technical/approvals");

  const realFetch = window.fetch;
  let lastAuth = null; // the page's latest sign-in header (memory only)
  let payingNow = 0;   // Dock payments in flight: the update reload waits for them
  let staleSince = 0;  // when a newer ERP build was first seen (0 = this page is current); see "ERP updated" below
  let staleOk = 0;     // when you last chose to save on an old build anyway
  let touched = Date.now(); // your last click, key or scroll wheel
  window.fetch = async function (input, init) {
    let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, location.href);

    // a save from a page that's been out of date for over an hour: ask first (the page and the server may no longer agree)
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    // (only right after a click or key, so the page's own background requests never raise it)
    if (method !== "GET" && method !== "HEAD" && u.origin === location.origin && staleSince && Date.now() - touched < 5000 && Date.now() - staleSince > 3600e3 && Date.now() - staleOk > 600e3
        && !u.pathname.startsWith("/api/version") && !u.pathname.startsWith("/api/auth")) {
      if (!confirm("The ERP was updated over an hour ago and this page is still the old version.\n\nSaving from an old page can fail or save something wrongly. Press Cancel, copy anything you typed, then reload the page (F5) and save there.\n\nPress OK to save anyway.")) {
        throw new TypeError("Not sent: this page is an old version of the ERP. Reload the page (F5) and try again.");
      }
      staleOk = Date.now();
    }

    // fast search: the page's own sign-in and which month it shows (see fastSearch below)
    if (u.pathname.startsWith("/api/")) {
      const auth = init?.headers ? new Headers(init.headers).get("authorization") : input instanceof Request ? input.headers.get("authorization") : null;
      if (auth) lastAuth = auth;
      for (const seen of searches) seen(u, auth);
    }

    // Work Orders: ask for fewer rows (only ever lower than what the page asked for)
    if (u.pathname === "/api/pg-read/workOrders" && limit() !== "all") {
      const want = Number(limit()), asked = Number(u.searchParams.get("limit") || 0);
      if (!asked || asked > want) {
        u.searchParams.set("limit", String(want));
        input = typeof input === "string" || input instanceof URL ? u.href : new Request(u.href, input);
        noteTrimmed();
      }
      return realFetch.call(this, input, init);
    }

    // Planning: network assets reused for a while (same URL, GET only)
    if (u.pathname === "/api/pg-read/networkAssets" && location.pathname.startsWith("/planning") && (init?.method ?? "GET").toUpperCase() === "GET" && "caches" in window) {
      try {
        const box = await caches.open(CACHE), hit = await box.match(u.href);
        const at = Number(hit?.headers.get("x-erp-fast-at") || 0);
        if (hit && Date.now() - at < TTL) { showAssets(at); return narrow(u, hit); }
        const res = await realFetch.call(this, input, init);
        if (res.ok) {
          const body = await res.clone().blob(), h = new Headers(res.headers);
          h.set("x-erp-fast-at", String(Date.now()));
          await box.put(u.href, new Response(body, { status: res.status, statusText: res.statusText, headers: h }));
        }
        showAssets(Date.now());
        return narrow(u, res);
      } catch { /* no cache: plain fetch */ }
    }
    return realFetch.call(this, input, init);
  };

  // Planning → Rute Tarikan Kabel: "DARI Aset" and "KE Aset" each list every OLT/FDT/ODP/FAT/pole/ODC (5,095 on
  // 11 Nov 2026) and the page redraws both lists on every key pressed anywhere in the form (~0.13 s a key, 2.1 s to show
  // the section, ~3 s to open a list). Picking a district in the bar keeps that district's assets plus every OLT and ODC,
  // so the lists hold a few hundred. Only the page's copy is narrowed; nothing is written anywhere.
  const AREA = "erpFast.area";          // "" = all districts, else a kecamatan
  const area = () => { try { return localStorage.getItem(AREA) || ""; } catch { return ""; } };
  let areas = null;                     // [[kecamatan, count]] from the last full list
  let areaKept = 0, areaAll = 0;
  async function narrow(u, res) {
    if (!res.ok || !/\bOLT\b/.test(u.searchParams.get("in") || "")) return res;
    try {
      const j = await res.clone().json();
      if (!Array.isArray(j?.data)) return res;
      // 1,948 of 5,095 have no kecamatan: placed by their village (1,414), else the nearest placed asset (140); the 394
      // with neither are kept, except poles (372 of them), which a cable route never starts or ends at without a place
      const low = (v) => String(v ?? "").trim().toLowerCase();
      const names = new Map(), byDesa = new Map(), placed = [];
      for (const a of j.data) if (a.kecamatan) {
        names.set(low(a.kecamatan), names.get(low(a.kecamatan)) || String(a.kecamatan).trim());
        if (a.desa) byDesa.set(low(a.desa), low(a.kecamatan));
        if (a.lokasiKoordinat?.latitude != null) placed.push(a);
      }
      const where = (a) => {
        if (a.kecamatan) return low(a.kecamatan);
        if (byDesa.has(low(a.desa))) return byDesa.get(low(a.desa));
        const p = a.lokasiKoordinat; if (p?.latitude == null) return "";
        let best = Infinity, k = "";
        for (const b of placed) { const q = b.lokasiKoordinat, d = (q.latitude - p.latitude) ** 2 + (q.longitude - p.longitude) ** 2; if (d < best) { best = d; k = low(b.kecamatan); } }
        return k;
      };
      const tally = new Map(), at = j.data.map((a) => { const k = where(a); if (k) tally.set(k, (tally.get(k) || 0) + 1); return k; });
      areas = [...tally].map(([k, n]) => [names.get(k), n]).sort((x, y) => x[0].localeCompare(y[0], "id"));
      areaAll = j.data.length;
      const want = area().toLowerCase();
      if (!want || !tally.has(want)) { areaKept = 0; draw(); return res; }
      j.data = j.data.filter((a, i) => a.tipeAset === "OLT" || a.tipeAset === "ODC" || at[i] === want || (!at[i] && a.tipeAset !== "Tiang"));
      if ("count" in j) j.count = j.data.length;
      areaKept = j.data.length; draw();
      const h = new Headers(res.headers); h.delete("content-length"); h.set("content-type", "application/json");
      return new Response(JSON.stringify(j), { status: res.status, statusText: res.statusText, headers: h });
    } catch { return res; }
  }

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
    #erp-bulk-spk .note { margin: 0; padding: 8px 10px; border-radius: 6px; font-size: 13px; color: var(--paper); box-shadow: inset 0 0 0 1px rgba(224,178,82,.4); background: rgba(224,178,82,.07); }
    #erp-bulk-spk .list { display: grid; gap: 2px; }
    #erp-bulk-spk .rt { display: grid; grid-template-columns: 28px 1fr; gap: 0 8px; padding: 6px 8px; border-radius: 6px; background: var(--canvas); }
    #erp-bulk-spk .rt .n { font: 12px "JetBrains Mono", ui-monospace, monospace; color: var(--muted); padding-top: 1px; }
    #erp-bulk-spk .rt .t { color: var(--paper); font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
    #erp-bulk-spk .rt .s { grid-column: 2; font-size: 12px; color: var(--muted); }
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
      const s = document.createElement("style"); s.id = "erp-fast-css"; s.textContent = css; document.head.append(s);
    }
    let bar = document.getElementById("erp-fast");
    const onWO = location.pathname.startsWith("/work-orders"), onPlan = location.pathname.startsWith("/planning"), onAp = onApprovals();
    let cut = document.getElementById("erp-fast-rows");
    if (onAp && rowsShown() !== "all") {
      if (!cut) { cut = document.createElement("style"); cut.id = "erp-fast-rows"; document.head.append(cut); }
      cut.textContent = `main table tbody > tr:nth-child(n+${Number(rowsShown()) + 1}) { display: none; }`;
    } else cut?.remove();
    if (!onPlan) document.getElementById("erp-bulk-spk")?.remove();
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

  // ---------- Bulk SPK on Planning: one team, one FDT to many FATs ----------
  // Technicians send "FDT DAYU ke: * FAT DAYU 1 * FAT DAYU 2 …" and each route needs its own SPK, titled after where
  // it goes. Paste the message, pick team, project, type and date once, press Create twice: one SPK per route, with no
  // form to fill. Each is the same record Planning's manual form saves for a team (read off its code and checked against
  // SPKs made by hand on 11 Nov 2026: only the title and the KE asset differ between them): status Baru, the team, the
  // project, no tasks or equipment, progress 0/1, and the route under both target and cableRoute, with the cable length
  // set to the straight line rounded to 10 m as the form pre-fills it. Saved through Firestore's REST API with your own
  // sign-in, so the database's rules apply as for the page, and only as new documents. No WhatsApp or push notice is sent.
  const SPK_TPL = "erpFast.spkTitle", SPK_PICK = "erpFast.spkPick";
  const spkTpl = () => { try { return localStorage.getItem(SPK_TPL) || "PENARIKAN {dari} KE {ke}"; } catch { return "PENARIKAN {dari} KE {ke}"; } };
  const ROUTE_TYPES = ["Tarik & Aktivasi FAT", "Tarik & Aktivasi FDT", "Tarik Kabel Distribusi", "Tarik Kabel Backbone", "Perbaikan Kabel Backbone", "Splicing Fiber"];
  let spk = null; // { text, routes, phase: "input" | "creating" | "done", team, project, type, date, armed, note }
  const bulkSpkOpen = () => !!document.getElementById("erp-bulk-spk");
  const akey = (v) => String(v ?? "").toLowerCase().replace(/[\s\-_]+/g, ""); // "FAT-SDY8A" = "FAT SDY8A"; dots kept (1.1 ≠ 11)
  const ATYPE = { fdt: "FDT", fat: "FAT", odp: "ODP", odc: "ODC", olt: "OLT", joinbox: "Joinbox", jb: "Joinbox", tiang: "Tiang" };
  const typeOf = (name) => ATYPE[(/^\s*(fdt|fat|odp|odc|olt|joinbox|jb|tiang)\b/i.exec(name)?.[1] || "").toLowerCase()] || null;

  // the message → [{ from, to }]: a line with "ke" after it (or a plain line) is where cables start, the bullet lines
  // under it are where they go; "FDT A ke FAT B" on one line also works; names and team lines are skipped
  function parseRoutes(text) {
    const lines = String(text).split(/\r?\n/).map((raw) => {
      const t = raw.trim(), bare = t.replace(/^(?:[*\-•·>]+|\d+[.)])\s*/, "").trim();
      return { bullet: bare !== t, line: bare };
    }).filter((x) => x.line);
    const routes = []; let from = null;
    lines.forEach((x, i) => {
      let { line } = x;
      const pair = line.split(/\s+(?:ke|->|→|=>)\s*:?\s+/i);
      if (pair.length === 2 && typeOf(pair[0]) && typeOf(pair[1])) { from = pair[0].trim(); routes.push({ from, to: pair[1].trim() }); return; }
      if (/^ke\s*:?$/i.test(line)) return;
      const endsKe = /\s+ke\s*:?$/i.test(line); line = line.replace(/\s+ke\s*:?$/i, "").trim();
      if (!typeOf(line)) return;
      const nextKe = /^ke\s*:?$/i.test(lines[i + 1]?.line || "");
      if (endsKe || nextKe || !x.bullet || !from) from = line; else routes.push({ from, to: line });
    });
    return routes;
  }

  // Planning's own asset list (kept by the cache above), every district
  async function assetIndex() {
    const box = await caches.open(CACHE);
    for (const req of await box.keys()) {
      if (!/networkAssets/.test(req.url) || !/OLT.*FAT|FAT.*OLT/.test(decodeURIComponent(req.url))) continue; // the endpoint list, not the OLT-only one
      const j = await (await box.match(req)).json(), idx = new Map();
      for (const a of j.data || []) for (const k of new Set([akey(a.kodeAset), akey(`${a.tipeAset} ${a.kodeAset}`)])) { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(a); }
      return idx;
    }
    return null;
  }
  function placeAsset(idx, name) {
    const hits = [...new Map((idx?.get(akey(name)) || []).map((a) => [a.id, a])).values()], want = typeOf(name); // the list repeats some rows
    const same = hits.filter((a) => !want || String(a.tipeAset).toLowerCase() === want.toLowerCase());
    const list = same.length ? same : hits;
    if (list.length === 1) { const a = list[0], p = a.lokasiKoordinat;
      return { ok: true, id: a.id, code: a.kodeAset, type: a.tipeAset, desa: a.desa || null, planned: false, lat: p?.latitude ?? a.lat ?? null, lng: p?.longitude ?? a.lng ?? null }; }
    if (list.length > 1) return { ok: false, why: `${list.length} assets are called ${name}` };
    if (!want) return { ok: false, why: `${name}: type unclear (start with FDT, FAT, ODP…)` };
    return { ok: true, id: null, code: name.trim().replace(/\s+/g, " "), type: want, desa: null, planned: true, lat: null, lng: null }; // not in Network Assets yet: a Calon Aset, as the form does it
  }
  const title = (r) => spkTpl().replace(/\{dari\}/g, r.a?.code || r.from).replace(/\{ke\}/g, r.b?.code || r.to).replace(/\s+/g, " ").trim();
  const metres = (a, b) => {
    if ([a.lat, a.lng, b.lat, b.lng].some((v) => v == null)) return null;
    const R = 6371000, rad = Math.PI / 180, dLa = (b.lat - a.lat) * rad, dLo = (b.lng - a.lng) * rad;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLo / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  };

  async function fsToken() {
    try {
      const db = await new Promise((ok, no) => { const q = indexedDB.open("firebaseLocalStorageDb"); q.onupgradeneeded = () => q.transaction.abort(); q.onsuccess = () => ok(q.result); q.onerror = no; });
      const all = await new Promise((ok, no) => { const q = db.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll(); q.onsuccess = () => ok(q.result); q.onerror = no; });
      db.close();
      const t = all.map((x) => x.value?.stsTokenManager).find((m) => m?.accessToken && m.expirationTime > Date.now() + 60000);
      if (t) return `Bearer ${t.accessToken}`;
    } catch {}
    return lastAuth;
  }
  const FS = "https://firestore.googleapis.com/v1/";
  async function fsCall(path, body) {
    const auth = await fsToken(); if (!auth) throw new Error("Not signed in");
    const r = await realFetch(FS + path, body ? { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { authorization: auth } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
    return j;
  }

  // the database path, read off the page's own Firestore traffic (so no project name lives in this script)
  function fsDb() {
    for (const e of performance.getEntriesByType("resource")) {
      const m = /database=(projects%2F[^&]+%2Fdatabases%2F[^&]+)/.exec(e.name); if (m) return decodeURIComponent(m[1]);
    }
    return null;
  }
  const fromFs = (v) => v == null ? null : "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue
    : "booleanValue" in v ? v.booleanValue : "arrayValue" in v ? (v.arrayValue.values || []).map(fromFs) : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)])) : null;
  async function fsList(db, collection, where) {
    const q = { from: [{ collectionId: collection }], limit: 500 };
    if (where) q.where = where;
    const rows = await fsCall(`${db}/documents:runQuery`, { structuredQuery: q });
    return rows.filter((r) => r.document).map((r) => ({ id: r.document.name.split("/").pop(), ...fromFs({ mapValue: { fields: r.document.fields } }) }));
  }
  // the same lists the form offers: teams, and projects that are planned or running
  async function spkLists() {
    const db = fsDb(); if (!db) throw new Error("Let Planning finish loading first");
    const [teams, projects] = await Promise.all([fsList(db, "technicianTeams"),
      fsList(db, "projects", { fieldFilter: { field: { fieldPath: "status" }, op: "IN", value: { arrayValue: { values: [{ stringValue: "Direncakan" }, { stringValue: "Berjalan" }] } } } })]);
    const byName = (a, b) => String(a.namaTim ?? a.name ?? "").localeCompare(String(b.namaTim ?? b.name ?? ""), "id");
    return { db, teams: teams.sort(byName), projects: projects.sort(byName) };
  }
  const S = (v) => v == null ? { nullValue: null } : { stringValue: String(v) }, I = (n) => n == null ? { nullValue: null } : { integerValue: String(Math.round(n)) };
  const D = (n) => n == null ? { nullValue: null } : { doubleValue: n }, B = (b) => ({ booleanValue: !!b });
  function spkDoc(db, r) {
    const line = metres(r.a, r.b), route = { odpAkhirCore: I(1), coreCount: I(null), notes: S(null), straightLineMeters: I(line), cableLengthMeters: I(line == null ? null : Math.round(line / 10) * 10) };
    for (const [side, x] of [["from", r.a], ["to", r.b]]) Object.assign(route, { [`${side}AssetId`]: S(x.id), [`${side}AssetCode`]: S(x.code), [`${side}AssetType`]: S(x.type),
      [`${side}AssetDesa`]: S(x.desa), [`${side}AssetPlanned`]: B(x.planned), [`${side}AssetLat`]: D(x.lat), [`${side}AssetLng`]: D(x.lng) });
    // today: now (the form's default date); another day: that day's local midnight (what the form's calendar gives)
    const [y, m, d] = spk.date.split("-").map(Number), day = new Date(y, m - 1, d), now = new Date();
    const when = day.toDateString() === now.toDateString() ? now : day;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[n % 62]).join("");
    return { id, write: {
      update: { name: `${db}/documents/workOrders/${id}`, fields: {
        name: S(title(r)), status: S("Baru"), workOrderType: S(spk.type), scheduledDate: { timestampValue: when.toISOString() },
        assignedTeamId: S(spk.team), assignmentType: S("team"), assignedEmployeeIds: { arrayValue: {} }, assignedEmployeeNames: { arrayValue: {} },
        tasks: { arrayValue: {} }, installationTasks: { arrayValue: {} }, progress: { mapValue: { fields: { total: I(1), completed: I(0) } } },
        target: { mapValue: { fields: { type: S("cable-route"), ...route } } }, cableRoute: { mapValue: { fields: route } }, projectId: S(spk.project) } },
      updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }, { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: { exists: false } } };
  }
  async function spkCreate() {
    spk.phase = "creating"; spk.stop = false; spk.note = ""; spkDraw();
    const db = spk.lists.db;
    for (const r of spk.routes) {
      if (spk.stop) break;
      if (r.state === "ok") continue;
      r.state = "busy"; r.why = ""; spkDraw();
      try { const c = spkDoc(db, r); await fsCall(`${db}/documents:commit`, { writes: [c.write] }); r.state = "ok"; r.id = c.id; }
      catch (e) { r.state = "err"; r.why = e.message; }
      spkDraw();
    }
    // Daftar SPK reads a copy of the SPKs that the ERP refreshes when its own pages call this sync (Misi, SPK
    // monitor); without it new SPKs stay out of the list until someone opens one of those
    if (spk.routes.some((r) => r.state === "ok")) {
      spk.note = "Adding them to Daftar SPK…"; spkDraw();
      try {
        const auth = await fsToken(), res = await realFetch("/api/spk/mirror", { method: "POST", headers: auth ? { authorization: auth } : {} });
        const j = await res.json().catch(() => null);
        spk.note = res.ok && j?.ok !== false ? "" : "They're saved, but didn't reach Daftar SPK yet: opening Technical → Misi adds them.";
      } catch { spk.note = "They're saved, but didn't reach Daftar SPK yet: opening Technical → Misi adds them."; }
    }
    spk.phase = "done"; spkDraw();
  }

  function bulkSpkToggle() {
    if (bulkSpkOpen()) { document.getElementById("erp-bulk-spk").remove(); draw(); return; }
    if (!spk) {
      let pick = {}; try { pick = JSON.parse(localStorage.getItem(SPK_PICK) || "{}"); } catch {}
      const t = new Date(); spk = { text: "", routes: [], phase: "input", team: pick.team || "", project: pick.project || "", type: pick.type || ROUTE_TYPES[0],
        date: new Date(t - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10) };
    }
    const p = document.createElement("div"); p.id = "erp-bulk-spk"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Bulk SPK");
    document.body.append(p); spkDraw(); draw();
    p.querySelector("textarea")?.focus();
    if (!spk.lists) spkLists().then((l) => { spk.lists = l; spkDraw(); }, (e) => { spk.note = `Couldn't read teams and projects: ${e.message}`; spkDraw(); });
  }
  const remember = () => { try { localStorage.setItem(SPK_PICK, JSON.stringify({ team: spk.team, project: spk.project, type: spk.type })); } catch {} };
  function spkDraw() {
    const p = document.getElementById("erp-bulk-spk"); if (!p || !spk) return;
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (t, run, cls = "") => { const b = mk("button", cls, t); b.type = "button"; b.onclick = run; return b; };
    const field = (label, control) => { const l = mk("label", "row"); l.append(mk("span", null, label), control); p.append(l); return control; };
    const sel = (opts, value, on) => { const s = mk("select"); for (const [v, t] of opts) s.append(new Option(t, v, false, v === value)); s.value = value; s.onchange = () => on(s.value); return s; };
    p.replaceChildren();
    const head = mk("div", "hd"); head.append(mk("span", "tag", "Bulk SPK"), btn("✕", bulkSpkToggle, "x")); head.lastChild.setAttribute("aria-label", "Close"); p.append(head);
    const editing = spk.phase === "input";
    const ta = mk("textarea"); ta.rows = 6; ta.placeholder = "Paste the message, e.g.\nFDT DAYU\nke :\n* FAT DAYU 1\n* FAT DAYU 2"; ta.value = spk.text; ta.disabled = !editing;
    ta.oninput = async () => {
      spk.text = ta.value; spk.armed = false; await spkPlan();
      const at = ta.selectionStart; spkDraw(); // redraw, then put the caret back where it was
      const again = document.querySelector("#erp-bulk-spk textarea"); again?.focus(); again?.setSelectionRange(at, at);
    };
    p.append(ta);
    const L = spk.lists;
    const teamSel = field("Team", sel([["", L ? "Choose a team…" : "Loading…"], ...(L?.teams || []).map((t) => [t.id, t.namaTim || t.id])], spk.team, (v) => { spk.team = v; spk.armed = false; remember(); spkDraw(); }));
    const projSel = field("Project", sel([["", L ? "Choose a project…" : "Loading…"], ...(L?.projects || []).map((t) => [t.id, t.name || t.id])], spk.project, (v) => { spk.project = v; spk.armed = false; remember(); spkDraw(); }));
    const typeSel = field("Type", sel(ROUTE_TYPES.map((t) => [t, t]), spk.type, (v) => { spk.type = v; spk.armed = false; remember(); }));
    const dateIn = mk("input"); dateIn.type = "date"; dateIn.value = spk.date; dateIn.onchange = () => { spk.date = dateIn.value; spk.armed = false; }; field("Date", dateIn);
    const ti = mk("input"); ti.value = spkTpl(); ti.oninput = () => { try { localStorage.setItem(SPK_TPL, ti.value); } catch {} spk.armed = false; spkListDraw(); }; field("Title", ti);
    for (const c of [teamSel, projSel, typeSel, dateIn, ti]) c.disabled = !editing;
    p.append(mk("p", "hint", "{dari} and {ke} become the asset names."));
    const team = L?.teams.find((t) => t.id === spk.team);
    const members = team && ["anggotaIds", "memberIds", "members"].some((k) => Array.isArray(team[k])) ? ["anggotaIds", "memberIds", "members"].reduce((n, k) => n + (team[k]?.length || 0), 0) : null;
    if (members === 0) p.append(mk("p", "note", `${team.namaTim} has no members on file: its SPKs won't reach anyone's dashboard.`));
    const proj = L?.projects.find((t) => t.id === spk.project);
    if (proj && /internet rakyat/i.test(`${proj.name} ${proj.program || ""}`)) p.append(mk("p", "note", "This looks like an Internet Rakyat project: those SPKs are normally issued from Pemecah SPK per desa."));
    const list = mk("div", "list"); p.append(list);
    function spkListDraw() {
      list.replaceChildren();
      if (!spk.routes.length) { if (spk.text.trim()) list.append(mk("p", "hint", "No FDT → FAT routes found in this text yet.")); return; }
      spk.routes.forEach((r, i) => {
        const row = mk("div", `rt ${r.state || ""}`);
        row.append(mk("span", "n", { ok: "✓", err: "✕", busy: "…" }[r.state] ?? String(i + 1)), mk("span", "t", title(r)));
        const sub = [r.a?.ok === false ? r.a.why : r.a?.planned ? `${r.a.code}: new (Calon Aset)` : "",
          r.b?.ok === false ? r.b.why : r.b?.planned ? `${r.b.code}: new (Calon Aset)` : "", r.why || ""].filter(Boolean).join(" · ");
        if (sub) row.append(mk("span", "s", sub));
        list.append(row);
      });
    }
    spkListDraw();
    if (spk.note) p.append(mk("p", "note", spk.note));
    const foot = mk("div", "ft"), n = spk.routes.length, bad = spk.routes.some((r) => r.a?.ok === false || r.b?.ok === false);
    if (editing) {
      const missing = !n ? "Paste a message" : bad ? "Fix the names marked above" : !spk.team ? "Choose a team" : !spk.project ? "Choose a project" : !spk.date ? "Choose a date" : !spk.idx ? "Assets still loading" : "";
      const go = btn(missing || (spk.armed ? `Press again: create ${n} SPK${n > 1 ? "s" : ""} for ${team?.namaTim}` : `Create ${n} SPK${n > 1 ? "s" : ""}`), () => {
        if (!spk.armed) { spk.armed = true; spkDraw(); setTimeout(() => { if (spk.armed && spk.phase === "input") { spk.armed = false; spkDraw(); } }, 6000); return; }
        spk.armed = false; spkCreate();
      }, "primary");
      go.disabled = !!missing; foot.append(go);
    } else if (spk.phase === "creating") {
      foot.append(mk("span", "hint", `Making SPKs… ${spk.routes.filter((r) => r.state === "ok").length} of ${n}`), btn("Stop", () => { spk.stop = true; }));
    } else {
      const ok = spk.routes.filter((r) => r.state === "ok").length, err = spk.routes.filter((r) => r.state === "err").length;
      foot.append(mk("span", "hint", `${ok} SPK${ok === 1 ? "" : "s"} made${err ? `, ${err} failed` : ""}${spk.stop ? " (stopped)" : ""}.`));
      if (err) foot.append(btn("Retry failed", () => spkCreate()));
      const open = mk("a", "lnk", "Open Daftar SPK"); open.href = "/work-orders"; foot.append(open);
      foot.append(btn("New list", () => { spk = { ...spk, text: "", routes: [], phase: "input", note: "", stop: false }; spkDraw(); }));
    }
    p.append(foot);
  }
  async function spkPlan() {
    if (!spk.idx) spk.idx = await assetIndex().catch(() => null);
    spk.routes = parseRoutes(spk.text).map((r) => ({ ...r, a: placeAsset(spk.idx, r.from), b: placeAsset(spk.idx, r.to) }));
  }

  // ---------- fast search: LDN Radius → Pelanggan, and Finance → Invoices ----------
  // Measured 10 Nov 2026: both pages ask the server on every search (LDN 1–4 s, invoices ~2.8 s) and match the typed text
  // as one piece, so a double space, words in another order or a trailing "." find nobody (0 of 5 in a test), and a
  // misspelt name rarely does. Here each list is loaded once (kept 30 minutes in this browser, refreshed in the
  // background) and searched as you type: any word order, spacing and punctuation ignored, forgiving of spelling.
  // Picking a result puts its username / invoice number into the site's own search box, so the table shows it.
  const SEARCH_TTL = 2 * 60 * 60 * 1000, // a list counts as fresh for 2 hours (older invoice months longer, see ttl)
    IDB = "erp-fast", IDB_STORE = "ldn";
  const fold = (s) => String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const digits = (s) => { let d = String(s ?? "").replace(/\D/g, ""); if (d.startsWith("62")) d = "0" + d.slice(2); return d; };
  const rupiah = (n) => (Number.isFinite(Number(n)) ? `Rp ${Number(n).toLocaleString("id-ID")}` : "");

  // How a word sounds, roughly: old Indonesian spellings made modern (oe→u, dj→j, tj→c, sj→sy, ch→kh, ph→f)
  // and double letters made single, so WINNA = WINA, WELLY = WELY, SOEMARNO = SUMARNO.
  const sound = (w) => w.replace(/oe/g, "u").replace(/dj/g, "j").replace(/tj/g, "c").replace(/sj/g, "sy").replace(/ch/g, "kh").replace(/ph/g, "f").replace(/(.)\1+/g, "$1");
  // Edits between a and b (a letter wrong, missing, extra, or two swapped), giving up past `max`
  function near(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v); if (v < best) best = v;
      }
      if (best > max) return false;
      prev2 = prev; prev = cur;
    }
    return prev[b.length] <= max;
  }
  // A typed word close to the start of a word in the record (a half-typed word still counts). Only words starting with
  // the same letter: a slip in the first letter is rare, and it skips most of the work.
  // Typing on: a longer query only narrows what a shorter one found, as long as each word only grew at its end and none
  // crossed a length where spelling slack starts (4 and 9 letters) or the number search starts (6 digits). A search that
  // checked the whole list keeps what it found, so the next key searches just those rows instead of all 70,000. This is
  // what kept typing slow past "nothing found", when every key ran the slow spelling pass over the whole list again.
  const band = (w) => (w.length >= 9 ? 2 : w.length >= 4 ? 1 : 0);
  function narrows(prev, words, num) {
    if (!prev || words.length < prev.words.length) return false;
    const a = prev.words;
    for (let i = 0; i < a.length; i++) { const w = words[i]; if ((i < a.length - 1 ? w !== a[i] : !w.startsWith(a[i])) || band(w) !== band(a[i])) return false; }
    return (num.length >= 6) === (prev.num.length >= 6) && (num.length < 6 || num.startsWith(prev.num));
  }
  const fuzzyHit = (w, words, max) => words.some((x) => x[0] === w[0] && (near(w, x.slice(0, w.length), max) || near(w, x.slice(0, w.length + 1), max) || near(w, x, max)));

  const idb = () => new Promise((ok, no) => { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  async function idbGet(key) { try { const db = await idb(); return await new Promise((ok) => { const q = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); } catch { return null; } }
  // the search's working fields (_name, _hay, …) are rebuilt on load, so they're left out of what's saved
  const bare = (r) => { const o = {}; for (const k in r) if (k[0] !== "_") o[k] = r[k]; return o; };
  async function idbPut(key, v) { if (v?.rows) v = { ...v, rows: v.rows.map(bare) }; try { const db = await idb(); db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(v, key); } catch { /* the list just isn't kept */ } }

  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function marked(name, words) {
    // the typed words, underlined where they appear in the name as written
    const span = el("span", "nm"), low = name.toLowerCase();
    let i = 0;
    const hits = words.map((w) => { const at = low.indexOf(w); return at < 0 ? null : [at, at + w.length]; }).filter(Boolean).sort((a, b) => a[0] - b[0]);
    for (const [a, b] of hits) { if (a < i) continue; span.append(name.slice(i, a)); span.append(el("mark", null, name.slice(a, b))); i = b; }
    span.append(name.slice(i));
    return span;
  }

  /** One fast search: where it shows, how its list is loaded, what each row says. */
  function fastSearch(cfg) {
    const st = { auth: null, key: cfg.key({}), rows: null, at: 0, loading: null, done: 0, pages: 0, error: "", total: 0, partial: false, partNo: 0, parts: 0, partName: "", box: null, input: null, hits: [], sel: 0, query: "", picking: false, shown: new Set(), count: "", sig: "", gen: 0, byPart: null, reading: null };

    function index(rows) {
      for (const r of rows) {
        r._name = fold(cfg.name(r));
        r._hay = ` ${r._name} ${cfg.hay(r).map(fold).join(" ")} ${cfg.numbers(r).map(digits).join(" ")} `;
        r._words = [...new Set(r._hay.trim().split(" ").filter((x) => x.length > 1 && !/^\d+$/.test(x)).map(sound))];
        r._nameWords = [...new Set(r._name.split(" ").map(sound))];
        r._sound = ` ${r._words.join(" ")} `;
      }
      return rows;
    }

    // One list is loaded in parts when cfg.parts says so (invoices for "all months": month by month, newest first).
    // Each part is kept on its own, so a month already opened is reused, and the search works on what's loaded so far.
    // A download saves its pages as they arrive (under "<part>~partial"), so leaving the page halfway and coming back
    // carries on where it stopped instead of starting again. The finished list replaces the old copy in one go.
    async function loadPart(part, gen) {
      const size = cfg.pageSize, slim = (c) => Object.fromEntries(cfg.keep.map((k) => [k, c[k]]));
      st.done = 0; st.pages = 0;
      const page = async (p) => {
        if (gen !== st.gen) throw new Error("stale"); // another list was asked for: this one stops here
        let r = await realFetch(cfg.url(part, p, size), { headers: { authorization: st.auth } });
        // signed out and back in (the work PC does this every few minutes): wait for the new sign-in and ask again,
        // instead of dropping the download
        for (let wait = 0; (r.status === 401 || r.status === 403) && wait < 45; wait++) {
          const used = st.auth, fresh = await fsToken();
          if (fresh && fresh !== used) st.auth = fresh; else { await new Promise((ok) => setTimeout(ok, 2000)); if (st.auth === used) continue; }
          if (gen !== st.gen) throw new Error("stale");
          r = await realFetch(cfg.url(part, p, size), { headers: { authorization: st.auth } });
        }
        if (!r.ok) throw new Error(`The server said ${r.status}`);
        const j = await r.json(); st.done++; draw();
        return j;
      };
      const first = await page(1), total = cfg.total(first);
      st.pages = Math.max(1, Math.ceil(total / size));
      const got = new Map([[1, cfg.items(first).map(slim)]]);
      // carry on from an earlier, unfinished download of the same list (same size, under a day old)
      const half = await idbGet(`${part}~partial`);
      if (half?.pages && half.total === total && Date.now() - half.at < 24 * 60 * 60 * 1000)
        for (const [n, rows] of Object.entries(half.pages)) if (Number(n) > 1 && rows.length) got.set(Number(n), rows);
      st.done = got.size;
      const save = () => idbPut(`${part}~partial`, { at: half?.at && half.total === total ? half.at : Date.now(), total, pages: Object.fromEntries(got) });
      const rest = Array.from({ length: st.pages - 1 }, (_, i) => i + 2).filter((p) => !got.has(p));
      // three at a time, so the server isn't flooded
      for (let i = 0; i < rest.length; i += 3) {
        (await Promise.all(rest.slice(i, i + 3).map(async (p) => [p, cfg.items(await page(p)).map(slim)]))).forEach(([p, c]) => got.set(p, c));
        save(); // after every three pages, so a reload (or a sign-out) loses little
      }
      // a page that came back short (the server was busy) is asked for again, one at a time
      for (let p = 2; p < st.pages; p++) if ((got.get(p)?.length ?? 0) < size) got.set(p, cfg.items(await page(p)).map(slim));
      if (st.pages > 1 && !got.get(st.pages)?.length) got.set(st.pages, cfg.items(await page(st.pages)).map(slim));
      const rows = [...got.keys()].sort((a, b) => a - b).flatMap((p) => got.get(p));
      const kept = { at: Date.now(), rows, total: total || rows.length };
      idbPut(part, kept); idbPut(`${part}~partial`, null);
      setTimeout(() => dispatchEvent(new CustomEvent("erp-fast-saved", { detail: part })), 500); // the Dock reads it again
      return kept;
    }

    // The parts of the current list (one, or a month each for "all months"), each with its own age, kept in memory once
    // read, so typing costs nothing more than the search. A new list (another month) bumps st.gen, which stops the old
    // download at its next page.
    const ttlOf = (part) => (cfg.ttl ? cfg.ttl(part) : SEARCH_TTL);
    async function load(force = false) {
      const key = st.key, gen = st.gen, parts = cfg.parts ? cfg.parts(key) : [key];
      if (!st.byPart) {
        // what this browser kept answers at once, however old; the fresh list replaces it part by part as it arrives.
        // One read, shared by the keys typed while it runs.
        st.reading ??= (async () => { const m = new Map(); (await Promise.all(parts.map(idbGet))).forEach((k, i) => { if (k?.rows) m.set(parts[i], { ...k, rows: index(k.rows) }); }); return m; })();
        const kept = await st.reading;
        if (gen !== st.gen) return;
        if (!st.byPart) { st.byPart = kept; st.reading = null; show(parts); }
      }
      if (st.loading) return st.loading;
      const due = parts.filter((p) => force || !st.byPart.has(p) || Date.now() - st.byPart.get(p).at > ttlOf(p));
      if (!due.length) return; // all fresh: nothing to do
      if (!st.auth) st.auth = await fsToken(); // the browser's own sign-in: no need to wait for the page to ask first
      if (gen !== st.gen) return;
      if (!st.auth) { if (!st.rows) { st.error = "Open this list once so the search can sign in"; draw(); } return; }
      st.loading = (async () => {
        st.error = ""; st.partNo = 0; st.parts = parts.length;
        try {
          for (const part of parts) {
            if (gen !== st.gen) return; // the page moved to another list
            st.partNo++; st.partName = cfg.partLabel ? cfg.partLabel(part) : "";
            if (!due.includes(part)) continue;
            const got = await loadPart(part, gen);
            if (gen !== st.gen) return;
            st.byPart.set(part, { ...got, rows: index(got.rows) });
            show(parts);
          }
        } catch (e) { if (gen === st.gen && e.message !== "stale") st.error = `Couldn't load the list: ${e.message}`; }
        finally { if (gen === st.gen) { st.loading = null; draw(); } }
      })();
      return st.loading;
    }
    function show(parts) {
      const got = parts.filter((p) => st.byPart.has(p)).map((p) => st.byPart.get(p));
      if (!got.length) return;
      st.rows = got.flatMap((k) => k.rows); st.total = got.reduce((n, k) => n + (k.total || 0), 0);
      st.at = Math.min(...got.map((k) => k.at)); st.partial = got.length < parts.length; draw();
    }

    function search(q) {
      const words = fold(q).split(" ").filter(Boolean), num = digits(q);
      if (!words.length || !st.rows) return [];
      const sounds = words.map(sound);
      // spelling-tolerant matching needs a real word: 4+ letters, matched at the start of a word in the record
      const soft = (w) => w.length >= 4;
      const soundHit = (r, i) => r._sound.includes(" " + sounds[i]);
      const slack = (w) => (w.length >= 9 ? 2 : w.length >= 4 ? 1 : 0); // letters that may be off: 1 from 4 letters, 2 from 9
      const out = [], seen = new Set(), narrowed = !!st.memo && st.memo.rows === st.rows && narrows(st.memo, words, num), pool = narrowed ? st.memo.all : st.rows;
      let best = 0; // matches that can't be outranked (score 0); once there are 30, the rest of the list can't change the answer
      for (const r of pool) {
        if (best >= 30) break;
        let score;
        if (num.length >= 6 && r._hay.includes(num)) score = 0;
        // exact letters: name starts with what you typed, then every word in the name, then anywhere
        else if (words.every((w) => r._hay.includes(w))) score = r._name.startsWith(words.join(" ")) ? 0 : words.every((w) => r._name.includes(w)) ? 1 : 2;
        // spelled another way (winna / wina, soemarno / sumarno)
        else if (words.every((w, i) => r._hay.includes(w) || (soft(w) && soundHit(r, i)))) score = sounds.every((w) => r._nameWords.some((x) => x.startsWith(w))) ? 3 : 4;
        else continue;
        out.push([score, r]); seen.add(r); if (score === 0) best++;
      }
      // a letter or two off, only when the passes above found next to nobody (it's the slow part on a big list)
      const full = out.length < 5; // the slow pass runs, so this search sees every row it could match
      if (full) for (const r of pool) {
        if (seen.has(r)) continue;
        if (!words.every((w, i) => r._hay.includes(w) || (soft(w) && (soundHit(r, i) || (slack(w) && fuzzyHit(sounds[i], r._words, slack(w))))))) continue;
        const inName = words.every((w, i) => r._name.includes(w) || (soft(w) && (r._nameWords.some((x) => x.startsWith(sounds[i])) || (slack(w) && fuzzyHit(sounds[i], r._nameWords, slack(w))))));
        out.push([inName ? 5 : 6, r]);
      }
      if (full) st.memo = { words, num, rows: st.rows, all: out.map((x) => x[1]) }; else if (!narrowed) st.memo = null;
      return out.sort((a, b) => a[0] - b[0] || (a[1]._name < b[1]._name ? -1 : a[1]._name > b[1]._name ? 1 : 0)).slice(0, 30).map((x) => x[1]);
    }

    function place() {
      if (!st.box || !st.input?.isConnected) return;
      // as wide as the search box, at least 460px, lined up with its right edge and kept inside the window
      const r = st.input.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(Math.max(r.width, 460), vw - 16);
      st.box.style.top = `${r.bottom + 6}px`;
      st.box.style.left = `${Math.max(8, Math.min(r.right - w, vw - w - 8))}px`;
      st.box.style.width = `${w}px`;
    }
    // closing folds the box away; a reduced-motion user (or a box already going) just loses it
    function close() {
      const box = st.box; if (!box) return;
      st.box = null; st.shown = new Set(); st.count = ""; st.sig = "";
      if (calm()) return void box.remove();
      box.classList.add("out"); setTimeout(() => box.remove(), 180);
    }
    function pick(r) {
      if (!r || !st.input) return;
      st.box?.querySelector('[aria-selected="true"]')?.classList.add("picked"); // a short flash on the row you chose
      close();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      st.picking = true; set.call(st.input, cfg.pick(r)); st.input.dispatchEvent(new Event("input", { bubbles: true })); st.picking = false; st.query = cfg.pick(r);
    }

    // a typed search is instant, so it gets one pass of the loading scan just for the feel; a pass already running isn't cut short
    function flash() {
      const box = st.box; if (!box || calm() || st.loading || box.classList.contains("flash")) return;
      box.classList.add("flash"); setTimeout(() => box.classList.remove("flash"), 780);
    }
    function draw() {
      if (!st.input || !st.input.isConnected || !st.query.trim() || document.activeElement !== st.input) { if (st.box && document.activeElement !== st.input) close(); return; }
      if (!document.getElementById("erp-fs-css")) { const s = el("style"); s.id = "erp-fs-css"; s.textContent = fsCss; document.head.append(s); }
      let fresh = false;
      if (!st.box) {
        fresh = true;
        st.box = el("div", "erp-fs"); st.box.setAttribute("role", "listbox"); st.box.setAttribute("aria-label", "Search"); document.body.append(st.box);
        st.box.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the search box
        st.box.append(el("div", "head"), el("div", "bar"), el("div", "body"), el("div", "foot"));
        // the label is made once, so a redraw while it types doesn't cut it short
        const label = el("span", `tw${calm() ? "" : " typing"}`, "Search"); label.style.setProperty("--n", String(label.textContent.length));
        st.box.querySelector(".head").append(label, el("span", "info"));
        st.box.querySelector(".bar").append(el("span"));
        const foot = st.box.querySelector(".foot"); foot.append(el("kbd", null, "↑↓"), " choose · ", el("kbd", null, "Enter"), " show in the table · ", el("kbd", null, "Esc"), " close");
      }
      const box = st.box, words = fold(st.query).split(" ").filter(Boolean);
      st.hits = search(st.query); st.sel = Math.min(st.sel, Math.max(0, st.hits.length - 1));

      // head: the label types itself in when the box opens, the count pops when it changes
      const head = box.querySelector(".info");
      head.replaceChildren();
      if (st.rows) {
        const mins = Math.floor((Date.now() - st.at) / 60000), missing = st.total - st.rows.length;
        const count = `${st.hits.length > 29 ? "30+" : st.hits.length} of ${st.rows.length.toLocaleString("id-ID")}${!st.loading && missing > 0 ? ` (${missing.toLocaleString("id-ID")} not loaded)` : ""}`;
        const age = mins < 1 ? "just updated" : mins < 120 ? `${mins} min old` : `${Math.round(mins / 60)} h old`;
        const progress = st.loading ? ` · ${age}, refreshing${st.parts > 1 ? ` ${st.partName} (${st.partNo} of ${st.parts})` : ""} ${st.done}/${st.pages || "…"}` : ` · ${age}`;
        const b = el("b", count !== st.count && st.count && !calm() ? "pop" : null, count); st.count = count;
        head.append(cfg.scope ? ` · ${cfg.scope(st.key)} ` : " ", b, progress);
        const up = el("button", null, "Update"); up.type = "button"; up.onclick = () => load(true); head.append(up);
      } else head.append(` ${st.error ? st.error : `First download of ${cfg.noun}${st.parts > 1 ? ` · ${st.partName} (${st.partNo} of ${st.parts})` : ""} ${st.done}/${st.pages || "…"}, saved as it comes`}`);

      // a thin bone line for the page being loaded, with light sweeping across it
      const bar = box.querySelector(".bar");
      bar.classList.toggle("on", !!st.loading); box.classList.toggle("busy", !!st.loading);
      bar.firstChild.style.setProperty("--f", `${(st.pages ? Math.min(1, st.done / st.pages) : 0.04) * 100}%`);

      // results: new ones rise in one after another; ones that stay don't move
      const body = box.querySelector(".body"), seen = st.shown, now = new Set();
      let list = body.querySelector("ul"), pill;
      // only when the results themselves change: a redraw for loading progress leaves the rows (and their animation) alone
      const sig = `${words.join(" ")}|${st.hits.map(cfg.id).join(",")}`;
      if (st.hits.length && sig === st.sig && list) { list.querySelectorAll("li").forEach((li, i) => li.setAttribute("aria-selected", String(i === st.sel))); now.clear(); seen.forEach((x) => now.add(x)); }
      else if (st.hits.length) {
        if (!list) { list = el("ul"); pill = el("div", "pill"); list.append(pill); body.replaceChildren(list); }
        pill = list.querySelector(".pill");
        const rows = [];
        let fresh_i = 0;
        st.hits.forEach((r, i) => {
          const id = cfg.id(r); now.add(id);
          const li = el("li"); li.setAttribute("role", "option"); li.setAttribute("aria-selected", String(i === st.sel));
          if (!seen.has(id) && !calm()) { li.classList.add("in"); li.style.setProperty("--i", String(Math.min(fresh_i++, 9))); }
          li.append(el("span", `dot ${cfg.dot(r)}`), marked(String(cfg.name(r) ?? ""), words), el("span", "us", id));
          li.append(el("span", "sub", cfg.sub(r).filter(Boolean).join(" · ")));
          li.onclick = () => pick(r);
          rows.push(li);
        });
        list.replaceChildren(pill, ...rows);
      } else {
        const msg = st.rows ? (st.loading ? "Nobody yet in what's loaded; older months are still coming" : "Nobody matches all of those words") : "";
        // while rows are still downloading, a halftone scanner stands in for the results
        const old = body.querySelector(".empty"), busy = !!st.loading;
        if ((old?.textContent ?? "") !== msg || !!body.querySelector(".scan") !== busy) body.replaceChildren(...(busy ? [el("div", "scan")] : []), ...(msg ? [el("div", "empty", msg)] : []));
      }
      st.shown = now; st.sig = sig;
      box.querySelector(".foot").hidden = !st.hits.length;
      if (fresh && !calm()) box.classList.add("opening");
      place();

      // the highlight slides to the chosen row
      const on = box.querySelector('[aria-selected="true"]');
      if (on && list) {
        pill = list.querySelector(".pill");
        const go = () => { pill.style.transform = `translateY(${on.offsetTop}px)`; pill.style.height = `${on.offsetHeight}px`; pill.classList.add("on"); };
        if (fresh || !pill.classList.contains("on")) { pill.style.transition = "none"; go(); void pill.offsetHeight; pill.style.transition = ""; } else go();
        // keep the chosen row in view by scrolling the list only (scrollIntoView would scroll the whole page too)
        if (on.offsetTop < list.scrollTop) list.scrollTop = on.offsetTop - 4;
        else if (on.offsetTop + on.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = on.offsetTop + on.offsetHeight - list.clientHeight + 4;
      }
    }

    const here = () => location.pathname.startsWith(cfg.path);
    document.addEventListener("input", (e) => {
      if (st.picking || !here() || !(e.target instanceof HTMLInputElement) || !e.target.matches(cfg.input)) return;
      st.input = e.target; st.query = e.target.value; st.sel = 0;
      load(); draw(); flash();
    }, true);
    document.addEventListener("focusin", (e) => { if (here() && e.target instanceof HTMLInputElement && e.target.matches(cfg.input)) { st.input = e.target; st.query = e.target.value; load(); draw(); } }, true);
    document.addEventListener("focusout", (e) => { if (e.target === st.input) setTimeout(() => { if (document.activeElement !== st.input) close(); }, 0); }, true);
    document.addEventListener("keydown", (e) => {
      if (!st.box || e.target !== st.input) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); st.sel = (st.sel + (e.key === "ArrowDown" ? 1 : -1) + st.hits.length) % Math.max(1, st.hits.length); draw(); }
      else if (e.key === "Enter" && st.hits[st.sel]) { e.preventDefault(); e.stopPropagation(); pick(st.hits[st.sel]); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    }, true);
    addEventListener("resize", place); document.addEventListener("scroll", place, { capture: true, passive: true });

    // the page's own requests: its sign-in (kept in memory only, never saved) and, for invoices, which month it shows
    return function seen(u, auth) {
      if (!u.pathname.startsWith(cfg.api)) return;
      if (auth) { const first = !st.auth; st.auth = auth; if (first && (st.error || st.rows)) { st.error = ""; load(); } } // refresh what the saved copy showed
      const key = cfg.key(Object.fromEntries(u.searchParams));
      if (key !== st.key) { st.key = key; st.gen++; st.rows = null; st.byPart = null; st.reading = null; st.total = 0; st.partial = false; st.loading = null; if (st.box) load(); } // another month: its own list
    };
  }

  const fsCss = `
    .erp-fs { --card: #090b0c; --raised: #1a1d1e; --edge: #363738; --hair: #262727; --bone: #e9e1dc; --paper: #efefed; --body: #b3b0af; --muted: #8a8b8a; --green: #55bc82; --red: #f12614; --blue: #3e7edf;
      position: fixed; z-index: 2147483001; max-height: min(460px, 60vh); display: flex; flex-direction: column; border-radius: 8px; background: var(--card); color: var(--body);
      font: 400 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-feature-settings: "cv11", "tnum"; -webkit-font-smoothing: antialiased;
      box-shadow: inset 0 0 0 1px var(--edge), 0 40px 32px rgba(0,0,0,.18), 0 22px 18px rgba(0,0,0,.2), 0 12px 10px rgba(0,0,0,.2), 0 6px 5px rgba(0,0,0,.18), 0 2px 2px rgba(0,0,0,.2);
      transform-origin: top; }
    .erp-fs .head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--hair); font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .erp-fs .head::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); flex: none; }
    .erp-fs .head .info { display: contents; }
    .erp-fs .head b { font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--paper); }
    .erp-fs .head button { margin-left: auto; border: 0; background: none; color: var(--muted); font: inherit; letter-spacing: 0; text-transform: none; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
    .erp-fs .head button:hover { color: var(--paper); background: rgba(255,255,255,.04); }
    .erp-fs ul { list-style: none; margin: 0; padding: 4px; overflow: auto; }
    .erp-fs li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
    .erp-fs .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
    .erp-fs .dot.on { background: var(--green); } .erp-fs .dot.iso, .erp-fs .dot.bad { background: var(--red); } .erp-fs .dot.off { background: #8a8b8a; } /* isolir red, offline grey */
    .erp-fs .nm { color: var(--paper); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .erp-fs .nm mark { background: none; color: var(--bone); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(233,225,220,.4); }
    .erp-fs .us { font: 12px/1.4 "JetBrains Mono", ui-monospace, Menlo, monospace; color: var(--body); }
    .erp-fs .sub { grid-column: 2 / 4; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .erp-fs .empty { padding: 16px 14px; color: var(--muted); }
    .erp-fs .foot { padding: 8px 14px; border-top: 1px solid var(--hair); font-size: 12px; color: var(--muted); }
    .erp-fs kbd { font: 11px "JetBrains Mono", ui-monospace, monospace; padding: 1px 5px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--edge); color: var(--body); }
    /* ---- motion, in Faust's language: soft Column curve to arrive, the swap curve to slide, quick to leave ---- */
    .erp-fs { --soft: cubic-bezier(.1, 0, .1, 1); --swap: cubic-bezier(.76, 0, .24, 1); --out: cubic-bezier(.22, 1, .36, 1); animation: none; }
    .erp-fs.opening { animation: erp-fs-open .42s var(--out) both; }
    @keyframes erp-fs-open { from { opacity: 0; clip-path: inset(0 0 100% 0 round 8px); transform: translateY(-6px); filter: blur(2px); }
      to { opacity: 1; clip-path: inset(0 0 0 0 round 8px); transform: none; filter: none; } }
    .erp-fs.out { animation: erp-fs-close .18s cubic-bezier(.4, 0, 1, 1) both; pointer-events: none; }
    @keyframes erp-fs-close { to { opacity: 0; transform: translateY(-4px) scale(.98); filter: blur(1px); } }
    /* the eyebrow types itself in, then keeps a faint blinking block cursor */
    .erp-fs .tw { display: inline-flex; align-items: center; }
    .erp-fs .tw::after { content: ""; width: .5em; height: 1em; margin-left: 3px; background: var(--bone); opacity: .2; animation: erp-fs-blink 1.1s steps(1) infinite; }
    .erp-fs .tw.typing { clip-path: inset(0 100% 0 0); animation: erp-fs-type .55s steps(var(--n)) .08s forwards; }
    @keyframes erp-fs-type { to { clip-path: inset(0 0 0 0); } }
    @keyframes erp-fs-blink { 50% { opacity: 0; } }
    .erp-fs .head b.pop { display: inline-block; animation: erp-fs-pop .32s var(--out); }
    @keyframes erp-fs-pop { from { transform: translateY(3px); opacity: .4; filter: blur(1px); } }
    /* loading, in halftone: a dot-matrix progress track with a bright scan running along it */
    @property --fs-p { syntax: "<percentage>"; inherits: false; initial-value: 0%; }
    @property --fs-a { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
    .erp-fs .bar { flex: none; height: 0; margin: 0 14px; overflow: hidden; position: relative; opacity: 0; transition: height .3s var(--out), opacity .3s;
      background: radial-gradient(circle, rgba(233,225,220,.13) 0 .8px, transparent 1.1px) 0 0 / 4px 9px; }
    .erp-fs .bar.on { height: 9px; margin-top: 6px; opacity: 1; }
    .erp-fs .bar span { position: absolute; inset: 0; --f: 4%; background: radial-gradient(circle, var(--bone) 0 .9px, transparent 1.2px) 0 0 / 4px 9px;
      clip-path: inset(0 calc(100% - var(--f)) 0 0); transition: clip-path .5s var(--out); }
    .erp-fs .bar.on::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle, #fff 0 1.4px, transparent 1.8px) 0 0 / 4px 9px;
      mask: linear-gradient(90deg, transparent calc(var(--fs-p) - 18%), #000 calc(var(--fs-p) - 4%), transparent var(--fs-p)); animation: erp-fs-scanp 1.6s var(--swap) infinite; }
    @keyframes erp-fs-scanp { from { --fs-p: 0%; } to { --fs-p: 122%; } }
    /* the head dot turns into a tiny dot-matrix radar */
    .erp-fs.busy .head::before, .erp-fs.flash .head::before { width: 11px; height: 11px; border-radius: 0; background: conic-gradient(from var(--fs-a), var(--bone), rgba(233,225,220,.1) 70%, var(--bone));
      mask: radial-gradient(circle, #000 0 1px, transparent 1.3px) 0 0 / 3.67px 3.67px; animation: erp-fs-radar 1s linear infinite; }
    @keyframes erp-fs-radar { to { --fs-a: 360deg; } }
    /* ghost result rows drawn in dots, swept by the scan while the list fills */
    .erp-fs .scan { height: 92px; margin: 12px 14px 4px; flex: none; background: radial-gradient(circle, var(--bone) 0 .9px, transparent 1.2px) 0 0 / 4px 4px;
      mask: linear-gradient(90deg, rgba(0,0,0,.1) calc(var(--fs-p) - 50%), #000 calc(var(--fs-p) - 12%), rgba(0,0,0,.1) var(--fs-p)),
        repeating-linear-gradient(180deg, #000 0 8px, transparent 8px 12px, rgba(0,0,0,.45) 12px 16px, transparent 16px 31px),
        linear-gradient(90deg, #000 55%, rgba(0,0,0,.35) 56% 76%, transparent 77% 82%, rgba(0,0,0,.6) 83%);
      mask-composite: intersect; animation: erp-fs-scanp 1.8s var(--swap) infinite; }
    .erp-fs .scan + .empty { padding-top: 6px; }
    /* a faint band of dots keeps sweeping down behind the rows, slowly when idle, faster while refreshing */
    .erp-fs .body { position: relative; }
    .erp-fs .body::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle, rgba(233,225,220,.22) 0 .9px, transparent 1.2px) 0 0 / 5px 5px;
      mask: linear-gradient(180deg, transparent calc(var(--fs-p) - 30%), #000 calc(var(--fs-p) - 6%), transparent var(--fs-p)); opacity: .6; animation: erp-fs-scanp 4.2s var(--swap) infinite; }
    .erp-fs.busy .body::before { opacity: 1; animation-duration: 2.4s; }
    /* a normal search plays the scan once per burst of typing, over the head line so nothing shifts */
    .erp-fs .head { position: relative; }
    .erp-fs.flash .head::after { content: ""; position: absolute; left: 14px; right: 14px; bottom: -3px; height: 5px; pointer-events: none;
      background: radial-gradient(circle, #fff 0 1.3px, transparent 1.7px) 0 0 / 4px 5px;
      mask: linear-gradient(90deg, transparent calc(var(--fs-p) - 22%), #000 calc(var(--fs-p) - 4%), transparent var(--fs-p)); animation: erp-fs-scanp .75s var(--swap) both; }
    .erp-fs.flash .head::before { animation: erp-fs-radar .75s var(--swap) both; }
    .erp-fs.flash .body::before { opacity: 1; animation: erp-fs-scanp .75s var(--swap) both; }
    .erp-fs .body { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    .erp-fs ul { position: relative; }
    /* results rise in one after another; the selection is a pill that slides between them */
    .erp-fs li { position: relative; z-index: 1; background: none !important; transition: transform .1s; }
    .erp-fs li.in { animation: erp-fs-row .45s var(--soft) both; animation-delay: calc(var(--i) * 28ms); }
    @keyframes erp-fs-row { from { opacity: 0; transform: translateY(8px); filter: blur(2px); } }
    .erp-fs li:active { transform: scale(.99); }
    .erp-fs .pill { position: absolute; left: 4px; right: 4px; top: 0; border-radius: 6px; background: var(--raised); opacity: 0;
      transition: transform .1s var(--out), height .1s var(--out), opacity .15s; pointer-events: none; }
    .erp-fs .pill.on { opacity: 1; }
    .erp-fs li.picked { animation: erp-fs-pick .18s ease-out both; }
    @keyframes erp-fs-pick { 40% { background: rgba(233,225,220,.12); } }
    .erp-fs .empty { animation: erp-fs-row .35s var(--soft) both; }
    .erp-fs mark { transition: color .2s; }
    @media (prefers-reduced-motion: reduce) {
      .erp-fs, .erp-fs *, .erp-fs *::before, .erp-fs *::after { animation: none !important; transition: none !important; }
      .erp-fs .scan { --fs-p: 90%; }
      .erp-fs .tw.typing { clip-path: none; }
    }`;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const searches = [
    // LDN Radius → Pelanggan: all RADIUS customers (no passwords are loaded)
    fastSearch({
      path: "/ldn-radius", api: "/api/admin/ldn-radius/", input: 'input[placeholder*="username PPPoE"]', noun: "customers",
      key: () => "all", pageSize: 500,
      url: (key, p, size) => `/api/admin/ldn-radius/customers?page=${p}&pageSize=${size}`,
      total: (j) => j.total || 0, items: (j) => j.customers || [],
      keep: ["username", "nama", "phone", "address", "desa", "kecamatanErp", "district", "router", "paket", "isolir", "online", "expirasi", "isInactive",
        "lat", "lng", "ip", "tglAktif", "ontSerial", "mitra", "customerDocId"], // the Dock shows these, and finds neighbours by lat/lng
      name: (r) => r.nama, id: (r) => r.username, pick: (r) => r.username,
      hay: (r) => [r.username, r.address, r.desa, r.kecamatanErp, r.district, r.router, r.paket], numbers: (r) => [r.phone],
      dot: (r) => (r.isolir ? "iso" : r.online ? "on" : "off"), sub: (r) => [r.paket, r.desa, r.router, r.phone],
    }),
    // Finance → Invoices: the month the page shows (it follows the month you pick there)
    fastSearch({
      path: "/finance/invoices", api: "/api/finance/invoices/", input: 'input[placeholder*="No. Invoice"]', noun: "invoices",
      key: (q) => { const now = new Date(); return `inv-${q.year || now.getFullYear()}-${q.month || now.getMonth() + 1}`; },
      scope: (key) => { const [, y, m] = key.split("-"); return m === "all" ? `all of ${y}` : `${MONTHS[Number(m) - 1]} ${y}`; },
      // "Semua Bulan" (month=all) is a whole year, ~70,000 invoices: loaded month by month, newest first, each month kept on its own
      parts: (key) => { const [, y, m] = key.split("-"); if (m !== "all") return [key]; const now = new Date(), last = Number(y) === now.getFullYear() ? now.getMonth() + 1 : 12;
        return Array.from({ length: last }, (_, i) => `inv-${y}-${last - i}`); },
      partLabel: (part) => { const [, y, m] = part.split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; },
      // this month and last change (payments come in); older months hardly do, so they're kept a week
      ttl: (part) => { const [, y, m] = part.split("-"), now = new Date(), age = (now.getFullYear() - Number(y)) * 12 + now.getMonth() + 1 - Number(m);
        return age >= 2 ? 7 * 24 * 60 * 60 * 1000 : SEARCH_TTL; }, // months before last: a week
      pageSize: 200, // the most the server gives at once
      url: (key, p, size) => { const [, y, m] = key.split("-"); return `/api/finance/invoices/list?month=${m}&year=${y}&page=${p}&pageSize=${size}`; },
      total: (j) => j.total || 0, items: (j) => j.invoices || [],
      keep: ["invoiceNumber", "winpayTrxId", "customerName", "radiusUsername", "contractNumber", "desa", "kecamatan", "router", "paket", "phone", "amount", "status", "period", "dueDate", "paidDate"],
      name: (r) => r.customerName, id: (r) => r.invoiceNumber, pick: (r) => r.invoiceNumber,
      hay: (r) => [r.invoiceNumber, r.winpayTrxId, r.radiusUsername, r.contractNumber, r.desa, r.kecamatan, r.router, r.paket], numbers: (r) => [r.phone],
      dot: (r) => (/lunas|paid|bayar/i.test(r.status) && !/belum|unpaid/i.test(r.status) ? "on" : /jatuh|overdue|telat|lewat|tunggak/i.test(r.status) ? "bad" : ""),
      sub: (r) => [r.status, rupiah(r.amount), r.period, r.desa, r.radiusUsername],
    }),
  ];

  // ---------- the Dock: a floating button (Alt+K) with customer lookup, pages and tools ----------
  // Everything here reads what this script already keeps in the browser (the LDN customer list, this month's invoices)
  // and pages you've seen in the sidebar. It asks the server only to pay and to work a modem (when you press the
  // buttons), to look modems up (the OLTs' cached ONT lists, every 2 hours when used) and for the outage radar
  // (a 20 KB router feed every 5 minutes, from one ERP tab). "Open in …" goes to the page and fills that page's own search box when it arrives.
  (() => {
    const RECENT = "erpDock.recent", PAGES = "erpDock.pages", PENDING = "erpDock.pending";
    const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
    const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    // a few pages to start with; the sidebar teaches the rest as you browse
    const START = [["/finance/invoices", "Daftar Invoice Pelanggan"], ["/ldn-radius", "LDN Radius (Panel)"], ["/customer-map", "Peta Jaringan Terpadu"],
      ["/ldn-radius/map", "Peta Pelanggan (LDN)"], ["/customers/master", "Master Pelanggan"], ["/marketing/prospective-customers", "Calon Pelanggan"],
      ["/work-orders", "Daftar Tugas Harian (SPK)"], ["/planning", "Pusat Pembuatan SPK"], ["/customers/isolated", "Pelanggan Isolir"], ["/dashboard", "Dasbor"]];
    const SHORTCUTS = [["Invoices", "/finance/invoices", "M3 4h18v16H3zM7 8h10M7 12h10M7 16h6"], ["LDN Pelanggan", "/ldn-radius", "M4 6h16M4 12h16M4 18h10"],
      ["Map Terpadu", "/customer-map", "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"], ["Work Orders", "/work-orders", "M9 11l3 3 8-8M20 12v7H4V5h11"],
      ["Planning", "/planning", "M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z"], ["Isolir", "/customers/isolated", "M12 3l9 16H3zM12 10v4M12 17h.01"]];

    // ---- data from what's kept ----
    let customers = null, custAt = 0, invoices = null, invKey = "";
    const prep = (rows) => { for (const r of rows) { r._name = fold(r.nama); r._hay = ` ${r._name} ${fold(r.username)} ${fold(r.address)} ${fold(r.desa)} ${fold(r.kecamatanErp)} ${fold(r.router)} ${fold(r.paket)} ${digits(r.phone)} ${fold(r.ip)} ${fold(r.ontSerial)} `;
      r._words = [...new Set(r._hay.trim().split(" ").filter((x) => x.length > 1 && !/^\d+$/.test(x)).map(sound))]; r._sound = ` ${r._words.join(" ")} `; } return rows; };
    async function data() {
      const kept = await idbGet("all");
      if (kept?.rows && kept.at !== custAt) { customers = prep(kept.rows); custAt = kept.at; }
      const now = new Date(), key = `inv-${now.getFullYear()}-${now.getMonth() + 1}`;
      if (key !== invKey || !invoices) { const k = await idbGet(key); if (k?.rows) { invoices = k.rows; invKey = key; } }
    }
    let findMemo = null; // what the last full search found (see narrows)
    function findCustomers(q, max = 6) {
      if (!customers) return [];
      const words = fold(q).split(" ").filter(Boolean), num = digits(q); if (!words.length) return [];
      const narrowed = !!findMemo && findMemo.rows === customers && narrows(findMemo, words, num), pool = narrowed ? findMemo.all : customers;
      const sounds = words.map(sound), out = [], seen = new Set();
      for (const r of pool) {
        let score = -1;
        if (num.length >= 6 && r._hay.includes(num)) score = 0;
        else if (words.every((w) => r._hay.includes(w))) score = r._name.startsWith(words.join(" ")) ? 0 : words.every((w) => r._name.includes(w)) ? 1 : 2;
        else if (words.every((w, i) => r._hay.includes(w) || (w.length >= 4 && r._sound.includes(" " + sounds[i])))) score = 3;
        if (score >= 0) { out.push([score, r]); seen.add(r); }
      }
      const full = out.length < 3;
      if (full) for (const r of pool) {
        if (seen.has(r)) continue;
        if (words.every((w, i) => r._hay.includes(w) || (w.length >= 4 && fuzzyHit(sounds[i], r._words, w.length >= 9 ? 2 : 1)))) out.push([4, r]);
      }
      if (full) findMemo = { words, num, rows: customers, all: out.map((x) => x[1]) }; else if (!narrowed) findMemo = null;
      return out.sort((a, b) => a[0] - b[0] || (a[1]._name < b[1]._name ? -1 : 1)).slice(0, max).map((x) => x[1]);
    }
    const pages = () => { const m = new Map(START); for (const [h, t] of Object.entries(ls.get(PAGES, {}))) m.set(h, t); return [...m]; };
    function findPages(q, max = 5) {
      const words = fold(q).split(" ").filter(Boolean); if (!words.length) return [];
      return pages().map(([h, t]) => { const hay = ` ${fold(t)} ${fold(h)} `; const ok = words.every((w) => hay.includes(w)); return ok ? [fold(t).startsWith(words[0]) ? 0 : 1, h, t] : null; })
        .filter(Boolean).sort((a, b) => a[0] - b[0] || a[2].length - b[2].length).slice(0, max).map(([, h, t]) => ({ h, t }));
    }
    // learn the pages from the sidebar as they show up
    const learn = () => { const m = ls.get(PAGES, {}); let n = 0;
      for (const a of document.querySelectorAll('a[href^="/"]')) { const t = a.innerText.trim().replace(/\s+/g, " "); const h = a.getAttribute("href");
        if (!t || t.length > 60 || /^\d|^CTR-/.test(t) || h.includes("?") || m[h] === t) continue; m[h] = t; n++; }
      if (n) ls.set(PAGES, m); };

    // ---- going somewhere and filling its search ----
    function go(path, fill) {
      if (fill) sessionStorage.setItem(PENDING, JSON.stringify({ path, ...fill, at: Date.now() }));
      close();
      if (location.pathname === path) return void runPending();
      if (window.next?.router?.push) window.next.router.push(path); else location.assign(path);
    }
    const press = (el) => { for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) el.dispatchEvent(new (t.startsWith("pointer") ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, button: 0 })); };
    function runPending() {
      let p; try { p = JSON.parse(sessionStorage.getItem(PENDING)); } catch { return; }
      if (!p || location.pathname !== p.path) return;
      if (Date.now() - p.at > 30000) return void sessionStorage.removeItem(PENDING);
      if (p.tab) { // a tab inside the page (LDN: Pelanggan)
        const tab = [...document.querySelectorAll('button[role="tab"], button')].find((b) => b.innerText.trim() === p.tab && b.parentElement?.innerText.includes(p.tabNear || ""));
        if (tab && tab.getAttribute("aria-selected") !== "true") { press(tab); return void setTimeout(runPending, 400); }
      }
      const input = [...document.querySelectorAll("input")].find((i) => (p.input ? i.matches(p.input) : /cari|search/i.test(i.placeholder || "") && !/modul|menu/i.test(i.placeholder || "")));
      if (!input) return void setTimeout(runPending, 400);
      sessionStorage.removeItem(PENDING);
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(input, p.value); input.dispatchEvent(new Event("input", { bubbles: true })); input.scrollIntoView({ block: "center" });
    }
    const openIn = {
      ldn: (r) => go("/ldn-radius", { tab: "Pelanggan", tabNear: "Per Desa", input: 'input[placeholder*="username PPPoE"]', value: r.username }),
      invoices: (r) => go("/finance/invoices", { input: 'input[placeholder*="No. Invoice"]', value: r.username }),
      map: (r) => go("/customer-map", { input: 'input[placeholder*="Cari nama"]', value: r.nama }),
      master: (r) => go("/customers/master", { value: r.nama }),
    };

    // ---- nearby ----
    const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) && x !== 0 ? x : null; };
    const metres = (a, b) => { const R = 6371000, t = Math.PI / 180, dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const where = (r) => { const lat = num(r.lat), lng = num(r.lng); return lat && lng ? { lat, lng } : null; };
    function nearby(r, radius) {
      const c = where(r); if (!c || !customers) return null;
      const dLat = radius / 111000, dLng = radius / (111000 * Math.cos(c.lat * Math.PI / 180)), out = [];
      for (const x of customers) { if (x === r) continue; const p = where(x); if (!p || Math.abs(p.lat - c.lat) > dLat || Math.abs(p.lng - c.lng) > dLng) continue;
        const d = metres(c, p); if (d <= radius) out.push({ r: x, d, p }); }
      return { c, list: out.sort((a, b) => a.d - b.d) };
    }
    const state = (r) => (r.isolir ? "iso" : r.online ? "on" : "off");

    // ---- drawing ----
    let fab = null, panel = null, corner = null, view = { q: "", sel: 0, card: null, radius: 300 }, items = [];
    const css = `
      .erp-dock, .erp-dock-fab { --canvas: #07090b; --card: #090b0c; --raised: #1a1d1e; --edge: #363738; --hair: #262727; --bone: #e9e1dc; --paper: #efefed; --body: #b3b0af; --muted: #8a8b8a;
        --green: #55bc82; --red: #f12614; --blue: #3e7edf; --soft: cubic-bezier(.1, 0, .1, 1); --out: cubic-bezier(.22, 1, .36, 1);
        font: 400 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-feature-settings: "cv11", "tnum"; -webkit-font-smoothing: antialiased; }
      .erp-dock-fab { position: fixed; z-index: 2147483002; width: 48px; height: 48px; border-radius: 12px; border: 0; cursor: pointer; display: grid; place-items: center;
        background: var(--card); color: var(--bone); box-shadow: inset 0 0 0 1px var(--edge), 0 12px 24px rgba(0,0,0,.35), 0 2px 4px rgba(0,0,0,.3);
        transition: transform .25s var(--out), box-shadow .25s var(--out); animation: erp-dock-in .6s var(--soft) both; }
      .erp-dock-fab:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 1px #696a68, 0 16px 28px rgba(0,0,0,.4), 0 2px 4px rgba(0,0,0,.3); }
      .erp-dock-fab:active { transform: scale(.94); }
      .erp-dock-fab:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
      .erp-dock-fab svg { width: 22px; height: 22px; transition: transform .35s var(--out), opacity .2s; }
      .erp-dock-fab[aria-expanded="true"] svg.open { transform: rotate(90deg) scale(.6); opacity: 0; } .erp-dock-fab svg.x { position: absolute; transform: rotate(-90deg) scale(.6); opacity: 0; }
      .erp-dock-fab[aria-expanded="true"] svg.x { transform: none; opacity: 1; }
      @keyframes erp-dock-in { from { opacity: 0; transform: translateY(12px) scale(.9); filter: blur(2px); } }
      .erp-dock { position: fixed; z-index: 2147483002; width: min(440px, calc(100vw - 32px)); max-height: min(640px, calc(100vh - 120px)); display: flex; flex-direction: column;
        border-radius: 10px; background: var(--card); color: var(--body); overflow: hidden; transform-origin: bottom right;
        box-shadow: inset 0 0 0 1px var(--edge), 0 40px 32px rgba(0,0,0,.18), 0 22px 18px rgba(0,0,0,.2), 0 12px 10px rgba(0,0,0,.2), 0 6px 5px rgba(0,0,0,.18), 0 2px 2px rgba(0,0,0,.2);
        animation: erp-ht-open .5s var(--out) both; }
      .erp-dock.out { animation: erp-ht-close .22s cubic-bezier(.5, 0, .75, 0) both; pointer-events: none; }
      /* Halftone motion: a wave front of dots. Solid behind the front, a band of dots on it, nothing ahead; the mask
         goes once the animation ends (ht-done), so shadows and the map draw as usual. */
      .erp-dock:not(.ht-done), .erp-dock.out {
        mask: radial-gradient(circle at var(--ox, 100%) var(--oy, 100%), #000 calc(var(--ht-w) - 56px), transparent calc(var(--ht-w) - 55px)) 0 0 / 100% 100% no-repeat,
          radial-gradient(circle, #000 1.6px, transparent 2.2px) 0 0 / 6px 6px,
          radial-gradient(circle at var(--ox, 100%) var(--oy, 100%), #000 calc(var(--ht-w) - 8px), transparent var(--ht-w)) 0 0 / 100% 100% no-repeat;
        mask-composite: add, intersect; }
      .erp-dock.erp-dock-full { --ox: 50%; --oy: 50%; }
      @keyframes erp-ht-open { from { --ht-w: 0px; transform: translateY(6px); } to { --ht-w: 1100px; transform: none; } }
      @keyframes erp-ht-close { from { --ht-w: 900px; } to { --ht-w: 0px; transform: translateY(4px); } }
      @keyframes erp-ht-open-full { from { --ht-w: 0px; } to { --ht-w: 1500px; } }

      .erp-dock .top { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--hair); }
      .erp-dock .top svg { width: 16px; height: 16px; color: var(--muted); flex: none; }
      .erp-dock .top input { flex: 1; min-width: 0; height: 32px; border: 0; outline: 0; background: none; color: var(--paper); font: inherit; font-size: 15px; }
      .erp-dock .top input::placeholder { color: var(--muted); }
      .erp-dock .shut { display: grid; place-items: center; width: 32px; height: 32px; margin-right: -6px; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; }
      .erp-dock .shut:hover { background: var(--raised); color: var(--paper); } .erp-dock .shut[aria-pressed="true"] { color: var(--paper); } .erp-dock .shut svg { width: 16px; height: 16px; }
      .erp-dock kbd { font: 11px "JetBrains Mono", ui-monospace, monospace; padding: 1px 5px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--edge); color: var(--body); }
      .erp-dock .scroll { overflow: auto; padding: 6px 6px 10px; }
      .erp-dock .eyebrow { display: flex; align-items: center; gap: 8px; margin: 10px 10px 6px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
      .erp-dock .eyebrow::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); }
      .erp-dock .eyebrow b { font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--paper); }
      .erp-dock .item { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px;
        background: none; color: var(--body); font: inherit; text-align: left; cursor: pointer; }
      .erp-dock .item[aria-selected="true"], .erp-dock .item:hover { background: var(--raised); }
      .erp-dock .item .t { color: var(--paper); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .erp-dock .item .r { font: 12px "JetBrains Mono", ui-monospace, monospace; color: var(--muted); }
      .erp-dock .item .s { grid-column: 2 / 4; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .erp-dock .item svg { width: 16px; height: 16px; color: var(--muted); }
      .erp-dock .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); justify-self: center; }
      .erp-dock .dot.on { background: var(--green); box-shadow: 0 0 0 3px rgba(85,188,130,.15); }
      .erp-dock .dot.iso, .erp-dock .dot.bad { background: var(--red); box-shadow: 0 0 0 3px rgba(241,38,20,.15); }
      .erp-dock .dot.off { background: #8a8b8a; } /* online green, isolir red, offline grey */
      .erp-dock .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 6px; }
      .erp-dock .tile { display: grid; justify-items: start; gap: 8px; padding: 12px; border: 0; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair);
        color: var(--paper); font: inherit; font-size: 13px; font-weight: 500; text-align: left; cursor: pointer; transition: box-shadow .2s, transform .15s var(--out); }
      .erp-dock .tile:hover, .erp-dock .tile[aria-selected="true"] { box-shadow: inset 0 0 0 1px #696a68; transform: translateY(-1px); }
      .erp-dock .tile svg { width: 18px; height: 18px; color: var(--bone); }
      .erp-dock .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 6px; }
      .erp-dock .stat { padding: 10px 12px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .stat b { display: block; font-size: 20px; font-weight: 500; letter-spacing: -.01em; color: var(--paper); font-variant-numeric: tabular-nums; }
      .erp-dock .stat span { font-size: 12px; color: var(--muted); }
      .erp-dock .stat.on b { color: var(--green); } .erp-dock .stat.iso b, .erp-dock .stat.bad b { color: #ff6a5c; }
      .erp-dock .note { margin: 8px 10px; font-size: 12px; color: var(--muted); }
      /* the customer card */
      .erp-dock .card { padding: 4px 8px 8px; }
      .erp-dock .back { border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; padding: 4px 4px 8px; }
      .erp-dock .back:hover { color: var(--paper); }
      .erp-dock .who { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
      .erp-dock .who h3 { margin: 0; font-size: 18px; font-weight: 500; letter-spacing: -.01em; color: var(--paper); line-height: 1.25; }
      .erp-dock .pill { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px; border-radius: 999px; background: rgba(255,255,255,.05); font-size: 12px; color: var(--body); white-space: nowrap; }
      .erp-dock .facts { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 6px 12px; margin: 12px 4px; font-size: 13px; }
      .erp-dock .facts dt { color: var(--muted); } .erp-dock .facts dd { margin: 0; color: var(--paper); overflow-wrap: anywhere; }
      .erp-dock .mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; }
      .erp-dock .copy { margin-left: 6px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; padding: 0 4px; border-radius: 4px; }
      .erp-dock .copy:hover { color: var(--paper); background: var(--raised); }
      .erp-dock .actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 4px 12px; }
      .erp-dock .btn { height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: none; color: var(--paper); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
        box-shadow: inset 0 0 0 1px var(--edge); transition: box-shadow .2s, transform .1s; text-decoration: none; display: inline-flex; align-items: center; }
      .erp-dock .btn:hover { box-shadow: inset 0 0 0 1px #696a68; } .erp-dock .btn:active { transform: scale(.97); }
      .erp-dock .btn.primary { background: var(--bone); color: var(--canvas); box-shadow: 0 1px 3px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.5); }
      .erp-dock .btn:focus-visible, .erp-dock .item:focus-visible, .erp-dock .tile:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
      .erp-dock .seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .seg button { height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
      .erp-dock .seg button[aria-pressed="true"] { background: var(--raised); color: var(--paper); }
      .erp-dock .near { margin: 4px; padding: 12px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .near .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .erp-dock canvas { display: block; width: 100%; height: 170px; margin: 10px 0 6px; }
      .erp-dock .map { position: relative; height: 340px; margin: 10px 0 6px; border-radius: 8px; overflow: hidden; background: #0f1214; box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .map { cursor: grab; touch-action: none; user-select: none; overflow: clip; } /* clip, not hidden: a hidden box can still be scrolled (by focus or the share panel), sliding the strip and legend away */ .erp-dock .map.panning { cursor: grabbing; } .erp-dock .map.panning .mdot { pointer-events: none; }
      .erp-dock .map .tiles { position: absolute; inset: 0; pointer-events: none; }
      .erp-dock .map .tiles img { position: absolute; width: 256px; height: 256px; max-width: none; pointer-events: none; user-select: none; }
      @property --ht-r { syntax: "<length>"; inherits: false; initial-value: 6px; }
      @property --ht-w { syntax: "<length>"; inherits: false; initial-value: 9000px; }
      @property --ht-p { syntax: "<percentage>"; inherits: false; initial-value: 200%; }
      .erp-dock .map .tiles.ht-wait { opacity: 0; }
      .erp-dock .map .tiles.ht-in, .erp-dock .map .tiles.ht-out { --ht-mask: radial-gradient(circle, #000 var(--ht-r), transparent calc(var(--ht-r) + .7px)) 0 0 / 7px 7px; -webkit-mask: var(--ht-mask); mask: var(--ht-mask); }
      .erp-dock .map .tiles.ht-in { animation: erp-ht-in .5s var(--out) both; } .erp-dock .map .tiles.ht-out { animation: erp-ht-out .42s cubic-bezier(.5, 0, .75, 0) both; }
      @keyframes erp-ht-in { from { --ht-r: 0px; } to { --ht-r: 5.2px; } } @keyframes erp-ht-out { from { --ht-r: 5.2px; } to { --ht-r: 0px; opacity: .4; } }
      .erp-dock .map .tiles.ghost { transform-origin: 0 0; transition: transform .38s var(--out); will-change: transform; }
      .erp-dock .map .ht-load { position: absolute; inset: 0; pointer-events: none; transition: opacity .4s var(--soft);
        background: radial-gradient(circle, rgba(233,225,220,.07) 0 1px, transparent 1.5px) 0 0 / 8px 8px; }
      .erp-dock .map .ht-load::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle, rgba(233,225,220,.34) 0 1.3px, transparent 1.8px) 0 0 / 8px 8px;
        -webkit-mask: radial-gradient(circle at 50% 50%, transparent calc(var(--ht-w) - 110px), #000 calc(var(--ht-w) - 40px), transparent var(--ht-w));
        mask: radial-gradient(circle at 50% 50%, transparent calc(var(--ht-w) - 110px), #000 calc(var(--ht-w) - 40px), transparent var(--ht-w)); animation: erp-ht-sonar 1.6s cubic-bezier(.3, 0, .2, 1) infinite; }
      .erp-dock .map .ht-load.gone { opacity: 0; }
      @keyframes erp-ht-sonar { from { --ht-w: 0px; } to { --ht-w: 520px; } }
      .erp-dock .map.still .mdot { animation: none; }
      .erp-dock .map .tiles img { filter: invert(1) hue-rotate(180deg) brightness(.78) contrast(.92) saturate(.35); } /* OSM's light map, made dark */
      .erp-dock .map.sat .tiles img, .erp-dock .map.carto .tiles img { filter: none; } .erp-dock .map.sat .tiles img { filter: brightness(.8) saturate(.9); }
      .erp-dock .keyrow { display: flex; gap: 6px; align-items: center; margin: 0 0 8px; font-size: 12px; color: var(--muted); } .erp-dock .keyrow .field { height: 30px; flex: 1; }
      .erp-dock .mdot.pon { box-shadow: 0 0 0 2px var(--bone); }
      .erp-dock .map .basemap { position: absolute; bottom: 20px; right: 8px; z-index: 4; background: rgba(9,11,12,.88); }
      .erp-dock .ponbox { margin: 2px 0 8px; } .erp-dock .ponbox .note { margin: 4px 10px 8px; }
      .erp-dock .ponrow { margin-top: 4px; box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .map .ring { position: absolute; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(233,225,220,.7); pointer-events: none; }
      .erp-dock .map .ring.half { box-shadow: none; border: 1px dashed rgba(233,225,220,.45); }
      .erp-dock .mdot { position: absolute; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; padding: 0; border: 1.5px solid rgba(7,9,11,.9); border-radius: 50%; background: var(--green); cursor: pointer;
        transition: transform .12s var(--out), box-shadow .12s; animation: erp-dock-pop .35s var(--out) backwards; animation-delay: var(--d, 0ms); }
      .erp-dock .mdot.off { background: #a3a4a3; } .erp-dock .mdot.on { background: var(--green); } .erp-dock .mdot.iso { background: rgba(7,9,11,.6); border-color: #8a8b8a; }
      .erp-dock .mdot.los { background: var(--red); } .erp-dock .mdot.pwr { background: #6b6c6b; } .erp-dock .mdot.weak { background: #e0b252; }
      .erp-dock .mdot.los, .erp-dock .mdot.pwr, .erp-dock .mdot.off, .erp-dock .mdot.weak { width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; border: 2px solid rgba(255,255,255,.9); }
      .erp-dock .map .asset { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; background: var(--blue); box-shadow: 0 0 0 1.5px #07090b; pointer-events: none; }
      .erp-dock .map .asset i, .erp-dock .map .fault i { position: absolute; left: 11px; top: -4px; font: 500 10px/1 Inter, system-ui, sans-serif; font-style: normal; color: rgba(170,200,255,.95); white-space: nowrap; text-shadow: 0 1px 2px #000, 0 0 3px #000; }
      .erp-dock .map .fault { position: absolute; width: 32px; height: 32px; margin: -16px 0 0 -16px; border-radius: 50%; border: 2.5px dashed var(--red); pointer-events: none; animation: erp-fault 2s var(--soft) infinite; }
      .erp-dock .map .fault i { left: 50%; top: 36px; transform: translateX(-50%); padding: 3px 6px; border-radius: 4px; background: var(--red); color: #fff; font-weight: 600; font-size: 11px; text-shadow: none; }
      @keyframes erp-fault { 50% { box-shadow: 0 0 0 6px rgba(241,38,20,.18); } }
      .erp-dock .map .ringlbl, .erp-dock .map .melbl, .erp-dock .map .plbl { position: absolute; z-index: 2; pointer-events: none; white-space: nowrap; font: 500 10px/16px Inter, system-ui, sans-serif; }
      .erp-dock .map .ringlbl { transform: translate(-50%, -50%); padding: 0 4px; border-radius: 3px; background: rgba(9,11,12,.85); color: var(--bone); }
      .erp-dock .map .melbl { transform: translate(-50%, 12px); padding: 2px 6px; border-radius: 4px; background: rgba(233,225,220,.95); color: #07090b; font-weight: 600; font-size: 12px; }
      .erp-dock .map .plbl { height: 18px; padding: 1px 6px 1px 7px; border-radius: 4px; background: rgba(9,11,12,.9); color: var(--paper); font-size: 11px; box-shadow: inset 2.5px 0 0 var(--k, #a3a4a3); }
      .erp-dock .map .plbl.los { --k: var(--red); } .erp-dock .map .plbl.pwr { --k: #6b6c6b; } .erp-dock .map .plbl.weak { --k: #e0b252; }
      .erp-dock .map .brief { position: absolute; z-index: 3; top: 8px; left: 8px; right: 44px; padding: 7px 10px; border-radius: 6px; background: rgba(9,11,12,.92); box-shadow: inset 0 0 0 1px var(--hair); pointer-events: none; }
      .erp-dock .map .brief .bt { display: flex; align-items: center; gap: 8px; color: var(--paper); font-weight: 600; font-size: 13px; }
      .erp-dock .map .brief .lv { padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: #07090b; }
      .erp-dock .map .brief .lv.high { background: var(--red); color: #fff; } .erp-dock .map .brief .lv.mid { background: #e0b252; } .erp-dock .map .brief .lv.low { background: #a3a4a3; } .erp-dock .map .brief .lv.ok { background: var(--green); }
      .erp-dock .map .brief .bs, .erp-dock .map .brief .bf { margin-top: 2px; font-size: 11px; color: var(--body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .erp-dock .map .brief .bf { color: #ff8a7a; font-weight: 500; }
      .erp-dock .map .zoom button.bm { font-size: 10px; font-weight: 600; }
      .erp-dock .map .foot { position: absolute; z-index: 3; left: 8px; right: 8px; bottom: 16px; padding: 5px 8px; border-radius: 6px; background: rgba(9,11,12,.88); pointer-events: none; font-size: 11px; color: var(--bone); }
      .erp-dock .map .scale { display: flex; align-items: center; gap: 6px; } .erp-dock .map .scale i { height: 6px; border: 1.5px solid var(--bone); border-top: 0; }
      .erp-dock .map .legend { display: flex; flex-wrap: wrap; gap: 2px 8px; margin-top: 3px; } .erp-dock .map .legend span { display: inline-flex; align-items: center; gap: 4px; }
      .erp-dock .map .legend .k { width: 8px; height: 8px; border-radius: 50%; } .erp-dock .map .legend .k.los { background: var(--red); } .erp-dock .map .legend .k.pwr { background: #6b6c6b; } .erp-dock .map .legend .k.off { background: #a3a4a3; }
      .erp-dock .map .legend .k.weak { background: #e0b252; } .erp-dock .map .legend .k.on { background: var(--green); } .erp-dock .map .legend .k.iso { box-shadow: inset 0 0 0 1.5px #8a8b8a; }
      .erp-dock .map .legend .k.box { border-radius: 0; background: var(--blue); } .erp-dock .map .legend .k.fault { border: 1.5px dashed var(--red); width: 9px; height: 9px; }
      .erp-dock .map .sharesheet { position: absolute; z-index: 5; left: 50%; bottom: 76px; transform: translateX(-50%); display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; justify-content: center; width: max-content; max-width: calc(100% - 24px);
        padding: 8px 10px; border-radius: 8px; background: var(--card); color: var(--paper); font-size: 12px; box-shadow: inset 0 0 0 1px var(--edge), 0 8px 20px rgba(0,0,0,.5); cursor: default; }
      .erp-dock .map .sharesheet > span:last-child { display: flex; gap: 6px; }
      .erp-dock .mdot:hover, .erp-dock .mdot.hl { transform: scale(1.6); z-index: 2; box-shadow: 0 0 0 3px rgba(233,225,220,.75); }
      .erp-dock .mdot.me { width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px; background: var(--bone); border: 2.5px solid var(--canvas); box-shadow: 0 0 0 2px var(--bone); pointer-events: none; animation: none; z-index: 1; }
      @keyframes erp-dock-pop { from { transform: scale(0); opacity: 0; } }
      .erp-dock .map .tip { position: absolute; z-index: 3; transform: translate(-50%, calc(-100% - 12px)); max-width: 80%; padding: 4px 8px; border-radius: 6px; background: var(--card);
        color: var(--paper); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; box-shadow: inset 0 0 0 1px var(--edge), 0 4px 10px rgba(0,0,0,.4); }
      .erp-dock .map .tip.low { transform: translate(-50%, 14px); }
      .erp-dock .map .zoom { position: absolute; top: 8px; right: 8px; z-index: 4; display: grid; gap: 4px; }
      .erp-dock .map .zoom button { width: 28px; height: 28px; border: 0; border-radius: 6px; background: rgba(9,11,12,.88); color: var(--paper); font: 500 16px/1 Inter, system-ui, sans-serif; cursor: pointer; box-shadow: inset 0 0 0 1px var(--edge); }
      .erp-dock .map .zoom button:hover { box-shadow: inset 0 0 0 1px #696a68; } .erp-dock .map .zoom button:disabled { opacity: .4; cursor: default; }
      .erp-dock.erp-dock-full { inset: 0; width: auto; max-height: none; border-radius: 0; box-shadow: none; z-index: 2147483003; animation: erp-ht-open-full .55s var(--out) both; }
      .erp-dock-full .map.full { position: absolute; inset: 0; height: auto; margin: 0; border-radius: 0; }
      .erp-dock .map.full .mdot { width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; }
      .erp-dock .map .attr { position: absolute; right: 8px; bottom: 2px; font-size: 9px; color: rgba(255,255,255,.75); text-shadow: 0 1px 2px #000; pointer-events: none; }
      .erp-dock .counts span { display: inline-flex; align-items: center; gap: 6px; } .erp-dock .counts .dot { width: 8px; height: 8px; }
      .erp-dock .counts { display: flex; gap: 12px; font-size: 13px; } .erp-dock .counts b { color: var(--paper); font-weight: 500; }
      .erp-dock .rise { animation: erp-ht-wipe .46s var(--soft) both; animation-delay: calc(var(--i, 0) * 35ms); }
      .erp-dock .rise:not(.ht-done) {
        mask: linear-gradient(90deg, #000 calc(var(--ht-p) - 22%), transparent calc(var(--ht-p) - 22% + 1px)) 0 0 / 100% 100% no-repeat,
          radial-gradient(circle, #000 1.4px, transparent 2px) 0 0 / 5px 5px,
          linear-gradient(90deg, #000 calc(var(--ht-p) - 2%), transparent var(--ht-p)) 0 0 / 100% 100% no-repeat;
        mask-composite: add, intersect; }
      @keyframes erp-ht-wipe { from { --ht-p: 0%; transform: translateY(4px); } to { --ht-p: 124%; transform: none; } }
      .erp-dock .note.ld::before { content: ""; display: inline-block; vertical-align: -1px; width: 31px; height: 9px; margin-right: 8px;
        background: radial-gradient(circle, var(--bone) 0 1.2px, transparent 1.7px) 0 0 / 5px 5px;
        mask: linear-gradient(90deg, rgba(0,0,0,.18) calc(var(--ht-p) - 70%), #000 calc(var(--ht-p) - 35%), rgba(0,0,0,.18) var(--ht-p)); animation: erp-ht-scan 1.2s cubic-bezier(.45, 0, .55, 1) infinite; }
      @keyframes erp-ht-scan { from { --ht-p: 0%; } to { --ht-p: 170%; } }

      .erp-dock .foot { padding: 8px 14px; border-top: 1px solid var(--hair); font-size: 12px; color: var(--muted); display: flex; gap: 10px; flex-wrap: wrap; }
      /* Bulk Lunas */
      .erp-dock.wide { width: min(580px, calc(100vw - 32px)); max-height: min(780px, calc(100vh - 120px)); }
      .erp-dock .bulk { padding: 0 6px; }
      .erp-dock .bulk .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .erp-dock .field { width: 100%; box-sizing: border-box; height: 36px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--canvas); color: var(--paper);
        font: inherit; font-size: 13px; box-shadow: inset 0 0 0 1px var(--edge); outline: 0; color-scheme: dark; }
      .erp-dock textarea.field { height: auto; min-height: 92px; padding: 8px 10px; resize: vertical; font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; }
      .erp-dock .field:focus { box-shadow: inset 0 0 0 1px #696a68, 0 0 0 2px var(--blue); }
      .erp-dock .field:disabled { opacity: .5; }
      .erp-dock .lbl { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
      .erp-dock .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .erp-dock .brow { margin-top: 6px; padding: 10px 12px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .brow.off { opacity: .6; }
      .erp-dock .brow .h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
      .erp-dock .brow .h b { min-width: 0; font-weight: 500; color: var(--paper); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .erp-dock .brow .h .mono { color: var(--muted); flex: none; }
      .erp-dock .brow .sub { font-size: 12px; color: var(--muted); }
      .erp-dock .mrow { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; margin-top: 8px; font-size: 13px; color: var(--paper); cursor: pointer; }
      .erp-dock .mrow input { width: 16px; height: 16px; margin: 0; accent-color: var(--bone); cursor: pointer; }
      .erp-dock .mrow .mono { color: var(--body); }
      .erp-dock .skipold { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 10px; align-items: start; margin-top: 12px; padding: 8px 10px; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--hair); font-size: 13px; color: var(--paper); cursor: pointer; }
      .erp-dock .skipold input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--bone); cursor: pointer; } .erp-dock .skipold .sub { display: block; margin-top: 2px; font-size: 12px; color: var(--muted); }
      .erp-dock .mrow .x { grid-column: 2 / 4; display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: var(--muted); }
      .erp-dock .mrow .x label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; } .erp-dock .mrow .x input { width: 13px; height: 13px; }
      .erp-dock .late, .erp-dock .brow .late { color: #ff6a5c; } .erp-dock .good, .erp-dock .brow .good { color: var(--green); } .erp-dock .warn, .erp-dock .brow .warn, .erp-dock .brow .h .warn { color: #e0b252; }
      .erp-dock .picks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; } .erp-dock .picks .btn { height: 28px; font: 12px "JetBrains Mono", ui-monospace, monospace; }
      .erp-dock .bform { display: grid; gap: 8px; margin-top: 10px; } .erp-dock .bform:empty { display: none; }
      .erp-dock .bpay { position: sticky; bottom: -10px; display: grid; gap: 8px; margin: 10px -6px -10px; padding: 10px 12px 12px; border-top: 1px solid var(--hair); background: var(--card); }
      .erp-dock .sum { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; } .erp-dock .sum b { color: var(--paper); font-weight: 500; }
      .erp-dock .btn.wide { width: 100%; height: 40px; justify-content: center; }
      .erp-dock .btn.arm { background: var(--green); color: var(--canvas); box-shadow: 0 1px 3px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.35); }
      .erp-dock .btn:disabled { opacity: .45; cursor: default; }
      .erp-dock .bar { height: 2px; border-radius: 2px; background: var(--hair); overflow: hidden; } .erp-dock .bar i { display: block; height: 100%; background: var(--bone); transition: width .3s var(--out); }
      /* Outage radar */
      .erp-dock-fab.alert::after { content: ""; position: absolute; top: 7px; right: 7px; width: 9px; height: 9px; border-radius: 50%; background: var(--red);
        box-shadow: 0 0 0 2px var(--card); animation: erp-dock-ping 1.6s var(--soft) infinite; }
      @keyframes erp-dock-ping { 50% { box-shadow: 0 0 0 2px var(--card), 0 0 0 7px rgba(241,38,20,0); } 0% { box-shadow: 0 0 0 2px var(--card), 0 0 0 0 rgba(241,38,20,.5); } }
      .erp-dock .rhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px; }
      .erp-dock .rhead .tools { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
      .erp-dock .rhead .btn { height: 28px; font-size: 12px; }
      .erp-dock .ralert { display: grid; gap: 2px; width: calc(100% - 8px); margin: 6px 4px; padding: 10px 12px; border: 0; border-radius: 8px; text-align: left; cursor: pointer; font: inherit;
        background: rgba(241,38,20,.08); box-shadow: inset 0 0 0 1px rgba(241,38,20,.45); color: var(--paper); }
      .erp-dock .ralert.drop { background: rgba(224,178,82,.07); box-shadow: inset 0 0 0 1px rgba(224,178,82,.4); }
      .erp-dock .ralert.item { grid-template-columns: minmax(0, 1fr); align-items: start; } /* one column, not the row's dot | text | number */
      .erp-dock .ralert b { font-weight: 500; } .erp-dock .ralert span { font-size: 12px; color: var(--body); }
      .erp-dock .ralert:hover, .erp-dock .ralert[aria-selected="true"] { box-shadow: inset 0 0 0 1px #ff6a5c; }
      .erp-dock .rok { margin: 6px 4px; padding: 10px 12px; border-radius: 8px; background: rgba(85,188,130,.06); box-shadow: inset 0 0 0 1px rgba(85,188,130,.3); font-size: 13px; color: var(--paper); }
      .erp-dock .rrow { grid-template-columns: 18px minmax(0, 1fr) 72px 92px; }
      .erp-dock .rrow canvas, .erp-dock canvas.spark { width: 72px; height: 22px; margin: 0; }
      .erp-dock .rrow .n { text-align: right; font-size: 13px; color: var(--paper); font-variant-numeric: tabular-nums; }
      .erp-dock .rrow .n small { display: block; font-size: 11px; color: var(--muted); }
      .erp-dock .rrow .n small.late { color: #ff6a5c; } .erp-dock .rrow .n small.warn { color: #e0b252; }
      .erp-dock .dot.drop { background: #e0b252; } .erp-dock .dot.down { background: var(--red); box-shadow: 0 0 0 3px rgba(241,38,20,.18); } .erp-dock .dot.ok { background: var(--green); }
      .erp-dock .dot.silent { background: transparent; box-shadow: inset 0 0 0 1px var(--muted); }
      .erp-dock canvas.big { width: 100%; height: 96px; margin: 6px 0 2px; }
      .erp-dock .ticks { display: flex; justify-content: space-between; font: 11px "JetBrains Mono", ui-monospace, monospace; color: var(--muted); }
      .erp-dock .techs { margin: 0 4px 12px; display: grid; gap: 6px; }
      .erp-dock .techs .team { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; align-items: baseline; font-size: 13px; }
      .erp-dock .techs .team b { font-weight: 500; color: var(--paper); } .erp-dock .techs .team .sub { grid-column: 2; font-size: 12px; color: var(--muted); }
      .erp-dock .tag { align-self: start; white-space: nowrap; font-size: 11px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,.06); color: var(--body); }
      .erp-dock .tag.k-field { color: var(--green); background: rgba(85,188,130,.1); } .erp-dock .tag.k-area { color: #e0b252; background: rgba(224,178,82,.1); }
      .erp-dock .pw.msg { white-space: pre-wrap; font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; display: block; }
      .erp-dock .report .actions { margin: 8px 0 0; }
      .erp-dock .hrow { cursor: default; } .erp-dock .hrow:hover { background: none; }
      .erp-dock .desa { grid-template-columns: minmax(0, 1fr) 120px auto; } .erp-dock .desa .s { grid-column: 1 / -1; }
      .erp-dock .meter { height: 4px; border-radius: 2px; background: var(--hair); overflow: hidden; } .erp-dock .meter i { display: block; height: 100%; background: #ff6a5c; }
      /* Modem */
      .erp-dock .modem .facts { margin: 10px 0; }
      .erp-dock .modem .actions { margin: 4px 0 0; }
      .erp-dock .modem form { display: grid; gap: 8px; margin-top: 10px; }
      .erp-dock .pw { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: var(--raised); color: var(--paper); font: 13px "JetBrains Mono", ui-monospace, monospace; }
      .erp-dock .pw span { flex: 1; overflow-wrap: anywhere; }
      .erp-dock .rx { font-variant-numeric: tabular-nums; }
      .erp-dock .webbox .facts { margin: 8px 0; } .erp-dock .webbox .note { margin: 6px 0; } .erp-dock .webbox .note a { color: var(--paper); overflow-wrap: anywhere; }
      .erp-dock .note.warn { color: #e0b252; }
      @media (max-width: 760px) { .erp-dock .row2 { grid-template-columns: 1fr; } .erp-dock .mrow { min-height: 36px; } }
      @media (max-width: 760px) { .erp-dock .top kbd { display: none; } .erp-dock .shut { width: 40px; height: 40px; } .erp-dock .item { min-height: 44px; } .erp-dock { left: 8px !important; right: 8px !important; width: auto; bottom: 8px !important; top: auto !important; max-height: 80vh; transform-origin: bottom center; } }
      @media (prefers-reduced-motion: reduce) { .erp-dock, .erp-dock *, .erp-dock-fab, .erp-dock-fab * { animation: none !important; transition: none !important; } }`;
    const svg = (d, cls = "") => { const n = "http://www.w3.org/2000/svg", s = document.createElementNS(n, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none");
      s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.5"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
      if (cls) s.setAttribute("class", cls); const p = document.createElementNS(n, "path"); p.setAttribute("d", d); s.append(p); return s; };
    const ICON = { rook: "M4.56 2.00L8.14 2.00L8.14 4.03L10.27 4.03L10.27 2.00L13.65 2.00L13.65 4.03L15.94 4.03L15.94 2.00L19.49 2.00L19.49 5.77L9.75 12.08L9.75 15.38L5.91 17.84L7.62 16.68L7.62 10.44L8.71 9.32L4.56 5.64ZM15.42 9.74L16.45 10.44L16.45 16.03L19.57 19.40L19.57 22.00L4.43 22.00L4.43 19.45L5.91 19.45L11.44 15.64L11.44 12.08Z", dock: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 17h6M17 14v6", x: "M6 6l12 12M18 6 6 18", search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4", page: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4", go: "M5 12h14M13 6l6 6-6 6" };

    function place() {
      if (!fab) return;
      // just above the site's own round button in the corner (Iris), or in the corner if there isn't one
      // (only the site's fixed-position elements are looked at, and the one found is remembered: some pages are huge)
      if (!corner?.isConnected) corner = [...document.querySelectorAll(".fixed")].find((e) => !e.closest(".erp-dock") && e.offsetWidth >= 44 && e.offsetWidth <= 72 && e.offsetHeight <= 72
        && e.getBoundingClientRect().right > innerWidth - 120 && e.getBoundingClientRect().bottom > innerHeight - 260) || null;
      const other = corner;
      const r = other?.getBoundingClientRect();
      const right = r ? Math.max(12, innerWidth - r.right + (r.width - 48) / 2) : 24, bottom = r ? innerHeight - r.top + 12 : 24;
      fab.style.right = `${right}px`; fab.style.bottom = `${bottom}px`;
      if (panel) { panel.style.right = `${right}px`; panel.style.bottom = `${bottom + 60}px`; }
    }
    function mount() {
      if (fab?.isConnected) return;
      if (!document.getElementById("erp-dock-css")) { const s = el("style"); s.id = "erp-dock-css"; s.textContent = css; document.head.append(s); }
      fab = el("button", "erp-dock-fab"); fab.type = "button"; fab.title = "Dock (Alt+K)"; fab.setAttribute("aria-label", "Open the Dock"); fab.setAttribute("aria-expanded", "false");
      const mark = svg(ICON.rook, "open"); mark.setAttribute("fill", "currentColor"); mark.setAttribute("stroke", "none"); // the rook, cracked in two
      fab.append(mark, svg(ICON.x, "x")); fab.onclick = () => (panel ? close() : open());
      document.body.append(fab); place();
    }
    async function open() {
      if (panel) return;
      panel = el("div", "erp-dock"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Dock");
      document.body.append(panel); fab.setAttribute("aria-expanded", "true"); place();
      if (calm()) panel.classList.add("ht-done"); // no motion: no mask either
      { const a = fab.getBoundingClientRect(), b = panel.getBoundingClientRect(); // the halftone wave starts at the Dock button
        panel.style.setProperty("--ox", `${a.left + a.width / 2 - b.left}px`); panel.style.setProperty("--oy", `${a.top + a.height / 2 - b.top}px`); }
      view = { q: "", sel: 0, card: null, radius: view.radius, mode: bulk && bulk.phase !== "input" ? "bulk" : null }; // a bulk run in progress comes back; an outage only marks the Outage radar row
      draw(); panel.querySelector("input")?.focus();
      await data(); draw();
    }
    // a halftone reveal has finished: drop its mask (see .ht-done)
    document.addEventListener("animationend", (e) => { if (/^erp-ht-(open|open-full|wipe)$/.test(e.animationName) && e.target.closest?.(".erp-dock")) e.target.classList.add("ht-done"); }, true);
    function close() {
      const p = panel; if (!p) return;
      panel = null; fab?.setAttribute("aria-expanded", "false"); dropFull();
      if (calm()) p.remove(); else { p.classList.add("out"); setTimeout(() => p.remove(), 230); }
    }
    const remember = (r) => { const list = ls.get(RECENT, []).filter((u) => u !== r.username); list.unshift(r.username); ls.set(RECENT, list.slice(0, 8)); };
    const copy = (text, btn) => { navigator.clipboard?.writeText(text).then(() => { const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = t), 1200); }).catch(() => {}); };
    const wa = (phone) => { let d = String(phone ?? "").replace(/\D/g, ""); if (d.startsWith("0")) d = "62" + d.slice(1); return d.length >= 9 ? `https://wa.me/${d}` : null; };
    const ago = (t) => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
    const k = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1).replace(".", ",")}k` : n.toLocaleString("id-ID"));

    function custItem(r, i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(el("span", `dot ${state(r)}`), el("span", "t", r.nama || r.username), el("span", "r", r.username), el("span", "s", [r.paket, r.desa, r.router].filter(Boolean).join(" · ")));
      b.onclick = () => { view.card = r; view.sel = 0; remember(r); draw(); };
      return b;
    }
    function toolItem(i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(svg("M9 11l3 3 8-8M4 6h5M4 12h3M4 18h9"), el("span", "t", "Bulk Lunas"), el("span", "r", "paste a list"), el("span", "s", "Paste usernames, check each one's unpaid months, mark them paid"));
      b.onclick = () => openBulk(); return b;
    }
    function pageItem(p, i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(svg(ICON.page), el("span", "t", p.t), el("span", "r", p.h)); b.onclick = () => go(p.h); return b;
    }

    // ---- Bulk Lunas: paste usernames, check each one's unpaid months, mark them paid ----
    // The same request as the ERP's own Tandai Lunas Manual: one invoice at a time, oldest first, with its RADIUS recharge
    // and the server's oldest-first rule. Nothing is sent until you press the button twice.
    const METHODS = ["Tunai", "Transfer Bank", "Setor Reseller", "Setor Teknisi"];
    const UNPAID = new Set(["Belum Lunas", "Jatuh Tempo"]);
    const todayIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
    let bulk = null;
    // a fresh sign-in token: Firebase's own copy while it's valid, else the last one the page used
    async function token() {
      try {
        const db = await new Promise((ok, no) => { const q = indexedDB.open("firebaseLocalStorageDb"); q.onupgradeneeded = () => q.transaction.abort(); q.onsuccess = () => ok(q.result); q.onerror = no; });
        const all = await new Promise((ok, no) => { const q = db.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll(); q.onsuccess = () => ok(q.result); q.onerror = no; });
        db.close();
        const t = all.map((x) => x.value?.stsTokenManager).find((m) => m?.accessToken && m.expirationTime > Date.now() + 60000);
        if (t) return `Bearer ${t.accessToken}`;
      } catch {}
      return lastAuth;
    }
    async function api(path, body) {
      const auth = await token(); if (!auth) throw new Error("Not signed in yet: let the page load, then try again");
      const r = await realFetch(path, body ? { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { authorization: auth } });
      const text = await r.text().catch(() => ""); let j = {};
      try { j = text ? JSON.parse(text) : {}; } catch { /* not JSON: a gateway error page or a crash */ }
      if (!r.ok || j.success === false) {
        const page = /<title>([^<]*)<\/title>/i.exec(text)?.[1].replace(/\s*\|\s*/g, ": ").trim(); // an HTML error page (Cloudflare): its title says enough
        const said = j.error || j.message || j.alasan || j.pesan || page || text.replace(/\s+/g, " ").trim().slice(0, 160);
        throw new Error(`${said || "no reason given"} (HTTP ${r.status}${r.status >= 500 ? ", on the ERP server's side" : ""})`);
      }
      return j;
    }
    const newBulk = () => ({ phase: "input", rows: [], method: METHODS[0], date: todayIso(), note: "", defaultNote: "Bulk Lunas (Dock)", armed: 0, stop: false, el: null });
    function openBulk(text) {
      if (!bulk || (bulk.phase !== "paying" && text)) bulk = newBulk();
      view.mode = "bulk"; view.card = null; drawBody();
      const ta = bulk.el.querySelector("textarea");
      if (text) { ta.value = text.trim(); find(); } else if (bulk.phase === "input") ta.focus();
    }
    async function find() {
      const lines = bulk.el.querySelector("textarea").value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
      const seen = new Set(); bulk.rows = [];
      for (const t of lines) { const k = t.toLowerCase(); if (seen.has(k)) continue; seen.add(k); bulk.rows.push({ token: t, state: "looking", invs: [] }); }
      if (!bulk.rows.length) return;
      bulk.phase = "looking"; bulk.armed = 0; bulkDraw();
      const queue = [...bulk.rows];
      await Promise.all([0, 1, 2, 3, 4].map(async () => { while (queue.length) await lookup(queue.shift()); }));
      // one customer listed twice: keep the first
      const users = new Set();
      for (const r of bulk.rows) if (r.state === "found") { if (users.has(r.user)) { r.state = "dupe"; r.invs = []; } else users.add(r.user); }
      await radius(bulk.rows.flatMap((r) => r.invs));
      bulk.phase = "review"; bulkDraw();
    }
    async function lookup(row) {
      row.state = "looking"; row.err = "";
      try {
        // every month of that customer in one request (with month=all the server ignores the year); ~3 s each
        const q = row.pick || row.token, low = q.toLowerCase();
        const get = (text) => api(`/api/finance/invoices/list?month=all&year=${new Date().getFullYear()}&page=1&pageSize=200&q=${encodeURIComponent(text)}`).then((j) => j.invoices || []);
        const all = [...new Map((await get(q)).map((v) => [v.invoiceNumber, v])).values()];
        const mine = all.filter((v) => String(v.radiusUsername || "").toLowerCase() === low);
        if (!mine.length && !row.pick) {
          // not an exact username: one that starts with it (yudianto0904 → yudianto0904a) is taken but left unticked;
          // otherwise look the name up (liani0904 → "liani") and offer the closest, same area code first
          const starts = [...new Set(all.map((v) => v.radiusUsername).filter((u) => u && u.toLowerCase().startsWith(low)))];
          if (starts.length === 1) { row.pick = starts[0]; row.guess = true; return await lookup(row); }
          let cands = starts;
          if (!cands.length) {
            const letters = low.replace(/[^a-z]+/g, ""), tail = low.match(/\d+[a-z]?$/)?.[0] ?? "";
            const near = letters.length >= 3 ? await get(letters) : [], score = new Map();
            for (const v of near) { const u = String(v.radiusUsername || ""); if (!u) continue;
              const n = (tail && u.toLowerCase().endsWith(tail.replace(/[a-z]$/, "")) || u.toLowerCase().replace(/[a-z]$/, "").endsWith(tail) ? 2 : 0)
                + (u.toLowerCase().startsWith(letters.slice(0, 4)) ? 1 : 0) + (fold(v.customerName).split(" ").some((w) => w === letters || (letters.length >= 5 && w.startsWith(letters.slice(0, -1)))) ? 1 : 0);
              if (n >= 2) score.set(u, Math.max(score.get(u) ?? 0, n)); }
            cands = [...score].sort((a, b) => b[1] - a[1]).map(([u]) => u);
            for (const r of findCustomers(q, 3)) if (!cands.includes(r.username)) cands.push(r.username);
          }
          row.state = cands.length ? "pick" : "none"; row.cands = cands.slice(0, 6); return;
        }
        if (!mine.length) { row.state = "none"; return; }
        mine.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        const last = mine[mine.length - 1];
        row.user = last.radiusUsername; row.name = last.customerName; row.where = [last.desa, last.paket].filter(Boolean).join(" · ");
        row.paidTo = [...mine].reverse().find((v) => v.status === "Lunas")?.period || "";
        row.invs = mine.filter((v) => UNPAID.has(v.status)).map((v, i) => ({ no: v.invoiceNumber, period: v.period, amount: Number(v.amount) || 0, status: v.status,
          hutang: v.dihutangiSampai || "", on: i === 0 && !row.guess, recharge: false, radius: null, result: null }));
        row.state = "found";
      } catch (e) { row.state = "error"; row.err = e.message; }
      finally { bulkDraw(); }
    }
    // what paying would do in RADIUS (the ERP's own preview): recharge on where it can and isn't already covered
    async function radius(invs) {
      for (let i = 0; i < invs.length; i += 20) {
        const part = invs.slice(i, i + 20);
        try {
          const j = await api("/api/finance/invoices/mark-paid-radius-preview", { invoiceNumbers: part.map((v) => v.no) });
          for (const it of j.items || []) { const v = part.find((x) => x.no === it.invoiceNumber); if (v) { v.radius = it; v.recharge = !!it.canRecharge && !it.alreadyCovered; } }
        } catch { for (const v of part) v.radius = { failed: true }; }
      }
    }
    // ticking a month ticks the older ones too (the server pays oldest first); unticking clears the newer ones. With
    // "skip older months" on, each month is ticked on its own.
    function tickMonth(row, i, on, st, redraw) { row.invs.forEach((v, j) => { if (st.skipOlder ? j === i : on ? j <= i : j >= i) v.on = on; }); st.armed = 0; redraw(); }
    // The ERP's own exception to oldest-first (Finance → Invoices, "Lunasi walau ada tagihan lebih tua"): for a customer
    // who pays only this month (away, didn't use the internet). The older months stay unpaid; the server wants a note of
    // 10+ letters and logs it as [OVERRIDE tertua-dulu]; only finance manager / admin / super admin may.
    const SKIP_ROLES = ["super_admin", "admin", "finance_manager"];
    const myRole = () => { try { return String(JSON.parse(localStorage.getItem("user") || "{}").role || ""); } catch { return ""; } };
    const chosen = () => bulk.rows.filter((r) => r.state === "found").flatMap((r) => r.invs.filter((v) => v.on && !v.result?.ok).map((v) => [r, v]));
    const pay = () => payQueue(chosen(), bulk, bulkDraw, "Bulk Lunas (Dock)");
    // pays a list of [row, invoice], one request each in order; st holds the method, date, note and progress
    async function payQueue(queue, st, redraw, defaultNote) {
      if (!queue.length) return;
      st.phase = "paying"; st.stop = false; st.armed = 0; st.done = 0; st.total = queue.length; redraw();
      payingNow++;
      try { for (const [row, v] of queue) {
        if (st.stop) break;
        v.result = { busy: true }; redraw();
        try {
          const j = await api("/api/finance/invoices/bulk-mark-paid", { invoiceNumbers: [v.no], paymentMethod: st.method, notes: st.note.trim() || defaultNote,
            paymentDate: st.date || undefined, rechargeMap: v.recharge ? { [v.no]: true } : {}, ...(st.override ? { lunasiWalauAdaTertua: true } : {}) });
          const sum = j.summary || {}, older = (j.tertuaDulu || [])[0], waiting = (j.results || []).find((x) => x?.belumDiproses), failed = (j.rechargeGagal || [])[0];
          const skip = (j.results || []).find((x) => x?.status === "skip" || x?.status === "error");
          if (sum.marked) row.paidTo = v.period || row.paidTo;
          v.result = sum.marked ? { ok: true, text: sum.recharged ? "Lunas · recharged" : "Lunas", warn: failed ? `RADIUS recharge failed: ${failed.reason}` : "" }
            : older ? { text: `Skipped: ${older.reason}` } : waiting ? { text: "Not processed yet (server restarting): try again" } : { text: `Skipped${skip?.reason ? `: ${skip.reason}` : ""}` };
        } catch (e) {
          // the request failed, but the server may have saved it anyway (a deploy restarting it mid-request):
          // ask the ERP what the invoice says now, so a retry can't pay it twice
          v.result = { busy: true }; redraw();
          const now = await settled(v.no);
          if (now === "Lunas") { row.paidTo = v.period || row.paidTo; v.result = { ok: true, text: "Lunas (saved, though the answer was lost)" }; }
          else v.result = { text: `${e.message || "Failed"} · ${now ? `checked: still ${now}, safe to try again` : "couldn't check: look at the invoice before trying again"}` };
        }
        st.done++; redraw();
      } } finally { payingNow--; }
      st.phase = "done"; redraw();
    }
    // an invoice's status straight from the ERP, retried a few times while the server comes back
    async function settled(no) {
      for (let i = 0; i < 4; i++) {
        await new Promise((ok) => setTimeout(ok, 2500 + i * 2500));
        try {
          const j = await api(`/api/finance/invoices/list?month=all&year=${new Date().getFullYear()}&page=1&pageSize=20&q=${encodeURIComponent(no)}`);
          const v = (j.invoices || []).find((x) => x.invoiceNumber === no); if (v) return v.status;
        } catch {}
      }
      return null;
    }
    // a customer's unpaid months, each with its RADIUS recharge and, once paid, the result
    function monthRows(r, key, busy, st, redraw) {
      return r.invs.map((v, i) => {
        const m = el("label", "mrow"), cb = el("input"); cb.type = "checkbox"; cb.checked = v.on; cb.disabled = busy || v.result?.ok; cb.dataset.k = `${key}-${i}`;
        cb.onchange = () => tickMonth(r, i, cb.checked, st, redraw);
        const t = el("span"); t.append(v.period || v.no, " ", el("span", v.status === "Jatuh Tempo" ? "late" : "sub", v.status === "Jatuh Tempo" ? "· overdue" : ""));
        m.append(cb, t, el("span", "mono", rupiah(v.amount)));
        const x = el("span", "x");
        if (v.radius?.canRecharge) {
          const l = el("label"), rc = el("input"); rc.type = "checkbox"; rc.checked = v.recharge; rc.disabled = busy || v.result?.ok; rc.dataset.k = `${key}-${i}-r`;
          rc.onchange = () => { v.recharge = rc.checked; st.armed = 0; redraw(); }; rc.onclick = (ev) => ev.stopPropagation();
          l.append(rc, v.radius.alreadyCovered ? "recharge (already covered)" : `recharge RADIUS (expires ${v.radius.expiryDate || "?"})`); x.append(l);
        } else if (v.radius) x.append(el("span", null, v.radius.failed ? "RADIUS preview failed: pays without recharge" : "no RADIUS account linked"));
        if (v.hutang) x.append(el("span", "warn", `promised to pay by ${String(v.hutang).slice(0, 10)}`));
        if (v.result?.busy) x.append(el("span", null, "Paying…"));
        else if (v.result) { x.append(el("span", v.result.ok ? "good" : "late", v.result.text)); if (v.result.warn) x.append(el("span", "warn", v.result.warn)); }
        m.append(x); return m;
      });
    }
    // method, payment date and note
    function payFields(st, busy, key, redraw) {
      const method = el("select", "field"); method.disabled = busy; method.dataset.k = `${key}method`;
      for (const m of METHODS) { const o = el("option", null, m); o.value = m; o.selected = m === st.method; method.append(o); }
      method.onchange = () => { st.method = method.value; st.armed = 0; redraw(); };
      const date = el("input", "field"); date.type = "date"; date.value = st.date; date.max = todayIso(); date.disabled = busy; date.dataset.k = `${key}date`;
      date.onchange = () => { st.date = date.value; st.armed = 0; redraw(); };
      const note = el("input", "field"); note.placeholder = st.defaultNote; note.value = st.note; note.disabled = busy; note.dataset.k = `${key}note`;
      note.oninput = () => { st.note = note.value; st.armed = 0; st.onNote?.(); };
      const lab = (t, f) => { const l = el("label", "lbl"); l.append(t, f); return l; };
      const two = el("div", "row2"); two.append(lab("Method", method), lab("Payment date", date));
      return [two, lab("Note", note)];
    }
    // press once to arm (5 s), again to pay
    function armButton(st, label, armedLabel, onPay, redraw, key) {
      const armed = st.armed > Date.now();
      const btn = el("button", `btn wide ${armed ? "arm" : "primary"}`, armed ? armedLabel : label); btn.type = "button"; btn.dataset.k = key;
      btn.onclick = () => { if (st.armed > Date.now()) onPay(); else { st.armed = Date.now() + 5000; redraw(); setTimeout(() => { if (st.armed && st.armed <= Date.now()) { st.armed = 0; redraw(); } }, 5100); } };
      return btn;
    }
    // ---- Pay from the customer card ----
    const bills = new Map(); // username → { row, st, el }
    function payBox(r) {
      let b = bills.get(r.username);
      if (!b || (b.st.phase !== "paying" && Date.now() - b.at > 60000)) { // a minute old: ask again
        b = { at: Date.now(), row: { token: r.username, pick: r.username, state: "looking", invs: [] },
          st: { method: METHODS[0], date: todayIso(), note: "", defaultNote: "Lunas (Dock)", phase: "looking", armed: 0 }, el: el("div", "near bill rise") };
        b.el.style.setProperty("--i", "2"); bills.set(r.username, b);
        const load = async () => { b.row.state = "looking"; b.st.phase = "looking"; billDraw(b); await lookup(b.row); await radius(b.row.invs); b.st.phase = "review"; billDraw(b); };
        b.load = load; load();
      }
      return b.el;
    }
    function billDraw(b) {
      const { row, st } = b, focus = document.activeElement?.dataset?.k, busy = st.phase !== "review" && st.phase !== "done", redraw = () => billDraw(b);
      const open = row.invs.filter((v) => !v.result?.ok), ch = open.filter((v) => v.on), total = ch.reduce((a, v) => a + v.amount, 0);
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "0"; e.append("Pay");
      head.append(e, el("span", "sub", row.state === "found" ? (open.length ? `${open.length} unpaid · ${rupiah(open.reduce((a, v) => a + v.amount, 0))}` : `Nothing unpaid${row.paidTo ? ` · paid to ${row.paidTo}` : ""}`) : ""));
      const parts = [head];
      if (row.state === "looking") parts.push(el("p", "note ld", "Loading this customer's bills…"));
      else if (row.state === "error") { parts.push(el("p", "note late", row.err)); const again = el("button", "btn", "Try again"); again.type = "button"; again.onclick = () => b.load(); parts.push(again); }
      else if (row.state !== "found") parts.push(el("p", "note", "No invoices for this username."));
      else {
        parts.push(...monthRows(row, `c${row.user}`, busy, st, redraw));
        if (open.length) {
          if (open.length > 1 || st.skipOlder) {
            const role = myRole(), may = !role || SKIP_ROLES.includes(role), sk = el("label", "skipold"), cb = el("input"); cb.type = "checkbox"; cb.checked = !!st.skipOlder;
            cb.disabled = busy || !may; cb.dataset.k = `c${row.user}skip`;
            cb.onchange = () => { st.skipOlder = cb.checked; st.armed = 0;
              if (!cb.checked) { const top = open.map((v) => row.invs.indexOf(v)).filter((j) => row.invs[j].on).pop(); if (top != null) row.invs.forEach((v, j) => { if (j <= top && !v.result?.ok) v.on = true; }); } // back to oldest first
              redraw(); };
            const t = el("span"); t.append(el("b", null, "Skip older months"), el("span", "sub", may ? "Pay only the months you tick, for a customer who was away or didn't use the internet. The older months stay unpaid; the note must say why (10+ letters) and the ERP logs it as [OVERRIDE tertua-dulu]."
              : "Only a finance manager or admin can skip older months."));
            sk.append(cb, t); parts.push(sk);
          }
          const f = el("div", "bform"); f.append(...payFields(st, busy, `c${row.user}`, redraw)); parts.push(f);
          const what = ch.length === 1 ? ch[0].period : `${ch.length} months`, rc = ch.filter((v) => v.recharge).length;
          const newest = ch.length ? row.invs.indexOf(ch[ch.length - 1]) : -1, skipped = st.skipOlder ? open.filter((v) => !v.on && row.invs.indexOf(v) < newest).length : 0;
          if (st.phase === "paying") { const s = el("button", "btn wide", `Paying ${Math.min(st.done + 1, st.total)} of ${st.total}…`); s.type = "button"; s.disabled = true; parts.push(s); }
          else { const btn = armButton(st, ch.length ? `Mark ${what} Lunas · ${rupiah(total)}${skipped ? ` · skip ${skipped} older` : ""}${rc ? " · recharge" : ""}` : "Tick a month to pay",
              `Click again: ${what} paid by ${st.method}, ${rupiah(total)}${skipped ? `, ${skipped} older left unpaid` : ""}`, () => (st.override = skipped > 0, payQueue(ch.map((v) => [row, v]), st, redraw, st.defaultNote)), redraw, `c${row.user}pay`);
            btn.style.marginTop = "10px"; parts.push(btn);
            const why = el("p", "note warn"); why.hidden = true; parts.push(why);
            // skipping needs the reason first; checked as you type, without redrawing the note you're typing in
            (st.onNote = () => { const short = !!skipped && st.note.trim().length < 10; btn.disabled = !ch.length || short;
              why.hidden = !short; why.textContent = `Write in Note why the older months are skipped (${st.note.trim().length}/10 letters), e.g. "pelanggan di luar kota Oktober".`; })(); }
        } else if (st.phase === "done") parts.push(el("p", "note good", "Paid."));
      }
      b.el.replaceChildren(...parts);
      if (focus && b.el.isConnected) b.el.querySelector(`[data-k="${focus}"]`)?.focus();
    }
    function bulkView() {
      if (bulk.el) return bulk.el;
      const wrap = el("div", "bulk");
      const head = el("div", "head"), e = el("div", "eyebrow"); e.append("Bulk Lunas");
      const back = el("button", "back", "← Back"); back.type = "button"; back.onclick = () => { view.mode = null; drawBody(); panel.querySelector("input")?.focus(); };
      head.append(e, back);
      const ta = el("textarea", "field"); ta.placeholder = "Paste usernames, one per line"; ta.setAttribute("aria-label", "Usernames"); ta.spellcheck = false;
      ta.onpaste = () => setTimeout(() => bulk.phase !== "paying" && find(), 0);
      ta.onkeydown = (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); find(); } };
      const go = el("button", "btn", "Find them"); go.type = "button"; go.onclick = () => find(); go.style.marginTop = "8px"; go.dataset.k = "find";
      wrap.append(head, ta, go, el("div", "bform"), el("div", "blist"), el("div", "bpay"));
      return (bulk.el = wrap);
    }
    function bulkDraw() {
      if (!bulk?.el) return;
      const list = bulk.el.querySelector(".blist"), form = bulk.el.querySelector(".bform"), foot = bulk.el.querySelector(".bpay"), focus = document.activeElement?.dataset?.k;
      const busy = bulk.phase === "paying" || bulk.phase === "looking";
      bulk.el.querySelector("textarea").disabled = bulk.phase === "paying";
      const findBtn = bulk.el.querySelector('[data-k="find"]'); findBtn.disabled = busy;
      findBtn.textContent = bulk.phase === "looking" ? `Looking… ${bulk.rows.filter((r) => r.state !== "looking").length}/${bulk.rows.length}` : bulk.rows.length ? "Find again" : "Find them";
      const rows = [];
      for (const [ri, r] of bulk.rows.entries()) {
        const box = el("div", `brow${r.shown ? "" : " rise"}${r.state === "found" && r.invs.length ? "" : " off"}`); box.style.setProperty("--i", String(Math.min(ri, 12))); r.shown = true;
        const h = el("div", "h");
        if (r.state === "found") {
          h.append(el("b", null, r.name || r.user), el("span", `mono${r.guess ? " warn" : ""}`, r.user.toLowerCase() !== r.token.toLowerCase() ? `${r.token} → ${r.user}` : r.user)); box.append(h);
          if (r.guess && r.invs.length) box.append(el("div", "sub warn", "Not the exact username you pasted: tick it if this is the right customer"));
          box.append(el("div", "sub", [r.where, r.paidTo ? `paid to ${r.paidTo}` : "nothing paid yet"].filter(Boolean).join(" · ")));
          if (!r.invs.length) box.append(el("div", "sub good", "Nothing unpaid"));
          box.append(...monthRows(r, ri, busy, bulk, bulkDraw));
        } else {
          h.append(el("b", null, r.token), el("span", "mono", { looking: "looking…", none: "not found", pick: "which one?", dupe: "listed twice", error: "failed" }[r.state])); box.append(h);
          if (r.state === "error") box.append(el("div", "sub late", r.err));
          if (r.state === "dupe") box.append(el("div", "sub", "Same customer as a line above: shown once"));
          if (r.state === "none") box.append(el("div", "sub", "No invoice has this username or anything close. Check the spelling."));
          if (r.state === "pick") box.append(el("div", "sub", "No exact username: is it one of these?"));
          if (r.state === "pick" || r.state === "error") {
            const p = el("div", "picks");
            for (const c of r.state === "pick" ? r.cands : [r.pick || r.token]) { const b = el("button", "btn", c); b.type = "button"; b.disabled = busy;
              b.onclick = async () => { r.pick = c; r.guess = false; await lookup(r); await radius(r.invs); bulkDraw(); }; p.append(b); }
            box.append(p);
          }
        }
        rows.push(box);
      }
      list.replaceChildren(...rows);
      // the pay bar
      const ch = chosen(), people = new Set(ch.map(([r]) => r.user)).size, total = ch.reduce((a, [, v]) => a + v.amount, 0), recharges = ch.filter(([, v]) => v.recharge).length;
      const parts = [], fields = [];
      if (bulk.rows.length && bulk.phase !== "looking") {
        const found = bulk.rows.filter((r) => r.state === "found").length, open = bulk.rows.length - found - bulk.rows.filter((r) => r.state === "dupe").length;
        const sum = el("div", "sum"); sum.append(el("span", null, `${found} of ${bulk.rows.length} found${open ? ` · ${open} need a look` : ""}`), el("b", null, `${ch.length} invoices · ${rupiah(total)}`));
        fields.push(...payFields(bulk, busy, "", bulkDraw)); parts.push(sum);
        if (bulk.phase === "paying") {
          const bar = el("div", "bar"), i = el("i"); i.style.width = `${(bulk.done / bulk.total) * 100}%`; bar.append(i);
          const stop = el("button", "btn wide", bulk.stop ? "Stopping after this one…" : `Paying ${bulk.done + 1} of ${bulk.total} · Stop`); stop.type = "button"; stop.disabled = bulk.stop;
          stop.onclick = () => { bulk.stop = true; bulkDraw(); }; stop.dataset.k = "pay";
          parts.push(bar, stop, el("div", "sub", "Keep this tab open until it's done."));
        } else {
          if (bulk.phase === "done") {
            const all = bulk.rows.flatMap((r) => r.invs.filter((v) => v.result)), ok = all.filter((v) => v.result.ok).length;
            parts.push(el("div", `sum ${ok === all.length ? "good" : "warn"}`, `${ok} marked Lunas${all.length - ok ? ` · ${all.length - ok} not: see the red lines` : ""}`));
          }
          const btn = armButton(bulk, ch.length ? `Mark ${ch.length} Lunas · ${rupiah(total)}${recharges ? ` · ${recharges} recharge` : ""}` : "Tick the months to pay",
            `Click again: mark ${ch.length} paid (${people} customers, ${rupiah(total)})`, pay, bulkDraw, "pay");
          btn.disabled = !ch.length;
          parts.push(btn);
        }
      }
      form.replaceChildren(...fields); foot.replaceChildren(...parts); foot.hidden = !parts.length;
      if (focus) bulk.el.querySelector(`[data-k="${focus}"]`)?.focus();
    }

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
        const by = new Map(); for (const x of j.sessions || []) by.set(String(x.username).toLowerCase(), { ip: x.nasipaddress, up: Number(x.uptimeSec) || 0, addr: x.framedipaddress, ro: x.router, type: x.userType });
        return (live = { at: Date.now(), by });
      }).finally(() => { liveLoading = null; }));
    }
    // the ERP's own row for a feed router: the same name when it's a real one, else the biggest look-alike
    // (RO ARJOSARI and the old ARJOSARI are different routers; RO-NGADIROJO-E2E is NGADIROJO)
    function areaOf(name) {
      const rows = areas?.rows ?? [], n = nameNorm(name), exact = rows.find((r) => r.router === name);
      if (exact && exact.active >= 50) return exact;
      const like = rows.filter((r) => r.router && r.router !== "(?)" && (nameNorm(r.router) === n || n.includes(nameNorm(r.router)) || nameNorm(r.router).includes(n)));
      return like.sort((a, b) => b.active - a.active)[0] || exact || null;
    }
    function spark(cv, series, usual, big) {
      requestAnimationFrame(() => {
        const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || series.length < 2) return;
        cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
        const vs = series.map(([, v]) => v), max = Math.max(...vs, usual ?? 0, 1) * 1.08, t0 = Date.now() - 24 * 3600000;
        const X = (t) => ((t - t0) / (24 * 3600000)) * w, Y = (v) => h - 2 - (v / max) * (h - 4);
        if (usual != null) { g.strokeStyle = "#363738"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, Y(usual)); g.lineTo(w, Y(usual)); g.stroke(); g.setLineDash([]); }
        g.strokeStyle = "#b3b0af"; g.lineWidth = big ? 1.5 : 1; g.beginPath();
        series.forEach(([t, v], i) => (i && t - series[i - 1][0] < 20 * 60000 ? g.lineTo(X(t), Y(v)) : g.moveTo(X(t), Y(v)))); g.stroke();
        const [lt, lv] = series[series.length - 1]; g.fillStyle = lv < (usual ?? 0) * 0.9 ? "#ff6a5c" : "#e9e1dc"; g.beginPath(); g.arc(X(lt), Y(lv), big ? 3 : 2, 0, Math.PI * 2); g.fill();
      });
    }
    function radarView() {
      if (view.nas) return [routerView(view.nas)];
      const out = [], head = el("div", "rhead"), e = el("div", "eyebrow"); e.style.margin = "10px 6px 6px"; e.append("Outage radar");
      const tools = el("div", "tools"), again = el("button", "btn", "Check now"); again.type = "button";
      again.onclick = async () => { again.disabled = true; again.textContent = "Checking…"; await radarTick(true); drawBody(); };
      tools.append(radar?.at ? `checked ${ago(radar.at)}` : "", again); head.append(e, tools); out.push(head);
      if (radarOff) { out.push(el("p", "note late", radarOff)); if (!radar) return out; }
      if (!radar) { out.push(el("p", "note ld", "Reading the routers…")); radarTick(true); return out; }
      radarDrawn = radar.at;
      const said = (x) => `${x.open} online · usually ${x.usual}${x.since ? ` · since ${hhmm(x.since)}` : ""}`;
      if (radar.wide) out.push(el("div", "ralert", "Most routers dropped at once: more likely the central link or the RADIUS server than one area."));
      for (const x of radar.alerts) {
        const b = el("button", `ralert item${x.level === "drop" ? " drop" : ""}`); b.type = "button";
        b.append(el("b", null, `${x.name}: ${x.level === "down" ? "down" : `${x.gap} fewer online`}`), el("span", null, x.healthy ? said(x) : `${said(x)} · its session feed has stopped`));
        b.onclick = () => { view.nas = x.ip; drawBody(); }; out.push(b);
      }
      if (!radar.alerts.length && !radar.learning) out.push(el("div", "rok", `All ${radar.list.filter((x) => x.level !== "silent").length} routers at their usual level.`));
      if (radar.learning) out.push(el("p", "note", "Learning each router's usual level from a reading every 5 minutes while an ERP tab is open. Alerts start after about 25 minutes; the lines fill in over a day."));
      const e2 = el("div", "eyebrow"); e2.append("Routers"); out.push(e2);
      radar.list.forEach((x, i) => {
        const b = el("button", "item rrow rise"); b.type = "button"; b.style.setProperty("--i", String(Math.min(i, 14)));
        const area = areaOf(x.name);
        const cv = el("canvas"); cv.setAttribute("aria-hidden", "true");
        const n = el("span", "n"); n.append(String(x.open));
        const dark = x.level === "silent" && (area?.active ?? 0) >= 20; // nothing reported, yet customers on file: the feed or the router
        n.append(el("small", x.level === "down" ? "late" : x.level === "drop" || dark ? "warn" : null, dark ? "no sessions: check" : x.level === "silent" ? "no sessions" : x.usual == null ? "learning" : x.gap > 0 ? `−${x.gap} vs ${x.usual}` : `usual ${x.usual}`));
        b.append(el("span", `dot ${x.level === "learning" ? "" : x.level}`), el("span", "t", x.name), cv, n, el("span", "s", [area?.district, area ? `${area.active} active customers` : ""].filter(Boolean).join(" · ") || " "));
        b.onclick = () => { view.nas = x.ip; drawBody(); };
        out.push(b); spark(cv, x.series, x.usual);
      });
      if (!areas) areaNames().then(() => view.mode === "radar" && !view.nas && drawBody());
      return out;
    }
    function routerView(ip) {
      const x = radar?.list.find((r) => r.ip === ip), wrap = el("div", "card");
      const back = el("button", "back", "← All routers"); back.type = "button"; back.onclick = () => { view.nas = null; view.desa = null; drawBody(); };
      wrap.append(back);
      if (!x) { wrap.append(el("p", "note", "This router isn't in the feed any more.")); return wrap; }
      const who = el("div", "who rise"), pill = el("span", "pill");
      pill.append(el("span", `dot ${x.level}`), { down: "Down", drop: "Dropping", ok: "Normal", learning: "Learning", silent: "No sessions" }[x.level]);
      who.append(el("h3", null, x.name), pill); wrap.append(who);
      const stats = el("div", "stats rise"); stats.style.cssText = "margin-top:12px;padding:0"; stats.style.setProperty("--i", "1");
      const stat = (v, l, cls = "") => { const d = el("div", `stat ${cls}`); d.append(el("b", null, String(v)), el("span", null, l)); stats.append(d); return d; };
      stat(x.open, "online now", x.level === "down" || x.level === "drop" ? "bad" : "on"); stat(x.usual ?? "–", "usually"); const back15 = stat("…", "reconnected ≤15 min");
      wrap.append(stats);
      const chart = el("div", "near rise"); chart.style.setProperty("--i", "2");
      const cv = el("canvas", "big"); cv.setAttribute("aria-label", `${x.name} sessions over the last 24 hours`);
      const ticks = el("div", "ticks"); for (const hAgo of [24, 18, 12, 6, 0]) ticks.append(el("span", null, hAgo ? hhmm(Date.now() - hAgo * 3600000) : "now"));
      chart.append(el("div", "sub", `Sessions, last 24 hours${x.usual != null ? " · dashed: usual level" : ""}${x.since ? ` · dropping since ${hhmm(x.since)}` : ""}`), cv, ticks);
      wrap.append(chart); spark(cv, x.series, x.usual, true);
      const who2 = el("div", "near rise"); who2.style.setProperty("--i", "3"); wrap.append(who2);
      if (!customers) { who2.append(el("p", "note", "To see who's offline, open LDN Radius → Pelanggan once so the customer list is kept here.")); return wrap; }
      who2.append(el("p", "note ld", "Reading the live sessions…"));
      liveSessions().then((lv) => { if (view.nas === ip && who2.isConnected) offlineView(who2, back15, ip, lv); }).catch((e) => { who2.replaceChildren(el("p", "note late", e.message)); });
      return wrap;
    }
    // which customers belong to this router: online ones by their session, offline ones by their LDN router name
    // (each name goes to the router most of its online customers are on)
    function offlineView(box, back15, ip, lv) {
      const votes = {};
      for (const c of customers) { const s = lv.by.get(String(c.username).toLowerCase()); if (s) { const v = (votes[c.router] ||= {}); v[s.ip] = (v[s.ip] || 0) + 1; } }
      const home = {}; for (const [r, v] of Object.entries(votes)) home[r] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
      const mine = [], off = []; let fresh = 0;
      for (const c of customers) {
        if (c.isolir || c.isInactive) continue;
        const s = lv.by.get(String(c.username).toLowerCase());
        if (s ? s.ip === ip : home[c.router] === ip) { mine.push(c); if (!s) off.push(c); else if (s.up < 900) fresh++; }
      }
      back15.querySelector("b").textContent = String(fresh);
      const parts = [];
      const e = el("div", "eyebrow"); e.style.margin = "0 0 8px"; e.append(`Offline now `, el("b", null, `${off.length} of ${mine.length} active customers`)); parts.push(e);
      if (fresh >= 10) parts.push(el("p", "note good", `${fresh} customers reconnected in the last 15 minutes: the line is coming back.`));
      const rx = radar?.list.find((r) => r.ip === ip);
      if (off.length) parts.push(reportBox({ title: x_name(ip), down: off.length, total: mine.length, since: rx?.level === "down" || rx?.level === "drop" ? rx.since : null, custs: off }));
      // where the offline ones are, on the map
      const pts = mine.map((c) => ({ c, p: where(c), on: !off.includes(c) })).filter((z) => z.p);
      if (pts.length) { parts.push(areaMap(pts, `${off.length} offline customers on a map of ${x_name(ip)}`, { what: `Router ${x_name(ip)}`, since: rx?.level === "down" || rx?.level === "drop" ? rx.since : null }));
        parts.push(el("p", "note", `On the map: ${pts.length} of ${mine.length} customers (the ones with a saved location), problems named on the map.`)); }
      // villages, most offline first
      const by = new Map(); for (const c of mine) { const d = c.desa || "No village"; const g = by.get(d) || { all: 0, off: [] }; g.all++; if (off.includes(c)) g.off.push(c); by.set(d, g); }
      const rows = [...by].filter(([, g]) => g.off.length).sort((a, b) => b[1].off.length - a[1].off.length || b[1].off.length / b[1].all - a[1].off.length / a[1].all);
      if (!rows.length) parts.push(el("p", "note", "Everyone on this router is online."));
      rows.slice(0, 15).forEach(([d, g], i) => {
        const b = el("button", "item desa rise"); b.type = "button"; b.style.setProperty("--i", String(i));
        const m = el("span", "meter"), fill = el("i"); fill.style.width = `${Math.round((g.off.length / g.all) * 100)}%`; m.append(fill);
        b.append(el("span", "t", d), m, el("span", "r", `${g.off.length} / ${g.all}`));
        b.onclick = () => { view.desa = view.desa === d ? null : d; offlineView(box, back15, ip, lv); };
        parts.push(b);
        if (view.desa === d) parts.push(...g.off.slice(0, 40).map((c, j) => custItem(c, j)));
      });
      box.replaceChildren(...parts);
      items = [...panel.querySelectorAll(".scroll .item, .scroll .tile")];
    }
    const x_name = (ip) => radar?.list.find((r) => r.ip === ip)?.name || "this router";
    function radarItem(i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      const a = radar?.alerts ?? [];
      b.append(el("span", `dot ${a.some((x) => x.level === "down") ? "down" : a.length ? "drop" : radar && !radar.learning ? "ok" : ""}`), el("span", "t", "Outage radar"),
        el("span", "r", a.length ? `${a.length} alert${a.length > 1 ? "s" : ""}` : radar?.learning ? "learning" : radar ? "all normal" : ""),
        el("span", "s", a.length ? a.map((x) => `${x.name} ${x.level === "down" ? "down" : `−${x.gap}`}`).join(" · ") : "Routers against their usual level; who's offline, by village and on a map"));
      b.onclick = () => { view.mode = "radar"; view.nas = null; view.card = null; drawBody(); }; return b;
    }

    // ---- Modems: any ONT by its SN, its OLT port and signal, and remote work on it ----
    // The ERP's own calls: each OLT's cached ONT list (46 OLTs, ~11,000 ONTs, kept 2 hours), live signal per ONT,
    // reboot through the OLT by SN, and for modems on TR-069 (GenieACS): the WiFi password, a WiFi change and a reboot.
    // Nothing on a modem changes until its button is pressed twice.
    let onts = null, ontsLoading = null, acs = null, acsLoading = null;
    const snNorm = (x) => String(x ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const lower = (x) => String(x ?? "").toLowerCase().trim();
    function refreshOnts() {
      return (ontsLoading ||= (async () => {
        const pr = (await api("/api/olt/profiles")).data || [], rows = [], queue = [...pr];
        await Promise.all([0, 1, 2, 3].map(async () => { while (queue.length) { const p = queue.shift();
          try { for (const o of (await api(`/api/olt/profiles/${p.id}/onts?cached=1`)).data || []) if (o.serialNumber) rows.push(ontRow(o, p)); } catch { /* that OLT is skipped */ } } }));
        // each OLT's own record: whether the ERP can reach it, and why not
        const olts = pr.map((p) => ({ id: p.id, name: p.name, ip: p.ipAddress || "", ok: p.lastTestSuccess, err: p.lastDiscoveryError || p.lastTestError || "", disc: p.lastDiscoveryAt || null }));
        const v = { at: Date.now(), rows, olts }; idbPut("onts", v); onts = indexOnts(v);
        if (panel && !document.activeElement?.closest?.(".modem")) drawBody();
        return onts;
      })().finally(() => { ontsLoading = null; }));
    }
    const ontRow = (o, p) => ({ sn: snNorm(o.serialNumber), raw: o.serialNumber, pid: p.id, olt: p.name, pon: [o.frame, o.slot, o.port].filter((x) => x != null).join("/"), id: o.ontId,
      st: o.status, rx: o.rxPower ?? null, dist: o.distance ?? o.signalDistance ?? null, pppoe: o.pppoeUsername || "", name: o.customerName || "", model: o.model || o.vendor || p.vendor || "",
      seen: o.signalPolledAt || o.lastSeenAt || null });
    const indexOnts = (v) => ({ at: v.at, rows: v.rows, olts: v.olts || [], bySn: new Map(v.rows.map((o) => [o.sn, o])), byUser: new Map(v.rows.filter((o) => o.pppoe).map((o) => [lower(o.pppoe), o])) });
    async function ontIndex() {
      if (!onts) { const kept = await idbGet("onts"); if (kept?.rows) onts = indexOnts(kept); }
      if (!onts || Date.now() - onts.at > 2 * 3600000) { const p = refreshOnts(); if (!onts) await p; }
      return onts;
    }
    function acsIndex() {
      if (acs && Date.now() - acs.at < 15 * 60000) return Promise.resolve(acs);
      return (acsLoading ||= api("/api/olt/acs/devices").then((j) => {
        const rows = (j.data || []).map((d) => ({ id: d._id, sn: snNorm(d.serialNumber), model: [d.manufacturer, d.productClass].filter(Boolean).join(" "), inform: d.lastInform,
          ssid: d.ssid24 || d.ssid || "", ssid5: d.ssid5g || "", pppoe: d.pppoeUsername || d.wan?.usernameModem || "", mgmt: d.externalIpAddress || d.wan?.ip || "" }));
        return (acs = { at: Date.now(), bySn: new Map(rows.map((d) => [d.sn, d])), byUser: new Map(rows.filter((d) => d.pppoe).map((d) => [lower(d.pppoe), d])) });
      }).catch(() => (acs = { at: Date.now(), bySn: new Map(), byUser: new Map(), failed: true })).finally(() => { acsLoading = null; }));
    }
    // a customer's modem: the SN on file, else the ONT or TR-069 device that logs in with their username
    function modemOf(r) {
      const sn = snNorm(r.ontSerial), u = lower(r.username);
      const ont = (sn && onts?.bySn.get(sn)) || onts?.byUser.get(u) || null;
      const dev = acs?.bySn.get(ont?.sn || sn) || acs?.byUser.get(u) || null;
      return { sn: ont?.sn || dev?.sn || sn, ont, dev };
    }
    let custBySn = null;
    function customerOf(sn, ont, dev) {
      if (!customers) return null;
      if (!custBySn || custBySn.n !== customers) { custBySn = new Map(customers.filter((c) => c.ontSerial).map((c) => [snNorm(c.ontSerial), c])); custBySn.n = customers; }
      const u = lower(ont?.pppoe || dev?.pppoe);
      return custBySn.get(sn) || (u && customers.find((c) => lower(c.username) === u)) || null;
    }
    const snLike = (q) => { const t = q.trim(); return /^[a-z0-9:-]{5,}$/i.test(t) && /\d/.test(t) && !/^0?8\d{8,}$/.test(t); };
    function findModems(q, max = 6) {
      const n = snNorm(q), out = [], seen = new Set();
      for (const o of onts?.rows ?? []) { if (out.length >= max) break; if (o.sn.includes(n) && !seen.has(o.sn)) { seen.add(o.sn); out.push({ sn: o.sn, ont: o, dev: acs?.bySn.get(o.sn) }); } }
      for (const d of acs?.bySn.values() ?? []) { if (out.length >= max) break; if (d.sn.includes(n) && !seen.has(d.sn)) { seen.add(d.sn); out.push({ sn: d.sn, ont: null, dev: d }); } }
      for (const c of customers ?? []) { if (out.length >= max) break; const sn = snNorm(c.ontSerial); if (sn && sn.includes(n) && !seen.has(sn)) { seen.add(sn); out.push({ sn, ont: null, dev: null, cust: c }); } }
      return out.map((m) => ({ ...m, cust: m.cust || customerOf(m.sn, m.ont, m.dev) }));
    }
    const rxClass = (rx) => (rx == null ? "" : rx >= -26 ? "good" : rx >= -28 ? "warn" : "late");
    const dbm = (rx) => (rx == null || rx === 0 ? "–" : `${Number(rx).toFixed(1).replace(".", ",")} dBm`);
    const when = (t) => { if (!t) return ""; const m = Math.floor((Date.now() - new Date(t)) / 60000); return m < 1 ? "just now" : m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
    const ontState = (o) => (!o ? "" : /online|working/i.test(o.st) ? "on" : /los|dying|offline/i.test(o.st) ? "off" : "");
    function modemItem(m, i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(el("span", `dot ${ontState(m.ont)}`), el("span", "t", m.cust?.nama || m.ont?.name || m.dev?.model || m.sn), el("span", "r", m.ont?.raw || m.sn),
        el("span", "s", [m.ont?.model || m.dev?.model, m.ont && `${m.ont.olt} · ${m.ont.pon}:${m.ont.id}`, m.ont?.rx ? dbm(m.ont.rx) : "", m.cust ? m.cust.username : "no customer linked"].filter(Boolean).join(" · ")));
      b.onclick = () => { if (m.cust) { view.card = m.cust; remember(m.cust); } else view.modem = m.sn; view.sel = 0; draw(); };
      return b;
    }
    // the modem box: on a customer's card, or alone for a modem no customer is linked to
    const mods = new Map(); // key → { el, st, live, pw, form, msg }
    function modemBox(key, r) {
      let m = mods.get(key);
      if (!m) { m = { el: el("div", "near modem rise"), rb: { armed: 0 }, wf: { armed: 0 }, key, r }; m.el.style.setProperty("--i", "3"); mods.set(key, m); } // reboot and WiFi each arm on their own
      m.r = r; modemDraw(m);
      if (!onts || !acs) Promise.all([ontIndex(), acsIndex()]).then(() => modemDraw(m)).catch((e) => { m.msg = { bad: true, text: e.message }; modemDraw(m); });
      return m.el;
    }
    function modemDraw(m) {
      const redraw = () => modemDraw(m), focus = document.activeElement?.dataset?.k, parts = [];
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "0"; e.append("Modem"); head.append(e); parts.push(head);
      if (!onts || !acs) { parts.push(el("p", "note ld", "Looking the modem up on the OLTs… (the first time takes about 10 seconds)")); m.el.replaceChildren(...parts); return; }
      const { sn, ont, dev } = m.r ? modemOf(m.r) : { sn: m.key, ont: onts.bySn.get(m.key), dev: acs.bySn.get(m.key) };
      if (!ont && !dev) { parts.push(el("p", "note", sn ? `${sn} isn't on any OLT's list or on TR-069.` : "No modem serial on file, and no ONT or TR-069 modem logs in with this username."));
        if (m.r) parts.push(webSection(m, m.r.username, null, redraw)); m.el.replaceChildren(...parts); return; }
      const live = m.live, st = live?.status || ont?.st, pill = el("span", "pill");
      pill.append(el("span", `dot ${ontState({ st })}`), st ? st[0].toUpperCase() + st.slice(1) : "TR-069 only"); head.append(pill);
      const facts = el("dl", "facts"), fact = (label, value, opts = {}) => { if (!value) return; const dd = el("dd", opts.cls || null);
        if (value instanceof Node) dd.append(value); else dd.append(value);
        if (opts.copy) { const c = el("button", "copy", "Copy"); c.type = "button"; c.onclick = () => copy(String(opts.copy), c); dd.append(c); }
        if (opts.extra) dd.append(opts.extra); facts.append(el("dt", null, label), dd); };
      fact("SN", ont?.raw || sn, { cls: "mono", copy: ont?.raw || sn });
      fact("Model", ont?.model || dev?.model);
      if (ont) fact("OLT", `${ont.olt} · PON ${ont.pon} · ONU ${ont.id}`);
      if (ont) {
        const rx = live?.rxPower ?? ont.rx, sig = el("span"); sig.append(el("span", `rx ${rxClass(rx)}`, dbm(rx)));
        const more = [live?.rxPowerOlt ? `OLT side ${dbm(live.rxPowerOlt)}` : "", (live?.distance ?? ont.dist) ? `${Math.round(live?.distance ?? ont.dist)} m` : "", live ? (live.lastUpdated ? when(live.lastUpdated) : "now") : when(ont.seen)].filter(Boolean);
        if (more.length) sig.append(el("span", "sub", ` · ${more.join(" · ")}`));
        const read = el("button", "copy", m.reading ? "Reading…" : "Read now"); read.type = "button"; read.disabled = !!m.reading; read.dataset.k = `${m.key}read`;
        read.onclick = async () => { m.reading = true; redraw();
          try { const j = await api(`/api/olt/profiles/${ont.pid}/onts/${encodeURIComponent(ont.raw)}/signal`); m.live = j.data || null; m.msg = j.cached ? { text: "The OLT only had a stored reading." } : null; }
          catch (err) { m.msg = { bad: true, text: `Couldn't read the signal: ${err.message}` }; }
          m.reading = false; redraw(); };
        fact("Signal", sig, { extra: read });
      }
      if (dev) fact("TR-069", `last report ${when(dev.inform) || "never"}${dev.ssid ? ` · WiFi ${dev.ssid}${dev.ssid5 ? ` / ${dev.ssid5}` : ""}` : ""}`);
      else fact("TR-069", "not connected: WiFi can't be changed from here, reboot goes through the OLT");
      if (m.r && ont?.pppoe && lower(ont.pppoe) !== lower(m.r.username)) fact("Note", `the OLT has this ONT under ${ont.pppoe}`, { cls: "warn" });
      parts.push(facts);
      // actions
      const acts = el("div", "actions"), btn = (label, fn, k) => { const b = el("button", "btn", label); b.type = "button"; b.onclick = fn; b.dataset.k = `${m.key}${k}`; acts.append(b); return b; };
      if (dev) {
        btn(m.pw ? "Hide password" : m.pwBusy ? "Opening…" : "WiFi password", async () => {
          if (m.pw) { m.pw = null; return redraw(); }
          m.pwBusy = true; redraw();
          try { const j = await api(`/api/olt/acs/devices/${encodeURIComponent(dev.id)}/sandi-wifi`, {}); m.pw = j.data?.sandi ? j.data : { none: true }; clearTimeout(m.pwTimer); m.pwTimer = setTimeout(() => { m.pw = null; redraw(); }, 30000); }
          catch (err) { m.msg = { bad: true, text: `Password not shown: ${err.message}` }; }
          m.pwBusy = false; redraw(); }, "pw");
        btn(m.form ? "Cancel" : "Change WiFi", () => { m.form = m.form ? null : { pita: dev.ssid5 ? "keduanya" : "2.4GHz", ssid: dev.ssid, ssid5: dev.ssid5, password: "" }; m.wf.armed = 0; redraw(); }, "wifi");
      }
      const viaAcs = dev && Date.now() - new Date(dev.inform) < 15 * 60000, via = viaAcs ? "TR-069" : ont ? "the OLT" : null;
      if (via) {
        const rb = armButton(m.rb, `Reboot (via ${via})`, "Click again: reboot · offline ~1 min", async () => {
          m.rb.armed = 0; m.msg = { text: "Sending the reboot…" }; redraw();
          try {
            const j = viaAcs ? await api(`/api/olt/acs/devices/${encodeURIComponent(dev.id)}`, { action: "reboot" }) : await api("/api/admin/reboot-onu-by-sn", { serialNumber: ont.raw });
            const q = j.data?.status;
            m.msg = { good: true, text: q === "queued-offline" ? "The modem isn't answering TR-069: the reboot waits until it does." : q === "queued-natbound" ? "Queued: it reboots at the modem's next report (within ~5 min)." : `Reboot sent via ${via}. Back in 1–3 minutes.` };
          } catch (err) { m.msg = { bad: true, text: `Reboot failed: ${err.message}` }; }
          redraw(); }, redraw, `${m.key}reboot`);
        rb.classList.remove("wide", "primary"); if (!rb.classList.contains("arm")) rb.classList.add("btn"); acts.append(rb);
      }
      parts.push(acts);
      { const u = m.r?.username || ont?.pppoe || dev?.pppoe; if (u) parts.push(webSection(m, u, dev, redraw)); }
      if (m.pw) { const box = el("div", "pw"); if (m.pw.none) box.append(el("span", null, "No WiFi password on record for this modem."));
        else { box.append(el("span", null, `${m.pw.ssid ? `${m.pw.ssid} · ` : ""}${m.pw.sandi}`)); const c = el("button", "copy", "Copy"); c.type = "button"; c.onclick = () => copy(m.pw.sandi, c); box.append(c); }
        parts.push(box, el("p", "note", "Hidden again in 30 seconds. Only give it to this modem's customer.")); }
      if (m.form && dev) parts.push(wifiForm(m, dev, redraw));
      if (m.msg) parts.push(el("p", `note ${m.msg.bad ? "late" : m.msg.good ? "good" : ""}`, m.msg.text));
      m.el.replaceChildren(...parts);
      if (focus && m.el.isConnected) m.el.querySelector(`[data-k="${focus}"]`)?.focus();
    }
    // ---- the modem's own web page ----
    // The ERP's Remote ONU looks for the session only on the RO the customer record names, and about 1 in 10 online
    // customers are really on another RO (old ARJOSARI/TREMAS records), so it finds nothing. Here the address comes
    // from RADIUS (the live session: its IP and real RO). The links open from a device on the NOC WireGuard; "from
    // anywhere" is the ERP's temporary port on the RO (5 minutes, logged), which needs the ERP to find the session too.
    function webSection(m, username, dev, redraw) {
      const w = m.web, box = el("div", "webbox");
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "12px 0 0"; e.append("Web page"); head.append(e); box.append(head);
      if (!w) {
        const b = el("button", "btn", "Find the modem's address"); b.type = "button"; b.dataset.k = `${m.key}web`; b.style.marginTop = "8px";
        b.onclick = () => openWeb(m, username, redraw); box.append(b); return box;
      }
      if (w.busy) { box.append(el("p", "note ld", "Reading the live session and asking the ERP…")); return box; }
      if (w.err) box.append(el("p", "note late", w.err));
      const s = w.sess;
      if (!s) { box.append(el("p", "note", "Not online now (no PPPoE session in RADIUS), so the modem can't be reached.")); return box; }
      const facts = el("dl", "facts"), ip = el("dd", "mono", s.addr); const c = el("button", "copy", "Copy"); c.type = "button"; c.onclick = () => copy(s.addr, c); ip.append(c);
      facts.append(el("dt", null, "Modem IP"), ip, el("dt", null, "On"), el("dd", null, `${s.ro} · online ${dur(s.up)}`)); box.append(facts);
      if (w.erpRo && nameNorm(w.erpRo).split(/[\s-]/)[0] !== nameNorm(s.ro).split(/[\s-]/)[0])
        box.append(el("p", "note warn", `The ERP has this customer on ${w.erpRo}, but the session is on ${s.ro}: the ERP's own Remote ONU and its 5-minute access can't find it. Correct the customer's RO in the ERP to fix that; the links below work anyway.`));
      // direct links
      const links = el("div", "actions"), link = (label, url) => { const a = el("a", links.children.length ? "btn" : "btn primary", label); /* port 80 first: the main way in, on the NOC WireGuard */ a.href = url; a.target = "_blank"; a.rel = "noreferrer noopener"; links.append(a); };
      link("Open :80 ↗", `http://${s.addr}/`); link(":8080 ↗", `http://${s.addr}:8080/`);
      if (dev?.mgmt && dev.mgmt !== s.addr) link(`TR-069 IP ${dev.mgmt} ↗`, `http://${dev.mgmt}/`);
      box.append(links, el("p", "note", "These open on a device connected to the NOC WireGuard (the RO only lets 10.99.98.0/24 reach modems)."));
      // test and 5-minute access, through the ERP when it found the session
      const acts = el("div", "actions");
      if (w.id && w.erpFound) {
        const t = el("button", "btn", w.probing ? "Testing… (~20 s)" : "Test from the RO"); t.type = "button"; t.disabled = !!w.probing; t.dataset.k = `${m.key}probe`;
        t.onclick = async () => { w.probing = true; redraw();
          try { const j = await api("/api/noc/remote-onu", { customerId: w.id, probe: true }); w.probe = j.probe; } catch (err) { w.err = `Test failed: ${err.message}`; }
          w.probing = false; redraw(); };
        acts.append(t);
        if (!w.tunnel || w.tunnel.until < Date.now()) {
          const go = armButton(w.st, "Open from anywhere · 5 min", "Click again: open a 5-minute port on the RO (logged)", () => {
            let win = null; try { win = window.open("about:blank", "_blank"); if (win) win.opener = null; } catch { /* blocked */ }
            w.st.armed = 0; w.opening = true; redraw();
            api("/api/noc/remote-modem", { customerId: w.id }).then((j) => {
              const min = Number(j.menit) > 0 ? Number(j.menit) : 5, secs = Number(j.kedaluwarsaDetik) || min * 60;
              w.tunnel = { url: String(j.url), until: Date.now() + secs * 1000, note: j.keterangan || "" };
              if (win && !win.closed) win.location.replace(w.tunnel.url); else window.open(w.tunnel.url, "_blank", "noopener");
            }).catch((err) => { win?.close(); w.err = `Access not opened: ${err.message}. Dashbor NOC → Remote ONU → "Buka Akses 5 Menit" sends the same request.`; }).finally(() => { w.opening = false; redraw(); });
          }, redraw, `${m.key}tunnel`);
          go.classList.remove("wide", "primary"); if (w.opening) { go.disabled = true; go.textContent = "Opening…"; } acts.append(go);
        }
      } else if (!w.id) acts.append(el("span", "sub", "The ERP's Remote ONU doesn't know this username, so there's no 5-minute access."));
      box.append(acts);
      if (w.tunnel && w.tunnel.until > Date.now()) {
        const p = el("p", "note good"), a = el("a", null, w.tunnel.url); a.href = w.tunnel.url; a.target = "_blank"; a.rel = "noreferrer noopener";
        const left = el("b"); p.append("Open now: ", a, " · closes in ", left); box.append(p);
        const tick = (first) => { if (!w.tunnel) return; const sLeft = Math.max(0, Math.round((w.tunnel.until - Date.now()) / 1000)); left.textContent = `${Math.floor(sLeft / 60)}:${String(sLeft % 60).padStart(2, "0")}`;
          if (!sLeft) { w.tunnel = null; redraw(); } else if (first || left.isConnected) setTimeout(tick, 1000); }; // the first tick runs before the box is on the page
        tick(true);
      }
      if (w.probe) {
        const say = { menjawab: "answers", tidakMenjawab: "no answer", takDiuji: "not tested", takTerbaca: "unclear" };
        const r = el("p", "note"); r.append(`From ${s.ro}: ping ${say[w.probe.ping?.status] || "–"}`);
        for (const x of w.probe.http || []) { r.append(" · "); r.append(el("span", x.status === "menjawab" ? "good" : x.status === "tidakMenjawab" ? "late" : "", `port ${x.port} ${say[x.status] || x.status}${x.http ? ` (${x.http})` : ""}`)); }
        box.append(r);
        if ((w.probe.http || []).length && w.probe.http.every((x) => x.status === "tidakMenjawab")) // only a clear "no" on every port
          box.append(el("p", "note warn", dev ? "This modem doesn't serve its web page on the internet side. Use WiFi password, Change WiFi or Reboot above: they go through TR-069." : "This modem doesn't serve its web page on the internet side, and it isn't on TR-069: it needs a visit, or TR-069 set up on it."));
      }
      return box;
    }
    const dur = (sec) => { const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), mi = Math.floor((sec % 3600) / 60); return d ? `${d} d ${h} h` : h ? `${h} h ${mi} min` : `${mi} min`; };
    async function openWeb(m, username, redraw) {
      const w = (m.web = { busy: true, st: { armed: 0 } }); redraw();
      const u = lower(username);
      const [lv, erp] = await Promise.all([
        (live && Date.now() - live.at < 30000 ? Promise.resolve(live) : (live = null, liveSessions())).catch((e) => { w.err = `RADIUS sessions not read: ${e.message}`; return null; }),
        api(`/api/noc/remote-onu?q=${encodeURIComponent(username)}`).then(async (j) => { const c = (j.hasil || []).find((x) => lower(x.username) === u); if (!c) return null;
          const d = await api("/api/noc/remote-onu", { customerId: c.customerId, probe: false }); return { id: c.customerId, ro: c.ro, found: d.sumberSesi === "live" || d.sumberSesi === "snapshot", ip: d.sesi?.ip }; }).catch(() => null),
      ]);
      const s = lv?.by.get(u);
      w.sess = s && s.addr ? s : erp?.ip ? { addr: erp.ip, ro: erp.ro, up: 0 } : null;
      w.id = erp?.id; w.erpRo = erp?.ro; w.erpFound = !!erp?.found; w.busy = false; redraw();
    }
    function wifiForm(m, dev, redraw) {
      const f = m.form, form = el("form"); form.onsubmit = (ev) => ev.preventDefault();
      const seg = el("div", "seg");
      for (const [v, l] of [["2.4GHz", "2,4 GHz"], ["5GHz", "5 GHz"], ["keduanya", "Both"]]) { const b = el("button", null, l); b.type = "button"; b.setAttribute("aria-pressed", String(f.pita === v)); b.onclick = () => { f.pita = v; m.wf.armed = 0; redraw(); }; seg.append(b); }
      const lab = (t, x) => { const l = el("label", "lbl"); l.append(t, x); return l; };
      const inp = (k, ph, val) => { const i = el("input", "field"); i.value = val ?? ""; i.placeholder = ph; i.dataset.k = `${m.key}${k}`; i.autocomplete = "off"; i.spellcheck = false; i.oninput = () => { f[k] = i.value; m.wf.armed = 0; }; return i; };
      const parts = [lab("Band", seg)];
      if (f.pita !== "5GHz") parts.push(lab("WiFi name (2,4 GHz)", inp("ssid", "keep as it is", f.ssid)));
      if (f.pita !== "2.4GHz") parts.push(lab("WiFi name (5 GHz)", inp("ssid5", dev.ssid5 ? "keep as it is" : "this modem reports no 5 GHz", f.ssid5)));
      const pw = inp("password", "new password, 8–63 characters (empty keeps it)", f.password);
      const gen = el("button", "copy", "Make one"); gen.type = "button";
      gen.onclick = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; f.password = Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => a[x % a.length]).join(""); m.wf.armed = 0; redraw(); };
      const pl = lab("New password", pw); pl.append(gen); parts.push(pl);
      const body = { action: "wifi-update", pita: f.pita };
      if (f.pita !== "5GHz" && f.ssid?.trim() && f.ssid.trim() !== dev.ssid) body.ssid = f.ssid.trim();
      if (f.pita !== "2.4GHz" && f.ssid5?.trim() && f.ssid5.trim() !== dev.ssid5) body.ssid5g = f.ssid5.trim();
      if (f.password) body.password = f.password;
      const bad = f.password && (f.password.length < 8 || f.password.length > 63), what = [body.ssid || body.ssid5g ? "name" : "", body.password ? "password" : ""].filter(Boolean).join(" and ");
      const go = armButton(m.wf, bad ? "The password needs 8–63 characters" : what ? `Change the WiFi ${what}` : "Change the name or type a new password", `Click again: send to the modem${body.password ? ` (new password: ${body.password})` : ""}`, async () => {
        m.wf.armed = 0; m.msg = { text: "Sending to the modem…" }; redraw();
        try { const j = await api(`/api/olt/acs/devices/${encodeURIComponent(dev.id)}`, body), q = j.data?.status;
          m.msg = { good: true, text: q === "queued-offline" ? "The modem isn't answering TR-069: the change waits until it reports again." : q === "queued-natbound" ? "Queued: it applies at the modem's next report (within ~5 min)." : `Sent. The modem applies it in a few seconds${body.password ? "; the customer's devices need the new password" : ""}.` };
          m.form = null; acs = null; // read the device list again next time
        } catch (err) { m.msg = { bad: true, text: `Not changed: ${err.message}` }; }
        redraw(); }, redraw, `${m.key}wifigo`);
      go.disabled = bad || !what; parts.push(go);
      form.append(...parts); return form;
    }

    // ---- Weak signal and the PON board: from the OLTs' cached ONT lists (the modem search's index) ----
    // Signal classes are the ERP's own (ONT management): good from −26 dBm, warning to −28, critical below.
    // Readings come from each OLT's last poll, so every row says how old its reading is.
    const ponKey = (o) => `${o.pid}|${o.pon}`;
    const usable = (o) => o.st === "online" && o.rx != null && o.rx < 0 && o.rx > -40; // 0 and −40 are OLTs saying "no reading"
    const sigLevel = (rx) => (rx < -28 ? "crit" : rx < -26 ? "warn" : "good");
    const old = (o) => !o.seen || Date.now() - new Date(o.seen) > 24 * 3600000;
    function ponGroups() {
      if (onts.groups?.at === onts.at) return onts.groups.list;
      const by = new Map();
      for (const o of onts.rows) { const k = ponKey(o); let g = by.get(k); if (!g) by.set(k, (g = { key: k, olt: o.olt, pon: o.pon, pid: o.pid, all: [], off: 0, crit: 0, warn: 0 })); g.all.push(o);
        const t = o.seen ? new Date(o.seen).getTime() : 0; if (t > (g.fresh || 0)) g.fresh = t;
        if (o.st !== "online") g.off++; else if (usable(o)) { const l = sigLevel(o.rx); if (l === "crit") g.crit++; else if (l === "warn") g.warn++; } }
      const list = [...by.values()]; onts.groups = { at: onts.at, list }; return list;
    }
    function boardHead(title, out) {
      const head = el("div", "rhead"), e = el("div", "eyebrow"); e.style.margin = "10px 6px 6px"; e.append(title);
      const tools = el("div", "tools"), again = el("button", "btn", ontsLoading ? "Reading…" : "Read the OLTs again"); again.type = "button"; again.disabled = !!ontsLoading;
      again.onclick = () => { refreshOnts().then(() => drawBody()).catch(() => drawBody()); drawBody(); };
      tools.append(onts ? `OLT lists ${when(onts.at)}` : "", again); head.append(e, tools); out.push(head);
      const back = el("button", "back", "← Back"); back.type = "button"; back.style.marginLeft = "6px";
      back.onclick = () => { if (view.pon) { view.pon = null; if (view.from) { view.mode = view.from; view.from = null; } } else view.mode = null; drawBody(); };
      out.push(back);
    }
    const needOnts = (out) => { if (onts) return true; out.push(el("p", "note ld", "Reading the OLTs' ONT lists… (about 6 seconds the first time)")); ontIndex().then(() => drawBody()).catch((e) => { out.length = 0; }); return false; };
    function ontItem(o, i, right) {
      const c = customerOf(o.sn, o, null), b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(Math.min(i, 14)));
      const lv = o.st !== "online" ? "off" : usable(o) ? { crit: "bad", warn: "drop", good: "on" }[sigLevel(o.rx)] : "";
      b.append(el("span", `dot ${lv}`), el("span", "t", c?.nama || o.name || o.raw), el("span", "r", right ?? (usable(o) ? dbm(o.rx) : o.st)),
        el("span", "s", [`${o.olt} · ${o.pon}:${o.id}`, c?.desa, c?.username || "no customer linked", o.st !== "online" ? o.st : old(o) ? `old reading (${when(o.seen)})` : when(o.seen)].filter(Boolean).join(" · ")));
      b.onclick = () => { if (c) { view.card = c; remember(c); } else view.modem = o.sn; view.sel = 0; draw(); };
      return b;
    }
    function ponItem(g, i, kind) {
      const b = el("button", "item desa rise"); b.type = "button"; b.style.setProperty("--i", String(Math.min(i, 14)));
      const n = g.all.length, v = kind === "weak" ? g.crit : g.off, m = el("span", "meter"), fill = el("i"); fill.style.width = `${Math.round((v / n) * 100)}%`; m.append(fill);
      b.append(el("span", "t", `${g.olt} · ${g.pon}`), m, el("span", "r", kind === "weak" ? `${g.crit} critical · ${g.warn} warn` : `${g.off} / ${n} offline`),
        el("span", "s", g.fresh ? `newest reading on this port ${when(g.fresh)}` : "no reading time"));
      b.onclick = () => { view.from = view.mode; view.mode = "pon"; view.pon = g.key; drawBody(); };
      return b;
    }
    function signalView() {
      const out = []; boardHead("Weak signal", out); if (!needOnts(out)) return out;
      const lvl = view.sigLevel || "crit", seg = el("div", "seg"); seg.style.margin = "4px 6px";
      for (const [k, l] of [["crit", "Critical (below −28)"], ["warn", "Weak (below −26)"]]) { const b = el("button", null, l); b.type = "button"; b.setAttribute("aria-pressed", String(lvl === k)); b.onclick = () => { view.sigLevel = k; drawBody(); }; seg.append(b); }
      out.push(seg);
      const read = onts.rows.filter(usable), weak = read.filter((o) => (lvl === "crit" ? o.rx < -28 : o.rx < -26)).sort((a, b) => a.rx - b.rx);
      const crit = read.filter((o) => o.rx < -28).length, warn = read.filter((o) => o.rx < -26 && o.rx >= -28).length;
      out.push(el("p", "note", `${crit} critical and ${warn} warning of ${read.length.toLocaleString("id-ID")} online modems with a reading. Several weak on one PON port usually means a dirty connector or a bad splitter on that line.`));
      // clusters: PON ports with several weak modems
      const by = new Map(); for (const o of weak) { const k = ponKey(o); by.set(k, [...(by.get(k) || []), o]); }
      const groups = ponGroups(), clusters = [...by].filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
      if (clusters.length) { const e = el("div", "eyebrow"); e.append("PON ports with several weak"); out.push(e);
        clusters.forEach(([k, l], i) => { const g = groups.find((x) => x.key === k), b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
          const avg = l.reduce((a, o) => a + o.rx, 0) / l.length;
          b.append(el("span", `dot ${lvl === "crit" ? "bad" : "drop"}`), el("span", "t", `${g?.olt || l[0].olt} · ${l[0].pon}`), el("span", "r", `${l.length} of ${g?.all.length ?? "?"}`), el("span", "s", `worst ${dbm(l[0].rx)} · average ${dbm(avg)}`));
          b.onclick = () => { view.from = "signal"; view.mode = "pon"; view.pon = k; drawBody(); }; out.push(b); }); }
      const e2 = el("div", "eyebrow"); e2.append(`Weakest`, el("b", null, `${weak.length}`)); out.push(e2);
      weak.slice(0, 60).forEach((o, i) => out.push(ontItem(o, i)));
      if (weak.length > 60) out.push(el("p", "note", `and ${weak.length - 60} more`));
      return out;
    }
    function ponBoard() {
      if (view.pon) return ponDetail(view.pon);
      const out = []; boardHead("PON board", out); if (!needOnts(out)) return out;
      const sort = view.ponSort || "off", seg = el("div", "seg"); seg.style.margin = "4px 6px";
      for (const [k, l] of [["off", "Most offline"], ["weak", "Most weak signal"]]) { const b = el("button", null, l); b.type = "button"; b.setAttribute("aria-pressed", String(sort === k)); b.onclick = () => { view.ponSort = k; drawBody(); }; seg.append(b); }
      out.push(seg);
      // 0/0/0 is how some OLTs list modems without a real port (unregistered or removed): not a line, so not ranked
      const all = ponGroups(), noPort = all.filter((g) => /^(0\/)*0$/.test(g.pon)).reduce((a, g) => a + g.all.length, 0);
      const groups = all.filter((g) => g.all.length >= 3 && !/^(0\/)*0$/.test(g.pon)), isBad = (g) => g.off >= 3 && g.off / g.all.length >= 0.25, bad = groups.filter(isBad);
      out.push(el("p", "note", `${groups.length} PON ports on ${new Set(groups.map((g) => g.pid)).size} OLTs; ${bad.length} with a quarter or more offline (3 at least).${noPort ? ` ${noPort} modems listed without a port (0/0/0) aren't ranked.` : ""} Offline counts are from each OLT's last poll: check the reading age.`));
      const list = [...groups].sort(sort === "weak" ? (a, b) => b.crit - a.crit || b.warn - a.warn : (a, b) => isBad(b) - isBad(a) || b.off - a.off || b.off / b.all.length - a.off / a.all.length);
      list.slice(0, 80).forEach((g, i) => out.push(ponItem(g, i, sort)));
      return out;
    }
    function ponDetail(key) {
      const out = []; boardHead("PON port", out); if (!needOnts(out)) return out;
      const g = ponGroups().find((x) => x.key === key); if (!g) { out.push(el("p", "note", "This port isn't in the OLT lists any more.")); return out; }
      const wrap = el("div", "card"), who = el("div", "who"); who.append(el("h3", null, `${g.olt} · PON ${g.pon}`)); wrap.append(who);
      const stats = el("div", "stats"); stats.style.cssText = "margin-top:12px;padding:0";
      for (const [v, l, c] of [[g.all.length, "modems", ""], [g.off, "offline", g.off ? "off" : ""], [g.crit, "critical signal", g.crit ? "bad" : ""]]) { const d = el("div", `stat ${c}`); d.append(el("b", null, String(v)), el("span", null, l)); stats.append(d); }
      wrap.append(stats);
      const share = g.off / g.all.length;
      wrap.append(el("p", `note ${g.off >= 3 && share >= 0.25 ? "late" : g.crit >= 3 ? "warn" : "good"}`, g.off >= 3 && share >= 0.25 ? `${g.off} of ${g.all.length} down together: most likely the line (PON, splitter or ODP).`
        : g.crit >= 3 ? `${g.crit} modems with critical signal on this port: check the connectors and splitter on this line.` : "This port looks normal."));
      // where they are
      const pts = g.all.map((o) => { const c = customerOf(o.sn, o, null); return c && where(c) ? { c, p: where(c), on: o.st === "online" } : null; }).filter(Boolean);
      if (pts.length) { wrap.append(areaMap(pts, `Map of ${pts.length} customers on this port`, { what: `${g.olt} · PON ${g.pon}` }));
        wrap.append(el("p", "note", `On the map: ${pts.length} of ${g.all.length} modems, the ones linked to a customer with a saved location. The rest have no customer match or no location.`)); }
      else wrap.append(el("p", "note", `None of the ${g.all.length} modems on this port is linked to a customer with a saved location, so there's nothing to map.`));
      out.push(wrap);
      if (g.off) out.push(reportBox({ title: `${g.olt} · PON ${g.pon}`, down: g.off, total: g.all.length, age: g.fresh ? `OLT ${lalu(g.fresh)}` : "",
        custs: g.all.filter((o) => o.st !== "online").map((o) => customerOf(o.sn, o, null)).filter(Boolean) }));
      const order = [...g.all].sort((a, b) => (a.st === "online") - (b.st === "online") || (usable(a) ? a.rx : 0) - (usable(b) ? b.rx : 0));
      const e = el("div", "eyebrow"); e.append("Modems, offline and weakest first"); out.push(e);
      order.forEach((o, i) => out.push(ontItem(o, i)));
      return out;
    }
    // ---- Technicians by village: the ERP's own map (HRD → Pemetaan Wilayah Teknisi), kept 6 hours ----
    // A village usually has a field team, an area head (KA …) and a backbone team; the field team comes first.
    // Villages come two ways: a team's own list, and each technician's individual placement ("data individu", e.g.
    // TIM DONOROJO 1 has no team list; its two technicians cover Nglampeng and four more by placement). Both count.
    let techMap = null, techLoading = null;
    function techIndex() {
      if (techMap && Date.now() - techMap.at < 6 * 3600000) return Promise.resolve(techMap);
      return (techLoading ||= (async () => {
        let kept = await idbGet("tech2");
        if (!kept || Date.now() - kept.at > 6 * 3600000) {
          const j = await api("/api/hrd/technician-area-map");
          kept = { at: Date.now(), teams: (j.teams || []).filter((t) => t.jumlahAnggota > 0).map((t) => ({ name: t.namaTim, desa: t.assignedDesa || [],
            members: (t.anggota || []).map((a) => ({ n: a.nama, lead: !!a.isKetua || a.id === t.kepalaTeknisId })) })),
            techs: (j.teknisi || []).map((t) => ({ n: t.nama, team: t.timLabel || t.teams?.[0]?.namaTim || "Tanpa tim", lead: (t.teams || []).some((x) => /ketua|kepala/i.test(x.peran || "")),
              desa: (t.desaList || []).map((x) => x.label || x.desa) })) };
          idbPut("tech2", kept);
        }
        // village → its teams, each with the members who cover it
        const by = new Map(), add = (desa, team, member) => { const k = vkey(desa); let m = by.get(k); if (!m) by.set(k, (m = new Map()));
          let t = m.get(team); if (!t) m.set(team, (t = { name: team, members: [] })); if (member && !t.members.some((x) => x.n === member.n)) t.members.push(member); };
        for (const t of kept.teams) for (const d of t.desa) { add(d, t.name); for (const mb of t.members) add(d, t.name, mb); }
        for (const tc of kept.techs || []) for (const d of tc.desa) add(d, tc.team, { n: tc.n, lead: tc.lead });
        for (const [k, m] of by) by.set(k, [...m.values()]);
        const teams = new Map(); for (const l of by.values()) for (const t of l) teams.set(t.name, t);
        return (techMap = { at: kept.at, by, teams: [...teams.values()] });
      })().finally(() => { techLoading = null; }));
    }
    const teamKind = (n) => (/^KA\b/i.test(n) ? "area" : /BACKBONE/i.test(n) ? "backbone" : /\b(NOC|ADMIN|KANTOR|CS|GUDANG)\b/i.test(n) ? "office" : "field");
    const vkey = (d) => fold(d).replace(/ /g, ""); // "Jetiskidul" and "Jetis Kidul" are one village
    const byKind = (l) => { const order = { field: 0, area: 1, backbone: 2, office: 3 }; return [...l].sort((a, b) => order[teamKind(a.name)] - order[teamKind(b.name)]); };
    const teamsFor = (desa) => byKind(techMap?.by.get(vkey(desa)) || []);
    // the village on file, else the village most of the nearest customers are in, else the area head for the district
    function guessTeams(r) {
      if (r.desa && teamsFor(r.desa).length) return { teams: teamsFor(r.desa), how: "" };
      const lead = r.desa ? `No team covers ${titleCase(r.desa)}` : "No village on file";
      const near = where(r) && customers ? (nearby(r, 1500)?.list || []).slice(0, 25) : [];
      const votes = new Map(); for (const x of near) if (x.r.desa && teamsFor(x.r.desa).length) { const d = titleCase(x.r.desa.trim()); votes.set(d, (votes.get(d) || 0) + 1); }
      const best = [...votes].sort((a, b) => b[1] - a[1])[0];
      if (best) return { teams: teamsFor(best[0]), how: `${lead}: going by the nearest customers, ${best[1]} of ${near.length} of them in ${best[0]}.`, desa: best[0] };
      const dist = r.kecamatanErp || r.district || "", w = fold(dist).split(" ")[0];
      const ka = w ? (techMap?.teams || []).filter((t) => teamKind(t.name) === "area" && fold(t.name).split(" ").includes(w)) : [];
      if (ka.length) return { teams: ka, how: `${lead} and no location: the area head for ${titleCase(dist)}.`, desa: "" };
      // last: the customers on the same router, when most of them are in one village
      if (r.router && customers) {
        const same = customers.filter((c) => c.router === r.router && c.desa && teamsFor(c.desa).length), v = new Map();
        for (const c of same) { const d = titleCase(c.desa.trim()); v.set(d, (v.get(d) || 0) + 1); }
        const top = [...v].sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] >= 10 && top[1] / same.length >= 0.4) return { teams: teamsFor(top[0]), how: `${lead}, no location or district: going by ${r.router}, where ${Math.round((top[1] / same.length) * 100)}% of customers are in ${top[0]}. A guess: check the address.`, desa: top[0] };
      }
      return { teams: [], how: "" };
    }
    const titleCase = (x) => String(x).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    function techBox(r) {
      const box = el("div", "techs rise"); box.style.setProperty("--i", "2");
      const fill = () => {
        const head = el("div", "eyebrow"); head.style.margin = "0 0 6px"; head.append("Technicians", el("b", null, r.desa ? ` · ${titleCase(r.desa)}` : ""));
        const { teams, how } = guessTeams(r);
        if (!teams.length) return box.replaceChildren(head, el("p", "note warn", r.desa ? `No team covers ${titleCase(r.desa)} yet, and nothing nearby to go by (HRD → Pemetaan Wilayah Teknisi).` : "No village or location on file, so no team can be matched."));
        const rows = teams.map((t) => { const row = el("div", "team"), kind = teamKind(t.name);
          const names = t.members.map((m) => (m.lead ? `${titleCase(m.n)} (lead)` : titleCase(m.n))).join(", ");
          row.append(el("span", `tag k-${kind}`, /* not "field": that is the input style */ { field: "Field", area: "Area head", backbone: "Backbone", office: "Office" }[kind]), el("b", null, t.name === "Tanpa tim" ? "Placed individually (no team)" : t.name), el("span", "sub", names || "no members"));
          return row; });
        box.replaceChildren(head, ...(how ? [el("p", "note warn", how)] : []), ...rows);
      };
      if (techMap) fill(); else { box.append(el("p", "note ld", "Finding this area's technicians…")); techIndex().then(fill).catch((e) => box.replaceChildren(el("p", "note late", `Technician map not read: ${e.message}`))); }
      return box;
    }

    // ---- Outage report: the text for the technicians' group, and a notice and phone list for the customers ----
    const wib = (t = Date.now()) => new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const lalu = (t) => { const m = Math.floor((Date.now() - new Date(t)) / 60000); return m < 1 ? "baru saja" : m < 120 ? `${m} menit lalu` : m < 2880 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };
    const phone62 = (p) => { let d = String(p ?? "").replace(/\D/g, ""); if (d.startsWith("0")) d = "62" + d.slice(1); return d.length >= 10 ? d : ""; };
    function reportBox({ title, down, total, since, custs, age }) {
      if (!techMap) techIndex().then(() => {}).catch(() => {}); // the team line appears once the map is in
      const box = el("div", "near report"), e = el("div", "eyebrow"); e.style.margin = "0 0 8px"; e.append("Outage report"); box.append(e);
      const title1 = (d) => String(d).toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()); // KASIHAN and Kasihan are one village
      const vil = new Map(); for (const c of custs) { const d = c.desa ? title1(c.desa.trim()) : "?"; vil.set(d, (vil.get(d) || 0) + 1); }
      const villages = [...vil].sort((a, b) => b[1] - a[1]), pts = custs.map(where).filter(Boolean);
      const mid = pts.length ? { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length } : null;
      const text = [`*GANGGUAN* · ${title}`, `${down} dari ${total} offline${since ? ` sejak ${hhmm(since)}` : ""}${age ? ` (data ${age})` : ""}`,
        villages.length ? `Desa: ${villages.slice(0, 8).map(([d, n]) => `${d} (${n})`).join(", ")}${villages.length > 8 ? ", …" : ""}` : "",
        custs.length === down ? `Pelanggan terdampak: ${custs.length}` : `Pelanggan terdampak yang terdata: ${custs.length} dari ${down} modem offline`,
        (() => { const t = [...new Set(villages.slice(0, 3).flatMap(([d]) => teamsFor(d).filter((x) => teamKind(x.name) === "field").map((x) => x.name)))]; return t.length ? `Tim: ${t.join(", ")}` : ""; })(), mid ? `Lokasi: https://www.google.com/maps?q=${mid.lat.toFixed(6)},${mid.lng.toFixed(6)}` : "", `Dilaporkan ${wib()} WIB`].filter(Boolean).join("\n");
      const notice = `Pelanggan Yth, saat ini sedang ada gangguan jaringan di area ${villages.slice(0, 3).map(([d]) => d).filter((d) => d !== "?").join(", ") || "Anda"}. Tim teknisi kami sedang menanganinya. Mohon maaf atas ketidaknyamanannya. Terima kasih.`;
      const phones = [...new Set(custs.map((c) => phone62(c.phone)).filter(Boolean))];
      const pre = el("div", "pw msg"); pre.textContent = text; box.append(pre);
      const acts = el("div", "actions"), btn = (label, fn) => { const b = el("button", "btn", label); b.type = "button"; b.onclick = () => fn(b); acts.append(b); return b; };
      btn("Copy report", (b) => copy(text, b));
      const wa = el("a", "btn primary", "WhatsApp ↗"); wa.href = `https://wa.me/?text=${encodeURIComponent(text)}`; wa.target = "_blank"; wa.rel = "noreferrer noopener"; acts.prepend(wa);
      if (phones.length) btn(`Copy ${phones.length} phone numbers`, (b) => copy(phones.join("\n"), b));
      if (custs.length) btn("Copy customer notice", (b) => copy(notice, b));
      box.append(acts); return box;
    }

    // ---- Data health: which numbers to trust ----
    // OLT polling age (a list not read for days makes the PON board and signal watch stale), routers whose session feed
    // is dead (the radar can't see them), and customers whose RO on file isn't where their session is (Remote ONU and
    // the radar's RO grouping go wrong for them).
    let polling = new Set(), wrongRo = null;
    async function readOlt(pid, name) {
      polling.add(pid); drawBody();
      try {
        const j = await api(`/api/olt/profiles/${pid}/onts`), d = j.data || [], p = { id: pid, name, vendor: "" };
        if (j.stale || j.fallback) view.healthMsg = { bad: true, text: `${name}: the ERP couldn't reach the OLT (${j.message || "no reason given"}), so it gave its old copy. The OLT's connection needs fixing on the ERP side.` };
        else { const rows = [...onts.rows.filter((o) => o.pid !== pid), ...d.filter((o) => o.serialNumber).map((o) => ontRow(o, p))];
          const v = { at: onts.at, rows, olts: onts.olts }; idbPut("onts", v); onts = indexOnts(v); view.healthMsg = { good: true, text: `${name}: read ${d.length} modems from the OLT just now.` }; }
      } catch (err) { view.healthMsg = { bad: true, text: `${name} didn't answer: ${err.message}` }; }
      polling.delete(pid); drawBody();
    }
    function healthView() {
      const out = []; boardHead("Data health", out); if (!needOnts(out)) return out;
      if (view.healthMsg) out.push(el("p", `note ${view.healthMsg.bad ? "late" : "good"}`, view.healthMsg.text));
      // 1. OLT lists by age
      const olts = new Map(); for (const o of onts.rows) { let g = olts.get(o.pid); if (!g) olts.set(o.pid, (g = { pid: o.pid, olt: o.olt, n: 0, newest: 0 })); g.n++; const t = o.seen ? new Date(o.seen).getTime() : 0; if (t > g.newest) g.newest = t; }
      const list = [...olts.values()].sort((a, b) => a.newest - b.newest), age = (g) => Date.now() - g.newest;
      const stale = list.filter((g) => age(g) > 24 * 3600000).length;
      const e1 = el("div", "eyebrow"); e1.append("OLT lists ", el("b", null, stale ? `${stale} of ${list.length} older than a day` : `all ${list.length} read within a day`)); out.push(e1);
      list.forEach((g, i) => {
        const row = el("div", "item hrow rise"); row.style.setProperty("--i", String(Math.min(i, 14)));
        const a = age(g), lv = !g.newest || a > 3 * 86400000 ? "bad" : a > 24 * 3600000 ? "drop" : a > 6 * 3600000 ? "" : "on";
        const read = el("button", "copy", polling.has(g.pid) ? "Reading…" : "Read now"); read.type = "button"; read.disabled = polling.has(g.pid);
        read.title = "Ask the OLT for its modem list now (read-only; up to ~50 s)"; read.onclick = () => readOlt(g.pid, g.olt);
        const info = onts.olts.find((x) => x.id === g.pid), why = a > 24 * 3600000 && info && info.ok === false && info.err ? ` · the ERP can't reach it${info.ip ? ` (${info.ip})` : ""}: ${info.err.replace(/\s+/g, " ").slice(0, 110)}…` : "";
        row.append(el("span", `dot ${lv}`), el("span", "t", g.olt), read, el("span", "s", `${g.n} modems · newest reading ${g.newest ? when(g.newest) : "never"}${why}`));
        out.push(row);
      });
      // 2. router session feeds (from the radar)
      const e2 = el("div", "eyebrow"); e2.append("Router session feeds"); out.push(e2);
      if (!radar) { out.push(el("p", "note ld", "Reading the routers…")); radarTick(true).then(() => view.mode === "health" && drawBody()); }
      else {
        if (!areas) areaNames().then(() => view.mode === "health" && drawBody());
        const dead = radar.list.filter((x) => !x.healthy || x.level === "silent");
        if (!dead.length) out.push(el("p", "note good", `All ${radar.list.length} routers are reporting sessions.`));
        dead.forEach((x) => { const a = areaOf(x.name), row = el("div", "item hrow");
          row.append(el("span", `dot ${(a?.active ?? 0) >= 20 ? "bad" : ""}`), el("span", "t", x.name), el("span", "r", `${x.open} sessions`),
            el("span", "s", (a?.active ?? 0) >= 20 ? `feed ${x.healthy ? "quiet" : "stopped"}, yet ${a.active} active customers on file: their sessions are counted on another router, or the feed is broken` : `feed ${x.healthy ? "quiet" : "stopped"}; few or no customers on file (likely retired)`));
          out.push(row); });
      }
      // 3. customers on the wrong RO
      const e3 = el("div", "eyebrow"); e3.append("Customers on the wrong RO"); out.push(e3);
      if (!customers) out.push(el("p", "note", "Needs the customer list: open LDN Radius → Pelanggan once."));
      else if (!wrongRo) { const b = el("button", "btn", "Check now (reads the live sessions, ~1 s)"); b.type = "button"; b.style.margin = "0 6px";
        b.onclick = async () => { b.disabled = true; b.textContent = "Checking…"; try { wrongRo = findWrongRo(await liveSessions()); } catch (err) { view.healthMsg = { bad: true, text: err.message }; } drawBody(); }; out.push(b); }
      else {
        out.push(el("p", "note", `${wrongRo.list.length} of ${wrongRo.online.toLocaleString("id-ID")} online customers have a different RO on file than where their session is. The ERP's Remote ONU can't find them, and the radar counts them on the other router.`));
        const csv = ["username,nama,ro_di_data,ro_sesi", ...wrongRo.list.map((x) => [x.c.username, `"${String(x.c.nama || "").replace(/"/g, "'")}"`, x.from || "(kosong)", x.to].join(","))].join("\n");
        const acts = el("div", "actions"); acts.style.margin = "0 6px 6px"; const c = el("button", "btn", "Copy the list (CSV)"); c.type = "button"; c.onclick = () => copy(csv, c); acts.append(c); out.push(acts);
        wrongRo.pairs.slice(0, 12).forEach(([k, l], i) => {
          const b = el("button", "item desa rise"); b.type = "button"; b.style.setProperty("--i", String(i));
          const m = el("span", "meter"), f = el("i"); f.style.width = `${Math.round((l.length / wrongRo.pairs[0][1].length) * 100)}%`; m.append(f);
          b.append(el("span", "t", k), m, el("span", "r", String(l.length))); b.onclick = () => { view.roPair = view.roPair === k ? null : k; drawBody(); }; out.push(b);
          if (view.roPair === k) l.slice(0, 50).forEach((x, j) => out.push(custItem(x.c, j)));
        });
      }
      return out;
    }
    function findWrongRo(lv) {
      const word = (x) => String(x || "").toUpperCase().replace(/^RO[\s-]+/, "").split(/[\s-]/)[0];
      const list = []; let online = 0;
      for (const c of customers) { const s = lv.by.get(String(c.username).toLowerCase()); if (!s || s.type !== "pppoe") continue; online++;
        if (word(c.router) !== word(s.ro)) list.push({ c, from: c.router || "", to: s.ro }); }
      const by = new Map(); for (const x of list) { const k = `${x.from || "(kosong)"} → ${x.to}`; by.set(k, [...(by.get(k) || []), x]); }
      return { at: Date.now(), online, list, pairs: [...by].sort((a, b) => b[1].length - a[1].length) };
    }
    function boardItem(i, mode) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      const [t, s, icon] = { signal: ["Weak signal", "Modems below −28 / −26 dBm, and PON ports where several are weak", "M4 18h2M8 14h2v4H8zM12 10h2v8h-2zM16 6h2v12h-2z"],
        pon: ["PON board", "Every PON port by share offline or weak signal; open one for its modems and map", "M4 6h16M4 12h16M4 18h16M8 4v4M14 10v4M10 16v4"],
        health: ["Data health", "Which numbers to trust: OLT polling age, router session feeds, customers on the wrong RO", "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM9 12l2 2 4-4"] }[mode];
      b.append(svg(icon), el("span", "t", t), el("span", "r", ""), el("span", "s", s));
      b.onclick = () => { view.mode = mode; view.pon = null; view.from = null; view.card = null; drawBody(); }; return b;
    }

    function draw() {
      if (!panel) return;
      const top = el("div", "top"), input = el("input"); input.placeholder = "Customer, modem SN, page or tool…"; input.value = view.q; input.setAttribute("aria-label", "Search the Dock");
      input.oninput = () => { view.q = input.value; view.sel = 0; view.card = null; view.mode = null; view.modem = null; drawBody(); };
      input.onpaste = (e) => { const t = e.clipboardData?.getData("text") || ""; if (t.split("\n").filter((x) => x.trim()).length >= 2) { e.preventDefault(); openBulk(t); } }; // a pasted list: Bulk Lunas
      const shut = el("button", "shut"); shut.type = "button"; shut.setAttribute("aria-label", "Close the Dock"); shut.title = "Close (Esc)"; shut.append(svg(ICON.x)); shut.onclick = () => { close(); fab?.focus(); };
      const mono = el("button", "shut"); mono.type = "button"; mono.setAttribute("aria-label", "Monochrome theme"); mono.setAttribute("aria-pressed", String(monoOn()));
      mono.title = monoOn() ? "Monochrome on: back to the ERP's colours" : "Monochrome: the whole site in black and bone";
      mono.append(svg("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 3v18M12 8h4M12 12h5M12 16h4")); mono.onclick = () => { monoToggle(); draw(); };
      top.append(svg(ICON.search), input, el("kbd", null, "Esc"), mono, shut);
      const body = el("div", "scroll"), foot = el("div", "foot");
      foot.append(el("span", null, customers ? `${customers.length.toLocaleString("id-ID")} customers · ${ago(custAt)}` : "Customer list: open LDN → Pelanggan once"), el("span", null, invoices ? `Invoices ${MONTHS_ID[Number(invKey.split("-")[2]) - 1]} kept` : "Invoices: open Invoices once"));
      const was = document.activeElement, keep = was === document.body || !was || panel.contains(was); // focus was in the Dock: the new box takes it
      panel.replaceChildren(top, body, foot);
      drawBody();
      if (keep && bulk?.el?.contains(was) && was.isConnected) was.focus();
      else if (keep) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
    function drawBody() {
      const body = panel?.querySelector(".scroll"); if (!body) return;
      dropFull();
      items = []; const parts = [];
      panel.classList.toggle("wide", view.mode === "bulk");
      if (view.mode === "bulk") { parts.push(bulkView()); body.replaceChildren(...parts); items = []; return bulkDraw(); }
      if (view.card) parts.push(cardView(view.card));
      else if (view.modem) { const w = el("div", "card"), back = el("button", "back", "← Back"); back.type = "button"; back.onclick = () => { view.modem = null; drawBody(); };
        w.append(back, modemBox(view.modem, null)); parts.push(w); }
      else if (view.mode === "radar") parts.push(...radarView());
      else if (view.mode === "signal") parts.push(...signalView());
      else if (view.mode === "pon") parts.push(...ponBoard());
      else if (view.mode === "health") parts.push(...healthView());
      else if (!view.q.trim()) parts.push(...homeView());
      else parts.push(...resultsView(view.q));
      body.replaceChildren(...parts);
      items = [...body.querySelectorAll(".item, .tile")];
      items.forEach((x, i) => x.setAttribute("aria-selected", String(i === view.sel)));
    }
    function homeView() {
      const out = [];
      if (customers) {
        const on = customers.filter((r) => r.online && !r.isolir).length, iso = customers.filter((r) => r.isolir).length;
        const e = el("div", "eyebrow"); e.append("Customers ", el("b", null, ago(custAt))); out.push(e);
        const s = el("div", "stats");
        for (const [cls, n, l] of [["", customers.length, "customers"], ["on", on, "online"], ["iso", iso, "isolir"]]) { const d = el("div", `stat ${cls} rise`); d.append(el("b", null, k(n)), el("span", null, l)); s.append(d); }
        out.push(s);
      }
      const e2 = el("div", "eyebrow"); e2.append("Go to"); out.push(e2);
      const g = el("div", "grid");
      SHORTCUTS.forEach(([label, path, icon], i) => { const t = el("button", "tile rise"); t.type = "button"; t.style.setProperty("--i", String(i)); t.append(svg(icon), label); t.onclick = () => go(path); g.append(t); });
      out.push(g);
      const e4 = el("div", "eyebrow"); e4.append("Tools"); out.push(e4, radarItem(0), boardItem(1, "pon"), boardItem(2, "signal"), boardItem(3, "health")); // Bulk Lunas shows when searched (or a list is pasted)
      const recent = ls.get(RECENT, []).map((u) => customers?.find((r) => r.username === u)).filter(Boolean);
      if (recent.length) { const e3 = el("div", "eyebrow"); e3.append("Recent customers"); out.push(e3, ...recent.slice(0, 5).map(custItem)); }
      if (!customers) out.push(el("p", "note", "To look customers up here, open LDN Radius → Pelanggan once: its fast search keeps the list in this browser."));
      return out;
    }
    function resultsView(q) {
      const sn = snLike(q), out = [], cs = sn ? findCustomers(q).filter((r) => r._hay.includes(fold(q))) : findCustomers(q), ps = sn ? [] : findPages(q);
      if (cs.length) { const e = el("div", "eyebrow"); e.append("Customers"); out.push(e, ...cs.map(custItem)); }
      if (ps.length) { const e = el("div", "eyebrow"); e.append("Pages"); out.push(e, ...ps.map(pageItem)); }
      if (sn) {
        if (onts && acs) { const ms = findModems(q); if (ms.length) { const e = el("div", "eyebrow"); e.append("Modems"); out.unshift(e, ...ms.map(modemItem)); } }
        else { out.push(el("p", "note ld", "Looking modems up on the OLTs…")); Promise.all([ontIndex(), acsIndex()]).then(() => { if (view.q === q && !view.card) drawBody(); }); }
      }
      const tool = /^(bul|lun|bay|tan|pay|mas|mar)/.test(fold(q)), net = /^(rad|out|gan|mat|rou|off|jar|dow|put)/.test(fold(q));
      const sig = /^(sig|sin|red|rx|lem|wea|dbm|red)/.test(fold(q)), pn = /^(pon|odp|spl|olt|lin)/.test(fold(q)), hl = /^(dat|hea|sta|pol|wro|sal|kes)/.test(fold(q));
      if (tool || net || sig || pn || hl) { const e = el("div", "eyebrow"); e.append("Tools"); out.push(e); if (net) out.push(radarItem(0)); if (pn) out.push(boardItem(1, "pon")); if (sig) out.push(boardItem(2, "signal")); if (hl) out.push(boardItem(3, "health")); if (tool) out.push(toolItem(4)); }
      if (!cs.length && !ps.length && !tool && !net && !sig && !pn && !hl && !snLike(q)) out.push(el("p", "note", customers ? "Nothing matches all of those words." : "No customer list yet: open LDN Radius → Pelanggan once."));
      return out;
    }
    function cardView(r) {
      const wrap = el("div", "card");
      const back = el("button", "back", "← Back"); back.type = "button"; back.onclick = () => { view.card = null; drawBody(); panel.querySelector("input")?.focus(); };
      const who = el("div", "who rise"); const pill = el("span", "pill"); pill.append(el("span", `dot ${state(r)}`), r.isolir ? "Isolir" : r.online ? "Online" : "Offline");
      who.append(el("h3", null, r.nama || r.username), pill);
      const facts = el("dl", "facts rise"); facts.style.setProperty("--i", "1");
      const fact = (label, value, opts = {}) => { if (!value) return; const dd = el("dd", opts.mono ? "mono" : null, value);
        if (opts.copy) { const c = el("button", "copy", "Copy"); c.type = "button"; c.onclick = () => copy(String(value), c); dd.append(c); }
        if (opts.link) { const a = el("a", "copy", opts.link[0]); a.href = opts.link[1]; a.target = "_blank"; a.rel = "noreferrer"; dd.append(a); }
        facts.append(el("dt", null, label), dd); };
      fact("Username", r.username, { mono: true, copy: true });
      fact("Phone", r.phone, { mono: true, copy: true, link: wa(r.phone) ? ["WhatsApp", wa(r.phone)] : null });
      fact("Address", r.address); fact("Area", [r.desa, r.kecamatanErp].filter(Boolean).join(", "));
      fact("Plan", r.paket); fact("Router", r.router); fact("IP", r.ip, { mono: true, copy: true });
      fact("Active since", r.tglAktif && !isNaN(new Date(r.tglAktif)) ? new Date(r.tglAktif).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : r.tglAktif); fact("Expires", r.expirasi && !isNaN(new Date(r.expirasi)) ? new Date(r.expirasi).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : r.expirasi); fact("ONT", r.ontSerial, { mono: true, copy: true }); fact("Partner", r.mitra);
      const tech = techBox(r);
      const acts = el("div", "actions rise"); acts.style.setProperty("--i", "2");
      const act = (label, fn, primary) => { const b = el("button", `btn${primary ? " primary" : ""}`, label); b.type = "button"; b.onclick = fn; acts.append(b); };
      act("Open in LDN", () => openIn.ldn(r), true); act("Invoices", () => openIn.invoices(r)); act("Map Terpadu", () => openIn.map(r)); act("Master", () => openIn.master(r));
      const loc = where(r); if (loc) { const a = el("a", "btn", "Google Maps"); a.href = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`; a.target = "_blank"; a.rel = "noreferrer"; acts.append(a); }
      const bill = payBox(r); billDraw(bills.get(r.username));
      wrap.append(back, who, facts, tech, acts, bill, modemBox(`u:${r.username}`, r), nearView(r));
      return wrap;
    }
    function nearView(r) {
      const box = el("div", "near rise"); box.style.setProperty("--i", "3");
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "0"; e.append("Nearby");
      const seg = el("div", "seg"); for (const m of [100, 300, 1000]) { const b = el("button", null, m < 1000 ? `${m} m` : "1 km"); b.type = "button"; b.setAttribute("aria-pressed", String(view.radius === m)); b.onclick = () => { view.radius = m; view.zoom = 0; drawBody(); }; seg.append(b); }
      head.append(e, seg); box.append(head);
      const n = nearby(r, view.radius);
      if (!n) { box.append(el("p", "note", customers && !("lat" in r) ? "Locations arrive with the next refresh of the customer list (LDN → Pelanggan → Update)." : "This customer has no location saved.")); return box; }
      const map = el("div", "map"); map.setAttribute("role", "group"); map.setAttribute("aria-label", `Map of ${n.list.length} customers within ${view.radius} metres`);
      const pon = el("div", "ponbox");
      box.append(map, cartoKeyRow(() => drawBody()), pon);
      const rows = [];
      for (const [i, x] of n.list.slice(0, 8).entries()) { const it = custItem(x.r, i); it.querySelector(".r").textContent = `${Math.round(x.d)} m`;
        it.addEventListener("mouseenter", () => map.hl?.(i, true)); it.addEventListener("mouseleave", () => map.hl?.(i, false)); rows.push(it); box.append(it); }
      setTimeout(() => { tileMap(map, r, n, view.radius, rows); ponLine(pon, r, map); }, 0); // once the card is on the page (a frame may not come while the tab is hidden)
      if (n.list.length > 8) box.append(el("p", "note", `and ${n.list.length - 8} more within ${view.radius < 1000 ? `${view.radius} m` : "1 km"}`));
      return box;
    }
    // A tile map drawn without a map library: a dark street map (OpenStreetMap's own tiles, darkened here; no key) where the status colours
    // stand out, or the satellite view Peta Terpadu uses (Google hybrid) for finding the house. This customer in the
    // middle, rings at half and full radius, every neighbour a dot; a dot and its row in the list light up together,
    // a dot opens that customer, and customers on the same PON port are outlined.
    const BASEMAP = "erpDock.basemap", CARTO_KEY = "erpDock.cartoKey"; // your own CARTO key, kept only in this browser (the script is public)
    const TILES = {
      dark: { url: (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, max: 19, attr: "© OpenStreetMap" }, // CARTO now wants a key
      sat: { url: (x, y, z) => `https://mt${(x + y) % 4}.google.com/vt/lyrs=y&hl=id&x=${x}&y=${y}&z=${z}`, max: 20, attr: "Google" },
    };
    function tileSource() {
      const kind = ls.get(BASEMAP, "dark") === "sat" ? "sat" : "dark", key = ls.get(CARTO_KEY, ""), carto = kind === "dark" && !!key;
      const T = carto ? { url: (x, y, z) => `https://basemaps.cartocdn.com/rastertiles/dark_all/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`, max: 20, attr: "© OpenStreetMap © CARTO" } : TILES[kind];
      return { kind, carto, T };
    }
    // the same map for a group of customers (a PON port, a router's offline customers): fitted to where they are,
    // offline grey over online green; a dot shows the name and opens the customer
    function areaMap(pts, label, about = {}) {
      const box = el("div", "map"); box.setAttribute("role", "group"); box.setAttribute("aria-label", label);
      box.redraw = () => drawAreaMap(box, pts, about); setTimeout(box.redraw, 0); return box;
    }
    function drawAreaMap(box, pts, about = {}) {
      const w = box.clientWidth, h = box.clientHeight; if (!w || !pts.length) return;
      const { kind, carto, T } = tileSource(), q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))];
      // with customers in trouble the map frames them (the rest still show where they fall), so they can be named
      const kinds = pts.map((z0) => ({ ...z0, k: health(z0.c, z0.on) })), focus = kinds.filter((z0) => RANK[z0.k] > 1), fit = focus.length ? focus : kinds;
      const la = fit.map((z) => z.p.lat).sort((a, b) => a - b), lo = fit.map((z) => z.p.lng).sort((a, b) => a - b), cut = fit.length > 20 ? 0.02 : 0;
      const b = { s: q(la, cut), n: q(la, 1 - cut), w: q(lo, cut), e: q(lo, 1 - cut) }, mid = { lat: (b.s + b.n) / 2, lng: (b.w + b.e) / 2 };
      const proj = (p, z) => { const size = 256 * 2 ** z, sin = Math.sin(p.lat * Math.PI / 180); return [((p.lng + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size]; };
      let z = Math.min(T.max, 17); while (z > 8) { const [x0, y0] = proj({ lat: b.n, lng: b.w }, z), [x1, y1] = proj({ lat: b.s, lng: b.e }, z); if (x1 - x0 <= w - 96 && y1 - y0 <= h - 150) break; z--; } // clear of the strip and the legend
      z = Math.max(8, Math.min(T.max, z + (box.zoom || 0)));
      const size = 256 * 2 ** z, [cx, cy] = box.ctr ? [box.ctr[0] * size, box.ctr[1] * size] : proj(mid, z), left = cx - w / 2, top = cy - h / 2 - (box.ctr ? 0 : 6), tiles = el("div", "tiles");
      box.geo = { size, cx, cy }; panMap(box);
      for (let tx = Math.floor(left / 256); tx * 256 < left + w; tx++) for (let ty = Math.floor(top / 256); ty * 256 < top + h; ty++) {
        const img = el("img"); img.src = T.url(tx, ty, z); img.alt = ""; img.draggable = false; img.style.left = `${tx * 256 - left}px`; img.style.top = `${ty * 256 - top}px`; tiles.append(img); }
      const tip = el("span", "tip"); tip.hidden = true;
      waitForBrief(box);
      const dots = [...kinds].sort((a, c) => RANK[a.k] - RANK[c.k]).map((z0) => { // problems drawn last, on top
        const [px, py] = proj(z0.p, z), d = el("button", `mdot ${z0.k}`); d.type = "button"; d.tabIndex = -1; d.style.left = `${px - left}px`; d.style.top = `${py - top}px`;
        const name = `${z0.c.nama || z0.c.username} · ${KIND[z0.k][0].toLowerCase()}`; d.setAttribute("aria-label", name);
        d.onmouseenter = () => { tip.textContent = name; tip.style.left = d.style.left; tip.style.top = d.style.top; tip.classList.toggle("low", py - top < 34); tip.hidden = false; d.classList.add("hl"); };
        d.onmouseleave = () => { tip.hidden = true; d.classList.remove("hl"); };
        d.onclick = () => { view.card = z0.c; view.sel = 0; remember(z0.c); draw(); }; return d; });
      const zoom = el("div", "zoom"), full = box.classList.contains("full"), fs = el("button", null, full ? "⤡" : "⤢"); fs.type = "button"; fs.title = full ? "Back (F or Esc)" : "Full screen (F)"; fs.onclick = () => toggleFull(box); zoom.append(fs);
      for (const [t, dz, label] of [["+", 1, "Zoom in"], ["−", -1, "Zoom out"]]) { const bt = el("button", null, t); bt.type = "button"; bt.setAttribute("aria-label", label);
        bt.disabled = (dz > 0 && z >= T.max) || (dz < 0 && z <= 8); bt.onclick = () => { box.zoom = (box.zoom || 0) + dz; box.redraw(); }; zoom.append(bt); }
      zoom.append(recentre(box), baseButton(box, kind), shareButton(box));
      box.classList.toggle("sat", kind === "sat"); box.classList.toggle("carto", carto);
      const mpp = 156543.03392 * Math.cos(mid.lat * Math.PI / 180) / 2 ** z;
      const scene = briefScene({ pts: kinds, at: (p) => { const [x, y] = proj(p, z); return [x - left, y - top]; }, mpp, w, h, about });
      box.scene = scene;
      box.replaceChildren(tiles, ...briefUnder(scene), ...dots, ...briefOver(scene), tip, zoom, el("span", "attr", T.attr));
      swapTiles(box, tiles, { z, kind, left, top, id: `area:${box.getAttribute("aria-label")}` });
    }
    function tileMap(box, r, n, radius, rows) {
      const w = box.clientWidth, h = box.clientHeight; if (!w) return;
      if (view.zoomFor !== r.username) { view.zoom = 0; view.zoomFor = r.username; }
      const mpp0 = 156543.03392 * Math.cos(n.c.lat * Math.PI / 180); // metres per pixel at zoom 0
      const { kind, carto, T } = tileSource();
      const z = Math.max(12, Math.min(T.max, Math.floor(Math.log2((mpp0 * Math.min(w, h - 120) * 0.6) / radius)) + (view.zoom || 0)));
      const size = 256 * 2 ** z, world = (p) => { const sin = Math.sin(p.lat * Math.PI / 180); return [((p.lng + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size]; };
      if (box.ctrFor !== r.username) { box.ctr = null; box.ctrFor = r.username; }
      const [cx, cy] = box.ctr ? [box.ctr[0] * size, box.ctr[1] * size] : world(n.c), left = cx - w / 2, top = cy - h / 2, mpp = mpp0 / 2 ** z;
      box.geo = { size, cx, cy }; panMap(box);
      const [mx, my] = world(n.c), hx = mx - left, hy = my - top; // this customer, wherever the map has been dragged
      const tiles = el("div", "tiles");
      for (let tx = Math.floor(left / 256); tx * 256 < left + w; tx++) for (let ty = Math.floor(top / 256); ty * 256 < top + h; ty++) {
        const img = el("img"); img.src = T.url(tx, ty, z); img.alt = ""; img.draggable = false; img.style.left = `${tx * 256 - left}px`; img.style.top = `${ty * 256 - top}px`; tiles.append(img); }
      const ring = (f, cls) => { const d = el("span", `ring ${cls}`), R = (radius * f) / mpp; d.style.cssText = `width:${2 * R}px;height:${2 * R}px;left:${hx - R}px;top:${hy - R}px`; return d; };
      const tip = el("span", "tip"); tip.hidden = true;
      waitForBrief(box);
      n.list.forEach((x) => { x.k = health(x.r); });
      const dots = n.list.map((x, i) => {
        const [px, py] = world(x.p), b = el("button", `mdot ${x.k}`); b.type = "button"; b.tabIndex = -1; b.style.zIndex = RANK[x.k] > 1 ? "1" : "";
        b.style.left = `${px - left}px`; b.style.top = `${py - top}px`; b.style.setProperty("--d", `${Math.round(Math.min(1, x.d / radius) * 350)}ms`);
        b.setAttribute("aria-label", `${x.r.nama || x.r.username}, ${KIND[x.k][0].toLowerCase()}, ${Math.round(x.d)} m`);
        b.onmouseenter = () => hl(i, true); b.onmouseleave = () => hl(i, false);
        b.onclick = () => { view.card = x.r; view.sel = 0; remember(x.r); draw(); };
        return b;
      });
      function hl(i, on) {
        const d = dots[i], x = n.list[i]; if (!d) return;
        d.classList.toggle("hl", on); rows[i]?.setAttribute("aria-selected", String(on));
        tip.hidden = !on; if (on) { tip.textContent = `${x.r.nama || x.r.username} · ${Math.round(x.d)} m`; tip.style.left = d.style.left; tip.style.top = d.style.top; tip.classList.toggle("low", parseFloat(d.style.top) < 34); }
      }
      box.hl = hl;
      box.redraw = () => tileMap(box, r, n, radius, rows); // after going full screen and back
      box.pon = (set) => { box.ponSet = set; dots.forEach((d, i) => d.classList.toggle("pon", set.has(n.list[i].r.username))); };
      if (box.ponSet) box.pon(box.ponSet);
      const me = el("span", "mdot me"); me.style.left = `${hx}px`; me.style.top = `${hy}px`;
      const zoom = el("div", "zoom");
      const full = box.classList.contains("full"), fs = el("button", null, full ? "⤡" : "⤢"); fs.type = "button"; fs.title = full ? "Back (F or Esc)" : "Full screen (F)";
      fs.setAttribute("aria-label", full ? "Leave full screen" : "Full screen"); fs.onclick = () => toggleFull(box); zoom.append(fs);
      for (const [t, dz, label] of [["+", 1, "Zoom in"], ["−", -1, "Zoom out"]]) { const b = el("button", null, t); b.type = "button"; b.setAttribute("aria-label", label);
        b.disabled = (dz > 0 && z >= T.max) || (dz < 0 && z <= 12); b.onclick = () => { view.zoom = (view.zoom || 0) + dz; tileMap(box, r, n, radius, rows); }; zoom.append(b); }
      zoom.append(recentre(box), baseButton(box, kind), shareButton(box));
      box.classList.toggle("sat", kind === "sat"); box.classList.toggle("carto", !!carto);
      const at = (p) => { const [x, y] = world(p); return [x - left, y - top]; };
      const scene = briefScene({ pts: [{ c: r, p: n.c, k: health(r), me: true }, ...n.list.map((x) => ({ c: x.r, p: x.p, k: x.k }))], at, mpp, w, h,
        rings: [[hx, hy, radius / 2 / mpp, `${radius / 2} m`], [hx, hy, radius / mpp, radius < 1000 ? `${radius} m` : "1 km"]],
        me: [hx, hy, r.nama || r.username], about: { what: `Radius ${radius < 1000 ? `${radius} m` : "1 km"} dari ${r.nama || r.username}`, near: r } });
      box.scene = scene;
      box.replaceChildren(tiles, ring(0.5, "half"), ring(1, ""), ...briefUnder(scene), ...dots, me, ...briefOver(scene), tip, zoom, el("span", "attr", T.attr));
      swapTiles(box, tiles, { z, kind, left, top, id: `near:${r.username}` });
    }
    // Drag a map to pan it: the picture follows the pointer, and every ~100 px (and on release) the tiles are drawn
    // again around the new centre, kept as a share of the world so zooming keeps the place. A press that moves less
    // than 4 px is still a click (a dot opens its customer). ◎ goes back to the start.
    function panMap(box) {
      if (box.panReady) return; box.panReady = true;
      let start = null, moved = false;
      const layer = () => [...box.children].filter((c) => !c.matches(".zoom, .seg, .attr, .tip, .brief, .foot, .sharesheet"));
      const shift = (dx, dy) => layer().forEach((c) => { c.style.translate = dx || dy ? `${dx}px ${dy}px` : ""; });
      const commit = (dx, dy) => { const g = box.geo; if (!g) return; box.ctr = [(g.cx - dx) / g.size, (g.cy - dy) / g.size]; box.redraw?.(); };
      box.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".zoom, .seg")) return;
        start = { x: e.clientX, y: e.clientY }; moved = false;
      });
      box.addEventListener("pointermove", (e) => {
        if (!start) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        if (!moved) { moved = true; box.classList.add("panning"); try { box.setPointerCapture(e.pointerId); } catch {} }
        if (Math.hypot(dx, dy) > 100) { commit(dx, dy); start = { x: e.clientX, y: e.clientY }; return; } // fresh tiles for the new edge
        shift(dx, dy);
      });
      const end = (e) => {
        if (!start) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null; box.classList.remove("panning");
        if (!moved) return;
        box.addEventListener("click", (c) => { c.stopPropagation(); c.preventDefault(); }, { capture: true, once: true }); // the drag isn't a click on a dot
        commit(dx, dy);
      };
      box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
      // Ctrl + wheel zooms (instead of the whole page), one level per notch, keeping the place under the pointer still
      let acc = 0, last = 0;
      box.addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault(); acc += e.deltaY;
        if (Math.abs(acc) < 40 || Date.now() - last < 180) return; // a touchpad sends many small steps
        const dz = acc < 0 ? 1 : -1; acc = 0; last = Date.now();
        const btn = box.querySelector(`.zoom button[aria-label="${dz > 0 ? "Zoom in" : "Zoom out"}"]`), g = box.geo;
        if (!btn || btn.disabled) return;
        if (g) { const r = box.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, ns = g.size * 2 ** dz;
          box.ctr = [(g.cx + dx) / g.size - dx / ns, (g.cy + dy) / g.size - dy / ns]; }
        btn.click();
      }, { passive: false });
    }
    // ---- the map's motion: a halftone screen ----
    // Loading: a faint dot screen with a sonar ring of brighter dots until the tiles arrive. A new view (zoom, full
    // screen, another radius, Map/Sat) keeps the old picture, scales it to where the new view puts it, then hands over
    // through a halftone dissolve: the new tiles appear through growing dots while the old ones shrink away. Panning and
    // data refreshes don't animate (and the dots don't pop again). Under half a second; off with reduced motion.
    let lastView = null; // the last map drawn, so a new map for the same customer (another radius) can carry on from it
    function swapTiles(box, tiles, v) {
      const prev = box.prevView || (lastView?.id === v.id && !lastView.tiles.isConnected ? lastView : null);
      box.prevView = lastView = { ...v, tiles };
      box.classList.remove("still");
      if (calm()) return;
      if (prev && prev.z === v.z && prev.kind === v.kind) {
        box.classList.add("still"); // same view, or panned: no pop
        if (prev.left === v.left && prev.top === v.top && prev.tiles !== tiles) { // a data refresh: keep the drawn tiles, and a loading screen or old view still on its way
          tiles.replaceWith(prev.tiles); box.prevView.tiles = lastView.tiles = prev.tiles;
          for (const x of box.htBusy || []) if (!x.isConnected) box.insertBefore(x, prev.tiles);
        }
        return;
      }
      const ready = Promise.race([Promise.all([...tiles.querySelectorAll("img")].map((im) => (im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; })))), new Promise((ok) => setTimeout(ok, 900))]);
      tiles.classList.add("ht-wait");
      if (!prev) { // first view: the loading screen
        const load = el("div", "ht-load"); box.insertBefore(load, tiles); box.htBusy = [load];
        ready.then(() => { box.htBusy = []; tiles.classList.replace("ht-wait", "ht-in"); load.classList.add("gone"); setTimeout(() => { load.remove(); tiles.classList.remove("ht-in"); }, 520); });
        return;
      }
      // the old picture, moved to where the new view puts it: a point at old-screen x lands at s·(x + oldLeft) − newLeft
      const ghost = prev.tiles, s = 2 ** (v.z - prev.z);
      ghost.classList.remove("ht-in", "ht-wait", "ht-out"); ghost.classList.add("ghost"); ghost.style.transform = ""; box.insertBefore(ghost, tiles); box.htBusy = [ghost];
      if (prev.kind === v.kind) { void ghost.offsetWidth; ghost.style.transform = `translate(${s * prev.left - v.left}px, ${s * prev.top - v.top}px) scale(${s})`; } // after a layout, so it moves
      ready.then(() => { box.htBusy = []; tiles.classList.replace("ht-wait", "ht-in"); ghost.classList.add("ht-out"); setTimeout(() => { ghost.remove(); ghost.style.transform = ""; ghost.classList.remove("ghost", "ht-out"); tiles.classList.remove("ht-in"); }, 520); });
    }
    function recentre(box) {
      const b = el("button", null, "◎"); b.type = "button"; b.title = "Back to the start"; b.setAttribute("aria-label", "Recentre the map");
      b.disabled = !box.ctr; b.onclick = () => { box.ctr = null; box.redraw?.(); }; return b;
    }
    // ---- the map as a brief for a technician ----
    // What's wrong, where, and how bad, readable on the map itself and in the picture it shares: a strip with the
    // severity and the counts, a legend, the problem customers named, labelled rings and a scale bar, the network boxes
    // from Planning's asset list (cached when Planning was opened in this browser), and the box most likely at fault.
    // Words on the map are Indonesian like the outage report, since the picture goes to the technicians.
    // A customer's condition: the customer list says online or not; the OLT's modem list says why it's down (LOS is a
    // cut or bent fibre, dying gasp is the power) and how strong the signal is (critical below −28 dBm, the ERP's line).
    const KIND = { los: ["Putus (LOS)", "#f12614"], pwr: ["Mati listrik", "#6b6c6b"], off: ["Offline", "#a3a4a3"], weak: ["Redaman tinggi", "#e0b252"], iso: ["Isolir", "#8a8b8a"], on: ["Online", "#55bc82"] };
    const RANK = { on: 0, iso: 1, weak: 2, off: 3, pwr: 3, los: 4 }, DOWN = new Set(["los", "pwr", "off"]);
    const LEVEL = { high: ["BERAT", "#f12614"], mid: ["SEDANG", "#e0b252"], low: ["RINGAN", "#a3a4a3"], ok: ["NORMAL", "#55bc82"] };
    function health(c, on = !!c.online) {
      if (c.isolir) return "iso";
      const o = modemOf(c).ont;
      if (!on) return o && /los/i.test(o.st) ? "los" : o && /dying|power/i.test(o.st) ? "pwr" : "off";
      return o && usable(o) && o.rx < -28 ? "weak" : "on";
    }
    const detail = (z) => (z.k === "weak" ? dbm(modemOf(z.c).ont?.rx) : z.k === "los" ? "LOS" : z.k === "pwr" ? "mati listrik" : "offline");
    const shortName = (c) => String(c.nama || c.username || "").trim().split(/\s+/).slice(0, 2).join(" ");
    // FAT/ODP/FDT/ODC with a location, from Planning's cached asset list; [] when Planning hasn't been opened here
    let netList = null, netLoading = null;
    const netAssets = () => (netLoading ||= (async () => {
      try { const cache = await caches.open(CACHE);
        for (const req of await cache.keys()) {
          if (!/networkAssets/.test(req.url) || !/OLT.*FAT|FAT.*OLT/.test(decodeURIComponent(req.url))) continue;
          const j = await (await cache.match(req)).json(), seen = new Set(), out = [];
          for (const a of j.data || []) {
            const type = String(a.tipeAset || "").toUpperCase(); if (seen.has(a.id) || !/^(FAT|ODP|FDT|ODC)$/.test(type)) continue; seen.add(a.id);
            const lat = num(a.lokasiKoordinat?.latitude ?? a.lat), lng = num(a.lokasiKoordinat?.longitude ?? a.lng); if (!lat || !lng) continue;
            const code = String(a.kodeAset || "").trim(); out.push({ type, code: code.toUpperCase().startsWith(type) ? code : `${type} ${code}`, p: { lat, lng } });
          }
          return (netList = out);
        }
      } catch {}
      return (netList = []);
    })());
    // the modem list and the asset list arrive after the first drawing: draw once more when they're in
    function waitForBrief(box) {
      if (!netList && !box.netWait) { box.netWait = true; netAssets().then(() => box.isConnected && box.redraw?.()); }
      if (!onts && !box.ontWait) { box.ontWait = true; ontIndex().then(() => box.isConnected && box.redraw?.()).catch(() => {}); }
    }
    // The box most likely at fault: with two or more customers down, the FAT/ODP closest to all of them (least total
    // distance), if it's within 400 m of them on average. A pointer for where to look first, not a proof.
    function suspect(down) {
      if (down.length < 2 || !netList?.length) return null;
      const mid = { lat: down.reduce((a, z) => a + z.p.lat, 0) / down.length, lng: down.reduce((a, z) => a + z.p.lng, 0) / down.length };
      let best = null;
      for (const a of netList) { if (!/FAT|ODP/.test(a.type) || metres(mid, a.p) > 800) continue;
        const sum = down.reduce((t, z) => t + metres(z.p, a.p), 0); if (!best || sum < best.sum) best = { a, sum }; }
      return best && best.sum / down.length <= 400 ? { ...best.a, avg: Math.round(best.sum / down.length) } : null;
    }
    function severity(pts) {
      const n = {}; for (const z of pts) n[z.k] = (n[z.k] || 0) + 1;
      const act = pts.filter((z) => z.k !== "iso").length, down = (n.los || 0) + (n.pwr || 0) + (n.off || 0), weak = n.weak || 0;
      const lv = down >= 5 || (down >= 3 && down / Math.max(1, act) >= 0.25) || (n.los || 0) >= 3 ? "high" : down >= 2 || weak >= 3 ? "mid" : down || weak ? "low" : "ok";
      return { n, act, down, weak, lv };
    }
    // Everything the brief shows, in map pixels, so the map on screen and the shared picture are drawn from one plan.
    function briefScene({ pts, at, mpp, w, h, rings = [], me = null, about = {} }) {
      const sev = severity(pts), probs = pts.filter((z) => z.k !== "on" && z.k !== "iso").sort((a, b) => RANK[b.k] - RANK[a.k]);
      const down = pts.filter((z) => DOWN.has(z.k)), fault = suspect(down);
      const vil = new Map(); for (const z of (probs.length ? probs : pts)) { const d = z.c.desa ? titleCase(z.c.desa.trim()) : ""; if (d) vil.set(d, (vil.get(d) || 0) + 1); }
      const villages = [...vil].sort((a, b) => b[1] - a[1]);
      const title = sev.down ? `${sev.down} dari ${sev.act} pelanggan mati` : sev.weak ? `${sev.weak} dari ${sev.act} redaman tinggi` : `Semua ${sev.act} pelanggan online`;
      const counts = ["los", "pwr", "off", "weak", "iso", "on"].filter((k) => sev.n[k]).map((k) => `${sev.n[k]} ${KIND[k][0].toLowerCase()}`).join(" · ");
      const sub = [about.what, villages.slice(0, 3).map(([d]) => d).join(", "), about.since ? `sejak ${hhmm(about.since)}` : `per ${hhmm(Date.now())}`].filter(Boolean).join(" · ");
      const inView = ([x, y], m = 0) => x >= -m && y >= -m && x <= w + m && y <= h + m;
      let assets = (netList || []).map((a) => ({ ...a, xy: at(a.p) })).filter((a) => inView(a.xy, 10));
      // zoomed out, hundreds of boxes bury the customers: keep the ones near a problem (200 m), at most 80
      if (assets.length > 80) assets = assets.filter((a) => probs.some((z) => metres(z.p, a.p) <= 200)).slice(0, 80);
      const faultXY = fault ? at(fault.p) : null;
      // name the problems where there's room: beside the dot, else the other side, above or below; never over the strip,
      // the legend or another name
      const used = [[0, 0, w, 72], [0, h - 58, w, h]], labels = [];
      const free = (r) => r[0] >= 4 && r[2] <= w - 40 && used.every((u) => r[2] < u[0] || r[0] > u[2] || r[3] < u[1] || r[1] > u[3]);
      if (faultXY) used.push([faultXY[0] - 18, faultXY[1] - 18, faultXY[0] + 18, faultXY[1] + 18], [faultXY[0] - 75, faultXY[1] + 18, faultXY[0] + 75, faultXY[1] + 40]); // the ring and its tag
      for (const z of probs) { if (labels.length >= 14) break;
        const [x, y] = at(z.p); if (!inView([x, y])) continue;
        const text = `${shortName(z.c)} · ${detail(z)}`, tw = text.length * 6.3 + 12, th = 18;
        const r = [[x + 9, y - th / 2], [x - 9 - tw, y - th / 2], [x - tw / 2, y - 12 - th], [x - tw / 2, y + 12]].map(([a, b]) => [a, b, a + tw, b + th]).find(free);
        if (r) { used.push(r); labels.push({ x: r[0], y: r[1], w: tw, text, k: z.k }); }
      }
      const shown = assets.length <= 30; // codes only when they fit; the squares always
      const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].filter((m) => m / mpp <= 110).pop() || 10;
      const legend = ["los", "pwr", "off", "weak", "iso", "on"].filter((k) => sev.n[k]).map((k) => [k, KIND[k][0]]);
      if (assets.length) legend.push(["box", "FAT / ODP"]);
      if (fault) legend.push(["fault", "Cek di sini"]);
      const dots = pts.map((z) => ({ ...z, xy: at(z.p) })).filter((z) => inView(z.xy, 8)).sort((a, b) => RANK[a.k] - RANK[b.k]);
      return { w, h, dots, sev, title, counts, sub, villages, probs, labels, rings, me, assets, shown, fault, faultXY, legend, scale: { px: nice / mpp, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` }, about, noNet: netList && !netList.length };
    }
    // below the dots: the network boxes and the suspected one; above them: names, strip, legend, scale
    function briefUnder(s) {
      const out = [];
      for (const a of s.assets) { const d = el("span", `asset ${a.type.toLowerCase()}`); d.style.left = `${a.xy[0]}px`; d.style.top = `${a.xy[1]}px`; d.title = a.code;
        if (s.shown && a.code !== s.fault?.code) d.append(el("i", null, a.code)); out.push(d); }
      if (s.faultXY) { const f = el("span", "fault"); f.style.left = `${s.faultXY[0]}px`; f.style.top = `${s.faultXY[1]}px`; f.append(el("i", null, `Cek di sini · ${s.fault.code}`)); out.push(f); }
      return out;
    }
    function briefOver(s) {
      const out = [];
      for (const [x, y, R, t] of s.rings) { const l = el("span", "ringlbl", t); l.style.left = `${x}px`; l.style.top = `${y - R}px`; out.push(l); }
      if (s.me) { const l = el("span", "melbl", s.me[2]); l.style.left = `${s.me[0]}px`; l.style.top = `${s.me[1]}px`; out.push(l); }
      for (const l of s.labels) { const d = el("span", `plbl ${l.k}`, l.text); d.style.left = `${l.x}px`; d.style.top = `${l.y}px`; out.push(d); }
      const strip = el("div", "brief"), lv = LEVEL[s.sev.lv], badge = el("b", `lv ${s.sev.lv}`, lv[0]);
      const t = el("div", "bt"); t.append(badge, el("span", null, s.title)); strip.append(t, el("div", "bs", s.sub));
      if (s.fault) strip.append(el("div", "bf", `Cek di sini: ${s.fault.code} (rata-rata ${s.fault.avg} m dari yang mati)`));
      out.push(strip);
      const leg = el("div", "legend"); for (const [k, label] of s.legend) { const i = el("span"); i.append(el("i", `k ${k}`), label); leg.append(i); }
      const sc = el("div", "scale"); sc.append(el("i"), s.scale.label); sc.firstChild.style.width = `${Math.round(s.scale.px)}px`;
      const foot = el("div", "foot"); foot.append(sc, leg); out.push(foot);
      return out;
    }
    // The note that goes with the picture: severity, where to look, and the problem customers with phone and location.
    function briefText(s) {
      const link = (p) => `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
      const lines = [`*GANGGUAN ${LEVEL[s.sev.lv][0]}* · ${s.title}`, s.about.what || "", s.counts];
      if (s.villages.length) lines.push(`Desa: ${s.villages.slice(0, 6).map(([d, n]) => `${d} (${n})`).join(", ")}`);
      if (s.fault) lines.push(`Cek di sini: ${s.fault.code} (perkiraan) ${link(s.fault.p)}`);
      for (const k of ["los", "pwr", "off", "weak"]) {
        const l = s.probs.filter((z) => z.k === k); if (!l.length) continue;
        lines.push("", `${KIND[k][0]} (${l.length}):`);
        l.slice(0, 20).forEach((z, i) => lines.push(`${i + 1}. ${z.c.nama || z.c.username} (${z.c.username})${k === "weak" ? ` · ${detail(z)}` : ""}${z.c.phone ? ` · ${z.c.phone}` : ""} · ${link(z.p)}`));
        if (l.length > 20) lines.push(`… dan ${l.length - 20} lagi`);
      }
      lines.push("", `Dibuat ${wib()} WIB`);
      return lines.filter((x, i, a) => x !== "" || (i > 0 && a[i - 1] !== "")).join("\n");
    }
    // The picture: the map's own tiles (those that allow it; Google's satellite doesn't, so that one shares on plain
    // dark) with the brief drawn on top, at twice the size for a phone screen.
    async function briefPng(box) {
      const s = box.scene, w = s.w, h = s.h, k = 2, cv = el("canvas"); cv.width = w * k; cv.height = h * k;
      const g = cv.getContext("2d"); g.scale(k, k); g.fillStyle = "#0f1214"; g.fillRect(0, 0, w, h);
      const imgs = [...box.querySelectorAll(".tiles:not(.ghost) img")]; // not the old view on its way out
      g.filter = imgs[0] ? getComputedStyle(imgs[0]).filter : "none";
      await Promise.all(imgs.map((im) => new Promise((ok) => { const i = new Image(); i.crossOrigin = "anonymous";
        i.onload = () => { try { g.drawImage(i, parseFloat(im.style.left), parseFloat(im.style.top), 256, 256); } catch {} ok(); }; i.onerror = () => ok(); i.src = im.src; })));
      g.filter = "none";
      const font = (wt, px) => { g.font = `${wt} ${px}px Inter, ui-sans-serif, system-ui, sans-serif`; };
      const pill = (x, y, ww, hh, r, fill) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); g.fillStyle = fill; g.fill(); };
      const dot = (x, y, kind, r = 6) => { g.beginPath(); g.arc(x, y, r, 0, 7);
        if (kind === "iso") { g.fillStyle = "rgba(7,9,11,.6)"; g.fill(); g.lineWidth = 2; g.strokeStyle = KIND.iso[1]; g.stroke(); return; }
        g.fillStyle = KIND[kind][1]; g.fill(); g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,.9)"; g.stroke(); };
      for (const [x, y, R] of s.rings) { g.beginPath(); g.arc(x, y, R, 0, 7); g.lineWidth = 1.5; g.strokeStyle = "rgba(233,225,220,.6)"; g.stroke(); }
      for (const a of s.assets) { g.fillStyle = "#3e7edf"; g.strokeStyle = "#07090b"; g.lineWidth = 1.5; g.fillRect(a.xy[0] - 4, a.xy[1] - 4, 8, 8); g.strokeRect(a.xy[0] - 4, a.xy[1] - 4, 8, 8);
        if (s.shown && a.code !== s.fault?.code) { font(500, 10); g.fillStyle = "rgba(170,200,255,.95)"; g.fillText(a.code, a.xy[0] + 7, a.xy[1] + 3); } }
      if (s.faultXY) { const [x, y] = s.faultXY; g.beginPath(); g.arc(x, y, 16, 0, 7); g.setLineDash([4, 3]); g.lineWidth = 2.5; g.strokeStyle = "#f12614"; g.stroke(); g.setLineDash([]);
        font(600, 11); const t = `Cek di sini · ${s.fault.code}`, tw = g.measureText(t).width + 12; pill(x - tw / 2, y + 20, tw, 18, 4, "#f12614"); g.fillStyle = "#fff"; g.fillText(t, x - tw / 2 + 6, y + 33); }
      for (const z of s.dots) if (!z.me) dot(z.xy[0], z.xy[1], z.k, RANK[z.k] > 1 ? 6.5 : 5);
      if (s.me) { const [x, y, name] = s.me; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fillStyle = "#e9e1dc"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#07090b"; g.stroke();
        font(600, 12); const tw = g.measureText(name).width + 12; pill(x - tw / 2, y + 12, tw, 20, 4, "rgba(233,225,220,.95)"); g.fillStyle = "#07090b"; g.fillText(name, x - tw / 2 + 6, y + 26); }
      for (const [x, y, R, t] of s.rings) { font(500, 10); const tw = g.measureText(t).width + 8; pill(x - tw / 2, y - R - 8, tw, 16, 3, "rgba(9,11,12,.85)"); g.fillStyle = "#e9e1dc"; g.fillText(t, x - tw / 2 + 4, y - R + 4); }
      for (const l of s.labels) { font(500, 11); pill(l.x, l.y, l.w, 18, 4, "rgba(9,11,12,.9)"); g.fillStyle = KIND[l.k][1]; g.fillRect(l.x, l.y + 3, 2.5, 12); g.fillStyle = "#efefed"; g.fillText(l.text, l.x + 7, l.y + 13); }
      // strip
      pill(8, 8, w - 16, s.fault ? 62 : 46, 6, "rgba(9,11,12,.92)");
      const lv = LEVEL[s.sev.lv]; font(700, 11); const bw = g.measureText(lv[0]).width + 12; pill(16, 15, bw, 18, 3, lv[1]); g.fillStyle = s.sev.lv === "high" ? "#fff" : "#07090b"; g.fillText(lv[0], 22, 28);
      font(600, 13); g.fillStyle = "#efefed"; g.fillText(s.title, 16 + bw + 8, 28, w - bw - 48);
      font(400, 11); g.fillStyle = "#b3b0af"; g.fillText(s.sub, 16, 46, w - 32);
      if (s.fault) { font(500, 11); g.fillStyle = "#ff8a7a"; g.fillText(`Cek di sini: ${s.fault.code} (rata-rata ${s.fault.avg} m dari yang mati)`, 16, 62, w - 32); }
      // legend and scale
      font(500, 11); const items = [], lines = [[]]; let x = 0;
      for (const [k, l] of s.legend) { const iw = g.measureText(l).width + 13; if (x && x + iw > w - 40) { lines.push([]); x = 0; } lines.at(-1).push([k, l, x]); x += iw + 10; }
      const fh = 30 + lines.length * 16; pill(8, h - fh - 6, w - 16, fh, 6, "rgba(9,11,12,.88)");
      const sy = h - fh + 12; g.fillStyle = "#e9e1dc"; g.fillRect(16, sy, s.scale.px, 1.5); g.fillRect(16, sy - 5, 1.5, 6); g.fillRect(16 + s.scale.px - 1.5, sy - 5, 1.5, 6); g.fillText(s.scale.label, 22 + s.scale.px, sy + 4);
      lines.forEach((row, i) => { const ly = sy + 22 + i * 16; for (const [k, l, lx] of row) { const x0 = 16 + lx;
        if (k === "box") { g.fillStyle = "#3e7edf"; g.fillRect(x0, ly - 8, 8, 8); }
        else if (k === "fault") { g.beginPath(); g.arc(x0 + 4, ly - 4, 5, 0, 7); g.setLineDash([2, 2]); g.lineWidth = 1.5; g.strokeStyle = "#f12614"; g.stroke(); g.setLineDash([]); }
        else dot(x0 + 4, ly - 4, k, 4);
        g.fillStyle = "#e9e1dc"; g.fillText(l, x0 + 13, ly); } });
      return cv;
    }
    function baseButton(box, kind) {
      const b = el("button", "bm", kind === "sat" ? "Map" : "Sat"); b.type = "button"; b.title = kind === "sat" ? "Street map" : "Satellite";
      b.onclick = () => { ls.set(BASEMAP, kind === "sat" ? "dark" : "sat"); box.redraw(); }; return b;
    }
    function shareButton(box) {
      const b = el("button", null, "⇪"); b.type = "button"; b.title = "Share with a technician: copies a picture of this map, then the note"; b.setAttribute("aria-label", "Share with a technician");
      b.onclick = () => {
        const png = briefPng(box).then((cv) => new Promise((ok) => cv.toBlob(ok, "image/png")));
        const sheet = el("div", "sharesheet"), msg = el("span", null, "Making the picture…"), acts = el("span");
        const done = el("button", "copy", "Close"); done.type = "button"; done.onclick = () => sheet.remove();
        const note = el("button", "copy", "Copy note"); note.type = "button"; note.onclick = () => copy(briefText(box.scene), note);
        const save = el("button", "copy", "Save PNG"); save.type = "button";
        save.onclick = () => png.then((bl) => { const a = el("a"); a.href = URL.createObjectURL(bl); a.download = `gangguan-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
        acts.append(note, save, done); sheet.append(msg, acts); box.querySelector(".sharesheet")?.remove(); box.append(sheet);
        sheet.addEventListener("pointerdown", (e) => e.stopPropagation());
        (navigator.clipboard?.write ? navigator.clipboard.write([new ClipboardItem({ "image/png": png })]) : Promise.reject())
          .then(() => { msg.textContent = "Picture copied: paste it into the chat, then the note."; })
          .catch(() => { msg.textContent = "Couldn't copy the picture here: save it instead."; });
      };
      return b;
    }
    // the customers on the same OLT PON port: when many of them are down together it's the line (PON, splitter, ODP),
    // not one house. Statuses come from the OLTs' cached ONT lists (kept 2 hours).
    // F over the map (or its ⤢ button) fills the window with it, F or Esc puts it back; the tiles are drawn again
    // for the new size. A window-filling layer rather than the browser's full screen, so it works in every browser.
    // (the map moves into a layer of its own on the page: inside the Dock, the Dock's animation would box it in)
    const fullMap = () => document.querySelector(".erp-dock-full .map");
    const dropFull = () => document.querySelector(".erp-dock-full")?.remove();
    function toggleFull(box) {
      if (!box) return;
      const layer = document.querySelector(".erp-dock-full");
      if (layer) { box.classList.remove("full"); box.fullHome?.replaceWith(box); layer.remove(); }
      else { const spot = el("span"); box.fullHome = spot; box.replaceWith(spot); const l = el("div", "erp-dock erp-dock-full"); box.classList.add("full"); l.append(box); document.body.append(l); }
      box.redraw?.();
    }
    // paste your CARTO key once; it stays in this browser's storage and goes only to CARTO's tile server
    function cartoKeyRow(redraw) {
      const row = el("div", "keyrow"), key = ls.get(CARTO_KEY, "");
      if (key) { const rm = el("button", "copy", "Remove"); rm.type = "button"; rm.onclick = () => { ls.set(CARTO_KEY, ""); redraw(); }; row.append("Dark map from CARTO with your key", rm); return row; }
      if (!view.keyOpen) { const b = el("button", "copy", "Use a CARTO key"); b.type = "button"; b.onclick = () => { view.keyOpen = true; redraw(); }; row.append(b); return row; }
      const inp = el("input", "field"); inp.type = "password"; inp.placeholder = "CARTO API key"; inp.autocomplete = "off"; inp.setAttribute("aria-label", "CARTO API key"); inp.dataset.k = "cartokey";
      const save = el("button", "btn", "Save"); save.type = "button";
      save.onclick = () => { const v = inp.value.trim(); if (!v) return; ls.set(CARTO_KEY, v); ls.set(BASEMAP, "dark"); view.keyOpen = false; redraw(); };
      inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); save.click(); } };
      row.append(inp, save); setTimeout(() => inp.focus(), 0); return row;
    }
    function ponLine(box, r, map) {
      if (!onts) { box.replaceChildren(el("p", "note ld", "Finding this customer's PON port on the OLTs… (the first time takes ~6 s)"));
        ontIndex().then(() => { if (box.isConnected) ponLine(box, r, map); }).catch(() => box.replaceChildren()); return; }
      const ont = modemOf(r).ont;
      if (!ont) { box.replaceChildren(el("p", "note", "This customer's modem isn't on any OLT's list, so there's no PON port to compare.")); return; }
      const same = onts.rows.filter((o) => o.pid === ont.pid && o.pon === ont.pon), off = same.filter((o) => o.st !== "online");
      const users = new Set(); for (const o of same) { const c = customerOf(o.sn, o, null); if (c) users.add(c.username); }
      map.ponSet = users; map.pon?.(users);
      const share = same.length ? off.length / same.length : 0, mine = ont.st !== "online";
      const verdict = off.length >= 3 && share >= 0.25 ? ["late", `${off.length} of ${same.length} down on this port together: most likely the line (PON, splitter or ODP), not one house.`]
        : mine && off.length <= 2 ? ["warn", "This modem is down but its PON is fine: most likely this house (power, modem, drop cable)."]
        : ["good", "This PON port looks normal."];
      const open = view.ponFor === r.username && view.ponOpen;
      const head = el("button", "item ponrow"); head.type = "button"; head.setAttribute("aria-expanded", String(!!open));
      head.append(el("span", `dot ${off.length >= 3 && share >= 0.25 ? "bad" : off.length ? "drop" : "on"}`), el("span", "t", `Same PON · ${ont.olt} · ${ont.pon}`),
        el("span", "r", `${off.length} / ${same.length} offline`), el("span", "s", `${same.length - off.length} online · ${users.size} matched to customers, outlined on the map · OLT list ${when(onts.at)}`));
      head.onclick = () => { view.ponFor = r.username; view.ponOpen = !open; ponLine(box, r, map); };
      const parts = [head, el("p", `note ${verdict[0]}`, verdict[1])];
      if (open) {
        if (!off.length) parts.push(el("p", "note", "Everyone on this port is online."));
        off.sort((a, b) => a.id - b.id).slice(0, 40).forEach((o, i) => {
          const c = customerOf(o.sn, o, null), b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
          b.append(el("span", `dot ${o.st === "offline" ? "off" : ""}`), el("span", "t", c?.nama || o.name || o.raw), el("span", "r", `ONU ${o.id}`),
            el("span", "s", [o.raw, o.st, o.seen ? `seen ${when(o.seen)}` : "", c ? c.username : "no customer linked"].filter(Boolean).join(" · ")));
          b.onclick = () => { if (c) { view.card = c; remember(c); } else view.modem = o.sn; view.sel = 0; draw(); };
          parts.push(b);
        });
      }
      box.replaceChildren(...parts);
    }

    // keys: Alt+K opens and closes; in the Dock, arrows move, Enter picks, Esc goes back or closes
    document.addEventListener("keydown", (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "k") { e.preventDefault(); panel ? close() : open(); return; }
      if (!panel || !panel.contains(document.activeElement) && document.activeElement !== document.body) return;
      // F over the map: full screen (the search box always has focus, so over the map F wins over typing)
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey && (panel.querySelector(".map:hover") || fullMap())
        && (document.activeElement === panel.querySelector(".top input") || !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? ""))) { e.preventDefault(); e.stopPropagation(); toggleFull(fullMap() || panel.querySelector(".map:hover")); return; }
      if (e.key === "Escape" && fullMap()) { e.preventDefault(); e.stopPropagation(); toggleFull(fullMap()); return; }
      // typing anywhere in the open Dock goes to its search box, no click needed
      if (view.mode !== "bulk" && /^\S$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "") && !document.activeElement?.isContentEditable) {
        if (view.card || view.mode || view.modem) { view.card = null; view.mode = null; view.modem = null; drawBody(); }
        panel.querySelector("input")?.focus(); return; // the key then lands in the box
      }
      if (e.key === "Escape") { e.preventDefault(); if (view.mode === "bulk" && bulk?.phase !== "paying") { view.mode = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.modem && !view.card) { view.modem = null; drawBody(); panel.querySelector("input")?.focus(); } else if ((view.mode === "signal" || view.mode === "pon" || view.mode === "health") && !view.card) { if (view.pon) { view.pon = null; if (view.from) { view.mode = view.from; view.from = null; } } else view.mode = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.mode === "radar" && !view.card) { if (view.nas) view.nas = null; else view.mode = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.card) { view.card = null; drawBody(); panel.querySelector("input")?.focus(); } else { close(); fab?.focus(); } }
      else if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "") && document.activeElement !== panel.querySelector(".top input")) return; // a form field in the Dock keeps its keys
      else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) { e.preventDefault(); view.sel = (view.sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((x, i) => x.setAttribute("aria-selected", String(i === view.sel))); items[view.sel].scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter" && document.activeElement?.tagName === "INPUT" && items[view.sel]) { e.preventDefault(); items[view.sel].click(); }
    }, true);
    document.addEventListener("pointerdown", (e) => { if (panel && !panel.contains(e.target) && !fab.contains(e.target) && !e.target.closest?.(".erp-dock-full")) close(); }, true);
    addEventListener("resize", place);
    addEventListener("erp-fast-saved", () => { if (panel) data().then(drawBody); }); // a fresher list was just saved

    const tick = () => { if (!document.body) return; mount(); learn(); runPending(); place(); };
    for (const m of ["pushState", "replaceState"]) { const orig = history[m]; history[m] = function () { const r = orig.apply(this, arguments); setTimeout(tick, 300); setTimeout(runPending, 1200); return r; }; }
    addEventListener("popstate", () => setTimeout(tick, 300));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(tick, 600)); else setTimeout(tick, 600);
    setInterval(() => { if (document.visibilityState === "visible") { mount(); place(); learn(); } }, 5000);
    setTimeout(() => radarTick(), 8000); setInterval(() => radarTick(), 60000);
  })();

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

  // ---------- Aktivasi: a helper card in the activation form ----------
  // Technical → Antrean Aktivasi → ⚡ opens "Aktivasi Akun & Provisioning OLT". The card on top of it:
  // - FAT/ODP: the one the technician reported, matched to the database even when written loosely ("\FAT LDN NW15",
  //   "FAT 8BBLH"), and the nearest FATs/ODPs to the install point with distance and ports in use; Use fills the form's
  //   FAT and port fields the way you would by hand;
  // - Modem: Scan all OLTs sets the form to «Semua OLT» and presses its own Scan (every OLT and router at once);
  // - a checklist of what the form still needs, live.
  // On the queue each install date also says how many days it has waited; over 30 days is marked.
  // Everything here only reads or fills the form; Konfirmasi stays yours.
  {
    const AQ = "/technical-dashboard/activation-queue";
    const set = (input, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value"); d.set.call(input, v); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const norm = (x) => String(x ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
    async function get(path) {
      const auth = await fsToken(); if (!auth) throw new Error("not signed in");
      const r = await realFetch(path, { headers: { authorization: auth } }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }
    let queue = null, queueAt = 0, assets = null, lastRow = "";
    // the row whose ⚡ you pressed: its customer id (the small mono text under the name)
    document.addEventListener("pointerdown", (e) => { const tr = e.target.closest?.("tr"); if (tr && location.pathname.startsWith(AQ)) lastRow = tr.textContent; }, true);
    async function loadQueue() {
      if (queue && Date.now() - queueAt < 120e3) return queue;
      const f = "fields=namaPemohon,dataId,installationData,networkSurvey,shareLokasiGmaps,teknologiKoneksi,jadwalPemasangan,desa,kecamatan";
      const parts = await Promise.all(["Menunggu Aktivasi Akun", "Menunggu Aktivasi Account"].map((v) => get(`/api/pg-read/prospectiveCustomers?where=statusVerifikasi%3A${encodeURIComponent(v)}&limit=500&${f}`).then((j) => j.data || []).catch(() => [])));
      queue = parts.flat(); queueAt = Date.now(); return queue;
    }
    async function loadAssets() {
      if (assets) return assets;
      const [opts, ...geo] = await Promise.all([get("/api/network-assets/odp-options?semua=1"),
        ...["FAT", "ODP"].map((t) => get(`/api/pg-read/networkAssets?where=tipeAset%3A${t}&fields=kodeAset,tipeAset,lokasiKoordinat,desa&limit=20000`).then((j) => j.data || []).catch(() => []))]);
      const at = new Map(geo.flat().map((a) => [a.id, a])), byCode = new Map(geo.flat().map((a) => [norm(a.kodeAset), a]));
      assets = (opts.options || []).filter((o) => o.kodeAset && o.kodeAset.trim() !== "..").map((o) => {
        const g = at.get(o.docId) || byCode.get(norm(o.kodeAset)), p = g?.lokasiKoordinat;
        return { ...o, key: norm(o.kodeAset), lat: p?.latitude ?? null, lng: p?.longitude ?? null };
      });
      return assets;
    }
    const where = (c) => { const m = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{2,3}\.\d{3,})/.exec(String(c?.shareLokasiGmaps || "")); return m ? { lat: +m[1], lng: +m[2] } : null; };
    // the technician's ODP text against the database: exact, then one code containing all of it, then every word found
    function reported(c, list) { return matchText(String(c?.installationData?.odpTerhubung || c?.networkSurvey?.odpTerdekat || ""), list); }
    function matchText(text, list) {
      const said = text.replace(/^[\s\\/]+/, "").trim();
      if (!said || norm(said).length < 3) return { said };
      const k = norm(said), words = said.toUpperCase().split(/[^A-Z0-9.]+/).map(norm).filter((w) => w.length > 1 && !/^(FAT|ODP|LDN)$/.test(w));
      let hits = list.filter((a) => a.key === k);
      if (!hits.length) hits = list.filter((a) => a.key.includes(k) || (k.length > 6 && k.includes(a.key) && a.key.length > 5))
        .sort((x, y) => Math.abs(x.key.length - k.length) - Math.abs(y.key.length - k.length)); // the closest in length first: "JIMAT 4C" before "JIMAT 4"
      if (!hits.length && words.length) hits = list.filter((a) => words.every((w) => a.key.includes(w)));
      return { said, hits: hits.slice(0, 3) };
    }
    async function useFat(dlg, a, port) {
      const btn = dlg.querySelector('[aria-label="Pilih FAT / ODP pelanggan dari database"]'); if (!btn) return false;
      btn.click(); await wait(250);
      const inp = document.querySelector("[cmdk-input]"); if (!inp) return false;
      set(inp, a.kodeAset); await wait(400);
      const item = [...document.querySelectorAll("[cmdk-item]")].find((it) => { const t = it.querySelector(".font-medium")?.firstChild?.textContent?.trim(); return t === a.kodeAset.trim(); });
      if (!item) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return false; }
      item.click(); await wait(300);
      if (port) { const p = dlg.querySelector('input[type="number"][placeholder="mis. 4"]'); if (p) set(p, String(port)); }
      return true;
    }
    async function scanAll(dlg) {
      const sel = [...dlg.querySelectorAll("select")].find((x) => /^Semua OLT/.test(x.options[0]?.textContent || "")); if (!sel) return;
      if (sel.value) { set(sel, ""); await wait(150); }
      [...dlg.querySelectorAll("button")].find((b) => /^Scan OLT/.test(b.textContent.trim()))?.click();
    }
    // what the form still needs, read straight from it
    function needs(dlg) {
      const fatBtn = dlg.querySelector('[aria-label="Pilih FAT / ODP pelanggan dari database"]'), fat = fatBtn && !/^(Pilih FAT|Memuat)/.test(fatBtn.textContent.trim());
      const port = dlg.querySelector('input[type="number"][placeholder="mis. 4"]')?.value;
      const sn = dlg.querySelector('input[placeholder^="Contoh: ZICG"]')?.value.trim();
      const olt = [...dlg.querySelectorAll("select")].find((x) => /^Semua OLT/.test(x.options[0]?.textContent || ""))?.value;
      const text = dlg.textContent, user = /Username "[^"]+" tersedia/.test(text) ? true : /Ganti username|sudah dipakai/i.test(text) ? false : null;
      const scanning = /Sedang memindai/.test(text);
      return [["FAT/ODP", !!fat], ["Port", !!port], ["OLT or modem", !!(sn || olt)], ["Modem SN", !!sn], ["Username", user]].map(([k, ok]) => ({ k, ok })).concat(scanning ? [{ k: "Scanning…", ok: null, busy: true }] : []);
    }
    const km = (m) => m == null ? "" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
    async function build(dlg) {
      const card = el("section", "erp-akt"); card.setAttribute("aria-label", "Dock: activation helper");
      const head = el("div", "hd"); head.append(el("span", "ey", "Dock · Aktivasi"), el("span", "chips"));
      const body = el("div", "bd"); body.append(el("p", "ld", "Reading the technician's report and the FAT list…"));
      card.append(head, body);
      const anchor = dlg.querySelector("h2")?.parentElement; (anchor || dlg.firstElementChild).after(card);
      try {
        const [list, rows] = await Promise.all([loadAssets(), loadQueue()]);
        const label = [...dlg.querySelectorAll("label")].find((l) => l.textContent.trim() === "Nama Pelanggan");
        const name = label?.parentElement?.querySelector("input")?.value?.trim().toUpperCase();
        const c = rows.find((r) => r.dataId && lastRow.includes(r.dataId)) || rows.find((r) => String(r.namaPemohon || "").trim().toUpperCase() === name) || null;
        body.replaceChildren();
        const inst = c?.installationData || {};
        if (c) {
          const facts = [inst.teknisi && `Technician ${inst.teknisi}`, (inst.odpTerhubung || c.networkSurvey?.odpTerdekat) && `ODP reported "${String(inst.odpTerhubung || c.networkSurvey?.odpTerdekat).trim()}"`,
            (inst.portOdp || c.networkSurvey?.portOdp) && `port ${inst.portOdp || c.networkSurvey?.portOdp}`, inst.redaman && `signal ${inst.redaman} dBm`, inst.modemTerpasang && `modem ${inst.modemTerpasang}`].filter(Boolean);
          body.append(el("p", "facts", facts.length ? facts.join(" · ") : "No installation report yet for this customer."));
        } else body.append(el("p", "facts", "Couldn't tell which customer this is: the suggestions below use nothing from the report."));
        const port = inst.portOdp || c?.networkSurvey?.portOdp || null, here = where(c);
        const row = (a, why, p = port, dist = false) => {
          const r = el("div", "opt"), used = `${a.portTerpakai ?? "?"}/${a.kapasitasPort || "?"} used${a.full ? " · FULL" : ""}`;
          const d = dist && here && a.lat != null ? km(metres(here, a)) : "";
          r.append(el("span", "code", a.kodeAset), el("span", "sub", [a.tipeAset, a.desa, used, d, why].filter(Boolean).join(" · ")));
          const b = el("button", null, "Use"); b.type = "button";
          b.onclick = async () => { b.disabled = true; b.textContent = "Filling…"; const ok = await useFat(dlg, a, p); b.textContent = ok ? "Filled" : "Not found in the form"; setTimeout(() => { b.disabled = false; b.textContent = "Use"; }, 2500); };
          r.append(b); return r;
        };
        // FAT/ODP: what the technician sends you first, the install report next, the nearest ones as a cross-check
        const fat = el("div", "blk"); fat.append(el("h4", null, "FAT / ODP"));
        const paste = el("input", "paste"); paste.type = "text"; paste.placeholder = "Paste what the technician sent, e.g. FAT 8BBLH port 6";
        paste.setAttribute("aria-label", "FAT from the technician"); const found = el("div", "blk");
        let tmo = 0;
        paste.oninput = () => { clearTimeout(tmo); tmo = setTimeout(() => {
          const t = paste.value, pm = /\bport\s*:?\s*(\d{1,2})\b/i.exec(t) || /[\/#-]\s*(\d{1,2})\s*$/.exec(t.trim());
          const said = pm ? t.replace(pm[0], " ") : t, m = matchText(said.replace(/\b(nya|nomor|no|di|ke|pakai|masuk|ya|pak|mas)\b\.?:?/gi, " ").replace(/\b(fat|odp)(\s+\1\b)+/gi, "$1"), list);
          const p = pm ? pm[1] : port;
          found.replaceChildren();
          if (!t.trim()) return;
          if (m.hits?.length) m.hits.forEach((a) => found.append(row(a, `matches what you pasted${p ? `, port ${p}` : ""}`, p)));
          else found.append(el("p", "warn", `Nothing in the FAT database matches "${m.said || t.trim()}". Check the code with the technician, or have it added in Aset & Peta.`));
        }, 250); };
        fat.append(paste, found);
        const rep = c ? reported(c, list) : { said: "" };
        if (rep.hits?.length) { fat.append(el("p", "sub", "From the installation report:")); rep.hits.forEach((a) => fat.append(row(a, `matches "${rep.said}"${port ? `, port ${port}` : ""}`))); }
        else if (rep.said) fat.append(el("p", "warn", `The installation report says "${rep.said}", which isn't in the FAT database.`));
        // the nearest ones, folded: a check that the technician's FAT is plausible, not a pick
        const nearBox = el("details", "near"); nearBox.append(el("summary", null, "Nearest FATs to the install point"));
        if (here) {
          list.filter((a) => a.lat != null && !a.full).map((a) => [a, metres(here, a)]).sort((x, y) => x[1] - y[1]).slice(0, 5).forEach(([a]) => nearBox.append(row(a, "", port, true)));
        } else nearBox.append(el("p", "sub", c?.shareLokasiGmaps ? "The install location is a short link, so no distances: open it from the queue map." : "No install location on record."));
        fat.append(nearBox);
        // username: other names in the ERP's own style (first name + initials + village code, 15 at most), each checked
        const un = el("div", "blk"); un.append(el("h4", null, "Username"));
        const ulabel = [...dlg.querySelectorAll("label")].find((l) => l.textContent.trim().startsWith("Username Radius")), uin = ulabel?.parentElement?.querySelector("input");
        const nameNow = [...dlg.querySelectorAll("label")].find((l) => l.textContent.trim() === "Nama Pelanggan")?.parentElement?.querySelector("input")?.value || c?.namaPemohon || "";
        if (uin && nameNow) {
          const words = nameNow.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
          // the village code is what's left after the name part; a trailing 2–9 on a 4-digit code is the form's "already taken" suffix
          const base = (words[0] || "") + words.slice(1).map((w) => w[0]).join(""), v = uin.value.toLowerCase();
          let k = 0; while (k < base.length && v[k] === base[k]) k++;
          let code = /^\d+$/.test(v.slice(k)) ? v.slice(k) : /\d{2,}$/.exec(v)?.[0] || "";
          if (code.length === 5 && /[2-9]$/.test(code)) code = code.slice(0, 4);
          const fit = (b, suf = "") => b.slice(0, Math.max(1, 15 - code.length - suf.length)) + code + suf;
          const desa = String(c?.desa || "").toLowerCase().replace(/[^a-z]/g, "");
          const ideas = [...new Set([
            words.length > 1 && fit(words[0] + words[1]),                            // danangagus0706
            words.length > 1 && fit(words[1] + words[0][0]),                         // agusd0706
            words.length > 1 && fit(words[words.length - 1] + words[0].slice(0, 3)), // prasdan0706
            words.length > 2 && fit(words[0] + words[1][0] + words[2]),              // danangapras0706
            words.length === 1 && fit(words[0].slice(0, 6)),                         // turkha0610
            words.length === 1 && desa && fit(words[0].slice(0, 5) + desa.slice(0, 3)), // turkhbel0610
            fit(base, "3"), fit(base, "4"),
          ].filter((u) => u && u.length >= 3 && u !== uin.value))].slice(0, 5);
          un.append(el("p", "sub", `In the form: ${uin.value || "–"}. Other names in the same style:`));
          for (const u of ideas) {
            const r = el("div", "opt"), st = el("span", "sub", "checking…");
            r.append(el("span", "code", u), st);
            const b = el("button", null, "Use"); b.type = "button"; b.disabled = true;
            b.onclick = () => { set(uin, u); b.textContent = "Filled"; setTimeout(() => (b.textContent = "Use"), 1500); };
            r.append(b); un.append(r);
            get(`/api/admin/ldn-radius/check-username?username=${encodeURIComponent(u)}`).then((j) => {
              const free = j.ok && !j.exists; st.textContent = free ? "free" : j.orphan ? "left over in RADIUS: avoid" : "taken"; st.className = `sub ${free ? "free" : "taken"}`; b.disabled = !free;
            }).catch(() => { st.textContent = "couldn't check"; });
          }
        }
        // modem
        const mod = el("div", "blk"); mod.append(el("h4", null, "Modem"));
        const scan = el("button", "wide", "Scan all OLTs and routers"); scan.type = "button"; scan.onclick = () => scanAll(dlg);
        mod.append(scan, el("p", "sub", "Runs the form's own scan of all 46 OLTs at once (about 20 s); pick the modem in its list. A modem picked there also fills the OLT and the router."));
        body.append(fat, un, mod);
      } catch (e) { body.replaceChildren(el("p", "warn", `Helper not loaded: ${e.message}`)); }
    }
    function tick() {
      if (!location.pathname.startsWith(AQ)) return;
      // the queue: days waiting next to each install date
      for (const td of document.querySelectorAll("tr td")) {
        if (td.dataset.dockAge || !/^\d{2} [A-Za-z]{3} \d{4}$/.test(td.textContent.trim())) continue;
        const [d, m, y] = td.textContent.trim().split(" "), mi = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"].indexOf(m.toLowerCase());
        if (mi < 0) continue;
        const days = Math.floor((Date.now() - new Date(+y, mi, +d)) / 864e5); td.dataset.dockAge = "1";
        td.append(el("span", `erp-age${days > 30 ? " old" : ""}`, days <= 0 ? "today" : `${days} d${days > 30 ? " · stale" : ""}`));
      }
      const dlg = [...document.querySelectorAll("[role=dialog]")].find((d) => /Aktivasi Akun & Provisioning OLT/.test(d.querySelector("h2")?.textContent || ""));
      if (!dlg) return;
      if (!dlg.querySelector(".erp-akt")) build(dlg);
      const chips = dlg.querySelector(".erp-akt .chips"); if (!chips) return;
      const now = needs(dlg), sig = JSON.stringify(now); if (chips.dataset.sig === sig) return; chips.dataset.sig = sig;
      // missing is just "to do"; only a taken username is an error
      chips.replaceChildren(...now.map((n) => el("span", `chip ${n.busy ? "busy" : n.ok === true ? "ok" : n.ok === false && n.k === "Username" ? "bad" : ""}`, n.k)));
    }
    // ---- after Konfirmasi: is it really working? ----
    // Pressing Konfirmasi keeps a note of what was activated. Once the form closes, a card in the corner checks every
    // 20 s for up to 15 minutes: the PPPoE session in RADIUS (online, IP, router) and the modem on its OLT (status,
    // signal). It ends with a verdict and a WhatsApp-ready note; a weak signal (below −27 dBm) is flagged while the
    // technician is still on site. Kept for this tab, so a reload doesn't lose it.
    const CHK = "erpDock.aktChecks";
    const checks = () => { try { return JSON.parse(sessionStorage.getItem(CHK) || "[]"); } catch { return []; } };
    const keep = (list) => { try { sessionStorage.setItem(CHK, JSON.stringify(list.slice(-4))); } catch {} };
    let armed = null; // what the form held when Konfirmasi was pressed
    document.addEventListener("pointerdown", (e) => {
      const b = e.target.closest?.("button"); if (!b || !/^Konfirmasi/.test(b.textContent.trim()) || b.disabled) return;
      const dlg = b.closest("[role=dialog]"); if (!dlg || !/Aktivasi Akun/.test(dlg.textContent)) return;
      const val = (label) => { const l = [...dlg.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith(label)); return l?.parentElement?.querySelector("input")?.value?.trim() || ""; };
      const olt = [...dlg.querySelectorAll("select")].find((x) => /^Semua OLT/.test(x.options[0]?.textContent || ""));
      armed = { at: Date.now(), name: val("Nama Pelanggan"), user: val("Username Radius"), sn: dlg.querySelector('input[placeholder^="Contoh: ZICG"]')?.value.trim() || "",
        fat: dlg.querySelector('[aria-label="Pilih FAT / ODP pelanggan dari database"]')?.textContent.replace(/·.*$/, "").trim() || "",
        port: dlg.querySelector('input[type="number"][placeholder="mis. 4"]')?.value || "", olt: olt?.value ? olt.selectedOptions[0].textContent : "" };
    }, true);
    function confirmWatch() {
      if (!armed) return;
      const open = [...document.querySelectorAll("[role=dialog]")].some((d) => /Aktivasi Akun/.test(d.textContent));
      if (open) { if (Date.now() - armed.at > 180e3) armed = null; return; } // still open long after: it failed, nothing to check
      if (armed.user) { keep([...checks().filter((c) => c.user !== armed.user), { ...armed, start: Date.now() }]); drawChecks(); }
      armed = null;
    }
    let sessions = null, ontCache = null;
    async function sessionOf(user) {
      if (!sessions || Date.now() - sessions.at > 15e3) { const j = await get("/api/admin/ldn-radius/panel?view=online"); sessions = { at: Date.now(), by: new Map((j.sessions || []).map((x) => [String(x.username).toLowerCase(), x])) }; }
      return sessions.by.get(user.toLowerCase()) || null;
    }
    // the modem on its OLT: the one named in the form first, the rest only if it isn't there
    async function ontOf(sn, oltName) {
      const want = norm(sn); if (!want) return null;
      if (!ontCache || Date.now() - ontCache.at > 600e3) ontCache = { at: Date.now(), profiles: (await get("/api/olt/profiles")).data || [] };
      const pr = [...ontCache.profiles].sort((a, b) => (b.name === oltName) - (a.name === oltName));
      for (let i = 0; i < pr.length; i += 6) {
        const found = (await Promise.all(pr.slice(i, i + 6).map((p) => get(`/api/olt/profiles/${p.id}/onts?cached=1`).then((j) => {
          const o = (j.data || []).find((x) => norm(x.serialNumber) === want); return o ? { ...o, olt: p.name } : null; }).catch(() => null)))).find(Boolean);
        if (found) return found;
      }
      return null;
    }
    const hm = (t) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    let box = null, polling = false;
    async function pollChecks() {
      if (polling || document.hidden) return; polling = true;
      try {
        const list = checks(); let changed = false;
        for (const c of list) {
          if (c.done || c.closed) continue;
          try {
            const s = await sessionOf(c.user);
            c.sess = s ? { ip: s.framedipaddress || "", ro: s.router || s.nasipaddress || "", up: Number(s.uptimeSec) || 0 } : null;
            if (c.sn) { const o = await ontOf(c.sn, c.olt); c.ont = o ? { olt: o.olt, pon: [o.frame, o.slot, o.port].filter((x) => x != null).join("/"), id: o.ontId, st: o.status || "", rx: o.rxPower ?? null, at: o.signalPolledAt || o.lastSeenAt || null } : null; }
            c.err = "";
          } catch (e) { c.err = e.message; }
          c.last = Date.now();
          if ((c.sess && (!c.sn || c.ont?.rx != null)) || Date.now() - c.start > 15 * 60e3) c.done = true;
          changed = true;
        }
        if (changed) { keep(list); drawChecks(); }
      } finally { polling = false; }
    }
    function verdict(c) {
      const rx = c.ont?.rx != null && c.ont.rx !== 0 ? Number(c.ont.rx) : null;
      if (c.sess && rx != null && rx < -27) return { cls: "warn", t: `Online, but the signal is weak (${rx.toFixed(1)} dBm): have the technician check the connectors before leaving` };
      if (c.sess) return { cls: "ok", t: rx != null ? `Working: online and the signal is good (${rx.toFixed(1)} dBm)` : "Online: the PPPoE session is up" };
      if (c.done) return { cls: "bad", t: "Not online after 15 minutes: check the activation went through, the modem's PPPoE settings and the cable" };
      return { cls: "wait", t: "Waiting for the modem to log in…" };
    }
    function note(c) {
      const rx = c.ont?.rx != null && c.ont.rx !== 0 ? Number(c.ont.rx) : null;
      return [`✅ Aktivasi ${c.name || c.user}`, `User PPPoE: ${c.user}`, c.sn && `SN modem: ${c.sn}${c.ont ? ` · ${c.ont.olt} PON ${c.ont.pon}` : ""}`,
        c.fat && `FAT: ${c.fat}${c.port ? ` port ${c.port}` : ""}`, rx != null && `Redaman: ${rx.toFixed(1)} dBm (${rx >= -25 ? "bagus" : rx >= -27 ? "cukup" : "lemah, mohon dicek"})`,
        c.sess ? `Status: online sejak ${hm(Date.now() - c.sess.up * 1000)}${c.sess.ip ? ` · IP ${c.sess.ip}` : ""}` : "Status: belum online"].filter(Boolean).join("\n");
    }
    function drawChecks() {
      const list = checks().filter((c) => !c.closed);
      if (!list.length) { box?.remove(); box = null; return; }
      if (!box) { box = el("aside", "erp-akt erp-akt-after"); box.setAttribute("aria-label", "After activation"); box.setAttribute("aria-live", "polite"); document.body.append(box); }
      box.replaceChildren(...list.map((c) => {
        const v = verdict(c), it = el("div", "aft");
        const hd = el("div", "hd"); hd.append(el("span", "ey", "After activation"), el("span", "who", c.name || c.user));
        const x = el("button", "x", "×"); x.type = "button"; x.title = "Close"; x.onclick = () => { keep(checks().map((k) => k.user === c.user ? { ...k, closed: true } : k)); drawChecks(); }; hd.append(x);
        const bd = el("div", "bd");
        bd.append(el("p", `verdict ${v.cls}`, v.t));
        const lines = [
          ["PPPoE", c.sess ? `online · ${c.sess.ro}${c.sess.ip ? ` · ${c.sess.ip}` : ""} · up ${Math.round(c.sess.up / 60)} min` : `${c.user} not online yet`],
          ["Modem", !c.sn ? "no SN in the form: authorise the ONT in the OLT module" : c.ont ? `${c.ont.st || "?"} · ${c.ont.olt} PON ${c.ont.pon}:${c.ont.id ?? "?"}${c.ont.rx ? ` · ${Number(c.ont.rx).toFixed(1)} dBm` : ""}${c.ont.at ? ` · read ${when(c.ont.at)}` : ""}` : `${c.sn} not on an OLT list yet`],
          ["FAT", c.fat ? `${c.fat}${c.port ? ` port ${c.port}` : ""}` : "–"]];
        for (const [k, t] of lines) { const r = el("p", "kv"); r.append(el("b", null, k), t); bd.append(r); }
        if (c.err) bd.append(el("p", "warn", c.err));
        bd.append(el("p", "sub", c.done ? `Checked ${hm(c.last)}` : `Checking every 20 s since ${hm(c.start)}${c.last ? ` · last ${hm(c.last)}` : ""}`));
        const cp = el("button", null, "Copy WhatsApp note"); cp.type = "button";
        cp.onclick = () => navigator.clipboard?.writeText(note(c)).then(() => { cp.textContent = "Copied"; setTimeout(() => (cp.textContent = "Copy WhatsApp note"), 1500); }).catch(() => { cp.textContent = "Couldn't copy"; });
        bd.append(cp); it.append(hd, bd); return it;
      }));
    }
    const when = (t) => { const m = Math.floor((Date.now() - new Date(t)) / 60000); return m < 1 ? "just now" : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
    setInterval(() => { tick(); confirmWatch(); }, 600);
    setInterval(pollChecks, 20e3);
    setTimeout(() => { if (checks().some((c) => !c.closed)) { drawChecks(); pollChecks(); } }, 1500);
    const css = el("style"); css.textContent = `
      .erp-akt-after { position: fixed; left: 16px; bottom: 16px; z-index: 2147483000; width: min(380px, calc(100vw - 32px)); max-height: 70vh; overflow: auto; margin: 0;
        box-shadow: inset 0 0 0 1px #363738, 0 22px 18px rgba(0,0,0,.2), 0 6px 5px rgba(0,0,0,.18); }
      .erp-akt-after .aft + .aft { border-top: 1px solid var(--hair); }
      .erp-akt-after .who { color: var(--paper); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
      .erp-akt-after .x { margin-left: auto; padding: 0 8px; background: none; color: var(--muted); font-size: 18px; line-height: 1; }
      .erp-akt-after .x:hover { color: var(--paper); }
      .erp-akt-after .verdict { margin: 0; font-weight: 500; }
      .erp-akt-after .verdict.ok { color: var(--green); } .erp-akt-after .verdict.warn { color: var(--amber); } .erp-akt-after .verdict.bad { color: #ff8a7a; } .erp-akt-after .verdict.wait { color: var(--paper); }
      .erp-akt-after .kv { margin: 0; font-size: 12px; } .erp-akt-after .kv b { display: inline-block; width: 52px; font-weight: 500; color: var(--muted); }
      .erp-akt-after .bd > button { justify-self: start; }
      .erp-akt { --bone: #e9e1dc; --paper: #efefed; --body: #b3b0af; --muted: #8a8b8a; --hair: #262727; --edge: #363738; --green: #55bc82; --red: #f12614; --amber: #e0b04f;
        margin: 4px 0 8px; border-radius: 8px; background: #090b0c; box-shadow: inset 0 0 0 1px var(--edge); color: var(--body); font: 400 13px/1.45 Inter, ui-sans-serif, system-ui, sans-serif; }
      .erp-akt .hd { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 14px; border-bottom: 1px solid var(--hair); }
      .erp-akt .ey { font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); display: inline-flex; align-items: center; gap: 8px; }
      .erp-akt .ey::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); }
      .erp-akt .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
      .erp-akt .chip { padding: 2px 8px; border-radius: 999px; font-size: 12px; box-shadow: inset 0 0 0 1px var(--edge); color: var(--muted); }
      .erp-akt .chip::before { content: "○ "; } .erp-akt .chip.ok { color: var(--green); } .erp-akt .chip.ok::before { content: "✓ "; }
      .erp-akt .chip.bad { color: #ff8a7a; } .erp-akt .chip.bad::before { content: "✕ "; } .erp-akt .chip.busy { color: var(--paper); } .erp-akt .chip.busy::before { content: "◌ "; }
      .erp-akt .bd { padding: 10px 14px 12px; display: grid; gap: 10px; }
      .erp-akt .facts { margin: 0; color: var(--paper); }
      .erp-akt .blk { display: grid; gap: 4px; }
      .erp-akt h4 { margin: 4px 0 2px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
      .erp-akt .opt { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 12px; align-items: center; padding: 6px 8px; border-radius: 6px; }
      .erp-akt .opt:hover { background: #1a1d1e; }
      .erp-akt .paste { width: 100%; box-sizing: border-box; height: 36px; padding: 0 10px; border: 0; border-radius: 6px; background: #1a1d1e; color: var(--paper);
        box-shadow: inset 0 0 0 1px var(--edge); font: 400 13px Inter, system-ui, sans-serif; }
      .erp-akt .paste:focus { outline: none; box-shadow: inset 0 0 0 1px var(--bone); }
      .erp-akt .sub.free { color: var(--green); } .erp-akt .sub.taken { color: var(--muted); text-decoration: line-through; }
      .erp-akt details.near summary { cursor: pointer; font-size: 12px; color: var(--muted); padding: 4px 0; }
      .erp-akt details.near summary:hover { color: var(--paper); }
      .erp-akt .code { color: var(--paper); font: 500 13px/1.4 "JetBrains Mono", ui-monospace, monospace; }
      .erp-akt .opt .sub { grid-column: 1; }
      .erp-akt .opt button { grid-row: 1 / 3; grid-column: 2; }
      .erp-akt .sub { margin: 0; font-size: 12px; color: var(--muted); }
      .erp-akt .warn { margin: 0; font-size: 12px; color: var(--amber); }
      .erp-akt button { border: 0; border-radius: 6px; padding: 6px 12px; font: 500 12px Inter, system-ui, sans-serif; cursor: pointer; background: var(--bone); color: #07090b; }
      .erp-akt button:disabled { opacity: .6; cursor: default; }
      .erp-akt button.wide { justify-self: start; }
      .erp-akt .ld { margin: 0; color: var(--muted); }
      .erp-akt .ld::before { content: ""; display: inline-block; vertical-align: -1px; width: 31px; height: 9px; margin-right: 8px;
        background: radial-gradient(circle, var(--bone) 0 1.2px, transparent 1.7px) 0 0 / 5px 5px; opacity: .6; animation: erp-akt-ld 1.2s ease-in-out infinite; }
      @keyframes erp-akt-ld { 50% { opacity: .2; } }
      .erp-age { display: inline-block; margin-left: 8px; padding: 1px 6px; border-radius: 999px; font-size: 11px; color: #8a8b8a; box-shadow: inset 0 0 0 1px #363738; white-space: nowrap; }
      .erp-age.old { color: #e0b04f; box-shadow: inset 0 0 0 1px rgba(224,176,79,.5); }
      @media (prefers-reduced-motion: reduce) { .erp-akt .ld::before { animation: none; } }`;
    (document.head || document.documentElement).append(css);
  }

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
