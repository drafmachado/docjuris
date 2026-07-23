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
// Destinatários conforme o público escolhido
function buscarDestinatarios(db, publico) {
  const comTel = `telefone IS NOT NULL AND telefone != ''`;
  if (publico === 'leads') {
    return db.prepare(`SELECT id, nome, telefone FROM leads WHERE ${comTel} AND etapa NOT IN ('contratado','perdido')`).all();
  }
  if (publico === 'clientes_e_leads') {
    const a = db.prepare(`SELECT id, nome, telefone FROM clients WHERE ${comTel} AND nome NOT LIKE '%TRIAGEM%'`).all();
    const b = db.prepare(`SELECT id, nome, telefone FROM leads WHERE ${comTel} AND etapa NOT IN ('contratado','perdido')`).all();
    const vistos = new Set(a.map(x => String(x.telefone).replace(/\D/g, '').slice(-8)));
    return [...a, ...b.filter(x => !vistos.has(String(x.telefone).replace(/\D/g, '').slice(-8)))];
  }
  // padrão: clientes
  return db.prepare(`SELECT id, nome, telefone FROM clients WHERE ${comTel} AND nome NOT LIKE '%TRIAGEM%'`).all();
}

// GET /api/comunicados/destinatarios?publico=... — prévia da quantidade
router.get('/destinatarios', authMiddleware, (req, res) => {
  const db = getDB();
  const lista = buscarDestinatarios(db, req.query.publico);
  res.json({ total: lista.length, amostra: lista.slice(0, 5).map(x => x.nome) });
});

router.post('/send', authMiddleware, async (req, res) => {
  const db = getDB();
  // imagem: { base64, mimetype, filename } — opcional
  const { mensagem, filtro, publico, imagem, instancia } = req.body;

  if (!mensagem?.trim() && !imagem?.base64) {
    return res.status(400).json({ error: 'Escreva uma mensagem ou anexe uma imagem' });
  }

  let evolutionUrl = process.env.EVOLUTION_API_URL;
  if (evolutionUrl && !/^https?:\/\//.test(evolutionUrl)) evolutionUrl = 'https://' + evolutionUrl;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  const instance = instancia || process.env.EVOLUTION_INSTANCE || 'docjuris';

  if (!evolutionUrl || !evolutionKey) {
    return res.status(500).json({ error: 'WhatsApp não configurado' });
  }

  const destinatarios = buscarDestinatarios(db, publico);
  if (destinatarios.length === 0) {
    return res.status(400).json({ error: 'Nenhum destinatário com telefone cadastrado' });
  }

  const result = db.prepare(`
    INSERT INTO comunicados (mensagem, filtro, total_destinatarios, created_by)
    VALUES (?, ?, ?, ?)
  `).run(mensagem || '[imagem]', publico || filtro || 'clientes', destinatarios.length, req.user.id);

  const comunicadoId = result.lastInsertRowid;
  res.json({ ok: true, comunicadoId, total: destinatarios.length });

  // Envio assíncrono
  let enviados = 0, erros = 0;
  for (const dest of destinatarios) {
    try {
      const number = String(dest.telefone).replace(/\D/g, '');
      const fullNumber = number.startsWith('55') ? number : `55${number}`;
      if (fullNumber.length < 12) { erros++; continue; }

      // Personalização simples: {nome} vira o primeiro nome do destinatário
      const texto = String(mensagem || '').replace(/\{nome\}/gi, String(dest.nome || '').split(' ')[0]);

      if (imagem?.base64) {
        // Imagem com legenda (a mensagem vai como caption)
        await fetch(`${evolutionUrl}/message/sendMedia/${instance}`, {
          method: 'POST',
          headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: fullNumber,
            mediatype: 'image',
            mimetype: imagem.mimetype || 'image/jpeg',
            media: imagem.base64,
            fileName: imagem.filename || 'comunicado.jpg',
            caption: texto || undefined,
          }),
        });
      } else {
        await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
          method: 'POST',
          headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: fullNumber, text: texto }),
        });
      }
      enviados++;
    } catch { erros++; }
    await new Promise(r => setTimeout(r, 800)); // ritmo seguro (evita bloqueio do WhatsApp)
  }

  db.prepare('UPDATE comunicados SET enviados = ?, erros = ? WHERE id = ?')
    .run(enviados, erros, comunicadoId);

  console.log(`📣 Comunicado ${comunicadoId}: ${enviados} enviados, ${erros} erros`);
});

export default router;

