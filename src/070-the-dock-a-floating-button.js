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

