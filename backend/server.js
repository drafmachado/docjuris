import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import authRoutes from './rotas/auth.js';
import clientRoutes from './rotas/clientes.js';
import documentRoutes from './rotas/documentos.js';
import templateRoutes from './rotas/templates.js';
import userRoutes from './rotas/usuários.js';
import uploadLinkRoutes from './rotas/uploadLinks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 },
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

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

initDB();
app.listen(PORT, () => {
  console.log(`✅ DocJuris API rodando em http://localhost:${PORT}`);
  console.log(`📁 Storage: ${path.join(__dirname, '../storage')}`);
});
