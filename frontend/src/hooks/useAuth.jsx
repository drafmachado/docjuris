import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('docjuris_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // ✅ Fix: loading começa false se já tem usuário salvo
  const [loading, setLoading] = useState(() => {
    return !localStorage.getItem('docjuris_token');
  });

  useEffect(() => {
    const token = localStorage.getItem('docjuris_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api.get('/auth/me')
      .then(res => {
        setUser(res.data.user);
        localStorage.setItem('docjuris_user', JSON.stringify(res.data.user));
      })
      .catch(() => {
        localStorage.removeItem('docjuris_token');
        localStorage.removeItem('docjuris_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user } = res.data;
    localStorage.setItem('docjuris_token', token);
    localStorage.setItem('docjuris_user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('docjuris_token');
    localStorage.removeItem('docjuris_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
