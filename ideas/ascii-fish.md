# ASCII fish strip (parked)

Shipped in Dock v2.97–2.98, taken out in v2.99 and kept here for later. Two fish drawn as characters on a faint grid,
swimming across a strip above the Dock's footer and looping forever, in the Dock's own colours (bone and greys, a little
green and amber). ~24 frames a second, only while the Dock is open and the tab is visible; still under reduced motion.

To bring it back: paste the code into the Dock's panel code (beside `drawBody`), add `fishStrip()` between the body and
the footer in `panel.replaceChildren(top, body, foot)`, and add the CSS line to the Dock's styles.

## CSS

```css
.erp-dock canvas.fish { display: block; width: 100%; height: 80px; flex: none; border-top: 1px solid var(--hair); background: var(--card); pointer-events: none; }
```

## Code

```js
    // ---- a strip of ASCII fish above the footer ----
    // Two fish drawn as characters on a faint grid, swimming across and round again for good: each cell's character
    // and tint come from how much fish covers it (body, wagging tail, fins), with a little flicker and a few drifting
    // specks. One canvas kept across redraws, ~24 frames a second, only while the Dock is open and the tab visible;
    // still under reduced motion.
    let fishEl = null, fishRaf = 0;
    function fishStrip() {
      if (!fishEl) { fishEl = el("canvas", "fish"); fishEl.setAttribute("aria-hidden", "true"); }
      cancelAnimationFrame(fishRaf); fishRaf = requestAnimationFrame(fishTick); setTimeout(() => fishTick(performance.now()), 0); // a first frame even while a frame never comes
      return fishEl;
    }
    const FISH_RAMP = " .'`:;!tos%SX#8@", FISH_TINT = ["#e9e1dc", "#e9e1dc", "#e9e1dc", "#efefed", "#b3b0af", "#b3b0af", "#b3b0af", "#8a8b8a", "#8a8b8a",
      "#e9e1dc", "#b3b0af", "#55bc82", "#55bc82", "#e0b252"]; // the Dock's own: bone and greys, a little of its green and amber
    const FISH = [ // speed in cells a second, size in rows, how far apart, vertical place (share of the strip)
      { v: 6, len: 30, h: 4.2, off: 0, y: 0.42, ph: 0 },
      { v: 4.2, len: 22, h: 3, off: 0.55, y: 0.66, ph: 2.1 },
    ];
    let fishLast = 0;
    function fishTick(now) {
      const c = fishEl; if (!c || !c.isConnected) return;
      if (document.hidden || (now - fishLast < 41 && fishLast)) { fishRaf = requestAnimationFrame(fishTick); return; }
      fishLast = now;
      const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (!w || !h) { fishRaf = requestAnimationFrame(fishTick); return; }
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const cw = 6, ch = 8, cols = Math.ceil(w / cw), rows = Math.floor(h / ch), t = calm() ? 7 : now / 1000, tick = Math.floor(t * 7);
      g.font = '600 6.5px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = "center"; g.textBaseline = "middle";
      const hash = (a, b) => { let x = Math.imul(a * 374761393 + b * 668265263 + tick * 2246822519, 0x27d4eb2d); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        let d = 0;
        for (const f of FISH) {
          const span = cols + f.len * 2, head = ((t * f.v + f.off * span) % span) - f.len; // the head's column, round and round
          const u = (head - i) / f.len; if (u < -0.05 || u > 1.45) continue; // 0 head … 1 base of the tail … 1.45 tail tip
          const sway = Math.sin(t * 5 + f.ph - u * 3) * 0.55 * u * u, cy = rows * f.y + Math.sin(t * 0.9 + f.ph) * 0.5 + sway, dy = Math.abs(j - cy);
          const b = Math.max(0, u); // body: round head, fullest at a third, narrow at the tail's base; then the tail fanning out
          let half = u <= 1 ? f.h * Math.sin(Math.PI * Math.min(1, b ** 0.62)) * (0.25 + 0.75 * Math.min(1, b * 6)) : f.h * 0.18 + (u - 1) * f.h * 2.4;
          if (u > 1.08 && dy < (u - 1) * f.h * 1.1) half = Math.min(half, dy - 0.01 + (u - 1.08) * 0.4); // the tail's fork
          if (u > 0.28 && u < 0.62 && j < cy) half += f.h * 0.75 * Math.sin(((u - 0.28) / 0.34) * Math.PI); // the back fin
          if (u > 0.4 && u < 0.58 && j > cy) half += f.h * 0.45 * Math.sin(((u - 0.4) / 0.18) * Math.PI); // a fin below
          const eye = u > 0.08 && u < 0.14 && j < cy && dy > f.h * 0.15 && dy < f.h * 0.55;
          d = Math.max(d, eye ? 0 : Math.min(1, (half - dy) / 1.1 + 0.3) * (u > 1 ? 0.7 : 1));
        }
        const x = i * cw, y = j * ch, r = hash(i, j);
        if (d <= 0.05 && r > 0.004) { g.fillStyle = "#0e1011"; g.fillRect(x + 1, y + 1, cw - 2, ch - 2); continue; } // the faint grid, and a rare speck
        const k = Math.min(FISH_RAMP.length - 1, Math.max(1, Math.round((d > 0.05 ? d : 0.15) * (FISH_RAMP.length - 1) * (0.75 + r * 0.4))));
        g.fillStyle = "#1a1d1e"; g.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
        g.fillStyle = FISH_TINT[Math.floor(hash(j, i) * FISH_TINT.length)]; g.globalAlpha = d > 0.05 ? 0.6 + d * 0.4 : 0.45; g.fillText(FISH_RAMP[k], x + cw / 2, y + ch / 2 + 0.5); g.globalAlpha = 1;
      }
      if (!calm()) fishRaf = requestAnimationFrame(fishTick);
    }
```
