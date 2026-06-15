import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ─── GET /api/comunicados — histórico ────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const comunicados = db.prepare(`
    SELECT c.*, u.name as autor_nome
    FROM comunicados c
    LEFT JOIN users u ON u.id = c.created_by
    ORDER BY c.created_at DESC LIMIT 50
  `).all();
  res.json(comunicados);
});

// ─── POST /api/comunicados/send — enviar broadcast ───────────────────────────
router.post('/send', authMiddleware, async (req, res) => {
  const db = getDB();
  const { mensagem, filtro } = req.body; // filtro: 'todos' | 'medico' | 'inventarios' | 'civel'

  if (!mensagem?.trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });

  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'docjuris';

  if (!evolutionUrl || !evolutionKey) {
    return res.status(500).json({ error: 'WhatsApp não configurado' });
  }

  // Buscar clientes com telefone
  let query = 'SELECT id, nome, telefone FROM clients WHERE telefone IS NOT NULL AND telefone != ''';
  const clientes = db.prepare(query).all();

  if (clientes.length === 0) {
    return res.status(400).json({ error: 'Nenhum cliente com telefone cadastrado' });
  }

  // Salvar comunicado no histórico
  const result = db.prepare(`
    INSERT INTO comunicados (mensagem, filtro, total_destinatarios, created_by)
    VALUES (?, ?, ?, ?)
  `).run(mensagem, filtro || 'todos', clientes.length, req.user.id);

  const comunicadoId = result.lastInsertRowid;

  // Enviar em background (não bloquear resposta)
  res.json({ ok: true, comunicadoId, total: clientes.length });

  // Disparar envios assíncronos
  let enviados = 0, erros = 0;
  for (const cliente of clientes) {
    try {
      const number = cliente.telefone.replace(/\D/g, '');
      const fullNumber = number.startsWith('55') ? number : `55${number}`;
      if (fullNumber.length < 12) { erros++; continue; }

      await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: fullNumber, text: mensagem }),
      });
      enviados++;
    } catch { erros++; }
    // Delay entre envios para não sobrecarregar
    await new Promise(r => setTimeout(r, 500));
  }

  // Atualizar resultado
  db.prepare('UPDATE comunicados SET enviados = ?, erros = ? WHERE id = ?')
    .run(enviados, erros, comunicadoId);

  console.log(`📣 Comunicado ${comunicadoId}: ${enviados} enviados, ${erros} erros`);
});

export default router;
