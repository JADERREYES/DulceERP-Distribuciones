import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('dulceerp_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('dulceerp_token', data.token);
    localStorage.setItem('dulceerp_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('dulceerp_token');
    localStorage.removeItem('dulceerp_user');
    setUser(null);
  };

  useEffect(() => {
    const token = localStorage.getItem('dulceerp_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get('/auth/profile')
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('dulceerp_user', JSON.stringify(data.user));
      })
      .catch((error) => {
        if (!error.isBackendConnectionError) {
          logout();
        } else {
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, isAuthenticated: Boolean(user) }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
