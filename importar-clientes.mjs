import { getDB, initDB } from './db.js';

initDB();
const db = getDB();

const USER_ID = 1;

const clientes = [
  { nome: "Carla Maria Mello Rodrigues", processo: "1001047-54.2026.8.26.0010", tribunal: "TJSP", tipo: "Família", polo_ativo: "Carla Maria Mello Rodrigues", polo_passivo: "Davi Mello Rodrigues" },
  { nome: "Florisbela Campos Ferreira", processo: "1000165-48.2026.8.26.0542", tribunal: "TJSP", tipo: "Cível", polo_ativo: "Florisbela Campos Ferreira", polo_passivo: "Sbc Saúde Ltda" },
  { nome: "Guilherme Cordeiro da Silva", processo: "0021793-58.2022.8.19.0021", tribunal: "TJRJ", tipo: "Família", polo_ativo: "Guilherme Cordeiro da Silva", polo_passivo: "Thiago Luzardo Inácio" },
  { nome: "Davi Feijo Fernandes Pereira", processo: "3034930-77.2026.8.19.0001", tribunal: "TJRJ", tipo: "Cível", polo_ativo: "Davi Feijo Fernandes Pereira", polo_passivo: "" },
  { nome: "Andre Pitzer de Andrade", processo: "1005824-37.2024.8.26.0565", tribunal: "TJSP", tipo: "Cível", polo_ativo: "Andre Pitzer de Andrade", polo_passivo: "American Airlines Incorporation" },
  { nome: "Viviane Keila Lima Dias", processo: "2222570-88.2025.8.26.0000", tribunal: "TJSP", tipo: "Cível", polo_ativo: "Viviane Keila Lima Dias", polo_passivo: "Sagrada Familia Saude Sf Sistema de Saude Ltda" },
  { nome: "Maria do Carmo de Brito Stella", processo: "1002304-76.2025.8.26.0228", tribunal: "TJSP", tipo: "Cível", polo_ativo: "Maria do Carmo de Brito Stella", polo_passivo: "Procuradoria Geral do Estado" },
  { nome: "Daiane Silva Teixeira", processo: "1052122-93.2025.8.26.0002", tribunal: "TJSP", tipo: "Cível", polo_ativo: "Daiane Silva Teixeira", polo_passivo: "Sul America Cia de Seguro Saude" },
];

let criados = 0;
let existentes = 0;

for (const c of clientes) {
  // Verificar se cliente já existe
  const existe = db.prepare('SELECT id FROM clients WHERE nome = ?').get(c.nome);
  let clientId;

  if (existe) {
    clientId = existe.id;
    existentes++;
    console.log(`⚠️  Cliente já existe: ${c.nome} (id: ${clientId})`);
  } else {
    const r = db.prepare(`INSERT INTO clients (nome, created_by) VALUES (?, ?)`).run(c.nome, USER_ID);
    clientId = r.lastInsertRowid;
    criados++;
    console.log(`✅ Cliente criado: ${c.nome} (id: ${clientId})`);
  }

  // Verificar se processo já existe
  const processoExiste = db.prepare('SELECT id FROM processos WHERE numero_cnj = ?').get(c.processo);
  if (processoExiste) {
    console.log(`   ⚠️  Processo já existe: ${c.processo}`);
  } else {
    db.prepare(`INSERT INTO processos (client_id, numero_cnj, tribunal, tipo, polo_ativo, polo_passivo, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      clientId, c.processo, c.tribunal, c.tipo, c.polo_ativo, c.polo_passivo || null, USER_ID
    );
    console.log(`   📁 Processo criado: ${c.processo} (${c.tribunal})`);
  }
}

console.log(`\n✅ Concluído: ${criados} clientes criados, ${existentes} já existiam`);
