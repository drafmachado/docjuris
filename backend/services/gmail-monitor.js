import { getDB } from '../db.js';

const GMAIL_REMETENTES = [
  'tjrj.pjeadm-LD@tjrj.jus.br',
  'eproc@tjsp.jus.br',
  'nao.responda.12946977@tjrj.jus.br',
];

// Obtém access token usando refresh token OAuth2
async function getGmailAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!r.ok) {
      console.error('Erro ao obter access token Gmail:', await r.text());
      return null;
    }
    const data = await r.json();
    return data.access_token;
  } catch(e) {
    console.error('Erro OAuth Gmail:', e.message);
    return null;
  }
}

// Extrai número CNJ do assunto ou corpo do email
function extrairNumeroCNJ(texto) {
  const regex = /\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}/g;
  const matches = texto.match(regex) || [];
  return [...new Set(matches)];
}

// Extrai movimentação do email do PJe TJRJ
function extrairMovimentacaoPJe(html) {
  const movimentos = [];
  // Padrão: "DD/MM/YYYY HH:MM - Descrição do movimento"
  const regex = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\s*-\s*([^<\n]+)/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const [dia, mes, ano] = m[1].split(/[\/ ]/);
    const dataISO = `${ano}-${mes}-${dia}`;
    movimentos.push({ data: dataISO, descricao: m[2].trim() });
  }
  return movimentos;
}

// Extrai movimentação do email do eproc TJSP
function extrairMovimentacaoEproc(html, assunto) {
  const movimentos = [];
  // Busca "Movimentação: XXXXX"
  const matchMov = html.match(/Movimentação:\s*<\/td>\s*<td[^>]*>([^<]+)/);
  if (matchMov) {
    const descricao = matchMov[1].trim();
    const dataHoje = new Date().toISOString().split('T')[0];
    movimentos.push({ data: dataHoje, descricao });
  }
  return movimentos;
}

// Extrai polo ativo (cliente) do email PJe
function extrairPoloAtivo(html) {
  const match = html.match(/Polo Ativo:\s*([^\n<]+)/);
  return match ? match[1].trim() : null;
}

