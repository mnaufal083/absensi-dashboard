# Panduan Sistem Rekapitulasi Absensi — Bidang Daskrimti

Kejaksaan Tinggi Jawa Tengah. Aplikasi web Flask + Supabase (Postgres) untuk
mengekstrak PDF "Laporan Kehadiran Pegawai" jadi rekap Excel resmi, lengkap
dengan koreksi manual, deteksi duplikat, visualisasi, dan manajemen akun
bertingkat.

> **Catatan:** dokumen ini menggantikan versi README sebelumnya yang sudah
> banyak tertinggal dari perkembangan kode aktual. Kalau ke depan ada fitur
> baru lagi, perbarui juga bagian yang relevan di sini supaya tidak terulang.

---

## 1. Ringkasan Fitur

| Kategori | Fitur |
|---|---|
| **Ekstraksi PDF** | Parsing tabel kehadiran otomatis (tanggal, jam masuk/keluar, keterangan, dll), tahan terhadap pergeseran kolom, deteksi baris Libur otomatis |
| **Deteksi duplikat** | 2 lapis — hash isi file (byte-per-byte) & "sidik jari" data harian per pegawai, keduanya **lintas batch** (bukan cuma dalam 1 sesi upload) |
| **Alur Draf ⇄ Final** | Batch berstatus Final terkunci dari edit & wajib sebelum bisa diunduh; bisa dikembalikan ke Draf kalau perlu dikoreksi lagi |
| **Koreksi manual** | Data Harian & Ringkasan Pegawai bisa diedit langsung dari tabel (jam, keterangan, statistik, Bidang), tersimpan sebagai batch perubahan + audit trail |
| **Visualisasi** | Filter Batch/Bidang, kartu ringkasan, komposisi Keterangan (donut), tren bulanan (2 grafik pembanding), perbandingan antar Bidang, rekap keterlambatan (bar chart) |
| **Cari Pegawai** | Pencarian nama/NIP lintas seluruh riwayat batch, hasil per-kartu dengan riwayat yang bisa dibuka langsung di tempat |
| **Data Master** | Daftar Keterangan & Daftar Bidang dikelola dari halaman Pengaturan (bukan hardcode di kode lagi) |
| **Manajemen Akun** | 2 peran — Master Admin (bisa tambah/nonaktifkan/hapus admin lain lewat dashboard) & Admin biasa |
| **Tampilan** | Mode gelap/terang (tersimpan otomatis), logo instansi bisa diganti sendiri, animasi & transisi di seluruh antarmuka |
| **Sidebar ringkas** | Desktop: sidebar bisa diciutkan jadi ikon saja (tab kecil di tepi kanan sidebar), preferensi tersimpan otomatis. Mobile: sidebar jadi laci yang dibuka lewat tombol hamburger atau swipe dari tepi kiri layar |
| **Log Aktivitas** | Audit trail setiap perubahan data, siapa mengubah apa dan kapan |

---

## 2. Struktur Proyek

```
absensi-dashboard/
├── app.py                  # Semua routing Flask & endpoint API
├── db.py                   # Semua query ke Supabase (satu titik akses DB)
├── extractor.py             # Parser PDF -> baris harian + ringkasan per pegawai
├── rekap_resmi.py           # Generator Excel format resmi instansi
├── schema.sql               # Skema database lengkap (jalankan di Supabase)
├── backfill_periode.py      # Skrip migrasi: isi ulang periode_awal/akhir batch lama
├── generate_sample_pdfs.py  # Bikin PDF contoh untuk uji coba (butuh reportlab)
├── requirements.txt
├── .env                     # SUPABASE_URL, SUPABASE_SERVICE_KEY, FLASK_SECRET_KEY
├── static/
│   ├── css/style.css
│   ├── js/dashboard.js      # Seluruh logic frontend (vanilla JS, tanpa framework)
│   └── img/logo-kejaksaan.png   # Logo instansi (taruh file Anda di sini)
└── templates/
    ├── login.html
    └── dashboard.html
```

---

## 3. Setup dari Nol

