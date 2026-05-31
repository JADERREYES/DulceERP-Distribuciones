import { useEffect, useState } from 'react';
import api from '../api/axios';

export default function BackendStatus() {
  const [status, setStatus] = useState({ loading: true, ok: false, message: 'Verificando backend...' });

  const checkBackend = async () => {
    setStatus({ loading: true, ok: false, message: 'Verificando backend...' });

    try {
      const { data } = await api.get('/health');
      setStatus({
        loading: false,
        ok: Boolean(data.ok),
        message: data.ok ? `Backend conectado (${data.database})` : 'Backend respondio sin estado OK'
      });
    } catch (error) {
      setStatus({
        loading: false,
        ok: false,
        message: error.userMessage || 'Backend desconectado'
      });
    }
  };

  useEffect(() => {
    checkBackend();
  }, []);

  return (
    <div className={`backend-status ${status.ok ? 'connected' : 'disconnected'}`}>
      <span>{status.message}</span>
      <button className="button ghost" type="button" onClick={checkBackend} disabled={status.loading}>
        Reintentar
      </button>
    </div>
  );
}
