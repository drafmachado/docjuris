import { getDB, initDB } from './db.js';

initDB();
const db = getDB();
const USER_ID = 1;

// 56 processos ATIVOS do TJRJ (filtrados do relatório PJe)
const processos = [
  ["0809386-75.2026.8.19.0205", "Tratamento médico-hospitalar", "18º JEC Campo Grande", "Campo Grande"],
  ["0813200-83.2026.8.19.0209", "Planos de saúde", "1º JEC Barra da Tijuca", "Barra da Tijuca"],
  ["0811741-46.2026.8.19.0209", "Fornecimento de insumos", "7º NJ 4.0 Saúde", "Barra da Tijuca"],
  ["0812706-63.2026.8.19.0002", "Planos de saúde", "3º JEC Niterói", "Niterói"],
  ["0810788-82.2026.8.19.0209", "Planos de saúde", "7º NJ 4.0 Saúde", "Barra da Tijuca"],
  ["0805484-82.2026.8.19.0054", "Indenização Dano Material", "2º JEC São João Meriti", "São João de Meriti"],
  ["0819412-65.2026.8.19.0001", "Indenização Dano Material", "21º JEC Capital", "Capital"],
  ["0803757-11.2026.8.19.0209", "Perdas e Danos", "2º JEC Barra da Tijuca", "Barra da Tijuca"],
  ["0837263-30.2025.8.19.0203", "Cancelamento de vôo", "16º JEC Jacarepaguá", "Jacarepaguá"],
  ["0837127-33.2025.8.19.0203", "Cancelamento de vôo", "16º JEC Jacarepaguá", "Jacarepaguá"],
  ["0859415-36.2025.8.19.0021", "Fornecimento de insumos", "2º JEC Duque de Caxias", "Duque de Caxias"],
  ["0806815-21.2025.8.19.0253", "Tratamento médico-hospitalar", "8º JEC Tijuca", "Tijuca"],
  ["0974568-80.2025.8.19.0001", "Tratamento médico-hospitalar", "6º NJ 4.0 Saúde Vara Cível", "Capital"],
  ["0850505-20.2025.8.19.0021", "Tratamento médico-hospitalar", "6º NJ 4.0 Saúde Vara Cível", "Duque de Caxias"],
  ["0805697-10.2025.8.19.0253", "Indenização Dano Material", "8º JEC Tijuca", "Tijuca"],
  ["0948362-29.2025.8.19.0001", "Erro Médico", "1ª Vara Cível Bangu", "Bangu"],
  ["0805192-19.2025.8.19.0253", "Erro Médico", "8º JEC Tijuca", "Tijuca"],
  ["0805183-57.2025.8.19.0253", "Erro Médico", "8º JEC Tijuca", "Tijuca"],
  ["0826012-15.2025.8.19.0203", "Obrigação de Fazer", "7º NJ 4.0 Saúde", "Jacarepaguá"],
  ["0804665-67.2025.8.19.0253", "Obrigação de Fazer", "8º JEC Tijuca", "Tijuca"],
  ["0881095-40.2025.8.19.0001", "Reajuste contratual", "46ª Vara Cível Capital", "Capital"],
  ["0876115-50.2025.8.19.0001", "Urgência", "7ª Vara Cível Barra", "Barra da Tijuca"],
  ["0817040-38.2025.8.19.0209", "Fornecimento de insumos", "3º JEC Barra da Tijuca", "Barra da Tijuca"],
  ["0809355-77.2025.8.19.0209", "Home Care", "1ª Vara Cível Barra", "Barra da Tijuca"],
  ["0802788-48.2025.8.19.0203", "Tratamento médico-hospitalar", "1ª Vara Cível Jacarepaguá", "Jacarepaguá"],
  ["0800300-64.2025.8.19.0254", "Tratamento médico-hospitalar", "7º NJ 4.0 Saúde", "Vila Isabel"],
  ["0801880-52.2025.8.19.0021", "Fornecimento de medicamentos", "7º NJ 4.0 Saúde", "Duque de Caxias"],
  ["0802623-25.2025.8.19.0001", "Fixação Alimentos", "12ª Vara Família Capital", "Capital"],
  ["0806868-36.2024.8.19.0253", "Tratamento médico-hospitalar", "8º JEC Tijuca", "Tijuca"],
  ["0840307-85.2024.8.19.0205", "Tratamento médico-hospitalar", "7º NJ 4.0 Saúde", "Campo Grande"],
  ["0948004-98.2024.8.19.0001", "Eletiva", "6º NJ 4.0 Saúde Vara Cível", "Capital"],
  ["0825500-28.2024.8.19.0054", "Tratamento médico-hospitalar", "7º NJ 4.0 Saúde", "São João de Meriti"],
  ["0809046-24.2024.8.19.0037", "Alimentos", "1ª Vara Família Nova Friburgo", "Nova Friburgo"],
  ["0834936-49.2024.8.19.0203", "Home Care", "7º NJ 4.0 Saúde", "Jacarepaguá"],
  ["0821222-07.2024.8.19.0208", "Acidente de Trânsito", "7º NJ 4.0 Saúde", "Méier"],
  ["0828939-67.2024.8.19.0209", "Inclusão Indevida Cadastro", "7ª Vara Cível Barra", "Barra da Tijuca"],
  ["0805392-33.2024.8.19.0068", "Indenização Dano Material", "7º NJ 4.0 Saúde", "Nova Friburgo"],
  ["0806360-04.2024.8.19.0023", "Indenização Dano Material", "JEC Itaboraí", "Itaboraí"],
  ["0802914-79.2024.8.19.0253", "Internação compulsória", "8º JEC Tijuca", "Tijuca"],
  ["0803385-54.2024.8.19.0008", "Eletiva", "3ª Vara Cível Belford Roxo", "Belford Roxo"],
  ["0800841-40.2024.8.19.0252", "Indenização Dano Material", "7º NJ 4.0 Saúde", "Vila Isabel"],
  ["0801609-19.2024.8.19.0008", "Direito Autoral", "2ª Vara Cível Belford Roxo", "Belford Roxo"],
  ["0828680-30.2023.8.19.0202", "Compra e Venda", "1ª Vara Cível Leopoldina", "Leopoldina"],
  ["0826928-96.2023.8.19.0210", "Anulação", "2ª Vara Cível Leopoldina", "Leopoldina"],
  ["0829155-65.2023.8.19.0208", "Acidente de Trânsito", "1ª Vara Cível Méier", "Méier"],
  ["0841388-12.2023.8.19.0203", "Acidente de Trânsito", "5ª Vara Cível Jacarepaguá", "Jacarepaguá"],
  ["0836871-25.2023.8.19.0021", "Acidente de Trânsito", "3º JEC Duque de Caxias", "Duque de Caxias"],
  ["0800874-58.2023.8.19.0254", "Fornecimento de insumos", "9º JEC Vila Isabel", "Vila Isabel"],
  ["0867124-90.2022.8.19.0001", "Direito Autoral", "45ª Vara Cível Capital", "Capital"],
  ["0832362-34.2022.8.19.0038", "Erro Médico", "5ª Vara Cível Nova Iguaçu", "Nova Iguaçu"],
  ["0814070-12.2022.8.19.0002", "Tratamento médico-hospitalar", "7º NJ 4.0 Saúde", "Niterói"],
  ["0815398-50.2022.8.19.0204", "Tratamento médico-hospitalar", "7º NJ 4.0 Saúde", "Capital"],
  ["0813602-12.2022.8.19.0208", "Acidente de Trânsito", "5ª Vara Cível Méier", "Méier"],
  ["0814272-29.2022.8.19.0021", "Tratamento médico-hospitalar", "1º JEC Duque de Caxias", "Duque de Caxias"],
  ["0810504-19.2022.8.19.0208", "Fornecimento de insumos", "12º JEC Méier", "Méier"],
  ["0800693-44.2021.8.19.0087", "Acidente de Trânsito", "2º JEC Alcântara", "Alcântara"],
];

