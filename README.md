# One Piece Card Price Checker

Aplikasi web sederhana untuk mengecek harga kartu One Piece TCG dalam **Rupiah Indonesia (IDR)**.

## Fitur

- Unggah foto kartu (opsional) dan ketik kode kartu (contoh: `OP01-001`)
- Harga dari **Yuyu-Tei** (yuyu-tei.jp) — di-scrape live
- Harga dari **SNKRDUNK** (snkrdunk.com) — per kondisi (Grade A/B/C/D, PSA10, dll.)
- Harga dari **Forum One Piece TCG Indonesia** — disimpan manual di SQLite (grup Facebook tidak bisa di-scrape otomatis)
- Rata-rata & rentang harga dalam IDR dengan konversi kurs otomatis

## Menjalankan

Requires **Node.js 22.5+** (uses built-in `node:sqlite` — no native compilation needed).

```bash
rm -rf node_modules package-lock.json
npm install
npm start
```

Buka [http://localhost:3000](http://localhost:3000)

## Stack

- **Backend:** Express.js
- **Database:** SQLite (better-sqlite3)
- **Frontend:** HTML, CSS, JavaScript + Tailwind CDN

## Menambah Harga Facebook

Gunakan form di bagian bawah halaman utama, atau:

```bash
curl -X POST http://localhost:3000/api/admin/facebook-price \
  -H "Content-Type: application/json" \
  -d '{"cardSetId":"OP01-001","variantName":"Leader Parallel","priceIdr":450000}'
```

## Catatan

- Harga bersifat **referensi**, bukan jaminan harga jual/beli
- Masukkan kode kartu secara manual untuk hasil terbaik
- Kurs JPY/USD → IDR dari exchangerate-api.com
