    // ---- the Answer in the ERP's Inbox WA ----
    // With a chat open in /wa/inbox (?c=<chat>), the Dock's Answer for that customer sits above the ERP's own customer
    // panel: the verdict (area outage, their cable, modem off, speed cap, line fine…) and the next step, with the reply
    // to send. "Put in reply box" fills the ERP's message box and leaves sending to you; "Show reply" shows it first;
    // "Open card" opens the Dock's full card. The chat's customer comes from the ERP's own link (the chat's
    // customer_fs_id = the customer's document id); a number not linked to a customer gets nothing.
    const inboxWho = new Map(); // chat id → customer doc id ("" when not linked)
    let inboxBox = null, inboxChat = null;
    function putInReplyBox(text) {
      const ta = document.querySelector('textarea[placeholder^="Tulis balasan"]'); if (!ta) return false;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, text); // React's own setter, so its state follows
      ta.dispatchEvent(new Event("input", { bubbles: true })); ta.focus(); ta.setSelectionRange(text.length, text.length);
      return true;
    }
    function inboxAnswer(r) {
      const wrap = el("div", "erp-dock erp-dock-inline"); wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", "Dock: the Answer for this customer");
      const box = answerBox(r); wrap.append(box);
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
