# -*- coding: utf-8 -*-
"""
sinkronkan_ringkasan.py
------------------------
Jalankan SEKALI dari terminal (setelah venv aktif, di folder project):

    python sinkronkan_ringkasan.py

Menghitung ulang statistik ringkasan_pegawai (Terlambat, Sakit, Izin,
Alpha, Dinas Luar, Lepas Piket, Total Cuti, Total Hari Kerja) untuk
SEMUA pegawai di SEMUA batch, langsung dari data attendance_records
saat ini - menyamakan angka yang tadinya masih dari statistik asli hasil
ekstraksi PDF pertama kali dengan hitungan literal per-baris (sumber yang
sama dipakai donut chart di halaman Visualisasi), supaya keduanya tidak
lagi selisih.

Aman dijalankan berkali-kali (idempotent) - tidak merusak data yang sudah
benar, cuma menghitung ulang dan menimpa dengan angka yang sama kalau
memang sudah cocok.
"""
import os
from dotenv import load_dotenv

# PERBAIKAN: db.py membaca SUPABASE_URL/SUPABASE_SERVICE_KEY langsung dari
# environment saat di-import - kalau dijalankan lewat "python app.py",
# app.py sendiri yang sudah memuat file .env duluan. Tapi skrip mandiri
# ini dijalankan LANGSUNG (bukan lewat app.py), jadi .env harus dimuat
# di sini dulu, SEBELUM baris "import db" di bawah - kalau tidak, akan
# muncul KeyError: 'SUPABASE_URL'.
load_dotenv()

import db

if __name__ == "__main__":
    print("Menyinkronkan seluruh ringkasan_pegawai dari data harian...")
    jumlah = db.sinkronkan_semua_ringkasan()
    print(f"Selesai - {jumlah} baris ringkasan_pegawai berhasil disinkronkan.")
