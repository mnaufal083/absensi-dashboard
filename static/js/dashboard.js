// =====================================================================
// dashboard.js — semua logic tab & panggilan API dashboard absensi
// =====================================================================
const content = document.getElementById("content");

// Ikon SVG monoline (bukan emoji) yang dipakai berulang di berbagai halaman.
const ICONS = {
  chart: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><rect x="4" y="10" width="3" height="7" rx="0.8" fill="currentColor"/><rect x="8.5" y="5.5" width="3" height="11.5" rx="0.8" fill="currentColor"/><rect x="13" y="8" width="3" height="9" rx="0.8" fill="currentColor"/></svg>`,
  filter: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><path d="M3 4h14l-5.5 6.5V16l-3 1.5v-7L3 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  users: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><circle cx="7.5" cy="7" r="2.6" stroke="currentColor" stroke-width="1.6"/><path d="M2.8 16c0-2.6 2.1-4.2 4.7-4.2s4.7 1.6 4.7 4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="14.5" cy="7.3" r="2" stroke="currentColor" stroke-width="1.4" opacity=".55"/><path d="M13 11.6c1.9.3 3.3 1.6 3.4 3.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".55"/></svg>`,
  clock: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M10 6.5V10l2.6 1.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pie: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M10 3v7l5.2 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  building: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><rect x="4" y="3" width="9" height="14" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="6.3" y="5.8" width="1.6" height="1.6" fill="currentColor"/><rect x="10.1" y="5.8" width="1.6" height="1.6" fill="currentColor"/><rect x="6.3" y="9.2" width="1.6" height="1.6" fill="currentColor"/><rect x="10.1" y="9.2" width="1.6" height="1.6" fill="currentColor"/><rect x="7.7" y="12.6" width="2.6" height="4.4" fill="currentColor"/></svg>`,
  alertTri: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><path d="M10 3.5l7.5 13H2.5l7.5-13z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><line x1="10" y1="8.5" x2="10" y2="11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="14" r="0.9" fill="currentColor"/></svg>`,
  x: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><line x1="5" y1="5" x2="15" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="15" y1="5" x2="5" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  check: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  search: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5" stroke="currentColor" stroke-width="1.7"/><line x1="12.3" y1="12.3" x2="17" y2="17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  download: `<svg class="ikon" viewBox="0 0 20 20" fill="none"><path d="M10 3v9.5M6.2 9.2L10 13l3.8-3.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15.5v.8a1.7 1.7 0 0 0 1.7 1.7h8.6a1.7 1.7 0 0 0 1.7-1.7v-.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
};

// Setiap kali isi #content diganti (apa pun fungsi render-nya), otomatis
// diberi animasi masuk yang halus — jadi transisi antar menu terasa hidup.
const observerTransisi = new MutationObserver(() => {
  content.classList.remove("animasi-masuk");
  void content.offsetWidth; // paksa reflow supaya animasi bisa diulang
  content.classList.add("animasi-masuk");
});
observerTransisi.observe(content, { childList: true });

// Tooltip generik untuk grafik (dipakai donut chart)
const tooltipChart = document.createElement("div");
tooltipChart.className = "tooltip-chart";
document.body.appendChild(tooltipChart);
function tampilkanTooltip(html, x, y) {
  tooltipChart.innerHTML = html;
  tooltipChart.style.left = `${x + 14}px`;
  tooltipChart.style.top = `${y + 14}px`;
  tooltipChart.classList.add("tampil");
}
function sembunyikanTooltip() {
  tooltipChart.classList.remove("tampil");
}
let daftarKeteranganCache = null;
let daftarBidangCache = null;
// Status buka/tutup panel "Daftar Keterangan" & "Daftar Bidang" di halaman
// Pengaturan (defaultnya tertutup/ringkas). Disimpan di variabel modul
// (bukan re-set tiap render) supaya statusnya tetap terjaga walau panel
// di-render ulang setelah tambah/hapus item.
let panelKeteranganTerbuka = false;
let panelBidangTerbuka = false;
let pendingChanges = {}; // key: `${record_table}:${record_id}:${field}` -> {record_table, record_id, field, nilai_baru}
let currentBatchId = null;
let filterVisualisasiSaatIni = { mode: "all", value: "", label: "Seluruh Batch (akumulasi total)" };
const currentUserId = document.body.dataset.userId || null;

// ---------------------------------------------------------------------
// ROUTING SIDEBAR
// ---------------------------------------------------------------------
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    gotoTab(btn.dataset.tab);
    tutupLaciMobile(); // di mobile, pilih menu otomatis menutup laci
  });
});

// PERBAIKAN (5 Agu 2026): dulu pindah tab (Beranda/Proses/Riwayat/dst) sama
// sekali tidak menambah apa pun ke riwayat navigasi browser - cuma
// mengganti isi #content lewat JS. Akibatnya tombol "Back" browser tidak
// pernah tahu ada "halaman" per-tab sama sekali, jadi begitu diklik dia
// lompat ke navigasi NYATA terakhir sebelum dashboard ini dimuat - yang
// mana adalah halaman Login. Sekarang tiap pindah tab mendaftarkan entri
// riwayat baru (history.pushState) dengan hash URL (mis. "#riwayat"),
// dan tombol Back/Forward browser didengarkan (popstate) untuk kembali ke
// tab yang benar alih-alih ke Login. Me-refresh halaman di tab tertentu
// atau membagikan link ke tab spesifik juga ikut jadi bisa dipakai sebagai
// bonus, karena hash URL-nya sekarang mencerminkan tab yang aktif.
function gotoTab(name, { catatRiwayat = true } = {}) {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  pendingChanges = {};
  currentBatchId = null;
  const loaders = {
    beranda: renderBeranda,
    proses: renderProses,
    riwayat: renderRiwayatList,
    cari: renderCariPegawai,
    visual: renderVisualisasi,
    log: renderLogAktivitas,
    akun: renderAkunList,
    pengaturan: renderPengaturan,
  };
  const namaValid = loaders[name] ? name : "beranda";

  if (catatRiwayat && location.hash !== `#${namaValid}`) {
    history.pushState({ tab: namaValid }, "", `#${namaValid}`);
  }

  content.innerHTML = '<p class="loading-text">Memuat...</p>';
  (loaders[namaValid] || renderBeranda)();
}

// Tombol Back/Forward browser -> pindah ke tab (atau batch spesifik)
// sesuai state riwayat, TANPA mendaftarkan entri riwayat baru lagi (kalau
// tidak, bisa jadi tumpukan ganda / balik-maju terasa "nyangkut").
window.addEventListener("popstate", (e) => {
  const state = e.state || { tab: "beranda" };
  if (state.tab === "riwayat" && state.batchId) {
    bukaDetailBatch(state.batchId, { catatRiwayat: false });
  } else {
    gotoTab(state.tab || "beranda", { catatRiwayat: false });
  }
});

// -----------------------------------------------------------------------
// SIDEBAR RESPONSIF — FITUR BARU (1 Agu 2026)
// 1) Desktop: tombol "Ciutkan menu" -> sidebar jadi ikon saja, preferensi
//    disimpan di localStorage (pola sama seperti pengaturan tema).
// 2) Mobile (<=880px, lihat media query di style.css): sidebar jadi laci
//    yang bisa dibuka lewat tombol hamburger DI TOPBAR atau lewat SWIPE
//    dari tepi kiri layar, dan ditutup lewat tombol yang sama, tap di
//    area gelap (backdrop), atau swipe ke kiri.
// -----------------------------------------------------------------------
const sidebarEl = document.getElementById("sidebar");
const backdropEl = document.getElementById("sidebarBackdrop");
const btnCollapse = document.getElementById("btnCollapseSidebar");
const btnHamburger = document.getElementById("btnHamburger");

// --- 1) Collapse (desktop) ---
if (localStorage.getItem("sidebarCiut") === "1") sidebarEl.classList.add("collapsed");
btnCollapse.addEventListener("click", () => {
  const ciut = sidebarEl.classList.toggle("collapsed");
  localStorage.setItem("sidebarCiut", ciut ? "1" : "0");
});

// --- 2) Buka/tutup laci (mobile) ---
function bukaLaciMobile() {
  sidebarEl.classList.add("mobile-terbuka");
  backdropEl.classList.add("tampil");
}
function tutupLaciMobile() {
  sidebarEl.classList.remove("mobile-terbuka");
  backdropEl.classList.remove("tampil");
}
function toggleLaciMobile() {
  sidebarEl.classList.contains("mobile-terbuka") ? tutupLaciMobile() : bukaLaciMobile();
}
btnHamburger.addEventListener("click", toggleLaciMobile);
backdropEl.addEventListener("click", tutupLaciMobile);

// --- 3) Swipe gesture (mobile) ---
// Swipe ke KANAN mulai dari dekat tepi kiri layar -> buka laci.
// Swipe ke KIRI di mana pun saat laci terbuka -> tutup laci.
// Hanya aktif kalau lebar layar masuk breakpoint mobile (biar tidak
// mengganggu gesture normal di desktop, mis. drag teks/seleksi).
(function pasangSwipeSidebar() {
  let xMulai = null, yMulai = null, waktuMulai = 0;
  const AMBANG_MOBILE = 880;
  const JARAK_MINIMAL = 55; // px, supaya tidak ke-trigger oleh tap/scroll biasa

  document.addEventListener(
    "touchstart",
    (e) => {
      if (window.innerWidth > AMBANG_MOBILE) return;
      const t = e.touches[0];
      xMulai = t.clientX;
      yMulai = t.clientY;
      waktuMulai = Date.now();
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (xMulai === null || window.innerWidth > AMBANG_MOBILE) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - xMulai;
      const dy = t.clientY - yMulai;
      const durasi = Date.now() - waktuMulai;
      xMulai = null;

      // Abaikan kalau geraknya lebih vertikal daripada horizontal (itu scroll biasa)
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (durasi > 600) return; // swipe harus cukup cepat, bukan drag pelan

      const laciTerbuka = sidebarEl.classList.contains("mobile-terbuka");
      if (!laciTerbuka && dx > JARAK_MINIMAL) {
        bukaLaciMobile();
      } else if (laciTerbuka && dx < -JARAK_MINIMAL) {
        tutupLaciMobile();
      }
    },
    { passive: true }
  );
})();

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    return null;
  }
  return res.json();
}

async function ambilDaftarKeterangan() {
  if (!daftarKeteranganCache) {
    daftarKeteranganCache = await api("/api/keterangan");
  }
  return daftarKeteranganCache;
}

async function ambilDaftarBidang() {
  if (!daftarBidangCache) {
    daftarBidangCache = await api("/api/bidang");
  }
  return daftarBidangCache;
}

// FITUR BARU (30 Jul 2026): ringkasan aktivitas per pegawai (Dinas Luar,
// Tidak Absen Datang/Pulang, Izin, Sakit, Alpha, dll) ditampilkan sebagai
// badge kecil langsung di header accordion Data Harian - supaya jelas
// KENAPA jumlah "hari kerja" seorang pegawai tidak selalu sama dengan
// (total hari kalender - hari Libur), tanpa perlu buka tab Ringkasan
// Pegawai dulu atau menebak-nebak dari baris tanggal satu-satu (yang
// kolom Keterangan hariannya kadang memang tidak diisi teks apa pun per
// tanggal untuk kategori seperti Dinas Luar - info itu cuma ada di baris
// statistik total pegawai, bukan di baris per tanggal).
const KATEGORI_AKTIVITAS_RINGKASAN = [
  { field: "dinas_luar", label: "Dinas Luar", warna: "#0891B2" },
  { field: "tidak_absen_datang", label: "Tidak Absen Datang", warna: "#D97706" },
  { field: "tidak_absen_pulang", label: "Tidak Absen Pulang", warna: "#D97706" },
  { field: "izin", label: "Izin", warna: "#6B7280" },
  { field: "sakit", label: "Sakit", warna: "#D97706" },
  { field: "alpha", label: "Alpha", warna: "#DC2626" },
  { field: "terlambat", label: "Terlambat", warna: "#2563EB" },
  { field: "pulang_cepat", label: "Pulang Cepat", warna: "#2563EB" },
  { field: "lepas_piket", label: "Lepas Piket", warna: "#6B7280" },
  { field: "tugas_belajar", label: "Tugas Belajar", warna: "#6B7280" },
  { field: "total_cuti", label: "Cuti", warna: "#7C3AED" },
];

function badgeAktivitasPegawai(ringkasanPegawai) {
  if (!ringkasanPegawai) return "";
  const badges = KATEGORI_AKTIVITAS_RINGKASAN.filter((k) => (ringkasanPegawai[k.field] || 0) > 0)
    .map(
      (k) =>
        `<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;background:${k.warna}1F;color:${k.warna};margin:2px 6px 2px 0">${k.label} · ${ringkasanPegawai[k.field]} hari</span>`
    )
    .join("");
  if (!badges) return "";
  return `<div style="padding:0 16px 10px 34px;display:flex;flex-wrap:wrap">${badges}</div>`;
}

function optionsKeterangan(list, terpilih) {
  // PERBAIKAN (30 Jul 2026): dulu kalau nilai keterangan baris ini KOSONG
  // atau tidak cocok dengan opsi mana pun di Daftar Keterangan (mis. hari
  // Dinas Luar yang di PDF sumber kolom Keterangan hariannya memang tidak
  // diisi teks apa pun per tanggal - informasi itu cuma ada di baris
  // statistik total), tidak ada <option> yang ditandai `selected`, dan
  // BROWSER otomatis menampilkan opsi PERTAMA dalam daftar apa adanya
  // (kebetulan "Hadir") - sehingga hari yang sebenarnya kosong/tidak jelas
  // terlihat SEOLAH tercatat "Hadir", padahal datanya tidak menyatakan itu.
  // Sekarang: kalau nilainya tidak cocok dengan opsi mana pun, tambahkan
  // opsi eksplisit untuk nilai asli itu (atau "(kosong)" kalau memang
  // benar-benar kosong) dan tandai itu yang `selected` - supaya keadaan
  // sebenarnya selalu terlihat jelas, tidak pernah diam-diam "jatuh" ke
  // kategori lain.
  const cocok = list.some((k) => k.label === terpilih);
  const opsiAsli = !cocok
    ? `<option value="${terpilih || ""}" selected>${terpilih ? terpilih : "(kosong - tidak tercatat di PDF)"}</option>`
    : "";
  return (
    opsiAsli +
    list.map((k) => `<option value="${k.label}" ${k.label === terpilih ? "selected" : ""}>${k.label}</option>`).join("")
  );
}

