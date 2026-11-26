import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, KeyRound, Eye, EyeOff, Tv, Loader, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { loginAdmin } from '../api';

export default function LoginPage({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      return toast.error('Masukkan username dan password');
    }
    setLoading(true);
    try {
      const res = await loginAdmin(username.trim(), password);
      toast.success(`Selamat datang, ${res.user?.name || 'Admin'}!`);
      onLoginSuccess(res.user);
    } catch (err) {
      toast.error(err.message || 'Username atau password salah');
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
      padding: 20,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#1e293b',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 32,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        color: '#f8fafc',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 60,
            height: 60,
            borderRadius: 16,
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#818cf8',
            marginBottom: 14,
          }}>
            <Lock size={28} />
          </div>
          <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 700, color: '#fff' }}>
            Login Dashboard Admin
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', marginTop: 6 }}>
            Area khusus Guru & Operator Sekolah. Murid silakan gunakan Mode Layar TV.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: 6, display: 'block' }}>
              Username Admin
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Masukkan username (default: admin)"
                autoFocus
                style={{
                  paddingLeft: 38,
                  background: '#0f172a',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 22 }}>
            <label style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: 6, display: 'block' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type={showPass ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Masukkan password"
                style={{
                  paddingLeft: 38,
                  paddingRight: 40,
                  background: '#0f172a',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
            style={{ width: '100%', padding: '12px', fontSize: '0.95rem', fontWeight: 600 }}
          >
            {loading ? <><Loader size={18} className="spin" /> Memeriksa...</> : <><ShieldCheck size={18} /> Masuk ke Dashboard</>}
          </button>
        </form>

        <div style={{
          marginTop: 20,
          paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center',
        }}>
          <button
            type="button"
            onClick={() => navigate('/tv')}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Tv size={18} /> Buka Mode Layar TV (Untuk Murid)
          </button>
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 12, marginBottom: 0 }}>
            Login default: <code>admin</code> / <code>admin123</code> (dapat diubah di Pengaturan)
          </p>
        </div>
      </div>
    </div>
  );
}
