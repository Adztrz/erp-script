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

