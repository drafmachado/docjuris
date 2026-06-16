import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/agenda — todos os prazos não concluídos, com cliente e processo
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { incluir_concluidos } = req.query;

  const filtroConcluido = incluir_concluidos === 'true' ? '' : 'AND p.concluido = 0';

  const prazos = db.prepare(`
    SELECT p.*,
           c.nome as cliente_nome,
           pr.numero_cnj, pr.tribunal, pr.tipo as processo_tipo,
           CAST(julianday(p.data_limite) - julianday('now', 'localtime') AS INTEGER) as dias_restantes
    FROM prazos p
    JOIN clients c ON c.id = p.client_id
    JOIN processos pr ON pr.id = p.processo_id
    WHERE 1=1 ${filtroConcluido}
    ORDER BY p.data_limite ASC
  `).all();

  // Agrupar por urgência
  const grupos = {
    vencidos: [],
    hoje: [],
    semana: [],
    mes: [],
    depois: [],
  };

  for (const p of prazos) {
    const d = p.dias_restantes;
    if (d < 0) grupos.vencidos.push(p);
    else if (d === 0) grupos.hoje.push(p);
    else if (d <= 7) grupos.semana.push(p);
    else if (d <= 30) grupos.mes.push(p);
    else grupos.depois.push(p);
  }

  res.json({
    grupos,
    total: prazos.length,
    resumo: {
      vencidos: grupos.vencidos.length,
      hoje: grupos.hoje.length,
      semana: grupos.semana.length,
      mes: grupos.mes.length,
      depois: grupos.depois.length,
    },
  });
});

// PUT /api/agenda/:id/concluir — marca prazo como concluído
router.put('/:id/concluir', authMiddleware, (req, res) => {
  const db = getDB();
  const { concluido } = req.body;
  db.prepare('UPDATE prazos SET concluido = ? WHERE id = ?').run(concluido ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// POST /api/agenda — criar prazo avulso (sem precisar entrar no processo)
router.post('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { processo_id, titulo, tipo, data_limite, observacoes } = req.body;
  if (!processo_id || !titulo || !data_limite) {
    return res.status(400).json({ error: 'processo_id, titulo e data_limite são obrigatórios' });
  }
  const proc = db.prepare('SELECT client_id FROM processos WHERE id = ?').get(processo_id);
  if (!proc) return res.status(404).json({ error: 'Processo não encontrado' });

  const r = db.prepare(`
    INSERT INTO prazos (processo_id, client_id, titulo, tipo, data_limite, observacoes, responsavel_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(processo_id, proc.client_id, titulo, tipo || 'prazo', data_limite, observacoes || null, req.user.id);
  res.json({ id: r.lastInsertRowid });
});

export default router;
