/* Crypto Desk — shared core for all pages: formatting, network, candles, indicators, coin universe, news. */
(function (global) {
  'use strict';
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const PORTFOLIO = ['BTC', 'ETH', 'XRP', 'SOL', 'BNB'];
  const PORTFOLIO_ID = { BTC: 'bitcoin', ETH: 'ethereum', XRP: 'ripple', SOL: 'solana', BNB: 'binancecoin' };
  // Stablecoins, wrapped and staked derivatives are not analysed as separate assets.
  const SKIP = new Set(['usdt', 'usdc', 'dai', 'fdusd', 'tusd', 'usde', 'usds', 'pyusd', 'usdd', 'usd1', 'busd', 'frax', 'gusd', 'lusd', 'eurc', 'rlusd', 'usdtb', 'usd0', 'susde', 'susds', 'bsc-usd', 'usdf', 'usdg', 'bfusd', 'syrupusdc',
    'wbtc', 'weth', 'steth', 'wsteth', 'weeth', 'cbbtc', 'reth', 'meth', 'jitosol', 'msol', 'bnsol', 'cbeth', 'lbtc', 'solvbtc', 'wbeth', 'rseth', 'ezeth', 'tbtc', 'btcb', 'clbtc', 'xsolvbtc', 'jupsol', 'wbnb', 'oseth', 'sweth', 'stkaave', 'wtrx', 'xaut', 'paxg']);
  const isAsset = (c) => c && !SKIP.has(String(c.symbol || '').toLowerCase()) && !/^(wrapped|bridged|staked|liquid staked)\b/i.test(c.name || '') && !/\b(usd|dollar)\b/i.test(c.name || '');

  /* ---------- formatting ---------- */
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const nf = (d) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtP = (v) => {
    v = num(v); if (!isFinite(v)) return '—'; const a = Math.abs(v);
    if (a >= 1000) return nf(0).format(v); if (a >= 10) return nf(2).format(v); if (a >= 1) return nf(4).format(v);
    if (a >= 0.01) return nf(5).format(v); if (a === 0) return '0';
    return v.toPrecision(4);
  };
  const usd = (v) => (isFinite(num(v)) ? '$' + fmtP(v) : '—');
  const pct = (v, d = 1) => { v = num(v); if (!isFinite(v)) return '—'; return (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d).format(Math.abs(v)) + '%'; };
  const compact = (v) => { v = num(v); if (!isFinite(v)) return '—'; return '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v); };
  const compactN = (v) => { v = num(v); if (!isFinite(v)) return '—'; return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v); };
  const sgnCls = (v) => (num(v) > 0 ? 'cd-pos' : num(v) < 0 ? 'cd-neg' : '');
  const tgl = (s) => { if (!s) return '—'; const d = new Date(String(s).length <= 10 ? s + 'T00:00:00Z' : s); if (isNaN(d)) return String(s); const w = new Date(d.getTime() + 8 * 3600e3); return w.getUTCDate() + ' ' + BLN[w.getUTCMonth()] + ' ' + w.getUTCFullYear(); };
  const witaTime = (iso) => { const d = new Date(iso); if (isNaN(d)) return '—'; const w = new Date(d.getTime() + 8 * 3600e3); const p2 = (x) => String(x).padStart(2, '0'); return w.getUTCDate() + ' ' + BLN[w.getUTCMonth()] + ' ' + p2(w.getUTCHours()) + ':' + p2(w.getUTCMinutes()) + ' WITA'; };
  const ago = (iso) => {
    const t = new Date(iso).getTime(); if (!isFinite(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' menit lalu';
    if (s < 86400) return Math.round(s / 3600) + ' jam lalu';
    if (s < 86400 * 14) return Math.round(s / 86400) + ' hari lalu';
    return tgl(iso);
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
  const link = (href, cls, text, external) => { const a = el('a', cls, text); a.href = href; if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; };
  const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch (e) { return null; } };
  const stripHtml = (s) => { const d = document.createElement('div'); d.innerHTML = String(s || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

  /* ---------- network ---------- */
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
  // Small session cache so moving between pages does not refetch everything (and keeps CoinGecko's rate limit happy).
  const cache = {
    get(k, maxAge) { try { const o = JSON.parse(sessionStorage.getItem('cd:' + k)); if (o && Date.now() - o.t < maxAge) return o.v; } catch (e) { /* storage unavailable */ } return null; },
    set(k, v) { try { sessionStorage.setItem('cd:' + k, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* quota or disabled */ } },
  };
  async function cached(key, maxAge, fn) { const hit = cache.get(key, maxAge); if (hit) return hit; const v = await fn(); cache.set(key, v); return v; }

  /* ---------- candles ---------- */
  // tf: '15m' | '1h' | '4h' | '1day' | '1week'
  const isoMs = (ms) => new Date(Number(ms)).toISOString();
  const kRow = (t, o, h, l, c, v) => ({ time: isoMs(t), open: +o, high: +h, low: +l, close: +c, volume: v === undefined ? null : +v });
  const BIN_TF = { '15m': '15m', '1h': '1h', '4h': '4h', '1day': '1d', '1week': '1w' };
  const OKX_TF = { '15m': '15m', '1h': '1H', '4h': '4H', '1day': '1Dutc', '1week': '1Wutc' };
  const KRK_TF = { '15m': 15, '1h': 60, '4h': 240, '1day': 1440, '1week': 10080 };
  const KRAKEN_SYM = { BTC: 'XBT' };
  function candleSources(sym, tf, limit, cgId) {
    const S = String(sym).toUpperCase();
    const list = [
      ['Binance', async () => (await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${S}USDT&interval=${BIN_TF[tf]}&limit=${Math.min(limit, 1000)}`)).map((k) => kRow(k[0], k[1], k[2], k[3], k[4], k[5]))],
      ['OKX', async () => { const j = await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${S}-USDT&bar=${OKX_TF[tf]}&limit=300`); if (j.code !== '0') throw new Error('OKX ' + j.msg); return j.data.map((k) => kRow(k[0], k[1], k[2], k[3], k[4], k[5])).reverse(); }],
      ['Kraken', async () => { const j = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${KRAKEN_SYM[S] || S}USD&interval=${KRK_TF[tf]}`); if (j.error && j.error.length) throw new Error(j.error.join(',')); const key = Object.keys(j.result || {}).find((k) => k !== 'last'); return (j.result[key] || []).map((k) => kRow(k[0] * 1000, k[1], k[2], k[3], k[4], k[6])).slice(-limit); }],
    ];
    if (cgId && tf === '1day') {
      // Last resort: CoinGecko daily closes (no true OHLC; high/low equal the close).
      list.push(['CoinGecko', async () => { const j = await getJSON(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(cgId)}/market_chart?vs_currency=usd&days=365&interval=daily`); const p = j.prices || []; const vol = new Map((j.total_volumes || []).map((x) => [x[0], x[1]])); return p.map((x, i) => { const o = i ? p[i - 1][1] : x[1]; return kRow(x[0], o, Math.max(o, x[1]), Math.min(o, x[1]), x[1], vol.get(x[0])); }); }]);
    }
    return list;
  }
  const memo = {};
  async function fetchCandles(sym, tf, limit, cgId) {
    const key = sym + '|' + tf + '|' + limit;
    const hit = memo[key];
    if (hit && Date.now() - hit.at < 55e3) return hit.v;
    const r = await firstOk(candleSources(sym, tf, limit, cgId));
    const rows = r.value.filter((x) => isFinite(x.close) && x.close > 0);
    const v = { rows, source: r.name, synthetic: r.name === 'CoinGecko' };
    memo[key] = { at: Date.now(), v };
    return v;
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
    // Bollinger band width (4σ / mid) for squeeze detection.
    const bw = c.map((_, i) => { if (i < 19) return null; const w = c.slice(i - 19, i + 1); const m = w.reduce((s, v) => s + v, 0) / 20; const sd = Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / 19); return m ? (4 * sd) / m * 100 : null; });
    return k.map((r, i) => ({ time: r.time, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, sma20: s20[i], sma50: s50[i], sma200: s200[i], ema21: e21[i],
      rsi14: i < 14 ? null : dn[i] === 0 ? 100 : 100 - 100 / (1 + up[i] / dn[i]), macd: macd[i], macd_signal: sig[i], macd_hist: i < 34 ? null : macd[i] - sig[i], atr14: atr[i], adx14: i < 28 ? null : adx[i], pdi: pdi[i], mdi: mdi[i], bbw: bw[i] }));
  }
  function summarize(tech) {
    if (!tech.length) return null;
    const r = tech[tech.length - 1], back = tech[Math.max(0, tech.length - 25)], b3 = tech[Math.max(0, tech.length - 4)];
    const trend = r.sma200 === null ? (r.sma50 === null ? 'Data kurang' : r.close > r.sma50 ? 'Naik (data pendek)' : 'Turun (data pendek)')
      : r.close < r.sma200 ? 'Turun' : r.close > r.sma50 && r.sma50 > r.sma200 && r.adx14 >= 20 && r.pdi > r.mdi ? 'Naik' : 'Menyamping';
    const short = r.sma20 === null ? 'Data kurang' : r.close < r.sma20 && r.close < r.ema21 ? 'Lemah' : r.close > r.sma20 && r.rsi14 > 55 ? 'Kuat' : 'Netral';
    const bwHist = tech.slice(-180).map((x) => x.bbw).filter((v) => v !== null);
    const bwPct = r.bbw !== null && bwHist.length > 30 ? (bwHist.filter((v) => v < r.bbw).length / bwHist.length) * 100 : null;
    const vols = tech.slice(-21, -1).map((x) => x.volume).filter((v) => isFinite(v) && v > 0);
    const volRatio = vols.length >= 10 && isFinite(r.volume) ? r.volume / (vols.reduce((s, v) => s + v, 0) / vols.length) : null;
    return { time: r.time, close: r.close, chg_24: (r.close / back.close - 1) * 100, sma20: r.sma20, ema21: r.ema21, sma50: r.sma50, sma200: r.sma200, rsi14: r.rsi14,
      macd_hist: r.macd_hist, macd_hist_prev: b3.macd_hist, adx14: r.adx14, pdi: r.pdi, mdi: r.mdi, atr_pct: (r.atr14 / r.close) * 100, bb_pctile: bwPct, vol_ratio: volRatio, trend, short_term: short, n: tech.length };
  }
  // Swing pivots (±w bars) over the last `look` candles, clustered into zones within `tol` (fraction).
  function keyLevels(candles, opts) {
    const o = Object.assign({ w: 4, look: 150, tol: 0.015, max: 3 }, opts || {});
    const k = candles.slice(-o.look); const n = k.length; if (n < o.w * 2 + 5) return { supports: [], resistances: [] };
    const piv = [];
    for (let i = o.w; i < n - o.w; i++) {
      const win = k.slice(i - o.w, i + o.w + 1);
      if (k[i].high === Math.max(...win.map((x) => x.high))) piv.push({ p: k[i].high, t: k[i].time, kind: 'high' });
      if (k[i].low === Math.min(...win.map((x) => x.low))) piv.push({ p: k[i].low, t: k[i].time, kind: 'low' });
    }
    const price = k[n - 1].close;
    piv.sort((a, b) => a.p - b.p);
    const zones = [];
    piv.forEach((x) => { const z = zones[zones.length - 1]; if (z && (x.p - z.lo) / z.lo <= o.tol) { z.hi = Math.max(z.hi, x.p); z.touches++; z.last = z.last > x.t ? z.last : x.t; } else zones.push({ lo: x.p, hi: x.p, touches: 1, last: x.t }); });
    const supports = zones.filter((z) => z.hi < price).sort((a, b) => b.hi - a.hi).slice(0, o.max);
    const resistances = zones.filter((z) => z.lo > price).sort((a, b) => a.lo - b.lo).slice(0, o.max);
    return { supports, resistances, price };
  }

  /* ---------- coin universe ---------- */
  async function fetchMarkets() {
    return cached('markets', 90e3, async () => {
      try {
        const a = await getJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1&price_change_percentage=24h,7d,30d,1y', 12000);
        return { source: 'CoinGecko', rows: a.map(mapCG), at: new Date().toISOString() };
      } catch (e) {
        const j = await getJSON('data/markets.json', 12000); // snapshot written by the scheduled collector
        return { source: 'CoinGecko (cuplikan ' + witaTime(j.updated) + ')', rows: j.rows, at: j.updated, stale: true };
      }
    });
  }
  function mapCG(x) {
    return { id: x.id, symbol: String(x.symbol || '').toUpperCase(), name: x.name, image: x.image, price: x.current_price, rank: x.market_cap_rank, market_cap: x.market_cap, fdv: x.fully_diluted_valuation,
      volume: x.total_volume, circ: x.circulating_supply, total: x.total_supply, max: x.max_supply, ath: x.ath, ath_date: x.ath_date, dd_ath: x.ath_change_percentage, atl: x.atl,
      high_24h: x.high_24h, low_24h: x.low_24h,
      percent_change_24h: x.price_change_percentage_24h_in_currency ?? x.price_change_percentage_24h, percent_change_7d: x.price_change_percentage_7d_in_currency,
      percent_change_30d: x.price_change_percentage_30d_in_currency, percent_change_1y: x.price_change_percentage_1y_in_currency, last_updated_time: x.last_updated };
  }
  async function fetchTrending() {
    return cached('trending', 300e3, async () => {
      const j = await getJSON('https://api.coingecko.com/api/v3/search/trending', 10000);
      return (j.coins || []).map((c) => c.item).map((i) => ({ id: i.id, symbol: String(i.symbol || '').toUpperCase(), name: i.name, image: i.small || i.thumb, rank: i.market_cap_rank,
        price: i.data && i.data.price, change_24h: i.data && i.data.price_change_percentage_24h && i.data.price_change_percentage_24h.usd }));
    });
  }
  async function searchCoin(sym) {
    return cached('search:' + sym, 3600e3, async () => {
      const j = await getJSON('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(sym), 10000);
      const exact = (j.coins || []).filter((c) => String(c.symbol).toUpperCase() === String(sym).toUpperCase());
      exact.sort((a, b) => (a.market_cap_rank || 1e9) - (b.market_cap_rank || 1e9));
      const c = exact[0]; return c ? { id: c.id, symbol: String(c.symbol).toUpperCase(), name: c.name, image: c.large || c.thumb, rank: c.market_cap_rank } : null;
    });
  }
  async function fetchCoinDetail(id) {
    return cached('coin:' + id, 600e3, async () => {
      const j = await getJSON(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`, 12000);
      const m = j.market_data || {};
      return {
        id: j.id, symbol: String(j.symbol || '').toUpperCase(), name: j.name, image: j.image && (j.image.large || j.image.small), rank: j.market_cap_rank,
        categories: (j.categories || []).filter(Boolean).slice(0, 6), genesis: j.genesis_date, hashing: j.hashing_algorithm,
        description: stripHtml(j.description && j.description.en).slice(0, 1400),
        homepage: (j.links && j.links.homepage || []).find(Boolean), whitepaper: j.links && j.links.whitepaper, explorer: (j.links && j.links.blockchain_site || []).find(Boolean),
        price: m.current_price && m.current_price.usd, market_cap: m.market_cap && m.market_cap.usd, fdv: m.fully_diluted_valuation && m.fully_diluted_valuation.usd, volume: m.total_volume && m.total_volume.usd,
        circ: m.circulating_supply, total: m.total_supply, max: m.max_supply, ath: m.ath && m.ath.usd, ath_date: m.ath_date && m.ath_date.usd, dd_ath: m.ath_change_percentage && m.ath_change_percentage.usd,
        atl: m.atl && m.atl.usd, atl_date: m.atl_date && m.atl_date.usd, high_24h: m.high_24h && m.high_24h.usd, low_24h: m.low_24h && m.low_24h.usd,
        percent_change_24h: m.price_change_percentage_24h, percent_change_7d: m.price_change_percentage_7d, percent_change_30d: m.price_change_percentage_30d, percent_change_1y: m.price_change_percentage_1y,
        last_updated_time: m.last_updated || j.last_updated,
      };
    });
  }

  /* ---------- news ---------- */
  // Primary: data/news.json from the scheduled collector. Fallback: live RSS via rss2json (CORS-enabled, keyless).
  const FEEDS = [['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'], ['Cointelegraph', 'https://cointelegraph.com/rss'], ['Decrypt', 'https://decrypt.co/feed']];
  async function fetchNews() {
    return cached('news', 600e3, async () => {
      try {
        const j = await getJSON('data/news.json?t=' + Math.floor(Date.now() / 600e3), 12000);
        if (!j.items || !j.items.length) throw new Error('kosong');
        return { items: j.items, updated: j.updated, source: 'collector' };
      } catch (e) {
        const res = await Promise.allSettled(FEEDS.map(async ([name, url]) => {
          const j = await getJSON('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url), 12000);
          if (j.status !== 'ok') throw new Error(name);
          return (j.items || []).map((it) => ({ title: stripHtml(it.title), link: it.link, source: name, published: new Date(String(it.pubDate).replace(' ', 'T') + 'Z').toISOString(), summary: stripHtml(it.description).slice(0, 260), image: it.thumbnail || (it.enclosure && it.enclosure.link) || null, coins: [] }));
        }));
        const items = res.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value).sort((a, b) => (a.published < b.published ? 1 : -1));
        if (!items.length) throw new Error('Berita gagal dimuat');
        return { items, updated: new Date().toISOString(), source: 'live' };
      }
    });
  }
  // Tag coins mentioned in a headline/summary. Names are matched case-insensitively; tickers only in upper case.
  const AMBIG = new Set(['ONE', 'NEAR', 'GAS', 'SUN', 'HOT', 'KEY', 'MASK', 'FUN', 'OM', 'S', 'IP', 'G', 'T', 'A', 'U', 'ME', 'MOVE', 'SAFE', 'TRUMP', 'BIO', 'ZK', 'AI', 'ACT', 'BAN', 'GO', 'ID', 'PEOPLE', 'JUP', 'W', 'APE', 'CAKE', 'RAY', 'WIN', 'ANT', 'DOG', 'POL', 'XAI', 'BEAM', 'CORE', 'PUMP', 'LINK', 'FLOW', 'ROSE', 'SAND', 'ICP', 'FIL', 'HBAR']);
  function tagCoins(items, coins) {
    const pats = coins.map((c) => {
      const nm = String(c.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sym = String(c.symbol).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { sym: c.symbol, rxName: String(c.name || '').length >= 3 ? new RegExp('\\b' + nm + '\\b', 'i') : null, rxSym: c.symbol.length >= 2 && !AMBIG.has(c.symbol) ? new RegExp('(^|[^A-Za-z0-9$])\\$?' + sym + '(?![A-Za-z0-9])') : new RegExp('\\$' + sym + '(?![A-Za-z0-9])') };
    });
    items.forEach((it) => {
      const text = (it.title || '') + ' ' + (it.summary || '');
      const tags = new Set(it.coins || []);
      pats.forEach((p) => { if ((p.rxName && p.rxName.test(text)) || p.rxSym.test(text)) tags.add(p.sym); });
      it.coins = Array.from(tags);
    });
    return items;
  }

  function newsCard(it) {
    const href = safeUrl(it.link);
    const a = href ? link(href, 'cd-news', null, true) : el('div', 'cd-news');
    const meta = el('div', 'cd-news-meta'); meta.append(el('span', 'src', it.source || ''), ' · ', el('span', null, ago(it.published)));
    a.append(meta, el('h3', 'cd-news-title', it.title));
    if (it.summary) a.append(el('p', 'cd-news-sum', it.summary.length > 220 ? it.summary.slice(0, 217).replace(/\s+\S*$/, '') + '…' : it.summary));
    const foot = el('div', 'cd-news-foot');
    (it.coins || []).slice(0, 5).forEach((s) => foot.append(el('span', 'cd-chip' + (PORTFOLIO.includes(s) ? ' flat' : ''), s)));
    foot.append(el('span', 'cd-news-read', 'Baca lengkap ↗'));
    a.append(foot);
    a.setAttribute('aria-label', (it.title || 'Berita') + ' — ' + (it.source || '') + ', buka di tab baru');
    return a;
  }

  /* ---------- theme ---------- */
  function themeButton(btn) {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const root = document.documentElement; const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', next);
      try { localStorage.setItem('cd-theme', next); } catch (e) { /* storage unavailable */ }
      document.dispatchEvent(new CustomEvent('cd-theme'));
    });
  }
  const cssVar = (name) => getComputedStyle(document.querySelector('.cd') || document.documentElement).getPropertyValue(name).trim();

  global.CDCore = { BLN, PORTFOLIO, PORTFOLIO_ID, isAsset, num, fmtP, usd, pct, compact, compactN, sgnCls, tgl, witaTime, ago, el, link, safeUrl, stripHtml,
    getJSON, firstOk, cache, cached, fetchCandles, techCalc, summarize, keyLevels, fetchMarkets, mapCG, fetchTrending, fetchCoinDetail, searchCoin, fetchNews, tagCoins, newsCard, themeButton, cssVar };
})(window);
