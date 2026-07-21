# Panduan Integrasi — Sistem Rekapitulasi Absensi (Dashboard + Supabase)

Urutan ini dibuat supaya bisa diikuti dari nol sampai sistemnya jalan di komputer lokal.
Hosting ulang (deploy) dibahas terakhir, sebagai langkah terpisah setelah semuanya
terkoneksi dan teruji di lokal.

## 1. Buat project Supabase

1. Buka https://supabase.com → Sign in → **New project**.
2. Catat **Project URL** dan (nanti) **service_role key**-nya:
   Project Settings → API → `Project URL` dan `service_role secret`.
   ⚠️ Jangan pakai `anon public` key — service_role key dibutuhkan supaya backend
   bisa membaca/menulis semua tabel tanpa terhalang RLS (Row Level Security).

## 2. Jalankan skema database

1. Di Supabase Dashboard → **SQL Editor** → **New query**.
2. Salin seluruh isi `schema.sql` dari folder project ini, tempel, klik **Run**.
3. Cek di **Table Editor** — harus muncul 6 tabel: `batches`, `attendance_records`,
   `ringkasan_pegawai`, `berkas_bermasalah`, `keterangan_master`, `record_edit_log`,
   dan `keterangan_master` sudah terisi 10 baris default.

## 3. Buat 3 akun admin

1. Supabase Dashboard → **Authentication** → **Users** → **Add user**.
2. Buat 3 akun (mis. `admin1@daskrimti.go.id`, `admin2@...`, `admin3@...`) dengan
   password masing-masing. Centang **Auto Confirm User** supaya tidak perlu
   verifikasi email.
3. Tidak perlu fitur registrasi mandiri di aplikasi — 3 akun ini dikelola manual
   dari sini saja.

## 4. Siapkan project lokal

```bash
cd absensi-dashboard
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Salin `.env.example` jadi `.env`, lalu isi:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=isi-dengan-service_role-key
FLASK_SECRET_KEY=string-acak-panjang-bebas
```

## 5. Jalankan lokal

```bash
python app.py
```

Buka `http://127.0.0.1:5000` → akan diarahkan ke halaman **Login** →
masuk pakai salah satu dari 3 akun yang dibuat di langkah 3.

## 6. Uji alur kerja lengkap

1. **Proses batch baru** → unggah beberapa PDF sample (pakai
   `generate_sample_pdfs.py` dari project lama kalau belum ada PDF asli) →
   cek Pratinjau Data & Log Berkas Bermasalah muncul.
2. **Riwayat Batch** → buka batch yang baru dibuat → coba ubah beberapa
   kolom di **Data Harian** dan **Ringkasan Pegawai** → **Simpan perubahan**.
3. **Log Aktivitas** → pastikan perubahan tadi tercatat.
4. **Cari Pegawai** → cari nama/NIP pegawai yang baru diproses.
5. **Unduh Excel** → pastikan file terunduh dan datanya sudah sesuai
   perubahan yang disimpan (karena finalisasi TIDAK mengunci data, sesuai
   keputusan sebelumnya — unduh bisa kapan saja).

## 7. Yang perlu dikalibrasi ke data asli (sebelum dipakai produksi)

Poin ini mewarisi catatan dari `extractor.py` versi sebelumnya — **belum berubah**:
- Coba dulu dengan 2-3 PDF asli sebelum dipakai untuk ratusan file sekaligus.
- Perhatikan `Log Berkas Bermasalah` — kalau banyak file gagal terbaca, kemungkinan
  format kolom PDF sumbernya beda dari yang diasumsikan `extractor.py`.

## 8. Baru setelah semua di atas lancar → hosting ulang

Beberapa opsi umum untuk hosting Flask (pilih sesuai kebutuhan/infrastruktur
instansi, tidak dibahas detail di sini karena di luar cakupan kode ini):
- **Railway** / **Render**: paling sederhana, tinggal hubungkan repo Git,
  set 3 environment variable yang sama seperti `.env`, deploy otomatis.
- **VPS instansi sendiri**: jalankan dengan `gunicorn` di belakang **nginx**,
  supaya bukan `debug=True`/server development Flask yang dipakai langsung.
- Di semua opsi, environment variable (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  `FLASK_SECRET_KEY`) diisi lewat pengaturan hosting masing-masing, **bukan**
  di-commit ke dalam kode.

## Catatan pengembangan lanjutan (belum diimplementasikan, sengaja disederhanakan dulu)

- Tombol "Tandai Draf lagi" di frontend memanggil endpoint yang belum ada
  (`/api/batches/<id>/final` saat ini hanya menerima arah draf→final). Tambahkan
  route serupa untuk arah sebaliknya kalau memang dibutuhkan.
- Tab **Visualisasi** baru menghitung dari daftar batch yang sedang dimuat
  (agregasi ringan di sisi browser). Kalau nanti butuh grafik tren bulanan atau
  ranking keterlambatan, sebaiknya dibuatkan endpoint agregasi khusus di
  `db.py`/`app.py` (query SQL langsung lebih efisien daripada dihitung di JS).
- Progress bar saat upload di tab **Proses batch baru** masih indikator
  sederhana ("Memproses..."), belum progress persentase real-time — bisa
  ditingkatkan dengan `XMLHttpRequest.upload.onprogress` kalau diperlukan.
