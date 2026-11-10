// ==UserScript==
// @name         ERP — Dock, fast search, faster Work Orders and Planning
// @namespace    adztrz
// @version      2.3
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
  let lastAuth = null; // the page's latest sign-in header (memory only)
  window.fetch = async function (input, init) {
    let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, location.href);

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
        const r = await realFetch(cfg.url(part, p, size), { headers: { authorization: st.auth } });
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
        if (i % 9 === 6) save(); // every nine pages: often enough to resume, not a rewrite per page
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
      const out = [], seen = new Set();
      let best = 0; // matches that can't be outranked (score 0); once there are 30, the rest of the list can't change the answer
      for (const r of st.rows) {
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
      if (out.length < 5) for (const r of st.rows) {
        if (seen.has(r)) continue;
        if (!words.every((w, i) => r._hay.includes(w) || (soft(w) && (soundHit(r, i) || (slack(w) && fuzzyHit(sounds[i], r._words, slack(w))))))) continue;
        const inName = words.every((w, i) => r._name.includes(w) || (soft(w) && (r._nameWords.some((x) => x.startsWith(sounds[i])) || (slack(w) && fuzzyHit(sounds[i], r._nameWords, slack(w))))));
        out.push([inName ? 5 : 6, r]);
      }
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
      bar.classList.toggle("on", !!st.loading);
      bar.firstChild.style.transform = `scaleX(${st.pages ? Math.min(1, st.done / st.pages) : 0.04})`;

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
        const old = body.querySelector(".empty");
        if (!old || old.textContent !== msg) body.replaceChildren(...(msg ? [el("div", "empty", msg)] : []));
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
    .erp-fs .dot.on { background: var(--green); } .erp-fs .dot.iso { background: var(--red); }
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
    /* loading: a bone line that grows with the pages, light sweeping across it */
    .erp-fs .bar { height: 1px; background: var(--hair); overflow: hidden; position: relative; opacity: 0; transition: opacity .3s; }
    .erp-fs .bar.on { opacity: 1; }
    .erp-fs .bar span { position: absolute; inset: 0; background: var(--bone); transform-origin: left; transform: scaleX(0); transition: transform .5s var(--out); }
    .erp-fs .bar.on::after { content: ""; position: absolute; inset: 0; width: 30%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.7), transparent); animation: erp-fs-sweep 1.4s var(--swap) infinite; }
    @keyframes erp-fs-sweep { from { transform: translateX(-100%); } to { transform: translateX(380%); } }
    .erp-fs .body { display: flex; flex-direction: column; min-height: 0; }
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
      .erp-fs, .erp-fs *, .erp-fs *::after { animation: none !important; transition: none !important; }
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
      dot: (r) => (r.isolir ? "iso" : r.online ? "on" : ""), sub: (r) => [r.paket, r.desa, r.router, r.phone],
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
      dot: (r) => (/lunas|paid|bayar/i.test(r.status) && !/belum|unpaid/i.test(r.status) ? "on" : /jatuh|overdue|telat|lewat|tunggak/i.test(r.status) ? "iso" : ""),
      sub: (r) => [r.status, rupiah(r.amount), r.period, r.desa, r.radiusUsername],
    }),
  ];

  // ---------- the Dock: a floating button (Alt+K) with customer lookup, pages and tools ----------
  // Everything here reads what this script already keeps in the browser (the LDN customer list, this month's invoices)
  // and pages you've seen in the sidebar; it never asks the server on its own, except Bulk Lunas when you press its
  // buttons. "Open in …" goes to the page and fills that page's own search box when it arrives.
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
    const prep = (rows) => { for (const r of rows) { r._name = fold(r.nama); r._hay = ` ${r._name} ${fold(r.username)} ${fold(r.address)} ${fold(r.desa)} ${fold(r.kecamatanErp)} ${fold(r.router)} ${fold(r.paket)} ${digits(r.phone)} ${fold(r.ip)} `;
      r._words = [...new Set(r._hay.trim().split(" ").filter((x) => x.length > 1 && !/^\d+$/.test(x)).map(sound))]; r._sound = ` ${r._words.join(" ")} `; } return rows; };
    async function data() {
      const kept = await idbGet("all");
      if (kept?.rows && kept.at !== custAt) { customers = prep(kept.rows); custAt = kept.at; }
      const now = new Date(), key = `inv-${now.getFullYear()}-${now.getMonth() + 1}`;
      if (key !== invKey || !invoices) { const k = await idbGet(key); if (k?.rows) { invoices = k.rows; invKey = key; } }
    }
    function findCustomers(q, max = 6) {
      if (!customers) return [];
      const words = fold(q).split(" ").filter(Boolean), num = digits(q); if (!words.length) return [];
      const sounds = words.map(sound), out = [];
      for (const r of customers) {
        let score = -1;
        if (num.length >= 6 && r._hay.includes(num)) score = 0;
        else if (words.every((w) => r._hay.includes(w))) score = r._name.startsWith(words.join(" ")) ? 0 : words.every((w) => r._name.includes(w)) ? 1 : 2;
        else if (words.every((w, i) => r._hay.includes(w) || (w.length >= 4 && r._sound.includes(" " + sounds[i])))) score = 3;
        if (score >= 0) out.push([score, r]);
      }
      if (out.length < 3) for (const r of customers) {
        if (out.some((x) => x[1] === r)) continue;
        if (words.every((w, i) => r._hay.includes(w) || (w.length >= 4 && fuzzyHit(sounds[i], r._words, w.length >= 9 ? 2 : 1)))) out.push([4, r]);
      }
      return out.sort((a, b) => a[0] - b[0] || (a[1]._name < b[1]._name ? -1 : 1)).slice(0, max).map((x) => x[1]);
    }
    const invoiceOf = (r) => invoices?.filter((v) => (v.radiusUsername && v.radiusUsername === r.username) || (!v.radiusUsername && fold(v.customerName) === r._name)) ?? [];
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
        animation: erp-dock-open .42s var(--out) both; }
      .erp-dock.out { animation: erp-dock-close .16s cubic-bezier(.4, 0, 1, 1) both; pointer-events: none; }
      @keyframes erp-dock-open { from { opacity: 0; transform: translateY(10px) scale(.96); filter: blur(3px); } }
      @keyframes erp-dock-close { to { opacity: 0; transform: translateY(6px) scale(.97); filter: blur(1px); } }
      .erp-dock .top { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--hair); }
      .erp-dock .top svg { width: 16px; height: 16px; color: var(--muted); flex: none; }
      .erp-dock .top input { flex: 1; min-width: 0; height: 32px; border: 0; outline: 0; background: none; color: var(--paper); font: inherit; font-size: 15px; }
      .erp-dock .top input::placeholder { color: var(--muted); }
      .erp-dock .shut { display: grid; place-items: center; width: 32px; height: 32px; margin-right: -6px; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; }
      .erp-dock .shut:hover { background: var(--raised); color: var(--paper); } .erp-dock .shut svg { width: 16px; height: 16px; }
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
      .erp-dock .dot.on { background: var(--green); box-shadow: 0 0 0 3px rgba(85,188,130,.15); } .erp-dock .dot.iso { background: var(--red); box-shadow: 0 0 0 3px rgba(241,38,20,.15); }
      .erp-dock .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 6px; }
      .erp-dock .tile { display: grid; justify-items: start; gap: 8px; padding: 12px; border: 0; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair);
        color: var(--paper); font: inherit; font-size: 13px; font-weight: 500; text-align: left; cursor: pointer; transition: box-shadow .2s, transform .15s var(--out); }
      .erp-dock .tile:hover, .erp-dock .tile[aria-selected="true"] { box-shadow: inset 0 0 0 1px #696a68; transform: translateY(-1px); }
      .erp-dock .tile svg { width: 18px; height: 18px; color: var(--bone); }
      .erp-dock .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 6px; }
      .erp-dock .stat { padding: 10px 12px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .stat b { display: block; font-size: 20px; font-weight: 500; letter-spacing: -.01em; color: var(--paper); font-variant-numeric: tabular-nums; }
      .erp-dock .stat span { font-size: 12px; color: var(--muted); }
      .erp-dock .stat.on b { color: var(--green); } .erp-dock .stat.iso b { color: #ff6a5c; }
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
      .erp-dock .counts { display: flex; gap: 12px; font-size: 13px; } .erp-dock .counts b { color: var(--paper); font-weight: 500; }
      .erp-dock .rise { animation: erp-dock-rise .45s var(--soft) both; animation-delay: calc(var(--i, 0) * 30ms); }
      @keyframes erp-dock-rise { from { opacity: 0; transform: translateY(8px); filter: blur(2px); } }
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
      view = { q: "", sel: 0, card: null, radius: view.radius, mode: bulk && bulk.phase !== "input" ? "bulk" : null }; // a bulk run in progress comes back
      draw(); panel.querySelector("input")?.focus();
      await data(); draw();
    }
    function close() {
      const p = panel; if (!p) return;
      panel = null; fab?.setAttribute("aria-expanded", "false");
      if (calm()) p.remove(); else { p.classList.add("out"); setTimeout(() => p.remove(), 170); }
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
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.success === false) throw new Error(j.error || j.message || `HTTP ${r.status}`);
      return j;
    }
    const newBulk = () => ({ phase: "input", rows: [], method: METHODS[0], date: todayIso(), note: "", armed: 0, stop: false, el: null });
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
    // ticking a month ticks the older ones too (the server pays oldest first); unticking clears the newer ones
    function tickMonth(row, i, on) { row.invs.forEach((v, j) => { if (on ? j <= i : j >= i) v.on = on; }); bulk.armed = 0; bulkDraw(); }
    const chosen = () => bulk.rows.filter((r) => r.state === "found").flatMap((r) => r.invs.filter((v) => v.on && !v.result?.ok).map((v) => [r, v]));
    async function pay() {
      const queue = chosen(); if (!queue.length) return;
      bulk.phase = "paying"; bulk.stop = false; bulk.armed = 0; bulk.done = 0; bulk.total = queue.length; bulkDraw();
      for (const [, v] of queue) {
        if (bulk.stop) break;
        v.result = { busy: true }; bulkDraw();
        try {
          const j = await api("/api/finance/invoices/bulk-mark-paid", { invoiceNumbers: [v.no], paymentMethod: bulk.method, notes: bulk.note.trim() || "Bulk Lunas (Dock)",
            paymentDate: bulk.date || undefined, rechargeMap: v.recharge ? { [v.no]: true } : {} });
          const sum = j.summary || {}, older = (j.tertuaDulu || [])[0], waiting = (j.results || []).find((x) => x?.belumDiproses), failed = (j.rechargeGagal || [])[0];
          const skip = (j.results || []).find((x) => x?.status === "skip" || x?.status === "error");
          v.result = sum.marked ? { ok: true, text: sum.recharged ? "Lunas · recharged" : "Lunas", warn: failed ? `RADIUS recharge failed: ${failed.reason}` : "" }
            : older ? { text: `Skipped: ${older.reason}` } : waiting ? { text: "Not processed yet (server restarting): try again" } : { text: `Skipped${skip?.reason ? `: ${skip.reason}` : ""}` };
        } catch (e) { v.result = { text: e.message || "Failed" }; }
        bulk.done++; bulkDraw();
      }
      bulk.phase = "done"; bulkDraw();
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
          for (const [i, v] of r.invs.entries()) {
            const m = el("label", "mrow"), cb = el("input"); cb.type = "checkbox"; cb.checked = v.on; cb.disabled = busy || v.result?.ok; cb.dataset.k = `${ri}-${i}`;
            cb.onchange = () => tickMonth(r, i, cb.checked);
            const t = el("span"); t.append(v.period || v.no, " ", el("span", v.status === "Jatuh Tempo" ? "late" : "sub", v.status === "Jatuh Tempo" ? "· overdue" : ""));
            m.append(cb, t, el("span", "mono", rupiah(v.amount)));
            const x = el("span", "x");
            if (v.radius?.canRecharge) {
              const l = el("label"), rc = el("input"); rc.type = "checkbox"; rc.checked = v.recharge; rc.disabled = busy || v.result?.ok; rc.dataset.k = `${ri}-${i}-r`;
              rc.onchange = () => { v.recharge = rc.checked; bulk.armed = 0; bulkDraw(); }; rc.onclick = (ev) => ev.stopPropagation();
              l.append(rc, v.radius.alreadyCovered ? "recharge (already covered)" : `recharge RADIUS (expires ${v.radius.expiryDate || "?"})`); x.append(l);
            } else if (v.radius) x.append(el("span", null, v.radius.failed ? "RADIUS preview failed: pays without recharge" : "no RADIUS account linked"));
            if (v.hutang) x.append(el("span", "warn", `promised to pay by ${String(v.hutang).slice(0, 10)}`));
            if (v.result?.busy) x.append(el("span", null, "Paying…"));
            else if (v.result) { x.append(el("span", v.result.ok ? "good" : "late", v.result.text)); if (v.result.warn) x.append(el("span", "warn", v.result.warn)); }
            m.append(x); box.append(m);
          }
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
        const method = el("select", "field"); method.disabled = busy; method.dataset.k = "method";
        for (const m of METHODS) { const o = el("option", null, m); o.value = m; o.selected = m === bulk.method; method.append(o); }
        method.onchange = () => { bulk.method = method.value; bulk.armed = 0; bulkDraw(); };
        const date = el("input", "field"); date.type = "date"; date.value = bulk.date; date.max = todayIso(); date.disabled = busy; date.dataset.k = "date";
        date.onchange = () => { bulk.date = date.value; bulk.armed = 0; bulkDraw(); };
        const note = el("input", "field"); note.placeholder = "Bulk Lunas (Dock)"; note.value = bulk.note; note.disabled = busy; note.dataset.k = "note";
        note.oninput = () => { bulk.note = note.value; bulk.armed = 0; };
        const lab = (t, f) => { const l = el("label", "lbl"); l.append(t, f); return l; };
        const two = el("div", "row2"); two.append(lab("Method", method), lab("Payment date", date));
        fields.push(two, lab("Note", note)); parts.push(sum);
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
          const armed = bulk.armed > Date.now();
          const btn = el("button", `btn wide ${armed ? "arm" : "primary"}`, !ch.length ? "Tick the months to pay" : armed
            ? `Click again: mark ${ch.length} paid (${people} customers, ${rupiah(total)})` : `Mark ${ch.length} Lunas · ${rupiah(total)}${recharges ? ` · ${recharges} recharge` : ""}`);
          btn.type = "button"; btn.disabled = !ch.length; btn.dataset.k = "pay";
          btn.onclick = () => { if (bulk.armed > Date.now()) pay(); else { bulk.armed = Date.now() + 5000; bulkDraw(); setTimeout(() => bulk?.armed && bulk.armed <= Date.now() && (bulk.armed = 0, bulkDraw()), 5100); } };
          parts.push(btn);
        }
      }
      form.replaceChildren(...fields); foot.replaceChildren(...parts); foot.hidden = !parts.length;
      if (focus) bulk.el.querySelector(`[data-k="${focus}"]`)?.focus();
    }

    function draw() {
      if (!panel) return;
      const top = el("div", "top"), input = el("input"); input.placeholder = "Customer, page or tool…"; input.value = view.q; input.setAttribute("aria-label", "Search the Dock");
      input.oninput = () => { view.q = input.value; view.sel = 0; view.card = null; view.mode = null; drawBody(); };
      input.onpaste = (e) => { const t = e.clipboardData?.getData("text") || ""; if (t.split("\n").filter((x) => x.trim()).length >= 2) { e.preventDefault(); openBulk(t); } }; // a pasted list: Bulk Lunas
      const shut = el("button", "shut"); shut.type = "button"; shut.setAttribute("aria-label", "Close the Dock"); shut.title = "Close (Esc)"; shut.append(svg(ICON.x)); shut.onclick = () => { close(); fab?.focus(); };
      top.append(svg(ICON.search), input, el("kbd", null, "Esc"), shut);
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
      items = []; const parts = [];
      panel.classList.toggle("wide", view.mode === "bulk");
      if (view.mode === "bulk") { parts.push(bulkView()); body.replaceChildren(...parts); items = []; return bulkDraw(); }
      if (view.card) parts.push(cardView(view.card));
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
      const e4 = el("div", "eyebrow"); e4.append("Tools"); out.push(e4, toolItem(0));
      const recent = ls.get(RECENT, []).map((u) => customers?.find((r) => r.username === u)).filter(Boolean);
      if (recent.length) { const e3 = el("div", "eyebrow"); e3.append("Recent customers"); out.push(e3, ...recent.slice(0, 5).map(custItem)); }
      if (!customers) out.push(el("p", "note", "To look customers up here, open LDN Radius → Pelanggan once: its fast search keeps the list in this browser."));
      return out;
    }
    function resultsView(q) {
      const out = [], cs = findCustomers(q), ps = findPages(q);
      if (cs.length) { const e = el("div", "eyebrow"); e.append("Customers"); out.push(e, ...cs.map(custItem)); }
      if (ps.length) { const e = el("div", "eyebrow"); e.append("Pages"); out.push(e, ...ps.map(pageItem)); }
      const tool = /^(bul|lun|bay|tan|pay|mas|mar)/.test(fold(q));
      if (tool) { const e = el("div", "eyebrow"); e.append("Tools"); out.push(e, toolItem(0)); }
      if (!cs.length && !ps.length && !tool) out.push(el("p", "note", customers ? "Nothing matches all of those words." : "No customer list yet: open LDN Radius → Pelanggan once."));
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
      fact("Active since", r.tglAktif); fact("Expires", r.expirasi); fact("ONT", r.ontSerial, { mono: true, copy: true }); fact("Partner", r.mitra);
      const inv = invoiceOf(r);
      if (inv.length) for (const v of inv.slice(0, 2)) fact(`Invoice ${v.period || ""}`.trim(), `${v.status || "?"} · ${rupiah(v.amount)}${v.dueDate ? ` · due ${String(v.dueDate).slice(0, 10)}` : ""}`);
      else if (invoices) fact("Invoice", "none this month in the kept list");
      const acts = el("div", "actions rise"); acts.style.setProperty("--i", "2");
      const act = (label, fn, primary) => { const b = el("button", `btn${primary ? " primary" : ""}`, label); b.type = "button"; b.onclick = fn; acts.append(b); };
      act("Open in LDN", () => openIn.ldn(r), true); act("Invoices", () => openIn.invoices(r)); act("Map Terpadu", () => openIn.map(r)); act("Master", () => openIn.master(r));
      const loc = where(r); if (loc) { const a = el("a", "btn", "Google Maps"); a.href = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`; a.target = "_blank"; a.rel = "noreferrer"; acts.append(a); }
      wrap.append(back, who, facts, acts, nearView(r));
      return wrap;
    }
    function nearView(r) {
      const box = el("div", "near rise"); box.style.setProperty("--i", "3");
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "0"; e.append("Nearby");
      const seg = el("div", "seg"); for (const m of [100, 300, 1000]) { const b = el("button", null, m < 1000 ? `${m} m` : "1 km"); b.type = "button"; b.setAttribute("aria-pressed", String(view.radius === m)); b.onclick = () => { view.radius = m; drawBody(); }; seg.append(b); }
      head.append(e, seg); box.append(head);
      const n = nearby(r, view.radius);
      if (!n) { box.append(el("p", "note", customers && !("lat" in r) ? "Locations arrive with the next refresh of the customer list (LDN → Pelanggan → Update)." : "This customer has no location saved.")); return box; }
      const cnt = { on: 0, off: 0, iso: 0 }; n.list.forEach((x) => cnt[state(x.r)]++);
      const counts = el("div", "counts"); counts.style.marginTop = "10px";
      for (const [key, label] of [["on", "online"], ["off", "offline"], ["iso", "isolir"]]) { const s = el("span"); s.append(el("b", null, String(cnt[key])), ` ${label}`); counts.append(s); }
      const cv = el("canvas"); cv.setAttribute("aria-label", `${n.list.length} customers within ${view.radius} metres`);
      box.append(counts, cv);
      requestAnimationFrame(() => plot(cv, n, view.radius));
      for (const [i, x] of n.list.slice(0, 8).entries()) { const it = custItem(x.r, i); it.querySelector(".r").textContent = `${Math.round(x.d)} m`; box.append(it); }
      if (n.list.length > 8) box.append(el("p", "note", `and ${n.list.length - 8} more within ${view.radius < 1000 ? `${view.radius} m` : "1 km"}`));
      return box;
    }
    // a small dot map: this customer in the middle, neighbours by status, rings at half and full radius; dots arrive outward
    function plot(cv, n, radius) {
      const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
      cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 8, kx = Math.cos(n.c.lat * Math.PI / 180);
      const pts = n.list.map((x) => ({ x: cx + ((x.p.lng - n.c.lng) * 111000 * kx / radius) * R, y: cy - ((x.p.lat - n.c.lat) * 111000 / radius) * R, s: state(x.r), d: x.d }));
      const col = { on: "#55bc82", off: "#6d6f6f", iso: "#f12614" }, t0 = performance.now(), still = calm();
      const frame = (t) => {
        const k = still ? 1 : Math.min(1, (t - t0) / 700);
        g.clearRect(0, 0, w, h);
        g.strokeStyle = "#262727"; g.lineWidth = 1; for (const f of [0.5, 1]) { g.beginPath(); g.arc(cx, cy, R * f, 0, Math.PI * 2); g.stroke(); }
        for (const p of pts) { const show = Math.min(1, Math.max(0, (k * 1.4 - p.d / radius * 0.8))); if (!show) continue;
          g.globalAlpha = show; g.fillStyle = col[p.s]; g.beginPath(); g.arc(p.x, p.y, p.s === "off" ? 2 : 2.6, 0, Math.PI * 2); g.fill(); }
        g.globalAlpha = 1; g.strokeStyle = "#e9e1dc"; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.stroke();
        if (k < 1 && cv.isConnected) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    // keys: Alt+K opens and closes; in the Dock, arrows move, Enter picks, Esc goes back or closes
    document.addEventListener("keydown", (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "k") { e.preventDefault(); panel ? close() : open(); return; }
      if (!panel || !panel.contains(document.activeElement) && document.activeElement !== document.body) return;
      // typing anywhere in the open Dock goes to its search box, no click needed
      if (view.mode !== "bulk" && /^\S$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "") && !document.activeElement?.isContentEditable) {
        if (view.card) { view.card = null; drawBody(); }
        panel.querySelector("input")?.focus(); return; // the key then lands in the box
      }
      if (e.key === "Escape") { e.preventDefault(); if (view.mode === "bulk" && bulk?.phase !== "paying") { view.mode = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.card) { view.card = null; drawBody(); panel.querySelector("input")?.focus(); } else { close(); fab?.focus(); } }
      else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) { e.preventDefault(); view.sel = (view.sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((x, i) => x.setAttribute("aria-selected", String(i === view.sel))); items[view.sel].scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter" && document.activeElement?.tagName === "INPUT" && items[view.sel]) { e.preventDefault(); items[view.sel].click(); }
    }, true);
    document.addEventListener("pointerdown", (e) => { if (panel && !panel.contains(e.target) && !fab.contains(e.target)) close(); }, true);
    addEventListener("resize", place);
    addEventListener("erp-fast-saved", () => { if (panel) data().then(drawBody); }); // a fresher list was just saved

    const tick = () => { if (!document.body) return; mount(); learn(); runPending(); place(); };
    for (const m of ["pushState", "replaceState"]) { const orig = history[m]; history[m] = function () { const r = orig.apply(this, arguments); setTimeout(tick, 300); setTimeout(runPending, 1200); return r; }; }
    addEventListener("popstate", () => setTimeout(tick, 300));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(tick, 600)); else setTimeout(tick, 600);
    setInterval(() => { if (document.visibilityState === "visible") { mount(); place(); learn(); } }, 5000);
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

  // the site moves between pages without reloading: redraw when the address changes
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); setTimeout(draw, 0); return r; };
  }
  addEventListener("popstate", () => setTimeout(draw, 0));
  draw();
})();
