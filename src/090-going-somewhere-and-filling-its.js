    // ---- going somewhere and filling its search ----
    const OPEN_TOOL = "erpFast.openTool";
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

