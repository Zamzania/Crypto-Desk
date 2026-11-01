/* Crypto Desk — home page, part 1: state, loaders, market regime, overview, market table.
 * Everything here is computed in the visitor's browser from live public APIs; files in /data are written
 * by the hourly collector (macro, calendar, ETF, news, listings) or by hand (theses), and show their own date. */
(function (global) {
  'use strict';
  const C = global.CDCore, A = global.CDAnalysis, T = global.CDTrade, L = global.CDLive;
  const { el, usd, pct, num, compact, tgl, witaTime, sgnCls } = C;
  const fin = Number.isFinite;
  const COINS = C.PORTFOLIO;
  const NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', XRP: 'XRP', SOL: 'Solana', BNB: 'BNB' };
  const COL = { BTC: 'var(--cd-brass)', ETH: 'var(--cd-navy)', XRP: 'var(--cd-slate)', SOL: 'var(--cd-green)', BNB: 'var(--cd-burgundy)' };
  const S = { coin: {}, deriv: {}, files: {}, page: 'ringkasan' };
  const H = global.CDH = { C, A, T, L, COINS, NAMES, COL, S, fin, draw: {} };

  /* ---------- small helpers ---------- */
  H.fail = (box, msg) => { box.classList.remove('dash-skeleton'); box.replaceChildren(el('div', 'cd-fail', msg || 'Data belum bisa dimuat. Halaman mencoba lagi otomatis.')); };
  H.skel = (box) => { box.classList.add('dash-skeleton'); box.replaceChildren(); };
  H.f = (v, d) => (fin(num(v)) ? num(v).toFixed(d === undefined ? 1 : d) : '—');
  H.dd = (label, value, small, cls) => { const d = el('div'); const v = el('dd', cls || null, value); if (small) v.append(el('small', null, small)); d.append(el('dt', null, label), v); return d; };
  H.td = (txt, cls) => el('td', cls || null, txt);
  H.trendCls = (t) => (/^Naik/.test(t || '') ? 'up' : /^Turun/.test(t || '') ? 'down' : 'flat');
  H.priceOf = (sym) => { const q = L.get(sym); if (q && fin(q.price)) return q.price; const m = H.mkt(sym); return m ? m.price : NaN; };
  H.mkt = (sym) => (S.markets ? S.markets.rows.find((r) => r.symbol === sym) : null);
  H.coinHref = (id, sym) => 'coin.html?id=' + encodeURIComponent(id || '') + '&s=' + encodeURIComponent(sym || '');
  H.chartHref = (sym, id, tf) => 'chart.html?s=' + encodeURIComponent(sym) + (id ? '&id=' + encodeURIComponent(id) : '') + '&tf=' + (tf || '4h');
  H.spark = (pts, w, h, up) => {
    const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('aria-hidden', 'true');
    const v = (pts || []).filter(fin); if (v.length < 2) return svg;
    const step = Math.max(1, Math.floor(v.length / 48)); const s = v.filter((_, i) => i % step === 0 || i === v.length - 1);
    const lo = Math.min(...s), hi = Math.max(...s), r = hi - lo || 1;
    const d = s.map((p, i) => (i ? 'L' : 'M') + ((i / (s.length - 1)) * (w - 2) + 1).toFixed(1) + ' ' + (h - 2 - ((p - lo) / r) * (h - 4)).toFixed(1)).join('');
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '1.4');
    path.setAttribute('stroke', (up === undefined ? s[s.length - 1] >= s[0] : up) ? 'var(--cd-up)' : 'var(--cd-down)'); svg.appendChild(path); return svg;
  };
  const retOver = (rows, days, priceNow) => { if (!rows || rows.length <= days) return NaN; const p0 = rows[rows.length - 1 - days].close; const p1 = fin(priceNow) ? priceNow : rows[rows.length - 1].close; return (p1 / p0 - 1) * 100; };
  H.retOver = retOver;
  const sd = (a) => { if (a.length < 3) return NaN; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  H.sd = sd;
  H.corr = (a, b) => { const n = Math.min(a.length, b.length); if (n < 20) return NaN; a = a.slice(-n); b = b.slice(-n); const ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return c / Math.sqrt(va * vb); };
  // Daily returns keyed by date, so two series can be aligned before computing correlation.
  H.retMap = (rows) => { const m = new Map(); for (let i = 1; i < rows.length; i++) m.set(String(rows[i].time).slice(0, 10), rows[i].close / rows[i - 1].close - 1); return m; };
  H.aligned = (m1, m2, last) => { const keys = Array.from(m1.keys()).filter((k) => m2.has(k)).sort().slice(-(last || 90)); return [keys.map((k) => m1.get(k)), keys.map((k) => m2.get(k))]; };

  /* ---------- redraw scheduling ---------- */
  let queued = false;
  H.redraw = () => { if (queued) return; queued = true; const run = () => { if (!queued) return; queued = false; Object.entries(H.draw).forEach(([k, fn]) => { try { fn(); } catch (e) { console.error('draw ' + k, e); } }); }; requestAnimationFrame(run); setTimeout(run, 150); };

  /* ---------- loaders ---------- */
  H.loadFile = async (name, maxAgeMs) => {
    try { S.files[name] = await C.getJSON('data/' + name + '.json?t=' + Math.floor(Date.now() / (maxAgeMs || 600e3)), 15000); }
    catch (e) { if (!S.files[name]) S.files[name] = null; }
    H.redraw();
  };
  async function loadGlobal() {
    try { const j = await C.cached('global', 60e3, () => C.getJSON('https://api.coingecko.com/api/v3/global', 10000)); S.global = { data: j.data, at: new Date().toISOString(), live: true }; }
    catch (e) { try { const j = await C.getJSON('data/global.json', 10000); S.global = { data: j.data, at: j.updated, live: false }; } catch (e2) { if (!S.global) S.global = null; } }
    H.redraw();
  }
  async function loadMarkets() {
    try {
      const v = await C.cached('markets250', 90e3, async () => {
        const a = await C.getJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=1h,24h,7d,30d,1y', 15000);
        return a.map((x) => Object.assign(C.mapCG(x), { percent_change_1h: x.price_change_percentage_1h_in_currency, spark: x.sparkline_in_7d && x.sparkline_in_7d.price ? x.sparkline_in_7d.price.filter((_, i) => i % 3 === 0) : null }));
      });
      S.markets = { rows: v.filter(C.isAsset), source: 'CoinGecko', at: new Date().toISOString(), live: true };
    } catch (e) {
      try { const j = await C.getJSON('data/markets.json', 12000); S.markets = { rows: j.rows.filter(C.isAsset), source: 'CoinGecko', at: j.updated, live: false }; }
      catch (e2) { if (!S.markets) S.markets = null; }
    }
    H.redraw();
  }
  async function loadFng() {
    try { const j = await C.getJSON('https://api.alternative.me/fng/?limit=120&format=json', 9000); S.fng = j.data.map((d) => ({ date: new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10), value: Number(d.value), label: d.value_classification })).reverse(); }
    catch (e) { if (!S.fng) S.fng = null; }
    H.redraw();
  }
  async function loadCoin(sym) {
    const id = C.PORTFOLIO_ID[sym];
    const tfs = [['d1', '1day', 1000], ['h4', '4h', 1000], ['h1', '1h', 500], ['w1', '1week', 300]];
    const res = await Promise.allSettled(tfs.map(([, tf, n]) => C.fetchCandles(sym, tf, n, tf === '1day' ? id : null)));
    const o = S.coin[sym] || {}; o.sym = sym; o.at = Date.now();
    tfs.forEach(([k], i) => { if (res[i].status === 'fulfilled' && res[i].value.rows.length > 30) { o[k] = res[i].value.rows; o[k + 'src'] = res[i].value.source; } });
    S.coin[sym] = o; deriveCoin(sym); H.redraw();
  }
  function deriveCoin(sym) {
    const o = S.coin[sym]; if (!o || !o.d1) return;
    o.S = {}; [['w1', '1 minggu'], ['d1', '1 hari'], ['h4', '4 jam'], ['h1', '1 jam']].forEach(([k]) => { if (o[k]) o.S[k] = C.summarize(C.techCalc(o[k])); });
    o.lvD = A.levels(o.d1, '1day');
    const m = H.mkt(sym) || {};
    try { if (o.h4) o.plan4 = T.plan(o.h4, '4h', { ath: m.ath, atl: m.atl, htfRows: o.d1, htfLevels: o.lvD, deriv: S.deriv[sym] }); } catch (e) { console.warn('plan', sym, e); }
    const btc = S.coin.BTC && S.coin.BTC.d1;
    try { o.risk = T.riskProfile(o.d1, sym === 'BTC' ? null : btc, { symbol: sym, volume: m.volume, market_cap: m.market_cap, rank: m.rank }, S.deriv[sym]); } catch (e) { console.warn('risk', sym, e); }
  }
  H.deriveCoin = deriveCoin;
  // Derivatives from OKX public endpoints: funding, open interest (now and daily history), long/short ratio, taker flow.
  async function loadDeriv(sym) {
    const okx = (p) => C.getJSON('https://www.okx.com/api/v5/' + p, 9000).then((j) => { if (j.code && j.code !== '0') throw new Error(j.msg); return j.data; });
    const o = Object.assign({}, await T.derivatives(sym).catch(() => ({ sym })));
    await Promise.allSettled([
      okx('rubik/stat/contracts/open-interest-volume?ccy=' + sym + '&period=1D').then((d) => { const r = d.map((x) => ({ t: +x[0], oi: +x[1], vol: +x[2] })).sort((a, b) => a.t - b.t); o.oiHist = r; if (r.length > 1) { o.oiChg1d = (r[r.length - 1].oi / r[r.length - 2].oi - 1) * 100; } if (r.length > 7) o.oiChg7d = (r[r.length - 1].oi / r[r.length - 8].oi - 1) * 100; }),
      okx('rubik/stat/taker-volume?ccy=' + sym + '&instType=CONTRACTS&period=1D').then((d) => { const r = d.map((x) => ({ t: +x[0], sell: +x[1], buy: +x[2] })).sort((a, b) => a.t - b.t); const l = r[r.length - 1]; if (l && l.buy + l.sell > 0) o.takerBuy = (l.buy / (l.buy + l.sell)) * 100; o.takerHist = r; }),
      okx('public/funding-rate-history?instId=' + sym + '-USDT-SWAP&limit=90').then((d) => { o.fundHist = d.map((x) => ({ t: +x.fundingTime, r: +x.fundingRate })).sort((a, b) => a.t - b.t); }),
      okx('rubik/stat/contracts/long-short-account-ratio?ccy=' + sym + '&period=1D').then((d) => { o.lsrHist = d.map((x) => ({ t: +x[0], r: +x[1] })).sort((a, b) => a.t - b.t); }),
    ]);
    o.at = Date.now(); S.deriv[sym] = o; H.redraw();
  }
  H.loadDeriv = loadDeriv;

  /* ---------- market regime ---------- */
  function macroSeries(key) { const m = S.files.macro_live; return m && m.series ? m.series.find((s) => s.key === key) : null; }
  H.macroSeries = macroSeries;
  H.chgOver = (pts, n) => (pts && pts.length > n ? (pts[pts.length - 1][1] / pts[pts.length - 1 - n][1] - 1) * 100 : NaN);
  function regime() {
    const items = []; const add = (pts, txt, ok) => { if (ok === false) return; items.push({ pts, txt }); };
    const b = S.coin.BTC; const bs = b && b.S;
    if (bs && bs.d1) add(bs.d1.trend === 'Naik' ? 2 : bs.d1.trend === 'Turun' ? -2 : 0, 'Tren harian BTC: ' + bs.d1.trend.toLowerCase() + ' (harga ' + (bs.d1.close > bs.d1.sma200 ? 'di atas' : 'di bawah') + ' MA200 harian).');
    if (bs && bs.h4) add(bs.h4.trend === 'Naik' ? 1 : bs.h4.trend === 'Turun' ? -1 : 0, 'Tren 4 jam BTC: ' + bs.h4.trend.toLowerCase() + ', RSI 4 jam ' + H.f(bs.h4.rsi14, 0) + '.');
    const top = S.markets ? S.markets.rows.slice(0, 100).filter((r) => fin(num(r.percent_change_24h))) : [];
    if (top.length > 30) { const up = top.filter((r) => r.percent_change_24h > 0).length / top.length * 100; add(up > 60 ? 1 : up < 40 ? -1 : 0, 'Keluasan pasar: ' + up.toFixed(0) + '% dari 100 koin teratas naik dalam 24 jam.'); }
    if (S.fng && S.fng.length) { const f = S.fng[S.fng.length - 1]; add(f.value >= 60 ? 1 : f.value <= 30 ? -1 : 0, 'Fear & Greed ' + f.value + ' (' + fngLabel(f.value) + ').'); }
    const d = S.deriv.BTC; if (d && fin(d.funding)) add(d.funding * 100 > 0.03 ? -1 : d.funding < 0 ? 1 : 0, 'Funding BTC ' + pct(d.funding * 100, 4) + ' per 8 jam' + (d.funding * 100 > 0.03 ? ': posisi long terlalu ramai.' : d.funding < 0 ? ': short membayar long, bahan bakar short squeeze.' : ': wajar.'));
    const dxy = macroSeries('dxy'); if (dxy) { const c = H.chgOver(dxy.pts, 21); if (fin(c)) add(c > 2 ? -1 : c < -2 ? 1 : 0, 'Dolar AS ' + pct(c) + ' dalam sebulan' + (c > 2 ? ', menekan aset berisiko.' : c < -2 ? ', melonggarkan likuiditas global.' : '.')); }
    const vix = macroSeries('vix'); if (vix) { const v = vix.pts[vix.pts.length - 1][1]; add(v > 25 ? -1 : v < 16 ? 1 : 0, 'VIX ' + v.toFixed(1) + (v > 25 ? ': pasar saham sedang takut.' : v < 16 ? ': pasar saham tenang.' : ': normal.')); }
    const etf = S.files.etf_live && S.files.etf_live.assets ? S.files.etf_live.assets.find((a) => a.asset === 'BTC') : null;
    if (etf && etf.rows.length >= 5) { const s5 = etf.rows.slice(-5).reduce((x, r) => x + r.flow_musd, 0); add(s5 > 0 ? 1 : s5 < 0 ? -1 : 0, 'Arus ETF BTC 5 hari bursa terakhir ' + (s5 >= 0 ? '+' : '−') + '$' + Math.abs(s5).toFixed(0) + ' juta.'); }
    const score = items.reduce((x, i) => x + i.pts, 0);
    const label = score >= 3 ? 'Risk-on' : score <= -3 ? 'Risk-off' : score > 0 ? 'Netral, condong positif' : score < 0 ? 'Netral, condong negatif' : 'Netral';
    return { score, label, items, cls: score >= 3 ? '' : score <= -3 ? 'bear' : 'flat' };
  }
  H.regime = regime;
  const fngLabel = (v) => (v <= 24 ? 'sangat takut' : v <= 44 ? 'takut' : v <= 55 ? 'netral' : v <= 75 ? 'serakah' : 'sangat serakah');
  H.fngLabel = fngLabel;

  /* ---------- band takeaway ---------- */
  H.draw.band = function () {
    const tk = document.getElementById('takeaway'); if (!tk) return;
    const p = H.priceOf('BTC'); const q = L.get('BTC'); const m = H.mkt('BTC');
    if (!fin(p)) return;
    const b = (t) => el('b', null, t); const r = regime();
    tk.replaceChildren('BTC ', b(usd(p)), ' (', b(pct(q ? q.chg : m && m.percent_change_24h, 2)), ' dalam 24 jam). ');
    if (r.items.length >= 3) tk.append('Rezim pasar ', b(r.label.toLowerCase()), ' dengan skor ', b((r.score > 0 ? '+' : '') + r.score), ' dari ' + r.items.length + ' faktor. ');
    const g = S.global && S.global.data; if (g) tk.append('Kapitalisasi kripto ', b(compact(g.total_market_cap.usd)), ', dominasi BTC ', b(H.f(g.market_cap_percentage.btc) + '%'), '. ');
    if (S.fng && S.fng.length) { const f = S.fng[S.fng.length - 1]; tk.append('Sentimen ', b(fngLabel(f.value) + ' (' + f.value + ')'), '.'); }
  };

  /* ---------- overview: ledger + verdict ---------- */
  H.draw.ledger = function () {
    const box = document.getElementById('ledger'); if (!box) return;
    const g = S.global && S.global.data; const cells = [];
    const cell = (label, v, s, cls) => { const d = el('div'); d.append(el('span', 'lbl', label), el('span', 'v ' + (cls || ''), v)); if (s) d.append(el('span', 's', s)); cells.push(d); };
    if (g) {
      cell('Kapitalisasi total', compact(g.total_market_cap.usd), pct(g.market_cap_change_percentage_24h_usd, 2) + ' dalam 24 jam');
      cell('Dominasi BTC', H.f(g.market_cap_percentage.btc) + '%', 'ETH ' + H.f(g.market_cap_percentage.eth) + '%, sisanya altcoin ' + H.f(100 - g.market_cap_percentage.btc - g.market_cap_percentage.eth) + '%');
      cell('Volume 24 jam', compact(g.total_volume.usd), H.f(g.total_volume.usd / g.total_market_cap.usd * 100) + '% dari kapitalisasi');
    } else cell('Kapitalisasi total', S.global === null ? '—' : 'Memuat…', S.global === null ? 'CoinGecko tidak merespons' : '');
    if (S.fng && S.fng.length) { const f = S.fng[S.fng.length - 1], y = S.fng[S.fng.length - 2], w = S.fng[S.fng.length - 8]; cell('Fear & Greed', String(f.value), fngLabel(f.value) + (y ? ', kemarin ' + y.value : '') + (w ? ', seminggu lalu ' + w.value : '')); }
    const d = S.deriv.BTC; if (d && fin(d.funding)) cell('Funding BTC per 8 jam', pct(d.funding * 100, 4), 'Setara ' + pct(d.funding * 100 * 3 * 365, 1) + ' per tahun' + (fin(d.oiUsd) ? ', OI ' + compact(d.oiUsd) : ''));
    const top = S.markets ? S.markets.rows.slice(0, 100).filter((r) => fin(num(r.percent_change_24h))) : [];
    if (top.length > 30) { const up = top.filter((r) => r.percent_change_24h > 0).length; const med = top.map((r) => r.percent_change_24h).sort((a, b) => a - b)[Math.floor(top.length / 2)]; cell('Keluasan pasar', up + ' naik / ' + (top.length - up) + ' turun', 'Median 100 teratas ' + pct(med, 2) + ' dalam 24 jam'); }
    box.replaceChildren(...cells);
    const st = document.getElementById('ov-stamp'); if (st) st.textContent = 'diperbarui ' + witaTime(new Date().toISOString());
  };
  H.draw.verdict = function () {
    const box = document.getElementById('verdict-box'); if (!box) return;
    const r = regime(); if (r.items.length < 2) { box.hidden = true; return; }
    box.hidden = false; box.className = 'cd-verdict ' + r.cls;
    const ul = el('ul'); r.items.forEach((i) => { const li = el('li'); li.append(el('b', i.pts > 0 ? 'cd-pos' : i.pts < 0 ? 'cd-neg' : null, (i.pts > 0 ? '+' : i.pts < 0 ? '−' : '±') + Math.abs(i.pts) + ' '), i.txt); ul.append(li); });
    box.replaceChildren(el('span', 'lbl', 'Rezim pasar saat ini'), el('h3', null, r.label + ' · skor ' + (r.score > 0 ? '+' : '') + r.score),
      el('p', null, 'Skor menjumlahkan faktor di bawah: tren BTC, keluasan pasar, sentimen, leverage, dolar, volatilitas saham, dan arus ETF. Skor +3 ke atas berarti kondisi mendukung aset berisiko; −3 ke bawah berarti kondisi menekan. Ini pembacaan kondisi saat ini, bukan ramalan.'), ul);
  };

  /* ---------- overview: coin cards ---------- */
  H.draw.cards = function () {
    const box = document.getElementById('coin-cards'); if (!box) return;
    box.replaceChildren(...COINS.map((sym) => {
      const o = S.coin[sym] || {}; const m = H.mkt(sym) || {}; const id = C.PORTFOLIO_ID[sym];
      const card = el('article', 'cd-card cd-coin'); card.style.setProperty('--coin', COL[sym]);
      const head = el('div', 'cd-coin-head'); const nm = el('div'); nm.append(el('span', 'cd-coin-name', NAMES[sym]), ' ', el('span', 'cd-coin-sym', sym)); head.append(nm, el('span', 'cd-coin-sym', m.rank ? '#' + m.rank : '')); card.append(head);
      const pr = el('div', 'cd-price', usd(H.priceOf(sym))); pr.dataset.live = sym; card.append(pr);
      const sub = el('div', 'cd-coin-sym'); const ch = el('span', sgnCls(m.percent_change_24h), pct(m.percent_change_24h, 2)); ch.dataset.live = sym; ch.dataset.liveField = 'chg'; sub.append(ch, ' dalam 24 jam · kapitalisasi ' + compact(m.market_cap)); card.append(sub);
      if (o.S) {
        const mtf = el('div', 'cd-mtf'); mtf.setAttribute('aria-label', 'Tren per timeframe');
        [['w1', 'Mgg', '1 minggu'], ['d1', 'Hari', '1 hari'], ['h4', '4 j', '4 jam'], ['h1', '1 j', '1 jam']].forEach(([k, lab, full]) => { const s = o.S[k]; const d = el('div', s ? H.trendCls(s.trend) : null); const tr = s ? s.trend.replace(' (data pendek)', '') : '—'; d.title = full + ': ' + tr; d.append(el('span', 't', lab), tr === 'Menyamping' ? 'Datar' : tr); mtf.append(d); });
        card.append(mtf);
      } else card.append(el('div', 'cd-mtf dash-skeleton', ' '));
      const kv = el('dl', 'cd-kv'); const p = H.priceOf(sym);
      [['7 hari', fin(num(m.percent_change_7d)) ? m.percent_change_7d : retOver(o.d1, 7, p)], ['30 hari', fin(num(m.percent_change_30d)) ? m.percent_change_30d : retOver(o.d1, 30, p)], ['1 tahun', fin(num(m.percent_change_1y)) ? m.percent_change_1y : retOver(o.d1, 365, p)]]
        .forEach(([lab, v]) => { const d = el('div'); d.append(el('dt', null, lab), el('dd', sgnCls(v), pct(v))); kv.append(d); });
      card.append(kv);
      const foot = el('div', 'cd-coin-foot'); const b = (t) => el('b', null, t);
      const l1 = el('div'); l1.append('Dari ATH ', b(pct(m.dd_ath)), ' · RSI harian ', b(o.S && o.S.d1 ? H.f(o.S.d1.rsi14, 0) : '—')); foot.append(l1);
      if (o.lvD) {
        const s1 = o.lvD.supports[0], r1 = o.lvD.resistances[0];
        const l2 = el('div'); l2.append('Support terdekat ', b(s1 ? usd(s1.lo) + '–' + usd(s1.hi) : '—')); const l3 = el('div'); l3.append('Resistance terdekat ', b(r1 ? usd(r1.lo) + '–' + usd(r1.hi) : '—')); foot.append(l2, l3);
      }
      if (o.plan4 && o.plan4.best) { const bs = o.plan4.best; const l4 = el('div'); l4.append('Skenario 4 jam terkuat: ', b((bs.side > 0 ? 'Long' : 'Short') + ' · ' + bs.name.toLowerCase()), ', konfluensi ' + bs.conf.score + '/100'); foot.append(l4); }
      if (o.risk) { const l5 = el('div'); l5.append('Risiko ', b(o.risk.label.toLowerCase() + ' (' + o.risk.score + '/10)'), ', leverage wajar ≤ ' + o.risk.levCap + '×'); foot.append(l5); }
      card.append(foot);
      const acts = el('div', 'cd-card-actions'); acts.append(C.link(H.coinHref(id, sym), 'cd-btn cd-btn-sm', 'Analisis lengkap'), C.link(H.chartHref(sym, id), 'cd-btn cd-btn-sm cd-btn-primary', 'See chart')); card.append(acts);
      return card;
    }));
    L.rebind();
  };

  /* ---------- overview: performance, risk, correlation ---------- */
  H.draw.perfTable = function () {
    const tb = document.querySelector('#perf-table tbody'); if (!tb) return;
    const year0 = new Date().getUTCFullYear() + '-01-01';
    tb.replaceChildren(...COINS.filter((s) => S.coin[s] && S.coin[s].d1).map((sym) => {
      const r = S.coin[sym].d1; const p = H.priceOf(sym); const iY = r.findIndex((x) => String(x.time).slice(0, 10) >= year0);
      const ytd = iY > 0 ? (p / r[iY - 1].close - 1) * 100 : NaN;
      const tr = el('tr'); tr.append(H.td(sym, 'sym'));
      [retOver(r, 7, p), retOver(r, 30, p), retOver(r, 90, p), ytd, retOver(r, 365, p)].forEach((v) => tr.append(H.td(pct(v), 'num ' + sgnCls(v))));
      const btc = S.coin.BTC && S.coin.BTC.d1; const rel = sym === 'BTC' || !btc ? NaN : retOver(r, 90, p) - retOver(btc, 90, H.priceOf('BTC'));
      tr.append(H.td(sym === 'BTC' ? 'acuan' : pct(rel), 'num ' + sgnCls(rel))); return tr;
    }));
  };
  H.draw.risk = function () {
    const tb = document.querySelector('#risk-table tbody'); if (!tb) return;
    tb.replaceChildren(...COINS.filter((s) => S.coin[s] && S.coin[s].risk).map((sym) => {
      const o = S.coin[sym], k = o.risk; const ret = o.d1.slice(-366).slice(1).map((x, i, a) => (i ? x.close / a[i - 1].close - 1 : null)).filter((v) => v !== null);
      const sharpe = sd(ret) ? (ret.reduce((a, b) => a + b, 0) / ret.length) / sd(ret) * Math.sqrt(365) : NaN;
      const tr = el('tr'); tr.append(H.td(sym, 'sym'));
      [[H.f(k.beta, 2), ''], [H.f(k.corr, 2), ''], [H.f(k.vol30, 0) + '%', ''], [H.f(k.vol365, 0) + '%', ''], [H.f(k.atrPct, 2) + '%', ''], [pct(k.mdd, 1), 'cd-neg'], [pct(k.var95, 1), 'cd-neg'], [H.f(sharpe, 2), sgnCls(sharpe)], [k.score + '/10 · ' + k.label.toLowerCase(), ''], [k.levCap + '×', '']]
        .forEach(([t, c]) => tr.append(H.td(t, 'num ' + c)));
      return tr;
    }));
  };
  H.draw.corr = function () {
    const tb = document.getElementById('corr-table'); if (!tb) return;
    const have = COINS.filter((s) => S.coin[s] && S.coin[s].d1); if (have.length < 2) return;
    const maps = Object.fromEntries(have.map((s) => [s, H.retMap(S.coin[s].d1)]));
    const head = el('tr'); head.append(el('th', null, '90 hari')); have.forEach((s) => head.append(el('th', 'num', s)));
    const rows = have.map((a) => { const tr = el('tr'); tr.append(H.td(a, 'sym')); have.forEach((b) => { const [x, y] = H.aligned(maps[a], maps[b], 90); const c = a === b ? 1 : H.corr(x, y); const td = H.td(H.f(c, 2), 'num'); td.style.background = 'color-mix(in srgb, var(--cd-green) ' + Math.round(Math.max(0, c) * 28) + '%, transparent)'; tr.append(td); }); return tr; });
    const th = el('thead'); th.append(head); const tbd = el('tbody'); tbd.append(...rows); tb.replaceChildren(th, tbd);
  };

  /* ---------- 12-month performance chart (d3) ---------- */
  H.draw.perf = function () {
    const box = document.getElementById('perf-chart'); if (!box || !global.d3 || S.page !== 'ringkasan') return;
    const d3 = global.d3; const series = COINS.filter((s) => S.coin[s] && S.coin[s].d1).map((c) => { const r = S.coin[c].d1.slice(-366); const f = r[0].close; return { c, pts: r.map((x) => ({ d: new Date(x.time), v: (x.close / f) * 100 })) }; });
    if (!series.length) { if (Object.keys(S.coin).length >= COINS.length) H.fail(box); else H.skel(box); return; }
    box.classList.remove('dash-skeleton');
    const W = box.clientWidth || 640, Hh = 320; const all = series.flatMap((s) => s.pts.map((p) => p.v));
    const y0 = Math.floor((Math.min(...all) - 2) / 10) * 10, y1 = Math.ceil((Math.max(...all) + 2) / 10) * 10;
    box.replaceChildren(); const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${Hh}`).attr('role', 'img');
    const ends = series.map((s) => ({ c: s.c, v: s.pts[s.pts.length - 1].v })); ends.forEach((e) => { e.label = e.c + ' ' + pct(e.v - 100, 0); });
    svg.attr('aria-label', 'Kinerja 12 bulan, indeks awal = 100: ' + ends.map((e) => e.label).join(', '));
    const m = { t: 12, r: W < 520 ? 74 : 92, b: 26, l: 38 };
    const x = d3.scaleUtc(d3.extent(series[0].pts, (p) => p.d), [m.l, W - m.r]); const y = d3.scaleLinear([y0, y1], [Hh - m.b, m.t]);
    const g = svg.append('g'); const yt = y.ticks(6);
    g.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    g.append('g').selectAll('text').data(yt).join('text').attr('x', m.l - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => d);
    g.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(100)).attr('y2', y(100)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 4');
    g.append('g').selectAll('text').data(x.ticks(W < 520 ? 3 : 6)).join('text').attr('x', x).attr('y', Hh - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => C.BLN[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2));
    const line = d3.line().x((p) => x(p.d)).y((p) => y(p.v));
    series.forEach((s) => g.append('path').datum(s.pts).attr('d', line).attr('fill', 'none').attr('stroke', COL[s.c]).attr('stroke-width', s.c === 'BTC' ? 2.2 : 1.5).attr('stroke-dasharray', s.c === 'BNB' ? '7 3' : s.c === 'XRP' ? '2 3' : null));
    const sorted = ends.slice().sort((a, b) => b.v - a.v); let prev = -1e9; sorted.forEach((e) => { e.ly = Math.max(y(e.v), prev + 15); prev = e.ly; });
    sorted.forEach((e) => { g.append('circle').attr('cx', W - m.r).attr('cy', y(e.v)).attr('r', 3).attr('fill', COL[e.c]); g.append('text').attr('x', W - m.r + 8).attr('y', e.ly + 4).attr('font-size', 12).attr('fill', COL[e.c]).text(e.label); });
    const tip = box.querySelector('.cd-tip') || box.appendChild(el('div', 'cd-tip')); tip.hidden = true;
    const rule = g.append('line').attr('y1', m.t).attr('y2', Hh - m.b).attr('stroke', 'var(--cds-chart-axis)').attr('opacity', 0); const dates = series[0].pts.map((p) => p.d); const bis = d3.bisector((d) => d).center;
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', Math.max(0, W - m.l - m.r)).attr('height', Hh - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (ev) => { const [px, py] = d3.pointer(ev); const i = bis(dates, x.invert(px)); const dt = dates[i]; if (!dt) return; rule.attr('x1', x(dt)).attr('x2', x(dt)).attr('opacity', 1);
        tip.replaceChildren(el('div', 'd', tgl(dt.toISOString()))); series.map((s) => ({ c: s.c, p: s.pts.find((q) => +q.d === +dt) })).filter((o) => o.p).sort((a, b) => b.p.v - a.p.v).forEach((o) => { const r = el('div', 'r'); const n = el('span'); const sw = el('i'); sw.style.background = COL[o.c]; n.append(sw, o.c); r.append(n, el('span', null, o.p.v.toFixed(1))); tip.append(r); });
        tip.hidden = false; const sc = box.clientWidth / W; tip.style.left = Math.max(0, Math.min(box.clientWidth - 170, px * sc + 14)) + 'px'; tip.style.top = Math.max(0, py * sc - 10) + 'px'; })
      .on('pointerleave', () => { tip.hidden = true; rule.attr('opacity', 0); });
  };

  /* ---------- market tab ---------- */
  const MK = { sort: 'rank', dir: 1, q: '', filter: 'all', n: 50 };
  H.draw.market = function () {
    const tb = document.querySelector('#mkt-table tbody'); if (!tb || S.page !== 'pasar') return;
    const note = document.getElementById('mkt-note');
    if (!S.markets) { note.textContent = S.markets === null ? 'Data pasar belum bisa dimuat dari CoinGecko. Halaman mencoba lagi tiap menit.' : 'Memuat data pasar…'; return; }
    note.textContent = S.markets.rows.length + ' koin (tanpa stablecoin dan token bungkus) dari ' + S.markets.source + (S.markets.live ? ', live per ' : ', cuplikan ') + witaTime(S.markets.at) + '. Klik judul kolom untuk mengurutkan.';
    let rows = S.markets.rows.slice();
    const q = MK.q.trim().toLowerCase(); if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q));
    if (MK.filter === 'up') rows = rows.filter((r) => r.percent_change_24h > 0); else if (MK.filter === 'down') rows = rows.filter((r) => r.percent_change_24h < 0);
    else if (MK.filter === 'port') rows = rows.filter((r) => COINS.includes(r.symbol)); else if (MK.filter === 'ath') rows = rows.filter((r) => num(r.dd_ath) > -15);
    const key = MK.sort; const val = (r) => (key === 'volmc' ? r.volume / r.market_cap : num(r[key]));
    rows.sort((a, b) => { const x = val(a), y = val(b); if (!fin(x) && !fin(y)) return 0; if (!fin(x)) return 1; if (!fin(y)) return -1; return (x - y) * MK.dir; });
    const more = document.getElementById('mkt-more'); more.hidden = rows.length <= MK.n; more.textContent = 'Tampilkan ' + Math.min(rows.length, MK.n + 50) + ' dari ' + rows.length;
    tb.replaceChildren(...rows.slice(0, MK.n).map((r) => {
      const tr = el('tr'); const cell = el('a', 'cd-coin-cell'); cell.href = H.coinHref(r.id, r.symbol);
      if (r.image) { const im = el('img', 'cd-coin-logo'); im.src = r.image; im.alt = ''; im.loading = 'lazy'; im.width = 22; im.height = 22; cell.append(im); }
      const nm = el('span'); nm.append(el('span', 'nm', r.name), ' ', el('span', 'sy', r.symbol)); cell.append(nm); if (COINS.includes(r.symbol)) cell.append(el('span', 'cd-chip cd-chip-xs flat', 'porto'));
      const c2 = el('td'); c2.append(cell);
      const ch = (v, cls) => H.td(pct(v, 2), 'num ' + sgnCls(v) + (cls ? ' ' + cls : ''));
      const sp = el('td', 'num cd-hide-sm cd-sparkcell'); sp.append(H.spark(r.spark, 96, 28));
      const act = el('td', 'num'); const ra = el('span', 'cd-row-actions'); ra.append(C.link(H.chartHref(r.symbol, r.id), 'cd-link-sm strong', 'See chart')); act.append(ra);
      tr.append(H.td(r.rank || '—', 'num'), c2, H.td(usd(r.price), 'num'), ch(r.percent_change_1h, 'cd-hide-md'), ch(r.percent_change_24h), ch(r.percent_change_7d), ch(r.percent_change_30d, 'cd-hide-sm'),
        H.td(compact(r.market_cap), 'num cd-hide-sm'), H.td(compact(r.volume), 'num cd-hide-md'), H.td(r.market_cap ? H.f(r.volume / r.market_cap * 100) + '%' : '—', 'num cd-hide-md'), H.td(pct(r.dd_ath, 0), 'num cd-hide-md ' + sgnCls(r.dd_ath)), sp, act);
      return tr;
    }));
    document.querySelectorAll('#mkt-table .cd-sort').forEach((b) => b.setAttribute('aria-sort', b.dataset.sort === MK.sort ? (MK.dir > 0 ? 'ascending' : 'descending') : 'none'));
    drawBreadth();
  };
  function drawBreadth() {
    const rows = S.markets.rows.slice(0, 100).filter((r) => fin(num(r.percent_change_24h)));
    const bins = [['< −10%', (v) => v < -10], ['−10 s/d −5%', (v) => v >= -10 && v < -5], ['−5 s/d 0%', (v) => v >= -5 && v < 0], ['0 s/d +5%', (v) => v >= 0 && v < 5], ['+5 s/d +10%', (v) => v >= 5 && v < 10], ['> +10%', (v) => v >= 10]];
    const box = document.getElementById('breadth'); const mx = Math.max(1, ...bins.map(([, f]) => rows.filter((r) => f(r.percent_change_24h)).length));
    box.replaceChildren(...bins.map(([lab, f], i) => { const n = rows.filter((r) => f(r.percent_change_24h)).length; const d = el('div', 'cd-bar'); const tr = el('div', 'track'); const fl = el('div', 'fill' + (i < 3 ? ' neg' : '')); fl.style.left = '0'; fl.style.width = (n / mx * 100) + '%'; tr.append(fl); d.append(el('span', null, lab), tr, el('span', 'num', n + ' koin')); return d; }));
    const list = (id, arr) => { const b = document.getElementById(id); b.replaceChildren(...arr.map((r) => { const row = el('div', 'cd-list-row'); const a = el('a', 'cd-coin-cell'); a.href = H.coinHref(r.id, r.symbol); a.append(el('span', 'nm', r.name), el('span', 'sy', r.symbol)); const side = el('div', 'cd-list-side'); side.append(el('span', null, usd(r.price)), el('span', sgnCls(r.percent_change_24h), pct(r.percent_change_24h, 2))); row.append(a, side); return row; })); };
    const srt = rows.slice().sort((a, b) => b.percent_change_24h - a.percent_change_24h);
    list('gainers', srt.slice(0, 6)); list('losers', srt.slice(-6).reverse());
  }
  H.initMarket = function () {
    document.querySelectorAll('#mkt-table .cd-sort').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.sort; if (MK.sort === k) MK.dir *= -1; else { MK.sort = k; MK.dir = k === 'rank' ? 1 : -1; } H.draw.market(); }));
    const q = document.getElementById('mkt-q'); q.addEventListener('input', () => { MK.q = q.value; MK.n = 50; H.draw.market(); });
    document.querySelectorAll('#mkt-filter button').forEach((b) => b.addEventListener('click', () => { MK.filter = b.dataset.f; MK.n = 50; document.querySelectorAll('#mkt-filter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); H.draw.market(); }));
    document.getElementById('mkt-more').addEventListener('click', () => { MK.n += 50; H.draw.market(); });
  };

  /* ---------- trending & listings ---------- */
  H.draw.trending = function () {
    const box = document.getElementById('trend-list'); if (!box || S.page !== 'pasar') return;
    if (S.trending === undefined) { box.replaceChildren(el('div', 'cd-empty', 'Memuat…')); return; }
    if (!S.trending) { H.fail(box, 'Daftar tren CoinGecko belum bisa dimuat.'); return; }
    box.replaceChildren(...S.trending.slice(0, 12).map((c, i) => {
      const row = el('div', 'cd-list-row'); const main = el('div', 'cd-list-main'); main.append(el('span', 'cd-list-n', String(i + 1)));
      const a = el('a', 'cd-coin-cell'); a.href = H.coinHref(c.id, c.symbol); if (c.image) { const im = el('img', 'cd-coin-logo'); im.src = c.image; im.alt = ''; im.loading = 'lazy'; a.append(im); } a.append(el('span', 'nm', c.name), el('span', 'sy', c.symbol)); main.append(a);
      const side = el('div', 'cd-list-side'); side.append(el('span', 'cd-muted', c.rank ? '#' + c.rank : 'tanpa peringkat'), el('span', null, usd(c.price)), el('span', sgnCls(c.change_24h), pct(c.change_24h, 1)), C.link(H.chartHref(c.symbol, c.id), 'cd-link-sm strong', 'See chart'));
      row.append(main, side); return row;
    }));
  };
  let listKind = 'upcoming';
  H.draw.listings = function () {
    const box = document.getElementById('list-list'); if (!box || S.page !== 'pasar') return;
    const j = S.files.listings; if (j === undefined) { box.replaceChildren(el('div', 'cd-empty', 'Memuat…')); return; }
    if (!j) { H.fail(box, 'Data listing belum tersedia.'); return; }
    document.getElementById('list-stamp').textContent = 'diperbarui ' + C.ago(j.updated);
    const rows = (j[listKind] || []).slice(0, 18);
    if (!rows.length) { box.replaceChildren(el('div', 'cd-empty', listKind === 'upcoming' ? 'Belum ada pengumuman listing mendatang dari bursa yang dipantau.' : 'Belum ada listing baru dalam 14 hari terakhir.')); return; }
    box.replaceChildren(...rows.map((x) => {
      const row = el('div', 'cd-list-row cd-list-row-top'); const main = el('div', 'cd-list-main cd-list-col');
      const meta = el('div', 'cd-list-meta'); meta.append(el('span', 'src', x.exchange), ' · ', C.ago(x.date)); const href = C.safeUrl(x.url);
      main.append(meta, href ? C.link(href, 'cd-list-title', x.title, true) : el('span', 'cd-list-title', x.title));
      const side = el('div', 'cd-list-side'); (x.symbols || []).forEach((s) => side.append(C.link(H.chartHref(s), 'cd-chip', s)));
      row.append(main, side); return row;
    }));
  };
  H.initListings = function () { document.querySelectorAll('#list-seg button').forEach((b) => b.addEventListener('click', () => { listKind = b.dataset.kind; document.querySelectorAll('#list-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); H.draw.listings(); })); };

  H.loaders = { loadGlobal, loadMarkets, loadFng, loadCoin, loadDeriv };
})(window);
