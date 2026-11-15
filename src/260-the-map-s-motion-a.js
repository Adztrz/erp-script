    // ---- the map's motion: a halftone screen ----
    // Loading: a faint dot screen with a sonar ring of brighter dots until the tiles arrive. A new view (zoom, full
    // screen, another radius, Map/Sat) keeps the old picture, scales it to where the new view puts it, then hands over
    // through a halftone dissolve: the new tiles appear through growing dots while the old ones shrink away. Panning and
    // data refreshes don't animate (and the dots don't pop again). Under half a second; off with reduced motion.
    let lastView = null; // the last map drawn, so a new map for the same customer (another radius) can carry on from it
    function swapTiles(box, tiles, v) {
      const prev = box.prevView || (lastView?.id === v.id && !lastView.tiles.isConnected ? lastView : null);
      box.prevView = lastView = { ...v, tiles };
      box.classList.remove("still");
      if (calm()) return;
      if (prev && prev.z === v.z && prev.kind === v.kind) {
        box.classList.add("still"); // same view, or panned: no pop
        if (prev.left === v.left && prev.top === v.top && prev.tiles !== tiles) { // a data refresh: keep the drawn tiles, and a loading screen or old view still on its way
          tiles.replaceWith(prev.tiles); box.prevView.tiles = lastView.tiles = prev.tiles;
          for (const x of box.htBusy || []) if (!x.isConnected) prev.tiles.before(x);
        }
        return;
      }
      const ready = Promise.race([Promise.all([...tiles.querySelectorAll("img")].map((im) => (im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; })))), new Promise((ok) => setTimeout(ok, 900))]);
      tiles.classList.add("ht-wait");
      if (!prev) { // first view: the loading screen
        const load = el("div", "ht-load"); tiles.before(load); box.htBusy = [load];
        ready.then(() => { box.htBusy = []; tiles.classList.replace("ht-wait", "ht-in"); load.classList.add("gone"); setTimeout(() => { load.remove(); tiles.classList.remove("ht-in"); }, 520); });
        return;
      }
      // the old picture, moved to where the new view puts it: a point at old-screen x lands at s·(x + oldLeft) − newLeft
      const ghost = prev.tiles, s = 2 ** (v.z - prev.z);
      ghost.classList.remove("ht-in", "ht-wait", "ht-out"); ghost.classList.add("ghost"); ghost.style.transform = ""; tiles.before(ghost); box.htBusy = [ghost];
      if (prev.kind === v.kind) { void ghost.offsetWidth; ghost.style.transform = `translate(${s * prev.left - v.left}px, ${s * prev.top - v.top}px) scale(${s})`; } // after a layout, so it moves
      ready.then(() => { box.htBusy = []; tiles.classList.replace("ht-wait", "ht-in"); ghost.classList.add("ht-out"); setTimeout(() => { ghost.remove(); ghost.style.transform = ""; ghost.classList.remove("ghost", "ht-out"); tiles.classList.remove("ht-in"); }, 520); });
    }
    function recentre(box) {
      const b = el("button", null, "◎"); b.type = "button"; b.title = "Back to the start"; b.setAttribute("aria-label", "Recentre the map");
      b.disabled = !box.ctr; b.onclick = () => { box.ctr = null; box.redraw?.(); }; return b;
    }
