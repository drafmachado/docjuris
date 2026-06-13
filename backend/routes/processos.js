import { Router } from 'express';
import { consultarProcesso } from '../services/datajud.js';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/processos?client_id=X
router.get('/', (req, res) => {
  const db = getDB();
  const { client_id } = req.query;
  const query = client_id
    ? `SELECT p.*, c.nome as client_nome FROM processos p JOIN clients c ON c.id = p.client_id WHERE p.client_id = ? ORDER BY p.created_at DESC`
    : `SELECT p.*, c.nome as client_nome FROM processos p JOIN clients c ON c.id = p.client_id ORDER BY p.created_at DESC`;
  const rows = client_id ? db.prepare(query).all(client_id) : db.prepare(query).all();
  res.json(rows);
});

// GET /api/processos/:id
router.get('/:id', (req, res) => {
  const db = getDB();
  const processo = db.prepare(`
    SELECT p.*, c.nome as client_nome
    FROM processos p JOIN clients c ON c.id = p.client_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!processo) return res.status(404).json({ error: 'Processo não encontrado' });
  const prazos = db.prepare(`
    SELECT pz.*, u.name as responsavel_nome
    FROM prazos pz LEFT JOIN users u ON u.id = pz.responsavel_id
    WHERE pz.processo_id = ? ORDER BY pz.data_limite ASC
  `).all(processo.id);
  res.json({ ...processo, prazos });
});

// POST /api/processos
router.post('/', (req, res) => {
  const { client_id, numero_cnj, vara, comarca, tribunal, tipo, polo_ativo, polo_passivo, observacoes } = req.body;
  if (!client_id || !numero_cnj) return res.status(400).json({ error: 'client_id e numero_cnj são obrigatórios' });
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO processos (client_id, numero_cnj, vara, comarca, tribunal, tipo, polo_ativo, polo_passivo, observacoes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(client_id, numero_cnj, vara||null, comarca||null, tribunal||null, tipo||null, polo_ativo||null, polo_passivo||null, observacoes||null, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/processos/:id
router.put('/:id', (req, res) => {
  const { numero_cnj, vara, comarca, tribunal, tipo, polo_ativo, polo_passivo, observacoes, status, client_id } = req.body;
  const db = getDB();
  if (client_id) {
    db.prepare(`UPDATE processos SET client_id=?, numero_cnj=?, vara=?, comarca=?, tribunal=?, tipo=?, polo_ativo=?, polo_passivo=?, observacoes=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(client_id, numero_cnj, vara||null, comarca||null, tribunal||null, tipo||null, polo_ativo||null, polo_passivo||null, observacoes||null, status||'ativo', req.params.id);
  } else {
    db.prepare(`UPDATE processos SET numero_cnj=?, vara=?, comarca=?, tribunal=?, tipo=?, polo_ativo=?, polo_passivo=?, observacoes=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(numero_cnj, vara||null, comarca||null, tribunal||null, tipo||null, polo_ativo||null, polo_passivo||null, observacoes||null, status||'ativo', req.params.id);
  }
  res.json({ ok: true });
});

// DELETE /api/processos/:id
router.delete('/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM processos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/processos/:id/prazos
router.post('/:id/prazos', (req, res) => {
  const { titulo, tipo, data_limite, responsavel_id, observacoes } = req.body;
  if (!titulo || !data_limite) return res.status(400).json({ error: 'titulo e data_limite são obrigatórios' });
  const db = getDB();
  const processo = db.prepare('SELECT client_id FROM processos WHERE id = ?').get(req.params.id);
  if (!processo) return res.status(404).json({ error: 'Processo não encontrado' });
  const result = db.prepare(`
    INSERT INTO prazos (processo_id, client_id, titulo, tipo, data_limite, responsavel_id, observacoes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, processo.client_id, titulo, tipo||'prazo', data_limite, responsavel_id||null, observacoes||null, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/processos/:id/prazos/:prazo_id
router.put('/:id/prazos/:prazo_id', (req, res) => {
  const { concluido } = req.body;
  const db = getDB();
  db.prepare('UPDATE prazos SET concluido = ? WHERE id = ?').run(concluido ? 1 : 0, req.params.prazo_id);
  res.json({ ok: true });
});

// DELETE /api/processos/:id/prazos/:prazo_id
router.delete('/:id/prazos/:prazo_id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM prazos WHERE id = ?').run(req.params.prazo_id);
  res.json({ ok: true });
});

// GET /api/processos/:id/andamentos — busca andamentos no DataJud
router.get('/:id/andamentos', async (req, res) => {
  const db = getDB();
  const processo = db.prepare('SELECT * FROM processos WHERE id = ?').get(req.params.id);
  if (!processo) return res.status(404).json({ error: 'Processo não encontrado' });
  const resultado = await consultarProcesso(processo.numero_cnj, processo.tribunal);
  res.json(resultado);
});

export default router;
