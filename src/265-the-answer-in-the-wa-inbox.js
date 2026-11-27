    // ---- the Answer in the ERP's Inbox WA ----
    // With a chat open in /wa/inbox (?c=<chat>), the Dock's Answer for that customer sits above the ERP's own customer
    // panel: the verdict (area outage, their cable, modem off, speed cap, line fine…) and the next step, with the reply
    // to send. "Put in reply box" fills the ERP's message box and leaves sending to you; "Show reply" shows it first;
    // "Open card" opens the Dock's full card. Below it, quick replies for the everyday lines. The chat's customer comes from the ERP's own link (the chat's
    // customer_fs_id = the customer's document id); a number not linked to a customer gets nothing.
    const inboxWho = new Map(); // chat id → customer doc id ("" when not linked)
    let inboxBox = null, inboxChat = null;
    function putInReplyBox(text) {
      const ta = document.querySelector('textarea[placeholder^="Tulis balasan"]'); if (!ta) return false;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, text); // React's own setter, so its state follows
      ta.dispatchEvent(new Event("input", { bubbles: true })); ta.focus(); ta.setSelectionRange(text.length, text.length);
      return true;
    }
    // Quick replies: the everyday lines, one press puts them in the reply box. "+ Add" keeps your own in this browser
    // (× on one of yours removes it); the first four are always there.
    const QUICK = "erpDock.quickReplies";
    const QUICK_START = [
      ["Pembayaran", "Terima kasih atas konfirmasi pembayarannya, kak 🙏"],
      ["Konfirmasi", "Terima kasih atas konfirmasinya, kak 🙏"],
      ["Cabut WiFi", "Mohon dibantu cabut modem WiFi-nya selama 1 menit, kemudian dicolok kembali ya kak."],
      ["Ke tim teknis", "Baik kak, untuk kendalanya akan kami sampaikan kepada tim teknis. Terima kasih atas kesabarannya 🙏"],
    ];
    function quickRow() {
      const row = el("div", "quick"), own = () => { try { return JSON.parse(localStorage.getItem(QUICK)) || []; } catch { return []; } };
      const draw = () => {
        row.replaceChildren(el("span", "qlabel", "Quick replies"));
        const chip = (label, text, i) => {
          const b = el("button", "btn chip", label); b.type = "button"; b.title = text;
          b.onclick = () => { if (putInReplyBox(text)) { b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 900); } };
          if (i == null) return b;
          const x = el("button", "x", "×"); x.type = "button"; x.title = "Remove this one"; x.setAttribute("aria-label", `Remove ${label}`);
          x.onclick = () => { const l = own(); l.splice(i, 1); try { localStorage.setItem(QUICK, JSON.stringify(l)); } catch {} draw(); };
          const g = el("span", "mine"); g.append(b, x); return g;
        };
        for (const [l, t] of QUICK_START) row.append(chip(l, t));
        own().forEach(([l, t], i) => row.append(chip(l, t, i)));
        const add = el("button", "btn chip add", "+ Add"); add.type = "button"; add.title = "Save the text in the reply box (or type one) as a quick reply";
        add.onclick = () => {
          const typed = document.querySelector('textarea[placeholder^="Tulis balasan"]')?.value.trim();
          const text = (prompt("The reply text:", typed || "") || "").trim(); if (!text) return;
          const label = (prompt("A short name for its button:", text.split(/\s+/).slice(0, 3).join(" ")) || "").trim().slice(0, 24); if (!label) return;
          const l = own(); l.push([label, text]); try { localStorage.setItem(QUICK, JSON.stringify(l)); } catch {} draw();
        };
        row.append(add);
      };
      draw(); return row;
    }
    function inboxAnswer(r) {
      const wrap = el("div", "erp-dock erp-dock-inline"); wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", "Dock: the Answer for this customer");
      const box = answerBox(r); wrap.append(box, quickRow());
      // answerBox redraws itself (every 30 s while it waits for readings); the extra buttons go back in after each redraw
      const extras = () => {
        const acts = box.querySelector(".actions"), reply = box.querySelector(".reply"); if (!acts || acts.querySelector(".put")) return;
        const put = el("button", "btn put", "Put in reply box"); put.type = "button";
        put.onclick = () => { if (!putInReplyBox(reply?.textContent || "")) { put.textContent = "No reply box"; setTimeout(() => (put.textContent = "Put in reply box"), 1500); } };
        const show = el("button", "btn", wrap.classList.contains("open") ? "Hide reply" : "Show reply"); show.type = "button";
        show.onclick = () => { show.textContent = wrap.classList.toggle("open") ? "Hide reply" : "Show reply"; };
        const card = el("button", "btn", "Open card"); card.type = "button"; card.onclick = () => { location.hash = "dock=" + encodeURIComponent(r.username); };
        acts.prepend(put); acts.append(show, card);
      };
      new MutationObserver(extras).observe(box, { childList: true }); extras();
      return wrap;
    }
    async function inboxTick() {
      const chat = location.pathname === "/wa/inbox" ? new URLSearchParams(location.search).get("c") : null;
      if (chat !== inboxChat) { inboxBox?.remove(); inboxBox = null; inboxChat = chat; }
      if (!chat || inboxBox?.isConnected) return;
      const ta = document.querySelector('textarea[placeholder^="Tulis balasan"]'), col = ta?.closest(".flex-col");
      const head = col && [...col.children].find((c) => c.classList.contains("overflow-y-auto")); if (!head) return; // the chat is still loading
      if (!inboxWho.has(chat)) {
        inboxWho.set(chat, null);
        try { inboxWho.set(chat, (await api(`/api/wa/inbox/${encodeURIComponent(chat)}/detail`)).percakapan?.customer_fs_id || ""); } catch { inboxWho.delete(chat); return; }
      }
      const docId = inboxWho.get(chat); if (!docId || chat !== inboxChat) return;
      await data(); const r = customers?.find((c) => c.customerDocId === docId); if (!r || chat !== inboxChat || inboxBox?.isConnected) return;
      inboxBox?.remove(); inboxBox = inboxAnswer(r); head.before(inboxBox);
    }
    setInterval(() => { if (document.visibilityState === "visible") inboxTick().catch(() => {}); }, 1000);
