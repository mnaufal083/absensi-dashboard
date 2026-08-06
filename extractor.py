# -*- coding: utf-8 -*-
"""
extractor.py
------------
Modul pembaca PDF "LAPORAN KEHADIRAN PEGAWAI" - Kejaksaan Tinggi Jawa Tengah.

CATATAN PENTING (hasil kalibrasi terhadap beberapa PDF asli):

1) pdfplumber TIDAK konsisten membagi kolom pada tabel ini - baik jumlah
   kolom maupun letak sel kosong ekstra bisa berbeda antar baris DAN antar
   file (bukan cuma antar file). Karena itu:
   - 10 kolom TERAKHIR tiap baris data harian TERBUKTI selalu konsisten
     urutannya -> dibaca dengan indeks negatif (row[-10:]).
   - Identitas pegawai (No/Nama/NIP/NRP/Golongan) TIDAK dicari lewat posisi
     tetap ataupun posisi relatif ke Tanggal (keduanya terbukti masih bisa
     salah - misalnya Nama pernah tertukar terbaca sebagai NIP karena ada
     1 sel kosong ekstra yang tidak selalu muncul). Sebagai gantinya,
     NIP dicari lewat POLA ANGKA 18 DIGIT (format baku NIP PNS Indonesia),
     lalu Nama/NRP/Golongan dihitung relatif terhadap posisi NIP itu -
     jauh lebih stabil karena isinya (bukan posisinya) yang dikenali.

2) Atas arahan pembimbing: kolom "Datang Awal", "Datang Telat", "Pulang
   Awal", "Pulang Telat", "Jml Jam Kerja" dari PDF asli TIDAK dipakai sama
   sekali (isinya kadang berupa jam mentah yang tidak selalu mencerminkan
   "terlambat" secara langsung, dan menambah kompleksitas parsing tanpa
   manfaat berarti). Sebagai gantinya, keterlambatan dihitung SENDIRI oleh
   sistem: membandingkan Jam Masuk aktual terhadap Jadwal Masuk (kolom
   "JAM KERJA - MASUK"). Kalau Jam Masuk lebih siang dari Jadwal Masuk,
   dihitung terlambat sebesar selisihnya; kalau tidak, dianggap tidak
   terlambat.

3) Tanggal disimpan dalam format ISO "YYYY-MM-DD" (bukan "DD/MM/YYYY").
   Ini penting supaya pengurutan tanggal di database/tampilan benar walau
   periode absensi melewati pergantian bulan (format DD/MM/YYYY kalau
   diurutkan sebagai teks akan salah urut, mis. "01/07/2026" akan
   terbaca "lebih kecil" dari "30/06/2026"). Tampilan ke pengguna tetap
   diformat ulang jadi DD/MM/YYYY di frontend/Excel, hanya penyimpanan
   internalnya yang ISO.

Fungsi utama: ekstrak_pdf(path_pdf, nama_file)
Mengembalikan: (rows, ringkasan, error)
  rows       -> list dict, satu baris per tanggal kehadiran
  ringkasan  -> list dict, satu baris per pegawai berisi rekap statistik
  error      -> None jika sukses, atau string peringatan/alasan gagal
"""

import re
import hashlib
import pdfplumber
from datetime import datetime, timedelta

TANGGAL_REGEX = re.compile(r"^\d{1,2}-[A-Za-z]{3}-\d{4}$")
NIP_REGEX = re.compile(r"^\d{18}$")
RINGKASAN_REGEX = re.compile(r"([A-Z][A-Z /]*?)\s*:\s*(\d+)\s*Hari")

JUMLAH_KOLOM_MINIMAL = 16  # minimal: beberapa sel identitas + 10 kolom data


def _bersih(v):
    if v is None:
        return ""
    return str(v).replace("\n", " ").strip()


def _format_tanggal_iso(v):
    """20-May-2026 -> 2026-05-20 (format ISO, supaya urutannya benar)."""
    v = _bersih(v)
    try:
        return datetime.strptime(v, "%d-%b-%Y").date().isoformat()
    except ValueError:
        return v  # biarkan apa adanya kalau gagal parse (jarang terjadi)


def _cari_indeks_tanggal(bagian_depan):
    for i, sel in enumerate(bagian_depan):
        if TANGGAL_REGEX.match(_bersih(sel)):
            return i
    return -1


def _cari_indeks_nip(bagian_depan):
    """Cari NIP lewat pola angka 18 digit (format baku NIP PNS Indonesia) -
    jauh lebih stabil daripada menebak posisi kolom."""
    for i, sel in enumerate(bagian_depan):
        if NIP_REGEX.match(_bersih(sel)):
            return i
    return -1


