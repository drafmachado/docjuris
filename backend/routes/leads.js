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


// ─── Contatos ignorados: silenciam o contato em toda a automação ────────────
const sufTel = t => String(t || '').replace(/\D/g, '').slice(-8);

// POST /api/leads/:id/ignorar — "não é cliente": exclui o lead e para de monitorar
router.post('/:id/ignorar', authMiddleware, (req, res) => {
  const db = getDB();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  if (lead.telefone) {
    const ja = db.prepare('SELECT id FROM contatos_ignorados WHERE sufixo = ?').get(sufTel(lead.telefone));
    if (!ja) {
      db.prepare(`INSERT INTO contatos_ignorados (telefone, sufixo, nome, motivo) VALUES (?, ?, ?, ?)`)
        .run(lead.telefone, sufTel(lead.telefone), lead.nome, req.body.motivo || 'Marcado como "não é cliente" no funil');
    }
  }
  db.prepare('DELETE FROM leads WHERE id = ?').run(lead.id);
  res.json({ ok: true, telefone: lead.telefone });
});

// GET /api/leads/ignorados — lista
router.get('/ignorados/lista', authMiddleware, (req, res) => {
  const db = getDB();
  res.json(db.prepare('SELECT * FROM contatos_ignorados ORDER BY created_at DESC').all());
});

// DELETE /api/leads/ignorados/:id — volta a monitorar
router.delete('/ignorados/:id', authMiddleware, (req, res) => {
  getDB().prepare('DELETE FROM contatos_ignorados WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
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

// POST /api/leads/:id/converter — converter em cliente (Fase 2)
router.post('/:id/converter', authMiddleware, async (req, res) => {
  const db = getDB();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  // 1. Criar cliente
  const r = db.prepare(`
    INSERT INTO clients (nome, telefone, email, created_by)
    VALUES (?, ?, ?, ?)
  `).run(lead.nome, lead.telefone, lead.email, req.user.id);
  const clienteId = r.lastInsertRowid;

  // 2. Gerar link de upload de documentos (válido por 30 dias)
  const { randomBytes } = await import('crypto');
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const mensagemBoasVindas = `Olá, ${lead.nome}! Seja bem-vindo(a) ao escritório Andreia Machado Advocacia. Para darmos início ao seu atendimento, precisamos que você envie seus documentos através do link abaixo.`;

  db.prepare(`
    INSERT INTO upload_links (token, client_id, template_ids, required_docs, manual_values, message, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(token, clienteId, JSON.stringify([]), JSON.stringify(['RG ou CNH', 'CPF', 'Comprovante de residência']),
         JSON.stringify({}), mensagemBoasVindas, expiresAt, req.user.id);

  const baseUrl = process.env.BASE_URL || 'https://advmachado.adv.br';
  const uploadLink = `${baseUrl}/upload/${token}`;

  // 3. Atualizar lead
  db.prepare(`UPDATE leads SET etapa='contratado', updated_at=datetime('now') WHERE id=?`).run(lead.id);
  db.prepare(`INSERT INTO leads_atividades (lead_id, tipo, descricao, created_by) VALUES (?,?,?,?)`)
    .run(lead.id, 'conversao', `Convertido em cliente (ID ${clienteId}). Link de documentos gerado.`, req.user.id);

  // 4. Enviar WhatsApp de boas-vindas (em background)
  res.json({ ok: true, clienteId, uploadLink });

  if (lead.telefone) {
    try {
      const evolutionUrl = process.env.EVOLUTION_API_URL;
      const evolutionKey = process.env.EVOLUTION_API_KEY;
      const instance    = process.env.EVOLUTION_INSTANCE || 'docjuris';
      if (evolutionUrl && evolutionKey) {
        const number = lead.telefone.replace(/\D/g, '');
        const fullNumber = number.startsWith('55') ? number : `55${number}`;
        const msg = `Olá, *${lead.nome}*! 👋\n\nSeja bem-vindo(a) ao escritório *Andreia Machado Advocacia*.\n\nPara iniciarmos seu atendimento, por favor envie seus documentos através do link abaixo:\n\n🔗 ${uploadLink}\n\nQualquer dúvida, estou à disposição!\n\n_Dra. Andreia Machado_`;
        await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
          method: 'POST',
          headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: fullNumber, text: msg }),
        });
        console.log(`✅ WhatsApp boas-vindas enviado para ${lead.nome}`);
      }
    } catch(e) {
      console.error('Erro WhatsApp boas-vindas:', e.message);
    }
  }
});

// DELETE /api/leads/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;

