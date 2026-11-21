const BASE = 'http://localhost:3001/api';

export async function getStudents() {
  const r = await fetch(`${BASE}/students`);
  return r.json();
}

export async function getDescriptors() {
  const r = await fetch(`${BASE}/students/descriptors`);
  return r.json();
}

export async function registerStudent(data) {
  const r = await fetch(`${BASE}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function deleteStudent(id) {
  const r = await fetch(`${BASE}/students/${id}`, { method: 'DELETE' });
  return r.json();
}

export async function recordAttendance(data) {
  const r = await fetch(`${BASE}/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (r.status === 409) {
    const j = await r.json();
    throw Object.assign(new Error(j.error), { code: 'ALREADY', record: j.record });
  }
  return r.json();
}

export async function getAttendance(date, kelas) {
  const p = new URLSearchParams();
  if (date) p.set('date', date);
  if (kelas) p.set('kelas', kelas);
  const r = await fetch(`${BASE}/attendance?${p}`);
  return r.json();
}

export async function getSummary() {
  const r = await fetch(`${BASE}/attendance/summary`);
  return r.json();
}
