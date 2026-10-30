/* Crypto Desk — rule-based analysis engine: trade plans (entry / stop loss / take profit),
 * advanced technicals (Fibonacci, candle patterns, divergence, MA cross, OBV, signal table) and a fundamental scorecard.
 * Everything is derived from data with fixed rules; nothing here is a recommendation. */
(function (global) {
  'use strict';
  const C = global.CDCore;
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const fin = (v) => isFinite(num(v));
  const dist = (a, b) => ((a / b) - 1) * 100;
  const TFL = { '1h': '1 jam', '4h': '4 jam', '1day': '1 hari', '1week': '1 minggu' };
  const zone = (z) => (Math.abs(z.hi / z.lo - 1) < 0.001 ? C.usd(z.lo) : C.usd(z.lo) + '–' + C.usd(z.hi));
  // Pivot settings per timeframe: window, lookback and zone tolerance.
  const LV_OPTS = { '1h': { w: 3, look: 300, tol: 0.006, max: 4 }, '4h': { w: 3, look: 300, tol: 0.01, max: 4 }, '1day': { w: 4, look: 180, tol: 0.02, max: 4 }, '1week': { w: 3, look: 150, tol: 0.03, max: 4 } };
  // Stop distance above which a setup is flagged as wide, per timeframe (percent of entry).
  const WIDE = { '1h': 4, '4h': 8, '1day': 15, '1week': 25 };

  /* ---------------- levels ---------------- */
  function levels(rows, tf, extra) {
    const lv = C.keyLevels(rows, LV_OPTS[tf] || LV_OPTS['1day']);
    if (extra && extra.length) {
      const price = rows[rows.length - 1].close;
      extra.forEach((z) => { const zone = { lo: num(z.low), hi: num(z.high), touches: 0, last: null, analyst: true, kind: z.kind };
        if (!fin(zone.lo) || !fin(zone.hi)) return; if (zone.hi < price) lv.supports.push(zone); else if (zone.lo > price) lv.resistances.push(zone); });
      lv.supports.sort((a, b) => b.hi - a.hi); lv.resistances.sort((a, b) => a.lo - b.lo);
      // Merge zones that overlap so analyst and automatic levels do not duplicate.
      const merge = (arr) => arr.reduce((out, z) => { const p = out[out.length - 1]; if (p && Math.max(p.lo, z.lo) <= Math.min(p.hi, z.hi) * 1.004) { p.lo = Math.min(p.lo, z.lo); p.hi = Math.max(p.hi, z.hi); p.analyst = p.analyst || z.analyst; p.touches += z.touches; } else out.push(Object.assign({}, z)); return out; }, []);
      lv.supports = merge(lv.supports.slice().sort((a, b) => b.hi - a.hi));
      lv.resistances = merge(lv.resistances.slice().sort((a, b) => a.lo - b.lo));
    }
    return lv;
  }

  /* ---------------- trade plan ---------------- */
  function rrOf(entry, sl, tp) { const risk = entry - sl; return risk > 0 ? (tp - entry) / risk : NaN; }
  function grade(rr2, trendOk, wide) {
    if (!fin(rr2)) return { g: '—', txt: 'Tidak bisa dinilai', cls: 'flat' };
    if (rr2 >= 2 && trendOk && !wide) return { g: 'A', txt: 'Layak dipertimbangkan', cls: 'up' };
    if (rr2 >= 1.5 && !wide) return { g: 'B', txt: 'Cukup, perlu konfirmasi', cls: 'flat' };
    return { g: 'C', txt: 'Kurang menarik', cls: 'down' };
  }
  function targets(entry, sl, res, extraHigh, skipped) {
    const risk = entry - sl; const out = [];
    res.filter((z) => z.lo > entry * 1.003).forEach((z) => {
      if (out.length >= 3) return;
      if (rrOf(entry, sl, z.lo) < 0.8 && !out.length) { if (skipped) skipped.push(z); return; } // too close to be a sensible first target
      out.push({ p: z.lo, basis: z.analyst ? 'Zona analis' : z.htf ? 'Resistance harian' : 'Resistance (' + z.touches + '× sentuh)' });
    });
    if (out.length < 3 && fin(extraHigh) && extraHigh > entry * 1.01 && !out.some((t) => Math.abs(t.p / extraHigh - 1) < 0.02)) out.push({ p: extraHigh, basis: 'Rekor tertinggi (ATH)' });
    let k = 2;
    while (out.length < 3) { const p = entry + risk * k; if (!out.some((t) => p <= t.p * 1.01)) out.push({ p, basis: k + '× risiko (tanpa resistance di atas)' }); k += 1; if (k > 6) break; }
    out.sort((a, b) => a.p - b.p);
    return out.slice(0, 3).map((t) => Object.assign(t, { rr: rrOf(entry, sl, t.p), pct: dist(t.p, entry) }));
  }
  /**
   * Long-only (spot) plan for one timeframe.
   * @param rows candles ascending, @param tf timeframe key, @param opts { ath, analystLevels }
   */
  function tradePlan(rows, tf, opts) {
    const o = opts || {};
    if (!rows || rows.length < 40) return null;
    const tech = C.techCalc(rows); const S = C.summarize(tech);
    const c = S.close; const atr = (S.atr_pct / 100) * c;
    const lv = levels(rows, tf, o.analystLevels);
    // Fall back to higher-timeframe (daily) zones when this timeframe has none nearby.
    if (o.htf) {
      const near = (arr, below) => arr.find((z) => (below ? z.hi < c && dist(z.hi, c) > -18 : z.lo > c && dist(z.lo, c) < 25));
      if (!near(lv.supports, true)) lv.supports = lv.supports.concat(o.htf.supports.filter((z) => z.hi < c).map((z) => Object.assign({}, z, { htf: true }))).sort((a, b) => b.hi - a.hi);
      if (lv.resistances.length < 3) lv.resistances = lv.resistances.concat(o.htf.resistances.filter((z) => z.lo > c && !lv.resistances.some((r) => Math.abs(r.lo / z.lo - 1) < 0.01)).map((z) => Object.assign({}, z, { htf: true }))).sort((a, b) => a.lo - b.lo);
    }
    const trendUp = S.trend === 'Naik', trendDown = S.trend === 'Turun' || /^Turun/.test(S.trend);
    const notes = [];
    if (S.rsi14 !== null && S.rsi14 > 70) notes.push('RSI ' + S.rsi14.toFixed(0) + ' (jenuh beli): hindari mengejar harga; tunggu koreksi ke zona entry.');
    if (S.rsi14 !== null && S.rsi14 < 30) notes.push('RSI ' + S.rsi14.toFixed(0) + ' (jenuh jual): pantulan sering terjadi, tetapi konfirmasi berupa lilin penutupan yang kuat lebih aman daripada menebak dasar.');
    if (trendDown) notes.push('Tren ' + TFL[tf] + ' sedang turun (harga di bawah MA200). Skenario beli di support melawan tren, jadi peluang gagal lebih besar; perkecil ukuran posisi atau tunggu skenario breakout.');
    if (S.bb_pctile !== null && S.bb_pctile < 15) notes.push('Volatilitas sangat menyempit (Bollinger di persentil ' + S.bb_pctile.toFixed(0) + '). Gerakan besar biasanya menyusul; skenario breakout menjadi lebih relevan.');

    // Setup 1: buy the pullback into the nearest support.
    let s1 = lv.supports.find((z) => z.hi < c && dist(z.hi, c) > -18) || null;
    if (!s1) {
      const ma = [S.ema21, S.sma50, S.sma200].filter((v) => fin(v) && v < c).sort((a, b) => b - a)[0];
      s1 = ma ? { lo: ma - 0.3 * atr, hi: ma, touches: 0, maBased: true } : { lo: c - 1.8 * atr, hi: c - 1.2 * atr, touches: 0, atrBased: true };
    }
    const zLo = s1.lo, zHi = Math.max(s1.hi, s1.lo + 0.25 * atr);
    const e1 = (zLo + zHi) / 2;
    const below = lv.supports.filter((z) => z.hi < zLo);
    let sl1 = zLo - 0.75 * atr;
    if (below[0] && below[0].hi > sl1 - 0.5 * atr && below[0].lo < sl1) sl1 = below[0].lo - 0.5 * atr; // don't park the stop inside the next zone
    const skip1 = []; const tp1 = targets(e1, sl1, lv.resistances.filter((z) => z.lo > zHi), o.ath, skip1);
    const risk1 = (e1 - sl1) / e1 * 100;
    if (skip1.length) notes.push('Ada resistance dekat di ' + C.usd(skip1[0].lo) + ' (di atas zona entry support) yang terlalu dekat untuk dijadikan target. Area ini bisa menahan pantulan pertama, jadi wajar bila harga sempat tertahan di sana.');
    let st1;
    if (c < sl1) st1 = { txt: 'Batal: harga sudah di bawah stop', cls: 'down' };
    else if (c <= zHi * 1.003 && c >= zLo * 0.997) st1 = { txt: 'Harga sedang berada di zona entry', cls: 'up' };
    else if (c < zLo) st1 = { txt: 'Harga menembus bawah zona; tunggu harga kembali di atas ' + C.usd(zLo), cls: 'down' };
    else st1 = { txt: 'Menunggu koreksi ' + C.pct(dist(zHi, c)) + ' ke zona entry', cls: 'flat' };
    const g1 = grade(tp1[1] && tp1[1].rr, !trendDown, risk1 > WIDE[tf]);
    const setup1 = {
      key: 'pullback', name: 'Beli di area support (pullback)',
      logic: s1.maBased ? 'Tidak ada titik balik harga yang dekat di bawah harga, jadi zona entry memakai rata-rata bergerak terdekat (' + C.usd(s1.hi) + ') yang sering berfungsi sebagai support dinamis.'
        : s1.atrBased ? 'Tidak ada support yang jelas di bawah harga, jadi zona entry memakai jarak 1,2–1,8 ATR di bawah harga. Zona ini lemah dasarnya.'
          : 'Zona entry adalah support ' + zone(s1) + (s1.analyst ? ' (zona hasil analisis manual)' : s1.htf ? ' dari grafik harian, karena pada timeframe ' + TFL[tf] + ' harga sedang berada di titik terendah rentangnya' : ', titik balik harga yang tersentuh ' + s1.touches + '×') + '. Pembeli pernah masuk di area ini, jadi peluang harga tertahan lebih besar.',
      entryLo: zLo, entryHi: zHi, entry: e1, sl: sl1, slBasis: 'Di bawah zona support dikurangi 0,75 ATR, supaya tidak tersentuh oleh gerak acak biasa',
      riskPct: risk1, tps: tp1, status: st1, grade: g1,
      invalidation: 'Penutupan lilin ' + TFL[tf] + ' di bawah ' + C.usd(sl1) + ' berarti support gagal; skenario batal.',
    };

    // Setup 2: buy the breakout above the nearest resistance (or the recent high).
    const r1 = lv.resistances.find((z) => z.lo > c) || null;
    const recentHigh = Math.max(...rows.slice(-20).map((r) => r.high));
    const trig = r1 ? r1.hi : Math.max(recentHigh, c + 0.5 * atr);
    const e2 = trig + 0.2 * atr;
    const sl2 = Math.min(e2 - 1.0 * atr, (r1 ? r1.lo : trig) - 0.75 * atr);
    const tp2 = targets(e2, sl2, lv.resistances.filter((z) => z.lo > trig * 1.003), o.ath);
    const risk2 = (e2 - sl2) / e2 * 100;
    const st2 = c > trig ? { txt: 'Sudah tembus; tunggu uji ulang (retest) ke ' + C.usd(trig) + ' agar tidak mengejar harga', cls: 'up' } : { txt: 'Menunggu penutupan lilin ' + TFL[tf] + ' di atas ' + C.usd(trig) + ' (' + C.pct(dist(trig, c)) + ')', cls: 'flat' };
    const g2 = grade(tp2[1] && tp2[1].rr, trendUp || S.trend === 'Menyamping', risk2 > WIDE[tf]);
    const setup2 = {
      key: 'breakout', name: 'Beli saat breakout',
      logic: r1 ? 'Pemicu adalah penutupan di atas resistance ' + zone(r1) + '. Bila penjual di area itu sudah habis, harga biasanya bergerak cepat ke resistance berikutnya. Entry sedikit di atas resistance (0,2 ATR) untuk menghindari tembus palsu.'
        : 'Tidak ada resistance historis di atas harga, jadi pemicu memakai titik tertinggi 20 lilin terakhir. Target memakai kelipatan risiko karena tidak ada level di atasnya.',
      trigger: trig, entry: e2, entryLo: e2, entryHi: e2, sl: sl2, slBasis: 'Di bawah area resistance yang ditembus (kini menjadi support) dikurangi 0,75 ATR',
      riskPct: risk2, tps: tp2, status: st2, grade: g2,
      invalidation: 'Bila setelah tembus harga kembali ditutup di bawah ' + C.usd(r1 ? r1.lo : trig) + ', breakout dianggap palsu; keluar di stop ' + C.usd(sl2) + '.',
    };

    // What holders watch if support fails.
    const s2 = lv.supports.filter((z) => z.hi < (s1 ? s1.lo : c))[0];
    const downside = s1 && !s1.atrBased ? 'Bila penutupan ' + TFL[tf] + ' terjadi di bawah ' + C.usd(s1.lo) + ', support terdekat gagal' + (s2 ? ' dan area berikutnya yang dipantau adalah ' + zone(s2) + ' (' + C.pct(dist(s2.hi, c)) + ').' : '.') : null;

    return { tf, S, atr, lv, price: c, setups: [setup1, setup2], notes, downside, bias: trendUp ? 'Naik' : trendDown ? 'Turun' : 'Menyamping' };
  }

  /* ---------------- advanced technicals ---------------- */
  function fibonacci(rows, look) {
    const k = rows.slice(-(look || 180)); if (k.length < 30) return null;
    let hiI = 0, loI = 0; k.forEach((r, i) => { if (r.high > k[hiI].high) hiI = i; if (r.low < k[loI].low) loI = i; });
    const hi = k[hiI].high, lo = k[loI].low, up = loI < hiI; // swing direction: low then high = uptrend leg
    const c = k[k.length - 1].close;
    const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    const lvls = ratios.map((r) => ({ r, p: up ? hi - (hi - lo) * r : lo + (hi - lo) * r }));
    const ext = [1.272, 1.618].map((r) => ({ r, p: up ? lo + (hi - lo) * r : hi - (hi - lo) * r, ext: true }));
    return { hi, lo, hiT: k[hiI].time, loT: k[loI].time, up, levels: lvls.concat(ext), price: c, nearest: lvls.slice().sort((a, b) => Math.abs(a.p - c) - Math.abs(b.p - c))[0] };
  }
  function candlePattern(rows) {
    if (rows.length < 3) return null;
    const a = rows[rows.length - 3], b = rows[rows.length - 2]; // b = last closed candle
    const body = Math.abs(b.close - b.open), range = b.high - b.low || 1e-12;
    const upW = b.high - Math.max(b.open, b.close), loW = Math.min(b.open, b.close) - b.low;
    const bull = b.close > b.open;
    const out = { time: b.time };
    if (body / range < 0.1) return Object.assign(out, { name: 'Doji', sig: 0, txt: 'Badan lilin sangat kecil: pembeli dan penjual seimbang. Di ujung tren, doji sering menandai keraguan sebelum arah berubah.' });
    if (loW >= 2 * body && upW <= body * 0.6) return Object.assign(out, { name: bull ? 'Hammer' : 'Hanging man', sig: bull ? 1 : 0, txt: 'Ekor bawah panjang: harga sempat dijual turun lalu dibeli kembali. Di area support ini tanda penolakan harga rendah.' });
    if (upW >= 2 * body && loW <= body * 0.6) return Object.assign(out, { name: bull ? 'Inverted hammer' : 'Shooting star', sig: bull ? 0 : -1, txt: 'Ekor atas panjang: harga sempat naik lalu ditekan kembali. Di area resistance ini tanda penolakan harga tinggi.' });
    if (bull && a.close < a.open && b.close >= a.open && b.open <= a.close) return Object.assign(out, { name: 'Bullish engulfing', sig: 1, txt: 'Lilin naik menelan seluruh badan lilin turun sebelumnya: pembeli mengambil alih dalam satu periode.' });
    if (!bull && a.close > a.open && b.close <= a.open && b.open >= a.close) return Object.assign(out, { name: 'Bearish engulfing', sig: -1, txt: 'Lilin turun menelan seluruh badan lilin naik sebelumnya: penjual mengambil alih dalam satu periode.' });
    if (body / range > 0.7) return Object.assign(out, { name: bull ? 'Marubozu naik' : 'Marubozu turun', sig: bull ? 1 : -1, txt: 'Lilin berbadan penuh hampir tanpa ekor: ' + (bull ? 'pembeli' : 'penjual') + ' dominan dari buka hingga tutup.' });
    return Object.assign(out, { name: 'Tanpa pola khusus', sig: 0, txt: 'Lilin terakhir yang sudah ditutup tidak membentuk pola pembalikan yang umum.' });
  }
  function divergence(tech) {
    const k = tech.slice(-90).filter((r) => r.rsi14 !== null); if (k.length < 30) return null;
    const piv = (kind) => { const out = []; for (let i = 3; i < k.length - 2; i++) { const w = k.slice(i - 3, i + 3); if (kind === 'low' ? k[i].low === Math.min(...w.map((x) => x.low)) : k[i].high === Math.max(...w.map((x) => x.high))) out.push(k[i]); } return out.slice(-2); };
    const lows = piv('low'), highs = piv('high');
    if (lows.length === 2 && lows[1].low < lows[0].low && lows[1].rsi14 > lows[0].rsi14 + 2) return { name: 'Divergensi bullish', sig: 1, txt: 'Harga membuat titik terendah baru (' + C.usd(lows[1].low) + ' vs ' + C.usd(lows[0].low) + '), tetapi RSI justru lebih tinggi (' + lows[1].rsi14.toFixed(0) + ' vs ' + lows[0].rsi14.toFixed(0) + '). Tekanan jual melemah walau harga turun; ini sinyal awal pembalikan, bukan konfirmasi.' };
    if (highs.length === 2 && highs[1].high > highs[0].high && highs[1].rsi14 < highs[0].rsi14 - 2) return { name: 'Divergensi bearish', sig: -1, txt: 'Harga membuat titik tertinggi baru (' + C.usd(highs[1].high) + '), tetapi RSI lebih rendah (' + highs[1].rsi14.toFixed(0) + ' vs ' + highs[0].rsi14.toFixed(0) + '). Dorongan beli melemah walau harga naik; waspadai koreksi.' };
    return { name: 'Tidak ada divergensi', sig: 0, txt: 'Arah RSI masih sejalan dengan arah harga pada dua titik balik terakhir.' };
  }
  function maCross(tech) {
    let last = null;
    for (let i = 1; i < tech.length; i++) {
      const a = tech[i - 1], b = tech[i]; if (a.sma50 === null || a.sma200 === null) continue;
      if ((a.sma50 - a.sma200) * (b.sma50 - b.sma200) < 0) last = { time: b.time, type: b.sma50 > b.sma200 ? 'golden' : 'death', idx: i };
    }
    if (!last) { const r = tech[tech.length - 1]; if (r.sma200 === null) return null; return { name: r.sma50 > r.sma200 ? 'MA50 di atas MA200 (lama)' : 'MA50 di bawah MA200 (lama)', sig: r.sma50 > r.sma200 ? 1 : -1, txt: 'Tidak ada persilangan MA50/MA200 dalam data yang tersedia.' }; }
    const ago = tech.length - 1 - last.idx;
    return { name: last.type === 'golden' ? 'Golden cross' : 'Death cross', sig: last.type === 'golden' ? 1 : -1, time: last.time, ago,
      txt: (last.type === 'golden' ? 'MA50 memotong ke atas MA200' : 'MA50 memotong ke bawah MA200') + ' pada ' + C.tgl(last.time.slice(0, 10)) + ' (' + ago + ' lilin lalu). ' + (last.type === 'golden' ? 'Ini menandai perubahan struktur ke arah naik dalam horizon menengah.' : 'Ini menandai perubahan struktur ke arah turun dalam horizon menengah.') + ' Sinyal ini lambat, jadi lebih berguna sebagai filter arah daripada titik entry.' };
  }
  function obv(rows) {
    const k = rows.filter((r) => fin(r.volume)); if (k.length < 30) return null;
    let o = 0; const series = k.map((r, i) => (o += i ? (r.close > k[i - 1].close ? r.volume : r.close < k[i - 1].close ? -r.volume : 0) : 0));
    const n = 20, s = series.slice(-n), p = k.slice(-n).map((r) => r.close);
    const slope = (arr) => { const m = (arr.length - 1) / 2, ym = arr.reduce((a, b) => a + b, 0) / arr.length; let nu = 0, de = 0; arr.forEach((y, i) => { nu += (i - m) * (y - ym); de += (i - m) ** 2; }); return nu / de; };
    const so = slope(s), sp = slope(p);
    const up = so > 0, pup = sp > 0;
    return { up, priceUp: pup, sig: up && pup ? 1 : !up && !pup ? -1 : 0,
      name: up ? 'OBV naik' : 'OBV turun',
      txt: 'On-Balance Volume 20 lilin terakhir ' + (up ? 'naik' : 'turun') + ' sementara harga ' + (pup ? 'naik' : 'turun') + '. ' + (up === pup ? 'Volume searah dengan harga, jadi gerakan ini didukung aliran dana.' : up ? 'Volume beli bertambah walau harga belum naik; ini bisa tanda akumulasi.' : 'Harga naik tanpa dukungan volume beli; kenaikan seperti ini lebih rapuh.') };
  }
  function mtfRow(label, rows) {
    if (!rows || rows.length < 30) return { label, na: true };
    const S = C.summarize(C.techCalc(rows));
    return { label, S, vs50: S.sma50 !== null ? dist(S.close, S.sma50) : null, vs200: S.sma200 !== null ? dist(S.close, S.sma200) : null };
  }
  function signalTable(dS, extras) {
    const rows = [];
    const add = (name, value, reading, sig) => rows.push({ name, value, reading, sig });
    if (!dS) return { rows, score: 0 };
    const c = dS.close;
    if (dS.sma200 !== null) add('Harga vs MA200', C.pct(dist(c, dS.sma200)), c > dS.sma200 ? 'Di atas: tren menengah naik' : 'Di bawah: tren menengah turun', c > dS.sma200 ? 1 : -1);
    if (dS.sma50 !== null) add('Harga vs MA50', C.pct(dist(c, dS.sma50)), c > dS.sma50 ? 'Di atas MA50' : 'Di bawah MA50', c > dS.sma50 ? 1 : -1);
    if (dS.sma20 !== null) add('Harga vs MA20 & EMA21', C.pct(dist(c, dS.sma20)), c > dS.sma20 && c > dS.ema21 ? 'Di atas keduanya: jangka pendek kuat' : c < dS.sma20 && c < dS.ema21 ? 'Di bawah keduanya: jangka pendek lemah' : 'Di antara keduanya', c > dS.sma20 && c > dS.ema21 ? 1 : c < dS.sma20 && c < dS.ema21 ? -1 : 0);
    if (dS.rsi14 !== null) add('RSI 14', dS.rsi14.toFixed(1), dS.rsi14 > 70 ? 'Jenuh beli' : dS.rsi14 > 55 ? 'Momentum beli' : dS.rsi14 >= 45 ? 'Netral' : dS.rsi14 >= 30 ? 'Momentum jual' : 'Jenuh jual', dS.rsi14 > 70 ? 0 : dS.rsi14 > 55 ? 1 : dS.rsi14 >= 45 ? 0 : dS.rsi14 >= 30 ? -1 : 0);
    if (dS.macd_hist !== null) { const rising = dS.macd_hist_prev !== null && dS.macd_hist > dS.macd_hist_prev; add('Histogram MACD', C.fmtP(dS.macd_hist), (dS.macd_hist >= 0 ? 'Positif' : 'Negatif') + ', ' + (rising ? 'menguat' : 'melemah'), dS.macd_hist >= 0 ? (rising ? 1 : 0) : (rising ? 0 : -1)); }
    if (dS.adx14 !== null) add('ADX 14 (+DI/−DI)', dS.adx14.toFixed(1) + ' (' + dS.pdi.toFixed(0) + '/' + dS.mdi.toFixed(0) + ')', dS.adx14 < 20 ? 'Tanpa tren kuat' : (dS.pdi > dS.mdi ? 'Tren naik ' : 'Tren turun ') + (dS.adx14 >= 25 ? 'kuat' : 'mulai terbentuk'), dS.adx14 < 20 ? 0 : dS.pdi > dS.mdi ? 1 : -1);
    if (dS.bb_pctile !== null) add('Lebar Bollinger (persentil)', dS.bb_pctile.toFixed(0), dS.bb_pctile < 20 ? 'Menyempit: gerakan besar mungkin menyusul' : dS.bb_pctile > 80 ? 'Melebar: volatilitas tinggi' : 'Normal', 0);
    if (dS.vol_ratio !== null) add('Volume vs rata-rata 20', dS.vol_ratio.toFixed(2) + '×', dS.vol_ratio > 1.5 ? 'Tinggi' : dS.vol_ratio < 0.7 ? 'Sepi' : 'Normal', 0);
    (extras || []).filter(Boolean).forEach((x) => add(x.label, x.name, x.short || x.name, x.sig || 0));
    const score = rows.reduce((s, r) => s + r.sig, 0);
    return { rows, score, max: rows.filter((r) => r.sig !== 0 || /MA|RSI|MACD|ADX/.test(r.name)).length };
  }

  /* ---------------- fundamentals ---------------- */
  function fundamentals(d, btc) {
    const rows = []; const add = (factor, value, reading, sig) => rows.push({ factor, value, reading, sig });
    if (!d) return { rows, score: 0 };
    if (d.rank) add('Ukuran pasar', '#' + d.rank + ' · ' + C.compact(d.market_cap), d.rank <= 10 ? 'Aset besar: likuiditas dalam, volatilitas lebih rendah dari altcoin kecil' : d.rank <= 50 ? 'Aset menengah' : d.rank <= 200 ? 'Aset kecil: lebih fluktuatif, risiko lebih besar' : 'Aset mikro: sangat spekulatif', d.rank <= 20 ? 1 : d.rank <= 100 ? 0 : -1);
    const vr = d.volume / d.market_cap;
    if (isFinite(vr)) add('Likuiditas (volume / kapitalisasi)', (vr * 100).toFixed(1) + '%', vr > 0.25 ? 'Sangat tinggi: perdagangan spekulatif intens' : vr > 0.03 ? 'Sehat: mudah masuk dan keluar posisi' : 'Rendah: order besar bisa menggerakkan harga', vr > 0.25 ? 0 : vr > 0.03 ? 1 : -1);
    const base = fin(d.max) && d.max > 0 ? d.max : d.total;
    if (fin(d.circ) && fin(base) && base > 0) { const pc = d.circ / base * 100; add('Suplai beredar', pc.toFixed(0) + '% dari ' + (fin(d.max) && d.max > 0 ? 'maksimum' : 'total'), pc < 50 ? 'Banyak token belum beredar: risiko tekanan jual saat unlock' : pc < 85 ? 'Masih ada suplai baru yang akan masuk' : 'Hampir semua sudah beredar: risiko dilusi kecil', pc < 50 ? -1 : pc < 85 ? 0 : 1); }
    if (fin(d.fdv) && fin(d.market_cap) && d.market_cap > 0) { const r = d.fdv / d.market_cap; add('FDV / kapitalisasi', r.toFixed(2) + '×', r > 2 ? 'Valuasi penuh jauh di atas kapitalisasi beredar: dilusi besar di depan' : r > 1.3 ? 'Ada dilusi menengah' : 'Hampir tanpa dilusi', r > 2 ? -1 : r > 1.3 ? 0 : 1); }
    if (!(fin(d.max) && d.max > 0)) add('Batas suplai', 'Tidak dibatasi', 'Nilai jangka panjang bergantung pada kebijakan emisi dan burn', 0);
    else add('Batas suplai', C.compactN(d.max), 'Suplai maksimum tetap: tidak bisa dicetak tanpa batas', 1);
    if (fin(d.dd_ath)) add('Jarak dari rekor tertinggi', C.pct(d.dd_ath) + (d.ath_date ? ' (' + C.tgl(d.ath_date) + ')' : ''), d.dd_ath > -15 ? 'Dekat ATH: momentum kuat, tetapi ruang naik historis terbatas' : d.dd_ath > -60 ? 'Koreksi menengah dari puncak' : 'Jauh di bawah puncak: bisa murah, bisa juga kehilangan minat pasar', 0);
    if (d.genesis) { const yrs = (Date.now() - Date.parse(d.genesis)) / (365.25 * 864e5); if (isFinite(yrs)) add('Umur proyek', yrs.toFixed(1) + ' tahun', yrs >= 5 ? 'Sudah melewati beberapa siklus pasar' : yrs >= 2 ? 'Cukup teruji' : 'Masih muda: rekam jejak pendek', yrs >= 5 ? 1 : yrs >= 2 ? 0 : -1); }
    if (d.dev && (fin(d.dev.commits4w) || fin(d.dev.stars))) {
      const cm = num(d.dev.commits4w);
      add('Aktivitas developer (GitHub)', (fin(cm) ? cm + ' commit/4 pekan' : '—') + (fin(d.dev.stars) ? ' · ' + C.compactN(d.dev.stars) + ' bintang' : ''), !fin(cm) ? 'Data commit tidak tersedia' : cm >= 50 ? 'Pengembangan aktif' : cm >= 10 ? 'Pengembangan berjalan' : 'Aktivitas kode rendah atau repositori tidak dipantau', !fin(cm) ? 0 : cm >= 50 ? 1 : cm >= 10 ? 0 : -1);
    }
    if (fin(d.sentiment_up)) add('Sentimen komunitas (CoinGecko)', d.sentiment_up.toFixed(0) + '% positif', d.sentiment_up >= 75 ? 'Mayoritas pemilih optimis' : d.sentiment_up >= 50 ? 'Cenderung optimis' : 'Cenderung pesimis', 0);
    if (btc && btc.symbol !== d.symbol) {
      const r30 = fin(d.percent_change_30d) && fin(btc.percent_change_30d) ? d.percent_change_30d - btc.percent_change_30d : NaN;
      const r1y = fin(d.percent_change_1y) && fin(btc.percent_change_1y) ? d.percent_change_1y - btc.percent_change_1y : NaN;
      if (fin(r30) || fin(r1y)) add('Kinerja relatif vs BTC', (fin(r30) ? C.pct(r30) + ' (30h)' : '') + (fin(r1y) ? ' · ' + C.pct(r1y) + ' (1th)' : ''), (fin(r30) ? r30 : r1y) > 0 ? 'Lebih kuat dari Bitcoin' : 'Lebih lemah dari Bitcoin', (fin(r30) ? r30 : r1y) > 0 ? 1 : -1);
    }
    if (d.categories && d.categories.length) add('Sektor / narasi', d.categories.slice(0, 3).join(', '), 'Kinerja sering bergerak bersama sektor yang sama', 0);
    const score = rows.reduce((s, r) => s + r.sig, 0);
    const scored = rows.filter((r) => r.sig !== 0).length;
    return { rows, score, verdict: score >= 3 ? 'Fundamental pasar kuat' : score <= -2 ? 'Fundamental pasar lemah' : 'Fundamental pasar campuran', cls: score >= 3 ? 'up' : score <= -2 ? 'down' : 'flat', scored };
  }

  function positionSize(capital, riskPct, entry, sl) {
    const riskUsd = capital * riskPct / 100; const per = entry - sl;
    if (!(capital > 0) || !(riskPct > 0) || !(per > 0)) return null;
    const qty = riskUsd / per; const value = qty * entry;
    return { riskUsd, qty, value, overCap: value > capital, capQty: capital / entry };
  }

  global.CDAnalysis = { TFL, LV_OPTS, levels, tradePlan, fibonacci, candlePattern, divergence, maCross, obv, mtfRow, signalTable, fundamentals, positionSize, rrOf };
})(window);
