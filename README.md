# ERP script

A Tampermonkey userscript that makes slow parts of an ERP web app usable, without changing the site.

| Page | Problem (measured 10 Nov 2026) | What the script does |
|---|---|---|
| Work Orders | Downloads 11.6 MB (5,000 + 3,000 orders), draws 6,347 rows (205,000 elements), freezes the tab ~4.9 s | Asks for the newest 500 of each list: 589 rows, 19,000 elements, ~0.2 s. Switch to 1000 or All from the bar at the bottom right; the choice is remembered |
| Approvals | Draws every waiting report (275 rows, 8,300 elements) and redraws them all on each click, ~0.3 s freeze | Shows the first 50 (the rest are only hidden, filters and PDF export still cover all): ~0.05 s. Switch to 100 or All from the bar at the bottom right; the choice is remembered |
| Planning | Downloads 11 MB of network assets (backbone, OLT, ODP…) on every visit. In Rute Tarikan Kabel, DARI / KE Aset each list all 5,095 assets and redraw on every key: 2.1 s to show the section, ~0.13 s a key, ~3 s to open a list | Reuses the assets for 15 minutes (the bar shows how old, with Refresh). Pick a district in the bar and the lists keep that district plus every OLT and ODC (~600): 0.2 s to show, typing smooth (~16 ms a key), 0.2 s to open. Assets with no district are placed by village or nearest asset; poles with no place at all are left out. Pick "All districts" to see everything |
| LDN Radius → Pelanggan search | Asks the server on every search (1–4 s) and matches the typed text as one piece: an extra space, words in another order or a trailing `.` find nobody (0 of 5 in a test) | A **fast search** dropdown under the box: all customers are loaded once (13,520; a page that comes back short is asked for again; about 2 minutes the first time, then kept and refreshed in the background) and searched as you type in ~30–80 ms, any word order, spacing and punctuation ignored, forgiving of spelling (double letters: winna = wina; old spellings: oe = u, dj = j, tj = c; one letter off from 4 letters, two from 9), across name, username, phone, address, village, router and plan (5 of 5 in the same test). ↑↓ and Enter (or a click) put that customer's username into the site's search, so the table shows them |
| Finance → Invoices search | Same as LDN: one server request per search (~2.8 s), the typed text matched as one piece (an extra space, another word order or a trailing `.` find nobody: 0 of 5) | The same **fast search**, for the month the page shows (it follows the month you pick): about 12,000 invoices a month, loaded once (about a minute; the server gives 200 per request, about one request a second). For **Semua Bulan** it loads month by month, newest first, and searches whatever has arrived (a whole year takes about 11 minutes the first time); each month is kept on its own, then searched in ~30–60 ms across invoice number, WinPay ID, name, RADIUS username, contract, village, router, plan and phone. Each result shows status, amount and period. Enter puts the invoice number into the site's search, so the table shows that invoice |
| Idle logout with several tabs open | The ERP logs out after 120 minutes without a click, key, touch or scroll, counted in **each tab on its own**, and a logout in one tab signs out every tab, so a forgotten background tab ends the session you're working in | Real activity in any ERP tab counts for all of them (passed between tabs at most every 30 s). Only real input travels: 120 minutes of doing nothing still logs you out |

The page searches and filters only what it has loaded, so for an older work order choose **All**.

