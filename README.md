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
| Zona kunci, tesis, skenario, makro, ETF, derivatif, kalender | `data/*.json` (penilaian analis) | Setiap analisis baru |

Semua data live diambil langsung oleh browser pengunjung, jadi pemilik situs tidak membayar apa pun.

## Struktur

```
index.html          halaman
assets/style.css    gaya (palet old money, mode gelap)
assets/app.js       pengambilan data, indikator, grafik (d3)
data/*.json         data analisis yang diperbarui manual
```

## Memperbarui analisis

Edit file di `data/` lalu commit. Tanggal di `data/meta.json` (`updated`) muncul di situs sebagai "per <tanggal>".

---

Informasi edukatif, bukan nasihat keuangan.