// ---------------------------------------------------------------------
// BERANDA
// ---------------------------------------------------------------------
async function renderBeranda() {
  const tahunSekarang = String(new Date().getFullYear());
  const [data, batches] = await Promise.all([
    api(`/api/ringkasan-beranda?filter_mode=tahun&filter_value=${tahunSekarang}`),
    api("/api/batches"),
  ]);
  const aktivitas = renderPotonganAktivitas(data.aktivitas_terbaru);

  // FITUR BARU (1 Agu 2026): dropdown periode dikelompokkan per tahun -
  // sama seperti di Visualisasi - supaya "Pegawai terekap" & kedua ranking
  // di bawah bisa dilihat per tahun tertentu, atau per batch/periode
  // (biasanya ~1 bulan) tertentu, bukan cuma terpaku ke tahun berjalan.
  const batchPerTahun = {};
  batches.forEach((b) => {
    const tahun = (b.periode_akhir || b.dibuat_pada || "").slice(0, 4) || "Tanpa periode";
    batchPerTahun[tahun] = batchPerTahun[tahun] || [];
    batchPerTahun[tahun].push(b);
  });
  const daftarTahun = Object.keys(batchPerTahun).sort((a, b) => b.localeCompare(a));
  const opsiPeriode = `
    <option value="all">Semua data (akumulasi total)</option>
    ${daftarTahun
      .map(
        (tahun) => `
      <optgroup label="${tahun}">
        ${tahun !== "Tanpa periode" ? `<option value="tahun:${tahun}" ${tahun === tahunSekarang ? "selected" : ""}>— Tahun ${tahun} (akumulasi) —</option>` : ""}
        ${batchPerTahun[tahun].map((b) => `<option value="${b.id}">${b.label} · ${b.nama_bidang || "campuran"}</option>`).join("")}
      </optgroup>`
      )
      .join("")}
  `;

  content.innerHTML = `
    <p style="font-size:17px;font-weight:700;margin:0 0 4px" class="judul-serif">Selamat datang</p>
    <p style="font-size:12.5px;color:var(--teks-sekunder);margin:0 0 18px">Ringkasan aktivitas rekapitulasi absensi</p>

    <div class="grid-3" style="margin-bottom:18px">
      <div class="kartu"><p class="stat-label">Total batch</p><p class="stat-angka">${data.total_batch}</p><p style="font-size:10.5px;color:var(--teks-muted);margin:2px 0 0">seluruh waktu</p></div>
      <div class="kartu"><p class="stat-label">Perlu ditinjau</p><p class="stat-angka" style="color:var(--merah-teks)">${data.perlu_ditinjau}</p><p style="font-size:10.5px;color:var(--teks-muted);margin:2px 0 0">seluruh waktu</p></div>
      <div class="kartu"><p class="stat-label">Pegawai terekap</p><p class="stat-angka" id="berandaTotalPegawai">${data.total_pegawai}</p><p style="font-size:10.5px;color:var(--teks-muted);margin:2px 0 0" id="berandaLabelPeriode">tahun ${tahunSekarang}</p></div>
    </div>

    <div class="kartu">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span class="icon-langkah">01</span>
        <p style="font-size:14px;font-weight:700;margin:0" class="judul-serif">Tentang Bidang Daskrimti</p>
      </div>
      <p style="font-size:13px;color:var(--teks-sekunder);line-height:1.7;margin:0">
        Bidang yang menangani data dan statistik kriminal serta dukungan teknologi informasi
        di lingkungan Kejaksaan Tinggi Jawa Tengah. Sistem ini menyederhanakan rekapitulasi
        kehadiran pegawai yang sebelumnya dikerjakan manual dari berkas PDF satu per satu.
      </p>
    </div>

    <div class="kartu">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span class="icon-langkah">02</span>
        <p style="font-size:14px;font-weight:700;margin:0" class="judul-serif">Aktivitas terbaru</p>
      </div>
      ${aktivitas}
    </div>

    <div class="kartu" style="margin-bottom:14px">
      <label style="font-size:11.5px;color:var(--teks-sekunder);font-weight:600;display:block;margin-bottom:5px">Periode untuk "Pegawai Terekap" &amp; rekapitulasi di bawah</label>
      <select id="berandaFilterPeriode" style="max-width:340px">${opsiPeriode}</select>
    </div>

    <div class="grid-2">
      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">Rekapitulasi Ketidakhadiran Tanpa Keterangan (Alpha)</p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0 0 10px" id="berandaLabelAlpha">Dijumlah dari tahun ${tahunSekarang}</p>
        <div class="scroll-list" id="rekapAlphaBeranda"></div>
      </div>
      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">Rekapitulasi Keterlambatan Masuk Kerja</p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0 0 10px" id="berandaLabelTerlambat">Dijumlah dari tahun ${tahunSekarang}</p>
        <div class="scroll-list" id="rekapTerlambatBeranda"></div>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-top:6px">
      <button class="btn-primer" onclick="gotoTab('proses')">Proses batch baru ↗</button>
      <button class="btn-sekunder" onclick="gotoTab('riwayat')">Lihat riwayat batch</button>
    </div>
  `;

  renderTabelRekap("rekapAlphaBeranda", data.ranking_alpha || []);
  renderTabelRekap("rekapTerlambatBeranda", data.ranking_terlambat || []);

  document.getElementById("berandaFilterPeriode").addEventListener("change", async (e) => {
    const nilai = e.target.value;
    const labelTerpilih = e.target.selectedOptions[0].textContent;
    let mode = "all";
    let value = "";
    if (nilai.startsWith("tahun:")) {
      mode = "tahun";
      value = nilai.replace("tahun:", "");
    } else if (nilai !== "all") {
      mode = "batch";
      value = nilai;
    }
    const label = nilai === "all" ? "seluruh data" : labelTerpilih;

    const ulang = await api(`/api/ringkasan-beranda?filter_mode=${mode}&filter_value=${encodeURIComponent(value)}`);
    document.getElementById("berandaTotalPegawai").textContent = ulang.total_pegawai;
    document.getElementById("berandaLabelPeriode").textContent = label;
    document.getElementById("berandaLabelAlpha").textContent = `Dijumlah dari ${label}`;
    document.getElementById("berandaLabelTerlambat").textContent = `Dijumlah dari ${label}`;
    renderTabelRekap("rekapAlphaBeranda", ulang.ranking_alpha || []);
    renderTabelRekap("rekapTerlambatBeranda", ulang.ranking_terlambat || []);
  });
}

function renderPotonganAktivitas(daftar) {
  return (daftar || [])
    .map(
      (a) => `<div class="tabel-baris" style="grid-template-columns:2fr 1fr">
        <span>${a.diubah_oleh || "admin"} mengubah <b>${a.field_diubah}</b> pada ${a.nama_pegawai}</span>
        <span style="color:var(--teks-muted);text-align:right">${formatWaktu(a.diubah_pada)}</span>
      </div>`
    )
    .join("") || `<p class="loading-text" style="padding:14px">Belum ada aktivitas.</p>`;
}

