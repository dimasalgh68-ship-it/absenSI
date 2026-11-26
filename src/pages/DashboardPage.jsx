import { useEffect, useState } from 'react';
import { Users, CheckCircle, Calendar, TrendingUp, Clock, School } from 'lucide-react';
import { getStudents, getAttendance, getSummary, getSettings } from '../api';

function today() { return new Date().toISOString().slice(0, 10); }

export default function DashboardPage() {
  const [stats, setStats] = useState({ students: 0, hadirHariIni: 0, totalHadir: 0, terlambat: 0 });
  const [recentAbsen, setRecentAbsen] = useState([]);
  const [summary, setSummary] = useState([]);
  const [settings, setSettings] = useState({
    schoolName: 'SMA Negeri 1 Indonesia',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    jamMasuk: '07:00',
    jamTerlambat: '07:30',
    jamPulang: '14:00',
  });

  useEffect(() => {
    async function load() {
      try {
        const [students, attendance, sum, sett] = await Promise.all([
          getStudents(), getAttendance(today()), getSummary(), getSettings().catch(() => null)
        ]);
        const activeSett = sett || settings;
        if (sett) setSettings(prev => ({ ...prev, ...sett }));
        const jamTerlambat = activeSett.jamTerlambat || '07:30';
        const terlambatCount = attendance.filter(a => a.status === 'Terlambat' || ((a.time || '').replace('.', ':') > jamTerlambat)).length;

        setStats({
          students: students.length,
          hadirHariIni: attendance.length,
          totalHadir: sum.reduce((a, s) => a + s.totalHadir, 0),
          terlambat: terlambatCount,
        });
        setRecentAbsen(attendance.slice(0, 5));
        setSummary(sum.slice(0, 8));
      } catch {}
    }
    load();
  }, []);

  const pct = stats.students > 0
    ? Math.round((stats.hadirHariIni / stats.students) * 100)
    : 0;

  return (
    <div className="page">
      <div className="page-header" style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12}}>
        <div>
          <h1>Dashboard</h1>
          <p className="page-desc">
            <School size={14} style={{verticalAlign:'middle', marginRight:4}} />
            <strong>{settings.schoolName}</strong> · TA {settings.academicYear} ({settings.semester}) — {new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        <div style={{
          display:'flex', alignItems:'center', gap:8, fontSize:'0.82rem',
          padding:'6px 12px', borderRadius:10, background:'rgba(59,130,246,0.1)',
          border:'1px solid rgba(59,130,246,0.25)', color:'#60a5fa'
        }}>
          <Clock size={15} />
          <span>Jam Masuk: <strong>{settings.jamMasuk}</strong> · Batas Terlambat: <strong>{settings.jamTerlambat}</strong> · Pulang: <strong>{settings.jamPulang}</strong></span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><Users size={24} /></div>
          <div className="stat-val">{stats.students}</div>
          <div className="stat-label">Total Murid</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={24} /></div>
          <div className="stat-val">{stats.hadirHariIni}</div>
          <div className="stat-label">Hadir Hari Ini</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><Calendar size={24} /></div>
          <div className="stat-val">{stats.totalHadir}</div>
          <div className="stat-label">Total Kehadiran</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><TrendingUp size={24} /></div>
          <div className="stat-val">{pct}%</div>
          <div className="stat-label">Kehadiran Hari Ini</div>
        </div>
      </div>

      {/* Kehadiran bar */}
      <div className="dash-row">
        <div className="dash-card">
          <h3>Kehadiran Hari Ini</h3>
          <div className="progress-wrap">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span>{stats.hadirHariIni} / {stats.students} murid</span>
          </div>

          <h3 style={{marginTop:'24px'}}>Absen Terbaru</h3>
          {recentAbsen.length === 0
            ? <div className="empty-state">Belum ada absensi hari ini</div>
            : recentAbsen.map(r => (
              <div key={r.id} className="recent-item">
                {r.photo
                  ? <img src={r.photo} alt="" className="thumb" />
                  : <div className="thumb-placeholder">{r.studentName?.[0]}</div>}
                <div>
                  <div className="fw">{r.studentName}</div>
                  <div className="text-muted text-sm">Kelas {r.kelas} · {r.time}</div>
                </div>
                <span className="badge-hadir" style={{
                  background: (r.status === 'Terlambat' || ((r.time || '').replace('.', ':') > settings.jamTerlambat)) ? 'rgba(245, 158, 11, 0.15)' : undefined,
                  color: (r.status === 'Terlambat' || ((r.time || '').replace('.', ':') > settings.jamTerlambat)) ? '#f59e0b' : undefined
                }}>
                  {(r.status === 'Terlambat' || ((r.time || '').replace('.', ':') > settings.jamTerlambat)) ? 'Terlambat' : 'Tepat Waktu'}
                </span>
              </div>
            ))}
        </div>

        <div className="dash-card">
          <h3>Rekap Per Murid</h3>
          {summary.length === 0
            ? <div className="empty-state">Belum ada data</div>
            : summary.map(s => (
              <div key={s.studentId} className="summary-item">
                <div className="student-avatar sm">{s.name[0]}</div>
                <div>
                  <div className="fw">{s.name}</div>
                  <div className="text-muted text-sm">Kelas {s.kelas}</div>
                </div>
                <span className="hadir-count">{s.totalHadir}x hadir</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
