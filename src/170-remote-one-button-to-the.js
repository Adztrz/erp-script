    // ---- Remote: one button to the modem's own page ----
    // Remote finds the live session and opens the modem's page through the ERP's 5-minute port on the RO (logged; any
    // PC), and copies the modem's login password when one is saved for its model. (Straight to the modem's IP over the
    // NOC WireGuard never got through, so that way is gone.)
    const LOGINS = "erpDock.modemLogins", KEEP_OPEN = "erpDock.keepOpen"; // the logins stay in this browser, never in the script
    const modelKey = (x) => fold(x || "").trim();
    function loginFor(model) { // the model's own login, else one saved for its brand (the first word, e.g. "zte")
      const all = ls.get(LOGINS, {}), k = modelKey(model); if (!k) return null;
      return all[k] ? { ...all[k], key: k } : all[k.split(" ")[0]] ? { ...all[k.split(" ")[0]], key: k.split(" ")[0] } : null;
    }
