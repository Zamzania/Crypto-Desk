/* Crypto Desk — public static site.
 * Live data is fetched in the visitor's browser from free, keyless public APIs, with fallbacks.
 * Analyst data (levels, theses, macro, ETF, ...) lives in /data/*.json and is updated by hand. */
(function () {
  'use strict';
  const COINS = ['BTC', 'ETH', 'XRP', 'SOL', 'BNB'];
  const NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', XRP: 'XRP', SOL: 'Solana', BNB: 'BNB' };
  const COL = { BTC: 'var(--cd-brass)', ETH: 'var(--cd-navy)', XRP: 'var(--cd-slate)', SOL: 'var(--cd-green)', BNB: 'var(--cd-burgundy)' };
  const CG_ID = { BTC: 'bitcoin', ETH: 'ethereum', XRP: 'ripple', SOL: 'solana', BNB: 'binancecoin' };
  const CP_ID = { BTC: 'btc-bitcoin', ETH: 'eth-ethereum', XRP: 'xrp-xrp', SOL: 'sol-solana', BNB: 'bnb-binance-coin' };
  const KRAKEN = { BTC: 'XBTUSD', ETH: 'ETHUSD', XRP: 'XRPUSD', SOL: 'SOLUSD', BNB: 'BNBUSD' };
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const TFL = { '1h': '1 jam', '4h': '4 jam', '1day': '1 hari' };
  const STATIC = ['meta', 'snapshot', 'levels', 'etf', 'derivatives', 'macro', 'events', 'theses', 'scenarios', 'fear_greed', 'analysis_log'];

  /* ---------- formatting ---------- */
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const fmtP = (v) => { v = num(v); if (isNaN(v)) return '—'; const a = Math.abs(v); return a >= 1000 ? d3.format(',.0f')(v) : a >= 10 ? d3.format(',.2f')(v) : d3.format(',.4f')(v); };
  const usd = (v) => (isNaN(num(v)) ? '—' : '$' + fmtP(v));
  const pct = (v, d = 1) => { v = num(v); if (isNaN(v)) return '—'; return (v > 0 ? '+' : v < 0 ? '−' : '') + d3.format('.' + d + 'f')(Math.abs(v)) + '%'; };
  const big = (v) => { v = num(v); if (isNaN(v)) return '—'; return (v < 0 ? '−' : v > 0 ? '+' : '') + '$' + Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(Math.abs(v)); };
  const bigAbs = (v) => { v = num(v); if (isNaN(v)) return '—'; return '$' + Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v); };
  const tgl = (s) => { if (!s) return '—'; const p = String(s).slice(0, 10).split('-'); return p.length < 3 ? s : (+p[2]) + ' ' + BLN[+p[1] - 1] + ' ' + p[0]; };
  const sgnCls = (v) => (num(v) > 0 ? 'cd-pos' : num(v) < 0 ? 'cd-neg' : '');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
  const failBox = (box, msg) => { box.classList.remove('dash-skeleton'); box.replaceChildren(el('div', 'cd-fail', msg || 'Data gagal dimuat. Coba muat ulang halaman.')); };
  const witaTime = (iso) => { const d = new Date(iso); if (isNaN(d)) return '—'; const w = new Date(d.getTime() + 8 * 3600e3); return w.getUTCDate() + ' ' + BLN[w.getUTCMonth()] + ' ' + d3.format('02')(w.getUTCHours()) + ':' + d3.format('02')(w.getUTCMinutes()) + ' WITA'; };

  /* ---------- tiny data store ---------- */
  const STORE = {};
  const D = (id) => STORE[id] || { status: 'loading', data: null };
  const ok = (id) => D(id).status === 'ok';
  const rowsOf = (id) => (ok(id) ? D(id).data || [] : []);
  let drawQueued = false;
  function put(id, status, data, extra) {
    STORE[id] = Object.assign({ status, data }, extra || {});
    derive();
    if (!drawQueued) { drawQueued = true; const run = () => { if (!drawQueued) return; drawQueued = false; draw(); }; requestAnimationFrame(run); setTimeout(run, 120); }
  }

  /* ---------- network helpers ---------- */
  async function getJSON(url, ms) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 9000);
    try {
      const r = await fetch(url, { signal: c.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  async function firstOk(tries) {
    let last;
    for (const [name, fn] of tries) {
      try { const v = await fn(); if (v && (v.length === undefined || v.length)) return { name, value: v }; last = new Error(name + ': kosong'); }
      catch (e) { last = e; }
    }
    throw last || new Error('Tidak ada sumber yang berhasil');
  }

  /* ---------- candles: Binance → Bybit → OKX → Kraken ---------- */
  const isoMs = (ms) => new Date(Number(ms)).toISOString();
  const kRow = (t, o, h, l, c) => ({ time: isoMs(t), open: +o, high: +h, low: +l, close: +c });
  const candleSources = (coin, tf, limit) => [
    ['Binance', async () => (await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${coin}USDT&interval=${tf === '1day' ? '1d' : tf}&limit=${limit}`)).map((k) => kRow(k[0], k[1], k[2], k[3], k[4]))],
    ['Binance', async () => (await getJSON(`https://api.binance.com/api/v3/klines?symbol=${coin}USDT&interval=${tf === '1day' ? '1d' : tf}&limit=${limit}`)).map((k) => kRow(k[0], k[1], k[2], k[3], k[4]))],
    ['Bybit', async () => { const j = await getJSON(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${coin}USDT&interval=${{ '1h': '60', '4h': '240', '1day': 'D' }[tf]}&limit=${Math.min(limit, 1000)}`); return j.result.list.map((k) => kRow(k[0], k[1], k[2], k[3], k[4])).reverse(); }],
    ['OKX', async () => { const j = await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${coin}-USDT&bar=${{ '1h': '1H', '4h': '4H', '1day': '1Dutc' }[tf]}&limit=300`); return j.data.map((k) => kRow(k[0], k[1], k[2], k[3], k[4])).reverse(); }],
    ['Kraken', async () => { const j = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${KRAKEN[coin]}&interval=${{ '1h': 60, '4h': 240, '1day': 1440 }[tf]}`); const key = Object.keys(j.result || {}).find((k) => k !== 'last'); return (j.result[key] || []).map((k) => kRow(k[0] * 1000, k[1], k[2], k[3], k[4])).slice(-limit); }],
  ];
  const candleCache = {};
  async function fetchCandles(coin, tf, limit) {
    const key = coin + '|' + tf + '|' + limit;
    const hit = candleCache[key];
    if (hit && Date.now() - hit.at < 55e3) return hit.v;
    const r = await firstOk(candleSources(coin, tf, limit));
    const v = { rows: r.value.filter((x) => isFinite(x.close)), source: r.name };
    candleCache[key] = { at: Date.now(), v };
    return v;
  }

  /* ---------- quotes: CoinGecko → CoinPaprika ---------- */
  async function fetchQuotes() {
    const r = await firstOk([
      ['CoinGecko', async () => {
        const a = await getJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + COINS.map((c) => CG_ID[c]).join(',') + '&price_change_percentage=24h,7d,30d,1y');
        return a.map((x) => ({ symbol: String(x.symbol).toUpperCase(), name: x.name, price: x.current_price, rank: x.market_cap_rank, market_cap: x.market_cap,
          percent_change_24h: x.price_change_percentage_24h_in_currency ?? x.price_change_percentage_24h, percent_change_7d: x.price_change_percentage_7d_in_currency,
          percent_change_30d: x.price_change_percentage_30d_in_currency, percent_change_1y: x.price_change_percentage_1y_in_currency, ath: x.ath, dd_ath: x.ath_change_percentage, last_updated_time: x.last_updated }));
      }],
      ['CoinPaprika', async () => Promise.all(COINS.map(async (c) => {
        const x = await getJSON('https://api.coinpaprika.com/v1/tickers/' + CP_ID[c]); const q = x.quotes.USD;
        return { symbol: c, name: NAMES[c], price: q.price, rank: x.rank, market_cap: q.market_cap, percent_change_24h: q.percent_change_24h, percent_change_7d: q.percent_change_7d,
          percent_change_30d: q.percent_change_30d, percent_change_1y: q.percent_change_1y, ath: q.ath_price, dd_ath: q.percent_from_price_ath, last_updated_time: x.last_updated };
      }))],
    ]);
    return { rows: r.value, source: r.name };
  }

  async function fetchFng() {
    const j = await getJSON('https://api.alternative.me/fng/?limit=30&format=json');
    return j.data.map((d) => ({ date: new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10), value: Number(d.value) })).reverse();
  }

  /* ---------- indicators ---------- */
  function techCalc(candles) {
    const k = candles.slice().sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    const c = k.map((r) => Number(r.close)), h = k.map((r) => Number(r.high)), l = k.map((r) => Number(r.low));
    const sma = (n) => { let s = 0; return c.map((v, i) => { s += v; if (i >= n) s -= c[i - n]; return i < n - 1 ? null : s / n; }); };
    const ema = (arr, n) => { const a = 2 / (n + 1); let e = null; return arr.map((v) => (e = e === null ? v : v * a + e * (1 - a))); };
    const wil = (arr, n) => { let e = null; return arr.map((v) => (e = e === null ? v : (e * (n - 1) + v) / n)); };
    const s20 = sma(20), s50 = sma(50), s200 = sma(200), e21 = ema(c, 21), e12 = ema(c, 12), e26 = ema(c, 26);
    const macd = c.map((_, i) => e12[i] - e26[i]), sig = ema(macd, 9);
    const d = c.map((v, i) => (i ? v - c[i - 1] : 0));
    const up = wil(d.map((x) => Math.max(x, 0)), 14), dn = wil(d.map((x) => Math.max(-x, 0)), 14);
    const tr = c.map((_, i) => (i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i]));
    const atr = wil(tr, 14);
    const pdm = c.map((_, i) => { const u = i ? h[i] - h[i - 1] : 0, w = i ? l[i - 1] - l[i] : 0; return u > w && u > 0 ? u : 0; });
    const mdm = c.map((_, i) => { const u = i ? h[i] - h[i - 1] : 0, w = i ? l[i - 1] - l[i] : 0; return w > u && w > 0 ? w : 0; });
    const pdi = wil(pdm, 14).map((v, i) => (atr[i] ? (100 * v) / atr[i] : 0)), mdi = wil(mdm, 14).map((v, i) => (atr[i] ? (100 * v) / atr[i] : 0));
    const adx = wil(pdi.map((v, i) => (v + mdi[i] ? (100 * Math.abs(v - mdi[i])) / (v + mdi[i]) : 0)), 14);
    return k.map((r, i) => ({ time: r.time, open: r.open, high: r.high, low: r.low, close: r.close, sma20: s20[i], sma50: s50[i], sma200: s200[i], ema21: e21[i],
      rsi14: i < 14 ? null : dn[i] === 0 ? 100 : 100 - 100 / (1 + up[i] / dn[i]), macd_hist: i < 34 ? null : macd[i] - sig[i], atr14: atr[i], adx14: i < 28 ? null : adx[i], pdi: pdi[i], mdi: mdi[i] }));
  }
  function summarize(tech) {
    if (!tech.length) return null;
    const r = tech[tech.length - 1], back = tech[Math.max(0, tech.length - 25)];
    const trend = r.sma200 === null ? 'Data kurang' : r.close < r.sma200 ? 'Turun' : r.close > r.sma50 && r.sma50 > r.sma200 && r.adx14 >= 20 && r.pdi > r.mdi ? 'Naik' : 'Menyamping';
    const short = r.close < r.sma20 && r.close < r.ema21 ? 'Lemah' : r.close > r.sma20 && r.rsi14 > 55 ? 'Kuat' : 'Netral';
    return { time: r.time, close: r.close, chg_24: (r.close / back.close - 1) * 100, sma20: r.sma20, ema21: r.ema21, sma50: r.sma50, sma200: r.sma200, rsi14: r.rsi14,
      macd_hist: r.macd_hist, adx14: r.adx14, atr_pct: (r.atr14 / r.close) * 100, trend, short_term: short };
  }
  const std = (a) => { const m = d3.mean(a); return Math.sqrt(d3.sum(a, (v) => (v - m) ** 2) / (a.length - 1)); };

  /* ---------- derived datasets ---------- */
  function derive() {
    // candles → tech, tech_now
    if (ok('candles')) {
      const t = techCalc(D('candles').data);
      STORE.tech = { status: 'ok', data: t };
      const s = summarize(t); STORE.tech_now = { status: 'ok', data: s ? [s] : [] };
    } else { STORE.tech = { status: D('candles').status }; STORE.tech_now = { status: D('candles').status }; }

    // daily → indexed perf + live risk stats; fallback to static prices.json
    const daily = D('daily');
    if (daily.status === 'ok') {
      const by = daily.data; const out = []; const stats = {};
      const btc = by.BTC ? new Map(by.BTC.map((r) => [r.time.slice(0, 10), r.close])) : null;
      COINS.forEach((c) => {
        const rows = by[c]; if (!rows || rows.length < 30) return;
        const last = rows.slice(-366); const f = last[0].close;
        last.forEach((r) => out.push({ date: r.time.slice(0, 10), coin: c, index: (r.close / f) * 100 }));
        const s = summarize(techCalc(rows)) || {};
        const ret = rows.slice(1).map((r, i) => r.close / rows[i].close - 1);
        const st = { coin: c, trend: s.trend, short_term: s.short_term, rsi14: s.rsi14, atr_pct: s.atr_pct, rvol30: std(ret.slice(-30)) * Math.sqrt(365) * 100 };
        if (btc) {
          const pairs = [];
          for (let i = Math.max(1, rows.length - 90); i < rows.length; i++) {
            const d0 = rows[i - 1].time.slice(0, 10), d1 = rows[i].time.slice(0, 10);
            if (btc.has(d0) && btc.has(d1)) pairs.push([btc.get(d1) / btc.get(d0) - 1, rows[i].close / rows[i - 1].close - 1]);
          }
          if (pairs.length > 20) {
            const bx = pairs.map((p) => p[0]), cy = pairs.map((p) => p[1]); const mx = d3.mean(bx), my = d3.mean(cy);
            const cov = d3.sum(pairs, (p) => (p[0] - mx) * (p[1] - my)) / (pairs.length - 1);
            st.beta = cov / std(bx) ** 2; st.corr = cov / (std(bx) * std(cy));
          }
        }
        stats[c] = st;
      });
      STORE.indexed = { status: out.length ? 'ok' : 'error', data: out, live: true };
      STORE.dstats = { status: 'ok', data: stats };
    } else if (daily.status === 'error') {
      if (ok('prices')) {
        const first = {};
        const out = rowsOf('prices').slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => { const c = Number(r.close); if (first[r.coin] === undefined) first[r.coin] = c; return { date: r.date, coin: r.coin, index: (c / first[r.coin]) * 100 }; });
        STORE.indexed = { status: 'ok', data: out, live: false };
      } else STORE.indexed = { status: D('prices').status === 'error' ? 'error' : 'loading' };
      STORE.dstats = { status: 'error' };
    } else { STORE.indexed = { status: 'loading' }; STORE.dstats = { status: 'loading' }; }
  }
  const liveStat = (c) => (ok('dstats') ? D('dstats').data[c] : null);
  const snap = (c) => rowsOf('snapshot').find((r) => r.coin === c);
  const quote = (c) => rowsOf('quotes').find((r) => r.symbol === c);

  /* ---------- state, routing ---------- */
  const qs = new URLSearchParams(location.search);
  const P = { coin: COINS.includes((qs.get('coin') || '').toUpperCase()) ? qs.get('coin').toUpperCase() : 'BTC', tf: TFL[qs.get('tf')] ? qs.get('tf') : '4h' };
  let page = 'ringkasan', nCandles = 200;
  const tabs = Array.from(document.querySelectorAll('.cd-tab'));
  const pages = Array.from(document.querySelectorAll('.cd-page'));
  function show(id, push) {
    if (!pages.some((p) => p.id === id)) return;
    page = id;
    tabs.forEach((t) => { t.setAttribute('aria-selected', String(t.dataset.page === id)); t.tabIndex = t.dataset.page === id ? 0 : -1; });
    pages.forEach((p) => { p.hidden = p.id !== id; p.classList.toggle('enter', p.id === id); });
    if (push !== false) history.replaceState(null, '', location.pathname + location.search + '#' + id);
    if (id === 'teknikal' && (!STORE.candles || STORE.candles.status === 'error')) loadCandles();
    draw();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.page));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n.dataset.page);
    });
  });
  function setParam(k, v) {
    P[k] = v;
    const u = new URLSearchParams(location.search); u.set('coin', P.coin); u.set('tf', P.tf);
    history.replaceState(null, '', location.pathname + '?' + u.toString() + location.hash);
    syncControls(); loadCandles();
  }
  document.querySelectorAll('#coin-seg button').forEach((b) => b.addEventListener('click', () => setParam('coin', b.dataset.coin)));
  document.querySelectorAll('#tf-seg button').forEach((b) => b.addEventListener('click', () => setParam('tf', b.dataset.tf)));
  document.querySelectorAll('#range-seg button').forEach((b) => b.addEventListener('click', () => {
    nCandles = +b.dataset.n;
    document.querySelectorAll('#range-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  }));
  function syncControls() {
    document.querySelectorAll('#coin-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.coin === P.coin)));
    document.querySelectorAll('#tf-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tf === P.tf)));
  }
  document.getElementById('theme-btn').addEventListener('click', () => {
    const root = document.documentElement; const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', next);
    try { localStorage.setItem('cd-theme', next); } catch (e) { /* storage unavailable */ }
  });

  /* ---------- loaders ---------- */
  let candleReq = 0;
  async function loadCandles() {
    const my = ++candleReq; const coin = P.coin, tf = P.tf;
    STORE.candles = { status: 'loading', data: null }; derive(); draw();
    try {
      const r = await fetchCandles(coin, tf, 600);
      if (my !== candleReq) return;
      put('candles', 'ok', r.rows, { source: r.source, coin, tf });
    } catch (e) { if (my === candleReq) put('candles', 'error', null, { error: String(e) }); console.warn('candles', e); }
  }
  async function loadQuotes() {
    try { const r = await fetchQuotes(); put('quotes', 'ok', r.rows, { source: r.source }); }
    catch (e) { if (!ok('quotes')) put('quotes', 'error', null, { error: String(e) }); console.warn('quotes', e); }
  }
  async function loadDaily() {
    const res = await Promise.allSettled(COINS.map((c) => fetchCandles(c, '1day', 400)));
    const by = {}; res.forEach((r, i) => { if (r.status === 'fulfilled') by[COINS[i]] = r.value.rows; });
    if (Object.keys(by).length && by.BTC) put('daily', 'ok', by);
    else { put('daily', 'error', null); }
  }
  async function loadFng() {
    try { put('fng_live', 'ok', await fetchFng()); } catch (e) { put('fng_live', 'error', null); }
  }
  async function loadStatic(id) {
    try { put(id, 'ok', await getJSON('data/' + id + '.json', 15000)); } catch (e) { put(id, 'error', null); console.warn(id, e); }
  }

  /* ---------- chart helpers ---------- */
  function measure(svg, texts, size) {
    const g = svg.append('g').attr('opacity', 0); let w = 0;
    texts.forEach((t) => { const n = g.append('text').attr('font-size', size).text(t).node(); w = Math.max(w, n.getComputedTextLength()); });
    g.remove(); return w;
  }
  function tipFor(box) { let t = box.querySelector('.cd-tip'); if (!t) { t = el('div', 'cd-tip'); t.hidden = true; box.appendChild(t); } return t; }
  function placeTip(tip, box, x, y) { const bw = box.clientWidth, tw = tip.offsetWidth || 160; tip.style.left = Math.max(0, Math.min(bw - tw, x + 14)) + 'px'; tip.style.top = Math.max(0, y - 10) + 'px'; }
  const skel = (box) => { box.classList.add('dash-skeleton'); box.replaceChildren(); };

  /* ---------- header ---------- */
  function drawHeader() {
    const tk = document.getElementById('takeaway'), asof = document.getElementById('asof'), live = document.getElementById('live');
    const meta = ok('meta') ? D('meta').data : {};
    document.getElementById('foot-updated').textContent = meta.updated ? tgl(meta.updated) : '—';
    document.querySelectorAll('[data-stamp]').forEach((s) => { s.textContent = meta.updated ? 'per ' + tgl(meta.updated) : ''; });
    const st = D('quotes').status;
    if (st === 'error') {
      asof.textContent = '—'; live.className = 'cd-live off'; live.lastChild.textContent = 'Harga live gagal dimuat';
      tk.replaceChildren('Harga live sedang tidak bisa dimuat. ', meta.headline || ''); return;
    }
    if (st !== 'ok') return;
    const rows = rowsOf('quotes'); const btc = rows.find((r) => r.symbol === 'BTC'); if (!btc) return;
    asof.textContent = witaTime(btc.last_updated_time);
    live.className = 'cd-live'; live.lastChild.textContent = 'Live · ' + D('quotes').source;
    const b = (txt) => el('b', null, txt);
    tk.replaceChildren('BTC di ', b(usd(btc.price)), ' (', b(pct(btc.percent_change_24h)), ' 24 jam');
    if (!isNaN(num(btc.percent_change_30d))) tk.append(', ', b(pct(btc.percent_change_30d)), ' 30 hari');
    tk.append('). ');
    const yr = rows.filter((r) => !isNaN(num(r.percent_change_1y))).sort((a, b2) => num(b2.percent_change_1y) - num(a.percent_change_1y));
    if (yr.length > 1) { const best = yr[0], worst = yr[yr.length - 1]; tk.append('Dalam setahun ', NAMES[best.symbol] || best.name, ' paling tahan (', b(pct(best.percent_change_1y)), ') dan ', NAMES[worst.symbol] || worst.name, ' paling dalam (', b(pct(worst.percent_change_1y)), '). '); }
    if (meta.headline) tk.append(meta.headline);
  }

  /* ---------- overview ---------- */
  function drawCoinCards() {
    const box = document.getElementById('coin-cards');
    const sq = D('quotes').status, ss = D('snapshot').status;
    if (sq === 'error' && ss === 'error') { failBox(box); return; }
    if (sq !== 'ok' && ss !== 'ok') { box.replaceChildren(...COINS.map(() => { const c = el('div', 'cd-card cd-coin dash-skeleton'); c.style.minHeight = '250px'; return c; })); return; }
    box.replaceChildren(...COINS.map((sym) => {
      const q = quote(sym), r = snap(sym), ls = liveStat(sym);
      const card = el('article', 'cd-card cd-coin'); card.id = 'coin-' + sym.toLowerCase(); card.style.setProperty('--coin', COL[sym]);
      const head = el('div', 'cd-coin-head');
      const nm = el('div'); nm.append(el('span', 'cd-coin-name', NAMES[sym]), ' ', el('span', 'cd-coin-sym', sym));
      head.append(nm); if (q && q.rank) head.append(el('span', 'cd-coin-sym', '#' + q.rank));
      card.append(head);
      if (q) {
        card.append(el('div', 'cd-price', usd(q.price)));
        const cap = el('div', 'cd-coin-sym'); cap.append('Kapitalisasi ', el('span', null, bigAbs(q.market_cap))); card.append(cap);
      } else if (sq === 'error' && r) { card.append(el('div', 'cd-price', usd(r.close))); card.append(el('div', 'cd-coin-sym', 'Penutupan ' + tgl(r.as_of) + ' (harga live gagal dimuat)')); }
      else card.append(el('div', 'cd-price dash-skeleton', '—'));
      const trend = ls && ls.trend ? ls.trend : r && r.trend, short = ls && ls.short_term ? ls.short_term : r && r.short_term;
      if (trend) {
        const chips = el('div', 'cd-chips');
        const tCls = trend === 'Naik' ? 'up' : trend === 'Turun' ? 'down' : 'flat';
        const sCls = short === 'Kuat' ? 'up' : short === 'Lemah' ? 'down' : 'flat';
        chips.append(el('span', 'cd-chip ' + tCls, 'Harian ' + String(trend).toLowerCase()), el('span', 'cd-chip ' + sCls, short));
        card.append(chips);
      }
      if (q) {
        const kv = el('dl', 'cd-kv');
        [['24 jam', 'percent_change_24h'], ['7 hari', 'percent_change_7d'], ['1 tahun', 'percent_change_1y']].forEach(([lab, f]) => {
          const d = el('div'); d.append(el('dt', null, lab), el('dd', sgnCls(q[f]), pct(q[f]))); kv.append(d);
        });
        card.append(kv);
      }
      if (r || q) {
        const foot = el('div', 'cd-coin-foot');
        const dd = q && !isNaN(num(q.dd_ath)) ? q.dd_ath : r && r.dd_ath; const rsi = ls && !isNaN(num(ls.rsi14)) ? ls.rsi14 : r && r.rsi14;
        const l1 = el('div'); l1.append('Dari ATH ', el('span', 'v', pct(dd)), ' · RSI harian ', el('span', 'v', isNaN(num(rsi)) ? '—' : d3.format('.0f')(num(rsi)))); foot.append(l1);
        if (r) {
          const l2 = el('div'); l2.append('Support ', el('span', 'v', usd(r.support_low)), '–', el('span', 'v', usd(r.support_high)));
          const l3 = el('div'); l3.append('Resistance ', el('span', 'v', usd(r.resist_low)), '–', el('span', 'v', usd(r.resist_high)));
          foot.append(l2, l3, el('div', null, r.note));
        }
        card.append(foot);
      }
      return card;
    }));
  }

  function drawPerf() {
    const box = document.getElementById('perf-chart');
    const st = D('indexed').status;
    if (st === 'error') { failBox(box); return; }
    if (st !== 'ok') { skel(box); return; }
    box.classList.remove('dash-skeleton');
    const rows = rowsOf('indexed').map((r) => ({ ...r, d: new Date(r.date + 'T00:00:00Z'), v: num(r.index) })).filter((r) => !isNaN(r.v));
    const series = COINS.map((c) => ({ c, pts: rows.filter((r) => r.coin === c) })).filter((s) => s.pts.length);
    if (!series.length) { failBox(box); return; }
    const firstD = d3.min(rows, (r) => r.date);
    document.getElementById('perf-note').textContent = 'Indeks harga penutupan harian, ' + tgl(firstD) + ' = 100' + (D('indexed').live ? ', dihitung dari lilin harian live' : ' (data tersimpan; lilin live gagal dimuat)') + '. Semua koin bergerak searah; selisihnya ditentukan beta terhadap BTC.';
    const W = box.clientWidth || 600, H = 320;
    box.replaceChildren();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img');
    const ends = series.map((s) => { const last = s.pts[s.pts.length - 1]; return { c: s.c, v: last.v, label: s.c + ' ' + pct(last.v - 100) }; });
    svg.attr('aria-label', 'Kinerja 12 bulan, indeks hari pertama = 100: ' + ends.map((e) => e.label).join(', '));
    const yExt = d3.extent(rows, (r) => r.v);
    const y0 = Math.floor((yExt[0] - 2) / 10) * 10, y1 = Math.ceil((yExt[1] + 2) / 10) * 10;
    const stepY = (y1 - y0) > 160 ? 40 : 20;
    const yTicks = d3.range(Math.ceil(y0 / stepY) * stepY, y1 + 1, stepY);
    const ml = measure(svg, yTicks.map(String), 11) + 10;
    const mr = measure(svg, ends.map((e) => e.label), 12) + 26;
    const m = { t: 12, r: mr, b: 26, l: ml };
    const x = d3.scaleUtc(d3.extent(rows, (r) => r.d), [m.l, W - m.r]);
    const y = d3.scaleLinear([y0, y1], [H - m.b, m.t]);
    const g = svg.append('g');
    g.append('g').selectAll('line').data(yTicks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    g.append('g').selectAll('text').data(yTicks).join('text').attr('x', m.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => d);
    g.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(100)).attr('y2', y(100)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 4');
    const xt = x.ticks(W < 520 ? 3 : 6);
    g.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => BLN[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2));
    const line = d3.line().x((p) => x(p.d)).y((p) => y(p.v));
    series.forEach((s) => g.append('path').datum(s.pts).attr('d', line).attr('fill', 'none').attr('stroke', COL[s.c]).attr('stroke-width', s.c === 'BTC' ? 2.2 : 1.6).attr('stroke-dasharray', s.c === 'BNB' ? '7 3' : s.c === 'XRP' ? '2 3' : null).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round'));
    const sorted = ends.slice().sort((a, b) => b.v - a.v); let prev = -1e9;
    sorted.forEach((e) => { e.ly = Math.max(y(e.v), prev + 16); prev = e.ly; });
    const lab = g.append('g');
    sorted.forEach((e) => {
      lab.append('circle').attr('cx', W - m.r).attr('cy', y(e.v)).attr('r', 3).attr('fill', COL[e.c]);
      lab.append('line').attr('x1', W - m.r + 4).attr('x2', W - m.r + 14).attr('y1', y(e.v)).attr('y2', e.ly).attr('stroke', 'var(--cds-chart-grid)');
      lab.append('text').attr('x', W - m.r + 18).attr('y', e.ly + 4).attr('font-size', 12).attr('fill', COL[e.c]).text(e.label);
    });
    const tip = tipFor(box); const rule = g.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-axis)').attr('opacity', 0);
    const dates = series[0].pts.map((p) => p.d); const bis = d3.bisector((d) => d).center;
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', Math.max(0, W - m.l - m.r)).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [px, py] = d3.pointer(ev); const i = bis(dates, x.invert(px)); const dt = dates[i]; if (!dt) return;
        rule.attr('x1', x(dt)).attr('x2', x(dt)).attr('opacity', 1);
        tip.replaceChildren(el('div', 'd', tgl(dt.toISOString())));
        series.map((s) => ({ c: s.c, p: s.pts.find((q) => +q.d === +dt) })).filter((o) => o.p).sort((a, b) => b.p.v - a.p.v).forEach((o) => {
          const r = el('div', 'r'); const n = el('span'); const sw = el('i'); sw.style.background = COL[o.c]; n.append(sw, o.c); r.append(n, el('span', null, d3.format('.1f')(o.p.v))); tip.append(r);
        });
        tip.hidden = false; placeTip(tip, box, px * box.clientWidth / W, py * box.clientWidth / W);
      })
      .on('pointerleave', () => { tip.hidden = true; rule.attr('opacity', 0); });
  }

  function drawRisk() {
    const tb = document.querySelector('#risk-table tbody');
    if (!ok('snapshot') && !ok('dstats')) { tb.replaceChildren(); return; }
    tb.replaceChildren(...COINS.map((c) => {
      const r = snap(c) || {}, ls = liveStat(c) || {}, q = quote(c) || {};
      const pick = (a, b) => (!isNaN(num(a)) ? a : b);
      const beta = c === 'BTC' ? 1 : pick(ls.beta, r.beta), corr = c === 'BTC' ? 1 : pick(ls.corr, r.corr);
      const dd = pick(q.dd_ath, r.dd_ath);
      const tr = el('tr');
      const f = (v, p, suf) => (isNaN(num(v)) ? '—' : d3.format(p)(num(v)) + (suf || ''));
      [[c, 'sym'], [f(beta, '.2f'), 'num'], [f(corr, '.2f'), 'num'], [f(pick(ls.rvol30, r.rvol30), '.1f', '%'), 'num'], [f(pick(ls.atr_pct, r.atr_pct), '.2f', '%'), 'num'], [pct(dd), 'num ' + sgnCls(dd)]].forEach(([t, cl]) => tr.append(el('td', cl, t)));
      return tr;
    }));
  }

  /* ---------- technical ---------- */
  const tickLabel = (d, tf) => { const w = new Date(d.getTime() + 8 * 3600e3); return tf === '1day' ? w.getUTCDate() + ' ' + BLN[w.getUTCMonth()] : w.getUTCDate() + ' ' + BLN[w.getUTCMonth()] + ' ' + d3.format('02')(w.getUTCHours()) + ':00'; };
  function techRows() {
    return rowsOf('tech').map((r) => ({ src: r, d: new Date(r.time), c: num(r.close), h: num(r.high), l: num(r.low), s50: num(r.sma50), s200: num(r.sma200), rsi: num(r.rsi14), mh: num(r.macd_hist) }))
      .filter((p) => !isNaN(p.d) && !isNaN(p.c));
  }
  function drawTech() {
    const coin = P.coin, tf = P.tf;
    document.getElementById('tech-title').textContent = NAMES[coin] + ' · ' + TFL[tf] + ': harga, rata-rata bergerak, dan zona kunci';
    const box = document.getElementById('tech-chart'), rbox = document.getElementById('rsi-chart'), mbox = document.getElementById('macd-chart');
    const st = D('candles').status;
    if (st === 'error') { [box, rbox, mbox].forEach((b, i) => (i ? b.replaceChildren() : failBox(b, 'Lilin live gagal dimuat dari semua bursa. Coba lagi sebentar.'))); return; }
    if (st !== 'ok') { [box, rbox, mbox].forEach(skel); return; }
    [box, rbox, mbox].forEach((b) => b.classList.remove('dash-skeleton'));
    document.getElementById('tech-note').textContent = 'Lilin live ' + coin + '/USDT dari ' + D('candles').source + ', waktu dalam WITA. Garis tipis: MA50 (kuningan) dan MA200 (burgundi). Pita hijau = zona support harian, pita merah anggur = zona resistance harian.';
    const pts = techRows().slice(-nCandles);
    if (!pts.length) { [box, rbox, mbox].forEach((b) => b.replaceChildren()); return; }
    const last = pts[pts.length - 1].c;
    const vals = pts.flatMap((p) => [p.h, p.l, p.s50, p.s200]).filter((v) => !isNaN(v));
    let lo = d3.min(vals), hi = d3.max(vals); const span = hi - lo;
    const lv = rowsOf('levels').filter((l) => l.coin === coin).map((l) => ({ lo: num(l.low), hi: num(l.high), kind: l.kind, sup: /support/i.test(l.kind) }))
      .filter((l) => l.hi >= lo - span * 0.15 && l.lo <= hi + span * 0.15);
    lv.forEach((l) => { lo = Math.min(lo, l.lo); hi = Math.max(hi, l.hi); });
    const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
    const W = box.clientWidth || 600, H = 320;
    box.replaceChildren();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Grafik lilin ' + coin + ' ' + TFL[tf] + ', harga terakhir ' + usd(last));
    const y = d3.scaleLinear([lo, hi], [H - 26, 12]).nice();
    const yt = y.ticks(5);
    const ml = measure(svg, yt.map((v) => usd(v)), 11) + 10;
    const mr = Math.min(W < 520 ? 96 : 170, measure(svg, lv.map((l) => l.kind).concat([usd(last)]), 11) + 18);
    const m = { t: 12, r: mr, b: 26, l: ml };
    const xb = d3.scaleBand(pts.map((p, i) => i), [m.l, W - m.r]).padding(0.25);
    const xc = (i) => xb(i) + xb.bandwidth() / 2;
    y.range([H - m.b, m.t]);
    const g = svg.append('g');
    g.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    g.append('g').selectAll('text').data(yt).join('text').attr('x', m.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => usd(d));
    const bands = g.append('g'); let prevY = -1e9;
    lv.slice().sort((a, b) => b.hi - a.hi).forEach((l) => {
      const yTop = y(Math.min(l.hi, hi)), yBot = y(Math.max(l.lo, lo)), hgt = Math.max(2, yBot - yTop);
      bands.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', yTop).attr('height', hgt).attr('fill', l.sup ? 'var(--cd-up-wash)' : 'var(--cd-down-wash)');
      const ly = Math.max(yTop + hgt / 2 + 4, prevY + 14); prevY = ly;
      const t = bands.append('text').attr('x', W - m.r + 8).attr('y', ly).attr('font-size', 11).attr('fill', l.sup ? 'var(--cd-up)' : 'var(--cd-down)').text(l.kind);
      const maxW = m.r - 10; if (t.node().getComputedTextLength() > maxW) t.text(l.sup ? 'Support' : 'Resistance');
    });
    const nT = W < 520 ? 3 : 6, step = Math.max(1, Math.floor(pts.length / nT));
    const tix = pts.map((p, i) => i).filter((i) => i % step === Math.floor(step / 2));
    g.append('g').selectAll('text').data(tix).join('text').attr('x', xc).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((i) => tickLabel(pts[i].d, W < 520 ? '1day' : tf));
    const cg = g.append('g');
    pts.forEach((p, i) => {
      const upC = num(p.src.close) >= num(p.src.open); const col = upC ? 'var(--cd-up)' : 'var(--cd-down)';
      cg.append('line').attr('x1', xc(i)).attr('x2', xc(i)).attr('y1', y(p.h)).attr('y2', y(p.l)).attr('stroke', col).attr('stroke-width', 1);
      const yo = y(num(p.src.open)), yc2 = y(p.c);
      cg.append('rect').attr('x', xb(i)).attr('width', Math.max(1, xb.bandwidth())).attr('y', Math.min(yo, yc2)).attr('height', Math.max(1, Math.abs(yo - yc2))).attr('fill', upC ? 'var(--cd-up)' : 'var(--cd-down)').attr('fill-opacity', upC ? 0.35 : 0.9).attr('stroke', col).attr('stroke-width', 0.8);
    });
    const mk = (key) => d3.line().defined((p) => !isNaN(p[key])).x((p, i) => xc(i)).y((p) => y(p[key]));
    g.append('path').datum(pts).attr('d', mk('s200')).attr('fill', 'none').attr('stroke', 'var(--cd-burgundy)').attr('stroke-width', 1.5).attr('stroke-dasharray', '6 3');
    g.append('path').datum(pts).attr('d', mk('s50')).attr('fill', 'none').attr('stroke', 'var(--cd-brass)').attr('stroke-width', 1.5);
    g.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(last)).attr('y2', y(last)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
    g.append('text').attr('x', W - m.r + 8).attr('y', Math.min(H - m.b, Math.max(m.t + 10, y(last) + 4))).attr('font-size', 11).attr('font-weight', 600).attr('fill', 'var(--cd-ink)').text(usd(last));

    const subChart = (sbox, label, key, opts) => {
      const RH = 150, rW = sbox.clientWidth || W; sbox.replaceChildren();
      const s = d3.select(sbox).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${rW} ${RH}`).attr('role', 'img');
      const rm = { t: 22, r: m.r, b: 10, l: m.l };
      const sx = d3.scaleBand(pts.map((p, i) => i), [rm.l, rW - rm.r]).padding(0.25); const sxc = (i) => sx(i) + sx.bandwidth() / 2;
      s.append('text').attr('x', rm.l).attr('y', 13).attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(label);
      const vv = pts.map((p) => p[key]).filter((v) => !isNaN(v)); if (!vv.length) return;
      const lastV = pts[pts.length - 1][key];
      s.attr('aria-label', label + ' ' + coin + ' ' + TFL[tf] + ', nilai terakhir ' + (opts.rsi ? d3.format('.1f')(lastV) : fmtP(lastV)));
      if (opts.rsi) {
        const sy = d3.scaleLinear([0, 100], [RH - rm.b, rm.t]);
        s.append('rect').attr('x', rm.l).attr('width', rW - rm.l - rm.r).attr('y', sy(70)).attr('height', sy(30) - sy(70)).attr('fill', 'var(--cd-brass-wash)');
        [30, 70].forEach((v) => { s.append('line').attr('x1', rm.l).attr('x2', rW - rm.r).attr('y1', sy(v)).attr('y2', sy(v)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
          s.append('text').attr('x', rm.l - 8).attr('y', sy(v) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(v); });
        s.append('path').datum(pts).attr('d', d3.line().defined((p) => !isNaN(p.rsi)).x((p, i) => sxc(i)).y((p) => sy(p.rsi))).attr('fill', 'none').attr('stroke', 'var(--cd-navy)').attr('stroke-width', 1.6);
        if (!isNaN(lastV)) s.append('text').attr('x', rW - rm.r + 8).attr('y', sy(lastV) + 4).attr('font-size', 11).attr('fill', 'var(--cd-navy)').text(d3.format('.1f')(lastV));
      } else {
        const mx = d3.max(vv, (v) => Math.abs(v)) || 1; const sy = d3.scaleLinear([-mx, mx], [RH - rm.b, rm.t]);
        s.append('line').attr('x1', rm.l).attr('x2', rW - rm.r).attr('y1', sy(0)).attr('y2', sy(0)).attr('stroke', 'var(--cds-chart-axis)');
        pts.forEach((p, i) => { if (isNaN(p.mh)) return; s.append('rect').attr('x', sx(i)).attr('width', Math.max(1, sx.bandwidth())).attr('y', Math.min(sy(0), sy(p.mh))).attr('height', Math.max(1, Math.abs(sy(p.mh) - sy(0)))).attr('fill', p.mh >= 0 ? 'var(--cd-up)' : 'var(--cd-down)').attr('fill-opacity', 0.75); });
        if (!isNaN(lastV)) s.append('text').attr('x', rW - rm.r + 8).attr('y', sy(lastV) + 4).attr('font-size', 11).attr('fill', lastV >= 0 ? 'var(--cd-up)' : 'var(--cd-down)').text(fmtP(lastV));
      }
    };
    subChart(rbox, 'RSI 14', 'rsi', { rsi: true });
    subChart(mbox, 'Histogram MACD (12, 26, 9)', 'mh', {});

    const tip = tipFor(box); const rule = g.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-axis)').attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', Math.max(0, W - m.l - m.r)).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [px, py] = d3.pointer(ev); const i = Math.max(0, Math.min(pts.length - 1, Math.round((px - m.l) / xb.step() - 0.5))); const p = pts[i]; if (!p) return;
        rule.attr('x1', xc(i)).attr('x2', xc(i)).attr('opacity', 1);
        tip.replaceChildren(el('div', 'd', witaTime(p.d.toISOString())));
        [['Buka', num(p.src.open)], ['Tinggi', p.h], ['Rendah', p.l], ['Tutup', p.c], ['MA50', p.s50], ['MA200', p.s200]].forEach(([k, v]) => { const r = el('div', 'r'); r.append(el('span', null, k), el('span', null, usd(v))); tip.append(r); });
        const rr = el('div', 'r'); rr.append(el('span', null, 'RSI 14'), el('span', null, isNaN(p.rsi) ? '—' : d3.format('.1f')(p.rsi))); tip.append(rr);
        tip.hidden = false; placeTip(tip, box, px * box.clientWidth / W, py * box.clientWidth / W);
      })
      .on('pointerleave', () => { tip.hidden = true; rule.attr('opacity', 0); });
  }

  function drawIndicators() {
    const dl = document.getElementById('ind-list');
    document.getElementById('ind-title').textContent = 'Indikator lilin ' + TFL[P.tf] + ' terakhir';
    if (!ok('tech_now')) { dl.replaceChildren(); return; }
    const r = rowsOf('tech_now')[0]; if (!r) { dl.replaceChildren(); return; }
    const f1 = (v) => (isNaN(num(v)) ? '—' : d3.format('.1f')(num(v)));
    const items = [['Waktu lilin', witaTime(r.time)], ['Harga', usd(r.close)], ['Perubahan 24 lilin', pct(r.chg_24)], ['MA20', usd(r.sma20)], ['EMA21', usd(r.ema21)],
      ['MA50', usd(r.sma50)], ['MA200', usd(r.sma200)], ['RSI 14', f1(r.rsi14)], ['Histogram MACD', fmtP(r.macd_hist)], ['ADX 14', f1(r.adx14)],
      ['ATR', isNaN(num(r.atr_pct)) ? '—' : d3.format('.2f')(num(r.atr_pct)) + '%'], ['Tren', r.trend], ['Jangka pendek', r.short_term]];
    dl.replaceChildren(...items.map(([lab, v]) => { const d = el('div'); d.append(el('dt', null, lab), el('dd', null, v)); return d; }));
  }

  function drawLevels() {
    const tb = document.querySelector('#lvl-table tbody');
    if (!ok('levels')) { tb.replaceChildren(); return; }
    const rows = rowsOf('levels').filter((l) => l.coin === P.coin).sort((a, b) => num(b.high) - num(a.high));
    tb.replaceChildren(...rows.map((l) => {
      const tr = el('tr'); const sup = /support/i.test(l.kind);
      tr.append(el('td', sup ? 'cd-pos' : 'cd-neg', l.kind), el('td', 'num', usd(l.low)), el('td', 'num', usd(l.high)), el('td', null, l.basis));
      return tr;
    }));
  }

  /* ---------- flows ---------- */
  function drawEtf() {
    const box = document.getElementById('etf-chart'); const tb = document.querySelector('#etf-table tbody');
    const st = D('etf').status;
    if (st === 'error') { failBox(box); tb.replaceChildren(); return; }
    if (st !== 'ok') { skel(box); tb.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const rows = rowsOf('etf');
    const asOf = rows.map((r) => r.as_of).filter(Boolean).sort().pop(); document.getElementById('etf-stamp').textContent = asOf ? 'per ' + tgl(asOf) : '';
    tb.replaceChildren(...rows.map((r) => {
      const tr = el('tr');
      tr.append(el('td', 'sym', r.asset), el('td', 'num', String(r.funds)), el('td', 'num', bigAbs(r.aum)), el('td', 'num ' + sgnCls(r.cum_flow), big(r.cum_flow)),
        el('td', 'num ' + sgnCls(r.flow_30d), big(r.flow_30d)), el('td', 'num ' + sgnCls(r.flow_10d), big(r.flow_10d)), el('td', null, r.note || ''));
      return tr;
    }));
    const W = box.clientWidth || 600, H = 200; box.replaceChildren();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Arus bersih ETF 30 hari: ' + rows.map((r) => r.asset + ' ' + big(r.flow_30d)).join(', '));
    const labels = rows.map((r) => big(r.flow_30d));
    const ml = measure(svg, rows.map((r) => r.asset), 12) + 14, mr = 12;
    const ext = d3.extent(rows.map((r) => num(r.flow_30d)).concat([0]));
    const lw = measure(svg, labels, 11) + 8;
    const x = d3.scaleLinear(ext, [ml + lw, W - mr - lw]).nice();
    const yb = d3.scaleBand(rows.map((r) => r.asset), [16, H - 10]).padding(0.35);
    svg.append('text').attr('x', ml).attr('y', 11).attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text('Arus bersih 30 hari');
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 16).attr('y2', H - 10).attr('stroke', 'var(--cds-chart-axis)');
    rows.forEach((r) => {
      const v = num(r.flow_30d), y0 = yb(r.asset), bh = Math.min(28, yb.bandwidth());
      svg.append('text').attr('x', ml - 10).attr('y', y0 + bh / 2 + 4).attr('text-anchor', 'end').attr('font-size', 12).attr('fill', 'var(--cd-ink)').text(r.asset);
      svg.append('rect').attr('x', Math.min(x(0), x(v))).attr('width', Math.max(1, Math.abs(x(v) - x(0)))).attr('y', y0).attr('height', bh).attr('rx', 2).attr('fill', v >= 0 ? 'var(--cd-up)' : 'var(--cd-down)').attr('fill-opacity', 0.85);
      svg.append('text').attr('x', v >= 0 ? x(v) + 6 : x(v) - 6).attr('y', y0 + bh / 2 + 4).attr('text-anchor', v >= 0 ? 'start' : 'end').attr('font-size', 11).attr('fill', v >= 0 ? 'var(--cd-up)' : 'var(--cd-down)').text(big(v));
    });
  }
  function drawDer() {
    const tb = document.querySelector('#der-table tbody');
    if (!ok('derivatives')) { tb.replaceChildren(); return; }
    const rows = rowsOf('derivatives'); const asOf = rows.map((r) => r.as_of).filter(Boolean).sort().pop();
    document.getElementById('der-stamp').textContent = asOf ? 'per ' + tgl(asOf) : '';
    tb.replaceChildren(...rows.map((r) => {
      const tr = el('tr');
      tr.append(el('td', 'sym', r.coin), el('td', 'num', d3.format('.4f')(num(r.funding_pct)) + '%'), el('td', 'num', bigAbs(r.oi)),
        el('td', 'num ' + sgnCls(r.whale_net_24h), r.whale_net_24h === null ? '—' : big(r.whale_net_24h)), el('td', null, r.note || ''));
      return tr;
    }));
  }

  /* ---------- macro ---------- */
  function drawMacro() {
    const box = document.getElementById('macro-cards'); const st = D('macro').status;
    if (st === 'error') { failBox(box); return; }
    if (st !== 'ok') { box.replaceChildren(); return; }
    box.replaceChildren(...rowsOf('macro').map((r) => {
      const c = el('div', 'cd-card'); c.id = 'macro-' + r.key;
      const cls = r.effect === 'Hambatan' ? 'down' : r.effect === 'Pendorong' ? 'up' : 'flat';
      const top = el('div', 'cd-coin-head'); top.append(el('span', 'cd-macro-label', r.label), el('span', 'cd-chip ' + cls, r.effect));
      c.append(top, el('div', 'cd-macro-value', r.display), el('div', 'cd-macro-note', r.note));
      return c;
    }));
  }
  function drawFng() {
    const box = document.getElementById('fng-chart');
    const live = ok('fng_live'); const src = live ? 'fng_live' : 'fear_greed';
    if (!live && D('fng_live').status !== 'error') { skel(box); return; }
    if (!ok(src)) { failBox(box); return; }
    box.classList.remove('dash-skeleton');
    const pts = rowsOf(src).map((r) => ({ d: new Date(r.date + 'T00:00:00Z'), v: num(r.value) })).filter((p) => !isNaN(p.v)).sort((a, b) => a.d - b.d);
    if (!pts.length) { failBox(box); return; }
    document.getElementById('fng-note').textContent = (live ? 'Live dari Alternative.me. ' : 'Data tersimpan (live gagal dimuat). ') + 'Garis putus-putus di 50 adalah netral. Sentimen serakah saat harga melemah berarti pasar belum kapitulasi.';
    const W = box.clientWidth || 500, H = 200; box.replaceChildren();
    const lp = pts[pts.length - 1]; const word = lp.v >= 55 ? ' Greed' : lp.v <= 45 ? ' Fear' : ' Netral';
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Fear and Greed 30 hari, terakhir ' + lp.v + word);
    const m = { t: 12, r: measure(svg, [String(lp.v) + ' Greed'], 12) + 14, b: 24, l: measure(svg, ['100'], 11) + 10 };
    const x = d3.scaleUtc(d3.extent(pts, (p) => p.d), [m.l, W - m.r]); const y = d3.scaleLinear([0, 100], [H - m.b, m.t]);
    [0, 25, 50, 75, 100].forEach((v) => { svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', v === 50 ? 'var(--cds-chart-reference)' : 'var(--cds-chart-grid)').attr('stroke-dasharray', v === 50 ? '4 4' : null);
      svg.append('text').attr('x', m.l - 8).attr('y', y(v) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(v); });
    x.ticks(W < 420 ? 3 : 5).forEach((d) => svg.append('text').attr('x', x(d)).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(d.getUTCDate() + ' ' + BLN[d.getUTCMonth()]));
    svg.append('path').datum(pts).attr('d', d3.line().x((p) => x(p.d)).y((p) => y(p.v))).attr('fill', 'none').attr('stroke', 'var(--cd-brass)').attr('stroke-width', 2).attr('stroke-linejoin', 'round');
    svg.append('circle').attr('cx', x(lp.d)).attr('cy', y(lp.v)).attr('r', 3.5).attr('fill', 'var(--cd-brass)');
    svg.append('text').attr('x', x(lp.d) + 8).attr('y', y(lp.v) + 4).attr('font-size', 12).attr('fill', 'var(--cd-brass)').text(lp.v + word);
  }
  function drawEvents() {
    const tb = document.querySelector('#events-table tbody');
    if (!ok('events')) { tb.replaceChildren(); return; }
    const rows = rowsOf('events').slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    tb.replaceChildren(...rows.map((r) => {
      const tr = el('tr'); const cls = r.impact === 'Tinggi' ? 'cd-neg' : r.impact === 'Sedang' ? '' : 'cd-pos';
      tr.append(el('td', null, r.window), el('td', null, r.event), el('td', cls, r.impact), el('td', null, r.why));
      return tr;
    }));
  }

  /* ---------- theses ---------- */
  function drawTheses() {
    const box = document.getElementById('thesis-cards'); const st = D('theses').status;
    if (st === 'error') { failBox(box); return; }
    if (st !== 'ok') { box.replaceChildren(); return; }
    box.replaceChildren(...rowsOf('theses').map((r) => {
      const c = el('article', 'cd-card cd-thesis'); c.id = 'thesis-' + String(r.coin).toLowerCase(); c.style.setProperty('--coin', COL[r.coin] || 'var(--cd-brass)');
      const h = el('h3'); h.append(el('span', null, NAMES[r.coin] || r.coin), el('span', 'cd-chip flat', r.role));
      const para = (lab, f, cls) => { const p = el('p', cls); p.append(el('span', 'lbl', lab), el('span', null, r[f])); return p; };
      c.append(h, para('Proyek', 'project'), para('Tesis', 'thesis'), para('Katalis', 'catalysts'), para('Risiko', 'risks'), para('Pembatal tesis', 'invalidation', 'inv'));
      return c;
    }));
  }
  function drawScen() {
    const tb = document.querySelector('#scen-table tbody');
    if (!ok('scenarios')) { tb.replaceChildren(); return; }
    const order = { Naik: 0, Dasar: 1, Turun: 2 };
    tb.replaceChildren(...rowsOf('scenarios').slice().sort((a, b) => (order[a.scenario] ?? 9) - (order[b.scenario] ?? 9)).map((r) => {
      const tr = el('tr'); const cls = r.scenario === 'Naik' ? 'cd-pos' : r.scenario === 'Turun' ? 'cd-neg' : '';
      tr.append(el('td', 'sym ' + cls, r.scenario), el('td', null, r.trigger), ...COINS.map((c) => el('td', 'num', r[c] || '—')), el('td', null, r.fail));
      return tr;
    }));
  }
  function drawLog() {
    const tb = document.querySelector('#log-table tbody');
    if (!ok('analysis_log')) { tb.replaceChildren(); return; }
    tb.replaceChildren(...rowsOf('analysis_log').slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => {
      const tr = el('tr');
      tr.append(el('td', null, tgl(r.date)), el('td', null, r.title), el('td', null, r.kind), el('td', null, r.verdict));
      return tr;
    }));
  }

  function draw() {
    if (document.documentElement.clientWidth < 200) return; // transient collapsed layout (e.g. tab closing)
    drawHeader();
    if (page === 'ringkasan') { drawCoinCards(); drawPerf(); drawRisk(); }
    if (page === 'teknikal') { syncControls(); drawTech(); drawIndicators(); drawLevels(); }
    if (page === 'arus') { drawEtf(); drawDer(); }
    if (page === 'makro') { drawMacro(); drawFng(); drawEvents(); }
    if (page === 'tesis') { drawTheses(); drawScen(); }
    if (page === 'arsip') { drawLog(); }
  }

  /* ---------- boot ---------- */
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - lastW) > 20) { lastW = window.innerWidth; draw(); } });
  STATIC.forEach(loadStatic);
  loadStatic('prices');
  loadQuotes(); loadDaily(); loadFng();
  const named = location.hash.slice(1);
  if (named && pages.some((p) => p.id === named)) show(named, false); else draw();
  setInterval(() => {
    if (document.hidden) return;
    loadQuotes();
    if (page === 'teknikal') loadCandlesQuiet();
  }, 60e3);
  async function loadCandlesQuiet() {
    const my = candleReq; const coin = P.coin, tf = P.tf;
    try { const r = await fetchCandles(coin, tf, 600); if (my === candleReq && coin === P.coin && tf === P.tf) put('candles', 'ok', r.rows, { source: r.source, coin, tf }); } catch (e) { /* keep last good candles */ }
  }
})();
