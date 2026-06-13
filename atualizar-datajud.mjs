import { getDB, initDB } from './db.js';

initDB();
const db = getDB();

const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

async function consultarDataJud(numero) {
  const numeroLimpo = numero.replace(/[.\-]/g, '');
  try {
    const r = await fetch(`${BASE_URL}/api_publica_tjrj/_search`, {
      method: 'POST',
      headers: {
        'Authorization': `APIKey ${DATAJUD_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: { match: { numeroProcesso: numeroLimpo } } }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const hits = data?.hits?.hits || [];
    return hits.length > 0 ? hits[0]._source : null;
  } catch(e) { return null; }
}

// Buscar processos vinculados a "A IDENTIFICAR"
const clienteGenerico = db.prepare("SELECT id FROM clients WHERE nome = 'A IDENTIFICAR'").get();
if (!clienteGenerico) { console.log('Nenhum processo a identificar'); process.exit(0); }

const processos = db.prepare('SELECT * FROM processos WHERE client_id = ?').all(clienteGenerico.id);
console.log(`🔍 Consultando ${processos.length} processos no DataJud...\n`);

let atualizados = 0;
let semDados = 0;
let clientesCriados = 0;

for (const proc of processos) {
  process.stdout.write(`  ${proc.numero_cnj}... `);
  const dados = await consultarDataJud(proc.numero_cnj);
  
  if (!dados) {
    semDados++;
    console.log('❌ não encontrado');
    await new Promise(r => setTimeout(r, 300));
    continue;
  }

  const partes = dados.partes || [];
  const autor = partes.find(p => ['AUTOR','REQUERENTE','EXEQUENTE','IMPETRANTE','RECLAMANTE','PARTE AUTORA'].includes(p.polo?.toUpperCase()));
  const reu = partes.find(p => ['REU','REQUERIDO','EXECUTADO','IMPETRADO','RECLAMADO','PARTE RÉ'].includes(p.polo?.toUpperCase()));

  const nomeCliente = autor?.nome || null;
  const nomeReu = reu?.nome || null;
  const vara = dados.orgaoJulgador?.nome || proc.vara;
  const comarca = dados.orgaoJulgador?.comarca || proc.comarca;
  const tipo = dados.classe?.nome || proc.tipo;

  if (nomeCliente && nomeCliente !== 'SEM CLIENTE IDENTIFICADO') {
    // Criar ou buscar cliente real
    let cliente = db.prepare('SELECT id FROM clients WHERE nome = ?').get(nomeCliente);
    if (!cliente) {
      const r = db.prepare('INSERT INTO clients (nome, created_by) VALUES (?, ?)').run(nomeCliente, 1);
      cliente = { id: r.lastInsertRowid };
      clientesCriados++;
    }
    // Atualizar processo com cliente real
    db.prepare(`UPDATE processos SET client_id=?, polo_ativo=?, polo_passivo=?, vara=?, comarca=?, tipo=?, updated_at=datetime('now') WHERE id=?`)
      .run(cliente.id, nomeCliente, nomeReu || proc.polo_passivo, vara, comarca, tipo, proc.id);
    console.log(`✅ ${nomeCliente}`);
    atualizados++;
  } else {
    // Atualizar só vara/comarca/tipo mesmo sem nome do cliente
    db.prepare(`UPDATE processos SET vara=?, comarca=?, tipo=?, updated_at=datetime('now') WHERE id=?`)
      .run(vara, comarca, tipo, proc.id);
    console.log(`⚠️  sem partes — dados atualizados`);
    semDados++;
  }

  await new Promise(r => setTimeout(r, 400));
}

console.log(`\n📊 Resultado:`);
console.log(`  ✅ ${atualizados} processos com cliente identificado`);
console.log(`  👤 ${clientesCriados} novos clientes criados`);
console.log(`  ❓ ${semDados} sem dados de partes`);