The bar follows the Faust design (Night Ledger: near-black card, bone dot label, graphite segments, blue focus ring). The fast search moves the Faust way too: the box unfolds with a slight un-blur, its label types itself in with a faint blinking cursor, new results rise in one after another (ones that stay don't move), the selection slides between rows, a bone progress line with a light sweep shows loading, and the box folds away on close. All of it is off under the system's reduced-motion setting.

## The Dock

A floating button above the site's own corner button (or **Alt+K**, anywhere in the ERP) opens one search box for customers, pages and tools:

- **Customers**: from the LDN customer list this script keeps (spelling-tolerant, any word order). Each customer opens a card with status (online / offline / isolir), username, phone (copy or WhatsApp), address, area, plan, router, IP, active since, expiry, ONT serial and partner, and the **technicians** for the customer's village from the ERP's own map (HRD → Pemetaan Wilayah Teknisi), by team village lists and by each technician's individual placement (village names compared without spaces). When the village isn't on file or no team covers it, the card says so and goes by the village most of the nearest customers are in, else the area head for the district, else the main village on the customer's router: field team first, then area head (KA …), backbone and office teams, with their members (lead marked); a village no team covers says so. The outage report adds the field team (Tim: …) for its main villages.
- **Pay** (on the card): the customer's unpaid months, asked from the server when the card opens (about 3 s), oldest ticked, with RADIUS recharge. Pick the method, date and note and press **Mark … Lunas** twice: the same request as the ERP's Tandai Lunas Manual, oldest first, with the result on each month. No need to go to Invoices. **Skip older months** (finance manager / admin) pays only the months you tick, for a customer who was away or didn't use the internet: the ERP's own "Lunasi walau ada tagihan lebih tua" exception. The older months stay unpaid, the note must say why (10+ letters), and the ERP logs it as [OVERRIDE tertua-dulu].
- **Open in …**: LDN Radius (on the Pelanggan tab), Invoices, Map Terpadu or Master Pelanggan, with that page's own search filled in when it arrives; Google Maps from the customer's location.
- **Nearby**: everyone within 100 m, 300 m or 1 km of the customer, counted online / offline / isolir, nearest first, on a dark street map (OpenStreetMap's own tiles, darkened; or CARTO's dark map once you paste your own CARTO key under the map: it's kept only in that browser, never in the script), where the status colours stand out, or with **Satellite** the view Peta Terpadu uses (Google hybrid) for finding the house; rings at half and full distance, zoom buttons, full screen (⤢, or **F** with the mouse over the map; F or Esc to go back), and the choice is remembered. Below it, **Same PON**: the customer's OLT and PON port with how many of its modems are offline (from the OLTs' cached lists), a verdict (many down together = the line: PON, splitter or ODP; only this one = the house), its customers outlined on the map, and the offline ones listed to open. Pointing at a dot shows the name and distance and lights up its row; pointing at a row lights up its dot; clicking a dot opens that customer. For checking an area when someone reports an outage.
- **Modems**: type a modem serial (whole or part, e.g. `FHTTC1848B61` or `59000648`) to find it on any of the 46 OLTs (their cached ONT lists, about 11,000 ONTs, kept 2 hours; the first look takes ~6 s), on TR-069 (GenieACS) or in the customer list. Each customer's card has a **Modem** box (found by the SN on file, else by the PPPoE username): model, OLT · PON · ONU, signal (green from −26 dBm, amber to −28, red below) with **Read now** for a live reading from the OLT, and whether it reports to TR-069. For modems on TR-069: **WiFi password** (shown 30 seconds), **Change WiFi** (2,4 / 5 GHz / both, new name and/or password, with a generator). **Reboot** goes through TR-069 when the modem reported in the last 15 minutes, else through the OLT by SN. Changes and reboots need a second press; a modem that's offline or behind NAT gets the change queued, and the box says so. These are the ERP's own calls (ACS / TR-069 and ONT management pages), so nothing touches the MikroTik.
- **Modem web page** (in the Modem box, *Find the modem's address*): the modem's IP and the RO its session is really on, read from RADIUS. The ERP's Remote ONU (Dashbor NOC) looks only on the RO in the customer record, and about 1 in 10 online customers are on another RO (old ARJOSARI / TREMAS records), so it finds nothing for them; the Dock says when that's the case. Links to port 80 and 8080 (and the TR-069 management IP when there is one) open from a device on the NOC WireGuard. Where the ERP does find the session: **Test from the RO** (ping, port 80, 8080; ~20 s, read-only) and **Open from anywhere · 5 min** (the ERP's temporary port on the RO, logged, closes itself; press twice), with a countdown. When every port clearly doesn't answer, it says the modem doesn't serve its page on the internet side and points to the TR-069 buttons.
- **Bulk SPK** and **Review queue** (Tools, or type "spk" / "review"): open those tools from any page. If you're elsewhere the Dock goes to Planning or Approvals first and opens the tool once the page has loaded.
- **PON board** (Tools, or type "pon" / "odp"): every PON port from the OLTs' cached ONT lists, ranked by modems offline (ports with a quarter or more down, 3 at least, first) or by weak signal, each with the age of its newest reading (some OLTs aren't polled for weeks). Modems listed on 0/0/0 (no real port) aren't ranked. Opening a port shows its modems, offline and weakest first, a verdict (many down together = the line; several critical = connectors or splitter) and its customers on the same street/satellite map as Nearby, fitted to where they are (offline red, online green; hover for the name, click to open), with how many of the port's modems could be placed (only those linked to a customer with a saved location).
- **Weak signal** (Tools, or type "signal" / "redaman"): online modems below −28 dBm (critical) or −26 (weak), the ERP's own classes, weakest first, with the PON ports where several are weak at the top: several weak on one port points at a dirty connector or a bad splitter. Readings of 0 or −40 are OLTs saying "no reading" and are left out. Every row opens the customer (or the modem).
- **Outage report** (on a PON port and on a radar router): a ready-to-send message in Indonesian for the technicians (where, how many down of how many, since when, villages, a Google Maps point, the time), with **WhatsApp ↗**, **Copy report**, the affected customers' phone numbers (62…) and a short notice for them.
- **Data health** (Tools, or type "data" / "health"): which numbers to trust. Every OLT's list by age, oldest first, with **Read now** (the ERP's own read-only discovery) and, for stale ones, why the ERP can't reach the OLT (from its own connection test); routers whose session feed is stopped or empty though customers are on file; and **customers on the wrong RO** (the RO on file isn't where their session is), counted by pair, each pair opening its customers, with the whole list as CSV.
- **Outage radar** (Tools, or type "radar" / "gangguan"): every 5 minutes one ERP tab reads the LDN panel's router feed (sessions open on each router, 20 KB) and keeps 48 hours of it. Each router is compared with its own last two hours: a drop of 10% (at least 8 sessions) is an alert, below 30% or a stopped feed is *down*. Alerts put a red dot on the Dock button and on the Outage radar row (the Dock still opens on its menu), with when the dip began; most routers dropping at once is called out as a central problem. Every router has a 24-hour line. Opening one reads the live sessions (6 MB, about a second) to show who's offline right now: count, a map for the technicians (see below), villages with the most offline first (open one for the customers), and how many reconnected in the last 15 minutes (the line coming back). Alerts start about 25 minutes after first use, once there's a usual level to compare with.
- **Pages**: any ERP page by name, learned from the sidebar as you browse.
- **Home**: customers, online and isolir counts from the kept list, shortcuts, and your recent customers.
- **Bulk Lunas**: paste a list of usernames (into the Dock's search, or search "lunas" / "bayar"). Each one is looked up on the server (all months, about 3 s each, five at a time) and shows the customer, what's paid and every unpaid month with its amount, the oldest ticked. Ticking a month ticks the older ones too, since the ERP pays oldest first. A username that isn't exact gets the closest match (left unticked, in amber) or a choice of likely ones; a customer listed twice is shown once. RADIUS recharge is checked with the ERP's own preview and on where it can be. Pick the method (Tunai, Transfer Bank, Setor Reseller, Setor Teknisi), the payment date and a note, then press **Mark … Lunas** twice. It sends the same request as the ERP's Tandai Lunas Manual, one invoice at a time, oldest first, and shows the result on each line (Lunas, recharged, or why the server skipped it). It can be stopped part way.

Apart from paying (the card's Pay and Bulk Lunas) and the outage radar, it never asks the server on its own: it reads what's kept in this browser. Open LDN Radius → Pelanggan once to fill the customer list (the first time takes about 2 minutes), and Invoices once for invoices.

Colours everywhere in the Dock: online green, isolir red, offline grey; red also marks an alarm (critical signal, a port mostly down, stale data) and amber a warning.


### Aktivasi helper

In Technical → Antrean Aktivasi, the ⚡ activation form stays exactly as the ERP made it. While it's open, the Dock button gets a white dot; pressing it opens the activation helper next to the button (press again or × to close), without closing the form:

- **Technician's report:** technician, reported ODP and port, signal, modem.
- **FAT from the technician:** paste what they sent (`pakai fat jimat 4c ya pak, port 3`). It finds the FAT in the database despite chat words and loose spelling, reads the port, and **Use** fills both.
- **FAT/ODP from the report:** matched to the database even when typed loosely (`\FAT LDN NW15`, `FAT 8BBLH`).
- **Nearest FATs/ODPs with free ports** (folded, as a cross-check): measured from the install point, with distance and ports in use. **Use** fills the form's FAT and port fields.
- **Nama Pelanggan:** the name as the ERP lists customers, name + village + STARLITE (`BUDI SANTOSO SUKOREJO STARLITE`). **Use** puts it in the form.
- **Username ideas:** always name + village code, in the ERP's own style (`budisantoso0601`). When the plain name is taken, the village name goes in instead of the form's extra number (`budisukor0601` rather than `budis06012`). Each idea is checked against RADIUS as free or taken; **Use** puts one in the form.
- **Checklist:** name, FAT, port, OLT or modem, serial, and username, updated live.

After you press **Konfirmasi**, a card in the bottom-left corner checks every 20 seconds, for up to 15 minutes, that the activation really works:

- the PPPoE session in RADIUS: online, router, IP and uptime;
- the modem on its OLT: status, PON and signal.

It ends with a verdict: working, weak signal (below −27 dBm, while the technician is still on site), or not online after 15 minutes. It also shows a snippet to copy: modem SN, name (+ village + STARLITE), username, technician, location (village, kecamatan), the KA of that village (the kepala teknis whose villages include it) and a map link. The technician and location come from the calon pelanggan record with the same name. Click any line to copy just that value (the username, the SN…); **Copy all** copies the whole snippet.

The queue shows how many days each customer has waited, and marks anything over 30 days. The helper only reads and fills the form; Konfirmasi stays yours.

### No "new version" bar

The ERP deploys many times an hour, and each deploy showed a blue "Versi baru aplikasi… Muat ulang" bar (or reloaded an idle page by itself). The script switches both off: the ERP's own "Nanti" snooze is set far ahead, and the page no longer reacts to a new service worker taking over. You get the new version whenever you reload or open a tab yourself.

So a page never drifts far behind the server:

- **Update dot:** the build is checked every 2 minutes. When it changes, the Dock button gets a small pulsing dot.
- **Safe reload:** the page then reloads by itself once nothing is at stake: no typing in the page's fields for 10 minutes (or since you moved to another page), no dialog or Dock open, no Dock payment running, and a minute without touching anything.
- **Old-page warning:** if a page has stayed on an old build for over an hour and you save something, it asks first. Cancel stops the save so you can copy what you typed and reload.
- **No double payments:** when a Dock payment fails (for example the server restarting mid-deploy), the Dock asks the ERP what the invoice says now. A payment that went through anyway shows as Lunas; otherwise it says it's safe to try again.

### Maps for technicians

Every Dock map (Nearby, a router's offline customers, a PON port) reads as a brief:

- **Strip on top:** severity (BERAT / SEDANG / RINGAN / NORMAL), how many customers are down out of how many, the router, port or radius, the villages, and since when.
- **What each dot means:** Putus (LOS, red), Mati listrik (dying gasp, dark grey), Offline (grey), Redaman tinggi (online but below −28 dBm, amber), Isolir (hollow), Online (green). LOS, power and signal come from the OLTs' modem lists; the legend shows only what's on the map.
- **Names on the problem customers** where there's room, rings labelled in metres, a scale bar, and the selected customer named.
- **Network boxes** (FAT, ODP, FDT, ODC) from Planning's asset list, once Planning has been opened in this browser. With two or more customers down, the FAT/ODP closest to all of them is ringed as **Cek di sini**. That's where to look first, not proof.
- With customers down, the router and PON maps zoom in on them.
- **⇪ Share** copies a picture of the map with the strip, legend and scale built in, ready to paste into a chat. **Copy note** adds the text: severity, villages, the box to check with a Google Maps link, and each problem customer with phone and location. **Save PNG** saves the picture where copying isn't allowed.
- **The whole Dock moves in halftone:** the panel opens as a wave of dots from the Dock button and folds back into it; rows and cards wipe in left to right behind a dotted edge; full-screen maps open from the centre; loading lines carry a small dot scanner. The masks go once each animation ends.
- **Search loading in halftone:** while customers or invoices download, the search box shows a dot-matrix progress track with a bright scan running along it, the head dot turns into a small spinning dot radar, a faint band of dots sweeps down behind the results, and before any result arrives, ghost rows drawn in dots stand in for them. A normal search plays the same scan once (radar, a dot scan along the head line, a quicker sweep) without moving anything. When idle, the band of dots keeps sweeping slowly behind the results.
- **Motion in a halftone screen:** while the map loads, a faint dot screen with a sonar ring of brighter dots; a new view (zoom, full screen, another radius, Map/Sat) scales the old picture to where the new one sits and hands over through a halftone dissolve. Panning and data refreshes stay still. Under half a second, and off when the system asks for reduced motion.
- **Ctrl + mouse wheel** zooms in and out around the pointer (without zooming the page); drag to pan, ◎ to recentre.
- **Sat** switches between the street map and satellite. Google's satellite tiles can't go into the picture, so a satellite share has a plain dark background.

## Monochrome theme

The half-circle button at the top of the Dock turns the whole ERP black and bone, like Faust: near-black pages, graphite cards, bone for primary buttons, links and focus. Panels with hard-coded blue, violet or cyan (BOQ box, route cards, badges) turn to warm greys of the same lightness. Red, green and amber stay, so errors and status still read. It's applied before the page draws (no flash), remembered in this browser, and the button turns it off again.

## Review queue (Approvals)

Goes through the waiting reports one after another from the keyboard. On Technical → Approvals press **Review queue** in the bar, pick a type if you like, and **Start**. Each report opens in the ERP's own review window, and the keys press that window's own controls:

| Key | Does |
|---|---|
| `C` | the window's **Centang Semua** (look at the photos first) |
| `1`–`9` | tick or untick one check |
| `Shift`+`1`–`9` | pick a reject code (on reports that have them) |
| `T` | write a note; `Enter` goes back to the keys |
| `A` `A` | **Setujui**, pressed twice so one stray key does nothing |
| `R` `R` | **Tolak & Minta Revisi**, pressed twice |
| `N` / `P` | next / previous report |
| `Esc` | close the window and pause; **Continue** picks up where you were |

After a decision is saved, by key or by clicking Setujui / Tolak yourself, the next report opens (switch that off in the panel); closing the window with Tutup pauses. A strip at the top shows where you are, who sent the report and its Validasi, and why Setujui or Tolak isn't open yet.

**Pick & approve** (the switch at the top of the panel) lists the same reports with a box each. Tick the ones to approve (**Tick all** ticks every report in the list shown, **Tick all Lengkap** only those marked Lengkap with GPS matching), press **Approve** twice, and each one is opened in the ERP's window, given **Centang Semua** and **Setujui**, and checked to have left Menunggu before the next. A report whose Setujui stays locked (checks the button doesn't tick, a step of its own) is skipped and marked in the list for you to open; a slow save is waited out for as long as the ERP is still saving (its Setujui spinning; the strip counts the seconds), while anything unexpected (the ERP stopping with the window still open, a question from it, an approval it doesn't confirm) stops the run there. `Esc` stops after the report in hand. The strip at the top, and the summary at the end, show where each report's time went: the ERP's save (and within it its server's verdict and its who-may-decide check, from the browser's own request timings) against the queue's own waits. Only tick what you're sure of: it attests the checklist as if you had ticked it.

Nothing is decided without your keys or ticks, and nothing goes around the ERP: who may decide, all checks ticked before Setujui, and the photos being the ones you saw are still checked by the ERP as when you click. Before starting, the queue sets aside reports you may not decide and those whose photos are still on the technician's phone (the ERP's "Masih di HP"), and puts the rest in an order that keeps alike work together: Lengkap first, then by type, technician and time reported.

## Bulk SPK (Planning)

Makes SPKs from a pasted message, with no form to fill. On Planning press **Bulk SPK** in the bar and paste the message. **How to write it** under the box has an example of each kind, in a box of its own that scrolls; it's open while the box is empty. It understands both kinds of SPK, and one message can mix them:

```
Tarik & aktivasi FAT
Budi santoso
FDT DAYU ke :
* FAT DAYU 1
* FAT DAYU 2

Aktivasi FAT
Agus setiawan 10
Joko susilo 15 spk
```

- **Routes** (Tarik & Aktivasi FAT/FDT, Tarik Kabel Distribusi/Backbone, Perbaikan Kabel Backbone, Splicing Fiber: the types whose form asks for a DARI → KE route): one SPK per route. An asset line with `ke` (or a plain asset line) is where the cable starts, and the bullet lines under it are where it goes; `FDT A ke FAT B` on one line also works, from and to can be any FDT, FAT or ODP. Names are matched to Network Assets ignoring spaces and dashes; a name that isn't there yet becomes a *Calon Aset*, as in the form. Titles follow the route template (`PENARIKAN {dari} KE {ke}` by default).
- **Counts** (Aktivasi ODP/FAT, Aktivasi FDT, Instalasi…: types with no route): `Name 10 spk` (or just `Name 10` under a heading) makes that many SPKs for that person's team, titled after the heading (`AKTIVASI FAT`). Each person's SPKs are saved in one go, so they get all of them or none.

- **Every other type in the form's Tipe Pekerjaan list** works as a count under its heading: Instalasi OLT, Instalasi Joinbox, Survey Lokasi, Maintenance Jaringan Umum, Audit Tiang Existing (needs a real project), Lain-lain. Under a `Cek port` heading, `Name 10 spk` makes *Pengecekan Port ODP (1/10)… (10/10)*, as the form does (the technician picks each ODP when reporting; 100 at most). Under an `Instalasi tiang` heading, a line like `Sudimoro 5-24` makes one SPK per pole, *Tanam Tiang wilayah Sudimoro no 5* to *no 24* (200 at most).
- Three types are left to the form, and a line for them is marked: **Migrasi HTB ke FTTH** and **Visit Pelanggan Isolir atau Dismantle** are made from customers picked in the form, and **Pemasangan CCTV HiView** is one SPK per camera with what the camera is for.

A **heading** sets the type of what follows (`Aktivasi FDT`, `Tarik kabel distribusi`…; an Aktivasi heading over routes means Tarik & Aktivasi). With no heading, routes use the panel's route type and counts are Aktivasi ODP/FAT. A **name** on its own line gives the routes under it to that technician's team (a team name, `Tim Ngadirojo 2`, works too). Routes with nobody named above them go to the team picked in the panel.

**Manual** (the switch at the top of the panel) skips the message: each row is a type, a team and how many (type part of the team's name: pick it from the list, or type any of its words in any order and press Enter), and **+ Add row** adds another. It makes the same count SPKs as above (route types aren't offered there, since they need a DARI → KE pair, nor the three form-only types).

Names are matched to employees forgivingly, but a name spelt exactly as typed wins over one that only sounds close. When several teams fit, the one named after the project's area wins, then the one where the person is a technician; if it's still unclear, or nobody fits a count line, that row shows a team picker. Pick the project (or *Bukan proyek*, as the form's checkbox) and date, and press **Create** twice.

Each SPK is the record Planning's manual form saves for a team, checked field by field against SPKs made by hand: status Baru, the team, the project, no tasks or equipment, progress 0/1, and for routes the route (with the cable length pre-filled from the straight line, as the form does) or for counts target manual. They're saved through Firestore's REST API with your own sign-in, as new documents only, then the ERP's own SPK sync (the one Misi and the SPK monitor call) is run once so they show in Daftar SPK straight away. No WhatsApp or push notice is sent; use Kirim ke WA Grup on Daftar SPK if the team should hear about them. The form's Penanggung Jawab isn't asked for: the form doesn't save it either. Team, project, route type and Paste/Manual are remembered.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open [the raw script](https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-fast.user.js): Tampermonkey offers to install it, and keeps it up to date from here.

Or by hand:
1. Tampermonkey → Dashboard → **+** (new script), replace everything with [`erp-fast.user.js`](erp-fast.user.js), Ctrl+S.
2. Reload the ERP.

To turn it off, switch the script off in Tampermonkey (or pick **All** on Work Orders or Approvals).

## How it works

Tampermonkey lists it as running on all sites, but it only acts on the ERP: it compares the site's hostname with a stored hash and stops straight away anywhere else.


It runs before the page (`@run-at document-start`, `@grant none`) and wraps `window.fetch`:

- `GET /api/pg-read/workOrders`: lowers `limit` to the chosen amount (never raises it).
- `GET /api/pg-read/networkAssets` on `/planning`: answered from the browser's Cache Storage (`erp-fast-assets`) when the copy is under 15 minutes old.
- Fast search (LDN Radius and Invoices): it reads the page's own sign-in header from its requests (kept in memory, never saved), loads `/api/admin/ldn-radius/customers` (500 at a time) or `/api/finance/invoices/list` for the shown month (200 at a time), three requests at once, re-asking for any page that comes back short, and keeps a slim copy in this browser's IndexedDB (`erp-fast`). That copy answers searches at once however old it is, while a fresh list loads behind it once it's past its time (2 hours; invoice months before last, a week). A download saves its pages as it goes, so leaving the page halfway and coming back carries on where it stopped. No passwords are loaded.

- Idle clock: real `mousedown`/`keydown`/`touchstart`/`scroll` in one tab is announced on a `BroadcastChannel` (`erp-fast-activity`) and raised as a `scroll` in the other ERP tabs, which the ERP's own idle timer listens for.

Nothing else is changed and nothing is sent anywhere.
