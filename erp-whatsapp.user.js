// ==UserScript==
// @name         ERP — Dock in WhatsApp Web
// @namespace    adztrz
// @icon         https://raw.githubusercontent.com/Adztrz/erp-script/main/icons/dock.png
// @version      1.0.1
// @description  The Dock's customer card beside the open chat in WhatsApp Web: who is writing (found by their number, a username they sent, or their name), online or not, plan, area, unpaid months and any outage on their router, with replies that fill in their name, username and bill. A reply goes into the message box; you send it yourself. The customer list comes from the ERP tab, through Tampermonkey's storage: nothing is fetched from WhatsApp, and nothing leaves this browser.
// @match        https://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @homepageURL  https://github.com/Adztrz/erp-script
// @updateURL    https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-whatsapp.user.js
// @downloadURL  https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-whatsapp.user.js
// ==/UserScript==

(() => {
  "use strict";
  // Two places: the ERP (the same hostname hash as the Dock), where it copies what the Dock keeps into Tampermonkey's
  // storage, and WhatsApp Web, where it reads that copy. Anywhere else it stops here.
  const SITE = "bd1fa6a8";
  let h = 0x811c9dc5;
  for (const c of location.hostname) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  const onErp = h.toString(16) === SITE, onWa = location.hostname === "web.whatsapp.com";
  if (!onErp && !onWa) return;

  const KEY = "wa.data", REPLIES = "wa.replies", WIDE = "wa.open";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fold = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // a phone number as the ERP writes it: 08…, whether it came as +62 8…, 628… or 08…
  const phoneKey = (s) => { let d = String(s ?? "").replace(/\D/g, ""); if (d.startsWith("62")) d = "0" + d.slice(2); else if (d.startsWith("8")) d = "0" + d; return d.length >= 9 ? d : ""; };
  const rupiah = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString("id-ID")}`;
  const paid = (s) => /lunas|paid|bayar/i.test(s || "") && !/belum|unpaid/i.test(s || "");

  // ---------- on the ERP: copy what the Dock keeps ----------
  // The Dock keeps the customer list (refreshed every few minutes while an ERP tab is open) and the invoice months it
  // has loaded in this site's IndexedDB. Each minute the parts that changed are copied, slimmed, to Tampermonkey's
  // storage, which the same script on WhatsApp Web can read. The site's address goes with them, for "Open in the Dock".
  if (onErp) {
    // Firefox runs this script in a sandbox: the site's own IndexedDB is reached through unsafeWindow there, and what it
    // returns is made plain data (through the page's JSON) before use. Chrome gives the same database either way.
    const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const plain = (v) => (v == null ? v : JSON.parse(page.JSON.stringify(v)));
    const get = (db, key) => new Promise((ok) => { const q = db.transaction("ldn").objectStore("ldn").get(key); q.onsuccess = () => ok(plain(q.result)); q.onerror = () => ok(null); });
    const keys = (db) => new Promise((ok) => { const q = db.transaction("ldn").objectStore("ldn").getAllKeys(); q.onsuccess = () => ok(plain(q.result) || []); q.onerror = () => ok([]); });
    const openDb = (f) => new Promise((ok, no) => { const r = f.open("erp-fast", 1); r.onupgradeneeded = () => r.result.createObjectStore("ldn"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    let sent = "";
    async function sync() {
      let db = null, all = null;
      for (const f of [...new Set([page.indexedDB, window.indexedDB])]) {
        try { const d = await openDb(f); const a = d.objectStoreNames.contains("ldn") ? await get(d, "all") : null; if (a?.rows?.length) { db = d; all = a; break; } d.close(); } catch { /* the other one */ }
      }
      if (!db) return;
      try {
        const months = (await keys(db)).filter((k) => /^inv-\d{4}-\d{1,2}$/.test(k));
        const inv = await Promise.all(months.map((k) => get(db, k)));
        const incidents = ((await get(db, "incidents")) || []).filter((x) => x.state === "open");
        const sig = [all.at, ...inv.map((v) => v?.at), ...incidents.map((x) => `${x.id}${x.affected}`)].join(",");
        if (sig === sent) return;
        // per username: each loaded month's invoice as [period, amount, status, due]
        const bills = {};
        for (const v of inv) for (const r of v?.rows || []) { const u = fold(r.radiusUsername).replace(/ /g, ""); if (u) (bills[u] ||= []).push([r.period, r.amount, r.status, r.dueDate]); }
        GM_setValue(KEY, {
          at: all.at, origin: location.origin, bills,
          billsAt: Math.max(0, ...inv.map((v) => v?.at || 0)), monthsLoaded: months.length,
          rows: all.rows.map((r) => [r.username, r.nama, r.phone, r.desa, r.kecamatanErp, r.paket, r.router, r.isolir ? 1 : 0, r.online ? 1 : 0, r.expirasi, r.address, r.isInactive ? 1 : 0]),
          incidents: incidents.map((x) => ({ kind: x.kind, title: x.title, start: x.start, users: x.users || null })),
        });
        sent = sig;
      } finally { db.close(); }
    }
    setTimeout(sync, 4000); setInterval(sync, 60000);
    return;
  }

  // ---------- on WhatsApp Web ----------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sound = (w) => w.replace(/oe/g, "u").replace(/dj/g, "j").replace(/tj/g, "c").replace(/sj/g, "sy").replace(/[ck]h/g, "h").replace(/ph/g, "f").replace(/([dt])h/g, "$1").replace(/iy(?=[aeiou])/g, "i").replace(/uw(?=[aeiou])/g, "u").replace(/y$/, "i").replace(/(.)\1+/g, "$1");
  const titleCase = (s) => String(s || "").toLowerCase().replace(/(^|[\s.'-])\S/g, (m) => m.toUpperCase());
  const ago = (t) => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const hhmm = (t) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  let data = null, rows = [], byPhone = new Map(), byUser = new Map();
  function load(d) {
    data = d || null;
    rows = (d?.rows || []).map(([username, nama, phone, desa, kec, paket, router, isolir, online, expirasi, address, inactive]) => {
      const r = { username, nama, phone, desa, kec, paket, router, isolir: !!isolir, online: !!online, expirasi, address, inactive: !!inactive };
      r._name = fold(nama); r._user = fold(username).replace(/ /g, "");
      r._hay = ` ${r._name} ${r._user} ${fold(desa)} ${fold(router)} `; r._sound = ` ${r._hay.trim().split(" ").map(sound).join(" ")} `;
      return r;
    });
    byPhone = new Map(); byUser = new Map();
    for (const r of rows) { const p = phoneKey(r.phone); if (p) (byPhone.get(p) || byPhone.set(p, []).get(p)).push(r); if (r._user) byUser.set(r._user, r); }
  }

  // Search by name, username, village or number: every typed word in the record, or spelled another way (Sugiyarti = Sugiarti)
  function search(q, max = 8) {
    const words = fold(q).split(" ").filter(Boolean), num = phoneKey(q) || (/^\d{6,}$/.test(q.replace(/\D/g, "")) ? q.replace(/\D/g, "") : "");
    if (!words.length) return [];
    const out = [];
    for (const r of rows) {
      let s = -1;
      if (num && phoneKey(r.phone).includes(num.replace(/^0/, ""))) s = 0;
      else if (words.every((w) => r._hay.includes(w))) s = r._name.startsWith(words.join(" ")) || r._user === words.join("") ? 0 : 1;
      else if (words.every((w) => r._hay.includes(w) || (w.length >= 4 && r._sound.includes(" " + sound(w))))) s = 2;
      if (s >= 0) out.push([s, r]);
    }
    return out.sort((a, b) => a[0] - b[0] || (a[1]._name < b[1]._name ? -1 : 1)).slice(0, max).map((x) => x[1]);
  }

  // What we know of a customer's bills: unpaid months (oldest first) and the newest month's state
  function billsOf(r) {
    const list = (data?.bills?.[r._user] || []).map(([period, amount, status, due]) => ({ period, amount, status, due, t: periodTime(period) })).sort((a, b) => a.t - b.t);
    const unpaid = list.filter((b) => !paid(b.status));
    return { list, unpaid, last: list[list.length - 1] || null, total: unpaid.reduce((n, b) => n + (Number(b.amount) || 0), 0) };
  }
  function periodTime(p) { // "November 2026" → a sortable time
    const m = /([a-z]+)\s+(\d{4})/i.exec(p || ""); if (!m) return 0;
    const id = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"], en = MONTHS.map((x) => x.toLowerCase());
    const k = m[1].slice(0, 3).toLowerCase(), i = Math.max(id.indexOf(k), en.indexOf(k));
    return Number(m[2]) * 12 + Math.max(0, i);
  }
  const outageOf = (r) => (data?.incidents || []).find((x) => (x.users && x.users.some((u) => fold(u).replace(/ /g, "") === r._user)) || (x.kind === "router" && r.router && fold(x.title).endsWith(fold(r.router))));

  // ---------- the open chat ----------
  // Who it is, in order of how sure: their number (unsaved contacts show it as the title; a chat's messages carry it in
  // their id when WhatsApp still uses numbers), a username they sent in the last messages, then the contact's name.
  const main = () => document.querySelector("#main");
  function chatTitle() {
    const hd = main()?.querySelector("header"); if (!hd) return "";
    const t = [...hd.querySelectorAll("span[dir='auto'], span[title]")].map((s) => s.getAttribute("title") || s.textContent).find((s) => s && s.trim());
    return (t || "").trim();
  }
  function chatPhones() {
    const out = new Set(), m = main(); if (!m) return out;
    const t = phoneKey(chatTitle()); if (t && /^[+\d\s()-]+$/.test(chatTitle())) out.add(t);
    for (const e of m.querySelectorAll("[data-id]")) { const x = /_(\d{9,15})@c\.us/.exec(e.getAttribute("data-id")); if (x) { out.add(phoneKey(x[1])); if (out.size > 2) break; } }
    return out;
  }
  // words in their messages that are a customer's username ("Contoh0903", "user: budi0101")
  function chatUsernames() {
    const m = main(); if (!m || !byUser.size) return [];
    const texts = [...m.querySelectorAll(".message-in .selectable-text, .message-in [data-pre-plain-text]")].slice(-25).map((e) => e.innerText || "");
    const found = [];
    for (const t of texts.reverse()) for (const w of t.toLowerCase().split(/[^a-z0-9._-]+/)) { const r = byUser.get(w.replace(/[^a-z0-9]/g, "")); if (r && /\d/.test(w) && !found.includes(r)) found.push(r); }
    return found;
  }
  function whoIsIt() {
    const title = chatTitle(); if (!title) return null;
    const phones = [...chatPhones()], byNum = phones.flatMap((p) => byPhone.get(p) || []);
    if (byNum.length) return { how: "their number", list: byNum, title };
    const sent = chatUsernames(); if (sent.length) return { how: "a username they sent", list: sent, title };
    const name = title.replace(/[^\p{L}\s]/gu, " ").trim();
    const hits = name.length >= 3 ? search(name, 5) : [];
    return { how: hits.length ? "their name" : "", list: hits, title, guess: true };
  }

  // ---------- replies ----------
  // Each fills in the customer's details; the box is filled and you press Enter yourself. Edited in the panel, kept here.
  const DEFAULT_REPLIES = [
    ["Checking", "Baik Kak {nama}, kami cek dulu koneksi ID {username} ya. Mohon ditunggu sebentar 🙏"],
    ["Restart modem", "Kak {nama}, mohon cabut adaptor modem sekitar 1 menit, lalu pasang lagi. Tunggu lampu PON menyala hijau, lalu coba internetnya lagi ya 🙏"],
    ["Outage in area", "Mohon maaf Kak {nama}, saat ini sedang ada gangguan jaringan di area {desa}. Teknisi kami sedang menangani. Terima kasih atas kesabarannya 🙏"],
    ["Technician", "Baik Kak {nama}, kami jadwalkan teknisi untuk cek ke lokasi ({desa}). Teknisi akan menghubungi Kakak sebelum datang 🙏"],
    ["Bill", "Halo Kak {nama} 🙏 Tagihan internet ID {username} untuk {bulan} sebesar {tagihan} belum terbayar. Terima kasih."],
    ["Paid, thanks", "Terima kasih Kak {nama}, pembayaran untuk ID {username} sudah kami terima 🙏"],
  ];
  const replies = () => { const v = GM_getValue(REPLIES, null); return Array.isArray(v) && v.length ? v : DEFAULT_REPLIES; };
  function fill(text, r) {
    const b = billsOf(r), first = titleCase(String(r.nama || "").split(/\s+/)[0] || "");
    const val = { nama: first, namalengkap: titleCase(r.nama), username: r.username, paket: r.paket, desa: titleCase(r.desa), router: r.router,
      tagihan: rupiah(b.unpaid.length ? b.total : b.last?.amount), bulan: (b.unpaid.length ? b.unpaid : b.last ? [b.last] : []).map((x) => x.period).join(", ") || "bulan ini" };
    return text.replace(/\{(\w+)\}/g, (m, k) => (val[k.toLowerCase()] ?? m));
  }
  // Put text into WhatsApp's message box at the cursor: as a paste (keeps line breaks), or typed if the paste is ignored.
  // It is never sent from here.
  function putInBox(text) {
    const box = main()?.querySelector("footer div[contenteditable='true']"); if (!box) return false;
    box.focus();
    const sel = getSelection(); if (!box.contains(sel.anchorNode)) { const rg = document.createRange(); rg.selectNodeContents(box); rg.collapse(false); sel.removeAllRanges(); sel.addRange(rg); }
    const before = box.innerText;
    const dt = new DataTransfer(); dt.setData("text/plain", text);
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    if (box.innerText === before) document.execCommand("insertText", false, text);
    return box.innerText !== before;
  }

  // ---------- the panel ----------
  let panel = null, tab = null, current = { key: "", who: null, pick: null }, query = "", editing = false;
  const css = `
    .erp-wa, .erp-wa-tab { --bg: #090b0c; --raised: #121416; --line: #1f2224; --bone: #e9e1dc; --text: #c9c4c0; --muted: #8a8b8a; --on: #55bc82; --bad: #e5484d; --amber: #e0b04f;
      font: 400 13px/1.45 Inter, system-ui, sans-serif; color: var(--text); }
    .erp-wa { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; z-index: 1000; background: var(--bg); box-shadow: -1px 0 0 var(--line), -12px 0 32px rgba(0,0,0,.35);
      display: flex; flex-direction: column; animation: erp-wa-in .32s cubic-bezier(.16,1,.3,1); }
    @keyframes erp-wa-in { from { transform: translateX(24px); opacity: 0; } }
    html.erp-wa-wide #app > div { width: calc(100vw - 340px) !important; max-width: calc(100vw - 340px) !important; }
    .erp-wa-tab { position: fixed; right: 0; top: 50%; transform: translateY(-50%); z-index: 1000; width: 26px; height: 64px; border: 0; border-radius: 8px 0 0 8px;
      background: var(--bg); color: var(--bone); cursor: pointer; box-shadow: -1px 0 0 var(--line), 0 0 0 1px var(--line); display: grid; place-items: center; }
    .erp-wa-tab svg { width: 16px; height: 16px; }
    .erp-wa header { display: flex; align-items: center; gap: 8px; padding: 14px 16px 10px; }
    .erp-wa header b { color: var(--bone); font-weight: 600; font-size: 14px; }
    .erp-wa header .age { color: var(--muted); font-size: 12px; margin-right: auto; }
    .erp-wa header .age.old { color: var(--amber); }
    .erp-wa button { font: inherit; }
    .erp-wa .x { border: 0; background: none; color: var(--muted); cursor: pointer; padding: 4px; border-radius: 6px; }
    .erp-wa .x:hover { color: var(--bone); background: var(--raised); }
    .erp-wa input, .erp-wa textarea { width: 100%; box-sizing: border-box; background: var(--raised); color: var(--bone); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font: inherit; outline: none; }
    .erp-wa input:focus, .erp-wa textarea:focus { border-color: var(--muted); }
    .erp-wa .q { padding: 0 16px 10px; }
    .erp-wa .body { flex: 1; overflow: auto; padding: 0 16px 16px; display: grid; align-content: start; gap: 12px; }
    .erp-wa .how { color: var(--muted); font-size: 12px; }
    .erp-wa .item { display: grid; grid-template-columns: 10px 1fr auto; gap: 2px 8px; align-items: center; width: 100%; text-align: left; border: 0; background: none; color: var(--text);
      padding: 8px; border-radius: 8px; cursor: pointer; }
    .erp-wa .item:hover, .erp-wa .item.sel { background: var(--raised); }
    .erp-wa .item .t { color: var(--bone); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .erp-wa .item .r { color: var(--muted); font: 12px "JetBrains Mono", ui-monospace, monospace; }
    .erp-wa .item .s { grid-column: 2 / 4; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .erp-wa .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .erp-wa .dot.on { background: var(--on); } .erp-wa .dot.iso { background: var(--bad); } .erp-wa .dot.off { background: transparent; box-shadow: inset 0 0 0 1.5px var(--muted); }
    .erp-wa .card { display: grid; gap: 12px; }
    .erp-wa h3 { margin: 0; color: var(--bone); font-size: 18px; font-weight: 500; letter-spacing: -.01em; line-height: 1.25; }
    .erp-wa .pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px; background: var(--raised); font-size: 12px; color: var(--bone); }
    .erp-wa dl { display: grid; grid-template-columns: 84px 1fr; gap: 6px 10px; margin: 0; }
    .erp-wa dt { color: var(--muted); font-size: 12px; padding-top: 1px; }
    .erp-wa dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
    .erp-wa dd.mono { font: 12px/1.6 "JetBrains Mono", ui-monospace, monospace; color: var(--bone); }
    .erp-wa .mini { border: 0; background: none; color: var(--muted); cursor: pointer; padding: 0 0 0 6px; font-size: 12px; text-decoration: underline; text-underline-offset: 2px; }
    .erp-wa .mini:hover { color: var(--bone); }
    .erp-wa .bill { border-radius: 8px; padding: 10px 12px; background: var(--raised); display: grid; gap: 2px; }
    .erp-wa .bill b { color: var(--bone); font-weight: 600; font-size: 15px; font-variant-numeric: tabular-nums; }
    .erp-wa .bill.due b { color: var(--amber); }
    .erp-wa .bill span { color: var(--muted); font-size: 12px; }
    .erp-wa .alert { border-radius: 8px; padding: 10px 12px; background: rgba(229,72,77,.12); color: #f2b8ba; box-shadow: inset 0 0 0 1px rgba(229,72,77,.35); }
    .erp-wa .row { display: flex; flex-wrap: wrap; gap: 8px; }
    .erp-wa .btn { border: 1px solid var(--line); background: none; color: var(--bone); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-weight: 500; text-decoration: none; }
    .erp-wa .btn:hover { background: var(--raised); }
    .erp-wa .btn.main { background: var(--bone); color: #07090b; border-color: var(--bone); }
    .erp-wa .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; font-weight: 500; display: flex; justify-content: space-between; }
    .erp-wa .replies { display: grid; gap: 6px; }
    .erp-wa .reply { text-align: left; border: 1px solid var(--line); background: none; color: var(--text); border-radius: 8px; padding: 8px 10px; cursor: pointer; display: grid; gap: 2px; }
    .erp-wa .reply:hover { background: var(--raised); }
    .erp-wa .reply b { color: var(--bone); font-weight: 500; }
    .erp-wa .reply span { color: var(--muted); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .erp-wa .reply.did { border-color: var(--on); }
    .erp-wa .empty { color: var(--muted); }
    .erp-wa textarea { min-height: 260px; font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; resize: vertical; }
    @media (prefers-reduced-motion: reduce) { .erp-wa { animation: none; } }`;

  const svgIcon = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "currentColor");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.append(p); return s; };
  const ROOK = "M4.56 2.00L8.14 2.00L8.14 4.03L10.27 4.03L10.27 2.00L13.65 2.00L13.65 4.03L15.94 4.03L15.94 2.00L19.49 2.00L19.49 5.77L9.75 12.08L9.75 15.38L5.91 17.84L7.62 16.68L7.62 10.44L8.71 9.32L4.56 5.64ZM15.42 9.74L16.45 10.44L16.45 16.03L19.57 19.40L19.57 22.00L4.43 22.00L4.43 19.45L5.91 19.45L11.44 15.64L11.44 12.08Z";

  function mount() {
    if (!document.getElementById("erp-wa-css")) { const s = el("style"); s.id = "erp-wa-css"; s.textContent = css; document.head.append(s); }
    if (!tab?.isConnected) { tab = el("button", "erp-wa-tab"); tab.type = "button"; tab.title = "Dock (Alt+K)"; tab.setAttribute("aria-label", "Open the Dock"); tab.append(svgIcon(ROOK)); tab.onclick = () => toggle(true); document.body.append(tab); }
    if (GM_getValue(WIDE, true) && !panel) toggle(true);
  }
  function toggle(on) {
    GM_setValue(WIDE, on);
    if (!on) { panel?.remove(); panel = null; document.documentElement.classList.remove("erp-wa-wide"); tab.hidden = false; return; }
    tab.hidden = true; document.documentElement.classList.add("erp-wa-wide");
    if (!panel) { panel = el("aside", "erp-wa"); panel.setAttribute("aria-label", "Dock"); document.body.append(panel); }
    current.key = ""; draw();
  }

  function draw() {
    if (!panel) return;
    const keepFocus = document.activeElement?.closest?.(".erp-wa .q") ? document.activeElement.selectionStart : null;
    panel.replaceChildren();
    const hd = el("header"); hd.append(el("b", null, "Dock"));
    const age = el("span", "age", data ? `customers ${ago(data.at)}` : "no customer list yet");
    if (!data || Date.now() - data.at > 30 * 60000) { age.classList.add("old"); age.title = "Open the ERP in a tab: the Dock there refreshes the list, and it comes here within a minute"; }
    const x = el("button", "x", "✕"); x.type = "button"; x.title = "Hide (Alt+K)"; x.onclick = () => toggle(false);
    hd.append(age, x);
    const qw = el("div", "q"), q = el("input"); q.placeholder = "Name, username, number or village"; q.value = query; q.setAttribute("aria-label", "Search customers");
    q.oninput = () => { query = q.value; current.pick = null; draw(); };
    q.onkeydown = (e) => { if (e.key === "Escape") { query = ""; draw(); } };
    qw.append(q); panel.append(hd, qw);
    if (keepFocus != null) { q.focus(); q.setSelectionRange(keepFocus, keepFocus); }
    const body = el("div", "body"); panel.append(body);

    if (editing) return drawEditor(body);
    if (!data) { body.append(el("p", "empty", "Open the ERP in another tab of this browser (with this script installed there too). Its customer list shows up here within a minute.")); return; }
    if (query.trim()) {
      const hits = search(query, 12);
      if (!hits.length) body.append(el("p", "empty", "Nobody found."));
      for (const r of hits) body.append(item(r, () => { current.pick = r; query = ""; draw(); }));
      return;
    }
    const who = current.who, r = current.pick || (who && !who.guess && who.list.length === 1 ? who.list[0] : null);
    if (!who && !r) { body.append(el("p", "empty", "Open a chat: the customer writing shows here.")); return; }
    if (r) return drawCard(body, r, current.pick ? "picked" : who.how, !current.pick && who?.list.length > 1);
    // more than one, or only a guess by name: let the choice be made
    body.append(el("p", "how", who.list.length ? `${who.title}: ${who.guess ? "maybe" : `found by ${who.how}`}, pick one` : `${who.title}: not found by number or name. Search above.`));
    for (const c of who.list) body.append(item(c, () => { current.pick = c; draw(); }));
  }
  function item(r, onPick) {
    const b = el("button", "item"); b.type = "button";
    b.append(el("span", `dot ${state(r)}`), el("span", "t", r.nama || r.username), el("span", "r", r.username), el("span", "s", [r.paket, titleCase(r.desa), r.router].filter(Boolean).join(" · ")));
    b.onclick = onPick; return b;
  }
  const state = (r) => (r.isolir ? "iso" : r.online ? "on" : "off");

  function drawCard(body, r, how, others) {
    const card = el("div", "card");
    const top = el("div"); top.style.cssText = "display:grid;gap:6px";
    const pill = el("span", "pill"); pill.append(el("span", `dot ${state(r)}`), r.isolir ? "Isolir" : r.online ? "Online" : "Offline");
    top.append(el("h3", null, r.nama || r.username), (() => { const w = el("div", "row"); w.style.alignItems = "center"; w.append(pill, el("span", "how", how === "picked" ? "picked by you" : `found by ${how}`)); return w; })());
    card.append(top);
    const out = outageOf(r);
    if (out) card.append(el("div", "alert", `Outage open: ${out.title}, since ${hhmm(out.start)}`));
    const b = billsOf(r), bill = el("div", `bill${b.unpaid.length ? " due" : ""}`);
    if (b.unpaid.length) bill.append(el("b", null, `${rupiah(b.total)} unpaid`), el("span", null, b.unpaid.map((x) => x.period).join(", ")));
    else if (b.last) bill.append(el("b", null, "Paid up"), el("span", null, `${b.last.period}: ${b.last.status}`));
    else bill.append(el("b", null, "Bills not loaded"), el("span", null, "Open Finance → Invoices in the ERP once to bring this month's"));
    if (data.monthsLoaded) bill.title = `From the ${data.monthsLoaded} invoice month${data.monthsLoaded > 1 ? "s" : ""} the Dock has loaded, ${ago(data.billsAt)}`;
    card.append(bill);
    const dl = el("dl");
    const fact = (k, v, mono, copy) => { if (!v) return; const dd = el("dd", mono ? "mono" : null, v);
      if (copy) { const c = el("button", "mini", "copy"); c.type = "button"; c.onclick = () => navigator.clipboard?.writeText(String(v)).then(() => { c.textContent = "copied"; setTimeout(() => (c.textContent = "copy"), 1200); }); dd.append(c); }
      dl.append(el("dt", null, k), dd); };
    fact("Username", r.username, true, true); fact("Plan", r.paket); fact("Area", [titleCase(r.desa), titleCase(r.kec)].filter(Boolean).join(", ")); fact("Router", r.router);
    fact("Phone", r.phone, true); fact("Address", r.address);
    fact("Expires", r.expirasi && !isNaN(new Date(r.expirasi)) ? new Date(r.expirasi).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : r.expirasi);
    card.append(dl);
    const acts = el("div", "row");
    if (data.origin) { const a = el("a", "btn main", "Open in the Dock ↗"); a.href = `${data.origin}/ldn-radius#dock=${encodeURIComponent(r.username)}`; a.target = "erp-dock"; a.rel = "noopener"; acts.append(a); }
    if (others || current.pick) { const o = el("button", "btn", others ? "Not them?" : "Back"); o.type = "button"; o.onclick = () => { current.pick = null; if (others) current.who = { ...current.who, guess: true }; draw(); }; acts.append(o); }
    card.append(acts);
    const lab = el("div", "label"); lab.append(el("span", null, "Replies"));
    const ed = el("button", "mini", "edit"); ed.type = "button"; ed.onclick = () => { editing = true; draw(); }; lab.append(ed);
    const list = el("div", "replies");
    for (const [name, text] of replies()) {
      const filled = fill(text, r), b2 = el("button", "reply"); b2.type = "button"; b2.title = `${filled}\n\nClick: into the message box (you send it). Shift+click: copy.`;
      b2.append(el("b", null, name), el("span", null, filled));
      b2.onclick = (e) => { const ok = e.shiftKey ? (navigator.clipboard?.writeText(filled), true) : putInBox(filled); b2.classList.toggle("did", !!ok); setTimeout(() => b2.classList.remove("did"), 1200); };
      list.append(b2);
    }
    card.append(lab, list);
    body.append(card);
  }

  // The replies as plain text: a line "## Name", then its text (several lines are fine)
  function drawEditor(body) {
    body.append(el("p", "how", "Each reply starts with a line \"## Name\". Fill-ins: {nama} (first name), {namalengkap}, {username}, {paket}, {desa}, {router}, {tagihan}, {bulan}."));
    const ta = el("textarea"); ta.value = replies().map(([n, t]) => `## ${n}\n${t}`).join("\n\n"); ta.spellcheck = false;
    const row = el("div", "row"), save = el("button", "btn main", "Save"), cancel = el("button", "btn", "Cancel"), reset = el("button", "btn", "Defaults");
    save.type = cancel.type = reset.type = "button";
    save.onclick = () => { const l = parseReplies(ta.value); if (l.length) GM_setValue(REPLIES, l); editing = false; current.key = ""; draw(); };
    cancel.onclick = () => { editing = false; draw(); };
    reset.onclick = () => { ta.value = DEFAULT_REPLIES.map(([n, t]) => `## ${n}\n${t}`).join("\n\n"); };
    row.append(save, cancel, reset); body.append(ta, row);
  }
  function parseReplies(s) {
    const out = []; let cur = null;
    for (const line of String(s).split("\n")) { const m = /^##\s*(.+)$/.exec(line); if (m) { cur = [m[1].trim(), ""]; out.push(cur); } else if (cur) cur[1] += (cur[1] ? "\n" : "") + line; }
    return out.map(([n, t]) => [n, t.trim()]).filter(([n, t]) => n && t);
  }

  // follow the open chat: its title and first message id change when another chat opens
  function tick() {
    if (!document.body) return;
    mount();
    const m = main(), key = m ? `${chatTitle()}|${m.querySelector("[data-id]")?.getAttribute("data-id") || ""}|${rows.length}` : "";
    if (key === current.key) return;
    const sameChat = key.split("|")[0] === current.key.split("|")[0];
    current.key = key;
    if (!sameChat) { current.pick = null; query = ""; editing = false; }
    current.who = m ? whoIsIt() : null;
    if (document.activeElement?.closest?.(".erp-wa textarea")) return; // don't redraw over the reply editor
    draw();
  }

  load(GM_getValue(KEY, null));
  GM_addValueChangeListener(KEY, (k, o, v) => { load(v); current.key = ""; tick(); });
  addEventListener("keydown", (e) => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyK") { e.preventDefault(); toggle(!panel); } }, true);
  setInterval(tick, 700);
})();
