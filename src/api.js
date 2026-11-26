const BASE = '/api';

export async function getClasses() {
  const r = await fetch(`${BASE}/classes`);
  return r.json();
}

export async function createClass(data) {
  const r = await fetch(`${BASE}/classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function updateClass(id, data) {
  const r = await fetch(`${BASE}/classes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function deleteClass(id) {
  const r = await fetch(`${BASE}/classes/${id}`, { method: 'DELETE' });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}

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

export async function getStudentByRfid(rfid) {
  const r = await fetch(`${BASE}/students/rfid/${encodeURIComponent(rfid)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Kartu RFID tidak ditemukan');
  return j;
}

export async function updateStudent(id, data) {
  const r = await fetch(`${BASE}/students/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Gagal memperbarui data murid');
  return j;
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

export async function getSettings() {
  const r = await fetch(`${BASE}/settings`);
  return r.json();
}

export async function updateSettings(data) {
  const r = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function resetAttendance(type) {
  const r = await fetch(`${BASE}/reset-attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  return r.json();
}

export const BACKUP_URL = `${BASE}/backup`;

// ── Auth Dashboard Admin ─────────────────────────────────────
export const TOKEN_KEY = 'absensi_admin_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export async function loginAdmin(username, password) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Login gagal');
  localStorage.setItem(TOKEN_KEY, j.token);
  return j;
}

export async function checkAuthMe() {
  const token = getAuthToken();
  if (!token) return { authenticated: false };
  const r = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return { authenticated: false };
  return r.json();
}

export async function logoutAdmin() {
  const token = getAuthToken();
  if (token) {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  localStorage.removeItem(TOKEN_KEY);
}

export async function changeAdminPassword({ oldPassword, newPassword, newUsername }) {
  const token = getAuthToken();
  const r = await fetch(`${BASE}/auth/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ oldPassword, newPassword, newUsername }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Gagal mengubah password');
  return j;
}
