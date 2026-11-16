---
target: ERP Dock
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/adztrz/Desktop/Claude/userscripts/erp-fast.user.js"
target_fingerprint: "sha256:2d8a2808a6b5fe49e6f83821a3ba8194138ac541e9ccbd8e5454e764e76c8236"
target_path: /home/adztrz/Desktop/Claude/userscripts/erp-fast.user.js
timestamp: 2026-11-14T17-45-23Z
slug: erp-fast-user-js
---
Method: dual-agent (A: design review · B: detector + browser)

Score 29/40 (Good). H1 3, H2 3, H3 3, H4 2, H5 3, H6 2, H7 4, H8 3, H9 3, H10 3.

Specificity: strongly authored for this NOC (domain copy, diagnostic errors, Night Ledger tokens). Slips: decorative motion on every open; English chrome for Indonesian staff.
Detector: raw JS not scannable; extracted CSS+markup gave 7 hits: 3 low-contrast (harness false positive), overused-font Inter (deliberate brand), 3 pulsing dots (FAB alert ping lacks reduced-motion guard). Overlay blocked (mixed content).

Priority issues
1. [P1] Dock opens off-screen at 899x656: top -124px, search input unreachable (place() bottom offset + max-height calc(100vh-120px)).
2. [P1] Three different press-twice patterns (green arm on Pay/Reboot = success colour at risk moment; text-only on Create/Approve; A A strip). Unify style, window, verb, aria-live.
3. [P1] Pick & approve: "Tick all N" ahead of and equal to "Tick all Lengkap"; no summary of what is attested at commit.
4. [P2] Floating layers collide: Dock FAB over Bulk SPK panel; tool panels placed independently.
5. [P2] Discoverability + a11y: Bulk Lunas missing from Tools; Recent customers last; result list lacks listbox semantics; 1 aria-live in 4150 lines; .shut buttons and search input have no focus style.

Personas: Alex - off-screen panel, motion every open, silent arm expiry, keys legend below fold. Sam - no focus return on close, type-anywhere steals focus, HUD visual only, inconsistent segmented-control semantics, red #f12614 on raised 4.06:1.

Minor: 3-line SPK textarea smaller than guide; bare "Loading" on Assets; tokens copied into 5 scopes (red drift #ff6a5c vs #f12614); offline dot same grey as muted text; textarea unlabeled; .seg in Review lacks role/label.
