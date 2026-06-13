import { getDB, initDB } from './db.js';

initDB();
const db = getDB();

const USER_ID = 1;
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

const PROCESSOS_TJRJ = [
  { numero: "0809386-75.2026.8.19.0205", endpoint: "api_publica_tjrj" },
  { numero: "0812706-63.2026.8.19.0002", endpoint: "api_publica_tjrj" },
  { numero: "0805484-82.2026.8.19.0054", endpoint: "api_publica_tjrj" },
  { numero: "0819412-65.2026.8.19.0001", endpoint: "api_publica_tjrj" },
  { numero: "0837263-30.2025.8.19.0203", endpoint: "api_publica_tjrj" },
  { numero: "0807129-64.2025.8.19.0253", endpoint: "api_publica_tjrj" },
  { numero: "0804665-67.2025.8.19.0253", endpoint: "api_publica_tjrj" },
  { numero: "0881095-40.2025.8.19.0001", endpoint: "api_publica_tjrj" },
  { numero: "0840307-85.2024.8.19.0205", endpoint: "api_publica_tjrj" },
  { numero: "0810788-82.2026.8.19.0209", endpoint: "api_publica_tjrj" },
  { numero: "0806815-21.2025.8.19.0253", endpoint: "api_publica_tjrj" },
  { numero: "0805697-10.2025.8.19.0253", endpoint: "api_publica_tjrj" },
  { numero: "0813200-83.2026.8.19.0209", endpoint: "api_publica_tjrj" },
  { numero: "0803757-11.2026.8.19.0209", endpoint: "api_publica_tjrj" },
  { numero: "0850505-20.2025.8.19.0021", endpoint: "api_publica_tjrj" },
  { numero: "0805192-19.2025.8.19.0253", endpoint: "api_publica_tjrj" },
  { numero: "0876115-50.2025.8.19.0001", endpoint: "api_publica_tjrj" },
  { numero: "0837127-33.2025.8.19.0203", endpoint: "api_publica_tjrj" },
  { numero: "0802788-48.2025.8.19.0203", endpoint: "api_publica_tjrj" },
  { numero: "0811741-46.2026.8.19.0209", endpoint: "api_publica_tjrj" },
];

async function consultarDataJud(numero, endpoint) {
  const numeroLimpo = numero.replace(/[.\-]/g, '');
  try {
    const r = await fetch(`${BASE_URL}/${endpoint}/_search`, {
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
    if (hits.length === 0) return null;
    return hits[0]._source;
  } catch(e) {
    return null;
  }
}

function extrairCliente(processo) {
  const partes = processo.partes || [];
  // Pega o polo ativo (autor/requerente/exequente)
  const autor = partes.find(p =>
    ['AUTOR', 'REQUERENTE', 'EXEQUENTE', 'IMPETRANTE', 'RECLAMANTE', 'APELANTE'].includes(p.polo?.toUpperCase())
  );
  if (autor) return { nome: autor.nome, polo: 'ativo' };
  // Se não achar, pega a primeira parte
  if (partes.length > 0) return { nome: partes[0].nome, polo: partes[0].polo };
  return null;
}

let criados = 0;
let naoEncontrados = 0;
let jaExistiam = 0;

for (const p of PROCESSOS_TJRJ) {
  // Verificar se processo já existe
  const processoExiste = db.prepare('SELECT id FROM processos WHERE numero_cnj = ?').get(p.numero);
  if (processoExiste) {
    jaExistiam++;
    console.log(`⚠️  Processo já existe: ${p.numero}`);
    continue;
  }

  process.stdout.write(`🔍 Consultando ${p.numero}... `);
  const dados = await consultarDataJud(p.numero, p.endpoint);

  if (!dados) {
    naoEncontrados++;
    console.log(`❌ Não encontrado no DataJud`);
    // Cadastra mesmo sem nome
    db.prepare(`INSERT INTO processos (client_id, numero_cnj, tribunal, tipo, created_by)
      SELECT id, ?, 'TJRJ', 'Cível', ? FROM clients WHERE nome = 'SEM CLIENTE IDENTIFICADO' LIMIT 1`).run(p.numero, USER_ID);
    continue;
  }

  const partes = dados.partes || [];
  const autor = partes.find(pt => ['AUTOR','REQUERENTE','EXEQUENTE','IMPETRANTE','RECLAMANTE'].includes(pt.polo?.toUpperCase())) || partes[0];
  const reu = partes.find(pt => ['REU','REQUERIDO','EXECUTADO','IMPETRADO','RECLAMADO','APELADO'].includes(pt.polo?.toUpperCase())) || partes[1];

  const nomeCliente = autor?.nome || 'SEM CLIENTE IDENTIFICADO';
  const nomeReu = reu?.nome || '';
  const tipo = dados.classe?.nome || 'Cível';
  const vara = dados.orgaoJulgador?.nome || '';
  const comarca = dados.orgaoJulgador?.comarca || '';

  // Criar ou buscar cliente
  let clientId;
  const clienteExiste = db.prepare('SELECT id FROM clients WHERE nome = ?').get(nomeCliente);
  if (clienteExiste) {
    clientId = clienteExiste.id;
  } else {
    const r = db.prepare('INSERT INTO clients (nome, created_by) VALUES (?, ?)').run(nomeCliente, USER_ID);
    clientId = r.lastInsertRowid;
  }

  // Criar processo
  db.prepare(`INSERT INTO processos (client_id, numero_cnj, tribunal, tipo, vara, comarca, polo_ativo, polo_passivo, created_by)
    VALUES (?, ?, 'TJRJ', ?, ?, ?, ?, ?, ?)`).run(
    clientId, p.numero, tipo, vara, comarca, nomeCliente, nomeReu, USER_ID
  );

  criados++;
  console.log(`✅ ${nomeCliente} → ${p.numero}`);

  // Aguardar 500ms entre requisições para não sobrecarregar a API
  await new Promise(r => setTimeout(r, 500));
}

console.log(`\n📊 Resultado: ${criados} processos criados, ${jaExistiam} já existiam, ${naoEncontrados} não encontrados no DataJud`);
