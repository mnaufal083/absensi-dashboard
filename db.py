# -*- coding: utf-8 -*-
"""
db.py
-----
Semua fungsi yang berbicara ke Supabase (Postgres) dikumpulkan di sini,
supaya app.py fokus ke routing saja.

Memakai SERVICE ROLE KEY (bukan anon key) karena ini backend server-side
tepercaya - lihat penjelasan di README_INTEGRASI.md.
"""
import os
from datetime import datetime, timezone
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------
def login(email: str, password: str):
    """Login pakai Supabase Auth. Mengembalikan (user_dict, access_token) kalau
    berhasil, atau (None, None) kalau email/password salah."""
    try:
        res = supabase.auth.sign_in_with_password({"email": email, "password": password})
        if res.user:
            return {"id": res.user.id, "email": res.user.email}, res.session.access_token
    except Exception:
        pass
    return None, None


# ---------------------------------------------------------------------------
# BATCHES
# ---------------------------------------------------------------------------
def buat_batch(nama_bidang, label, jumlah_pegawai, dibuat_oleh):
    res = supabase.table("batches").insert({
        "nama_bidang": nama_bidang,
        "label": label,
        "status": "draft",
        "jumlah_pegawai": jumlah_pegawai,
        "dibuat_oleh": dibuat_oleh,
    }).execute()
    return res.data[0]


def daftar_batch(bidang=None, status=None):
    q = supabase.table("batches").select("*").order("dibuat_pada", desc=True)
    if bidang:
        q = q.ilike("nama_bidang", f"%{bidang}%")
    if status:
        q = q.eq("status", status)
    return q.execute().data


def ambil_batch(batch_id):
    res = supabase.table("batches").select("*").eq("id", batch_id).single().execute()
    return res.data


def tandai_final(batch_id):
    supabase.table("batches").update({"status": "final"}).eq("id", batch_id).execute()


def catat_unduhan(batch_id, user_id):
    supabase.table("batches").update({
        "diunduh_pada": datetime.now(timezone.utc).isoformat(),
        "diunduh_oleh": user_id,
    }).eq("id", batch_id).execute()


def hapus_batch(batch_id):
    # attendance_records, ringkasan_pegawai, berkas_bermasalah, record_edit_log
    # otomatis ikut terhapus karena "on delete cascade" di schema.sql
    supabase.table("batches").delete().eq("id", batch_id).execute()


# ---------------------------------------------------------------------------
# ATTENDANCE_RECORDS & RINGKASAN_PEGAWAI (simpan hasil ekstraksi PDF)
# ---------------------------------------------------------------------------
_MAP_ROW = {
    "Nama": "nama", "NIP": "nip", "NRP": "nrp", "Golongan": "golongan",
    "Sub Unit Kerja": "sub_unit_kerja", "Jabatan": "jabatan", "Tanggal": "tanggal",
    "Jadwal Masuk": "jadwal_masuk", "Jadwal Pulang": "jadwal_pulang",
    "Jam Masuk": "jam_masuk", "Jam Keluar": "jam_keluar",
    "Datang Awal": "datang_awal", "Datang Telat": "datang_telat",
    "Pulang Awal": "pulang_awal", "Pulang Telat": "pulang_telat",
    "Jumlah Jam Kerja": "jumlah_jam_kerja", "Keterangan": "keterangan",
    "Sumber File": "sumber_file",
}
_MAP_RINGKASAN = {
    "Nama": "nama", "NIP": "nip", "NRP": "nrp", "Golongan": "golongan",
    "Terlambat (Hari)": "terlambat", "Pulang Cepat (Hari)": "pulang_cepat",
    "Tidak Absen Datang (Hari)": "tidak_absen_datang",
    "Tidak Absen Pulang (Hari)": "tidak_absen_pulang",
    "Izin (Hari)": "izin", "Alpha (Hari)": "alpha", "Sakit (Hari)": "sakit",
    "Dinas Luar (Hari)": "dinas_luar", "Lepas Piket (Hari)": "lepas_piket",
    "Tugas Belajar (Hari)": "tugas_belajar", "Total Cuti (Hari)": "total_cuti",
    "Rincian Cuti": "rincian_cuti", "Total Hari Kerja": "total_hari_kerja",
    "Sumber File": "sumber_file",
}


