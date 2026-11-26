import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { 
  UserPlus, Camera, CheckCircle, Trash2, Loader, 
  GraduationCap, CreditCard, Sparkles, RefreshCw, KeyRound,
  Radio, AlertTriangle, ShieldCheck, Check
} from 'lucide-react';
import { registerStudent, getStudents, deleteStudent, getClasses, updateStudent, getSettings } from '../api';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

// Synthesizer suara feedback saat kartu di-tap
function playSound(type = 'tap') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'tap') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {}
}

export default function DaftarPage() {
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const rfidInputRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState({ name: '', studentId: '', kelas: '', rfid: '' });
  const [preview, setPreview] = useState(null);
  const [capturedDesc, setCapturedDesc] = useState(null);
  const [editRfidStudent, setEditRfidStudent] = useState(null);
  const [newRfidVal, setNewRfidVal] = useState('');
  
  // Real-time RFID scanner states
  const [espOnline, setEspOnline] = useState(false);
  const [rfidFlash, setRfidFlash] = useState(false);
  const [rfidConflict, setRfidConflict] = useState(null);
  const [lastScannedUid, setLastScannedUid] = useState(null);
  const soundEnabledRef = useRef(true);

  useEffect(() => {
    loadModels();
    fetchStudents();
    getClasses().then(setClasses).catch(() => {});
    getSettings().then(s => {
      if (s && s.soundEnabled !== undefined) soundEnabledRef.current = s.soundEnabled;
    }).catch(() => {});
  }, []);

  // Hubungkan ke Real-time SSE Stream Server untuk ESP32 / ESP8266 IoT RFID Scanner
  useEffect(() => {
    let evtSource = null;
    try {
      evtSource = new EventSource('/api/rfid/stream');

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            setEspOnline(Boolean(data.online));
          } else if (data.type === 'card_tapped') {
            setEspOnline(true);
            const uid = (data.rfid || data.uid || '').trim();
            if (!uid) return;

            setLastScannedUid(uid);
            if (soundEnabledRef.current) playSound('tap');

            // Cek apakah kartu ini sudah terdaftar pada murid lain di database
            const existing = students.find(s => 
              (s.rfid && s.rfid.trim().toLowerCase() === uid.toLowerCase()) ||
              (s.studentId && s.studentId.trim().toLowerCase() === uid.toLowerCase())
            );

            // KASUS 1: Jika sedang membuka dialog 'Ganti Kartu' untuk murid tertentu
            if (editRfidStudent) {
              setNewRfidVal(uid);
              if (existing && existing.id !== editRfidStudent.id) {
                toast.error(`⚠️ Kartu ${uid} sudah dipakai oleh ${existing.name}!`, { duration: 4000 });
              } else {
                toast.success(`💳 Kartu ${uid} terbaca dari scanner IoT!`);
              }
              return;
            }

            // KASUS 2: Sedang mengisi form pendaftaran murid baru
            setForm(f => ({ ...f, rfid: uid }));
            setRfidFlash(true);
            setTimeout(() => setRfidFlash(false), 1200);

            if (existing) {
              setRfidConflict(existing);
              playSound('error');
              toast.error(`⚠️ Kartu ${uid} sudah terdaftar atas nama ${existing.name} (${existing.kelas})!`, { duration: 5000 });
            } else {
              setRfidConflict(null);
              toast.success(`💳 Kartu ${uid} otomatis dimasukkan ke form pendaftaran!`, { icon: '✨' });
            }
          }
        } catch (e) {
          console.error(e);
        }
      };

      evtSource.onerror = () => {
        setEspOnline(false);
      };
    } catch (e) {}

    return () => {
      if (evtSource) evtSource.close();
    };
  }, [students, editRfidStudent]);

  async function loadModels() {
    setLoading(true);
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      setModelsLoaded(true);
    } catch { toast.error('Gagal memuat model AI'); }
    setLoading(false);
  }

  async function fetchStudents() {
    try { 
      const data = await getStudents();
      setStudents(data); 
    } catch { 
      toast.error('Gagal memuat data murid'); 
    }
  }

  async function capturePhoto() {
    if (!modelsLoaded) return toast.error('Model AI belum siap');
    setCapturing(true);
    try {
      const img = webcamRef.current?.getScreenshot();
      if (!img) throw new Error('Tidak ada gambar');

      const image = new Image();
      image.src = img;
      await new Promise(r => { image.onload = r; });

      const detection = await faceapi
        .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        toast.error('Wajah tidak terdeteksi. Pastikan wajah terlihat jelas.');
        setCapturing(false);
        return;
      }

      setCapturedDesc(Array.from(detection.descriptor));
      setPreview(img);
      playSound('success');
      toast.success('Wajah berhasil ditangkap!');
    } catch (e) {
      toast.error('Gagal mendeteksi wajah: ' + e.message);
    }
    setCapturing(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.studentId) return toast.error('Nama dan ID murid wajib diisi');
    if (!capturedDesc) return toast.error('Ambil foto wajah terlebih dahulu');

    // Cek duplikasi kartu jika diisi
    if (form.rfid) {
      const conflict = students.find(s => s.rfid && s.rfid.trim().toLowerCase() === form.rfid.trim().toLowerCase());
      if (conflict) {
        playSound('error');
        return toast.error(`Kartu ${form.rfid} sudah digunakan oleh ${conflict.name}. Gunakan kartu lain!`);
      }
    }

    try {
      const res = await registerStudent({
        ...form,
        descriptor: capturedDesc,
        photo: preview,
      });
      if (res.error) return toast.error(res.error);
      playSound('success');
      toast.success(`${form.name} berhasil didaftarkan!`);
      setForm({ name: '', studentId: '', kelas: '', rfid: '' });
      setPreview(null);
      setCapturedDesc(null);
      setRfidConflict(null);
      fetchStudents();
    } catch (err) { 
      toast.error(err.message || 'Gagal mendaftarkan murid'); 
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Hapus data ${name}?`)) return;
    try {
      await deleteStudent(id);
      toast.success(`${name} dihapus`);
      fetchStudents();
    } catch { toast.error('Gagal menghapus'); }
  }

  async function handleSaveRfid(student) {
    const val = newRfidVal.trim();
    if (!val) return toast.error('Nomor RFID tidak boleh kosong');
    
    // Cek apakah dipakai murid lain
    const conflict = students.find(s => s.id !== student.id && s.rfid && s.rfid.trim().toLowerCase() === val.toLowerCase());
    if (conflict) {
      playSound('error');
      return toast.error(`Kartu ${val} sudah dipakai oleh ${conflict.name}!`);
    }

    try {
      await updateStudent(student.id, { rfid: val });
      playSound('success');
      toast.success(`Kartu RFID untuk ${student.name} berhasil diperbarui!`);
      setEditRfidStudent(null);
      setNewRfidVal('');
      fetchStudents();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Bersihkan input RFID agar siap scan kartu fisik baru
  function clearRfidInput() {
    setForm(f => ({ ...f, rfid: '' }));
    setRfidConflict(null);
    setLastScannedUid(null);
    rfidInputRef.current?.focus();
    toast('Silakan tempelkan kartu RFID ke scanner', { icon: '📡' });
  }

  return (
    <div className="page">
      <div className="page-header" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <h1 style={{margin:0}}><UserPlus size={28} /> Pendaftaran Murid & Kartu RFID</h1>
            <span style={{
              display:'inline-flex',
              alignItems:'center',
              gap:6,
              fontSize:'0.75rem',
              fontWeight:600,
              padding:'4px 10px',
              borderRadius:20,
              background: espOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.12)',
              color: espOnline ? '#10b981' : '#60a5fa',
              border: `1px solid ${espOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.25)'}`
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: espOnline ? '#10b981' : '#60a5fa',
                boxShadow: espOnline ? '0 0 8px #10b981' : 'none'
              }} />
              {espOnline ? 'Scanner IoT ESP32/8266: Online' : 'Pemindai RFID: Siap Menerima Tap'}
            </span>
          </div>
          <p className="page-desc" style={{marginTop:6}}>
            Daftarkan murid lengkap dengan nomor kartu RFID (tap via ESP32/ESP8266 atau USB) dan foto biometrik wajah.
          </p>
        </div>
      </div>

      <div className="daftar-layout">
        {/* Form Pendaftaran */}
        <div className="form-card">
          <h2>Form Pendaftaran Baru</h2>

          <div className="webcam-sm-wrap">
            {!preview ? (
              <>
                <Webcam
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.8}
                  mirrored
                  videoConstraints={{ facingMode: 'user', width: 320, height: 240 }}
                  className="webcam-sm"
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm-cam"
                  onClick={capturePhoto}
                  disabled={capturing || !modelsLoaded}
                >
                  {capturing ? <><Loader size={16} className="spin" /> Mendeteksi...</> : <><Camera size={16} /> Ambil Foto Wajah</>}
                </button>
              </>
            ) : (
              <div className="preview-wrap">
                <img src={preview} alt="preview" className="photo-preview" />
                <div className="preview-ok"><CheckCircle size={20} /> Biometrik wajah terdeteksi</div>
                <button className="btn btn-outline" onClick={() => { setPreview(null); setCapturedDesc(null); }}>
                  Ulangi Foto
                </button>
              </div>
            )}
            {loading && <div className="model-loading"><Loader size={18} className="spin" /> Memuat model AI...</div>}
          </div>

          <form onSubmit={handleSubmit} className="reg-form">
            <div className="form-group">
              <label>Nama Lengkap *</label>
              <input 
                className="form-input" 
                value={form.name} 
                onChange={e => setForm(f => ({...f, name: e.target.value}))} 
                placeholder="Contoh: Dimas Al Ghofiqi" 
                required 
              />
            </div>

            <div className="form-group">
              <label>ID / NIS Murid *</label>
              <input 
                className="form-input" 
                value={form.studentId} 
                onChange={e => setForm(f => ({...f, studentId: e.target.value}))} 
                placeholder="Contoh: 2024001" 
                required 
              />
            </div>

            <div className="form-group">
              <label>Kelas</label>
              {classes.length > 0 ? (
                <select className="form-input" value={form.kelas} onChange={e => setForm(f => ({...f, kelas: e.target.value}))}>
                  <option value="">— Pilih Kelas —</option>
                  {classes.map(k => <option key={k.id} value={k.name}>{k.name}{k.waliKelas ? ` (${k.waliKelas})` : ''}</option>)}
                </select>
              ) : (
                <div className="kelas-hint">
                  <GraduationCap size={15}/> Belum ada kelas.{' '}
                  <a href="/kelas" onClick={e => { e.preventDefault(); navigate('/kelas'); }}>Tambahkan kelas</a> terlebih dahulu, atau ketik manual:
                  <input className="form-input" style={{marginTop:6}} value={form.kelas} onChange={e => setForm(f => ({...f, kelas: e.target.value}))} placeholder="Nama kelas" />
                </div>
              )}
            </div>

            {/* Input Kartu RFID Canggih & Real-time */}
            <div className="form-group">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                <label style={{margin:0, display:'flex', alignItems:'center', gap:6}}>
                  <CreditCard size={16} style={{color:'var(--primary)'}} /> 
                  <span>Nomor / UID Kartu RFID</span>
                </label>
                <span style={{fontSize:'0.75rem', color:'var(--primary)', fontWeight:600, display:'flex', alignItems:'center', gap:4}}>
                  <Radio size={12} className="pulse" />
                  Auto-Capture Aktif
                </span>
              </div>

              <div style={{display:'flex', gap:6, position:'relative'}}>
                <input 
                  ref={rfidInputRef}
                  className={`form-input ${rfidFlash ? 'input-flash' : ''}`}
                  value={form.rfid} 
                  onChange={e => {
                    const val = e.target.value.trim().toUpperCase();
                    setForm(f => ({...f, rfid: val}));
                    const conflict = students.find(s => s.rfid && s.rfid.trim().toLowerCase() === val.toLowerCase());
                    setRfidConflict(conflict || null);
                  }}
                  onKeyDown={e => {
                    // Mencegah scanner barcode/RFID USB men-submit form otomatis saat mengirim karakter Enter (Key code 13)
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      playSound('tap');
                      toast.success(`UID RFID diterima dari scanner: ${e.target.value}`);
                    }
                  }}
                  placeholder="Tempelkan kartu RFID fisik ke scanner (ESP32/ESP8266/USB)..." 
                  style={{
                    borderColor: rfidConflict ? '#ef4444' : rfidFlash || form.rfid ? '#10b981' : undefined,
                    boxShadow: rfidFlash ? '0 0 0 3px rgba(16,185,129,0.3)' : undefined,
                    fontWeight: form.rfid ? 600 : 'normal',
                    letterSpacing: form.rfid ? '1px' : 'normal',
                    transition: 'all 0.3s ease'
                  }}
                />

                {form.rfid ? (
                  <button 
                    type="button" 
                    className="btn btn-outline"
                    onClick={clearRfidInput}
                    title="Hapus nomor kartu dan scan ulang"
                    style={{whiteSpace:'nowrap', fontSize:'0.82rem', padding:'0 12px', color:'#ef4444', borderColor:'rgba(239,68,68,0.3)'}}
                  >
                    Hapus / Scan Ulang
                  </button>
                ) : (
                  <button 
                    type="button" 
                    className="btn btn-outline"
                    onClick={() => rfidInputRef.current?.focus()}
                    title="Scanner RFID Aktif: Tempelkan kartu ke alat"
                    style={{whiteSpace:'nowrap', fontSize:'0.82rem', padding:'0 12px', color:'#10b981', borderColor:'rgba(16,185,129,0.3)'}}
                  >
                    <Radio size={14} className="pulse" style={{marginRight:4}} /> Scan Siap
                  </button>
                )}
              </div>

              {/* Peringatan jika kartu sudah dipakai oleh murid lain */}
              {rfidConflict && (
                <div style={{
                  marginTop:8,
                  padding:'8px 12px',
                  borderRadius:8,
                  background:'rgba(239, 68, 68, 0.1)',
                  border:'1px solid rgba(239, 68, 68, 0.3)',
                  color:'#ef4444',
                  fontSize:'0.82rem',
                  display:'flex',
                  alignItems:'center',
                  gap:8
                }}>
                  <AlertTriangle size={16} style={{flexShrink:0}} />
                  <span>
                    <strong>Kartu sudah terpakai!</strong> Kartu ini milik <strong>{rfidConflict.name}</strong> (NIS: {rfidConflict.studentId} · Kelas: {rfidConflict.kelas}). Silakan gunakan kartu lain.
                  </span>
                </div>
              )}

              <span className="form-hint" style={{display:'flex', alignItems:'center', gap:4, marginTop:6}}>
                <Radio size={12} style={{color:'#10b981'}} />
                Tempelkan kartu RFID pada alat <strong>ESP32/ESP8266</strong> atau <strong>USB Scanner</strong>, kode kartu akan otomatis terisi.
              </span>
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={!capturedDesc || Boolean(rfidConflict)}>
              <UserPlus size={18} /> Daftarkan Murid
            </button>
          </form>
        </div>

        {/* Daftar Murid */}
        <div className="student-list-wrap">
          <h2>Murid Terdaftar ({students.length})</h2>
          {students.length === 0 ? (
            <div className="empty-state">Belum ada murid terdaftar</div>
          ) : (
            <div className="student-list">
              {students.map(s => (
                <div key={s.id} className="student-item">
                  {s.photo ? (
                    <img src={s.photo} alt={s.name} className="student-avatar-img" />
                  ) : (
                    <div className="student-avatar">{s.name[0]}</div>
                  )}

                  <div className="student-info">
                    <div className="student-name">{s.name}</div>
                    <div className="student-meta">
                      <span>NIS: <strong>{s.studentId}</strong></span>
                      <span>·</span>
                      <span>Kelas: {s.kelas}</span>
                    </div>

                    {/* RFID Tag Badge */}
                    <div style={{marginTop:4, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                      {s.rfid ? (
                        <span className="rfid-chip" title="Nomor Kartu RFID Terdaftar">
                          <CreditCard size={12} /> {s.rfid}
                        </span>
                      ) : (
                        <span className="rfid-chip empty" title="Belum memiliki kartu RFID">
                          Belum ada RFID
                        </span>
                      )}

                      <button 
                        className="btn-link-action"
                        onClick={() => {
                          setEditRfidStudent(s);
                          setNewRfidVal(s.rfid || '');
                        }}
                        title="Ubah Kartu RFID"
                      >
                        <KeyRound size={12} /> Ganti Kartu
                      </button>
                    </div>
                  </div>

                  <button className="icon-btn danger" onClick={() => handleDelete(s.id, s.name)} title="Hapus">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal / Dialog Edit Kartu RFID */}
      {editRfidStudent && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <CreditCard size={20} className="modal-icon" />
              <h3>Pasang / Ubah Kartu RFID</h3>
            </div>
            <p style={{fontSize:'0.88rem', color:'var(--text2)', marginBottom:16}}>
              Murid: <strong>{editRfidStudent.name}</strong> (NIS: {editRfidStudent.studentId} · Kelas: {editRfidStudent.kelas})
            </p>
            <div className="form-group">
              <label style={{display:'flex', justifyContent:'space-between'}}>
                <span>Nomor / UID Kartu RFID</span>
                <span style={{fontSize:'0.75rem', color:'#10b981', display:'flex', alignItems:'center', gap:4}}>
                  <Radio size={12} className="pulse" />
                  Scanner Siap: Tap kartu sekarang
                </span>
              </label>
              <div style={{display:'flex', gap:6}}>
                <input 
                  type="text" 
                  className="form-input" 
                  value={newRfidVal}
                  onChange={e => setNewRfidVal(e.target.value.trim().toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveRfid(editRfidStudent);
                    }
                  }}
                  placeholder="Tempelkan kartu fisik baru ke scanner..."
                  autoFocus
                  style={{
                    fontWeight: newRfidVal ? 600 : 'normal',
                    letterSpacing: newRfidVal ? '1px' : 'normal',
                    borderColor: newRfidVal ? '#10b981' : undefined
                  }}
                />
                {newRfidVal ? (
                  <button 
                    type="button" 
                    className="btn btn-outline"
                    onClick={() => setNewRfidVal('')}
                    title="Hapus / scan kartu lain"
                    style={{color:'#ef4444', borderColor:'rgba(239,68,68,0.3)', whiteSpace:'nowrap', fontSize:'0.82rem'}}
                  >
                    Hapus
                  </button>
                ) : (
                  <span style={{
                    display:'inline-flex',
                    alignItems:'center',
                    padding:'0 12px',
                    fontSize:'0.8rem',
                    color:'#10b981',
                    background:'rgba(16,185,129,0.1)',
                    borderRadius:8,
                    border:'1px solid rgba(16,185,129,0.25)',
                    whiteSpace:'nowrap'
                  }}>
                    <Radio size={12} className="pulse" style={{marginRight:4}} /> Scan Siap
                  </span>
                )}
              </div>
              <span className="form-hint">
                Tempelkan kartu baru pada scanner ESP32 atau USB, nomor kartu akan langsung terisi otomatis.
              </span>
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:20}}>
              <button className="btn btn-outline" onClick={() => setEditRfidStudent(null)}>Batal</button>
              <button className="btn btn-primary" onClick={() => handleSaveRfid(editRfidStudent)}>
                <CheckCircle size={16} /> Simpan Kartu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
