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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  useTempFiles: true,
  tempFileDir: path.join(__dirname, '../uploads_temp'),
}));

// Servir arquivos estáticos (PDFs gerados, templates)
app.use('/files', express.static(path.join(__dirname, '../storage')));

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Inicializa DB e sobe servidor
initDB();
app.listen(PORT, () => {
  console.log(`✅ DocJuris API rodando em http://localhost:${PORT}`);
  console.log(`📁 Storage: ${path.join(__dirname, '../storage')}`);
});
