/* Crypto Desk — realtime prices.
 * Binance public market stream (miniTicker, pushes about once per second) with a REST polling fallback.
 * Any element with data-live="SYM" and data-live-field="price|chg|high|low|vol" is kept up to date. */
(function (global) {
  'use strict';
  const C = global.CDCore;
  const WS = 'wss://data-stream.binance.vision/stream?streams=';
  const REST = 'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=';
  const STRIP = ['BTC', 'ETH', 'XRP', 'SOL', 'BNB', 'DOGE', 'ADA', 'TRX', 'LINK', 'AVAX'];
  const state = { quotes: {}, syms: new Set(), ws: null, mode: 'off', tries: 0, poll: null, last: 0 };
  const subs = new Set();
  const statusSubs = new Set();
  const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function emit(sym) { subs.forEach((fn) => { try { fn(sym, state.quotes[sym]); } catch (e) { console.warn(e); } }); bind(sym); }
  function setMode(m) { state.mode = m; statusSubs.forEach((fn) => fn(m, state.last)); }
  function apply(sym, price, open, high, low, quoteVol, t) {
    const prev = state.quotes[sym];
    const q = { sym, price, open, high, low, vol: quoteVol, chg: open ? (price / open - 1) * 100 : NaN, time: t || Date.now(), dir: prev ? Math.sign(price - prev.price) : 0 };
    state.quotes[sym] = q; state.last = q.time; emit(sym);
  }

  function connect() {
    if (!state.syms.size) return;
    try { if (state.ws) state.ws.close(); } catch (e) { /* already closed */ }
    const streams = Array.from(state.syms).map((s) => s.toLowerCase() + 'usdt@miniTicker').join('/');
    let ws;
    try { ws = new WebSocket(WS + streams); } catch (e) { return startPolling(); }
    state.ws = ws;
    const guard = setTimeout(() => { if (state.mode !== 'ws') { try { ws.close(); } catch (e) { /* ignore */ } startPolling(); } }, 8000);
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data).data; if (!d || !d.s) return;
        clearTimeout(guard);
        if (state.mode !== 'ws') { stopPolling(); setMode('ws'); state.tries = 0; }
        apply(d.s.replace(/USDT$/, ''), +d.c, +d.o, +d.h, +d.l, +d.q, d.E);
      } catch (e) { /* malformed frame */ }
    };
    ws.onclose = () => {
      clearTimeout(guard);
      if (state.ws !== ws) return;
      state.tries++;
      // Keep prices flowing over REST while the stream reconnects; polling stops once a frame arrives.
      startPolling();
      if (state.tries > 4) return;
      if (!state.poll) setMode('reconnect');
      setTimeout(connect, Math.min(15000, 1000 * 2 ** state.tries));
    };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } };
  }
  async function pollOnce() {
    const syms = Array.from(state.syms).map((s) => '"' + s + 'USDT"');
    try {
      const arr = await C.getJSON(REST + encodeURIComponent('[' + syms.join(',') + ']'), 8000);
      arr.forEach((d) => apply(d.symbol.replace(/USDT$/, ''), +d.lastPrice, +d.openPrice, +d.highPrice, +d.lowPrice, +d.quoteVolume, d.closeTime));
      if (state.mode !== 'ws') setMode('poll');
    } catch (e) {
      // A symbol not listed on Binance makes the whole batch fail; retry one by one.
      await Promise.allSettled(Array.from(state.syms).map(async (s) => { const d = await C.getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=' + s + 'USDT', 8000); apply(s, +d.lastPrice, +d.openPrice, +d.highPrice, +d.lowPrice, +d.quoteVolume, d.closeTime); }));
      setMode(Object.keys(state.quotes).length ? 'poll' : 'off');
    }
  }
  function startPolling() { if (state.poll) return; if (state.mode !== 'ws') setMode('poll'); pollOnce(); state.poll = setInterval(pollOnce, 10000); }
  function stopPolling() { if (state.poll) { clearInterval(state.poll); state.poll = null; } }

  function watch(list) {
    const before = state.syms.size;
    list.forEach((s) => s && state.syms.add(String(s).toUpperCase()));
    if (state.syms.size === before && (state.ws || state.poll)) return;
    pollOnce();
    if (state.poll) return;
    connect();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.mode !== 'ws' && state.syms.size) { state.tries = 0; stopPolling(); connect(); } });

  /* ---------- DOM binding ---------- */
  const fmt = {
    price: (q) => C.usd(q.price), chg: (q) => C.pct(q.chg, 2), high: (q) => C.usd(q.high), low: (q) => C.usd(q.low), vol: (q) => C.compact(q.vol),
  };
  function bind(sym) {
    const q = state.quotes[sym]; if (!q) return;
    document.querySelectorAll('[data-live="' + sym + '"]').forEach((node) => {
      const f = node.dataset.liveField || 'price'; const txt = fmt[f] ? fmt[f](q) : '';
      if (node.textContent === txt) return;
      node.textContent = txt;
      if (f === 'chg') { node.classList.toggle('cd-pos', q.chg > 0); node.classList.toggle('cd-neg', q.chg < 0); }
      if (f === 'price' && !reduce && q.dir) { node.classList.remove('tick-up', 'tick-down'); void node.offsetWidth; node.classList.add(q.dir > 0 ? 'tick-up' : 'tick-down'); }
    });
  }

  /* ---------- ticker strip ---------- */
  function strip(box, list) {
    if (!box) return;
    list = list || STRIP;
    box.replaceChildren(...list.map((s) => {
      const a = C.el('a', 'cd-tick'); a.href = 'coin.html?s=' + s + (C.PORTFOLIO_ID[s] ? '&id=' + C.PORTFOLIO_ID[s] : '');
      const p = C.el('span', 'cd-tick-p', '—'); p.dataset.live = s; p.dataset.liveField = 'price';
      const c = C.el('span', 'cd-tick-c', ''); c.dataset.live = s; c.dataset.liveField = 'chg';
      a.append(C.el('span', 'cd-tick-s', s), p, c); a.setAttribute('aria-label', 'Detail ' + s);
      return a;
    }));
    watch(list);
  }
  function statusBadge(node) {
    if (!node) return;
    const txt = { ws: 'Realtime', poll: 'Diperbarui tiap 10 detik', reconnect: 'Menyambung ulang…', off: 'Harga live terputus' };
    const draw = (m) => { node.className = 'cd-live ' + (m === 'ws' ? '' : m === 'off' ? 'off' : 'wait'); node.lastChild.textContent = txt[m] || 'Memuat'; node.title = state.last ? 'Pembaruan terakhir ' + new Date(state.last).toLocaleTimeString('id-ID') : ''; };
    statusSubs.add(draw); draw(state.mode);
  }

  global.CDLive = {
    watch, strip, statusBadge, STRIP,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    onStatus(fn) { statusSubs.add(fn); return () => statusSubs.delete(fn); },
    get(sym) { return state.quotes[String(sym).toUpperCase()]; },
    mode() { return state.mode; },
    rebind() { Object.keys(state.quotes).forEach(bind); },
  };
})(window);
