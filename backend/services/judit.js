import { getDB } from '../db.js';

const JUDIT_API_KEY = process.env.JUDIT_API_KEY;
const JUDIT_BASE = 'https://requests.prod.judit.io';

// Registrar processos no Judit para monitoramento
export async function registrarProcessosJudit() {
  if (!JUDIT_API_KEY) {
    console.log('⚠️  JUDIT_API_KEY não configurada');
    return;
  }

  const db = getDB();
  const ativos = db.prepare("SELECT * FROM processos WHERE status = 'ativo'").all();
  
  console.log(`📡 Registrando ${ativos.length} processos no Judit...`);
  let registrados = 0;
  let erros = 0;

  for (const proc of ativos) {
    try {
      const r = await fetch(`${JUDIT_BASE}/requests/`, {
        method: 'POST',
        headers: {
          'api-key': JUDIT_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          search: {
            search_type: 'lawsuit_cnj',
            search_key: proc.numero_cnj,
          },
          response_type: 'lawsuit',
          cache_ttl_in_hours: 6,
        }),
      });

      if (r.ok) {
        registrados++;
      } else {
        erros++;
        const err = await r.json();
        console.error(`  ❌ ${proc.numero_cnj}: ${err.message || r.status}`);
      }

      await new Promise(r => setTimeout(r, 200));
    } catch(e) {
      erros++;
      console.error(`  ❌ ${proc.numero_cnj}: ${e.message}`);
    }
  }

  console.log(`✅ ${registrados} registrados, ${erros} erros`);
}

// Webhook handler — recebe notificações do Judit quando há publicação nova
export async function processarWebhookJudit(payload) {
  const db = getDB();
  
  const numeroCNJ = payload.lawsuit?.cnj || payload.search_key;
  const movimentos = payload.lawsuit?.movements || payload.movements || [];
  const publicacoes = payload.lawsuit?.publications || payload.publications || [];

  if (!numeroCNJ) {
    console.error('Webhook Judit: sem número CNJ');
    return;
  }

  const proc = db.prepare(`
    SELECT p.*, c.nome as client_nome, c.id as client_id 
    FROM processos p LEFT JOIN clients c ON c.id = p.client_id 
    WHERE p.numero_cnj = ?
  `).get(numeroCNJ);

  if (!proc) {
    console.log(`Webhook Judit: processo ${numeroCNJ} não encontrado no DocJuris`);
    return;
  }

  console.log(`📡 Webhook Judit: ${numeroCNJ} — ${movimentos.length} movimentos, ${publicacoes.length} publicações`);

  // Salvar novos andamentos
  const insert = db.prepare('INSERT OR IGNORE INTO andamentos (processo_id, data, descricao) VALUES (?, ?, ?)');
  let novos = 0;

  for (const m of movimentos) {
    const data = m.date || m.data || m.dataHora;
    const descricao = m.description || m.descricao || m.nome || 'Movimentação';
    if (data && descricao) {
      const resultado = insert.run(proc.id, data, descricao);
      if (resultado.changes > 0) novos++;
    }
  }

  // Processar publicações do DJE com IA
  for (const pub of publicacoes) {
    await processarPublicacaoDJE(proc, pub);
  }

  if (novos > 0) {
    console.log(`  ✨ ${novos} novos andamentos salvos`);
    await notificarAndamentos(proc, movimentos.slice(0, 3));
  }
}

