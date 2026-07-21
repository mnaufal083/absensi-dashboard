# -*- coding: utf-8 -*-
"""
backfill_periode.py — jalankan SEKALI SAJA setelah menambahkan kolom
periode_awal/periode_akhir ke tabel batches (lihat migrasi di
schema.sql / README_INTEGRASI.md), supaya batch yang SUDAH diproses
sebelum fitur ini ada tetap terisi periodenya.

Batch baru yang diproses lewat aplikasi TIDAK perlu ini — periodenya
sudah otomatis terisi begitu proses selesai.

Cara pakai:
    python backfill_periode.py
"""
from dotenv import load_dotenv
load_dotenv()

import db

semua_batch = db.daftar_batch()
diisi = 0
for b in semua_batch:
    if b.get("periode_awal") and b.get("periode_akhir"):
        print(f"- {b['label']}: sudah ada periode, dilewati")
        continue
    awal, akhir = db.perbarui_periode_batch(b["id"])
    if awal:
        print(f"✓ {b['label']}: periode diisi {awal} s.d. {akhir}")
        diisi += 1
    else:
        print(f"! {b['label']}: tidak ada tanggal valid di data harian, dilewati")

print(f"\nSelesai. {diisi} batch berhasil diisi periodenya.")