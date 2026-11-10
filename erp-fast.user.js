// ==UserScript==
// @name         ERP — Dock, fast search, faster Work Orders and Planning
// @namespace    adztrz
// @version      2.15
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
      .erp-dock .map { position: relative; height: 240px; margin: 10px 0 6px; border-radius: 8px; overflow: hidden; background: #0f1214; box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .map .tiles img { position: absolute; width: 256px; height: 256px; max-width: none; pointer-events: none; user-select: none; }
      .erp-dock .map .tiles img { filter: invert(1) hue-rotate(180deg) brightness(.78) contrast(.92) saturate(.35); } /* OSM's light map, made dark */
      .erp-dock .map.sat .tiles img { filter: brightness(.8) saturate(.9); }
      .erp-dock .mdot.pon { box-shadow: 0 0 0 2px var(--bone); }
      .erp-dock .map .basemap { position: absolute; top: 8px; left: 8px; z-index: 4; background: rgba(9,11,12,.88); }
      .erp-dock .ponbox { margin: 2px 0 8px; } .erp-dock .ponbox .note { margin: 4px 10px 8px; }
      .erp-dock .ponrow { margin-top: 4px; box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .map .ring { position: absolute; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(233,225,220,.7); pointer-events: none; }
      .erp-dock .map .ring.half { box-shadow: none; border: 1px dashed rgba(233,225,220,.45); }
      .erp-dock .mdot { position: absolute; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; padding: 0; border: 1.5px solid rgba(7,9,11,.9); border-radius: 50%; background: var(--green); cursor: pointer;
        transition: transform .12s var(--out), box-shadow .12s; animation: erp-dock-pop .35s var(--out) backwards; animation-delay: var(--d, 0ms); }
      .erp-dock .mdot.off { background: #a3a4a3; } .erp-dock .mdot.iso { background: var(--red); }
      .erp-dock .mdot:hover, .erp-dock .mdot.hl { transform: scale(1.6); z-index: 2; box-shadow: 0 0 0 3px rgba(233,225,220,.75); }
      .erp-dock .mdot.me { width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px; background: var(--bone); border: 2.5px solid var(--canvas); box-shadow: 0 0 0 2px var(--bone); pointer-events: none; animation: none; z-index: 1; }
      @keyframes erp-dock-pop { from { transform: scale(0); opacity: 0; } }
      .erp-dock .map .tip { position: absolute; z-index: 3; transform: translate(-50%, calc(-100% - 12px)); max-width: 80%; padding: 4px 8px; border-radius: 6px; background: var(--card);
        color: var(--paper); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; box-shadow: inset 0 0 0 1px var(--edge), 0 4px 10px rgba(0,0,0,.4); }
      .erp-dock .map .tip.low { transform: translate(-50%, 14px); }
      .erp-dock .map .zoom { position: absolute; top: 8px; right: 8px; z-index: 4; display: grid; gap: 4px; }
      .erp-dock .map .zoom button { width: 28px; height: 28px; border: 0; border-radius: 6px; background: rgba(9,11,12,.88); color: var(--paper); font: 500 16px/1 Inter, system-ui, sans-serif; cursor: pointer; box-shadow: inset 0 0 0 1px var(--edge); }
      .erp-dock .map .zoom button:hover { box-shadow: inset 0 0 0 1px #696a68; } .erp-dock .map .zoom button:disabled { opacity: .4; cursor: default; }
      .erp-dock .map .attr { position: absolute; left: 6px; bottom: 4px; font-size: 10px; color: rgba(255,255,255,.75); text-shadow: 0 1px 2px #000; pointer-events: none; }
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
      .erp-dock .desa { grid-template-columns: minmax(0, 1fr) 120px auto; }
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
      view = { q: "", sel: 0, card: null, radius: view.radius, mode: bulk && bulk.phase !== "input" ? "bulk" : radar?.alerts.length ? "radar" : null }; // a bulk run in progress comes back; an outage opens on the radar
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
    // ticking a month ticks the older ones too (the server pays oldest first); unticking clears the newer ones
    function tickMonth(row, i, on, st, redraw) { row.invs.forEach((v, j) => { if (on ? j <= i : j >= i) v.on = on; }); st.armed = 0; redraw(); }
    const chosen = () => bulk.rows.filter((r) => r.state === "found").flatMap((r) => r.invs.filter((v) => v.on && !v.result?.ok).map((v) => [r, v]));
    const pay = () => payQueue(chosen(), bulk, bulkDraw, "Bulk Lunas (Dock)");
    // pays a list of [row, invoice], one request each in order; st holds the method, date, note and progress
    async function payQueue(queue, st, redraw, defaultNote) {
      if (!queue.length) return;
      st.phase = "paying"; st.stop = false; st.armed = 0; st.done = 0; st.total = queue.length; redraw();
      for (const [row, v] of queue) {
        if (st.stop) break;
        v.result = { busy: true }; redraw();
        try {
          const j = await api("/api/finance/invoices/bulk-mark-paid", { invoiceNumbers: [v.no], paymentMethod: st.method, notes: st.note.trim() || defaultNote,
            paymentDate: st.date || undefined, rechargeMap: v.recharge ? { [v.no]: true } : {} });
          const sum = j.summary || {}, older = (j.tertuaDulu || [])[0], waiting = (j.results || []).find((x) => x?.belumDiproses), failed = (j.rechargeGagal || [])[0];
          const skip = (j.results || []).find((x) => x?.status === "skip" || x?.status === "error");
          if (sum.marked) row.paidTo = v.period || row.paidTo;
          v.result = sum.marked ? { ok: true, text: sum.recharged ? "Lunas · recharged" : "Lunas", warn: failed ? `RADIUS recharge failed: ${failed.reason}` : "" }
            : older ? { text: `Skipped: ${older.reason}` } : waiting ? { text: "Not processed yet (server restarting): try again" } : { text: `Skipped${skip?.reason ? `: ${skip.reason}` : ""}` };
        } catch (e) { v.result = { text: e.message || "Failed" }; }
        st.done++; redraw();
      }
      st.phase = "done"; redraw();
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
      note.oninput = () => { st.note = note.value; st.armed = 0; };
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
      if (row.state === "looking") parts.push(el("p", "note", "Loading this customer's bills…"));
      else if (row.state === "error") { parts.push(el("p", "note late", row.err)); const again = el("button", "btn", "Try again"); again.type = "button"; again.onclick = () => b.load(); parts.push(again); }
      else if (row.state !== "found") parts.push(el("p", "note", "No invoices for this username."));
      else {
        parts.push(...monthRows(row, `c${row.user}`, busy, st, redraw));
        if (open.length) {
          const f = el("div", "bform"); f.append(...payFields(st, busy, `c${row.user}`, redraw)); parts.push(f);
          const what = ch.length === 1 ? ch[0].period : `${ch.length} months`, rc = ch.filter((v) => v.recharge).length;
          if (st.phase === "paying") { const s = el("button", "btn wide", `Paying ${Math.min(st.done + 1, st.total)} of ${st.total}…`); s.type = "button"; s.disabled = true; parts.push(s); }
          else { const btn = armButton(st, ch.length ? `Mark ${what} Lunas · ${rupiah(total)}${rc ? " · recharge" : ""}` : "Tick a month to pay",
              `Click again: ${what} paid by ${st.method}, ${rupiah(total)}`, () => payQueue(ch.map((v) => [row, v]), st, redraw, st.defaultNote), redraw, `c${row.user}pay`);
            btn.disabled = !ch.length; btn.style.marginTop = "10px"; parts.push(btn); }
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
      if (!radar) { out.push(el("p", "note", "Reading the routers…")); radarTick(true); return out; }
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
      stat(x.open, "online now", x.level === "down" || x.level === "drop" ? "iso" : "on"); stat(x.usual ?? "–", "usually"); const back15 = stat("…", "reconnected ≤15 min");
      wrap.append(stats);
      const chart = el("div", "near rise"); chart.style.setProperty("--i", "2");
      const cv = el("canvas", "big"); cv.setAttribute("aria-label", `${x.name} sessions over the last 24 hours`);
      const ticks = el("div", "ticks"); for (const hAgo of [24, 18, 12, 6, 0]) ticks.append(el("span", null, hAgo ? hhmm(Date.now() - hAgo * 3600000) : "now"));
      chart.append(el("div", "sub", `Sessions, last 24 hours${x.usual != null ? " · dashed: usual level" : ""}${x.since ? ` · dropping since ${hhmm(x.since)}` : ""}`), cv, ticks);
      wrap.append(chart); spark(cv, x.series, x.usual, true);
      const who2 = el("div", "near rise"); who2.style.setProperty("--i", "3"); wrap.append(who2);
      if (!customers) { who2.append(el("p", "note", "To see who's offline, open LDN Radius → Pelanggan once so the customer list is kept here.")); return wrap; }
      who2.append(el("p", "note", "Reading the live sessions…"));
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
      // a map: online faint green, offline red
      const pts = mine.map((c) => ({ c, p: where(c), on: !off.includes(c) })).filter((z) => z.p);
      if (pts.length > 5) { const cv = el("canvas"); cv.style.height = "200px"; cv.setAttribute("aria-label", `${off.length} offline customers on a map of ${x_name(ip)}`); parts.push(cv); requestAnimationFrame(() => fitPlot(cv, pts)); }
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
    // fit the dots to their own bounds (ignoring the farthest 2% each way)
    function fitPlot(cv, pts) {
      const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
      cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
      const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))];
      const la = pts.map((z) => z.p.lat).sort((a, b) => a - b), lo = pts.map((z) => z.p.lng).sort((a, b) => a - b);
      const [y0, y1, x0, x1] = [q(la, 0.02), q(la, 0.98), q(lo, 0.02), q(lo, 0.98)], kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
      const sx = (x1 - x0) * kx || 1e-4, sy = y1 - y0 || 1e-4, sc = Math.min((w - 16) / sx, (h - 16) / sy), ox = (w - sx * sc) / 2, oy = (h - sy * sc) / 2;
      const P = (p) => [ox + (p.lng - x0) * kx * sc, h - oy - (p.lat - y0) * sc];
      g.fillStyle = "rgba(85,188,130,.45)"; for (const z of pts) if (z.on) { const [x, y] = P(z.p); g.fillRect(x - 1, y - 1, 2, 2); }
      g.fillStyle = "#ff4a3a"; for (const z of pts) if (!z.on) { const [x, y] = P(z.p); g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
    }
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
          try { for (const o of (await api(`/api/olt/profiles/${p.id}/onts?cached=1`)).data || []) if (o.serialNumber) rows.push({ sn: snNorm(o.serialNumber), raw: o.serialNumber, pid: p.id, olt: p.name,
            pon: [o.frame, o.slot, o.port].filter((x) => x != null).join("/"), id: o.ontId, st: o.status, rx: o.rxPower ?? null, dist: o.distance ?? o.signalDistance ?? null,
            pppoe: o.pppoeUsername || "", name: o.customerName || "", model: o.model || o.vendor || p.vendor || "", seen: o.signalPolledAt || o.lastSeenAt || null }); } catch { /* that OLT is skipped */ } } }));
        const v = { at: Date.now(), rows }; idbPut("onts", v); onts = indexOnts(v);
        if (panel && !document.activeElement?.closest?.(".modem")) drawBody();
        return onts;
      })().finally(() => { ontsLoading = null; }));
    }
    const indexOnts = (v) => ({ at: v.at, rows: v.rows, bySn: new Map(v.rows.map((o) => [o.sn, o])), byUser: new Map(v.rows.filter((o) => o.pppoe).map((o) => [lower(o.pppoe), o])) });
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
    const ontState = (o) => (!o ? "" : /online|working/i.test(o.st) ? "on" : /los|dying|offline/i.test(o.st) ? "iso" : "off");
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
      if (!onts || !acs) { parts.push(el("p", "note", "Looking the modem up on the OLTs… (the first time takes about 10 seconds)")); m.el.replaceChildren(...parts); return; }
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
      if (w.busy) { box.append(el("p", "note", "Reading the live session and asking the ERP…")); return box; }
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

    function draw() {
      if (!panel) return;
      const top = el("div", "top"), input = el("input"); input.placeholder = "Customer, modem SN, page or tool…"; input.value = view.q; input.setAttribute("aria-label", "Search the Dock");
      input.oninput = () => { view.q = input.value; view.sel = 0; view.card = null; view.mode = null; view.modem = null; drawBody(); };
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
      else if (view.modem) { const w = el("div", "card"), back = el("button", "back", "← Back"); back.type = "button"; back.onclick = () => { view.modem = null; drawBody(); };
        w.append(back, modemBox(view.modem, null)); parts.push(w); }
      else if (view.mode === "radar") parts.push(...radarView());
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
      const e4 = el("div", "eyebrow"); e4.append("Tools"); out.push(e4, radarItem(0)); // Bulk Lunas shows when searched (or a list is pasted)
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
        else { out.push(el("p", "note", "Looking modems up on the OLTs…")); Promise.all([ontIndex(), acsIndex()]).then(() => { if (view.q === q && !view.card) drawBody(); }); }
      }
      const tool = /^(bul|lun|bay|tan|pay|mas|mar)/.test(fold(q)), net = /^(rad|out|gan|mat|rou|off|jar|dow|put)/.test(fold(q));
      if (tool || net) { const e = el("div", "eyebrow"); e.append("Tools"); out.push(e); if (net) out.push(radarItem(0)); if (tool) out.push(toolItem(1)); }
      if (!cs.length && !ps.length && !tool && !net && !snLike(q)) out.push(el("p", "note", customers ? "Nothing matches all of those words." : "No customer list yet: open LDN Radius → Pelanggan once."));
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
      fact("Active since", r.tglAktif); fact("Expires", r.expirasi && !isNaN(new Date(r.expirasi)) ? new Date(r.expirasi).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : r.expirasi); fact("ONT", r.ontSerial, { mono: true, copy: true }); fact("Partner", r.mitra);
      const acts = el("div", "actions rise"); acts.style.setProperty("--i", "2");
      const act = (label, fn, primary) => { const b = el("button", `btn${primary ? " primary" : ""}`, label); b.type = "button"; b.onclick = fn; acts.append(b); };
      act("Open in LDN", () => openIn.ldn(r), true); act("Invoices", () => openIn.invoices(r)); act("Map Terpadu", () => openIn.map(r)); act("Master", () => openIn.master(r));
      const loc = where(r); if (loc) { const a = el("a", "btn", "Google Maps"); a.href = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`; a.target = "_blank"; a.rel = "noreferrer"; acts.append(a); }
      const bill = payBox(r); billDraw(bills.get(r.username));
      wrap.append(back, who, facts, acts, bill, modemBox(`u:${r.username}`, r), nearView(r));
      return wrap;
    }
    function nearView(r) {
      const box = el("div", "near rise"); box.style.setProperty("--i", "3");
      const head = el("div", "row"), e = el("div", "eyebrow"); e.style.margin = "0"; e.append("Nearby");
      const seg = el("div", "seg"); for (const m of [100, 300, 1000]) { const b = el("button", null, m < 1000 ? `${m} m` : "1 km"); b.type = "button"; b.setAttribute("aria-pressed", String(view.radius === m)); b.onclick = () => { view.radius = m; view.zoom = 0; drawBody(); }; seg.append(b); }
      head.append(e, seg); box.append(head);
      const n = nearby(r, view.radius);
      if (!n) { box.append(el("p", "note", customers && !("lat" in r) ? "Locations arrive with the next refresh of the customer list (LDN → Pelanggan → Update)." : "This customer has no location saved.")); return box; }
      const cnt = { on: 0, off: 0, iso: 0 }; n.list.forEach((x) => cnt[state(x.r)]++);
      const counts = el("div", "counts"); counts.style.marginTop = "10px";
      for (const [key, label] of [["on", "online"], ["off", "offline"], ["iso", "isolir"]]) { const s = el("span"); s.append(el("b", null, String(cnt[key])), ` ${label}`); counts.append(s); }
      const map = el("div", "map"); map.setAttribute("role", "group"); map.setAttribute("aria-label", `Map of ${n.list.length} customers within ${view.radius} metres`);
      const pon = el("div", "ponbox");
      box.append(counts, map, pon);
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
    const BASEMAP = "erpDock.basemap";
    const TILES = {
      dark: { url: (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, max: 19, attr: "© OpenStreetMap" }, // CARTO now wants a key
      sat: { url: (x, y, z) => `https://mt${(x + y) % 4}.google.com/vt/lyrs=y&hl=id&x=${x}&y=${y}&z=${z}`, max: 20, attr: "Google" },
    };
    function tileMap(box, r, n, radius, rows) {
      const w = box.clientWidth, h = box.clientHeight; if (!w) return;
      if (view.zoomFor !== r.username) { view.zoom = 0; view.zoomFor = r.username; }
      const mpp0 = 156543.03392 * Math.cos(n.c.lat * Math.PI / 180); // metres per pixel at zoom 0
      const kind = ls.get(BASEMAP, "dark") === "sat" ? "sat" : "dark", T = TILES[kind];
      const z = Math.max(12, Math.min(T.max, Math.floor(Math.log2((mpp0 * Math.min(w, h) * 0.46) / radius)) + (view.zoom || 0)));
      const size = 256 * 2 ** z, world = (p) => { const sin = Math.sin(p.lat * Math.PI / 180); return [((p.lng + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size]; };
      const [cx, cy] = world(n.c), left = cx - w / 2, top = cy - h / 2, mpp = mpp0 / 2 ** z;
      const tiles = el("div", "tiles");
      for (let tx = Math.floor(left / 256); tx * 256 < left + w; tx++) for (let ty = Math.floor(top / 256); ty * 256 < top + h; ty++) {
        const img = el("img"); img.src = T.url(tx, ty, z); img.alt = ""; img.draggable = false; img.style.left = `${tx * 256 - left}px`; img.style.top = `${ty * 256 - top}px`; tiles.append(img); }
      const ring = (f, cls) => { const d = el("span", `ring ${cls}`), R = (radius * f) / mpp; d.style.cssText = `width:${2 * R}px;height:${2 * R}px;left:${w / 2 - R}px;top:${h / 2 - R}px`; return d; };
      const tip = el("span", "tip"); tip.hidden = true;
      const dots = n.list.map((x, i) => {
        const [px, py] = world(x.p), b = el("button", `mdot ${state(x.r)}`); b.type = "button"; b.tabIndex = -1;
        b.style.left = `${px - left}px`; b.style.top = `${py - top}px`; b.style.setProperty("--d", `${Math.round(Math.min(1, x.d / radius) * 350)}ms`);
        b.setAttribute("aria-label", `${x.r.nama || x.r.username}, ${Math.round(x.d)} m`);
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
      box.pon = (set) => { box.ponSet = set; dots.forEach((d, i) => d.classList.toggle("pon", set.has(n.list[i].r.username))); };
      if (box.ponSet) box.pon(box.ponSet);
      const base = el("div", "seg basemap");
      for (const [k, label] of [["dark", "Map"], ["sat", "Satellite"]]) { const b = el("button", null, label); b.type = "button"; b.setAttribute("aria-pressed", String(kind === k));
        b.onclick = () => { ls.set(BASEMAP, k); tileMap(box, r, n, radius, rows); }; base.append(b); }
      const me = el("span", "mdot me"); me.style.left = `${w / 2}px`; me.style.top = `${h / 2}px`;
      const zoom = el("div", "zoom");
      for (const [t, dz, label] of [["+", 1, "Zoom in"], ["−", -1, "Zoom out"]]) { const b = el("button", null, t); b.type = "button"; b.setAttribute("aria-label", label);
        b.disabled = (dz > 0 && z >= T.max) || (dz < 0 && z <= 12); b.onclick = () => { view.zoom = (view.zoom || 0) + dz; tileMap(box, r, n, radius, rows); }; zoom.append(b); }
      box.classList.toggle("sat", kind === "sat");
      box.replaceChildren(tiles, ring(0.5, "half"), ring(1, ""), ...dots, me, tip, zoom, base, el("span", "attr", T.attr));
    }
    // the customers on the same OLT PON port: when many of them are down together it's the line (PON, splitter, ODP),
    // not one house. Statuses come from the OLTs' cached ONT lists (kept 2 hours).
    function ponLine(box, r, map) {
      if (!onts) { box.replaceChildren(el("p", "note", "Finding this customer's PON port on the OLTs… (the first time takes ~6 s)"));
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
      head.append(el("span", `dot ${off.length >= 3 && share >= 0.25 ? "iso" : off.length ? "off" : "on"}`), el("span", "t", `Same PON · ${ont.olt} · ${ont.pon}`),
        el("span", "r", `${off.length} / ${same.length} offline`), el("span", "s", `${same.length - off.length} online · ${users.size} matched to customers, outlined on the map · OLT list ${when(onts.at)}`));
      head.onclick = () => { view.ponFor = r.username; view.ponOpen = !open; ponLine(box, r, map); };
      const parts = [head, el("p", `note ${verdict[0]}`, verdict[1])];
      if (open) {
        if (!off.length) parts.push(el("p", "note", "Everyone on this port is online."));
        off.sort((a, b) => a.id - b.id).slice(0, 40).forEach((o, i) => {
          const c = customerOf(o.sn, o, null), b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
          b.append(el("span", `dot ${o.st === "offline" ? "iso" : "off"}`), el("span", "t", c?.nama || o.name || o.raw), el("span", "r", `ONU ${o.id}`),
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
      // typing anywhere in the open Dock goes to its search box, no click needed
      if (view.mode !== "bulk" && /^\S$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "") && !document.activeElement?.isContentEditable) {
        if (view.card || view.mode || view.modem) { view.card = null; view.mode = null; view.modem = null; drawBody(); }
        panel.querySelector("input")?.focus(); return; // the key then lands in the box
      }
      if (e.key === "Escape") { e.preventDefault(); if (view.mode === "bulk" && bulk?.phase !== "paying") { view.mode = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.modem && !view.card) { view.modem = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.mode === "radar" && !view.card) { if (view.nas) view.nas = null; else view.mode = null; drawBody(); panel.querySelector("input")?.focus(); } else if (view.card) { view.card = null; drawBody(); panel.querySelector("input")?.focus(); } else { close(); fab?.focus(); } }
      else if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "") && document.activeElement !== panel.querySelector(".top input")) return; // a form field in the Dock keeps its keys
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

  // the site moves between pages without reloading: redraw when the address changes
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); setTimeout(draw, 0); return r; };
  }
  addEventListener("popstate", () => setTimeout(draw, 0));
  draw();
})();
