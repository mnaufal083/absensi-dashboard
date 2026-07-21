// =====================================================================
// dashboard.js — semua logic tab & panggilan API dashboard absensi
// =====================================================================
const content = document.getElementById("content");

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
let pendingChanges = {}; // key: `${record_table}:${record_id}:${field}` -> {record_table, record_id, field, nilai_baru}
let currentBatchId = null;

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

    <div style="display:flex;gap:10px;margin-top:6px">
      <button class="btn-primer" onclick="gotoTab('proses')">Proses batch baru ↗</button>
      <button class="btn-sekunder" onclick="gotoTab('riwayat')">Lihat riwayat batch</button>
    </div>
  `;
}

function formatWaktu(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------
// PROSES BATCH BARU
// ---------------------------------------------------------------------
function renderProses() {
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
    <label style="font-size:12.5px;color:var(--teks-sekunder);display:block;margin-bottom:5px;font-weight:600">Nama Bidang untuk batch ini</label>
    <input type="text" id="inputBidang" placeholder="mis. Pidmil (kosongkan untuk deteksi campuran)" style="width:100%;margin-bottom:16px" />
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
          <span>${r.nama}</span><span>${r.nip}</span><span>${r.tanggal}</span>
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
        <div class="tabel-header-baris" style="grid-template-columns:1.6fr 1fr 1.3fr 1fr 0.6fr">
          <span>BATCH</span><span>BIDANG</span><span>PERIODE ABSENSI</span><span>STATUS</span><span></span>
        </div>
        ${grup.batches
          .map(
            (b) => `<div class="tabel-baris" style="grid-template-columns:1.6fr 1fr 1.3fr 1fr 0.6fr" onclick="bukaDetailBatch('${b.id}')">
            <span>${b.label} · ${b.jumlah_pegawai} pegawai</span>
            <span>${b.nama_bidang || "-"}</span>
            <span style="color:var(--teks-sekunder)">${formatPeriode(b.periode_awal, b.periode_akhir)}</span>
            <span class="badge ${b.status === "final" ? "badge-final" : "badge-draf"}">${b.status === "final" ? "Final" : "Draf"}</span>
            <span style="color:var(--kuning-status-teks);font-weight:600">Buka →</span>
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
  const [detail, keterangan] = await Promise.all([
    api(`/api/batches/${batchId}`),
    ambilDaftarKeterangan(),
  ]);
  renderDetailBatch(detail, keterangan);
}

