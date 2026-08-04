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
import httpx
from datetime import datetime, timezone
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ---------------------------------------------------------------------
# Perbaikan "httpx.RemoteProtocolError: Server disconnected" / "Server
# disconnected without sending a response" yang SESEKALI muncul.
#
# Penyebabnya: koneksi HTTP yang disimpan (keep-alive) oleh httpx ke
# Supabase kadang ditutup diam-diam oleh server setelah idle beberapa
# saat. Permintaan BERIKUTNYA yang mencoba memakai ulang koneksi basi itu
# akan gagal dengan error ini — bukan bug di kode kita, tapi httpx
# defaultnya TIDAK otomatis mencoba ulang saat ini terjadi (retries=0).
#
# Solusinya: pasang ulang transport bawaan httpx dengan retries>0, supaya
# httpx sendiri yang otomatis membuka koneksi baru & mencoba ulang di
# level jaringan sebelum errornya sempat naik ke kode Python kita.
# ---------------------------------------------------------------------
_transport_retry = httpx.HTTPTransport(retries=2)
supabase.postgrest.session._transport = _transport_retry
try:
    supabase.auth._http_client._transport = _transport_retry
except AttributeError:
    pass  # versi supabase-py tertentu punya struktur auth client sedikit berbeda; aman diabaikan

_HALAMAN = 1000  # batas baris per request bawaan PostgREST/Supabase


def _ambil_semua(builder):
    """Ambil SEMUA baris dari sebuah query Supabase yang belum dieksekusi,
    sekalipun jumlahnya melebihi batas 1000 baris per request bawaan
    PostgREST. Tanpa ini, tabel besar (mis. attendance_records ratusan
    pegawai x puluhan hari) akan terpotong diam-diam ke 1000 baris pertama
    saja - itu sebabnya jumlah pegawai di tab Data Harian bisa lebih
    sedikit dari jumlah sebenarnya."""
    semua = []
    awal = 0
    while True:
        potongan = builder.range(awal, awal + _HALAMAN - 1).execute().data
        semua.extend(potongan)
        if len(potongan) < _HALAMAN:
            break
        awal += _HALAMAN
    return semua


# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------
def login(email: str, password: str):
    """Login pakai Supabase Auth. Mengembalikan (user_dict, access_token, error)
    - user_dict berisi id/email/nama/role kalau berhasil, atau (None, None,
    pesan_error) kalau gagal (password salah ATAU akun dinonaktifkan Master
    Admin).

    PERBAIKAN PENTING (27 Jul 2026): dulu fungsi ini memakai objek `supabase`
    GLOBAL yang sama dipakai semua fungsi lain di file ini (termasuk
    auth.admin.create_user untuk fitur "Tambah Admin"). Masalahnya,
    supabase-py OTOMATIS menukar token otorisasi klien dari service_role
    jadi token sesi milik user yang baru login, begitu sign_in_with_password()
    dipanggil - ini perilaku bawaan library (GoTrue), bukan bug di kode kita.
    Akibatnya: begitu ADA SAJA yang login lewat aplikasi ini, objek
    `supabase` global jadi "tercemar" - kehilangan hak service_role - dan
    semua panggilan admin SETELAHNYA (bikin akun, dst) ditolak dengan error
    "User not allowed", walau kodenya sendiri benar dan SUPABASE_SERVICE_KEY
    di .env juga sudah benar. Itu sebabnya kalau dites di proses Python baru
    (belum pernah ada yang login), semua terlihat berhasil - tapi begitu
    dipakai di aplikasi asli (login dulu, baru buka halaman Akun), gagal.

    Solusinya: verifikasi email/password di sini memakai client Supabase
    TERPISAH & sekali-pakai (dibuang begitu fungsi ini selesai), supaya
    client `supabase` global tidak pernah ikut "tercemar" oleh sesi user
    biasa, dan tetap murni service_role untuk operasi admin di fungsi lain."""
    client_login: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    try:
        client_login.auth._http_client._transport = httpx.HTTPTransport(retries=2)
    except AttributeError:
        pass  # versi supabase-py tertentu punya struktur auth client sedikit berbeda; aman diabaikan

    try:
        res = client_login.auth.sign_in_with_password({"email": email, "password": password})
    except Exception:
        return None, None, "Email atau password salah"
    if not res.user:
        return None, None, "Email atau password salah"

    profil = ambil_atau_buat_profil(res.user.id, res.user.email)
    if not profil["aktif"]:
        return None, None, "Akun ini sudah dinonaktifkan oleh Master Admin. Hubungi Master Admin kalau ini keliru."

    user = {
        "id": res.user.id, "email": res.user.email,
        "nama": profil.get("nama") or "", "role": profil.get("role", "admin"),
    }
    return user, res.session.access_token, None


