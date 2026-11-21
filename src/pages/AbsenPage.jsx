import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { Camera, CheckCircle, XCircle, Loader, UserCheck } from 'lucide-react';
import { getDescriptors, recordAttendance } from '../api';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const MATCH_THRESHOLD = 0.5; // semakin kecil = semakin ketat

export default function AbsenPage() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { status, name, confidence }
  const [descriptors, setDescriptors] = useState([]);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [scanning, setScanning] = useState(false);
  const scanInterval = useRef(null);

  // Load model face-api.js
  useEffect(() => {
    async function loadModels() {
      setLoading(true);
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (e) {
        toast.error('Gagal memuat model AI. Cek koneksi internet.');
        console.error(e);
      }
      setLoading(false);
    }
    loadModels();
    return () => stopScan();
  }, []);

  // Load descriptors murid dari server
  useEffect(() => {
    if (!modelsLoaded) return;
    loadDescriptors();
  }, [modelsLoaded]);

  async function loadDescriptors() {
    try {
      const data = await getDescriptors();
      if (data.length === 0) {
        toast('Belum ada murid terdaftar. Daftarkan dulu di menu Daftar Murid.', { icon: '⚠️' });
        return;
      }
      const labeled = data.map(s => {
        const desc = new Float32Array(Object.values(s.descriptor));
        return new faceapi.LabeledFaceDescriptors(
          JSON.stringify({ id: s.id, name: s.name, studentId: s.studentId, kelas: s.kelas }),
          [desc]
        );
      });
      const matcher = new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD);
      setFaceMatcher(matcher);
      setDescriptors(data);
    } catch {
      toast.error('Gagal memuat data murid dari server.');
    }
  }

  // Mulai scan wajah otomatis
  function startScan() {
    if (!faceMatcher) {
      toast.error('Data murid belum dimuat.');
      return;
    }
    setScanning(true);
    setResult(null);
    scanInterval.current = setInterval(detectFace, 800);
  }

  function stopScan() {
    setScanning(false);
    clearInterval(scanInterval.current);
  }

  const detectFace = useCallback(async () => {
    if (!webcamRef.current?.video || !faceMatcher) return;
    const video = webcamRef.current.video;
    if (video.readyState !== 4) return;

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) return;

    // Gambar kotak wajah di canvas overlay
    const canvas = canvasRef.current;
    if (canvas) {
      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      faceapi.matchDimensions(canvas, displaySize);
      const resized = faceapi.resizeResults(detection, displaySize);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      faceapi.draw.drawDetections(canvas, [resized]);
    }

    // Cocokkan dengan database
    const match = faceMatcher.findBestMatch(detection.descriptor);
    if (match.label === 'unknown') return;

    stopScan();
    const info = JSON.parse(match.label);
    const confidence = Math.round((1 - match.distance) * 100);

    // Ambil snapshot
    const photo = webcamRef.current?.getScreenshot();

    // Kirim ke server
    try {
      await recordAttendance({
        studentId: info.id,
        studentName: info.name,
        kelas: info.kelas,
        confidence,
        photo,
      });
      setResult({ status: 'hadir', ...info, confidence });
      toast.success(`✅ ${info.name} berhasil absen!`);
    } catch (e) {
      if (e.code === 'ALREADY') {
        setResult({ status: 'sudah', ...info, confidence });
        toast(`${info.name} sudah absen hari ini`, { icon: '⚠️' });
      } else {
        toast.error('Gagal mencatat kehadiran.');
      }
    }
  }, [faceMatcher]);

  return (
    <div className="page">
      <div className="page-header">
        <h1><Camera size={28} /> Absensi Selfie</h1>
        <p className="page-desc">Arahkan wajah ke kamera. Sistem akan mengenali dan mencatat kehadiran otomatis.</p>
      </div>

      <div className="absen-layout">
        {/* Kamera */}
        <div className="camera-box">
          {loading && (
            <div className="camera-overlay">
              <Loader size={40} className="spin" />
              <p>Memuat model AI...</p>
            </div>
          )}

          <div className="webcam-wrap">
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.6}
              mirrored
              videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
              className="webcam"
            />
            <canvas ref={canvasRef} className="face-canvas" />
          </div>

          {/* Frame guide */}
          <div className={`face-guide ${scanning ? 'scanning' : ''}`}>
            <div className="guide-corner tl" /><div className="guide-corner tr" />
            <div className="guide-corner bl" /><div className="guide-corner br" />
          </div>

          <div className="camera-controls">
            {!scanning ? (
              <button
                className="btn btn-primary btn-lg"
                onClick={startScan}
                disabled={!modelsLoaded || descriptors.length === 0}
              >
                <Camera size={20} /> Mulai Scan
              </button>
            ) : (
              <button className="btn btn-outline btn-lg" onClick={stopScan}>
                Berhenti
              </button>
            )}
            {scanning && <span className="scan-label pulse">🔍 Mengenali wajah...</span>}
          </div>
        </div>

        {/* Hasil */}
        <div className="result-panel">
          {!result && (
            <div className="result-empty">
              <UserCheck size={64} className="result-empty-icon" />
              <p>Hasil pengenalan wajah akan muncul di sini</p>
              {descriptors.length > 0 && (
                <span className="chip">{descriptors.length} murid terdaftar</span>
              )}
            </div>
          )}

          {result && result.status === 'hadir' && (
            <div className="result-card result-success">
              <CheckCircle size={56} className="result-icon" />
              <h2>{result.name}</h2>
              <div className="result-meta">
                <span>ID: {result.studentId}</span>
                <span>Kelas: {result.kelas}</span>
                <span>Confidence: {result.confidence}%</span>
                <span>Waktu: {new Date().toLocaleTimeString('id-ID')}</span>
              </div>
              <div className="result-badge success">✅ Hadir Tercatat</div>
              <button className="btn btn-outline mt" onClick={() => { setResult(null); startScan(); }}>
                Scan Murid Berikutnya
              </button>
            </div>
          )}

          {result && result.status === 'sudah' && (
            <div className="result-card result-warn">
              <XCircle size={56} className="result-icon" />
              <h2>{result.name}</h2>
              <div className="result-meta">
                <span>ID: {result.studentId}</span>
                <span>Kelas: {result.kelas}</span>
              </div>
              <div className="result-badge warn">⚠️ Sudah Absen Hari Ini</div>
              <button className="btn btn-outline mt" onClick={() => { setResult(null); startScan(); }}>
                Scan Murid Lain
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
