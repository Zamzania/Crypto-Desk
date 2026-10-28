# Crypto Desk

Meja riset kripto publik untuk **BTC, ETH, XRP, SOL, dan BNB**: harga live, grafik teknikal 1 jam, 4 jam, dan 1 hari, arus dana, makro, tesis, dan skenario. Tampilan bergaya *old money*.

**Situs:** https://zamzania.github.io/Crypto-Desk/

## Cara kerja

Situs ini statis (HTML, CSS, JavaScript) dan dihosting gratis di GitHub Pages. Tidak ada server dan tidak ada kunci API.

| Bagian | Sumber | Diperbarui |
|---|---|---|
| Harga, kapitalisasi, peringkat, perubahan, ATH | CoinGecko (cadangan: CoinPaprika) | Live, tiap 60 detik |
| Lilin 1j / 4j / 1h | Binance (cadangan: Bybit, OKX, Kraken), pasangan USDT | Live |
| Kinerja 12 bulan, beta, korelasi, volatilitas, RSI, MACD, ADX, ATR | Dihitung di browser dari lilin mentah | Live |
| Fear & Greed | Alternative.me | Live |
| Koin populer (100 besar) & sedang tren | CoinGecko | Live |
| Analisis otomatis tiap koin | Dihitung di browser dari lilin harian & 4 jam (aturan yang sama untuk semua koin) | Live |
| Berita | RSS CoinDesk, Cointelegraph, Decrypt, The Block, dll. (`data/news.json`) | Otomatis tiap 3 jam (GitHub Actions) |
| Pengumuman listing | Binance, OKX, Bybit, KuCoin, Coinbase (`data/listings.json`) | Otomatis tiap 3 jam (GitHub Actions) |
| Zona kunci, tesis, skenario, makro, ETF, derivatif, kalender | `data/*.json` (penilaian analis) | Setiap analisis baru |

Semua data live diambil langsung oleh browser pengunjung, jadi pemilik situs tidak membayar apa pun.

## Struktur

```
index.html          halaman utama (ringkasan, pasar, berita, teknikal, makro, tesis)
coin.html           detail koin + analisis otomatis (coin.html?id=<id CoinGecko>)
chart.html          chart candlestick layar penuh / "See chart" (chart.html?s=BTC&tf=4h)
assets/core.js      fungsi bersama: data, lilin, indikator, berita
assets/app.js       halaman utama
assets/coin.js      halaman detail koin
assets/chart.js     halaman chart (TradingView Lightweight Charts, assets/vendor)
assets/style.css    gaya (palet old money, mode gelap)
scripts/collect.mjs pengumpul berita, listing, dan cuplikan pasar
.github/workflows/  jadwal pengumpul (tiap 3 jam)
data/*.json         data analisis manual + hasil pengumpul
```

## Memperbarui analisis

Edit file di `data/` lalu commit. Tanggal di `data/meta.json` (`updated`) muncul di situs sebagai "per <tanggal>".

---

Informasi edukatif, bukan nasihat keuangan.
