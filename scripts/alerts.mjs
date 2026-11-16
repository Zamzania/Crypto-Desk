// Crypto Desk — entry-zone watcher. Runs on GitHub Actions (triggered every few minutes),
// rebuilds the same trade plans the site shows, and pushes a phone notification through ntfy
// when price enters an entry zone, then follows that trade: TP1 (stop to break-even + trailing), TP2, stop loss.
// State lives in data/alerts.json, which the site also reads. Env: NTFY_TOPIC (secret), NTFY_SERVER, ALERT_MIN_CONF.
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const SITE = 'https://zamzania.github.io/Crypto-Desk/';
const MIN_CONF = Number(process.env.ALERT_MIN_CONF || 60);
const TOPIC = (process.env.NTFY_TOPIC || '').trim();
const SERVER = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
const TFS = ['1h', '4h', '1day'];
const TF_MS = { '1h': 3600e3, '4h': 4 * 3600e3, '1day': 864e5 };
const HOLD = { '1h': 72, '4h': 60, '1day': 45 }; // same time stop as the backtest
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------- load the site's own analysis modules ---------- */
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const ctx = { console, fetch, setTimeout, clearTimeout, URL, URLSearchParams, AbortController, Intl, localStorage: mem(), sessionStorage: mem(),
  document: { readyState: 'complete', querySelectorAll: () => [], addEventListener() {} }, matchMedia: () => ({ matches: false }) };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['core', 'analysis', 'smc', 'trade']) vm.runInContext(await readFile(new URL('../assets/' + f + '.js', import.meta.url), 'utf8'), ctx, { filename: f + '.js' });
const { CDCore: C, CDAnalysis: A, CDTrade: T, CDSMC: SMC } = ctx;

/* ---------- state ---------- */
const STATE_FILE = new URL('../data/alerts.json', import.meta.url);
const prev = await readFile(STATE_FILE, 'utf8').then(JSON.parse).catch(() => ({ active: [], history: [] }));
const state = { active: prev.active || [], history: prev.history || [] };
const analyst = await readFile(new URL('../data/levels.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => []);

const usd = C.usd; const pct = (v, d) => C.pct(v, d === undefined ? 1 : d);
const TFL = { '1h': '1 jam', '4h': '4 jam', '1day': '1 hari' };
const sideTxt = (s) => (s > 0 ? 'LONG' : 'SHORT');

async function push(title, message, tags, priority, click) {
  if (!TOPIC) { log('NTFY_TOPIC kosong, notifikasi tidak dikirim:', title); return false; }
  try {
    const r = await fetch(SERVER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: TOPIC, title, message, tags, priority, click }) });
    log('ntfy', r.status, title); return r.ok;
  } catch (e) { log('ntfy gagal', e.message); return false; }
}

function entryMessage(a) {
  const L = [];
  L.push((a.trigger ? 'Breakout terkonfirmasi (lilin ' + TFL[a.tf] + ' tutup ' + (a.side > 0 ? 'di atas ' : 'di bawah ') + usd(a.trigger) + ').' : 'Harga masuk zona entry.') + ' Harga sekarang ' + usd(a.price) + '.');
  L.push('');
  L.push('Entry: ' + (a.entryLo !== a.entryHi ? usd(a.entryLo) + ' – ' + usd(a.entryHi) + ' (limit, bisa dicicil)' : usd(a.entry) + (a.trigger ? ' (limit di retest level breakout)' : '')));
  L.push('Stop loss: ' + usd(a.sl) + ' (' + pct((a.sl / a.entry - 1) * 100) + ')');
  a.tps.forEach((t, i) => L.push('TP' + (i + 1) + ': ' + usd(t.p) + ' (' + t.rr.toFixed(1) + 'R)' + (i === 0 ? ' tutup 50%' : '')));
  L.push('Trailing: setelah TP1, geser SL ke ' + usd(a.entry) + '. Sisa posisi: Trailing Stop aktivasi ' + usd(a.trail.activation) + ', callback ' + a.trail.callback.toFixed(1) + '%.');
  L.push('');
  L.push('Leverage wajar ≤ ' + a.lev + '× (perkiraan likuidasi ' + usd(a.liq) + ') · risiko per transaksi 0,5–1% modal.');
  L.push('Konfluensi ' + a.conf + '/100 · SMC ' + a.smcOk + '/5' + (a.bt && a.bt.n ? ' · uji historis ' + a.bt.n + ' sinyal, winrate ' + a.bt.winrate.toFixed(0) + '%, ekspektasi ' + (a.bt.expR >= 0 ? '+' : '') + a.bt.expR.toFixed(2) + 'R' : ''));
  L.push('Binance Futures: ' + a.sym + 'USDT Perpetual. Bukan nasihat keuangan.');
  return L.join('\n');
}

