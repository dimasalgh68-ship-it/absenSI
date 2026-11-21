import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Camera, Users, ClipboardList, BarChart3, BookOpen } from 'lucide-react';
import AbsenPage from './pages/AbsenPage';
import DaftarPage from './pages/DaftarPage';
import RekapPage from './pages/RekapPage';
import DashboardPage from './pages/DashboardPage';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <BookOpen size={28} />
            <div>
              <div className="brand-title">AbsenSI</div>
              <div className="brand-sub">Sistem Absensi Selfie</div>
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
            <NavLink to="/rekap" className={({isActive}) => `nav-item ${isActive?'active':''}`}>
              <ClipboardList size={20} /> Rekap Kehadiran
            </NavLink>
          </nav>
          <div className="sidebar-footer">
            <div className="status-dot"></div>
            <span>Server aktif</span>
          </div>
        </aside>

        {/* Main */}
        <main className="main">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/absen" element={<AbsenPage />} />
            <Route path="/daftar" element={<DaftarPage />} />
            <Route path="/rekap" element={<RekapPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