# ---------------------------------------------------------------------------
# AKUN (khusus Master Admin) - manajemen admin lain lewat dashboard, bukan
# langsung dari Supabase. Memakai Supabase Auth Admin API (supabase.auth.admin),
# tersedia karena kita pakai SERVICE_ROLE_KEY, bukan anon key.
# ---------------------------------------------------------------------------
def ambil_atau_buat_profil(user_id, email):
    """Ambil baris admin_profiles untuk user ini; kalau belum ada (mis. akun
    lama yang dibuat manual dari Supabase Dashboard sebelum fitur ini ada),
    buat otomatis dengan role='admin' & aktif=True (paling minim hak akses
    secara default, aman)."""
    ada = supabase.table("admin_profiles").select("*").eq("user_id", user_id).limit(1).execute().data
    if ada:
        return ada[0]
    baru = {"user_id": user_id, "email": email, "role": "admin", "aktif": True}
    supabase.table("admin_profiles").insert(baru).execute()
    return baru


def ambil_profil(user_id):
    hasil = supabase.table("admin_profiles").select("*").eq("user_id", user_id).limit(1).execute().data
    return hasil[0] if hasil else None


def daftar_akun():
    return supabase.table("admin_profiles").select("*").order("dibuat_pada").execute().data


def buat_akun_admin(email, password, nama):
    """Dipanggil Master Admin lewat halaman Akun. Akun baru SELALU dibuat
    dengan role='admin' (bukan master) - satu-satunya cara menambah Master
    Admin lain adalah lewat SQL manual di Supabase, sesuai desain sengaja:
    supaya kewenangan tertinggi tidak bisa diperbanyak sembarangan dari UI."""
    hasil = supabase.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True,  # tidak perlu verifikasi email, langsung bisa login
        "user_metadata": {"nama": nama},
    })
    supabase.table("admin_profiles").insert({
        "user_id": hasil.user.id, "email": email, "nama": nama, "role": "admin", "aktif": True,
    }).execute()
    return hasil.user.id


def set_status_akun(user_id, aktif):
    supabase.table("admin_profiles").update({"aktif": aktif}).eq("user_id", user_id).execute()


def hapus_akun(user_id):
    supabase.auth.admin.delete_user(user_id)
    supabase.table("admin_profiles").delete().eq("user_id", user_id).execute()


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


def tandai_draft(batch_id):
    """Kembalikan batch yang sudah final ke status draf lagi - dipakai kalau
    admin perlu mengoreksi data lebih lanjut setelah sempat difinalisasi.
    Field harian/ringkasan cuma bisa diedit saat status='draft' (lihat
    pengecekan disabled di dashboard.js)."""
    supabase.table("batches").update({"status": "draft"}).eq("id", batch_id).execute()


def catat_unduhan(batch_id, user_id):
    supabase.table("batches").update({
        "diunduh_pada": datetime.now(timezone.utc).isoformat(),
        "diunduh_oleh": user_id,
    }).eq("id", batch_id).execute()


def catat_log_batch(batch_id, batch_label, aksi, detail, user_id):
    """Catat aktivitas level-batch (upload/hapus) ke record_edit_log yang
    sama dipakai log edit per-field, supaya semuanya tampil dalam satu
    linimasa di halaman Log Aktivitas. record_table='batch' membedakannya
    dari log edit field biasa."""
    supabase.table("record_edit_log").insert({
        "batch_id": batch_id,
        "batch_label": batch_label or "",
        "record_id": None,
        "record_table": "batch",
        "nama_pegawai": "",
        "field_diubah": aksi,
        "nilai_lama": "",
        "nilai_baru": detail,
        "diubah_oleh": user_id,
    }).execute()


