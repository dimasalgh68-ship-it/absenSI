// server.js — Express backend untuk absensi
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(String(pwd)).digest('hex');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const SEED_FILE = path.join(__dirname, 'data', 'db.json');
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_FILE = IS_VERCEL ? path.join('/tmp', 'db.json') : SEED_FILE;

if (!IS_VERCEL && !fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

if (IS_VERCEL && !fs.existsSync(DATA_FILE) && fs.existsSync(SEED_FILE)) {
  try {
    fs.copyFileSync(SEED_FILE, DATA_FILE);
  } catch {}
}

const defaultSettings = {
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
  autoCapture: true
};

function readDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = {
      students: [],
      attendance: [],
      classes: [],
      settings: defaultSettings,
      adminAuth: {
        username: 'admin',
        name: 'Administrator / Guru',
        passwordHash: hashPassword('admin123'),
      },
      sessions: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  if (!db.classes) db.classes = [];
  if (!db.settings) db.settings = defaultSettings;
  if (!db.adminAuth) {
    db.adminAuth = {
      username: 'admin',
      name: 'Administrator / Guru',
      passwordHash: hashPassword('admin123'),
    };
  }
  if (!Array.isArray(db.sessions)) db.sessions = [];
  // Pastikan setiap murid memiliki rfid
  if (Array.isArray(db.students)) {
    let changed = false;
    db.students.forEach((s, idx) => {
      if (!s.rfid) {
        s.rfid = `RFID-${s.kelas || 'GEN'}-${String(idx + 1).padStart(3, '0')}`;
        changed = true;
      }
    });
    if (changed) writeDB(db);
  }
  return db;
}

function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Classes ──────────────────────────────────────────────────
app.get('/api/classes', (req, res) => {
  const db = readDB();
  res.json(db.classes.sort((a, b) => a.name.localeCompare(b.name)));
});

app.post('/api/classes', (req, res) => {
  const { name, tingkat, waliKelas } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama kelas wajib diisi' });
  const db = readDB();
  if (db.classes.find(c => c.name.toLowerCase() === name.trim().toLowerCase()))
    return res.status(409).json({ error: 'Kelas sudah ada' });
  const kelas = {
    id: Date.now().toString(),
    name: name.trim(),
    tingkat: tingkat || '',
    waliKelas: waliKelas || '',
    createdAt: new Date().toISOString(),
  };
  db.classes.push(kelas);
  writeDB(db);
  res.json({ ok: true, kelas });
});

app.put('/api/classes/:id', (req, res) => {
  const { name, tingkat, waliKelas } = req.body;
  const db = readDB();
  const idx = db.classes.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  db.classes[idx] = {
    ...db.classes[idx],
    name: name?.trim() || db.classes[idx].name,
    tingkat: tingkat ?? db.classes[idx].tingkat,
    waliKelas: waliKelas ?? db.classes[idx].waliKelas,
  };
  writeDB(db);
  res.json({ ok: true, kelas: db.classes[idx] });
});

app.delete('/api/classes/:id', (req, res) => {
  const db = readDB();
  const kelas = db.classes.find(c => c.id === req.params.id);
  if (!kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  const jml = db.students.filter(s => s.kelas === kelas.name).length;
  if (jml > 0)
    return res.status(409).json({ error: `Kelas masih memiliki ${jml} murid. Pindahkan atau hapus murid terlebih dahulu.` });
  db.classes = db.classes.filter(c => c.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ── Students ─────────────────────────────────────────────────
app.get('/api/students', (req, res) => {
  const db = readDB();
  const list = db.students.map(({ descriptor, ...s }) => s);
  res.json(list);
});

app.post('/api/students', (req, res) => {
  const { name, studentId, kelas, descriptor, rfid, photo } = req.body;
  if (!name || !studentId || !descriptor)
    return res.status(400).json({ error: 'name, studentId, descriptor wajib diisi' });
  const db = readDB();
  if (db.students.find(s => s.studentId === studentId))
    return res.status(409).json({ error: 'ID murid sudah terdaftar' });
  if (rfid && db.students.find(s => s.rfid && s.rfid.trim().toLowerCase() === rfid.trim().toLowerCase()))
    return res.status(409).json({ error: 'Nomor Kartu RFID ini sudah terdaftar pada murid lain' });
  
  const student = {
    id: Date.now().toString(),
    name: name.trim(),
    studentId: studentId.trim(),
    kelas: kelas || '-',
    rfid: (rfid || '').trim() || null,
    descriptor,
    registeredAt: new Date().toISOString(),
    photo: photo || null,
  };
  db.students.push(student);
  writeDB(db);
  res.json({ ok: true, student: { id: student.id, name, studentId, kelas, rfid: student.rfid } });
});

app.put('/api/students/:id', (req, res) => {
  const db = readDB();
  const idx = db.students.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Murid tidak ditemukan' });
  const { name, studentId, kelas, rfid, photo, descriptor } = req.body;
  if (rfid) {
    const dup = db.students.find(s => s.id !== req.params.id && s.rfid && s.rfid.trim().toLowerCase() === rfid.trim().toLowerCase());
    if (dup) return res.status(409).json({ error: 'Kartu RFID ini sudah digunakan murid lain' });
  }
  db.students[idx] = {
    ...db.students[idx],
    name: name?.trim() || db.students[idx].name,
    studentId: studentId?.trim() || db.students[idx].studentId,
    kelas: kelas ?? db.students[idx].kelas,
    rfid: rfid !== undefined ? (rfid.trim() || null) : db.students[idx].rfid,
    photo: photo ?? db.students[idx].photo,
    descriptor: descriptor ?? db.students[idx].descriptor,
  };
  writeDB(db);
  res.json({ ok: true, student: db.students[idx] });
});

app.get('/api/students/rfid/:rfid', (req, res) => {
  const db = readDB();
  const code = decodeURIComponent(req.params.rfid).trim().toLowerCase();
  const student = db.students.find(s => 
    (s.rfid && s.rfid.trim().toLowerCase() === code) ||
    (s.studentId && s.studentId.trim().toLowerCase() === code)
  );
  if (!student) return res.status(404).json({ error: 'Kartu RFID tidak ditemukan atau belum terdaftar' });
  res.json({
    id: student.id,
    name: student.name,
    studentId: student.studentId,
    kelas: student.kelas,
    rfid: student.rfid || student.studentId,
    photo: student.photo,
    descriptor: student.descriptor
  });
});

app.delete('/api/students/:id', (req, res) => {
  const db = readDB();
  db.students = db.students.filter(s => s.id !== req.params.id);
  db.attendance = db.attendance.filter(a => a.studentId !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

app.get('/api/students/descriptors', (req, res) => {
  const db = readDB();
  res.json(db.students.map(s => ({
    id: s.id, name: s.name, studentId: s.studentId,
    kelas: s.kelas, rfid: s.rfid || '', descriptor: s.descriptor,
  })));
});

// ── Attendance ───────────────────────────────────────────────
app.post('/api/attendance', (req, res) => {
  const { studentId, studentName, kelas, confidence, photo, method, rfid, status: reqStatus } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId wajib' });
  const db = readDB();
  const today = new Date().toISOString().slice(0, 10);
  const already = db.attendance.find(a => a.studentId === studentId && a.date === today);
  if (already) return res.status(409).json({ error: 'Sudah absen hari ini', record: already });

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;
  const jamTerlambat = db.settings?.jamTerlambat || '07:30';
  const status = reqStatus || (timeStr > jamTerlambat ? 'Terlambat' : 'Tepat Waktu');

  const record = {
    id: Date.now().toString(),
    studentId, studentName, kelas,
    confidence: confidence || null,
    photo: photo || null,
    method: method || 'rfid_face', // 'rfid_face' | 'face_only'
    rfid: rfid || null,
    status,
    date: today,
    time: timeStr,
    timestamp: now.toISOString(),
  };
  db.attendance.push(record);
  writeDB(db);
  res.json({ ok: true, record });
});

app.get('/api/attendance', (req, res) => {
  const { date, kelas } = req.query;
  const db = readDB();
  let list = db.attendance;
  if (date) list = list.filter(a => a.date === date);
  if (kelas) list = list.filter(a => a.kelas === kelas);
  res.json(list.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
});

app.get('/api/attendance/summary', (req, res) => {
  const db = readDB();
  const summary = db.students.map(s => {
    const records = db.attendance.filter(a => a.studentId === s.id);
    return {
      studentId: s.id, name: s.name, kelas: s.kelas,
      totalHadir: records.length,
      lastHadir: records.length ? records[records.length - 1].date : null,
    };
  });
  res.json(summary);
});

// ── Pengaturan (Settings) ─────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const db = readDB();
  res.json(db.settings || defaultSettings);
});

app.put('/api/settings', (req, res) => {
  const db = readDB();
  db.settings = { ...defaultSettings, ...(db.settings || {}), ...req.body };
  writeDB(db);
  res.json({ ok: true, settings: db.settings });
});

// ── Backup & Reset ────────────────────────────────────────────────
app.get('/api/backup', (req, res) => {
  const db = readDB();
  res.setHeader('Content-Disposition', `attachment; filename=backup-absensi-${new Date().toISOString().slice(0,10)}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(db, null, 2));
});

app.post('/api/reset-attendance', (req, res) => {
  const { type } = req.body; // 'today' or 'all'
  const db = readDB();
  const today = new Date().toISOString().slice(0, 10);
  if (type === 'today') {
    db.attendance = db.attendance.filter(a => a.date !== today);
  } else {
    db.attendance = [];
  }
  writeDB(db);
  res.json({ ok: true, remaining: db.attendance.length });
});

// ── ESP8266 IoT RFID & Real-time Server-Sent Events (SSE) ─────────
let rfidClients = [];
let lastEspHeartbeat = null;

// Endpoint SSE untuk browser (Layar TV Kiosk / Halaman Absen)
app.get('/api/rfid/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    clients: rfidClients.length + 1, 
    lastHeartbeat: lastEspHeartbeat,
    online: Boolean(lastEspHeartbeat && (Date.now() - new Date(lastEspHeartbeat).getTime() < 45000))
  })}\n\n`);

  rfidClients.push(res);

  req.on('close', () => {
    rfidClients = rfidClients.filter(c => c !== res);
  });
});

// Endpoint yang dipanggil oleh ESP8266 Lolin NodeMCU V3 saat kartu RFID di-tap
app.post('/api/rfid/tap', (req, res) => {
  const { uid, rfid } = req.body;
  const cardUid = (uid || rfid || '').trim();
  if (!cardUid) {
    return res.status(400).json({ error: 'UID kartu tidak boleh kosong' });
  }

  lastEspHeartbeat = new Date().toISOString();
  console.log(`[ESP8266 NodeMCU V3] Kartu RFID Terdeteksi: ${cardUid}`);

  const db = readDB();
  const searchCode = cardUid.toLowerCase();

  // Cari murid berdasarkan nomor kartu RFID atau NIS
  const student = db.students.find(s => 
    (s.rfid && s.rfid.trim().toLowerCase() === searchCode) ||
    (s.studentId && s.studentId.trim().toLowerCase() === searchCode)
  );

  const eventPayload = {
    type: 'card_tapped',
    uid: cardUid,
    rfid: cardUid,
    timestamp: new Date().toISOString(),
    found: Boolean(student),
    student: student ? {
      id: student.id,
      name: student.name,
      studentId: student.studentId,
      kelas: student.kelas,
      rfid: student.rfid || student.studentId,
      photo: student.photo,
      descriptor: student.descriptor
    } : null
  };

  // Broadcast secara instan ke seluruh browser Layar TV / Kiosk / AbsenPage / DaftarPage
  rfidClients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify(eventPayload)}\n\n`);
    } catch {}
  });

  if (student) {
    res.json({
      ok: true,
      found: true,
      message: `Kartu ${cardUid} dikenali sebagai ${student.name}`,
      student: { name: student.name, studentId: student.studentId, kelas: student.kelas }
    });
  } else {
    // Tetap kirim status OK agar ESP32 / ESP8266 tahu kartu sukses dibaca,
    // terutama saat sedang digunakan pada halaman Pendaftaran murid baru
    res.json({
      ok: true,
      found: false,
      rfid: cardUid,
      message: `Kartu ${cardUid} terbaca (belum terdaftar di database murid)`
    });
  }
});

// Heartbeat / Ping dari ESP8266
app.post('/api/rfid/ping', (req, res) => {
  lastEspHeartbeat = new Date().toISOString();
  res.json({ ok: true, serverTime: new Date().toISOString(), status: 'online' });
});

// Status alat ESP8266
app.get('/api/rfid/status', (req, res) => {
  const isOnline = lastEspHeartbeat && (Date.now() - new Date(lastEspHeartbeat).getTime() < 45000);
  res.json({
    online: Boolean(isOnline),
    lastHeartbeat: lastEspHeartbeat,
    activeSubscribers: rfidClients.length
  });
});

// ── Auth Dashboard Admin ─────────────────────────────────────
function extractToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readDB();
  const admin = db.adminAuth;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  if (
    username.trim().toLowerCase() !== admin.username.toLowerCase() ||
    hashPassword(password) !== admin.passwordHash
  ) {
    return res.status(401).json({ error: 'Username atau password salah!' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({
    token,
    username: admin.username,
    createdAt: new Date().toISOString(),
  });
  // Simpan maksimal 10 sesi terakhir
  if (db.sessions.length > 10) db.sessions = db.sessions.slice(-10);
  writeDB(db);

  res.json({
    ok: true,
    token,
    user: { username: admin.username, name: admin.name, role: 'admin' },
  });
});

app.get('/api/auth/me', (req, res) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ authenticated: false });
  const db = readDB();
  const session = db.sessions.find(s => s.token === token);
  if (!session) return res.status(401).json({ authenticated: false });
  res.json({
    authenticated: true,
    user: { username: db.adminAuth.username, name: db.adminAuth.name, role: 'admin' },
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractToken(req);
  if (token) {
    const db = readDB();
    db.sessions = db.sessions.filter(s => s.token !== token);
    writeDB(db);
  }
  res.json({ ok: true });
});

app.put('/api/auth/password', (req, res) => {
  const token = extractToken(req);
  const db = readDB();
  const session = db.sessions.find(s => s.token === token);
  if (!session) return res.status(401).json({ error: 'Sesi tidak valid. Silakan login ulang.' });

  const { oldPassword, newPassword, newUsername } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Password lama dan password baru wajib diisi' });
  }
  if (hashPassword(oldPassword) !== db.adminAuth.passwordHash) {
    return res.status(401).json({ error: 'Password lama tidak sesuai' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Password baru minimal 4 karakter' });
  }

  db.adminAuth.passwordHash = hashPassword(newPassword);
  if (newUsername && newUsername.trim()) {
    db.adminAuth.username = newUsername.trim();
  }
  writeDB(db);
  res.json({ ok: true, message: 'Password admin berhasil diperbarui' });
});

if (!IS_VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server absensi berjalan di http://localhost:${PORT} (dan semua IP jaringan lokal)`);
  });
}

export default app;