// Extrai polo ativo do eproc (AUTOR)
function extrairPoloAtivoEproc(html) {
  const match = html.match(/AUTOR[\s\S]*?center;">([\wÀ-ÿ\s]+)<\/td>/);
  return match ? match[1].trim() : null;
}

async function notificarNovoAndamentoEmail(processo, andamento) {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE || 'docjuris';

    if (evolutionUrl && evolutionKey) {
      const dataFmt = new Date(andamento.data).toLocaleDateString('pt-BR');
      const msg = `📋 *Nova movimentação — email tribunal*\n\n` +
        `*Processo:* ${processo.numero_cnj}\n` +
        `*Cliente:* ${processo.client_nome || 'N/A'}\n` +
        `*Tribunal:* ${processo.tribunal}\n` +
        `*Data:* ${dataFmt}\n\n` +
        `_${andamento.descricao}_`;

      await fetch(`${evolutionUrl.replace(/\/+$/, '').startsWith('http') ? evolutionUrl.replace(/\/+$/, '') : 'https://' + evolutionUrl.replace(/\/+$/, '')}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: '5511967351199', text: msg }),
      });
    }
  } catch(e) { console.error('WhatsApp erro:', e.message); }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const dataFmt = new Date(andamento.data).toLocaleDateString('pt-BR');
    await resend.emails.send({
      from: `Veredo <docjuris@advmachado.adv.br>`,
      to: 'dra.andreia@advmachado.adv.br',
      subject: `📋 Nova movimentação — ${processo.numero_cnj} (${processo.client_nome || 'cliente'})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0f2035;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">📋 Nova Movimentação Processual</h2>
          </div>
          <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb">
            <p><strong>Processo:</strong> ${processo.numero_cnj}</p>
            <p><strong>Cliente:</strong> ${processo.client_nome || 'N/A'}</p>
            <p><strong>Tribunal:</strong> ${processo.tribunal}</p>
            <p><strong>Data:</strong> ${dataFmt}</p>
            <div style="background:white;border-left:4px solid #0f2035;padding:12px;margin:12px 0;border-radius:4px">
              <strong>${andamento.descricao}</strong>
            </div>
            <p style="font-size:12px;color:#6b7280">Detectado automaticamente via email do tribunal.</p>
          </div>
        </div>`,
    });
  } catch(e) { console.error('Email erro:', e.message); }
}

export async function monitorarEmailsTribunal() {
  const db = getDB();

  // Obter access token via OAuth refresh token
  const GMAIL_TOKEN = await getGmailAccessToken();

  if (!GMAIL_TOKEN) {
    console.log('⚠️  Gmail OAuth não configurado — pulando monitoramento por email');
    return;
  }

  console.log('📧 Monitorando emails dos tribunais...');

  const query = encodeURIComponent(
    `from:(${GMAIL_REMETENTES.join(' OR ')}) newer_than:1d`
  );

  let emails = [];
  try {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`,
      { headers: { Authorization: `Bearer ${GMAIL_TOKEN}` } }
    );
    if (!r.ok) {
      console.log('  Gmail API indisponível:', r.status);
      return;
    }
    const data = await r.json();
    emails = data.messages || [];
  } catch(e) {
    console.log('  Erro Gmail API:', e.message);
    return;
  }

  console.log(`  ${emails.length} email(s) de tribunal encontrado(s)`);

  // Tabela de controle para não reprocessar emails já vistos
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS emails_processados (
      id TEXT PRIMARY KEY,
      processado_em TEXT DEFAULT (datetime('now'))
    )`);
  } catch {}

  let novos = 0;

  for (const emailRef of emails) {
    // Verificar se já processamos este email
    const jaVisto = db.prepare('SELECT id FROM emails_processados WHERE id = ?').get(emailRef.id);
    if (jaVisto) continue;

    // Buscar conteúdo completo
    try {
      const r2 = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailRef.id}?format=full`,
        { headers: { Authorization: `Bearer ${GMAIL_TOKEN}` } }
      );
      if (!r2.ok) continue;
      const msg = await r2.json();

      const headers = msg.payload?.headers || [];
      const assunto = headers.find(h => h.name === 'Subject')?.value || '';
      const remetente = headers.find(h => h.name === 'From')?.value || '';

      // Decodificar corpo HTML
      let html = '';
      const partes = msg.payload?.parts || [msg.payload];
      for (const parte of partes) {
        if (parte?.mimeType === 'text/html' && parte?.body?.data) {
          html += Buffer.from(parte.body.data, 'base64').toString('utf-8');
        }
      }
      if (!html && msg.payload?.body?.data) {
        html = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
      }

      // Extrair números de processo
      const numeros = extrairNumeroCNJ(assunto + ' ' + html);
      if (numeros.length === 0) {
        db.prepare('INSERT OR IGNORE INTO emails_processados (id) VALUES (?)').run(emailRef.id);
        continue;
      }

      // Extrair movimentações
      let movimentos = [];
      if (remetente.includes('tjrj')) {
        movimentos = extrairMovimentacaoPJe(html);
      } else if (remetente.includes('eproc')) {
        movimentos = extrairMovimentacaoEproc(html, assunto);
      }

      for (const numeroCNJ of numeros) {
        // Verificar se processo existe no Veredo
        let proc = db.prepare(`
          SELECT p.*, c.nome as client_nome FROM processos p
          LEFT JOIN clients c ON c.id = p.client_id
          WHERE p.numero_cnj = ?
        `).get(numeroCNJ);

        // Se não existe, criar automaticamente
        if (!proc) {
          const tribunal = remetente.includes('tjrj') ? 'TJRJ' : 'TJSP';
          const nomeCliente = remetente.includes('tjrj')
            ? extrairPoloAtivo(html)
            : extrairPoloAtivoEproc(html);

          // Criar ou buscar cliente
          let clientId = null;
          if (nomeCliente && nomeCliente !== 'ANDREIA FERREIRA MACHADO') {
            let cliente = db.prepare('SELECT id FROM clients WHERE nome = ?').get(nomeCliente);
            if (!cliente) {
              const r = db.prepare('INSERT INTO clients (nome, created_by) VALUES (?, 1)').run(nomeCliente);
              clientId = r.lastInsertRowid;
            } else {
              clientId = cliente.id;
            }
          }

          // Criar processo
          const rp = db.prepare(`
            INSERT INTO processos (client_id, numero_cnj, tribunal, tipo, polo_ativo, observacoes, created_by)
            VALUES (?, ?, ?, 'Cível', ?, 'Criado automaticamente via email do tribunal', 1)
          `).run(clientId, numeroCNJ, tribunal, nomeCliente || null);

          proc = db.prepare(`
            SELECT p.*, c.nome as client_nome FROM processos p
            LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?
          `).get(rp.lastInsertRowid);

          console.log(`  ✅ Processo criado: ${numeroCNJ} (${nomeCliente || 'cliente a identificar'})`);
        }

        // Salvar movimentações novas
        const insert = db.prepare('INSERT OR IGNORE INTO andamentos (processo_id, data, descricao) VALUES (?, ?, ?)');
        for (const m of movimentos) {
          const resultado = insert.run(proc.id, m.data, m.descricao);
          if (resultado.changes > 0) {
            novos++;
            console.log(`  ✨ NOVO: ${numeroCNJ} — ${m.descricao}`);
            await notificarNovoAndamentoEmail(proc, m);
          }
        }
      }

      // Marcar email como processado
      db.prepare('INSERT OR IGNORE INTO emails_processados (id) VALUES (?)').run(emailRef.id);
      await new Promise(r => setTimeout(r, 300));

    } catch(e) {
      console.error(`  Erro ao processar email ${emailRef.id}:`, e.message);
    }
  }

  console.log(`✅ Monitoramento email concluído — ${novos} novo(s) andamento(s)`);
}
