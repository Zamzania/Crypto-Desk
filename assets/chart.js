/* Crypto Desk — full candlestick chart page ("See chart"). */
(function () {
  'use strict';
  const C = window.CDCore; const LW = window.LightweightCharts;
  const { el, num, usd, pct, fmtP, witaTime } = C;
  const TFL = { '15m': '15 menit', '1h': '1 jam', '4h': '4 jam', '1day': '1 hari', '1week': '1 minggu' };
  const BLN = C.BLN;
  const qs = new URLSearchParams(location.search);
  const P = { sym: (qs.get('s') || '').toUpperCase(), id: qs.get('id') || '', tf: TFL[qs.get('tf')] ? qs.get('tf') : '4h' };
  const IND = { ma20: false, ma50: true, ma200: true, ema21: false, levels: true, rsi: true };
  const status = document.getElementById('status');
  let markets = [], analystLevels = [], lastRows = [], reqId = 0;

  C.themeButton(document.getElementById('theme-btn'));
  if (!LW) { status.textContent = 'Library chart gagal dimuat. Coba muat ulang halaman.'; return; }

  /* ---------- charts ---------- */
  const mainEl = document.getElementById('chart-main'), rsiEl = document.getElementById('chart-rsi');
  const wita = (t) => new Date((t + 8 * 3600) * 1000);
  const p2 = (x) => String(x).padStart(2, '0');
  const timeFmt = (t) => { const d = wita(t); return d.getUTCDate() + ' ' + BLN[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + (P.tf === '1day' || P.tf === '1week' ? '' : ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes())); };
  const tickFmt = (t, type) => { const d = wita(t); if (type === 0) return String(d.getUTCFullYear()); if (type === 1) return BLN[d.getUTCMonth()]; if (type === 2) return d.getUTCDate() + ' ' + BLN[d.getUTCMonth()]; return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); };
  function baseOpts() {
    const v = (n) => C.cssVar(n);
    return {
      autoSize: true,
      layout: { background: { type: 'solid', color: v('--cd-paper') }, textColor: v('--cd-muted'), fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11 },
      grid: { vertLines: { color: v('--cds-chart-grid') }, horzLines: { color: v('--cds-chart-grid') } },
      rightPriceScale: { borderColor: v('--cd-rule') },
      timeScale: { borderColor: v('--cd-rule'), timeVisible: P.tf !== '1day' && P.tf !== '1week', secondsVisible: false, tickMarkFormatter: tickFmt, rightOffset: 6 },
      crosshair: { mode: LW.CrosshairMode.Normal, vertLine: { color: v('--cd-muted'), labelBackgroundColor: v('--cd-ink') }, horzLine: { color: v('--cd-muted'), labelBackgroundColor: v('--cd-ink') } },
      localization: { timeFormatter: timeFmt, priceFormatter: (p) => fmtP(p) },
    };
  }
  const main = LW.createChart(mainEl, baseOpts());
  const rsiChart = LW.createChart(rsiEl, Object.assign(baseOpts(), { rightPriceScale: { borderColor: C.cssVar('--cd-rule'), scaleMargins: { top: 0.1, bottom: 0.1 } } }));
  const candles = main.addCandlestickSeries({ priceLineVisible: true });
  const volume = main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  const lines = {
    ma20: main.addLineSeries({ lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
    ma50: main.addLineSeries({ lineWidth: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
    ma200: main.addLineSeries({ lineWidth: 2, lineStyle: LW.LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
    ema21: main.addLineSeries({ lineWidth: 1, lineStyle: LW.LineStyle.Dotted, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
  };
  const rsiLine = rsiChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lastValueVisible: true, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
  let rsiBands = [], levelLines = [];
  function applyColors() {
    const v = (n) => C.cssVar(n);
    main.applyOptions(baseOpts()); const ro = baseOpts(); ro.layout.attributionLogo = false; rsiChart.applyOptions(ro);
    candles.applyOptions({ upColor: 'rgba(0,0,0,0)', downColor: v('--cd-down'), borderUpColor: v('--cd-up'), borderDownColor: v('--cd-down'), wickUpColor: v('--cd-up'), wickDownColor: v('--cd-down') });
    lines.ma20.applyOptions({ color: v('--cd-green') }); lines.ma50.applyOptions({ color: v('--cd-brass') }); lines.ma200.applyOptions({ color: v('--cd-burgundy') }); lines.ema21.applyOptions({ color: v('--cd-navy') });
    rsiLine.applyOptions({ color: v('--cd-navy') });
    rsiBands.forEach((b) => rsiLine.removePriceLine(b));
    rsiBands = [30, 70].map((p) => rsiLine.createPriceLine({ price: p, color: v('--cd-muted'), lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: p === 70 ? 'jenuh beli' : 'jenuh jual' }));
    if (lastRows.length) setVolume(lastRows);
    drawLevels();
  }
  // Keep both panes on the same visible range and crosshair.
  let syncing = false;
  main.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (syncing || !r) return; syncing = true; rsiChart.timeScale().setVisibleLogicalRange(r); syncing = false; });
  rsiChart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (syncing || !r) return; syncing = true; main.timeScale().setVisibleLogicalRange(r); syncing = false; });

  /* ---------- legend ---------- */
  const legend = document.getElementById('legend');
  let byTime = new Map();
  function showLegend(row) {
    if (!row) { legend.replaceChildren(); return; }
    const up = row.close >= row.open;
    const item = (k, v, cls) => { const s = el('span', 'lg-i'); s.append(el('b', null, k), ' ', el('span', cls, v)); return s; };
    legend.replaceChildren(el('span', 'lg-t', witaTime(row.time)), item('B', fmtP(row.open)), item('T', fmtP(row.high)), item('R', fmtP(row.low)), item('Tp', fmtP(row.close), up ? 'cd-pos' : 'cd-neg'),
      item('Δ', pct((row.close / row.open - 1) * 100, 2), up ? 'cd-pos' : 'cd-neg'));
    if (IND.ma50 && row.sma50) legend.append(item('MA50', fmtP(row.sma50)));
    if (IND.ma200 && row.sma200) legend.append(item('MA200', fmtP(row.sma200)));
    if (IND.rsi && row.rsi14 !== null) legend.append(item('RSI', row.rsi14.toFixed(1)));
  }
  main.subscribeCrosshairMove((p) => {
    if (!p || p.time === undefined) { showLegend(lastRows[lastRows.length - 1]); rsiChart.clearCrosshairPosition(); return; }
    const row = byTime.get(p.time); showLegend(row);
    if (row && row.rsi14 !== null && IND.rsi) rsiChart.setCrosshairPosition(row.rsi14, p.time, rsiLine);
  });

  /* ---------- data ---------- */
  const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  function setVolume(rows) {
    const up = C.cssVar('--cd-up'), dn = C.cssVar('--cd-down');
    const hex = (c, a) => { const m = c.match(/^#([0-9a-f]{6})$/i); if (!m) return c; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
    volume.setData(rows.filter((r) => isFinite(r.volume)).map((r) => ({ time: ts(r.time), value: r.volume, color: hex(r.close >= r.open ? up : dn, 0.35) })));
  }
  function drawLevels() {
    levelLines.forEach((l) => candles.removePriceLine(l)); levelLines = [];
    if (!IND.levels || !lastRows.length) return;
    const v = (n) => C.cssVar(n);
    const auto = C.keyLevels(lastRows, { look: Math.min(lastRows.length, P.tf === '15m' ? 300 : 200), w: 4, max: 2 });
    const add = (price, title, sup, style) => levelLines.push(candles.createPriceLine({ price, color: sup ? v('--cd-up') : v('--cd-down'), lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    auto.supports.forEach((z) => add((z.lo + z.hi) / 2, 'S', true, LW.LineStyle.Dashed));
    auto.resistances.forEach((z) => add((z.lo + z.hi) / 2, 'R', false, LW.LineStyle.Dashed));
    if (P.tf !== '15m') analystLevels.filter((l) => l.coin === P.sym).forEach((l) => {
      const sup = /support/i.test(l.kind); add((num(l.low) + num(l.high)) / 2, (sup ? 'S' : 'R') + ' analis', sup, LW.LineStyle.Solid);
    });
  }
  function render(rows, fit) {
    const tech = C.techCalc(rows); lastRows = tech; byTime = new Map(tech.map((r) => [ts(r.time), r]));
    candles.setData(tech.map((r) => ({ time: ts(r.time), open: r.open, high: r.high, low: r.low, close: r.close })));
    setVolume(tech);
    const ln = (k) => tech.filter((r) => r[k] !== null && isFinite(r[k])).map((r) => ({ time: ts(r.time), value: r[k] }));
    lines.ma20.setData(ln('sma20')); lines.ma50.setData(ln('sma50')); lines.ma200.setData(ln('sma200')); lines.ema21.setData(ln('ema21'));
    rsiLine.setData(ln('rsi14'));
    Object.keys(lines).forEach((k) => lines[k].applyOptions({ visible: IND[k] }));
    rsiEl.hidden = !IND.rsi;
    drawLevels();
    if (fit) { const n = tech.length; main.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 160), to: n + 4 }); }
    showLegend(tech[tech.length - 1]);
    const s = C.summarize(tech); drawSummary(s);
    const last = tech[tech.length - 1];
    document.getElementById('last-price').textContent = usd(last.close);
  }
  function drawSummary(r) {
    const dl = document.getElementById('ind-list');
    document.getElementById('ind-title').textContent = 'Ringkasan lilin ' + TFL[P.tf] + ' terakhir';
    if (!r) { dl.replaceChildren(); return; }
    const f1 = (v) => (isFinite(num(v)) ? num(v).toFixed(1) : '—');
    const items = [['Waktu lilin', P.tf === '1day' || P.tf === '1week' ? C.tgl(r.time.slice(0, 10)) : witaTime(r.time)], ['Harga', usd(r.close)], ['Perubahan 24 lilin', pct(r.chg_24)], ['MA20', usd(r.sma20)], ['MA50', usd(r.sma50)], ['MA200', usd(r.sma200)],
      ['RSI 14', f1(r.rsi14)], ['Histogram MACD', fmtP(r.macd_hist)], ['ADX 14', f1(r.adx14)], ['ATR', isFinite(r.atr_pct) ? r.atr_pct.toFixed(2) + '%' : '—'], ['Tren', r.trend], ['Jangka pendek', r.short_term]];
    dl.replaceChildren(...items.map(([k, v]) => { const d = el('div'); d.append(el('dt', null, k), el('dd', null, v)); return d; }));
  }
  async function load(fit) {
    const my = ++reqId;
    if (!P.sym) { status.textContent = 'Pilih koin lewat kolom pencarian di atas.'; return; }
    status.hidden = false; status.textContent = 'Memuat lilin ' + P.sym + ' ' + TFL[P.tf] + '…';
    try {
      const r = await C.fetchCandles(P.sym, P.tf, 1000, P.id);
      if (my !== reqId) return;
      if (!r.rows.length) throw new Error('kosong');
      render(r.rows, fit);
      status.textContent = 'Lilin ' + P.sym + (r.source === 'Kraken' || r.source === 'CoinGecko' ? '/USD' : '/USDT') + ' dari ' + r.source + (r.synthetic ? ' (hanya harga penutupan harian; bentuk lilin disederhanakan)' : '') + ' · ' + r.rows.length + ' lilin · diperbarui ' + witaTime(new Date().toISOString());
    } catch (e) {
      if (my !== reqId) return;
      status.textContent = 'Lilin ' + P.sym + ' ' + TFL[P.tf] + ' tidak tersedia di bursa publik yang dipakai (Binance, OKX, Kraken). Koin yang sangat baru atau hanya ada di DEX sering belum punya data lilin.' + (P.tf !== '1day' && P.id ? ' Coba timeframe 1 hari.' : '');
      console.warn('candles', e);
    }
  }

  /* ---------- header & coin search ---------- */
  function setHeader(m) {
    document.getElementById('coin-sym').textContent = P.sym + (m && m.rank ? ' · #' + m.rank : '');
    document.getElementById('coin-name').textContent = (m ? m.name : P.sym) + ' · chart candlestick';
    document.title = (m ? m.name : P.sym) + ' (' + P.sym + ') · Chart · Crypto Desk';
    const img = document.getElementById('coin-img');
    if (m && m.image && C.safeUrl(m.image)) { img.src = m.image; img.hidden = false; }
    const chg = document.getElementById('last-chg');
    if (m && isFinite(num(m.percent_change_24h))) { chg.textContent = pct(m.percent_change_24h) + ' 24 jam'; chg.className = 'cd-chip ' + (m.percent_change_24h >= 0 ? 'up' : 'down'); } else chg.hidden = true;
    const cr = document.getElementById('crumb-coin');
    cr.textContent = (m ? m.name : P.sym); cr.href = 'coin.html?id=' + encodeURIComponent(P.id || '') + '&s=' + encodeURIComponent(P.sym);
  }
  function syncUrl() {
    const u = new URLSearchParams(); if (P.sym) u.set('s', P.sym); if (P.id) u.set('id', P.id); u.set('tf', P.tf);
    history.replaceState(null, '', location.pathname + '?' + u.toString());
  }
  document.getElementById('coin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('coin-input').value.trim(); if (!q) return;
    const ql = q.toLowerCase().replace(/\s*\(.*\)$/, '');
    const m = markets.find((x) => x.symbol.toLowerCase() === ql || x.name.toLowerCase() === ql) || markets.find((x) => x.name.toLowerCase().startsWith(ql));
    const sym = m ? m.symbol : q.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const id = m ? m.id : '';
    location.href = 'chart.html?s=' + encodeURIComponent(sym) + (id ? '&id=' + encodeURIComponent(id) : '') + '&tf=' + P.tf;
  });

  /* ---------- controls ---------- */
  function syncControls() {
    document.querySelectorAll('#tf-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === P.tf)));
    document.querySelectorAll('#ind-seg button').forEach((b) => b.setAttribute('aria-pressed', String(!!IND[b.dataset.ind])));
  }
  document.querySelectorAll('#tf-seg button').forEach((b) => b.addEventListener('click', () => {
    P.tf = b.dataset.tf; syncControls(); syncUrl();
    const tv = P.tf !== '1day' && P.tf !== '1week'; main.applyOptions({ timeScale: { timeVisible: tv } }); rsiChart.applyOptions({ timeScale: { timeVisible: tv } });
    load(true);
  }));
  document.querySelectorAll('#ind-seg button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.ind; IND[k] = !IND[k]; syncControls();
    if (lines[k]) lines[k].applyOptions({ visible: IND[k] });
    if (k === 'rsi') rsiEl.hidden = !IND.rsi;
    if (k === 'levels') drawLevels();
    showLegend(lastRows[lastRows.length - 1]);
  }));
  mainEl.addEventListener('dblclick', () => { const n = lastRows.length; main.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 160), to: n + 4 }); });
  document.addEventListener('cd-theme', applyColors);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyColors);

  /* ---------- boot ---------- */
  syncControls(); applyColors(); setHeader(null);
  C.getJSON('data/levels.json', 10000).then((l) => { analystLevels = l; drawLevels(); }).catch(() => {});
  C.fetchMarkets().then(async (mk) => {
    markets = mk.rows.filter(C.isAsset);
    const dl = document.getElementById('coin-list');
    dl.replaceChildren(...markets.map((m) => { const o = el('option'); o.value = m.symbol; o.label = m.name; return o; }));
    if (!P.sym && P.id) { const m = markets.find((x) => x.id === P.id); if (m) P.sym = m.symbol; }
    if (P.sym && !P.id) { const m = markets.find((x) => x.symbol === P.sym); if (m) P.id = m.id; }
    if (!P.sym) { P.sym = 'BTC'; P.id = 'bitcoin'; }
    let found = markets.find((x) => x.id === P.id) || markets.find((x) => x.symbol === P.sym);
    if (!found && P.sym) { try { const f = await C.searchCoin(P.sym); if (f) { found = f; if (!P.id) P.id = f.id; } } catch (e) { /* search unavailable */ } }
    syncUrl(); setHeader(found);
    if (!lastRows.length) load(true);
  }).catch(() => { if (!P.sym) { P.sym = 'BTC'; P.id = 'bitcoin'; } setHeader(null); if (!lastRows.length) load(true); });
  if (P.sym) load(true);
  setInterval(() => { if (!document.hidden && P.sym) C.fetchCandles(P.sym, P.tf, 1000, P.id).then((r) => { const keep = main.timeScale().getVisibleLogicalRange(); render(r.rows, false); if (keep) main.timeScale().setVisibleLogicalRange(keep); }).catch(() => {}); }, 60e3);
})();
