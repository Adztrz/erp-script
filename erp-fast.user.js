// ==UserScript==
// @name         ERP — faster Work Orders, Planning, and LDN and invoice search
// @namespace    adztrz
// @version      1.5
// @description  Work Orders: loads the newest 500 of each list instead of 8,000 (1000 or All any time). Planning: reuses the 11 MB of network assets for 15 minutes. LDN Radius → Pelanggan and Finance → Invoices: instant search as you type, any word order, spacing and punctuation ignored, forgiving of spelling (winna = wina).
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

    // fast search: the page's own sign-in and which month it shows (see fastSearch below)
    if (u.pathname.startsWith("/api/")) {
      const auth = init?.headers ? new Headers(init.headers).get("authorization") : input instanceof Request ? input.headers.get("authorization") : null;
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

  // ---------- fast search: LDN Radius → Pelanggan, and Finance → Invoices ----------
  // Measured 10 Nov 2026: both pages ask the server on every search (LDN 1–4 s, invoices ~2.8 s) and match the typed text
  // as one piece, so a double space, words in another order or a trailing "." find nobody (0 of 5 in a test), and a
  // misspelt name rarely does. Here each list is loaded once (kept 30 minutes in this browser, refreshed in the
  // background) and searched as you type: any word order, spacing and punctuation ignored, forgiving of spelling.
  // Picking a result puts its username / invoice number into the site's own search box, so the table shows it.
  const SEARCH_TTL = 30 * 60 * 1000, IDB = "erp-fast", IDB_STORE = "ldn";
  const fold = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
  const fuzzyHit = (w, words, max) => words.some((x) => x[0] === w[0] && (near(w, x.slice(0, w.length), max) || near(w, x.slice(0, w.length + 1), max) || near(w, x, max)));

  const idb = () => new Promise((ok, no) => { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  async function idbGet(key) { try { const db = await idb(); return await new Promise((ok) => { const q = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); } catch { return null; } }
  async function idbPut(key, v) { try { const db = await idb(); db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(v, key); } catch { /* the list just isn't kept */ } }

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
    const st = { auth: null, key: cfg.key({}), rows: null, at: 0, loading: null, done: 0, pages: 0, error: "", total: 0, box: null, input: null, hits: [], sel: 0, query: "", picking: false };

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

    async function load(force = false) {
      if (st.loading) return st.loading;
      if (!force && st.rows && Date.now() - st.at < SEARCH_TTL) return;
      const key = st.key;
      if (!force && !st.rows) { const kept = await idbGet(key); if (kept?.rows && key === st.key) { st.rows = index(kept.rows); st.at = kept.at; st.total = kept.total || 0; draw(); if (Date.now() - kept.at < SEARCH_TTL) return; } }
      if (!st.auth) { st.error = "Open this list once so the search can sign in"; draw(); return; }
      st.loading = (async () => {
        st.error = ""; st.done = 0;
        const size = cfg.pageSize;
        const page = async (p) => {
          const r = await realFetch(cfg.url(key, p, size), { headers: { authorization: st.auth } });
          if (!r.ok) throw new Error(`The server said ${r.status}`);
          const j = await r.json(); st.done++; draw();
          return j;
        };
        try {
          const first = await page(1), total = cfg.total(first);
          st.pages = Math.max(1, Math.ceil(total / size));
          const got = new Map([[1, cfg.items(first)]]), rest = Array.from({ length: st.pages - 1 }, (_, i) => i + 2);
          // three at a time, so the server isn't flooded
          for (let i = 0; i < rest.length; i += 3) (await Promise.all(rest.slice(i, i + 3).map(async (p) => [p, cfg.items(await page(p))]))).forEach(([p, c]) => got.set(p, c));
          // a page that came back short (the server was busy) is asked for again, one at a time
          for (const p of rest) if (got.get(p).length < size && p < st.pages) got.set(p, cfg.items(await page(p)));
          if (rest.length && !got.get(st.pages).length) got.set(st.pages, cfg.items(await page(st.pages)));
          const rows = [...got.keys()].sort((a, b) => a - b).flatMap((p) => got.get(p)).map((c) => Object.fromEntries(cfg.keep.map((k) => [k, c[k]])));
          if (key === st.key) { st.rows = index(rows); st.at = Date.now(); st.total = total || rows.length; }
          idbPut(key, { at: Date.now(), rows, total });
        } catch (e) { st.error = `Couldn't load the list: ${e.message}`; }
        st.loading = null; draw();
      })();
      return st.loading;
    }

    function search(q) {
      const words = fold(q).split(" ").filter(Boolean), num = digits(q);
      if (!words.length || !st.rows) return [];
      const sounds = words.map(sound);
      // spelling-tolerant matching needs a real word: 4+ letters, matched at the start of a word in the record
      const soft = (w) => w.length >= 4;
      const soundHit = (r, i) => r._sound.includes(" " + sounds[i]);
      const slack = (w) => (w.length >= 9 ? 2 : w.length >= 4 ? 1 : 0); // letters that may be off: 1 from 4 letters, 2 from 9
      const out = [], seen = new Set();
      for (const r of st.rows) {
        let score;
        if (num.length >= 6 && r._hay.includes(num)) score = 0;
        // exact letters: name starts with what you typed, then every word in the name, then anywhere
        else if (words.every((w) => r._hay.includes(w))) score = r._name.startsWith(words.join(" ")) ? 0 : words.every((w) => r._name.includes(w)) ? 1 : 2;
        // spelled another way (winna / wina, soemarno / sumarno)
        else if (words.every((w, i) => r._hay.includes(w) || (soft(w) && soundHit(r, i)))) score = sounds.every((w) => r._nameWords.some((x) => x.startsWith(w))) ? 3 : 4;
        else continue;
        out.push([score, r]); seen.add(r);
      }
      // a letter or two off, only when the passes above found few (it's the slow part)
      if (out.length < 30) for (const r of st.rows) {
        if (seen.has(r)) continue;
        if (!words.every((w, i) => r._hay.includes(w) || (soft(w) && (soundHit(r, i) || (slack(w) && fuzzyHit(sounds[i], r._words, slack(w))))))) continue;
        const inName = words.every((w, i) => r._name.includes(w) || (soft(w) && (r._nameWords.some((x) => x.startsWith(sounds[i])) || (slack(w) && fuzzyHit(sounds[i], r._nameWords, slack(w))))));
        out.push([inName ? 5 : 6, r]);
      }
      return out.sort((a, b) => a[0] - b[0] || a[1]._name.localeCompare(b[1]._name)).slice(0, 30).map((x) => x[1]);
    }

    function place() {
      if (!st.box || !st.input?.isConnected) return;
      // as wide as the search box, at least 460px, lined up with its right edge and kept inside the window
      const r = st.input.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(Math.max(r.width, 460), vw - 16);
      st.box.style.top = `${r.bottom + 6}px`;
      st.box.style.left = `${Math.max(8, Math.min(r.right - w, vw - w - 8))}px`;
      st.box.style.width = `${w}px`;
    }
    function close() { st.box?.remove(); st.box = null; }
    function pick(r) {
      if (!r || !st.input) return;
      close();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      st.picking = true; set.call(st.input, cfg.pick(r)); st.input.dispatchEvent(new Event("input", { bubbles: true })); st.picking = false; st.query = cfg.pick(r);
    }

    function draw() {
      if (!st.input || !st.input.isConnected || !st.query.trim() || document.activeElement !== st.input) { if (st.box && document.activeElement !== st.input) close(); return; }
      if (!document.getElementById("erp-fs-css")) { const s = el("style"); s.id = "erp-fs-css"; s.textContent = fsCss; document.head.append(s); }
      if (!st.box) { st.box = el("div", "erp-fs"); st.box.setAttribute("role", "listbox"); st.box.setAttribute("aria-label", "Fast search"); document.body.append(st.box);
        st.box.addEventListener("mousedown", (e) => e.preventDefault()); } // keep focus in the search box
      const words = fold(st.query).split(" ").filter(Boolean);
      st.hits = search(st.query); st.sel = Math.min(st.sel, Math.max(0, st.hits.length - 1));
      const head = el("div", "head");
      if (st.rows) {
        const mins = Math.floor((Date.now() - st.at) / 60000), missing = st.total - st.rows.length;
        head.append(`Fast search${cfg.scope ? ` · ${cfg.scope(st.key)}` : ""} `, el("b", null, `${st.hits.length > 29 ? "30+" : st.hits.length} of ${st.rows.length.toLocaleString("id-ID")}${missing > 0 ? ` (${missing.toLocaleString("id-ID")} not loaded)` : ""}`),
          st.loading ? ` · updating ${st.done}/${st.pages || "…"}` : ` · ${mins < 1 ? "just updated" : `${mins} min old`}`);
        const b = el("button", null, "Update"); b.type = "button"; b.onclick = () => load(true); head.append(b);
      } else head.append(st.error ? st.error : `Loading ${cfg.noun} ${st.done}/${st.pages || "…"}`);
      const list = el("ul");
      st.hits.forEach((r, i) => {
        const li = el("li"); li.setAttribute("role", "option"); li.setAttribute("aria-selected", String(i === st.sel));
        li.append(el("span", `dot ${cfg.dot(r)}`), marked(String(cfg.name(r) ?? ""), words), el("span", "us", cfg.id(r)));
        li.append(el("span", "sub", cfg.sub(r).filter(Boolean).join(" · ")));
        li.onclick = () => pick(r);
        list.append(li);
      });
      const parts = [head];
      if (st.hits.length) parts.push(list);
      else if (st.rows) parts.push(el("div", "empty", "Nobody matches all of those words"));
      const foot = el("div", "foot"); foot.append(el("kbd", null, "↑↓"), " choose · ", el("kbd", null, "Enter"), " show in the table · ", el("kbd", null, "Esc"), " close");
      if (st.hits.length) parts.push(foot);
      st.box.replaceChildren(...parts);
      place();
      st.box.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }

    const here = () => location.pathname.startsWith(cfg.path);
    document.addEventListener("input", (e) => {
      if (st.picking || !here() || !(e.target instanceof HTMLInputElement) || !e.target.matches(cfg.input)) return;
      st.input = e.target; st.query = e.target.value; st.sel = 0;
      load(); draw();
    }, true);
    document.addEventListener("focusin", (e) => { if (here() && e.target instanceof HTMLInputElement && e.target.matches(cfg.input)) { st.input = e.target; st.query = e.target.value; load(); draw(); } }, true);
    document.addEventListener("focusout", (e) => { if (e.target === st.input) setTimeout(() => { if (document.activeElement !== st.input) close(); }, 0); }, true);
    document.addEventListener("keydown", (e) => {
      if (!st.box || e.target !== st.input) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); st.sel = (st.sel + (e.key === "ArrowDown" ? 1 : -1) + st.hits.length) % Math.max(1, st.hits.length); draw(); }
      else if (e.key === "Enter" && st.hits[st.sel]) { e.preventDefault(); e.stopPropagation(); pick(st.hits[st.sel]); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    }, true);
    addEventListener("resize", place); addEventListener("scroll", place, true);

    // the page's own requests: its sign-in (kept in memory only, never saved) and, for invoices, which month it shows
    return function seen(u, auth) {
      if (!u.pathname.startsWith(cfg.api)) return;
      if (auth) { const first = !st.auth; st.auth = auth; if (first && st.error) { st.error = ""; load(); } }
      const key = cfg.key(Object.fromEntries(u.searchParams));
      if (key !== st.key) { st.key = key; st.rows = null; st.total = 0; } // another month: its own list, loaded on the next search
    };
  }

  const fsCss = `
    .erp-fs { --card: #090b0c; --raised: #1a1d1e; --edge: #363738; --hair: #262727; --bone: #e9e1dc; --paper: #efefed; --body: #b3b0af; --muted: #8a8b8a; --green: #55bc82; --red: #f12614; --blue: #3e7edf;
      position: fixed; z-index: 2147483001; max-height: min(460px, 60vh); display: flex; flex-direction: column; border-radius: 8px; background: var(--card); color: var(--body);
      font: 400 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-feature-settings: "cv11", "tnum"; -webkit-font-smoothing: antialiased;
      box-shadow: inset 0 0 0 1px var(--edge), 0 40px 32px rgba(0,0,0,.18), 0 22px 18px rgba(0,0,0,.2), 0 12px 10px rgba(0,0,0,.2), 0 6px 5px rgba(0,0,0,.18), 0 2px 2px rgba(0,0,0,.2);
      animation: erp-fast-menu .25s cubic-bezier(.22, 1, .36, 1) both; transform-origin: top; }
    @keyframes erp-fast-menu { from { opacity: 0; transform: scale(.98) translateY(-4px); } }
    .erp-fs .head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--hair); font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .erp-fs .head::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); flex: none; }
    .erp-fs .head b { font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--paper); }
    .erp-fs .head button { margin-left: auto; border: 0; background: none; color: var(--muted); font: inherit; letter-spacing: 0; text-transform: none; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
    .erp-fs .head button:hover { color: var(--paper); background: rgba(255,255,255,.04); }
    .erp-fs ul { list-style: none; margin: 0; padding: 4px; overflow: auto; }
    .erp-fs li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
    .erp-fs li[aria-selected="true"] { background: var(--raised); }
    .erp-fs .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
    .erp-fs .dot.on { background: var(--green); } .erp-fs .dot.iso { background: var(--red); }
    .erp-fs .nm { color: var(--paper); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .erp-fs .nm mark { background: none; color: var(--bone); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(233,225,220,.4); }
    .erp-fs .us { font: 12px/1.4 "JetBrains Mono", ui-monospace, Menlo, monospace; color: var(--body); }
    .erp-fs .sub { grid-column: 2 / 4; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .erp-fs .empty { padding: 16px 14px; color: var(--muted); }
    .erp-fs .foot { padding: 8px 14px; border-top: 1px solid var(--hair); font-size: 12px; color: var(--muted); }
    .erp-fs kbd { font: 11px "JetBrains Mono", ui-monospace, monospace; padding: 1px 5px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--edge); color: var(--body); }
    @media (prefers-reduced-motion: reduce) { .erp-fs { animation: none; } }`;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const searches = [
    // LDN Radius → Pelanggan: all RADIUS customers (no passwords are loaded)
    fastSearch({
      path: "/ldn-radius", api: "/api/admin/ldn-radius/", input: 'input[placeholder*="username PPPoE"]', noun: "customers",
      key: () => "all", pageSize: 500,
      url: (key, p, size) => `/api/admin/ldn-radius/customers?page=${p}&pageSize=${size}`,
      total: (j) => j.total || 0, items: (j) => j.customers || [],
      keep: ["username", "nama", "phone", "address", "desa", "kecamatanErp", "district", "router", "paket", "isolir", "online", "expirasi", "isInactive"],
      name: (r) => r.nama, id: (r) => r.username, pick: (r) => r.username,
      hay: (r) => [r.username, r.address, r.desa, r.kecamatanErp, r.district, r.router, r.paket], numbers: (r) => [r.phone],
      dot: (r) => (r.isolir ? "iso" : r.online ? "on" : ""), sub: (r) => [r.paket, r.desa, r.router, r.phone],
    }),
    // Finance → Invoices: the month the page shows (it follows the month you pick there)
    fastSearch({
      path: "/finance/invoices", api: "/api/finance/invoices/", input: 'input[placeholder*="No. Invoice"]', noun: "invoices",
      key: (q) => { const now = new Date(); return `inv-${q.year || now.getFullYear()}-${q.month || now.getMonth() + 1}`; },
      scope: (key) => { const [, y, m] = key.split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; },
      pageSize: 200, // the most the server gives at once
      url: (key, p, size) => { const [, y, m] = key.split("-"); return `/api/finance/invoices/list?month=${m}&year=${y}&page=${p}&pageSize=${size}`; },
      total: (j) => j.total || 0, items: (j) => j.invoices || [],
      keep: ["invoiceNumber", "winpayTrxId", "customerName", "radiusUsername", "contractNumber", "desa", "kecamatan", "router", "paket", "phone", "amount", "status", "period", "dueDate", "paidDate"],
      name: (r) => r.customerName, id: (r) => r.invoiceNumber, pick: (r) => r.invoiceNumber,
      hay: (r) => [r.invoiceNumber, r.winpayTrxId, r.radiusUsername, r.contractNumber, r.desa, r.kecamatan, r.router, r.paket], numbers: (r) => [r.phone],
      dot: (r) => (/lunas|paid|bayar/i.test(r.status) && !/belum|unpaid/i.test(r.status) ? "on" : /jatuh|overdue|telat|lewat|tunggak/i.test(r.status) ? "iso" : ""),
      sub: (r) => [r.status, rupiah(r.amount), r.period, r.desa, r.radiusUsername],
    }),
  ];

  // the site moves between pages without reloading: redraw when the address changes
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); setTimeout(draw, 0); return r; };
  }
  addEventListener("popstate", () => setTimeout(draw, 0));
  draw();
})();
