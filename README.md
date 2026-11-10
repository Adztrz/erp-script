# ERP script

A Tampermonkey userscript that makes slow parts of an ERP web app usable, without changing the site.

| Page | Problem (measured 10 Nov 2026) | What the script does |
|---|---|---|
| Work Orders | Downloads 11.6 MB (5,000 + 3,000 orders), draws 6,347 rows (205,000 elements), freezes the tab ~4.9 s | Asks for the newest 500 of each list: 589 rows, 19,000 elements, ~0.2 s. Switch to 1000 or All from the bar at the bottom right; the choice is remembered |
| Planning | Downloads 11 MB of network assets (backbone, OLT, ODP…) on every visit | Reuses them for 15 minutes; the bar shows how old they are and has Refresh |
| LDN Radius → Pelanggan search | Asks the server on every search (1–4 s) and matches the typed text as one piece: an extra space, words in another order or a trailing `.` find nobody (0 of 5 in a test) | A **fast search** dropdown under the box: all customers are loaded once (13,520; a page that comes back short is asked for again; about 2 minutes the first time, then kept and refreshed in the background) and searched as you type in ~30–80 ms, any word order, spacing and punctuation ignored, forgiving of spelling (double letters: winna = wina; old spellings: oe = u, dj = j, tj = c; one letter off from 4 letters, two from 9), across name, username, phone, address, village, router and plan (5 of 5 in the same test). ↑↓ and Enter (or a click) put that customer's username into the site's search, so the table shows them |
| Finance → Invoices search | Same as LDN: one server request per search (~2.8 s), the typed text matched as one piece (an extra space, another word order or a trailing `.` find nobody: 0 of 5) | The same **fast search**, for the month the page shows (it follows the month you pick): about 12,000 invoices a month, loaded once (about a minute; the server gives 200 per request, about one request a second). For **Semua Bulan** it loads month by month, newest first, and searches whatever has arrived (a whole year takes about 11 minutes the first time); each month is kept on its own, then searched in ~30–60 ms across invoice number, WinPay ID, name, RADIUS username, contract, village, router, plan and phone. Each result shows status, amount and period. Enter puts the invoice number into the site's search, so the table shows that invoice |
| Idle logout with several tabs open | The ERP logs out after 120 minutes without a click, key, touch or scroll, counted in **each tab on its own**, and a logout in one tab signs out every tab, so a forgotten background tab ends the session you're working in | Real activity in any ERP tab counts for all of them (passed between tabs at most every 30 s). Only real input travels: 120 minutes of doing nothing still logs you out |

The page searches and filters only what it has loaded, so for an older work order choose **All**.

The bar follows the Faust design (Night Ledger: near-black card, bone dot label, graphite segments, blue focus ring). The fast search moves the Faust way too: the box unfolds with a slight un-blur, its label types itself in with a faint blinking cursor, new results rise in one after another (ones that stay don't move), the selection slides between rows, a bone progress line with a light sweep shows loading, and the box folds away on close. All of it is off under the system's reduced-motion setting.

## The Dock

A floating button above the site's own corner button (or **Alt+K**, anywhere in the ERP) opens one search box for customers, pages and tools:

- **Customers**: from the LDN customer list this script keeps (spelling-tolerant, any word order). Each customer opens a card with status (online / offline / isolir), username, phone (copy or WhatsApp), address, area, plan, router, IP, active since, expiry, ONT serial, and this month's invoice from the kept invoices.
- **Open in …**: LDN Radius (on the Pelanggan tab), Invoices, Map Terpadu or Master Pelanggan, with that page's own search filled in when it arrives; Google Maps from the customer's location.
- **Nearby**: everyone within 100 m, 300 m or 1 km of the customer, counted online / offline / isolir, on a small dot map, nearest first. For checking an area when someone reports an outage.
- **Pages**: any ERP page by name, learned from the sidebar as you browse.
- **Home**: customers, online and isolir counts from the kept list, shortcuts, and your recent customers.
- **Bulk Lunas**: paste a list of usernames (into the Dock's search, or Tools → Bulk Lunas). Each one is looked up on the server (all months, about 3 s each, five at a time) and shows the customer, what's paid and every unpaid month with its amount, the oldest ticked. Ticking a month ticks the older ones too, since the ERP pays oldest first. A username that isn't exact gets the closest match (left unticked, in amber) or a choice of likely ones; a customer listed twice is shown once. RADIUS recharge is checked with the ERP's own preview and on where it can be. Pick the method (Tunai, Transfer Bank, Setor Reseller, Setor Teknisi), the payment date and a note, then press **Mark … Lunas** twice. It sends the same request as the ERP's Tandai Lunas Manual, one invoice at a time, oldest first, and shows the result on each line (Lunas, recharged, or why the server skipped it). It can be stopped part way.

Apart from Bulk Lunas, it never asks the server on its own: it reads what's kept in this browser. Open LDN Radius → Pelanggan once to fill the customer list (the first time takes about 2 minutes), and Invoices once for invoices.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open [the raw script](https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-fast.user.js): Tampermonkey offers to install it, and keeps it up to date from here.

Or by hand:
1. Tampermonkey → Dashboard → **+** (new script), replace everything with [`erp-fast.user.js`](erp-fast.user.js), Ctrl+S.
2. Reload the ERP.

To turn it off, switch the script off in Tampermonkey (or pick **All** on Work Orders).

## How it works

Tampermonkey lists it as running on all sites, but it only acts on the ERP: it compares the site's hostname with a stored hash and stops straight away anywhere else.


It runs before the page (`@run-at document-start`, `@grant none`) and wraps `window.fetch`:

- `GET /api/pg-read/workOrders`: lowers `limit` to the chosen amount (never raises it).
- `GET /api/pg-read/networkAssets` on `/planning`: answered from the browser's Cache Storage (`erp-fast-assets`) when the copy is under 15 minutes old.
- Fast search (LDN Radius and Invoices): it reads the page's own sign-in header from its requests (kept in memory, never saved), loads `/api/admin/ldn-radius/customers` (500 at a time) or `/api/finance/invoices/list` for the shown month (200 at a time), three requests at once, re-asking for any page that comes back short, and keeps a slim copy in this browser's IndexedDB (`erp-fast`). That copy answers searches at once however old it is, while a fresh list loads behind it once it's past its time (2 hours; invoice months before last, a week). A download saves its pages as it goes, so leaving the page halfway and coming back carries on where it stopped. No passwords are loaded.

- Idle clock: real `mousedown`/`keydown`/`touchstart`/`scroll` in one tab is announced on a `BroadcastChannel` (`erp-fast-activity`) and raised as a `scroll` in the other ERP tabs, which the ERP's own idle timer listens for.

Nothing else is changed and nothing is sent anywhere.
