// ==UserScript==
// @name         ERP — router bridge for the Dock's Remote
// @namespace    adztrz
// @version      1.1
// @description  Lets the ERP Dock's Remote open a customer's modem page without the ERP: a temporary port on the RO itself (RouterOS 7 REST), only for your own IP, removed by the router after 30 minutes. Router logins stay in Tampermonkey's storage, which the ERP page can't read.
// @match        https://*/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @homepageURL  https://github.com/Adztrz/erp-script
// @updateURL    https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-router-bridge.user.js
// @downloadURL  https://raw.githubusercontent.com/Adztrz/erp-script/main/erp-router-bridge.user.js
// ==/UserScript==

(() => {
  "use strict";
  // Runs only on the one ERP site (the same hostname hash as the Dock); anywhere else it stops here.
  const SITE = "bd1fa6a8";
  let h = 0x811c9dc5;
  for (const c of location.hostname) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  if (h.toString(16) !== SITE) return;

  // ---- the routers you set up: { name, host, scheme, port, user, pass, nas } in Tampermonkey's storage ----
  const KEY = "ros";
  const list = () => GM_getValue(KEY, []);
  const save = (l) => GM_setValue(KEY, l);
  const fold = (x) => String(x || "").toUpperCase().replace(/^RO[\s-]+/, "").trim().split(/[\s-]/)[0]; // "RO PUNUNG NEW" and "PUNUNG" are one RO
  const find = (ro, nas) => list().find((c) => (nas && c.nas === nas) || fold(c.name) === fold(ro));

  function setup(name) {
    const old = find(name) || {};
    const n = prompt("RO name as the ERP writes it (e.g. RO JATIGUNUNG):", name || old.name || ""); if (!n) return null;
    const host = prompt(`${n}: public IP or hostname of its RouterOS REST API (also where the modem port opens):`, old.host || ""); if (!host) return null;
    const scheme = (prompt(`${n}: https (needs a valid certificate) or http?`, old.scheme || "https") || "https").trim().toLowerCase() === "http" ? "http" : "https";
    const port = (prompt(`${n}: API port (blank for ${scheme === "https" ? 443 : 80}):`, old.port || "") || "").trim();
    const nas = (prompt(`${n}: its NAS address in LDN → Router (NAS), e.g. 10.200.0.59 (blank if unknown):`, old.nas || "") || "").trim();
    const user = prompt(`${n}: RouterOS user for the bridge (a user limited to this job is best):`, old.user || ""); if (!user) return null;
    const pass = prompt(`${n}: password for ${user} (kept in Tampermonkey's storage on this PC only):`, ""); if (pass == null) return null;
    const c = { name: n.trim(), host: host.trim(), scheme, port, nas, user: user.trim(), pass };
    save([...list().filter((x) => fold(x.name) !== fold(c.name)), c]);
    return c;
  }
  GM_registerMenuCommand("Router bridge: set up or edit an RO", () => setup(""));
  GM_registerMenuCommand("Router bridge: remove an RO", () => {
    const n = prompt(`Remove which RO? (${list().map((c) => c.name).join(", ") || "none set up"})`); if (!n) return;
    save(list().filter((c) => fold(c.name) !== fold(n)));
  });

  // ---- RouterOS 7 REST ----
  function ros(c, method, path, body) {
    return new Promise((ok, no) => GM_xmlhttpRequest({
      method, url: `${c.scheme}://${c.host}${c.port ? `:${c.port}` : ""}/rest${path}`, timeout: 12000,
      headers: { Authorization: `Basic ${btoa(`${c.user}:${c.pass}`)}`, "Content-Type": "application/json" },
      data: body ? JSON.stringify(body) : undefined,
      onload: (r) => {
        if (r.status >= 200 && r.status < 300) { try { return ok(r.responseText ? JSON.parse(r.responseText) : null); } catch { return ok(null); } }
        let why = r.responseText.slice(0, 160); try { const j = JSON.parse(r.responseText); why = j.detail || j.message || why; } catch { /* plain text */ }
        no(new Error(r.status === 401 ? `${c.name}: login refused` : `${c.name}: ${r.status} ${why}`));
      },
      onerror: () => no(new Error(`${c.name}: not reachable at ${c.scheme}://${c.host}${c.port ? `:${c.port}` : ""} (an https address with a self-signed certificate fails here)`)),
      ontimeout: () => no(new Error(`${c.name}: no answer in 12 s`)),
    }));
  }
  // the router's own clock, so the removal is scheduled in its time (7.10+ writes 2026-11-16, older nov/16/2026)
  const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function later(clock, minutes) {
    let y, mo, d, iso = true, m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clock.date);
    if (m) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; } else { m = /^([a-z]{3})\/(\d{2})\/(\d{4})$/i.exec(clock.date); if (!m) throw new Error(`router date "${clock.date}" not understood`); iso = false; mo = MON.indexOf(m[1].toLowerCase()); d = +m[2]; y = +m[3]; }
    const [hh, mi, ss] = clock.time.split(":").map(Number), x = new Date(Date.UTC(y, mo, d, hh, mi, ss) + minutes * 60000), p = (n) => String(n).padStart(2, "0");
    return { date: iso ? `${x.getUTCFullYear()}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())}` : `${MON[x.getUTCMonth()]}/${p(x.getUTCDate())}/${x.getUTCFullYear()}`, time: `${p(x.getUTCHours())}:${p(x.getUTCMinutes())}:${p(x.getUTCSeconds())}` };
  }
  // a customer's modem address: private ranges only, so the bridge can't be asked to forward anywhere else
  const privateIp = (ip) => { const o = String(ip).split(".").map(Number); if (o.length !== 4 || o.some((x) => !(x >= 0 && x <= 255))) return false;
    return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) || (o[0] === 100 && o[1] >= 64 && o[1] <= 127); };

  // Open: the port forward for your IP only (as the router sees you on this API login), a forward accept when the
  // router has none for port forwards, and a one-shot scheduler on the router that removes all of it after `minutes`.
  async function open({ ro, nas, modemIp, minutes, tag }) {
    if (!privateIp(modemIp)) throw new Error(`${modemIp} isn't a customer modem address`);
    const c = find(ro, nas); if (!c) { const e = new Error(`${ro} isn't set up in the router bridge`); e.code = "noro"; throw e; }
    const mins = Math.max(5, Math.min(60, Number(minutes) || 30)), id = Math.random().toString(16).slice(2, 8);
    const label = `erpdock-remote ${String(tag || "").replace(/[^\w.-]/g, "")} ${id}`, sched = `erpdock-${id}`;
    const me = ((await ros(c, "GET", `/user/active?name=${encodeURIComponent(c.user)}`)) || []).filter((x) => x.address).pop()?.address;
    if (!me) throw new Error(`${c.name}: couldn't see your address on the router`);
    let port = 0; for (let i = 0; i < 8 && !port; i++) { const p = 42000 + Math.floor(Math.random() * 1000); if (!((await ros(c, "GET", `/ip/firewall/nat?dst-port=${p}`)) || []).length) port = p; }
    if (!port) throw new Error(`${c.name}: no free port found`);
    const added = { nat: [], filter: [] };
    const undo = async () => { for (const x of added.nat) await ros(c, "DELETE", `/ip/firewall/nat/${x}`).catch(() => {}); for (const x of added.filter) await ros(c, "DELETE", `/ip/firewall/filter/${x}`).catch(() => {}); };
    try {
      const first = ((await ros(c, "GET", "/ip/firewall/nat?chain=dstnat&.proplist=.id")) || [])[0]?.[".id"];
      const nat = await ros(c, "PUT", "/ip/firewall/nat", { chain: "dstnat", action: "dst-nat", protocol: "tcp", "dst-address-type": "local", "dst-port": String(port),
        "src-address": me, "to-addresses": modemIp, "to-ports": "80", comment: label, ...(first ? { "place-before": first } : {}) });
      added.nat.push(nat[".id"]);
      const fwd = (await ros(c, "GET", "/ip/firewall/filter?chain=forward&.proplist=.id,action,connection-nat-state,disabled")) || [];
      if (fwd.length && !fwd.some((r) => r.action === "accept" && /dstnat/.test(r["connection-nat-state"] || "") && r.disabled !== "true")) {
        const f = await ros(c, "PUT", "/ip/firewall/filter", { chain: "forward", action: "accept", protocol: "tcp", "src-address": me, "dst-address": modemIp, "dst-port": "80", comment: label, "place-before": fwd[0][".id"] });
        added.filter.push(f[".id"]);
      }
      const at = later(await ros(c, "GET", "/system/clock"), mins);
      await ros(c, "PUT", "/system/scheduler", { name: sched, "start-date": at.date, "start-time": at.time, interval: "0s", policy: "read,write", comment: label,
        "on-event": `/ip firewall nat remove [find comment="${label}"]; /ip firewall filter remove [find comment="${label}"]; /system scheduler remove [find name="${sched}"]` });
    } catch (err) { await undo(); throw err; }
    return { url: `http://${c.host}:${port}/`, until: Date.now() + mins * 60000, ro: c.name, me, handle: { ro: c.name, label, sched } };
  }
  async function close({ handle }) {
    const c = find(handle?.ro); if (!c) throw new Error("that RO isn't set up any more");
    for (const [path, key] of [["/ip/firewall/nat", "comment"], ["/ip/firewall/filter", "comment"], ["/system/scheduler", "comment"]])
      for (const r of (await ros(c, "GET", `${path}?${key}=${encodeURIComponent(handle.label)}&.proplist=.id`)) || []) await ros(c, "DELETE", `${path}/${r[".id"]}`);
    return true;
  }

  // ---- talking with the Dock: only status, setup, open and close; the router commands are built here ----
  window.addEventListener("message", async (e) => {
    // Tampermonkey runs this in a sandbox whose window isn't the page's, so the sender is checked by origin
    const d = e.data; if (d?.erpBridge !== "req" || e.origin !== location.origin) return;
    const reply = (ok, data) => window.postMessage({ erpBridge: "res", id: d.id, ok, ...(ok ? { data } : { error: data?.message || String(data), code: data?.code }) }, "*");
    try {
      if (d.op === "status") return reply(true, { version: 1, ros: list().map((c) => ({ name: c.name, nas: c.nas })) });
      if (d.op === "setup") { const c = setup(d.ro || ""); return reply(true, c ? { name: c.name } : null); }
      if (d.op === "open") return reply(true, await open(d));
      if (d.op === "close") return reply(true, await close(d));
      reply(false, new Error("unknown request"));
    } catch (err) { reply(false, err); }
  });
})();