def hapus_batch(batch_id):
    # attendance_records, ringkasan_pegawai, berkas_bermasalah otomatis ikut
    # terhapus karena "on delete cascade" di schema.sql. record_edit_log
    # TIDAK ikut terhapus (sudah diubah jadi "on delete set null") - jadi
    # jejak aktivitas "Hapus Batch" yang dicatat oleh pemanggil (lihat
    # app.py::api_hapus_batch) tetap bertahan setelah baris ini dieksekusi.
    supabase.table("batches").delete().eq("id", batch_id).execute()


# ---------------------------------------------------------------------------
# ATTENDANCE_RECORDS & RINGKASAN_PEGAWAI (simpan hasil ekstraksi PDF)
# ---------------------------------------------------------------------------
_MAP_ROW = {
    "Nama": "nama", "NIP": "nip", "NRP": "nrp", "Golongan": "golongan",
    "Sub Unit Kerja": "sub_unit_kerja", "Jabatan": "jabatan", "Tanggal": "tanggal",
    "Jadwal Masuk": "jadwal_masuk", "Jadwal Pulang": "jadwal_pulang",
    "Jam Masuk": "jam_masuk", "Jam Keluar": "jam_keluar",
    "Telat": "datang_telat",  # dihitung sendiri (Jam Masuk vs Jadwal Masuk), bukan dari kolom PDF
    "Keterangan": "keterangan",
    "Bidang": "bidang",
    "Sumber File": "sumber_file",
}
_MAP_RINGKASAN = {
    "Nama": "nama", "NIP": "nip", "NRP": "nrp", "Golongan": "golongan",
    "Bidang": "bidang",
    "Terlambat (Hari)": "terlambat", "Pulang Cepat (Hari)": "pulang_cepat",
    "Tidak Absen Datang (Hari)": "tidak_absen_datang",
    "Tidak Absen Pulang (Hari)": "tidak_absen_pulang",
    "Izin (Hari)": "izin", "Alpha (Hari)": "alpha", "Sakit (Hari)": "sakit",
    "Dinas Luar (Hari)": "dinas_luar", "Lepas Piket (Hari)": "lepas_piket",
    "Tugas Belajar (Hari)": "tugas_belajar", "Total Cuti (Hari)": "total_cuti",
    "Rincian Cuti": "rincian_cuti", "Total Hari Kerja": "total_hari_kerja",
    "Sumber File": "sumber_file",
}
_FIELD_TEKS_RINGKASAN = ("nama", "nip", "nrp", "golongan", "bidang", "rincian_cuti", "sumber_file")


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
        # PERBAIKAN (26 Jul 2026): kolom "bidang" per pegawai dulu SELALU
        # kosong saat disimpan (cuma bisa terisi lewat koreksi manual satu-
        # satu di tab Ringkasan Pegawai) - itu sebabnya chart "Perbandingan
        # Antar Bidang" di Visualisasi praktis kosong untuk hampir semua
        # Bidang. Sekarang: kalau batch ini SUDAH ditandai 1 Bidang spesifik
        # saat upload (bukan "Campuran/belum ditentukan"), semua pegawai di
        # batch ini otomatis ikut ditandai Bidang yang sama. Koreksi manual
        # jadi cuma perlu dilakukan untuk batch yang SUNGGUH campuran lintas
        # Bidang, bukan untuk semua batch.
        batch = ambil_batch(batch_id)
        bidang_batch = (batch or {}).get("nama_bidang") or ""

        payload = []
        for r in ringkasan_list:
            item = {"batch_id": batch_id}
            for k_asal, k_db in _MAP_RINGKASAN.items():
                val = r.get(k_asal, "")
                item[k_db] = _angka(val) if k_db not in _FIELD_TEKS_RINGKASAN else val
            item["sub_unit_kerja"] = r.get("_sub_unit", "")
            item["jabatan"] = r.get("_jabatan", "")
            if bidang_batch:
                item["bidang"] = bidang_batch
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
    q = supabase.table("attendance_records").select("tanggal").eq("batch_id", batch_id)
    rows = _ambil_semua(q)
    tanggal_valid = []
    for r in rows:
        try:
            # format keluaran extractor.py sekarang: ISO "yyyy-mm-dd"
            tanggal_valid.append(datetime.strptime(r["tanggal"], "%Y-%m-%d").date())
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
    q = supabase.table("attendance_records").select("*").eq("batch_id", batch_id)\
        .order("nama").order("tanggal")
    return _ambil_semua(q)


def ambil_ringkasan(batch_id):
    return supabase.table("ringkasan_pegawai").select("*").eq("batch_id", batch_id)\
        .order("nama").execute().data


