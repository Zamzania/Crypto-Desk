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
    if (isFinite(num(d.percent_change_24h))) { chg.textContent = pct(d.percent_change_24h) + ' 24 jam'; chg.className = 'cd-chip ' + (d.percent_change_24h >= 0 ? 'up' : 'down'); } else chg.hidden = true;
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
      tr.append(el('td', k === 'Support' ? 'cd-pos' : 'cd-neg', k), el('td', 'num', z.lo === z.hi ? usd(z.lo) : usd(z.lo) + ' – ' + usd(z.hi)), el('td', 'num', pct(dist(mid, price))), el('td', 'num', String(z.touches)), el('td', null, tgl(z.last)));
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

  /* ---------- boot ---------- */
  (async () => {
    const m = await resolve();
    if (m) { header(m); stats(m); }
    else { header({ name: P.sym }); }
    let d = m;
    try { const det = await C.fetchCoinDetail(P.id); d = Object.assign({}, m || {}, Object.fromEntries(Object.entries(det).filter(([, v]) => v !== undefined && v !== null))); header(d); stats(d); about(d); }
    catch (e) { if (m) about(m); else document.getElementById('about-body').replaceChildren(el('p', null, 'Profil proyek gagal dimuat dari CoinGecko (batas permintaan mungkin tercapai). Coba lagi sebentar.')); }
    analyst(); news(d || { name: P.sym });
    const [day, h4] = await Promise.allSettled([C.fetchCandles(P.sym, '1day', 400, P.id), C.fetchCandles(P.sym, '4h', 300)]);
    const dRows = day.status === 'fulfilled' ? day.value.rows : [];
    const dS = dRows.length >= 30 ? C.summarize(C.techCalc(dRows)) : null;
    const hS = h4.status === 'fulfilled' && h4.value.rows.length >= 30 ? C.summarize(C.techCalc(h4.value.rows)) : null;
    if (dRows.length) spark(dRows);
    const lv = dRows.length ? C.keyLevels(dRows, { look: 150, w: 4, max: 3, tol: 0.02 }) : { supports: [], resistances: [] };
    renderAnalysis(analyze(dS, hS, lv, d));
    renderLevels(lv, dS ? dS.close : (d && d.price));
    if (day.status === 'fulfilled') document.querySelector('.cd-analysis .cd-card-note').textContent += ' Sumber lilin: ' + day.value.source + (day.value.synthetic ? ' (harga penutupan harian saja)' : '') + '.';
  })();
})();
