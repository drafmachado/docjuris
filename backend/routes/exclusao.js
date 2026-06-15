import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/exclusao — listar solicitações (admin vê todas, user vê as suas)
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const isAdmin = req.user.role === 'admin';
  let sql = `SELECT s.*, u.name as solicitante, a.name as aprovador_nome
    FROM solicitacoes_exclusao s
    LEFT JOIN users u ON u.id = s.solicitado_por
    LEFT JOIN users a ON a.id = s.aprovado_por
    WHERE s.status = 'pendente'`;
  if (!isAdmin) { sql += ' AND s.solicitado_por = ' + req.user.id; }
  sql += ' ORDER BY s.created_at DESC';
  res.json(db.prepare(sql).all());
});

// GET /api/exclusao/count — contador de pendentes (para badge)
router.get('/count', authMiddleware, (req, res) => {
  const db = getDB();
  const count = db.prepare("SELECT COUNT(*) as n FROM solicitacoes_exclusao WHERE status='pendente'").get();
  res.json({ pendentes: count.n });
});

// POST /api/exclusao — solicitar exclusão
router.post('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { tipo, referencia_id, motivo } = req.body;
  if (!tipo || !referencia_id) return res.status(400).json({ error: 'tipo e referencia_id obrigatórios' });

  // Buscar nome da referência
  let nome = '';
  if (tipo === 'cliente') {
    const c = db.prepare('SELECT nome FROM clients WHERE id = ?').get(referencia_id);
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
    nome = c.nome;
  } else if (tipo === 'processo') {
    const p = db.prepare('SELECT numero_cnj FROM processos WHERE id = ?').get(referencia_id);
    if (!p) return res.status(404).json({ error: 'Processo não encontrado' });
    nome = p.numero_cnj;
  }

  // Verificar se já existe solicitação pendente
  const existe = db.prepare("SELECT id FROM solicitacoes_exclusao WHERE tipo=? AND referencia_id=? AND status='pendente'")
    .get(tipo, referencia_id);
  if (existe) return res.status(400).json({ error: 'Já existe uma solicitação pendente para este item' });

  db.prepare(`
    INSERT INTO solicitacoes_exclusao (tipo, referencia_id, referencia_nome, motivo, solicitado_por)
    VALUES (?, ?, ?, ?, ?)
  `).run(tipo, referencia_id, nome, motivo||null, req.user.id);

  // Notificar admin via WhatsApp
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  const andreia = process.env.ANDREIA_WHATSAPP || '5511967351199';
  if (evolutionUrl && evolutionKey) {
    const instance = process.env.EVOLUTION_INSTANCE || 'docjuris';
    fetch(`${evolutionUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: andreia,
        text: `⚠️ *Solicitação de exclusão*\n\nTipo: ${tipo}\nRegistro: ${nome}\nMotivo: ${motivo || 'não informado'}\n\nAcesse o Veredo para aprovar ou rejeitar.`
      })
    }).catch(() => {});
  }

  res.json({ ok: true });
});

// PUT /api/exclusao/:id/aprovar — admin aprova
router.put('/:id/aprovar', authMiddleware, (req, res) => {
  const db = getDB();
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem aprovar exclusões' });

  const sol = db.prepare('SELECT * FROM solicitacoes_exclusao WHERE id = ?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });
  if (sol.status !== 'pendente') return res.status(400).json({ error: 'Solicitação já processada' });

  // Executar exclusão
  try {
    if (sol.tipo === 'cliente') {
      db.prepare('DELETE FROM clients WHERE id = ?').run(sol.referencia_id);
    } else if (sol.tipo === 'processo') {
      db.prepare('DELETE FROM processos WHERE id = ?').run(sol.referencia_id);
    }
    db.prepare(`UPDATE solicitacoes_exclusao SET status='aprovado', aprovado_por=?, updated_at=datetime('now') WHERE id=?`)
      .run(req.user.id, sol.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Erro ao executar exclusão: ' + e.message });
  }
});

// PUT /api/exclusao/:id/rejeitar — admin rejeita
router.put('/:id/rejeitar', authMiddleware, (req, res) => {
  const db = getDB();
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem rejeitar exclusões' });
  db.prepare(`UPDATE solicitacoes_exclusao SET status='rejeitado', aprovado_por=?, updated_at=datetime('now') WHERE id=?`)
    .run(req.user.id, req.params.id);
  res.json({ ok: true });
});

export default router;
