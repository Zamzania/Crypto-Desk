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
| Analisis otomatis tiap koin | Dihitung di browser dari lilin 1 minggu, 1 hari, 4 jam, dan 1 jam (aturan yang sama untuk semua koin) | Live |
| Rencana trading (entry, stop loss, TP1–3, R:R) & kalkulator posisi | `assets/analysis.js`: support/resistance dari titik balik harga, stop berbasis ATR, target dari resistance | Live |
| Skor fundamental | CoinGecko: ukuran, likuiditas, suplai, FDV, umur, aktivitas developer, sentimen, kinerja vs BTC | Live |
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
assets/analysis.js  mesin analisis: rencana trading, teknikal lanjutan, skor fundamental
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

## Versi 8 (November 2026)

- Harga realtime lewat aliran WebSocket publik Binance (cadangan REST tiap 10 detik) di semua halaman, termasuk lilin berjalan di chart.
- Beranda baru: rezim pasar dengan alasan per faktor, ringkasan pasar global, MTF per koin, kinerja per periode, korelasi, profil risiko, pasar 250 koin dengan sparkline, derivatif live (funding, OI, rasio long/short, taker), makro live dengan korelasi ke BTC, kalender ekonomi AS, rentang harga statistik, dan cek otomatis batas tesis.
- Detail koin: ringkasan eksekutif, kinerja 1 jam s/d 1 tahun, struktur suplai, bursa & likuiditas (spread dan kedalaman order book).
- Collector berjalan tiap jam: berita, listing, pasar, makro (Yahoo Finance dengan cadangan FRED), kalender (ForexFactory), arus ETF (Farside, bila tersedia), dan data global CoinGecko.

## Versi 9: Smart Money Concept & notifikasi entry

- Halaman koin: bagian Smart Money Concept (BOS/CHoCH, order block, fair value gap, likuiditas equal highs/lows, PDH/PDL/PWH/PWL, sweep, premium/discount, OTE) untuk 1 jam, 4 jam, dan harian; sintesis teknikal + fundamental; rencana trading dipindah ke akhir, setelah semua analisis, lengkap dengan konfirmasi SMC dan trailing stop Binance.
- `scripts/alerts.mjs` memakai modul analisis yang sama dengan situs, mengirim notifikasi ntfy saat harga masuk zona entry (konfluensi ≥ 60, ekspektasi historis tidak negatif), lalu mengikuti posisinya: TP1 (SL ke entry + trailing), TP2, SL, break-even, kedaluwarsa. Status disimpan di `data/alerts.json` dan tampil di beranda.

### Menyalakan notifikasi

1. Pasang aplikasi **ntfy** (Play Store / App Store), tekan +, isi nama topik rahasia, server `ntfy.sh`.
2. Repo ini → Settings → Secrets and variables → Actions → New repository secret: nama `NTFY_TOPIC`, isi nama topik yang sama.
3. Pemicu tiap 5 menit (jadwal bawaan GitHub sering telat berjam-jam): buat fine-grained token GitHub khusus repo ini dengan izin *Actions: Read and write*, lalu di cron-job.org buat job setiap 5 menit:
   - URL `https://api.github.com/repos/Zamzania/Crypto-Desk/actions/workflows/alerts.yml/dispatches`, metode POST
   - Header `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`
   - Body `{"ref":"main"}`
4. Opsional: variable `ALERT_MIN_CONF` untuk mengubah ambang konfluensi (bawaan 60).
