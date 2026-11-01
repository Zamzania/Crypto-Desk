/* Crypto Desk — home page, part 2: technicals, derivatives & flows, macro & calendar, theses & scenarios, news, method, boot. */
(function (global) {
  'use strict';
  const H = global.CDH; const { C, A, T, L, COINS, NAMES, COL, S, fin } = H;
  const { el, usd, pct, num, compact, tgl, witaTime, sgnCls } = C;

  /* ================= technicals ================= */
  const TFL = { '15m': '15 menit', '1h': '1 jam', '4h': '4 jam', '1day': '1 hari', '1week': '1 minggu' };
  const qs = new URLSearchParams(location.search);
  const TK = { sym: COINS.includes((qs.get('coin') || '').toUpperCase()) ? qs.get('coin').toUpperCase() : 'BTC', tf: TFL[qs.get('tf')] ? qs.get('tf') : '4h', rows: null, src: '', chart: null, req: 0 };
  const toTs = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  function ensureChart() {
    if (TK.chart || !global.LightweightCharts) return TK.chart;
    const LW = global.LightweightCharts; const v = C.cssVar;
    const base = () => ({ layout: { background: { type: 'solid', color: v('--cd-paper') }, textColor: v('--cd-muted'), fontFamily: 'Source Sans 3, system-ui, sans-serif', attributionLogo: false },
      grid: { vertLines: { color: v('--cds-chart-grid') || v('--cd-rule') }, horzLines: { color: v('--cds-chart-grid') || v('--cd-rule') } }, rightPriceScale: { borderColor: v('--cd-rule') }, timeScale: { borderColor: v('--cd-rule'), timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 }, localization: { locale: 'id-ID', timeFormatter: (t) => witaTime(new Date(t * 1000).toISOString()) } });
    const main = LW.createChart(document.getElementById('tk-main'), Object.assign(base(), { autoSize: true }));
    const rsi = LW.createChart(document.getElementById('tk-rsi'), Object.assign(base(), { autoSize: true }));
    const candles = main.addCandlestickSeries({ priceLineVisible: true });
    const vol = main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const mk = () => main.addLineSeries({ lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const lines = { ma50: mk(), ma200: mk(), ema21: mk() };
    const rsiLine = rsi.addLineSeries({ lineWidth: 1.5, priceLineVisible: false });
    TK.chart = { main, rsi, candles, vol, lines, rsiLine, plines: [], theme() {
      main.applyOptions(base()); rsi.applyOptions(base());
      candles.applyOptions({ upColor: 'rgba(0,0,0,0)', downColor: v('--cd-down'), borderUpColor: v('--cd-up'), borderDownColor: v('--cd-down'), wickUpColor: v('--cd-up'), wickDownColor: v('--cd-down') });
      lines.ma50.applyOptions({ color: v('--cd-brass') }); lines.ma200.applyOptions({ color: v('--cd-burgundy'), lineStyle: 2 }); lines.ema21.applyOptions({ color: v('--cd-navy') }); rsiLine.applyOptions({ color: v('--cd-navy') });
    } };
    TK.chart.theme();
    let syncing = false;
    main.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (syncing || !r) return; syncing = true; rsi.timeScale().setVisibleLogicalRange(r); syncing = false; });
    document.addEventListener('cd-theme', () => { TK.chart.theme(); drawTkChart(); });
    return TK.chart;
  }
  function drawTkChart() {
    const ch = ensureChart(); const status = document.getElementById('tk-status');
    if (!ch) { status.textContent = 'Pustaka chart gagal dimuat.'; return; }
    if (!TK.rows) { status.textContent = TK.err ? 'Lilin gagal dimuat dari semua bursa. Mencoba lagi otomatis.' : 'Memuat lilin…'; return; }
    const v = C.cssVar; const tech = C.techCalc(TK.rows);
    ch.candles.setData(tech.map((r) => ({ time: toTs(r.time), open: r.open, high: r.high, low: r.low, close: r.close })));
    ch.vol.setData(tech.filter((r) => fin(r.volume)).map((r) => ({ time: toTs(r.time), value: r.volume, color: r.close >= r.open ? 'rgba(44,90,65,.35)' : 'rgba(140,46,59,.35)' })));
    const line = (k) => tech.filter((r) => r[k] !== null && fin(r[k])).map((r) => ({ time: toTs(r.time), value: r[k] }));
    ch.lines.ma50.setData(line('sma50')); ch.lines.ma200.setData(line('sma200')); ch.lines.ema21.setData(line('ema21')); ch.rsiLine.setData(line('rsi14'));
    ch.plines.forEach((p) => { try { ch.candles.removePriceLine(p); } catch (e) { /* gone */ } }); ch.plines = [];
    const lv = A.levels(TK.rows, TK.tf === '15m' ? '1h' : TK.tf === '1week' ? '1day' : TK.tf);
    lv.supports.slice(0, 3).forEach((z, i) => ch.plines.push(ch.candles.createPriceLine({ price: (z.lo + z.hi) / 2, color: v('--cd-up'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'S' + (i + 1) })));
    lv.resistances.slice(0, 3).forEach((z, i) => ch.plines.push(ch.candles.createPriceLine({ price: (z.lo + z.hi) / 2, color: v('--cd-down'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'R' + (i + 1) })));
    if (!ch.rsiBands) { ch.rsiBands = [70, 30].map((p) => ch.rsiLine.createPriceLine({ price: p, color: v('--cd-rule-strong'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false })); }
    if (!TK.fitted) { const n = tech.length; ch.main.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 160), to: n + 4 }); TK.fitted = true; }
    status.textContent = NAMES[TK.sym] + ' ' + TFL[TK.tf] + ' · ' + TK.rows.length + ' lilin dari ' + TK.src + ' · harga lilin terakhir diperbarui realtime. Garis putus-putus S/R = zona otomatis dari titik balik harga.';
    TK.lv = lv; TK.tech = tech;
  }
  async function loadTk(quiet) {
    const my = ++TK.req; const sym = TK.sym, tf = TK.tf;
    if (!quiet) { TK.rows = null; TK.err = false; TK.fitted = false; drawTkChart(); }
    try { const r = await C.fetchCandles(sym, tf, 1000, tf === '1day' ? C.PORTFOLIO_ID[sym] : null); if (my !== TK.req) return; TK.rows = r.rows; TK.src = r.source; }
    catch (e) { if (my === TK.req) { TK.err = true; } }
    if (my === TK.req) { drawTkChart(); H.draw.tkPanels(); }
  }
  L.on((sym, q) => {
    if (sym !== TK.sym || !TK.rows || !TK.chart || S.page !== 'teknikal') return;
    const last = TK.rows[TK.rows.length - 1]; if (!last || !fin(q.price)) return;
    last.close = q.price; last.high = Math.max(last.high, q.price); last.low = Math.min(last.low, q.price);
    TK.chart.candles.update({ time: toTs(last.time), open: last.open, high: last.high, low: last.low, close: last.close });
  });
  function stochRsi(tech, n) { const r = tech.map((x) => x.rsi14).filter((x) => x !== null); if (r.length < n + 3) return null; const k = []; for (let i = n - 1; i < r.length; i++) { const w = r.slice(i - n + 1, i + 1); const lo = Math.min(...w), hi = Math.max(...w); k.push(hi - lo ? ((r[i] - lo) / (hi - lo)) * 100 : 50); } const sm = (a, m) => a.map((_, i) => (i < m - 1 ? null : a.slice(i - m + 1, i + 1).reduce((x, y) => x + y, 0) / m)); const K = sm(k, 3), D = sm(K.filter((x) => x !== null), 3); return { k: K[K.length - 1], d: D[D.length - 1] }; }
  function pctB(rows) { const c = rows.slice(-20).map((r) => r.close); if (c.length < 20) return null; const m = c.reduce((a, b) => a + b) / 20; const s = Math.sqrt(c.reduce((a, b) => a + (b - m) ** 2, 0) / 19); return s ? { b: ((c[19] - (m - 2 * s)) / (4 * s)) * 100, up: m + 2 * s, lo: m - 2 * s, mid: m } : null; }
  H.draw.tkPanels = function () {
    if (S.page !== 'teknikal') return;
    document.getElementById('tk-title').textContent = NAMES[TK.sym] + ' · ' + TFL[TK.tf];
    const fc = document.getElementById('tk-full'); fc.href = H.chartHref(TK.sym, C.PORTFOLIO_ID[TK.sym], TK.tf);
    const dc = document.getElementById('tk-detail'); dc.href = H.coinHref(C.PORTFOLIO_ID[TK.sym], TK.sym);
    // multi-timeframe table
    const o = S.coin[TK.sym] || {}; const tb = document.querySelector('#tk-mtf tbody');
    tb.replaceChildren(...[['1 minggu', o.w1], ['1 hari', o.d1], ['4 jam', o.h4], ['1 jam', o.h1]].map(([lab, rows]) => {
      const r = A.mtfRow(lab, rows); const tr = el('tr'); tr.append(H.td(lab, 'sym'));
      if (r.na) { tr.append(el('td', null, 'Data belum tersedia')); return tr; }
      const s = r.S; const t = el('td'); t.append(el('span', 'cd-chip ' + H.trendCls(s.trend), s.trend));
      tr.append(t, H.td(s.short_term), H.td(H.f(s.rsi14, 0), 'num'), H.td(s.macd_hist === null ? '—' : (s.macd_hist > 0 ? 'Positif' : 'Negatif') + (s.macd_hist_prev !== null && Math.abs(s.macd_hist) > Math.abs(s.macd_hist_prev) ? ', menguat' : ', melemah')),
        H.td(pct(r.vs50), 'num ' + sgnCls(r.vs50)), H.td(pct(r.vs200), 'num ' + sgnCls(r.vs200)), H.td(H.f(s.adx14, 0), 'num'), H.td(H.f(s.atr_pct, 2) + '%', 'num'));
      return tr;
    }));
    // indicator panel for the selected timeframe
    const dl = document.getElementById('tk-ind');
    if (!TK.rows || !TK.tech) { dl.replaceChildren(); return; }
    const s = C.summarize(TK.tech); const sr = stochRsi(TK.tech, 14); const bb = pctB(TK.rows); const pat = A.candlePattern(TK.rows); const dv = A.divergence(TK.tech); const mc = A.maCross(TK.tech); const ob = A.obv(TK.rows);
    const vs = (ma) => (ma ? pct((s.close / ma - 1) * 100) + ' dari harga' : '');
    dl.replaceChildren(
      H.dd('Harga', usd(s.close), 'Perubahan 24 lilin ' + pct(s.chg_24)),
      H.dd('RSI 14', H.f(s.rsi14), s.rsi14 > 70 ? 'Jenuh beli' : s.rsi14 < 30 ? 'Jenuh jual' : s.rsi14 >= 50 ? 'Momentum di sisi pembeli' : 'Momentum di sisi penjual'),
      H.dd('Stochastic RSI', sr ? H.f(sr.k, 0) + ' / ' + H.f(sr.d, 0) : '—', sr ? (sr.k > 80 ? 'Area atas, rawan koreksi pendek' : sr.k < 20 ? 'Area bawah, rawan pantulan' : 'Tengah') : ''),
      H.dd('Histogram MACD', C.fmtP(s.macd_hist), s.macd_hist > 0 ? 'Di atas nol' : 'Di bawah nol'),
      H.dd('ADX 14', H.f(s.adx14, 0), (s.adx14 >= 25 ? 'Tren kuat' : s.adx14 >= 20 ? 'Tren mulai terbentuk' : 'Tanpa tren jelas') + ', +DI ' + H.f(s.pdi, 0) + ' / −DI ' + H.f(s.mdi, 0)),
      H.dd('ATR 14', H.f(s.atr_pct, 2) + '%', 'Rata-rata rentang per lilin'),
      H.dd('Bollinger %B', bb ? H.f(bb.b, 0) : '—', bb ? 'Pita ' + usd(bb.lo) + '–' + usd(bb.up) : ''),
      H.dd('Lebar Bollinger', s.bb_pctile === null ? '—' : 'Persentil ' + H.f(s.bb_pctile, 0), s.bb_pctile !== null && s.bb_pctile < 20 ? 'Menyempit: sering mendahului gerakan besar' : ''),
      H.dd('Volume vs rata-rata 20', s.vol_ratio === null ? '—' : H.f(s.vol_ratio, 2) + '×', s.vol_ratio > 1.5 ? 'Volume tinggi' : s.vol_ratio !== null && s.vol_ratio < 0.7 ? 'Volume sepi' : ''),
      H.dd('MA20 / MA50 / MA200', usd(s.sma50), 'MA20 ' + vs(s.sma20) + '; MA50 ' + vs(s.sma50) + '; MA200 ' + vs(s.sma200)),
      H.dd('Pola lilin terakhir', pat ? pat.name : '—', pat ? pat.txt : '', pat && pat.sig ? (pat.sig > 0 ? 'cd-pos' : 'cd-neg') : null),
      H.dd('Divergensi RSI', dv ? dv.name : '—', dv ? dv.txt : '', dv && dv.sig ? (dv.sig > 0 ? 'cd-pos' : 'cd-neg') : null),
      H.dd('Persilangan MA50/200', mc ? mc.name : '—', mc ? mc.txt : '', mc && mc.sig ? (mc.sig > 0 ? 'cd-pos' : 'cd-neg') : null),
      H.dd('On-Balance Volume', ob ? ob.name : '—', ob ? ob.txt : '', ob && ob.sig ? (ob.sig > 0 ? 'cd-pos' : 'cd-neg') : null));
    // levels
    const lt = document.querySelector('#tk-lv tbody'); const lv = TK.lv; const price = H.priceOf(TK.sym) || s.close;
    const rowLv = (z, kind, i) => { const tr = el('tr'); const mid = (z.lo + z.hi) / 2; tr.append(H.td(kind + (i + 1), kind === 'R' ? 'cd-neg' : 'cd-pos'), H.td(usd(z.lo) + ' – ' + usd(z.hi), 'num'), H.td(pct((mid / price - 1) * 100), 'num ' + sgnCls(mid - price)), H.td(String(z.touches || '—'), 'num'), H.td(z.last ? C.ago(z.last) : '—')); return tr; };
    lt.replaceChildren(...(lv ? lv.resistances.slice(0, 4).map((z, i) => rowLv(z, 'R', i)).reverse().concat(lv.supports.slice(0, 4).map((z, i) => rowLv(z, 'S', i))) : []));
    // trade plan summary
    const box = document.getElementById('tk-plan'); const tfP = TK.tf === '15m' ? null : TK.tf === '1week' ? null : TK.tf;
    if (!tfP) { box.replaceChildren(el('p', 'cd-card-note', 'Rencana trading tersedia untuk timeframe 1 jam, 4 jam, dan 1 hari.')); return; }
    const htf = { '1h': o.h4, '4h': o.d1, '1day': o.w1 }[tfP]; const m = H.mkt(TK.sym) || {};
    let p = null; try { p = T.plan(TK.rows, tfP, { ath: m.ath, atl: m.atl, htfRows: htf, htfLevels: o.lvD, deriv: S.deriv[TK.sym] }); } catch (e) { console.warn(e); }
    if (!p || !p.setups) { box.replaceChildren(el('p', 'cd-card-note', 'Data belum cukup untuk menyusun rencana.')); return; }
    const t = el('table', 'cd-table'); const th = el('thead'); const hr = el('tr'); ['Skenario', 'Status', 'Entry', 'Stop loss', 'TP1', 'TP2', 'R:R TP2', 'Konfluensi'].forEach((x, i) => hr.append(el('th', i > 1 ? 'num' : null, x))); th.append(hr);
    const tbd = el('tbody'); p.setups.slice().sort((a, b) => b.conf.score - a.conf.score).forEach((su) => {
      const tr = el('tr'); const nm = el('td'); nm.append(el('span', 'cd-side ' + (su.side > 0 ? 'long' : 'short'), su.side > 0 ? 'LONG' : 'SHORT'), ' ', su.name);
      tr.append(nm, H.td(su.status ? su.status.txt : '—'), H.td(su.entryLo !== su.entryHi ? usd(su.entryLo) + '–' + usd(su.entryHi) : usd(su.entry), 'num'), H.td(usd(su.sl), 'num cd-neg'), H.td(su.tps[0] ? usd(su.tps[0].p) : '—', 'num cd-pos'), H.td(su.tps[1] ? usd(su.tps[1].p) : '—', 'num cd-pos'), H.td(su.tps[1] ? H.f(su.tps[1].rr, 2) : '—', 'num'), H.td(su.conf.score + '/100', 'num'));
      tbd.append(tr);
    });
    t.append(th, tbd); const wrap = el('div', 'cd-table-box'); wrap.append(t);
    box.replaceChildren(wrap, el('p', 'cd-card-note', 'Disusun otomatis dengan aturan yang sama untuk semua koin. Uji historis, leverage wajar, perkiraan likuidasi, dan kalkulator posisi ada di halaman analisis lengkap.'));
  };
  H.initTk = function () {
    const sync = () => { document.querySelectorAll('#tk-coin button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.coin === TK.sym))); document.querySelectorAll('#tk-tf button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === TK.tf))); };
    const setP = () => { const u = new URLSearchParams(location.search); u.set('coin', TK.sym); u.set('tf', TK.tf); history.replaceState(null, '', location.pathname + '?' + u + location.hash); sync(); loadTk(); };
    document.querySelectorAll('#tk-coin button').forEach((b) => b.addEventListener('click', () => { TK.sym = b.dataset.coin; setP(); }));
    document.querySelectorAll('#tk-tf button').forEach((b) => b.addEventListener('click', () => { TK.tf = b.dataset.tf; setP(); }));
    sync();
  };
  H.tk = { load: loadTk, state: TK };

  /* ================= derivatives & ETF ================= */
  H.draw.deriv = function () {
    const tb = document.querySelector('#der-table tbody'); if (!tb || S.page !== 'arus') return;
    const rows = COINS.map((s) => S.deriv[s]).filter(Boolean);
    if (!rows.length) { tb.replaceChildren(); return; }
    tb.replaceChildren(...rows.map((d) => {
      const f = d.funding * 100; const next = fin(d.nextFunding) ? Math.max(0, d.nextFunding - Date.now()) : NaN;
      const tr = el('tr'); tr.append(H.td(d.sym, 'sym'), H.td(pct(f, 4), 'num ' + (f > 0.03 ? 'cd-neg' : f < 0 ? 'cd-pos' : '')), H.td(pct(f * 3 * 365, 1), 'num'),
        H.td(fin(next) ? Math.floor(next / 3600e3) + ' j ' + Math.floor((next % 3600e3) / 60e3) + ' m' : '—', 'num'), H.td(compact(d.oiUsd), 'num'), H.td(pct(d.oiChg1d, 1), 'num ' + sgnCls(d.oiChg1d)), H.td(pct(d.oiChg7d, 1), 'num ' + sgnCls(d.oiChg7d)),
        H.td(H.f(d.lsr, 2), 'num'), H.td(fin(d.takerBuy) ? H.f(d.takerBuy, 1) + '%' : '—', 'num ' + (d.takerBuy > 52 ? 'cd-pos' : d.takerBuy < 48 ? 'cd-neg' : '')), H.td(derivRead(d)));
      return tr;
    }));
    const st = document.getElementById('der-stamp'); st.textContent = 'live ' + witaTime(new Date(Math.max(...rows.map((r) => r.at || 0))).toISOString());
    drawFundChart();
  };
  function derivRead(d) {
    const out = []; const f = d.funding * 100; const pChg = H.retOver(S.coin[d.sym] && S.coin[d.sym].d1, 1, H.priceOf(d.sym));
    if (fin(f)) out.push(f > 0.05 ? 'Funding sangat tinggi: long berdesakan, rawan flush turun.' : f > 0.03 ? 'Funding tinggi: long mulai ramai.' : f < -0.01 ? 'Funding negatif: short ramai, rawan short squeeze.' : 'Funding wajar.');
    if (fin(d.oiChg1d) && fin(pChg)) out.push(pChg > 0 && d.oiChg1d > 0 ? 'Harga naik + OI naik: posisi baru masuk mengikuti kenaikan.' : pChg > 0 && d.oiChg1d < 0 ? 'Harga naik + OI turun: kenaikan didorong penutupan short.' : pChg < 0 && d.oiChg1d > 0 ? 'Harga turun + OI naik: short baru menekan harga.' : pChg < 0 && d.oiChg1d < 0 ? 'Harga turun + OI turun: posisi long dilepas (deleveraging).' : '');
    if (fin(d.lsr)) out.push(d.lsr > 2 ? 'Mayoritas akun ritel long (rasio ' + d.lsr.toFixed(2) + ').' : d.lsr < 0.8 ? 'Mayoritas akun ritel short.' : '');
    return out.filter(Boolean).join(' ');
  }
  let fundSym = 'BTC';
  function drawFundChart() {
    const box = document.getElementById('fund-chart'); if (!box || !global.d3) return;
    const d = S.deriv[fundSym]; const hs = d && d.fundHist; if (!hs || hs.length < 5) { box.replaceChildren(el('div', 'cd-empty', 'Riwayat funding ' + fundSym + ' belum tersedia.')); return; }
    const d3 = global.d3; const W = box.clientWidth || 600, Hh = 200, m = { t: 14, r: 12, b: 24, l: 56 };
    box.replaceChildren(); const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${Hh}`).attr('role', 'img');
    const vals = hs.map((x) => x.r * 100); const mx = Math.max(0.01, ...vals.map(Math.abs));
    svg.attr('aria-label', 'Riwayat funding ' + fundSym + ' ' + hs.length + ' periode, terakhir ' + pct(vals[vals.length - 1], 4));
    const x = d3.scaleBand(hs.map((_, i) => i), [m.l, W - m.r]).padding(0.15); const y = d3.scaleLinear([-mx, mx], [Hh - m.b, m.t]).nice();
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', m.l - 6).attr('y', (v) => y(v) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((v) => v.toFixed(3) + '%');
    svg.append('g').selectAll('rect').data(vals).join('rect').attr('x', (_, i) => x(i)).attr('width', x.bandwidth()).attr('y', (v) => Math.min(y(0), y(v))).attr('height', (v) => Math.max(1, Math.abs(y(v) - y(0)))).attr('fill', (v) => (v >= 0 ? 'var(--cd-up)' : 'var(--cd-down)')).attr('opacity', 0.8);
    const tix = [0, Math.floor(hs.length / 2), hs.length - 1];
    svg.append('g').selectAll('text').data(tix).join('text').attr('x', (i) => x(i) + x.bandwidth() / 2).attr('y', Hh - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((i) => tgl(new Date(hs[i].t).toISOString()));
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length; document.getElementById('fund-note').textContent = 'Funding ' + fundSym + ' per 8 jam, ' + hs.length + ' periode terakhir (sekitar ' + Math.round(hs.length / 3) + ' hari). Rata-rata ' + pct(avg, 4) + ', setara ' + pct(avg * 3 * 365, 1) + ' per tahun. Batang hijau: long membayar short; merah: short membayar long.';
  }
  H.initDeriv = function () { document.querySelectorAll('#fund-seg button').forEach((b) => b.addEventListener('click', () => { fundSym = b.dataset.coin; document.querySelectorAll('#fund-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawFundChart(); })); };
  H.draw.etf = function () {
    const box = document.getElementById('etf-body'); if (!box || S.page !== 'arus') return;
    const live = S.files.etf_live; const manual = S.files.etf; const stamp = document.getElementById('etf-stamp');
    if (live && live.assets && live.assets.length) {
      stamp.textContent = 'otomatis, diperbarui ' + C.ago(live.updated);
      const t = el('table', 'cd-table'); t.innerHTML = '<thead><tr><th>Aset</th><th class="num">Hari terakhir</th><th class="num">5 hari</th><th class="num">20 hari</th><th class="num">60 hari</th><th class="num">Hari arus masuk (20)</th><th>Tanggal data</th></tr></thead>';
      const tb = el('tbody'); live.assets.forEach((a) => { const r = a.rows; const sum = (n) => r.slice(-n).reduce((x, y) => x + y.flow_musd, 0); const m = (v) => (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' jt';
        const tr = el('tr'); const l = r[r.length - 1]; tr.append(H.td(a.asset, 'sym'), H.td(m(l.flow_musd), 'num ' + sgnCls(l.flow_musd)), H.td(m(sum(5)), 'num ' + sgnCls(sum(5))), H.td(m(sum(20)), 'num ' + sgnCls(sum(20))), H.td(m(sum(60)), 'num ' + sgnCls(sum(60))), H.td(r.slice(-20).filter((x) => x.flow_musd > 0).length + ' dari 20', 'num'), H.td(tgl(l.date))); tb.append(tr); });
      t.append(tb); const w = el('div', 'cd-table-box'); w.append(t); box.replaceChildren(w, el('p', 'cd-card-note', 'Sumber: Farside Investors, dalam juta USD. Data ETF terbit setelah bursa AS tutup, jadi tertinggal satu hari bursa.'));
      return;
    }
    if (manual && manual.length) {
      const asOf = manual.map((r) => r.as_of).filter(Boolean).sort().pop(); stamp.textContent = 'data manual per ' + tgl(asOf);
      const t = el('table', 'cd-table'); t.innerHTML = '<thead><tr><th>Aset</th><th class="num">Dana</th><th class="num">Aset kelolaan</th><th class="num">Arus kumulatif</th><th class="num">30 hari</th><th class="num">10 hari</th><th>Catatan</th></tr></thead>';
      const tb = el('tbody'); const big = (v) => (num(v) < 0 ? '−' : '+') + compact(Math.abs(num(v)));
      manual.forEach((r) => { const tr = el('tr'); tr.append(H.td(r.asset, 'sym'), H.td(String(r.funds), 'num'), H.td(compact(r.aum), 'num'), H.td(big(r.cum_flow), 'num ' + sgnCls(r.cum_flow)), H.td(big(r.flow_30d), 'num ' + sgnCls(r.flow_30d)), H.td(big(r.flow_10d), 'num ' + sgnCls(r.flow_10d)), H.td(r.note || '')); tb.append(tr); });
      t.append(tb); const w = el('div', 'cd-table-box'); w.append(t); box.replaceChildren(w, el('p', 'cd-card-note cd-warn', 'Sumber arus ETF otomatis sedang tidak tersedia, jadi yang tampil adalah catatan analis terakhir. Tanggalnya tertera di judul.'));
    } else box.replaceChildren(el('div', 'cd-empty', 'Data ETF belum tersedia.'));
  };

  /* ================= macro & calendar ================= */
  const MACRO_READ = {
    dxy: (c) => (c > 0 ? 'Dolar menguat: likuiditas global mengetat, biasanya menekan kripto.' : 'Dolar melemah: biasanya membantu aset berisiko termasuk kripto.'),
    us10y: (c) => (c > 0 ? 'Yield naik: biaya modal naik, aset tanpa imbal hasil seperti BTC kurang menarik.' : 'Yield turun: tekanan ke aset berisiko berkurang.'),
    us2y: (c) => (c > 0 ? 'Yield 2 tahun naik: pasar memperkirakan suku bunga Fed tetap tinggi lebih lama.' : 'Yield 2 tahun turun: pasar mulai memperkirakan pemangkasan suku bunga.'),
    wti: (c) => (c > 0 ? 'Minyak naik: mendorong inflasi dan menahan pemangkasan suku bunga.' : 'Minyak turun: tekanan inflasi mereda.'),
    brent: (c) => (c > 0 ? 'Brent naik: risiko inflasi energi.' : 'Brent turun: risiko inflasi energi mereda.'),
    gold: (c) => (c > 0 ? 'Emas naik: permintaan aset lindung nilai sedang kuat.' : 'Emas turun: permintaan lindung nilai melemah.'),
    spx: (c) => (c > 0 ? 'Saham AS naik: selera risiko sehat, korelasinya dengan kripto sering positif.' : 'Saham AS turun: selera risiko melemah.'),
    ndx: (c) => (c > 0 ? 'Nasdaq naik: saham teknologi kuat, sejalan dengan selera risiko.' : 'Nasdaq turun: saham teknologi tertekan.'),
    vix: (c, v) => (v > 25 ? 'VIX tinggi: pasar saham sedang takut, kripto biasanya ikut tertekan.' : v < 16 ? 'VIX rendah: pasar tenang.' : 'VIX di kisaran normal.'),
  };
  H.draw.macro = function () {
    const box = document.getElementById('macro-cards'); if (!box || S.page !== 'makro') return;
    const m = S.files.macro_live; const stamp = document.getElementById('macro-stamp');
    if (m === undefined) { box.replaceChildren(el('div', 'cd-card dash-skeleton')); return; }
    if (!m || !m.series) { drawMacroManual(box, stamp); return; }
    stamp.textContent = 'otomatis, diperbarui ' + C.ago(m.updated);
    const btc = S.coin.BTC && S.coin.BTC.d1 ? H.retMap(S.coin.BTC.d1) : null;
    box.replaceChildren(...m.series.map((s) => {
      const pts = s.pts; const last = pts[pts.length - 1]; const v = s.live && fin(s.live.price) ? s.live.price : last[1];
      const c1 = (v / pts[pts.length - 2][1] - 1) * 100, c30 = H.chgOver(pts, 21), c1y = (v / pts[0][1] - 1) * 100;
      const isYield = s.unit === '%'; const fmt = (x) => (isYield ? x.toFixed(2) + '%' : s.key === 'spx' || s.key === 'ndx' ? x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : x.toLocaleString('en-US', { maximumFractionDigits: 2 }));
      const card = el('div', 'cd-card'); const head = el('div', 'cd-coin-head'); head.append(el('span', 'cd-macro-label', s.label), el('span', 'cd-chip ' + (c30 > 0 ? 'up' : c30 < 0 ? 'down' : 'flat'), (isYield ? (c30 > 0 ? '+' : '') + ((v - pts[Math.max(0, pts.length - 22)][1]) * 100).toFixed(0) + ' bps' : pct(c30)) + ' / 1 bln'));
      const sp = el('div', 'cd-chart tiny'); sp.append(H.spark(pts.map((p) => p[1]), 260, 46));
      let corrTxt = ''; if (btc) { const mm = new Map(); for (let i = 1; i < pts.length; i++) mm.set(pts[i][0], pts[i][1] / pts[i - 1][1] - 1); const [a, b] = H.aligned(btc, mm, 90); const c = H.corr(a, b); if (fin(c)) corrTxt = ' Korelasi harian dengan BTC (90 hari): ' + c.toFixed(2) + '.'; }
      card.append(head, el('div', 'cd-macro-value', fmt(v)), el('div', 'cd-macro-note', 'Hari ini ' + (isYield ? ((v - pts[pts.length - 2][1]) * 100).toFixed(0) + ' bps' : pct(c1, 2)) + ' · 1 tahun ' + (isYield ? ((v - pts[0][1]) * 100).toFixed(0) + ' bps' : pct(c1y, 1))), sp,
        el('div', 'cd-macro-note', (MACRO_READ[s.key] ? MACRO_READ[s.key](c30, v) : '') + corrTxt), el('div', 'cd-macro-note', s.source + ', data ' + tgl(s.live && s.live.time ? s.live.time : last[0])));
      return card;
    }));
    const mb = document.getElementById('macro-monthly'); if (mb && m.monthly) {
      mb.replaceChildren(...m.monthly.map((s) => { const p = s.pts; const l = p[p.length - 1], pr = p[p.length - (s.daily ? 22 : 2)]; const d = el('div'); const ch = l[1] - pr[1];
        d.append(el('dt', null, s.label)); const dd = el('dd', null, l[1].toFixed(2) + (s.unit === '%' ? '%' : ' ' + s.unit)); dd.append(el('small', null, (ch >= 0 ? 'naik ' : 'turun ') + Math.abs(ch).toFixed(2) + ' poin dari ' + (s.daily ? 'sebulan lalu' : 'periode sebelumnya') + ' · data ' + tgl(l[0]))); d.append(dd); return d; }));
    }
  };
  function drawMacroManual(box, stamp) {
    const man = S.files.macro; if (!man || !man.length) { H.fail(box, 'Data makro belum tersedia.'); return; }
    stamp.textContent = 'catatan analis (sumber otomatis belum tersedia)';
    box.replaceChildren(...man.map((r) => { const c = el('div', 'cd-card'); const h = el('div', 'cd-coin-head'); h.append(el('span', 'cd-macro-label', r.label), el('span', 'cd-chip ' + (/hambat/i.test(r.effect) ? 'down' : /dukung|bantu/i.test(r.effect) ? 'up' : 'flat'), r.effect || '')); c.append(h, el('div', 'cd-macro-value', r.display), el('div', 'cd-macro-note', r.note || ''), el('div', 'cd-macro-note', 'Per ' + tgl(r.as_of))); return c; }));
  }
  H.draw.fng = function () {
    const box = document.getElementById('fng-chart'); if (!box || !global.d3 || S.page !== 'makro') return;
    if (!S.fng) { if (S.fng === null) H.fail(box); else H.skel(box); return; }
    box.classList.remove('dash-skeleton'); const d3 = global.d3; const pts = S.fng.slice(-90).map((r) => ({ d: new Date(r.date + 'T00:00:00Z'), v: r.value }));
    const W = box.clientWidth || 600, Hh = 200, m = { t: 12, r: 40, b: 24, l: 30 };
    box.replaceChildren(); const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${Hh}`).attr('role', 'img').attr('aria-label', 'Fear & Greed 90 hari, terakhir ' + pts[pts.length - 1].v);
    const x = d3.scaleUtc(d3.extent(pts, (p) => p.d), [m.l, W - m.r]); const y = d3.scaleLinear([0, 100], [Hh - m.b, m.t]);
    [[0, 25, 'var(--cd-down-wash)'], [75, 100, 'var(--cd-up-wash)']].forEach(([a, b, c]) => svg.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y(b)).attr('height', y(a) - y(b)).attr('fill', c));
    [25, 50, 75].forEach((v) => { svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', v === 50 ? '4 4' : '2 4'); svg.append('text').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(v); });
    svg.append('path').datum(pts).attr('d', d3.line().x((p) => x(p.d)).y((p) => y(p.v))).attr('fill', 'none').attr('stroke', 'var(--cd-brass)').attr('stroke-width', 1.8);
    const l = pts[pts.length - 1]; svg.append('text').attr('x', W - m.r + 6).attr('y', y(l.v) + 4).attr('font-size', 12).attr('font-weight', 600).attr('fill', 'var(--cd-ink)').text(l.v);
    svg.append('g').selectAll('text').data(x.ticks(4)).join('text').attr('x', x).attr('y', Hh - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => d.getUTCDate() + ' ' + C.BLN[d.getUTCMonth()]);
    const avg30 = S.fng.slice(-30).reduce((a, b) => a + b.value, 0) / Math.min(30, S.fng.length);
    document.getElementById('fng-note').textContent = 'Indeks sentimen 0–100 dari Alternative.me. Saat ini ' + l.v + ' (' + H.fngLabel(l.v) + '), rata-rata 30 hari ' + avg30.toFixed(0) + '. Pita merah = sangat takut (≤25), hijau = sangat serakah (≥75). Takut ekstrem sering muncul dekat dasar lokal, serakah ekstrem dekat puncak lokal, tapi bukan sinyal waktu yang presisi.';
  };
  H.draw.calendar = function () {
    const tb = document.querySelector('#cal-table tbody'); if (!tb || S.page !== 'makro') return;
    const cal = S.files.calendar; const man = (S.files.events || []).filter((e) => e.date && Date.parse(e.date) >= Date.now() - 864e5);
    const stamp = document.getElementById('cal-stamp'); const rows = [];
    if (cal && cal.rows) { stamp.textContent = 'otomatis, diperbarui ' + C.ago(cal.updated); cal.rows.forEach((e) => rows.push({ t: Date.parse(e.date), when: witaTime(e.date), title: e.title, impact: e.impact, detail: [e.actual ? 'Aktual ' + e.actual : '', e.forecast ? 'Perkiraan ' + e.forecast : '', e.previous ? 'Sebelumnya ' + e.previous : ''].filter(Boolean).join(' · '), auto: true })); }
    else stamp.textContent = 'catatan analis';
    man.forEach((e) => rows.push({ t: Date.parse(e.date), when: e.window || tgl(e.date), title: e.event, impact: e.impact, detail: e.why || '' }));
    rows.sort((a, b) => a.t - b.t);
    if (!rows.length) { tb.replaceChildren(); const tr = el('tr'); tr.append(el('td', 'cd-empty', 'Belum ada peristiwa terjadwal.')); tb.append(tr); return; }
    tb.replaceChildren(...rows.map((r) => { const tr = el('tr'); const past = r.t < Date.now(); if (past) tr.style.opacity = '.62';
      const dl = r.t - Date.now(); const cd = past ? 'sudah lewat' : dl < 864e5 ? 'dalam ' + Math.max(1, Math.round(dl / 3600e3)) + ' jam' : 'dalam ' + Math.round(dl / 864e5) + ' hari';
      const t1 = el('td'); t1.append(r.when, el('div', 'cd-list-meta', cd)); tr.append(t1, H.td(r.title), (() => { const td = el('td'); td.append(el('span', 'cd-chip ' + (/tinggi/i.test(r.impact) ? 'down' : 'flat'), r.impact || '—')); return td; })(), H.td(r.detail)); return tr; }));
  };

  /* ================= theses & scenarios ================= */
  const parseIdr = (s) => { const m = String(s || '').match(/\$\s?([\d.,]+)/); if (!m) return NaN; return Number(m[1].replace(/\./g, '').replace(',', '.')); };
  const TH_LBL = [['role', 'Peran di portofolio'], ['project', 'Proyek'], ['thesis', 'Tesis'], ['catalysts', 'Katalis'], ['risks', 'Risiko']];
  H.draw.theses = function () {
    const box = document.getElementById('thesis-cards'); if (!box || S.page !== 'tesis') return;
    const th = S.files.theses; const meta = S.files.meta || {};
    document.getElementById('thesis-stamp').textContent = meta.updated ? 'ditulis ' + tgl(meta.updated) : '';
    if (!th) { if (th === null) H.fail(box); return; }
    box.replaceChildren(...th.map((t) => {
      const card = el('article', 'cd-card cd-thesis'); card.style.setProperty('--coin', COL[t.coin] || 'var(--cd-brass)');
      const h = el('h3'); h.append(NAMES[t.coin] || t.coin); const p = H.priceOf(t.coin); const pr = el('span', 'cd-coin-sym', usd(p)); pr.dataset.live = t.coin; h.append(pr); card.append(h);
      TH_LBL.forEach(([k, lab]) => { if (!t[k]) return; const para = el('p'); para.append(el('span', 'lbl', lab), t[k]); card.append(para); });
      if (t.invalidation) {
        const lv = parseIdr(t.invalidation); const o = S.coin[t.coin]; const wk = o && o.w1 ? o.w1[o.w1.length - 2] : null;
        const para = el('p', 'inv'); para.append(el('span', 'lbl', 'Batal bila'), t.invalidation);
        if (fin(lv) && fin(p)) { const dist = (p / lv - 1) * 100; const broke = wk && wk.close < lv; para.append(el('br'), el('b', broke ? 'cd-neg' : 'cd-pos', broke ? 'Status: penutupan mingguan terakhir (' + usd(wk.close) + ') sudah di bawah batas. Tesis perlu ditinjau ulang.' : 'Status: masih berlaku, harga ' + pct(dist) + ' dari batas.')); }
        card.append(para);
      }
      return card;
    }));
    L.rebind();
  };
  const Z = { 0.1: -1.2816, 0.25: -0.6745, 0.5: 0, 0.75: 0.6745, 0.9: 1.2816 };
  H.draw.cone = function () {
    const tb = document.querySelector('#cone-table tbody'); if (!tb || S.page !== 'tesis') return;
    const hz = [[30, '1 bulan'], [90, '3 bulan'], [180, '6 bulan'], [365, '12 bulan']];
    const rows = [];
    COINS.forEach((sym) => {
      const o = S.coin[sym]; if (!o || !o.d1 || o.d1.length < 200) return; const p = H.priceOf(sym) || o.d1[o.d1.length - 1].close;
      const lr = o.d1.slice(-366).map((x, i, a) => (i ? Math.log(x.close / a[i - 1].close) : null)).filter((v) => v !== null); const sig = H.sd(lr);
      hz.forEach(([d, lab], j) => { const s = sig * Math.sqrt(d); const q = (z) => p * Math.exp(-0.5 * s * s + z * s);
        const tr = el('tr'); if (j === 0) { const td = H.td(sym, 'sym'); td.rowSpan = hz.length; tr.append(td); }
        tr.append(H.td(lab), H.td(usd(q(Z[0.1])), 'num cd-neg'), H.td(usd(q(Z[0.25])), 'num'), H.td(usd(q(Z[0.5])), 'num'), H.td(usd(q(Z[0.75])), 'num'), H.td(usd(q(Z[0.9])), 'num cd-pos'), H.td('±' + (s * 100).toFixed(0) + '%', 'num')); rows.push(tr); });
    });
    tb.replaceChildren(...rows);
    const sc = S.files.scenarios; const stb = document.querySelector('#scen-table tbody');
    if (stb && sc) stb.replaceChildren(...sc.map((r) => { const tr = el('tr'); tr.append(H.td(r.scenario, 'sym'), H.td(r.trigger)); COINS.forEach((c) => tr.append(H.td(r[c] || '—', 'num'))); tr.append(H.td(r.fail)); return tr; }));
    const ss = document.getElementById('scen-stamp'); if (ss && S.files.meta) ss.textContent = 'per ' + tgl(S.files.meta.updated);
  };

  /* ================= news ================= */
  const NW = { coin: 'ALL', src: 'ALL', q: '', n: 24 };
  H.draw.news = function () {
    const grid = document.getElementById('news-grid'); if (!grid || S.page !== 'berita') return;
    const note = document.getElementById('news-note');
    if (!S.news) { note.textContent = S.news === null ? 'Berita belum bisa dimuat.' : 'Memuat berita…'; return; }
    const items = S.news.items;
    const sel = document.getElementById('news-src'); if (sel.options.length <= 1) Array.from(new Set(items.map((i) => i.source))).sort().forEach((s) => sel.append(new Option(s, s)));
    let list = items.filter((it) => (NW.coin === 'ALL' ? true : NW.coin === 'ALT' ? (it.coins || []).some((c) => !COINS.includes(c)) : (it.coins || []).includes(NW.coin)) && (NW.src === 'ALL' || it.source === NW.src));
    const q = NW.q.trim().toLowerCase(); if (q) list = list.filter((it) => (it.title + ' ' + (it.summary || '')).toLowerCase().includes(q));
    const day = items.filter((it) => Date.now() - Date.parse(it.published) < 864e5);
    note.textContent = items.length + ' artikel dari ' + new Set(items.map((i) => i.source)).size + ' penerbit, ' + day.length + ' terbit dalam 24 jam terakhir. Diperbarui ' + C.ago(S.news.updated) + '. Klik kartu untuk membaca artikel lengkap di situs penerbit.';
    const cnt = document.getElementById('news-counts'); cnt.replaceChildren(...COINS.map((c) => { const n = day.filter((it) => (it.coins || []).includes(c)).length; const d = el('div'); d.append(el('span', 'lbl', c + ', 24 jam'), el('span', 'v', String(n)), el('span', 's', n === 1 ? 'artikel' : 'artikel')); return d; }));
    const more = document.getElementById('news-more'); more.hidden = list.length <= NW.n;
    grid.replaceChildren(...(list.length ? list.slice(0, NW.n).map(C.newsCard) : [el('div', 'cd-empty', 'Tidak ada berita yang cocok dengan filter ini.')]));
  };
  H.initNews = function () {
    document.querySelectorAll('#news-seg button').forEach((b) => b.addEventListener('click', () => { NW.coin = b.dataset.coin; NW.n = 24; document.querySelectorAll('#news-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); H.draw.news(); }));
    document.getElementById('news-src').addEventListener('change', (e) => { NW.src = e.target.value; NW.n = 24; H.draw.news(); });
    const q = document.getElementById('news-q'); q.addEventListener('input', () => { NW.q = q.value; NW.n = 24; H.draw.news(); });
    document.getElementById('news-more').addEventListener('click', () => { NW.n += 24; H.draw.news(); });
  };

  /* ================= method & log ================= */
  H.draw.log = function () {
    const tb = document.querySelector('#log-table tbody'); if (!tb || S.page !== 'metode') return;
    const lg = S.files.analysis_log || []; tb.replaceChildren(...lg.map((r) => { const tr = el('tr'); tr.append(H.td(tgl(r.date)), H.td(r.title), H.td(r.kind), H.td(r.verdict)); return tr; }));
    const fs = document.getElementById('src-table'); if (!fs) return;
    const age = (f, key) => { const j = S.files[f]; return j && j[key || 'updated'] ? C.ago(j[key || 'updated']) : '—'; };
    const rows = [['Harga realtime', 'Binance (aliran WebSocket), cadangan REST tiap 10 detik', L.mode() === 'ws' ? 'tersambung realtime' : L.mode()],
      ['Kapitalisasi, peringkat, 250 koin', 'CoinGecko, dimuat di browser', S.markets ? (S.markets.live ? 'live' : 'cuplikan ' + C.ago(S.markets.at)) : '—'],
      ['Lilin 15 menit s/d 1 minggu', 'Binance, cadangan OKX dan Kraken', 'setiap halaman dibuka, lalu tiap 1–5 menit'],
      ['Funding, open interest, long/short, taker', 'OKX publik (cadangan Binance Futures)', 'tiap menit'],
      ['Fear & Greed', 'Alternative.me', 'harian'],
      ['Makro: DXY, yield, minyak, emas, saham, VIX', 'Yahoo Finance, cadangan FRED St. Louis Fed', age('macro_live')],
      ['Inflasi, suku bunga Fed, pengangguran', 'FRED St. Louis Fed', age('macro_live')],
      ['Kalender ekonomi AS', 'ForexFactory', age('calendar')],
      ['Arus ETF spot', 'Farside Investors', S.files.etf_live ? age('etf_live') : 'catatan analis (otomatis belum tersedia)'],
      ['Berita', '10 umpan RSS penerbit kripto', S.news ? C.ago(S.news.updated) : '—'],
      ['Listing bursa', 'Binance, OKX, Bybit, KuCoin, Coinbase', age('listings')],
      ['Tesis & skenario naratif', 'Catatan analis', S.files.meta ? 'ditulis ' + tgl(S.files.meta.updated) : '—']];
    fs.querySelector('tbody').replaceChildren(...rows.map((r) => { const tr = el('tr'); r.forEach((c, i) => tr.append(H.td(c, i === 0 ? 'sym' : null))); return tr; }));
  };

  /* ================= router & boot ================= */
  const tabs = Array.from(document.querySelectorAll('.cd-tab')); const pages = Array.from(document.querySelectorAll('.cd-page'));
  function show(id) {
    if (!pages.some((p) => p.id === id)) id = 'ringkasan';
    S.page = id;
    tabs.forEach((t) => { const on = t.dataset.page === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    pages.forEach((p) => { p.hidden = p.id !== id; p.classList.toggle('enter', p.id === id); });
    history.replaceState(null, '', location.pathname + location.search + '#' + id);
    if (id === 'teknikal') { if (!TK.rows) loadTk(); else setTimeout(() => { if (TK.chart) { drawTkChart(); } }, 30); }
    if (id === 'pasar' && S.trending === undefined) C.fetchTrending().then((v) => { S.trending = v; H.redraw(); }).catch(() => { S.trending = null; H.redraw(); });
    if (id === 'berita' && S.news === undefined) loadNews();
    H.redraw();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.page));
    t.addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n.dataset.page); });
  });
  async function loadNews() {
    try { const r = await C.fetchNews(); const uni = S.markets ? S.markets.rows.slice(0, 150) : COINS.map((s) => ({ symbol: s, name: NAMES[s] })); r.items = C.tagCoins(r.items, uni); S.news = r; }
    catch (e) { S.news = null; }
    H.redraw();
  }
  const clock = () => { const n = document.getElementById('clock'); if (n) n.textContent = witaTime(new Date().toISOString()).replace(/^\d+ \S+ /, ''); };

  document.addEventListener('DOMContentLoaded', () => {});
  C.themeButton(document.getElementById('theme-btn'));
  document.addEventListener('cd-theme', H.redraw);
  L.strip(document.getElementById('strip')); L.statusBadge(document.getElementById('live'));
  L.on(() => { if (!H._liveQ) { H._liveQ = setTimeout(() => { H._liveQ = null; H.draw.band(); if (S.page === 'ringkasan') H.draw.ledger(); }, 1500); } });
  H.initMarket(); H.initListings(); H.initTk(); H.initDeriv(); H.initNews();
  const ld = H.loaders;
  ld.loadMarkets(); ld.loadGlobal(); ld.loadFng();
  ['theses', 'scenarios', 'events', 'etf', 'meta', 'analysis_log', 'macro', 'macro_live', 'calendar', 'etf_live', 'listings'].forEach((f) => H.loadFile(f));
  // Portfolio coins load one after another so the exchanges are not hit with twenty requests at once.
  (async () => { for (const s of COINS) { await ld.loadCoin(s); } COINS.forEach((s) => H.deriveCoin(s)); H.redraw(); })();
  COINS.forEach((s) => ld.loadDeriv(s));
  show((location.hash || '#ringkasan').slice(1));
  clock(); setInterval(clock, 15e3);
  setInterval(() => { ld.loadMarkets(); ld.loadGlobal(); }, 60e3);
  setInterval(() => { COINS.forEach((s) => ld.loadDeriv(s)); }, 60e3);
  setInterval(() => { (async () => { for (const s of COINS) await ld.loadCoin(s); })(); }, 300e3);
  setInterval(() => { if (S.page === 'teknikal') loadTk(true); }, 60e3);
  setInterval(() => { ['macro_live', 'calendar', 'etf_live', 'listings'].forEach((f) => H.loadFile(f)); if (S.news !== undefined) loadNews(); }, 600e3);
  setInterval(() => { if (S.page === 'arus') H.draw.deriv(); }, 30e3);
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(H.redraw, 200); });
})(window);