/* ---------- follow a trade that was already alerted ---------- */
function follow(a, rows1h) {
  const after = rows1h.filter((r) => Date.parse(r.time) + 3600e3 > Date.parse(a.at)); // candles overlapping the alert onward
  let stage = 'open'; const s = a.side; const tp1 = a.tps[0].p, tp2 = (a.tps[1] || a.tps[0]).p;
  for (const r of after) {
    const hi = r.high, lo = r.low; const adv = s > 0 ? hi : lo, bad = s > 0 ? lo : hi;
    if (stage === 'open') { if (s * (bad - a.sl) <= 0) { stage = 'sl'; break; } if (s * (adv - tp1) >= 0) stage = 'tp1'; }
    if (stage === 'tp1') { if (s * (adv - tp2) >= 0) { stage = 'tp2'; break; } if (s * (bad - a.entry) <= 0 && s * (adv - tp1) < 0) { stage = 'be'; break; } }
  }
  if ((stage === 'open' || stage === 'tp1') && Date.now() - Date.parse(a.at) > HOLD[a.tf] * TF_MS[a.tf]) stage = stage === 'open' ? 'expired' : 'expired_tp1';
  return stage;
}
const STAGE_TXT = {
  tp1: (a) => ['TP1 kena ' + a.sym + ' ' + sideTxt(a.side), 'TP1 ' + usd(a.tps[0].p) + ' tercapai. Tutup 50% posisi, geser stop loss ke entry ' + usd(a.entry) + ', lalu pasang Trailing Stop untuk sisa: aktivasi ' + usd(a.trail.activation) + ', callback ' + a.trail.callback.toFixed(1) + '%. Target berikutnya TP2 ' + usd((a.tps[1] || a.tps[0]).p) + '.', ['white_check_mark'], 4],
  tp2: (a) => ['TP2 kena ' + a.sym + ' ' + sideTxt(a.side), 'TP2 ' + usd((a.tps[1] || a.tps[0]).p) + ' tercapai. Kalau trailing stop masih aktif, biarkan berjalan; kalau tidak, tutup sisa posisi.' + (a.tps[2] ? ' TP3 di ' + usd(a.tps[2].p) + '.' : ''), ['tada'], 4],
  sl: (a) => ['Stop loss kena ' + a.sym + ' ' + sideTxt(a.side), 'Harga menyentuh stop loss ' + usd(a.sl) + '. Skenario ' + a.name.toLowerCase() + ' ' + TFL[a.tf] + ' batal. Jangan buka ulang posisi yang sama sebelum ada setup baru.', ['x'], 4],
  be: (a) => ['Keluar di break-even ' + a.sym, 'Setelah TP1, harga kembali ke entry ' + usd(a.entry) + '. Sisa posisi tertutup tanpa rugi.', ['heavy_minus_sign'], 3],
  expired: (a) => ['Setup kedaluwarsa ' + a.sym, 'Skenario ' + a.name.toLowerCase() + ' ' + TFL[a.tf] + ' tidak mencapai TP1 atau SL dalam ' + HOLD[a.tf] + ' lilin. Pertimbangkan menutup posisi sesuai aturan waktu.', ['hourglass'], 3],
  expired_tp1: (a) => ['Setup selesai ' + a.sym, 'Sudah lewat ' + HOLD[a.tf] + ' lilin setelah TP1. Tutup sisa posisi atau biarkan trailing stop bekerja.', ['hourglass'], 3],
};

