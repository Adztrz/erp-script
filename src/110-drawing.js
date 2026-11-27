    // ---- drawing ----
    let fab = null, panel = null, corner = null, view = { q: "", sel: 0, card: null, radius: 300 }, items = [];
    const css = `
      .erp-dock, .erp-dock-fab { --canvas: #07090b; --card: #090b0c; --raised: #1a1d1e; --edge: #363738; --hair: #262727; --bone: #e9e1dc; --paper: #efefed; --body: #b3b0af; --muted: #8a8b8a;
        --green: #55bc82; --red: #f12614; --blue: #3e7edf; --soft: cubic-bezier(.1, 0, .1, 1); --out: cubic-bezier(.22, 1, .36, 1);
        font: 400 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-feature-settings: "cv11", "tnum"; -webkit-font-smoothing: antialiased; }
      .erp-dock-fab { position: fixed; z-index: 2147483002; width: 48px; height: 48px; border-radius: 12px; border: 0; cursor: pointer; display: grid; place-items: center;
        background: var(--card); color: var(--bone); box-shadow: inset 0 0 0 1px var(--edge), 0 12px 24px rgba(0,0,0,.35), 0 2px 4px rgba(0,0,0,.3);
        transition: transform .25s var(--out), box-shadow .25s var(--out); animation: erp-dock-in .6s var(--soft) both; }
      .erp-dock-fab:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 1px #696a68, 0 16px 28px rgba(0,0,0,.4), 0 2px 4px rgba(0,0,0,.3); }
      .erp-dock-fab:active { transform: scale(.94); }
      .erp-dock-fab:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
      .erp-dock-fab svg { width: 22px; height: 22px; transition: transform .35s var(--out), opacity .2s; }
      .erp-dock-fab[aria-expanded="true"] svg.open { transform: rotate(90deg) scale(.6); opacity: 0; } .erp-dock-fab svg.x { position: absolute; transform: rotate(-90deg) scale(.6); opacity: 0; }
      .erp-dock-fab[aria-expanded="true"] svg.x { transform: none; opacity: 1; }
      @keyframes erp-dock-in { from { opacity: 0; transform: translateY(12px) scale(.9); filter: blur(2px); } }
      .erp-dock { position: fixed; z-index: 2147483002; width: min(440px, calc(100vw - 32px)); max-height: min(640px, calc(100vh - 120px)); display: flex; flex-direction: column;
        border-radius: 10px; background: var(--card); color: var(--body); overflow: hidden; transform-origin: bottom right;
        box-shadow: inset 0 0 0 1px var(--edge), 0 40px 32px rgba(0,0,0,.18), 0 22px 18px rgba(0,0,0,.2), 0 12px 10px rgba(0,0,0,.2), 0 6px 5px rgba(0,0,0,.18), 0 2px 2px rgba(0,0,0,.2);
        animation: erp-ht-open .5s var(--out) both; }
      .erp-dock.erp-dock-inline { position: relative; z-index: auto; width: auto; max-height: none; margin: 8px 12px; padding: 10px 12px 2px; border-radius: 8px; box-shadow: inset 0 0 0 1px var(--edge); animation: none; flex-shrink: 0; }
      .erp-dock-inline .answer { margin: 0; padding: 0; background: none; box-shadow: none; }
      .erp-dock-inline .answer .reply { display: none; } .erp-dock-inline.open .answer .reply { display: block; }
      .erp-dock-inline .quick { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 0 10px; border-top: 1px solid var(--hair); }
      .erp-dock-inline .quick .qlabel { font-size: 12px; color: var(--muted); margin-right: 2px; }
      .erp-dock-inline .quick .chip { min-height: 28px; padding: 0 10px; font-size: 12.5px; } .erp-dock-inline .quick .chip.done { box-shadow: inset 0 0 0 1px var(--green); color: var(--green); }
      .erp-dock-inline .quick .mine { display: inline-flex; align-items: center; } .erp-dock-inline .quick .mine .x { border: 0; background: none; color: var(--muted); cursor: pointer; padding: 0 4px; font-size: 14px; }
      .erp-dock-inline .quick .mine .x:hover { color: var(--paper); } .erp-dock-inline .quick .add { color: var(--muted); }
      .erp-dock-inline .answer .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .erp-dock.out { animation: erp-ht-close .22s cubic-bezier(.5, 0, .75, 0) both; pointer-events: none; }
      /* Halftone motion: a wave front of dots. Solid behind the front, a band of dots on it, nothing ahead; the mask
         goes once the animation ends (ht-done), so shadows and the map draw as usual. */
      .erp-dock:not(.ht-done), .erp-dock.out {
        mask: radial-gradient(circle at var(--ox, 100%) var(--oy, 100%), #000 calc(var(--ht-w) - 56px), transparent calc(var(--ht-w) - 55px)) 0 0 / 100% 100% no-repeat,
          radial-gradient(circle, #000 1.6px, transparent 2.2px) 0 0 / 6px 6px,
          radial-gradient(circle at var(--ox, 100%) var(--oy, 100%), #000 calc(var(--ht-w) - 8px), transparent var(--ht-w)) 0 0 / 100% 100% no-repeat;
        mask-composite: add, intersect; }
      .erp-dock.erp-dock-full { --ox: 50%; --oy: 50%; }
      @keyframes erp-ht-open { from { --ht-w: 0px; transform: translateY(6px); } to { --ht-w: 1100px; transform: none; } }
      @keyframes erp-ht-close { from { --ht-w: 900px; } to { --ht-w: 0px; transform: translateY(4px); } }
      @keyframes erp-ht-open-full { from { --ht-w: 0px; } to { --ht-w: 1500px; } }

      .erp-dock .top { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--hair); }
      .erp-dock .top svg { width: 16px; height: 16px; color: var(--muted); flex: none; }
      .erp-dock .top input { flex: 1; min-width: 0; height: 32px; border: 0; outline: 0; background: none; color: var(--paper); font: inherit; font-size: 15px; }
      .erp-dock .top input::placeholder { color: var(--muted); }
      .erp-dock .shut { display: grid; place-items: center; width: 32px; height: 32px; margin-right: -6px; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; }
      .erp-dock .shut:hover { background: var(--raised); color: var(--paper); } .erp-dock .shut[aria-pressed="true"] { color: var(--paper); } .erp-dock .shut svg { width: 16px; height: 16px; }
      .erp-dock kbd { font: 11px "JetBrains Mono", ui-monospace, monospace; padding: 1px 5px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--edge); color: var(--body); }
      .erp-dock .scroll { overflow: auto; padding: 6px 6px 10px; }
      .erp-dock .eyebrow { display: flex; align-items: center; gap: 8px; margin: 10px 10px 6px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
      .erp-dock .eyebrow::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--bone); }
      .erp-dock .eyebrow b { font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--paper); }
      .erp-dock .item { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px;
        background: none; color: var(--body); font: inherit; text-align: left; cursor: pointer; }
      .erp-dock .item[aria-selected="true"], .erp-dock .item:hover { background: var(--raised); }
      .erp-dock .item .t { color: var(--paper); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .erp-dock .item .r { font: 12px "JetBrains Mono", ui-monospace, monospace; color: var(--muted); }
      .erp-dock .item .s { grid-column: 2 / 4; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .erp-dock .item svg { width: 16px; height: 16px; color: var(--muted); }
      .erp-dock .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); justify-self: center; }
      .erp-dock .dot.on { background: var(--green); box-shadow: 0 0 0 3px rgba(85,188,130,.15); }
      .erp-dock .dot.unk { background: transparent; box-shadow: inset 0 0 0 1.5px var(--muted); }
      .erp-dock .dot.iso, .erp-dock .dot.bad { background: var(--red); box-shadow: 0 0 0 3px rgba(241,38,20,.15); }
      .erp-dock .dot.off { background: #efefed; } /* online green, isolir red, offline white, as on the maps */
      .erp-dock .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 6px; }
      .erp-dock .tile { display: grid; justify-items: start; gap: 8px; padding: 12px; border: 0; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair);
        color: var(--paper); font: inherit; font-size: 13px; font-weight: 500; text-align: left; cursor: pointer; transition: box-shadow .2s, transform .15s var(--out); }
      .erp-dock .tile:hover, .erp-dock .tile[aria-selected="true"] { box-shadow: inset 0 0 0 1px #696a68; transform: translateY(-1px); }
      .erp-dock .tile svg { width: 18px; height: 18px; color: var(--bone); }
      .erp-dock .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 6px; }
      .erp-dock .stat { padding: 10px 12px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .stat b { display: block; font-size: 20px; font-weight: 500; letter-spacing: -.01em; color: var(--paper); font-variant-numeric: tabular-nums; }
      .erp-dock .stat span { font-size: 12px; color: var(--muted); }
      .erp-dock .stat.on b { color: var(--green); } .erp-dock .stat.iso b, .erp-dock .stat.bad b { color: #ff6a5c; }
      .erp-dock .note { margin: 8px 10px; font-size: 12px; color: var(--muted); }
      /* the customer card */
      .erp-dock .card { padding: 4px 8px 8px; }
      .erp-dock .back { border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; padding: 4px 4px 8px; }
      .erp-dock .back:hover { color: var(--paper); }
      .erp-dock .who { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
      .erp-dock .who h3 { margin: 0; font-size: 18px; font-weight: 500; letter-spacing: -.01em; color: var(--paper); line-height: 1.25; }
      .erp-dock .pill { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px; border-radius: 999px; background: rgba(255,255,255,.05); font-size: 12px; color: var(--body); white-space: nowrap; }
      .erp-dock .facts { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 6px 12px; margin: 12px 4px; font-size: 13px; }
      .erp-dock .facts dt { color: var(--muted); } .erp-dock .facts dd { margin: 0; color: var(--paper); overflow-wrap: anywhere; }
      .erp-dock .mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; }
      .erp-dock .copy { margin-left: 6px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; padding: 0 4px; border-radius: 4px; }
      .erp-dock .copy:hover { color: var(--paper); background: var(--raised); }
      .erp-dock .actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 4px 12px; }
      .erp-dock .btn { height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: none; color: var(--paper); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
        box-shadow: inset 0 0 0 1px var(--edge); transition: box-shadow .2s, transform .1s; text-decoration: none; display: inline-flex; align-items: center; }
      .erp-dock .btn:hover { box-shadow: inset 0 0 0 1px #696a68; } .erp-dock .btn:active { transform: scale(.97); }
      .erp-dock .btn.primary { background: var(--bone); color: var(--canvas); box-shadow: 0 1px 3px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.5); }
      .erp-dock .btn:focus-visible, .erp-dock .item:focus-visible, .erp-dock .tile:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
      .erp-dock .seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .seg button { height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
      .erp-dock .seg button[aria-pressed="true"] { background: var(--raised); color: var(--paper); }
      .erp-dock .near { margin: 4px; padding: 12px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .near .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .erp-dock canvas { display: block; width: 100%; height: 170px; margin: 10px 0 6px; }
      .erp-dock .map { position: relative; height: 340px; margin: 10px 0 6px; border-radius: 8px; overflow: hidden; background: #0f1214; box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .map { cursor: grab; touch-action: none; user-select: none; overflow: clip; } /* clip, not hidden: a hidden box can still be scrolled (by focus or the share panel), sliding the strip and legend away */ .erp-dock .map.panning { cursor: grabbing; } .erp-dock .map.panning .mdot { pointer-events: none; }
      .erp-dock .map .tiles { position: absolute; inset: 0; pointer-events: none; }
      .erp-dock .tbar { height: 6px; border-radius: 3px; background: #1a1d1e; overflow: hidden; margin: 0 0 10px; }
      .erp-dock .tbar span { display: block; height: 100%; background: #55bc82; border-radius: 3px; transition: width .4s cubic-bezier(.22,1,.36,1); }
      .erp-dock .tbar.full span { background: #e0b04f; }
      .erp-dock .tbar.busy span { background: #e0b252; }
      .erp-dock .path .tbar.full span { background: var(--red); }
      .erp-dock .ralert .reach { display: block; margin-top: 4px; color: var(--paper); font-size: 12px; }
      .erp-dock .pubrow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; } .erp-dock .pubrow .field { width: 170px; padding: 4px 8px; }
      .erp-dock .answer .verdict { display: grid; gap: 4px; } .erp-dock .answer .verdict b { font-weight: 600; font-size: 14px; }
      .erp-dock .answer .step { margin: 0 0 8px; color: var(--paper); font-size: 13px; }
      .erp-dock .answer .reply { margin: 0 0 8px; padding: 8px 10px; border-radius: 6px; border: 1px solid #2a2e30; color: var(--muted); font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; }
      .erp-dock a.peak { color: inherit; text-decoration: none; } .erp-dock a.peak:hover b { text-decoration: underline; }
      .erp-dock .peak { display: grid; gap: 4px; padding: 8px 6px 10px; border-bottom: 1px solid #1d2022; font-size: 13px; } .erp-dock .peak b { font-weight: 500; color: var(--paper); } .erp-dock .peak > span { color: var(--muted); font-size: 12px; }
      .erp-dock .hours .hrow { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 2px; } .erp-dock .hours i { height: 10px; border-radius: 2px; background: #1a1d1e; }
      .erp-dock .hours i.ok { background: rgba(85, 188, 130, var(--v)); } .erp-dock .hours i.busy { background: #e0b252; } .erp-dock .hours i.full { background: var(--red); }
      .erp-dock .hours .hax { display: flex; justify-content: space-between; margin-top: 2px; color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
      .erp-dock .chain { display: grid; gap: 0; margin: 0 0 8px; font-size: 13px; }
      .erp-dock .chain .hop { display: grid; grid-template-columns: 12px minmax(0, auto) minmax(0, 1fr); align-items: center; gap: 8px; padding: 4px 0; }
      .erp-dock .chain .hop b { color: var(--paper); font-weight: 500; overflow-wrap: anywhere; } .erp-dock .chain .n { color: var(--muted); font-size: 12px; }
      .erp-dock .chain .lnk { display: grid; gap: 4px; margin: 0 0 0 5px; padding: 4px 0 6px 14px; border-left: 1.5px solid #2a2e30; color: var(--muted); font-size: 12px; }
      .erp-dock .chain .lnk .tbar { margin: 0; height: 4px; max-width: 220px; } .erp-dock .chain .lnk.dead { border-left: 1.5px dashed var(--red); color: #f6b3ab; }
      .erp-dock .map .tiles img { position: absolute; width: 256px; height: 256px; max-width: none; pointer-events: none; user-select: none; }
      @property --ht-r { syntax: "<length>"; inherits: false; initial-value: 6px; }
      @property --ht-w { syntax: "<length>"; inherits: false; initial-value: 9000px; }
      @property --ht-p { syntax: "<percentage>"; inherits: false; initial-value: 200%; }
      .erp-dock .map .tiles.ht-wait { opacity: 0; }
      .erp-dock .map .tiles.ht-in, .erp-dock .map .tiles.ht-out { --ht-mask: radial-gradient(circle, #000 var(--ht-r), transparent calc(var(--ht-r) + .7px)) 0 0 / 7px 7px; -webkit-mask: var(--ht-mask); mask: var(--ht-mask); }
      .erp-dock .map .tiles.ht-in { animation: erp-ht-in .5s var(--out) both; } .erp-dock .map .tiles.ht-out { animation: erp-ht-out .42s cubic-bezier(.5, 0, .75, 0) both; }
      @keyframes erp-ht-in { from { --ht-r: 0px; } to { --ht-r: 5.2px; } } @keyframes erp-ht-out { from { --ht-r: 5.2px; } to { --ht-r: 0px; opacity: .4; } }
      .erp-dock .map .tiles.ghost { transform-origin: 0 0; transition: transform .38s var(--out); will-change: transform; }
      .erp-dock .map .ht-load { position: absolute; inset: 0; pointer-events: none; transition: opacity .4s var(--soft);
        background: radial-gradient(circle, rgba(233,225,220,.07) 0 1px, transparent 1.5px) 0 0 / 8px 8px; }
      .erp-dock .map .ht-load::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle, rgba(233,225,220,.34) 0 1.3px, transparent 1.8px) 0 0 / 8px 8px;
        -webkit-mask: radial-gradient(circle at 50% 50%, transparent calc(var(--ht-w) - 110px), #000 calc(var(--ht-w) - 40px), transparent var(--ht-w));
        mask: radial-gradient(circle at 50% 50%, transparent calc(var(--ht-w) - 110px), #000 calc(var(--ht-w) - 40px), transparent var(--ht-w)); animation: erp-ht-sonar 1.6s cubic-bezier(.3, 0, .2, 1) infinite; }
      .erp-dock .map .ht-load.gone { opacity: 0; }
      @keyframes erp-ht-sonar { from { --ht-w: 0px; } to { --ht-w: 520px; } }
      .erp-dock .map.still .mdot { animation: none; }
      .erp-dock .map .tiles img { filter: invert(1) hue-rotate(180deg) brightness(.78) contrast(.92) saturate(.35); } /* OSM's light map, made dark */
      .erp-dock .map.sat .tiles img, .erp-dock .map.carto .tiles img { filter: none; } .erp-dock .map.sat .tiles img { filter: brightness(.8) saturate(.9); }
      .erp-dock .keyrow { display: flex; gap: 6px; align-items: center; margin: 0 0 8px; font-size: 12px; color: var(--muted); } .erp-dock .keyrow .field { height: 30px; flex: 1; }
      .erp-dock .mdot.pon { box-shadow: 0 0 0 2px var(--bone); }
      .erp-dock .map .basemap { position: absolute; bottom: 20px; right: 8px; z-index: 4; background: rgba(9,11,12,.88); }
      .erp-dock .ponbox { margin: 2px 0 8px; } .erp-dock .ponbox .note { margin: 4px 10px 8px; }
      .erp-dock .ponrow { margin-top: 4px; box-shadow: inset 0 0 0 1px var(--hair); }
      /* the map's extra layers: villages with their team, lines to the nearest FAT/ODP with its down/all count, a ring on
         customers who keep reconnecting, a pulse on fresh drops, the replay slider, the copied-spot pin */
      .erp-dock .map .vlbl { position: absolute; transform: translate(-50%, -50%); text-align: center; pointer-events: none; white-space: nowrap; font: 600 10px/1.25 Inter, system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: rgba(233,225,220,.62); text-shadow: 0 1px 2px #000, 0 0 3px #000; }
      .erp-dock .map .vlbl small { display: block; font-size: 9px; font-weight: 500; letter-spacing: 0; text-transform: none; color: rgba(170,200,255,.8); }
      .erp-dock .map svg.links { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; } .erp-dock .map svg.links line { stroke: rgba(239,239,237,.4); stroke-width: 1; }
      .erp-dock .map .fcnt { position: absolute; z-index: 2; height: 16px; padding: 0 5px; border-radius: 3px; background: rgba(9,11,12,.92); color: var(--paper); font: 700 10px/16px Inter, system-ui, sans-serif; pointer-events: none; box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .map .fcnt.bad { background: var(--red); color: #fff; box-shadow: none; }
      .erp-dock .mdot.on.sg-warn { box-shadow: 0 0 0 2px #e0b252; } .erp-dock .mdot.on.sg-none { opacity: .45; }
      .erp-dock .map svg.links line.up { stroke: rgba(239,239,237,.38); stroke-dasharray: 3 3; } .erp-dock .map svg.links line.dn { stroke: rgba(239,239,237,.8); stroke-width: 1.5; stroke-dasharray: 3 3; }
      .erp-dock .map .fcnt.calm { color: var(--muted); }
      .erp-dock .map svg.links line.known { stroke-dasharray: none; }
      .erp-dock .legend i.k.sgwarn { background: var(--green); box-shadow: 0 0 0 2px #e0b252; } .erp-dock .legend i.k.sgnone { background: var(--green); opacity: .45; }
      .erp-dock .mdot.unst { outline: 2px dashed #e0b252; outline-offset: 2px; }
      .erp-dock .mdot.fresh::after { content: ""; position: absolute; inset: -7px; border-radius: 50%; border: 2px solid rgba(239,239,237,.8); animation: erp-fresh 1.6s var(--out) infinite; pointer-events: none; }
      @keyframes erp-fresh { from { transform: scale(.55); opacity: .9; } to { transform: scale(1.6); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .erp-dock .mdot.fresh::after { animation: none; opacity: .7; } }
      .erp-dock .map .legend .k.link { width: 10px; height: 1px; border-radius: 0; background: rgba(239,239,237,.6); } .erp-dock .map .legend .k.unst { background: var(--green); outline: 1.5px dashed #e0b252; outline-offset: 1px; }
      .erp-dock .map .legend .k.fresh { background: #efefed; box-shadow: 0 0 0 1px #07090b, 0 0 0 2.5px rgba(239,239,237,.7); }
      .erp-dock .map .brief .replay { display: flex; align-items: center; gap: 8px; margin-top: 5px; pointer-events: auto; font-size: 11px; color: var(--body); }
      .erp-dock .map .brief .replay span { flex: none; min-width: 128px; font-variant-numeric: tabular-nums; } .erp-dock .map .brief .replay input { flex: 1; min-width: 0; accent-color: var(--bone); cursor: pointer; }
      .erp-dock .map .brief.replaying { box-shadow: inset 0 0 0 1px #e0b252; } .erp-dock .map .brief.replaying .replay span { color: #e0b252; }
      .erp-dock .map .mpin { position: absolute; z-index: 5; transform: translate(-50%, calc(-100% - 8px)); padding: 3px 7px; border-radius: 4px; background: var(--bone); color: #07090b; font: 600 11px/1.3 Inter, system-ui, sans-serif; white-space: nowrap; pointer-events: none; max-width: 90%; overflow: hidden; text-overflow: ellipsis; }
      .erp-dock .map .mpin::after { content: ""; position: absolute; left: 50%; bottom: -8px; width: 2px; height: 8px; margin-left: -1px; background: var(--bone); }
      .erp-dock .map .pan { position: absolute; inset: 0; will-change: transform; } .erp-dock .map .bgdots { position: absolute; pointer-events: none; }
      .erp-dock .map .ring { position: absolute; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(233,225,220,.7); pointer-events: none; }
      .erp-dock .map .ring.half { box-shadow: none; border: 1px dashed rgba(233,225,220,.45); }
      .erp-dock .mdot { position: absolute; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; padding: 0; border: 1.5px solid rgba(7,9,11,.9); border-radius: 50%; background: var(--green); cursor: pointer;
        transition: transform .12s var(--out), box-shadow .12s; animation: erp-dock-pop .35s var(--out) backwards; animation-delay: var(--d, 0ms); }
      /* isolir red, offline white (the ring says why: red for a cut fibre, dashed for no power), online green */
      .erp-dock .mdot.on { background: var(--green); } .erp-dock .mdot.iso { background: var(--red); border-color: rgba(255,255,255,.9); } .erp-dock .mdot.weak { background: #e0b252; }
      .erp-dock .mdot.los, .erp-dock .mdot.pwr, .erp-dock .mdot.off, .erp-dock .mdot.weak, .erp-dock .mdot.iso { width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; border: 2px solid rgba(255,255,255,.9); }
      .erp-dock .mdot.off, .erp-dock .mdot.los, .erp-dock .mdot.pwr { background: #efefed; border-color: rgba(7,9,11,.9); }
      .erp-dock .mdot.los { border: 2.5px solid var(--red); } .erp-dock .mdot.pwr { border: 2px dashed #8a8b8a; }
      .erp-dock .map .asset { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; background: var(--blue); box-shadow: 0 0 0 1.5px #07090b; pointer-events: none; }
      .erp-dock .map .asset i, .erp-dock .map .fault i { position: absolute; left: 11px; top: -4px; font: 500 10px/1 Inter, system-ui, sans-serif; font-style: normal; color: rgba(170,200,255,.95); white-space: nowrap; text-shadow: 0 1px 2px #000, 0 0 3px #000; }
      .erp-dock .map .fault { position: absolute; width: 32px; height: 32px; margin: -16px 0 0 -16px; border-radius: 50%; border: 2.5px dashed var(--red); pointer-events: none; animation: erp-fault 2s var(--soft) infinite; }
      .erp-dock .map .fault i { left: 50%; top: 36px; transform: translateX(-50%); padding: 3px 6px; border-radius: 4px; background: var(--red); color: #fff; font-weight: 600; font-size: 11px; text-shadow: none; }
      @keyframes erp-fault { 50% { box-shadow: 0 0 0 6px rgba(241,38,20,.18); } }
      .erp-dock .map .ringlbl, .erp-dock .map .melbl, .erp-dock .map .plbl { position: absolute; z-index: 2; pointer-events: none; white-space: nowrap; font: 500 10px/16px Inter, system-ui, sans-serif; }
      .erp-dock .map .ringlbl { transform: translate(-50%, -50%); padding: 0 4px; border-radius: 3px; background: rgba(9,11,12,.85); color: var(--bone); }
      .erp-dock .map .melbl { transform: translate(-50%, 12px); padding: 2px 6px; border-radius: 4px; background: rgba(233,225,220,.95); color: #07090b; font-weight: 600; font-size: 12px; }
      .erp-dock .map .plbl { height: 18px; padding: 1px 6px 1px 7px; border-radius: 4px; background: rgba(9,11,12,.9); color: var(--paper); font-size: 11px; box-shadow: inset 2.5px 0 0 var(--k, #a3a4a3); }
      .erp-dock .map .plbl.los { --k: var(--red); } .erp-dock .map .plbl.pwr { --k: #6b6c6b; } .erp-dock .map .plbl.weak { --k: #e0b252; }
      .erp-dock .map .brief { position: absolute; z-index: 3; top: 8px; left: 8px; right: 44px; padding: 7px 10px; border-radius: 6px; background: rgba(9,11,12,.92); box-shadow: inset 0 0 0 1px var(--hair); pointer-events: none; }
      .erp-dock .map .brief .bt { display: flex; align-items: center; gap: 8px; color: var(--paper); font-weight: 600; font-size: 13px; }
      .erp-dock .map .brief .lv { padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: #07090b; }
      .erp-dock .map .brief .lv.high { background: var(--red); color: #fff; } .erp-dock .map .brief .lv.mid { background: #e0b252; } .erp-dock .map .brief .lv.low { background: #a3a4a3; } .erp-dock .map .brief .lv.ok { background: var(--green); }
      .erp-dock .map .brief .bs, .erp-dock .map .brief .bf { margin-top: 2px; font-size: 11px; color: var(--body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .erp-dock .map .brief .bf { color: #ff8a7a; font-weight: 500; }
      .erp-dock .map .zoom button.bm { font-size: 10px; font-weight: 600; }
      .erp-dock .map .spkpick { position: absolute; z-index: 4; width: 22px; height: 22px; margin: -11px 0 0 -11px; border: 0; border-radius: 50%; background: rgba(9,11,12,.9); color: var(--paper); box-shadow: inset 0 0 0 1.5px var(--paper); font: 600 13px/22px Inter, system-ui, sans-serif; text-align: center; cursor: pointer; padding: 0; }
      .erp-dock .map .spkpick.on { background: var(--paper); color: #07090b; } .erp-dock .map .spkpick:hover { transform: scale(1.12); }
      .erp-dock .map .spksheet { position: absolute; z-index: 6; left: 10px; right: 10px; bottom: 44px; display: grid; gap: 4px; padding: 10px 12px; border-radius: 8px; background: rgba(9,11,12,.94); box-shadow: 0 0 0 1px var(--hair); font-size: 12px; color: var(--muted); max-height: 45%; overflow: auto; }
      .erp-dock .map .spksheet b { color: var(--paper); font-weight: 500; } .erp-dock .map .spksheet .acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 4px; }
      .erp-dock .map .spksheet select, .erp-dock .map .spksheet input { height: 28px; border: 0; border-radius: 6px; background: var(--canvas); color: var(--paper); font: 12px Inter, system-ui, sans-serif; padding: 0 6px; max-width: 220px; }
      .erp-dock .map .spksheet .copy.primary { background: var(--paper); color: #07090b; }
      .erp-dock .map .zoom button.rad.first { margin-top: 6px; }
      .erp-dock .map .zoom button.bm.on { background: var(--paper); color: #07090b; }
      .erp-dock .map .mrx { position: absolute; z-index: 1; transform: translate(9px, -50%); padding: 0 4px; border-radius: 3px; background: rgba(9,11,12,.82); color: var(--body); font: 500 10px/14px Inter, system-ui, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none; }
      .erp-dock .map .mrx.warn { color: #e0b252; } .erp-dock .map .mrx.crit { background: #e0b252; color: #07090b; font-weight: 600; }
      .erp-dock .map .foot { position: absolute; z-index: 3; left: 8px; right: 8px; bottom: 16px; padding: 5px 8px; border-radius: 6px; background: rgba(9,11,12,.88); pointer-events: none; font-size: 11px; color: var(--bone); }
      .erp-dock .map .scale { display: flex; align-items: center; gap: 6px; } .erp-dock .map .scale i { height: 6px; border: 1.5px solid var(--bone); border-top: 0; }
      /* north arrow beside the scale: the map never rotates, so up is always north (U = utara) */
      .erp-dock .map .north { margin-left: auto; display: inline-flex; flex-direction: column; align-items: center; gap: 1px; font-size: 10px; font-weight: 700; line-height: 1; color: var(--bone); }
      .erp-dock .map .north::before { content: ""; border: 5px solid transparent; border-top: 0; border-bottom: 8px solid var(--bone); }
      .erp-dock .map .legend { display: flex; flex-wrap: wrap; gap: 2px 8px; margin-top: 3px; } .erp-dock .map .legend span { display: inline-flex; align-items: center; gap: 4px; }
      .erp-dock .map .legend .k { width: 8px; height: 8px; border-radius: 50%; } .erp-dock .map .legend .k.off, .erp-dock .map .legend .k.los, .erp-dock .map .legend .k.pwr { background: #efefed; } .erp-dock .map .legend .k.los { box-shadow: 0 0 0 1.5px var(--red); } .erp-dock .map .legend .k.pwr { outline: 1px dashed #8a8b8a; outline-offset: 1px; }
      .erp-dock .map .legend .k.weak { background: #e0b252; } .erp-dock .map .legend .k.on { background: var(--green); } .erp-dock .map .legend .k.iso { background: var(--red); }
      .erp-dock .map .legend .k.box { border-radius: 0; background: var(--blue); } .erp-dock .map .legend .k.fault { border: 1.5px dashed var(--red); width: 9px; height: 9px; }
      .erp-dock .map .sharesheet { position: absolute; z-index: 5; left: 50%; bottom: 76px; transform: translateX(-50%); display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; justify-content: center; width: max-content; max-width: calc(100% - 24px);
        padding: 8px 10px; border-radius: 8px; background: var(--card); color: var(--paper); font-size: 12px; box-shadow: inset 0 0 0 1px var(--edge), 0 8px 20px rgba(0,0,0,.5); cursor: default; }
      .erp-dock .map .sharesheet > span:last-child { display: flex; gap: 6px; }
      .erp-dock .mdot:hover, .erp-dock .mdot.hl { transform: scale(1.6); z-index: 2; box-shadow: 0 0 0 3px rgba(233,225,220,.75); }
      .erp-dock .mdot.me { width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px; background: var(--bone); border: 2.5px solid var(--canvas); box-shadow: 0 0 0 2px var(--bone); pointer-events: none; animation: none; z-index: 1; }
      @keyframes erp-dock-pop { from { transform: scale(0); opacity: 0; } }
      .erp-dock .map .tip { position: absolute; z-index: 3; transform: translate(-50%, calc(-100% - 12px)); max-width: 80%; padding: 4px 8px; border-radius: 6px; background: var(--card);
        color: var(--paper); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; box-shadow: inset 0 0 0 1px var(--edge), 0 4px 10px rgba(0,0,0,.4); }
      .erp-dock .map .tip.low { transform: translate(-50%, 14px); }
      .erp-dock .map .zoom { position: absolute; top: 8px; right: 8px; z-index: 4; display: grid; gap: 4px; }
      .erp-dock .map .zoom button { width: 28px; height: 28px; border: 0; border-radius: 6px; background: rgba(9,11,12,.88); color: var(--paper); font: 500 16px/1 Inter, system-ui, sans-serif; cursor: pointer; box-shadow: inset 0 0 0 1px var(--edge); }
      .erp-dock .map .zoom button:hover { box-shadow: inset 0 0 0 1px #696a68; } .erp-dock .map .zoom button:disabled { opacity: .4; cursor: default; }
      .erp-dock.erp-dock-full { inset: 0; width: auto; max-height: none; border-radius: 0; box-shadow: none; z-index: 2147483003; animation: erp-ht-open-full .55s var(--out) both; }
      .erp-dock-full .map.full { position: absolute; inset: 0; height: auto; margin: 0; border-radius: 0; }
      .erp-dock .map.full .mdot { width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; }
      .erp-dock .map .attr { position: absolute; right: 8px; bottom: 2px; font-size: 9px; color: rgba(255,255,255,.75); text-shadow: 0 1px 2px #000; pointer-events: none; }
      .erp-dock .counts span { display: inline-flex; align-items: center; gap: 6px; } .erp-dock .counts .dot { width: 8px; height: 8px; }
      .erp-dock .counts { display: flex; gap: 12px; font-size: 13px; } .erp-dock .counts b { color: var(--paper); font-weight: 500; }
      .erp-dock .rise { animation: erp-ht-wipe .46s var(--soft) both; animation-delay: calc(var(--i, 0) * 35ms); }
      .erp-dock .rise:not(.ht-done) {
        mask: linear-gradient(90deg, #000 calc(var(--ht-p) - 22%), transparent calc(var(--ht-p) - 22% + 1px)) 0 0 / 100% 100% no-repeat,
          radial-gradient(circle, #000 1.4px, transparent 2px) 0 0 / 5px 5px,
          linear-gradient(90deg, #000 calc(var(--ht-p) - 2%), transparent var(--ht-p)) 0 0 / 100% 100% no-repeat;
        mask-composite: add, intersect; }
      @keyframes erp-ht-wipe { from { --ht-p: 0%; transform: translateY(4px); } to { --ht-p: 124%; transform: none; } }
      .erp-dock .note.ld::before { content: ""; display: inline-block; vertical-align: -1px; width: 31px; height: 9px; margin-right: 8px;
        background: radial-gradient(circle, var(--bone) 0 1.2px, transparent 1.7px) 0 0 / 5px 5px;
        mask: linear-gradient(90deg, rgba(0,0,0,.18) calc(var(--ht-p) - 70%), #000 calc(var(--ht-p) - 35%), rgba(0,0,0,.18) var(--ht-p)); animation: erp-ht-scan 1.2s cubic-bezier(.45, 0, .55, 1) infinite; }
      @keyframes erp-ht-scan { from { --ht-p: 0%; } to { --ht-p: 170%; } }

      .erp-dock .foot { padding: 8px 14px; border-top: 1px solid var(--hair); font-size: 12px; color: var(--muted); display: flex; gap: 10px; flex-wrap: wrap; }
      /* Bulk Lunas */
      .erp-dock.wide { width: min(580px, calc(100vw - 32px)); max-height: min(780px, calc(100vh - 120px)); }
      .erp-dock .bulk { padding: 0 6px; }
      .erp-dock .bulk .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .erp-dock .field { width: 100%; box-sizing: border-box; height: 36px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--canvas); color: var(--paper);
        font: inherit; font-size: 13px; box-shadow: inset 0 0 0 1px var(--edge); outline: 0; color-scheme: dark; }
      .erp-dock textarea.field { height: auto; min-height: 92px; padding: 8px 10px; resize: vertical; font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; }
      .erp-dock .field:focus { box-shadow: inset 0 0 0 1px #696a68, 0 0 0 2px var(--blue); }
      .erp-dock .field:disabled { opacity: .5; }
      .erp-dock .lbl { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
      .erp-dock .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .erp-dock .brow { margin-top: 6px; padding: 10px 12px; border-radius: 8px; background: var(--canvas); box-shadow: inset 0 0 0 1px var(--hair); }
      .erp-dock .brow.off { opacity: .6; }
      .erp-dock .brow .h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
      .erp-dock .brow .h b { min-width: 0; font-weight: 500; color: var(--paper); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .erp-dock .brow .h .mono { color: var(--muted); flex: none; }
      .erp-dock .brow .sub { font-size: 12px; color: var(--muted); }
      .erp-dock .mrow { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; margin-top: 8px; font-size: 13px; color: var(--paper); cursor: pointer; }
      .erp-dock .mrow input { width: 16px; height: 16px; margin: 0; accent-color: var(--bone); cursor: pointer; }
      .erp-dock .mrow .mono { color: var(--body); }
      .erp-dock .skipold { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 10px; align-items: start; margin-top: 12px; padding: 8px 10px; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--hair); font-size: 13px; color: var(--paper); cursor: pointer; }
      .erp-dock .skipold input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--bone); cursor: pointer; } .erp-dock .skipold .sub { display: block; margin-top: 2px; font-size: 12px; color: var(--muted); }
      .erp-dock .mrow .x { grid-column: 2 / 4; display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: var(--muted); }
      .erp-dock .mrow .x label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; } .erp-dock .mrow .x input { width: 13px; height: 13px; }
      .erp-dock .late, .erp-dock .brow .late { color: #ff6a5c; } .erp-dock .good, .erp-dock .brow .good { color: var(--green); } .erp-dock .warn, .erp-dock .brow .warn, .erp-dock .brow .h .warn { color: #e0b252; }
      .erp-dock .picks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; } .erp-dock .picks .btn { min-height: 28px; height: auto; font: 12px "JetBrains Mono", ui-monospace, monospace; } .erp-dock .picks .who { font: 12px Inter, system-ui, sans-serif; color: var(--muted); }
      .erp-dock .bform { display: grid; gap: 8px; margin-top: 10px; } .erp-dock .bform:empty { display: none; }
      .erp-dock .bpay { position: sticky; bottom: -10px; display: grid; gap: 8px; margin: 10px -6px -10px; padding: 10px 12px 12px; border-top: 1px solid var(--hair); background: var(--card); }
      .erp-dock .sum { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; } .erp-dock .sum b { color: var(--paper); font-weight: 500; }
      .erp-dock .btn.wide { width: 100%; height: 40px; justify-content: center; }
      .erp-dock .btn.arm { background: var(--green); color: var(--canvas); box-shadow: 0 1px 3px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.35); }
      .erp-dock .btn:disabled { opacity: .45; cursor: default; }
      .erp-dock .rsearch { margin-top: 8px; } .erp-dock .rsearch .field { height: 32px; font-size: 13px; } .erp-dock .rsearch .picks { margin-top: 6px; }
      .erp-dock .foot .ver { margin-left: auto; font: 11px "JetBrains Mono", ui-monospace, monospace; color: var(--muted); }
      .erp-dock .dayck { margin: 4px 0 8px; font-size: 12px; color: var(--muted); } .erp-dock .dayck summary { cursor: pointer; color: var(--paper); padding: 4px 0; }
      .erp-dock .dayck .sub { padding: 2px 0; overflow-wrap: anywhere; } .erp-dock .dayck .btn { margin-top: 8px; }
      .erp-dock .dayck .tots { margin: 8px 0 0; padding-top: 6px; border-top: 1px solid var(--hair); } .erp-dock .dayck .tot { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; color: var(--paper); }
      .erp-dock .dayck .tot.all { margin-top: 4px; font-weight: 600; }
      .erp-dock .bsent .brow.sent { margin: 0 0 6px; } .erp-dock .brow.sent .bar { margin-top: 8px; }
      .erp-dock .bar { height: 2px; border-radius: 2px; background: var(--hair); overflow: hidden; } .erp-dock .bar i { display: block; height: 100%; background: var(--bone); transition: width .3s var(--out); }
      /* Outage radar */
      .erp-dock-fab.alert::after { content: ""; position: absolute; top: 7px; right: 7px; width: 9px; height: 9px; border-radius: 50%; background: var(--red);
        box-shadow: 0 0 0 2px var(--card); animation: erp-dock-ping 1.6s var(--soft) infinite; }
      @keyframes erp-dock-ping { 50% { box-shadow: 0 0 0 2px var(--card), 0 0 0 7px rgba(241,38,20,0); } 0% { box-shadow: 0 0 0 2px var(--card), 0 0 0 0 rgba(241,38,20,.5); } }
      .erp-dock .rhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px; }
      .erp-dock .rhead .tools { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
      .erp-dock .rhead .btn { height: 28px; font-size: 12px; }
      .erp-dock .ralert { display: grid; gap: 2px; width: calc(100% - 8px); margin: 6px 4px; padding: 10px 12px; border: 0; border-radius: 8px; text-align: left; cursor: pointer; font: inherit;
        background: rgba(241,38,20,.08); box-shadow: inset 0 0 0 1px rgba(241,38,20,.45); color: var(--paper); }
      .erp-dock .ralert.drop { background: rgba(224,178,82,.07); box-shadow: inset 0 0 0 1px rgba(224,178,82,.4); }
      .erp-dock .ralert.item { grid-template-columns: minmax(0, 1fr); align-items: start; } /* one column, not the row's dot | text | number */
      .erp-dock .ralert b { font-weight: 500; } .erp-dock .ralert span { font-size: 12px; color: var(--body); }
      .erp-dock .ralert:hover, .erp-dock .ralert[aria-selected="true"] { box-shadow: inset 0 0 0 1px #ff6a5c; }
      .erp-dock .rok { margin: 6px 4px; padding: 10px 12px; border-radius: 8px; background: rgba(85,188,130,.06); box-shadow: inset 0 0 0 1px rgba(85,188,130,.3); font-size: 13px; color: var(--paper); }
      .erp-dock .rrow { grid-template-columns: 18px minmax(0, 1fr) 72px 92px; }
      .erp-dock .rrow canvas, .erp-dock canvas.spark { width: 72px; height: 22px; margin: 0; }
      .erp-dock .rrow .n { text-align: right; font-size: 13px; color: var(--paper); font-variant-numeric: tabular-nums; }
      .erp-dock .rrow .n small { display: block; font-size: 11px; color: var(--muted); }
      .erp-dock .trow { grid-template-columns: 18px minmax(0, 1fr) auto; padding-top: 5px; padding-bottom: 5px; } .erp-dock .trow:disabled { opacity: .55; cursor: default; }
      .erp-dock .trow .n { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; } .erp-dock .topoedit textarea { width: 100%; margin: 8px 0; }
      .erp-dock .hbars { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; height: 56px; margin: 4px 10px 0; align-items: end; }
      .erp-dock .hbars .hb { height: 100%; display: flex; align-items: end; background: rgba(255,255,255,.03); border-radius: 2px; } .erp-dock .hbars i { display: block; width: 100%; min-height: 1px; background: #ff6a5c; border-radius: 2px; opacity: .8; }
      .erp-dock .rrow .crew { color: var(--paper); opacity: .72; white-space: normal; } /* wraps: the KA is at the end */ .erp-dock .ralert span.crew { margin-top: 2px; opacity: .85; }
      .erp-dock .rrow .n small.late { color: #ff6a5c; } .erp-dock .rrow .n small.warn { color: #e0b252; }
      .erp-dock .dot.drop { background: #e0b252; } .erp-dock .dot.down { background: var(--red); box-shadow: 0 0 0 3px rgba(241,38,20,.18); } .erp-dock .dot.ok { background: var(--green); }
      .erp-dock .dot.silent { background: transparent; box-shadow: inset 0 0 0 1px var(--muted); }
      .erp-dock canvas.big { width: 100%; height: 96px; margin: 6px 0 2px; }
      .erp-dock .ticks { display: flex; justify-content: space-between; font: 11px "JetBrains Mono", ui-monospace, monospace; color: var(--muted); }
      .erp-dock .techs { margin: 0 4px 12px; display: grid; gap: 6px; }
      .erp-dock .techs .team { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; align-items: baseline; font-size: 13px; }
      .erp-dock .techs .team b { font-weight: 500; color: var(--paper); } .erp-dock .techs .team .sub { grid-column: 2; font-size: 12px; color: var(--muted); }
      .erp-dock .tag { align-self: start; white-space: nowrap; font-size: 11px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,.06); color: var(--body); }
      .erp-dock .tag.k-field { color: var(--green); background: rgba(85,188,130,.1); } .erp-dock .tag.k-area { color: #e0b252; background: rgba(224,178,82,.1); }
      .erp-dock .cz { padding: 10px 0; border-top: 1px solid var(--hair); } .erp-dock .cz:first-of-type { border-top: 0; }
      .erp-dock .cz .cv { color: var(--paper); font-weight: 500; } .erp-dock .cz .cs { font: 12px "JetBrains Mono", ui-monospace, monospace; color: var(--muted); }
      .erp-dock .cz .note { margin: 4px 0; } .erp-dock .cz .actions { margin: 8px 0 0; } .erp-dock .cz .cf { margin: 4px 0; font-size: 13px; color: #ff8a7a; } .erp-dock .cz .cf span { color: var(--muted); } .erp-dock .cz .cf a { color: var(--paper); }
      .erp-dock .dform { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center; margin-top: 8px; font-size: 12px; color: var(--muted); }
      .erp-dock .dform select, .erp-dock .dform input { height: 32px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--raised); color: var(--paper); font: inherit; font-size: 13px; min-width: 0; }
      .erp-dock .dform select:focus-visible, .erp-dock .dform input:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
      .erp-dock .btn.arm { background: #e0b252; color: var(--canvas); }
      .erp-dock .hist .verdict { margin: 0 0 10px; padding: 8px 10px; border-radius: 6px; background: var(--raised); color: var(--paper); font-size: 13px; box-shadow: inset 3px 0 0 var(--muted); }
      .erp-dock .hist .verdict.net, .erp-dock .hist .verdict.cut { box-shadow: inset 3px 0 0 var(--red); } .erp-dock .hist .verdict.iso { box-shadow: inset 3px 0 0 var(--red); }
      .erp-dock .hist .verdict.warn { box-shadow: inset 3px 0 0 #e0b252; } .erp-dock .hist .verdict.ok { box-shadow: inset 3px 0 0 var(--green); } .erp-dock .hist .verdict.off { box-shadow: inset 3px 0 0 var(--paper); }
      .erp-dock .hist .facts { margin: 0 0 8px; }
      .erp-dock .tl { display: grid; } .erp-dock .tl .ev { display: grid; grid-template-columns: 96px 1fr; gap: 0 10px; padding: 6px 0; border-top: 1px solid var(--hair); font-size: 13px; }
      .erp-dock .tl .ev time { grid-row: span 2; font: 12px "JetBrains Mono", ui-monospace, monospace; color: var(--muted); } .erp-dock .tl .et { color: var(--paper); overflow-wrap: anywhere; } .erp-dock .tl .es { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
      .erp-dock .tl .ev.tix .et::before, .erp-dock .tl .ev.iso .et::before, .erp-dock .tl .ev.pay .et::before, .erp-dock .tl .ev.net .et::before, .erp-dock .tl .ev.inv .et::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; vertical-align: 1px; background: var(--muted); }
      .erp-dock .tl .ev.tix .et::before { background: #e0b252; } .erp-dock .tl .ev.iso .et::before { background: var(--red); } .erp-dock .tl .ev.pay .et::before { background: var(--green); } .erp-dock .tl .ev.net .et::before { background: var(--blue); }
      .erp-dock .pw.msg { white-space: pre-wrap; font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; display: block; }
      .erp-dock .report .actions { margin: 8px 0 0; }
      .erp-dock .hrow { cursor: default; } .erp-dock .hrow:hover { background: none; }
      .erp-dock .desa { grid-template-columns: minmax(0, 1fr) 120px auto; } .erp-dock .desa .s { grid-column: 1 / -1; }
      .erp-dock .meter { height: 4px; border-radius: 2px; background: var(--hair); overflow: hidden; } .erp-dock .meter i { display: block; height: 100%; background: #ff6a5c; }
      /* Modem */
      .erp-dock .modem .facts { margin: 10px 0; }
      .erp-dock .modem .actions { margin: 4px 0 0; }
      .erp-dock .modem form { display: grid; gap: 8px; margin-top: 10px; }
      .erp-dock .pw { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: var(--raised); color: var(--paper); font: 13px "JetBrains Mono", ui-monospace, monospace; }
      .erp-dock .pw span { flex: 1; overflow-wrap: anywhere; }
      /* incidents and the shift journal */
      .erp-dock .item.incident { box-shadow: inset 2px 0 0 var(--red); }
      .erp-dock .timeline .tl { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 3px 0; font-size: 13px; color: var(--paper); }
      .erp-dock .timeline .tl.auto { color: var(--body); } .erp-dock .timeline .tl .mono { color: var(--muted); font-size: 12px; }
      .erp-dock .timeline .field { width: 100%; margin-top: 8px; height: 34px; }
      .erp-dock .jp { display: grid; gap: 6px; } .erp-dock .jp textarea.field { min-height: 64px; height: auto; padding: 8px 10px; resize: vertical; font: 13px/1.45 Inter, system-ui, sans-serif; }
      .erp-dock .jp select.field { height: 32px; } .erp-dock .jp.done { opacity: .55; }
      .erp-dock .copy.on { color: var(--green); box-shadow: inset 0 0 0 1px var(--green); }
      .erp-dock .loginform { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; } .erp-dock .loginform .field { height: 30px; flex: 1 1 110px; min-width: 0; }
      .erp-dock .rx { font-variant-numeric: tabular-nums; }
      .erp-dock .webbox .facts { margin: 8px 0; } .erp-dock .webbox .note { margin: 6px 0; } .erp-dock .webbox .note a { color: var(--paper); overflow-wrap: anywhere; }
      .erp-dock .note.warn { color: #e0b252; }
      @media (max-width: 760px) { .erp-dock .row2 { grid-template-columns: 1fr; } .erp-dock .mrow { min-height: 36px; } }
      @media (max-width: 760px) { .erp-dock .top kbd { display: none; } .erp-dock .shut { width: 40px; height: 40px; } .erp-dock .item { min-height: 44px; } .erp-dock { left: 8px !important; right: 8px !important; width: auto; bottom: 8px !important; top: auto !important; max-height: 80vh; transform-origin: bottom center; } }
      @media (prefers-reduced-motion: reduce) { .erp-dock, .erp-dock *, .erp-dock-fab, .erp-dock-fab * { animation: none !important; transition: none !important; } }`;
    const svg = (d, cls = "") => { const n = "http://www.w3.org/2000/svg", s = document.createElementNS(n, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none");
      s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.5"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
      if (cls) s.setAttribute("class", cls); const p = document.createElementNS(n, "path"); p.setAttribute("d", d); s.append(p); return s; };
    const ICON = { rook: "M4.56 2.00L8.14 2.00L8.14 4.03L10.27 4.03L10.27 2.00L13.65 2.00L13.65 4.03L15.94 4.03L15.94 2.00L19.49 2.00L19.49 5.77L9.75 12.08L9.75 15.38L5.91 17.84L7.62 16.68L7.62 10.44L8.71 9.32L4.56 5.64ZM15.42 9.74L16.45 10.44L16.45 16.03L19.57 19.40L19.57 22.00L4.43 22.00L4.43 19.45L5.91 19.45L11.44 15.64L11.44 12.08Z", dock: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 17h6M17 14v6", x: "M6 6l12 12M18 6 6 18", search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4", page: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4", go: "M5 12h14M13 6l6 6-6 6" };

    function place() {
      if (!fab) return;
      // just above the site's own round button in the corner (Iris), or in the corner if there isn't one
      // (only the site's fixed-position elements are looked at, and the one found is remembered: some pages are huge)
      if (!corner?.isConnected) corner = [...document.querySelectorAll(".fixed")].find((e) => !e.closest(".erp-dock") && e.offsetWidth >= 44 && e.offsetWidth <= 72 && e.offsetHeight <= 72
        && e.getBoundingClientRect().right > innerWidth - 120 && e.getBoundingClientRect().bottom > innerHeight - 260) || null;
      const other = corner;
      const r = other?.getBoundingClientRect();
      const right = r ? Math.max(12, innerWidth - r.right + (r.width - 48) / 2) : 24, bottom = r ? innerHeight - r.top + 12 : 24;
      fab.style.right = `${right}px`; fab.style.bottom = `${bottom}px`;
      if (panel) {
        // above the button when there's room for most of it; in a short window, beside the button from near the bottom
        // instead, so the search row never goes off the top. Its height always ends 12 px under the window's top.
        const want = panel.classList.contains("wide") ? 780 : 640, phone = innerWidth <= 760;
        let pb = bottom + 60, pr = right;
        if (!phone && innerHeight - pb - 12 < Math.min(want, 480)) { pb = 12; pr = right + 60; }
        panel.style.right = `${pr}px`; panel.style.bottom = `${pb}px`;
        panel.style.maxHeight = phone ? "" : `${Math.min(want, innerHeight - pb - 12)}px`;
      }
      // Bulk SPK and the Review queue open beside the button, not under it; on a narrow screen the button steps aside
      for (const id of ["erp-bulk-spk", "erp-review"]) { const t = document.getElementById(id); if (t) t.style.right = innerWidth >= 640 ? `${right + 60}px` : ""; }
      fab.style.visibility = !panel && innerWidth < 640 && (document.getElementById("erp-bulk-spk") || document.getElementById("erp-review")) ? "hidden" : "";
    }
    addEventListener("erp-fast-panel", () => place()); addEventListener("resize", () => place()); // a tool panel opened or closed, or the window changed
    function mount() {
      if (fab?.isConnected) return;
      if (!document.getElementById("erp-dock-css")) { const s = el("style"); s.id = "erp-dock-css"; s.textContent = css; document.head.append(s); }
      fab = el("button", "erp-dock-fab"); fab.type = "button"; fab.title = "Dock (Alt+K)"; fab.setAttribute("aria-label", "Open the Dock"); fab.setAttribute("aria-expanded", "false");
      const mark = svg(ICON.rook, "open"); mark.setAttribute("fill", "currentColor"); mark.setAttribute("stroke", "none"); // the rook, cracked in two
      fab.append(mark, svg(ICON.x, "x")); fab.onclick = () => (panel ? close() : open());
      document.body.append(fab); place();
    }
    async function open() {
      if (panel) return;
      panel = el("div", "erp-dock"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Dock");
      document.body.append(panel); fab.setAttribute("aria-expanded", "true"); place();
      if (calm()) panel.classList.add("ht-done"); // no motion: no mask either
      { const a = fab.getBoundingClientRect(), b = panel.getBoundingClientRect(); // the halftone wave starts at the Dock button
        panel.style.setProperty("--ox", `${a.left + a.width / 2 - b.left}px`); panel.style.setProperty("--oy", `${a.top + a.height / 2 - b.top}px`); }
      view = { q: "", sel: 0, card: null, radius: view.radius, mode: bulk && bulk.phase !== "input" ? "bulk" : null }; // a bulk run in progress comes back; an outage only marks the Outage radar row
      draw(); panel.querySelector("input")?.focus();
      await data(); draw();
    }
    // a halftone reveal has finished: drop its mask (see .ht-done)
    document.addEventListener("animationend", (e) => { if (/^erp-ht-(open|open-full|wipe)$/.test(e.animationName) && e.target.closest?.(".erp-dock")) e.target.classList.add("ht-done"); }, true);
    function close() {
      const p = panel; if (!p) return;
      panel = null; fab?.setAttribute("aria-expanded", "false"); dropFull(); place();
      if (calm()) p.remove(); else { p.classList.add("out"); setTimeout(() => p.remove(), 230); }
    }
    const remember = (r) => { const list = ls.get(RECENT, []).filter((u) => u !== r.username); list.unshift(r.username); ls.set(RECENT, list.slice(0, 8)); };
    const copy = (text, btn) => { navigator.clipboard?.writeText(text).then(() => { const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = t), 1200); }).catch(() => {}); };
    const wa = (phone) => { let d = String(phone ?? "").replace(/\D/g, ""); if (d.startsWith("0")) d = "62" + d.slice(1); return d.length >= 9 ? `https://wa.me/${d}` : null; };
    const ago = (t) => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
    const k = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1).replace(".", ",")}k` : n.toLocaleString("id-ID"));

    function custItem(r, i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(el("span", `dot ${state(r)}`), el("span", "t", r.nama || r.username), el("span", "r", r.username), el("span", "s", [r.paket, r.desa, r.router].filter(Boolean).join(" · ")));
      b.onclick = () => { view.card = r; view.sel = 0; remember(r); draw(); };
      return b;
    }
    function toolItem(i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(svg("M9 11l3 3 8-8M4 6h5M4 12h3M4 18h9"), el("span", "t", "Bulk Lunas"), el("span", "r", "paste a list"), el("span", "s", "Paste usernames, check each one's unpaid months, mark them paid"));
      b.onclick = () => openBulk(); return b;
    }
    // the SPK tools (Bulk SPK on Planning, the Review queue on Approvals) from anywhere: opens the page first when needed,
    // then the tool once the page has loaded
    const SPK_TOOLS = {
      bulk: ["Bulk SPK", "/planning", "Make SPKs from a pasted message or by hand: routes, a number per technician, poles", "M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z", () => bulkSpkToggle(), () => bulkSpkOpen(), () => !!fsDb()],
      review: ["Review queue", "/technical/approvals", "Go through waiting reports from the keyboard, or approve the ones you tick", "M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9", () => reviewToggle(), () => reviewOpen(), () => document.querySelectorAll("main table tbody > tr").length > 0 && !!pageState().reps],
    };
    function spkToolItem(i, key) {
      const [t, path, sub, icon, toggle, isOpen] = SPK_TOOLS[key], b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(svg(icon), el("span", "t", t), el("span", "r", path === "/planning" ? "Planning" : "Approvals"), el("span", "s", sub));
      b.onclick = () => {
        close();
        if (location.pathname.startsWith(path)) { if (!isOpen()) toggle(); return; }
        sessionStorage.setItem(OPEN_TOOL, JSON.stringify({ key, at: Date.now() }));
        if (window.next?.router?.push) window.next.router.push(path); else location.assign(path);
      };
      return b;
    }
    setInterval(() => {
      let p; try { p = JSON.parse(sessionStorage.getItem(OPEN_TOOL)); } catch {} if (!p) return;
      const tool = SPK_TOOLS[p.key];
      if (!tool || Date.now() - p.at > 60000) return void sessionStorage.removeItem(OPEN_TOOL);
      if (!location.pathname.startsWith(tool[1]) || !tool[6]()) return; // not there yet, or still loading
      sessionStorage.removeItem(OPEN_TOOL); if (!tool[5]()) tool[4]();
    }, 500);
    function pageItem(p, i) {
      const b = el("button", "item rise"); b.type = "button"; b.style.setProperty("--i", String(i));
      b.append(svg(ICON.page), el("span", "t", p.t), el("span", "r", p.h)); b.onclick = () => go(p.h); return b;
    }

