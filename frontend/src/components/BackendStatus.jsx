import { useEffect, useState } from 'react';
import api from '../api/axios';

export default function BackendStatus({ compact = false }) {
  const [status, setStatus] = useState({ loading: true, ok: false, message: 'Verificando backend...' });

  const checkBackend = async () => {
    setStatus({ loading: true, ok: false, message: 'Verificando backend...' });

    try {
      const { data } = await api.get('/health');
      setStatus({
        loading: false,
        ok: Boolean(data.ok),
        message: data.ok ? `Backend conectado${compact ? '' : ` (${data.database})`}` : 'Backend respondio sin estado OK'
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

  if (compact) {
    return (
      <div className={`compact-status ${status.ok ? 'connected' : 'disconnected'}`}>
        <span aria-hidden="true"></span>
        <strong>{status.loading ? 'Verificando backend...' : status.message}</strong>
        {!status.ok && (
          <button className="button ghost" type="button" onClick={checkBackend} disabled={status.loading}>
            Reintentar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`backend-status ${status.ok ? 'connected' : 'disconnected'}`}>
      <span>{status.message}</span>
      <button className="button ghost" type="button" onClick={checkBackend} disabled={status.loading}>
        Reintentar
      </button>
    </div>
  );
}
