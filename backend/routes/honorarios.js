import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/honorarios?client_id=X
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { client_id } = req.query;
  let sql = `SELECT h.*, c.nome as cliente, p.numero_cnj as processo
    FROM honorarios h
    JOIN clients c ON c.id = h.client_id
    LEFT JOIN processos p ON p.id = h.processo_id
    WHERE 1=1`;
  const params = [];
  if (client_id) { sql += ' AND h.client_id = ?'; params.push(client_id); }
  sql += ' ORDER BY h.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/honorarios
router.post('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { client_id, processo_id, descricao, valor_total, num_parcelas, vencimento, observacoes } = req.body;
  if (!client_id || !descricao || !valor_total) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  const parcelas = num_parcelas || 1;
  const r = db.prepare(`
    INSERT INTO honorarios (client_id, processo_id, descricao, valor_total, num_parcelas, valor_parcela, vencimento, observacoes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(client_id, processo_id||null, descricao, valor_total, parcelas,
         (valor_total / parcelas).toFixed(2), vencimento||null, observacoes||null, req.user.id);
  res.json({ id: r.lastInsertRowid });
});

// PUT /api/honorarios/:id/status
router.put('/:id/status', authMiddleware, (req, res) => {
  const db = getDB();
  const { status } = req.body;
  const validos = ['pendente', 'pago', 'atrasado', 'cancelado'];
  if (!validos.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  db.prepare(`UPDATE honorarios SET status=?, data_pagamento=CASE WHEN ?='pago' THEN datetime('now') ELSE data_pagamento END, updated_at=datetime('now') WHERE id=?`)
    .run(status, status, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/honorarios/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM honorarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
