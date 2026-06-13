import { getDB } from '../db.js';

const DJERJ_BASE = 'https://www3.tjrj.jus.br/consultadje';

// Busca publicações no DJEN (CNJ) e DJERJ por OAB/nome
async function buscarDJERJ(data) {
  const dataISO = data.toISOString().split('T')[0]; // YYYY-MM-DD
  const resultados = [];

  // 1. Buscar no DJEN (CNJ) - onde vão as intimações judiciais do TJRJ desde nov/2024
  try {
    const r = await fetch(
      `https://djen.cnj.jus.br/pesquisar-publicacao?` +
      `data=${dataISO}&` +
      `tipoPesquisa=OAB&` +
      `oabNumero=218586&` +
      `oabEstado=RJ`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'DocJuris/1.0' } }
    );
    if (r.ok) {
      const d = await r.json();
      const pubs = d.publicacoes || d.data || d.results || [];
      pubs.forEach(p => resultados.push({ ...p, fonte: 'DJEN' }));
      console.log(`  DJEN: ${pubs.length} publicação(ões)`);
    }
  } catch(e) {
    console.log('  DJEN indisponível:', e.message);
  }

  // 2. Buscar também no DJERJ (matérias administrativas)
  try {
    const dataFormatada = dataISO.split('-').reverse().join('/');
    const r = await fetch(
      `https://www3.tjrj.jus.br/consultadje/consultarDiarioJustica.do?` +
      `metodo=pesquisar&` +
      `oab=218586&` +
      `uf=RJ&` +
      `dtInicio=${dataFormatada}&` +
      `dtFim=${dataFormatada}`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'DocJuris/1.0' } }
    );
    if (r.ok) {
      const d = await r.json();
      const pubs = d.publicacoes || d.results || [];
      pubs.forEach(p => resultados.push({ ...p, fonte: 'DJERJ' }));
      console.log(`  DJERJ: ${pubs.length} publicação(ões)`);
    }
  } catch(e) {
    console.log('  DJERJ indisponível:', e.message);
  }

  return resultados;
}

// Usa Claude API para extrair prazo da publicação
async function extrairPrazo(textoPublicacao, numeroProcesso) {
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
          content: `Analise esta publicação do Diário da Justiça e extraia:
1. Se há algum prazo processual mencionado (para manifestação, contestação, recurso, etc.)
2. A data do prazo (se mencionada)
3. O tipo do prazo (ex: Contestação, Recurso, Manifestação, Audiência)
4. Um resumo em linguagem simples do que a publicação diz

Processo: ${numeroProcesso}

Publicação:
${textoPublicacao}

Responda APENAS em JSON no formato:
{
  "tem_prazo": true/false,
  "tipo_prazo": "nome do prazo ou null",
  "data_prazo": "DD/MM/YYYY ou null",
  "dias_prazo": número de dias ou null,
  "resumo_simples": "explicação em linguagem simples para o cliente",
  "urgente": true/false
}`
        }]
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content[0]?.text || '';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch(e) {
    console.error('Erro Claude:', e.message);
    return null;
  }
}

