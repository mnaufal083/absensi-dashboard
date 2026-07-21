-- ============================================================================
-- Skema database untuk Sistem Rekapitulasi Absensi — Bidang Daskrimti
-- Jalankan seluruh isi file ini di Supabase Dashboard -> SQL Editor -> New query
-- ============================================================================

-- Ekstensi untuk generate UUID otomatis
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. BATCHES — satu baris per batch upload/proses PDF
-- ----------------------------------------------------------------------------
create table if not exists batches (
    id              uuid primary key default gen_random_uuid(),
    nama_bidang     text not null default '',
    label           text not null,               -- mis. "Juni 2026" atau nama folder yang diunggah
    status          text not null default 'draft', -- 'draft' | 'final' (final = penanda siap unduh, TIDAK mengunci edit)
    jumlah_pegawai  integer not null default 0,
    dibuat_oleh     text not null default '',
    dibuat_pada     timestamptz not null default now(),
    diunduh_pada    timestamptz,                  -- diisi tiap kali tombol Unduh Excel diklik
    diunduh_oleh    text
);

-- ----------------------------------------------------------------------------
-- 2. ATTENDANCE_RECORDS — satu baris per tanggal kehadiran per pegawai
--    (field & nama kolom mengikuti output extractor.py::ekstrak_pdf)
-- ----------------------------------------------------------------------------
create table if not exists attendance_records (
    id                uuid primary key default gen_random_uuid(),
    batch_id          uuid not null references batches(id) on delete cascade,
    nama              text not null default '-',
    nip               text not null default '-',
    nrp               text not null default '-',
    golongan          text not null default '-',
    sub_unit_kerja    text not null default '',
    jabatan           text not null default '',
    tanggal           text not null default '',   -- format dd/mm/yyyy (sesuai extractor.py)
    jadwal_masuk      text not null default '',
    jadwal_pulang     text not null default '',
    jam_masuk         text not null default '',
    jam_keluar        text not null default '',
    datang_awal       text not null default '',
    datang_telat      text not null default '',
    pulang_awal       text not null default '',
    pulang_telat      text not null default '',
    jumlah_jam_kerja  text not null default '',
    keterangan        text not null default '',
    sumber_file       text not null default '',
    is_edited         boolean not null default false
);
create index if not exists idx_attendance_batch on attendance_records(batch_id);
create index if not exists idx_attendance_nip on attendance_records(nip);

-- ----------------------------------------------------------------------------
-- 3. RINGKASAN_PEGAWAI — satu baris per pegawai per batch (rekap statistik)
--    (field mengikuti output extractor.py::_bangun_ringkasan)
-- ----------------------------------------------------------------------------
create table if not exists ringkasan_pegawai (
    id                        uuid primary key default gen_random_uuid(),
    batch_id                  uuid not null references batches(id) on delete cascade,
    nama                      text not null default '-',
    nip                       text not null default '-',
    nrp                       text not null default '-',
    golongan                  text not null default '-',
    terlambat                 integer not null default 0,
    pulang_cepat              integer not null default 0,
    tidak_absen_datang        integer not null default 0,
    tidak_absen_pulang        integer not null default 0,
    izin                      integer not null default 0,
    alpha                     integer not null default 0,
    sakit                     integer not null default 0,
    dinas_luar                integer not null default 0,
    lepas_piket               integer not null default 0,
    tugas_belajar             integer not null default 0,
    total_cuti                integer not null default 0,
    rincian_cuti              text not null default '',
    total_hari_kerja          integer not null default 0,
    sub_unit_kerja            text not null default '',
    jabatan                   text not null default '',
    sumber_file               text not null default '',
    is_edited                 boolean not null default false
);
create index if not exists idx_ringkasan_batch on ringkasan_pegawai(batch_id);
create index if not exists idx_ringkasan_nip on ringkasan_pegawai(nip);

-- ----------------------------------------------------------------------------
-- 4. BERKAS_BERMASALAH — log file PDF yang gagal/dilewati per batch
-- ----------------------------------------------------------------------------
create table if not exists berkas_bermasalah (
    id          uuid primary key default gen_random_uuid(),
    batch_id    uuid not null references batches(id) on delete cascade,
    nama_file   text not null,
    alasan      text not null
);
create index if not exists idx_berkas_batch on berkas_bermasalah(batch_id);

-- ----------------------------------------------------------------------------
-- 5. KETERANGAN_MASTER — daftar tetap pilihan dropdown "Keterangan"
-- ----------------------------------------------------------------------------
create table if not exists keterangan_master (
    id       serial primary key,
    label    text not null unique,
    urutan   integer not null default 0
);
insert into keterangan_master (label, urutan) values
    ('Hadir', 1), ('Sakit', 2), ('Izin', 3), ('Alpha', 4),
    ('Cuti Belajar', 5), ('Cuti Alasan Penting', 6), ('Cuti Besar', 7),
    ('Dinas Luar', 8), ('Lepas Piket', 9), ('Libur', 10)
on conflict (label) do nothing;

-- ----------------------------------------------------------------------------
-- 6. RECORD_EDIT_LOG — audit trail semua perubahan data (lintas batch)
-- ----------------------------------------------------------------------------
create table if not exists record_edit_log (
    id              uuid primary key default gen_random_uuid(),
    batch_id        uuid not null references batches(id) on delete cascade,
    record_id       uuid not null,               -- id baris di attendance_records atau ringkasan_pegawai
    record_table    text not null,                -- 'attendance_records' | 'ringkasan_pegawai'
    nama_pegawai    text not null default '',
    field_diubah    text not null,
    nilai_lama      text,
    nilai_baru      text,
    diubah_oleh     text not null default '',
    diubah_pada     timestamptz not null default now()
);
create index if not exists idx_log_batch on record_edit_log(batch_id);
create index if not exists idx_log_waktu on record_edit_log(diubah_pada desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Karena hanya 3 admin internal yang setara haknya, kebijakan dibuat sederhana:
-- siapa pun yang sudah login (authenticated) boleh baca & tulis semua baris.
-- ============================================================================
alter table batches enable row level security;
alter table attendance_records enable row level security;
alter table ringkasan_pegawai enable row level security;
alter table berkas_bermasalah enable row level security;
alter table keterangan_master enable row level security;
alter table record_edit_log enable row level security;

create policy "authenticated_full_access" on batches
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on attendance_records
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on ringkasan_pegawai
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on berkas_bermasalah
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on keterangan_master
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on record_edit_log
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Catatan: backend Flask memakai SERVICE ROLE KEY (lihat README_INTEGRASI.md),
-- yang otomatis melewati RLS di atas. Kebijakan ini tetap berguna sebagai
-- lapisan pengaman kedua kalau suatu saat ada akses langsung dari client
-- memakai anon/public key.
