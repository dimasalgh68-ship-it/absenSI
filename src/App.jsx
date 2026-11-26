import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { Camera, Users, ClipboardList, BarChart3, BookOpen, GraduationCap, Settings, Tv, LogOut, Loader } from 'lucide-react';
import { getSettings, checkAuthMe, logoutAdmin } from './api';
import AbsenPage from './pages/AbsenPage';
import DaftarPage from './pages/DaftarPage';
import RekapPage from './pages/RekapPage';
import DashboardPage from './pages/DashboardPage';
import KelasPage from './pages/KelasPage';
import SettingsPage from './pages/SettingsPage';
import TvKioskPage from './pages/TvKioskPage';
import LoginPage from './pages/LoginPage';
import './App.css';

function DashboardLayout({ children, onLogout }) {
  const [schoolInfo, setSchoolInfo] = useState({
    schoolName: 'AbsenSI',
    academicYear: '2026/2027',
    semester: 'Ganjil',
  });

  useEffect(() => {
    getSettings().then(s => {
      if (s) setSchoolInfo(prev => ({ ...prev, ...s }));
    }).catch(() => {});

    const handleUpdate = (e) => {
      if (e.detail) setSchoolInfo(prev => ({ ...prev, ...e.detail }));
    };
    window.addEventListener('settingsUpdated', handleUpdate);
    return () => window.removeEventListener('settingsUpdated', handleUpdate);
  }, []);

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BookOpen size={28} />
          <div>
            <div className="brand-title" style={{fontSize:'1.05rem', lineHeight:1.2}}>
              {schoolInfo.schoolName || 'AbsenSI'}
            </div>
            <div className="brand-sub">
              {schoolInfo.academicYear} · Sem. {schoolInfo.semester}
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({isActive}) => `nav-item ${isActive?'active':''}`}>
            <BarChart3 size={20} /> Dashboard
          </NavLink>
          <NavLink to="/absen" className={({isActive}) => `nav-item ${isActive?'active':''}`}>
            <Camera size={20} /> Absensi Selfie
          </NavLink>
          <NavLink to="/daftar" className={({isActive}) => `nav-item ${isActive?'active':''}`}>
            <Users size={20} /> Daftar Murid
          </NavLink>
          <NavLink to="/kelas" className={({isActive}) => `nav-item ${isActive?'active':''}`}>
            <GraduationCap size={20} /> Daftar Kelas
          </NavLink>
          <NavLink to="/rekap" className={({isActive}) => `nav-item ${isActive?'active':''}`}>
            <ClipboardList size={20} /> Rekap Kehadiran
          </NavLink>
          <NavLink to="/pengaturan" className={({isActive}) => `nav-item ${isActive?'active':''}`}>
            <Settings size={20} /> Pengaturan
          </NavLink>

          <div style={{margin: '12px 0 8px 0', borderTop: '1px solid rgba(255,255,255,0.1)'}}></div>

          <NavLink to="/tv" className="nav-item nav-tv-highlight" title="Buka Mode Layar TV Kiosk">
            <Tv size={20} />
            <span style={{flex:1}}>Mode Layar TV</span>
            <span className="badge-tv">Kiosk</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer" style={{flexDirection:'column', alignItems:'stretch', gap:8}}>
          <button
            onClick={onLogout}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              width:'100%', padding:'8px 10px', borderRadius:8,
              background:'rgba(239, 68, 68, 0.12)', border:'1px solid rgba(239, 68, 68, 0.25)',
              color:'#f87171', fontSize:'0.82rem', fontWeight:600, cursor:'pointer'
            }}
            title="Kunci dashboard & keluar"
          >
            <LogOut size={15} /> Keluar (Kunci)
          </button>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div className="status-dot"></div>
            <span>Server aktif</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [adminUser, setAdminUser] = useState(null);

  useEffect(() => {
    checkAuthMe()
      .then(res => {
        if (res.authenticated && res.user) setAdminUser(res.user);
      })
      .catch(() => {})
      .finally(() => setAuthChecking(false));
  }, []);

  async function handleLogout() {
    await logoutAdmin();
    setAdminUser(null);
    toast.success('Anda telah keluar. Dashboard terkunci.');
  }

  function Protected({ children }) {
    if (authChecking) {
      return (
        <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f172a', color:'#fff', gap:10}}>
          <Loader size={24} className="spin" /> Memeriksa sesi admin...
        </div>
      );
    }
    if (!adminUser) {
      return <LoginPage onLoginSuccess={(u) => setAdminUser(u)} />;
    }
    return <DashboardLayout onLogout={handleLogout}>{children}</DashboardLayout>;
  }

  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      <Routes>
        {/* Halaman Khusus TV Kiosk — TERBUKA UNTUK MURID, TANPA LOGIN & TANPA SIDEBAR */}
        <Route path="/tv" element={<TvKioskPage />} />
        <Route path="/kiosk" element={<TvKioskPage />} />

        {/* Halaman Admin dengan Auth & Sidebar Dashboard */}
        <Route path="/" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/absen" element={<Protected><AbsenPage /></Protected>} />
        <Route path="/daftar" element={<Protected><DaftarPage /></Protected>} />
        <Route path="/kelas" element={<Protected><KelasPage /></Protected>} />
        <Route path="/rekap" element={<Protected><RekapPage /></Protected>} />
        <Route path="/pengaturan" element={<Protected><SettingsPage /></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}
