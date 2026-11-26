import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GraduationCap, Plus, Pencil, Trash2, Check, X, 
  Users, UserPlus, Search, LayoutGrid, List, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  getClasses, createClass, updateClass, deleteClass, 
  getStudents, deleteStudent 
} from '../api';

const TINGKAT = ['1','2','3','4','5','6','7','8','9','10','11','12'];

export default function KelasPage() {
  const navigate = useNavigate();
  const [classes, setClasses]         = useState([]);
  const [students, setStudents]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [editId, setEditId]           = useState(null);
  const [editVal, setEditVal]         = useState({});
  const [showAdd, setShowAdd]         = useState(false);
  const [newKelas, setNewKelas]       = useState({ name:'', tingkat:'', waliKelas:'' });
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode]       = useState('cards'); // 'cards' (default lengkap) atau 'table'

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [cls, stu] = await Promise.all([getClasses(), getStudents()]);
      setClasses(Array.isArray(cls) ? cls : []);
      setStudents(Array.isArray(stu) ? stu : []);
    } catch {
      toast.error('Gagal memuat data kelas & murid');
    }
    setLoading(false);
  }

  function getStudentsOfClass(kelasName) {
    if (!kelasName) return [];
    return students.filter(s => (s.kelas || '').toLowerCase() === kelasName.toLowerCase());
  }

  // ── Tambah Kelas ──────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault();
    if (!newKelas.name.trim()) return toast.error('Nama kelas wajib diisi');
    const res = await createClass(newKelas);
    if (res.error) return toast.error(res.error);
    toast.success(`Kelas ${res.kelas.name} berhasil ditambahkan!`);
    setNewKelas({ name:'', tingkat:'', waliKelas:'' });
    setShowAdd(false);
    load();
  }

  // ── Edit Kelas ───────────────────────────────────────────────
  function startEdit(k) {
    setEditId(k.id);
    setEditVal({ name: k.name, tingkat: k.tingkat || '', waliKelas: k.waliKelas || '' });
  }

  async function saveEdit() {
    if (!editVal.name.trim()) return toast.error('Nama kelas tidak boleh kosong');
    const res = await updateClass(editId, editVal);
    if (res.error) return toast.error(res.error);
    toast.success('Informasi kelas diperbarui');
    setEditId(null);
    load();
  }

  // ── Hapus Kelas ──────────────────────────────────────────────
  async function handleDelete(k) {
    const count = getStudentsOfClass(k.name).length;
    if (count > 0) {
      return toast.error(`Tidak dapat menghapus: Masih ada ${count} murid di kelas ${k.name}`);
    }
    if (!confirm(`Hapus kelas ${k.name}?`)) return;
    try {
      await deleteClass(k.id);
      toast.success(`Kelas ${k.name} dihapus`);
      load();
    } catch (e) { toast.error(e.message); }
  }

  // ── Hapus Murid ─────────────────────────────────────────────
  async function handleDeleteStudent(s) {
    if (!confirm(`Hapus murid "${s.name}" (NIS: ${s.studentId})?`)) return;
    try {
      await deleteStudent(s.id);
      toast.success(`Murid ${s.name} berhasil dihapus`);
      load();
    } catch {
      toast.error('Gagal menghapus murid');
    }
  }

  // Kelas yang cocok dengan query pencarian
  const filteredClasses = classes.filter(k => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchClass = k.name.toLowerCase().includes(q) || (k.waliKelas && k.waliKelas.toLowerCase().includes(q));
    const matchStudent = getStudentsOfClass(k.name).some(s => 
      s.name.toLowerCase().includes(q) || (s.studentId && s.studentId.includes(q))
    );
    return matchClass || matchStudent;
  });

  // Cari murid yang tidak terdaftar di kelas mana pun yang aktif
  const classNames = new Set(classes.map(c => (c.name || '').toLowerCase()));
  const unassignedStudents = students.filter(s => !s.kelas || !classNames.has(s.kelas.toLowerCase()));

  return (
    <div className="page">
      {/* Header Halaman */}
      <div className="page-header" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <h1><GraduationCap size={28} /> Daftar Kelas & Murid</h1>
          <p className="page-desc">Kelola kelas dan lihat langsung seluruh daftar murid yang terdaftar di masing-masing kelas.</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-outline" onClick={() => navigate('/daftar')}>
            <UserPlus size={16} /> Daftarkan Murid
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(v => !v)}>
            <Plus size={18} /> Tambah Kelas
          </button>
        </div>
      </div>

      {/* Form Tambah Kelas */}
      {showAdd && (
        <div className="add-class-card">
          <h3>Tambah Kelas Baru</h3>
          <form onSubmit={handleAdd} className="add-class-form">
            <div className="form-group">
              <label>Nama Kelas *</label>
              <input 
                className="form-input" 
                placeholder="Contoh: 3b, 7A, 10-IPA-1" 
                value={newKelas.name}
                onChange={e => setNewKelas(v => ({...v, name: e.target.value}))} 
                autoFocus 
              />
            </div>
            <div className="form-group">
              <label>Tingkat / Grade</label>
              <select 
                className="form-input" 
                value={newKelas.tingkat}
                onChange={e => setNewKelas(v => ({...v, tingkat: e.target.value}))}
              >
                <option value="">— Pilih tingkat —</option>
                {TINGKAT.map(t => <option key={t} value={t}>Tingkat {t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Wali Kelas</label>
              <input 
                className="form-input" 
                placeholder="Nama guru / wali kelas" 
                value={newKelas.waliKelas}
                onChange={e => setNewKelas(v => ({...v, waliKelas: e.target.value}))} 
              />
            </div>
            <div className="add-class-actions">
              <button type="submit" className="btn btn-primary"><Plus size={16}/> Simpan Kelas</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Batal</button>
            </div>
          </form>
        </div>
      )}

      {/* Ringkasan Statistik */}
      <div className="kelas-stats">
        <div className="kelas-stat">
          <div className="kelas-stat-val">{classes.length}</div>
          <div className="kelas-stat-label">Total Kelas</div>
        </div>
        <div className="kelas-stat">
          <div className="kelas-stat-val">{students.length}</div>
          <div className="kelas-stat-label">Total Murid Terdaftar</div>
        </div>
        <div className="kelas-stat">
          <div className="kelas-stat-val">
            {classes.length > 0 ? (students.length / classes.length).toFixed(1) : 0}
          </div>
          <div className="kelas-stat-label">Rata-rata Murid/Kelas</div>
        </div>
      </div>

      {/* Toolbar Filter & Mode Tampilan */}
      <div className="kelas-toolbar">
        <div className="search-wrap" style={{maxWidth:340, flex:1}}>
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="form-input"
            placeholder="Cari kelas, nama murid, atau NIS..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{paddingLeft:34}}
          />
        </div>
        <div style={{display:'flex',gap:6}}>
          <button 
            className={`btn btn-sm ${viewMode === 'cards' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setViewMode('cards')}
            title="Tampilkan murid langsung per kelas"
          >
            <LayoutGrid size={15} style={{marginRight:4}} /> Tampilan Roster Kelas
          </button>
          <button 
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setViewMode('table')}
            title="Tampilan tabel ringkas"
          >
            <List size={15} style={{marginRight:4}} /> Tabel Ringkas
          </button>
        </div>
      </div>

      {/* MODE 1: KARTU ROSTER KELAS LENGKAP (DEFAULT) — Murid langsung kelihatan di dalam setiap kelas */}
      {viewMode === 'cards' && (
        <div className="kelas-cards-container">
          {classes.length === 0 ? (
            <div className="empty-state" style={{background:'white', borderRadius:'var(--radius)', padding:48, boxShadow:'var(--shadow)'}}>
              <GraduationCap size={48} style={{opacity:.3, display:'block', margin:'0 auto 12px'}} />
              <h3>Belum Ada Kelas</h3>
              <p style={{marginTop:6, color:'var(--text2)'}}>Silakan klik tombol <strong>Tambah Kelas</strong> di atas untuk membuat kelas pertama.</p>
              <button className="btn btn-primary" style={{marginTop:16}} onClick={() => setShowAdd(true)}>
                <Plus size={16} /> Buat Kelas Baru
              </button>
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className="empty-state" style={{background:'white', borderRadius:'var(--radius)', padding:36}}>
              <p>Tidak ada kelas atau murid yang cocok dengan pencarian "<strong>{searchQuery}</strong>".</p>
            </div>
          ) : (
            filteredClasses.map(k => {
              const muridList = getStudentsOfClass(k.name);
              const q = searchQuery.toLowerCase();
              const filteredMurid = muridList.filter(s => {
                if (!searchQuery) return true;
                return s.name.toLowerCase().includes(q) || (s.studentId && s.studentId.includes(q)) || k.name.toLowerCase().includes(q);
              });

              return (
                <div key={k.id} className="kelas-roster-card">
                  {/* Header Kartu Kelas */}
                  <div className="kelas-roster-card-header">
                    <div className="kelas-header-info">
                      <div className="kelas-badge-large">{k.name}</div>
                      <div>
                        <div className="kelas-meta-row">
                          {k.tingkat && <span className="chip">Tingkat {k.tingkat}</span>}
                          {k.waliKelas && <span className="text-muted">Wali Kelas: <strong>{k.waliKelas}</strong></span>}
                          <span className="murid-count-pill">
                            <Users size={13} style={{verticalAlign:'middle', marginRight:3}} />
                            {muridList.length} Murid
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="kelas-header-actions">
                      <button 
                        className="btn btn-sm btn-outline"
                        onClick={() => navigate('/daftar')}
                        title="Daftarkan murid ke kelas ini"
                      >
                        <UserPlus size={14} /> Tambah Murid
                      </button>
                      <button 
                        className="icon-btn"
                        onClick={() => startEdit(k)}
                        title="Edit Kelas"
                      >
                        <Pencil size={15} />
                      </button>
                      <button 
                        className="icon-btn danger"
                        onClick={() => handleDelete(k)}
                        title="Hapus Kelas"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Form Edit Inline jika sedang diedit */}
                  {editId === k.id && (
                    <div className="edit-kelas-inline-box">
                      <div className="edit-inline-fields">
                        <div>
                          <label className="text-sm">Nama Kelas</label>
                          <input 
                            className="form-input inline-input" 
                            value={editVal.name}
                            onChange={e => setEditVal(v => ({...v, name: e.target.value}))} 
                          />
                        </div>
                        <div>
                          <label className="text-sm">Tingkat</label>
                          <select 
                            className="form-input inline-input" 
                            value={editVal.tingkat}
                            onChange={e => setEditVal(v => ({...v, tingkat: e.target.value}))}
                          >
                            <option value="">—</option>
                            {TINGKAT.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-sm">Wali Kelas</label>
                          <input 
                            className="form-input inline-input" 
                            value={editVal.waliKelas}
                            onChange={e => setEditVal(v => ({...v, waliKelas: e.target.value}))} 
                          />
                        </div>
                      </div>
                      <div style={{display:'flex', gap:6, marginTop:8}}>
                        <button className="btn btn-sm btn-primary" onClick={saveEdit}><Check size={14}/> Simpan</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setEditId(null)}><X size={14}/> Batal</button>
                      </div>
                    </div>
                  )}

                  {/* DAFTAR MURID DI DALAM KELAS INI */}
                  <div className="kelas-students-section">
                    <div className="students-section-title">
                      <Users size={16} />
                      <span>Daftar Murid di Kelas {k.name} ({muridList.length})</span>
                    </div>

                    {filteredMurid.length === 0 ? (
                      <div className="empty-roster-box">
                        <Users size={32} style={{opacity:.3, marginBottom:6}} />
                        <p>{muridList.length === 0 ? `Belum ada murid yang terdaftar di kelas ${k.name}.` : 'Tidak ada murid yang sesuai filter pencarian.'}</p>
                        {muridList.length === 0 && (
                          <button 
                            className="btn btn-sm btn-primary" 
                            style={{marginTop:10}}
                            onClick={() => navigate('/daftar')}
                          >
                            <UserPlus size={14} /> Daftarkan Murid Sekarang
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="students-roster-grid">
                        {filteredMurid.map((s, idx) => (
                          <div key={s.id} className="student-roster-card">
                            <div className="student-card-num">{idx + 1}</div>
                            {s.photo ? (
                              <img src={s.photo} alt={s.name} className="student-roster-photo" />
                            ) : (
                              <div className="student-roster-avatar">
                                {s.name ? s.name[0].toUpperCase() : '?'}
                              </div>
                            )}
                            <div className="student-roster-details">
                              <div className="student-roster-name" title={s.name}>{s.name}</div>
                              <div className="student-roster-id">
                                <span>NIS: {s.studentId}</span>
                                {s.rfid && (
                                  <span className="rfid-chip-mini">
                                    💳 {s.rfid}
                                  </span>
                                )}
                              </div>
                              {s.registeredAt && (
                                <div className="student-roster-time">
                                  Terdaftar: {new Date(s.registeredAt).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}
                                </div>
                              )}
                            </div>
                            <button 
                              className="icon-btn-tiny danger"
                              onClick={() => handleDeleteStudent(s)}
                              title={`Hapus murid ${s.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODE 2: TABEL RINGKAS */}
      {viewMode === 'table' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nama Kelas</th>
                <th>Tingkat</th>
                <th>Wali Kelas</th>
                <th>Jumlah Murid</th>
                <th style={{textAlign:'center', width:120}}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {classes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{textAlign:'center', padding:'36px 0', color:'#94a3b8'}}>
                    Belum ada kelas.
                  </td>
                </tr>
              ) : (
                filteredClasses.map(k => (
                  <tr key={k.id}>
                    <td>
                      <span className="kelas-name-badge">{k.name}</span>
                    </td>
                    <td>{k.tingkat ? <span className="chip">Tingkat {k.tingkat}</span> : <span className="text-muted">—</span>}</td>
                    <td>{k.waliKelas || <span className="text-muted">—</span>}</td>
                    <td>
                      <span className={`murid-count ${getStudentsOfClass(k.name).length > 0 ? 'has-murid' : ''}`}>
                        {getStudentsOfClass(k.name).length} murid
                      </span>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button className="icon-btn" onClick={() => startEdit(k)} title="Edit"><Pencil size={15}/></button>
                        <button className="icon-btn danger" onClick={() => handleDelete(k)} title="Hapus"><Trash2 size={15}/></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Seksi Khusus Murid Belum Masuk Kelas Terdaftar */}
      {unassignedStudents.length > 0 && (
        <div className="unassigned-card">
          <div className="unassigned-header">
            <h3>
              <AlertCircle size={18} /> Murid Tanpa Kelas / Kelas Tidak Cocok ({unassignedStudents.length})
            </h3>
            <span className="unassigned-badge">Perlu Dikelompokkan</span>
          </div>
          <p className="text-sm text-muted" style={{marginBottom:14}}>
            Murid-murid di bawah ini telah terdaftar tetapi nama kelasnya belum terdaftar di daftar kelas.
          </p>
          <div className="students-roster-grid">
            {unassignedStudents.map((s, idx) => (
              <div key={s.id} className="student-roster-card">
                <div className="student-card-num">{idx + 1}</div>
                {s.photo ? (
                  <img src={s.photo} alt={s.name} className="student-roster-photo" />
                ) : (
                  <div className="student-roster-avatar">
                    {s.name ? s.name[0].toUpperCase() : '?'}
                  </div>
                )}
                <div className="student-roster-details">
                  <div className="student-roster-name">{s.name}</div>
                  <div className="student-roster-id">NIS: {s.studentId}</div>
                  <div className="student-roster-time">Kelas di profil: <strong>{s.kelas || '(kosong)'}</strong></div>
                </div>
                <button 
                  className="icon-btn-tiny danger"
                  onClick={() => handleDeleteStudent(s)}
                  title="Hapus Murid"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
