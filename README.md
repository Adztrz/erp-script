# ERP script

A Tampermonkey userscript that makes three slow parts of an ERP web app usable, without changing the site.

| Page | Problem (measured 10 Nov 2026) | What the script does |
|---|---|---|
| Work Orders | Downloads 11.6 MB (5,000 + 3,000 orders), draws 6,347 rows (205,000 elements), freezes the tab ~4.9 s | Asks for the newest 500 of each list: 589 rows, 19,000 elements, ~0.2 s. Switch to 1000 or All from the bar at the bottom right; the choice is remembered |
| Planning | Downloads 11 MB of network assets (backbone, OLT, ODP…) on every visit | Reuses them for 15 minutes; the bar shows how old they are and has Refresh |
| LDN Radius → Pelanggan search | Asks the server on every search (1–4 s) and matches the typed text as one piece: an extra space, words in another order or a trailing `.` find nobody (0 of 5 in a test) | A **fast search** dropdown under the box: all customers are loaded once (13,520; a page that comes back short is asked for again; about 2 minutes the first time, then kept 30 minutes and refreshed in the background) and searched as you type in ~30–80 ms, any word order, spacing and punctuation ignored, forgiving of spelling (double letters: winna = wina; old spellings: oe = u, dj = j, tj = c; one letter off from 5 letters, two from 9), across name, username, phone, address, village, router and plan (5 of 5 in the same test). ↑↓ and Enter (or a click) put that customer's username into the site's search, so the table shows them |

The page searches and filters only what it has loaded, so for an older work order choose **All**.

The bar follows the Faust design (Night Ledger: near-black card, bone dot label, graphite segments, blue focus ring).

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
- LDN Radius: it reads the page's own sign-in header from its requests (kept in memory, never saved), loads `/api/admin/ldn-radius/customers` 500 at a time (three requests at once), and keeps a slim copy (name, username, phone, address, village, router, plan, status) in this browser's IndexedDB (`erp-fast`). No passwords are loaded.

Nothing else is changed and nothing is sent anywhere.
