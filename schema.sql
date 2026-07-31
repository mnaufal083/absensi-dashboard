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
    bidang            text not null default '', -- Bidang per-PEGAWAI, bukan per-batch (lihat catatan di bawah)
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
    bidang                    text not null default '', -- Bidang per-PEGAWAI (lihat catatan di bawah)
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
-- PERBAIKAN (30 Jul 2026): dulu ada "WFO" DAN "Hadir" sekaligus di daftar
-- default - dua istilah untuk hal yang sama (pegawai hadir kerja), bikin
-- pilihan dropdown ambigu/tidak konsisten antar pegawai/batch. Sekarang
-- cukup "WFO" saja yang mewakili kehadiran; "Hadir" dihapus dari daftar
-- default. (Kalau instalasi yang SUDAH ADA masih punya baris "Hadir" di
-- keterangan_master beserta data attendance_records yang memakainya, lihat
-- catatan migrasi di README_INTEGRASI.md bagian Troubleshooting.)
insert into keterangan_master (label, urutan) values
    ('WFO', 0),
    ('Sakit', 2), ('Izin', 3), ('Alpha', 4),
    ('Cuti Belajar', 5), ('Cuti Alasan Penting', 6), ('Cuti Besar', 7),
    ('Dinas Luar', 8), ('Lepas Piket', 9), ('Libur', 10), ('-', 11)
on conflict (label) do nothing;

-- ----------------------------------------------------------------------------
-- 5b. BIDANG_MASTER — daftar tetap nama Bidang (dulu hardcode terpisah di
-- dashboard.js DAN db.py sekaligus - rawan tidak sinkron kalau salah satu
-- lupa diperbarui, seperti yang pernah terjadi waktu "DATUN" ketinggalan
-- di satu file. Sekarang jadi satu sumber data, dikelola dari Pengaturan.
-- ----------------------------------------------------------------------------
create table if not exists bidang_master (
    id       serial primary key,
    label    text not null unique,
    urutan   integer not null default 0
);
insert into bidang_master (label, urutan) values
    ('PIDMIL', 0), ('BIN', 1), ('PIDUM', 2), ('PIDSUS', 3), ('DATUN', 4), ('INTEL', 5)
on conflict (label) do nothing;

-- ----------------------------------------------------------------------------
-- 5c. ADMIN_PROFILES — peran (master/admin) & status aktif tiap akun login.
-- user_id sama dengan id di auth.users (Supabase Auth). Baris di sini
-- otomatis dibuat saat akun login pertama kali (lihat db.py::login), atau
-- dibuat langsung oleh Master Admin lewat halaman "Akun" saat membuat
-- admin baru.
--
-- PENTING: jalankan query di bawah SEKALI secara manual untuk menunjuk
-- Master Admin pertama (ganti 'admin1@daskrimti.go.id' dengan email akun
-- yang Anda mau jadikan Master Admin - harus akun yang SUDAH ADA di
-- Authentication > Users):
--
--   insert into admin_profiles (user_id, email, role, aktif)
--   select id, email, 'master', true from auth.users where email = 'admin1@daskrimti.go.id'
--   on conflict (user_id) do update set role = 'master';
-- ----------------------------------------------------------------------------
create table if not exists admin_profiles (
    user_id     uuid primary key,
    email       text not null unique,
    nama        text not null default '',
    role        text not null default 'admin' check (role in ('master', 'admin')),
    aktif       boolean not null default true,
    dibuat_pada timestamptz not null default now()
);

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

-- ----------------------------------------------------------------------------
-- 7. BATCH_FILE_HASHES — jejak isi file (hash) yang sudah diproses di tiap
--    batch, dipakai untuk mendeteksi file yang diunggah dua kali persis sama
--    (walau nama filenya diganti). Karena tiap file diproses lewat request
--    terpisah (/api/proses/file), pelacakannya perlu disimpan di database,
--    bukan di memori seperti versi lokal sebelumnya.
-- ----------------------------------------------------------------------------
create table if not exists batch_file_hashes (
    id          uuid primary key default gen_random_uuid(),
    batch_id    uuid not null references batches(id) on delete cascade,
    file_hash   text not null,
    nama_file   text not null,
    created_at  timestamptz not null default now()
);
create index if not exists idx_filehash_batch on batch_file_hashes(batch_id, file_hash);

-- ----------------------------------------------------------------------------
-- 8. BATCH_PEGAWAI_SIGNATURE — jejak "sidik jari" data harian per pegawai
--    (gabungan NIP + seluruh tanggal/jam/keterangan) per batch, dipakai untuk
--    mendeteksi kasus file DIEKSPOR ULANG dari sistem sumber (isi data sama
--    persis, tapi byte file berbeda sehingga tidak tertangkap oleh
--    batch_file_hashes di atas).
-- ----------------------------------------------------------------------------
create table if not exists batch_pegawai_signature (
    id          uuid primary key default gen_random_uuid(),
    batch_id    uuid not null references batches(id) on delete cascade,
    nip         text not null,
    signature   text not null,
    nama_file   text not null,
    created_at  timestamptz not null default now()
);
create index if not exists idx_pegawaisig_batch on batch_pegawai_signature(batch_id, nip, signature);

-- ----------------------------------------------------------------------------
-- 9. PENGATURAN — pasangan kunci/nilai untuk konfigurasi umum aplikasi.
--    Baru dipakai untuk 1 hal saat ini: referensi "jumlah pegawai riil"
--    kantor (mis. 380), ditampilkan di kartu Total Pegawai pada halaman
--    Visualisasi. Ini SENGAJA dipisah dari angka "Total Data Pegawai
--    Terekap" yang dihitung otomatis - karena hitungan otomatis itu bisa
--    lebih besar dari jumlah pegawai sesungguhnya kalau mode "Seluruh
--    Batch (akumulasi)" dipilih (satu pegawai bisa punya baris di banyak
--    batch/bulan). Angka referensi ini murni diisi manual oleh admin,
--    bukan dihitung dari data attendance.
-- ----------------------------------------------------------------------------
create table if not exists pengaturan (
    kunci           text primary key,
    nilai           text,
    diperbarui_pada timestamptz not null default now()
);

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
alter table bidang_master enable row level security;
alter table admin_profiles enable row level security;
alter table record_edit_log enable row level security;
alter table batch_file_hashes enable row level security;
alter table batch_pegawai_signature enable row level security;
alter table pengaturan enable row level security;

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
create policy "authenticated_full_access" on bidang_master
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on admin_profiles
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on record_edit_log
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on batch_file_hashes
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on batch_pegawai_signature
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on pengaturan
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Catatan: backend Flask memakai SERVICE ROLE KEY (lihat README_INTEGRASI.md),
-- yang otomatis melewati RLS di atas. Kebijakan ini tetap berguna sebagai
-- lapisan pengaman kedua kalau suatu saat ada akses langsung dari client
-- memakai anon/public key.
