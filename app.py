# -*- coding: utf-8 -*-
"""
app.py — Sistem Rekapitulasi Absensi (versi dashboard + Supabase)
------------------------------------------------------------------
Login 3 admin (Supabase Auth) -> upload PDF -> data masuk DB sbg batch
draft -> bisa dikoreksi lewat editor tabel -> unduh Excel kapan saja
(tandai "Final" hanya penanda kesiapan, TIDAK mengunci pengeditan,
sesuai keputusan yang diminta).
"""
import os
import io
import functools
import tempfile
import uuid
from datetime import datetime

from flask import (
    Flask, request, jsonify, render_template, redirect,
    url_for, session, send_file
)
from dotenv import load_dotenv
from openpyxl import Workbook

load_dotenv()

import db
from extractor import ekstrak_pdf
from rekap_resmi import tulis_sheet_rekap_resmi

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024  # 300 MB, cukup utk ratusan PDF


@app.errorhandler(Exception)
def tangani_error_tak_terduga(e):
    """Jaring pengaman terakhir: kalau ada error tak terduga di mana pun,
    tetap balas JSON (bukan halaman HTML traceback bawaan Flask), supaya
    fetch() di dashboard.js tidak gagal parse dan malah menampilkan pesan
    generik "Gagal terhubung ke server" yang membingungkan."""
    import traceback
    traceback.print_exc()  # tetap tercetak lengkap di terminal untuk ditelusuri
    if request.path.startswith("/api/"):
        return jsonify({"ok": False, "pesan": f"Terjadi kesalahan di server: {e}"}), 500
    raise e


# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------
def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if "user" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "pesan": "Sesi berakhir, silakan login ulang"}), 401
            return redirect(url_for("login"))
        return view(*args, **kwargs)
    return wrapped


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html", error=None)

    email = request.form.get("email", "").strip()
    password = request.form.get("password", "")
    user, token = db.login(email, password)
    if not user:
        return render_template("login.html", error="Email atau password salah")

    session["user"] = user
    session["token"] = token
    return redirect(url_for("index"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ---------------------------------------------------------------------------
# HALAMAN UTAMA (shell dashboard - semua tab dirender lewat JS/fetch)
# ---------------------------------------------------------------------------
@app.route("/")
@login_required
def index():
    return render_template("dashboard.html", user=session["user"])


# ---------------------------------------------------------------------------
# API: BERANDA (ringkasan angka)
# ---------------------------------------------------------------------------
@app.route("/api/ringkasan-beranda")
@login_required
def ringkasan_beranda():
    semua = db.daftar_batch()
    total_batch = len(semua)
    perlu_ditinjau = len([b for b in semua if b["status"] == "draft"])
    total_pegawai = sum(b.get("jumlah_pegawai", 0) for b in semua)
    aktivitas = db.log_aktivitas(limit=8)
    return jsonify({
        "total_batch": total_batch,
        "perlu_ditinjau": perlu_ditinjau,
        "total_pegawai": total_pegawai,
        "aktivitas_terbaru": aktivitas,
    })


# ---------------------------------------------------------------------------
# API: PROSES BATCH BARU — dipecah jadi 3 langkah (mulai -> per file -> selesai)
# supaya browser bisa menampilkan progres ASLI (bukan animasi palsu), karena
# tiap file diproses lewat request terpisah dan hasilnya langsung diketahui.
# ---------------------------------------------------------------------------
@app.route("/api/proses/mulai", methods=["POST"])
@login_required
def proses_mulai():
    nama_bidang = request.form.get("nama_bidang", "").strip()
    label = nama_bidang.title() if nama_bidang else f"Batch {datetime.now().strftime('%d %b %Y %H:%M')}"
    batch = db.buat_batch(
        nama_bidang=nama_bidang,
        label=label,
        jumlah_pegawai=0,
        dibuat_oleh=session["user"]["email"],
    )
    return jsonify({"ok": True, "batch_id": batch["id"]})


@app.route("/api/proses/file", methods=["POST"])
@login_required
def proses_satu_file():
    batch_id = request.form.get("batch_id")
    f = request.files.get("file")
    if not batch_id or not f:
        return jsonify({"ok": False, "pesan": "batch_id atau file tidak ada"}), 400

    ekstensi = os.path.splitext(f.filename)[1] or ".pdf"
    tmp_path = os.path.join(tempfile.gettempdir(), f"absensi_{uuid.uuid4().hex}{ekstensi}")
    f.save(tmp_path)

    rows, ringkasan, error, log_bermasalah = [], [], None, None
    try:
        rows, ringkasan, error = ekstrak_pdf(tmp_path, f.filename)
    except Exception as e:
        error = f"Gagal diproses: {e}"
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    berkas_bermasalah = [(f.filename, error)] if error else []
    try:
        db.simpan_hasil_ekstraksi(batch_id, rows if not error else [], ringkasan if not error else [], berkas_bermasalah)
    except Exception as e:
        return jsonify({"ok": False, "pesan": f"Gagal menyimpan {f.filename} ke database: {e}"}), 500

    return jsonify({
        "ok": True,
        "nama_file": f.filename,
        "bermasalah": bool(error),
        "alasan": error,
        "jumlah_pegawai_baru": len(ringkasan) if not error else 0,
    })


@app.route("/api/proses/selesai", methods=["POST"])
@login_required
def proses_selesai():
    data = request.get_json(force=True)
    batch_id = data.get("batch_id")
    jumlah_pegawai = db.perbarui_jumlah_pegawai(batch_id)
    periode_awal, periode_akhir = db.perbarui_periode_batch(batch_id)
    attendance = db.ambil_attendance(batch_id)
    log_bermasalah = db.ambil_berkas_bermasalah(batch_id)
    return jsonify({
        "ok": True,
        "batch_id": batch_id,
        "jumlah_pegawai": jumlah_pegawai,
        "periode_awal": periode_awal,
        "periode_akhir": periode_akhir,
        "jumlah_baris": len(attendance),
        "pratinjau": attendance[:10],
        "log_bermasalah": [{"nama_file": e["nama_file"], "alasan": e["alasan"]} for e in log_bermasalah],
    })


# ---------------------------------------------------------------------------
# API: RIWAYAT BATCH (daftar + detail + edit + unduh + hapus)
# ---------------------------------------------------------------------------
@app.route("/api/batches")
@login_required
def api_daftar_batch():
    bidang = request.args.get("bidang") or None
    status = request.args.get("status") or None
    return jsonify(db.daftar_batch(bidang, status))


@app.route("/api/batches/<batch_id>")
@login_required
def api_detail_batch(batch_id):
    return jsonify({
        "batch": db.ambil_batch(batch_id),
        "attendance": db.ambil_attendance(batch_id),
        "ringkasan": db.ambil_ringkasan(batch_id),
        "berkas_bermasalah": db.ambil_berkas_bermasalah(batch_id),
    })


@app.route("/api/batches/<batch_id>/final", methods=["POST"])
@login_required
def api_tandai_final(batch_id):
    db.tandai_final(batch_id)
    return jsonify({"ok": True})


@app.route("/api/batches/<batch_id>", methods=["DELETE"])
@login_required
def api_hapus_batch(batch_id):
    db.hapus_batch(batch_id)
    return jsonify({"ok": True})


@app.route("/api/edit", methods=["POST"])
@login_required
def api_edit():
    """Body JSON: {batch_id, perubahan: [{record_table, record_id, field, nilai_baru}, ...]}"""
    data = request.get_json(force=True)
    batch_id = data["batch_id"]
    for p in data.get("perubahan", []):
        db.edit_field(batch_id, p["record_table"], p["record_id"], p["field"], p["nilai_baru"], session["user"]["email"])
    return jsonify({"ok": True})


@app.route("/api/batches/<batch_id>/unduh")
@login_required
def api_unduh(batch_id):
    batch = db.ambil_batch(batch_id)
    ringkasan_db = db.ambil_ringkasan(batch_id)
    attendance_db = db.ambil_attendance(batch_id)

    # kembalikan ke bentuk dict yang dipakai tulis_sheet_rekap_resmi (rekap_resmi.py)
    ringkasan_list = []
    for r in ringkasan_db:
        ringkasan_list.append({
            "Nama": r["nama"], "NIP": r["nip"], "NRP": r["nrp"], "Golongan": r["golongan"],
            "Terlambat (Hari)": r["terlambat"], "Pulang Cepat (Hari)": r["pulang_cepat"],
            "Tidak Absen Datang (Hari)": r["tidak_absen_datang"],
            "Tidak Absen Pulang (Hari)": r["tidak_absen_pulang"],
            "Izin (Hari)": r["izin"], "Alpha (Hari)": r["alpha"], "Sakit (Hari)": r["sakit"],
            "Dinas Luar (Hari)": r["dinas_luar"], "Lepas Piket (Hari)": r["lepas_piket"],
            "Tugas Belajar (Hari)": r["tugas_belajar"], "Total Cuti (Hari)": r["total_cuti"],
            "Rincian Cuti": r["rincian_cuti"], "Total Hari Kerja": r["total_hari_kerja"],
            "Sumber File": r["sumber_file"],
            "_sub_unit": r.get("sub_unit_kerja", ""), "_jabatan": r.get("jabatan", ""),
        })
    semua_tanggal = [a["tanggal"] for a in attendance_db if a.get("tanggal")]

    wb = Workbook()
    wb.remove(wb.active)
    tulis_sheet_rekap_resmi(wb, ringkasan_list, semua_tanggal, batch.get("nama_bidang", ""))

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    db.catat_unduhan(batch_id, session["user"]["email"])
    nama_file = f"Rekap_{batch.get('label', 'Batch').replace(' ', '_')}.xlsx"
    return send_file(buf, as_attachment=True, download_name=nama_file,
                      mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ---------------------------------------------------------------------------
# API: CARI PEGAWAI
# ---------------------------------------------------------------------------
@app.route("/api/visualisasi")
@login_required
def visualisasi():
    return jsonify({
        "keterangan": db.agregasi_keterangan(),
        "tren_bulanan": db.tren_bulanan(),
        "ranking_alpha": db.ranking_pegawai("alpha", limit=10),
        "ranking_terlambat": db.ranking_pegawai("terlambat", limit=10),
    })


@app.route("/api/cari-pegawai")
@login_required
def api_cari_pegawai():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])
    return jsonify(db.cari_pegawai(q))


@app.route("/api/riwayat-pegawai/<nip>")
@login_required
def api_riwayat_pegawai(nip):
    return jsonify(db.riwayat_pegawai(nip))


# ---------------------------------------------------------------------------
# API: LOG AKTIVITAS (global, lintas batch)
# ---------------------------------------------------------------------------
@app.route("/api/log-aktivitas")
@login_required
def api_log_aktivitas():
    return jsonify(db.log_aktivitas(limit=200))


# ---------------------------------------------------------------------------
# API: PENGATURAN — daftar keterangan (dropdown)
# ---------------------------------------------------------------------------
@app.route("/api/keterangan", methods=["GET", "POST"])
@login_required
def api_keterangan():
    if request.method == "POST":
        label = request.get_json(force=True).get("label", "").strip()
        if label:
            db.tambah_keterangan(label)
        return jsonify({"ok": True})
    return jsonify(db.daftar_keterangan())


@app.route("/api/keterangan/<int:keterangan_id>", methods=["DELETE"])
@login_required
def api_hapus_keterangan(keterangan_id):
    db.hapus_keterangan(keterangan_id)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
