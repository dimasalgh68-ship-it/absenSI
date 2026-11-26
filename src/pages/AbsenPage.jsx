import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { 
  Camera, CheckCircle, XCircle, Loader, UserCheck, 
  CreditCard, Radio, ShieldCheck, AlertTriangle, ArrowRight,
  RefreshCw, Volume2, UserX, Sparkles
} from 'lucide-react';
import { getDescriptors, recordAttendance, getSettings, getStudentByRfid, getStudents } from '../api';
import { speakAI } from '../utils/aiVoice';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

// Audio feedback synthesizer
function playSound(type = 'success') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // 2-tone melodic chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'tap') {
      // Short friendly blip for card tap
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'already') {
      // Gentle double-tone notification for already checked in
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12); // A4
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else {
      // Low warning buzz for mismatch
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {}
}

// Menghitung Euclidean Distance antara 2 descriptor wajah (128-dimensi)
function getFaceDistance(desc1, desc2) {
  if (!desc1 || !desc2) return 1.0;
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export default function AbsenPage() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const rfidInputRef = useRef(null);

  // Mode: 'rfid' (RFID + Verifikasi Wajah) vs 'face_only' (Langsung Wajah)
  const [mode, setMode] = useState('rfid'); 

  // Step di mode RFID: 1 = Tap Kartu, 2 = Verifikasi Wajah, 3 = Berhasil/Selesai
  const [rfidStep, setRfidStep] = useState(1);
  const [cardCode, setCardCode] = useState('');
  const [cardStudent, setCardStudent] = useState(null);
  const [lookingUpCard, setLookingUpCard] = useState(false);
  const [mismatchError, setMismatchError] = useState(null);
  const [espOnline, setEspOnline] = useState(false);

  // Face-api & model state
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [allStudents, setAllStudents] = useState([]);
  const [descriptors, setDescriptors] = useState([]);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [settings, setSettings] = useState({ faceThreshold: 0.5, soundEnabled: true });
  const [countdown, setCountdown] = useState(null);

  const scanInterval = useRef(null);
  const countdownInterval = useRef(null);
  const isProcessingRef = useRef(false);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
    if (settings.aiVoiceEnabled === false && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [settings]);

  // Inisialisasi model dan data
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [,, sett, stuList] = await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          getSettings().catch(() => ({ faceThreshold: 0.5, soundEnabled: true })),
          getStudents().catch(() => []),
        ]);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        if (sett) setSettings(sett);
        if (stuList) setAllStudents(stuList);
        setModelsLoaded(true);
      } catch (e) {
        toast.error('Gagal memuat model AI');
        console.error(e);
      }
      setLoading(false);
    }
    init();
    return () => stopScan();
  }, []);

  // Load descriptors untuk mode face-only
  useEffect(() => {
    if (!modelsLoaded) return;
    loadDescriptors();
  }, [modelsLoaded, settings.faceThreshold]);

  // Auto focus input RFID setiap kali di Step 1
  useEffect(() => {
    if (mode === 'rfid' && rfidStep === 1) {
      const timer = setTimeout(() => {
        rfidInputRef.current?.focus();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [mode, rfidStep]);

  // Real-time SSE listener dari ESP8266 IoT RFID Reader
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
            if (data.found && data.student) {
              if (settings.soundEnabled !== false) playSound('tap');
              setCardStudent(data.student);
              setRfidStep(2);
              toast.success(`[ESP8266] Kartu terbaca: ${data.student.name}`);
              startRfidFaceVerification(data.student);
            } else {
              if (settings.soundEnabled !== false) playSound('error');
              toast.error(`[ESP8266] Kartu ${data.rfid || ''} belum terdaftar!`);
            }
          }
        } catch (e) {}
      };

      evtSource.onerror = () => {
        setEspOnline(false);
      };
    } catch (e) {}

    return () => {
      if (evtSource) evtSource.close();
    };
  }, [settings.soundEnabled]);

  async function loadDescriptors() {
    try {
      const data = await getDescriptors();
      if (!data || data.length === 0) return;
      const labeled = data.map(s => {
        const desc = new Float32Array(Object.values(s.descriptor));
        return new faceapi.LabeledFaceDescriptors(
          JSON.stringify({ id: s.id, name: s.name, studentId: s.studentId, kelas: s.kelas, rfid: s.rfid }),
          [desc]
        );
      });
      const threshold = settings.faceThreshold || 0.5;
      const matcher = new faceapi.FaceMatcher(labeled, threshold);
      setFaceMatcher(matcher);
      setDescriptors(data);
    } catch {
      console.error('Gagal memuat data descriptor');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // LANGKAH 1: PROSES TAP KARTU RFID
  // ══════════════════════════════════════════════════════════════
  async function handleRfidSubmit(e) {
    if (e) e.preventDefault();
    const code = cardCode.trim();
    if (!code) return;

    setLookingUpCard(true);
    setMismatchError(null);
    try {
      const student = await getStudentByRfid(code);
      if (settings.soundEnabled !== false) playSound('tap');
      setCardStudent(student);
      setRfidStep(2); // Lanjut ke Step 2: Verifikasi Wajah!
      toast.success(`Kartu terbaca: ${student.name}`);
      // Mulai verifikasi kamera
      startRfidFaceVerification(student);
    } catch (err) {
      if (settings.soundEnabled !== false) playSound('error');
      toast.error(err.message || 'Kartu RFID tidak terdaftar!');
      setCardCode('');
    }
    setLookingUpCard(false);
  }



  // ══════════════════════════════════════════════════════════════
  // LANGKAH 2: VERIFIKASI WAJAH BIOMETRIK TERHADAP PEMILIK KARTU
  // ══════════════════════════════════════════════════════════════
  function startRfidFaceVerification(targetStudent) {
    stopScan();
    setMismatchError(null);
    if (settings.autoCapture === false) {
      // Jika autoCapture dimatikan di Pengaturan, tunggu klik manual tombol Verifikasi
      setScanning(false);
      return;
    }
    setScanning(true);

    // Loop pendeteksi wajah setiap 700ms
    scanInterval.current = setInterval(() => {
      verifyFaceAgainstCardOwner(targetStudent);
    }, 700);
  }

  const verifyFaceAgainstCardOwner = useCallback(async (targetStudent) => {
    if (isProcessingRef.current) return;
    if (!webcamRef.current?.video || !targetStudent) return;
    const video = webcamRef.current.video;
    if (video.readyState !== 4) return;

    isProcessingRef.current = true;
    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        isProcessingRef.current = false;
        return;
      }

      // Gambar bounding box pada overlay canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        faceapi.matchDimensions(canvas, displaySize);
        const resized = faceapi.resizeResults(detection, displaySize);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawDetections(canvas, [resized]);
      }

      // Bandingkan descriptor wajah yang terdeteksi dengan descriptor targetStudent
      const registeredDesc = new Float32Array(Object.values(targetStudent.descriptor));
      const distance = getFaceDistance(detection.descriptor, registeredDesc);
      const threshold = settings.faceThreshold || 0.5;

      // KASUS 1: WAJAH COCOK DENGAN PEMILIK KARTU! (VERIFIKASI SUKSES)
      if (distance <= threshold) {
        stopScan();
        const confidence = Math.round((1 - distance) * 100);
        const photo = webcamRef.current?.getScreenshot();
        const nowHHMM = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
        const jamTerlambat = settings.jamTerlambat || '07:30';

        // Rekam kehadiran ke backend dengan metode RFID + Face
        try {
          const recRes = await recordAttendance({
            studentId: targetStudent.id,
            studentName: targetStudent.name,
            kelas: targetStudent.kelas,
            confidence,
            photo,
            method: 'rfid_face',
            rfid: targetStudent.rfid,
          });

          const savedTime = recRes?.record?.time || nowHHMM;
          const savedStatus = recRes?.record?.status || (savedTime > jamTerlambat ? 'Terlambat' : 'Tepat Waktu');

          setResult({
            status: 'hadir',
            name: targetStudent.name,
            studentId: targetStudent.studentId,
            kelas: targetStudent.kelas,
            rfid: targetStudent.rfid,
            confidence,
            method: 'rfid_face',
            time: savedTime,
            attendanceStatus: savedStatus,
            photo,
          });
          setRfidStep(3); // Tampilan sukses!

          const cur = settingsRef.current;
          if (cur.soundEnabled !== false) playSound('success');
          speakAI(
            savedStatus === 'Terlambat'
              ? `Terima kasih ${targetStudent.name}, absensi berhasil tercatat, namun Anda terlambat.`
              : `Terima kasih ${targetStudent.name}, absensi berhasil tercatat.`,
            {
              enabled: cur.aiVoiceEnabled !== false,
              voiceName: cur.aiVoiceName,
              rate: cur.aiVoiceRate,
              pitch: cur.aiVoicePitch,
            }
          );
          toast.success(`✅ Berhasil Masuk! ${targetStudent.name} tercatat jam ${savedTime} WIB (${savedStatus})`, { duration: 4000 });

          // Countdown otomatis kembali ke Step 1
          startAutoResetCountdown();
          return;
        } catch (err) {
          if (err.code === 'ALREADY') {
            const prevTime = err.record?.time || '—';
            const prevStatus = err.record?.status || 'Tepat Waktu';
            setResult({
              status: 'sudah',
              name: targetStudent.name,
              studentId: targetStudent.studentId,
              kelas: targetStudent.kelas,
              rfid: targetStudent.rfid,
              confidence,
              method: 'rfid_face',
              time: prevTime,
              attendanceStatus: prevStatus,
            });
            setRfidStep(3);
            const cur = settingsRef.current;
            if (cur.soundEnabled !== false) playSound('already');
            speakAI(`Halo ${targetStudent.name}, Anda sudah absen hari ini`, {
              enabled: cur.aiVoiceEnabled !== false,
              voiceName: cur.aiVoiceName,
              rate: cur.aiVoiceRate,
              pitch: cur.aiVoicePitch,
            });
            toast(`⚠️ ${targetStudent.name} sudah absen hari ini (Jam ${prevTime} WIB)`, { icon: '⚠️', duration: 4000 });
            startAutoResetCountdown();
            return;
          } else {
            toast.error('Gagal mencatat absensi: ' + err.message);
          }
        }
      } 
      // KASUS 2: WAJAH TIDAK COCOK DENGAN PEMILIK KARTU (TITIP ABSEN TERDETEKSI!)
      else if (distance > threshold + 0.1) {
        setMismatchError({
          detectedDistance: distance.toFixed(2),
          ownerName: targetStudent.name,
        });
        if (settings.soundEnabled !== false) playSound('error');
      }
    } catch (err) {
      console.error('Error saat verifikasi biometrik:', err);
    }
    isProcessingRef.current = false;
  }, [settings.faceThreshold, settings.jamTerlambat, settings.soundEnabled]);

  function startAutoResetCountdown() {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    let count = 4;
    setCountdown(count);
    countdownInterval.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
        resetToStep1();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }

  function resetToStep1() {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    isProcessingRef.current = false;
    stopScan();
    setRfidStep(1);
    setCardCode('');
    setCardStudent(null);
    setResult(null);
    setMismatchError(null);
    setCountdown(null);
  }

  // ══════════════════════════════════════════════════════════════
  // MODE 2: ABSENSI HANYA WAJAH (FALLBACK / TANPA KARTU)
  // ══════════════════════════════════════════════════════════════
  function startFaceOnlyScan() {
    if (!faceMatcher) return toast.error('Data murid belum dimuat.');
    setScanning(true);
    setResult(null);
    scanInterval.current = setInterval(detectFaceDirect, 800);
  }

  const detectFaceDirect = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (!webcamRef.current?.video || !faceMatcher) return;
    const video = webcamRef.current.video;
    if (video.readyState !== 4) return;

    isProcessingRef.current = true;
    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        isProcessingRef.current = false;
        return;
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        faceapi.matchDimensions(canvas, displaySize);
        const resized = faceapi.resizeResults(detection, displaySize);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawDetections(canvas, [resized]);
      }

      const match = faceMatcher.findBestMatch(detection.descriptor);
      if (match.label === 'unknown') {
        isProcessingRef.current = false;
        return;
      }

      stopScan();
      const info = JSON.parse(match.label);
      const confidence = Math.round((1 - match.distance) * 100);
      const photo = webcamRef.current?.getScreenshot();
      const nowHHMM = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
      const jamTerlambat = settings.jamTerlambat || '07:30';

      try {
        const recRes = await recordAttendance({
          studentId: info.id,
          studentName: info.name,
          kelas: info.kelas,
          confidence,
          photo,
          method: 'face_only',
          rfid: info.rfid || null,
        });
        const savedTime = recRes?.record?.time || nowHHMM;
        const savedStatus = recRes?.record?.status || (savedTime > jamTerlambat ? 'Terlambat' : 'Tepat Waktu');

        setResult({ status: 'hadir', ...info, confidence, method: 'face_only', photo, time: savedTime, attendanceStatus: savedStatus });
        if (settings.soundEnabled !== false) playSound('success');
        toast.success(`✅ Berhasil Masuk! ${info.name} tercatat jam ${savedTime} WIB (${savedStatus})`, { duration: 4000 });
        isProcessingRef.current = false;
        return;
      } catch (e) {
        if (e.code === 'ALREADY') {
          const prevTime = e.record?.time || '—';
          const prevStatus = e.record?.status || 'Tepat Waktu';
          setResult({ status: 'sudah', ...info, confidence, method: 'face_only', time: prevTime, attendanceStatus: prevStatus });
          if (settings.soundEnabled !== false) playSound('already');
          toast(`⚠️ ${info.name} sudah absen hari ini (Jam ${prevTime} WIB)`, { icon: '⚠️', duration: 4000 });
          isProcessingRef.current = false;
          return;
        } else {
          toast.error('Gagal mencatat kehadiran.');
        }
      }
    } catch (err) {
      console.error(err);
    }
    isProcessingRef.current = false;
  }, [faceMatcher, settings.jamTerlambat, settings.soundEnabled]);

  function stopScan() {
    setScanning(false);
    if (scanInterval.current) {
      clearInterval(scanInterval.current);
      scanInterval.current = null;
    }
    // Bersihkan canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  return (
    <div className="page">
      {/* Header Halaman & Pemilih Mode */}
      <div className="page-header" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <h1 style={{margin:0}}><ShieldCheck size={28} /> Absensi Pintar (RFID + Wajah)</h1>
            <span style={{
              display:'inline-flex',
              alignItems:'center',
              gap:6,
              fontSize:'0.75rem',
              fontWeight:600,
              padding:'4px 10px',
              borderRadius:20,
              background: espOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.12)',
              color: espOnline ? '#10b981' : '#f87171',
              border: `1px solid ${espOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: espOnline ? '#10b981' : '#f87171',
                boxShadow: espOnline ? '0 0 8px #10b981' : 'none'
              }} />
              {espOnline ? 'ESP8266 IoT Online' : 'ESP8266 Menunggu Sambungan'}
            </span>
          </div>
          <p className="page-desc" style={{marginTop: 6}}>Sistem absensi aman 2-faktor: Tempelkan kartu RFID murid ke ESP8266/USB, lalu verifikasi wajah biometrik di depan kamera.</p>
        </div>

        {/* Tab Pemilih Mode */}
        <div className="absen-mode-switcher">
          <button 
            className={`mode-btn ${mode === 'rfid' ? 'active' : ''}`}
            onClick={() => { setMode('rfid'); resetToStep1(); }}
          >
            <CreditCard size={16} /> Kartu RFID + Wajah (2FA)
          </button>
          <button 
            className={`mode-btn ${mode === 'face_only' ? 'active' : ''}`}
            onClick={() => { setMode('face_only'); stopScan(); setResult(null); }}
          >
            <Camera size={16} /> Hanya Wajah (Tanpa Kartu)
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODE 1: KARTU RFID + VERIFIKASI WAJAH (DEFAULT)               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {mode === 'rfid' && (
        <div className="rfid-absen-container">
          
          {/* Step Progress Tracker */}
          <div className="stepper-bar">
            <div className={`step-item ${rfidStep === 1 ? 'current' : rfidStep > 1 ? 'completed' : ''}`}>
              <div className="step-num">{rfidStep > 1 ? '✓' : '1'}</div>
              <div className="step-text">
                <div className="step-title">Tempelkan Kartu RFID</div>
                <div className="step-sub">Tap kartu pelajar / UID</div>
              </div>
            </div>
            <div className="step-arrow"><ArrowRight size={18} /></div>
            <div className={`step-item ${rfidStep === 2 ? 'current' : rfidStep > 2 ? 'completed' : ''}`}>
              <div className="step-num">{rfidStep > 2 ? '✓' : '2'}</div>
              <div className="step-text">
                <div className="step-title">Verifikasi Wajah Biometrik</div>
                <div className="step-sub">Mencocokkan dengan pemilik kartu</div>
              </div>
            </div>
            <div className="step-arrow"><ArrowRight size={18} /></div>
            <div className={`step-item ${rfidStep === 3 ? 'completed' : ''}`}>
              <div className="step-num">3</div>
              <div className="step-text">
                <div className="step-title">Absensi Terverifikasi</div>
                <div className="step-sub">Data kehadiran tersimpan</div>
              </div>
            </div>
          </div>

          {/* ── STEP 1: TAP KARTU RFID ── */}
          {rfidStep === 1 && (
            <div className="rfid-tap-section">
              <div className="rfid-reader-box">
                <div className="nfc-pulse-ring">
                  <div className="nfc-icon-wrap">
                    <Radio size={48} className="nfc-icon pulse" />
                  </div>
                </div>

                <h2>Silakan Tempelkan Kartu RFID Anda</h2>
                <p>Dekatkan kartu pelajar ke sensor RFID reader USB, atau masukkan nomor UID kartu di bawah ini:</p>

                <form onSubmit={handleRfidSubmit} className="rfid-input-form">
                  <div className="rfid-field-wrap">
                    <CreditCard size={20} className="rfid-field-icon" />
                    <input 
                      ref={rfidInputRef}
                      type="text" 
                      className="form-input rfid-scanner-input"
                      value={cardCode}
                      onChange={e => setCardCode(e.target.value)}
                      placeholder="Menunggu scan kartu RFID / ketik UID..."
                      autoFocus
                      disabled={lookingUpCard}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={lookingUpCard || !cardCode.trim()}>
                    {lookingUpCard ? <Loader size={16} className="spin" /> : 'Proses Kartu'}
                  </button>
                </form>

                <div className="rfid-hardware-hint">
                  <span className="dot-live"></span>
                  <span>Reader USB Siap Menerima Input (Mendukung RC522, USB HID, Barcode, NFC)</span>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: VERIFIKASI WAJAH PEMILIK KARTU ── */}
          {rfidStep === 2 && cardStudent && (
            <div className="rfid-verify-layout">
              {/* Kolom Kiri: Info Pemilik Kartu */}
              <div className="card-owner-panel">
                <div className="owner-badge">
                  <CreditCard size={16} /> Kartu RFID Terdeteksi
                </div>

                <div className="owner-photo-box">
                  {cardStudent.photo ? (
                    <img src={cardStudent.photo} alt={cardStudent.name} className="owner-photo" />
                  ) : (
                    <div className="owner-avatar-big">{cardStudent.name[0]}</div>
                  )}
                  <div className="owner-label">Foto Biometrik Terdaftar</div>
                </div>

                <div className="owner-details">
                  <h3>{cardStudent.name}</h3>
                  <div className="owner-meta-row">
                    <span>NIS: <strong>{cardStudent.studentId}</strong></span>
                    <span>·</span>
                    <span>Kelas: <strong>{cardStudent.kelas}</strong></span>
                  </div>
                  <div className="owner-rfid-tag">
                    UID: {cardStudent.rfid}
                  </div>
                </div>

                <div className="verification-instruction">
                  <div className="pulse-dot"></div>
                  <span>Arahkan wajah Anda ke kamera untuk mencocokkan identitas.</span>
                </div>

                <button 
                  className="btn btn-outline btn-full"
                  style={{marginTop:16}}
                  onClick={resetToStep1}
                >
                  Ganti / Batalkan Kartu
                </button>
              </div>

              {/* Kolom Kanan: Kamera Live Verification */}
              <div className="camera-verify-panel">
                {mismatchError && (
                  <div className="mismatch-alert-banner">
                    <UserX size={24} />
                    <div>
                      <strong>PERINGATAN: WAJAH TIDAK COCOK!</strong>
                      <p>Wajah di depan kamera berbeda dengan pemilik kartu (<strong>{mismatchError.ownerName}</strong>). Anti-titip absen aktif.</p>
                    </div>
                  </div>
                )}

                <div className="webcam-wrap">
                  <Webcam
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    screenshotQuality={0.8}
                    mirrored
                    videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
                    className="webcam"
                  />
                  <canvas ref={canvasRef} className="face-canvas" />

                  <div className="face-guide scanning">
                    <div className="guide-corner tl" /><div className="guide-corner tr" />
                    <div className="guide-corner bl" /><div className="guide-corner br" />
                  </div>
                </div>

                {settings.autoCapture === false ? (
                  <div style={{marginTop:12, textAlign:'center'}}>
                    <button
                      className="btn btn-primary"
                      onClick={() => verifyFaceAgainstCardOwner(cardStudent)}
                    >
                      <Camera size={16} /> Verifikasi Wajah Sekarang
                    </button>
                  </div>
                ) : (
                  <div className="camera-status-strip">
                    <Loader size={16} className="spin" />
                    <span>Membandingkan fitur wajah dengan foto kartu {cardStudent.name}...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: HASIL VERIFIKASI SELESAI ── */}
          {rfidStep === 3 && result && (
            <div className="rfid-success-card">
              {result.status === 'hadir' ? (
                <>
                  <div className="success-icon-wrap">
                    <CheckCircle size={72} color="var(--success)" />
                  </div>
                  <h2 style={{color:'var(--success)', marginTop:12}}>VERIFIKASI SUKSES!</h2>
                  <p className="success-sub">Kartu RFID dan Wajah Murid Terbukti Cocok 100%.</p>

                  <div className="verification-badge-pill" style={{
                    background: result.attendanceStatus === 'Terlambat' ? 'rgba(245, 158, 11, 0.15)' : undefined,
                    color: result.attendanceStatus === 'Terlambat' ? '#d97706' : undefined,
                    borderColor: result.attendanceStatus === 'Terlambat' ? 'rgba(245, 158, 11, 0.35)' : undefined
                  }}>
                    <ShieldCheck size={16} /> Kehadiran Tercatat · {result.attendanceStatus || 'Tepat Waktu'} ({result.time || '—'} WIB)
                  </div>

                  <div className="success-summary-box">
                    <div className="summary-col">
                      <div className="summary-label">Nama Murid</div>
                      <div className="summary-val">{result.name}</div>
                    </div>
                    <div className="summary-col">
                      <div className="summary-label">NIS & Kelas</div>
                      <div className="summary-val">{result.studentId} · Kelas {result.kelas}</div>
                    </div>
                    <div className="summary-col">
                      <div className="summary-label">Nomor Kartu RFID</div>
                      <div className="summary-val">{result.rfid || '-'}</div>
                    </div>
                    <div className="summary-col">
                      <div className="summary-label">Tingkat Kemiripan (Confidence)</div>
                      <div className="summary-val" style={{color:'var(--success)'}}>{result.confidence}%</div>
                    </div>
                  </div>

                  {countdown !== null && (
                    <div className="auto-countdown-text">
                      Otomatis kembali ke scan kartu dalam <strong>{countdown}</strong> detik...
                    </div>
                  )}

                  <div style={{marginTop:20, display:'flex', gap:10, justifyContent:'center'}}>
                    <button className="btn btn-primary" onClick={resetToStep1}>
                      <CreditCard size={16} /> Scan Kartu Murid Berikutnya
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="success-icon-wrap">
                    <AlertTriangle size={72} color="var(--warn)" />
                  </div>
                  <h2 style={{color:'var(--warn)', marginTop:12}}>SUDAH ABSEN HARI INI</h2>
                  <p className="success-sub">
                    Murid <strong>{result.name}</strong> sudah melakukan absensi masuk hari ini pada jam <strong>{result.time} WIB</strong>.
                  </p>

                  <div className="success-summary-box" style={{borderColor:'rgba(245, 158, 11, 0.3)', background:'rgba(245, 158, 11, 0.06)'}}>
                    <div className="summary-col">
                      <div className="summary-label">Nama Murid</div>
                      <div className="summary-val">{result.name}</div>
                    </div>
                    <div className="summary-col">
                      <div className="summary-label">NIS & Kelas</div>
                      <div className="summary-val">{result.studentId} · Kelas {result.kelas}</div>
                    </div>
                    <div className="summary-col">
                      <div className="summary-label">Jam Masuk Tercatat</div>
                      <div className="summary-val" style={{color:'var(--warn)'}}>{result.time} WIB</div>
                    </div>
                    <div className="summary-col">
                      <div className="summary-label">Status Kehadiran</div>
                      <div className="summary-val">{result.attendanceStatus || 'Tepat Waktu'}</div>
                    </div>
                  </div>

                  {countdown !== null && (
                    <div className="auto-countdown-text">
                      Otomatis kembali ke scan kartu dalam <strong>{countdown}</strong> detik...
                    </div>
                  )}

                  <div style={{marginTop:20, display:'flex', gap:10, justifyContent:'center'}}>
                    <button className="btn btn-outline" onClick={resetToStep1}>
                      Scan Kartu Lain
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODE 2: ABSENSI HANYA WAJAH (FALLBACK / MANUAL)                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {mode === 'face_only' && (
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

            <div className={`face-guide ${scanning ? 'scanning' : ''}`}>
              <div className="guide-corner tl" /><div className="guide-corner tr" />
              <div className="guide-corner bl" /><div className="guide-corner br" />
            </div>

            <div className="camera-controls">
              {!scanning ? (
                <button
                  className="btn btn-primary btn-lg"
                  onClick={startFaceOnlyScan}
                  disabled={!modelsLoaded || descriptors.length === 0}
                >
                  <Camera size={20} /> Mulai Scan Wajah
                </button>
              ) : (
                <button className="btn btn-outline btn-lg" onClick={stopScan}>
                  Berhenti
                </button>
              )}
              {scanning && <span className="scan-label pulse">🔍 Mengenali wajah...</span>}
            </div>
          </div>

          {/* Panel Hasil */}
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
                  <span>Metode: Hanya Wajah</span>
                </div>
                <div className="result-badge success">✅ Hadir Tercatat</div>
                <button className="btn btn-outline mt" onClick={() => { setResult(null); startFaceOnlyScan(); }}>
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
                <button className="btn btn-outline mt" onClick={() => { setResult(null); startFaceOnlyScan(); }}>
                  Scan Murid Lain
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
