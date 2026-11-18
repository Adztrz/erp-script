  // ---------- Review queue on Approvals ----------
  // Goes through the waiting reports one after another with the keyboard, on the ERP's own review window and buttons: the
  // checklist, "Centang Semua", the reject codes, Setujui and Tolak are the page's, so every check the ERP makes (who may
  // decide, photos unchanged since opened, all checks ticked) still applies and nothing is decided without a key press.
  // Before it starts it sets aside reports you may not decide and those whose photos are still on the technician's phone
  // (address offline://, which the ERP shows as "Masih di HP"), and puts the rest in an order that keeps alike work together:
  // Lengkap first, then by type, technician and time reported.
  // Pick & approve does the same for the reports you tick: each is opened and given the window's Centang Semua, and once
  // its Setujui is open, the save that Setujui makes is started; three run at once (never two of one SPK) while the next
  // reports are checked, and each is seen to leave Menunggu. A report whose Setujui stays locked or waits for photos is
  // skipped and left for you; anything unexpected (the save not found, an unconfirmed save) stops new ones.
  let rv = null; // { list, i, run, type, auto, aside, armed: { k, at }, msg, waiting }
  const reviewOpen = () => !!document.getElementById("erp-review");
  const fiberOf = (el) => el && el[Object.keys(el).find((k) => k.startsWith("__reactFiber"))];
  const rowKey = (tr) => { let f = fiberOf(tr); for (let i = 0; i < 4 && f; i++, f = f.return) if (f.key) return f.key; return null; };
  // the page's own lists, read off its React state: the reports (photo addresses, GPS check) and who may decide each one
  function pageState() {
    let f = fiberOf(document.querySelector("main table")), reps = null, hak = null;
    for (let i = 0; i < 50 && f && !(reps && hak); i++, f = f.return) {
      for (let h = f.memoizedState, j = 0; h && j < 200; h = h.next, j++) {
        const v = h.memoizedState; if (!v || typeof v !== "object") continue;
        if (!reps && Array.isArray(v) && v[0] && typeof v[0] === "object" && "spkId" in v[0] && "status" in v[0]) reps = v;
        else if (!hak && !Array.isArray(v)) { const x = v[Object.keys(v)[0]]; if (x && x.hak && "boleh" in x.hak) hak = v; }
      }
    }
    return { reps, hak };
  }
  const RANK = { Lengkap: 0, "Belum dicek": 1, "N/A": 1, "Tidak Lengkap": 2 };
  function reviewBuild() {
    const st = pageState(), byId = new Map((st.reps || []).map((r) => [r.id, r]));
    const items = [], aside = { phone: 0, notYours: 0 };
    for (const tr of document.querySelectorAll("main table tbody > tr")) {
      const id = rowKey(tr), c = [...tr.cells].map((x) => x.textContent.replace(/\s+/g, " ").trim());
      if (!id || c.length < 9 || !/^Menunggu/.test(c[0])) continue;
      const r = byId.get(id), h = st.hak?.[id];
      if (h && !h.hak.boleh) { aside.notYours++; continue; }
      if (r && JSON.stringify(r).includes("offline://")) { aside.phone++; continue; }
      const val = /Tidak Lengkap|Lengkap|Belum dicek|N\/A/.exec(c[7])?.[0] || "";
      items.push({ id, job: c[4] || c[1], tech: c[3], type: c[5], val, at: r?.reportedAt?.seconds ?? 0, gps: r?.compliance?.gpsMatch });
    }
    items.sort((a, b) => (RANK[a.val] ?? 1) - (RANK[b.val] ?? 1) || a.type.localeCompare(b.type) || a.tech.localeCompare(b.tech) || a.at - b.at);
    return { items, aside, known: !!st.reps };
  }
  const dlg = () => [...document.querySelectorAll('[role="dialog"]:not([id^="erp-"]):not([data-state="closed"])')].pop() || null; // the ERP's open window, not the dock's
  const dlgBtn = (re, not) => [...(dlg()?.querySelectorAll("button") || [])].reverse().find((b) => re.test(b.textContent.trim()) && !(not && not.test(b.textContent.trim())));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(test, ms) { for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) if (test()) return true; return !!test(); }

  function reviewToggle() {
    if (reviewOpen()) return reviewStop(true);
    rv = rv || { i: 0, type: "", auto: true };
    const b = reviewBuild(); Object.assign(rv, { all: b.items, aside: b.aside, known: b.known, run: false, msg: "" });
    const p = document.createElement("div"); p.id = "erp-review"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Review queue");
    document.body.append(p); reviewDraw(); draw(); dispatchEvent(new Event("erp-fast-panel"));
  }
  function reviewStop(close) {
    if (rv) { rv.run = false; rv.waiting = null; }
    document.getElementById("erp-review-hud")?.remove();
    if (close) { document.getElementById("erp-review")?.remove(); draw(); dispatchEvent(new Event("erp-fast-panel")); } else reviewDraw();
  }
  const queue = () => rv.all.filter((x) => !rv.type || x.type === rv.type);
  const reviewDraw = () => keepScroll("erp-review", [".list"], reviewDrawNow);
  function reviewDrawNow() {
    const p = document.getElementById("erp-review"); if (!p || !rv) return;
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (t, run, cls = "") => { const b = mk("button", cls, t); b.type = "button"; b.onclick = run; return b; };
    p.style.display = rv.run ? "none" : ""; // out of the way of the ERP's window (a click outside it closes it)
    p.replaceChildren();
    const head = mk("div", "hd"); head.append(mk("span", "tag", "Review queue"), btn("✕", () => reviewStop(true), "x")); head.lastChild.setAttribute("aria-label", "Close"); p.append(head);
    const modes = mk("div", "seg");
    for (const [m, t] of [["one", "One by one"], ["pick", "Pick & approve"]]) {
      const b = btn(t, () => { rv.mode = m; rv.msg = ""; reviewDraw(); }, (rv.mode || "one") === m ? "on" : ""); b.setAttribute("aria-pressed", String((rv.mode || "one") === m)); modes.append(b);
    }
    p.append(modes);
    const q = queue(), a = rv.aside, aside = [a.phone && `${a.phone} with photos still on the phone`, a.notYours && `${a.notYours} not yours to decide`].filter(Boolean);
    p.append(mk("p", "hint", `${q.length} to review${aside.length ? ` · set aside: ${aside.join(", ")}` : ""}.`));
    if (!rv.known) p.append(mk("p", "note", "Couldn't read the page's report data, so nothing is set aside: watch for photos marked \u201cMasih di HP\u201d."));
    const types = {}; for (const x of rv.all) types[x.type] = (types[x.type] || 0) + 1;
    const s = mk("select"); s.append(new Option(`All types · ${rv.all.length}`, ""));
    for (const [t, n] of Object.entries(types).sort((x, y) => y[1] - x[1])) s.append(new Option(`${t} · ${n}`, t, false, t === rv.type));
    s.onchange = () => { rv.type = s.value; rv.i = 0; reviewDraw(); const l = document.querySelector("#erp-review .list"); if (l) l.scrollTop = 0; }; // another list starts at its top
    const l = mk("label", "row"); l.append(mk("span", null, "Type"), s); p.append(l);
    if (rv.mode === "pick") return pickDraw(p, q, mk, btn);
    const auto = mk("label", "row"), cb = mk("input"); cb.type = "checkbox"; cb.checked = rv.auto; cb.style.width = "auto"; cb.onchange = () => { rv.auto = cb.checked; };
    auto.append(cb, mk("span", null, "Open the next report after each decision")); auto.style.gridTemplateColumns = "auto 1fr"; p.append(auto);
    const list = mk("div", "list");
    q.slice(rv.i, rv.i + 6).forEach((x, k) => {
      const row = mk("div", "rt"); row.append(mk("span", "n", String(rv.i + k + 1)), mk("span", "t", x.job), mk("span", "s", [x.type, x.tech, x.val, x.gps === false ? "GPS off" : ""].filter(Boolean).join(" · ")));
      list.append(row);
    });
    if (q.length) p.append(list);
    const keys = mk("pre", null, "C  the ERP's Centang Semua    1–9  tick one check\nA A  approve (press twice)    R R  reject (twice)\nShift+1–9  a reject code    T  write a note, Enter\nN / P  next / previous       Esc  close and pause");
    keys.style.cssText = "margin:0;font:12px/1.5 'JetBrains Mono',ui-monospace,monospace;color:var(--muted);white-space:pre-wrap";
    p.append(keys);
    if (rv.msg) p.append(mk("p", "note", rv.msg));
    const foot = mk("div", "ft");
    const go = btn(!q.length ? "Nothing to review" : rv.i ? `Continue at ${rv.i + 1} of ${q.length}` : `Start · ${q.length} reports`, () => reviewGo(rv.i), "primary");
    go.disabled = !q.length; foot.append(go);
    if (rv.i) foot.append(btn("From the top", () => { rv.i = 0; reviewGo(0); }));
    foot.append(btn("Reload list", () => { const b = reviewBuild(); Object.assign(rv, { all: b.items, aside: b.aside, known: b.known, i: 0, msg: "" }); reviewDraw(); }));
    p.append(foot);
  }
  // Pick & approve: tick reports, then approve them one after another the way the keys would
  function pickDraw(p, q, mk, btn) {
    const sel = rv.sel ||= new Set(), res = rv.res ||= {};
    const quick = mk("div", "ft");
    quick.append(btn(`Tick all ${q.length}`, () => { for (const x of q) sel.add(x.id); reviewDraw(); }),
      btn("Tick all Lengkap", () => { for (const x of q) if (x.val === "Lengkap" && x.gps !== false) sel.add(x.id); reviewDraw(); }),
      btn("Clear", () => { sel.clear(); reviewDraw(); }));
    p.append(quick);
    const list = mk("div", "list pick");
    for (const x of q) {
      const row = mk("label", `rt ${res[x.id] && res[x.id] !== "ok" ? "err" : ""}`), cb = mk("input"); cb.type = "checkbox"; cb.checked = sel.has(x.id);
      cb.onchange = () => { cb.checked ? sel.add(x.id) : sel.delete(x.id); rv.pArmed = false; label(); }; // in place: the list keeps its scroll
      row.append(cb, mk("span", "t", x.job), mk("span", "s", [x.type, x.tech, x.val, x.gps === false ? "GPS off" : "", res[x.id] && res[x.id] !== "ok" ? res[x.id].replace(/^!/, "") : ""].filter(Boolean).join(" · ")));
      list.append(row);
    }
    p.append(list);
    p.append(mk("p", "hint", "Each ticked report opens in the ERP's window and gets Centang Semua and the save its Setujui makes, as if you pressed them, so only tick what you're sure of. Three save at once (never two of one SPK) while the next ones are checked. One whose Setujui stays locked or waits for photos is skipped and left for you. Esc stops starting new ones."));
    if (rv.msg) p.append(mk("p", "note", rv.msg));
    const foot = mk("div", "ft");
    const go = btn("", () => {
      if (!rv.pArmed) { rv.pArmed = true; label(); setTimeout(() => { if (rv.pArmed) { rv.pArmed = false; label(); } }, 6000); return; }
      rv.pArmed = false; autoRun();
    }, "primary");
    function label() {
      const n = q.filter((x) => sel.has(x.id)).length;
      go.textContent = !n ? "Tick the reports to approve" : rv.pArmed ? `Press again: approve ${n} report${n > 1 ? "s" : ""}` : `Approve ${n} ticked`; go.disabled = !n;
    }
    label(); foot.append(go);
    foot.append(btn("Reload list", () => { const b = reviewBuild(); Object.assign(rv, { all: b.items, aside: b.aside, known: b.known, i: 0, msg: "" }); reviewDraw(); }));
    p.append(foot);
  }
  const rowOf = (id) => [...document.querySelectorAll("main table tbody > tr")].find((r) => rowKey(r) === id);
  const decided = (id) => {
    const tr = rowOf(id), r = pageState().reps?.find((x) => x.id === id);
    return (r && r.status !== "Menunggu Verifikasi") || (!!tr && !/^Menunggu/.test(tr.cells[0]?.textContent.trim() || "")) || (!tr && !dlg());
  };
  // a prop of a React component above this element: the review window's own onSave, the function its Setujui calls
  const propUp = (el, name) => { let f = fiberOf(el); for (let i = 0; i < 80 && f; i++, f = f.return) if (typeof f.memoizedProps?.[name] === "function") return f.memoizedProps[name]; return null; };
  const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
  function autoHud(text) {
    let h = document.getElementById("erp-review-hud");
    if (!h) { h = document.createElement("div"); h.id = "erp-review-hud"; h.setAttribute("role", "status"); document.body.append(h); }
    h.textContent = text;
  }
  const shut = async () => { if (dlg()) { dlgBtn(/^Tutup$/)?.click(); await until(() => !dlg(), 3000); } };
  // one report in the ERP's window: open it, Centang Semua, and see Setujui open for it. Gives the window's save (the
  // one its Setujui calls), a reason it was skipped, or "!reason" to stop. A save finishing elsewhere closes the
  // window, so it's opened again.
  async function autoCheck(id) {
    for (let tries = 0; tries < 3; tries++) {
      await shut();
      const tr = rowOf(id);
      if (!tr || !/^Menunggu/.test(tr.cells[0]?.textContent.trim() || "")) return "already decided";
      [...tr.querySelectorAll("button")].pop()?.click();
      if (!await until(() => dlg(), 8000)) return "!The report didn't open";
      await sleep(900); // the window fills in its checks and photos
      const d = dlg(); if (!d) continue;
      const unticked = () => /Tombol Setujui terbuka/.test(d.textContent);
      for (const c of [...d.querySelectorAll("button")].filter((b) => /^Centang Semua$/.test(b.textContent.trim()))) { if (!unticked()) break; c.click(); await sleep(300); }
      if (dlg() !== d) continue;
      // Setujui as the window labels it: "… hasil QC" or "… & Cairkan Insentif" saves; "… tanpa foto ini" and "Foto belum
      // sampai" wait for photos, so those are left for you
      const b = [...d.querySelectorAll("button")].find((x) => /^Setujui (hasil QC|& Cairkan)/.test(x.textContent.trim()));
      const why = unticked() ? "checks left unticked" : !b ? (/tanpa foto|Foto belum sampai|belum sampai server/i.test(d.textContent) ? "photos not on the server yet" : "no Setujui button") : "";
      const save = b && propUp(b, "onSave");
      await shut();
      if (why) return `${why}: open it yourself`;
      if (!save) return "!The ERP's save wasn't found on its window: the page has changed, use One by one";
      return { save };
    }
    return "!The window kept closing";
  }
  // the save itself: what Setujui calls, with the note it gives ("Sesuai standar."). The ERP answers with a reason when it
  // refuses; otherwise the report is seen to leave Menunggu.
  async function autoSave(id, { save }) {
    const t = performance.now();
    const r = await Promise.race([Promise.resolve().then(() => save(id, "approve", "Sesuai standar.")), sleep(300000).then(() => "\u0000late")]);
    if (r === "\u0000late") return "!The ERP was still saving after 5 minutes: check this report";
    if (typeof r === "string") return String(r).replace(/\s+/g, " ").trim().slice(0, 160) || "the ERP refused it";
    const ok = await until(() => decided(id), 60000);
    rv.times.push(performance.now() - t);
    return ok ? "ok" : "!The approval wasn't confirmed: check this report";
  }
  // Several at once: reports are checked in the window one after another, and each one's save runs while the next are
  // checked; up to `atOnce` saves together, never two of one SPK (approving one also settles its teammates' reports and
  // the SPK). A "!" result stops new ones; the saves already running finish.
  async function runAll(ids, { check, save, spkOf, atOnce, stopped, done }) {
    const pending = [...ids], live = new Map(), busy = new Set(); let halt = "";
    while (!halt && !stopped() && (pending.length || live.size)) {
      const k = live.size < atOnce ? pending.findIndex((id) => !busy.has(spkOf(id))) : -1;
      if (k < 0) { await Promise.race(live.values()); continue; }
      const id = pending.splice(k, 1)[0], c = await check(id);
      if (typeof c === "string") { done(id, c); if (c.startsWith("!")) halt = c.slice(1); continue; }
      const spk = spkOf(id); busy.add(spk);
      live.set(id, (async () => { let r; try { r = await save(id, c); } catch (e) { r = `!${e?.message || e}`; } done(id, r); if (r.startsWith("!")) halt ||= r.slice(1); })()
        .finally(() => { live.delete(id); busy.delete(spk); }));
    }
    await Promise.all(live.values());
    return halt;
  }
  const AT_ONCE = 3;
  async function autoRun() {
    const ids = queue().filter((x) => rv.sel.has(x.id)).map((x) => x.id), reps = new Map((pageState().reps || []).map((r) => [r.id, r]));
    rv.autoOn = true; rv.stopAuto = false; rv.msg = ""; rv.times = []; reviewDraw();
    const p = document.getElementById("erp-review"); if (p) p.style.display = "none";
    let ok = 0, skipped = 0, n = 0; const t0 = performance.now();
    const show = () => autoHud(`Approving ${ids.length}, ${AT_ONCE} at a time · ${ok} approved${skipped ? `, ${skipped} skipped` : ""} · ${n - ok - skipped} saving · Esc stops`);
    show();
    const why = await runAll(ids, {
      atOnce: AT_ONCE, stopped: () => rv.stopAuto, spkOf: (id) => reps.get(id)?.spkId || reps.get(id)?.workOrderId || id,
      check: async (id) => { const c = await autoCheck(id); if (typeof c !== "string") { n++; show(); } return c; },
      save: autoSave,
      done: (id, r) => { rv.res[id] = r; if (r === "ok") { ok++; rv.sel.delete(id); rv.all = rv.all.filter((x) => x.id !== id); } else if (!r.startsWith("!") && r !== "stopped") skipped++; show(); },
    });
    rv.autoOn = false;
    rv.msg = `${ok} approved${skipped ? `, ${skipped} skipped (marked in the list)` : ""}.${why ? ` Stopped: ${why}.` : rv.stopAuto ? " Stopped." : ""}`;
    if (ok) rv.msg += ` ${sec(performance.now() - t0)} in all; each save took ${sec(rv.times.reduce((a, b) => a + b, 0) / Math.max(1, rv.times.length))} on average.`;
    document.getElementById("erp-review-hud")?.remove(); reviewDraw();
  }
  function hud() {
    let h = document.getElementById("erp-review-hud");
    if (!rv?.run) return h?.remove();
    if (!h) { h = document.createElement("div"); h.id = "erp-review-hud"; h.setAttribute("role", "status"); document.body.append(h); }
    const q = queue(), x = q[rv.i]; if (!x) return;
    h.innerHTML = "";
    const b = document.createElement("b"); b.textContent = `${rv.i + 1} / ${q.length}`;
    const t = document.createElement("span"); t.textContent = `  ${x.tech} · ${x.val}${x.gps === false ? " · GPS off" : ""}  `;
    const k = document.createElement("span"); k.className = "k"; k.innerHTML = "<kbd>C</kbd> tick all · <kbd>A</kbd><kbd>A</kbd> approve · <kbd>T</kbd> note · <kbd>R</kbd><kbd>R</kbd> reject · <kbd>N</kbd> next · <kbd>Esc</kbd> pause";
    const m = document.createElement("div"); m.className = "m"; m.textContent = rv.msg || "";
    h.append(b, t, k, m);
  }
  const say = (m) => { rv.msg = m; hud(); };
  // open the report at i in the ERP's own window (closing the one open first)
  async function reviewGo(i) {
    const q = queue();
    if (i >= q.length) { rv.i = q.length ? q.length - 1 : 0; rv.msg = "That was the last one. Reload list to pick up new reports."; return reviewStop(false); }
    rv.i = Math.max(0, i); rv.run = true; rv.opening = true; rv.msg = ""; rv.armed = null; rv.waiting = null; reviewDraw();
    if (dlg()) { const t = dlgBtn(/^Tutup$/); if (t) t.click(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await until(() => !dlg(), 3000); }
    const x = q[rv.i], tr = [...document.querySelectorAll("main table tbody > tr")].find((r) => rowKey(r) === x.id);
    if (!tr || !/^Menunggu/.test(tr.cells[0]?.textContent.trim() || "")) return reviewGo(rv.i + 1); // decided meanwhile
    const open = [...tr.querySelectorAll("button")].pop(); if (!open) return reviewGo(rv.i + 1);
    open.click();
    const ok = await until(() => dlg(), 6000); rv.opening = false;
    if (!ok) { rv.msg = "The report didn't open."; return reviewStop(false); }
    hud();
  }
  // a decision key: the first press arms, a second within 2.5 s presses the ERP's button
  function twice(k, b, why) {
    if (!b) return say(`No ${k === "a" ? "Setujui" : "Tolak"} button on this report.`);
    if (b.disabled) return say(why());
    if (rv.armed?.k !== k || Date.now() - rv.armed.at > 4000) { rv.armed = { k, at: Date.now() }; return say(`Press ${k.toUpperCase()} again to ${k === "a" ? "approve" : "reject"}.`); }
    rv.armed = null; rv.waiting = { id: queue()[rv.i].id, at: Date.now(), from: Date.now() }; say("Saving…"); b.click();
  }
  document.addEventListener("keydown", (e) => {
    if (rv?.autoOn && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); rv.stopAuto = true; autoHud("Stopping: the saves already started finish…"); return; }
    if (!rv?.run || !dlg() || e.ctrlKey || e.metaKey || e.altKey) return;
    const d = dlg(), typing = e.target.closest?.("input, textarea, select, [contenteditable='true']");
    // Enter in the note goes back to the keys
    if (typing) { if (e.key === "Enter" && !e.shiftKey && d.contains(e.target) && e.target.tagName !== "TEXTAREA") { e.preventDefault(); e.target.blur(); d.focus?.(); } return; }
    const k = e.key.toLowerCase(), digit = /^Digit([1-9])$/.exec(e.code);
    let done = true;
    if (k === "a") twice("a", dlgBtn(/^Setujui/, /tanpa/i), () => /Tombol Setujui terbuka[^.]*/.exec(d.textContent)?.[0] || "Setujui isn't open yet: tick the checks (C or 1–9).");
    else if (k === "r") twice("r", dlgBtn(/^Tolak/), () => d.querySelector('[aria-label="Kode tolak"]') ? "Pick a reject code (Shift+1–9) or write a note (T) first." : "Write the reason in the note first: T, type, Enter.");
    else if (k === "t") { const f = [...d.querySelectorAll("textarea, input[type=text], input:not([type])")].find((x) => /catatan|alasan/i.test(x.placeholder)) || [...d.querySelectorAll("textarea, input[type=text]")].pop(); f ? f.focus() : say("No note field on this report."); }
    else if (k === "escape") { const t = dlgBtn(/^Tutup$/); if (t) { t.click(); rv.waiting = null; reviewStop(false); } else done = false; } // the ERP's window ignores Esc
    else if (k === "c") { const b = dlgBtn(/^Centang Semua$/); b ? b.click() : say("No Centang Semua on this report: tick with 1–9."); }
    else if (digit && !e.shiftKey) { const c = d.querySelectorAll('[role="checkbox"]')[digit[1] - 1]; c ? c.click() : say(`There's no check ${digit[1]}.`); }
    else if (digit && e.shiftKey) { const c = d.querySelectorAll('[aria-label="Kode tolak"] button')[digit[1] - 1]; c ? c.click() : say(`There's no reject code ${digit[1]}.`); }
    else if (k === "n") reviewGo(rv.i + 1);
    else if (k === "p") reviewGo(rv.i - 1);
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // follows the ERP's window: when it closes, the report it showed is watched for a few seconds; once it has left
  // Menunggu (decided by key or by clicking Setujui / Tolak) the next one opens, otherwise (closed with Tutup) the queue pauses
  setInterval(() => {
    if (!rv?.run || rv.opening) return;
    if (!rv.waiting && !dlg()) rv.waiting = { id: queue()[rv.i]?.id, at: Date.now(), byHand: true };
    if (!rv.waiting) return;
    const { id, at, byHand } = rv.waiting, tr = [...document.querySelectorAll("main table tbody > tr")].find((r) => rowKey(r) === id);
    const r = pageState().reps?.find((x) => x.id === id), decided = (r && r.status !== "Menunggu Verifikasi") || (!tr && !dlg());
    // still open (or reopened): keep waiting for a key decision only; the ERP may take over a minute to save, so the
    // wait for the report to leave Menunggu counts from when its window closed, not from the key press
    if (dlg()) { if (byHand) rv.waiting = null; else { rv.waiting.at = Date.now(); const s = Math.round((Date.now() - rv.waiting.from) / 1000); if (s >= 8 && s % 5 === 0) say(`Saving… the ERP is still at it (${s} s)`); } return; }
    if (decided) {
      rv.waiting = null; rv.all = rv.all.filter((x) => x.id !== id);
      if (rv.auto) reviewGo(rv.i); else { rv.msg = "Saved."; reviewStop(false); }
    } else if (Date.now() - at > (byHand ? 6000 : 60000)) {
      rv.waiting = null; rv.msg = byHand ? "" : "The decision wasn't confirmed: check that report before going on."; reviewStop(false);
    }
  }, 400);

