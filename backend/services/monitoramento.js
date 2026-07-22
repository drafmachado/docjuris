import { getDB } from '../db.js';

const ESCAVADOR_TOKEN = process.env.ESCAVADOR_API_TOKEN;
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const BASE_URL_DATAJUD = 'https://api-publica.datajud.cnj.jus.br';

const ENDPOINTS_DATAJUD = {
  'TJRJ': 'api_publica_tjrj',
  'TJSP': 'api_publica_tjsp',
  'TRF1': 'api_publica_trf1',
  'TRF2': 'api_publica_trf2',
  'TRF3': 'api_publica_trf3',
  'TRT2': 'api_publica_trt2',
  'TRT1': 'api_publica_trt1',
};

async function consultarEscavador(numeroCNJ) {
  if (!ESCAVADOR_TOKEN) return null;
  try {
    const r = await fetch(`https://api.escavador.com/api/v2/processos/numero_cnj/${encodeURIComponent(numeroCNJ)}`, {
      headers: { 'Authorization': `Bearer ${ESCAVADOR_TOKEN}`, 'Accept': 'application/json' }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function consultarDataJud(numeroCNJ, tribunal) {
  const endpoint = ENDPOINTS_DATAJUD[tribunal];
  if (!endpoint) return null;
  const numeroLimpo = numeroCNJ.replace(/[.\-]/g, '');
  try {
    const r = await fetch(`${BASE_URL_DATAJUD}/${endpoint}/_search`, {
      method: 'POST',
      headers: { 'Authorization': `APIKey ${DATAJUD_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { match: { numeroProcesso: numeroLimpo } } }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const hits = data?.hits?.hits || [];
    return hits.length > 0 ? hits[0]._source : null;
  } catch { return null; }
}

// Notificação AGRUPADA: UM email e UM WhatsApp por processo por ciclo,
// independentemente de quantas movimentações novas houver.
// (Antes era 1 email POR movimentação — 20 históricos = 20 emails = estouro do Resend.)
async function notificarMovimentacoes(processo, andamentos) {
  if (!andamentos || andamentos.length === 0) return;

  // Ordenar da mais recente para a mais antiga; a mais recente é o destaque
  const ordenados = [...andamentos].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const recente = ordenados[0];
  const eHistorico = andamentos.length > 5; // enxurrada = atualização de histórico, não novidade

  const fmtD = d => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return String(d).slice(0,10); } };

  // ─── Email (Resend) ───
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const destinatario = process.env.ALERT_EMAIL || 'dra.andreia@advmachado.adv.br';
    const senderName = process.env.SENDER_NAME || 'Veredo';

    const assunto = andamentos.length === 1
      ? `📋 Nova movimentação — ${processo.numero_cnj}`
      : eHistorico
        ? `📚 ${andamentos.length} movimentações registradas (histórico) — ${processo.numero_cnj}`
        : `📋 ${andamentos.length} novas movimentações — ${processo.numero_cnj}`;

    const listaHtml = ordenados.slice(0, 10).map((a, i) => `
      <div style="background:white;border-left:4px solid ${i === 0 ? '#0f2035' : '#d1d5db'};padding:10px 12px;margin:8px 0;border-radius:4px">
        <span style="font-size:12px;color:#6b7280">${fmtD(a.data)}</span><br>
        <strong style="${i === 0 ? '' : 'font-weight:normal'}">${a.descricao}</strong>
      </div>`).join('');
    const maisNota = ordenados.length > 10
      ? `<p style="font-size:12px;color:#6b7280">+ ${ordenados.length - 10} movimentação(ões) mais antiga(s) registrada(s) no sistema.</p>` : '';

    await resend.emails.send({
      from: `${senderName} <docjuris@advmachado.adv.br>`,
      to: destinatario,
      subject: assunto,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0f2035;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">${eHistorico ? '📚 Atualização de Histórico' : '📋 Movimentação Processual'}</h2>
          </div>
          <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb">
            <p><strong>Processo:</strong> ${processo.numero_cnj}</p>
            <p><strong>Cliente:</strong> ${processo.client_nome || 'N/A'}</p>
            <p><strong>Tribunal:</strong> ${processo.tribunal}</p>
            ${eHistorico ? `<p style="color:#854f0b"><strong>${andamentos.length} movimentações</strong> foram registradas de uma vez (provável primeira sincronização completa deste processo). A mais recente:</p>` : ''}
            ${listaHtml}
            ${maisNota}
            <p style="font-size:12px;color:#6b7280">Acesse o Veredo para mais detalhes.</p>
          </div>
        </div>`,
    });
    console.log(`  📧 Email agrupado enviado: ${andamentos.length} movimentação(ões)`);
  } catch(e) {
    console.error('  Erro email:', e.message);
  }

  // ─── WhatsApp (Evolution) — sempre UMA mensagem ───
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE || 'docjuris';
    const whatsappNumber = process.env.ANDREIA_WHATSAPP || '5511967351199';

    if (evolutionUrl && evolutionKey) {
      const msg = andamentos.length === 1
        ? `📋 *Nova movimentação*\n\n*Processo:* ${processo.numero_cnj}\n*Cliente:* ${processo.client_nome || 'N/A'}\n*Data:* ${fmtD(recente.data)}\n\n_${recente.descricao}_`
        : `📋 *${andamentos.length} movimentações ${eHistorico ? 'registradas (histórico)' : 'novas'}*\n\n*Processo:* ${processo.numero_cnj}\n*Cliente:* ${processo.client_nome || 'N/A'}\n\n*Mais recente (${fmtD(recente.data)}):*\n_${recente.descricao}_`;

      await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: whatsappNumber, text: msg }),
      });
      console.log(`  💬 WhatsApp agrupado enviado`);
    }
  } catch(e) {
    console.error('  Erro WhatsApp:', e.message);
  }
}