### 3.1 Buat project Supabase
1. https://supabase.com → **New project**.
2. Project Settings → API → catat **Project URL** dan **service_role secret**.
   ⚠️ Wajib pakai `service_role`, bukan `anon public` — backend butuh akses
   penuh tanpa terhalang RLS, termasuk untuk fitur manajemen akun (Supabase
   Auth Admin API).

### 3.2 Jalankan skema database
1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Salin **seluruh isi** `schema.sql`, jalankan.
3. Cek **Table Editor** — harus ada 9 tabel: `batches`, `attendance_records`,
   `ringkasan_pegawai`, `berkas_bermasalah`, `keterangan_master`,
   `bidang_master`, `admin_profiles`, `record_edit_log`,
   `batch_file_hashes`, `batch_pegawai_signature`. `keterangan_master` &
   `bidang_master` sudah otomatis terisi nilai default.

### 3.3 Buat akun & tentukan Master Admin
1. Authentication → Users → **Add user**, buat akun-akun admin (centang
   **Auto Confirm User**).
2. **Wajib**, tentukan SATU akun sebagai Master Admin (ganti email di bawah):
   ```sql
   insert into admin_profiles (user_id, email, role, aktif)
   select id, email, 'master', true from auth.users where email = 'admin1@daskrimti.go.id'
   on conflict (user_id) do update set role = 'master';
   ```
   Akun lain otomatis terdaftar sebagai `admin` biasa saat login pertama
   kali. Master Admin selanjutnya bisa menambah admin baru langsung lewat
   menu **Akun** di dashboard — tidak perlu balik ke Supabase lagi untuk itu.

### 3.4 Siapkan project lokal
```bash
cd absensi-dashboard
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```
Isi `.env`:
```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=isi-dengan-service_role-key
FLASK_SECRET_KEY=string-acak-panjang-bebas
```

### 3.5 Logo instansi
Taruh file logo (PNG, latar transparan disarankan) di:
```
static/img/logo-kejaksaan.png
```
Kalau file belum ada, sistem otomatis menampilkan ikon fallback (⚖), tidak
akan muncul ikon gambar rusak.

### 3.6 Jalankan
```bash
python app.py
```
Buka `http://127.0.0.1:5000`.

---

## 4. Alur Kerja Utama

### 4.1 Proses batch baru
1. **Proses batch baru** → pilih/tarik banyak PDF sekaligus, pilih Bidang
   (atau biarkan "Campuran/belum ditentukan" kalau file gabungan lintas
   Bidang).
2. Tiap file dicek 2 lapis duplikat sebelum diekstrak (lihat bagian 5).
3. File yang gagal/dilewati tercatat di **Log Berkas Bermasalah**, tidak
   menggagalkan file lain.
4. Batch baru muncul di **Riwayat Batch** berstatus **Draf**.

### 4.2 Koreksi data
- **Data Harian**: klik nama pegawai untuk buka rincian per tanggal (dimuat
  lazy per pegawai, jadi tetap ringan walau batch berisi ratusan orang).
  Field jam/keterangan bisa diedit langsung.
- **Ringkasan Pegawai**: rekap Terlambat/Sakit/Izin/Alpha/Bidang per
  pegawai, juga bisa dikoreksi manual.
- Semua perubahan ditampung dulu (banner "X perubahan belum disimpan"),
  baru benar-benar tersimpan saat klik **Simpan Perubahan** — dan otomatis
  tercatat ke Log Aktivitas.

### 4.3 Draf ⇄ Final
- **Draf** (kuning): masih bisa diedit bebas.
- **Final** (hijau): field edit terkunci (baik di tampilan maupun di
  server — tidak bisa dilewati lewat luar UI), dan jadi syarat wajib
  sebelum bisa **Unduh Excel**.
- Klik **Unduh Excel** saat masih Draf akan menawarkan finalisasi otomatis
  dulu sebelum lanjut unduh.
- Untuk mengoreksi batch yang sudah Final, klik **Tandai Draf lagi**
  dulu — field edit aktif kembali.
- **Hapus batch** bisa langsung dari daftar Riwayat Batch (tidak perlu buka
  detail dulu) maupun dari halaman detailnya.

### 4.4 Manajemen Akun (khusus Master Admin)
Menu **Akun** cuma muncul untuk peran Master. Master Admin bisa:
- Membuat admin baru (nama, email, password) — langsung bisa login, tanpa
  verifikasi email.
