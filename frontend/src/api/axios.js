import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const BACKEND_CONNECTION_MESSAGE =
  `No se pudo conectar con el backend. Verifica que la API este disponible en: ${API_URL}`;

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dulceerp_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isNetworkError =
      error.code === 'ERR_NETWORK' ||
      error.message === 'Network Error' ||
      error.message?.includes('ERR_CONNECTION_REFUSED');

    if (isNetworkError) {
      error.isBackendConnectionError = true;
      error.userMessage = BACKEND_CONNECTION_MESSAGE;
    }

    if (error.response?.status === 403) {
      error.userMessage = 'No tienes permisos para realizar esta accion.';
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('dulceerp_token');
      localStorage.removeItem('dulceerp_user');
    }

    return Promise.reject(error);
  }
);

export default api;