// Analisa andamento com IA e cria prazo automaticamente se detectar
async function analisarECriarPrazo(db, proc, andamento) {
  if (!process.env.ANTHROPIC_API_KEY) return;
  
  // Palavras-chave que sugerem prazo — vale chamar a IA
  const temIndicacaoPrazo = /prazo|intima|citar|cita\u00e7|contesta|recurso|apela|embargo|manifest|audiên|audi\u00ea|julgamento|respond/i.test(andamento.descricao);
  if (!temIndicacaoPrazo) return;

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
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Analise esta movimentação processual e responda APENAS em JSON:

Processo: ${proc.numero_cnj}
Tribunal: ${proc.tribunal}
Data da movimentação: ${andamento.data}
Movimentação: ${andamento.descricao}

Identifique se há um prazo processual implícito. Por exemplo:
- "Expedida intimação" = prazo de 15 dias para manifestação (JEC) ou conforme tipo
- "Citação" = prazo de 15 dias para contestação (JEC) ou 30 dias (procedimento comum)
- "Audiência designada" = data da audiência é o prazo

Responda APENAS:
{
  "tem_prazo": true/false,
  "tipo_prazo": "tipo do prazo ou null",
  "dias_prazo": número de dias a partir da movimentação ou null,
  "observacao": "explicação breve"
}`
        }]
      })
    });

    if (!response.ok) return;
    const data = await response.json();
    const text = data.content[0]?.text || '';
    const analise = JSON.parse(text.replace(/\`\`\`json|\`\`\`/g, '').trim());

    if (analise.tem_prazo && analise.dias_prazo) {
      // Calcular data do prazo
      const dataBase = new Date(andamento.data);
      dataBase.setDate(dataBase.getDate() + analise.dias_prazo);
      const dataISO = dataBase.toISOString().split('T')[0];

      // Verificar se prazo já existe
      const existe = db.prepare('SELECT id FROM prazos WHERE processo_id = ? AND data_limite = ?').get(proc.id, dataISO);
      if (!existe) {
        db.prepare(`INSERT INTO prazos (processo_id, client_id, titulo, tipo, data_limite, observacoes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, 1)`).run(
          proc.id,
          proc.client_id,
          analise.tipo_prazo || 'Prazo processual',
          analise.tipo_prazo || 'Prazo',
          dataISO,
          `Auto-detectado: ${analise.observacao}. Movimentação: ${andamento.descricao}`
        );
        console.log(`  📅 Prazo criado automaticamente: ${analise.tipo_prazo} — ${dataISO}`);
      }
    }
  } catch(e) {
    // Silencioso — não quebrar o fluxo principal
  }
}

export async function monitorarProcessos() {
  const db = getDB();
  
  // Garantir coluna ultima_consulta
  try { db.exec('ALTER TABLE processos ADD COLUMN ultima_consulta TEXT'); } catch {}

  const ativos = db.prepare("SELECT p.*, c.nome as client_nome FROM processos p LEFT JOIN clients c ON c.id = p.client_id WHERE p.status = 'ativo'").all();
  
  console.log(`🔍 Monitorando ${ativos.length} processos ativos...`);
  let novosAndamentos = 0;

  for (const proc of ativos) {
    try {
      // Usar Escavador se disponível, senão DataJud
      let movimentos = [];
      
      if (ESCAVADOR_TOKEN) {
        const dados = await consultarEscavador(proc.numero_cnj);
        movimentos = (dados?.movimentos || dados?.fontes?.[0]?.movimentos || [])
          .map(m => ({ data: m.data || m.dataHora, descricao: m.descricao || m.nome || 'Movimentação' }));
      } else {
        const dados = await consultarDataJud(proc.numero_cnj, proc.tribunal);
        movimentos = (dados?.movimentos || [])
          .map(m => ({ data: m.dataHora, descricao: m.nome || 'Movimentação' }))
          .sort((a, b) => new Date(b.data) - new Date(a.data))
          .slice(0, 20);
      }

      // Registrar a verificação SEMPRE — mesmo sem movimentos novos.
      // (Antes só gravava quando havia novidade, e a coluna nem existia:
      //  a tela nunca tinha como mostrar quando foi a última sincronização.)
      db.prepare("UPDATE processos SET ultima_consulta = datetime('now') WHERE id = ?").run(proc.id);

      if (movimentos.length === 0) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      // Verificar andamentos novos — dedupe NORMALIZADO:
      // data reduzida a YYYY-MM-DD e descrição sem variações de espaços/caixa.
      // (O dedupe exato anterior tratava histórico como novidade quando o DataJud
      //  mudava o formato — causa da enxurrada de emails.)
      const normalizar = (data, desc) =>
        `${String(data).slice(0, 10)}|${String(desc || '').trim().replace(/\s+/g, ' ').toLowerCase()}`;

      const salvos = db.prepare('SELECT data, descricao FROM andamentos WHERE processo_id = ?').all(proc.id);
      const salvoSet = new Set(salvos.map(a => normalizar(a.data, a.descricao)));

      const insert = db.prepare('INSERT OR IGNORE INTO andamentos (processo_id, data, descricao) VALUES (?, ?, ?)');

      const novosDoProcesso = [];
      for (const m of movimentos) {
        const key = normalizar(m.data, m.descricao);
        if (!salvoSet.has(key)) {
          insert.run(proc.id, m.data, m.descricao);
          salvoSet.add(key); // evita duplicar dentro do mesmo lote
          novosAndamentos++;
          novosDoProcesso.push(m);
          console.log(`  ✨ NOVO: ${proc.numero_cnj} — ${m.descricao}`);
        }
      }

      // UMA notificação por processo, com todas as novidades do ciclo
      if (novosDoProcesso.length > 0) {
        await notificarMovimentacoes(proc, novosDoProcesso);

        // IA analisa as movimentações em busca de prazos e audiências.
        // (Esta chamada estava desconectada — a função existia mas nunca rodava.)
        // Em atualização de histórico, analisa só as 3 mais recentes: prazo de
        // movimentação de 2 anos atrás já venceu; gastar IA nisso é desperdício.
        const paraAnalisar = [...novosDoProcesso]
          .sort((a, b) => String(b.data).localeCompare(String(a.data)))
          .slice(0, 3);
        for (const m of paraAnalisar) {
          try { await analisarECriarPrazo(db, proc, m); }
          catch(e) { console.error('  Erro análise de prazo:', e.message); }
        }
      }

      // 700ms entre consultas = ~85/min, abaixo do limite de 120/min do DataJud
      await new Promise(r => setTimeout(r, 700));
    } catch(e) {
      console.error(`  Erro em ${proc.numero_cnj}:`, e.message);
    }
  }

  console.log(`✅ Monitoramento concluído — ${novosAndamentos} novo(s) andamento(s)`);
}