def ambil_ringkasan_semua_batch():
    """Semua baris ringkasan_pegawai lintas batch, dilengkapi info periode &
    bidang dari batch induknya — dipakai untuk agregasi di menu Visualisasi."""
    q = supabase.table("ringkasan_pegawai").select(
        "nama,nip,terlambat,sakit,izin,alpha,batch_id,"
        "batches(label,periode_awal,periode_akhir,nama_bidang)"
    )
    return _ambil_semua(q)


def ambil_berkas_bermasalah(batch_id):
    return supabase.table("berkas_bermasalah").select("*").eq("batch_id", batch_id).execute().data


# ---------------------------------------------------------------------------
# DETEKSI DUPLIKAT (dibangun ulang 23 Jul 2026, scope diperluas 23 Jul 2026
# sore jadi LINTAS BATCH atas permintaan - sebelumnya cuma dicek dalam SATU
# batch yang sama, sehingga file yang sama diproses ulang di batch BARU
# tidak tertangkap). Dua lapis:
#   1) batch_file_hashes         -> file identik byte-per-byte (nama beda pun tetap kena)
#   2) batch_pegawai_signature   -> data harian satu pegawai identik walau file
#                                    beda byte-nya (kasus file diekspor ulang)
# batch_id TETAP dicatat saat menyimpan (supaya tahu file/pegawai itu
# pertama kali muncul di batch mana), tapi PENGECEKANNYA tidak lagi
# difilter ke batch_id tertentu - dicek ke SELURUH riwayat, batch apa pun.
# ---------------------------------------------------------------------------
def cek_dan_catat_hash_file(batch_id, file_hash, nama_file):
    """Return {'nama_file':..., 'batch_label':...} kalau hash ini SUDAH
    PERNAH tercatat di batch MANA PUN (termasuk batch lain, bukan cuma
    batch yang sedang diproses sekarang), atau None kalau belum pernah ada
    sama sekali (sekaligus langsung dicatat sebagai baru).

    Dibungkus try/except supaya kalau tabel batch_file_hashes belum dibuat
    di Supabase (atau ada gangguan koneksi sesaat), deteksi duplikat GAGAL
    DENGAN AMAN (dianggap tidak duplikat) alih-alih membuat SELURUH proses
    upload file tersebut ikut gagal/error."""
    try:
        ada = supabase.table("batch_file_hashes").select("nama_file,batches(label)")\
            .eq("file_hash", file_hash).limit(1).execute().data
        if ada:
            label = ((ada[0].get("batches") or {}) or {}).get("label", "")
            return {"nama_file": ada[0]["nama_file"], "batch_label": label}
        supabase.table("batch_file_hashes").insert({
            "batch_id": batch_id, "file_hash": file_hash, "nama_file": nama_file,
        }).execute()
        return None
    except Exception as e:
        print(f"[deteksi-duplikat] cek_dan_catat_hash_file gagal (dilewati, dianggap bukan duplikat): {e}")
        return None


