// backend/services/evolution.js
// Integração com Evolution API para envio de notificações via WhatsApp
// Documentação: https://doc.evolution-api.com

import axios from 'axios';

const _rawUrl = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_URL      = _rawUrl && !/^https?:\/\//.test(_rawUrl) ? 'https://' + _rawUrl : _rawUrl;
const EVOLUTION_KEY      = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'docjuris';
const ANDREIA_WA         = process.env.ANDREIA_WHATSAPP || '5511967351199';

// Verificar configuração ao iniciar
if (!EVOLUTION_URL || !EVOLUTION_KEY) {
  console.warn('[whatsapp] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados. Notificações WhatsApp desabilitadas.');
}

// ── Enviar mensagem de texto ──────────────────────────────────────────────────
export async function sendText(phone, message) {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) return null;

  // Normalizar número: remover caracteres não numéricos
  const number = phone.replace(/\D/g, '');
  if (!number || number.length < 10) {
    console.warn(`[whatsapp] Número inválido: ${phone}`);
    return null;
  }

  // Garantir código do país (55 para Brasil)
  const fullNumber = number.startsWith('55') ? number : `55${number}`;

  try {
    const resp = await axios.post(
      `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        number: fullNumber,
        text: message,
      },
      {
        headers: {
          'apikey': EVOLUTION_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    console.log(`✅ WhatsApp enviado para ${fullNumber}`);
    return resp.data;
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.error(`❌ Erro ao enviar WhatsApp para ${fullNumber}:`, detail);
    return null;
  }
}

// ── Notificações específicas do Veredo ─────────────────────────────────────

// Ao gerar documento: notifica Andreia + envia link de assinatura ao cliente
export async function notifyDocumentoGerado({ clienteNome, clienteTelefone, templateNome, signatarios }) {
  const tasks = [];

  // 1. Notificar Dra. Andreia
  const msgAndreia =
    `📄 *Novo documento gerado*\n\n` +
    `👤 Cliente: ${clienteNome}\n` +
    `📋 Documento: ${templateNome}\n\n` +
    `${signatarios?.length > 1
      ? `✍️ Aguardando assinatura do cliente e da Dra. Andreia.`
      : `✍️ Aguardando assinatura do cliente.`}`;

  tasks.push(sendText(ANDREIA_WA, msgAndreia));

  // 2. Enviar link de assinatura ao cliente (se tiver telefone e link)
  if (clienteTelefone && signatarios?.length > 0) {
    const linkCliente = signatarios.find(s => s.email !== 'dra.andreia@docjuris.adv.br')?.link;
    if (linkCliente) {
      const msgCliente =
        `Olá, *${clienteNome}*! 👋\n\n` +
        `O escritório *Andreia Machado Advocacia* preparou um documento para sua assinatura.\n\n` +
        `📋 *${templateNome}*\n\n` +
        `Para assinar, acesse o link abaixo:\n` +
        `${linkCliente}\n\n` +
        `Em caso de dúvidas, entre em contato pelo WhatsApp: (11) 96735-1199`;
      tasks.push(sendText(clienteTelefone, msgCliente));
    }
  }

  await Promise.allSettled(tasks);
}

// Ao assinar documento: notifica Andreia + notifica cliente
export async function notifyDocumentoAssinado({ clienteNome, clienteTelefone, templateNome, pdfUrl }) {
  const tasks = [];

  // 1. Notificar Dra. Andreia
  const msgAndreia =
    `✅ *Documento assinado!*\n\n` +
    `👤 Cliente: ${clienteNome}\n` +
    `📋 Documento: ${templateNome}\n\n` +
    `O PDF assinado já está disponível no Veredo.`;

  tasks.push(sendText(ANDREIA_WA, msgAndreia));

  // 2. Notificar cliente
  if (clienteTelefone) {
    const msgCliente =
      `Olá, *${clienteNome}*! ✅\n\n` +
      `Seu documento foi assinado com sucesso.\n\n` +
      `📋 *${templateNome}*\n\n` +
      `O escritório *Andreia Machado Advocacia* guardará uma cópia para você.\n\n` +
      `Em caso de dúvidas: (11) 96735-1199`;
    tasks.push(sendText(clienteTelefone, msgCliente));
  }

  await Promise.allSettled(tasks);
}

// ─── Auto-registro do webhook de mensagens (chamado no boot) ─────────────────
// Configura a Evolution para avisar o Veredo a cada mensagem recebida —
// é o que alimenta a criação automática de leads no CRM.
export async function registrarWebhookMensagens() {
  try {
    const { webhookToken } = await import('../routes/whatsapp-webhook.js');
    const urlPublica = `https://advmachado.adv.br/api/whatsapp/webhook/${webhookToken()}`;
    const headers = { 'apikey': process.env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' };

    // Todas as instâncias (os 3 números do escritório) alimentam o mesmo webhook de leads
    let nomes = [process.env.EVOLUTION_INSTANCE || 'docjuris'];
    try {
      const ri = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, { headers });
      if (ri.ok) {
        const lista = await ri.json();
        const extraidos = (Array.isArray(lista) ? lista : [lista])
          .map(x => (x?.instance || x)?.instanceName || (x?.instance || x)?.name)
          .filter(Boolean);
        if (extraidos.length) nomes = [...new Set([...nomes, ...extraidos])];
      }
    } catch {}

    for (const inst of nomes) {
      let r = await fetch(`${EVOLUTION_URL}/webhook/set/${inst}`, {
        method: 'POST', headers,
        body: JSON.stringify({
          webhook: { enabled: true, url: urlPublica, webhookByEvents: false, events: ['MESSAGES_UPSERT'] },
        }),
      });
      if (!r.ok) {
        r = await fetch(`${EVOLUTION_URL}/webhook/set/${inst}`, {
          method: 'POST', headers,
          body: JSON.stringify({ enabled: true, url: urlPublica, events: ['MESSAGES_UPSERT'] }),
        });
      }
      console.log(r.ok
        ? `💬 Webhook de leads ativo na instância "${inst}"`
        : `⚠️ Webhook não registrado em "${inst}": HTTP ${r.status}`);
    }
  } catch(e) {
    console.error('⚠️ Registro do webhook Evolution falhou:', e.message);
  }
}
