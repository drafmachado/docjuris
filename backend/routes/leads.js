import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/leads — listar com filtros
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { etapa, area } = req.query;
  let sql = `
    SELECT l.*, u.name as criado_por
    FROM leads l LEFT JOIN users u ON u.id = l.created_by
    WHERE 1=1
  `;
  const params = [];
  if (etapa) { sql += ' AND l.etapa = ?'; params.push(etapa); }
  if (area)  { sql += ' AND l.area = ?';  params.push(area); }
  sql += ' ORDER BY l.updated_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/leads/:id — detalhe + atividades
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  const atividades = db.prepare(`
    SELECT a.*, u.name as autor FROM leads_atividades a
    LEFT JOIN users u ON u.id = a.created_by
    WHERE a.lead_id = ? ORDER BY a.created_at DESC
  `).all(lead.id);
  res.json({ ...lead, atividades });
});

// POST /api/leads — criar
router.post('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { nome, telefone, email, area, origem, valor_estimado, observacoes } = req.body;
  if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  const r = db.prepare(`
    INSERT INTO leads (nome, telefone, email, area, origem, valor_estimado, observacoes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nome, telefone||null, email||null, area||'outro', origem||'outro',
         valor_estimado||null, observacoes||null, req.user.id);
  // Log atividade
  db.prepare(`INSERT INTO leads_atividades (lead_id, tipo, descricao, created_by) VALUES (?,?,?,?)`)
    .run(r.lastInsertRowid, 'criacao', `Lead criado`, req.user.id);
  res.json({ id: r.lastInsertRowid });
});

// PUT /api/leads/:id — atualizar
router.put('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  const { nome, telefone, email, area, origem, etapa, valor_estimado, observacoes } = req.body;
  db.prepare(`
    UPDATE leads SET nome=?, telefone=?, email=?, area=?, origem=?, etapa=?,
    valor_estimado=?, observacoes=?, updated_at=datetime('now') WHERE id=?
  `).run(nome||lead.nome, telefone||null, email||null, area||lead.area,
         origem||lead.origem, etapa||lead.etapa, valor_estimado||null,
         observacoes||null, lead.id);
  // Log mudança de etapa
  if (etapa && etapa !== lead.etapa) {
    const etapas = { contato:'Contato inicial', consulta:'Consulta agendada',
      proposta:'Proposta enviada', contratado:'Contratado ✅', perdido:'Perdido ❌' };
    db.prepare(`INSERT INTO leads_atividades (lead_id, tipo, descricao, created_by) VALUES (?,?,?,?)`)
      .run(lead.id, 'etapa', `Movido para: ${etapas[etapa]||etapa}`, req.user.id);
  }
  res.json({ ok: true });
});

// POST /api/leads/:id/atividades — add atividade
router.post('/:id/atividades', authMiddleware, (req, res) => {
  const db = getDB();
  const { tipo, descricao } = req.body;
  db.prepare(`INSERT INTO leads_atividades (lead_id, tipo, descricao, created_by) VALUES (?,?,?,?)`)
    .run(req.params.id, tipo||'nota', descricao, req.user.id);
  res.json({ ok: true });
});

// POST /api/leads/:id/converter — converter em cliente
router.post('/:id/converter', authMiddleware, (req, res) => {
  const db = getDB();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  // Criar cliente com dados do lead
  const r = db.prepare(`
    INSERT INTO clients (nome, telefone, email, created_by)
    VALUES (?, ?, ?, ?)
  `).run(lead.nome, lead.telefone, lead.email, req.user.id);
  // Marcar lead como contratado
  db.prepare(`UPDATE leads SET etapa='contratado', updated_at=datetime('now') WHERE id=?`).run(lead.id);
  db.prepare(`INSERT INTO leads_atividades (lead_id, tipo, descricao, created_by) VALUES (?,?,?,?)`)
    .run(lead.id, 'conversao', `Convertido em cliente (ID ${r.lastInsertRowid})`, req.user.id);
  res.json({ ok: true, clienteId: r.lastInsertRowid });
});

// DELETE /api/leads/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