function formatWaktu(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatTanggalTampil(iso) {
  // Tersimpan di database sebagai ISO "yyyy-mm-dd" (supaya urut benar),
  // ditampilkan ke pengguna sebagai "dd/mm/yyyy" (format Indonesia).
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------
// PROSES BATCH BARU
// ---------------------------------------------------------------------
async function renderProses() {
  const daftarBidang = await ambilDaftarBidang();
  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span class="icon-langkah">01</span>
      <p style="font-size:16px;font-weight:700;margin:0" class="judul-serif">Unggah &amp; Proses</p>
    </div>
    <div id="panelUnggah">
      <div class="dropzone" id="dropzone">
        <p style="font-size:13px;font-weight:600;margin:0 0 12px">Tarik &amp; letakkan file PDF di sini, atau pilih manual</p>
        <input type="file" id="inputFile" accept=".pdf" multiple style="display:none" />
        <input type="file" id="inputFolder" webkitdirectory directory multiple style="display:none" />
        <button type="button" class="btn-sekunder" onclick="document.getElementById('inputFile').click()">Pilih File PDF</button>
        <button type="button" class="btn-sekunder" onclick="document.getElementById('inputFolder').click()">Pilih Folder</button>
      </div>
      <div id="daftarFileTerpilih" style="margin-bottom:16px"></div>
      <label style="font-size:12.5px;color:var(--teks-sekunder);display:block;margin-bottom:5px;font-weight:600">Bidang untuk batch ini</label>
      <select id="inputBidang" style="width:100%;margin-bottom:16px">
        <option value="">— Campuran / belum ditentukan —</option>
        ${daftarBidang.map((b) => `<option value="${b.label}">${b.label}</option>`).join("")}
      </select>
      <button class="btn-primer" id="btnProses" style="width:100%">Proses Semua File</button>
    </div>

    <div id="progresProses" style="display:none">
      <div class="panel-proses panel-proses-takeover">
        <div class="partikel-proses">
          ${Array.from({ length: 6 })
            .map((_, i) => {
              const kiri = 8 + i * 15 + (i % 2) * 5;
              const durasi = 6 + (i % 4) * 1.6;
              const tunda = i * 0.9;
              const ukuran = 4 + (i % 3) * 3;
              return `<span style="left:${kiri}%;width:${ukuran}px;height:${ukuran}px;animation-duration:${durasi}s;animation-delay:${tunda}s"></span>`;
            })
            .join("")}
        </div>
        <div class="proses-cincin-wrap proses-cincin-wrap-besar">
          <div class="cincin-dekoratif"></div>
          <svg viewBox="0 0 100 100" class="proses-cincin">
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" stroke-width="6" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="url(#gradProses)" stroke-width="6"
              stroke-linecap="round" id="progresRingFill" stroke-dasharray="276.5" stroke-dashoffset="276.5"
              transform="rotate(-90 50 50)" />
            <defs>
              <linearGradient id="gradProses" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#2563EB" />
                <stop offset="100%" stop-color="#8B5CF6" />
              </linearGradient>
            </defs>
          </svg>
          <div class="proses-cincin-isi">
            <span id="progresPersen" class="proses-persen proses-persen-besar">0%</span>
            <span class="proses-ikon-scan">${ICONS.search}</span>
          </div>
        </div>

        <p id="progresLabel" class="proses-label proses-label-besar">Memulai batch...</p>

        <div class="proses-stat-grid proses-stat-grid-besar">
          <div class="proses-stat"><span id="statDiproses">0/0</span><small>Diproses</small></div>
          <div class="proses-stat proses-stat-sukses"><span id="statBerhasil">0</span><small>Berhasil</small></div>
          <div class="proses-stat proses-stat-masalah"><span id="statBermasalah">0</span><small>Bermasalah</small></div>
          <div class="proses-stat"><span id="statSisaWaktu">-</span><small>Sisa waktu</small></div>
        </div>

        <div class="proses-ticker proses-ticker-besar" id="progresTicker"></div>
      </div>
    </div>

    <div id="hasilProses" style="margin-top:22px;display:none">
      <div style="display:flex;align-items:center;gap:10px;margin:0 0 10px">
        <span class="icon-langkah">02</span>
        <p style="font-size:15px;font-weight:700;margin:0" class="judul-serif">Pratinjau Data Hasil Ekstraksi</p>
      </div>
      <div class="tabel-wrap" style="margin-bottom:8px">
        <div class="tabel-header-baris" style="grid-template-columns:1.3fr 1fr 0.8fr 1fr 1fr">
          <span>NAMA</span><span>NIP</span><span>TGL</span><span>JAM MASUK</span><span>KETERANGAN</span>
        </div>
        <div id="previewRows"></div>
      </div>
      <p style="font-size:11px;color:var(--teks-muted);margin:0 0 18px">Menampilkan 10 baris pertama. Data lengkap ada di menu Riwayat Batch.</p>

      <div style="display:flex;align-items:center;gap:10px;margin:0 0 10px">
        <span class="icon-langkah">03</span>
        <p style="font-size:15px;font-weight:700;margin:0" class="judul-serif">Log Berkas Bermasalah</p>
      </div>
      <div id="logBermasalah" class="kartu"></div>

      <button class="btn-sekunder" id="btnBukaBatch" style="margin-top:14px">Buka batch ini di Riwayat →</button>
    </div>
  `;

  let filesTerpilih = [];
  const daftarDiv = document.getElementById("daftarFileTerpilih");

  function renderDaftarFile() {
    if (!filesTerpilih.length) {
      daftarDiv.innerHTML = "";
      return;
    }
    daftarDiv.innerHTML = `
      <div class="daftar-file-scroll">
        ${filesTerpilih
          .map(
            (f, i) => `<div class="tabel-baris" style="grid-template-columns:1fr 32px;padding:8px 14px" data-file-row="${i}">
            <span style="font-size:12.5px;color:var(--teks-sekunder);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
            <button type="button" onclick="hapusFileTerpilih(${i})" title="Batalkan file ini"
              style="background:transparent;border:none;color:var(--merah-teks);font-weight:700;font-size:15px;padding:0;width:24px">×</button>
          </div>`
          )
          .join("")}
      </div>
      <p style="font-size:12px;color:var(--teks-muted);margin:8px 0 0">${filesTerpilih.length} file PDF siap diproses</p>
    `;
  }

  function tambahFile(list) {
    const baru = Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    baru.forEach((f) => {
      const sudahAda = filesTerpilih.some((x) => x.name === f.name && x.size === f.size);
      if (!sudahAda) filesTerpilih.push(f);
    });
    renderDaftarFile();
  }

  window.hapusFileTerpilih = (index) => {
    filesTerpilih.splice(index, 1);
    renderDaftarFile();
  };

  document.getElementById("inputFile").addEventListener("change", (e) => { tambahFile(e.target.files); e.target.value = ""; });
  document.getElementById("inputFolder").addEventListener("change", (e) => { tambahFile(e.target.files); e.target.value = ""; });

  const dropzone = document.getElementById("dropzone");
  let dragCounter = 0; // dragenter/dragleave bisa nested ke elemen anak, dihitung supaya highlight tidak kedip
  dropzone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    dropzone.classList.add("drag-aktif");
  });
  dropzone.addEventListener("dragover", (e) => e.preventDefault());
  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropzone.classList.remove("drag-aktif");
    }
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropzone.classList.remove("drag-aktif");
    tambahFile(e.dataTransfer.files);
  });

  document.getElementById("btnProses").addEventListener("click", prosesSemuaFile);

  async function prosesSemuaFile() {
    if (!filesTerpilih.length) {
      alert("Pilih minimal satu file PDF terlebih dahulu.");
      return;
    }
    const btn = document.getElementById("btnProses");
    const panelUnggah = document.getElementById("panelUnggah");
    const progresWrap = document.getElementById("progresProses");
    const progresLabel = document.getElementById("progresLabel");
    const progresPersen = document.getElementById("progresPersen");
    const progresRingFill = document.getElementById("progresRingFill");
    const statDiproses = document.getElementById("statDiproses");
    const statBerhasil = document.getElementById("statBerhasil");
    const statBermasalah = document.getElementById("statBermasalah");
    const statSisaWaktu = document.getElementById("statSisaWaktu");
    const ticker = document.getElementById("progresTicker");
    const KELILING_CINCIN = 2 * Math.PI * 44; // r=44, harus sama dengan atribut SVG

    btn.disabled = true;

    // FITUR BARU (31 Jul 2026): dulu panel proses cuma DITAMBAHKAN di bawah
    // tombol - dropzone, daftar file, & tombolnya sendiri tetap kelihatan
    // di atas, jadi terasa seperti "menu tempel" bukan transisi sungguhan.
    // Sekarang panel unggah benar-benar bertransisi KELUAR (blur + mengecil
    // + memudar sekaligus) sebelum disembunyikan, baru panel proses masuk
    // mengambil alih seluruh perhatian (fade + scale-in).
    panelUnggah.classList.add("transisi-keluar");
    await new Promise((r) => setTimeout(r, 420));
    panelUnggah.style.display = "none";

    progresWrap.style.display = "block";
    progresWrap.classList.remove("transisi-keluar");
    progresWrap.classList.add("transisi-masuk");
    progresLabel.textContent = "Memulai batch...";
    progresPersen.textContent = "0%";
    progresRingFill.setAttribute("stroke-dasharray", `${KELILING_CINCIN}`);
    progresRingFill.setAttribute("stroke-dashoffset", `${KELILING_CINCIN}`);
    statDiproses.textContent = `0/${filesTerpilih.length}`;
    statBerhasil.textContent = "0";
    statBermasalah.textContent = "0";
    statSisaWaktu.textContent = "-";
    ticker.innerHTML = "";

    let jumlahBerhasil = 0;
    let jumlahBermasalah = 0;
    // PERBAIKAN (1 Agu 2026): dulu "Sisa Waktu" dihitung dari rata-rata
    // SEJAK AWAL BATCH (total waktu berjalan / jumlah file selesai) - kalau
    // file pertama kebetulan lambat (mis. koneksi belum "panas") atau
    // jaringan sempat melambat di tengah lalu pulih, rata-rata itu jadi
    // bias ke masa lalu dan tidak mencerminkan kecepatan SAAT INI. Sekarang
    // dipakai rolling window: rata-rata cuma dari beberapa file TERAKHIR
    // (bukan seluruhnya), jadi kalau kecepatan berubah di tengah jalan,
    // perkiraan sisa waktu langsung menyesuaikan mengikuti kondisi terkini.
    const JENDELA_RATA_RATA = 10;
    const durasiFileTerakhir = [];

    try {
      // 1) buat batch kosong dulu
      const initForm = new FormData();
      initForm.append("nama_bidang", document.getElementById("inputBidang").value.trim());
      const initRes = await fetch("/api/proses/mulai", { method: "POST", body: initForm });
      const initData = await ambilJsonAtauLempar(initRes);
      if (!initData.ok) throw new Error(initData.pesan || "Gagal memulai batch.");
      const batchId = initData.batch_id;

      // 2) proses file SATU PER SATU secara berurutan -> progres asli, bukan animasi palsu
      const total = filesTerpilih.length;
      for (let i = 0; i < total; i++) {
        const file = filesTerpilih[i];
        const waktuMulaiFileIni = Date.now();
        progresLabel.textContent = `Memindai: ${file.name}`;
        const baris = document.querySelector(`[data-file-row="${i}"]`);
        if (baris) baris.style.background = "#FBF3DC";

        const fileForm = new FormData();
        fileForm.append("batch_id", batchId);
        fileForm.append("file", file);
        fileForm.append("nama_bidang", document.getElementById("inputBidang").value.trim());
        const fileRes = await fetch("/api/proses/file", { method: "POST", body: fileForm });
        const fileData = await ambilJsonAtauLempar(fileRes);

        durasiFileTerakhir.push(Date.now() - waktuMulaiFileIni);
        if (durasiFileTerakhir.length > JENDELA_RATA_RATA) durasiFileTerakhir.shift();

        const bermasalah = !!fileData.bermasalah;
        if (baris) baris.style.background = bermasalah ? "#FBE6E1" : "#E4F0E6";
        if (bermasalah) {
          jumlahBermasalah++;
          perbaruiDenganPop(statBermasalah, jumlahBermasalah);
        } else {
          jumlahBerhasil++;
          perbaruiDenganPop(statBerhasil, jumlahBerhasil);
        }

        // --- Panel proses: cincin, statistik, dan ticker file selesai ---
        const persen = Math.round(((i + 1) / total) * 100);
        perbaruiDenganPop(progresPersen, `${persen}%`);
        progresRingFill.setAttribute("stroke-dashoffset", `${KELILING_CINCIN * (1 - persen / 100)}`);
        perbaruiDenganPop(statDiproses, `${i + 1}/${total}`);

        const rataRataPerFile = durasiFileTerakhir.reduce((a, b) => a + b, 0) / durasiFileTerakhir.length;
        const sisaFile = total - (i + 1);
        statSisaWaktu.textContent = sisaFile === 0 ? "Selesai" : formatDurasiSisa(rataRataPerFile * sisaFile);

        const chip = document.createElement("span");
        chip.className = `ticker-chip ${bermasalah ? "ticker-chip-masalah" : "ticker-chip-sukses"}`;
        chip.innerHTML = `${bermasalah ? ICONS.alertTri : ICONS.check} ${file.name}`;
        ticker.appendChild(chip);
        ticker.scrollLeft = ticker.scrollWidth;
        // Batasi jumlah chip yang disimpan di DOM (cuma buat performa,
        // tidak memengaruhi hasil proses) - riwayat lengkapnya tetap ada
        // di daftar file & pratinjau hasil setelah batch selesai.
        while (ticker.children.length > 40) ticker.removeChild(ticker.firstChild);
      }

      // 3) tutup batch: hitung ulang jumlah pegawai + ambil pratinjau & log
      progresLabel.textContent = "Menyelesaikan...";
      const selesaiRes = await fetch("/api/proses/selesai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const selesaiData = await ambilJsonAtauLempar(selesaiRes);

      progresLabel.textContent = "Selesai";
      selesaiData.batch_id = batchId;

      // Panel proses ikut bertransisi KELUAR (konsisten dengan transisi
      // masuk di awal) sebelum panel Pratinjau Hasil ditampilkan.
      await new Promise((r) => setTimeout(r, 500));
      progresWrap.classList.remove("transisi-masuk");
      progresWrap.classList.add("transisi-keluar");
      await new Promise((r) => setTimeout(r, 420));
      progresWrap.style.display = "none";

      btn.disabled = false;
      tampilkanHasilProses(selesaiData);
    } catch (err) {
      btn.disabled = false;
      panelUnggah.style.display = "block";
      panelUnggah.classList.remove("transisi-keluar");
      progresWrap.style.display = "none";
      alert(err.message || "Tidak bisa terhubung ke server. Pastikan 'python app.py' masih berjalan, lalu coba lagi.");
    }
  }
}

function formatDurasiSisa(ms) {
  const detik = Math.round(ms / 1000);
  if (detik < 60) return `~${detik} detik`;
  const menit = Math.floor(detik / 60);
  const sisaDetik = detik % 60;
  return `~${menit}m ${sisaDetik}d`;
}

// Set teks elemen + putar animasi "pop" singkat (scale up-down) memakai
// Web Animations API. PERBAIKAN (1 Agu 2026): dulu pakai trik "toggle
// class + void offsetWidth" untuk mengulang animasi CSS tiap kali
// dipanggil - itu MEMAKSA REFLOW SINKRON di setiap panggilan (dipanggil
// ~3x per file: persentase, diproses, berhasil/bermasalah), jadi untuk
// batch besar (puluhan-ratusan file) reflow itu menumpuk jadi beban nyata
// dan bikin proses terasa lebih berat/lambat dari seharusnya. element.
// animate() tidak butuh reflow paksa sama sekali - hasil visualnya identik,
// jauh lebih ringan.
const HORMATI_REDUCE_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function perbaruiDenganPop(el, teksBaru) {
  el.textContent = teksBaru;
  if (HORMATI_REDUCE_MOTION) return;
  const target = el.classList.contains("proses-persen") ? el : el.parentElement;
  target.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }],
    { duration: 340, easing: "cubic-bezier(.34,1.56,.64,1)" }
  );
}

async function ambilJsonAtauLempar(res) {
  try {
    return await res.json();
  } catch (parseErr) {
    throw new Error(`Server membalas status ${res.status} (bukan JSON). Cek terminal tempat "python app.py" berjalan untuk detail errornya.`);
  }
}

function tampilkanHasilProses(data) {
  const hasilProses = document.getElementById("hasilProses");
  hasilProses.style.display = "block";
  hasilProses.classList.remove("transisi-masuk");
  void hasilProses.offsetWidth; // paksa reflow supaya animasi bisa diulang tiap kali dipanggil
  hasilProses.classList.add("transisi-masuk");
  const previewRows = document.getElementById("previewRows");
  previewRows.innerHTML =
    (data.pratinjau || [])
      .map(
        (r) => `<div class="tabel-baris" style="grid-template-columns:1.3fr 1fr 0.8fr 1fr 1fr">
          <span>${r.nama}</span><span>${r.nip}</span><span>${formatTanggalTampil(r.tanggal)}</span>
          <span>${r.jam_masuk || "-"}</span><span>${r.keterangan || "-"}</span>
        </div>`
      )
      .join("") || `<div style="padding:16px;font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ada baris data.</div>`;

  const logDiv = document.getElementById("logBermasalah");
  if (data.log_bermasalah && data.log_bermasalah.length) {
    logDiv.innerHTML = data.log_bermasalah
      .map((e) => `<p style="font-size:12.5px;color:var(--merah-teks);margin:0 0 8px"><b>${e.nama_file}</b> — ${e.alasan}</p>`)
      .join("");
  } else {
    logDiv.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic;margin:0">Tidak ada catatan kesalahan.</p>`;
  }

  document.getElementById("btnBukaBatch").onclick = () => {
    gotoTab("riwayat");
    setTimeout(() => bukaDetailBatch(data.batch_id), 200);
  };
}

// ---------------------------------------------------------------------
// RIWAYAT BATCH — daftar
// ---------------------------------------------------------------------
async function renderRiwayatList() {
  const batches = await api("/api/batches");
  content.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 14px" class="judul-serif">Riwayat Batch</p>
    <div id="daftarBatchGrup"></div>
  `;
  const wrap = document.getElementById("daftarBatchGrup");
  if (!batches.length) {
    wrap.innerHTML = `<div class="kartu" style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Belum ada batch yang diproses.</div>`;
    return;
  }

  // Kelompokkan per bulan berdasarkan periode_akhir (atau tanggal dibuat kalau
  // periode belum tersedia, mis. batch lama sebelum fitur ini ada).
  const grupBulan = new Map(); // "2026-05" -> { label: "Mei 2026", batches: [] }
  batches.forEach((b) => {
    const acuan = b.periode_akhir || b.dibuat_pada;
    const d = new Date(acuan);
    const kunci = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    if (!grupBulan.has(kunci)) grupBulan.set(kunci, { label, batches: [] });
    grupBulan.get(kunci).batches.push(b);
  });
  const kunciTerurut = Array.from(grupBulan.keys()).sort().reverse(); // bulan terbaru di atas

  wrap.innerHTML = kunciTerurut
    .map((kunci) => {
      const grup = grupBulan.get(kunci);
      return `
      <p style="font-size:11.5px;font-weight:700;letter-spacing:.3px;color:var(--teks-muted);margin:16px 0 6px;text-transform:uppercase">${grup.label}</p>
      <div class="tabel-wrap" style="margin-bottom:4px">
        <div class="tabel-header-baris" style="grid-template-columns:1.6fr 1fr 1.3fr 1fr 0.5fr 0.4fr">
          <span>BATCH</span><span>BIDANG</span><span>PERIODE ABSENSI</span><span>STATUS</span><span></span><span></span>
        </div>
        ${grup.batches
          .map(
            (b) => `<div class="tabel-baris" style="grid-template-columns:1.6fr 1fr 1.3fr 1fr 0.5fr 0.4fr" onclick="bukaDetailBatch('${b.id}')">
            <span>${b.label} · ${b.jumlah_pegawai} pegawai</span>
            <span>${b.nama_bidang || "-"}</span>
            <span style="color:var(--teks-sekunder)">${formatPeriode(b.periode_awal, b.periode_akhir)}</span>
            <span class="badge ${b.status === "final" ? "badge-final" : "badge-draf"}">${b.status === "final" ? "Final" : "Draf"}</span>
            <span style="color:var(--kuning-status-teks);font-weight:600">Buka →</span>
            <button type="button" class="btn-hapus-baris" title="Hapus batch ini" onclick="event.stopPropagation(); hapusBatch('${b.id}')">${ICONS.x}</button>
          </div>`
          )
          .join("")}
      </div>`;
    })
    .join("");
}

function formatPeriode(awalIso, akhirIso) {
  if (!awalIso || !akhirIso) return "Belum diketahui";
  const opsi = { day: "2-digit", month: "short", year: "numeric" };
  const awal = new Date(awalIso);
  const akhir = new Date(akhirIso);
  if (awalIso === akhirIso) return awal.toLocaleDateString("id-ID", opsi);
  const beda = awal.getFullYear() !== akhir.getFullYear();
  const opsiAwal = beda ? opsi : { day: "2-digit", month: "short" };
  return `${awal.toLocaleDateString("id-ID", opsiAwal)} – ${akhir.toLocaleDateString("id-ID", opsi)}`;
}

// ---------------------------------------------------------------------
// RIWAYAT BATCH — detail (data harian / ringkasan / log berkas)
// ---------------------------------------------------------------------
// PERBAIKAN (11 Agu 2026): dulu HANYA gotoTab() yang mendaftarkan entri
// riwayat browser (history.pushState) - membuka detail satu batch dari
// daftar Riwayat Batch TIDAK menambah entri apa pun. Akibatnya begitu
// pengguna klik "Back" dari tampilan Data Harian sebuah batch, browser
// melompati "Riwayat Batch" sama sekali dan mendarat di entri riwayat
// SEBELUM itu (mis. "Proses batch baru", tab terakhir yang sungguhan
// mendaftarkan entri). Sekarang bukaDetailBatch() ikut mendaftarkan
// entrinya sendiri (hash "#riwayat/<id-batch>"), jadi urutan riwayat
// browser jadi: ... -> #riwayat -> #riwayat/<id-batch>, dan tombol Back
// benar-benar kembali ke daftar Riwayat Batch dulu, baru ke tab sebelumnya
// kalau di-klik Back sekali lagi.
async function bukaDetailBatch(batchId, { catatRiwayat = true } = {}) {
  currentBatchId = batchId;
  pendingChanges = {};

  const hashBatch = `#riwayat/${batchId}`;
  if (catatRiwayat && location.hash !== hashBatch) {
    // Kalau belum ada entri "#riwayat" (mis. batch baru selesai diproses
    // lalu langsung dibuka otomatis dari tab Proses), sisipkan dulu supaya
    // Back tetap berhenti di daftar Riwayat Batch, bukan balik ke tab Proses.
    if (location.hash !== "#riwayat") {
      history.pushState({ tab: "riwayat" }, "", "#riwayat");
    }
    history.pushState({ tab: "riwayat", batchId }, "", hashBatch);
  }

  content.innerHTML = '<p class="loading-text">Memuat batch...</p>';
  const [detail, keterangan, bidang] = await Promise.all([
    api(`/api/batches/${batchId}`),
    ambilDaftarKeterangan(),
    ambilDaftarBidang(),
  ]);
  renderDetailBatch(detail, keterangan, bidang);
}

function renderDetailBatch(detail, keterangan, daftarBidang) {
  const b = detail.batch;
  const isFinal = b.status === "final";

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <p style="font-size:16px;font-weight:700;margin:0" class="judul-serif">${b.label}</p>
        <p style="font-size:12px;color:var(--teks-sekunder);margin:3px 0 0">${b.jumlah_pegawai} pegawai · ${b.nama_bidang || "campuran"} · periode ${formatPeriode(b.periode_awal, b.periode_akhir)} · ${detail.berkas_bermasalah.length} berkas bermasalah</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-sekunder" onclick="gotoTab('riwayat')">← Semua batch</button>
        <button class="btn-sekunder" id="btnTandaiFinal"
          onclick="ubahStatusBatch('${b.id}', '${isFinal ? "draft" : "final"}')">
          ${isFinal ? "Tandai Draf lagi" : "Tandai Final (siap unduh)"}
        </button>
        <button class="${isFinal ? "btn-primer" : "btn-belum-siap"}" onclick="unduhBatch('${b.id}', '${b.status}')"
          title="${isFinal ? "Unduh Excel" : "Batch masih Draf - klik untuk tandai Final dulu, baru bisa diunduh"}">
          ⬇ Unduh Excel
        </button>
        <button class="btn-sekunder" onclick="hapusBatch('${b.id}')" style="color:var(--merah-teks);border-color:#E8B8A8">Hapus batch</button>
      </div>
    </div>

    ${isFinal ? `<div class="banner-warning" style="margin-bottom:12px">${ICONS.alertTri} Batch ini sudah <b>Final</b> - data tidak bisa diedit. Klik "Tandai Draf lagi" di atas dulu kalau perlu dikoreksi.</div>` : ""}

    <div class="subtab-row" style="justify-content:space-between;align-items:center">
      <div style="display:flex">
        <button class="subtab active" data-sub="harian">Data Harian</button>
        <button class="subtab" data-sub="ringkasan">Ringkasan Pegawai</button>
        <button class="subtab" data-sub="log">Log Berkas Bermasalah <span class="badge badge-draf">${detail.berkas_bermasalah.length}</span></button>
      </div>
      <input type="text" id="cariPegawaiBatch" placeholder="Cari nama atau NIP di batch ini..." style="width:260px;margin-bottom:6px" />
    </div>

    <div id="unsavedBar" class="banner-warning" style="display:none">
      <span><span id="jumlahBerubah">0</span> perubahan belum disimpan</span>
      <button class="btn-primer" onclick="simpanPerubahan()">Simpan perubahan</button>
    </div>
    <div id="savedBar" class="banner-success" style="display:none">${ICONS.check} Perubahan tersimpan</div>

    <div id="sub-harian"></div>
    <div id="sub-ringkasan" style="display:none"></div>
    <div id="sub-log" style="display:none"></div>
  `;

  // PERBAIKAN (30 Jul 2026): dulu label jumlah hari di accordion Data Harian
  // (renderTabelHarian) menghitung SEMUA baris attendance_records per
  // pegawai (termasuk hari Libur), jadi menampilkan jumlah HARI KALENDER
  // dalam periode batch (mis. "28 hari") - bukan jumlah HARI KERJA
  // sesungguhnya, sehingga tidak sinkron dengan angka "Total Hari Kerja"
  // di tab Ringkasan Pegawai maupun di Excel yang diunduh (mis. "18 hari").
  // Sekarang label itu memakai ringkasan_pegawai.total_hari_kerja (field
  // yang sama dipakai Excel), dicocokkan lewat NIP.
  const ringkasanByNip = new Map();
  (detail.ringkasan || []).forEach((r) => {
    if (r.nip) ringkasanByNip.set(r.nip, r);
  });

  renderTabelHarian(detail.attendance, keterangan, isFinal, ringkasanByNip);
  renderTabelRingkasan(detail.ringkasan, isFinal, daftarBidang);
  renderLogBerkasBatch(detail.berkas_bermasalah);

  document.querySelectorAll(".subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".subtab").forEach((b2) => b2.classList.toggle("active", b2 === btn));
      ["harian", "ringkasan", "log"].forEach((s) => {
        document.getElementById(`sub-${s}`).style.display = s === btn.dataset.sub ? "block" : "none";
      });
    });
  });

  document.getElementById("cariPegawaiBatch").addEventListener("input", (e) => {
    const kata = e.target.value.trim().toLowerCase();
    document.querySelectorAll("[data-grup-pegawai]").forEach((grup) => {
      const cocok = grup.dataset.grupPegawai.includes(kata);
      grup.style.display = cocok ? "" : "none";
    });
  });
}

function renderTabelHarian(rows, keterangan, isFinal, ringkasanByNip) {
  const wrap = document.getElementById("sub-harian");
  if (!rows.length) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ada data harian.</p>`;
    return;
  }

  // Kelompokkan baris harian per pegawai (by NIP), supaya tidak perlu scroll
  // ratusan baris sekaligus — dibuka satu per satu lewat accordion.
  const grup = new Map();
  rows.forEach((r) => {
    const kunci = r.nip || r.nama;
    if (!grup.has(kunci)) grup.set(kunci, { nama: r.nama, nip: r.nip, baris: [] });
    grup.get(kunci).baris.push(r);
  });
  const daftarGrup = Array.from(grup.values());

  // PERBAIKAN PERFORMA (25 Jul 2026): sebelumnya SELURUH baris harian semua
  // pegawai dibangun jadi elemen DOM sekaligus di awal (cuma disembunyikan
  // lewat CSS) - untuk batch besar ini bisa ribuan input/dropdown dibuat
  // padahal belum tentu dilihat user. Sekarang isi tiap pegawai baru
  // dibangun saat accordion-nya PERTAMA KALI diklik (lazy render), lalu
  // di-cache (tidak dibangun ulang kalau ditutup-buka lagi) - jauh lebih
  // ringan terutama untuk batch ratusan pegawai.
  const html = daftarGrup
    .map((g, gi) => {
      const jumlahEdit = g.baris.filter((r) => r.is_edited).length;
      const kataKunci = `${g.nama} ${g.nip}`.toLowerCase();
      // total_hari_kerja dari ringkasan_pegawai (excl. Libur) kalau ada -
      // konsisten dengan Excel; fallback ke hitungan baris mentah (termasuk
      // Libur) hanya kalau NIP tidak ketemu di ringkasan (mis. NIP "-").
      const ringkasanPegawai = ringkasanByNip && g.nip ? ringkasanByNip.get(g.nip) : null;
      const labelHari = ringkasanPegawai && typeof ringkasanPegawai.total_hari_kerja === "number"
        ? `${ringkasanPegawai.total_hari_kerja} hari kerja`
        : `${g.baris.length} hari tercatat`;
      return `
      <div data-grup-pegawai="${kataKunci}" style="border:0.5px solid var(--border);border-radius:10px;margin-bottom:8px;overflow:hidden;background:var(--kartu-bg)">
        <button type="button" class="grup-toggle" data-grup-index="${gi}"
          style="width:100%;display:flex;justify-content:space-between;align-items:center;background:var(--kartu-bg);border:none;padding:12px 16px;text-align:left;cursor:pointer">
          <span style="font-size:13px;font-weight:600;color:var(--teks-utama)">
            <span class="grup-panah" style="display:inline-block;transition:transform .15s;margin-right:8px">▸</span>
            ${g.nama} <span style="font-weight:400;color:var(--teks-sekunder)">· NIP ${g.nip || "-"}</span>
          </span>
          <span style="font-size:12px;color:var(--teks-muted)">${labelHari}${jumlahEdit ? ` · ${jumlahEdit} diedit` : ""}</span>
        </button>
        ${badgeAktivitasPegawai(ringkasanPegawai)}
        <div class="grup-isi" id="grup-isi-${gi}" style="border-top:0.5px solid var(--border)"></div>
      </div>`;
    })
    .join("");

  wrap.innerHTML = `
    <p style="font-size:11.5px;color:var(--teks-muted);margin:0 0 12px">${grup.size} pegawai · klik nama untuk membuka rincian harian · baris hijau menandai data yang sudah pernah dikoreksi</p>
    ${html}
  `;

  wrap.querySelectorAll(".grup-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gi = btn.dataset.grupIndex;
      const isi = document.getElementById(`grup-isi-${gi}`);
      const panah = btn.querySelector(".grup-panah");
      const terbuka = isi.classList.toggle("terbuka");
      panah.style.transform = terbuka ? "rotate(90deg)" : "rotate(0deg)";

      if (terbuka && !isi.dataset.dimuat) {
        const g = daftarGrup[gi];
        const dis = isFinal ? "disabled" : "";
        const GRID_HARIAN = "1fr 1fr 1fr 1fr 1fr";
        isi.innerHTML = `
          <div class="tabel-header-baris" style="grid-template-columns:${GRID_HARIAN}">
            <span>TANGGAL</span><span>JAM MASUK</span><span>JAM KELUAR</span><span>KETERANGAN</span><span>TELAT</span>
          </div>
          ${g.baris
            .map((r) => {
              // FITUR BARU (30 Jul 2026): tanggal Libur ditampilkan merah,
              // meniru warna merah pada tanggal Libur di PDF sumber - supaya
              // langsung terlihat sekilas tanpa perlu baca kolom Keterangan.
              const isLibur = r.keterangan === "Libur";
              const warnaTanggal = isLibur ? "color:var(--merah-teks);font-weight:600" : "color:var(--teks-sekunder)";
              // TELAT bukan input teks bebas yang terpisah dari Jam Masuk
              // (dulu gampang tidak sinkron kalau Jam Masuk diedit tapi
              // Telat lupa disesuaikan manual). Sekarang murni tampilan
              // hasil hitung otomatis dari server (db.py::edit_field, rumus
              // sama dengan ekstraksi PDF pertama kali) - otomatis ikut
              // berubah & berwarna merah begitu Jam Masuk/Jadwal Masuk
              // diedit dan disimpan.
              const adaTelat = r.datang_telat && r.datang_telat !== "-";
              const gayaTelat = adaTelat ? "color:var(--merah-teks);font-weight:600" : "";
              return `<div class="tabel-baris ${r.is_edited ? "diedit" : ""}" style="grid-template-columns:${GRID_HARIAN}" data-record-id="${r.id}">
              <span style="${warnaTanggal}">${formatTanggalTampil(r.tanggal)}</span>
              <input class="edit-field" ${dis} data-tabel="attendance_records" data-record="${r.id}" data-field="jam_masuk" value="${r.jam_masuk || ""}" />
              <input class="edit-field" ${dis} data-tabel="attendance_records" data-record="${r.id}" data-field="jam_keluar" value="${r.jam_keluar || ""}" />
              <select class="edit-field" ${dis} data-tabel="attendance_records" data-record="${r.id}" data-field="keterangan">${optionsKeterangan(keterangan, r.keterangan)}</select>
              <span class="telat-tampil" style="${gayaTelat}" title="Dihitung otomatis dari Jam Masuk vs Jadwal Masuk">${r.datang_telat && r.datang_telat !== "" ? r.datang_telat : "-"}</span>
            </div>`;
            })
            .join("")}
        `;
        if (!isFinal) pasangListenerEdit(isi);
        isi.dataset.dimuat = "1"; // tanda sudah dibangun, tidak perlu diulang kalau ditutup-buka lagi
      }
    });
  });
}