async function processarPublicacaoDJE(processo, publicacao) {
  const texto = publicacao.content || publicacao.texto || publicacao.text || '';
  if (!texto) return;

  console.log(`  📰 Analisando publicação DJE com IA...`);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Analise esta publicação do Diário da Justiça e responda APENAS em JSON:

Processo: ${processo.numero_cnj}
Cliente: ${processo.client_nome}

Publicação:
${texto.substring(0, 3000)}

Formato JSON obrigatório:
{
  "tem_prazo": true/false,
  "tipo_prazo": "tipo ou null",
  "data_prazo": "DD/MM/YYYY ou null",
  "resumo_simples": "explicação em 1-2 frases simples para leigo",
  "urgente": true/false
}`
        }]
      })
    });

    if (!response.ok) return;
    const data = await response.json();
    const text = data.content[0]?.text || '';
    const analise = JSON.parse(text.replace(/```json|```/g, '').trim());

    // Criar prazo automaticamente
    if (analise.tem_prazo && analise.data_prazo) {
      const [dia, mes, ano] = analise.data_prazo.split('/');
      const dataISO = `${ano}-${mes}-${dia}`;

      const existe = db.prepare(`
        SELECT id FROM prazos WHERE processo_id = ? AND data_limite = ? AND titulo LIKE ?
      `).get(processo.id, dataISO, `%${analise.tipo_prazo || 'DJE'}%`);

      if (!existe) {
        const db2 = getDB();
        db2.prepare(`
          INSERT INTO prazos (processo_id, client_id, titulo, tipo, data_limite, observacoes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(
          processo.id,
          processo.client_id,
          analise.tipo_prazo || 'Prazo DJE',
          analise.tipo_prazo || 'Prazo',
          dataISO,
          `Auto-detectado do DJE. ${analise.resumo_simples}`
        );
        console.log(`  📅 Prazo criado: ${analise.tipo_prazo} — ${analise.data_prazo}`);
      }
    }

    // Notificar
    await notificarDJE(processo, analise, texto);

  } catch(e) {
    console.error('  Erro análise IA:', e.message);
  }
}

async function notificarAndamentos(processo, movimentos) {
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'docjuris';

  if (!evolutionUrl || !evolutionKey) return;

  const lista = movimentos.map(m => 
    `• ${new Date(m.date || m.data).toLocaleDateString('pt-BR')} — ${m.description || m.descricao}`
  ).join('\n');

  const msg = `📋 *Novos andamentos — ${processo.numero_cnj}*\n\n` +
    `*Cliente:* ${processo.client_nome || 'N/A'}\n\n${lista}`;

  try {
    await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: '5511967351199', text: msg }),
    });
  } catch(e) { console.error('WhatsApp erro:', e.message); }
}

async function notificarDJE(processo, analise, textoCompleto) {
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'docjuris';

  if (evolutionUrl && evolutionKey) {
    const urgencia = analise.urgente ? '🔴 URGENTE' : '📰';
    const msg = `${urgencia} *Publicação DJE detectada*\n\n` +
      `*Processo:* ${processo.numero_cnj}\n` +
      `*Cliente:* ${processo.client_nome || 'N/A'}\n\n` +
      `*Resumo:* ${analise.resumo_simples}\n\n` +
      (analise.tem_prazo ? `*⏰ Prazo:* ${analise.tipo_prazo} — ${analise.data_prazo}\n_Prazo criado automaticamente no DocJuris._` : '');

    try {
      await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: '5511967351199', text: msg }),
      });
    } catch(e) { console.error('WhatsApp erro:', e.message); }
  }

  // Email
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: `DocJuris <docjuris@advmachado.adv.br>`,
      to: 'dra.andreia@advmachado.adv.br',
      subject: `${analise.urgente ? '🔴 URGENTE — ' : '📰 '}Publicação DJE — ${processo.numero_cnj}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:${analise.urgente ? '#dc2626' : '#0f2035'};padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">${analise.urgente ? '🔴 URGENTE — ' : ''}Publicação no DJE</h2>
          </div>
          <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb">
            <p><strong>Processo:</strong> ${processo.numero_cnj}</p>
            <p><strong>Cliente:</strong> ${processo.client_nome || 'N/A'}</p>
            <div style="background:white;border-left:4px solid #0f2035;padding:12px;margin:12px 0;border-radius:4px">
              ${analise.resumo_simples}
            </div>
            ${analise.tem_prazo ? `
            <div style="background:#fef3c7;border:1px solid #fbbf24;padding:12px;border-radius:6px">
              <strong>⏰ Prazo:</strong> ${analise.tipo_prazo} — <strong>${analise.data_prazo}</strong>
              <br><small>Criado automaticamente no DocJuris.</small>
            </div>` : ''}
          </div>
        </div>`,
    });
  } catch(e) { console.error('Email erro:', e.message); }
}