function renderDetailBatch(detail, keterangan) {
  const b = detail.batch;
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <p style="font-size:16px;font-weight:700;margin:0" class="judul-serif">${b.label}</p>
        <p style="font-size:12px;color:var(--teks-sekunder);margin:3px 0 0">${b.jumlah_pegawai} pegawai · ${b.nama_bidang || "campuran"} · periode ${formatPeriode(b.periode_awal, b.periode_akhir)} · ${detail.berkas_bermasalah.length} berkas bermasalah</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-sekunder" onclick="gotoTab('riwayat')">← Semua batch</button>
        <button class="btn-sekunder" onclick="hapusBatch('${b.id}')" style="color:var(--merah-teks);border-color:#E8B8A8">Hapus batch</button>
      </div>
    </div>

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
    <div id="savedBar" class="banner-success" style="display:none">✓ Perubahan tersimpan</div>

    <div id="sub-harian"></div>
    <div id="sub-ringkasan" style="display:none"></div>
    <div id="sub-log" style="display:none"></div>

    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
      <button class="btn-sekunder" onclick="ubahStatusBatch('${b.id}', '${b.status === "final" ? "draft" : "final"}')">
        ${b.status === "final" ? "Tandai Draf lagi" : "Tandai Final (siap unduh)"}
      </button>
      <button class="btn-primer" onclick="unduhBatch('${b.id}')">⬇ Unduh Excel</button>
    </div>
  `;

  renderTabelHarian(detail.attendance, keterangan);
  renderTabelRingkasan(detail.ringkasan);
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

function renderTabelHarian(rows, keterangan) {
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

  const html = Array.from(grup.values())
    .map((g, gi) => {
      const jumlahEdit = g.baris.filter((r) => r.is_edited).length;
      const kataKunci = `${g.nama} ${g.nip}`.toLowerCase();
      return `
      <div data-grup-pegawai="${kataKunci}" style="border:0.5px solid var(--kartu-tepi);border-radius:10px;margin-bottom:8px;overflow:hidden;background:#fff">
        <button type="button" class="grup-toggle" data-grup-index="${gi}"
          style="width:100%;display:flex;justify-content:space-between;align-items:center;background:#fff;border:none;padding:12px 16px;text-align:left;cursor:pointer">
          <span style="font-size:13px;font-weight:600;color:var(--teks-utama)">
            <span class="grup-panah" style="display:inline-block;transition:transform .15s;margin-right:8px">▸</span>
            ${g.nama} <span style="font-weight:400;color:var(--teks-sekunder)">· NIP ${g.nip || "-"}</span>
          </span>
          <span style="font-size:12px;color:var(--teks-muted)">${g.baris.length} hari${jumlahEdit ? ` · ${jumlahEdit} diedit` : ""}</span>
        </button>
        <div class="grup-isi" id="grup-isi-${gi}" style="display:none;border-top:0.5px solid var(--kartu-tepi)">
          <div class="tabel-header-baris" style="grid-template-columns:0.8fr 1fr 1fr 1.3fr 1fr">
            <span>TANGGAL</span><span>JAM MASUK</span><span>JAM KELUAR</span><span>KETERANGAN</span><span>TELAT</span>
          </div>
          ${g.baris
            .map(
              (r) => `<div class="tabel-baris ${r.is_edited ? "diedit" : ""}" style="grid-template-columns:0.8fr 1fr 1fr 1.3fr 1fr" data-record-id="${r.id}">
              <span style="color:var(--teks-sekunder)">${r.tanggal}</span>
              <input class="edit-field" data-tabel="attendance_records" data-record="${r.id}" data-field="jam_masuk" value="${r.jam_masuk || ""}" />
              <input class="edit-field" data-tabel="attendance_records" data-record="${r.id}" data-field="jam_keluar" value="${r.jam_keluar || ""}" />
              <select class="edit-field" data-tabel="attendance_records" data-record="${r.id}" data-field="keterangan">${optionsKeterangan(keterangan, r.keterangan)}</select>
              <input class="edit-field" data-tabel="attendance_records" data-record="${r.id}" data-field="datang_telat" value="${r.datang_telat || ""}" placeholder="-" />
            </div>`
            )
            .join("")}
        </div>
      </div>`;
    })
    .join("");

  wrap.innerHTML = `
    <p style="font-size:11.5px;color:var(--teks-muted);margin:0 0 12px">${grup.size} pegawai · klik nama untuk membuka rincian harian · baris hijau menandai data yang sudah pernah dikoreksi</p>
    ${html}
  `;

  wrap.querySelectorAll(".grup-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const isi = document.getElementById(`grup-isi-${btn.dataset.grupIndex}`);
      const panah = btn.querySelector(".grup-panah");
      const terbuka = isi.style.display === "block";
      isi.style.display = terbuka ? "none" : "block";
      panah.style.transform = terbuka ? "rotate(0deg)" : "rotate(90deg)";
    });
  });

  pasangListenerEdit(wrap);
}

function renderTabelRingkasan(rows) {
  const wrap = document.getElementById("sub-ringkasan");
  if (!rows.length) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ada ringkasan.</p>`;
    return;
  }
  wrap.innerHTML = `
    <div class="tabel-wrap" style="min-width:680px;margin-bottom:6px">
      <div class="tabel-header-baris" style="grid-template-columns:1.4fr 0.8fr 0.8fr 0.8fr 0.8fr 1.4fr">
        <span>NAMA</span><span>TERLAMBAT</span><span>SAKIT</span><span>IZIN</span><span>ALPHA</span><span>RINCIAN CUTI</span>
      </div>
      ${rows
        .map(
          (r) => `<div class="tabel-baris ${r.is_edited ? "diedit" : ""}" style="grid-template-columns:1.4fr 0.8fr 0.8fr 0.8fr 0.8fr 1.4fr" data-record-id="${r.id}" data-grup-pegawai="${(r.nama + " " + (r.nip || "")).toLowerCase()}">
          <span>${r.nama}</span>
          <input class="edit-field" type="number" min="0" data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="terlambat" value="${r.terlambat || 0}" />
          <input class="edit-field" type="number" min="0" data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="sakit" value="${r.sakit || 0}" />
          <input class="edit-field" type="number" min="0" data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="izin" value="${r.izin || 0}" />
          <input class="edit-field" type="number" min="0" data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="alpha" value="${r.alpha || 0}" />
          <input class="edit-field" data-tabel="ringkasan_pegawai" data-record="${r.id}" data-field="rincian_cuti" value="${r.rincian_cuti || ""}" />
        </div>`
        )
        .join("")}
    </div>
  `;
  pasangListenerEdit(wrap);
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
      el.closest("[data-record-id]").classList.add("diedit");
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
  if (statusBaru === "final") {
    await api(`/api/batches/${batchId}/final`, { method: "POST" });
  }
  // Catatan: endpoint untuk kembali ke draf belum ada di app.py contoh ini;
  // tambahkan route serupa /api/batches/<id>/draf jika dibutuhkan.
  bukaDetailBatch(batchId);
}