function renderTabelRingkasan(rows, isFinal, daftarBidang) {
  const wrap = document.getElementById("sub-ringkasan");
  if (!rows.length) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ada ringkasan.</p>`;
    return;
  }
  const opsiBidang = ["", ...daftarBidang.map((b) => b.label)]
    .map((b) => `<option value="${b}">${b || "Belum diketahui"}</option>`)
    .join("");
  // Kolom angka (Terlambat/Sakit/Izin/Alpha) cuma butuh 1-2 digit, jadi
  // diberi lebar TETAP yang kecil (bukan proporsional/fr) supaya tidak
  // ikut melebar dan mendesak kolom Nama & Rincian Cuti yang justru butuh
  // ruang lebih untuk teks panjang.
  const GRID_RINGKASAN = "1.8fr 1fr 64px 64px 64px 64px 2fr";
  const dis = isFinal ? "disabled" : "";
  wrap.innerHTML = `
    <p style="font-size:11px;color:var(--teks-muted);margin:0 0 8px">Kolom <b>Bidang</b> perlu dikoreksi manual kalau batch ini gabungan lintas-Bidang (sistem tidak bisa menebaknya otomatis dari isi PDF). Kolom Telat/Sakit/Izin/Alpha/Rincian Cuti otomatis mengikuti data harian di tab Data Harian - tetap bisa dikoreksi manual di sini kalau diperlukan.</p>
    <div class="tabel-wrap" style="min-width:960px;margin-bottom:6px">
      <div class="tabel-header-baris" style="grid-template-columns:${GRID_RINGKASAN}">
        <span>NAMA</span><span>BIDANG</span><span>TELAT</span><span>SAKIT</span><span>IZIN</span><span>ALPHA</span><span>RINCIAN CUTI</span>
      </div>
      ${rows
        .map(
          (r) => `<div class="tabel-baris ${r.is_edited ? "diedit" : ""}" style="grid-template-columns:${GRID_RINGKASAN}" data-record-id="${r.id}" data-grup-pegawai="${(r.nama + " " + (r.nip || "")).toLowerCase()}">
          <span>${r.nama}</span>
          <select class="edit-field" ${dis} data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="bidang">${opsiBidang.replace(`value="${r.bidang || ""}"`, `value="${r.bidang || ""}" selected`)}</select>
          <input class="edit-field" ${dis} type="number" min="0" data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="terlambat" value="${r.terlambat || 0}" />
          <input class="edit-field" ${dis} type="number" min="0" data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="sakit" value="${r.sakit || 0}" />
          <input class="edit-field" ${dis} type="number" min="0" data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="izin" value="${r.izin || 0}" />
          <input class="edit-field" ${dis} type="number" min="0" data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="alpha" value="${r.alpha || 0}" />
          <input class="edit-field" ${dis} data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="rincian_cuti" value="${r.rincian_cuti || ""}" />
        </div>`
        )
        .join("")}
    </div>
  `;
  if (!isFinal) pasangListenerEdit(wrap);
}

function renderLogBerkasBatch(list) {
  const wrap = document.getElementById("sub-log");
  if (!list.length) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ada catatan kesalahan pada batch ini.</p>`;
    return;
  }
  wrap.innerHTML = `<div class="kartu" style="border-color:#E8C9A8">
    ${list.map((e) => `<p style="font-size:12.5px;color:var(--merah-teks);margin:0 0 8px"><b>${e.nama_file}</b> — ${e.alasan}</p>`).join("")}
  </div>
  <p style="font-size:11.5px;color:var(--teks-muted);margin:10px 0 0">Log ini tersimpan bersama batch dan tetap bisa dibuka lagi kapan pun.</p>`;
}

function pasangListenerEdit(container) {
  container.querySelectorAll(".edit-field").forEach((el) => {
    el.addEventListener("change", () => {
      const key = `${el.dataset.tabel}:${el.dataset.record}:${el.dataset.field}`;
      pendingChanges[key] = {
        record_table: el.dataset.tabel,
        record_id: el.dataset.record,
        field: el.dataset.field,
        nilai_baru: el.value,
      };
      const baris = el.closest("[data-record-id]");
      baris.classList.add("diedit");
      // kedipan singkat supaya perubahan terasa langsung direspons, bukan
      // cuma diam-diam tercatat di belakang layar
      baris.classList.remove("baru-diedit");
      void baris.offsetWidth; // paksa reflow supaya animasinya bisa diulang tiap kali
      baris.classList.add("baru-diedit");
      document.getElementById("savedBar").style.display = "none";
      const bar = document.getElementById("unsavedBar");
      bar.style.display = "flex";
      document.getElementById("jumlahBerubah").textContent = Object.keys(pendingChanges).length;
    });
  });
}

// Terapkan hasil terbaru satu baris (dikembalikan server dari
// db.py::edit_field) ke DOM tanpa perlu reload seluruh batch - mencakup
// kolom TELAT yang dihitung ulang otomatis dan kolom statistik
// ringkasan_pegawai yang ikut disinkronkan. Begitu tersimpan, baris
// otomatis dianggap sudah final (tidak perlu konfirmasi terpisah lagi).
function terapkanHasilEdit(h) {
  if (h.record_table === "attendance_records" && h.record) {
    const r = h.record;
    const baris = document.querySelector(`#sub-harian .tabel-baris[data-record-id="${r.id}"]`);
    if (baris) {
      baris.classList.toggle("diedit", !!r.is_edited);
      const telatEl = baris.querySelector(".telat-tampil");
      if (telatEl) {
        const adaTelat = r.datang_telat && r.datang_telat !== "-";
        telatEl.textContent = r.datang_telat && r.datang_telat !== "" ? r.datang_telat : "-";
        telatEl.style.color = adaTelat ? "var(--merah-teks)" : "";
        telatEl.style.fontWeight = adaTelat ? "600" : "400";
      }
    }
  }
  if (h.ringkasan_terkait) {
    const rr = h.ringkasan_terkait;
    const barisR = document.querySelector(`#sub-ringkasan .tabel-baris[data-record-id="${rr.id}"]`);
    if (barisR) {
      barisR.classList.add("diedit");
      ["terlambat", "sakit", "izin", "alpha"].forEach((f) => {
        const el = barisR.querySelector(`[data-field="${f}"]`);
        if (el && document.activeElement !== el) el.value = rr[f] ?? 0;
      });
      const rincianEl = barisR.querySelector('[data-field="rincian_cuti"]');
      if (rincianEl && document.activeElement !== rincianEl) rincianEl.value = rr.rincian_cuti || "";
    }
  }
}

