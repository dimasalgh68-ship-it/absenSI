// src/utils/exportExcel.js
// Export kehadiran ke file .xlsx menggunakan ExcelJS
// 2 sheet: "Kehadiran Harian" + "Rekapitulasi Per Murid"

import ExcelJS from 'exceljs';

const PURPLE = '4F46E5';
const GREEN  = '16A34A';
const YELLOW = 'CA8A04';
const RED    = 'DC2626';
const GRAY   = 'F1F5F9';
const DARK   = '1E293B';
const WHITE  = 'FFFFFF';

function headerFont(color = WHITE) {
  return { name: 'Calibri', bold: true, size: 11, color: { argb: `FF${color}` } };
}
function normalFont(color = DARK) {
  return { name: 'Calibri', size: 10, color: { argb: `FF${color}` } };
}
function thinBorder() {
  const s = { style: 'thin', color: { argb: 'FFE2E8F0' } };
  return { top: s, left: s, bottom: s, right: s };
}
function center() { return { vertical: 'middle', horizontal: 'center', wrapText: true }; }
function left()   { return { vertical: 'middle', horizontal: 'left',   wrapText: true }; }

// ─── Baris judul besar ───────────────────────────────────────
function addTitle(ws, totalCols, title, subtitle) {
  // Baris 1: logo text + judul
  ws.mergeCells(1, 1, 1, totalCols);
  const r1 = ws.getRow(1);
  r1.height = 36;
  const c1 = ws.getCell('A1');
  c1.value = title;
  c1.font  = { name: 'Calibri', bold: true, size: 18, color: { argb: `FF${PURPLE}` } };
  c1.alignment = center();
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };

  // Baris 2: subjudul
  ws.mergeCells(2, 1, 2, totalCols);
  const c2 = ws.getCell('A2');
  c2.value = subtitle;
  c2.font  = normalFont('64748B');
  c2.alignment = center();
  c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };

  ws.getRow(2).height = 20;
  // Baris 3 kosong sebagai spacer
  ws.getRow(3).height = 8;
}