/* ---------- main ---------- */
let changed = false;
const recentKeys = new Set([...state.active, ...state.history.filter((h) => Date.now() - Date.parse(h.at) < 7 * 864e5)].map((a) => a.key));
for (const sym of C.PORTFOLIO) {
  const id = C.PORTFOLIO_ID[sym];
  const lim = { '1h': 1000, '4h': 1000, '1day': 1000, '1week': 300 };
  const res = await Promise.allSettled(Object.keys(lim).map((tf) => C.fetchCandles(sym, tf, lim[tf], tf === '1day' ? id : undefined)));
  const map = {}; Object.keys(lim).forEach((tf, i) => { map[tf] = res[i].status === 'fulfilled' ? res[i].value.rows : null; if (res[i].status === 'fulfilled') log(sym, tf, res[i].value.rows.length, 'lilin dari', res[i].value.source); else log(sym, tf, 'gagal', String(res[i].reason).slice(0, 80)); });
  if (!map['1h'] || map['1h'].length < 100) continue;
  const price = map['1h'][map['1h'].length - 1].close;

  // 1) follow trades already alerted for this coin
  for (const a of state.active.filter((x) => x.sym === sym)) {
    const st = follow(a, map['1h']);
    if (st !== a.stage) {
      const order = ['open', 'tp1', 'tp2', 'sl', 'be', 'expired', 'expired_tp1'];
      if (a.stage === 'open' && (st === 'tp2' || st === 'be')) { const [t, m, g, p] = STAGE_TXT.tp1(a); await push(t, m, g, p, a.url); }
      const [t, m, g, p] = STAGE_TXT[st](a); await push(t, m, g, p, a.url);
      a.stage = st; a.stageAt = new Date().toISOString(); changed = true;
      if (order.indexOf(st) >= 2) { state.active = state.active.filter((x) => x !== a); state.history.unshift(a); }
    }
  }

  // 2) look for new entries
  const daily = map['1day']; const lv = analyst.filter((x) => x.coin === sym);
  const htfLevels = daily && daily.length >= 60 ? A.levels(daily, '1day', lv) : null;
  const deriv = await T.derivatives(sym).catch(() => null);
  const dAtr = daily && daily.length > 30 ? C.summarize(C.techCalc(daily)).atr_pct : null; // leverage cap uses daily volatility, like the site
  for (const tf of TFS) {
    const rows = map[tf]; if (!rows || rows.length < 260) continue;
    let plan;
    try {
      const bt = T.backtest(rows, tf, { fee: 0.001, maxBars: tf === '1day' ? 760 : 800 });
      plan = T.plan(rows, tf, { analyst: lv, htfLevels: tf !== '1day' ? htfLevels : null, htfRows: map[T.HTF[tf]], deriv, bt });
    } catch (e) { log(sym, tf, 'plan gagal', e.message); continue; }
    const smc = SMC.analyze(rows, tf, { daily, weekly: map['1week'] });
    const lastClosed = rows[rows.length - 2];
    for (const su of plan.setups) {
      if (su.conf.score < MIN_CONF || !su.tps.length) continue;
      const s = su.side; let ready;
      if (su.trigger === null) ready = price >= su.entryLo * 0.997 && price <= su.entryHi * 1.003 && s * (price - su.sl) > 0;
      else ready = s * (lastClosed.close - su.trigger) > 0 && s * (price - su.tps[0].p) < 0 && s * (price - su.sl) > 0;
      if (!ready) continue;
      const btQ = su.bt ? (su.bt.filtered && su.bt.filtered.n >= 10 ? su.bt.filtered : su.bt.all) : null;
      if (btQ && btQ.n >= 15 && !(btQ.expR > 0)) { log(sym, tf, su.key, 'dilewati: ekspektasi historis', btQ.expR.toFixed(2) + 'R'); continue; } // proven losers are not alerted
      const key = [sym, tf, su.key, Number(su.entry.toPrecision(4))].join('|');
      if (recentKeys.has(key)) continue;
      const lev = Math.max(1, Math.min(T.maxLeverage(su.riskPct), Math.floor(1 / (3 * (dAtr || plan.S.atr_pct || 1) / 100)), 10));
      const btK = btQ;
      const a = { key, sym, tf, setup: su.key, name: su.name, side: s, entry: su.entry, entryLo: su.entryLo, entryHi: su.entryHi, trigger: su.trigger, sl: su.sl,
        tps: su.tps.map((t) => ({ p: t.p, rr: t.rr })), conf: su.conf.score, smcOk: SMC.check(su, smc).filter((x) => x.ok).length, trail: T.trailing(su, plan.atr), lev, liq: T.liqPrice(s, su.entry, lev),
        bt: btK && btK.n ? { n: btK.n, winrate: btK.winrate, expR: btK.expR } : null, price, at: new Date().toISOString(), stage: 'open',
        url: SITE + 'coin.html?id=' + id + '&s=' + sym };
      const title = sideTxt(s) + ' ' + sym + ' · ' + TFL[tf] + ' · ' + su.name;
      await push(title, entryMessage(a), [s > 0 ? 'green_circle' : 'red_circle', 'chart_with_upwards_trend'], 5, a.url);
      state.active.unshift(a); recentKeys.add(key); changed = true;
    }
  }
}

state.history = state.history.slice(0, 60);
if (changed) {
  await writeFile(STATE_FILE, JSON.stringify({ updated: new Date().toISOString(), minConf: MIN_CONF, active: state.active, history: state.history }, null, 1));
  log('alerts.json diperbarui:', state.active.length, 'aktif,', state.history.length, 'riwayat');
} else log('tidak ada sinyal baru atau perubahan tahap');