def cek_dan_catat_signature_pegawai(batch_id, nip, signature, nama_file):
    """Return {'nama_file':..., 'batch_label':...} kalau signature data
    harian ini (untuk NIP yang sama) SUDAH PERNAH tercatat di batch MANA
    PUN, atau None kalau belum pernah ada sama sekali (sekaligus langsung
    dicatat sebagai baru).

    Sama seperti di atas, dibungkus try/except supaya kalau tabel
    batch_pegawai_signature bermasalah, ini tidak menjatuhkan seluruh
    proses ekstraksi pegawai yang bersangkutan."""
    try:
        ada = supabase.table("batch_pegawai_signature").select("nama_file,batches(label)")\
            .eq("nip", nip).eq("signature", signature).limit(1).execute().data
        if ada:
            label = ((ada[0].get("batches") or {}) or {}).get("label", "")
            return {"nama_file": ada[0]["nama_file"], "batch_label": label}
        supabase.table("batch_pegawai_signature").insert({
            "batch_id": batch_id, "nip": nip, "signature": signature, "nama_file": nama_file,
        }).execute()
        return None
    except Exception as e:
        print(f"[deteksi-duplikat] cek_dan_catat_signature_pegawai gagal (dilewati, dianggap bukan duplikat): {e}")
        return None


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
# VISUALISASI (agregasi untuk grafik) — semuanya mendukung filter tunggal:
# mode='all' (akumulasi semua), mode='bidang' (value=nama Bidang),
# atau mode='batch' (value=id batch spesifik).
#
# CATATAN PENTING: mode='bidang' memfilter berdasarkan kolom `bidang` di
# tabel ringkasan_pegawai/attendance_records (per-PEGAWAI), BUKAN
# batches.nama_bidang (per-BATCH). Ini supaya satu batch gabungan yang
# berisi banyak Bidang sekaligus (upload 372 file tanpa nama_bidang manual)
# tetap bisa difilter dengan benar per Bidang, asalkan kolom `bidang`
# tiap pegawai sudah diisi (otomatis kalau diisi manual saat upload, atau
# dikoreksi satu per satu lewat tab Ringkasan Pegawai).
# ---------------------------------------------------------------------
def _batch_ids_untuk_tahun(tahun):
    """Cari semua batch_id yang periode_akhir-nya jatuh di tahun tertentu.
    Dipakai mode filter 'tahun' - attendance_records/ringkasan_pegawai
    sendiri tidak menyimpan tanggal periode, jadi harus ditelusuri lewat
    tabel batches dulu."""
    rows = _ambil_semua(supabase.table("batches").select("id,periode_akhir"))
    return [r["id"] for r in rows if (r.get("periode_akhir") or "")[:4] == str(tahun)]


def daftar_tahun_tersedia():
    """Daftar tahun (unik, urut terbaru dulu) yang punya batch dengan
    periode_akhir tercatat - dipakai untuk mengelompokkan dropdown Pilih
    Batch di Visualisasi per tahun (lihat FITUR BARU 1 Agu 2026 di bawah)."""
    rows = _ambil_semua(supabase.table("batches").select("periode_akhir"))
    tahun = sorted({(r.get("periode_akhir") or "")[:4] for r in rows if r.get("periode_akhir")}, reverse=True)
    return tahun


def _terapkan_filter(q, mode, value, kolom_bidang="bidang"):
    """Tempelkan filter ke query Supabase sesuai mode. mode='batch' filter
    by batch_id, mode='bidang' filter by kolom bidang (ilike), mode='tahun'
    filter ke semua batch yang periode_akhir-nya jatuh di tahun tsb
    (FITUR BARU 1 Agu 2026 - supaya statistik tidak cuma bisa dilihat per
    satu batch atau akumulasi SELAMANYA, ada jenjang di antaranya), mode='all'
    tidak menambah filter apa pun."""
    if mode == "batch" and value:
        return q.eq("batch_id", value)
    if mode == "bidang" and value:
        return q.ilike(kolom_bidang, value)
    if mode == "tahun" and value:
        ids = _batch_ids_untuk_tahun(value)
        if not ids:
            return q.eq("batch_id", "00000000-0000-0000-0000-000000000000")  # sengaja tidak match apa pun
        return q.in_("batch_id", ids)
    return q


def statistik_ringkas(mode="all", value=None):
    q = supabase.table("ringkasan_pegawai").select("terlambat,sakit,alpha")
    q = _terapkan_filter(q, mode, value)
    rows = _ambil_semua(q)
    return {
        "total_pegawai": len(rows),
        "telat": sum(r.get("terlambat") or 0 for r in rows),
        "alpha": sum(r.get("alpha") or 0 for r in rows),
        "sakit": sum(r.get("sakit") or 0 for r in rows),
    }


def agregasi_keterangan(mode="all", value=None):
    """Hitung jumlah baris harian per jenis Keterangan (Hadir/Sakit/Izin/dst),
    sesuai cakupan filter. Dipakai untuk donut chart."""
    q = supabase.table("attendance_records").select("keterangan")
    q = _terapkan_filter(q, mode, value)
    rows = _ambil_semua(q)
    hasil = {}
    for r in rows:
        k = r.get("keterangan") or "Tidak diketahui"
        hasil[k] = hasil.get(k, 0) + 1
    return hasil


