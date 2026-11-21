import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { UserPlus, Camera, CheckCircle, Trash2, Loader } from 'lucide-react';
import { registerStudent, getStudents, deleteStudent } from '../api';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

export default function DaftarPage() {
  const webcamRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ name: '', studentId: '', kelas: '' });
  const [preview, setPreview] = useState(null);
  const [capturedDesc, setCapturedDesc] = useState(null);

  useEffect(() => {
    loadModels();
    fetchStudents();
  }, []);

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
    try { setStudents(await getStudents()); } catch { toast.error('Gagal memuat data murid'); }
  }

  async function capturePhoto() {
    if (!modelsLoaded) return toast.error('Model AI belum siap');
    setCapturing(true);
    try {
      const img = webcamRef.current?.getScreenshot();
      if (!img) throw new Error('Tidak ada gambar');

      // Buat elemen img untuk face-api
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

    try {
      const res = await registerStudent({
        ...form,
        descriptor: capturedDesc,
        photo: preview,
      });
      if (res.error) return toast.error(res.error);
      toast.success(`${form.name} berhasil didaftarkan!`);
      setForm({ name: '', studentId: '', kelas: '' });
      setPreview(null);
      setCapturedDesc(null);
      fetchStudents();
    } catch { toast.error('Gagal mendaftarkan murid'); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Hapus ${name}?`)) return;
    try {
      await deleteStudent(id);
      toast.success(`${name} dihapus`);
      fetchStudents();
    } catch { toast.error('Gagal menghapus'); }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1><UserPlus size={28} /> Daftar Murid</h1>
        <p className="page-desc">Daftarkan murid dengan foto wajah untuk absensi otomatis.</p>
      </div>

      <div className="daftar-layout">
        {/* Form Pendaftaran */}
        <div className="form-card">
          <h2>Pendaftaran Baru</h2>

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
                  {capturing ? <><Loader size={16} className="spin" /> Mendeteksi...</> : <><Camera size={16} /> Ambil Foto</>}
                </button>
              </>
            ) : (
              <div className="preview-wrap">
                <img src={preview} alt="preview" className="photo-preview" />
                <div className="preview-ok"><CheckCircle size={20} /> Wajah terdeteksi</div>
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
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Contoh: Budi Santoso" required />
            </div>
            <div className="form-group">
              <label>ID / NIS Murid *</label>
              <input className="form-input" value={form.studentId} onChange={e => setForm(f => ({...f, studentId: e.target.value}))} placeholder="Contoh: 2024001" required />
            </div>
            <div className="form-group">
              <label>Kelas</label>
              <input className="form-input" value={form.kelas} onChange={e => setForm(f => ({...f, kelas: e.target.value}))} placeholder="Contoh: 10A" />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={!capturedDesc}>
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
                  <div className="student-avatar">{s.name[0]}</div>
                  <div className="student-info">
                    <div className="student-name">{s.name}</div>
                    <div className="student-meta">NIS: {s.studentId} · Kelas: {s.kelas}</div>
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
    </div>
  );
}
