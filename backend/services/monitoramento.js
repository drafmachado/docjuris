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

async function notificarNovoAndamento(processo, andamento) {
  // Email via Resend
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const destinatario = process.env.ALERT_EMAIL || 'dra.andreia@advmachado.adv.br';
    const senderName = process.env.SENDER_NAME || 'Veredo';
    const data = new Date(andamento.data).toLocaleDateString('pt-BR');

    await resend.emails.send({
      from: `${senderName} <docjuris@advmachado.adv.br>`,
      to: destinatario,
      subject: `📋 Nova movimentação — ${processo.numero_cnj}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0f2035;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">📋 Nova Movimentação Processual</h2>
          </div>
          <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb">
            <p><strong>Processo:</strong> ${processo.numero_cnj}</p>
            <p><strong>Cliente:</strong> ${processo.client_nome || 'N/A'}</p>
            <p><strong>Tribunal:</strong> ${processo.tribunal}</p>
            <p><strong>Data:</strong> ${data}</p>
            <div style="background:white;border-left:4px solid #0f2035;padding:12px;margin:12px 0;border-radius:4px">
              <strong>${andamento.descricao}</strong>
            </div>
            <p style="font-size:12px;color:#6b7280">Acesse o Veredo para mais detalhes.</p>
          </div>
        </div>`,
    });
    console.log(`  📧 Email enviado: ${andamento.descricao}`);
  } catch(e) {
    console.error('  Erro email:', e.message);
  }

  // WhatsApp via Evolution API
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE || 'docjuris';
    const whatsappNumber = process.env.ANDREIA_WHATSAPP || '5511967351199';
    
    if (evolutionUrl && evolutionKey) {
      const data = new Date(andamento.data).toLocaleDateString('pt-BR');
      const msg = `📋 *Nova movimentação*\n\n*Processo:* ${processo.numero_cnj}\n*Cliente:* ${processo.client_nome || 'N/A'}\n*Data:* ${data}\n\n_${andamento.descricao}_`;
      
      await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: whatsappNumber, text: msg }),
      });
      console.log(`  💬 WhatsApp enviado`);
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

      if (movimentos.length === 0) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      // Verificar andamentos novos (não salvos ainda)
      const salvos = db.prepare('SELECT data, descricao FROM andamentos WHERE processo_id = ?').all(proc.id);
      const salvoSet = new Set(salvos.map(a => `${a.data}|${a.descricao}`));

      const insert = db.prepare('INSERT OR IGNORE INTO andamentos (processo_id, data, descricao) VALUES (?, ?, ?)');
      
      for (const m of movimentos) {
        const key = `${m.data}|${m.descricao}`;
        if (!salvoSet.has(key)) {
          insert.run(proc.id, m.data, m.descricao);
          novosAndamentos++;
          console.log(`  ✨ NOVO: ${proc.numero_cnj} — ${m.descricao}`);
          await notificarNovoAndamento(proc, m);
        }
      }

      // Atualizar timestamp da última consulta
      db.prepare("UPDATE processos SET ultima_consulta = datetime('now') WHERE id = ?").run(proc.id);
      
      // 700ms entre consultas = ~85/min, abaixo do limite de 120/min do DataJud
      await new Promise(r => setTimeout(r, 700));
    } catch(e) {
      console.error(`  Erro em ${proc.numero_cnj}:`, e.message);
    }
  }

  console.log(`✅ Monitoramento concluído — ${novosAndamentos} novo(s) andamento(s)`);
}