// Criar/buscar cliente genérico "A IDENTIFICAR"
let clienteGenerico = db.prepare("SELECT id FROM clients WHERE nome = 'A IDENTIFICAR'").get();
if (!clienteGenerico) {
  const r = db.prepare("INSERT INTO clients (nome, created_by, observacoes) VALUES (?, ?, ?)").run(
    'A IDENTIFICAR', USER_ID, 'Cliente a ser identificado — processos importados do PJe TJRJ'
  );
  clienteGenerico = { id: r.lastInsertRowid };
}

let criados = 0;
let jaExistiam = 0;

for (const [numero, assunto, vara, comarca] of processos) {
  const existe = db.prepare('SELECT id FROM processos WHERE numero_cnj = ?').get(numero);
  if (existe) {
    jaExistiam++;
    continue;
  }
  db.prepare(`INSERT INTO processos (client_id, numero_cnj, tribunal, tipo, vara, comarca, observacoes, created_by)
    VALUES (?, ?, 'TJRJ', ?, ?, ?, ?, ?)`).run(
    clienteGenerico.id, numero, assunto, vara, comarca, 'Importado do PJe — identificar cliente', USER_ID
  );
  criados++;
}

console.log(`✅ ${criados} processos ativos criados`);
console.log(`⚠️  ${jaExistiam} já existiam`);
console.log(`📁 Todos vinculados ao cliente "A IDENTIFICAR" (id: ${clienteGenerico.id})`);