async function simpanPerubahan() {
  const perubahan = Object.values(pendingChanges);
  if (!perubahan.length) return;
  const res = await api("/api/edit", {
    method: "POST",
    body: JSON.stringify({ batch_id: currentBatchId, perubahan }),
  });
  if (res && res.ok) {
    pendingChanges = {};
    document.getElementById("unsavedBar").style.display = "none";
    document.getElementById("savedBar").style.display = "flex";
    (res.hasil || []).forEach(terapkanHasilEdit);
  } else {
    alert((res && res.pesan) || "Gagal menyimpan perubahan.");
  }
}

async function ubahStatusBatch(batchId, statusBaru) {
  const endpoint = statusBaru === "final" ? "final" : "draf";
  const res = await api(`/api/batches/${batchId}/${endpoint}`, { method: "POST" });
  if (!res || !res.ok) {
    alert((res && res.pesan) || "Gagal mengubah status batch.");
    return;
  }
  bukaDetailBatch(batchId);
}

async function unduhBatch(batchId, statusSaatIni) {
  if (statusSaatIni !== "final") {
    const lanjut = confirm(
      'Batch ini masih berstatus Draf. Excel cuma bisa diunduh dari batch yang sudah Final (supaya rekap yang terunduh selalu data yang sudah "dikunci").\n\nTandai Final sekarang dan lanjut unduh?'
    );
    if (!lanjut) return;
    const res = await api(`/api/batches/${batchId}/final`, { method: "POST" });
    if (!res || !res.ok) {
      alert((res && res.pesan) || "Gagal menandai batch sebagai Final.");
      return;
    }
    if (currentBatchId === batchId) bukaDetailBatch(batchId); // refresh tampilan status & kunci field edit
  }
  window.location.href = `/api/batches/${batchId}/unduh`;
}

async function hapusBatch(batchId) {
  if (!confirm("Hapus batch ini beserta seluruh datanya? Tindakan ini tidak bisa dibatalkan.")) return;
  await api(`/api/batches/${batchId}`, { method: "DELETE" });
  gotoTab("riwayat");
}

// ---------------------------------------------------------------------
// CARI PEGAWAI
// ---------------------------------------------------------------------
function renderCariPegawai() {
  content.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 14px" class="judul-serif">Cari Pegawai</p>
    <input type="text" id="inputCari" placeholder="Cari nama atau NIP (minimal 2 huruf)..." style="width:100%;margin-bottom:16px" />
    <div id="hasilCari"></div>
  `;
  let timer;
  document.getElementById("inputCari").addEventListener("input", (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    timer = setTimeout(async () => {
      const wrap = document.getElementById("hasilCari");
      if (q.length < 2) {
        wrap.innerHTML = "";
        return;
      }
      const hasil = await api(`/api/cari-pegawai?q=${encodeURIComponent(q)}`);
      // Setiap hasil dibungkus jadi accordion sendiri (header + slot riwayat
      // tepat di bawahnya) - pola sama seperti akordeon pegawai di Data
      // Harian, supaya konsisten dan riwayatnya muncul PAS di bawah kartu
      // yang diklik, bukan menumpuk di bawah seluruh daftar.
      wrap.innerHTML = hasil.length
        ? hasil
            .map(
              (h) => `
          <div class="grup-cari" style="border:0.5px solid var(--border);border-radius:10px;margin-bottom:8px;overflow:hidden;background:var(--kartu-bg)">
            <button type="button" class="kartu-cari" data-nip="${h.nip}"
              style="width:100%;text-align:left;background:var(--kartu-bg);border:none;padding:14px 16px;cursor:pointer">
              <b style="font-size:13.5px;color:var(--teks-utama)">${h.nama}</b><br/>
              <span style="font-size:12px;color:var(--teks-sekunder)">NIP ${h.nip} · ${h.sub_unit_kerja || "-"}</span>
            </button>
            <div class="grup-isi" id="riwayat-${h.nip}" style="border-top:0.5px solid var(--border)"></div>
          </div>`
            )
            .join("")
        : `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ditemukan.</p>`;

      wrap.querySelectorAll(".kartu-cari").forEach((kartu) => {
        kartu.addEventListener("click", () => togglePegawai(kartu));
      });
    }, 350);
  });
}

async function togglePegawai(kartu) {
  const nip = kartu.dataset.nip;
  const isi = document.getElementById(`riwayat-${nip}`);
  const sedangTerbuka = isi.classList.contains("terbuka");

  // Accordion: tutup dulu kartu lain yang sedang terbuka, biar cuma satu
  // riwayat yang tampil sekaligus - lebih rapi & fokus.
  document.querySelectorAll(".kartu-cari.aktif").forEach((k) => {
    if (k !== kartu) {
      k.classList.remove("aktif");
      document.getElementById(`riwayat-${k.dataset.nip}`).classList.remove("terbuka");
    }
  });

  if (sedangTerbuka) {
    isi.classList.remove("terbuka");
    kartu.classList.remove("aktif");
    return;
  }

  kartu.classList.add("aktif");
  isi.classList.add("terbuka");

  if (!isi.dataset.dimuat) {
    isi.innerHTML = `<p style="font-size:12px;color:var(--teks-muted);padding:12px 16px">Memuat riwayat...</p>`;
    const riwayat = await api(`/api/riwayat-pegawai/${encodeURIComponent(nip)}`);
    isi.innerHTML = !riwayat.length
      ? `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic;padding:12px 16px">Belum ada riwayat batch untuk pegawai ini.</p>`
      : `
        <div style="padding:12px 16px 14px">
          <p style="font-size:12px;font-weight:700;margin:0 0 8px;color:var(--teks-sekunder);text-transform:uppercase;letter-spacing:.3px">Riwayat di ${riwayat.length} batch</p>
          <div class="tabel-wrap">
            <div class="tabel-header-baris" style="grid-template-columns:1.3fr 1fr 0.8fr 0.8fr 0.8fr">
              <span>PERIODE</span><span>BIDANG</span><span>TERLAMBAT</span><span>SAKIT</span><span>ALPHA</span>
            </div>
            ${riwayat
              .map(
                (r) => `<div class="tabel-baris" style="grid-template-columns:1.3fr 1fr 0.8fr 0.8fr 0.8fr">
              <span>${r.batches?.label || "-"}</span><span>${r.batches?.nama_bidang || "-"}</span>
              <span>${r.terlambat}</span><span>${r.sakit}</span><span>${r.alpha}</span>
            </div>`
              )
              .join("")}
          </div>
        </div>`;
    isi.dataset.dimuat = "1"; // di-cache, tidak diambil ulang kalau ditutup-buka lagi
  }
}

// ---------------------------------------------------------------------
// VISUALISASI (ringkas, dihitung dari daftar batch yang sudah dimuat)
// ---------------------------------------------------------------------
// FITUR BARU (30 Jul 2026): dulu kategori & urutan donut chart mengikuti
// APA SAJA yang kebetulan muncul di data (Object.entries hasil query),
// jadi urutan & warnanya bisa berubah-ubah antar batch, dan kategori yang
// kebetulan 0 kejadian tidak muncul sama sekali. Sekarang dipetakan tetap
// 1:1 ke daftar Keterangan master (yang sama dipakai dropdown di Data
// Harian) - selalu 10 baris dengan urutan & warna yang konsisten, termasuk
// yang 0 kejadian, supaya gampang dibandingkan antar batch. Opsi "-"
// (placeholder teknis) sengaja tidak ikut ditampilkan di sini.
const WARNA_KETERANGAN = {
  "WFO": "#2563EB",
  "Libur": "#94A3B8",
  "Izin": "#EAB308",
  "Dinas Luar": "#0D9488",
  "Alpha": "#DC2626",
  "Sakit": "#F97316",
  "Cuti": "#6D28D9",
  "Cuti Alasan Penting": "#8B5CF6",
  "Cuti Besar": "#A855F7",
  "Cuti Belajar": "#C084FC",
  "Lepas Piket": "#38BDF8",
};
const WARNA_LAINNYA = "#CBD5E1"; // fallback untuk label tak dikenal (mis. data lama)

