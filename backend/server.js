import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import documentRoutes from './routes/documents.js';
import templateRoutes from './routes/templates.js';
import userRoutes from './routes/users.js';
import uploadLinkRoutes from './routes/uploadLinks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: path.join(__dirname, '../uploads_temp'),
}));

app.use('/files', express.static(path.join(__dirname, '../storage')));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload-links', uploadLinkRoutes);

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
