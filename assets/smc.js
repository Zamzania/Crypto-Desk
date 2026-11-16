/* Crypto Desk — Smart Money Concepts, computed from raw candles with no look-ahead.
 * Swings are confirmed k bars after they print, so every structure event below is something
 * a trader could have seen at that time. Works in the browser (window.CDSMC) and in Node (globalThis). */
(function (global) {
  'use strict';
  const fin = Number.isFinite;
  const K = { '15m': 3, '1h': 3, '4h': 3, '1day': 3, '1week': 2 };

  function atrOf(rows, n) {
    const tr = rows.map((r, i) => (i ? Math.max(r.high - r.low, Math.abs(r.high - rows[i - 1].close), Math.abs(r.low - rows[i - 1].close)) : r.high - r.low));
    const out = []; let a = null;
    tr.forEach((t, i) => { a = i < n ? (a === null ? t : (a * i + t) / (i + 1)) : (a * (n - 1) + t) / n; out.push(a); });
    return out;
  }

  function analyze(rows, tf, opts) {
    opts = opts || {};
    const n = rows.length; if (n < 60) return null;
    const k = K[tf] || 3; const atr = atrOf(rows, 14); const c = rows[n - 1].close; const A = atr[n - 1];
    const swings = []; const events = []; const obs = []; const fvgs = [];
    let lastH = null, lastL = null, trend = 0; // trend: 1 bull, -1 bear, 0 unknown

    for (let i = 0; i < n; i++) {
      // confirm the swing that printed k bars ago
      const j = i - k;
      if (j >= k) {
        const r = rows[j]; let isH = true, isL = true;
        for (let m = j - k; m <= j + k; m++) { if (m === j) continue; const after = m > j; if (after ? rows[m].high > r.high : rows[m].high >= r.high) isH = false; if (after ? rows[m].low < r.low : rows[m].low <= r.low) isL = false; } // ties go to the earlier bar
        if (isH) { const prev = swings.filter((s) => s.type === 'H').pop(); const sw = { type: 'H', i: j, p: r.high, time: r.time, label: prev ? (r.high > prev.p ? 'HH' : 'LH') : 'H', broken: false }; swings.push(sw); lastH = sw; }
        if (isL) { const prev = swings.filter((s) => s.type === 'L').pop(); const sw = { type: 'L', i: j, p: r.low, time: r.time, label: prev ? (r.low > prev.p ? 'HL' : 'LL') : 'L', broken: false }; swings.push(sw); lastL = sw; }
      }
      const b = rows[i];
      // break of structure on a candle close
      if (lastH && !lastH.broken && b.close > lastH.p) {
        lastH.broken = true; const kind = trend === -1 ? 'CHoCH' : 'BOS'; trend = 1;
        events.push({ kind, dir: 1, level: lastH.p, i, time: b.time, from: lastH.time });
        const ob = orderBlock(rows, lastL ? lastL.i : lastH.i, i, 1); if (ob) obs.push(Object.assign(ob, { born: i, cause: kind }));
      }
      if (lastL && !lastL.broken && b.close < lastL.p) {
        lastL.broken = true; const kind = trend === 1 ? 'CHoCH' : 'BOS'; trend = -1;
        events.push({ kind, dir: -1, level: lastL.p, i, time: b.time, from: lastL.time });
        const ob = orderBlock(rows, lastH ? lastH.i : lastL.i, i, -1); if (ob) obs.push(Object.assign(ob, { born: i, cause: kind }));
      }
      // fair value gaps (three-candle imbalance), ignore gaps smaller than 0.1 ATR
      if (i >= 2) {
        const a = rows[i - 2];
        if (b.low > a.high && b.low - a.high >= 0.1 * atr[i]) fvgs.push({ dir: 1, lo: a.high, hi: b.low, i, time: rows[i - 1].time });
        if (b.high < a.low && a.low - b.high >= 0.1 * atr[i]) fvgs.push({ dir: -1, lo: b.high, hi: a.low, i, time: rows[i - 1].time });
      }
    }

    // mitigation state for order blocks and fill state for gaps
    obs.forEach((o) => {
      o.touched = false; o.broken = false;
      for (let m = o.born + 1; m < n; m++) {
        const r = rows[m];
        if (o.dir > 0) { if (r.low <= o.hi) o.touched = true; if (r.close < o.lo) { o.broken = true; break; } }
        else { if (r.high >= o.lo) o.touched = true; if (r.close > o.hi) { o.broken = true; break; } }
      }
    });
    fvgs.forEach((g) => {
      let reach = g.dir > 0 ? g.hi : g.lo;
      for (let m = g.i + 1; m < n; m++) reach = g.dir > 0 ? Math.min(reach, rows[m].low) : Math.max(reach, rows[m].high);
      const size = g.hi - g.lo; g.fill = Math.max(0, Math.min(100, (g.dir > 0 ? g.hi - reach : reach - g.lo) / size * 100));
    });
    const seenOB = new Set(); const liveOB = obs.filter((o) => !o.broken && !seenOB.has(o.dir + ':' + o.i) && seenOB.add(o.dir + ':' + o.i)); // one OB per candle
    const openFVG = fvgs.filter((g) => g.fill < 100 && n - g.i <= 400);
    const near = (arr, dir) => arr.filter((z) => z.dir === dir).sort((a, b) => Math.abs((a.lo + a.hi) / 2 - c) - Math.abs((b.lo + b.hi) / 2 - c)).slice(0, 3);

    // liquidity: clusters of untouched equal highs/lows, previous day/week extremes, recent sweeps
    const tol = 0.15 * A; const recent = swings.filter((s) => n - s.i <= 200);
    const pools = (type) => {
      const pts = recent.filter((s) => s.type === type && rows.slice(s.i + 1).every((r) => (type === 'H' ? r.high <= s.p + tol : r.low >= s.p - tol)));
      const out = [];
      pts.forEach((s) => { const g = out.find((x) => Math.abs(x.p - s.p) <= tol); if (g) { g.n++; g.p = (g.p * (g.n - 1) + s.p) / g.n; g.last = s.time; } else out.push({ p: s.p, n: 1, last: s.time }); });
      return out.filter((x) => x.n >= 2).sort((a, b) => Math.abs(a.p - c) - Math.abs(b.p - c));
    };
    const bsl = pools('H').filter((x) => x.p > c), ssl = pools('L').filter((x) => x.p < c);
    const sweeps = [];
    for (let i = Math.max(k * 2 + 1, n - 30); i < n; i++) {
      const r = rows[i]; const prior = swings.filter((s) => s.i < i - k);
      const h = prior.filter((s) => s.type === 'H' && r.high > s.p && r.close < s.p && rows.slice(s.i + 1, i).every((x) => x.high <= s.p)).pop();
      const l = prior.filter((s) => s.type === 'L' && r.low < s.p && r.close > s.p && rows.slice(s.i + 1, i).every((x) => x.low >= s.p)).pop();
      if (h) sweeps.push({ dir: -1, level: h.p, time: r.time, ago: n - 1 - i });
      if (l) sweeps.push({ dir: 1, level: l.p, time: r.time, ago: n - 1 - i });
    }
    const day = opts.daily, wk = opts.weekly; const lvl = [];
    if (day && day.length > 2) { const d = day[day.length - 2]; lvl.push({ name: 'High hari sebelumnya (PDH)', p: d.high }, { name: 'Low hari sebelumnya (PDL)', p: d.low }); }
    if (wk && wk.length > 2) { const w = wk[wk.length - 2]; lvl.push({ name: 'High minggu sebelumnya (PWH)', p: w.high }, { name: 'Low minggu sebelumnya (PWL)', p: w.low }); }

    // dealing range from the latest confirmed swing high and low
    const hs = swings.filter((s) => s.type === 'H'), ls = swings.filter((s) => s.type === 'L');
    const rh = hs[hs.length - 1], rl = ls[ls.length - 1];
    let pd = null;
    if (rh && rl && rh.p > rl.p) {
      const hi = Math.max(rh.p, ...rows.slice(Math.min(rh.i, rl.i)).map((r) => r.high)), lo = Math.min(rl.p, ...rows.slice(Math.min(rh.i, rl.i)).map((r) => r.low));
      const pos = (c - lo) / (hi - lo) * 100;
      pd = { hi, lo, eq: (hi + lo) / 2, pos, zone: pos > 55 ? 'premium' : pos < 45 ? 'discount' : 'equilibrium',
        oteLong: [hi - 0.79 * (hi - lo), hi - 0.62 * (hi - lo)], oteShort: [lo + 0.62 * (hi - lo), lo + 0.79 * (hi - lo)] };
    }
    const last = events[events.length - 1] || null;
    const lastCh = events.filter((e) => e.kind === 'CHoCH').pop() || null;
    return { tf, price: c, atr: A, trend, swings: swings.slice(-12), events: events.slice(-8), last, lastCh, obBull: near(liveOB, 1), obBear: near(liveOB, -1), fvgBull: near(openFVG, 1), fvgBear: near(openFVG, -1), bsl: bsl.slice(0, 3), ssl: ssl.slice(0, 3), sweeps: sweeps.slice(-4), levels: lvl, pd };
  }

  // last opposite-colour candle before the impulse that broke structure
  function orderBlock(rows, from, to, dir) {
    if (to - from < 1) return null;
    let m = from; for (let x = from; x < to; x++) if (dir > 0 ? rows[x].low < rows[m].low : rows[x].high > rows[m].high) m = x;
    for (let x = m; x >= Math.max(0, m - 6); x--) { const r = rows[x]; if (dir > 0 ? r.close < r.open : r.close > r.open) return { dir, lo: r.low, hi: r.high, time: r.time, i: x }; }
    const r = rows[m]; return { dir, lo: r.low, hi: r.high, time: r.time, i: m };
  }

  // SMC confirmations for a trade setup from CDTrade.plan
  function check(su, s) {
    if (!s || !su) return [];
    const side = su.side; const lo = su.entryLo, hi = su.entryHi; const ov = (z) => z.lo <= hi * 1.002 && z.hi >= lo * 0.998;
    const obs = side > 0 ? s.obBull : s.obBear, gaps = side > 0 ? s.fvgBull : s.fvgBear;
    const liq = side > 0 ? s.bsl : s.ssl; const sw = s.sweeps.find((x) => x.dir === side && x.ago <= 20);
    const tgt = su.tps[1] || su.tps[0];
    return [
      { ok: s.trend === side, label: 'Struktur ' + (s.trend > 0 ? 'bullish' : s.trend < 0 ? 'bearish' : 'belum jelas') + (s.last ? ' (' + s.last.kind + ' terakhir ' + (s.last.dir > 0 ? 'ke atas' : 'ke bawah') + ')' : '') },
      { ok: !!s.pd && (side > 0 ? (lo + hi) / 2 < s.pd.eq : (lo + hi) / 2 > s.pd.eq), label: 'Entry di area ' + (side > 0 ? 'discount (di bawah ekuilibrium)' : 'premium (di atas ekuilibrium)') },
      { ok: obs.some(ov) || gaps.some(ov), label: 'Zona entry tumpang tindih dengan ' + (side > 0 ? 'order block / FVG bullish' : 'order block / FVG bearish') + ' yang masih berlaku' },
      { ok: !!sw, label: sw ? 'Ada sweep likuiditas ' + (side > 0 ? 'sell-side' : 'buy-side') + ' baru-baru ini (' + sw.ago + ' lilin lalu)' : 'Belum ada sweep likuiditas ' + (side > 0 ? 'sell-side' : 'buy-side') + ' dalam 20 lilin' },
      { ok: !!tgt && liq.some((p) => Math.abs(p.p - tgt.p) <= 1.5 * s.atr || side * (p.p - tgt.p) > 0), label: 'Target mengarah ke kolam likuiditas ' + (side > 0 ? 'buy-side (equal highs)' : 'sell-side (equal lows)') },
    ];
  }

  const api = { analyze, check, atrOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.CDSMC = api;
})(typeof window !== 'undefined' ? window : globalThis);
