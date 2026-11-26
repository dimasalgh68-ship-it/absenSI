import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { 
  Radio, ShieldCheck, CheckCircle, XCircle, Clock, 
  Calendar, School, Users, Maximize, Minimize, LogOut,
  CreditCard, Loader, AlertTriangle, Sparkles, UserX,
  Volume2, VolumeX, Eye
} from 'lucide-react';
import { 
  getDescriptors, recordAttendance, getSettings, 
  getStudentByRfid, getAttendance, getStudents 
} from '../api';
import { speakAI } from '../utils/aiVoice';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

function playSound(type = 'success') {
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
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'tap') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'already') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {}
}

function getFaceDistance(desc1, desc2) {
  if (!desc1 || !desc2) return 1.0;
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export default function TvKioskPage() {
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const rfidInputRef = useRef(null);

  // Status & Pengaturan
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settings, setSettings] = useState({
    schoolName: 'SMA Negeri 1 Indonesia',
    jamTerlambat: '07:30',
    faceThreshold: 0.5,
    soundEnabled: true,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Step Kiosk: 1 = Tap Kartu, 2 = Verifikasi Wajah, 3 = Sukses/Hasil
  const [step, setStep] = useState(1);
  const [cardCode, setCardCode] = useState('');
  const [cardStudent, setCardStudent] = useState(null);
  const [lookingUpCard, setLookingUpCard] = useState(false);
  const [mismatchError, setMismatchError] = useState(null);

  // Hasil & History Hari Ini
  const [todayRecords, setTodayRecords] = useState([]);
  const [recentResult, setRecentResult] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [allStudents, setAllStudents] = useState([]);
  const [espOnline, setEspOnline] = useState(false);

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

  // Jam berdetak setiap detik + dengarkan update pengaturan real-time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    let bc = null;
    try {
      bc = new BroadcastChannel('absensi_settings');
      bc.onmessage = (e) => {
        if (e.data) setSettings(prev => ({ ...prev, ...e.data }));
      };
    } catch {}
    return () => {
      clearInterval(timer);
      if (bc) bc.close();
    };
  }, []);

  // Hubungkan ke Real-time SSE Stream dari Server (ESP8266 IoT Scanner)
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
              const cur = settingsRef.current;
              if (cur.soundEnabled !== false) playSound('tap');
              speakAI(`Halo ${data.student.name}, silakan lihat ke kamera`, {
                enabled: cur.aiVoiceEnabled !== false,
                voiceName: cur.aiVoiceName,
                rate: cur.aiVoiceRate,
                pitch: cur.aiVoicePitch,
              });
              setCardStudent(data.student);
              setStep(2);
              toast.success(`[ESP32/8266] Kartu terbaca: ${data.student.name}`, {
                style: { fontSize: '1.1rem', padding: '14px 20px' }
              });
              startFaceVerification(data.student);
            } else {
              const cur = settingsRef.current;
              if (cur.soundEnabled !== false) playSound('error');
              speakAI('Maaf, kartu belum terdaftar', {
                enabled: cur.aiVoiceEnabled !== false,
                voiceName: cur.aiVoiceName,
                rate: cur.aiVoiceRate,
                pitch: cur.aiVoicePitch,
              });
              toast.error(`[ESP32/8266] Kartu RFID ${data.uid} belum terdaftar!`, {
                style: { fontSize: '1.1rem', padding: '14px 20px' }
              });
            }
          }
        } catch (e) {
          console.error('Error parsing SSE event:', e);
        }
      };

      evtSource.onerror = () => {
        setEspOnline(false);
      };
    } catch {}

    return () => {
      if (evtSource) evtSource.close();
    };
  }, [settings.soundEnabled]);

  // Inisialisasi Kiosk: Muat Model AI, Pengaturan, Data Murid & Absensi Hari Ini
  useEffect(() => {
    async function initKiosk() {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const [sett, recs, students] = await Promise.all([
          getSettings().catch(() => null),
          getAttendance(todayStr).catch(() => []),
          getStudents().catch(() => []),
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (sett) setSettings(sett);
        if (recs) setTodayRecords(recs);
        if (students) setAllStudents(students);
        setModelsLoaded(true);
      } catch (e) {
        console.error('Error inisialisasi kiosk TV:', e);
      }
    }
    initKiosk();
    return () => stopScan();
  }, []);

  // Auto focus input RFID reader
  useEffect(() => {
    if (step === 1) {
      const timer = setTimeout(() => {
        rfidInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Fullscreen toggle handler
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  // ══════════════════════════════════════════════════════════════
  // LANGKAH 1: PROSES TAP KARTU RFID DI LAYAR TV
  // ══════════════════════════════════════════════════════════════
  async function handleCardSubmit(e) {
    if (e) e.preventDefault();
    const code = cardCode.trim();
    if (!code) return;

    setLookingUpCard(true);
    setMismatchError(null);
    try {
      const student = await getStudentByRfid(code);
      if (settings.soundEnabled !== false) playSound('tap');
      setCardStudent(student);
      setStep(2); // Pindah ke Langkah 2: Verifikasi Wajah!
      startFaceVerification(student);
    } catch (err) {
      if (settings.soundEnabled !== false) playSound('error');
      toast.error(err.message || 'Kartu RFID tidak ditemukan!', {
        style: { fontSize: '1.2rem', padding: '16px 24px', maxWidth: '500px' }
      });
      setCardCode('');
    }
    setLookingUpCard(false);
  }



  // ══════════════════════════════════════════════════════════════
  // LANGKAH 2: VERIFIKASI BIOMETRIK DI KAMERA TV
  // ══════════════════════════════════════════════════════════════
  function startFaceVerification(targetStudent) {
    stopScan();
    setMismatchError(null);

    scanInterval.current = setInterval(() => {
      verifyFace(targetStudent);
    }, 600);
  }

  const verifyFace = useCallback(async (targetStudent) => {
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

      // Draw bounding box
      const canvas = canvasRef.current;
      if (canvas) {
        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        faceapi.matchDimensions(canvas, displaySize);
        const resized = faceapi.resizeResults(detection, displaySize);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawDetections(canvas, [resized]);
      }

      const registeredDesc = new Float32Array(Object.values(targetStudent.descriptor));
      const distance = getFaceDistance(detection.descriptor, registeredDesc);
      const threshold = settings.faceThreshold || 0.5;

      // KASUS 1: COCOK!
      if (distance <= threshold) {
        stopScan();
        const confidence = Math.round((1 - distance) * 100);
        const photo = webcamRef.current?.getScreenshot();

        // Cek keterlambatan
        const nowHourMin = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
        const isLate = settings.jamTerlambat ? (nowHourMin > settings.jamTerlambat) : false;

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

          const savedTime = recRes.record?.time || nowHourMin;
          const savedLate = recRes.record?.status ? (recRes.record.status === 'Terlambat') : isLate;

          const recordData = {
            status: 'hadir',
            name: targetStudent.name,
            studentId: targetStudent.studentId,
            kelas: targetStudent.kelas,
            rfid: targetStudent.rfid,
            confidence,
            photo,
            time: savedTime,
            isLate: savedLate,
          };

          setRecentResult(recordData);
          setStep(3); // Tampilan Sukses Layar Lebar!

          const cur = settingsRef.current;
          if (cur.soundEnabled !== false) playSound('success');
          speakAI(
            savedLate
              ? `Terima kasih ${targetStudent.name}, absensi berhasil tercatat, namun Anda terlambat hari ini.`
              : `Terima kasih ${targetStudent.name}, absensi berhasil tercatat. Selamat belajar!`,
            {
              enabled: cur.aiVoiceEnabled !== false,
              voiceName: cur.aiVoiceName,
              rate: cur.aiVoiceRate,
              pitch: cur.aiVoicePitch,
            }
          );

          // Refresh history hari ini
          const todayStr = new Date().toISOString().slice(0, 10);
          getAttendance(todayStr).then(setTodayRecords).catch(() => {});

          // Auto reset countdown (4 detik)
          startCountdown();
          return;
        } catch (err) {
          if (err.code === 'ALREADY') {
            const prevTime = err.record?.time || nowHourMin;
            const prevStatus = err.record?.status || 'Tepat Waktu';
            setRecentResult({
              status: 'sudah',
              name: targetStudent.name,
              studentId: targetStudent.studentId,
              kelas: targetStudent.kelas,
              rfid: targetStudent.rfid,
              confidence,
              time: prevTime,
              prevStatus,
            });
            setStep(3);
            const cur = settingsRef.current;
            if (cur.soundEnabled !== false) playSound('already');
            speakAI(`Halo ${targetStudent.name}, Anda sudah absen hari ini pada jam ${prevTime}`, {
              enabled: cur.aiVoiceEnabled !== false,
              voiceName: cur.aiVoiceName,
              rate: cur.aiVoiceRate,
              pitch: cur.aiVoicePitch,
            });
            startCountdown();
            return;
          } else {
            toast.error(err.message);
          }
        }
      } 
      // KASUS 2: WAJAH BEDA
      else if (distance > threshold + 0.1) {
        setMismatchError({
          detectedDistance: distance.toFixed(2),
          ownerName: targetStudent.name,
        });
        if (settings.soundEnabled !== false) playSound('error');
      }
    } catch (e) {
      console.error(e);
    }
    isProcessingRef.current = false;
  }, [settings.faceThreshold, settings.jamTerlambat, settings.soundEnabled]);

  function startCountdown() {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    let count = 4;
    setCountdown(count);
    countdownInterval.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
        resetKiosk();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }

  function resetKiosk() {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    isProcessingRef.current = false;
    stopScan();
    setStep(1);
    setCardCode('');
    setCardStudent(null);
    setRecentResult(null);
    setMismatchError(null);
    setCountdown(null);
  }

  function stopScan() {
    if (scanInterval.current) {
      clearInterval(scanInterval.current);
      scanInterval.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Format jam dan tanggal
  const timeString = currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');
  const dateString = currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Coba atur kamera ke zoom 0.5x (wide) jika hardware kamera mendukung
  function handleCameraReady(stream) {
    try {
      const track = stream?.getVideoTracks?.()[0];
      if (!track || typeof track.getCapabilities !== 'function') return;
      const caps = track.getCapabilities();
      if (caps.zoom) {
        const minZoom = Math.max(0.5, caps.zoom.min || 0.5);
        track.applyConstraints({ advanced: [{ zoom: minZoom }] }).catch(() => {});
      }
    } catch {}
  }

  return (
    <div className="tv-kiosk-root">
      {/* ── STEP 2: KAMERA FULL LAYAR (0.5x WIDE ANGLE) ── */}
      {step === 2 && cardStudent && (
        <div className="tv-fullscreen-camera-stage">
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.85}
            mirrored
            onUserMedia={handleCameraReady}
            videoConstraints={{
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 },
              aspectRatio: { ideal: 16 / 9 }
            }}
            className="tv-webcam-fullscreen"
          />
          <canvas ref={canvasRef} className="tv-canvas-fullscreen" />

          {/* Garis Panduan Wajah di Tengah Layar */}
          <div className="tv-face-target-guide tv-face-target-fullscreen">
            <div className="tv-guide-corner tl" />
            <div className="tv-guide-corner tr" />
            <div className="tv-guide-corner bl" />
            <div className="tv-guide-corner br" />
          </div>

          {/* Overlay Kiri Atas: Identitas Pemilik Kartu */}
          <div className="tv-cam-overlay-owner">
            <div className="tv-cam-owner-avatar">
              {cardStudent.photo ? (
                <img src={cardStudent.photo} alt={cardStudent.name} />
              ) : (
                <span>{cardStudent.name[0]}</span>
              )}
            </div>
            <div>
              <div className="tv-cam-owner-badge">
                <CreditCard size={14} /> KARTU TERDETEKSI
              </div>
              <div className="tv-cam-owner-name">{cardStudent.name}</div>
              <div className="tv-cam-owner-meta">
                Kelas {cardStudent.kelas} · NIS {cardStudent.studentId}
              </div>
            </div>
          </div>

          {/* Overlay Kanan Atas: Mode 0.5x Wide & Tombol Batal */}
          <div className="tv-cam-overlay-controls">
            <span className="tv-wide-badge">0.5x WIDE</span>
            <button className="tv-cam-cancel-btn" onClick={resetKiosk}>
              Batalkan
            </button>
          </div>

          {/* Peringatan Mismatch jika wajah berbeda */}
          {mismatchError && (
            <div className="tv-cam-mismatch-floating">
              <UserX size={34} />
              <div>
                <h4>WAJAH TIDAK COCOK!</h4>
                <p>Wajah di depan kamera bukan milik <strong>{mismatchError.ownerName}</strong>.</p>
              </div>
            </div>
          )}

          {/* Overlay Bawah: Status Scanning */}
          <div className="tv-cam-overlay-bottom">
            <Loader size={20} className="spin" />
            <span>Mencocokkan wajah biometrik <strong>{cardStudent.name}</strong>...</span>
          </div>
        </div>
      )}

      {/* ── FLOATING TOP BAR (TANPA NAVBAR / TANPA TOMBOL KELUAR) ── */}
      {step !== 2 && (
        <div className="tv-floating-topbar">
          <div className="tv-float-brand">
            <div className="tv-logo-box">
              <School size={28} color="#FFFFFF" />
            </div>
            <div>
              <h1 className="tv-school-name">{settings.schoolName || 'SMA Negeri 1 Indonesia'}</h1>
              <div className="tv-school-sub">Presensi Mandiri · RFID & Biometrik Wajah</div>
            </div>
          </div>

          <div className="tv-float-clock">
            <div className="tv-time-text">{timeString}</div>
            <div className="tv-date-text">{dateString}</div>
          </div>

          <div className="tv-float-status">
            <div className="tv-esp-indicator">
              <Radio size={16} color={espOnline ? '#22c55e' : '#818cf8'} className={espOnline ? 'pulse' : ''} />
              <span style={{fontSize:'0.78rem', fontWeight:700, color: espOnline ? '#4ade80' : '#c7d2fe'}}>
                {espOnline ? 'SCANNER ONLINE' : 'SCANNER SIAP'}
              </span>
            </div>

            <div className="tv-stat-pill">
              <Users size={18} color="#34d399" />
              <span className="tv-stat-num">{todayRecords.length}</span>
              <span className="tv-stat-label">Hadir</span>
            </div>

            <button 
              className="tv-icon-button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh (F11)'}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      )}

      {/* ── MAIN TV CONTENT BODY (STEP 1 & STEP 3) ── */}
      {step !== 2 && (
      <div className="tv-main-grid">
        
        {/* KOLOM KIRI / UTAMA: INTERAKSI KIOSK */}
        <main className="tv-interaction-card">
          
          {/* STEP 1: TAP KARTU RFID DI LAYAR TV */}
          {step === 1 && (
            <div className="tv-step-tap-view">
              {/* Jam kecil khusus tampilan HP */}
              <div className="tv-mobile-mini-clock">
                <Clock size={14} />
                <span>{timeString}</span>
              </div>

              <div className="tv-nfc-huge-ring">
                <Radio size={72} className="tv-nfc-pulse" />
              </div>

              <h2 className="tv-main-title">TEMPELKAN KARTU PELAJAR ANDA</h2>
              <p className="tv-main-subtitle">
                Dekatkan kartu RFID ke sensor reader untuk memulai verifikasi wajah otomatis
              </p>

              {/* Form Input Scanner yang selalu auto-focus */}
              <form onSubmit={handleCardSubmit} className="tv-rfid-scanner-form">
                <div className="tv-input-scanner-wrap">
                  <CreditCard size={28} className="tv-input-scanner-icon" />
                  <input 
                    ref={rfidInputRef}
                    type="text" 
                    className="tv-scanner-field"
                    value={cardCode}
                    onChange={e => setCardCode(e.target.value)}
                    placeholder="Menunggu sensor kartu RFID..."
                    autoFocus
                    disabled={lookingUpCard}
                  />
                </div>
                <button type="submit" className="tv-submit-btn" disabled={lookingUpCard || !cardCode.trim()}>
                  {lookingUpCard ? <Loader size={20} className="spin" /> : 'Verifikasi'}
                </button>
              </form>

              <div className="tv-status-badge">
                <span className="tv-green-pulse"></span>
                <span>Sensor RFID Aktif & Siap Digunakan</span>
              </div>
            </div>
          )}

          {/* STEP 3: CELEBRATION SUKSES PRESENSI */}
          {step === 3 && recentResult && (
            <div className="tv-step-success-view">
              {recentResult.status === 'hadir' ? (
                <div className="tv-success-card-content">
                  <div className="tv-success-icon-burst">
                    <CheckCircle size={96} color="#22c55e" />
                  </div>

                  <h2 className="tv-success-title">VERIFIKASI BERHASIL!</h2>
                  <p className="tv-success-sub">Kartu RFID dan Wajah Murid Terverifikasi Cocok 100%.</p>

                  <div className={`tv-status-badge-lg ${recentResult.isLate ? 'late' : 'ontime'}`}>
                    <ShieldCheck size={20} />
                    <span>{recentResult.isLate ? 'TERLAMBAT' : 'TEPAT WAKTU'}</span>
                  </div>

                  <div className="tv-result-details-grid">
                    <div className="tv-detail-box">
                      <div className="tv-detail-label">Nama Murid</div>
                      <div className="tv-detail-val">{recentResult.name}</div>
                    </div>
                    <div className="tv-detail-box">
                      <div className="tv-detail-label">Kelas & NIS</div>
                      <div className="tv-detail-val">Kelas {recentResult.kelas} · NIS: {recentResult.studentId}</div>
                    </div>
                    <div className="tv-detail-box">
                      <div className="tv-detail-label">Waktu Presensi</div>
                      <div className="tv-detail-val">{recentResult.time} WIB</div>
                    </div>
                    <div className="tv-detail-box">
                      <div className="tv-detail-label">Akurasi Wajah (Confidence)</div>
                      <div className="tv-detail-val" style={{ color: '#22c55e' }}>{recentResult.confidence}%</div>
                    </div>
                  </div>

                  {countdown !== null && (
                    <div className="tv-countdown-message">
                      Kembali ke mode tap kartu dalam <strong>{countdown}</strong> detik...
                    </div>
                  )}

                  <button className="tv-next-student-btn" onClick={resetKiosk}>
                    <CreditCard size={20} /> Murid Berikutnya
                  </button>
                </div>
              ) : (
                <div className="tv-success-card-content">
                  <div className="tv-success-icon-burst">
                    <AlertTriangle size={96} color="#f59e0b" />
                  </div>
                  <h2 className="tv-success-title" style={{ color: '#f59e0b' }}>SUDAH ABSEN HARI INI</h2>
                  <p className="tv-success-sub">
                    Murid <strong>{recentResult.name}</strong> sudah tercatat masuk pada jam <strong>{recentResult.time} WIB</strong>.
                  </p>

                  <div className="tv-result-details-grid">
                    <div className="tv-detail-box">
                      <div className="tv-detail-label">Nama Murid</div>
                      <div className="tv-detail-val">{recentResult.name}</div>
                    </div>
                    <div className="tv-detail-box">
                      <div className="tv-detail-label">Kelas & NIS</div>
                      <div className="tv-detail-val">Kelas {recentResult.kelas} · NIS: {recentResult.studentId}</div>
                    </div>
                    <div className="tv-detail-box">
                      <div className="tv-detail-label">Jam Masuk Tercatat</div>
                      <div className="tv-detail-val" style={{ color: '#f59e0b' }}>{recentResult.time} WIB</div>
                    </div>
                    <div className="tv-detail-box">
                      <div className="tv-detail-label">Status</div>
                      <div className="tv-detail-val">{recentResult.prevStatus || 'Tepat Waktu'}</div>
                    </div>
                  </div>

                  {countdown !== null && (
                    <div className="tv-countdown-message">
                      Kembali ke mode tap kartu dalam <strong>{countdown}</strong> detik...
                    </div>
                  )}

                  <button className="tv-next-student-btn" style={{ marginTop: 20 }} onClick={resetKiosk}>
                    <CreditCard size={20} /> Scan Kartu Lain
                  </button>
                </div>
              )}
            </div>
          )}

        </main>

        {/* KOLOM KANAN: LIVE CHECK-IN TICKER HARI INI */}
        <aside className="tv-ticker-panel">
          <div className="tv-ticker-header">
            <Clock size={20} color="#818cf8" />
            <h3>Presensi Terkini Hari Ini ({todayRecords.length})</h3>
          </div>

          <div className="tv-ticker-list">
            {todayRecords.length === 0 ? (
              <div className="tv-ticker-empty">
                <Clock size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p>Belum ada rekaman presensi hari ini.</p>
                <span>Silakan murid pertama menempelkan kartu.</span>
              </div>
            ) : (
              todayRecords.map((r, i) => (
                <div key={r.id || i} className="tv-ticker-item">
                  <div className="tv-ticker-photo-wrap">
                    {r.photo ? (
                      <img src={r.photo} alt={r.studentName} className="tv-ticker-img" />
                    ) : (
                      <div className="tv-ticker-fallback">{r.studentName?.[0]}</div>
                    )}
                  </div>
                  <div className="tv-ticker-info">
                    <div className="tv-ticker-name" title={r.studentName}>{r.studentName}</div>
                    <div className="tv-ticker-meta">Kelas {r.kelas || '-'} · NIS: {r.studentId}</div>
                  </div>
                  <div className="tv-ticker-time-badge">
                    {r.time}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

      </div>
      )}
    </div>
  );
}
