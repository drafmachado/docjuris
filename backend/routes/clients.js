import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { extractClientData } from '../services/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_FILES_DIR = path.join(__dirname, '../../storage/client_files');
const router = Router();

router.use(authMiddleware);

// Sanitiza IDs de rota — previne path traversal
function sanitizeId(id) {
  const n = parseInt(id, 10);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// GET /api/clients — lista todos
router.get('/', (req, res) => {
  const db = getDB();
  const search = req.query.search || '';
  const clients = db.prepare(`
    SELECT c.*, COUNT(d.id) as doc_count
    FROM clients c
    LEFT JOIN documents d ON d.client_id = c.id
    WHERE c.nome LIKE ? OR c.cpf LIKE ? OR c.email LIKE ?
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all(`%${search}%`, `%${search}%`, `%${search}%`);
  res.json(clients);
});

// GET /api/clients/:id — detalhes
router.get('/:id', (req, res) => {
  const db = getDB();
  const clientId = sanitizeId(req.params.id);
  if (!clientId) return res.status(400).json({ error: 'ID inválido' });
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

  const files = db.prepare('SELECT * FROM client_files WHERE client_id = ? ORDER BY uploaded_at DESC').all(client.id);
  const documents = db.prepare(`
    SELECT d.*, t.name as template_name, t.type as template_type, u.name as generated_by_name
    FROM documents d
    JOIN templates t ON t.id = d.template_id
    LEFT JOIN users u ON u.id = d.generated_by
    WHERE d.client_id = ?
    ORDER BY d.created_at DESC
  `).all(client.id);

  res.json({ ...client, files, documents });
});

// POST /api/clients — cria cliente manualmente
router.post('/', (req, res) => {
  const db = getDB();
  const { nome, nacionalidade, cpf, rg, orgao_expedidor, endereco, cidade, estado, email, telefone, observacoes } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

  const result = db.prepare(`
    INSERT INTO clients (nome, nacionalidade, cpf, rg, orgao_expedidor, endereco, cidade, estado, email, telefone, observacoes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nome, nacionalidade, cpf, rg, orgao_expedidor, endereco, cidade, estado, email, telefone, observacoes, req.user.id);

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(client);
});

// PUT /api/clients/:id — atualiza
router.put('/:id', (req, res) => {
  const db = getDB();
  const { nome, nacionalidade, cpf, rg, orgao_expedidor, endereco, cidade, estado, email, telefone, observacoes } = req.body;

  db.prepare(`
    UPDATE clients SET
      nome = ?, nacionalidade = ?, cpf = ?, rg = ?, orgao_expedidor = ?,
      endereco = ?, cidade = ?, estado = ?, email = ?, telefone = ?, observacoes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(nome, nacionalidade, cpf, rg, orgao_expedidor, endereco, cidade, estado, email, telefone, observacoes, req.params.id);

  res.json({ success: true });
});

// DELETE /api/clients/:id
router.delete('/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/clients/extract — envia arquivos e extrai dados via IA
router.post('/extract', async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

  try {
    const extracted = await extractClientData(files);
    res.json({ success: true, data: extracted });
  } catch (err) {
    console.error('Erro na extração:', err);
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno ao processar dados do cliente' : 'Erro ao extrair dados: ' + err.message });
  }
});

// POST /api/clients/:id/files — upload de arquivos para pasta do cliente
router.post('/:id/files', async (req, res) => {
  const db = getDB();
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

  if (!req.files?.files) return res.status(400).json({ error: 'Nenhum arquivo' });

  const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

  // Validar tipo e tamanho
  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ error: `Tipo não permitido: ${file.name}` });
    }
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: `Arquivo muito grande: ${file.name}. Máximo 10MB.` });
    }
  }

  const safeClientId = sanitizeId(req.params.id);
  if (!safeClientId) return res.status(400).json({ error: 'ID inválido' });
  const clientDir = path.join(CLIENT_FILES_DIR, `client_${safeClientId}`);
  if (!fs.existsSync(clientDir)) fs.mkdirSync(clientDir, { recursive: true });

  const saved = [];
  for (const file of files) {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const dest = path.join(clientDir, safeName);
    await file.mv(dest);

    const row = db.prepare(`
      INSERT INTO client_files (client_id, filename, original_name, mimetype, size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(client.id, `client_${req.params.id}/${safeName}`, file.name, file.mimetype, file.size, req.user.id);

    saved.push({ id: row.lastInsertRowid, original_name: file.name, filename: safeName });
  }

  res.json({ success: true, files: saved });
});

// DELETE /api/clients/:clientId/files/:fileId
router.delete('/:clientId/files/:fileId', (req, res) => {
  const db = getDB();
  const file = db.prepare('SELECT * FROM client_files WHERE id = ? AND client_id = ?').get(req.params.fileId, req.params.clientId);
  if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });

  const fullPath = path.join(CLIENT_FILES_DIR, file.filename);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  db.prepare('DELETE FROM client_files WHERE id = ?').run(file.id);
  res.json({ success: true });
});

export default router;