TOLERANSI_TELAT_MENIT = 30  # arahan pembimbing (30 Jul 2026): telat baru
# dihitung kalau Jam Masuk MELEWATI (Jadwal Masuk + toleransi ini) - bukan
# langsung dari Jadwal Masuk aslinya. Mis. Jadwal Masuk 07:30 + toleransi
# 30 menit = batas 08:00: jam masuk s.d. 08:00 masih dianggap aman/tidak
# telat, baru mulai 08:01 dst dihitung telat (dan durasi telatnya dihitung
# dari batas 08:00 itu, BUKAN dari 07:30).


def _hitung_telat(jadwal_masuk, jam_masuk):
    """Bandingkan Jam Masuk aktual terhadap (Jadwal Masuk + toleransi 30
    menit). Kembalikan durasi keterlambatan format 'HH:MM' terhitung dari
    batas toleransi itu, atau '-' kalau tidak terlambat / data tidak
    lengkap (mis. hari libur, cuti, tidak ada catatan jam masuk)."""
    if jam_masuk in ("", "-") or jadwal_masuk in ("", "-", "00:00"):
        return "-"
    try:
        t_jadwal = datetime.strptime(jadwal_masuk, "%H:%M")
        t_masuk = datetime.strptime(jam_masuk, "%H:%M")
    except ValueError:
        return "-"
    batas_toleransi = t_jadwal + timedelta(minutes=TOLERANSI_TELAT_MENIT)
    if t_masuk <= batas_toleransi:
        return "-"
    selisih_menit = int((t_masuk - batas_toleransi).total_seconds() // 60)
    return f"{selisih_menit // 60:02d}:{selisih_menit % 60:02d}"


def _adalah_header(row):
    c0, c1 = _bersih(row[0]).upper(), _bersih(row[1]).upper() if len(row) > 1 else ""
    return c0.startswith("NO.") and "NAMA" in c1


def _adalah_subheader_jam(row):
    joined = " ".join(_bersih(x) for x in row).upper()
    return joined.strip() in ("MASUK PULANG",)


def _adalah_baris_subunit(row):
    return _bersih(row[0]).upper().startswith("SUB UNIT KERJA")


def _adalah_baris_jabatan(row):
    return _bersih(row[0]).upper().startswith("JABATAN")


def _adalah_baris_statistik(row):
    """Baris statistik/ringkasan: hanya kolom pertama berisi teks berpola
    'LABEL : angka Hari' (bisa beberapa pasangan sekaligus, dan bisa lebih
    dari satu baris per pegawai - mis. baris rincian jenis Cuti terpisah)."""
    teks = _bersih(row[0])
    if not RINGKASAN_REGEX.search(teks):
        return False
    if len(row) > 1 and _bersih(row[1]):
        return False  # baris identitas pegawai baru, bukan baris statistik
    return True


def _bangun_ringkasan(hasil, nama, nip, nrp, gol, sub_unit, jabatan, sumber_file):
    rincian_cuti = [
        f"{label.upper()} : {jumlah} Hari"
        for label, jumlah in hasil.items()
        if label.upper().startswith("CUTI") and label != "Total Cuti"
    ]
    teks_cuti = ", ".join(rincian_cuti)
    if not teks_cuti and hasil.get("Total Cuti"):
        teks_cuti = f"CUTI : {hasil.get('Total Cuti')} Hari"

    return {
        "Nama": nama or "-",
        "NIP": nip or "-",
        "NRP": nrp or "-",
        "Golongan": gol or "-",
        "Bidang": "",  # diisi belakangan: dari input manual saat proses, atau dikoreksi manual per pegawai
        "Terlambat (Hari)": hasil.get("Terlambat", ""),
        "Pulang Cepat (Hari)": hasil.get("Pulang Cepat", ""),
        "Tidak Absen Datang (Hari)": hasil.get("Tidak Absen Datang", ""),
        "Tidak Absen Pulang (Hari)": hasil.get("Tidak Absen Pulang", ""),
        "Izin (Hari)": hasil.get("Izin", ""),
        "Alpha (Hari)": hasil.get("Alpha", ""),
        "Sakit (Hari)": hasil.get("Sakit", ""),
        "Dinas Luar (Hari)": hasil.get("Dinas Luar", ""),
        "Lepas Piket (Hari)": hasil.get("Lepas Piket", ""),
        "Tugas Belajar (Hari)": hasil.get("Tugas Belajar", ""),
        "Total Cuti (Hari)": hasil.get("Total Cuti", ""),
        "Rincian Cuti": teks_cuti,
        "Total Hari Kerja": hasil.get("Total Hari Kerja", ""),
        "Sumber File": sumber_file,
        "_sub_unit": sub_unit or "",
        "_jabatan": jabatan or "",
        "_hasil_mentah": dict(hasil),
    }


def ekstrak_pdf(path_pdf, nama_file):
    rows = []
    ringkasan_list = []
    ditemukan_tabel = False

    cur = {"no": "", "nama": "", "nip": "", "nrp": "", "gol": "", "subunit": "", "jabatan": "", "stat_acc": {}}

    def flush_ringkasan():
        if cur["nama"] or cur["nip"]:
            ringkasan_list.append(_bangun_ringkasan(
                cur["stat_acc"], cur["nama"], cur["nip"], cur["nrp"], cur["gol"],
                cur["subunit"], cur["jabatan"], nama_file
            ))
        cur["stat_acc"] = {}

    try:
        with pdfplumber.open(path_pdf) as pdf:
            if len(pdf.pages) == 0:
                return [], [], "File PDF kosong / tidak memiliki halaman"

            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        if len(row) < JUMLAH_KOLOM_MINIMAL:
                            continue
                        if _adalah_header(row) or _adalah_subheader_jam(row):
                            ditemukan_tabel = True
                            continue
                        if _adalah_baris_subunit(row):
                            cur["subunit"] = _bersih(row[0])
                            continue
                        if _adalah_baris_jabatan(row):
                            cur["jabatan"] = _bersih(row[0])
                            continue
                        if _adalah_baris_statistik(row):
                            teks = _bersih(row[0])
                            pasangan = {label.strip().title(): int(jumlah) for label, jumlah in RINGKASAN_REGEX.findall(teks)}
                            cur["stat_acc"].update(pasangan)
                            continue

                        # --- 10 kolom data TERAKHIR: selalu konsisten urutannya.
                        # Hanya 4 yang dipakai (Jadwal Masuk/Pulang, Jam Masuk/
                        # Keluar aktual) + Keterangan; sisanya (Datang Awal/
                        # Telat, Pulang Awal/Telat, Jml Jam Kerja) sengaja
                        # diabaikan sesuai arahan pembimbing.
                        data = row[-10:]
                        jadwal_masuk, jadwal_pulang, jam_masuk, jam_keluar = (_bersih(x) for x in data[0:4])
                        keterangan = _bersih(data[9])

                        # --- Tanggal: cari lewat pola tanggal di bagian depan ---
                        bagian_depan = row[:-10]
                        idx_tanggal = _cari_indeks_tanggal(bagian_depan)
                        if idx_tanggal == -1:
                            continue  # baris tidak dikenali, lewati dengan aman
                        tanggal_iso = _format_tanggal_iso(bagian_depan[idx_tanggal])

                        # --- Identitas pegawai: cari lewat pola NIP (18 digit),
                        # BUKAN posisi tetap - posisi kolom di depan Tanggal
                        # terbukti bisa berubah-ubah antar file/baris. ---
                        idx_nip = _cari_indeks_nip(bagian_depan)
                        if idx_nip != -1:
                            nama_baru = _bersih(bagian_depan[idx_nip - 1]) if idx_nip >= 1 else ""
                            if nama_baru:
                                if cur["nama"] and cur["nama"] != nama_baru:
                                    flush_ringkasan()
                                cur["no"] = _bersih(bagian_depan[idx_nip - 2]) if idx_nip >= 2 else ""
                                cur["nama"] = nama_baru
                                cur["nip"] = _bersih(bagian_depan[idx_nip])
                                cur["nrp"] = _bersih(bagian_depan[idx_nip + 1]) if idx_nip + 1 < len(bagian_depan) else ""
                                cur["gol"] = _bersih(bagian_depan[idx_nip + 2]) if idx_nip + 2 < len(bagian_depan) else ""

                        if not cur["nama"] and not cur["nip"]:
                            continue  # baris tanggal tanpa identitas pegawai yang jelas -> lewati

                        if not keterangan and jadwal_masuk == "00:00" and jadwal_pulang == "00:00":
                            keterangan = "Libur"
                        elif not keterangan and jam_masuk in ("", "-") and jam_keluar in ("", "-"):
                            # PERBAIKAN (30 Jul 2026): dulu kalau kolom Keterangan
                            # PDF kosong untuk hari kerja biasa (bukan Libur) DAN
                            # sama sekali tidak ada jam masuk maupun jam keluar
                            # tercatat, nilainya dibiarkan "" - lalu di dashboard
                            # malah tampil ambigu/salah (sempat "Hadir" karena bug
                            # dropdown, sekarang jadi placeholder "(kosong)").
                            # Padahal hari kerja tanpa catatan jam SAMA SEKALI dan
                            # tanpa keterangan apa pun di PDF-nya sendiri, sesuai
                            # konvensi kepegawaian, berarti "Alpha" (tidak hadir
                            # tanpa keterangan) - jadi diisi otomatis sebagai
                            # default, bukan dibiarkan kosong.
                            #
                            # SENGAJA tidak menyentuh hari yang cuma SEBAGIAN
                            # datanya hilang (mis. ada jam masuk tapi jam keluar
                            # kosong = "Tidak Absen Pulang") - itu bukan Alpha,
                            # pegawainya tetap hadir hari itu.
                            #
                            # CATATAN: kalau ternyata hari kosong ini sebenarnya
                            # Dinas Luar/Izin/Sakit/Cuti (bukan benar-benar Alpha),
                            # tetap bisa dikoreksi manual lewat dropdown Keterangan
                            # seperti biasa - default ini cuma tebakan paling masuk
                            # akal kalau PDF-nya sendiri tidak memberi info apa pun.
                            keterangan = "Alpha"

                        rows.append({
                            "Nama": cur["nama"] or "-",
                            "NIP": cur["nip"] or "-",
                            "NRP": cur["nrp"] or "-",
                            "Golongan": cur["gol"] or "-",
                            "Sub Unit Kerja": cur["subunit"].replace("SUB UNIT KERJA", "").strip(" :"),
                            "Jabatan": cur["jabatan"].replace("JABATAN", "").strip(" :"),
                            "Bidang": "",  # diisi belakangan: dari input manual saat proses, atau dikoreksi manual per pegawai
                            "Tanggal": tanggal_iso,
                            "Jadwal Masuk": jadwal_masuk,
                            "Jadwal Pulang": jadwal_pulang,
                            "Jam Masuk": jam_masuk,
                            "Jam Keluar": jam_keluar,
                            "Telat": _hitung_telat(jadwal_masuk, jam_masuk),
                            "Keterangan": keterangan,
                            "Sumber File": nama_file,
                        })

            flush_ringkasan()

            if not ditemukan_tabel:
                return [], [], "Struktur tabel tidak dikenali (header 'NO./NAMA PEGAWAI' tidak ditemukan) - kemungkinan format PDF berbeda"

            if not rows:
                return [], [], "Tabel ditemukan tetapi tidak ada baris tanggal yang cocok"

            return rows, ringkasan_list, None

    except Exception as e:
        return [], [], f"Gagal membuka/membaca PDF: {e}"


# ---------------------------------------------------------------------------
# DETEKSI DUPLIKAT LAPIS 2 (dibangun ulang 23 Jul 2026): "sidik jari" data
# harian satu pegawai, dipakai bersama db.py::cek_dan_catat_signature_pegawai
# untuk mendeteksi kasus file diekspor ulang dari sistem sumber - isi data
# sama persis tapi byte file berbeda, sehingga tidak tertangkap oleh
# perbandingan hash file utuh (lapis 1, dihitung di app.py).
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# FITUR BARU (6 Agu 2026): alias publik supaya db.py bisa memakai ULANG
# rumus keterlambatan yang sama persis ("_hitung_telat" di atas) saat
# menghitung ulang kolom "Telat" secara otomatis begitu Jam Masuk/Jadwal
# Masuk diedit manual dari dashboard (lihat db.py::edit_field) - supaya
# tidak ada dua salinan rumus toleransi 30 menit di tempat berbeda yang
# rawan tidak sinkron kalau salah satu lupa diperbarui.
# ---------------------------------------------------------------------------
hitung_telat = _hitung_telat


def hitung_signature_pegawai(baris_pegawai):
    """baris_pegawai: list dict baris harian (elemen dari `rows` hasil
    ekstrak_pdf) MILIK SATU NIP yang sama, dari SATU file yang sama.
    Menghasilkan hash SHA-256 dari gabungan Tanggal+Jam Masuk+Jam Keluar+
    Keterangan seluruh barisnya (diurutkan dulu berdasarkan Tanggal supaya
    urutan ekstraksi tidak mempengaruhi hasil hash)."""
    baris_urut = sorted(baris_pegawai, key=lambda r: r.get("Tanggal", ""))
    teks = "|".join(
        f"{r.get('Tanggal','')}:{r.get('Jam Masuk','')}:{r.get('Jam Keluar','')}:{r.get('Keterangan','')}"
        for r in baris_urut
    )
    return hashlib.sha256(teks.encode("utf-8")).hexdigest()
