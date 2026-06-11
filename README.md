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

## Facebook Login (Facebook Group Tools)

Halaman `/facebook-group-tools` memakai login Facebook.

1. Buat app di [Meta for Developers](https://developers.facebook.com/apps/)
2. Tambahkan produk **Facebook Login**
3. Di **Valid OAuth Redirect URIs**, tambahkan:
   - `http://localhost:3000/auth/facebook/callback` (development)
   - `https://<domain-anda>/auth/facebook/callback` (production)
4. Salin `.env.example` ke `.env` dan isi:

```bash
cp .env.example .env
```

```env
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
SESSION_SECRET=random-long-string
APP_BASE_URL=http://localhost:3000
```

5. Jalankan ulang server, lalu buka [http://localhost:3000/facebook-group-tools](http://localhost:3000/facebook-group-tools)

Data user login disimpan di `data/auth.db` (terpisah dari `prices.db`).

## Deploy gratis (publik)

Cara termudah: **[Render](https://render.com)** (free tier).

1. Fork atau gunakan repo: `https://github.com/fs-capital-six/one-piece-card-price-checker`
2. Daftar/login di [render.com](https://render.com)
3. **New → Blueprint** → connect GitHub → pilih repo ini
4. Render membaca `render.yaml` otomatis → **Apply**
5. Tunggu build selesai (~3–5 menit) → dapat URL publik `https://one-piece-card-price-checker.onrender.com`

Atau manual: **New → Web Service** → connect repo → Runtime: Node → Build: `npm install` → Start: `npm start` → Plan: **Free**.

Catatan hosting gratis:
- Server tidur setelah ~15 menit tidak dipakai (cold start ~30 detik saat pertama dibuka)
- Database SQLite & upload bersifat sementara (reset saat redeploy)
- OCR foto butuh memori lebih besar; jika gagal, ketik kode kartu manual

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
