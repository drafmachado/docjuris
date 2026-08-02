// backend/services/alertas.js
// Central ÚNICA de alertas por WhatsApp do sistema.
// A Dra. Andreia controla na tela WhatsApp: modo (todos | urgentes | desligado)
// e por qual linha o alerta sai. Emails não passam por aqui (continuam sempre).
import { getDB } from '../db.js';

const PADRAO = {
  modo: 'urgentes',            // 'todos' | 'urgentes' | 'desligado'
  linha: '',                   // instância de envio; vazio = automática (evita a própria linha do destino)
  destino: process.env.ANDREIA_WHATSAPP || '5511967351199',
};

export function lerConfigAlertas() {
  try {
    const db = getDB();
    const row = db.prepare(`SELECT valor FROM app_config WHERE chave = 'alertas_whatsapp'`).get();
    if (row?.valor) return { ...PADRAO, ...JSON.parse(row.valor) };
  } catch {}
  return { ...PADRAO };
}

export function salvarConfigAlertas(cfg) {
  const db = getDB();
  const atual = lerConfigAlertas();
  const novo = { ...atual, ...cfg };
  db.prepare(`
    INSERT INTO app_config (chave, valor) VALUES ('alertas_whatsapp', ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(JSON.stringify(novo));
  return novo;
}

function evoUrl() {
  let u = process.env.EVOLUTION_API_URL || '';
  if (u && !/^https?:\/\//.test(u)) u = 'https://' + u;
  return u;
}

// Escolhe a linha de envio: a configurada, ou a primeira conectada cujo número
// NÃO seja o do destino (mensagem de outra linha chega como contato normal,
// em vez de "mensagem para si mesma" — que era o que incomodava).
async function escolherLinha(cfg) {
  if (cfg.linha) return cfg.linha;
  try {
    const r = await fetch(`${evoUrl()}/instance/fetchInstances`, {
      headers: { 'apikey': process.env.EVOLUTION_API_KEY },
    });
    if (r.ok) {
      const lista = await r.json();
      const inst = (Array.isArray(lista) ? lista : [lista]).map(x => {
        const i = x?.instance || x || {};
        return {
          nome: i.instanceName || i.name,
          ok: ['open', 'connected'].includes(String(i.connectionStatus || i.status || i.state || '').toLowerCase()),
          numero: String(i.owner || i.ownerJid || '').split('@')[0].replace(/\D/g, ''),
        };
      }).filter(x => x.nome && x.ok);
      const sufDest = String(cfg.destino).replace(/\D/g, '').slice(-8);
      const outra = inst.find(x => x.numero.slice(-8) !== sufDest);
      if (outra) return outra.nome;
      if (inst[0]) return inst[0].nome;
    }
  } catch {}
  return process.env.EVOLUTION_INSTANCE || 'docjuris';
}

// Envia alerta respeitando a configuração.
// urgente=true: prazos novos/críticos. urgente=false: andamentos comuns.
export async function enviarAlertaWhatsApp(texto, { urgente = false } = {}) {
  const cfg = lerConfigAlertas();
  if (cfg.modo === 'desligado') return { enviado: false, motivo: 'alertas desligados' };
  if (cfg.modo === 'urgentes' && !urgente) return { enviado: false, motivo: 'modo urgentes: andamento comum vai só por email' };

  if (!evoUrl() || !process.env.EVOLUTION_API_KEY) return { enviado: false, motivo: 'Evolution não configurada' };

  try {
    const instancia = await escolherLinha(cfg);
    await fetch(`${evoUrl()}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'apikey': process.env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: cfg.destino, text: texto }),
    });
    return { enviado: true, instancia };
  } catch (e) {
    return { enviado: false, motivo: e.message };
  }
}
