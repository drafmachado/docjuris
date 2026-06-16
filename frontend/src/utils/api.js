import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
  timeout: 20000, // 20s — tolera cold start do Railway
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('docjuris_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  async err => {
    const config = err.config || {};

    // 401 — sessão expirada, redireciona para login
    if (err.response?.status === 401) {
      localStorage.removeItem('docjuris_token');
      localStorage.removeItem('docjuris_user');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    // Retry automático para falhas temporárias (rede, timeout, cold start, 502/503/504)
    const isTransient =
      !err.response ||                          // sem resposta (rede/timeout)
      err.code === 'ECONNABORTED' ||            // timeout
      [502, 503, 504].includes(err.response?.status);

    config._retryCount = config._retryCount || 0;

    if (isTransient && config._retryCount < 2) {
      config._retryCount += 1;
      // Espera crescente: 1s, depois 2s
      await new Promise(r => setTimeout(r, config._retryCount * 1000));
      return api(config);
    }

    return Promise.reject(err);
  }
);

export default api;