def tren_bulanan(mode="all", value=None):
    """Jumlahkan Terlambat/Sakit/Alpha per bulan (berdasarkan periode_akhir
    batch), sesuai cakupan filter. Dipakai untuk grafik tren garis."""
    batches = supabase.table("batches").select("id, periode_akhir").execute().data
    if mode == "batch" and value:
        batches = [b for b in batches if b["id"] == value]
    if mode == "tahun" and value:
        batches = [b for b in batches if (b.get("periode_akhir") or "")[:4] == str(value)]

    bulan_ke_batch = {}
    for b in batches:
        if not b.get("periode_akhir"):
            continue
        bulan = b["periode_akhir"][:7]  # "YYYY-MM"
        bulan_ke_batch.setdefault(bulan, []).append(b["id"])

    hasil = []
    for bulan, batch_ids in sorted(bulan_ke_batch.items()):
        q = supabase.table("ringkasan_pegawai").select("terlambat,sakit,alpha").in_("batch_id", batch_ids)
        if mode == "bidang" and value:
            q = q.ilike("bidang", value)
        ringkasan = _ambil_semua(q)
        hasil.append({
            "bulan": bulan,
            "terlambat": sum(r.get("terlambat") or 0 for r in ringkasan),
            "sakit": sum(r.get("sakit") or 0 for r in ringkasan),
            "alpha": sum(r.get("alpha") or 0 for r in ringkasan),
        })
    return hasil


def ranking_pegawai(field, mode="all", value=None, limit=5):
    """field: 'alpha' atau 'terlambat'. Ranking dijumlah sesuai cakupan
    filter, dikelompokkan per pegawai (by NIP) supaya lintas-batch tetap
    terjumlah jadi satu jika mode='all' atau 'bidang'."""
    q = supabase.table("ringkasan_pegawai").select(f"nama,nip,{field}")
    q = _terapkan_filter(q, mode, value)
    rows = _ambil_semua(q)
    total = {}
    for r in rows:
        kunci = r.get("nip") or r.get("nama")
        if kunci not in total:
            total[kunci] = {"nama": r["nama"], "nip": r.get("nip"), "jumlah": 0}
        total[kunci]["jumlah"] += r.get(field) or 0
    urut = sorted(total.values(), key=lambda x: x["jumlah"], reverse=True)
    return [x for x in urut if x["jumlah"] > 0][:limit]


def ambil_pengaturan(kunci, default=None):
    """Ambil satu nilai pengaturan umum (key-value), mis. referensi jumlah
    pegawai riil kantor. Kembalikan `default` kalau kuncinya belum pernah
    diisi."""
    baris = supabase.table("pengaturan").select("nilai").eq("kunci", kunci).limit(1).execute().data
    return baris[0]["nilai"] if baris else default


def set_pengaturan(kunci, nilai):
    supabase.table("pengaturan").upsert({"kunci": kunci, "nilai": str(nilai)}).execute()


def daftar_bidang():
    return supabase.table("bidang_master").select("*").order("urutan").execute().data


def tambah_bidang(label):
    urutan_max = supabase.table("bidang_master").select("urutan").order("urutan", desc=True).limit(1).execute().data
    urutan_baru = (urutan_max[0]["urutan"] + 1) if urutan_max else 1
    supabase.table("bidang_master").insert({"label": label.strip().upper(), "urutan": urutan_baru}).execute()


def hapus_bidang(bidang_id):
    supabase.table("bidang_master").delete().eq("id", bidang_id).execute()