async function renderVisualisasi() {
  const batches = await api("/api/batches");

  // FITUR BARU (1 Agu 2026): dulu cuma ada "Seluruh Batch (akumulasi)" -
  // yang berarti SEMUA batch sejak sistem dipakai pertama kali, tanpa
  // jenjang. Makin lama dipakai (lintas bulan bahkan tahun), angka itu
  // akan terus menumpuk dan makin kurang bermakna untuk dibandingkan
  // (mis. "akumulasi" tahun ini tercampur dengan tahun lalu). Sekarang
  // dropdown dikelompokkan PER TAHUN, dengan opsi "Tahun X (akumulasi)"
  // di awal tiap kelompok - jadi ada jenjang: 1 batch -> akumulasi 1 tahun
  // -> akumulasi seluruh sejarah (opsi paling atas, tetap ada untuk yang
  // memang butuh gambaran total keseluruhan).
  const batchPerTahun = {};
  batches.forEach((b) => {
    const tahun = (b.periode_akhir || b.dibuat_pada || "").slice(0, 4) || "Tanpa periode";
    batchPerTahun[tahun] = batchPerTahun[tahun] || [];
    batchPerTahun[tahun].push(b);
  });
  const daftarTahun = Object.keys(batchPerTahun).sort((a, b) => b.localeCompare(a));

  content.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 14px" class="judul-serif">${ICONS.chart} Visualisasi</p>

    <div class="kartu">
      <p class="stat-label" style="font-weight:600;margin-bottom:10px">${ICONS.filter} Filter Data</p>
      <div class="filter-bar">
        <div>
          <label>Pilih Batch / Periode</label>
          <select id="filterBatch">
            <option value="all">Seluruh Batch (akumulasi total)</option>
            ${daftarTahun
              .map(
                (tahun) => `
              <optgroup label="${tahun}">
                ${tahun !== "Tanpa periode" ? `<option value="tahun:${tahun}">— Tahun ${tahun} (akumulasi) —</option>` : ""}
                ${batchPerTahun[tahun].map((b) => `<option value="${b.id}">${b.label} · ${b.nama_bidang || "campuran"}</option>`).join("")}
              </optgroup>`
              )
              .join("")}
          </select>
        </div>
      </div>
      <div class="konteks-banner" id="konteksBanner"></div>
    </div>

    <div class="grid-2" style="margin-bottom:14px;align-items:stretch">
      <div class="kartu" style="display:flex;flex-direction:column">
        <p class="stat-label" style="font-weight:600;margin-bottom:12px">${ICONS.pie} Komposisi Keterangan <span id="labelDonut" style="font-weight:400;color:var(--teks-muted)"></span></p>
        <div style="display:flex;gap:28px;align-items:center;flex-wrap:wrap;flex:1">
          <div id="donutChart"></div>
          <div id="donutLegend" style="flex:1;min-width:220px;max-width:100%;overflow:hidden"></div>
        </div>
      </div>
      <div class="grid-2" style="grid-template-columns:1fr 1fr;gap:12px">
        <div class="kartu">
          <p class="stat-label">${ICONS.users} Total Data Pegawai Terekap</p>
          <p class="stat-angka" id="statTotal">-</p>
          <p style="font-size:11px;color:var(--teks-muted);margin:2px 0 0">≈ <span id="statPegawaiUnik">-</span> pegawai unik pada cakupan ini</p>
        </div>
        <div class="kartu kartu-klik" data-jenis="stat" data-field="terlambat" data-label="Telat">
          <p class="stat-label">${ICONS.clock} Telat (hari)</p><p class="stat-angka" style="color:#2563EB" id="statTelat">-</p>
          <p class="stat-klik-hint">klik untuk lihat per pegawai</p>
        </div>
        <div class="kartu kartu-klik" data-jenis="stat" data-field="sakit" data-label="Sakit">
          <p class="stat-label">Sakit (hari)</p><p class="stat-angka" style="color:#D97706" id="statSakit">-</p>
          <p class="stat-klik-hint">klik untuk lihat per pegawai</p>
        </div>
        <div class="kartu kartu-klik" data-jenis="stat" data-field="izin" data-label="Izin">
          <p class="stat-label">Izin (hari)</p><p class="stat-angka" style="color:#EAB308" id="statIzin">-</p>
          <p class="stat-klik-hint">klik untuk lihat per pegawai</p>
        </div>
        <div class="kartu kartu-klik" data-jenis="stat" data-field="alpha" data-label="Alpha">
          <p class="stat-label">${ICONS.x} Alpha (hari)</p><p class="stat-angka" style="color:var(--merah-teks)" id="statAlpha">-</p>
          <p class="stat-klik-hint">klik untuk lihat per pegawai</p>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:6px">${ICONS.chart} Tren Bulanan <span id="labelTren" style="font-weight:400;color:var(--teks-muted)"></span></p>
        <div style="display:flex;gap:10px;font-size:11px;color:var(--teks-sekunder);margin-bottom:4px">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#DC2626;margin-right:3px"></span>Alpha</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#D97706;margin-right:3px"></span>Sakit</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2563EB;margin-right:3px"></span>Terlambat</span>
        </div>
        <div id="trenBulanan"></div>
        <p style="font-size:10.5px;color:var(--teks-muted);margin:6px 0 0">Mengikuti filter Batch di atas.</p>
      </div>

      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">${ICONS.clock} Rekapitulasi Keterlambatan Masuk Kerja <span id="labelBar" style="font-weight:400;color:var(--teks-muted)"></span></p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0 0 10px">Mengikuti filter Batch di atas · arahkan kursor ke batang untuk lihat nama</p>
        <div id="barKeterlambatan"></div>
      </div>
    </div>
  `;

  document.getElementById("filterBatch").addEventListener("change", muatDataVisualisasi);
  // FITUR BARU (11 Agu 2026): klik kartu Telat/Sakit/Izin/Alpha membuka
  // panel rincian per pegawai untuk metrik itu.
  document.querySelectorAll(".kartu-klik").forEach((kartu) => {
    kartu.addEventListener("click", () => bukaRincianKategori(kartu.dataset.jenis, kartu.dataset.field, kartu.dataset.label));
  });

  muatDataVisualisasi();
}

async function muatDataVisualisasi() {
  const nilaiTerpilih = document.getElementById("filterBatch").value;
  const labelTerpilih = document.getElementById("filterBatch").selectedOptions[0].textContent;

  let mode = "all";
  let value = "";
  if (nilaiTerpilih.startsWith("tahun:")) {
    mode = "tahun";
    value = nilaiTerpilih.replace("tahun:", "");
  } else if (nilaiTerpilih !== "all") {
    mode = "batch";
    value = nilaiTerpilih;
  }

  const labelBatch = nilaiTerpilih === "all" ? "Seluruh Batch (akumulasi total)" : labelTerpilih;

  document.getElementById("konteksBanner").innerHTML = `Menampilkan data: <b>${labelBatch}</b>`;
  document.getElementById("labelDonut").textContent = `(${labelBatch})`;
  document.getElementById("labelBar").textContent = `(${labelBatch})`;
  document.getElementById("labelTren").textContent = `(${labelBatch})`;

  const viz = await api(`/api/visualisasi?filter_mode=${mode}&filter_value=${encodeURIComponent(value)}`);

  document.getElementById("statTotal").textContent = viz.statistik.total_pegawai;
  document.getElementById("statPegawaiUnik").textContent = viz.statistik.pegawai_unik;
  document.getElementById("statTelat").textContent = viz.statistik.telat;
  document.getElementById("statSakit").textContent = viz.statistik.sakit;
  document.getElementById("statIzin").textContent = viz.statistik.izin;
  document.getElementById("statAlpha").textContent = viz.statistik.alpha;

  // FITUR BARU (11 Agu 2026): disimpan di scope modul supaya panel rincian
  // (dibuka dari klik kartu statistik / baris legenda donat) tahu filter
  // periode mana yang sedang aktif tanpa perlu baca ulang dropdown-nya.
  filterVisualisasiSaatIni = { mode, value, label: labelBatch };

  renderDonutKeterangan(viz.keterangan);
  renderTrenBulananGaris("trenBulanan", viz.tren);
  renderBarKeterlambatan(viz.ranking_terlambat);
}

// -----------------------------------------------------------------------
// PANEL RINCIAN KATEGORI — FITUR BARU (11 Agu 2026)
// Dibuka dari klik kartu statistik (Telat/Sakit/Izin/Alpha) ATAU baris
// legenda donat Komposisi Keterangan di Visualisasi. Menampilkan SEMUA
// pegawai (bukan cuma top-N ringkasan) untuk kategori itu, bisa dicari,
// diurutkan nama/jumlah, dan diunduh sebagai laporan Excel - semuanya
// tetap mengikuti filter Batch/Tahun yang sedang aktif di halaman
// Visualisasi (lihat filterVisualisasiSaatIni).
// jenis: 'stat' (kolom ringkasan_pegawai, mis. field='terlambat') atau
// 'keterangan' (label Keterangan harian apa adanya, mis. 'Alpha'/'WFO').
// -----------------------------------------------------------------------
async function bukaRincianKategori(jenis, kunci, labelTampil) {
  document.getElementById("modalRincianOverlay")?.remove(); // jaga-jaga dobel klik cepat

  const overlay = document.createElement("div");
  overlay.id = "modalRincianOverlay";
  overlay.className = "modal-overlay";
  const subJudul =
    jenis === "lainnya"
      ? "Label Keterangan yang belum ada di daftar kategori resmi - kemungkinan perlu dimigrasikan/dikoreksi"
      : filterVisualisasiSaatIni.label;
  overlay.innerHTML = `
    <div class="modal-box">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px">
        <div>
          <p style="font-size:15px;font-weight:700;margin:0" class="judul-serif">Rincian ${labelTampil}</p>
          <p style="font-size:11.5px;color:var(--teks-muted);margin:2px 0 0">${subJudul}</p>
        </div>
        <button type="button" id="btnTutupModalRincian" aria-label="Tutup" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--teks-muted);line-height:1">✕</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:14px 0 10px">
        <input type="text" id="rincianCari" placeholder="Cari nama atau NIP..." style="flex:1;min-width:180px" />
        <div class="toggle-urut">
          <button type="button" class="toggle-urut-btn active" data-urut="jumlah">Jumlah terbanyak</button>
          <button type="button" class="toggle-urut-btn" data-urut="nama">Nama (A-Z)</button>
        </div>
        <button type="button" class="btn-sekunder" id="btnUnduhRincian">${ICONS.download || "⬇"} Unduh laporan</button>
      </div>
      <div id="rincianIsi"><p class="loading-text">Memuat...</p></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById("btnTutupModalRincian").addEventListener("click", () => overlay.remove());
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", escHandler); }
  });

  const paramsAmbil = new URLSearchParams({
    filter_mode: filterVisualisasiSaatIni.mode,
    filter_value: filterVisualisasiSaatIni.value || "",
  });
  if (jenis === "stat") {
    paramsAmbil.set("jenis", "stat");
    paramsAmbil.set("field", kunci);
  } else if (jenis === "lainnya") {
    paramsAmbil.set("jenis", "lainnya");
  } else {
    paramsAmbil.set("jenis", "keterangan");
    paramsAmbil.set("label", kunci);
  }

  const data = await api(`/api/visualisasi/rincian?${paramsAmbil.toString()}`);
  if (!overlay.isConnected) return; // modal sudah ditutup sebelum data selesai dimuat
  let urutSaatIni = "jumlah";
  const adaLabelAsli = jenis === "lainnya"; // kolom tambahan khusus kategori "Lainnya"

  function renderIsiRincian() {
    const kataKunci = (document.getElementById("rincianCari")?.value || "").trim().toLowerCase();
    let tampil = (data || []).filter(
      (d) => !kataKunci || `${d.nama || ""} ${d.nip || ""} ${d.label_asli || ""}`.toLowerCase().includes(kataKunci)
    );
    tampil = [...tampil].sort((a, b) =>
      urutSaatIni === "nama" ? (a.nama || "").localeCompare(b.nama || "") : (b.jumlah || 0) - (a.jumlah || 0)
    );
    const isi = document.getElementById("rincianIsi");
    if (!isi) return;
    if (!tampil.length) {
      isi.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic;padding:14px 0">Tidak ada data untuk kategori ini pada cakupan yang dipilih.</p>`;
      return;
    }
    const grid = adaLabelAsli ? "0.5fr 1.8fr 1.2fr 1.3fr 1fr" : "0.5fr 2fr 1.4fr 1fr";
    isi.innerHTML = `
      <div class="tabel-wrap">
        <div class="tabel-header-baris" style="grid-template-columns:${grid}">
          <span>NO</span><span>NAMA</span><span>NIP</span>${adaLabelAsli ? "<span>LABEL ASLI</span>" : ""}<span>JUMLAH HARI</span>
        </div>
        <div style="max-height:52vh;overflow-y:auto">
          ${tampil
            .map(
              (d, i) => `<div class="tabel-baris" style="grid-template-columns:${grid}">
              <span>${i + 1}</span><span>${d.nama || "-"}</span><span>${d.nip || "-"}</span>
              ${adaLabelAsli ? `<span style="color:var(--teks-muted);font-style:italic">${d.label_asli || "-"}</span>` : ""}
              <span style="font-weight:600">${d.jumlah} hari</span>
            </div>`
            )
            .join("")}
        </div>
      </div>
      <p style="font-size:11px;color:var(--teks-muted);margin:8px 0 0">${tampil.length} baris ditampilkan.</p>
    `;
  }

  renderIsiRincian();
  document.getElementById("rincianCari").addEventListener("input", renderIsiRincian);
  overlay.querySelectorAll(".toggle-urut-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      overlay.querySelectorAll(".toggle-urut-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      urutSaatIni = btn.dataset.urut;
      renderIsiRincian();
    });
  });

  document.getElementById("btnUnduhRincian").addEventListener("click", () => {
    const paramsUnduh = new URLSearchParams({
      filter_mode: filterVisualisasiSaatIni.mode,
      filter_value: filterVisualisasiSaatIni.value || "",
      urut: urutSaatIni,
    });
    if (jenis === "stat") {
      paramsUnduh.set("jenis", "stat");
      paramsUnduh.set("field", kunci);
    } else if (jenis === "lainnya") {
      paramsUnduh.set("jenis", "lainnya");
    } else {
      paramsUnduh.set("jenis", "keterangan");
      paramsUnduh.set("label", kunci);
    }
    window.location.href = `/api/visualisasi/rincian/unduh?${paramsUnduh.toString()}`;
  });
}

function renderBarKeterlambatan(data) {
  const wrap = document.getElementById("barKeterlambatan");
  if (!data.length) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ada catatan pada cakupan ini.</p>`;
    return;
  }
  // PERBAIKAN (30 Jul 2026): dulu dibatasi 8 (kartu ini setengah-lebar).
  // Sekarang kartu ini sejajar dengan grafik Tren (tidak lagi berbagi baris
  // dengan Perbandingan Antar Bidang yang sudah dihapus), jadi ruangnya
  // sama seperti sebelumnya - tapi diminta menampung s.d. 15 pegawai
  // sekaligus, jadi SVG dilebarkan dan batangnya dibuat lebih ramping
  // supaya tetap terbaca meski jumlah batangnya lebih banyak. Nama lengkap
  // tidak muat sebagai label sumbu-X (banyak nama + gelar cukup panjang) -
  // jadi sumbu-X cuma nomor urut, nama lengkap muncul lewat tooltip saat
  // batangnya di-hover.
  const tampil = data.slice(0, 15);
  const maxNilai = Math.max(1, ...tampil.map((d) => d.jumlah));
  const lebar = 620, tinggi = 190, ruangBawah = 22, ruangAtas = 20;
  const tinggiBar = tinggi - ruangBawah - ruangAtas;
  const jarak = lebar / tampil.length;
  const lebarBar = jarak * 0.6;

  const posisi = tampil.map((d, i) => {
    const h = (d.jumlah / maxNilai) * tinggiBar;
    return { ...d, x: i * jarak + (jarak - lebarBar) / 2, hAkhir: h, yAkhir: tinggi - ruangBawah - h };
  });

  wrap.innerHTML = `
    <svg viewBox="0 0 ${lebar} ${tinggi}" style="width:100%;height:auto;max-height:210px;overflow:visible">
      <line x1="0" y1="${tinggi - ruangBawah}" x2="${lebar}" y2="${tinggi - ruangBawah}" stroke="var(--border)" stroke-width="1" />
      ${posisi
        .map(
          (p, i) => `
        <rect class="batang-keterlambatan" data-index="${i}" x="${p.x}" y="${tinggi - ruangBawah}" width="${lebarBar}" height="0" rx="4" fill="#2563EB" style="cursor:pointer" />
        <text class="label-nilai" data-index="${i}" x="${p.x + lebarBar / 2}" y="${p.yAkhir - 6}" text-anchor="middle" font-size="10.5" fill="var(--teks-sekunder)" opacity="0">${p.jumlah}</text>
        <text x="${p.x + lebarBar / 2}" y="${tinggi - ruangBawah + 14}" text-anchor="middle" font-size="9.5" fill="var(--teks-muted)">${i + 1}</text>
      `
        )
        .join("")}
    </svg>
  `;

  // Animasi tumbuh dari 0 ke tinggi sebenarnya, seperti anak tangga muncul satu-satu
  requestAnimationFrame(() => {
    posisi.forEach((p, i) => {
      const rect = wrap.querySelector(`rect[data-index="${i}"]`);
      const label = wrap.querySelector(`text.label-nilai[data-index="${i}"]`);
      rect.style.transition = `height .5s ease ${i * 0.04}s, y .5s ease ${i * 0.04}s`;
      rect.setAttribute("height", p.hAkhir);
      rect.setAttribute("y", p.yAkhir);
      label.style.transition = `opacity .3s ease ${i * 0.04 + 0.3}s`;
      label.setAttribute("opacity", "1");
    });
  });

  wrap.querySelectorAll(".batang-keterlambatan").forEach((el, i) => {
    const p = posisi[i];
    el.addEventListener("mouseenter", () => el.setAttribute("fill", "#1D4ED8"));
    el.addEventListener("mouseleave", () => {
      el.setAttribute("fill", "#2563EB");
      sembunyikanTooltip();
    });
    el.addEventListener("mousemove", (e) => {
      tampilkanTooltip(`<b>${p.nama}</b><br>${p.jumlah} hari`, e.clientX, e.clientY);
    });
  });
}

function renderDonutKeterangan(data) {
  const labelUtama = Object.keys(WARNA_KETERANGAN);
  // PERBAIKAN (31 Jul 2026): dulu pencocokan label PERSIS huruf besar/kecil
  // ("Dinas Luar" != "DINAS LUAR" != "dinas luar" secara JS), padahal
  // ternyata beberapa batch menyimpan Keterangan dalam HURUF BESAR SEMUA -
  // jadi kategori yang sebenarnya sama malah jatuh ke "Lainnya". Sekarang
  // dicocokkan tanpa peduli besar/kecil huruf.
  const kategoriByLower = {};
  labelUtama.forEach((k) => (kategoriByLower[k.toLowerCase()] = k));

  const totalPerKategori = {};
  labelUtama.forEach((k) => (totalPerKategori[k] = 0));
  // Label yang BENAR-BENAR tidak dikenali (bukan cuma beda huruf besar/
  // kecil) tetap ditotal terpisah sebagai "Lainnya" - supaya tidak ada
  // hari yang diam-diam "hilang" dari total donut, dan rinciannya tetap
  // bisa ditelusuri lewat tooltip.
  const rincianLainnya = [];
  Object.entries(data).forEach(([labelMentah, jumlah]) => {
    const kunci = (labelMentah || "").trim().toLowerCase();
    if (kategoriByLower[kunci]) {
      totalPerKategori[kategoriByLower[kunci]] += jumlah || 0;
    } else {
      rincianLainnya.push([labelMentah, jumlah || 0]);
    }
  });
  const entri = labelUtama.map((label) => [label, totalPerKategori[label]]);
  const jumlahLainnya = rincianLainnya.reduce((s, [, v]) => s + v, 0);
  if (jumlahLainnya > 0) entri.push(["Lainnya", jumlahLainnya]);

  const total = entri.reduce((s, [, v]) => s + v, 0);
  // PERBAIKAN (11 Agu 2026): diperbesar secukupnya (r 52->64, SVG
  // 130->160px) supaya kartu ini lebih mengisi tinggi yang sama dengan
  // grid 5 kartu statistik di sebelahnya - TIDAK dibuat sebesar mungkin,
  // karena donat yang terlalu besar menyisakan terlalu sedikit ruang
  // horizontal untuk legenda, membuat label panjang seperti "Cuti Alasan
  // Penting" jadi terpotong ellipsis sampai tidak terbaca.
  const r = 64, cx = 72, cy = 72, keliling = 2 * Math.PI * r;
  let sudutSoFar = 0;

  const segmen = entri.map(([label, jumlah], i) => {
    const panjang = total > 0 ? (jumlah / total) * keliling : 0;
    const offsetMulai = -sudutSoFar;
    sudutSoFar += panjang;
    return { label, jumlah, warna: WARNA_KETERANGAN[label] || WARNA_LAINNYA, panjang, offsetMulai, i };
  });

  const lingkaran = segmen
    .map(
      (s) => `<circle class="segmen-donut" data-index="${s.i}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.warna}"
      stroke-width="21" stroke-dasharray="0 ${keliling}" stroke-dashoffset="${s.offsetMulai}" />`
    )
    .join("");

  document.getElementById("donutChart").innerHTML = `
    <div style="position:relative;width:160px;height:160px;flex-shrink:0">
      <svg width="160" height="160" viewBox="0 0 144 144" style="transform:rotate(-90deg)">${lingkaran}</svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
        <span style="font-size:23px;font-weight:700;color:var(--teks-utama)">${total}</span>
        <span style="font-size:11px;color:var(--teks-muted)">hari tercatat</span>
      </div>
    </div>
  `;

  // Untuk segmen "Lainnya", tooltip menampilkan rincian label aslinya
  // (mis. "Hadir: 40, Tidak diketahui: 15"), bukan cuma angka totalnya.
  function isiTooltip(s) {
    const persen = total > 0 ? ((s.jumlah / total) * 100).toFixed(1) : "0.0";
    if (s.label === "Lainnya") {
      const rincian = rincianLainnya.map(([lbl, v]) => `${lbl}: ${v}`).join("<br>");
      return `<b>Lainnya</b> (${s.jumlah} hari, ${persen}%)<br><span style="opacity:.8">${rincian}</span>`;
    }
    return `<b>${s.label}</b><br>${s.jumlah} hari (${persen}%)`;
  }

  const elemenLingkaran = document.querySelectorAll("#donutChart .segmen-donut");

  // Animasi tumbuh dari 0 ke ukuran sebenarnya saat pertama tampil
  requestAnimationFrame(() => {
    elemenLingkaran.forEach((el, idx) => {
      const s = segmen[idx];
      el.style.transition = "stroke-dasharray .8s ease";
      el.setAttribute("stroke-dasharray", `${s.panjang} ${keliling - s.panjang}`);
    });
  });

  // Hover di segmen donut: sorot + tampilkan tooltip rinciannya
  elemenLingkaran.forEach((el, idx) => {
    const s = segmen[idx];
    el.addEventListener("mouseenter", () => el.setAttribute("stroke-width", "27"));
    el.addEventListener("mouseleave", () => { el.setAttribute("stroke-width", "21"); sembunyikanTooltip(); });
    el.addEventListener("mousemove", (e) => tampilkanTooltip(isiTooltip(s), e.clientX, e.clientY));
  });

  // PERBAIKAN (11 Agu 2026): dulu dipaksa 2 kolom tetap (grid-auto-flow:
  // column) - kalau kartu sedang sempit, label panjang seperti "Cuti
  // Alasan Penting" jadi terpotong ellipsis sampai tidak terbaca. Sekarang
  // pakai grid RESPONSIF (auto-fit + minmax) - otomatis 2 kolom kalau
  // muat, turun jadi 1 kolom kalau ruangnya sempit, jadi label tidak
  // pernah dipaksa muat di ruang yang terlalu kecil. 11 kategori tetap +
  // "Lainnya" kalau ada label yang benar-benar tak dikenali.
  document.getElementById("donutLegend").innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:4px 10px">
      ${segmen
        .map(
          (s) => `<div class="legenda-item" data-index="${s.i}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 9px;font-size:13px;border-radius:7px;cursor:pointer;transition:background-color .15s;min-width:0">
          <span style="display:flex;align-items:center;gap:7px;color:var(--teks-utama);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">
            <span style="width:10px;height:10px;border-radius:3px;background:${s.warna};display:inline-block;flex-shrink:0"></span>
            <span style="overflow:hidden;text-overflow:ellipsis">${s.label}</span>
          </span>
          <span style="color:var(--teks-sekunder);white-space:nowrap;padding-left:6px;font-size:11.5px;flex-shrink:0">${s.jumlah} (${total > 0 ? ((s.jumlah / total) * 100).toFixed(1) : "0.0"}%)</span>
        </div>`
        )
        .join("")}
    </div>
  `;

  // Hover di legenda ikut menyorot segmen donutnya (interaksi timbal balik)
  // + tampilkan tooltip rincian yang sama (khususnya berguna untuk "Lainnya").
  // FITUR BARU (11 Agu 2026): klik pada baris legenda (kecuali "Lainnya",
  // yang merupakan gabungan label tak dikenal - tidak mewakili satu
  // kategori pasti) membuka panel rincian per pegawai untuk kategori itu.
  document.querySelectorAll("#donutLegend .legenda-item").forEach((item) => {
    const s = segmen[Number(item.dataset.index)];
    const el = document.querySelector(`#donutChart .segmen-donut[data-index="${item.dataset.index}"]`);
    item.addEventListener("mouseenter", () => {
      item.style.backgroundColor = "var(--abu-bg)";
      if (el) el.setAttribute("stroke-width", "27");
    });
    item.addEventListener("mouseleave", () => {
      item.style.backgroundColor = "transparent";
      if (el) el.setAttribute("stroke-width", "21");
      sembunyikanTooltip();
    });
    item.addEventListener("mousemove", (e) => tampilkanTooltip(isiTooltip(s), e.clientX, e.clientY));
    if (s.label !== "Lainnya") {
      item.addEventListener("click", () => bukaRincianKategori("keterangan", s.label, s.label));
    } else {
      // PERBAIKAN (11 Agu 2026): dulu "Lainnya" sengaja TIDAK bisa diklik
      // (cursor:default) karena bukan satu label tunggal - tapi itu
      // artinya isinya tidak pernah kelihatan kecuali lewat tooltip hover
      // (gampang terlewat). Sekarang tetap bisa diklik, mengarah ke jenis
      // rincian khusus 'lainnya' yang menampilkan label ASLI apa adanya
      // per pegawai (lihat db.py::ranking_lainnya), bukan mencoba
      // memaksakan satu nama kategori yang tidak ada.
      item.addEventListener("click", () => bukaRincianKategori("lainnya", null, "Lainnya"));
    }
  });
}

