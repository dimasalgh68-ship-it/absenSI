import { useEffect, useState } from 'react';
import { ClipboardList, Download, Filter, FileSpreadsheet, Loader } from 'lucide-react';
import { getAttendance, getStudents, getSummary } from '../api';
import { exportExcel } from '../utils/exportExcel';
import toast from 'react-hot-toast';

function today() { return new Date().toISOString().slice(0, 10); }

export default function RekapPage() {
  const [date, setDate]           = useState(today());
  const [kelas, setKelas]         = useState('');
  const [records, setRecords]     = useState([]);
  const [kelasList, setKelasList] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getStudents().then(s => {
      setKelasList([...new Set(s.map(x => x.kelas).filter(Boolean))]);
    });
  }, []);

  useEffect(() => { fetchData(); }, [date, kelas]);

  async function fetchData() {
    try { setRecords(await getAttendance(date, kelas)); } catch {}
  }

  async function handleExportExcel() {
    if (records.length === 0) return toast.error('Tidak ada data untuk diekspor');
    setExporting(true);
    const tid = toast.loading('Menyiapkan file Excel...');
    try {
      // Ambil semua rekap untuk sheet ke-2
      const [summary, allRecords] = await Promise.all([
        getSummary(),
        getAttendance(), // semua tanggal, semua kelas
      ]);
      await exportExcel({ records, summary, allRecords, date, kelas });
      toast.success('✅ File Excel berhasil diunduh!', { id: tid });
    } catch (e) {
      console.error(e);
      toast.error('Gagal mengekspor: ' + e.message, { id: tid });
    }
    setExporting(false);
  }

  // Stat ringkasan
  const totalHadir   = records.length;
  const avgConf      = records.filter(r => r.confidence).length
    ? Math.round(records.filter(r => r.confidence).reduce((a, r) => a + r.confidence, 0) / records.filter(r => r.confidence).length)
    : null;
  const kelasStat    = [...new Set(records.map(r => r.kelas).filter(Boolean))];

  return (
    <div className="page">
      <div className="page-header">
        <h1><ClipboardList size={28} /> Rekap Kehadiran</h1>
        <p className="page-desc">Lihat, filter, dan ekspor data kehadiran murid ke Excel.</p>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <Filter size={18} className="filter-icon" />
        <input
          type="date"
          className="form-input filter-date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <select
          className="form-input filter-select"
          value={kelas}
          onChange={e => setKelas(e.target.value)}
        >
          <option value="">Semua Kelas</option>
          {kelasList.map(k => <option key={k}>{k}</option>)}
        </select>
        <div className="export-group">
          <button
            className="btn btn-excel"
            onClick={handleExportExcel}
            disabled={records.length === 0 || exporting}
          >
            {exporting
              ? <><Loader size={16} className="spin" /> Mengekspor...</>
              : <><FileSpreadsheet size={16} /> Export Excel</>}
          </button>
        </div>
      </div>

      {/* Stat cards mini */}
      {records.length > 0 && (
        <div className="rekap-stats">
          <div className="rekap-stat-card">
            <div className="rekap-stat-val">{totalHadir}</div>
            <div className="rekap-stat-label">Murid Hadir</div>
          </div>
          <div className="rekap-stat-card">
            <div className="rekap-stat-val">{avgConf ? `${avgConf}%` : '—'}</div>
            <div className="rekap-stat-label">Rata-rata Confidence</div>
          </div>
          <div className="rekap-stat-card">
            <div className="rekap-stat-val">{kelasStat.length}</div>
            <div className="rekap-stat-label">Kelas Terwakili</div>
          </div>
          <div className="rekap-stat-card">
            <div className="rekap-stat-val">
              {records.filter(r => r.confidence >= 80).length}
            </div>
            <div className="rekap-stat-label">Conf. Tinggi (≥80%)</div>
          </div>
        </div>
      )}

      {/* Tabel */}
      <div className="table-wrap">
        {records.length === 0 ? (
          <div className="empty-state">
            <FileSpreadsheet size={40} style={{opacity:0.3, marginBottom:12}} />
            <div>Tidak ada data kehadiran untuk filter ini</div>
          </div>
        ) : (
          <>
            <div className="table-info">
              <span>{records.length} murid hadir</span>
              <span className="tinfo-sep">·</span>
              <span>{new Date(date).toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</span>
              {kelas && <><span className="tinfo-sep">·</span><span>Kelas {kelas}</span></>}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Foto</th>
                  <th>Nama Murid</th>
                  <th>NIS</th>
                  <th>Kelas</th>
                  <th>Waktu</th>
                  <th>Confidence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id}>
                    <td className="text-center text-sm text-muted">{i + 1}</td>
                    <td>
                      {r.photo
                        ? <img src={r.photo} alt="" className="thumb" />
                        : <div className="thumb-placeholder">{r.studentName?.[0]}</div>}
                    </td>
                    <td className="fw">{r.studentName}</td>
                    <td className="text-muted">{r.studentId}</td>
                    <td><span className="chip">{r.kelas || '—'}</span></td>
                    <td className="text-center">{r.time}</td>
                    <td className="text-center">
                      {r.confidence
                        ? <span className={`confidence ${r.confidence >= 80 ? 'high' : r.confidence >= 60 ? 'mid' : 'low'}`}>
                            {r.confidence}%
                          </span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-center">
                      <span className="status-hadir">✅ Hadir</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
