    // ---- nearby ----
    const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) && x !== 0 ? x : null; };
    const metres = (a, b) => { const R = 6371000, t = Math.PI / 180, dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const where = (r) => { const lat = num(r.lat), lng = num(r.lng); return lat && lng ? { lat, lng } : null; };
    function nearby(r, radius) {
      const c = where(r); if (!c || !customers) return null;
      const dLat = radius / 111000, dLng = radius / (111000 * Math.cos(c.lat * Math.PI / 180)), out = [];
      for (const x of customers) { if (x === r) continue; const p = where(x); if (!p || Math.abs(p.lat - c.lat) > dLat || Math.abs(p.lng - c.lng) > dLng) continue;
        const d = metres(c, p); if (d <= radius) out.push({ r: x, d, p }); }
      return { c, list: out.sort((a, b) => a.d - b.d) };
    }
    const state = (r) => (r.isolir ? "iso" : r.online ? "on" : "off");