function labelBulan(bulanStr) {
  const d = new Date(`${bulanStr}-01`);
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function renderTrenBulananGaris(elId, data) {
  const wrap = document.getElementById(elId);
  if (!data.length) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Belum ada batch dengan periode yang tercatat.</p>`;
    return;
  }

  // PERBAIKAN (31 Jul 2026): dulu kalau data cuma 1 bulan, langkahX dihitung
  // 0 (areaLebar / (panjang-1) dihindari lewat kondisi length>1 ? ... : 0),
  // jadi SEMUA titik (Alpha/Sakit/Terlambat) numpuk di x yang sama, dan
  // jalurMengalir() cuma menghasilkan path "M x y" TANPA garis (perintah
  // SVG "moveto" doang, tidak ada "lineto"/"curveto") - jadi garisnya
  // sama sekali tidak kelihatan, cuma 3 titik kecil menumpuk di kiri.
  // Bukan bug rendering SVG, tapi memang secara matematis TIDAK ADA
  // "tren" yang bisa digambar dari 1 titik data - jadi sekarang, kalau
  // datanya cuma 1 bulan, tampilkan ringkasan angka bulan itu apa adanya
  // (bukan grafik garis kosong yang terlihat rusak), dengan pesan yang
  // jujur bahwa perlu minimal 2 bulan untuk menggambar tren.
  if (data.length === 1) {
    const d = data[0];
    const seri = [
      { kunci: "terlambat", warna: "#2563EB", label: "Terlambat" },
      { kunci: "sakit", warna: "#D97706", label: "Sakit" },
      { kunci: "alpha", warna: "#DC2626", label: "Alpha" },
    ];
    wrap.innerHTML = `
      <div style="padding:18px 4px">
        <p style="font-size:12px;color:var(--teks-muted);margin:0 0 12px">
          Baru ada data untuk <b style="color:var(--teks-sekunder)">${labelBulan(d.bulan)}</b> — tren garis perlu minimal 2 bulan untuk dibandingkan. Berikut angkanya:
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${seri
            .map(
              (s) => `<div style="flex:1;min-width:100px;border:1px solid var(--border);border-radius:10px;padding:10px 12px">
              <p style="font-size:11px;color:var(--teks-muted);margin:0 0 4px;display:flex;align-items:center;gap:6px">
                <span style="width:8px;height:8px;border-radius:50%;background:${s.warna};display:inline-block"></span>${s.label}
              </p>
              <p style="font-size:19px;font-weight:700;color:var(--teks-utama);margin:0">${d[s.kunci]}<span style="font-size:11px;font-weight:400;color:var(--teks-muted)"> hari</span></p>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;
    return;
  }

  const lebar = 640, tinggi = 140, kiri = 30, kanan = 20, atas = 14, bawah = 24;
  const areaLebar = lebar - kiri - kanan, areaTinggi = tinggi - atas - bawah;
  const maxNilai = Math.max(1, ...data.flatMap((d) => [d.alpha, d.sakit, d.terlambat]));
  const langkahX = data.length > 1 ? areaLebar / (data.length - 1) : 0;

  const posisi = (nilai, i) => ({
    x: kiri + i * langkahX,
    y: atas + areaTinggi - (nilai / maxNilai) * areaTinggi,
  });

  function jalurMengalir(nilai) {
    const titik = nilai.map((v, i) => posisi(v, i));
    if (titik.length === 1) return `M ${titik[0].x} ${titik[0].y}`;
    let d = `M ${titik[0].x} ${titik[0].y}`;
    for (let i = 0; i < titik.length - 1; i++) {
      const tengahX = (titik[i].x + titik[i + 1].x) / 2;
      d += ` C ${tengahX} ${titik[i].y}, ${tengahX} ${titik[i + 1].y}, ${titik[i + 1].x} ${titik[i + 1].y}`;
    }
    return d;
  }

  const seri = [
    { kunci: "alpha", warna: "#DC2626", label: "Alpha" },
    { kunci: "sakit", warna: "#D97706", label: "Sakit" },
    { kunci: "terlambat", warna: "#2563EB", label: "Terlambat" },
  ];

  const garisGrid = [0.25, 0.5, 0.75, 1]
    .map((f) => `<line x1="${kiri}" y1="${atas + areaTinggi * (1 - f)}" x2="${lebar - kanan}" y2="${atas + areaTinggi * (1 - f)}" stroke="var(--border)" stroke-width="1" />`)
    .join("");

  const garisSeri = seri
    .map((s) => {
      const nilai = data.map((d) => d[s.kunci]);
      const titik = nilai.map((v, i) => posisi(v, i));
      const lingkaran = titik
        .map(
          (t, i) => `<circle class="titik-data" cx="${t.x}" cy="${t.y}" r="4" fill="${s.warna}" stroke="var(--kartu-bg)" stroke-width="1.5" style="transform-box:fill-box;transform-origin:center;transition:transform .15s">
          <title>${labelBulan(data[i].bulan)} · ${s.label}: ${nilai[i]} hari</title>
        </circle>`
        )
        .join("");
      return `<path d="${jalurMengalir(nilai)}" fill="none" stroke="${s.warna}" stroke-width="2.5" stroke-linecap="round" />${lingkaran}`;
    })
    .join("");

  const labelX = data
    .map((d, i) => {
      const x = kiri + i * langkahX;
      return `<text x="${x}" y="${tinggi - 8}" font-size="11" fill="var(--teks-muted)" text-anchor="middle">${labelBulan(d.bulan).split(" ")[0]}</text>`;
    })
    .join("");

  wrap.innerHTML = `
    <svg viewBox="0 0 ${lebar} ${tinggi}" style="width:100%;height:auto;overflow:visible">
      ${garisGrid}${garisSeri}${labelX}
    </svg>
    <style>.titik-data:hover{transform:scale(1.6)}</style>
  `;

  // Animasi "menggambar" tiap garis dari kiri ke kanan, titik datanya baru
  // muncul (fade-in) setelah garis di bawahnya selesai digambar.
  const svgEl = wrap.querySelector("svg");
  svgEl.querySelectorAll("path").forEach((path) => {
    const panjang = path.getTotalLength();
    path.style.strokeDasharray = panjang;
    path.style.strokeDashoffset = panjang;
    requestAnimationFrame(() => {
      path.style.transition = "stroke-dashoffset 1s ease";
      path.style.strokeDashoffset = "0";
    });
  });
  svgEl.querySelectorAll(".titik-data").forEach((titik) => {
    titik.style.opacity = "0";
    titik.style.transition = "opacity .3s ease, transform .15s ease";
    setTimeout(() => { titik.style.opacity = "1"; }, 900);
  });
}

function renderTabelRekap(elId, data) {
  const wrap = document.getElementById(elId);
  if (!data.length) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic;padding:10px 14px">Tidak ada catatan pada periode ini.</p>`;
    return;
  }
  wrap.innerHTML = data
    .map(
      (d, i) => `<div class="baris-rekap">
      <span><span style="color:var(--teks-muted);margin-right:6px">${i + 1}.</span>${d.nama}</span>
      <span style="font-weight:600">${d.jumlah} hari</span>
    </div>`
    )
    .join("");
}

function renderBarPerBidang(batches) {
  const perBidang = {};
  batches.forEach((b) => {
    const key = b.nama_bidang || "Tanpa nama";
    perBidang[key] = (perBidang[key] || 0) + b.jumlah_pegawai;
  });
  const maxNilai = Math.max(1, ...Object.values(perBidang));
  document.getElementById("barPerBidang").innerHTML = Object.entries(perBidang)
    .map(
      ([bidang, jumlah]) => `<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--teks-sekunder);margin-bottom:6px">
      <span style="width:80px">${bidang}</span>
      <div style="flex:1;background:var(--abu-bg);border-radius:3px;height:10px">
        <div style="width:${(jumlah / maxNilai) * 100}%;height:100%;background:var(--biru);border-radius:3px"></div>
      </div>
      <span style="width:30px;text-align:right">${jumlah}</span>
    </div>`
    )
    .join("") || `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Belum ada data.</p>`;
}

// ---------------------------------------------------------------------
// LOG AKTIVITAS (global)
// ---------------------------------------------------------------------
let logAktivitasState = { semua: [], offset: 0, ukuranHalaman: 50, masihAda: true };

async function renderLogAktivitas() {
  logAktivitasState = { semua: [], offset: 0, ukuranHalaman: 50, masihAda: true };
  content.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 14px" class="judul-serif">Log Aktivitas</p>
    <div class="kartu" style="margin-bottom:12px">
      <input type="text" id="cariLogAktivitas" placeholder="Cari nama pegawai, batch, field, atau admin..." style="width:100%" />
    </div>
    <div class="tabel-wrap">
      <div class="tabel-header-baris" style="grid-template-columns:1fr 1.3fr 1fr 1fr 1fr">
        <span>WAKTU</span><span>PEGAWAI / BATCH</span><span>AKTIVITAS</span><span>SEBELUM</span><span>SESUDAH</span>
      </div>
      <!-- FITUR BARU (1 Agu 2026): dulu daftar log dirender rata tanpa
           batas tinggi - kalau aktivitasnya banyak (apalagi sekarang
           Upload/Hapus Batch ikut tercatat), seluruh HALAMAN yang jadi
           panjang & harus discroll, bukan kotak kecil ini. Sekarang
           dikurung dalam kotak scroll setinggi 60vh, dan ada tombol
           "muat lebih banyak" di bawahnya - bukan hard cap 200 tanpa
           cara melihat yang lebih lama lagi. -->
      <div id="isiLogAktivitas" style="max-height:60vh;overflow-y:auto"></div>
    </div>
    <div style="text-align:center;margin-top:10px">
      <button class="btn-sekunder" id="btnMuatLagiLog">Muat lebih banyak</button>
      <p id="infoLogAktivitas" style="font-size:11.5px;color:var(--teks-muted);margin:6px 0 0"></p>
    </div>
  `;
  document.getElementById("cariLogAktivitas").addEventListener("input", (e) => renderIsiLogAktivitas(e.target.value));
  document.getElementById("btnMuatLagiLog").addEventListener("click", muatLagiLogAktivitas);
  await muatLagiLogAktivitas();
}

async function muatLagiLogAktivitas() {
  const btn = document.getElementById("btnMuatLagiLog");
  btn.disabled = true;
  btn.textContent = "Memuat...";
  const halamanBaru = await api(`/api/log-aktivitas?limit=${logAktivitasState.ukuranHalaman}&offset=${logAktivitasState.offset}`);
  logAktivitasState.semua = logAktivitasState.semua.concat(halamanBaru);
  logAktivitasState.offset += halamanBaru.length;
  logAktivitasState.masihAda = halamanBaru.length === logAktivitasState.ukuranHalaman;
  btn.disabled = false;
  btn.textContent = "Muat lebih banyak";
  btn.style.display = logAktivitasState.masihAda ? "inline-block" : "none";
  document.getElementById("infoLogAktivitas").textContent = logAktivitasState.masihAda
    ? `${logAktivitasState.semua.length} aktivitas dimuat - masih mungkin ada yang lebih lama`
    : `${logAktivitasState.semua.length} aktivitas - ini semuanya, tidak ada lagi yang lebih lama`;
  renderIsiLogAktivitas(document.getElementById("cariLogAktivitas").value);
}

function renderIsiLogAktivitas(kataKunci) {
  const kunci = (kataKunci || "").trim().toLowerCase();
  const log = !kunci
    ? logAktivitasState.semua
    : logAktivitasState.semua.filter((l) =>
        `${l.nama_pegawai} ${l.batch_label || ""} ${l.field_diubah} ${l.diubah_oleh}`.toLowerCase().includes(kunci)
      );

  document.getElementById("isiLogAktivitas").innerHTML = log.length
    ? log
        .map((l) => {
          // Baris aktivitas level-batch (Upload/Hapus Batch, record_table='batch')
          // ditandai beda dari edit field biasa - ikon + latar lembut, dan
          // kolom "PEGAWAI" diisi nama batch-nya (bukan nama pegawai).
          const isAktivitasBatch = l.record_table === "batch";
          const ikon = l.field_diubah === "Upload Batch" ? "⬆️" : l.field_diubah === "Hapus Batch" ? "🗑️" : "";
          const kolomKedua = isAktivitasBatch ? `${ikon} ${l.batch_label || "(batch tidak diketahui)"}` : l.nama_pegawai;
          return `<div class="tabel-baris" style="grid-template-columns:1fr 1.3fr 1fr 1fr 1fr;${isAktivitasBatch ? "background:var(--biru-muda-bg)" : ""}">
              <span>${formatWaktu(l.diubah_pada)}</span><span>${kolomKedua}</span><span>${l.field_diubah}</span>
              <span style="color:var(--merah-teks)">${l.nilai_lama || "-"}</span><span style="color:var(--hijau-status-teks)">${l.nilai_baru}</span>
            </div>`;
        })
        .join("")
    : `<div style="padding:16px;font-size:12.5px;color:var(--teks-muted);font-style:italic">${
        kunci ? "Tidak ada aktivitas yang cocok dengan pencarian." : "Belum ada perubahan tercatat."
      }</div>`;
}

// ---------------------------------------------------------------------
// PENGATURAN — daftar keterangan
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// AKUN (khusus Master Admin)
// ---------------------------------------------------------------------
async function renderAkunList() {
  const daftar = await api("/api/akun");
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
      <p style="font-size:16px;font-weight:700;margin:0" class="judul-serif">Akun</p>
      <button class="btn-primer" id="btnBukaFormAkun" onclick="toggleFormAkun()">+ Tambah Admin</button>
    </div>
    <p style="font-size:12px;color:var(--teks-muted);margin:0 0 18px">Kelola akun admin yang bisa login ke sistem ini. Cuma Master Admin yang bisa menambah, menonaktifkan, atau menghapus akun - admin biasa tidak melihat halaman ini sama sekali.</p>

    <div class="kartu" id="formTambahAkun" style="margin-bottom:16px;display:none">
      <p class="stat-label" style="font-weight:600;margin-bottom:10px">Buat Akun Admin Baru</p>
      <div style="display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:8px;margin-bottom:8px">
        <input type="text" id="inputNamaAkun" placeholder="Nama" />
        <input type="email" id="inputEmailAkun" placeholder="Email" />
        <input type="password" id="inputPasswordAkun" placeholder="Password (min. 6 karakter)" />
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-primer" onclick="tambahAkun()">Buat Akun</button>
        <button class="btn-sekunder" onclick="toggleFormAkun(false)">Batal</button>
      </div>
      <p id="pesanAkun" style="font-size:12px;margin:8px 0 0"></p>
    </div>

    <div class="tabel-wrap">
      <div class="tabel-header-baris" style="grid-template-columns:1fr 1.4fr 0.8fr 0.8fr 1fr">
        <span>NAMA</span><span>EMAIL</span><span>PERAN</span><span>STATUS</span><span></span>
      </div>
      ${daftar
        .map((a) => {
          const diriSendiri = a.user_id === currentUserId;
          return `<div class="tabel-baris" style="grid-template-columns:1fr 1.4fr 0.8fr 0.8fr 1fr;cursor:default">
          <span>${a.nama || "-"}${diriSendiri ? ' <span style="color:var(--teks-muted);font-size:11px">(Anda)</span>' : ""}</span>
          <span style="color:var(--teks-sekunder)">${a.email}</span>
          <span class="badge ${a.role === "master" ? "badge-final" : "badge-draf"}">${a.role === "master" ? "Master" : "Admin"}</span>
          <span class="badge ${a.aktif ? "badge-final" : "badge-nonaktif"}">${a.aktif ? "Aktif" : "Nonaktif"}</span>
          <span style="display:flex;gap:6px;justify-content:flex-end">
            ${a.role === "master"
              ? ""
              : `<button class="btn-sekunder" style="padding:4px 10px;font-size:11.5px" ${diriSendiri ? "disabled" : ""} onclick="ubahStatusAkun('${a.user_id}', ${!a.aktif})">${a.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                 <button class="btn-sekunder" style="padding:4px 10px;font-size:11.5px;color:var(--merah-teks)" ${diriSendiri ? "disabled" : ""} onclick="hapusAkun('${a.user_id}')">Hapus</button>`}
          </span>
        </div>`;
        })
        .join("")}
    </div>
  `;
}

function toggleFormAkun(paksaBuka) {
  const form = document.getElementById("formTambahAkun");
  const btn = document.getElementById("btnBukaFormAkun");
  const buka = paksaBuka !== undefined ? paksaBuka : form.style.display === "none";
  form.style.display = buka ? "block" : "none";
  btn.textContent = buka ? "Tutup Form" : "+ Tambah Admin";
  if (buka) {
    document.getElementById("inputNamaAkun").value = "";
    document.getElementById("inputEmailAkun").value = "";
    document.getElementById("inputPasswordAkun").value = "";
    document.getElementById("pesanAkun").textContent = "";
    document.getElementById("inputNamaAkun").focus();
  }
}

async function tambahAkun() {
  const nama = document.getElementById("inputNamaAkun").value.trim();
  const email = document.getElementById("inputEmailAkun").value.trim();
  const password = document.getElementById("inputPasswordAkun").value;
  const pesan = document.getElementById("pesanAkun");
  pesan.style.color = "var(--teks-muted)";
  pesan.textContent = "Membuat akun...";
  const hasil = await api("/api/akun", { method: "POST", body: JSON.stringify({ nama, email, password }) });
  if (!hasil.ok) {
    pesan.style.color = "var(--merah-teks)";
    pesan.textContent = hasil.pesan || "Gagal membuat akun.";
    return;
  }
  renderAkunList();
}

async function ubahStatusAkun(userId, aktifBaru) {
  await api(`/api/akun/${userId}/status`, { method: "POST", body: JSON.stringify({ aktif: aktifBaru }) });
  renderAkunList();
}

async function hapusAkun(userId) {
  if (!confirm("Hapus akun ini? Pengguna yang bersangkutan tidak akan bisa login lagi, dan tindakan ini tidak bisa dibatalkan.")) return;
  const hasil = await api(`/api/akun/${userId}`, { method: "DELETE" });
  if (!hasil.ok) {
    alert(hasil.pesan || "Gagal menghapus akun.");
    return;
  }
  renderAkunList();
}

function ubahTema() {
  const temaBaru = document.documentElement.getAttribute("data-tema") === "gelap" ? "terang" : "gelap";
  document.documentElement.setAttribute("data-tema", temaBaru);
  localStorage.setItem("tema", temaBaru);
  document.getElementById("toggleTema")?.classList.toggle("aktif", temaBaru === "gelap");
}

async function renderPengaturan() {
  const [keterangan, bidang] = await Promise.all([api("/api/keterangan"), api("/api/bidang")]);
  daftarKeteranganCache = keterangan;
  daftarBidangCache = bidang;

  const temaSaatIni = localStorage.getItem("tema") || "terang";

  content.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 4px" class="judul-serif">Pengaturan</p>
    <p style="font-size:12px;color:var(--teks-muted);margin:0 0 18px">Data master di bawah ini dipakai sebagai pilihan dropdown di seluruh sistem (Proses Batch, Data Harian, Ringkasan Pegawai, Visualisasi) - ubah di sini, otomatis konsisten di mana-mana.</p>

    <p style="font-size:11.5px;font-weight:700;letter-spacing:.3px;color:var(--teks-muted);margin:0 0 8px;text-transform:uppercase">Tampilan</p>
    <div class="kartu" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">Mode Gelap</p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0">Ganti tampilan terang/gelap. Pilihan tersimpan otomatis di perangkat ini.</p>
      </div>
      <button type="button" id="toggleTema" class="sakelar-tema ${temaSaatIni === "gelap" ? "aktif" : ""}" onclick="ubahTema()" title="Ganti mode terang/gelap">
        <span class="sakelar-tema-bulatan">
          <svg class="ikon-matahari" viewBox="0 0 20 20" fill="none" width="12" height="12"><circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <svg class="ikon-bulan" viewBox="0 0 20 20" fill="none" width="12" height="12"><path d="M16.5 12.3A6.8 6.8 0 1 1 7.7 3.5a5.3 5.3 0 0 0 8.8 8.8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        </span>
      </button>
    </div>

    <p style="font-size:11.5px;font-weight:700;letter-spacing:.3px;color:var(--teks-muted);margin:0 0 8px;text-transform:uppercase">Data Master</p>

    <div class="grid-2" style="gap:14px;margin-bottom:16px">
      <div class="kartu">
        <div class="panel-master-header" onclick="toggleMasterPanel('Keterangan')" role="button" tabindex="0" aria-expanded="${panelKeteranganTerbuka}" aria-controls="panelKeterangan" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleMasterPanel('Keterangan');}">
          <div>
            <p class="stat-label" style="font-weight:600;margin-bottom:2px">Daftar Keterangan</p>
            <p style="font-size:11px;color:var(--teks-muted);margin:0">${keterangan.length} pilihan — dropdown "Keterangan" di tabel Data Harian</p>
          </div>
          <svg id="panahKeterangan" class="ikon panel-master-panah ${panelKeteranganTerbuka ? "terbuka" : ""}" viewBox="0 0 20 20" fill="none" width="16" height="16"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div id="panelKeterangan" class="panel-master-isi" ${panelKeteranganTerbuka ? "" : "hidden"}>
          <div id="daftarKeteranganList" class="chip-master-wrap" style="margin:10px 0 12px;max-height:160px;overflow-y:auto">
            ${keterangan
              .map(
                (k) => `<span class="chip-master">
                ${k.label}
                <button onclick="hapusKeterangan(${k.id})" title="Hapus ${k.label}" aria-label="Hapus ${k.label}">✕</button>
              </span>`
              )
              .join("")}
          </div>
          <div style="display:flex;gap:8px">
            <input type="text" id="inputKeteranganBaru" placeholder="Tambah keterangan baru..." style="flex:1" />
            <button class="btn-primer" onclick="tambahKeterangan()">Tambah</button>
          </div>
        </div>
      </div>

      <div class="kartu">
        <div class="panel-master-header" onclick="toggleMasterPanel('Bidang')" role="button" tabindex="0" aria-expanded="${panelBidangTerbuka}" aria-controls="panelBidang" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleMasterPanel('Bidang');}">
          <div>
            <p class="stat-label" style="font-weight:600;margin-bottom:2px">Daftar Bidang</p>
            <p style="font-size:11px;color:var(--teks-muted);margin:0">${bidang.length} pilihan — Ringkasan Pegawai &amp; filter Visualisasi</p>
          </div>
          <svg id="panahBidang" class="ikon panel-master-panah ${panelBidangTerbuka ? "terbuka" : ""}" viewBox="0 0 20 20" fill="none" width="16" height="16"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div id="panelBidang" class="panel-master-isi" ${panelBidangTerbuka ? "" : "hidden"}>
          <div id="daftarBidangList" class="chip-master-wrap" style="margin:10px 0 12px;max-height:160px;overflow-y:auto">
            ${bidang
              .map(
                (b) => `<span class="chip-master">
                ${b.label}
                <button onclick="hapusBidang(${b.id})" title="Hapus ${b.label}" aria-label="Hapus ${b.label}">✕</button>
              </span>`
              )
              .join("")}
          </div>
          <div style="display:flex;gap:8px">
            <input type="text" id="inputBidangBaru" placeholder="Tambah bidang baru (mis. DATUN)..." style="flex:1" />
            <button class="btn-primer" onclick="tambahBidang()">Tambah</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function toggleMasterPanel(nama) {
  // nama: "Keterangan" atau "Bidang"
  if (nama === "Keterangan") panelKeteranganTerbuka = !panelKeteranganTerbuka;
  else panelBidangTerbuka = !panelBidangTerbuka;

  const panel = document.getElementById(`panel${nama}`);
  const panah = document.getElementById(`panah${nama}`);
  const terbuka = nama === "Keterangan" ? panelKeteranganTerbuka : panelBidangTerbuka;
  if (panel) panel.hidden = !terbuka;
  if (panah) panah.classList.toggle("terbuka", terbuka);
  panel?.closest(".kartu")?.querySelector(".panel-master-header")?.setAttribute("aria-expanded", String(terbuka));
}

async function tambahKeterangan() {
  const input = document.getElementById("inputKeteranganBaru");
  const label = input.value.trim();
  if (!label) return;
  await api("/api/keterangan", { method: "POST", body: JSON.stringify({ label }) });
  daftarKeteranganCache = null;
  renderPengaturan();
}

async function hapusKeterangan(id) {
  if (!confirm("Hapus keterangan ini dari daftar dropdown?")) return;
  await api(`/api/keterangan/${id}`, { method: "DELETE" });
  daftarKeteranganCache = null;
  renderPengaturan();
}

async function tambahBidang() {
  const input = document.getElementById("inputBidangBaru");
  const label = input.value.trim();
  if (!label) return;
  await api("/api/bidang", { method: "POST", body: JSON.stringify({ label }) });
  daftarBidangCache = null;
  renderPengaturan();
}

async function hapusBidang(id) {
  if (!confirm("Hapus bidang ini dari daftar? Pegawai yang sudah ditandai bidang ini di batch lama tidak akan ikut terhapus, cuma tidak muncul lagi sebagai pilihan baru.")) return;
  await api(`/api/bidang/${id}`, { method: "DELETE" });
  daftarBidangCache = null;
  renderPengaturan();
}

// ---------------------------------------------------------------------
// INISIALISASI
// Muat tab sesuai hash URL saat dashboard pertama dibuka (mis. kalau
// halaman di-refresh di tab tertentu, atau link "#riwayat" dibagikan
// langsung), dan pastikan ada satu entri riwayat awal supaya popstate
// pertama kali (tombol Back) punya sesuatu yang valid untuk dituju.
// ---------------------------------------------------------------------
(function mulaiRoutingAwal() {
  const tabAwal = (location.hash || "#beranda").slice(1);
  history.replaceState({ tab: tabAwal }, "", `#${tabAwal}`);
  gotoTab(tabAwal, { catatRiwayat: false });
})();
