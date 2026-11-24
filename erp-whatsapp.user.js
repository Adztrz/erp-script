// ==UserScript==
// @name         ERP — Dock in WhatsApp Web
// @namespace    adztrz
// @icon         https://raw.githubusercontent.com/Adztrz/erp-script/main/icons/dock.png
// @version      1.5.0
// @description  The Dock's customer card beside the open chat in WhatsApp Web: who is writing (found by their number, a username they sent, or their name), online or not, plan, area, unpaid months and any outage on their router, with replies that fill in their name, username and bill; Check connection, Pay and the 1× login link are done by the Dock in your open ERP tab. A reply goes into the message box; you send it yourself. The customer list comes from the ERP tab, through Tampermonkey's storage: nothing is fetched from WhatsApp, and nothing leaves this browser.
// @match        https://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      tile.openstreetmap.org
// @connect      google.com
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

  const KEY = "wa.data", REPLIES = "wa.replies", WIDE = "wa.open", ERP_TAB = "wa.erpTab", REQ = "wa.req", RES = "wa.res";
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
          rows: all.rows.map((r) => [r.username, r.nama, r.phone, r.desa, r.kecamatanErp, r.paket, r.router, r.isolir ? 1 : 0, r.online ? 1 : 0, r.expirasi, r.address, r.isInactive ? 1 : 0,
            Math.round(Number(r.lat) * 1e6) / 1e6 || 0, Math.round(Number(r.lng) * 1e6) / 1e6 || 0]),
          incidents: incidents.map((x) => ({ kind: x.kind, title: x.title, start: x.start, users: x.users || null })),
        });
        sent = sig;
      } finally { db.close(); }
    }
    setTimeout(sync, 4000); setInterval(sync, 60000);

    // Requests from WhatsApp (Check, Pay, 1× link) go to one ERP tab: the one that said most recently that it's open.
    // It hands them to the Dock in this page (as text, which crosses Firefox's sandbox as is) and puts the Dock's answer
    // where WhatsApp reads it. Answers are kept 10 minutes.
    const TAB = Math.random().toString(36).slice(2, 10), seen = new Set();
    const here = () => GM_setValue(ERP_TAB, { tab: TAB, at: Date.now() });
    here(); setInterval(here, 20000); document.addEventListener("visibilitychange", here);
    GM_addValueChangeListener(REQ, (k, o, list) => {
      for (const q of Array.isArray(list) ? list : []) {
        if (q.to !== TAB || seen.has(q.id) || Date.now() - q.at > 120000) continue;
        seen.add(q.id); page.postMessage("erp-wa:" + JSON.stringify({ id: q.id, op: q.op, args: q.args }), location.origin);
      }
    });
    addEventListener("message", (e) => {
      const m = typeof e.data === "string" ? e.data : ""; if (!m.startsWith("erp-wa-res:")) return;
      let r; try { r = JSON.parse(m.slice(11)); } catch { return; }
      const all = { ...(GM_getValue(RES, {}) || {}) }; for (const k of Object.keys(all)) if (Date.now() - (all[k].at || 0) > 600000) delete all[k];
      all[r.id] = { ...r, at: Date.now() }; GM_setValue(RES, all);
    });
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
    rows = (d?.rows || []).map(([username, nama, phone, desa, kec, paket, router, isolir, online, expirasi, address, inactive, lat, lng]) => {
      const r = { username, nama, phone, desa, kec, paket, router, isolir: !!isolir, online: !!online, expirasi, address, inactive: !!inactive, lat: lat || 0, lng: lng || 0 };
      r._name = fold(nama); r._user = fold(username).replace(/ /g, "");
      r._hay = ` ${r._name} ${r._user} ${fold(desa)} ${fold(router)} `; r._sound = ` ${r._hay.trim().split(" ").map(sound).join(" ")} `;
      r._nsound = ` ${r._name.split(" ").map(sound).join(" ")} `;
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
  const roWord = (x) => fold(x).replace(/^ro /, "").split(" ")[0];
  // an outage this customer is in: their router on the radar (same name, or the same main word: RO PUNUNG NEW is PUNUNG),
  // else an open incident on their PON port or router
  function outageOf(r) {
    const rt = outs.data?.routers.find((x) => r.router && (fold(x.name) === fold(r.router) || roWord(x.name) === roWord(r.router)));
    if (rt) return { kind: "router", key: rt.ip, title: rt.name, start: rt.since, level: rt.level };
    const inc = (data?.incidents || []).find((x) => (x.users && x.users.some((u) => fold(u).replace(/ /g, "") === r._user)) || (x.kind === "router" && r.router && fold(x.title).endsWith(fold(r.router))));
    return inc ? { kind: inc.kind, key: inc.id, title: inc.title, start: inc.start } : null;
  }

  // ---------- asking the ERP tab ----------
  // Check, Pay and the 1× link are done by the Dock in an open ERP tab, with its own code and your ERP sign-in: the
  // request goes through Tampermonkey's storage to that tab, and its answer comes back the same way.
  const waiting = new Map();
  function rpc(op, args, wait = 90000) {
    const t = GM_getValue(ERP_TAB, null);
    if (!t || Date.now() - t.at > 90000) return Promise.reject(new Error("No ERP tab open: open the ERP in a tab of this browser."));
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const list = (GM_getValue(REQ, []) || []).filter((q) => Date.now() - q.at < 120000);
    list.push({ id, to: t.tab, op, args, at: Date.now() }); GM_setValue(REQ, list);
    return new Promise((ok, no) => {
      const timer = setTimeout(() => { waiting.delete(id); no(new Error(op === "pay" ? "No answer from the ERP tab yet. It may still be paying: look at the invoice in the ERP before trying again."
        : "No answer from the ERP tab. Is the Dock there 3.18.0 or newer (Tampermonkey → Check for userscript updates)?")); }, wait);
      waiting.set(id, { ok, no, timer });
    });
  }
  function answers(all) {
    for (const [id, w] of waiting) { const r = all?.[id]; if (!r) continue; clearTimeout(w.timer); waiting.delete(id); if (r.ok) w.ok(r.data); else w.no(new Error(r.err || "The ERP tab said no")); }
  }

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
  // ---- group chats ----
  // A group's messages each carry the sender: their number in the message id (when WhatsApp still shows numbers), and
  // the name your phone saved them under ("BUDI SANTOSO CONTOH R9"). The group itself is nobody's chat, so it gets a list
  // of the customers writing in it, newest first, instead of one card.
  const isGroup = () => !!main()?.querySelector("[data-id*='@g.us']");
  function msgOf(row) {
    const id = row.getAttribute("data-id") || "";
    if (!/@g\.us/.test(id) || id.startsWith("true_")) return null; // only what others sent
    const pre = row.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text") || "";
    const m = /^\[([^\]]*)\]\s*(.*?):\s*$/.exec(pre), part = /@g\.us_[^_]+_(\d{9,15})@c\.us/.exec(id)?.[1];
    return { id, phone: part ? phoneKey(part) : "", name: (m?.[2] || "").trim(), at: (m?.[1] || "").split(",")[0].trim(),
      text: [...row.querySelectorAll(".selectable-text")].map((e) => e.innerText || "").join(" ") };
  }
  // the customer a saved name points to: at least two of its words in the record, one of them in the customer's own name
  const guessMemo = new Map();
  function nameGuess(display) {
    if (guessMemo.has(display)) return guessMemo.get(display);
    const words = [...new Set(fold(display).split(" ").filter((w) => w.length >= 3 && !/\d/.test(w)).map(sound))];
    let best = 0, out = [];
    if (words.length >= 2) for (const r of rows) {
      let all = 0, own = 0; for (const w of words) { if (r._sound.includes(` ${w} `)) all++; if (r._nsound.includes(` ${w} `)) own++; }
      const n = own ? all : 0; if (n > best) { best = n; out = [r]; } else if (n && n === best) out.push(r);
    }
    const res = best >= 2 && out.length <= 3 ? out : [];
    if (guessMemo.size > 300) guessMemo.clear(); guessMemo.set(display, res); return res;
  }
  // a sender → the customer(s) they are, and how that was found
  function senderOf(msg, texts = msg.text) {
    if (msg.phone && byPhone.get(msg.phone)?.length) return { list: byPhone.get(msg.phone), how: "their number" };
    for (const w of String(texts).toLowerCase().split(/[^a-z0-9._-]+/)) { const r = byUser.get(w.replace(/[^a-z0-9]/g, "")); if (r && /\d/.test(w)) return { list: [r], how: "a username they sent" }; }
    const g = msg.name ? nameGuess(msg.name) : []; return { list: g, how: g.length ? "their saved name" : "" };
  }
  function groupPeople() {
    const m = main(); if (!m) return [];
    const seen = new Set(), msgs = [...m.querySelectorAll("[data-id]")].map(msgOf).filter((x) => x && !seen.has(x.id) && seen.add(x.id));
    const people = new Map();
    for (const x of msgs.reverse()) { // newest first
      const key = x.phone || fold(x.name); if (!key) continue;
      const p = people.get(key); if (p) { p.texts += ` ${x.text}`; continue; }
      if (people.size >= 15) continue;
      people.set(key, { key, name: x.name, phone: x.phone, at: x.at, texts: x.text });
    }
    return [...people.values()].map((p) => ({ ...p, ...senderOf(p, p.texts) }));
  }

  function whoIsIt() {
    const title = chatTitle(); if (!title) return null;
    if (isGroup()) return { group: true, title, people: groupPeople() };
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
  // Faust's design system: the Talos palette, Column's structure (8px shapes, hairline cards, one floating shadow, a
  // filled primary beside outlined buttons, uppercase "tag with dot" labels, mono for figures and codes) and its motion
  // (a soft rise that comes into focus, labels that type themselves in, checks drawn by a stroke, a shimmer when a state
  // changes). Every animation runs once, when what it shows has changed: never on the redraws in between.
  const css = `
    .erp-wa, .erp-wa-tab { --canvas: #07090b; --bg: #090b0c; --raised: #1a1d1e; --line: #262727; --edge: #363738; --rule: #696a68;
      --strong: #efefed; --bone: #e9e1dc; --text: #b3b0af; --muted: #8a8b8a; --on: #55bc82; --bad: #f12614; --amber: #e0b04f; --bone-rgb: 233, 225, 220;
      --ease: cubic-bezier(.4, 0, .2, 1); --ease-soft: cubic-bezier(.1, 0, .1, 1); --ease-swap: cubic-bezier(.76, 0, .24, 1); --ease-out: cubic-bezier(.22, 1, .36, 1);
      --shadow-card: inset 0 0 0 1px var(--line), 0 1px 0 rgba(255,255,255,.02), 0 1px 4px rgba(0,0,0,.35);
      --shadow-btn: 0 1px 3px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.5), inset 0 1px 4px rgba(255,255,255,.35);
      --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
      font: 400 14px/1.5 Inter, "Inter Variable", system-ui, sans-serif; font-feature-settings: "cv11"; color: var(--text); -webkit-font-smoothing: antialiased; }
    .erp-wa { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; z-index: 2147483000; background: var(--bg); caret-color: var(--bone);
      box-shadow: inset 1px 0 0 var(--edge), -24px 0 32px rgba(0,0,0,.18), -12px 0 10px rgba(0,0,0,.22), -3px 0 2px rgba(0,0,0,.3);
      display: flex; flex-direction: column; animation: erp-wa-open .35s var(--ease-out); }
    .erp-wa.out { animation: erp-wa-close .2s var(--ease) forwards; pointer-events: none; }
    @keyframes erp-wa-open { from { transform: translateX(24px); opacity: 0; filter: blur(2px); } }
    @keyframes erp-wa-close { to { transform: translateX(16px); opacity: 0; } }
    .erp-wa ::selection { background: rgba(var(--bone-rgb), .28); color: var(--strong); }
    .erp-wa * { scrollbar-width: thin; scrollbar-color: var(--edge) transparent; }
    .erp-wa :focus-visible { outline: 2px solid rgba(var(--bone-rgb), .5); outline-offset: 2px; }
    html.erp-wa-wide #app > div { width: calc(100vw - 340px) !important; max-width: calc(100vw - 340px) !important; }
    .erp-wa-tab { position: fixed; right: 0; top: 50%; transform: translateY(-50%); z-index: 2147483000; width: 28px; height: 64px; border: 0; border-radius: 8px 0 0 8px;
      background: var(--bg); color: var(--bone); cursor: pointer; box-shadow: inset 0 0 0 1px var(--edge), -6px 0 16px rgba(0,0,0,.3); display: grid; place-items: center;
      transition: width .2s var(--ease-out), color .15s var(--ease); animation: erp-wa-quick .2s var(--ease-out); }
    .erp-wa-tab:hover { width: 34px; }
    .erp-wa-tab[hidden] { display: none; }
    .erp-wa-tab svg { width: 16px; height: 16px; }
    .erp-wa header { display: flex; align-items: center; gap: 10px; padding: 16px 16px 12px; }
    .erp-wa header svg.mark { width: 16px; height: 16px; color: var(--bone); flex: none; }
    .erp-wa header b { color: var(--strong); font-weight: 600; font-size: 15px; letter-spacing: -.01em; }
    .erp-wa header .age { color: var(--muted); font: 12px var(--mono); margin-right: auto; }
    .erp-wa header .age.old { color: var(--amber); }
    .erp-wa button { font: inherit; }
    .erp-wa .x { border: 0; background: none; color: var(--muted); cursor: pointer; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; transition: color .15s var(--ease), background-color .15s var(--ease); }
    .erp-wa .x svg { width: 16px; height: 16px; }
    .erp-wa .x:hover { color: var(--bone); background: var(--raised); }
    .erp-wa input, .erp-wa textarea, .erp-wa select { box-sizing: border-box; background: var(--raised); color: var(--strong); border: 1px solid var(--line); border-radius: 8px; font: inherit; outline: none;
      transition: border-color .15s var(--ease), box-shadow .15s var(--ease); }
    .erp-wa input:not([type=checkbox]), .erp-wa textarea { width: 100%; padding: 9px 12px; }
    .erp-wa input::placeholder, .erp-wa textarea::placeholder { color: var(--muted); }
    .erp-wa input:focus, .erp-wa textarea:focus, .erp-wa select:focus { border-color: var(--rule); box-shadow: 0 0 0 3px rgba(var(--bone-rgb), .08); }
    .erp-wa input[type=search]::-webkit-search-cancel-button { display: none; }
    .erp-wa .q { padding: 0 16px 12px; }
    .erp-wa .body { flex: 1; overflow: auto; overflow-x: hidden; padding: 4px 16px 24px; display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: max-content; align-content: start; gap: 16px; }
    .erp-wa .how { margin: 0; color: var(--muted); font-size: 13px; }
    .erp-wa .list { display: grid; gap: 2px; }
    .erp-wa .item { display: grid; grid-template-columns: 10px 1fr auto; gap: 2px 10px; align-items: center; width: 100%; text-align: left; border: 0; background: none; color: var(--text);
      padding: 10px; border-radius: 8px; cursor: pointer; transition: background-color .15s var(--ease); }
    .erp-wa .item:hover, .erp-wa .item:focus-visible { background: var(--raised); }
    .erp-wa .item .t { color: var(--strong); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .erp-wa .item .r { color: var(--muted); font: 12px var(--mono); }
    .erp-wa .item .s { grid-column: 2 / 4; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .erp-wa .item.miss .t { color: var(--muted); font-weight: 400; }
    .erp-wa .item .s + .s { color: var(--text); }
    .erp-wa .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
    .erp-wa .dot.on { background: var(--on); } .erp-wa .dot.iso { background: var(--bad); } .erp-wa .dot.off { background: transparent; box-shadow: inset 0 0 0 1.5px var(--muted); }
    .erp-wa .card { display: grid; gap: 16px; }
    .erp-wa .who { display: grid; gap: 8px; }
    .erp-wa h3 { margin: 0; color: var(--strong); font-size: 20px; font-weight: 500; letter-spacing: -.01em; line-height: 1.25; text-wrap: balance; }
    .erp-wa .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: var(--raised); font-size: 12px; font-weight: 500; color: var(--strong);
      background-image: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%); background-size: 200% 100%; background-repeat: no-repeat; background-position: -50% 0; }
    .erp-wa .pill.swipe { animation: erp-wa-swipe 1.1s var(--ease-soft) .15s backwards; }
    @keyframes erp-wa-swipe { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
    .erp-wa .tag { display: flex; align-items: center; gap: 8px; margin: 0; min-height: 18px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .erp-wa .tag::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); }
    .erp-wa .tag.good::before { background: var(--on); } .erp-wa .tag.warn::before { background: var(--amber); } .erp-wa .tag.bad::before { background: var(--bad); }
    .erp-wa .tag .sp { margin-left: auto; text-transform: none; letter-spacing: 0; }
    .erp-wa .cur { display: inline-block; width: 6px; height: 12px; margin-left: 2px; background: var(--bone); opacity: .2; animation: erp-wa-cursor 1s infinite; }
    @keyframes erp-wa-cursor { 0%, 50% { opacity: .2; } 51%, 100% { opacity: 0; } }
    .erp-wa .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .erp-wa dl { display: grid; grid-template-columns: 88px 1fr; gap: 8px 12px; margin: 0; }
    .erp-wa dt { color: var(--muted); font-size: 12px; padding-top: 2px; }
    .erp-wa dd { margin: 0; color: var(--text); font-size: 13px; overflow-wrap: anywhere; }
    .erp-wa dd.mono { font: 12px/1.7 var(--mono); color: var(--strong); }
    .erp-wa .mini { border: 0; background: none; color: var(--muted); cursor: pointer; padding: 0; font-size: 12px; font-weight: 300; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--edge);
      transition: color .15s var(--ease), text-decoration-color .15s var(--ease); justify-self: start; }
    .erp-wa .mini:hover { color: var(--bone); text-decoration-color: currentColor; }
    .erp-wa .bill { border-radius: 8px; padding: 14px 16px; background: var(--raised); display: grid; gap: 2px; }
    .erp-wa .bill b { color: var(--strong); font-weight: 500; font-size: 22px; letter-spacing: -.01em; font-variant-numeric: tabular-nums; line-height: 1.2; }
    .erp-wa .bill.due b { color: var(--amber); }
    .erp-wa .bill span { color: var(--muted); font-size: 12px; }
    .erp-wa .alert { border-radius: 8px; padding: 12px 14px; background: rgba(241,38,20,.1); color: #f6b3ab; box-shadow: inset 0 0 0 1px rgba(241,38,20,.35); font-size: 13px; }
    .erp-wa .row { display: flex; flex-wrap: wrap; gap: 8px; }
    .erp-wa .acts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .erp-wa .acts .btn { justify-content: center; padding: 7px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .erp-wa .acts .btn.armed { grid-column: 1 / -1; white-space: normal; }
    .erp-wa .btn { position: relative; overflow: hidden; min-height: 36px; border: 1px solid var(--edge); background: none; color: var(--strong); border-radius: 8px; padding: 7px 14px; cursor: pointer;
      font-size: 13px; font-weight: 500; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
      transition: background-color .15s var(--ease), border-color .15s var(--ease), color .15s var(--ease), box-shadow .15s var(--ease), transform .1s var(--ease); }
    .erp-wa .btn:hover { background: var(--raised); border-color: var(--rule); }
    .erp-wa .btn:active { transform: scale(.98); }
    .erp-wa .btn.main { background: var(--bone); color: var(--canvas); border-color: var(--bone); box-shadow: var(--shadow-btn); }
    .erp-wa .btn.main:hover { background: #f3ede9; }
    .erp-wa .btn.wide { width: 100%; justify-content: center; }
    /* armed: the second click confirms; a hairline runs out over the 5 seconds it waits */
    .erp-wa .btn.armed { animation: erp-wa-quick .2s var(--ease-out); }
    .erp-wa .btn.armed::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--canvas); opacity: .35; transform-origin: left; animation: erp-wa-fuse 5s linear forwards; }
    @keyframes erp-wa-fuse { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    .erp-wa .replies { display: grid; gap: 8px; }
    .erp-wa .reply { text-align: left; border: 0; background: var(--bg); box-shadow: var(--shadow-card); color: var(--text); border-radius: 8px; padding: 10px 12px; cursor: pointer; display: grid; gap: 2px;
      transition: box-shadow .15s var(--ease), background-color .15s var(--ease); }
    .erp-wa .reply:hover { background: var(--raised); box-shadow: inset 0 0 0 1px var(--edge); }
    .erp-wa .reply b { color: var(--strong); font-weight: 500; font-size: 13px; }
    .erp-wa .reply span { color: var(--muted); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .erp-wa .reply.did { box-shadow: inset 0 0 0 1px var(--on); }
    .erp-wa .reply.did b::after { content: " · in the message box"; color: var(--on); font-weight: 400; animation: erp-wa-quick .2s var(--ease-out); }
    .erp-wa .reply.did.copied b::after { content: " · copied"; }
    /* empty states sit on Faust's halftone dot grid, fading out from the middle */
    .erp-wa .empty { position: relative; margin: 8px 0 0; padding: 40px 12px; text-align: center; color: var(--muted); font-size: 13px; isolation: isolate; }
    .erp-wa .empty::before { content: ""; position: absolute; inset: 0; z-index: -1; background: radial-gradient(circle at 1px 1px, var(--edge) 1px, transparent 1.2px) 0 0 / 8px 8px;
      -webkit-mask: radial-gradient(closest-side, #000 0 30%, rgba(0,0,0,.5) 60%, transparent); mask: radial-gradient(closest-side, #000 0 30%, rgba(0,0,0,.5) 60%, transparent); }
    .erp-wa textarea { min-height: 260px; font: 12px/1.6 var(--mono); resize: vertical; }
    .erp-wa .cp { cursor: copy; border-radius: 4px; position: relative; transition: background-color .15s var(--ease); margin: -2px -4px; padding: 2px 4px; min-width: 0; }
    .erp-wa .card > *, .erp-wa .sect > *, .erp-wa dl > * { min-width: 0; }
    .erp-wa .cp:hover { background: var(--raised); }
    .erp-wa .cp.did::after { content: "copied"; position: absolute; right: 4px; top: 50%; translate: 0 -50%; padding: 1px 7px; border-radius: 999px;
      background: var(--bone); color: var(--canvas); font: 500 11px Inter, system-ui, sans-serif; letter-spacing: .02em; animation: erp-wa-pop .18s var(--ease-out); }
    @keyframes erp-wa-pop { from { opacity: 0; scale: .9; } }
    .erp-wa .outs { border-radius: 8px; background: rgba(241,38,20,.08); box-shadow: inset 0 0 0 1px rgba(241,38,20,.3); overflow: hidden; }
    .erp-wa .outs-head { display: grid; grid-template-columns: 10px auto 1fr; gap: 10px; align-items: center; width: 100%; border: 0; background: none; color: #f6b3ab; padding: 10px 12px; cursor: pointer; text-align: left; }
    .erp-wa .outs-head b { font-weight: 600; font-size: 13px; color: #f6b3ab; }
    .erp-wa .outs-head .s { font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .erp-wa .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--bad); box-shadow: 0 0 0 0 rgba(241,38,20,.5); animation: erp-wa-pulse 2s var(--ease-out) infinite; }
    @keyframes erp-wa-pulse { 70% { box-shadow: 0 0 0 6px rgba(241,38,20,0); } 100% { box-shadow: 0 0 0 0 rgba(241,38,20,0); } }
    .erp-wa .outs-list { display: grid; gap: 2px; padding: 0 6px 6px; animation: erp-wa-quick .2s var(--ease-out); }
    .erp-wa .outs-rep { display: grid; gap: 10px; padding: 4px 12px 12px; animation: erp-wa-quick .22s var(--ease-out); }
    .erp-wa pre.msg { margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line); color: var(--text); font: 12px/1.55 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 220px; overflow: auto; }
    .erp-wa .team { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: baseline; }
    .erp-wa .team .k { font-size: 11px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .erp-wa .team .k-field { color: var(--on); } .erp-wa .team .k-area { color: var(--amber); }
    .erp-wa .team b { color: var(--strong); font-weight: 500; font-size: 13px; justify-self: start; }
    .erp-wa .team .s { grid-column: 2; color: var(--muted); font-size: 12px; }
    .erp-wa .alert .mini { color: #f6b3ab; text-decoration-color: rgba(246,179,171,.4); }
    .erp-wa .nctl { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .erp-wa .seg { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--raised); }
    .erp-wa .seg button { border: 0; background: none; color: var(--muted); font-size: 12px; padding: 4px 10px; border-radius: 6px; cursor: pointer; transition: color .15s var(--ease), background-color .28s var(--ease-swap); }
    .erp-wa .seg button[aria-pressed="true"] { background: var(--bg); color: var(--strong); box-shadow: inset 0 0 0 1px var(--edge); }
    .erp-wa .nmap { position: relative; height: 230px; border-radius: 8px; overflow: hidden; background: #0d1012; box-shadow: inset 0 0 0 1px var(--line); isolation: isolate; }
    .erp-wa .ntiles img { position: absolute; width: 256px; height: 256px; max-width: none; pointer-events: none; user-select: none; opacity: 0; transition: opacity .3s var(--ease-out);
      filter: invert(1) hue-rotate(180deg) brightness(.78) contrast(.92) saturate(.35); }
    .erp-wa .nmap.sat .ntiles img { filter: brightness(.8) saturate(.9); }
    .erp-wa .ntiles img.in { opacity: 1; }
    .erp-wa .nring { position: absolute; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(var(--bone-rgb), .28); pointer-events: none; }
    .erp-wa .nring + .nring { box-shadow: inset 0 0 0 1px rgba(var(--bone-rgb), .4); }
    .erp-wa .ndot { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; background: var(--on);
      box-shadow: 0 0 0 1.5px rgba(7,9,11,.85); animation: erp-wa-dot .35s var(--ease-out) var(--d, 0ms) backwards; transition: transform .15s var(--ease); }
    .erp-wa .ndot:hover { transform: scale(1.5); z-index: 2; }
    .erp-wa .ndot.off { background: #0d1012; box-shadow: inset 0 0 0 2px var(--strong), 0 0 0 1.5px rgba(7,9,11,.85); z-index: 1; }
    .erp-wa .ndot.iso { background: var(--bad); }
    .erp-wa .ndot.fresh::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; box-shadow: 0 0 0 1px var(--strong); animation: erp-wa-ping 1.8s var(--ease-out) infinite; }
    @keyframes erp-wa-dot { from { opacity: 0; transform: scale(.3); } }
    @keyframes erp-wa-ping { from { opacity: .8; transform: scale(.6); } to { opacity: 0; transform: scale(1.8); } }
    .erp-wa .nme { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--bone); box-shadow: 0 0 0 3px rgba(7,9,11,.85), 0 0 0 6px rgba(var(--bone-rgb), .25); z-index: 3; pointer-events: none; }
    .erp-wa .nattr { position: absolute; right: 6px; bottom: 4px; font-size: 10px; color: rgba(255,255,255,.55); text-shadow: 0 1px 2px #000; z-index: 3; pointer-events: none; }
    .erp-wa .sect { display: grid; gap: 10px; padding: 16px; border-radius: 8px; background: var(--bg); box-shadow: var(--shadow-card); }
    .erp-wa .verdict { margin: 0; color: var(--strong); font-weight: 500; font-size: 14px; }
    .erp-wa .verdict.ok { color: var(--on); } .erp-wa .verdict.net, .erp-wa .verdict.cut, .erp-wa .verdict.iso { color: #f6b3ab; } .erp-wa .verdict.warn, .erp-wa .verdict.off { color: var(--amber); }
    .erp-wa .warn { margin: 0; color: var(--amber); font-size: 13px; } .erp-wa .good { margin: 0; color: var(--on); font-size: 13px; } .erp-wa .late { color: var(--amber); }
    .erp-wa .mrow { display: grid; grid-template-columns: 16px 1fr auto; gap: 10px; align-items: center; color: var(--strong); cursor: pointer; font-size: 13px; }
    .erp-wa .mrow .amt { font: 12px var(--mono); font-variant-numeric: tabular-nums; }
    .erp-wa .msub { display: grid; gap: 4px; padding-left: 26px; color: var(--muted); font-size: 12px; margin-top: -4px; }
    .erp-wa .msub label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .erp-wa .bform { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .erp-wa .bform input:last-child { grid-column: 1 / 3; }
    .erp-wa select { padding: 8px 10px; }
    .erp-wa .skipold { display: flex; gap: 8px; align-items: flex-start; color: var(--muted); font-size: 12px; cursor: pointer; }
    /* Faust's checkbox: the check is drawn in with a stroke when ticked */
    .erp-wa input[type=checkbox] { appearance: none; -webkit-appearance: none; flex: none; width: 16px; height: 16px; margin: 0; padding: 0; position: relative; cursor: pointer;
      border: 1px solid var(--rule); border-radius: 4px; background: transparent; transition: background-color .2s var(--ease), border-color .2s var(--ease); }
    .erp-wa input[type=checkbox]:hover { border-color: var(--text); }
    .erp-wa input[type=checkbox]:checked { background: var(--bone); border-color: var(--bone); }
    .erp-wa input[type=checkbox]::after { content: ""; position: absolute; inset: 0; background: var(--canvas); clip-path: inset(0 100% 0 0);
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-6.5' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-6.5' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% no-repeat;
      transition: clip-path .22s var(--ease-soft); }
    .erp-wa input[type=checkbox]:checked::after { clip-path: inset(0 0 0 0); }
    .erp-wa input[type=checkbox].just:checked { animation: erp-wa-fill .2s var(--ease) backwards; }
    .erp-wa input[type=checkbox].just:checked::after { animation: erp-wa-check .22s var(--ease-soft) .04s backwards; }
    @keyframes erp-wa-check { from { clip-path: inset(0 100% 0 0); } }
    @keyframes erp-wa-fill { from { background-color: transparent; border-color: var(--rule); } }
    .erp-wa input[type=checkbox]:disabled, .erp-wa select:disabled, .erp-wa input:disabled { opacity: .5; cursor: default; }
    .erp-wa .ld::after { content: ""; display: inline-block; vertical-align: 1px; width: 18px; margin-left: 8px; height: 6px; background: radial-gradient(circle, var(--bone) 0 1.2px, transparent 1.7px) 0 0 / 6px 6px; opacity: .6; animation: erp-wa-ld 1.2s ease-in-out infinite; }
    @keyframes erp-wa-ld { 50% { opacity: .15; } }
    /* arriving: a customer's card, a new section, a new list. Faust's rise: 12px up, out of a 2px blur, on Column's soft
       curve, 40 ms apart (capped). A section whose state changes (loading → result) fades across instead. */
    @keyframes erp-wa-rise { from { opacity: 0; transform: translateY(12px); filter: blur(2px); } }
    @keyframes erp-wa-quick { from { opacity: 0; } }
    @keyframes erp-wa-tilt { from { opacity: 0; transform: perspective(800px) rotateY(5deg) translateY(10px); } }
    .erp-wa .arrive > * { animation: erp-wa-rise .38s var(--ease-soft) backwards; }
    .erp-wa .arrive > :nth-child(2) { animation-delay: 40ms; } .erp-wa .arrive > :nth-child(3) { animation-delay: 80ms; }
    .erp-wa .arrive > :nth-child(4) { animation-delay: 120ms; } .erp-wa .arrive > :nth-child(n+5) { animation-delay: 160ms; }
    .erp-wa .sect.arrive { animation: erp-wa-tilt .42s var(--ease-soft) backwards; } .erp-wa .sect.arrive > * { animation: none; }
    .erp-wa .sect.swap > :not(.tag) { animation: erp-wa-quick .22s var(--ease-out) backwards; }
    @media (prefers-reduced-motion: reduce) {
      .erp-wa, .erp-wa .arrive > *, .erp-wa .sect.arrive, .erp-wa-tab { animation: erp-wa-quick .15s linear backwards; }
      .erp-wa.out { animation: erp-wa-quick .1s linear reverse forwards; }
      .erp-wa .pill.swipe, .erp-wa .btn.armed::after, .erp-wa .ld::after, .erp-wa .cur, .erp-wa .pulse, .erp-wa .ndot, .erp-wa .ndot.fresh::after { animation: none; }
      .erp-wa .btn:active { transform: none; }
      .erp-wa input[type=checkbox].just:checked, .erp-wa input[type=checkbox].just:checked::after { animation: none; }
    }`;
  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // a Faust "tag with dot" label; typed in letter by letter the first time it shows, then a soft block cursor blinks
  function tagDot(text, type, cls = "") {
    const p = el("p", `tag ${cls}`.trim()), seen = el("span"), cur = el("span", "cur");
    seen.setAttribute("aria-hidden", "true"); cur.setAttribute("aria-hidden", "true");
    p.append(el("span", "sr", text), seen, cur);
    if (!type || calm()) { seen.textContent = text; return p; }
    let i = 0; const step = () => { if (!p.isConnected && i) return; seen.textContent = text.slice(0, ++i); if (i < text.length) setTimeout(step, 14 + Math.random() * 14); };
    setTimeout(step, 60); return p;
  }
  // what has already been shown, so a redraw (a tick, a keypress, a checkbox) doesn't play an arrival again
  const shown = { card: "", list: "", sect: new Map(), check: null };

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
    if (!on) { const p = panel; panel = null; shown.card = ""; shown.list = ""; document.documentElement.classList.remove("erp-wa-wide"); tab.hidden = false;
      if (p) { p.classList.add("out"); setTimeout(() => p.remove(), 220); } return; }
    tab.hidden = true; document.documentElement.classList.add("erp-wa-wide");
    if (!panel) { panel = el("aside", "erp-wa"); panel.setAttribute("aria-label", "Dock"); document.body.append(panel); }
    current.key = ""; draw(); readOutages();
  }

  function draw() {
    if (!panel) return;
    const keepFocus = document.activeElement?.closest?.(".erp-wa .q") ? document.activeElement.selectionStart : null;
    const scrolled = panel.querySelector(".body")?.scrollTop || 0; // a redraw keeps your place
    panel.replaceChildren();
    const hd = el("header"), mark = svgIcon(ROOK); mark.classList.add("mark"); mark.setAttribute("aria-hidden", "true"); hd.append(mark, el("b", null, "Dock"));
    const age = el("span", "age", data ? `customers ${ago(data.at)}` : "no customer list yet");
    if (!data || Date.now() - data.at > 30 * 60000) { age.classList.add("old"); age.title = "Open the ERP in a tab: the Dock there refreshes the list, and it comes here within a minute"; }
    const x = el("button", "x"); x.type = "button"; x.title = "Hide (Alt+K)"; x.setAttribute("aria-label", "Hide the Dock"); x.onclick = () => toggle(false);
    { const i = svgIcon("M6 6l12 12M18 6 6 18"); i.setAttribute("fill", "none"); i.setAttribute("stroke", "currentColor"); i.setAttribute("stroke-width", "1.8"); i.setAttribute("stroke-linecap", "round"); x.append(i); }
    hd.append(age, x);
    const qw = el("div", "q"), q = el("input"); q.placeholder = "Name, username, number or village"; q.value = query; q.setAttribute("aria-label", "Search customers");
    // a search, not a login: keeps password managers (Bitwarden, 1Password, LastPass) from offering to fill it
    q.type = "search"; q.autocomplete = "off"; q.name = "erp-wa-find"; for (const a of ["data-bwignore", "data-1p-ignore", "data-lpignore", "data-form-type"]) q.setAttribute(a, a === "data-form-type" ? "other" : "true");
    q.oninput = () => { query = q.value; current.pick = null; draw(); };
    q.onkeydown = (e) => { if (e.key === "Escape") { query = ""; draw(); } };
    qw.append(q); panel.append(hd, qw);
    if (keepFocus != null) { q.focus(); q.setSelectionRange(keepFocus, keepFocus); }
    const body = el("div", "body"); panel.append(body); queueMicrotask(() => { body.scrollTop = scrolled; });

    if (editing) return drawEditor(body);
    const strip = outageStrip(); if (strip) body.append(strip);
    if (!data) { body.append(el("p", "empty", "Open the ERP in another tab of this browser (with this script installed there too). Its customer list shows up here within a minute.")); return; }
    if (query.trim()) {
      const hits = search(query, 12);
      if (!hits.length) { shown.list = ""; body.append(el("p", "empty", "Nobody found.")); return; }
      body.append(listOf(hits, (r) => { current.pick = r; query = ""; draw(); }));
      return;
    }
    const who = current.who;
    if (who?.group && !current.pick) return drawGroup(body, who);
    const r = current.pick || (who && !who.guess && who.list.length === 1 ? who.list[0] : null);
    if (!who && !r) { shown.card = ""; body.append(el("p", "empty", "Open a chat: the customer writing shows here.")); return; }
    if (r) return drawCard(body, r, current.pick ? current.pickHow || "picked" : who.how, !current.pick && who?.list.length > 1);
    // more than one, or only a guess by name: let the choice be made
    shown.card = "";
    body.append(el("p", "how", who.list.length ? `${who.title}: ${who.guess ? "maybe" : `found by ${who.how}`}, pick one` : `${who.title}: not found by number or name. Search above.`));
    if (who.list.length) body.append(listOf(who.list, (c) => { current.pick = c; draw(); }));
  }
  function drawGroup(body, who) {
    shown.card = "";
    const found = who.people.filter((p) => p.list.length);
    body.append(el("p", "how", `Group · ${who.title}. ${found.length ? `${found.length} of the ${who.people.length} people writing here ${found.length === 1 ? "is a customer" : "are customers"}, newest first` : who.people.length ? "Nobody writing here was found as a customer" : "No messages from others on screen yet"}. Click a message to show its sender.`));
    if (current.note) body.append(el("p", "warn", current.note));
    const wrap = el("div", "list"), sig = who.people.map((p) => p.key + p.list.length).join(",");
    if (sig !== shown.list) { wrap.classList.add("arrive"); shown.list = sig; }
    for (const p of who.people) {
      const who2 = p.name || p.phone;
      if (p.list.length) for (const r of p.list) {
        const b = item(r, () => { current.pick = r; current.pickHow = `${who2} in this group (${p.how})`; current.note = ""; draw(); });
        b.append(el("span", "s", `${p.at ? `${p.at} · ` : ""}${who2}${p.list.length > 1 ? " · maybe" : ""}`)); wrap.append(b);
      } else {
        const b = el("button", "item miss"); b.type = "button"; b.title = "Search the customer list for this name";
        b.append(el("span", "dot off"), el("span", "t", who2), el("span", "r", p.at || ""), el("span", "s", "not found as a customer · search"));
        b.onclick = () => { query = fold(p.name).split(" ").filter((w) => !/\d/.test(w)).slice(0, 2).join(" ") || p.phone; current.note = ""; draw(); };
        wrap.append(b);
      }
    }
    if (who.people.length) body.append(wrap);
  }
  // click a message in a group: the panel shows whoever sent it
  addEventListener("click", (e) => {
    if (!panel || !current.who?.group || e.target.closest?.(".erp-wa")) return;
    const row = e.target.closest?.("#main [data-id]"); if (!row) return;
    const x = msgOf(row); if (!x) return;
    const hit = senderOf(x), name = x.name || x.phone || "this sender";
    if (hit.list.length === 1) { current.pick = hit.list[0]; current.pickHow = `${name} in this group (${hit.how})`; current.note = ""; }
    else { current.pick = null; current.note = hit.list.length ? `${name}: more than one customer fits, pick below.` : `${name} isn't found as a customer.`; }
    draw();
  }, true);
  // a list of customers rises in one after another when it's a new list, and stays still while you keep typing into it
  function listOf(rows, onPick) {
    const wrap = el("div", "list"), sig = rows.map((r) => r.username).join(",");
    if (sig !== shown.list) { wrap.classList.add("arrive"); shown.list = sig; }
    for (const r of rows) wrap.append(item(r, () => onPick(r)));
    return wrap;
  }
  function item(r, onPick) {
    const b = el("button", "item"); b.type = "button";
    b.append(el("span", `dot ${state(r)}`), el("span", "t", r.nama || r.username), el("span", "r", r.username), el("span", "s", [r.paket, titleCase(r.desa), r.router].filter(Boolean).join(" · ")));
    b.onclick = onPick; return b;
  }
  const state = (r) => (r.isolir ? "iso" : r.online ? "on" : "off");

  // Click a name or a value to copy it (selecting part of it with the mouse still copies just that part, as usual)
  function copyable(node, value) {
    node.classList.add("cp"); node.title = "Click to copy"; node.tabIndex = 0;
    const go = () => { if (String(getSelection()).trim()) return;
      navigator.clipboard?.writeText(String(value)).then(() => { node.classList.add("did"); setTimeout(() => node.classList.remove("did"), 1000); }); };
    node.onclick = go; node.onkeydown = (e) => { if (e.key === "Enter") go(); };
    return node;
  }
  function drawCard(body, r, how, others) {
    const fresh = shown.card !== r.username; shown.card = r.username; shown.list = "";
    const card = el("div", `card${fresh ? " arrive" : ""}`);
    const top = el("div", "who");
    // after a Check, the pill shows what the sessions said just now, with a shimmer when that's new
    const live = act.user === r.username && act.check?.data ? act.check.data : null, on = live ? live.online : r.online;
    const pill = el("span", "pill"); pill.append(el("span", `dot ${r.isolir ? "iso" : on ? "on" : "off"}`), r.isolir ? "Isolir" : on ? "Online" : "Offline");
    if (live) { pill.title = "As the ERP's sessions said at the last Check"; if (shown.check !== live) { shown.check = live; pill.classList.add("swipe"); } }
    top.append(copyable(el("h3", null, r.nama || r.username), r.nama || r.username), (() => { const w = el("div", "row"); w.style.alignItems = "center"; w.append(pill, el("span", "how", how === "picked" ? "picked by you" : /in this group/.test(how) ? how : `found by ${how}`)); return w; })());
    card.append(top);
    const out = outageOf(r);
    if (out) { const al = el("div", "alert"); al.append(`${out.level === "nofeed" ? "No session data from" : "Outage on"} ${out.title}${out.start ? `, since ${hhmm(out.start)}` : ""}. `);
      const sel = outs.data?.routers.find((x) => x.ip === out.key) ? `r:${out.key}` : outs.data?.pons.find((x) => x.id === out.key) ? `p:${out.key}` : "";
      if (sel) { const go = el("button", "mini", "report and notice"); go.type = "button"; go.onclick = () => { outOpen = true; pickOutage(sel); panel.querySelector(".body").scrollTop = 0; }; al.append(go); }
      card.append(al); }
    const b = billsOf(r), bill = el("div", `bill${b.unpaid.length ? " due" : ""}`);
    if (b.unpaid.length) bill.append(el("b", null, `${rupiah(b.total)} unpaid`), el("span", null, b.unpaid.map((x) => x.period).join(", ")));
    else if (b.last) bill.append(el("b", null, "Paid up"), el("span", null, `${b.last.period}: ${b.last.status}`));
    else bill.append(el("b", null, "Bills not loaded"), el("span", null, "Open Finance → Invoices in the ERP once to bring this month's"));
    if (data.monthsLoaded) bill.title = `From the ${data.monthsLoaded} invoice month${data.monthsLoaded > 1 ? "s" : ""} the Dock has loaded, ${ago(data.billsAt)}`;
    card.append(bill);
    card.append(...actionsFor(r), ...extrasFor(r), ...nearFor(r));
    const dl = el("dl");
    const fact = (k, v, mono) => { if (!v) return; dl.append(el("dt", null, k), copyable(el("dd", mono ? "mono" : null, v), v)); };
    fact("Username", r.username, true); fact("Plan", r.paket); fact("Area", [titleCase(r.desa), titleCase(r.kec)].filter(Boolean).join(", ")); fact("Router", r.router);
    fact("Phone", r.phone, true); fact("Address", r.address);
    fact("Expires", r.expirasi && !isNaN(new Date(r.expirasi)) ? new Date(r.expirasi).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : r.expirasi);
    card.append(dl);
    const acts = el("div", "row");
    if (data.origin) { const a = el("a", "btn main", "Open in the Dock"), go = svgIcon("M7 17 17 7M9 7h8v8"); go.setAttribute("fill", "none"); go.setAttribute("stroke", "currentColor"); go.setAttribute("stroke-width", "1.8"); go.setAttribute("stroke-linecap", "round"); go.style.cssText = "width:14px;height:14px"; a.append(go); a.href = `${data.origin}/ldn-radius#dock=${encodeURIComponent(r.username)}`; a.target = "erp-dock"; a.rel = "noopener"; acts.append(a); }
    if (others || current.pick) { const o = el("button", "btn", others ? "Not them?" : current.who?.group ? "Back to the group" : "Back"); o.type = "button"; o.onclick = () => { current.pick = null; current.note = ""; if (others) current.who = { ...current.who, guess: true }; draw(); }; acts.append(o); }
    card.append(acts);
    const lab = tagDot("Replies", fresh);
    const ed = el("button", "mini sp", "edit"); ed.type = "button"; ed.onclick = () => { editing = true; draw(); }; lab.append(ed);
    const list = el("div", "replies");
    for (const [name, text] of replies()) {
      const filled = fill(text, r), b2 = el("button", "reply"); b2.type = "button"; b2.title = `${filled}\n\nClick: into the message box (you send it). Shift+click: copy.`;
      b2.append(el("b", null, name), el("span", null, filled));
      b2.onclick = (e) => { const ok = e.shiftKey ? (navigator.clipboard?.writeText(filled), true) : putInBox(filled); b2.classList.toggle("did", !!ok); b2.classList.toggle("copied", e.shiftKey); setTimeout(() => b2.classList.remove("did", "copied"), 1400); };
      list.append(b2);
    }
    const rep = el("div"); rep.style.cssText = "display:grid;gap:10px"; rep.append(lab, list);
    card.append(rep);
    body.append(card);
  }

  // ---------- outages: the ERP Dock's radar, here ----------
  // The ERP tab's radar alerts (routers down, dropping or without session data) and open PON incidents, read each minute
  // while this panel is open. Each one gives the report for the technicians and the notice for customers, made by the
  // Dock from who is offline right now.
  let outs = { data: null, at: 0 }, outOpen = false, outSel = "", outRep = null;
  function readOutages() {
    if (!panel || document.hidden || outs.busy) return;
    outs.busy = true;
    rpc("outages", {}, 30000).then((d) => { const was = JSON.stringify(outs.data?.routers?.map((x) => x.ip + x.level)) + JSON.stringify(outs.data?.pons?.map((x) => x.id));
      outs = { data: d, at: Date.now() }; const now = JSON.stringify(d.routers.map((x) => x.ip + x.level)) + JSON.stringify(d.pons.map((x) => x.id));
      if (was !== now) draw(); })
      .catch(() => { outs = { data: outs.data, at: outs.at }; });
  }
  setInterval(readOutages, 60000);
  const levelText = (x) => (x.level === "down" ? "down" : x.level === "drop" ? "dropping" : "no session data");
  function pickOutage(sel) {
    outSel = sel; outRep = { busy: true }; draw();
    const [k, id] = [sel.slice(0, 1), sel.slice(2)];
    rpc("outage", k === "r" ? { kind: "router", ip: id } : { kind: "pon", id }, 90000)
      .then((d) => { if (outSel === sel) { outRep = { data: d, at: Date.now() }; draw(); } })
      .catch((e) => { if (outSel === sel) { outRep = { err: e.message, at: Date.now() }; draw(); } });
  }
  function outageStrip() {
    const d = outs.data; if (!d || (!d.routers.length && !d.pons.length)) return null;
    const n = d.routers.length + d.pons.length, box = el("div", `outs${outOpen ? " open" : ""}`);
    const head = el("button", "outs-head"); head.type = "button"; head.setAttribute("aria-expanded", String(outOpen));
    const first = d.routers[0] ? `${d.routers[0].name} ${levelText(d.routers[0])}` : d.pons[0].title;
    head.append(el("span", "pulse"), el("b", null, `${n} outage${n > 1 ? "s" : ""}`), el("span", "s", `${first}${n > 1 ? ` · +${n - 1}` : ""}${d.wide ? " · most routers at once: central" : ""}`));
    head.onclick = () => { outOpen = !outOpen; draw(); };
    box.append(head);
    if (!outOpen) return box;
    const list = el("div", "outs-list");
    const row = (sel, title, sub) => { const b = el("button", `item${outSel === sel ? " sel" : ""}`); b.type = "button";
      b.append(el("span", "dot iso"), el("span", "t", title), el("span", "r", ""), el("span", "s", sub)); b.onclick = () => pickOutage(sel); list.append(b); };
    for (const x of d.routers) row(`r:${x.ip}`, x.name, `${levelText(x)}${x.since ? ` since ${hhmm(x.since)}` : ""}${x.level !== "nofeed" && x.usual != null ? ` · ${x.open} sessions, usually ${Math.round(x.usual)}` : ""}`);
    for (const x of d.pons) row(`p:${x.id}`, x.title, `PON port · ${x.affected} of ${x.users} down · since ${hhmm(x.start)}`);
    box.append(list);
    if (outSel && outRep) {
      const rep = el("div", "outs-rep");
      if (outRep.busy) rep.append(el("p", "how ld", "Reading who is offline now…"));
      else if (outRep.err) rep.append(el("p", "warn", outRep.err));
      else { const r = outRep.data; rep.append(el("p", "how", `${r.down} of ${r.total} offline now`));
        const pre = el("pre", "msg", r.text); rep.append(pre);
        const acts = el("div", "row"), b = (label, cls, fn) => { const x = el("button", cls, label); x.type = "button"; x.onclick = () => fn(x); acts.append(x); };
        b("Notice into message box", "btn main", () => putInBox(r.notice));
        b("Copy report", "btn", (x) => navigator.clipboard?.writeText(r.text).then(() => { x.textContent = "Copied"; setTimeout(() => (x.textContent = "Copy report"), 1200); }));
        if (r.phones?.length) b(`Copy ${r.phones.length} numbers`, "btn", (x) => navigator.clipboard?.writeText(r.phones.join("\n")).then(() => { x.textContent = "Copied"; setTimeout(() => (x.textContent = `Copy ${r.phones.length} numbers`), 1200); }));
        rep.append(acts); }
      box.append(rep);
    }
    return box;
  }

  // ---------- the card's technicians and modem (and Remote) ----------
  function extrasFor(r) {
    const a = actFor(r);
    if (!a.extras) setTimeout(() => { if (act === a && !a.extras) run(r, "extras", "extras"); }, 0); // read once per customer
    const out = [];
    if (!a.extras || a.extras.busy) { const s = sectEl(r, "tech", "Technicians · modem", phaseOf(a.extras)); s.append(busyNote("Reading the technician map and the OLT…")); return [s]; }
    if (a.extras.err) { const s = sectEl(r, "tech", "Technicians · modem", phaseOf(a.extras), "warn"); s.append(el("p", "warn", a.extras.err)); return [s]; }
    const d = a.extras.data;
    // who covers their village
    const t = sectEl(r, "tech", `Technicians${r.desa ? ` · ${titleCase(r.desa)}` : ""}`, phaseOf(a.extras));
    if (d.how) t.append(el("p", "warn", d.how));
    if (!d.teams.length) t.append(el("p", "how", "No team found for this area."));
    for (const tm of d.teams) { const row = el("div", "team"), kind = { field: "Field", area: "Area head", backbone: "Backbone", office: "Office" }[tm.kind] || tm.kind;
      row.append(el("span", `k k-${tm.kind}`, kind), copyable(el("b", null, tm.name === "Tanpa tim" ? "Placed individually" : tm.name), tm.name), el("span", "s", tm.members.join(", ") || "no members")); t.append(row); }
    out.push(t);
    // the modem: ONT, signal, port; Remote opens its own page through the ERP's 5-minute port
    const m = sectEl(r, "modem", "Modem", `${phaseOf(a.extras)}|${phaseOf(a.remote)}`, d.modem && d.modem.rx != null && d.modem.rx < -28 ? "bad" : d.modem && d.modem.rx != null && d.modem.rx < -26 ? "warn" : "");
    const dl = el("dl"), f = (k, v, mono) => { if (v) dl.append(el("dt", null, k), copyable(el("dd", mono ? "mono" : null, v), v)); };
    if (d.modem) { const rx = d.modem.rx; f("ONT", `${d.modem.olt} · PON ${d.modem.pon} · ${d.modem.st || "?"}`); f("Signal", rx != null ? `${rx} dBm${rx < -28 ? " (critical)" : rx < -26 ? " (weak)" : ""}` : ""); f("Serial", d.modem.sn, true);
      if (d.modem.seen && !isNaN(Date.parse(d.modem.seen))) f("Read", new Date(Date.parse(d.modem.seen)).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })); }
    if (d.port) f("Same port", `${d.port.off} of ${d.port.all} modems offline`);
    if (d.tr069) f("TR-069", `${d.tr069.model ? `${d.tr069.model} · ` : ""}last report ${d.tr069.inform && !isNaN(Date.parse(d.tr069.inform)) ? new Date(Date.parse(d.tr069.inform)).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "?"}`);
    if (!d.modem && !d.tr069) m.append(el("p", "how", "This modem isn't in the OLT list or on TR-069."));
    m.append(dl);
    const rem = a.remote;
    if (rem?.busy) m.append(busyNote("Opening a 5-minute port on the RO…"));
    else if (rem?.err) m.append(el("p", "warn", `Access not opened: ${rem.err}`));
    else if (rem?.data && rem.data.until > Date.now()) { const p = el("p", "good"), l = el("a", null, "the modem's page"); l.href = rem.data.url; l.target = "_blank"; l.rel = "noreferrer noopener";
      p.append("Open: ", l, ` · closes ${hhmm(rem.data.until)}${rem.data.ro ? ` · via ${rem.data.ro}` : ""}`); m.append(p); }
    m.append(wide(armed("Remote: the modem's page", "Click again: open a 5-minute port on the RO (logged)", "remote", () => {
      let win = null; try { win = window.open("about:blank", "_blank"); if (win) win.opener = null; } catch { /* blocked */ }
      const a2 = actFor(r); a2.remote = { busy: true }; draw();
      rpc("remote", { username: r.username }, 60000).then((x) => { if (act !== a2) return; a2.remote = { data: { ...x, until: Date.now() + x.secs * 1000 }, at: Date.now() };
        if (win && !win.closed && x.url) win.location.replace(x.url); else if (x.url) window.open(x.url, "_blank", "noopener"); draw(); })
        .catch((e) => { win?.close(); if (act === a2) { a2.remote = { err: e.message, at: Date.now() }; draw(); } });
    })));
    out.push(m);
    return out;
  }

  // ---------- Nearby: the customers around them on a map ----------
  // As the ERP Dock's Nearby: everyone within 100 m, 300 m or 1 km, online green, offline hollow, isolir red, this
  // customer in the middle with rings at half and full distance. Who is online comes from the ERP tab's live sessions
  // (read when the card opens), and "down since" from its drop log. The map tiles are fetched by Tampermonkey (WhatsApp's
  // page may not load map images itself) and kept for the session.
  const BASEMAP = "wa.basemap", RADII = [100, 300, 1000];
  const metres = (a, b) => { const R = 6371000, t = Math.PI / 180, dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const located = (r) => r.lat && r.lng && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180;
  function around(r, radius) {
    if (!located(r)) return null;
    const c = { lat: r.lat, lng: r.lng }, dLat = radius / 111000, dLng = radius / (111000 * Math.cos(c.lat * Math.PI / 180)), list = [];
    for (const x of rows) { if (x === r || !located(x) || Math.abs(x.lat - c.lat) > dLat || Math.abs(x.lng - c.lng) > dLng) continue;
      const d = metres(c, x); if (d <= radius) list.push({ r: x, d }); }
    return { c, list: list.sort((a, b) => a.d - b.d) };
  }
  const tiles = new Map();
  function tile(url) {
    if (tiles.has(url)) return tiles.get(url);
    const p = new Promise((ok) => {
      try { GM_xmlhttpRequest({ method: "GET", url, responseType: "blob", timeout: 15000, onerror: () => ok(""), ontimeout: () => ok(""),
        onload: (res) => { if (res.status !== 200 || !res.response) return ok(""); const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => ok(""); fr.readAsDataURL(res.response); } }); }
      catch { ok(""); }
    });
    if (tiles.size > 400) tiles.delete(tiles.keys().next().value);
    tiles.set(url, p); return p;
  }
  const tileUrl = (sat, x, y, z) => (sat ? `https://mt${(x + y) % 4}.google.com/vt/lyrs=y&hl=id&x=${x}&y=${y}&z=${z}` : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
  function nearFor(r) {
    const a = actFor(r), radius = a.nearR || 300, sat = GM_getValue(BASEMAP, "dark") === "sat";
    const n = around(r, radius);
    const box = sectEl(r, "near", "Nearby", `${radius}|${sat}|${phaseOf(a.near)}`);
    if (!n) { box.append(el("p", "how", "No location saved for this customer.")); return [box]; }
    // the live sessions for everyone within 1 km, read once per card
    if (!a.near) setTimeout(() => { if (act === a && !a.near) { const all = around(r, 1000); run(r, "near", "live", { usernames: (all?.list || []).slice(0, 400).map((x) => x.r.username) }); } }, 0);
    const lv = a.near?.data, on = lv ? new Set(lv.on.map((u) => fold(u).replace(/ /g, ""))) : null;
    const kind = (x) => (x.isolir ? "iso" : on ? (on.has(x._user) ? "on" : "off") : x.online ? "on" : "off");
    const downAt = (x) => lv?.down?.[x._user] || 0;
    // distance and base map
    const ctl = el("div", "nctl"), seg = el("div", "seg");
    for (const m of RADII) { const b = el("button", null, m < 1000 ? `${m} m` : "1 km"); b.type = "button"; b.setAttribute("aria-pressed", String(m === radius)); b.onclick = () => { a.nearR = m; draw(); }; seg.append(b); }
    const bm = el("button", "mini", sat ? "Street map" : "Satellite"); bm.type = "button"; bm.onclick = () => { GM_setValue(BASEMAP, sat ? "dark" : "sat"); draw(); };
    ctl.append(seg, bm); box.append(ctl);
    const offs = n.list.filter((x) => kind(x.r) === "off"), act2 = n.list.filter((x) => !x.r.isolir && !x.r.inactive);
    box.append(el("p", offs.length && act2.length && offs.length / act2.length >= 0.5 ? "warn" : "how",
      n.list.length ? `${offs.length} of ${act2.length} offline within ${radius < 1000 ? `${radius} m` : "1 km"}${lv ? "" : " (the ERP's last list; live sessions loading…)"}${offs.length && act2.length >= 3 && offs.length / act2.length >= 0.5 ? ": the area, not just this house" : ""}`
        : `Nobody else within ${radius < 1000 ? `${radius} m` : "1 km"}.`));
    // the map
    const map = el("div", `nmap${sat ? " sat" : ""}`); map.setAttribute("role", "group"); map.setAttribute("aria-label", `Map of ${n.list.length} customers within ${radius} metres`);
    box.append(map);
    queueMicrotask(() => drawMap(map, r, n, radius, kind, downAt));
    // offline ones first, nearest first
    const listed = [...offs, ...n.list.filter((x) => kind(x.r) !== "off")].slice(0, 6), wrap = el("div", "list");
    for (const x of listed) { const b = item(x.r, () => { current.pick = x.r; current.pickHow = `near ${r.nama || r.username}`; draw(); });
      b.querySelector(".dot").className = `dot ${kind(x.r)}`; b.querySelector(".r").textContent = `${Math.round(x.d)} m`;
      const t = downAt(x.r); if (kind(x.r) === "off" && t) b.querySelector(".s").textContent = `down since ${hhmm(t)} · ${b.querySelector(".s").textContent}`;
      wrap.append(b); }
    if (listed.length) box.append(wrap);
    if (n.list.length > listed.length) box.append(el("p", "how", `and ${n.list.length - listed.length} more on the map`));
    return [box];
  }
  function drawMap(map, r, n, radius, kind, downAt) {
    const w = map.clientWidth, h = map.clientHeight; if (!w) return;
    const mpp0 = 156543.03392 * Math.cos(n.c.lat * Math.PI / 180), z = Math.max(12, Math.min(19, Math.floor(Math.log2((mpp0 * Math.min(w, h) * 0.45) / radius))));
    const size = 256 * 2 ** z, world = (p) => { const s = Math.sin(p.lat * Math.PI / 180); return [((p.lng + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size]; };
    const [cx, cy] = world(n.c), left = cx - w / 2, top = cy - h / 2, mpp = mpp0 / 2 ** z, sat = map.classList.contains("sat");
    const layer = el("div", "ntiles");
    for (let tx = Math.floor(left / 256); tx * 256 < left + w; tx++) for (let ty = Math.floor(top / 256); ty * 256 < top + h; ty++) {
      const img = el("img"); img.alt = ""; img.draggable = false; img.style.left = `${tx * 256 - left}px`; img.style.top = `${ty * 256 - top}px`;
      tile(tileUrl(sat, tx, ty, z)).then((src) => { if (src) { img.src = src; img.classList.add("in"); } }); layer.append(img); }
    const ring = (f) => { const d = el("span", "nring"), R = (radius * f) / mpp; d.style.cssText = `width:${2 * R}px;height:${2 * R}px;left:${w / 2 - R}px;top:${h / 2 - R}px`; return d; };
    const dots = n.list.map((x) => { const [px, py] = world(x.r), k = kind(x.r), t = downAt(x.r);
      const b = el("button", `ndot ${k}${k === "off" && t && Date.now() - t < 3600000 ? " fresh" : ""}`); b.type = "button"; b.tabIndex = -1;
      b.style.left = `${px - left}px`; b.style.top = `${py - top}px`; b.style.setProperty("--d", `${Math.round(Math.min(1, x.d / radius) * 300)}ms`);
      b.title = `${x.r.nama || x.r.username} · ${Math.round(x.d)} m · ${k === "on" ? "online" : k === "iso" ? "isolir" : t ? `down since ${hhmm(t)}` : "offline"}`;
      b.onclick = () => { current.pick = x.r; current.pickHow = `near ${r.nama || r.username}`; draw(); }; return b; });
    const me = el("span", "nme"); me.style.left = `${w / 2}px`; me.style.top = `${h / 2}px`; me.title = r.nama || r.username;
    const attr = el("span", "nattr", sat ? "Google" : "© OpenStreetMap");
    map.replaceChildren(layer, ring(0.5), ring(1), ...dots, me, attr);
  }

  // ---------- Check, Pay, 1× link ----------
  let act = { user: "" };
  const actFor = (r) => (act.user === r.username ? act : (act = { user: r.username }));
  // a button that asks to be clicked twice for anything that changes the ERP; the second click within 5 s does it
  function armed(label, confirm, key, fn) {
    const b = el("button", `btn${act.armed === key ? " main armed" : ""}`, act.armed === key ? confirm : label); b.type = "button";
    b.onclick = () => { if (act.armed !== key) { act.armed = key; draw(); clearTimeout(act.armTimer); act.armTimer = setTimeout(() => { if (act.armed === key) { act.armed = ""; draw(); } }, 5000); return; } act.armed = ""; fn(); };
    return b;
  }
  const busyNote = (t) => el("p", "how ld", t);
  const wide = (b) => { b.classList.add("wide"); return b; };
  // a box ticked by you draws its check, even though the redraw that follows makes a new box
  let ticked = "";
  const tickBox = (cb, key, onChange) => { cb.type = "checkbox"; if (key === ticked && cb.checked !== false) cb.classList.add("just");
    cb.onchange = () => { ticked = cb.checked ? key : ""; onChange(); setTimeout(() => { ticked = ""; }, 0); }; return cb; };
  function run(r, key, op, args, after) {
    const a = actFor(r); a[key] = { busy: true }; draw();
    rpc(op, { username: r.username, ...args }, op === "pay" ? 180000 : 90000)
      .then((d) => { if (act === a) { a[key] = { data: d, at: Date.now() }; after?.(d, a); draw(); } })
      .catch((e) => { if (act === a) { a[key] = { err: e.message, at: Date.now() }; draw(); } });
  }
  // a section of the card (Check, Pay, Login link): its label types in when it first appears, and its content fades
  // across when its state changes; redraws in between leave it still
  function sectEl(r, name, label, phase, tone) {
    const key = `${r.username}:${name}`, was = shown.sect.get(key), box = el("div", "sect");
    if (was === undefined) box.classList.add("arrive"); else if (was !== phase) box.classList.add("swap");
    shown.sect.set(key, phase);
    box.append(tagDot(label, was === undefined, tone)); return box;
  }
  const phaseOf = (x) => (!x ? "" : x.busy ? "busy" : `${x.err ? "err" : "ok"}${x.at || ""}`);
  function actionsFor(r) {
    const a = actFor(r), out = [], row = el("div", "acts");
    const btn = (label, fn) => { const b = el("button", "btn", label); b.type = "button"; b.onclick = fn; row.append(b); return b; };
    btn(a.check?.data ? "Check again" : "Check line", () => run(r, "check", "check")).title = "Sessions, modem signal, neighbours and router, read now by the Dock in the ERP tab";
    btn("Pay…", () => run(r, "bills", "bills", {}, (d, s) => { s.form = { method: d.methods[0], date: d.today, note: "", skipOlder: false, on: new Set(d.invs.length ? [d.invs[0].no] : []), recharge: Object.fromEntries(d.invs.map((v) => [v.no, v.recharge])) }; s.pay = null; }));
    row.append(armed("1× link", "Click again: the ERP makes the login link and sends it", "link", () => run(r, "link", "link")));
    out.push(row);

    // Check: the Dock's "Down?" evidence, with fresh sessions
    if (a.check) {
      const d0 = a.check.data, box = sectEl(r, "check", "Connection", phaseOf(a.check), a.check.err ? "warn" : !d0 ? "" : d0.verdict[0] === "ok" ? "good" : /net|cut|iso/.test(d0.verdict[0]) ? "bad" : "warn");
      if (a.check.busy) box.append(busyNote("Checking through the ERP tab: sessions, modem, neighbours, router…"));
      else if (a.check.err) box.append(el("p", "warn", a.check.err));
      else { const d = a.check.data; box.append(el("p", `verdict ${d.verdict[0]}`, d.verdict[1]));
        const dl = el("dl"); for (const [k, x] of d.facts) dl.append(el("dt", null, k), el("dd", null, x)); box.append(dl);
        const c = el("button", "mini", "copy summary"); c.type = "button"; c.onclick = () => navigator.clipboard?.writeText(d.text).then(() => { c.textContent = "copied"; setTimeout(() => (c.textContent = "copy summary"), 1200); }); box.append(c); }
      out.push(box);
    }

    // Pay: the bills as the ERP has them now, ticked oldest first, paid by the Dock in the ERP tab
    if (a.bills) {
      const box = sectEl(r, "pay", "Pay", `${phaseOf(a.bills)}|${phaseOf(a.pay)}`, a.bills.err || a.pay?.err ? "warn" : "");
      if (a.bills.busy) box.append(busyNote("Loading the bills from the ERP…"));
      else if (a.bills.err) box.append(el("p", "warn", a.bills.err));
      else {
        const d = a.bills.data, f = a.form, paying = a.pay?.busy, results = a.pay?.data ? new Map(a.pay.data.invs.map((v) => [v.no, v.result])) : new Map();
        const open = d.invs.filter((v) => !results.get(v.no)?.ok);
        if (d.state !== "found" || !d.invs.length) box.append(el("p", "how", d.state === "found" ? `Nothing unpaid${d.paidTo ? `, paid to ${d.paidTo}` : ""}.` : d.err || "No invoices for this username."));
        else {
          d.invs.forEach((v, i) => {
            const res = results.get(v.no), m = el("label", "mrow"), cb = el("input"); cb.type = "checkbox"; cb.checked = f.on.has(v.no) && !res?.ok; cb.disabled = paying || res?.ok;
            tickBox(cb, `m${v.no}`, () => { d.invs.forEach((x, j) => { if (f.skipOlder ? j === i : cb.checked ? j <= i : j >= i) { if (cb.checked) f.on.add(x.no); else f.on.delete(x.no); } }); act.armed = ""; draw(); });
            const t = el("span"); t.append(v.period || v.no, v.status === "Jatuh Tempo" ? el("span", "late", " · overdue") : "");
            m.append(cb, t, el("span", "amt", rupiah(v.amount))); box.append(m);
            const sub = el("div", "msub");
            if (v.canRecharge && !res?.ok) { const l = el("label"), rc = el("input"); rc.checked = !!f.recharge[v.no]; rc.disabled = paying;
              tickBox(rc, `r${v.no}`, () => { f.recharge[v.no] = rc.checked; act.armed = ""; draw(); }); l.append(rc, v.covered ? " recharge (already covered)" : ` recharge RADIUS (expires ${v.expiry || "?"})`); sub.append(l); }
            if (v.hutang) sub.append(el("span", "late", `promised to pay by ${String(v.hutang).slice(0, 10)}`));
            if (res) sub.append(el("span", res.ok ? "good" : "late", res.text + (res.warn ? ` · ${res.warn}` : "")));
            if (sub.childNodes.length) box.append(sub);
          });
          if (open.length) {
            const ch = open.filter((v) => f.on.has(v.no)), total = ch.reduce((n, v) => n + (Number(v.amount) || 0), 0);
            const top = ch.length ? d.invs.indexOf(ch[ch.length - 1]) : -1, skipped = d.invs.filter((v, j) => j < top && !f.on.has(v.no) && !results.get(v.no)?.ok).length;
            const form = el("div", "bform");
            const sel = el("select"); for (const m of d.methods) { const o = el("option", null, m); o.value = m; o.selected = m === f.method; sel.append(o); } sel.disabled = paying; sel.onchange = () => { f.method = sel.value; act.armed = ""; draw(); };
            const date = el("input"); date.type = "date"; date.value = f.date; date.disabled = paying; date.onchange = () => { f.date = date.value; act.armed = ""; };
            const note = el("input"); note.placeholder = skipped ? "Note: why the older months are skipped (10+ letters)" : "Note (optional)"; note.value = f.note; note.disabled = paying; note.setAttribute("data-bwignore", "true"); note.autocomplete = "off";
            note.oninput = () => { f.note = note.value; act.armed = ""; };
            form.append(sel, date, note); box.append(form);
            if (open.length > 1 && d.maySkip) { const l = el("label", "skipold"), cb = el("input"); cb.checked = f.skipOlder; cb.disabled = paying;
              tickBox(cb, "skip", () => { f.skipOlder = cb.checked; act.armed = ""; draw(); }); l.append(cb, " Skip older months (the ERP logs it as an override; the note says why)"); box.append(l); }
            if (paying) box.append(busyNote(`Paying ${ch.length === 1 ? ch[0].period : `${ch.length} months`} in the ERP tab…`));
            else if (!ch.length) box.append(el("p", "how", "Tick a month to pay."));
            else if (skipped && !f.skipOlder) box.append(el("p", "how", "Older months are unpaid: tick them too, or skip older months."));
            else {
              const what = ch.length === 1 ? ch[0].period : `${ch.length} months`, rc = ch.filter((v) => f.recharge[v.no]).length;
              box.append(wide(armed(`Mark ${what} Lunas · ${rupiah(total)}${rc ? " · recharge" : ""}`, `Click again: ${what} paid by ${f.method}, ${rupiah(total)}${skipped ? `, ${skipped} older left unpaid` : ""}`, "pay", () => {
                if (skipped && f.note.trim().length < 10) { a.pay = { err: "Skipping older months needs a note of 10+ letters." }; return draw(); }
                run(r, "pay", "pay", { nos: ch.map((v) => v.no), method: f.method, date: f.date, note: f.note, skipOlder: f.skipOlder, recharge: Object.fromEntries(ch.map((v) => [v.no, !!f.recharge[v.no]])) },
                  (res) => { for (const v of res.invs) if (v.result?.ok) f.on.delete(v.no); });
              })));
            }
            if (a.pay?.err) box.append(el("p", "warn", a.pay.err));
          } else box.append(el("p", "good", "All paid."));
        }
      }
      out.push(box);
    }

    // 1× link: made by the ERP, which also sends it on its own WhatsApp; if that fails, it goes into this chat's box
    if (a.link) {
      const box = sectEl(r, "link", "Login link", phaseOf(a.link), a.link.err ? "warn" : a.link.data ? (a.link.data.waSent ? "good" : "warn") : "");
      if (a.link.busy) box.append(busyNote("Making the link in the ERP…"));
      else if (a.link.err) box.append(el("p", "warn", `Couldn't make the link: ${a.link.err}`));
      else { const d = a.link.data;
        box.append(el("p", d.waSent ? "good" : "warn", d.waSent ? `Sent by the ERP's WhatsApp to ${d.phone}.` : `The ERP's WhatsApp didn't send it${d.waError ? ` (${d.waError})` : ""}: put it in this chat.`));
        const w = el("div", "row"), put = el("button", d.waSent ? "btn" : "btn main", "Into the message box"); put.type = "button"; put.onclick = () => putInBox(d.message); w.append(put);
        const c = el("button", "btn", "Copy link"); c.type = "button"; c.onclick = () => navigator.clipboard?.writeText(d.link); w.append(c); box.append(w); }
      out.push(box);
    }
    return out;
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
    const m = main(), ids = m ? m.querySelectorAll("[data-id]") : [], key = m ? `${chatTitle()}|${ids[0]?.getAttribute("data-id") || ""}|${ids[ids.length - 1]?.getAttribute("data-id") || ""}|${rows.length}` : "";
    if (key === current.key) return;
    const sameChat = key.split("|")[0] === current.key.split("|")[0];
    current.key = key;
    if (!sameChat) { current.pick = null; current.note = ""; query = ""; editing = false; }
    current.who = m ? whoIsIt() : null;
    if (document.activeElement?.closest?.(".erp-wa textarea")) return; // don't redraw over the reply editor
    draw();
  }

  load(GM_getValue(KEY, null));
  GM_addValueChangeListener(KEY, (k, o, v) => { load(v); current.key = ""; tick(); });
  GM_addValueChangeListener(RES, (k, o, v) => answers(v));
  addEventListener("keydown", (e) => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyK") { e.preventDefault(); toggle(!panel); } }, true);
  setInterval(tick, 700);
})();