def _angka(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def simpan_hasil_ekstraksi(batch_id, rows, ringkasan_list, berkas_bermasalah_list):
    """rows & ringkasan_list -> langsung dari extractor.py::ekstrak_pdf
    (dikumpulkan lintas semua file dalam satu batch sebelum dipanggil)."""
    if rows:
        payload = []
        for r in rows:
            item = {"batch_id": batch_id}
            for k_asal, k_db in _MAP_ROW.items():
                item[k_db] = r.get(k_asal, "")
            payload.append(item)
        # insert per 500 baris supaya tidak melebihi batas request
        for i in range(0, len(payload), 500):
            supabase.table("attendance_records").insert(payload[i:i + 500]).execute()

    if ringkasan_list:
        payload = []
        for r in ringkasan_list:
            item = {"batch_id": batch_id}
            for k_asal, k_db in _MAP_RINGKASAN.items():
                val = r.get(k_asal, "")
                item[k_db] = _angka(val) if k_db not in ("nama", "nip", "nrp", "golongan", "rincian_cuti", "sumber_file") else val
            item["sub_unit_kerja"] = r.get("_sub_unit", "")
            item["jabatan"] = r.get("_jabatan", "")
            payload.append(item)
        for i in range(0, len(payload), 500):
            supabase.table("ringkasan_pegawai").insert(payload[i:i + 500]).execute()

    if berkas_bermasalah_list:
        payload = [{"batch_id": batch_id, "nama_file": nf, "alasan": alasan}
                   for nf, alasan in berkas_bermasalah_list]
        supabase.table("berkas_bermasalah").insert(payload).execute()


def perbarui_jumlah_pegawai(batch_id):
    res = supabase.table("ringkasan_pegawai").select("id", count="exact").eq("batch_id", batch_id).execute()
    jumlah = res.count or 0
    supabase.table("batches").update({"jumlah_pegawai": jumlah}).eq("id", batch_id).execute()
    return jumlah


def perbarui_periode_batch(batch_id):
    """Hitung tanggal absensi paling awal & akhir dari DATA (bukan nama file),
    lalu simpan ke batch supaya tidak perlu dihitung ulang tiap kali dibuka."""
    rows = supabase.table("attendance_records").select("tanggal").eq("batch_id", batch_id).execute().data
    tanggal_valid = []
    for r in rows:
        try:
            # format keluaran extractor.py: "dd/mm/yyyy"
            tanggal_valid.append(datetime.strptime(r["tanggal"], "%d/%m/%Y").date())
        except (ValueError, TypeError, KeyError):
            continue
    if not tanggal_valid:
        return None, None
    awal, akhir = min(tanggal_valid), max(tanggal_valid)
    supabase.table("batches").update({
        "periode_awal": awal.isoformat(),
        "periode_akhir": akhir.isoformat(),
    }).eq("id", batch_id).execute()
    return awal.isoformat(), akhir.isoformat()


def ambil_attendance(batch_id):
    return supabase.table("attendance_records").select("*").eq("batch_id", batch_id)\
        .order("nama").order("tanggal").execute().data


def ambil_ringkasan(batch_id):
    return supabase.table("ringkasan_pegawai").select("*").eq("batch_id", batch_id)\
        .order("nama").execute().data


def ambil_ringkasan_semua_batch():
    """Semua baris ringkasan_pegawai lintas batch, dilengkapi info periode &
    bidang dari batch induknya — dipakai untuk agregasi di menu Visualisasi."""
    return supabase.table("ringkasan_pegawai").select(
        "nama,nip,terlambat,sakit,izin,alpha,batch_id,"
        "batches(label,periode_awal,periode_akhir,nama_bidang)"
    ).execute().data


def ambil_berkas_bermasalah(batch_id):
    return supabase.table("berkas_bermasalah").select("*").eq("batch_id", batch_id).execute().data


# ---------------------------------------------------------------------------
# EDIT satu field (dipakai tombol "Simpan perubahan" di editor tabel)
# ---------------------------------------------------------------------------
def edit_field(batch_id, record_table, record_id, field, nilai_baru, user_id):
    if record_table not in ("attendance_records", "ringkasan_pegawai"):
        raise ValueError("record_table tidak dikenal")

    lama = supabase.table(record_table).select(f"nama,{field}").eq("id", record_id).single().execute().data
    nilai_lama = lama.get(field) if lama else None
    nama_pegawai = lama.get("nama", "") if lama else ""

    supabase.table(record_table).update({field: nilai_baru, "is_edited": True}).eq("id", record_id).execute()

    supabase.table("record_edit_log").insert({
        "batch_id": batch_id,
        "record_id": record_id,
        "record_table": record_table,
        "nama_pegawai": nama_pegawai,
        "field_diubah": field,
        "nilai_lama": str(nilai_lama) if nilai_lama is not None else "",
        "nilai_baru": str(nilai_baru),
        "diubah_oleh": user_id,
    }).execute()


# ---------------------------------------------------------------------------
# LOG AKTIVITAS (lintas batch) & CARI PEGAWAI
# ---------------------------------------------------------------------------
def log_aktivitas(limit=100):
    return supabase.table("record_edit_log").select("*").order("diubah_pada", desc=True).limit(limit).execute().data


# ---------------------------------------------------------------------
# VISUALISASI (agregasi untuk grafik)
# ---------------------------------------------------------------------
def agregasi_keterangan():
    """Hitung jumlah baris harian per jenis Keterangan (Hadir/Sakit/Izin/dst),
    dijumlah dari SEMUA batch. Dipakai untuk donut chart."""
    rows = supabase.table("attendance_records").select("keterangan").execute().data
    hasil = {}
    for r in rows:
        k = r.get("keterangan") or "Tidak diketahui"
        hasil[k] = hasil.get(k, 0) + 1
    return hasil


def tren_bulanan():
    """Jumlahkan Terlambat/Sakit/Alpha/Izin per bulan (berdasarkan periode_akhir
    batch), dipakai untuk grafik batang bertumpuk per bulan."""
    batches = supabase.table("batches").select("id, periode_akhir").execute().data
    bulan_ke_batch = {}
    for b in batches:
        if not b.get("periode_akhir"):
            continue
        bulan = b["periode_akhir"][:7]  # "YYYY-MM"
        bulan_ke_batch.setdefault(bulan, []).append(b["id"])

    hasil = []
    for bulan, batch_ids in sorted(bulan_ke_batch.items()):
        ringkasan = (supabase.table("ringkasan_pegawai").select("terlambat,sakit,alpha")
                     .in_("batch_id", batch_ids).execute().data)
        hasil.append({
            "bulan": bulan,
            "terlambat": sum(r.get("terlambat") or 0 for r in ringkasan),
            "sakit": sum(r.get("sakit") or 0 for r in ringkasan),
            "alpha": sum(r.get("alpha") or 0 for r in ringkasan),
        })
    return hasil


def ranking_pegawai(field, limit=5):
    """field: 'alpha' atau 'terlambat'. Ranking dijumlah lintas semua
    batch per pegawai (dikelompokkan by NIP), bukan per-batch."""
    rows = supabase.table("ringkasan_pegawai").select(f"nama,nip,{field}").execute().data
    total = {}
    for r in rows:
        kunci = r.get("nip") or r.get("nama")
        if kunci not in total:
            total[kunci] = {"nama": r["nama"], "nip": r.get("nip"), "jumlah": 0}
        total[kunci]["jumlah"] += r.get(field) or 0
    urut = sorted(total.values(), key=lambda x: x["jumlah"], reverse=True)
    return [x for x in urut if x["jumlah"] > 0][:limit]


def cari_pegawai(kata_kunci):
    hasil_nama = supabase.table("attendance_records").select(
        "nama,nip,sub_unit_kerja,batch_id"
    ).ilike("nama", f"%{kata_kunci}%").limit(50).execute().data
    hasil_nip = supabase.table("attendance_records").select(
        "nama,nip,sub_unit_kerja,batch_id"
    ).ilike("nip", f"%{kata_kunci}%").limit(50).execute().data

    unik = {}
    for r in hasil_nama + hasil_nip:
        unik[(r["nama"], r["nip"])] = r
    return list(unik.values())


def riwayat_pegawai(nip):
    return supabase.table("ringkasan_pegawai").select("*, batches(label, nama_bidang, dibuat_pada)")\
        .eq("nip", nip).order("batch_id", desc=True).execute().data


# ---------------------------------------------------------------------------
# KETERANGAN_MASTER (dropdown)
# ---------------------------------------------------------------------------
def daftar_keterangan():
    return supabase.table("keterangan_master").select("*").order("urutan").execute().data


def tambah_keterangan(label):
    urutan_max = supabase.table("keterangan_master").select("urutan").order("urutan", desc=True).limit(1).execute().data
    urutan_baru = (urutan_max[0]["urutan"] + 1) if urutan_max else 1
    supabase.table("keterangan_master").insert({"label": label, "urutan": urutan_baru}).execute()


def hapus_keterangan(keterangan_id):
    supabase.table("keterangan_master").delete().eq("id", keterangan_id).execute()
