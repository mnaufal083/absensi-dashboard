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
let pendingChanges = {}; // key: `${record_table}:${record_id}:${field}` -> {record_table, record_id, field, nilai_baru}
let currentBatchId = null;
const currentUserId = document.body.dataset.userId || null;

// ---------------------------------------------------------------------
// ROUTING SIDEBAR
// ---------------------------------------------------------------------
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => gotoTab(btn.dataset.tab));
});

function gotoTab(name) {
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
  content.innerHTML = '<p class="loading-text">Memuat...</p>';
  (loaders[name] || renderBeranda)();
}

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

function optionsKeterangan(list, terpilih) {
  return list
    .map((k) => `<option value="${k.label}" ${k.label === terpilih ? "selected" : ""}>${k.label}</option>`)
    .join("");
}

// ---------------------------------------------------------------------
// BERANDA
// ---------------------------------------------------------------------
async function renderBeranda() {
  const data = await api("/api/ringkasan-beranda");
  const aktivitas = (data.aktivitas_terbaru || [])
    .map(
      (a) => `<div class="tabel-baris" style="grid-template-columns:2fr 1fr">
        <span>${a.diubah_oleh || "admin"} mengubah <b>${a.field_diubah}</b> pada ${a.nama_pegawai}</span>
        <span style="color:var(--teks-muted);text-align:right">${formatWaktu(a.diubah_pada)}</span>
      </div>`
    )
    .join("") || `<p class="loading-text" style="padding:14px">Belum ada aktivitas.</p>`;

  content.innerHTML = `
    <p style="font-size:17px;font-weight:700;margin:0 0 4px" class="judul-serif">Selamat datang</p>
    <p style="font-size:12.5px;color:var(--teks-sekunder);margin:0 0 18px">Ringkasan aktivitas rekapitulasi absensi</p>

    <div class="grid-3" style="margin-bottom:18px">
      <div class="kartu"><p class="stat-label">Total batch</p><p class="stat-angka">${data.total_batch}</p></div>
      <div class="kartu"><p class="stat-label">Perlu ditinjau</p><p class="stat-angka" style="color:var(--merah-teks)">${data.perlu_ditinjau}</p></div>
      <div class="kartu"><p class="stat-label">Pegawai terekap</p><p class="stat-angka">${data.total_pegawai}</p></div>
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

    <div class="grid-2">
      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">Rekapitulasi Ketidakhadiran Tanpa Keterangan (Alpha)</p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0 0 10px">Dijumlah dari seluruh batch yang tercatat</p>
        <div class="scroll-list" id="rekapAlphaBeranda"></div>
      </div>
      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">Rekapitulasi Keterlambatan Masuk Kerja</p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0 0 10px">Dijumlah dari seluruh batch yang tercatat</p>
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

    <div id="progresProses" style="display:none;margin-top:16px">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--teks-sekunder);margin-bottom:6px">
        <span id="progresLabel">Memproses...</span>
        <span id="progresPersen">0%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" id="progresFill" style="width:0%"></div></div>
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
    const progresWrap = document.getElementById("progresProses");
    const progresLabel = document.getElementById("progresLabel");
    const progresPersen = document.getElementById("progresPersen");
    const progresFill = document.getElementById("progresFill");

    btn.disabled = true;
    progresWrap.style.display = "block";
    progresLabel.textContent = "Memulai batch...";
    progresFill.style.width = "0%";
    progresPersen.textContent = "0%";

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
        progresLabel.textContent = `Memproses ${i + 1} dari ${total}: ${file.name}`;
        const baris = document.querySelector(`[data-file-row="${i}"]`);
        if (baris) baris.style.background = "#FBF3DC";

        const fileForm = new FormData();
        fileForm.append("batch_id", batchId);
        fileForm.append("file", file);
        fileForm.append("nama_bidang", document.getElementById("inputBidang").value.trim());
        const fileRes = await fetch("/api/proses/file", { method: "POST", body: fileForm });
        const fileData = await ambilJsonAtauLempar(fileRes);

        if (baris) baris.style.background = fileData.bermasalah ? "#FBE6E1" : "#E4F0E6";

        const persen = Math.round(((i + 1) / total) * 100);
        progresFill.style.width = `${persen}%`;
        progresPersen.textContent = `${persen}%`;
      }

      // 3) tutup batch: hitung ulang jumlah pegawai + ambil pratinjau & log
      progresLabel.textContent = "Menyelesaikan...";
      const selesaiRes = await fetch("/api/proses/selesai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const selesaiData = await ambilJsonAtauLempar(selesaiRes);

      btn.disabled = false;
      progresLabel.textContent = "Selesai";
      selesaiData.batch_id = batchId;
      tampilkanHasilProses(selesaiData);
    } catch (err) {
      btn.disabled = false;
      progresWrap.style.display = "none";
      alert(err.message || "Tidak bisa terhubung ke server. Pastikan 'python app.py' masih berjalan, lalu coba lagi.");
    }
  }
}

async function ambilJsonAtauLempar(res) {
  try {
    return await res.json();
  } catch (parseErr) {
    throw new Error(`Server membalas status ${res.status} (bukan JSON). Cek terminal tempat "python app.py" berjalan untuk detail errornya.`);
  }
}

function tampilkanHasilProses(data) {
  document.getElementById("hasilProses").style.display = "block";
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
async function bukaDetailBatch(batchId) {
  currentBatchId = batchId;
  pendingChanges = {};
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
        <button class="btn-sekunder" onclick="ubahStatusBatch('${b.id}', '${isFinal ? "draft" : "final"}')">
          ${isFinal ? "Tandai Draf lagi" : "Tandai Final (siap unduh)"}
        </button>
        <button class="btn-primer" onclick="unduhBatch('${b.id}', '${b.status}')">⬇ Unduh Excel</button>
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

  renderTabelHarian(detail.attendance, keterangan, isFinal);
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

function renderTabelHarian(rows, keterangan, isFinal) {
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
      return `
      <div data-grup-pegawai="${kataKunci}" style="border:0.5px solid var(--border);border-radius:10px;margin-bottom:8px;overflow:hidden;background:var(--kartu-bg)">
        <button type="button" class="grup-toggle" data-grup-index="${gi}"
          style="width:100%;display:flex;justify-content:space-between;align-items:center;background:var(--kartu-bg);border:none;padding:12px 16px;text-align:left;cursor:pointer">
          <span style="font-size:13px;font-weight:600;color:var(--teks-utama)">
            <span class="grup-panah" style="display:inline-block;transition:transform .15s;margin-right:8px">▸</span>
            ${g.nama} <span style="font-weight:400;color:var(--teks-sekunder)">· NIP ${g.nip || "-"}</span>
          </span>
          <span style="font-size:12px;color:var(--teks-muted)">${g.baris.length} hari${jumlahEdit ? ` · ${jumlahEdit} diedit` : ""}</span>
        </button>
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
        isi.innerHTML = `
          <div class="tabel-header-baris" style="grid-template-columns:0.8fr 1fr 1fr 1.3fr 1fr">
            <span>TANGGAL</span><span>JAM MASUK</span><span>JAM KELUAR</span><span>KETERANGAN</span><span>TELAT</span>
          </div>
          ${g.baris
            .map(
              (r) => `<div class="tabel-baris ${r.is_edited ? "diedit" : ""}" style="grid-template-columns:0.8fr 1fr 1fr 1.3fr 1fr" data-record-id="${r.id}">
              <span style="color:var(--teks-sekunder)">${formatTanggalTampil(r.tanggal)}</span>
              <input class="edit-field" ${dis} data-tabel="attendance_records" data-record="${r.id}" data-field="jam_masuk" value="${r.jam_masuk || ""}" />
              <input class="edit-field" ${dis} data-tabel="attendance_records" data-record="${r.id}" data-field="jam_keluar" value="${r.jam_keluar || ""}" />
              <select class="edit-field" ${dis} data-tabel="attendance_records" data-record="${r.id}" data-field="keterangan">${optionsKeterangan(keterangan, r.keterangan)}</select>
              <input class="edit-field" ${dis} data-tabel="attendance_records" data-record="${r.id}" data-field="datang_telat" value="${r.datang_telat || ""}" placeholder="-" />
            </div>`
            )
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
    <p style="font-size:11px;color:var(--teks-muted);margin:0 0 8px">Kolom <b>Bidang</b> perlu dikoreksi manual kalau batch ini gabungan lintas-Bidang (sistem tidak bisa menebaknya otomatis dari isi PDF).</p>
    <div class="tabel-wrap" style="min-width:900px;margin-bottom:6px">
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
  } else {
    alert("Gagal menyimpan perubahan.");
  }
}

async function ubahStatusBatch(batchId, statusBaru) {
  const endpoint = statusBaru === "final" ? "final" : "draf";
  await api(`/api/batches/${batchId}/${endpoint}`, { method: "POST" });
  bukaDetailBatch(batchId);
}

async function unduhBatch(batchId, statusSaatIni) {
  if (statusSaatIni !== "final") {
    const lanjut = confirm(
      'Batch ini masih berstatus Draf. Excel cuma bisa diunduh dari batch yang sudah Final (supaya rekap yang terunduh selalu data yang sudah "dikunci").\n\nTandai Final sekarang dan lanjut unduh?'
    );
    if (!lanjut) return;
    await api(`/api/batches/${batchId}/final`, { method: "POST" });
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
const PALET_KETERANGAN = ["#2563EB", "#94A3B8", "#F59E0B", "#0D9488", "#8B5CF6", "#DC2626", "#38BDF8"];

async function renderVisualisasi() {
  const [batches, daftarBidang] = await Promise.all([api("/api/batches"), ambilDaftarBidang()]);

  content.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 14px" class="judul-serif">${ICONS.chart} Visualisasi</p>

    <div class="kartu">
      <p class="stat-label" style="font-weight:600;margin-bottom:10px">${ICONS.filter} Filter Data</p>
      <div class="filter-bar">
        <div>
          <label>Pilih Batch</label>
          <select id="filterBatch">
            <option value="all">Seluruh Batch (akumulasi)</option>
            ${batches.map((b) => `<option value="${b.id}">${b.label} · ${b.nama_bidang || "campuran"}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Pilih Bidang</label>
          <select id="filterBidang">
            <option value="all">Semua Bidang (gabungan)</option>
            ${daftarBidang.map((b) => `<option value="${b.label}">${b.label}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="konteks-banner" id="konteksBanner"></div>
    </div>

    <div class="grid-4" style="margin-bottom:14px">
      <div class="kartu"><p class="stat-label">${ICONS.users} Total Pegawai</p><p class="stat-angka" id="statTotal">-</p></div>
      <div class="kartu"><p class="stat-label">${ICONS.clock} Telat (hari)</p><p class="stat-angka" style="color:#2563EB" id="statTelat">-</p></div>
      <div class="kartu"><p class="stat-label">Sakit (hari)</p><p class="stat-angka" style="color:#D97706" id="statSakit">-</p></div>
      <div class="kartu"><p class="stat-label">${ICONS.x} Alpha (hari)</p><p class="stat-angka" style="color:var(--merah-teks)" id="statAlpha">-</p></div>
    </div>

    <div class="kartu">
      <p class="stat-label" style="font-weight:600;margin-bottom:12px">${ICONS.pie} Komposisi Keterangan <span id="labelDonut" style="font-weight:400;color:var(--teks-muted)"></span></p>
      <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
        <div id="donutChart"></div>
        <div id="donutLegend" style="flex:1;min-width:180px"></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:6px">${ICONS.chart} Tren — Seluruh Bidang</p>
        <div style="display:flex;gap:10px;font-size:11px;color:var(--teks-sekunder);margin-bottom:4px">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#DC2626;margin-right:3px"></span>Alpha</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#D97706;margin-right:3px"></span>Sakit</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2563EB;margin-right:3px"></span>Terlambat</span>
        </div>
        <div id="trenSeluruh"></div>
        <p style="font-size:10.5px;color:var(--teks-muted);margin:6px 0 0">Selalu menjumlahkan kelima Bidang, tidak ikut filter — acuan pembanding.</p>
      </div>

      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:6px">${ICONS.chart} Tren — <span id="labelTrenBidang">Per Bidang</span></p>
        <div style="display:flex;gap:10px;font-size:11px;color:var(--teks-sekunder);margin-bottom:4px">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#DC2626;margin-right:3px"></span>Alpha</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#D97706;margin-right:3px"></span>Sakit</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2563EB;margin-right:3px"></span>Terlambat</span>
        </div>
        <div id="trenPerBidang"></div>
        <p style="font-size:10.5px;color:var(--teks-muted);margin:6px 0 0">Mengikuti pilihan Bidang di atas (Batch tidak berpengaruh).</p>
      </div>
    </div>

    <div class="grid-2">
      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">${ICONS.building} Perbandingan Antar Bidang</p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0 0 12px">Dijumlah dari seluruh batch yang sudah diberi Bidang (baik saat upload maupun dikoreksi manual) — tidak mengikuti filter Bidang di atas, karena tujuannya membandingkan kelimanya sekaligus. Filter Batch tetap berlaku.</p>
        <div id="perbandinganBidang"></div>
      </div>

      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">${ICONS.clock} Rekapitulasi Keterlambatan Masuk Kerja <span id="labelBar" style="font-weight:400;color:var(--teks-muted)"></span></p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0 0 10px">Mengikuti filter Batch &amp; Bidang di atas · arahkan kursor ke batang untuk lihat nama</p>
        <div id="barKeterlambatan"></div>
      </div>
    </div>
  `;

  document.getElementById("filterBatch").addEventListener("change", muatDataVisualisasi);
  document.getElementById("filterBidang").addEventListener("change", muatDataVisualisasi);

  // Grafik "Seluruh Bidang" dimuat sekali saja — selalu menjumlahkan semua data, tidak ikut filter
  const trenSeluruh = await api("/api/visualisasi?filter_mode=all");
  renderTrenBulananGaris("trenSeluruh", trenSeluruh.tren_keseluruhan);

  muatDataVisualisasi();
}

function renderPerbandinganBidang(data) {
  const wrap = document.getElementById("perbandinganBidang");
  const adaData = data.some((d) => d.total_pegawai > 0);
  if (!adaData) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Belum ada pegawai yang diberi Bidang. Isi "Nama Bidang" saat unggah, atau koreksi kolom Bidang di tab Ringkasan Pegawai.</p>`;
    return;
  }
  const maxPegawai = Math.max(1, ...data.map((d) => d.total_pegawai));
  wrap.innerHTML = `
    <div class="tabel-wrap">
      <div class="tabel-header-baris" style="grid-template-columns:1fr 1.6fr 0.8fr 0.8fr">
        <span>BIDANG</span><span>TOTAL PEGAWAI</span><span>TELAT</span><span>ALPHA</span>
      </div>
      ${data
        .map(
          (d) => `<div class="tabel-baris" style="grid-template-columns:1fr 1.6fr 0.8fr 0.8fr">
          <span style="font-weight:600">${d.bidang}</span>
          <span style="display:flex;align-items:center;gap:8px">
            <span style="flex:1;background:var(--abu-bg);border-radius:3px;height:9px">
              <span style="display:block;width:${(d.total_pegawai / maxPegawai) * 100}%;height:100%;background:var(--biru);border-radius:3px"></span>
            </span>
            <span style="width:32px;text-align:right;font-size:12px">${d.total_pegawai}</span>
          </span>
          <span style="color:#2563EB">${d.telat}</span>
          <span style="color:var(--merah-teks)">${d.alpha}</span>
        </div>`
        )
        .join("")}
    </div>
  `;
}

async function muatDataVisualisasi() {
  const idBatch = document.getElementById("filterBatch").value;
  const namaBidang = document.getElementById("filterBidang").value;

  // Kalau satu Batch spesifik dipilih, filter Bidang otomatis tidak relevan
  // (satu batch sudah pasti satu Bidang) — mode 'batch' menang.
  const mode = idBatch !== "all" ? "batch" : namaBidang !== "all" ? "bidang" : "all";
  const value = idBatch !== "all" ? idBatch : namaBidang !== "all" ? namaBidang : "";

  const labelBatch = idBatch === "all"
    ? "Seluruh Batch"
    : document.getElementById("filterBatch").selectedOptions[0].textContent;
  const labelBidang = mode === "batch" ? "" : namaBidang === "all" ? " · Semua Bidang" : ` · Bidang ${namaBidang}`;

  document.getElementById("konteksBanner").innerHTML = `Menampilkan data: <b>${labelBatch}${labelBidang}</b>`;
  document.getElementById("labelDonut").textContent = `(${labelBatch}${labelBidang})`;
  document.getElementById("labelBar").textContent = `(${labelBatch}${labelBidang})`;
  document.getElementById("labelTrenBidang").textContent = namaBidang === "all" ? "Per Bidang (pilih salah satu di atas)" : `Bidang ${namaBidang}`;

  const viz = await api(`/api/visualisasi?filter_mode=${mode}&filter_value=${encodeURIComponent(value)}`);

  document.getElementById("statTotal").textContent = viz.statistik.total_pegawai;
  document.getElementById("statTelat").textContent = viz.statistik.telat;
  document.getElementById("statSakit").textContent = viz.statistik.sakit;
  document.getElementById("statAlpha").textContent = viz.statistik.alpha;

  renderDonutKeterangan(viz.keterangan);
  renderTrenBulananGaris("trenPerBidang", viz.tren_filter);
  renderBarKeterlambatan(viz.ranking_terlambat);
  renderPerbandinganBidang(viz.perbandingan_bidang || []);
}

function renderBarKeterlambatan(data) {
  const wrap = document.getElementById("barKeterlambatan");
  if (!data.length) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ada catatan pada cakupan ini.</p>`;
    return;
  }
  // Dibatasi ke 8 teratas supaya batangnya tetap cukup lebar dibaca dalam
  // kartu setengah-lebar. Nama lengkap tidak muat sebagai label sumbu-X
  // (banyak nama + gelar cukup panjang) - jadi sumbu-X cuma nomor urut,
  // nama lengkap muncul lewat tooltip saat batangnya di-hover.
  const tampil = data.slice(0, 8);
  const maxNilai = Math.max(1, ...tampil.map((d) => d.jumlah));
  const lebar = 340, tinggi = 190, ruangBawah = 22, ruangAtas = 20;
  const tinggiBar = tinggi - ruangBawah - ruangAtas;
  const jarak = lebar / tampil.length;
  const lebarBar = jarak * 0.55;

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
  const entri = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entri.reduce((s, [, v]) => s + v, 0);
  const r = 52, cx = 60, cy = 60, keliling = 2 * Math.PI * r;
  let sudutSoFar = 0;

  const segmen = entri.map(([label, jumlah], i) => {
    const panjang = (jumlah / total) * keliling;
    const offsetMulai = -sudutSoFar;
    sudutSoFar += panjang;
    return { label, jumlah, warna: PALET_KETERANGAN[i % PALET_KETERANGAN.length], panjang, offsetMulai, i };
  });

  const lingkaran = segmen
    .map(
      (s) => `<circle class="segmen-donut" data-index="${s.i}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.warna}"
      stroke-width="18" stroke-dasharray="0 ${keliling}" stroke-dashoffset="${s.offsetMulai}" />`
    )
    .join("");

  document.getElementById("donutChart").innerHTML = `
    <div style="position:relative;width:130px;height:130px">
      <svg width="130" height="130" viewBox="0 0 120 120" style="transform:rotate(-90deg)">${lingkaran}</svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
        <span style="font-size:19px;font-weight:700;color:var(--teks-utama)">${total}</span>
        <span style="font-size:10px;color:var(--teks-muted)">hari tercatat</span>
      </div>
    </div>
  `;

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
    el.addEventListener("mouseenter", () => el.setAttribute("stroke-width", "22"));
    el.addEventListener("mouseleave", () => { el.setAttribute("stroke-width", "18"); sembunyikanTooltip(); });
    el.addEventListener("mousemove", (e) => {
      const persen = ((s.jumlah / total) * 100).toFixed(1);
      tampilkanTooltip(`<b>${s.label}</b><br>${s.jumlah} hari (${persen}%)`, e.clientX, e.clientY);
    });
  });

  document.getElementById("donutLegend").innerHTML = segmen
    .map(
      (s) => `<div class="legenda-item" data-index="${s.i}" style="display:flex;justify-content:space-between;align-items:center;padding:5px 6px;font-size:12.5px;border-radius:6px;cursor:pointer;transition:background-color .15s">
      <span style="display:flex;align-items:center;gap:8px;color:var(--teks-utama)">
        <span style="width:10px;height:10px;border-radius:3px;background:${s.warna};display:inline-block"></span>
        ${s.label}
      </span>
      <span style="color:var(--teks-sekunder)">${s.jumlah} (${((s.jumlah / total) * 100).toFixed(1)}%)</span>
    </div>`
    )
    .join("") || `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Belum ada data.</p>`;

  // Hover di legenda ikut menyorot segmen donutnya (interaksi timbal balik)
  document.querySelectorAll("#donutLegend .legenda-item").forEach((item) => {
    const el = document.querySelector(`#donutChart .segmen-donut[data-index="${item.dataset.index}"]`);
    item.addEventListener("mouseenter", () => {
      item.style.backgroundColor = "var(--abu-bg)";
      if (el) el.setAttribute("stroke-width", "22");
    });
    item.addEventListener("mouseleave", () => {
      item.style.backgroundColor = "transparent";
      if (el) el.setAttribute("stroke-width", "18");
    });
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
async function renderLogAktivitas() {
  const log = await api("/api/log-aktivitas");
  content.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 14px" class="judul-serif">Log Aktivitas</p>
    <div class="tabel-wrap">
      <div class="tabel-header-baris" style="grid-template-columns:1fr 1.3fr 1fr 1fr 1fr">
        <span>WAKTU</span><span>PEGAWAI</span><span>FIELD</span><span>SEBELUM</span><span>SESUDAH</span>
      </div>
      ${
        log.length
          ? log
              .map(
                (l) => `<div class="tabel-baris" style="grid-template-columns:1fr 1.3fr 1fr 1fr 1fr">
              <span>${formatWaktu(l.diubah_pada)}</span><span>${l.nama_pegawai}</span><span>${l.field_diubah}</span>
              <span style="color:var(--merah-teks)">${l.nilai_lama || "-"}</span><span style="color:var(--hijau-status-teks)">${l.nilai_baru}</span>
            </div>`
              )
              .join("")
          : `<div style="padding:16px;font-size:12.5px;color:var(--teks-muted);font-style:italic">Belum ada perubahan tercatat.</div>`
      }
    </div>
  `;
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
    <p style="font-size:16px;font-weight:700;margin:0 0 4px" class="judul-serif">Akun</p>
    <p style="font-size:12px;color:var(--teks-muted);margin:0 0 18px">Kelola akun admin yang bisa login ke sistem ini. Cuma Master Admin yang bisa menambah, menonaktifkan, atau menghapus akun - admin biasa tidak melihat halaman ini sama sekali.</p>

    <div class="kartu" style="margin-bottom:16px">
      <p class="stat-label" style="font-weight:600;margin-bottom:10px">Tambah Admin Baru</p>
      <div style="display:grid;grid-template-columns:1fr 1.3fr 1fr auto;gap:8px">
        <input type="text" id="inputNamaAkun" placeholder="Nama" />
        <input type="email" id="inputEmailAkun" placeholder="Email" />
        <input type="password" id="inputPasswordAkun" placeholder="Password (min. 6 karakter)" />
        <button class="btn-primer" onclick="tambahAkun()">Buat Akun</button>
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
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">Daftar Keterangan</p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0 0 10px">Pilihan dropdown "Keterangan" di tabel Data Harian</p>
        <div id="daftarKeteranganList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;max-height:320px;overflow-y:auto">
          ${keterangan
            .map(
              (k) => `<div style="display:flex;justify-content:space-between;align-items:center;border:0.5px solid var(--border);border-radius:8px;padding:8px 12px">
              <span style="font-size:13px">${k.label}</span>
              <button class="btn-sekunder" style="padding:4px 10px;font-size:11.5px;color:var(--merah-teks)" onclick="hapusKeterangan(${k.id})">Hapus</button>
            </div>`
            )
            .join("")}
        </div>
        <div style="display:flex;gap:8px">
          <input type="text" id="inputKeteranganBaru" placeholder="Tambah keterangan baru..." style="flex:1" />
          <button class="btn-primer" onclick="tambahKeterangan()">Tambah</button>
        </div>
      </div>

      <div class="kartu">
        <p class="stat-label" style="font-weight:600;margin-bottom:2px">Daftar Bidang</p>
        <p style="font-size:11px;color:var(--teks-muted);margin:0 0 10px">Pilihan Bidang di Ringkasan Pegawai &amp; filter Visualisasi</p>
        <div id="daftarBidangList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;max-height:320px;overflow-y:auto">
          ${bidang
            .map(
              (b) => `<div style="display:flex;justify-content:space-between;align-items:center;border:0.5px solid var(--border);border-radius:8px;padding:8px 12px">
              <span style="font-size:13px">${b.label}</span>
              <button class="btn-sekunder" style="padding:4px 10px;font-size:11.5px;color:var(--merah-teks)" onclick="hapusBidang(${b.id})">Hapus</button>
            </div>`
            )
            .join("")}
        </div>
        <div style="display:flex;gap:8px">
          <input type="text" id="inputBidangBaru" placeholder="Tambah bidang baru (mis. DATUN)..." style="flex:1" />
          <button class="btn-primer" onclick="tambahBidang()">Tambah</button>
        </div>
      </div>
    </div>

    <p style="font-size:11.5px;font-weight:700;letter-spacing:.3px;color:var(--teks-muted);margin:0 0 8px;text-transform:uppercase">Tentang</p>
    <div class="kartu">
      <p style="font-size:12.5px;color:var(--teks-sekunder);margin:0 0 6px"><b>Sistem Rekapitulasi Absensi</b> — Kejaksaan Tinggi Jawa Tengah, Bidang Daskrimti</p>
      <p style="font-size:11.5px;color:var(--teks-muted);margin:0">Masuk sebagai <b>${document.getElementById("userEmail")?.textContent || "-"}</b>. Penambahan/penghapusan akun admin dikelola langsung dari Supabase Dashboard (Authentication → Users), bukan dari halaman ini.</p>
    </div>
  `;
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
// ---------------------------------------------------------------------
gotoTab("beranda");
