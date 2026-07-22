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

export default router;
