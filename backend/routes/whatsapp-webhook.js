// backend/routes/whatsapp-webhook.js
// Recebe eventos da Evolution API (mensagens chegando no WhatsApp da Dra. Andreia).
// Número desconhecido → vira Lead no funil (etapa Contato, origem WhatsApp).
// Cliente ou lead conhecido → registra a atividade, sem duplicar.
import express from 'express';
import crypto from 'crypto';
import { getDB } from '../db.js';

const router = express.Router();

// Token secreto derivado da chave da Evolution — valida que o chamador é a Evolution
export function webhookToken() {
  return crypto.createHash('sha256')
    .update('veredo-webhook-' + (process.env.EVOLUTION_API_KEY || 'sem-chave'))
    .digest('hex').slice(0, 32);
}

// Dedupe em memória: mesmo número não reprocessa por 10 min (rajadas de mensagens)
const recentes = new Map();
setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of recentes) if (agora - v > 10 * 60 * 1000) recentes.delete(k);
}, 60 * 1000);

// Últimos 8 dígitos identificam a linha (tolerante a 55/DDD/9º dígito)
function sufixo(tel) { return String(tel || '').replace(/\D/g, '').slice(-8); }

router.post('/webhook/:token', (req, res) => {
  // Resposta imediata — a Evolution não pode ficar esperando
  res.json({ ok: true });

  try {
    if (req.params.token !== webhookToken()) return;

    const body = req.body || {};
    const evento = body.event || '';
    if (!/messages[._-]?upsert/i.test(evento)) return;

    const dados = Array.isArray(body.data) ? body.data : [body.data];
    const db = getDB();

    for (const msg of dados) {
      if (!msg?.key) continue;
      const jid = msg.key.remoteJid || '';
      if (msg.key.fromMe) continue;                    // mensagens que EU enviei
      if (jid.endsWith('@g.us')) continue;             // grupos
      if (jid.includes('broadcast') || jid.includes('status')) continue;

      const numero = jid.split('@')[0].replace(/\D/g, '');
      if (numero.length < 10) continue;
      if (recentes.has(numero)) continue;
      recentes.set(numero, Date.now());

      const suf = sufixo(numero);
      // Contato marcado como "não é cliente" — ignorar completamente
      try {
        const bloqueado = db.prepare('SELECT id FROM contatos_ignorados WHERE sufixo = ?').get(suf);
        if (bloqueado) continue;
      } catch {}
      const nomePush = (msg.pushName || '').trim();
      const texto = (msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || msg.message?.imageMessage?.caption
        || '').slice(0, 300);

      // 1. É cliente? (compara pelos últimos 8 dígitos)
      const clientes = db.prepare('SELECT id, telefone FROM clients WHERE telefone IS NOT NULL AND telefone != \'\'').all();
      const cliente = clientes.find(cl => sufixo(cl.telefone) === suf);
      if (cliente) continue; // cliente conhecido — nada a fazer

      // 2. É lead existente? → registra atividade
      const leads = db.prepare('SELECT id, telefone FROM leads WHERE telefone IS NOT NULL AND telefone != \'\'').all();
      const lead = leads.find(l => sufixo(l.telefone) === suf);
      if (lead) {
        db.prepare(`INSERT INTO leads_atividades (lead_id, tipo, descricao) VALUES (?, 'whatsapp', ?)`)
          .run(lead.id, `Nova mensagem no WhatsApp${texto ? `: "${texto.slice(0, 150)}"` : ''}`);
        db.prepare(`UPDATE leads SET updated_at = datetime('now') WHERE id = ?`).run(lead.id);
        continue;
      }

      // 3. Desconhecido → LEAD NOVO na etapa Contato
      const nomeLead = nomePush || `WhatsApp +${numero.slice(0,2)} (${numero.slice(2,4)}) ${numero.slice(4)}`;
      const obs = [
        `Lead automático — primeira mensagem no WhatsApp em ${new Date().toLocaleString('pt-BR')}`,
        texto && `Mensagem: "${texto}"`,
      ].filter(Boolean).join('\n');

      const r = db.prepare(`
        INSERT INTO leads (nome, telefone, origem, etapa, observacoes)
        VALUES (?, ?, 'whatsapp', 'contato', ?)
      `).run(nomeLead, numero, obs);

      db.prepare(`INSERT INTO leads_atividades (lead_id, tipo, descricao) VALUES (?, 'whatsapp', 'Lead criado automaticamente a partir de mensagem no WhatsApp')`)
        .run(r.lastInsertRowid);

      console.log(`💬→🎯 Lead novo do WhatsApp: ${nomeLead} (${numero})`);
    }
  } catch(e) {
    console.error('Webhook WhatsApp:', e.message);
  }
});

export default router;