def perbandingan_bidang(batch_id=None):
    """Rekap Total Pegawai/Telat/Alpha per Bidang, dipakai untuk grafik
    batang perbandingan di Visualisasi.

    - Telat/Alpha: dijumlah dari SEMUA baris ringkasan_pegawai yang cocok
      (batch_id kalau diisi, atau semua batch kalau tidak) - ini kejadian
      per-periode, sah dijumlah lintas waktu seperti sebelumnya.

    - Total Pegawai: PERBAIKAN (30 Jul 2026) - dulu dihitung dari JUMLAH
      BARIS ringkasan_pegawai (len(rows)). Masalahnya, satu pegawai punya
      SATU baris PER BATCH (mis. per bulan) dia diproses - jadi kalau
      tidak dibatasi ke satu batch, pegawai yang sudah diproses di 12
      batch bulanan akan ikut menambah Total Pegawai sebanyak 12 kali.
      Lebih parah lagi kalau pegawai itu sempat MUTASI pindah Bidang: dia
      bisa ikut menambah Total Pegawai di LEBIH DARI SATU Bidang sekaligus
      secara tidak sengaja. Sekarang Total Pegawai dihitung dari HEADCOUNT
      UNIK per NIP, diambil dari BATCH TERBARU (periode_akhir paling akhir)
      tiap pegawai - merepresentasikan susunan organisasi SAAT INI, bukan
      akumulasi sepanjang sejarah. Kalau batch_id diisi (mode satu batch),
      headcount otomatis = jumlah NIP unik di batch itu saja.
    """
    daftar = daftar_bidang()
    # Pencocokan nama Bidang tetap case-insensitive, konsisten dengan ilike()
    # yang dipakai query Telat/Alpha di bawah.
    label_ci = {b["label"].strip().lower(): b["label"] for b in daftar}

    hasil = {}
    for b in daftar:
        nama_bidang = b["label"]
        q = supabase.table("ringkasan_pegawai").select("terlambat,alpha").ilike("bidang", nama_bidang)
        if batch_id:
            q = q.eq("batch_id", batch_id)
        rows = _ambil_semua(q)
        hasil[nama_bidang] = {
            "bidang": nama_bidang,
            "total_pegawai": 0,
            "telat": sum(r.get("terlambat") or 0 for r in rows),
            "alpha": sum(r.get("alpha") or 0 for r in rows),
        }

    # --- Total Pegawai: headcount unik per NIP ---
    if batch_id:
        rows_pegawai = _ambil_semua(supabase.table("ringkasan_pegawai").select("nip,bidang").eq("batch_id", batch_id))
        terbaru_per_nip = {r["nip"]: r for r in rows_pegawai if r.get("nip")}
    else:
        rows_pegawai = _ambil_semua(
            supabase.table("ringkasan_pegawai").select("nip,bidang,batches(periode_akhir,dibuat_pada)")
        )
        terbaru_per_nip = {}
        for r in rows_pegawai:
            nip = r.get("nip")
            if not nip:
                continue
            info_batch = r.get("batches") or {}
            kunci_waktu = info_batch.get("periode_akhir") or info_batch.get("dibuat_pada") or ""
            terdahulu = terbaru_per_nip.get(nip)
            if not terdahulu or kunci_waktu > terdahulu["_kunci_waktu"]:
                terbaru_per_nip[nip] = {"bidang": r.get("bidang"), "_kunci_waktu": kunci_waktu}

    for info in terbaru_per_nip.values():
        nama_bidang = label_ci.get((info.get("bidang") or "").strip().lower())
        if nama_bidang:
            hasil[nama_bidang]["total_pegawai"] += 1

    return [hasil[b["label"]] for b in daftar]


def cari_pegawai(kata_kunci):
    # Dicari dari ringkasan_pegawai (SATU baris per pegawai per batch), BUKAN
    # dari attendance_records (bisa 20-30 baris per pegawai per bulan) —
    # supaya limit tidak habis cuma untuk 1-2 pegawai sebelum sempat
    # menjangkau pegawai lain yang juga cocok dengan kata kuncinya.
    #
    # PERBAIKAN (27 Jul 2026): pencarian NIP dulu "mengandung di mana saja"
    # (%kata_kunci%) - jadi mengetik "192" bisa cocok dengan NIP yang
    # kebetulan ada "192" di TENGAH (mis. "...121192..."), padahal NIP di
    # Indonesia berformat tanggal lahir di 8 digit AWAL (YYYYMMDD). Hasilnya
    # terasa acak/tidak nyambung dengan angka yang diketik. Sekarang
    # pencarian NIP dicocokkan dari AWAL saja (prefix), sesuai cara orang
    # biasa mengetik NIP (mis. tahun lahir). Pencarian Nama tetap "mengandung
    # di mana saja" karena nama biasanya dicari sebagian kata di tengah pun
    # (mis. nama belakang), itu perilaku yang wajar untuk teks.
    hasil_nama = supabase.table("ringkasan_pegawai").select(
        "nama,nip,sub_unit_kerja,bidang,batch_id"
    ).ilike("nama", f"%{kata_kunci}%").limit(50).execute().data
    hasil_nip = supabase.table("ringkasan_pegawai").select(
        "nama,nip,sub_unit_kerja,bidang,batch_id"
    ).ilike("nip", f"{kata_kunci}%").limit(50).execute().data

    unik = {}
    for r in hasil_nama + hasil_nip:
        unik[(r["nama"], r["nip"])] = r
    return sorted(unik.values(), key=lambda r: r["nama"])


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