// ─── SHEET 1: Kehadiran Harian ───────────────────────────────
function buildSheetHarian(wb, records, date, kelas) {
  const ws = wb.addWorksheet('Kehadiran Harian', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait' },
  });

  const cols = [
    { key: 'no',      header: 'No.',        width: 5  },
    { key: 'name',    header: 'Nama Murid', width: 28 },
    { key: 'nis',     header: 'NIS',        width: 14 },
    { key: 'kelas',   header: 'Kelas',      width: 10 },
    { key: 'date',    header: 'Tanggal',    width: 14 },
    { key: 'time',    header: 'Waktu Absen',width: 14 },
    { key: 'conf',    header: 'Confidence', width: 14 },
    { key: 'status',  header: 'Status',     width: 14 },
  ];
  ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

  const dateLabel = new Date(date).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const kelasLabel = kelas ? `Kelas ${kelas}` : 'Semua Kelas';
  addTitle(ws, cols.length, '📋 Laporan Kehadiran Murid', `${dateLabel} · ${kelasLabel} · AbsenSI`);

  // ── Header kolom (baris 4) ──
  const hRow = ws.getRow(4);
  hRow.height = 28;
  cols.forEach((c, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value     = c.header;
    cell.font      = headerFont();
    cell.alignment = center();
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${PURPLE}` } };
    cell.border    = thinBorder();
  });

  // ── Data ──
  records.forEach((r, idx) => {
    const conf = r.confidence || null;
    const confLabel = conf ? `${conf}%` : '—';
    const confColor = conf >= 80 ? GREEN : conf >= 60 ? YELLOW : RED;

    const row = ws.addRow({
      no:     idx + 1,
      name:   r.studentName || '—',
      nis:    r.studentId   || '—',
      kelas:  r.kelas       || '—',
      date:   r.date,
      time:   r.time,
      conf:   confLabel,
      status: '✅ Hadir',
    });
    row.height = 22;
    const isEven = idx % 2 === 1;

    row.eachCell((cell, colNo) => {
      cell.font      = normalFont();
      cell.border    = thinBorder();
      cell.alignment = colNo === 2 ? left() : center();
      if (isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });

    // Warna confidence
    const confCell = row.getCell(7);
    confCell.font = { ...normalFont(confColor), bold: true };

    // Status hijau
    const statusCell = row.getCell(8);
    statusCell.font = { ...normalFont(GREEN), bold: true };
  });

  // ── Baris ringkasan bawah ──
  ws.addRow([]);
  const sumRow = ws.addRow(['', `Total hadir: ${records.length} murid`, '', '', '', '', '', '']);
  sumRow.height = 20;
  sumRow.getCell(2).font = { name: 'Calibri', bold: true, size: 10, color: { argb: `FF${GREEN}` } };

  // ── Print area & header/footer ──
  ws.headerFooter.oddHeader = `&C&B&14 Laporan Kehadiran AbsenSI`;
  ws.headerFooter.oddFooter = `&L${dateLabel}&R&P / &N`;

  return ws;
}

// ─── SHEET 2: Rekapitulasi Per Murid ─────────────────────────
function buildSheetRekap(wb, summary, allRecords) {
  const ws = wb.addWorksheet('Rekapitulasi Per Murid', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  const cols = [
    { key: 'no',       header: 'No.',              width: 5  },
    { key: 'name',     header: 'Nama Murid',        width: 28 },
    { key: 'nis',      header: 'NIS',               width: 14 },
    { key: 'kelas',    header: 'Kelas',             width: 10 },
    { key: 'total',    header: 'Total Hadir',       width: 14 },
    { key: 'last',     header: 'Terakhir Hadir',    width: 18 },
    { key: 'avgConf',  header: 'Rata-rata Conf.',   width: 16 },
    { key: 'grade',    header: 'Predikat',          width: 14 },
  ];
  ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

  const now = new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
  addTitle(ws, cols.length, '📊 Rekapitulasi Kehadiran Per Murid', `Dicetak: ${now} · AbsenSI`);

  // Header
  const hRow = ws.getRow(4);
  hRow.height = 28;
  cols.forEach((c, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value     = c.header;
    cell.font      = headerFont();
    cell.alignment = center();
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.border    = thinBorder();
  });

  // Hitung rata-rata confidence per murid
  const confMap = {};
  allRecords.forEach(r => {
    if (!confMap[r.studentId]) confMap[r.studentId] = [];
    if (r.confidence) confMap[r.studentId].push(r.confidence);
  });

  summary.forEach((s, idx) => {
    const confs = confMap[s.studentId] || [];
    const avg = confs.length ? Math.round(confs.reduce((a,b)=>a+b,0)/confs.length) : null;
    const grade = s.totalHadir >= 20 ? '⭐ Sangat Rajin'
                : s.totalHadir >= 10 ? '✅ Rajin'
                : s.totalHadir >= 5  ? '⚠️ Cukup'
                : '❌ Kurang';
    const gradeColor = s.totalHadir >= 20 ? PURPLE
                     : s.totalHadir >= 10 ? GREEN
                     : s.totalHadir >= 5  ? YELLOW : RED;

    const row = ws.addRow({
      no:      idx + 1,
      name:    s.name,
      nis:     s.studentId,
      kelas:   s.kelas || '—',
      total:   s.totalHadir,
      last:    s.lastHadir || '—',
      avgConf: avg ? `${avg}%` : '—',
      grade,
    });
    row.height = 22;
    const isEven = idx % 2 === 1;

    row.eachCell((cell, colNo) => {
      cell.font      = normalFont();
      cell.border    = thinBorder();
      cell.alignment = colNo === 2 ? left() : center();
      if (isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });

    // Warna total hadir
    row.getCell(5).font = { name: 'Calibri', bold: true, size: 11, color: { argb: `FF${PURPLE}` } };
    // Warna predikat
    row.getCell(8).font = { name: 'Calibri', bold: true, size: 10, color: { argb: `FF${gradeColor}` } };
  });

  ws.headerFooter.oddHeader = `&C&B&14 Rekapitulasi Kehadiran AbsenSI`;
  ws.headerFooter.oddFooter = `&L${now}&R&P / &N`;
}

// ─── MAIN EXPORT FUNCTION ────────────────────────────────────
export async function exportExcel({ records, summary, allRecords, date, kelas }) {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'AbsenSI';
  wb.created  = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  buildSheetHarian(wb, records, date, kelas);
  buildSheetRekap(wb, summary, allRecords);

  // Generate buffer & download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Absensi_${date}${kelas ? `_Kelas${kelas}` : ''}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
