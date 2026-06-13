import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from './middleware/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import documentRoutes from './routes/documents.js';
import templateRoutes from './routes/templates.js';
import userRoutes from './routes/users.js';
import uploadLinkRoutes from './routes/uploadLinks.js';
import webhookRouter from './routes/webhook.js';
import processosRoutes from './routes/processos.js';
import { runBackup } from './services/backup.js';
import { verificarPrazosProximos } from './services/prazos-alert.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1); // Railway reverse proxy

// ── Segurança: CORS restrito ao domínio real ──────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://docjuris-production.up.railway.app',
  'https://advmachado.adv.br',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Permite sem origin (ex: mobile apps, Postman em dev)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || process.env.NODE_ENV !== 'production') {
      return cb(null, true);
    }
    cb(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
}));
// ── Segurança: headers HTTP (Helmet) ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Desabilitado para não quebrar o React/landing
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '1mb' })); // Limite no body para prevenir DoS
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: path.join(__dirname, '../uploads_temp'),
}));

// ── Segurança: /files protegido por autenticação ──────────────────────────
// Apenas usuários autenticados podem baixar PDFs, docs e arquivos dos clientes
app.use('/files', authMiddleware, express.static(path.join(__dirname, '../storage')));
// ── Segurança: rate limiting ──────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // máximo 10 tentativas por IP
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minuto
  max: 100,              // 100 req/min por IP
  message: { error: 'Muitas requisições. Aguarde um momento.' },
  skip: (req) => req.path.startsWith('/api/health'), // health check não limita
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload-links', uploadLinkRoutes);
app.use('/api/webhook', webhookRouter);
app.use('/api/processos', processosRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// 1. Landing page (tem prioridade sobre o React)
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. React app
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

// 3. Catch-all — protege /api e garante landing na raiz
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.path === '/') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

initDB();

app.listen(PORT, () => {
  console.log(`✅ DocJuris API rodando em http://localhost:${PORT}`);
  console.log(`📁 Storage: ${path.join(__dirname, '../storage')}`);
});

// ─── Backup automático diário às 3h (horário de Brasília = 6h UTC) ───────────
function scheduleBackup() {
  const now = new Date();
  const next3am = new Date();
  next3am.setUTCHours(6, 0, 0, 0); // 3h Brasília = 6h UTC
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);

  const msUntil3am = next3am - now;
  const horasAte = Math.round(msUntil3am / 1000 / 60 / 60);
  console.log(`⏰ Próximo backup em ~${horasAte}h (às 3h horário de Brasília)`);

  setTimeout(() => {
    runBackup();
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  }, msUntil3am);
}

scheduleBackup();

// ─── Verificação de prazos — roda a cada hora ─────────────────────────────
verificarPrazosProximos(); // roda imediatamente ao iniciar
setInterval(verificarPrazosProximos, 60 * 60 * 1000); // repete a cada 1h
console.log('⏰ Verificação de prazos agendada (a cada 1h)');