function unduhBatch(batchId) {
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
    <div id="riwayatPegawai" style="margin-top:16px"></div>
  `;
  let timer;
  document.getElementById("inputCari").addEventListener("input", (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    timer = setTimeout(async () => {
      if (q.length < 2) {
        document.getElementById("hasilCari").innerHTML = "";
        return;
      }
      const hasil = await api(`/api/cari-pegawai?q=${encodeURIComponent(q)}`);
      document.getElementById("hasilCari").innerHTML = hasil.length
        ? hasil
            .map(
              (h) => `<div class="kartu" style="cursor:pointer;margin-bottom:8px" onclick="lihatRiwayatPegawai('${h.nip}')">
              <b>${h.nama}</b><br/><span style="font-size:12px;color:var(--teks-sekunder)">NIP ${h.nip} · ${h.sub_unit_kerja || "-"}</span>
            </div>`
            )
            .join("")
        : `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ditemukan.</p>`;
    }, 350);
  });
}

async function lihatRiwayatPegawai(nip) {
  const riwayat = await api(`/api/riwayat-pegawai/${encodeURIComponent(nip)}`);
  const wrap = document.getElementById("riwayatPegawai");
  if (!riwayat.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = `
    <p style="font-size:13px;font-weight:700;margin:0 0 8px">Riwayat ${riwayat[0].nama} di ${riwayat.length} batch</p>
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
  `;
}

// ---------------------------------------------------------------------
// VISUALISASI (ringkas, dihitung dari daftar batch yang sudah dimuat)
// ---------------------------------------------------------------------
const PALET_KETERANGAN = ["#1B3B2C", "#C9A24D", "#B5472E", "#5C7A64", "#7F77DD", "#3B7DBF", "#8A8060"];

async function renderVisualisasi() {
  const [batches, viz] = await Promise.all([api("/api/batches"), api("/api/visualisasi")]);

  content.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 14px" class="judul-serif">Visualisasi</p>

    <div class="kartu">
      <p class="stat-label" style="font-weight:600;margin-bottom:12px">Komposisi Keterangan (seluruh batch)</p>
      <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
        <div id="donutChart"></div>
        <div id="donutLegend" style="flex:1;min-width:180px"></div>
      </div>
    </div>

    <div class="kartu">
      <p class="stat-label" style="font-weight:600;margin-bottom:6px">Tren Kehadiran per Bulan</p>
      <div style="display:flex;gap:14px;font-size:11.5px;color:var(--teks-sekunder);margin-bottom:4px">
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#B5472E;margin-right:4px"></span>Alpha</span>
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#C9A24D;margin-right:4px"></span>Sakit</span>
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#5C7A64;margin-right:4px"></span>Terlambat</span>
      </div>
      <div id="trenBulanan"></div>
    </div>

    <div class="kartu">
      <p class="stat-label" style="font-weight:600;margin-bottom:2px">Rekapitulasi Ketidakhadiran Tanpa Keterangan (Alpha)</p>
      <p style="font-size:11.5px;color:var(--teks-muted);margin:0 0 10px">Diurutkan berdasarkan jumlah hari, dijumlah dari seluruh batch yang tercatat</p>
      <div id="rankingAlpha"></div>
    </div>

    <div class="kartu">
      <p class="stat-label" style="font-weight:600;margin-bottom:2px">Rekapitulasi Keterlambatan Masuk Kerja</p>
      <p style="font-size:11.5px;color:var(--teks-muted);margin:0 0 10px">Diurutkan berdasarkan jumlah hari, dijumlah dari seluruh batch yang tercatat</p>
      <div id="rankingTerlambat"></div>
    </div>

    <div class="kartu">
      <p class="stat-label" style="font-weight:600">Pegawai terekap per Bidang</p>
      <div id="barPerBidang" style="margin-top:10px"></div>
    </div>
  `;

  renderDonutKeterangan(viz.keterangan);
  renderTrenBulananGaris(viz.tren_bulanan);
  renderTabelRekap("rankingAlpha", viz.ranking_alpha);
  renderTabelRekap("rankingTerlambat", viz.ranking_terlambat);
  renderBarPerBidang(batches);
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
    <svg width="130" height="130" viewBox="0 0 120 120" style="transform:rotate(-90deg)">${lingkaran}</svg>
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
      item.style.backgroundColor = "var(--krem)";
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

function renderTrenBulananGaris(data) {
  const wrap = document.getElementById("trenBulanan");
  if (!data.length) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Belum ada batch dengan periode yang tercatat.</p>`;
    return;
  }

  const lebar = 640, tinggi = 220, kiri = 30, kanan = 20, atas = 16, bawah = 30;
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
    { kunci: "alpha", warna: "#B5472E", label: "Alpha" },
    { kunci: "sakit", warna: "#C9A24D", label: "Sakit" },
    { kunci: "terlambat", warna: "#5C7A64", label: "Terlambat" },
  ];

  const garisGrid = [0.25, 0.5, 0.75, 1]
    .map((f) => `<line x1="${kiri}" y1="${atas + areaTinggi * (1 - f)}" x2="${lebar - kanan}" y2="${atas + areaTinggi * (1 - f)}" stroke="var(--kartu-tepi)" stroke-width="1" />`)
    .join("");

  const garisSeri = seri
    .map((s) => {
      const nilai = data.map((d) => d[s.kunci]);
      const titik = nilai.map((v, i) => posisi(v, i));
      const lingkaran = titik
        .map(
          (t, i) => `<circle class="titik-data" cx="${t.x}" cy="${t.y}" r="4" fill="${s.warna}" stroke="#fff" stroke-width="1.5" style="transform-box:fill-box;transform-origin:center;transition:transform .15s">
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
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--teks-muted);font-style:italic">Tidak ada catatan pada periode ini.</p>`;
    return;
  }
  wrap.innerHTML = `
    <div class="tabel-wrap">
      <div class="tabel-header-baris" style="grid-template-columns:0.5fr 2fr 1fr">
        <span>NO</span><span>NAMA PEGAWAI</span><span style="text-align:right">JUMLAH HARI</span>
      </div>
      ${data
        .map(
          (d, i) => `<div class="tabel-baris" style="grid-template-columns:0.5fr 2fr 1fr">
          <span style="color:var(--teks-muted)">${i + 1}</span>
          <span>${d.nama}</span>
          <span style="text-align:right;font-weight:600">${d.jumlah}</span>
        </div>`
        )
        .join("")}
    </div>
  `;
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
      <div style="flex:1;background:var(--krem);border-radius:3px;height:10px">
        <div style="width:${(jumlah / maxNilai) * 100}%;height:100%;background:var(--emas);border-radius:3px"></div>
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
async function renderPengaturan() {
  const list = await api("/api/keterangan");
  daftarKeteranganCache = list;
  content.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 14px" class="judul-serif">Pengaturan</p>
    <div class="kartu">
      <p class="stat-label" style="font-weight:600;margin-bottom:10px">Daftar Keterangan (dropdown)</p>
      <div id="daftarKeteranganList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
        ${list
          .map(
            (k) => `<div style="display:flex;justify-content:space-between;align-items:center;border:0.5px solid var(--kartu-tepi);border-radius:8px;padding:8px 12px">
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
  `;
}

async function tambahKeterangan() {
  const input = document.getElementById("inputKeteranganBaru");
  const label = input.value.trim();
  if (!label) return;
  await api("/api/keterangan", { method: "POST", body: JSON.stringify({ label }) });
  renderPengaturan();
}

async function hapusKeterangan(id) {
  if (!confirm("Hapus keterangan ini dari daftar dropdown?")) return;
  await api(`/api/keterangan/${id}`, { method: "DELETE" });
  daftarKeteranganCache = null;
  renderPengaturan();
}

// ---------------------------------------------------------------------
// INISIALISASI
// ---------------------------------------------------------------------
gotoTab("beranda");
