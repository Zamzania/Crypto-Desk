/* Crypto Desk — coin detail page with rule-based automatic analysis. */
(function () {
  'use strict';
  const C = window.CDCore;
  const { el, num, usd, pct, compact, compactN, tgl, witaTime } = C;
  const qs = new URLSearchParams(location.search);
  const P = { id: qs.get('id') || '', sym: (qs.get('s') || '').toUpperCase() };
  C.themeButton(document.getElementById('theme-btn'));
  const f1 = (v) => (isFinite(num(v)) ? num(v).toFixed(1) : '—');
  const dist = (a, b) => ((a / b) - 1) * 100;

  /* ---------- resolve coin ---------- */
  async function resolve() {
    let mk = null;
    try { mk = await C.fetchMarkets(); } catch (e) { /* offline markets */ }
    const rows = mk ? mk.rows : [];
    let m = (P.id && rows.find((x) => x.id === P.id)) || (P.sym && rows.find((x) => x.symbol === P.sym)) || null;
    if (!m && !P.id && P.sym) { try { const f = await C.searchCoin(P.sym); if (f) { P.id = f.id; m = Object.assign({}, f); } } catch (e) { /* search unavailable */ } }
    if (!P.id && m) P.id = m.id;
    if (!P.sym && m) P.sym = m.symbol;
    if (!P.id && !P.sym) { P.id = 'bitcoin'; P.sym = 'BTC'; m = rows.find((x) => x.id === 'bitcoin') || null; }
    return m;
  }

  /* ---------- header & stats ---------- */
  function header(d) {
    const name = d.name || P.sym;
    document.title = name + ' (' + P.sym + ') · Crypto Desk';
    document.getElementById('coin-sym').textContent = P.sym + (d.rank ? ' · peringkat #' + d.rank : '');
    document.getElementById('coin-name').textContent = name;
    const img = document.getElementById('coin-img'); if (d.image && C.safeUrl(d.image)) { img.src = d.image; img.hidden = false; }
    document.getElementById('coin-price').textContent = usd(d.price);
    const chg = document.getElementById('coin-chg');
    if (isFinite(num(d.percent_change_24h))) { const v = el('span', C.sgnCls(d.percent_change_24h), pct(d.percent_change_24h, 2)); v.id = 'coin-chg-v'; chg.replaceChildren(v, ' dalam 24 jam'); chg.className = 'cd-chip'; } else chg.hidden = true;
    const badges = document.getElementById('coin-badges'); badges.replaceChildren();
    if (C.PORTFOLIO.includes(P.sym)) badges.append(el('span', 'cd-chip flat', 'Koin inti · dianalisis mingguan'));
    (d.categories || []).slice(0, 3).forEach((c) => badges.append(el('span', 'cd-chip', c)));
    document.getElementById('see-chart').href = 'chart.html?s=' + encodeURIComponent(P.sym) + '&id=' + encodeURIComponent(P.id) + '&tf=4h';
    document.getElementById('news-more').href = 'index.html?news=' + encodeURIComponent(P.sym) + '#berita';
    const act = document.getElementById('coin-actions');
    act.querySelectorAll('.cd-btn-ext').forEach((x) => x.remove());
    [['Situs resmi', d.homepage], ['Whitepaper', d.whitepaper], ['Explorer', d.explorer]].forEach(([t, u]) => { const s = C.safeUrl(u); if (s) act.append(C.link(s, 'cd-btn cd-btn-ext', t + ' ↗', true)); });
  }
  function stats(d) {
    const dl = document.getElementById('stats');
    const supplyBase = isFinite(num(d.max)) && d.max > 0 ? d.max : d.total;
    const items = [
      ['Kapitalisasi', compact(d.market_cap)], ['Valuasi terdilusi penuh (FDV)', compact(d.fdv)], ['Volume 24 jam', compact(d.volume)],
      ['Volume / kapitalisasi', isFinite(d.volume / d.market_cap) ? (d.volume / d.market_cap * 100).toFixed(1) + '%' : '—'],
      ['Suplai beredar', compactN(d.circ) + (isFinite(num(supplyBase)) && supplyBase > 0 ? ' (' + (d.circ / supplyBase * 100).toFixed(0) + '% dari ' + (isFinite(num(d.max)) && d.max > 0 ? 'maks' : 'total') + ')' : '')],
      ['Suplai maksimum', isFinite(num(d.max)) && d.max > 0 ? compactN(d.max) : 'Tidak dibatasi'],
      ['Tertinggi sepanjang masa', usd(d.ath) + (d.ath_date ? ' · ' + tgl(d.ath_date) : '')], ['Jarak dari ATH', pct(d.dd_ath)],
      ['Terendah sepanjang masa', usd(d.atl) + (d.atl_date ? ' · ' + tgl(d.atl_date) : '')],
      ['7 hari', pct(d.percent_change_7d)], ['30 hari', pct(d.percent_change_30d)], ['1 tahun', pct(d.percent_change_1y)],
    ];
    dl.replaceChildren(...items.map(([k, v]) => { const x = el('div'); x.append(el('dt', null, k), el('dd', null, v)); return x; }));
    document.getElementById('stats-note').textContent = 'Data CoinGecko dalam USD, per ' + witaTime(d.last_updated_time || new Date().toISOString()) + '. Rentang 24 jam: ' + usd(d.low_24h) + ' – ' + usd(d.high_24h) + '.';
  }
  function spark(rows) {
    const box = document.getElementById('spark'); const pts = rows.slice(-120);
    if (pts.length < 10) { box.replaceChildren(); return; }
    const W = 600, H = 70, lo = Math.min(...pts.map((p) => p.close)), hi = Math.max(...pts.map((p) => p.close));
    const x = (i) => (i / (pts.length - 1)) * W, y = (v) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8);
    const up = pts[pts.length - 1].close >= pts[0].close;
    const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS(ns, 'polyline'); path.setAttribute('points', pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.close).toFixed(1)).join(' '));
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', up ? 'var(--cd-up)' : 'var(--cd-down)'); path.setAttribute('stroke-width', '1.6'); path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path); box.replaceChildren(svg, el('span', 'cd-spark-cap', '120 hari terakhir · ' + pct(dist(pts[pts.length - 1].close, pts[0].close))));
  }

  /* ---------- automatic analysis ---------- */
  function analyze(dS, hS, lv, d) {
    const out = []; let score = 0; const notes = [];
    const P_ = (title, text) => out.push([title, text]);
    if (!dS) return { html: [['Data kurang', 'Lilin harian koin ini belum tersedia di bursa publik yang dipakai, jadi analisis teknikal belum bisa dihitung. Bagian statistik dan proyek tetap bisa dipakai.']], verdict: 'Data kurang', cls: 'flat' };
    const c = dS.close;
    // 1. Trend structure
    let t1;
    if (dS.sma200 === null) {
      t1 = 'Riwayat harga di bursa yang dipakai kurang dari 200 hari (' + dS.n + ' lilin), jadi MA200 belum bisa dihitung dan kesimpulan tren jangka menengah masih lemah dasarnya. ';
      if (dS.sma50 !== null) { t1 += 'Sebagai pengganti, harga ' + (c > dS.sma50 ? 'berada di atas' : 'berada di bawah') + ' MA50 (' + usd(dS.sma50) + ', selisih ' + pct(dist(c, dS.sma50)) + ').'; score += c > dS.sma50 ? 1 : -1; }
      notes.push('riwayat pendek');
    } else {
      const a200 = c > dS.sma200, gc = dS.sma50 > dS.sma200;
      score += (a200 ? 1 : -1) + (gc ? 1 : -1) + (c > dS.sma50 ? 0.5 : -0.5);
      t1 = 'Harga ' + usd(c) + ' berada ' + (a200 ? 'di atas' : 'di bawah') + ' MA200 (' + usd(dS.sma200) + ', selisih ' + pct(dist(c, dS.sma200)) + '). MA200 adalah rata-rata 200 hari, jadi posisi ini menunjukkan arah jangka menengah: ' + (a200 ? 'pembeli masih menguasai horizon beberapa bulan.' : 'tekanan jual masih mendominasi horizon beberapa bulan.') + ' ';
      t1 += 'MA50 ' + (gc ? 'berada di atas' : 'berada di bawah') + ' MA200, artinya momentum beberapa pekan terakhir ' + (gc ? 'searah dengan tren naik.' : 'lebih lemah daripada rata-rata jangka panjangnya.') + ' ';
    }
    if (dS.adx14 !== null) {
      const strong = dS.adx14 >= 25, mid = dS.adx14 >= 20;
      t1 += 'ADX ' + f1(dS.adx14) + ' menunjukkan ' + (strong ? 'tren yang kuat' : mid ? 'tren yang mulai terbentuk' : 'pasar tanpa tren yang jelas (cenderung menyamping)') + ', dengan ' + (dS.pdi > dS.mdi ? 'tekanan beli (+DI) lebih besar daripada tekanan jual (−DI).' : 'tekanan jual (−DI) lebih besar daripada tekanan beli (+DI).');
    }
    P_('Tren harian: ' + dS.trend, t1);
    // 2. Momentum
    const r = dS.rsi14; let t2 = '';
    if (r !== null) {
      const zone = r < 30 ? 'jenuh jual: penurunan sudah ekstrem, pantulan sering terjadi tetapi bukan jaminan' : r < 45 ? 'lemah: penjual sedikit lebih dominan' : r <= 55 ? 'netral: pembeli dan penjual seimbang' : r <= 70 ? 'kuat: pembeli lebih dominan' : 'jenuh beli: kenaikan sudah ekstrem, risiko koreksi meningkat';
      t2 += 'RSI 14 hari di ' + f1(r) + ' berarti momentum ' + zone + '. ';
      score += r > 55 ? 1 : r < 45 ? -1 : 0;
    }
    if (dS.macd_hist !== null) {
      const rising = dS.macd_hist_prev !== null && dS.macd_hist > dS.macd_hist_prev;
      t2 += 'Histogram MACD ' + (dS.macd_hist >= 0 ? 'positif' : 'negatif') + ' dan ' + (rising ? 'membesar' : 'mengecil') + ' dibanding tiga hari lalu, sehingga ' +
        (dS.macd_hist >= 0 ? (rising ? 'dorongan naik sedang menguat.' : 'dorongan naik mulai melambat.') : (rising ? 'tekanan turun mulai mereda.' : 'tekanan turun sedang menguat.'));
      score += (dS.macd_hist >= 0 ? 1 : -1) + (rising ? 0.5 : -0.5);
    }
    P_('Momentum', t2 || 'Data belum cukup untuk RSI dan MACD.');
    // 3. Volatility & volume
    let t3 = 'Rata-rata rentang harian (ATR) sekitar ' + dS.atr_pct.toFixed(1) + '% dari harga, tergolong ' + (dS.atr_pct < 3 ? 'rendah' : dS.atr_pct < 6 ? 'sedang' : 'tinggi') + ' untuk aset kripto. ';
    t3 += 'Angka ini berguna untuk mengukur jarak stop yang wajar: stop yang lebih sempit dari satu ATR mudah tersentuh oleh gerak harian biasa. ';
    if (dS.bb_pctile !== null) t3 += 'Lebar Bollinger Band berada di persentil ' + dS.bb_pctile.toFixed(0) + ' dari 180 hari terakhir, ' + (dS.bb_pctile < 20 ? 'artinya volatilitas sedang menyempit; fase seperti ini sering diikuti gerakan besar, tetapi arahnya belum bisa dipastikan.' : dS.bb_pctile > 80 ? 'artinya volatilitas sedang tinggi dan harga bergerak lebar.' : 'artinya volatilitas berada di kisaran normal.') + ' ';
    if (dS.vol_ratio !== null) t3 += 'Volume lilin terakhir ' + (dS.vol_ratio > 1.5 ? 'jauh di atas' : dS.vol_ratio < 0.7 ? 'di bawah' : 'sekitar') + ' rata-rata 20 hari (' + dS.vol_ratio.toFixed(2) + '×)' + (dS.vol_ratio > 1.5 ? ', jadi gerakan hari ini didukung partisipasi yang besar.' : dS.vol_ratio < 0.7 ? ', jadi gerakan hari ini kurang didukung partisipasi.' : '.');
    P_('Volatilitas dan volume', t3);
    // 4. Short term (4h)
    if (hS) {
      score += hS.trend === 'Naik' ? 1 : hS.trend === 'Turun' ? -1 : 0;
      P_('Jangka pendek (4 jam): ' + hS.trend + ' · ' + hS.short_term, 'Pada lilin 4 jam, harga ' + (hS.sma50 !== null ? (hS.close > hS.sma50 ? 'di atas' : 'di bawah') + ' MA50 4 jam (' + usd(hS.sma50) + ')' : 'belum punya MA50') + ' dengan RSI ' + f1(hS.rsi14) + ' dan perubahan ' + pct(hS.chg_24) + ' dalam 24 lilin terakhir (sekitar 4 hari). ' +
        (hS.trend === dS.trend ? 'Arah jangka pendek searah dengan tren harian, sehingga sinyalnya saling menguatkan.' : 'Arah jangka pendek berbeda dengan tren harian; dalam kondisi ini trader biasanya menunggu konfirmasi sebelum mengikuti salah satu arah.'));
    }
    // 5. Levels
    const s1 = lv.supports[0], s2 = lv.supports[1], r1 = lv.resistances[0], r2 = lv.resistances[1];
    let t5 = '';
    if (s1) t5 += 'Support terdekat di ' + usd(s1.lo) + (s1.hi !== s1.lo ? '–' + usd(s1.hi) : '') + ' (' + pct(dist(s1.hi, c)) + ' dari harga). ';
    if (r1) t5 += 'Resistance terdekat di ' + usd(r1.lo) + (r1.hi !== r1.lo ? '–' + usd(r1.hi) : '') + ' (' + pct(dist(r1.lo, c)) + '). ';
    if (r1) t5 += 'Penutupan harian di atas ' + usd(r1.hi) + ' akan menjadi tanda pembeli berhasil menembus hambatan' + (r2 ? ', dengan resistance berikutnya di ' + usd(r2.lo) + '. ' : '. ');
    if (s1) t5 += 'Sebaliknya, penutupan harian di bawah ' + usd(s1.lo) + ' membuka risiko turun' + (s2 ? ' ke ' + usd(s2.hi) + '.' : '.');
    if (!r1 && d && isFinite(num(d.dd_ath)) && d.dd_ath > -3) t5 += 'Harga berada dekat rekor tertingginya, jadi tidak ada resistance historis di atasnya.';
    P_('Level yang dipantau', t5 || 'Belum ada titik balik harga yang cukup jelas untuk menentukan level.');
    // 6. Market fundamentals
    if (d) {
      let t6 = '';
      if (d.rank) t6 += 'Peringkat kapitalisasi #' + d.rank + (d.rank <= 10 ? ' (aset besar, likuiditas umumnya dalam). ' : d.rank <= 50 ? ' (aset menengah). ' : ' (aset kecil; pergerakan harga cenderung lebih liar). ');
      const vr = d.volume / d.market_cap;
      if (isFinite(vr)) t6 += 'Volume 24 jam setara ' + (vr * 100).toFixed(1) + '% kapitalisasi, ' + (vr > 0.2 ? 'sangat tinggi (bisa menandakan spekulasi intens).' : vr > 0.03 ? 'tergolong sehat.' : 'tergolong rendah; order besar bisa menggerakkan harga.') + ' ';
      const base = isFinite(num(d.max)) && d.max > 0 ? d.max : d.total;
      if (isFinite(num(d.circ)) && isFinite(num(base)) && base > 0) {
        const pc = d.circ / base * 100;
        t6 += 'Sekitar ' + pc.toFixed(0) + '% suplai sudah beredar' + (pc < 50 ? '; sisa suplai yang besar bisa menekan harga saat token baru dilepas (unlock).' : pc < 85 ? '; masih ada suplai baru yang akan masuk pasar.' : '; risiko dilusi dari suplai baru relatif kecil.') + ' ';
      }
      if (!(isFinite(num(d.max)) && d.max > 0)) t6 += 'Suplai maksimumnya tidak dibatasi, jadi kebijakan emisi dan pembakaran (burn) penting untuk diperhatikan. ';
      if (isFinite(num(d.dd_ath))) t6 += 'Harga ' + pct(d.dd_ath) + ' dari rekor tertinggi' + (d.ath_date ? ' (' + tgl(d.ath_date) + ')' : '') + '.';
      P_('Fundamental pasar', t6);
    }
    const verdict = score >= 2.5 ? 'Teknikal positif' : score <= -1.5 ? 'Teknikal negatif' : 'Teknikal netral';
    return { html: out, verdict: verdict + (notes.length ? ' · ' + notes.join(', ') : ''), cls: score >= 2.5 ? 'up' : score <= -1.5 ? 'down' : 'flat', score };
  }
  function renderAnalysis(a) {
    const body = document.getElementById('auto-body');
    body.replaceChildren(...a.html.map(([h, t]) => { const s = el('div', 'cd-para'); s.append(el('h3', 'cd-sub', h), el('p', null, t)); return s; }));
    const v = document.getElementById('verdict'); v.textContent = a.verdict; v.className = 'cd-chip ' + a.cls;
  }
  function renderLevels(lv, price) {
    const tb = document.querySelector('#lvl-table tbody');
    const rows = lv.resistances.slice().reverse().map((z) => ['Resistance', z]).concat(lv.supports.map((z) => ['Support', z]));
    if (!rows.length) { const tr = el('tr'); const td = el('td', null, 'Belum ada level yang jelas.'); td.colSpan = 5; tr.append(td); tb.replaceChildren(tr); return; }
    tb.replaceChildren(...rows.map(([k, z]) => {
      const tr = el('tr'); const mid = (z.lo + z.hi) / 2;
      tr.append(el('td', k === 'Support' ? 'cd-pos' : 'cd-neg', k + (z.analyst ? ' (analis)' : '')), el('td', 'num', z.lo === z.hi ? usd(z.lo) : usd(z.lo) + ' – ' + usd(z.hi)), el('td', 'num', pct(dist(mid, price))), el('td', 'num', z.touches ? String(z.touches) : '—'), el('td', null, z.last ? tgl(z.last) : (z.analyst ? 'Zona analisis manual' : '—')));
      return tr;
    }));
  }

  /* ---------- analyst section (portfolio coins) ---------- */
  async function analyst() {
    if (!C.PORTFOLIO.includes(P.sym)) return;
    try {
      const [th, lv, meta] = await Promise.all([C.getJSON('data/theses.json'), C.getJSON('data/levels.json'), C.getJSON('data/meta.json').catch(() => ({}))]);
      const t = th.find((x) => x.coin === P.sym); if (!t) return;
      document.getElementById('analyst-card').hidden = false;
      document.getElementById('analyst-stamp').textContent = meta.updated ? 'per ' + tgl(meta.updated) : '';
      const body = document.getElementById('analyst-body');
      const para = (lab, txt, cls) => { const p = el('p', cls); p.append(el('span', 'lbl', lab), txt); return p; };
      body.replaceChildren(para('Peran', t.role), para('Proyek', t.project), para('Tesis', t.thesis), para('Katalis', t.catalysts), para('Risiko', t.risks), para('Pembatal tesis', t.invalidation, 'inv'));
      const zones = lv.filter((l) => l.coin === P.sym).sort((a, b) => b.high - a.high);
      if (zones.length) {
        const tbl = el('table', 'cd-table'); const th_ = el('thead'); const tr0 = el('tr'); ['Jenis', 'Dari', 'Sampai', 'Dasar'].forEach((h, i) => tr0.append(el('th', i && i < 3 ? 'num' : null, h))); th_.append(tr0);
        const tbd = el('tbody'); zones.forEach((l) => { const tr = el('tr'); tr.append(el('td', /support/i.test(l.kind) ? 'cd-pos' : 'cd-neg', l.kind), el('td', 'num', usd(l.low)), el('td', 'num', usd(l.high)), el('td', null, l.basis)); tbd.append(tr); });
        tbl.append(th_, tbd); const box = el('div', 'cd-table-box'); box.append(tbl); body.append(el('h3', 'cd-sub', 'Zona hasil analisis'), box);
      }
    } catch (e) { /* analyst data optional */ }
  }

  /* ---------- about & news ---------- */
  function about(d) {
    const meta = document.getElementById('about-meta');
    const items = [['Kategori', (d.categories || []).join(', ') || '—'], ['Mulai', d.genesis ? tgl(d.genesis) : '—'], ['Algoritma', d.hashing || '—']];
    meta.replaceChildren(...items.map(([k, v]) => { const x = el('div'); x.append(el('dt', null, k), el('dd', 'cd-dd-sm', v)); return x; }));
    const body = document.getElementById('about-body');
    if (d.description) { const parts = d.description.split(/(?<=\.)\s+(?=[A-Z])/); const out = []; let cur = ''; parts.forEach((s) => { if ((cur + ' ' + s).length > 420 && cur) { out.push(cur); cur = s; } else cur = (cur ? cur + ' ' : '') + s; }); if (cur) out.push(cur); body.replaceChildren(...out.slice(0, 4).map((t) => el('p', null, t))); }
    else body.replaceChildren(el('p', null, 'Deskripsi proyek belum tersedia.'));
  }
  async function news(d) {
    const box = document.getElementById('news');
    try {
      const n = await C.fetchNews();
      const coins = [{ symbol: P.sym, name: d.name || P.sym }];
      const items = C.tagCoins(n.items.map((x) => Object.assign({}, x)), coins).filter((x) => x.coins.includes(P.sym)).slice(0, 8);
      if (!items.length) { box.replaceChildren(el('p', 'cd-card-note', 'Belum ada berita terbaru yang menyebut ' + (d.name || P.sym) + ' di sumber yang dipantau.')); return; }
      box.replaceChildren(...items.map(C.newsCard));
    } catch (e) { box.replaceChildren(el('p', 'cd-card-note', 'Berita gagal dimuat. Coba muat ulang halaman.')); }
  }

  /* ---------- trade plan (spot & futures) ---------- */
  const A = window.CDAnalysis; const T = window.CDTrade;
  const PLAN = { tf: '4h', mode: 'futures', rows: {}, htfRows: {}, bt: {}, btBusy: {}, ath: null, atl: null, analystLv: null, htfLevels: {}, deriv: null, current: null, shown: [] };
  const TFL_ = (tf) => T.TFL[tf];
  const fmtRR = (v) => (isFinite(v) ? v.toFixed(2) + ' : 1' : '—');
  const fmtR = (v) => (isFinite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + 'R' : '—');
  function btBlock(su) {
    const box = el('div', 'cd-bt');
    const b = su.bt;
    if (!b) { box.append(el('p', 'cd-card-note', PLAN.btBusy[PLAN.tf] ? 'Menguji aturan ini ke data historis…' : 'Uji historis belum tersedia (lilin kurang dari 260).')); return box; }
    const f = b.filtered, a = b.all;
    const line = (lab, x) => {
      const p = el('p'); p.append(el('span', 'lbl', lab));
      if (!x || !x.n) { p.append('Tidak ada sinyal pada periode uji.'); return p; }
      const wr = el('strong', x.winrate >= 55 ? 'cd-pos' : x.winrate < 45 ? 'cd-neg' : null, 'winrate ' + x.winrate.toFixed(0) + '%');
      const ex = el('strong', x.expR > 0 ? 'cd-pos' : 'cd-neg', fmtR(x.expR) + '/transaksi');
      p.append(x.n + ' sinyal · ', wr, ' · TP2 tercapai ' + x.tp2Rate.toFixed(0) + '% · ', ex, ' · profit factor ' + (isFinite(x.pf) ? x.pf.toFixed(2) : '∞') + ' · rugi beruntun maks ' + x.maxLS + ' · drawdown maks ' + x.maxDD.toFixed(1) + 'R · rata-rata ' + x.avgBars.toFixed(0) + ' lilin');
      if (x.n < 15) p.append(el('span', 'cd-muted', ' (sampel kecil, belum bisa diandalkan)'));
      return p;
    };
    box.append(el('h4', 'cd-bt-title', 'Uji historis ' + C.tgl(b.from.slice(0, 10)) + ' – ' + C.tgl(b.to.slice(0, 10)) + ' (' + b.bars + ' lilin ' + TFL_(PLAN.tf) + ')'));
    box.append(line('Dengan filter (searah tren, RSI tidak ekstrem, level ≥2 sentuhan, R:R ≥1,5)', f), line('Tanpa filter', a));
    if (f && f.halves && f.halves[0].n >= 6 && f.halves[1].n >= 6) {
      const [h1, h2] = f.halves; const same = (h1.expR > 0) === (h2.expR > 0);
      box.append(el('p', 'cd-card-note', 'Konsistensi (paruh awal vs paruh akhir): ' + h1.winrate.toFixed(0) + '% / ' + fmtR(h1.expR) + ' lalu ' + h2.winrate.toFixed(0) + '% / ' + fmtR(h2.expR) + '. ' + (same ? 'Hasilnya searah di kedua paruh, jadi kecil kemungkinan hanya kebetulan.' : 'Hasilnya berbalik antarparuh: keunggulan aturan ini belum stabil.')));
    }
    return box;
  }
  function planCard(su, plan) {
    const card = el('article', 'cd-card cd-setup ' + (su.side > 0 ? 'is-long' : 'is-short'));
    const head = el('div', 'cd-coin-head');
    const ttl = el('h3', 'cd-card-title cd-setup-title'); ttl.append(el('span', 'cd-side ' + (su.side > 0 ? 'long' : 'short'), su.side > 0 ? 'LONG' : 'SHORT'), ' ', su.name.replace(/^(Long|Short) /, ''));
    head.append(ttl, el('span', 'cd-chip ' + su.conf.cls, 'Konfluensi ' + su.conf.score + '/100'));
    card.append(head, el('span', 'cd-chip cd-status ' + su.status.cls, su.status.txt));
    const tbl = el('table', 'cd-table cd-plan-table'); const tb = el('tbody');
    const row = (k, v, extra, cls) => { const tr = el('tr', cls); tr.append(el('th', null, k), el('td', 'num', v), el('td', 'num cd-muted', extra || '')); tb.append(tr); };
    if (su.trigger !== null) row('Pemicu', (su.side > 0 ? 'Tutup > ' : 'Tutup < ') + usd(su.trigger), C.pct(dist(su.trigger, plan.price)) + ' dari harga');
    row('Entry', su.entryLo === su.entryHi ? usd(su.entry) : usd(su.entryLo) + ' – ' + usd(su.entryHi), su.entryLo === su.entryHi ? C.pct(dist(su.entry, plan.price)) + ' dari harga' : 'acuan ' + usd(su.entry), 'cd-row-entry');
    row('Stop loss', usd(su.sl), su.riskPct.toFixed(2) + '% dari entry', 'cd-row-sl');
    su.tps.forEach((t, i) => row('Take profit ' + (i + 1), usd(t.p), C.pct(t.pct) + ' · R:R ' + fmtRR(t.rr), 'cd-row-tp'));
    tbl.append(tb); const box = el('div', 'cd-table-box'); box.append(tbl); card.append(box);
    if (PLAN.mode === 'futures') {
      const fx = el('div', 'cd-fut');
      const lev = su.levFinal;
      const p1 = el('p'); p1.append(el('span', 'lbl', 'Leverage maksimal yang wajar'), el('strong', null, '≤ ' + lev + '×'), ' · perkiraan likuidasi pada ' + lev + '×: ' + usd(T.liqPrice(su.side, su.entry, lev)));
      const why = 'Dari jarak stop (' + su.riskPct.toFixed(2) + '%), likuidasi tetap minimal dua kali lebih jauh dari stop sampai ' + su.maxLev + '×' + (PLAN.risk ? '; profil risiko koin ini membatasi ' + PLAN.risk.levCap + '× karena volatilitas hariannya' : '') + '. Yang dipakai adalah angka terkecil. Perhitungan memakai asumsi margin isolated dan maintenance margin 0,5%; harga likuidasi resmi tetap lihat di bursa.';
      fx.append(p1, el('p', 'cd-card-note', why));
      card.append(fx);
    }
    card.append(btBlock(su));
    const det = el('details', 'cd-conf'); det.append(el('summary', null, 'Rincian konfluensi (' + su.conf.label.toLowerCase() + ')'));
    const ul = el('ul'); su.conf.factors.forEach((f) => { const li = el('li', f.ok ? 'ok' : 'no'); li.append(el('span', 'mk', f.ok ? '✓' : '✗'), f.label, el('span', 'pt', f.pts + '/' + f.max)); ul.append(li); }); det.append(ul); card.append(det);
    const d = el('div', 'cd-prose cd-setup-why');
    d.append(el('p', null, su.logic));
    const tpb = el('p'); tpb.append(el('span', 'lbl', 'Dasar target'), su.tps.map((t, i) => 'TP' + (i + 1) + ': ' + t.basis).join(' · ')); d.append(tpb);
    const slb = el('p'); slb.append(el('span', 'lbl', 'Dasar stop loss'), su.slBasis + ' (ATR ' + TFL_(plan.tf) + ' ≈ ' + usd(plan.atr) + ').'); d.append(slb);
    d.append(el('p', 'inv', su.invalidation));
    card.append(d);
    return card;
  }
  function computePlan() {
    const tf = PLAN.tf; const rows = PLAN.rows[tf];
    if (!rows || rows.length < 60) return null;
    return T.plan(rows, tf, { ath: tf === '1day' ? PLAN.ath : null, atl: tf === '1day' ? PLAN.atl : null, analyst: PLAN.analystLv, htfLevels: tf !== '1day' ? PLAN.htfLevels['1day'] : null, htfRows: PLAN.htfRows[tf], deriv: PLAN.deriv, bt: PLAN.bt[tf] });
  }
  function runBacktest(tf) {
    if (PLAN.bt[tf] || PLAN.btBusy[tf] || !PLAN.rows[tf] || PLAN.rows[tf].length < 260) return;
    PLAN.btBusy[tf] = true; document.getElementById('bt-status').textContent = 'Menguji keempat skenario ke data historis ' + TFL_(tf) + '…';
    setTimeout(() => {
      try { PLAN.bt[tf] = T.backtest(PLAN.rows[tf], tf, { fee: 0.001, maxBars: tf === '1day' ? 760 : 800 }); } catch (e) { console.warn('backtest', e); PLAN.bt[tf] = null; }
      PLAN.btBusy[tf] = false; if (PLAN.tf === tf) renderPlan();
    }, 40);
  }
  function renderPlan() {
    const tf = PLAN.tf;
    document.querySelectorAll('#plan-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === tf)));
    document.querySelectorAll('#mode-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === PLAN.mode)));
    const grid = document.getElementById('plan-setups'), ctx = document.getElementById('plan-ctx'), notes = document.getElementById('plan-notes'), best = document.getElementById('plan-best'), bts = document.getElementById('bt-status');
    const rows = PLAN.rows[tf];
    if (rows === undefined) { grid.replaceChildren(el('div', 'cd-card dash-skeleton', '—')); return; }
    const plan = computePlan(); PLAN.current = plan;
    if (!plan) { grid.replaceChildren(el('p', 'cd-card-note', 'Lilin ' + TFL_(tf) + ' untuk koin ini belum tersedia atau terlalu sedikit, jadi rencana trading belum bisa dihitung.' + (tf !== '1day' ? ' Coba timeframe 1 hari.' : ''))); ctx.replaceChildren(); notes.replaceChildren(); best.replaceChildren(); bts.textContent = ''; fillCalcOptions([]); return; }
    runBacktest(tf);
    const S = plan.S, dv = PLAN.deriv;
    ctx.replaceChildren();
    const items = [['Harga', usd(plan.price)], ['Tren ' + TFL_(tf), S.trend], ['Tren ' + TFL_(T.HTF[tf]), plan.htfS ? plan.htfS.trend : '—'], ['RSI 14', S.rsi14 !== null ? S.rsi14.toFixed(1) : '—'], ['ATR', usd(plan.atr) + ' (' + S.atr_pct.toFixed(2) + '%)']];
    if (PLAN.mode === 'futures') {
      items.push(['Funding / 8 jam', dv && isFinite(dv.funding) ? (dv.funding >= 0 ? '+' : '') + (dv.funding * 100).toFixed(4) + '%' : '—']);
      items.push(['Open interest', dv && isFinite(dv.oiUsd) ? C.compact(dv.oiUsd) : '—']);
      items.push(['Rasio akun long/short', dv && isFinite(dv.lsr) ? dv.lsr.toFixed(2) : '—']);
    }
    items.forEach(([k, v]) => { const x = el('div'); x.append(el('span', 'lbl', k), el('strong', null, v)); ctx.append(x); });
    const shown = plan.setups.filter((su) => PLAN.mode === 'futures' || su.side > 0); PLAN.shown = shown;
    shown.forEach((su) => { su.levFinal = Math.max(1, Math.min(su.maxLev, PLAN.risk ? PLAN.risk.levCap : su.maxLev)); });
    grid.replaceChildren(...shown.map((su) => planCard(su, plan)));
    // Best setup summary.
    const cand = shown.filter((su) => su.status.live).sort((a, b) => score(b) - score(a));
    best.replaceChildren();
    const b0 = cand[0];
    if (!b0 || b0.conf.score < 50) {
      best.append(el('strong', null, 'Belum ada skenario berkualitas di timeframe ' + TFL_(tf) + '.'), ' Semua skenario memiliki konfluensi di bawah 50 atau sudah batal. Menunggu harga mencapai level yang lebih baik juga merupakan keputusan trading yang sah.');
    } else {
      const bt = b0.bt && b0.bt.filtered;
      best.append(el('span', 'lbl', 'Bobot terbaik saat ini'), el('strong', null, b0.name + ' · konfluensi ' + b0.conf.score + '/100' + (PLAN.mode === 'futures' ? ' · leverage ≤ ' + b0.levFinal + '×' : '')),
        ' — entry ' + (b0.entryLo === b0.entryHi ? usd(b0.entry) : usd(b0.entryLo) + '–' + usd(b0.entryHi)) + ', stop ' + usd(b0.sl) + ', TP1 ' + usd(b0.tps[0].p) + ', TP2 ' + usd(b0.tps[1].p) + '. ' +
        (bt && bt.n >= 15 ? 'Secara historis aturan ini (dengan filter) menghasilkan winrate ' + bt.winrate.toFixed(0) + '% dan ' + fmtR(bt.expR) + ' per transaksi pada ' + bt.n + ' sinyal. ' : bt ? 'Sampel uji historis masih kecil (' + bt.n + ' sinyal). ' : '') + b0.status.txt + '.');
    }
    const bt = PLAN.bt[tf];
    bts.textContent = PLAN.btBusy[tf] ? 'Menguji keempat skenario ke data historis ' + TFL_(tf) + '…' : bt ? 'Uji historis: aturan yang sama dijalankan lilin demi lilin tanpa melihat data masa depan. Entry di zona (order limit) atau saat penutupan menembus level; 50% posisi ditutup di TP1 lalu stop digeser ke harga entry; sisanya di TP2; batas waktu ' + ({ '1h': 72, '4h': 60, '1day': 45 }[tf]) + ' lilin; biaya 0,1% pulang-pergi sudah dipotong. "Menang" berarti TP1 tercapai sebelum stop loss.' : '';
    const ns = plan.notes.slice();
    ns.push('Winrate dan R:R saling tarik: target dekat menaikkan winrate tetapi memperkecil untung per transaksi. Yang menentukan profit jangka panjang adalah ekspektasi (rata-rata R per transaksi), bukan winrate saja.');
    ns.push('Pengelolaan posisi yang dipakai di uji historis: ambil 50% di TP1, geser stop ke harga entry (impas), sisanya menuju TP2. TP3 adalah target lanjutan bila momentum kuat.');
    notes.replaceChildren(el('h3', 'cd-sub', 'Catatan untuk timeframe ' + TFL_(tf)), ...ns.map((t) => el('p', null, t)));
    document.getElementById('see-chart').href = 'chart.html?s=' + encodeURIComponent(P.sym) + '&id=' + encodeURIComponent(P.id) + '&tf=' + tf + '&plan=1';
    fillCalcOptions(shown);
  }
  const score = (su) => su.conf.score + (su.bt && su.bt.filtered && su.bt.filtered.n >= 15 ? Math.max(-10, Math.min(10, su.bt.filtered.expR * 10)) : 0);
  function fillCalcOptions(shown) {
    const sel = document.getElementById('calc-setup'); const cur = sel.value;
    sel.replaceChildren(...shown.map((su, i) => { const o = el('option', null, su.name); o.value = String(i); return o; }));
    if (cur && +cur < shown.length) sel.value = cur;
    calc();
  }
  function calc() {
    const out = document.getElementById('calc-out'), warn = document.getElementById('calc-warn');
    const cap = num(document.getElementById('calc-cap').value), risk = num(document.getElementById('calc-risk').value), k = +document.getElementById('calc-setup').value;
    const lev = Math.max(1, num(document.getElementById('calc-lev').value) || 1), fee = Math.max(0, num(document.getElementById('calc-fee').value) || 0) / 100;
    const su = PLAN.shown[k]; warn.replaceChildren();
    if (!su) { out.replaceChildren(); return; }
    if (!(cap > 0) || !(risk > 0)) { out.replaceChildren(el('p', 'cd-card-note', 'Isi modal dan persentase risiko. Contoh: modal $500 dengan risiko 1% berarti rugi maksimal sekitar $5 bila stop loss tersentuh.')); return; }
    const fut = PLAN.mode === 'futures';
    const riskUsd = cap * risk / 100; const per = Math.abs(su.entry - su.sl) + fee * (su.entry + su.sl);
    let qty = riskUsd / per; let notional = qty * su.entry; let capped = false;
    const maxNotional = fut ? cap * lev : cap;
    if (notional > maxNotional) { qty = maxNotional / su.entry; notional = maxNotional; capped = true; }
    const margin = fut ? notional / lev : notional;
    const pnl = (tp) => qty * su.side * (tp - su.entry) - fee * qty * (su.entry + tp);
    const items = [['Rugi di stop loss (termasuk biaya)', usd(qty * per)], ['Jumlah koin', (qty < 1 ? qty.toPrecision(4) : qty < 1000 ? qty.toFixed(2) : C.compactN(qty)) + ' ' + P.sym], ['Nilai posisi (notional)', usd(notional)], [fut ? 'Margin yang dikunci' : 'Modal yang dipakai', usd(margin) + ' (' + (margin / cap * 100).toFixed(0) + '% modal)']];
    su.tps.forEach((t, i) => items.push(['Untung bersih di TP' + (i + 1), usd(pnl(t.p))]));
    if (fut) {
      const liq = T.liqPrice(su.side, su.entry, lev);
      items.push(['Perkiraan likuidasi pada ' + lev + '×', usd(liq)]);
      const dv = PLAN.deriv;
      if (dv && isFinite(dv.funding)) { const f8 = notional * dv.funding * su.side; items.push(['Funding per 8 jam (saat ini)', (f8 > 0 ? 'bayar ' : 'terima ') + usd(Math.abs(f8))]); }
      const before = su.side > 0 ? liq >= su.sl : liq <= su.sl;
      if (before) warn.append(el('p', 'cd-card-note cd-warn cd-danger', 'Bahaya: pada leverage ' + lev + '×, perkiraan harga likuidasi (' + usd(liq) + ') tercapai sebelum stop loss (' + usd(su.sl) + '). Posisi bisa dilikuidasi sebelum stop sempat bekerja. Turunkan leverage ke ≤ ' + su.levFinal + '×.'));
      else if (lev > su.levFinal) warn.append(el('p', 'cd-card-note cd-warn', 'Leverage ' + lev + '× di atas batas wajar ' + su.levFinal + '× untuk skenario ini: likuidasi terlalu dekat dengan stop loss, sehingga lonjakan harga sesaat (wick) bisa melikuidasi posisi.'));
    }
    if (capped) warn.append(el('p', 'cd-card-note cd-warn', fut ? 'Ukuran posisi ideal melebihi modal × leverage, jadi dibatasi. Risiko nyata di stop menjadi ' + usd(qty * per) + '.' : 'Ukuran posisi ideal melebihi modal karena jarak stop sangat dekat. Tanpa leverage, posisi dibatasi ke seluruh modal; risiko nyata di stop menjadi ' + usd(qty * per) + '.'));
    out.replaceChildren(...items.map(([a, b]) => { const x = el('div'); x.append(el('dt', null, a), el('dd', null, b)); return x; }));
  }
  document.querySelectorAll('#plan-seg button').forEach((b) => b.addEventListener('click', () => { PLAN.tf = b.dataset.tf; renderPlan(); }));
  document.querySelectorAll('#mode-seg button').forEach((b) => b.addEventListener('click', () => { PLAN.mode = b.dataset.mode; renderPlan(); }));
  ['calc-cap', 'calc-risk', 'calc-setup', 'calc-lev', 'calc-fee'].forEach((id) => document.getElementById(id).addEventListener('input', calc));

  /* ---------- risk profile ---------- */
  function renderRisk(r, d, dv) {
    const chip = document.getElementById('risk-score'), grid = document.getElementById('risk-grid'), body = document.getElementById('risk-body');
    if (!r) { chip.textContent = 'Data kurang'; grid.replaceChildren(); body.replaceChildren(el('p', 'cd-card-note', 'Lilin harian kurang dari 60, jadi profil risiko belum bisa dihitung.')); return; }
    chip.textContent = 'Risiko ' + r.label + ' · ' + r.score + '/10'; chip.className = 'cd-chip ' + (r.score <= 3 ? 'up' : r.score <= 5 ? 'flat' : 'down');
    const items = [['Volatilitas 30 hari (tahunan)', r.vol30.toFixed(0) + '%'], ['Volatilitas 1 tahun', r.vol365.toFixed(0) + '%'], ['Rentang harian rata-rata (ATR)', r.atrPct.toFixed(2) + '%'],
      ['Drawdown terdalam 1 tahun', r.mdd.toFixed(1) + '%'], ['Hari terburuk 1 tahun', pct(r.worst)], ['Hari terbaik 1 tahun', pct(r.best)],
      ['VaR 95% (1 hari)', pct(r.var95)], ['Rata-rata 5% hari terburuk (CVaR)', pct(r.cvar95)], ['Beta / korelasi vs BTC (90 hari)', r.beta !== null ? r.beta.toFixed(2) + ' / ' + r.corr.toFixed(2) : '—'],
      ['Leverage maksimal yang wajar', '≤ ' + r.levCap + '×']];
    if (dv && isFinite(dv.funding)) items.push(['Funding tahunan (perkiraan)', pct(dv.funding * 3 * 365 * 100)]);
    grid.replaceChildren(...items.map(([k, v]) => { const x = el('div'); x.append(el('dt', null, k), el('dd', null, v)); return x; }));
    const ps = [];
    ps.push(el('p', null, 'Skor ' + r.score + '/10 disusun dari ' + r.why.join(', ') + '.'));
    ps.push(el('p', null, 'VaR 95% sebesar ' + pct(r.var95) + ' berarti pada 1 dari 20 hari, harga turun lebih dari angka itu. Pada hari-hari buruk tersebut, rata-ratanya ' + pct(r.cvar95) + '. Untuk posisi futures dengan leverage L×, kerugian margin pada hari seperti itu kira-kira L kali angka ini. Misalnya pada 5×, sekitar ' + pct(r.cvar95 * 5) + ' dari margin.'));
    ps.push(el('p', null, 'Drawdown terdalam setahun terakhir ' + r.mdd.toFixed(1) + '% (dari ' + C.tgl(r.mddFrom.slice(0, 10)) + ' ke ' + C.tgl(r.mddTo.slice(0, 10)) + '). Angka ini menunjukkan seberapa dalam harga bisa jatuh dari puncak; pemegang spot harus siap menahan penurunan sebesar itu.'));
    ps.push(el('p', null, 'Batas leverage ' + r.levCap + '× diambil dari rentang harian rata-rata: dengan leverage di atasnya, satu hari bergerak normal (sekitar 3 ATR dalam kondisi ramai) sudah bisa menghabiskan sebagian besar margin. Batas di kartu skenario bisa lebih kecil karena mengikuti jarak stop masing-masing.'));
    if (r.beta !== null && d && d.symbol !== 'BTC') ps.push(el('p', null, 'Beta ' + r.beta.toFixed(2) + ' berarti saat BTC bergerak 1%, koin ini rata-rata bergerak sekitar ' + r.beta.toFixed(2) + '%. ' + (r.corr > 0.7 ? 'Korelasinya tinggi, jadi long koin ini bersamaan dengan long BTC hampir sama dengan menggandakan taruhan pada arah yang sama.' : 'Korelasinya sedang, jadi koin ini kadang bergerak sendiri.')));
    if (dv && isFinite(dv.funding)) ps.push(el('p', null, 'Funding saat ini ' + (dv.funding * 100).toFixed(4) + '% per 8 jam (' + dv.source + '). ' + (dv.funding > 0.0003 ? 'Positif tinggi: posisi long sedang ramai dan membayar short; long yang ditahan lama terkena biaya, dan likuidasi berantai ke bawah lebih mungkin terjadi.' : dv.funding < -0.0001 ? 'Negatif: posisi short membayar long; pantulan tajam akibat short squeeze lebih mungkin terjadi.' : 'Netral: tidak ada sisi yang terlalu ramai.') + (isFinite(dv.lsr) ? ' Rasio akun long/short ' + dv.lsr.toFixed(2) + '.' : '')));
    body.replaceChildren(...ps);
  }

  /* ---------- multi-timeframe & advanced technicals ---------- */
  function renderMTF(map) {
    const tb = document.querySelector('#mtf-table tbody');
    const rows = [['1 minggu', map['1week']], ['1 hari', map['1day']], ['4 jam', map['4h']], ['1 jam', map['1h']]].map(([l, r]) => A.mtfRow(l, r));
    tb.replaceChildren(...rows.map((x) => {
      const tr = el('tr'); tr.append(el('td', 'sym', x.label));
      if (x.na) { const td = el('td', 'cd-muted', 'Data tidak tersedia'); td.colSpan = 7; tr.append(td); return tr; }
      const S = x.S; const tc = /^Naik/.test(S.trend) ? 'cd-pos' : /^Turun/.test(S.trend) ? 'cd-neg' : '';
      const sc = S.short_term === 'Kuat' ? 'cd-pos' : S.short_term === 'Lemah' ? 'cd-neg' : '';
      const mh = S.macd_hist === null ? '—' : (S.macd_hist >= 0 ? 'Positif' : 'Negatif') + (S.macd_hist_prev !== null ? (S.macd_hist > S.macd_hist_prev ? ', menguat' : ', melemah') : '');
      tr.append(el('td', tc, S.trend), el('td', sc, S.short_term), el('td', 'num', S.rsi14 !== null ? S.rsi14.toFixed(1) : '—'), el('td', S.macd_hist >= 0 ? 'cd-pos' : 'cd-neg', mh),
        el('td', 'num ' + C.sgnCls(x.vs50), x.vs50 === null ? '—' : pct(x.vs50)), el('td', 'num ' + C.sgnCls(x.vs200), x.vs200 === null ? '—' : pct(x.vs200)), el('td', 'num', S.adx14 !== null ? S.adx14.toFixed(1) : '—'));
      return tr;
    }));
    const ok = rows.filter((x) => !x.na);
    const ups = ok.filter((x) => /^Naik/.test(x.S.trend)).length, downs = ok.filter((x) => /^Turun/.test(x.S.trend)).length;
    return ok.length ? (ups === ok.length ? 'Semua timeframe menunjukkan tren naik: arah pasar selaras.' : downs === ok.length ? 'Semua timeframe menunjukkan tren turun: arah pasar selaras ke bawah.' : 'Arah antartimeframe belum selaras (' + ups + ' naik, ' + downs + ' turun, ' + (ok.length - ups - downs) + ' menyamping). Dalam kondisi ini timeframe yang lebih besar biasanya lebih menentukan, sedangkan timeframe kecil dipakai untuk mencari titik masuk.') : '';
  }
  function renderAdvanced(dRows, hRows, dS) {
    const tb = document.querySelector('#sig-table tbody'), body = document.getElementById('adv-body');
    if (!dRows || dRows.length < 30) { tb.replaceChildren(); body.replaceChildren(el('p', 'cd-card-note', 'Lilin harian belum cukup untuk analisis lanjutan.')); return; }
    const tech = C.techCalc(dRows);
    const pat = A.candlePattern(dRows), pat4 = hRows && hRows.length > 5 ? A.candlePattern(hRows) : null, div = A.divergence(tech), cross = A.maCross(tech), ob = A.obv(dRows);
    const extras = [pat && Object.assign({ label: 'Pola lilin harian terakhir' }, pat), div && Object.assign({ label: 'Divergensi RSI' }, div), cross && Object.assign({ label: 'Persilangan MA50/MA200' }, cross), ob && Object.assign({ label: 'On-Balance Volume' }, ob)];
    const st = A.signalTable(dS, extras); EX.sig = st;
    tb.replaceChildren(...st.rows.map((r) => { const tr = el('tr'); tr.append(el('td', null, r.name), el('td', 'num', r.value), el('td', null, r.reading), el('td', 'num ' + (r.sig > 0 ? 'cd-pos' : r.sig < 0 ? 'cd-neg' : ''), r.sig > 0 ? '+' : r.sig < 0 ? '−' : '0')); return tr; }));
    const sc = document.getElementById('sig-score'); sc.textContent = 'Skor sinyal ' + (st.score > 0 ? '+' : '') + st.score + ' dari ' + st.rows.length + ' indikator'; sc.className = 'cd-chip ' + (st.score >= 3 ? 'up' : st.score <= -3 ? 'down' : 'flat');
    const fib = A.fibonacci(dRows, 180); const ftb = document.querySelector('#fib-table tbody');
    if (fib) {
      document.getElementById('fib-note').textContent = 'Dari swing ' + (fib.up ? 'terendah ' + usd(fib.lo) + ' (' + C.tgl(fib.loT.slice(0, 10)) + ') ke tertinggi ' + usd(fib.hi) + ' (' + C.tgl(fib.hiT.slice(0, 10)) + ')' : 'tertinggi ' + usd(fib.hi) + ' (' + C.tgl(fib.hiT.slice(0, 10)) + ') ke terendah ' + usd(fib.lo) + ' (' + C.tgl(fib.loT.slice(0, 10)) + ')') + ' dalam 180 hari. Level 38,2%, 50%, dan 61,8% paling sering diperhatikan pasar; level 127,2% dan 161,8% adalah perpanjangan untuk target.';
      ftb.replaceChildren(...fib.levels.map((l) => { const tr = el('tr', fib.nearest === l ? 'cd-row-near' : null); tr.append(el('td', null, (l.ext ? 'Ext ' : '') + (l.r * 100).toFixed(1).replace('.0', '') + '%'), el('td', 'num', usd(l.p)), el('td', 'num ' + C.sgnCls(dist(l.p, fib.price)), pct(dist(l.p, fib.price)))); return tr; }));
    }
    const para = (h, t) => { const x = el('div', 'cd-para'); x.append(el('h3', 'cd-sub', h), el('p', null, t)); return x; };
    const parts = [];
    if (pat) parts.push(para('Pola lilin harian: ' + pat.name, pat.txt + ' (lilin ' + C.tgl(pat.time.slice(0, 10)) + ').'));
    if (pat4) parts.push(para('Pola lilin 4 jam: ' + pat4.name, pat4.txt));
    if (div) parts.push(para(div.name, div.txt));
    if (cross) parts.push(para(cross.name, cross.txt));
    if (ob) parts.push(para(ob.name, ob.txt));
    if (fib) parts.push(para('Posisi terhadap Fibonacci', 'Harga paling dekat dengan level ' + (fib.nearest.r * 100).toFixed(1).replace('.0', '') + '% (' + usd(fib.nearest.p) + '). ' + (fib.up ? 'Selama harga bertahan di atas level 61,8% (' + usd(fib.levels[4].p) + '), kenaikan dari swing terendah masih dianggap utuh.' : 'Selama harga di bawah level 61,8% (' + usd(fib.levels[4].p) + '), pantulan dari swing terendah masih dianggap koreksi dalam tren turun.')));
    body.replaceChildren(...parts);
  }
  function renderFund(d, btc) {
    const f = A.fundamentals(d, btc); EX.fund = f;
    const tb = document.querySelector('#fund-table tbody');
    tb.replaceChildren(...f.rows.map((r) => { const tr = el('tr'); tr.append(el('td', null, r.factor), el('td', 'num', r.value), el('td', null, r.reading), el('td', 'num ' + (r.sig > 0 ? 'cd-pos' : r.sig < 0 ? 'cd-neg' : ''), r.sig > 0 ? '+' : r.sig < 0 ? '−' : '0')); return tr; }));
    const v = document.getElementById('fund-verdict'); v.textContent = f.verdict + ' (skor ' + (f.score > 0 ? '+' : '') + f.score + ')'; v.className = 'cd-chip ' + f.cls;
    const pos = f.rows.filter((r) => r.sig > 0).map((r) => r.factor.toLowerCase()), neg = f.rows.filter((r) => r.sig < 0).map((r) => r.factor.toLowerCase());
    const body = document.getElementById('fund-body'); const ps = [];
    if (pos.length) ps.push(el('p', null, 'Kekuatan: ' + pos.join(', ') + '.'));
    if (neg.length) ps.push(el('p', null, 'Kelemahan: ' + neg.join(', ') + '.'));
    ps.push(el('p', null, 'Cara membacanya: teknikal menjawab kapan harga cenderung bergerak, fundamental menjawab apakah aset ini layak dipegang lebih lama. Koin dengan fundamental lemah (likuiditas rendah, dilusi besar, umur muda) sebaiknya diperlakukan sebagai trading jangka pendek dengan ukuran posisi kecil, walaupun sinyal teknikalnya bagus.'));
    if (d && d.dev && !isFinite(num(d.dev.commits4w))) ps.push(el('p', 'cd-card-note', 'Data aktivitas developer tidak tersedia untuk koin ini di CoinGecko.'));
    body.replaceChildren(...ps);
  }


  /* ---------- v8: realtime, performance, supply, markets, executive summary ---------- */
  const L = window.CDLive; const EX = {};
  function liveHooks() {
    if (!L) return;
    L.strip(document.getElementById('strip')); L.statusBadge(document.getElementById('live'));
    const pr = document.getElementById('coin-price'); pr.dataset.live = P.sym;
    const c = document.getElementById('coin-chg-v'); if (c) { c.dataset.live = P.sym; c.dataset.liveField = 'chg'; }
    L.watch([P.sym]);
  }
  function perf(d) {
    const dl = document.getElementById('perf-grid'); if (!dl) return;
    const items = [['1 jam', d.percent_change_1h], ['24 jam', d.percent_change_24h], ['7 hari', d.percent_change_7d], ['14 hari', d.percent_change_14d], ['30 hari', d.percent_change_30d], ['60 hari', d.percent_change_60d], ['200 hari', d.percent_change_200d], ['1 tahun', d.percent_change_1y]];
    dl.replaceChildren(...items.map(([k, v]) => { const x = el('div'); x.append(el('dt', null, k), el('dd', C.sgnCls(v), pct(v))); return x; }));
    const box = document.getElementById('supply'); if (!box) return;
    const max = isFinite(num(d.max)) && d.max > 0 ? d.max : null, tot = isFinite(num(d.total)) && d.total > 0 ? d.total : null, circ = num(d.circ);
    const base = max || tot; if (!isFinite(circ) || !base) { box.replaceChildren(el('p', 'cd-card-note', 'Data suplai tidak lengkap di CoinGecko.')); return; }
    const tr = el('div', 'track'); const f = el('div', 'fill'); f.style.width = Math.min(100, circ / base * 100) + '%'; tr.append(f);
    if (max && tot && tot > circ) { const f2 = el('div', 'fill2'); f2.style.left = (circ / base * 100) + '%'; f2.style.width = Math.max(0, Math.min(100, tot / base * 100) - circ / base * 100) + '%'; tr.append(f2); }
    const cap = el('div', 'cap'); cap.append(el('span', null, 'Beredar ' + compactN(circ) + ' (' + (circ / base * 100).toFixed(1) + '%)'), el('span', null, tot ? 'Total ' + compactN(tot) : ''), el('span', null, max ? 'Maksimum ' + compactN(max) : 'Tanpa batas maksimum'));
    const dil = d.fdv && d.market_cap ? d.fdv / d.market_cap : null;
    box.replaceChildren(tr, cap, el('p', 'cd-card-note', (dil ? 'FDV ' + dil.toFixed(2) + '× kapitalisasi. ' : '') + (dil && dil > 1.5 ? 'Masih banyak token yang belum beredar; rilis token (unlock) bisa menambah tekanan jual.' : dil ? 'Sebagian besar token sudah beredar, jadi risiko dilusi relatif kecil.' : '') + (max ? '' : ' Suplai tidak dibatasi, jadi nilai jangka panjang bergantung pada laju penerbitan dan pembakaran token.')));
  }
  async function markets() {
    const tb = document.querySelector('#mkts-table tbody'); if (!tb || !P.id) return;
    try {
      const rows = await C.fetchTickers(P.id); const tot = rows.reduce((a, r) => a + r.vol, 0);
      document.getElementById('mkts-note').textContent = 'Pasar dengan volume terbesar menurut CoinGecko. Spread = selisih harga beli dan jual; kedalaman ±2% = dana yang dibutuhkan untuk menggerakkan harga 2%. Makin tipis spread dan makin dalam order book, makin kecil slippage.';
      tb.replaceChildren(...rows.filter((r) => !r.stale).slice(0, 12).map((r) => { const tr = el('tr'); const ex = el('td'); const u = C.safeUrl(r.url); ex.append(u ? C.link(u, null, r.ex, true) : r.ex);
        const trust = el('td'); trust.append(el('span', 'cd-chip ' + (r.trust === 'green' ? 'up' : r.trust === 'red' ? 'down' : 'flat'), r.trust === 'green' ? 'Baik' : r.trust === 'red' ? 'Lemah' : 'Sedang'));
        tr.append(ex, el('td', null, r.base + '/' + r.target), el('td', 'num', usd(r.price)), el('td', 'num', compact(r.vol)), el('td', 'num', tot ? (r.vol / tot * 100).toFixed(1) + '%' : '—'), el('td', 'num', isFinite(num(r.spread)) ? num(r.spread).toFixed(3) + '%' : '—'), el('td', 'num cd-hide-sm', compact(r.up2) + ' / ' + compact(r.down2)), trust); return tr; }));
    } catch (e) { tb.replaceChildren(); document.getElementById('mkts-note').textContent = 'Daftar bursa belum bisa dimuat dari CoinGecko (batas permintaan mungkin tercapai). Coba muat ulang sebentar lagi.'; }
  }
  function execSummary() {
    const box = document.getElementById('exec'); if (!box) return;
    const items = []; let score = 0; const add = (pts, txt) => { score += pts; items.push([pts, txt]); };
    if (EX.dS) add(EX.dS.trend === 'Naik' ? 2 : EX.dS.trend === 'Turun' ? -2 : 0, 'Tren harian ' + EX.dS.trend.toLowerCase() + (EX.hS ? ', tren 4 jam ' + EX.hS.trend.toLowerCase() : '') + '. RSI harian ' + f1(EX.dS.rsi14) + '.');
    if (EX.sig) add(EX.sig.score >= 3 ? 1 : EX.sig.score <= -3 ? -1 : 0, 'Tabel sinyal teknikal: skor ' + (EX.sig.score > 0 ? '+' : '') + EX.sig.score + ' dari ' + EX.sig.rows.length + ' indikator.');
    if (EX.fund) add(EX.fund.score >= 2 ? 1 : EX.fund.score <= -2 ? -1 : 0, EX.fund.verdict + ' (skor ' + (EX.fund.score > 0 ? '+' : '') + EX.fund.score + ').');
    if (PLAN.risk) add(PLAN.risk.score >= 8 ? -1 : 0, 'Risiko ' + PLAN.risk.label.toLowerCase() + ' (' + PLAN.risk.score + '/10): volatilitas 30 hari ' + PLAN.risk.vol30.toFixed(0) + '% per tahun, VaR 95% ' + pct(PLAN.risk.var95) + ' per hari, leverage wajar ≤ ' + PLAN.risk.levCap + '×.');
    if (PLAN.deriv && isFinite(PLAN.deriv.funding)) { const fr = PLAN.deriv.funding * 100; add(fr > 0.03 ? -1 : fr < -0.01 ? 1 : 0, 'Funding ' + pct(fr, 4) + ' per 8 jam' + (fr > 0.03 ? ': long terlalu ramai.' : fr < -0.01 ? ': short ramai, rawan short squeeze.' : ': wajar.')); }
    if (EX.lv) { const s1 = EX.lv.supports[0], r1 = EX.lv.resistances[0]; items.push([null, 'Support terdekat ' + (s1 ? usd(s1.lo) + '–' + usd(s1.hi) : '—') + ', resistance terdekat ' + (r1 ? usd(r1.lo) + '–' + usd(r1.hi) : '—') + '.']); }
    const b = PLAN.current && PLAN.current.best; if (b) items.push([null, 'Skenario ' + ({ '1h': '1 jam', '4h': '4 jam', '1day': 'harian' }[PLAN.tf] || '') + ' terkuat: ' + (b.side > 0 ? 'long' : 'short') + ' (' + b.name.toLowerCase() + '), konfluensi ' + b.conf.score + '/100, entry ' + usd(b.entry) + ', stop ' + usd(b.sl) + '.']);
    if (items.length < 3) { box.hidden = true; return; }
    const label = score >= 3 ? 'Kondisi mendukung kenaikan' : score <= -3 ? 'Kondisi menekan harga' : score > 0 ? 'Campuran, condong positif' : score < 0 ? 'Campuran, condong negatif' : 'Netral';
    box.hidden = false; box.className = 'cd-verdict ' + (score >= 3 ? '' : score <= -3 ? 'bear' : 'flat');
    const ul = el('ul'); items.forEach(([p, t]) => { const li = el('li'); if (p !== null) li.append(el('b', p > 0 ? 'cd-pos' : p < 0 ? 'cd-neg' : null, (p > 0 ? '+' : p < 0 ? '−' : '±') + Math.abs(p) + ' ')); li.append(t); ul.append(li); });
    box.replaceChildren(el('span', 'lbl', 'Ringkasan eksekutif'), el('h3', null, label + ' · skor ' + (score > 0 ? '+' : '') + score), el('p', null, 'Gabungan tren, sinyal teknikal, fundamental, risiko, dan posisi derivatif. Rincian tiap bagian ada di bawah. Ini pembacaan otomatis, bukan rekomendasi.'), ul);
  }

  /* ---------- boot ---------- */
  (async () => {
    const m = await resolve();
    if (m) { header(m); stats(m); perf(m); }
    else { header({ name: P.sym }); }
    liveHooks(); markets();
    let d = m;
    const analystP = C.PORTFOLIO.includes(P.sym) ? C.getJSON('data/levels.json').then((l) => l.filter((x) => x.coin === P.sym)).catch(() => null) : Promise.resolve(null);
    const derivP = T.derivatives(P.sym).catch(() => null);
    try { const det = await C.fetchCoinDetail(P.id); d = Object.assign({}, m || {}, Object.fromEntries(Object.entries(det).filter(([, v]) => v !== undefined && v !== null))); header(d); stats(d); perf(d); about(d); liveHooks(); }
    catch (e) { if (m) about(m); else document.getElementById('about-body').replaceChildren(el('p', null, 'Profil proyek gagal dimuat dari CoinGecko (batas permintaan mungkin tercapai). Coba lagi sebentar.')); }
    analyst(); news(d || { name: P.sym });
    let btc = null; try { const mk = await C.fetchMarkets(); btc = mk.rows.find((x) => x.symbol === 'BTC'); } catch (e) { /* optional */ }
    renderFund(d || {}, btc);
    PLAN.ath = d && d.ath; PLAN.atl = d && d.atl; PLAN.analystLv = await analystP;
    const tfs = ['1week', '1day', '4h', '1h'], lim = { '1week': 300, '1day': 1000, '4h': 1000, '1h': 1000 };
    const res = await Promise.allSettled(tfs.map((tf) => C.fetchCandles(P.sym, tf, lim[tf], tf === '1day' ? P.id : undefined)));
    const map = {}; tfs.forEach((tf, i) => { map[tf] = res[i].status === 'fulfilled' ? res[i].value.rows : null; });
    ['1h', '4h', '1day'].forEach((tf) => { PLAN.rows[tf] = map[tf]; PLAN.htfRows[tf] = map[T.HTF[tf]]; });
    if (!map['4h'] || map['4h'].length < 60) PLAN.tf = map['1day'] && map['1day'].length >= 60 ? '1day' : PLAN.tf;
    const dRows = map['1day'] || [];
    const dS = dRows.length >= 30 ? C.summarize(C.techCalc(dRows)) : null;
    const hS = map['4h'] && map['4h'].length >= 30 ? C.summarize(C.techCalc(map['4h'])) : null;
    if (dRows.length) spark(dRows);
    const lv = dRows.length ? A.levels(dRows, '1day', PLAN.analystLv) : { supports: [], resistances: [] };
    PLAN.htfLevels['1day'] = dRows.length >= 60 ? lv : null;
    const a = analyze(dS, hS, lv, d);
    const mtfTxt = renderMTF(map);
    if (mtfTxt) a.html.splice(1, 0, ['Keselarasan antartimeframe', mtfTxt]);
    renderAnalysis(a);
    renderLevels(lv, dS ? dS.close : (d && d.price));
    renderAdvanced(dRows, map['4h'], dS);
    PLAN.deriv = await derivP;
    let btcDaily = null;
    if (P.sym !== 'BTC') { try { btcDaily = (await C.fetchCandles('BTC', '1day', 1000, 'bitcoin')).rows; } catch (e) { /* optional */ } } else btcDaily = dRows;
    PLAN.risk = T.riskProfile(dRows, btcDaily, d ? Object.assign({ symbol: P.sym }, d) : { symbol: P.sym }, PLAN.deriv);
    renderRisk(PLAN.risk, d ? Object.assign({ symbol: P.sym }, d) : { symbol: P.sym }, PLAN.deriv);
    renderPlan();
    EX.dS = dS; EX.hS = hS; EX.lv = lv; execSummary();
    const day = res[1];
    if (day.status === 'fulfilled') document.querySelector('.cd-analysis .cd-card-note').textContent += ' Sumber lilin: ' + day.value.source + (day.value.synthetic ? ' (harga penutupan harian saja)' : '') + '.';
  })();
})();
