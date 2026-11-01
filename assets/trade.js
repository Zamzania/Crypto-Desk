/* Crypto Desk — trade planner for spot & futures.
 * Four rule-based setups per timeframe (long pullback, long breakout, short rally, short breakdown),
 * a confluence score, a walk-forward backtest of the same rules on the coin's own history (no look-ahead),
 * futures risk (leverage ceiling, rough liquidation, funding) and a per-coin risk profile.
 * Nothing here predicts the future or is a recommendation. */
(function (global) {
  'use strict';
  const C = global.CDCore;
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const fin = (v) => isFinite(num(v));
  const dist = (a, b) => ((a / b) - 1) * 100;
  const TFL = { '1h': '1 jam', '4h': '4 jam', '1day': '1 hari', '1week': '1 minggu' };
  const HTF = { '1h': '4h', '4h': '1day', '1day': '1week' };
  const LV = { '1h': { w: 3, look: 300, tol: 0.006, max: 5 }, '4h': { w: 3, look: 300, tol: 0.01, max: 5 }, '1day': { w: 4, look: 220, tol: 0.02, max: 5 }, '1week': { w: 3, look: 150, tol: 0.03, max: 5 } };
  const WIDE = { '1h': 4, '4h': 8, '1day': 15 };
  const HOLD = { '1h': 72, '4h': 60, '1day': 45 }; // max bars a backtest trade stays open
  const MMR = 0.005; // assumed maintenance margin rate for the rough liquidation estimate
  const KEYS = ['long_pullback', 'long_breakout', 'short_rally', 'short_breakdown'];
  const META = {
    long_pullback: { side: 1, name: 'Long di area support', short: 'Long support' },
    long_breakout: { side: 1, name: 'Long saat breakout', short: 'Long breakout' },
    short_rally: { side: -1, name: 'Short di area resistance', short: 'Short resistance' },
    short_breakdown: { side: -1, name: 'Short saat breakdown', short: 'Short breakdown' },
  };
  const zoneTxt = (z) => (Math.abs(z.hi / z.lo - 1) < 0.001 ? C.usd(z.lo) : C.usd(z.lo) + '–' + C.usd(z.hi));

  /* ---------------- levels ---------------- */
  function levelsFrom(rows, tf, analyst, htf) {
    const lv = C.keyLevels(rows, LV[tf] || LV['1day']);
    const c = rows[rows.length - 1].close;
    const add = (z, tag) => { if (!fin(z.lo) || !fin(z.hi)) return; const zz = Object.assign({ touches: 0, last: null }, z, tag); if (zz.hi < c) lv.supports.push(zz); else if (zz.lo > c) lv.resistances.push(zz); };
    (analyst || []).forEach((z) => add({ lo: num(z.low), hi: num(z.high), kind: z.kind }, { analyst: true }));
    if (htf) {
      const nearS = lv.supports.some((z) => dist(z.hi, c) > -18), nearR = lv.resistances.some((z) => dist(z.lo, c) < 18);
      if (!nearS || lv.supports.length < 3) htf.supports.forEach((z) => add(z, { htf: true }));
      if (!nearR || lv.resistances.length < 3) htf.resistances.forEach((z) => add(z, { htf: true }));
    }
    const merge = (arr, asc) => arr.sort((a, b) => (asc ? a.lo - b.lo : b.hi - a.hi)).reduce((out, z) => { const p = out[out.length - 1]; if (p && Math.max(p.lo, z.lo) <= Math.min(p.hi, z.hi) * 1.004) { p.lo = Math.min(p.lo, z.lo); p.hi = Math.max(p.hi, z.hi); p.analyst = p.analyst || z.analyst; p.htf = p.htf && z.htf; p.touches += z.touches; } else out.push(Object.assign({}, z)); return out; }, []);
    lv.supports = merge(lv.supports, false); lv.resistances = merge(lv.resistances, true);
    return lv;
  }

  /* ---------------- setup construction (shared by live plan and backtest) ---------------- */
  const rrOf = (side, entry, sl, tp) => { const risk = side * (entry - sl); return risk > 0 ? side * (tp - entry) / risk : NaN; };
  function targets(side, entry, sl, zones, extreme, skipped) {
    const out = []; const risk = side * (entry - sl);
    const edge = (z) => (side > 0 ? z.lo : z.hi);
    zones.filter((z) => side * (edge(z) - entry) > entry * 0.003).forEach((z) => {
      if (out.length >= 3) return;
      if (rrOf(side, entry, sl, edge(z)) < 0.8 && !out.length) { if (skipped) skipped.push(z); return; }
      out.push({ p: edge(z), basis: z.analyst ? 'Zona analis' : z.htf ? (side > 0 ? 'Resistance' : 'Support') + ' timeframe atas' : (side > 0 ? 'Resistance' : 'Support') + ' (' + z.touches + '× sentuh)' });
    });
    if (out.length < 3 && fin(extreme) && side * (extreme - entry) > entry * 0.01 && !out.some((t) => Math.abs(t.p / extreme - 1) < 0.02)) out.push({ p: extreme, basis: side > 0 ? 'Rekor tertinggi (ATH)' : 'Titik terendah historis' });
    let k = 2;
    while (out.length < 3 && k <= 6) { const p = entry + side * risk * k; if (!out.some((t) => side * (p - t.p) <= 0)) out.push({ p, basis: k + '× risiko (tanpa level di depan)' }); k += 1; }
    out.sort((a, b) => side * (a.p - b.p));
    return out.slice(0, 3).map((t) => Object.assign(t, { rr: rrOf(side, entry, sl, t.p), pct: dist(t.p, entry) }));
  }
  /** ctx: { c, atr, lv, t (indicator row), recentHi, recentLo, ath, atl } */
  function build(key, ctx, forBacktest) {
    const { c, atr, lv, t } = ctx; const side = META[key].side; const skipped = [];
    if (!(atr > 0)) return null;
    let zone = null, entry, entryLo, entryHi, trigger = null, sl, src = 'pivot';
    if (key === 'long_pullback' || key === 'short_rally') {
      const list = side > 0 ? lv.supports : lv.resistances;
      zone = list.find((z) => (side > 0 ? z.hi < c && dist(z.hi, c) > -18 : z.lo > c && dist(z.lo, c) < 18)) || null;
      if (!zone) {
        if (forBacktest) return null; // backtest only trades real price zones
        const ma = [t.ema21, t.sma50, t.sma200].filter((v) => fin(v) && side * (c - v) > 0).sort((a, b) => side * (b - a))[0];
        zone = ma ? (side > 0 ? { lo: ma - 0.3 * atr, hi: ma } : { lo: ma, hi: ma + 0.3 * atr }) : (side > 0 ? { lo: c - 1.8 * atr, hi: c - 1.2 * atr } : { lo: c + 1.2 * atr, hi: c + 1.8 * atr });
        zone.touches = 0; src = ma ? 'ma' : 'atr';
      }
      entryLo = zone.lo; entryHi = Math.max(zone.hi, zone.lo + 0.25 * atr); entry = (entryLo + entryHi) / 2;
      sl = side > 0 ? entryLo - 0.75 * atr : entryHi + 0.75 * atr;
      const next = (side > 0 ? lv.supports.filter((z) => z.hi < entryLo) : lv.resistances.filter((z) => z.lo > entryHi))[0];
      if (next && side > 0 && next.hi > sl - 0.5 * atr && next.lo < sl) sl = next.lo - 0.5 * atr;
      if (next && side < 0 && next.lo < sl + 0.5 * atr && next.hi > sl) sl = next.hi + 0.5 * atr;
    } else {
      const list = side > 0 ? lv.resistances : lv.supports;
      zone = list.find((z) => (side > 0 ? z.lo > c : z.hi < c)) || null;
      trigger = zone ? (side > 0 ? zone.hi : zone.lo) : (side > 0 ? Math.max(ctx.recentHi, c + 0.5 * atr) : Math.min(ctx.recentLo, c - 0.5 * atr));
      if (!zone) src = 'range';
      entry = trigger + side * 0.2 * atr; entryLo = entryHi = entry;
      sl = side > 0 ? Math.min(entry - atr, (zone ? zone.lo : trigger) - 0.75 * atr) : Math.max(entry + atr, (zone ? zone.hi : trigger) + 0.75 * atr);
    }
    const ahead = side > 0 ? lv.resistances.filter((z) => z.lo > (trigger || entryHi) * 1.003) : lv.supports.filter((z) => z.hi < (trigger || entryLo) * 0.997);
    const tps = targets(side, entry, sl, ahead, side > 0 ? ctx.ath : ctx.atl, skipped);
    const riskPct = Math.abs(entry - sl) / entry * 100;
    return { key, side, name: META[key].name, zone, src, entry, entryLo, entryHi, trigger, sl, tps, riskPct, skipped };
  }

  /* ---------------- live plan ---------------- */
  function statusOf(su, c, tf) {
    const s = su.side;
    if (su.trigger === null) {
      if (s * (c - su.sl) < 0) return { txt: 'Batal: harga sudah melewati stop loss', cls: 'down', live: false };
      if (c >= su.entryLo * 0.997 && c <= su.entryHi * 1.003) return { txt: 'Harga sedang berada di zona entry', cls: 'up', live: true };
      if (s > 0 && c < su.entryLo) return { txt: 'Harga di bawah zona; tunggu kembali di atas ' + C.usd(su.entryLo), cls: 'down', live: false };
      if (s < 0 && c > su.entryHi) return { txt: 'Harga di atas zona; tunggu kembali di bawah ' + C.usd(su.entryHi), cls: 'down', live: false };
      return { txt: (s > 0 ? 'Menunggu koreksi ' : 'Menunggu kenaikan ') + C.pct(dist(s > 0 ? su.entryHi : su.entryLo, c)) + ' ke zona entry', cls: 'flat', live: true };
    }
    if (s * (c - su.trigger) > 0 && s * (c - su.tps[0].p) >= 0) return { txt: 'Terlewat: harga sudah mencapai TP1 tanpa entry yang baik', cls: 'down', live: false };
    if (s * (c - su.trigger) > 0) return { txt: 'Sudah ' + (s > 0 ? 'tembus ke atas' : 'tembus ke bawah') + '; tunggu uji ulang (retest) ke ' + C.usd(su.trigger) + ' agar tidak mengejar harga', cls: 'up', live: true };
    return { txt: 'Menunggu penutupan lilin ' + TFL[tf] + (s > 0 ? ' di atas ' : ' di bawah ') + C.usd(su.trigger) + ' (' + C.pct(dist(su.trigger, c)) + ')', cls: 'flat', live: true };
  }
  function confluence(su, S, htfS, deriv, bt) {
    const f = []; const s = su.side;
    const add = (label, pts, max, ok) => f.push({ label, pts, max, ok: ok === undefined ? pts >= max * 0.6 : ok });
    const trendScore = (x) => (!x ? null : /^Naik/.test(x.trend) ? (s > 0 ? 1 : 0) : /^Turun/.test(x.trend) ? (s > 0 ? 0 : 1) : 0.5);
    const h = trendScore(htfS);
    add(htfS ? 'Tren timeframe atas ' + (s > 0 ? 'mendukung naik' : 'mendukung turun') + ' (' + htfS.trend + ')' : 'Tren timeframe atas (data tidak tersedia)', h === null ? 10 : Math.round(h * 20), 20);
    const same = S.sma200 === null ? 0.5 : s > 0 ? (S.close > S.sma200 ? (S.sma50 > S.sma200 ? 1 : 0.55) : 0) : (S.close < S.sma200 ? (S.sma50 < S.sma200 ? 1 : 0.55) : 0);
    add('Struktur timeframe ini searah (harga vs MA50/MA200)', Math.round(same * 15), 15);
    const r = S.rsi14; let rp = 5;
    if (r !== null) {
      if (su.trigger === null) rp = s > 0 ? (r >= 35 && r <= 55 ? 10 : r < 35 ? 8 : r > 65 ? 0 : 5) : (r >= 45 && r <= 65 ? 10 : r > 65 ? 8 : r < 35 ? 0 : 5);
      else rp = s > 0 ? (r >= 55 && r <= 72 ? 10 : r > 75 ? 3 : r < 50 ? 2 : 6) : (r >= 28 && r <= 45 ? 10 : r < 25 ? 3 : r > 50 ? 2 : 6);
    }
    add('RSI di zona yang mendukung (' + (r !== null ? r.toFixed(0) : '—') + ')', rp, 10);
    const mh = S.macd_hist, mp = S.macd_hist_prev; const turning = mh !== null && mp !== null && s * (mh - mp) > 0;
    add('Momentum MACD berbalik ' + (s > 0 ? 'naik' : 'turun'), turning ? 10 : 0, 10, turning);
    const z = su.zone; const zs = su.src !== 'pivot' ? 2 : !z ? 2 : z.analyst ? 15 : z.htf ? 10 : z.touches >= 3 ? 15 : z.touches === 2 ? 10 : 5;
    add('Kekuatan level (' + (su.src === 'ma' ? 'rata-rata bergerak' : su.src === 'atr' ? 'jarak ATR' : su.src === 'range' ? 'titik tertinggi/terendah 20 lilin' : z.analyst ? 'zona analis' : z.htf ? 'level timeframe atas' : z.touches + '× sentuh') + ')', zs, 15);
    const rr2 = su.tps[1] && su.tps[1].rr;
    add('R:R ke TP2 ' + (fin(rr2) ? rr2.toFixed(2) : '—') + ' (minimal 2)', fin(rr2) ? (rr2 >= 2 ? 10 : rr2 >= 1.5 ? 6 : 0) : 0, 10);
    const vr = S.vol_ratio; const vp = vr === null ? 2 : su.trigger === null ? (vr < 1 ? 5 : 2) : (vr >= 1.3 ? 5 : 1);
    add(su.trigger === null ? 'Volume tenang saat mendekati zona' : 'Volume mendukung tembusan', vp, 5);
    if (deriv && fin(deriv.funding)) {
      const fr = deriv.funding * 100; // percent per 8h
      const fp = s > 0 ? (fr <= 0.005 ? 5 : fr >= 0.03 ? 0 : 3) : (fr >= 0.01 ? 5 : fr <= -0.01 ? 0 : 3);
      add('Funding ' + (fr >= 0 ? '+' : '') + fr.toFixed(4) + '%: ' + (fr >= 0.03 ? 'long sangat ramai' : fr >= 0.01 ? 'long cukup ramai' : fr <= -0.01 ? 'short ramai' : 'netral') + (fp >= 4 ? ' (mendukung ' + (s > 0 ? 'long' : 'short') + ')' : ''), fp, 5);
    } else add('Data funding tidak tersedia', 2, 5, false);
    const b = bt && bt.filtered;
    const bp = !b || b.n < 15 ? 0 : b.winrate >= 55 && b.expR > 0 ? 10 : b.expR > 0 ? 5 : 0;
    add(!b || b.n < 15 ? 'Uji historis: sampel belum cukup' : 'Uji historis menguntungkan (winrate ' + b.winrate.toFixed(0) + '%, ' + (b.expR >= 0 ? '+' : '') + b.expR.toFixed(2) + 'R)', bp, 10, bp > 0);
    const score = f.reduce((a, x) => a + x.pts, 0);
    return { score, factors: f, label: score >= 70 ? 'Konfluensi tinggi' : score >= 50 ? 'Konfluensi sedang' : 'Konfluensi rendah', cls: score >= 70 ? 'up' : score >= 50 ? 'flat' : 'down' };
  }
  function maxLeverage(riskPct) {
    // Keep the (rough) liquidation at least twice as far as the stop: 1/L - MMR >= 2 × stop distance.
    const L = Math.floor(1 / (2 * riskPct / 100 + MMR));
    return Math.max(1, Math.min(L, 25));
  }
  function liqPrice(side, entry, lev) { return side > 0 ? entry * (1 - 1 / lev + MMR) : entry * (1 + 1 / lev - MMR); }

  /**
   * @param rows candles of this timeframe (ascending); @param tf
   * @param o { ath, atl, analyst, htfLevels, htfRows, deriv, bt }
   */
  function plan(rows, tf, o) {
    o = o || {};
    if (!rows || rows.length < 60) return null;
    const tech = C.techCalc(rows); const S = C.summarize(tech); const t = tech[tech.length - 1];
    const c = S.close, atr = (S.atr_pct / 100) * c;
    const lv = levelsFrom(rows, tf, tf === '1day' ? o.analyst : null, o.htfLevels);
    const htfS = o.htfRows && o.htfRows.length >= 60 ? C.summarize(C.techCalc(o.htfRows)) : null;
    const ctx = { c, atr, lv, t, recentHi: Math.max(...rows.slice(-20).map((r) => r.high)), recentLo: Math.min(...rows.slice(-20).map((r) => r.low)), ath: o.ath, atl: o.atl };
    const setups = KEYS.map((k) => {
      const su = build(k, ctx, false); if (!su) return null;
      su.status = statusOf(su, c, tf);
      su.bt = o.bt ? o.bt[k] : null;
      su.conf = confluence(su, S, htfS, o.deriv, su.bt);
      su.maxLev = maxLeverage(su.riskPct);
      su.liqAtMax = liqPrice(su.side, su.entry, su.maxLev);
      su.wide = su.riskPct > WIDE[tf];
      su.logic = logicText(su, tf);
      su.slBasis = su.trigger === null ? (su.side > 0 ? 'Di bawah zona support dikurangi 0,75 ATR' : 'Di atas zona resistance ditambah 0,75 ATR') + ', supaya tidak tersentuh oleh gerak acak biasa' : (su.side > 0 ? 'Di bawah level yang ditembus (kini menjadi support)' : 'Di atas level yang ditembus (kini menjadi resistance)') + ' dengan jarak minimal 1 ATR';
      su.invalidation = su.trigger === null ? 'Penutupan lilin ' + TFL[tf] + (su.side > 0 ? ' di bawah ' : ' di atas ') + C.usd(su.sl) + ' berarti level gagal; skenario batal.' : 'Bila setelah tembus harga kembali ditutup ' + (su.side > 0 ? 'di bawah ' : 'di atas ') + C.usd(su.trigger) + ', tembusan dianggap palsu; keluar di stop ' + C.usd(su.sl) + '.';
      return su;
    }).filter(Boolean);
    const notes = [];
    if (S.rsi14 !== null && S.rsi14 > 70) notes.push('RSI ' + S.rsi14.toFixed(0) + ' (jenuh beli): long dengan mengejar harga berisiko; short di resistance mendapat dukungan momentum, tetapi tren naik yang kuat bisa bertahan jenuh beli cukup lama.');
    if (S.rsi14 !== null && S.rsi14 < 30) notes.push('RSI ' + S.rsi14.toFixed(0) + ' (jenuh jual): short dengan mengejar harga berisiko karena pantulan tajam (short squeeze) sering terjadi.');
    if (S.bb_pctile !== null && S.bb_pctile < 15) notes.push('Volatilitas sangat menyempit (Bollinger persentil ' + S.bb_pctile.toFixed(0) + '). Skenario breakout/breakdown lebih relevan daripada menebak arah di tengah rentang.');
    if (htfS) notes.push('Timeframe atas (' + TFL[HTF[tf]] + ') sedang ' + htfS.trend.toLowerCase() + '. Skenario yang searah timeframe atas secara umum lebih sering berhasil daripada yang melawannya.');
    setups.forEach((su) => { if (su.skipped.length) notes.push(su.name + ': ada level dekat di ' + C.usd(su.side > 0 ? su.skipped[0].lo : su.skipped[0].hi) + ' yang terlalu dekat untuk dijadikan target dan bisa menahan gerak pertama.'); });
    const ranked = setups.filter((s) => s.status.live).slice().sort((a, b) => (b.conf.score + (b.bt && b.bt.filtered && b.bt.filtered.n >= 15 ? b.bt.filtered.expR * 10 : 0)) - (a.conf.score + (a.bt && a.bt.filtered && a.bt.filtered.n >= 15 ? a.bt.filtered.expR * 10 : 0)));
    return { tf, S, htfS, atr, lv, price: c, setups, notes, best: ranked[0] || null };
  }
  function logicText(su, tf) {
    const z = su.zone;
    if (su.key === 'long_pullback' || su.key === 'short_rally') {
      const what = su.side > 0 ? 'support' : 'resistance';
      if (su.src === 'ma') return 'Tidak ada titik balik harga yang dekat, jadi zona entry memakai rata-rata bergerak terdekat (' + zoneTxt(z) + ') yang sering menjadi ' + what + ' dinamis.';
      if (su.src === 'atr') return 'Tidak ada ' + what + ' yang jelas, jadi zona entry memakai jarak 1,2–1,8 ATR dari harga. Dasar zona ini lemah.';
      return 'Zona entry adalah ' + what + ' ' + zoneTxt(z) + (z.analyst ? ' (zona hasil analisis manual)' : z.htf ? ' dari timeframe yang lebih besar' : ', titik balik harga yang tersentuh ' + z.touches + '×') + '. ' + (su.side > 0 ? 'Pembeli pernah bertahan di area ini.' : 'Penjual pernah menahan kenaikan di area ini.') + ' Order limit di zona ini memberi harga masuk yang lebih baik daripada mengejar harga.';
    }
    if (su.src === 'range') return 'Tidak ada level historis di ' + (su.side > 0 ? 'atas' : 'bawah') + ' harga, jadi pemicu memakai titik ' + (su.side > 0 ? 'tertinggi' : 'terendah') + ' 20 lilin terakhir dan target memakai kelipatan risiko.';
    return 'Pemicu adalah penutupan ' + (su.side > 0 ? 'di atas resistance ' : 'di bawah support ') + zoneTxt(z) + '. Bila ' + (su.side > 0 ? 'penjual' : 'pembeli') + ' di area itu habis, harga cenderung bergerak cepat ke level berikutnya. Entry 0,2 ATR melewati level untuk menghindari tembusan palsu.';
  }

  /* ---------------- walk-forward backtest ---------------- */
  /**
   * Replays the same rules bar by bar. Levels at bar i use only candles up to i-1 (pivots need w confirming bars),
   * entries fill on bar i, exits are checked bar by bar (stop first when both are touched in one bar).
   * Management: 50% off at TP1 and stop to break-even, rest at TP2; time stop after HOLD[tf] bars.
   * Costs: round-trip fee `fee` (fraction of notional) converted to R.
   */
  function backtest(rows, tf, opts) {
    const o = Object.assign({ fee: 0.001, maxBars: 800 }, opts || {});
    const n = rows.length; if (n < 260) return null;
    const tech = C.techCalc(rows);
    const start = Math.max(220, n - o.maxBars);
    const res = {}; KEYS.forEach((k) => { res[k] = { all: [], filtered: [] }; });
    const busy = {}; KEYS.forEach((k) => { busy[k] = { all: -1, filtered: -1 }; });
    const hold = HOLD[tf] || 50;
    for (let i = start; i < n - 1; i++) {
      const prev = rows.slice(0, i); const t = tech[i - 1];
      if (!(t.atr14 > 0) || t.sma200 === null) continue;
      const lv = C.keyLevels(prev, LV[tf] || LV['1day']);
      const c = prev[prev.length - 1].close;
      const ctx = { c, atr: t.atr14, lv, t, recentHi: Math.max(...prev.slice(-20).map((r) => r.high)), recentLo: Math.min(...prev.slice(-20).map((r) => r.low)) };
      const bar = rows[i];
      KEYS.forEach((k) => {
        const su = build(k, ctx, true); if (!su) return;
        let entry = null;
        if (su.trigger === null) {
          const lim = su.entry;
          if (su.side > 0 && c > su.entryHi && bar.low <= lim) entry = Math.min(bar.open, lim);
          if (su.side < 0 && c < su.entryLo && bar.high >= lim) entry = Math.max(bar.open, lim);
        } else {
          if (su.side > 0 && c <= su.trigger && bar.close > su.trigger) entry = bar.close;
          if (su.side < 0 && c >= su.trigger && bar.close < su.trigger) entry = bar.close;
        }
        if (entry === null) return;
        // Re-anchor stop/targets on the actual fill so R stays honest.
        const sl = su.trigger === null ? su.sl : (su.side > 0 ? Math.min(entry - t.atr14, su.sl) : Math.max(entry + t.atr14, su.sl));
        if (su.side * (entry - sl) <= 0) return;
        const tps = targets(su.side, entry, sl, su.side > 0 ? lv.resistances.filter((z) => z.lo > entry * 1.003) : lv.supports.filter((z) => z.hi < entry * 0.997), null);
        if (tps.length < 2) return;
        const pass = filterPass(su, t, tf);
        const startBar = su.trigger === null ? i : i + 1;
        const tr = simulate(rows, startBar, su.side, entry, sl, tps[0].p, tps[1].p, hold, o.fee);
        ['all', 'filtered'].forEach((g) => {
          if (g === 'filtered' && !pass) return;
          if (i <= busy[k][g]) return;
          res[k][g].push(tr); busy[k][g] = tr.exitBar;
        });
      });
    }
    const out = {};
    // Walk-forward style consistency check: the same rules on the first and second half of the period.
    const halves = (trs) => { const m = Math.floor(trs.length / 2); return [stats(trs.slice(0, m)), stats(trs.slice(m))]; };
    KEYS.forEach((k) => { out[k] = { all: stats(res[k].all), filtered: Object.assign(stats(res[k].filtered), { halves: halves(res[k].filtered) }), bars: n - start, from: rows[start].time, to: rows[n - 1].time }; });
    return out;
  }
  function filterPass(su, t, tf) {
    const s = su.side;
    if (t.sma200 === null || t.rsi14 === null) return false;
    const trendOk = s > 0 ? t.close > t.sma200 : t.close < t.sma200;
    const rsiOk = s > 0 ? t.rsi14 < 70 : t.rsi14 > 30;
    const zoneOk = su.trigger === null ? (su.zone && su.zone.touches >= 2) : true;
    const rrOk = su.tps[1] && su.tps[1].rr >= 1.5;
    return trendOk && rsiOk && zoneOk && rrOk;
  }
  function simulate(rows, i0, side, entry, sl, tp1, tp2, hold, fee) {
    const risk = side * (entry - sl); const riskFrac = risk / entry; const feeR = fee / riskFrac;
    let stop = sl, half = false, r = 0, j = i0, exitBar = i0, outcome = 'time';
    const end = Math.min(rows.length - 1, i0 + hold);
    for (j = i0; j <= end; j++) {
      const b = rows[j];
      const hitStop = side > 0 ? b.low <= stop : b.high >= stop;
      const hit1 = side > 0 ? b.high >= tp1 : b.low <= tp1;
      const hit2 = side > 0 ? b.high >= tp2 : b.low <= tp2;
      if (!half) {
        if (hitStop) { r = -1; outcome = 'sl'; exitBar = j; break; }
        if (hit1) {
          half = true; r += 0.5 * side * (tp1 - entry) / risk; stop = entry;
          if (hit2) { r += 0.5 * side * (tp2 - entry) / risk; outcome = 'tp2'; exitBar = j; break; }
          continue;
        }
      } else {
        if (hitStop) { outcome = 'be'; exitBar = j; break; }
        if (hit2) { r += 0.5 * side * (tp2 - entry) / risk; outcome = 'tp2'; exitBar = j; break; }
      }
    }
    if (outcome === 'time') { const cl = rows[Math.min(end, rows.length - 1)].close; r += (half ? 0.5 : 1) * side * (cl - entry) / risk; exitBar = end; }
    return { r: r - feeR, win: half || outcome === 'tp2', tp2: outcome === 'tp2', outcome, bars: exitBar - i0 + 1, exitBar };
  }
  function stats(trs) {
    const n = trs.length; if (!n) return { n: 0 };
    const wins = trs.filter((t) => t.win).length, tp2 = trs.filter((t) => t.tp2).length;
    const sumR = trs.reduce((a, t) => a + t.r, 0);
    const gp = trs.filter((t) => t.r > 0).reduce((a, t) => a + t.r, 0), gl = -trs.filter((t) => t.r < 0).reduce((a, t) => a + t.r, 0);
    let ls = 0, maxLS = 0, eq = 0, peak = 0, maxDD = 0;
    trs.forEach((t) => { ls = t.r < 0 ? ls + 1 : 0; maxLS = Math.max(maxLS, ls); eq += t.r; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq); });
    return { n, winrate: wins / n * 100, tp2Rate: tp2 / n * 100, expR: sumR / n, totalR: sumR, pf: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0), maxLS, maxDD, avgBars: trs.reduce((a, t) => a + t.bars, 0) / n };
  }

  /* ---------------- derivatives context (OKX public API) ---------------- */
  async function derivatives(sym) {
    const S = String(sym).toUpperCase(); const inst = S + '-USDT-SWAP'; const out = { sym: S };
    const tasks = [
      C.getJSON('https://www.okx.com/api/v5/public/funding-rate?instId=' + inst, 8000).then((j) => { const d = j.data && j.data[0]; if (d) { out.funding = num(d.fundingRate); out.nextFunding = num(d.nextFundingTime || d.fundingTime); out.source = 'OKX'; } }),
      C.getJSON('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=' + inst, 8000).then((j) => { const d = j.data && j.data[0]; if (d) out.oiUsd = num(d.oiUsd); }),
      C.getJSON('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=' + S + '&period=1H', 8000).then((j) => { const d = j.data && j.data[0]; if (d) out.lsr = num(Array.isArray(d) ? d[1] : d.longShortAcctRatio || d.ratio); }),
    ];
    await Promise.allSettled(tasks);
    if (!fin(out.funding)) {
      try { const j = await C.getJSON('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + S + 'USDT', 8000); out.funding = num(j.lastFundingRate); out.nextFunding = num(j.nextFundingTime); out.source = 'Binance'; } catch (e) { /* no futures market */ }
    }
    return out;
  }

  /* ---------------- risk profile ---------------- */
  function riskProfile(daily, btcDaily, d, deriv) {
    if (!daily || daily.length < 60) return null;
    const ret = daily.slice(1).map((r, i) => r.close / daily[i].close - 1);
    const last = (a, k) => a.slice(-k);
    const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
    const vol30 = sd(last(ret, 30)) * Math.sqrt(365) * 100, vol365 = sd(last(ret, 365)) * Math.sqrt(365) * 100;
    const rollVol = []; for (let i = 30; i <= ret.length; i++) rollVol.push(sd(ret.slice(i - 30, i)));
    const volPct = rollVol.length > 30 ? rollVol.filter((v) => v < rollVol[rollVol.length - 1]).length / rollVol.length * 100 : null;
    const yr = last(daily, 365); let peak = yr[0].close, mdd = 0, mddPeakT = yr[0].time, mddT = yr[0].time, pT = yr[0].time;
    yr.forEach((r) => { if (r.close > peak) { peak = r.close; pT = r.time; } const dd = r.close / peak - 1; if (dd < mdd) { mdd = dd; mddT = r.time; mddPeakT = pT; } });
    const r365 = last(ret, 365).slice().sort((a, b) => a - b);
    const q = (p) => r365[Math.max(0, Math.floor(p * r365.length) - 1)];
    const var95 = q(0.05), var99 = q(0.01); const tail = r365.slice(0, Math.max(1, Math.floor(0.05 * r365.length))); const cvar95 = tail.reduce((a, b) => a + b, 0) / tail.length;
    const worst = r365[0], best = r365[r365.length - 1];
    const tech = C.techCalc(daily); const atrPct = tech[tech.length - 1].atr14 / daily[daily.length - 1].close * 100;
    let beta = null, corr = null;
    if (btcDaily && btcDaily.length > 60 && d && d.symbol !== 'BTC') {
      const bm = new Map(btcDaily.map((r) => [r.time.slice(0, 10), r.close])); const pairs = [];
      for (let i = Math.max(1, daily.length - 90); i < daily.length; i++) { const a = daily[i - 1].time.slice(0, 10), b = daily[i].time.slice(0, 10); if (bm.has(a) && bm.has(b)) pairs.push([bm.get(b) / bm.get(a) - 1, daily[i].close / daily[i - 1].close - 1]); }
      if (pairs.length > 30) { const x = pairs.map((p) => p[0]), y = pairs.map((p) => p[1]); const mx = x.reduce((a, b) => a + b) / x.length, my = y.reduce((a, b) => a + b) / y.length; const cov = pairs.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / (pairs.length - 1); beta = cov / sd(x) ** 2; corr = cov / (sd(x) * sd(y)); }
    } else if (d && d.symbol === 'BTC') { beta = 1; corr = 1; }
    // Score 1–10: higher = riskier.
    let pts = 0; const why = [];
    const add = (p, txt) => { pts += p; if (txt) why.push(txt); };
    add(vol30 < 40 ? 0 : vol30 < 60 ? 1 : vol30 < 90 ? 2 : 3, 'volatilitas 30 hari ' + vol30.toFixed(0) + '% per tahun');
    add(mdd > -0.3 ? 0 : mdd > -0.5 ? 1 : mdd > -0.7 ? 2 : 3, 'drawdown terdalam setahun ' + C.pct(mdd * 100, 0));
    const vr = d && d.volume / d.market_cap; add(!isFinite(vr) ? 1 : vr > 0.03 && vr < 0.3 ? 0 : 1, isFinite(vr) ? 'likuiditas ' + (vr * 100).toFixed(1) + '% kapitalisasi/hari' : null);
    add(!d || !d.rank ? 2 : d.rank <= 10 ? 0 : d.rank <= 50 ? 1 : 2, d && d.rank ? 'peringkat #' + d.rank : 'tanpa peringkat');
    if (beta !== null && d && d.symbol !== 'BTC') add(beta > 1.5 ? 1 : 0, 'beta terhadap BTC ' + beta.toFixed(2));
    if (deriv && fin(deriv.funding) && Math.abs(deriv.funding * 100) > 0.03) add(1, 'funding ekstrem');
    const score = Math.max(1, Math.min(10, Math.round(1 + pts * 9 / 13)));
    const label = score <= 3 ? 'Rendah' : score <= 5 ? 'Sedang' : score <= 7 ? 'Tinggi' : 'Sangat tinggi';
    const levCap = Math.max(1, Math.min(10, Math.floor(1 / (3 * atrPct / 100))));
    return { vol30, vol365, volPct, mdd: mdd * 100, mddFrom: mddPeakT, mddTo: mddT, var95: var95 * 100, var99: var99 * 100, cvar95: cvar95 * 100, worst: worst * 100, best: best * 100, atrPct, beta, corr, score, label, why, levCap, n: r365.length };
  }

  global.CDTrade = { KEYS, META, TFL, HTF, MMR, levelsFrom, build, plan, backtest, stats, derivatives, riskProfile, maxLeverage, liqPrice, rrOf };
})(window);