- **Nonaktifkan** akun (dipakai saat ganti operator — akun tidak bisa
  login lagi tapi jejak riwayat editnya tetap ada).
- **Hapus** akun secara permanen.
- Akun sendiri & akun Master tidak bisa dinonaktifkan/dihapus lewat UI ini
  (pengaman bawaan). Menaikkan/menurunkan peran Master↔Admin sengaja cuma
  bisa lewat SQL manual, supaya tidak mudah salah klik.

**Login dari beberapa device sekaligus (5 Agu 2026, sengaja tidak
dibatasi):** sistem pakai Supabase Auth apa adanya, yang secara default
mengizinkan banyak sesi aktif bersamaan untuk satu akun — jadi akun yang
sama bisa login di HP dan laptop bersamaan tanpa saling logout. Ini
keputusan sadar (bukan belum sempat dikerjakan): cukup memadai untuk
konteks penggunaan internal Bidang Daskrimti selama password akun dijaga.
Kalau ke depan dirasa perlu diperketat, opsi yang tersedia (belum
diimplementasikan):
1. **Single-device**, device lama otomatis logout begitu ada login baru —
   butuh tabel/kolom "token sesi aktif" per akun & pengecekan tiap request.
2. **Visibilitas sesi** — halaman Akun menampilkan daftar device yang
   sedang login (tanpa memblokir), dengan tombol untuk mengakhiri sesi
   tertentu secara manual.

---

## 5. Deteksi Duplikat (2 Lapis)

Berlaku **lintas seluruh batch**, bukan cuma dalam satu sesi upload.

1. **Hash isi file** (`batch_file_hashes`) — file yang byte-nya identik
   (walau nama file beda) dengan file yang sudah pernah diproses akan
   ditolak total, tidak disimpan sama sekali.
2. **Signature data harian per pegawai** (`batch_pegawai_signature`) —
   menangkap kasus file diekspor ulang dari sistem sumber (isi sama, byte
   beda). Kalau kena, cuma pegawai yang bersangkutan yang dilewati; pegawai
   lain di file yang sama tetap tersimpan normal.

Keduanya dicatat ke Log Berkas Bermasalah sebagai peringatan, menyebutkan
file/batch asal datanya.

---

## 6. Visualisasi

- **Filter**: Pilih Batch, Pilih Bidang (tag manual saat upload) — kalau
  Batch spesifik dipilih, filter Bidang otomatis tidak berlaku (satu batch
  sudah pasti satu tag).
- **Kartu ringkasan**: Total Pegawai, Telat, Alpha sesuai cakupan filter.
- **Komposisi Keterangan**: donut chart, ada total hari di tengah.
- **Tren Kehadiran**: dua grafik berdampingan — "Seluruh Bidang" (selalu
  akumulasi semua, acuan pembanding) vs "Per Bidang" (ikut filter di atas).
- **Perbandingan Antar Bidang**: rekap Total Pegawai/Telat/Alpha per Bidang
  tetap, dijumlah dari SELURUH batch (tidak ikut filter Bidang, karena
  tujuannya membandingkan kelimanya sekaligus).
  ⚠️ **Kolom Bidang per pegawai otomatis terisi dari tag Bidang batch saat
  upload** (kalau batch itu ditandai 1 Bidang spesifik). Untuk batch
  campuran, kolom Bidang tiap pegawai tetap perlu dikoreksi manual di tab
  Ringkasan Pegawai supaya ikut terhitung di sini.
- **Rekapitulasi Keterlambatan**: bar chart tegak (top 8), arahkan kursor
  ke batang untuk lihat nama lengkap.

---

## 7. Data Master (halaman Pengaturan)

- **Daftar Keterangan** — opsi dropdown "Keterangan" di Data Harian.
- **Daftar Bidang** — opsi Bidang di form Proses Batch Baru, Ringkasan
  Pegawai, dan filter Visualisasi. Dulu hardcode di 2 file kode berbeda
  (rawan tidak sinkron); sekarang satu sumber data yang sama dipakai di
  semua tempat.
