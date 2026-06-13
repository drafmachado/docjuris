import { getDB, initDB } from './db.js';
initDB();
const db = getDB();

const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

const ENDPOINTS = {
  'TJRJ': 'api_publica_tjrj',
  'TJSP': 'api_publica_tjsp',
  'TRF1': 'api_publica_trf1',
  'TRF2': 'api_publica_trf2',
  'TRF3': 'api_publica_trf3',
  'TRT2': 'api_publica_trt2',
  'TRT1': 'api_publica_trt1',
};

async function consultar(numero, tribunal) {
  const endpoint = ENDPOINTS[tribunal];
  if (!endpoint) return null;
  const numeroLimpo = numero.replace(/[.\-]/g, '');
  try {
    const r = await fetch(`${BASE_URL}/${endpoint}/_search`, {
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

// Buscar apenas processos ativos
const ativos = db.prepare("SELECT * FROM processos WHERE status = 'ativo'").all();
console.log(`🔍 Consultando ${ativos.length} processos ativos no DataJud...\n`);

// Garantir tabela de andamentos
db.exec(`CREATE TABLE IF NOT EXISTS andamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

let comDados = 0;
let semDados = 0;

for (const proc of ativos) {
  process.stdout.write(`  ${proc.numero_cnj} (${proc.tribunal})... `);
  const dados = await consultar(proc.numero_cnj, proc.tribunal);

  if (!dados) {
    semDados++;
    console.log('❌ não encontrado');
    await new Promise(r => setTimeout(r, 300));
    continue;
  }

  const movimentos = (dados.movimentos || [])
    .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora))
    .slice(0, 20);

  if (movimentos.length > 0) {
    // Limpar andamentos antigos deste processo
    db.prepare('DELETE FROM andamentos WHERE processo_id = ?').run(proc.id);
    
    // Inserir novos
    const insert = db.prepare(`INSERT INTO andamentos (processo_id, data, descricao, tipo) VALUES (?, ?, ?, ?)`);
    for (const m of movimentos) {
      insert.run(proc.id, m.dataHora, m.nome || m.complementosTabelados?.[0]?.nome || 'Movimentação', m.codigo || null);
    }

    // Atualizar data última movimentação
    const ultimaData = movimentos[0]?.dataHora;
    if (ultimaData) {
      db.prepare("UPDATE processos SET updated_at = ? WHERE id = ?").run(ultimaData, proc.id);
    }

    comDados++;
    console.log(`✅ ${movimentos.length} andamentos`);
  } else {
    semDados++;
    console.log('⚠️  sem movimentos');
  }

  await new Promise(r => setTimeout(r, 400));
}

console.log(`\n📊 ${comDados} processos com andamentos salvos`);
console.log(`❌ ${semDados} não encontrados ou sem dados`);
