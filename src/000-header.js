// ==UserScript==
// @name         ERP — Dock, fast search, faster Work Orders and Planning
// @namespace    adztrz
// @icon         https://raw.githubusercontent.com/Adztrz/erp-script/main/icons/dock.png
// @version      3.29.0
// @description  Work Orders: loads the newest 500 of each list instead of 8,000 (1000 or All any time). Approvals: shows the first 50 waiting reports (100 or All any time), and a Review queue that goes through them from the keyboard on the ERP's own review window, or approves the ones you tick. Planning: reuses the 11 MB of network assets for 15 minutes, and a district picker keeps the cable route lists short so the form stops lagging; Bulk SPK makes one SPK per FDT → FAT route from a pasted message, or a set number of activation SPKs per technician ("Budi santoso 10 spk"), no form needed. LDN Radius → Pelanggan and Finance → Invoices: instant search as you type, any word order, spacing and punctuation ignored, forgiving of spelling (winna = wina).
// @match        https://*/*
// @run-at       document-start
// @grant        none
// @homepageURL  https://github.com/Adztrz/erp-script
// @updateURL    https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-fast.user.js
// @downloadURL  https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-fast.user.js
// ==/UserScript==

(() => {
  "use strict";
  // Runs only on the one ERP site: its hostname's FNV-1a hash is kept here instead of the address itself.
  // Anywhere else the script stops at this line.
  const SITE = "bd1fa6a8";
  let h = 0x811c9dc5;
  for (const c of location.hostname) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  if (h.toString(16) !== SITE) return;