- **Mode Gelap** — toggle tersimpan otomatis per perangkat (localStorage).

Menambah/menghapus di sini otomatis konsisten di seluruh sistem, tidak
perlu ubah kode.

**Tampilan ringkas (5 Agu 2026):** kartu "Daftar Keterangan" dan "Daftar
Bidang" tertutup secara default — cuma menampilkan judul & jumlah pilihan
(mis. "8 pilihan"). Klik header kartu untuk membuka isinya (daftar item
berbentuk chip yang mengalir ke samping, bukan satu baris penuh per item
seperti sebelumnya) berikut form tambah/hapusnya. Tujuannya supaya halaman
Pengaturan tidak langsung penuh saat dibuka padahal belum tentu sedang mau
diubah.

---

## 8. Kalibrasi PDF Sumber

Poin ini mewarisi catatan dari versi awal — **tetap berlaku**:
- Coba dulu dengan 2-3 PDF asli sebelum dipakai untuk ratusan file
  sekaligus.
- Perhatikan **Log Berkas Bermasalah** — kalau banyak file gagal/perlu
  dicek manual, kemungkinan format kolom PDF sumbernya sedikit berbeda
  dari yang dikalibrasi `extractor.py` (lihat komentar riwayat kalibrasi
  di bagian atas file itu untuk detail teknisnya).

---

## 9. Hosting / Deploy

Sama seperti sebelumnya, tidak dibahas detail karena di luar cakupan kode:
- **Railway / Render**: hubungkan repo, set 3 environment variable yang
  sama seperti `.env`.
- **VPS sendiri**: jalankan dengan `gunicorn` di belakang `nginx`, jangan
  pakai `debug=True`/server development Flask langsung.
- Environment variable selalu diisi lewat pengaturan hosting, **bukan**
  di-commit ke kode.

---

## 10. Troubleshooting Cepat

| Gejala | Kemungkinan penyebab | Solusi |
|---|---|---|
| `httpx.RemoteProtocolError: Server disconnected` sesekali | Koneksi idle ke Supabase ditutup sisi server sebelum request berikutnya lewat | Sudah ditangani otomatis (retry) di `db.py`; kalau masih sering muncul, cek koneksi internet server |
| 404 untuk file statis (favicon, logo) tercatat sebagai 500 di log | Error handler lama menangkap semua Exception termasuk HTTPException biasa | Sudah diperbaiki — 404 biasa tidak lagi jadi 500 |
| Jumlah pegawai di Data Harian < jumlah di Ringkasan Pegawai | Query kena limit 1000 baris bawaan Supabase (untuk batch besar) | Sudah diperbaiki lewat paginasi otomatis di `db.py` |
| Periode Excel muncul "-" s.d. "-" | Format tanggal tersimpan (ISO) tidak sinkron dengan cara baca lama | Sudah diperbaiki; kalau masih terjadi di batch lama, jalankan ulang `python backfill_periode.py` |
| "Perbandingan Antar Bidang" kosong padahal sudah banyak batch | Kolom Bidang per pegawai belum terisi (auto-isi cuma berlaku untuk batch baru) | Jalankan SQL backfill (lihat catatan di `db.py::simpan_hasil_ekstraksi`) untuk batch lama |
| Deteksi duplikat tidak berjalan sama sekali | Tabel `batch_file_hashes`/`batch_pegawai_signature` belum dibuat di Supabase yang aktif | Jalankan ulang bagian terkait di `schema.sql` |

---

## 11. Catatan Pengembangan Lanjutan (belum diimplementasikan, sengaja)

- Menaikkan/menurunkan peran Master Admin↔Admin masih lewat SQL manual
  saja (sengaja, sebagai pengaman ekstra).
- Progress bar upload di tab Proses Batch Baru masih indikator sederhana
  ("Memproses..."), belum persentase real-time.
- Normalisasi teks Sub Unit Kerja (kalau nanti ditemukan variasi
  penulisan yang tidak konsisten antar file PDF) belum diotomatisasi —
  perlu dilihat datanya dulu sebelum dibuatkan aturannya.
- Pembatasan login satu perangkat aktif / daftar sesi yang sedang login —
  sengaja belum dibuat, lihat catatan di bagian 4.4.