async function notificarPrazoDetectado(processo, publicacao, analise) {
  const db = getDB();
  
  // Criar prazo automaticamente se tiver data
  if (analise.tem_prazo && analise.data_prazo) {
    const [dia, mes, ano] = analise.data_prazo.split('/');
    const dataISO = `${ano}-${mes}-${dia}`;
    
    // Verificar se prazo já existe
    const existe = db.prepare(`
      SELECT id FROM prazos 
      WHERE processo_id = ? AND titulo LIKE ? AND data_limite = ?
    `).get(processo.id, `%${analise.tipo_prazo}%`, dataISO);
    
    if (!existe) {
      db.prepare(`
        INSERT INTO prazos (processo_id, client_id, titulo, tipo, data_limite, observacoes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(
        processo.id,
        processo.client_id,
        analise.tipo_prazo || 'Prazo DJE',
        analise.tipo_prazo || 'Prazo',
        dataISO,
        `Detectado automaticamente do DJERJ. ${analise.resumo_simples}`
      );
      console.log(`  📅 Prazo criado: ${analise.tipo_prazo} — ${analise.data_prazo}`);
    }
  }

  // Notificar por WhatsApp
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE || 'docjuris';

    if (evolutionUrl && evolutionKey) {
      const urgencia = analise.urgente ? '🔴 URGENTE' : '📋';
      const msg = `${urgencia} *Publicação no DJE detectada*\n\n` +
        `*Processo:* ${processo.numero_cnj}\n` +
        `*Cliente:* ${processo.client_nome || 'N/A'}\n\n` +
        `*Resumo:* ${analise.resumo_simples}\n\n` +
        (analise.tem_prazo ? `*⏰ Prazo detectado:* ${analise.tipo_prazo} — ${analise.data_prazo}\n\n` : '') +
        `_Prazo criado automaticamente no DocJuris._`;

      await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: '5511967351199', text: msg }),
      });
      console.log(`  💬 WhatsApp enviado`);
    }
  } catch(e) {
    console.error('  Erro WhatsApp:', e.message);
  }

  // Email
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: `DocJuris <docjuris@advmachado.adv.br>`,
      to: 'dra.andreia@advmachado.adv.br',
      subject: `${analise.urgente ? '🔴 URGENTE' : '📋'} Publicação DJE — ${processo.numero_cnj}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:${analise.urgente ? '#dc2626' : '#0f2035'};padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">${analise.urgente ? '🔴 URGENTE — ' : ''}Publicação no DJE</h2>
          </div>
          <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb">
            <p><strong>Processo:</strong> ${processo.numero_cnj}</p>
            <p><strong>Cliente:</strong> ${processo.client_nome || 'N/A'}</p>
            <div style="background:white;border-left:4px solid ${analise.urgente ? '#dc2626' : '#0f2035'};padding:12px;margin:12px 0;border-radius:4px">
              <p style="margin:0"><strong>Resumo:</strong> ${analise.resumo_simples}</p>
            </div>
            ${analise.tem_prazo ? `
            <div style="background:#fef3c7;border:1px solid #fbbf24;padding:12px;border-radius:6px;margin-top:12px">
              <strong>⏰ Prazo detectado:</strong> ${analise.tipo_prazo} — <strong>${analise.data_prazo}</strong>
              <br><small>Prazo criado automaticamente no DocJuris.</small>
            </div>` : ''}
            <details style="margin-top:16px">
              <summary style="cursor:pointer;color:#6b7280;font-size:13px">Ver texto completo da publicação</summary>
              <pre style="font-size:11px;color:#374151;white-space:pre-wrap;margin-top:8px">${publicacao.texto?.substring(0, 2000) || ''}</pre>
            </details>
          </div>
        </div>`,
    });
    console.log(`  📧 Email enviado`);
  } catch(e) {
    console.error('  Erro email:', e.message);
  }
}

export async function monitorarDJE() {
  const db = getDB();
  const hoje = new Date();
  
  console.log(`📰 Monitorando DJERJ de ${hoje.toLocaleDateString('pt-BR')}...`);

  // Buscar publicações do dia
  const publicacoes = await buscarDJERJ(hoje);
  
  if (publicacoes.length === 0) {
    console.log('  Nenhuma publicação encontrada no DJERJ hoje.');
    return;
  }

  console.log(`  ${publicacoes.length} publicação(ões) encontrada(s) no total`);

  // Buscar processos ativos para cruzar
  const processos = db.prepare(`
    SELECT p.*, c.nome as client_nome, c.id as client_id 
    FROM processos p 
    LEFT JOIN clients c ON c.id = p.client_id 
    WHERE p.status = 'ativo' AND p.tribunal = 'TJRJ'
  `).all();

  const numerosProcessos = new Set(processos.map(p => p.numero_cnj.replace(/[.\-]/g, '')));

  for (const pub of publicacoes) {
    const texto = pub.texto || pub.content || pub.body || '';
    
    // Verificar se menciona algum processo nosso
    let processoEncontrado = null;
    for (const proc of processos) {
      const numLimpo = proc.numero_cnj.replace(/[.\-]/g, '');
      if (texto.includes(numLimpo) || texto.includes(proc.numero_cnj)) {
        processoEncontrado = proc;
        break;
      }
    }

    if (!processoEncontrado) continue;

    console.log(`  ✨ Publicação encontrada para: ${processoEncontrado.numero_cnj}`);

    // Usar IA para analisar
    const analise = await extrairPrazo(texto, processoEncontrado.numero_cnj);
    if (!analise) continue;

    console.log(`  📊 Análise: tem_prazo=${analise.tem_prazo}, tipo=${analise.tipo_prazo}, data=${analise.data_prazo}`);

    // Notificar e criar prazo
    await notificarPrazoDetectado(processoEncontrado, pub, analise);
    
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('✅ Monitoramento DJE concluído');
}
