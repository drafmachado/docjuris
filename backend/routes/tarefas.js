// Tarefas — kanban interno (A Fazer / Em Andamento / Concluído)
import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

// GET /api/tarefas?responsavel_id=&status=
router.get('/', (req, res) => {
  const db = getDB();
  const { responsavel_id } = req.query;
  let sql = `
    SELECT t.*, c.nome as cliente_nome, p.numero_cnj, u.name as responsavel_nome
    FROM tarefas t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN processos p ON p.id = t.processo_id
    LEFT JOIN users u ON u.id = t.responsavel_id
  `;
  const params = [];
  if (responsavel_id) { sql += ' WHERE t.responsavel_id = ?'; params.push(responsavel_id); }
  sql += ` ORDER BY
    CASE t.prioridade WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
    COALESCE(t.data_limite, '9999') ASC, t.created_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

// POST /api/tarefas
router.post('/', (req, res) => {
  const db = getDB();
  const { titulo, descricao, client_id, processo_id, responsavel_id, prioridade, data_limite } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' });
  const r = db.prepare(`
    INSERT INTO tarefas (titulo, descricao, client_id, processo_id, responsavel_id, prioridade, data_limite, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(titulo, descricao || null, client_id || null, processo_id || null,
         responsavel_id || req.user.id, prioridade || 'normal', data_limite || null, req.user.id);
  res.json({ id: r.lastInsertRowid });
});

// PUT /api/tarefas/:id — atualizar (status, campos)
router.put('/:id', (req, res) => {
  const db = getDB();
  const t = db.prepare('SELECT id FROM tarefas WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const { titulo, descricao, status, responsavel_id, prioridade, data_limite, client_id, processo_id } = req.body;
  db.prepare(`
    UPDATE tarefas SET
      titulo = COALESCE(?, titulo), descricao = COALESCE(?, descricao),
      status = COALESCE(?, status), responsavel_id = COALESCE(?, responsavel_id),
      prioridade = COALESCE(?, prioridade), data_limite = COALESCE(?, data_limite),
      client_id = COALESCE(?, client_id), processo_id = COALESCE(?, processo_id),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(titulo ?? null, descricao ?? null, status ?? null, responsavel_id ?? null,
         prioridade ?? null, data_limite ?? null, client_id ?? null, processo_id ?? null, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/tarefas/:id
router.delete('/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM tarefas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/tarefas/fluxos — lista fluxos padrão disponíveis
router.get('/fluxos', (req, res) => {
  const db = getDB();
  const fluxos = db.prepare('SELECT * FROM fluxos_tarefas ORDER BY nome').all();
  res.json(fluxos.map(f => ({ ...f, itens: JSON.parse(f.itens || '[]') })));
});

// POST /api/tarefas/aplicar-fluxo — cria todas as tarefas de um fluxo de uma vez
router.post('/aplicar-fluxo', (req, res) => {
  const db = getDB();
  const { fluxo_id, client_id, processo_id, responsavel_id } = req.body;
  if (!fluxo_id) return res.status(400).json({ error: 'fluxo_id é obrigatório' });

  const fluxo = db.prepare('SELECT * FROM fluxos_tarefas WHERE id = ?').get(fluxo_id);
  if (!fluxo) return res.status(404).json({ error: 'Fluxo não encontrado' });

  const itens = JSON.parse(fluxo.itens || '[]');
  const insert = db.prepare(`
    INSERT INTO tarefas (titulo, client_id, processo_id, responsavel_id, prioridade, data_limite, created_by)
    VALUES (?, ?, ?, ?, ?, date('now', '+' || ? || ' days'), ?)
  `);

  const criadas = db.transaction(() => {
    let n = 0;
    for (const item of itens) {
      insert.run(item.titulo, client_id || null, processo_id || null,
                 responsavel_id || req.user.id, item.prioridade || 'normal',
                 String(item.dias || 7), req.user.id);
      n++;
    }
    return n;
  })();

  res.json({ ok: true, criadas });
});

export default router;
