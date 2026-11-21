// server.js — Express backend untuk absensi
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DATA_FILE = path.join(__dirname, 'data', 'db.json');

// Pastikan folder data ada
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

function readDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = { students: [], attendance: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Students ────────────────────────────────────────────────
// GET semua murid
app.get('/api/students', (req, res) => {
  const db = readDB();
  // Jangan kirim descriptor (besar) ke list
  const list = db.students.map(({ descriptor, ...s }) => s);
  res.json(list);
});

// POST daftarkan murid baru + simpan face descriptor
app.post('/api/students', (req, res) => {
  const { name, studentId, kelas, descriptor } = req.body;
  if (!name || !studentId || !descriptor) {
    return res.status(400).json({ error: 'name, studentId, descriptor wajib diisi' });
  }
  const db = readDB();
  if (db.students.find(s => s.studentId === studentId)) {
    return res.status(409).json({ error: 'ID murid sudah terdaftar' });
  }
  const student = {
    id: Date.now().toString(),
    name, studentId, kelas: kelas || '-',
    descriptor, // Float32Array as plain array
    registeredAt: new Date().toISOString(),
    photo: req.body.photo || null,
  };
  db.students.push(student);
  writeDB(db);
  res.json({ ok: true, student: { id: student.id, name, studentId, kelas } });
});

// DELETE murid
app.delete('/api/students/:id', (req, res) => {
  const db = readDB();
  db.students = db.students.filter(s => s.id !== req.params.id);
  db.attendance = db.attendance.filter(a => a.studentId !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// GET descriptors semua murid (untuk face matching di client)
app.get('/api/students/descriptors', (req, res) => {
  const db = readDB();
  res.json(db.students.map(s => ({
    id: s.id, name: s.name, studentId: s.studentId,
    kelas: s.kelas, descriptor: s.descriptor,
  })));
});

// ── Attendance ──────────────────────────────────────────────
// POST catat kehadiran
app.post('/api/attendance', (req, res) => {
  const { studentId, studentName, kelas, confidence, photo } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId wajib' });

  const db = readDB();
  const today = new Date().toISOString().slice(0, 10);

  // Cek sudah absen hari ini
  const already = db.attendance.find(
    a => a.studentId === studentId && a.date === today
  );
  if (already) {
    return res.status(409).json({ error: 'Sudah absen hari ini', record: already });
  }

  const record = {
    id: Date.now().toString(),
    studentId, studentName, kelas,
    confidence: confidence || null,
    photo: photo || null,
    date: today,
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date().toISOString(),
  };
  db.attendance.push(record);
  writeDB(db);
  res.json({ ok: true, record });
});

// GET rekap absensi (filter by date/kelas)
app.get('/api/attendance', (req, res) => {
  const { date, kelas } = req.query;
  const db = readDB();
  let list = db.attendance;
  if (date) list = list.filter(a => a.date === date);
  if (kelas) list = list.filter(a => a.kelas === kelas);
  res.json(list.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
});

// GET rekap per murid
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

app.listen(PORT, () => {
  console.log(`✅ Server absensi berjalan di http://localhost:${PORT}`);
});
