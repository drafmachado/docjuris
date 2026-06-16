// Reprocessamento de prazos — últimos 12 meses
// Marca vencidos como concluídos e cria novos prazos futuros via IA
import { getDB } from './db.js';

const db = getDB();
const hoje = new Date().toISOString().split('T')[0];

// 1. Marcar como concluídos todos os prazos vencidos
const vencidos = db.prepare(`
  UPDATE prazos SET concluido = 1
  WHERE concluido = 0 AND data_limite < ?
`).run(hoje);
console.log(`\n🗑️  Prazos vencidos arquivados: ${vencidos.changes}`);

// 2. Buscar andamentos dos últimos 12 meses com palavras-chave de prazo
const andamentos = db.prepare(`
  SELECT a.id, a.processo_id, a.data, a.descricao,
         p.numero_cnj, p.tribunal, p.client_id, c.nome as client_nome
  FROM andamentos a
  JOIN processos p ON p.id = a.processo_id
  JOIN clients c ON c.id = p.client_id
  WHERE a.created_at > datetime('now', '-12 months')
    AND (
      a.descricao LIKE '%intima%' OR a.descricao LIKE '%prazo%' OR
      a.descricao LIKE '%cita%' OR a.descricao LIKE '%contesta%' OR
      a.descricao LIKE '%recurso%' OR a.descricao LIKE '%apela%' OR
      a.descricao LIKE '%embargo%' OR a.descricao LIKE '%manifest%' OR
      a.descricao LIKE '%audiên%' OR a.descricao LIKE '%audi%' OR
      a.descricao LIKE '%julgamento%' OR a.descricao LIKE '%respond%' OR
      a.descricao LIKE '%despacho%' OR a.descricao LIKE '%decisão%' OR
      a.descricao LIKE '%sentença%'
    )
  ORDER BY a.data DESC
`).all();

console.log(`\n🔍 ${andamentos.length} andamento(s) com palavras-chave encontrados\n`);
if (!andamentos.length || !process.env.ANTHROPIC_API_KEY) {
  console.log('Nada a processar ou ANTHROPIC_API_KEY ausente.');
  process.exit(0);
}

let criados = 0, descartados = 0, jaExiste = 0, semPrazo = 0;

for (const a of andamentos) {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Analise esta movimentação processual e responda APENAS em JSON válido:
Processo: ${a.numero_cnj}
Tribunal: ${a.tribunal}
Data: ${a.data}
Movimentação: ${a.descricao}

{"tem_prazo":true/false,"tipo_prazo":"descrição ou null","dias_prazo":número ou null,"observacao":"breve"}`
        }]
      })
    });

    if (!resp.ok) { semPrazo++; continue; }
    const data = await resp.json();
    let analise;
    try { analise = JSON.parse(data.content[0]?.text?.replace(/```json|```/g,'').trim()); }
    catch { semPrazo++; continue; }

    if (!analise.tem_prazo || !analise.dias_prazo) { semPrazo++; continue; }

    const dataBase = new Date(a.data);
    dataBase.setDate(dataBase.getDate() + analise.dias_prazo);
    const dataISO = dataBase.toISOString().split('T')[0];

    // Descartar se vencido
    if (dataISO < hoje) {
      descartados++;
      continue;
    }

    // Verificar se já existe prazo para este processo nesta data
    const existe = db.prepare(
      'SELECT id FROM prazos WHERE processo_id = ? AND data_limite = ? AND concluido = 0'
    ).get(a.processo_id, dataISO);
    if (existe) { jaExiste++; continue; }

    db.prepare(`
      INSERT INTO prazos (processo_id, client_id, titulo, tipo, data_limite, observacoes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      a.processo_id, a.client_id,
      analise.tipo_prazo || 'Prazo processual',
      analise.tipo_prazo || 'Prazo',
      dataISO,
      `Auto (12m): ${analise.observacao}. Mov: ${a.descricao.substring(0,80)}`
    );
    criados++;
    console.log(`✅ ${a.client_nome} | ${a.numero_cnj} | ${analise.tipo_prazo} — ${dataISO}`);

    await new Promise(r => setTimeout(r, 400));
  } catch(e) { semPrazo++; }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`✅ Prazos criados    : ${criados}`);
console.log(`⏭️  Vencidos descartados: ${descartados}`);
console.log(`🔁 Já existia       : ${jaExiste}`);
console.log(`➖ Sem prazo ident. : ${semPrazo}`);
