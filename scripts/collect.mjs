// Crypto Desk collector: builds data/news.json, data/listings.json and data/markets.json.
// Runs on GitHub Actions (Node 20+, no dependencies). Every source is optional: a failure is logged and skipped,
// and an existing file is kept when a whole category fails, so the site never goes blank.
import { readFile, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (compatible; CryptoDeskBot/1.0; +https://zamzania.github.io/Crypto-Desk/)';
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function get(url, { json = true, timeout = 20000 } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'user-agent': UA, accept: json ? 'application/json' : 'application/rss+xml, application/xml, text/xml, */*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return json ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
async function tryGet(name, url, opts) {
  try { const v = await get(url, opts); log('ok  ', name); return v; } catch (e) { log('FAIL', name, String(e.message || e)); return null; }
}
async function readJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }

/* ---------------- coin universe (CoinGecko top 250) ---------------- */
const SKIP = new Set(['usdt', 'usdc', 'dai', 'fdusd', 'tusd', 'usde', 'usds', 'pyusd', 'usdd', 'usd1', 'busd', 'frax', 'gusd', 'lusd', 'eurc', 'rlusd', 'usdtb', 'usd0', 'susde', 'susds', 'bsc-usd', 'usdf', 'usdg', 'bfusd',
  'wbtc', 'weth', 'steth', 'wsteth', 'weeth', 'cbbtc', 'reth', 'meth', 'jitosol', 'msol', 'bnsol', 'cbeth', 'lbtc', 'solvbtc', 'wbeth', 'rseth', 'ezeth', 'tbtc', 'btcb', 'clbtc', 'jupsol', 'wbnb', 'oseth', 'wtrx', 'xaut', 'paxg']);
function mapCG(x) {
  return { id: x.id, symbol: String(x.symbol || '').toUpperCase(), name: x.name, image: x.image, price: x.current_price, rank: x.market_cap_rank, market_cap: x.market_cap, fdv: x.fully_diluted_valuation,
    volume: x.total_volume, circ: x.circulating_supply, total: x.total_supply, max: x.max_supply, ath: x.ath, ath_date: x.ath_date, dd_ath: x.ath_change_percentage, atl: x.atl, high_24h: x.high_24h, low_24h: x.low_24h,
    percent_change_24h: x.price_change_percentage_24h_in_currency ?? x.price_change_percentage_24h, percent_change_7d: x.price_change_percentage_7d_in_currency,
    percent_change_30d: x.price_change_percentage_30d_in_currency, percent_change_1y: x.price_change_percentage_1y_in_currency, last_updated_time: x.last_updated };
}

/* ---------------- news (RSS) ---------------- */
const FEEDS = [
  ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
  ['Cointelegraph', 'https://cointelegraph.com/rss'],
  ['Decrypt', 'https://decrypt.co/feed'],
  ['The Block', 'https://www.theblock.co/rss.xml'],
  ['Bitcoin Magazine', 'https://bitcoinmagazine.com/.rss/full/'],
  ['CryptoSlate', 'https://cryptoslate.com/feed/'],
  ['CryptoPotato', 'https://cryptopotato.com/feed/'],
  ['U.Today', 'https://u.today/rss'],
  ['The Defiant', 'https://thedefiant.io/api/feed'],
  ['Blockworks', 'https://blockworks.co/feed'],
];
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const strip = (s) => decode(decode(s)).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const attr = (block, name, a) => { const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, 'i')); return m ? decode(m[1]) : ''; };
function parseFeed(xml, source) {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = strip(tag(b, 'title'));
    let link = strip(tag(b, 'link')) || attr(b, 'link', 'href');
    const guid = strip(tag(b, 'guid'));
    if (!/^https?:\/\//.test(link) && /^https?:\/\//.test(guid)) link = guid;
    const date = strip(tag(b, 'pubDate')) || strip(tag(b, 'published')) || strip(tag(b, 'updated')) || strip(tag(b, 'dc:date'));
    const desc = strip(tag(b, 'description')) || strip(tag(b, 'summary')) || strip(tag(b, 'content:encoded'));
    const image = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || attr(b, 'enclosure', 'url') || null;
    const cats = (b.match(/<category\b[^>]*>([\s\S]*?)<\/category>/gi) || []).map((c) => strip(c)).filter(Boolean).slice(0, 8);
    const t = Date.parse(date);
    if (!title || !/^https?:\/\//.test(link) || !Number.isFinite(t)) continue;
    let summary = desc.replace(/\s*The post .*? appeared first on .*$/i, '').replace(/\s*(Read more|Continue reading).*$/i, '');
    if (summary.length > 280) summary = summary.slice(0, 277).replace(/\s+\S*$/, '') + '…';
    items.push({ title, link, source, published: new Date(t).toISOString(), summary, image: /^https:\/\//.test(image || '') ? image : null, categories: cats });
  }
  return items;
}
const AMBIG = new Set(['ONE', 'NEAR', 'GAS', 'SUN', 'HOT', 'KEY', 'MASK', 'FUN', 'OM', 'S', 'IP', 'G', 'T', 'A', 'U', 'ME', 'MOVE', 'SAFE', 'TRUMP', 'BIO', 'ZK', 'AI', 'ACT', 'BAN', 'GO', 'ID', 'PEOPLE', 'JUP', 'W', 'APE', 'CAKE', 'RAY', 'WIN', 'ANT', 'DOG', 'POL', 'XAI', 'BEAM', 'CORE', 'PUMP', 'LINK', 'FLOW', 'ROSE', 'SAND', 'ICP', 'FIL', 'HBAR', 'OP', 'ARB', 'TON', 'SEI', 'SUI', 'ENA', 'ONDO', 'TAO', 'KAS', 'HYPE', 'PENGU', 'VET', 'ATOM', 'DOT', 'UNI', 'LDO', 'IMX', 'INJ', 'TIA', 'STX', 'RUNE', 'GRT', 'MKR', 'AAVE', 'CRV', 'JTO', 'WLD', 'PYTH', 'BONK', 'FLOKI', 'PEPE', 'WIF', 'SHIB', 'DOGE', 'ADA', 'TRX', 'LTC', 'BCH', 'XLM', 'XMR', 'ETC', 'ALGO', 'APT', 'MNT', 'CRO', 'OKB', 'LEO', 'QNT', 'FET', 'RENDER', 'VIRTUAL']);
// Tickers that are also everyday words are matched only as $TICKER; the others match as a capitalised word.
const WORDLIKE = new Set(['ONE', 'NEAR', 'GAS', 'SUN', 'HOT', 'KEY', 'MASK', 'FUN', 'OM', 'S', 'IP', 'G', 'T', 'A', 'U', 'ME', 'MOVE', 'SAFE', 'TRUMP', 'BIO', 'ZK', 'AI', 'ACT', 'BAN', 'GO', 'ID', 'PEOPLE', 'W', 'APE', 'CAKE', 'RAY', 'WIN', 'ANT', 'DOG', 'POL', 'BEAM', 'CORE', 'PUMP', 'LINK', 'FLOW', 'ROSE', 'SAND', 'OP', 'TON', 'SEI', 'HYPE', 'VET', 'DOT', 'UNI', 'GRT', 'CRO', 'LEO', 'FET', 'RENDER', 'VIRTUAL', 'ATOM', 'WIF', 'TAO', 'KAS', 'STX', 'TIA', 'RUNE']);
void AMBIG;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALIASES = { BTC: ['Bitcoin'], ETH: ['Ethereum', 'Ether'], XRP: ['XRP', 'Ripple', 'XRPL'], SOL: ['Solana'], BNB: ['BNB', 'BNB Chain', 'Binance Coin'], DOGE: ['Dogecoin'], ADA: ['Cardano'], TRX: ['Tron', 'TRON'], TON: ['Toncoin', 'TON blockchain'], AVAX: ['Avalanche'], DOT: ['Polkadot'], LINK: ['Chainlink'], SHIB: ['Shiba Inu'], LTC: ['Litecoin'], BCH: ['Bitcoin Cash'], XLM: ['Stellar'], SUI: ['Sui'], HYPE: ['Hyperliquid'], UNI: ['Uniswap'], NEAR: ['NEAR Protocol'], APT: ['Aptos'], ARB: ['Arbitrum'], OP: ['Optimism'], POL: ['Polygon'], ATOM: ['Cosmos'], XMR: ['Monero'], PEPE: ['Pepe'], TAO: ['Bittensor'], ONDO: ['Ondo'] };
function tagger(coins) {
  const pats = coins.map((c) => {
    const names = new Set([c.name, ...(ALIASES[c.symbol] || [])].filter((n) => n && n.length >= 3 && !/^(the|one|near|sun|gas)$/i.test(n)));
    const rxName = new RegExp('(^|[^A-Za-z0-9])(' + Array.from(names).map(esc).join('|') + ')(?![A-Za-z0-9])', ''); // case-sensitive: names are proper nouns
    const s = esc(c.symbol);
    const rxSym = WORDLIKE.has(c.symbol) || c.symbol.length < 3 ? new RegExp('\\$' + s + '(?![A-Za-z0-9])') : new RegExp('(^|[^A-Za-z0-9$])\\$?' + s + '(?![A-Za-z0-9])');
    return { sym: c.symbol, rxName, rxSym };
  });
  return (it) => {
    const text = it.title + ' ' + it.summary + ' ' + (it.categories || []).join(' ');
    const out = [];
    for (const p of pats) if (p.rxName.test(text) || p.rxSym.test(text)) out.push(p.sym);
    // "Bitcoin Cash" should not also count as Bitcoin when Bitcoin is not mentioned on its own.
    if (out.includes('BCH') && out.includes('BTC') && !/Bitcoin(?! Cash)|BTC/.test(text)) out.splice(out.indexOf('BTC'), 1);
    return out.slice(0, 8);
  };
}

/* ---------------- listings (exchange announcements) ---------------- */
const symbolsIn = (title) => {
  const s = new Set();
  for (const m of title.matchAll(/\(([A-Z0-9]{2,12})\)/g)) s.add(m[1]);
  for (const m of title.matchAll(/\b([A-Z0-9]{2,12})\s*(?:\/|-)\s*(?:USDT|USDC|USD|BTC)\b/g)) s.add(m[1]);
  ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB', 'NFT', 'API', 'P2P', 'VIP', 'APR', 'UTC'].forEach((x) => { if (!title.includes('(' + x + ')')) s.delete(x); });
  return Array.from(s).slice(0, 4);
};
const isListing = (t) => /\b(will list|lists|listing|listed|to list|launch(es)? .*spot|new (spot|token)|adds?|adding|roadmap|pre-?market|launchpool|perpetual|now available|gem spotlight|world premiere|available for trading)\b/i.test(t) && !/\b(delist|delisting|remove|removal|suspend|cease|maintenance|airdrop result|wallet)\b/i.test(t);
const isUpcoming = (t, ts) => ts > Date.now() || /\b(will list|will launch|to list|roadmap|pre-?market|launchpool|will add|coming soon|opens trading on)\b/i.test(t);
async function listings() {
  const out = [];
  const add = (exchange, title, url, ts) => { if (!title || !url || !Number.isFinite(ts)) return; if (!isListing(title)) return; out.push({ exchange, title: title.trim(), url, date: new Date(ts).toISOString(), symbols: symbolsIn(title), upcoming: isUpcoming(title, ts) }); };
  const bn = await tryGet('Binance announcements', 'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=20');
  (bn && bn.data && bn.data.catalogs && bn.data.catalogs[0] ? bn.data.catalogs[0].articles : []).forEach((a) => add('Binance', a.title, 'https://www.binance.com/en/support/announcement/' + a.code, a.releaseDate));
  const okx = await tryGet('OKX announcements', 'https://www.okx.com/api/v5/support/announcements?annType=announcements-new-listings');
  (okx && okx.data && okx.data[0] ? okx.data[0].details : []).forEach((a) => add('OKX', a.title, a.url, Number(a.pTime)));
  const by = await tryGet('Bybit announcements', 'https://api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto&limit=20');
  (by && by.result ? by.result.list : []).forEach((a) => add('Bybit', a.title, a.url, Number(a.dateTimestamp || a.publishTime)));
  const ku = await tryGet('KuCoin announcements', 'https://api.kucoin.com/api/v3/announcements?annType=new-listings&lang=en_US&pageSize=20');
  (ku && ku.data ? ku.data.items : []).forEach((a) => add('KuCoin', a.annTitle, a.annUrl, Number(a.cTime)));
  const cb = await tryGet('Coinbase roadmap (blog RSS)', 'https://www.coinbase.com/blog/rss.xml', { json: false });
  if (cb) parseFeed(cb, 'Coinbase').filter((i) => /roadmap|now available|listing|will add|added/i.test(i.title)).forEach((i) => add('Coinbase', i.title, i.link, Date.parse(i.published)));
  // CoinPaprika flags coins added to its index in the last few days.
  const cp = await tryGet('CoinPaprika new coins', 'https://api.coinpaprika.com/v1/coins');
  const fresh = cp ? cp.filter((c) => c.is_new && c.is_active && c.type === 'coin' || (c.is_new && c.is_active && c.type === 'token')).slice(0, 40) : [];
  const seen = new Set();
  const dedup = out.sort((a, b) => (a.date < b.date ? 1 : -1)).filter((x) => { const k = x.exchange + '|' + x.title; if (seen.has(k)) return false; seen.add(k); return true; });
  const twoWeeks = Date.now() - 14 * 864e5;
  return {
    upcoming: dedup.filter((x) => x.upcoming && Date.parse(x.date) > Date.now() - 21 * 864e5).slice(0, 30),
    new: dedup.filter((x) => !x.upcoming && Date.parse(x.date) > twoWeeks).slice(0, 30),
    aggregator_new: fresh.map((c) => ({ id: c.id, symbol: c.symbol, name: c.name, rank: c.rank })),
    sources: Array.from(new Set(dedup.map((x) => x.exchange))),
  };
}

/* ---------------- main ---------------- */
const now = new Date().toISOString();
const prevMarkets = await readJSON('data/markets.json');
const cg = await tryGet('CoinGecko markets', 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h,7d,30d,1y');
let universe = [];
if (Array.isArray(cg) && cg.length) {
  universe = cg.map(mapCG);
  await writeFile('data/markets.json', JSON.stringify({ updated: now, source: 'CoinGecko', rows: universe.slice(0, 150) }));
} else if (prevMarkets) universe = prevMarkets.rows;
const assets = universe.filter((c) => !SKIP.has(c.symbol.toLowerCase()) && !/\b(usd|dollar)\b/i.test(c.name) && !/^(wrapped|bridged|staked)\b/i.test(c.name));
const tagIt = tagger(assets.slice(0, 200));

const feedTexts = await Promise.all(FEEDS.map(([n, u]) => tryGet('RSS ' + n, u, { json: false })));
let items = [];
feedTexts.forEach((xml, i) => { if (xml) items.push(...parseFeed(xml, FEEDS[i][0]).slice(0, 40)); });
const seenLink = new Set(); const seenTitle = new Set();
items = items.sort((a, b) => (a.published < b.published ? 1 : -1)).filter((it) => {
  const k = it.link.replace(/[?#].*$/, ''); const t = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (seenLink.has(k) || seenTitle.has(t)) return false; seenLink.add(k); seenTitle.add(t); return true;
}).filter((it) => Date.parse(it.published) <= Date.now() + 3600e3).slice(0, 220);
items.forEach((it) => { it.coins = tagIt(it); delete it.categories; });
if (items.length >= 10) await writeFile('data/news.json', JSON.stringify({ updated: now, sources: Array.from(new Set(items.map((i) => i.source))), items }));
else log('news: too few items, keeping previous file');

const lst = await listings();
if (lst.upcoming.length + lst.new.length + lst.aggregator_new.length > 0) await writeFile('data/listings.json', JSON.stringify(Object.assign({ updated: now }, lst)));
else log('listings: nothing collected, keeping previous file');
log('done: news', items.length, 'upcoming', lst.upcoming.length, 'new', lst.new.length, 'aggregator_new', lst.aggregator_new.length);
