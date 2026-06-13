import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import toast from 'react-hot-toast';
import { Scale } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f0', padding: '1rem' }}>
      <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: '12px', padding: '2.5rem', width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 56, height: 56, background: '#0d2340', borderRadius: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <svg width="32" height="32" viewBox="0 0 100 100"><path d="M 30 30 L 50 74 L 70 30" fill="none" stroke="#c5a859" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/><rect x="34" y="23" width="32" height="5" rx="2.5" fill="#ffffff" opacity="0.9"/></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1a1a18' }}>Veredo</h1>
          <p style={{ fontSize: 13, color: '#6b6b68', marginTop: 4 }}>Sistema de Gestão Jurídica</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6b6b68', marginBottom: 5 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@escritorio.com"
              required
              autoFocus
            />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6b6b68', marginBottom: 5 }}>Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '10px', background: loading ? '#6b7f90' : '#1a3a5c', color: 'white',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p style={{ fontSize: 11, color: '#9a9a97', textAlign: 'center', marginTop: '1rem' }}>
          Veredo · Sistema de Gestão Jurídica
        </p>
      </div>
    </div>
  );
}
