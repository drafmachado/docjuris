// backend/routes/whatsapp-admin.js
// Gestão das conexões de WhatsApp (instâncias Evolution): listar, criar, QR code.
// Permite conectar os 3 números do escritório para captação automática de leads.
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

function evoBase() {
  let url = process.env.EVOLUTION_API_URL || '';
  if (url && !/^https?:\/\//.test(url)) url = 'https://' + url;
  return url;
}
function evoHeaders() {
  return { 'apikey': process.env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' };
}

// GET /api/whatsapp-admin/instancias — lista conexões com estado e número
router.get('/instancias', async (req, res) => {
  try {
    const r = await fetch(`${evoBase()}/instance/fetchInstances`, { headers: evoHeaders() });
    if (!r.ok) return res.status(502).json({ error: `Evolution respondeu ${r.status}` });
    const bruto = await r.json();
    const lista = (Array.isArray(bruto) ? bruto : [bruto]).map(item => {
      const i = item?.instance || item || {};
      const owner = String(i.owner || i.ownerJid || '').split('@')[0].replace(/\D/g, '');
      return {
        nome: i.instanceName || i.name || '?',
        estado: i.connectionStatus || i.status || i.state || 'desconhecido',
        numero: owner.length >= 12 ? `+${owner.slice(0,2)} (${owner.slice(2,4)}) ${owner.slice(4,9)}-${owner.slice(9)}` : null,
        perfil: i.profileName || null,
      };
    });
    res.json(lista);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-admin/instancias — cria conexão nova { nome }
router.post('/instancias', async (req, res) => {
  const nome = String(req.body.nome || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!nome || nome.length < 3) return res.status(400).json({ error: 'Nome inválido (mín. 3 letras, sem espaços)' });
  try {
    const r = await fetch(`${evoBase()}/instance/create`, {
      method: 'POST', headers: evoHeaders(),
      body: JSON.stringify({ instanceName: nome, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: d.message || d.error || `Evolution respondeu ${r.status}` });

    // Registrar o webhook de leads para a instância nova
    const { registrarWebhookMensagens } = await import('../services/evolution.js');
    setTimeout(() => registrarWebhookMensagens(), 3000);

    res.json({ ok: true, nome });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-admin/instancias/:nome/qr — QR code para escanear
router.get('/instancias/:nome/qr', async (req, res) => {
  try {
    const r = await fetch(`${evoBase()}/instance/connect/${encodeURIComponent(req.params.nome)}`, {
      headers: evoHeaders(),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: d.message || `Evolution respondeu ${r.status}` });
    const qr = d.base64 || d.qrcode?.base64 || d.code || null;
    if (!qr) return res.json({ conectado: true }); // já conectada — sem QR
    res.json({ qr: qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}` });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// ANÁLISE RETROATIVA DAS CONVERSAS (IA classifica: cliente / negociação / outro)
// ═══════════════════════════════════════════════════════════════════════════
import { getDB } from '../db.js';

const analiseJobs = new Map();
setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of analiseJobs) if (agora - v.createdAt > 60 * 60 * 1000) analiseJobs.delete(k);
}, 10 * 60 * 1000);

function sufixoTel(t) { return String(t || '').replace(/\D/g, '').slice(-8); }

async function classificarConversaIA(transcricao, nomeContato) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Você analisa conversas de WhatsApp de um escritório de advocacia (Dra. Andreia).
Classifique este contato em UMA categoria:
- "cliente": já é cliente ativo (fala de processo em andamento, envia documentos do caso, trata como advogada contratada)
- "negociacao": potencial cliente (consulta jurídica, pergunta preços/honorários, avalia contratar, caso em análise)
- "outro": pessoal, família, fornecedor, spam, grupo de trabalho, sem relação comercial

Contato: "${nomeContato}"
Conversa (últimas mensagens, [ELA]=advogada, [CONTATO]=a pessoa):
${transcricao.slice(0, 3000)}

Responda APENAS com JSON válido, sem markdown:
{"classificacao":"cliente|negociacao|outro","nome":"nome real da pessoa se identificável na conversa, senão o nome do contato","area":"saude|civel|consumidor|inventario|trabalhista|outro","resumo":"1 frase: o que é o caso ou o que está sendo negociado"}`,
      }],
    }),
  });
  if (!r.ok) throw new Error(`IA respondeu ${r.status}`);
  const d = await r.json();
  const texto = (d.content || []).map(b => b.text || '').join('');
  return JSON.parse(texto.replace(/```json|```/g, '').trim());
}

// POST /api/whatsapp-admin/analisar-conversas { instancia }
router.post('/analisar-conversas', async (req, res) => {
  const instancia = String(req.body.instancia || '').trim();
  if (!instancia) return res.status(400).json({ error: 'Informe a instância' });

  const jobId = 'wa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  analiseJobs.set(jobId, {
    status: 'processing', fase: 'buscando conversas', total: 0, processados: 0,
    clientes_criados: 0, leads_criados: 0, ja_conhecidos: 0, irrelevantes: 0,
    erros: [], detalhes: [], createdAt: Date.now(),
  });

  analisarConversasAsync(jobId, instancia, req.user.id).catch(e => {
    const j = analiseJobs.get(jobId);
    if (j) { j.status = 'error'; j.erroGeral = e.message; }
  });

  res.json({ jobId });
});

router.get('/analisar-conversas/status/:jobId', (req, res) => {
  const j = analiseJobs.get(req.params.jobId);
  if (!j) return res.status(404).json({ error: 'Job não encontrado' });
  res.json(j);
});

async function analisarConversasAsync(jobId, instancia, userId) {
  const job = analiseJobs.get(jobId);
  const db = getDB();

  // 1. Buscar todas as conversas da instância
  const rc = await fetch(`${evoBase()}/chat/findChats/${instancia}`, {
    method: 'POST', headers: evoHeaders(), body: JSON.stringify({}),
  });
  if (!rc.ok) throw new Error(`Evolution findChats: ${rc.status}`);
  const brutoChats = await rc.json();
  const chats = (Array.isArray(brutoChats) ? brutoChats : (brutoChats.chats || brutoChats.records || []))
    .map(ch => ({
      jid: ch.remoteJid || ch.id || '',
      nome: ch.pushName || ch.name || '',
    }))
    .filter(ch => ch.jid && !ch.jid.endsWith('@g.us') && !ch.jid.includes('broadcast') && !ch.jid.includes('status'))
    .slice(0, 300);

  job.total = chats.length;
  job.fase = 'analisando conversas';

  // Telefones já conhecidos
  const clientesDB = db.prepare(`SELECT id, telefone FROM clients WHERE telefone IS NOT NULL AND telefone != ''`).all();
  const leadsDB = db.prepare(`SELECT id, telefone FROM leads WHERE telefone IS NOT NULL AND telefone != ''`).all();
  const sufClientes = new Set(clientesDB.map(x => sufixoTel(x.telefone)));
  const sufLeads = new Set(leadsDB.map(x => sufixoTel(x.telefone)));

  for (const chat of chats) {
    try {
      const numero = chat.jid.split('@')[0].replace(/\D/g, '');
      const suf = sufixoTel(numero);
      if (numero.length < 10) { job.irrelevantes++; job.processados++; continue; }
      if (sufClientes.has(suf) || sufLeads.has(suf)) { job.ja_conhecidos++; job.processados++; continue; }

      // 2. Últimas mensagens da conversa
      const rm = await fetch(`${evoBase()}/chat/findMessages/${instancia}`, {
        method: 'POST', headers: evoHeaders(),
        body: JSON.stringify({ where: { key: { remoteJid: chat.jid } }, limit: 15 }),
      });
      if (!rm.ok) { job.erros.push({ numero, erro: `mensagens: ${rm.status}` }); job.processados++; continue; }
      const brutoMsgs = await rm.json();
      const registros = Array.isArray(brutoMsgs) ? brutoMsgs
        : (brutoMsgs.messages?.records || brutoMsgs.records || brutoMsgs.messages || []);

      const linhas = registros.map(m => {
        const texto = m.message?.conversation || m.message?.extendedTextMessage?.text
          || m.message?.imageMessage?.caption || '';
        if (!texto) return null;
        return `[${m.key?.fromMe ? 'ELA' : 'CONTATO'}] ${texto.slice(0, 200)}`;
      }).filter(Boolean);

      if (linhas.length < 2) { job.irrelevantes++; job.processados++; continue; }

      // 3. IA classifica
      const analise = await classificarConversaIA(linhas.join('\n'), chat.nome || numero);

      if (analise.classificacao === 'cliente') {
        db.prepare(`
          INSERT INTO clients (nome, telefone, observacoes, advogadas, created_by)
          VALUES (?, ?, ?, 'ambas', ?)
        `).run(
          (analise.nome || chat.nome || `WhatsApp ${numero}`).slice(0, 120), numero,
          `⚠️ Criado pela análise de WhatsApp — COMPLETAR CADASTRO (CPF, endereço, email)\nResumo da conversa: ${analise.resumo || ''}`,
          userId
        );
        sufClientes.add(suf);
        job.clientes_criados++;
        job.detalhes.push({ tipo: 'cliente', nome: analise.nome || chat.nome, numero, resumo: analise.resumo });
      } else if (analise.classificacao === 'negociacao') {
        const r = db.prepare(`
          INSERT INTO leads (nome, telefone, area, origem, etapa, observacoes)
          VALUES (?, ?, ?, 'whatsapp', 'contato', ?)
        `).run(
          (analise.nome || chat.nome || `WhatsApp ${numero}`).slice(0, 120), numero,
          analise.area || 'outro',
          `Análise de WhatsApp: ${analise.resumo || 'em negociação'}`
        );
        db.prepare(`INSERT INTO leads_atividades (lead_id, tipo, descricao) VALUES (?, 'whatsapp', ?)`)
          .run(r.lastInsertRowid, `Lead identificado pela análise das conversas: ${analise.resumo || ''}`);
        sufLeads.add(suf);
        job.leads_criados++;
        job.detalhes.push({ tipo: 'lead', nome: analise.nome || chat.nome, numero, resumo: analise.resumo });
      } else {
        job.irrelevantes++;
      }
    } catch(e) {
      job.erros.push({ numero: chat.jid?.split('@')[0], erro: e.message });
    }
    job.processados++;
    await new Promise(r => setTimeout(r, 800)); // gentileza com Evolution + Anthropic
  }

  job.status = 'done';
  job.fase = 'concluído';
}

export default router;
