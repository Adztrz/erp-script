// ==UserScript==
// @name         ERP — faster Work Orders, Planning and LDN search
// @namespace    adztrz
// @version      1.3
// @description  Work Orders: loads the newest 500 of each list instead of 8,000 (1000 or All any time). Planning: reuses the 11 MB of network assets for 15 minutes. LDN Radius → Pelanggan: instant search as you type, any word order, spacing and punctuation ignored.
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

  // Measured on 10 Nov 2026: Work Orders asked for limit=5000 (all recent) and limit=3000 (open), 11.6 MB, drew 6,347 rows
  // (205,000 elements) and froze the tab ~4.9 s. With 500 of each: 589 rows, 19,000 elements, ~0.4 s.
  // Planning downloads networkAssets twice (7.4 MB backbone + 3.8 MB OLT/ODP/…) every visit.
  const KEY = "erpFast.limit";          // "500" | "1000" | "all"
  const TTL = 15 * 60 * 1000;           // how long Planning's asset lists are reused
  const CACHE = "erp-fast-assets";
  const limit = () => { try { return localStorage.getItem(KEY) || "500"; } catch { return "500"; } };

  const realFetch = window.fetch;
  window.fetch = async function (input, init) {
    let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, location.href);

    // LDN Radius: borrow the page's own sign-in for the fast search's list (kept in memory only, never saved)
    if (u.pathname.startsWith("/api/admin/ldn-radius/")) {
      const auth = init?.headers ? new Headers(init.headers).get("authorization") : input instanceof Request ? input.headers.get("authorization") : null;
      if (auth) { const first = !ldnAuth; ldnAuth = auth; if (first && ldn.error) { ldn.error = ""; loadLdn(); } } // the search was waiting for it
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
        if (hit && Date.now() - at < TTL) { showAssets(at); return hit; }
        const res = await realFetch.call(this, input, init);
        if (res.ok) {
          const body = await res.clone().blob(), h = new Headers(res.headers);
          h.set("x-erp-fast-at", String(Date.now()));
          await box.put(u.href, new Response(body, { status: res.status, statusText: res.statusText, headers: h }));
        }
        showAssets(Date.now());
        return res;
      } catch { /* no cache: plain fetch */ }
    }
    return realFetch.call(this, input, init);
  };

  // ---------- the little switch, bottom-right ----------
  let assetsAt = 0;
  function noteTrimmed() { draw(); }
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
    #erp-fast .seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
    #erp-fast button { height: 30px; min-width: 44px; padding: 0 12px; border: 0; border-radius: 6px; background: none; color: var(--muted);
      font-family: inherit; font-size: 13px; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums; cursor: pointer;
      transition: color .2s cubic-bezier(.22, 1, .36, 1), background .2s cubic-bezier(.22, 1, .36, 1), transform .1s; }
    #erp-fast button:hover { color: var(--paper); background: rgba(255,255,255,.03); }
    #erp-fast button:active { transform: scale(.98); }
    #erp-fast button[aria-pressed="true"] { background: var(--raised); color: var(--paper); }
    #erp-fast .solo { box-shadow: inset 0 0 0 1px var(--edge); color: var(--paper); }
    #erp-fast .solo:hover { box-shadow: inset 0 0 0 1px #696a68; }
    #erp-fast button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    @media (max-width: 760px) { #erp-fast { left: 16px; right: 16px; justify-content: space-between; } #erp-fast button { height: 36px; } }
    @media (prefers-reduced-motion: reduce) { #erp-fast { animation: none; } #erp-fast button { transition: none; } }`;

  function draw() {
    if (!document.body) return void document.addEventListener("DOMContentLoaded", draw, { once: true });
    if (!document.getElementById("erp-fast-css")) {
      const s = document.createElement("style"); s.id = "erp-fast-css"; s.textContent = css; document.head.append(s);
    }
    let bar = document.getElementById("erp-fast");
    const onWO = location.pathname.startsWith("/work-orders"), onPlan = location.pathname.startsWith("/planning");
    if (!onWO && !onPlan) { bar?.remove(); return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "erp-fast"; bar.setAttribute("role", "group"); document.body.append(bar); }
    bar.replaceChildren();
    // tag-with-dot label: a word, then the part that matters in paper white
    const label = (word, value) => { const s = document.createElement("span"); s.className = "tag"; s.append(word); if (value) { const b = document.createElement("b"); b.textContent = value; s.append(" ", b); } bar.append(s); };
    const button = (parent, t, on, run, cls) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; if (on !== null) b.setAttribute("aria-pressed", String(on)); if (cls) b.className = cls; b.onclick = run; parent.append(b); };

    if (onWO) {
      bar.setAttribute("aria-label", "Work orders to load");
      label("Show newest", ""); // the chosen amount is the pressed button beside it
      const seg = document.createElement("span"); seg.className = "seg"; bar.append(seg);
      for (const v of ["500", "1000", "all"]) button(seg, v === "all" ? "All" : v, limit() === v, () => { try { localStorage.setItem(KEY, v); } catch {} location.reload(); });
    } else {
      bar.setAttribute("aria-label", "Planning network assets");
      const mins = assetsAt ? Math.floor((Date.now() - assetsAt) / 60000) : null;
      label("Assets", mins === null ? "Loading" : mins < 1 ? "Fresh" : `${mins} min old`);
      button(bar, "Refresh", null, async () => { try { await caches.delete(CACHE); } catch {} location.reload(); }, "solo");
    }
  }

  // ---------- LDN Radius → Pelanggan: a fast search beside the site's own ----------
  // Measured 10 Nov 2026: the site's search asks the server each time (1–4 s) and matches the typed text as one piece,
  // so a double space, words in another order or a trailing "." find nobody. Here all customers are loaded once
  // (500 per request, kept 30 minutes in this browser) and searched as you type: any word order, spacing and
  // punctuation ignored, across name, username, phone, address, village and router. Picking one puts its username
  // into the site's own search box, so the table shows that customer.
  let ldnAuth = null;
  const LDN_TTL = 30 * 60 * 1000, LDN_DB = "erp-fast", LDN_STORE = "ldn";
  const KEEP = ["username", "nama", "phone", "address", "desa", "kecamatanErp", "district", "router", "paket", "isolir", "online", "expirasi", "isInactive"];
  const fold = (s) => String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const digits = (s) => { let d = String(s ?? "").replace(/\D/g, ""); if (d.startsWith("62")) d = "0" + d.slice(2); return d; };
  let ldn = { rows: null, at: 0, loading: null, done: 0, pages: 0, error: "" };

  const idb = () => new Promise((ok, no) => { const r = indexedDB.open(LDN_DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(LDN_STORE); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  async function idbGet() { try { const db = await idb(); return await new Promise((ok) => { const q = db.transaction(LDN_STORE).objectStore(LDN_STORE).get("all"); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); } catch { return null; } }
  async function idbPut(v) { try { const db = await idb(); db.transaction(LDN_STORE, "readwrite").objectStore(LDN_STORE).put(v, "all"); } catch { /* the list just isn't kept */ } }

  function indexRows(rows) {
    for (const r of rows) {
      r._name = fold(r.nama);
      r._hay = ` ${r._name} ${fold(r.username)} ${fold(r.address)} ${fold(r.desa)} ${fold(r.kecamatanErp)} ${fold(r.district)} ${fold(r.router)} ${fold(r.paket)} ${digits(r.phone)} `;
    }
    return rows;
  }

  async function loadLdn(force = false) {
    if (ldn.loading) return ldn.loading;
    if (!force && ldn.rows && Date.now() - ldn.at < LDN_TTL) return;
    if (!force && !ldn.rows) { const kept = await idbGet(); if (kept?.rows) { ldn.rows = indexRows(kept.rows); ldn.at = kept.at; drawLdn(); if (Date.now() - kept.at < LDN_TTL) return; } }
    if (!ldnAuth) { ldn.error = "Open the Pelanggan list once so the search can sign in"; drawLdn(); return; }
    ldn.loading = (async () => {
      ldn.error = ""; ldn.done = 0;
      const page = async (p) => {
        const r = await realFetch(`/api/admin/ldn-radius/customers?page=${p}&pageSize=500`, { headers: { authorization: ldnAuth } });
        if (!r.ok) throw new Error(`The server said ${r.status}`);
        const j = await r.json(); ldn.done++; drawLdn();
        return j;
      };
      try {
        const first = await page(1);
        ldn.pages = Math.max(1, Math.ceil((first.total || 0) / 500));
        const out = [...(first.customers || [])], rest = Array.from({ length: ldn.pages - 1 }, (_, i) => i + 2);
        // three at a time, so the server isn't flooded
        for (let i = 0; i < rest.length; i += 3) for (const j of await Promise.all(rest.slice(i, i + 3).map(page))) out.push(...(j.customers || []));
        const rows = out.map((c) => Object.fromEntries(KEEP.map((k) => [k, c[k]])));
        ldn.rows = indexRows(rows); ldn.at = Date.now();
        idbPut({ at: ldn.at, rows });
      } catch (e) { ldn.error = `Couldn't load the list: ${e.message}`; }
      ldn.loading = null; drawLdn();
    })();
    return ldn.loading;
  }

  function searchLdn(q) {
    const words = fold(q).split(" ").filter(Boolean), num = digits(q);
    if (!words.length || !ldn.rows) return [];
    const out = [];
    for (const r of ldn.rows) {
      if (!words.every((w) => r._hay.includes(w)) && !(num.length >= 6 && r._hay.includes(num))) continue;
      // name starts with what you typed, then every word in the name, then anywhere
      const score = r._name.startsWith(words.join(" ")) ? 0 : words.every((w) => r._name.includes(w)) ? 1 : 2;
      out.push([score, r]);
      if (out.length > 400) break;
    }
    return out.sort((a, b) => a[0] - b[0] || a[1]._name.localeCompare(b[1]._name)).slice(0, 30).map((x) => x[1]);
  }

  const LDN_INPUT = 'input[placeholder*="username PPPoE"]';
  let ldnBox = null, ldnInput = null, ldnHits = [], ldnSel = 0, ldnQuery = "", ldnPicking = false;
  const ldnCss = `
    #erp-ldn { --card: #090b0c; --raised: #1a1d1e; --edge: #363738; --hair: #262727; --bone: #e9e1dc; --paper: #efefed; --body: #b3b0af; --muted: #8a8b8a; --green: #55bc82; --red: #f12614; --blue: #3e7edf;
      position: fixed; z-index: 2147483001; max-height: min(460px, 60vh); display: flex; flex-direction: column; border-radius: 8px; background: var(--card); color: var(--body);
      font: 400 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-feature-settings: "cv11", "tnum"; -webkit-font-smoothing: antialiased;
      box-shadow: inset 0 0 0 1px var(--edge), 0 40px 32px rgba(0,0,0,.18), 0 22px 18px rgba(0,0,0,.2), 0 12px 10px rgba(0,0,0,.2), 0 6px 5px rgba(0,0,0,.18), 0 2px 2px rgba(0,0,0,.2);
      animation: erp-fast-menu .25s cubic-bezier(.22, 1, .36, 1) both; transform-origin: top; }
    @keyframes erp-fast-menu { from { opacity: 0; transform: scale(.98) translateY(-4px); } }
    #erp-ldn .head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--hair); font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    #erp-ldn .head::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); flex: none; }
    #erp-ldn .head b { font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--paper); }
    #erp-ldn .head button { margin-left: auto; border: 0; background: none; color: var(--muted); font: inherit; letter-spacing: 0; text-transform: none; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
    #erp-ldn .head button:hover { color: var(--paper); background: rgba(255,255,255,.04); }
    #erp-ldn ul { list-style: none; margin: 0; padding: 4px; overflow: auto; }
    #erp-ldn li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
    #erp-ldn li[aria-selected="true"] { background: var(--raised); }
    #erp-ldn .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
    #erp-ldn .dot.on { background: var(--green); } #erp-ldn .dot.iso { background: var(--red); }
    #erp-ldn .nm { color: var(--paper); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #erp-ldn .nm mark { background: none; color: var(--bone); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(233,225,220,.4); }
    #erp-ldn .us { font: 12px/1.4 "JetBrains Mono", ui-monospace, Menlo, monospace; color: var(--body); }
    #erp-ldn .sub { grid-column: 2 / 4; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #erp-ldn .empty { padding: 16px 14px; color: var(--muted); }
    #erp-ldn .foot { padding: 8px 14px; border-top: 1px solid var(--hair); font-size: 12px; color: var(--muted); }
    #erp-ldn kbd { font: 11px "JetBrains Mono", ui-monospace, monospace; padding: 1px 5px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--edge); color: var(--body); }
    @media (prefers-reduced-motion: reduce) { #erp-ldn { animation: none; } }`;

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

  function placeLdn() {
    if (!ldnBox || !ldnInput?.isConnected) return;
    // as wide as the search box, at least 460px, lined up with its right edge and kept inside the window
    const r = ldnInput.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(Math.max(r.width, 460), vw - 16);
    ldnBox.style.top = `${r.bottom + 6}px`;
    ldnBox.style.left = `${Math.max(8, Math.min(r.right - w, vw - w - 8))}px`;
    ldnBox.style.width = `${w}px`;
  }

  function closeLdn() { ldnBox?.remove(); ldnBox = null; }
  function pickLdn(r) {
    if (!r || !ldnInput) return;
    closeLdn();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    ldnPicking = true; set.call(ldnInput, r.username); ldnInput.dispatchEvent(new Event("input", { bubbles: true })); ldnPicking = false; ldnQuery = r.username;
  }

  function drawLdn() {
    if (!ldnInput || !ldnInput.isConnected || !ldnQuery.trim() || document.activeElement !== ldnInput) { if (ldnBox && document.activeElement !== ldnInput) closeLdn(); return; }
    if (!document.getElementById("erp-ldn-css")) { const s = el("style"); s.id = "erp-ldn-css"; s.textContent = ldnCss; document.head.append(s); }
    if (!ldnBox) { ldnBox = el("div"); ldnBox.id = "erp-ldn"; ldnBox.setAttribute("role", "listbox"); ldnBox.setAttribute("aria-label", "Fast search"); document.body.append(ldnBox);
      ldnBox.addEventListener("mousedown", (e) => e.preventDefault()); } // keep focus in the search box
    const words = fold(ldnQuery).split(" ").filter(Boolean);
    ldnHits = searchLdn(ldnQuery); ldnSel = Math.min(ldnSel, Math.max(0, ldnHits.length - 1));
    const head = el("div", "head");
    if (ldn.rows) {
      const mins = Math.floor((Date.now() - ldn.at) / 60000);
      head.append("Fast search ", el("b", null, `${ldnHits.length > 29 ? "30+" : ldnHits.length} of ${ldn.rows.length.toLocaleString("id-ID")}`), ldn.loading ? ` · updating ${ldn.done}/${ldn.pages || "…"}` : ` · ${mins < 1 ? "just updated" : `${mins} min old`}`);
      const b = el("button", null, "Update"); b.type = "button"; b.onclick = () => loadLdn(true); head.append(b);
    } else head.append(ldn.error ? ldn.error : `Loading customers ${ldn.done}/${ldn.pages || "…"}`);
    const list = el("ul");
    ldnHits.forEach((r, i) => {
      const li = el("li"); li.setAttribute("role", "option"); li.setAttribute("aria-selected", String(i === ldnSel));
      li.append(el("span", `dot${r.isolir ? " iso" : r.online ? " on" : ""}`), marked(String(r.nama ?? ""), words), el("span", "us", r.username));
      li.append(el("span", "sub", [r.paket, r.desa, r.router, r.phone].filter(Boolean).join(" · ")));
      li.onclick = () => pickLdn(r);
      list.append(li);
    });
    const parts = [head];
    if (ldnHits.length) parts.push(list);
    else if (ldn.rows) parts.push(el("div", "empty", "Nobody matches all of those words"));
    const foot = el("div", "foot"); foot.append(el("kbd", null, "↑↓"), " choose · ", el("kbd", null, "Enter"), " show in the table · ", el("kbd", null, "Esc"), " close");
    if (ldnHits.length) parts.push(foot);
    ldnBox.replaceChildren(...parts);
    placeLdn();
    ldnBox.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }

  // one set of listeners for the page; the site redraws its search box, so they look it up each time
  document.addEventListener("input", (e) => {
    if (ldnPicking || !(e.target instanceof HTMLInputElement) || !e.target.matches(LDN_INPUT) || !location.pathname.startsWith("/ldn-radius")) return;
    ldnInput = e.target; ldnQuery = e.target.value; ldnSel = 0;
    loadLdn(); drawLdn();
  }, true);
  document.addEventListener("focusin", (e) => { if (e.target instanceof HTMLInputElement && e.target.matches(LDN_INPUT)) { ldnInput = e.target; ldnQuery = e.target.value; loadLdn(); drawLdn(); } }, true);
  document.addEventListener("focusout", (e) => { if (e.target === ldnInput) setTimeout(() => { if (document.activeElement !== ldnInput) closeLdn(); }, 0); }, true);
  document.addEventListener("keydown", (e) => {
    if (!ldnBox || e.target !== ldnInput) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); ldnSel = (ldnSel + (e.key === "ArrowDown" ? 1 : -1) + ldnHits.length) % Math.max(1, ldnHits.length); drawLdn(); }
    else if (e.key === "Enter" && ldnHits[ldnSel]) { e.preventDefault(); e.stopPropagation(); pickLdn(ldnHits[ldnSel]); }
    else if (e.key === "Escape") { e.preventDefault(); closeLdn(); }
  }, true);
  addEventListener("resize", placeLdn); addEventListener("scroll", placeLdn, true);

  // the site moves between pages without reloading: redraw when the address changes
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); setTimeout(draw, 0); return r; };
  }
  addEventListener("popstate", () => setTimeout(draw, 0));
  draw();
})();
