// Análise retroativa de andamentos — cria prazos futuros, descarta expirados
import { getDB } from './db.js';

const db = getDB();
const hoje = new Date().toISOString().split('T')[0];

// Buscar andamentos dos últimos 30 dias com palavras-chave de prazo
const andamentos = db.prepare(`
  SELECT a.id, a.processo_id, a.data, a.descricao,
         p.numero_cnj, p.tribunal, p.client_id,
         c.nome as client_nome
  FROM andamentos a
  JOIN processos p ON p.id = a.processo_id
  JOIN clients c ON c.id = p.client_id
  WHERE a.created_at > datetime('now', '-30 days')
    AND (
      a.descricao LIKE '%intima%' OR a.descricao LIKE '%prazo%' OR
      a.descricao LIKE '%cita%' OR a.descricao LIKE '%contesta%' OR
      a.descricao LIKE '%recurso%' OR a.descricao LIKE '%apela%' OR
      a.descricao LIKE '%embargo%' OR a.descricao LIKE '%manifest%' OR
      a.descricao LIKE '%audiên%' OR a.descricao LIKE '%audi%' OR
      a.descricao LIKE '%julgamento%' OR a.descricao LIKE '%respond%'
    )
  ORDER BY a.data DESC
`).all();

console.log(`\n🔍 ${andamentos.length} andamento(s) com palavras-chave encontrados\n`);

if (!andamentos.length) process.exit(0);
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('❌ ANTHROPIC_API_KEY não configurada');
  process.exit(1);
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
          content: `Analise esta movimentação processual brasileira e responda APENAS em JSON válido, sem markdown:

Processo: ${a.numero_cnj}
Tribunal: ${a.tribunal}
Data da movimentação: ${a.data}
Movimentação: ${a.descricao}

Identifique se há prazo processual implícito conhecido. Exemplos:
- Intimação/citação em JEC = 15 dias para contestar
- Intimação em procedimento comum = 15 dias para manifestar ou 30 dias para contestar
- Designação de audiência = a data da audiência é o prazo
- Prazo para recurso de decisão = 15 dias (apelação JEC) ou 15 dias (apelação comum)

{"tem_prazo":true,"tipo_prazo":"descrição do prazo","dias_prazo":15,"observacao":"motivo"}`
        }]
      })
    });

    if (!resp.ok) { semPrazo++; continue; }
    const data = await resp.json();
    const texto = data.content[0]?.text || '';
    let analise;
    try { analise = JSON.parse(texto.replace(/```json|```/g,'').trim()); }
    catch { semPrazo++; continue; }

    if (!analise.tem_prazo || !analise.dias_prazo) { semPrazo++; continue; }

    // Calcular data do prazo
    const dataBase = new Date(a.data);
    dataBase.setDate(dataBase.getDate() + analise.dias_prazo);
    const dataISO = dataBase.toISOString().split('T')[0];

    // Descartar se já expirou
    if (dataISO < hoje) {
      descartados++;
      console.log(`⏭️  Descartado (expirado ${dataISO}): ${a.client_nome} — ${a.descricao.substring(0,60)}`);
      continue;
    }

    // Verificar se já existe prazo similar
    const existe = db.prepare(
      'SELECT id FROM prazos WHERE processo_id = ? AND data_limite = ?'
    ).get(a.processo_id, dataISO);

    if (existe) { jaExiste++; continue; }

    // Criar prazo
    db.prepare(`
      INSERT INTO prazos (processo_id, client_id, titulo, tipo, data_limite, observacoes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      a.processo_id,
      a.client_id,
      analise.tipo_prazo || 'Prazo processual',
      analise.tipo_prazo || 'Prazo',
      dataISO,
      `Auto-retroativo: ${analise.observacao}. Mov: ${a.descricao.substring(0,100)}`
    );

    criados++;
    console.log(`✅ CRIADO: ${a.client_nome} | ${a.numero_cnj}`);
    console.log(`   Prazo: ${analise.tipo_prazo} — ${dataISO} (${analise.dias_prazo} dias)`);
    console.log(`   Origem: ${a.descricao.substring(0,70)}`);
    console.log('');

    // Rate limit
    await new Promise(r => setTimeout(r, 300));

  } catch(e) {
    console.error(`Erro: ${e.message}`);
    semPrazo++;
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`✅ Criados   : ${criados}`);
console.log(`⏭️  Expirados : ${descartados} (descartados)`);
console.log(`🔁 Já existia: ${jaExiste}`);
console.log(`➖ Sem prazo : ${semPrazo} (IA não identificou prazo)`);
