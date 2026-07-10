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

    // NÃO fazer retry em NENHUMA escrita (POST/PUT/DELETE/PATCH).
    // Retry em escrita duplica recursos: já causou 3 petições e 3 procurações
    // idênticas com 3 envios ao Autentique. Retry só é seguro em leituras.
    const isWriteRoute = (config.method || 'get').toLowerCase() !== 'get';

    // Retry automático apenas para leituras e falhas temporárias
    const isTransient =
      !err.response ||                          // sem resposta (rede/timeout)
      err.code === 'ECONNABORTED' ||            // timeout
      [502, 503, 504].includes(err.response?.status);

    config._retryCount = config._retryCount || 0;

    if (isTransient && !isWriteRoute && config._retryCount < 2) {
      config._retryCount += 1;
      // Espera crescente: 1s, depois 2s
      await new Promise(r => setTimeout(r, config._retryCount * 1000));
      return api(config);
    }

    return Promise.reject(err);
  }
);

export default api;
