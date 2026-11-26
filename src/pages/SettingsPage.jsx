import { useEffect, useState } from 'react';
import { 
  Settings, School, Clock, Camera, Database, Save, 
  Download, Trash2, CheckCircle, AlertTriangle, Volume2, 
  VolumeX, ShieldCheck, RefreshCw, KeyRound 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getSettings, updateSettings, resetAttendance, BACKUP_URL, getSummary, getClasses, changeAdminPassword } from '../api';
import { speakAI, getAvailableVoices } from '../utils/aiVoice';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('umum'); // 'umum', 'waktu', 'ai', 'data'
  const [stats, setStats] = useState({ students: 0, classes: 0, attendance: 0 });
  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '', newUsername: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [voices, setVoices] = useState([]);

  const [form, setForm] = useState({
    schoolName: 'SMA Negeri 1 Indonesia',
    schoolAddress: 'Jl. Merdeka No. 45',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    jamMasuk: '07:00',
    jamTerlambat: '07:30',
    jamPulang: '14:00',
    faceThreshold: 0.5,
    soundEnabled: true,
    aiVoiceEnabled: true,
    aiVoiceName: '',
    aiVoiceRate: 1.0,
    aiVoicePitch: 1.0,
    autoCapture: true,
  });

  useEffect(() => {
    loadSettings();
    const loadVoices = () => setVoices(getAvailableVoices());
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const [s, sum, cls] = await Promise.all([
        getSettings(),
        getSummary().catch(() => []),
        getClasses().catch(() => []),
      ]);
      if (s) setForm(prev => ({ ...prev, ...s }));
      setStats({
        students: Array.isArray(sum) ? sum.length : 0,
        classes: Array.isArray(cls) ? cls.length : 0,
        attendance: Array.isArray(sum) ? sum.reduce((acc, cur) => acc + (cur.totalHadir || 0), 0) : 0,
      });
    } catch {
      toast.error('Gagal memuat pengaturan');
    }
    setLoading(false);
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    if (!form.schoolName.trim()) {
      setActiveTab('umum');
      return toast.error('Nama sekolah wajib diisi');
    }
    if (form.jamMasuk && form.jamTerlambat && form.jamTerlambat < form.jamMasuk) {
      setActiveTab('waktu');
      return toast.error('Batas toleransi terlambat tidak boleh lebih awal dari Jam Masuk');
    }
    setSaving(true);
    try {
      const res = await updateSettings(form);
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: form }));
        try {
          const bc = new BroadcastChannel('absensi_settings');
          bc.postMessage(form);
          bc.close();
        } catch {}
        toast.success('Pengaturan berhasil disimpan & langsung diterapkan!');
      } else {
        toast.error('Gagal menyimpan pengaturan');
      }
    } catch {
      toast.error('Terjadi kesalahan saat menyimpan');
    }
    setSaving(false);
  }

  async function handleResetDefaultSettings() {
    if (!confirm('Kembalikan semua pengaturan ke nilai bawaan (default)?')) return;
    const defaults = {
      schoolName: 'SMA Negeri 1 Indonesia',
      schoolAddress: 'Jl. Merdeka No. 45',
      academicYear: '2026/2027',
      semester: 'Ganjil',
      jamMasuk: '07:00',
      jamTerlambat: '07:30',
      jamPulang: '14:00',
      faceThreshold: 0.5,
      soundEnabled: true,
      aiVoiceEnabled: true,
      aiVoiceName: '',
      aiVoiceRate: 1.0,
      aiVoicePitch: 1.0,
      autoCapture: true,
    };
    setForm(defaults);
    try {
      const res = await updateSettings(defaults);
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: defaults }));
        try {
          const bc = new BroadcastChannel('absensi_settings');
          bc.postMessage(defaults);
          bc.close();
        } catch {}
        toast.success('Pengaturan dikembalikan ke default!');
      }
    } catch {
      toast.error('Gagal mereset pengaturan');
    }
  }

  async function handleResetAttendance(type) {
    const label = type === 'today' ? 'hari ini' : 'SEMUA RIWAYAT';
    if (!confirm(`Apakah Anda yakin ingin menghapus data absensi ${label}? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    try {
      const res = await resetAttendance(type);
      if (res.ok) {
        toast.success(`Data absensi ${label} berhasil direset.`);
        loadSettings();
      }
    } catch {
      toast.error('Gagal mereset data absensi');
    }
  }

  async function handleChangePassword() {
    if (!pwdForm.oldPassword || !pwdForm.newPassword) {
      return toast.error('Masukkan password lama dan password baru');
    }
    setSavingPwd(true);
    try {
      await changeAdminPassword(pwdForm);
      toast.success('Password & akun admin berhasil diperbarui!');
      setPwdForm({ oldPassword: '', newPassword: '', newUsername: '' });
    } catch (err) {
      toast.error(err.message);
    }
    setSavingPwd(false);
  }

  function playSampleBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      toast.success('Suara notifikasi aktif');
    } catch {
      toast('Audio browser aktif');
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="empty-state">
          <RefreshCw className="spin" size={32} />
          <p style={{ marginTop: 12 }}>Memuat pengaturan sistem...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header Halaman */}
      <div className="page-header">
        <h1><Settings size={28} /> Pengaturan Sistem</h1>
        <p className="page-desc">Konfigurasi profil sekolah, jadwal waktu absensi, parameter AI pengenal wajah, dan pencadangan data.</p>
      </div>

      {/* Navigasi Tab Pengaturan */}
      <div className="settings-tabs">
        <button 
          className={`settings-tab-btn ${activeTab === 'umum' ? 'active' : ''}`}
          onClick={() => setActiveTab('umum')}
        >
          <School size={18} /> Profil Sekolah
        </button>
        <button 
          className={`settings-tab-btn ${activeTab === 'waktu' ? 'active' : ''}`}
          onClick={() => setActiveTab('waktu')}
        >
          <Clock size={18} /> Jadwal Absensi
        </button>
        <button 
          className={`settings-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <Camera size={18} /> Kamera & AI Wajah
        </button>
        <button 
          className={`settings-tab-btn ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          <Database size={18} /> Data & Backup
        </button>
      </div>

      {/* Konten Tab */}
      <form onSubmit={handleSave} className="settings-form">
        
        {/* TAB 1: PROFIL SEKOLAH */}
        {activeTab === 'umum' && (
          <div className="settings-card">
            <div className="settings-card-header">
              <School size={22} className="settings-header-icon" />
              <div>
                <h3>Informasi Lembaga & Sekolah</h3>
                <p>Data ini digunakan pada kop laporan export spreadsheet dan dashboard kehadiran.</p>
              </div>
            </div>

            <div className="settings-grid">
              <div className="form-group settings-span-2">
                <label>Nama Sekolah / Institusi *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.schoolName}
                  onChange={e => setForm(f => ({ ...f, schoolName: e.target.value }))}
                  placeholder="Contoh: SMA Negeri 1 Indonesia" 
                  required
                />
              </div>

              <div className="form-group settings-span-2">
                <label>Alamat Sekolah</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.schoolAddress}
                  onChange={e => setForm(f => ({ ...f, schoolAddress: e.target.value }))}
                  placeholder="Contoh: Jl. Pendidikan No. 12, Jakarta" 
                />
              </div>

              <div className="form-group">
                <label>Tahun Ajaran</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.academicYear}
                  onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))}
                  placeholder="Contoh: 2026/2027" 
                />
              </div>

              <div className="form-group">
                <label>Semester</label>
                <select 
                  className="form-input"
                  value={form.semester}
                  onChange={e => setForm(f => ({ ...f, semester: e.target.value }))}
                >
                  <option value="Ganjil">Semester Ganjil</option>
                  <option value="Genap">Semester Genap</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: JADWAL ABSENSI */}
        {activeTab === 'waktu' && (
          <div className="settings-card">
            <div className="settings-card-header">
              <Clock size={22} className="settings-header-icon" />
              <div>
                <h3>Jam Operasional & Batas Kehadiran</h3>
                <p>Tentukan batas waktu absensi masuk untuk menentukan status tepat waktu atau terlambat.</p>
              </div>
            </div>

            <div className="settings-grid">
              <div className="form-group">
                <label>Jam Masuk Standar</label>
                <input 
                  type="time" 
                  className="form-input" 
                  value={form.jamMasuk}
                  onChange={e => setForm(f => ({ ...f, jamMasuk: e.target.value }))}
                />
                <span className="form-hint">Jam dimulainya jam belajar mengajar di sekolah.</span>
              </div>

              <div className="form-group">
                <label>Batas Toleransi Terlambat</label>
                <input 
                  type="time" 
                  className="form-input" 
                  value={form.jamTerlambat}
                  onChange={e => setForm(f => ({ ...f, jamTerlambat: e.target.value }))}
                />
                <span className="form-hint">Absen melewati jam ini akan otomatis ditandai "Terlambat".</span>
              </div>

              <div className="form-group">
                <label>Jam Pulang Sekolah</label>
                <input 
                  type="time" 
                  className="form-input" 
                  value={form.jamPulang}
                  onChange={e => setForm(f => ({ ...f, jamPulang: e.target.value }))}
                />
                <span className="form-hint">Jam kepulangan murid.</span>
              </div>

              <div className="settings-info-box settings-span-2">
                <ShieldCheck size={20} color="#059669" />
                <div>
                  <strong>Aturan Otomatis Absensi:</strong>
                  <ul style={{margin:'4px 0 0 16px', padding:0, fontSize:'0.85rem'}}>
                    <li>Sebelum <strong>{form.jamTerlambat}</strong>: Ditandai <strong>Tepat Waktu</strong></li>
                    <li>Setelah <strong>{form.jamTerlambat}</strong>: Ditandai <strong>Terlambat</strong></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: KAMERA & AI */}
        {activeTab === 'ai' && (
          <div className="settings-card">
            <div className="settings-card-header">
              <Camera size={22} className="settings-header-icon" />
              <div>
                <h3>Parameter Pengenalan Wajah (Face API)</h3>
                <p>Atur kepekaan deteksi AI dan perilaku kamera saat proses absensi selfie berlangsung.</p>
              </div>
            </div>

            <div className="settings-group-stack">
              {/* Threshold Slider */}
              <div className="setting-row">
                <div>
                  <div className="setting-title">Ambang Jarak Wajah (Distance Threshold)</div>
                  <div className="setting-desc">
                    Nilai ambang Euclidean distance pengenal wajah. Semakin rendah nilainya, semakin ketat pencocokan wajah.
                  </div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:14, minWidth:220}}>
                  <input 
                    type="range" 
                    min="0.30" 
                    max="0.65" 
                    step="0.05"
                    value={form.faceThreshold}
                    onChange={e => setForm(f => ({ ...f, faceThreshold: parseFloat(e.target.value) }))}
                    style={{flex:1}}
                  />
                  <span className="threshold-val-badge">
                    {form.faceThreshold} ({form.faceThreshold <= 0.45 ? 'Sangat Ketat' : form.faceThreshold <= 0.55 ? 'Standar' : 'Fleksibel'})
                  </span>
                </div>
              </div>

              {/* Suara Notifikasi */}
              <div className="setting-row">
                <div>
                  <div className="setting-title">Suara Bunyi Konfirmasi Absen</div>
                  <div className="setting-desc">
                    Putar nada beep konfirmasi saat wajah berhasil dikenali dan absensi tercatat.
                  </div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <button 
                    type="button" 
                    className="btn btn-sm btn-outline" 
                    onClick={playSampleBeep}
                    title="Coba suara"
                  >
                    <Volume2 size={15} /> Tes Suara
                  </button>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={form.soundEnabled}
                      onChange={e => setForm(f => ({ ...f, soundEnabled: e.target.checked }))}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
              </div>

              {/* Suara AI (Text-to-Speech Bahasa Indonesia) */}
              <div className="setting-row" style={{flexDirection:'column', alignItems:'stretch', gap:14}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:14}}>
                  <div>
                    <div className="setting-title">Suara AI (Pemandu Suara Otomatis)</div>
                    <div className="setting-desc">
                      Asisten suara AI berbahasa Indonesia akan menyapa nama murid saat tap kartu dan mengumumkan hasil presensi.
                    </div>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <button 
                      type="button" 
                      className="btn btn-sm btn-outline" 
                      onClick={() => {
                        if (form.aiVoiceEnabled === false) {
                          return toast('Suara AI sedang dimatikan. Aktifkan switch di sebelah untuk mencoba.', { icon: '🔇' });
                        }
                        speakAI(
                          `Halo, selamat datang di ${form.schoolName || 'sekolah'}. Sistem absensi suara AI aktif.`,
                          {
                            enabled: true,
                            voiceName: form.aiVoiceName,
                            rate: form.aiVoiceRate,
                            pitch: form.aiVoicePitch,
                          }
                        );
                        toast.success('Memutar suara AI...');
                      }}
                      title="Coba suara AI Bahasa Indonesia"
                    >
                      <Volume2 size={15} /> Tes Suara AI
                    </button>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={form.aiVoiceEnabled !== false}
                        onChange={e => {
                          const checked = e.target.checked;
                          if (!checked && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                            window.speechSynthesis.cancel();
                          }
                          setForm(f => ({ ...f, aiVoiceEnabled: checked }));
                        }}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                </div>

                {form.aiVoiceEnabled !== false && (
                  <div className="settings-grid" style={{
                    background:'rgba(99,102,241,0.06)',
                    border:'1px solid rgba(99,102,241,0.18)',
                    borderRadius:12,
                    padding:16,
                    gap:14
                  }}>
                    <div className="form-group settings-span-2" style={{marginBottom:0}}>
                      <label style={{fontSize:'0.82rem'}}>Pilihan Suara / Karakter AI</label>
                      <select
                        className="form-input"
                        value={form.aiVoiceName || ''}
                        onChange={e => setForm(f => ({ ...f, aiVoiceName: e.target.value }))}
                      >
                        <option value="">Otomatis (Suara Bahasa Indonesia Terbaik)</option>
                        {voices.map(v => (
                          <option key={v.name} value={v.name}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{marginBottom:0}}>
                      <label style={{fontSize:'0.82rem', display:'flex', justifyContent:'space-between'}}>
                        <span>Kecepatan Bicara</span>
                        <strong>{Number(form.aiVoiceRate || 1).toFixed(2)}x</strong>
                      </label>
                      <input
                        type="range"
                        min="0.7"
                        max="1.4"
                        step="0.05"
                        value={form.aiVoiceRate ?? 1.0}
                        onChange={e => setForm(f => ({ ...f, aiVoiceRate: parseFloat(e.target.value) }))}
                      />
                    </div>

                    <div className="form-group" style={{marginBottom:0}}>
                      <label style={{fontSize:'0.82rem', display:'flex', justifyContent:'space-between'}}>
                        <span>Nada Suara (Pitch)</span>
                        <strong>{Number(form.aiVoicePitch || 1).toFixed(2)}</strong>
                      </label>
                      <input
                        type="range"
                        min="0.7"
                        max="1.4"
                        step="0.05"
                        value={form.aiVoicePitch ?? 1.0}
                        onChange={e => setForm(f => ({ ...f, aiVoicePitch: parseFloat(e.target.value) }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Deteksi & Tangkap Wajah Otomatis */}
              <div className="setting-row">
                <div>
                  <div className="setting-title">Deteksi & Verifikasi Wajah Otomatis (Auto-Capture)</div>
                  <div className="setting-desc">
                    Jika aktif, kamera langsung mengenali & mencatat absen otomatis saat wajah terlihat. Jika mati, gunakan tombol verifikasi manual.
                  </div>
                </div>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={form.autoCapture}
                    onChange={e => setForm(f => ({ ...f, autoCapture: e.target.checked }))}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DATA & BACKUP */}
        {activeTab === 'data' && (
          <div className="settings-card">
            <div className="settings-card-header">
              <Database size={22} className="settings-header-icon" />
              <div>
                <h3>Pencadangan & Pemeliharaan Data</h3>
                <p>Unduh cadangan database sistem absensi dan kelola histori rekaman kehadiran.</p>
              </div>
            </div>

            {/* Statistik Database */}
            <div className="db-stats-grid">
              <div className="db-stat-box">
                <div className="db-stat-num">{stats.students}</div>
                <div className="db-stat-text">Total Murid Terdaftar</div>
              </div>
              <div className="db-stat-box">
                <div className="db-stat-num">{stats.classes}</div>
                <div className="db-stat-text">Total Kelas Terdaftar</div>
              </div>
              <div className="db-stat-box">
                <div className="db-stat-num">{stats.attendance}</div>
                <div className="db-stat-text">Total Record Absensi</div>
              </div>
            </div>

            <div className="data-actions-stack">
              {/* Ubah Password Admin */}
              <div className="action-row" style={{flexDirection:'column', alignItems:'stretch', gap:12}}>
                <div>
                  <div className="action-title" style={{display:'flex', alignItems:'center', gap:6}}>
                    <KeyRound size={16} color="var(--primary)" /> Keamanan & Password Dashboard Admin
                  </div>
                  <div className="action-desc">
                    Ubah username atau password login admin agar murid tidak bisa masuk ke halaman pengelolaan.
                  </div>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:10}}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Username baru (opsional)"
                    value={pwdForm.newUsername}
                    onChange={e => setPwdForm(f => ({...f, newUsername: e.target.value}))}
                  />
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Password lama *"
                    value={pwdForm.oldPassword}
                    onChange={e => setPwdForm(f => ({...f, oldPassword: e.target.value}))}
                  />
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Password baru (min 4 karakter) *"
                    value={pwdForm.newPassword}
                    onChange={e => setPwdForm(f => ({...f, newPassword: e.target.value}))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleChangePassword();
                      }
                    }}
                  />
                </div>
                <div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleChangePassword}
                    disabled={savingPwd}
                  >
                    <KeyRound size={15} /> {savingPwd ? 'Menyimpan...' : 'Perbarui Password Admin'}
                  </button>
                </div>
              </div>

              {/* Backup */}
              <div className="action-row">
                <div>
                  <div className="action-title">Cadangkan Database (Backup JSON)</div>
                  <div className="action-desc">
                    Unduh seluruh data murid, vektor wajah (descriptors), daftar kelas, dan histori absensi ke dalam file JSON aman.
                  </div>
                </div>
                <a href={BACKUP_URL} download className="btn btn-outline" style={{textDecoration:'none'}}>
                  <Download size={16} /> Unduh Backup
                </a>
              </div>

              {/* Reset Hari Ini */}
              <div className="action-row">
                <div>
                  <div className="action-title">Reset Kehadiran Hari Ini</div>
                  <div className="action-desc">
                    Hapus catatan absensi hanya untuk hari ini. Berguna saat menguji coba kamera atau melakukan absensi ulang.
                  </div>
                </div>
                <button 
                  type="button" 
                  className="btn btn-outline"
                  style={{color:'#d97706', borderColor:'#f59e0b'}}
                  onClick={() => handleResetAttendance('today')}
                >
                  <RefreshCw size={15} /> Reset Absen Hari Ini
                </button>
              </div>

              {/* Reset Semua */}
              <div className="action-row danger-zone">
                <div>
                  <div className="action-title" style={{color:'#dc2626'}}>
                    <AlertTriangle size={16} style={{verticalAlign:'middle', marginRight:4}} />
                    Hapus Seluruh Riwayat Absensi
                  </div>
                  <div className="action-desc">
                    Menghapus seluruh log kehadiran murid sepanjang masa. Data profil murid dan kelas tetap aman.
                  </div>
                </div>
                <button 
                  type="button" 
                  className="btn btn-outline"
                  style={{color:'#dc2626', borderColor:'#ef4444'}}
                  onClick={() => handleResetAttendance('all')}
                >
                  <Trash2 size={15} /> Hapus Semua Absensi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tombol Simpan Footer (tampil pada tab Umum, Jadwal, Kamera & AI) */}
        {activeTab !== 'data' && (
          <div className="settings-footer" style={{justifyContent:'space-between', flexWrap:'wrap', gap:10}}>
            <button 
              type="button"
              className="btn btn-outline"
              onClick={handleResetDefaultSettings}
              style={{padding:'10px 16px'}}
            >
              <RefreshCw size={15} /> Reset Default
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={saving}
              style={{padding:'10px 24px'}}
            >
              <Save size={18} /> {saving ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
