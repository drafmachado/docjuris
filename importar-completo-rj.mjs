import { getDB, initDB } from './db.js';
initDB();
const db = getDB();
const USER_ID = 1;

// Todos os 118 processos com polo ativo (cliente) extraídos das 6 páginas
const todos = [
  ["0809386-75.2026.8.19.0205","MONICA VIEIRA DE SOUZA","PORTO SEGURO SEGURO SAUDE S A","18º JEC Campo Grande","Campo Grande","Tratamento médico-hospitalar","ativo"],
  ["0813200-83.2026.8.19.0209","ISADDORA SOUSA BARBOSA","AMIL ASSISTÊNCIA MEDICA INTERNACIONAL","1º JEC Barra da Tijuca","Barra da Tijuca","Planos de saúde","ativo"],
  ["0811741-46.2026.8.19.0209","JORGE NAUM SAAD CHRISTOFF","UNIMED RJ","7º NJ 4.0 Saúde","Barra da Tijuca","Fornecimento de insumos","ativo"],
  ["0812706-63.2026.8.19.0002","NATHALIA EBOLI SILVA BOTELHO","QUALICORP","3º JEC Niterói","Niterói","Planos de saúde","ativo"],
  ["0810788-82.2026.8.19.0209","ALEXANDRE JOSE COSTA DE ALMEIDA","Unimed Rio","7º NJ 4.0 Saúde","Barra da Tijuca","Planos de saúde","ativo"],
  ["0805484-82.2026.8.19.0054","VANDEMBERG LIMA","ITAU UNIBANCO S.A.","2º JEC São João Meriti","São João de Meriti","Indenização Dano Material","ativo"],
  ["0805576-98.2026.8.19.0203","DAVI FEIJO FERNANDES PEREIRA","","14º JEC Jacarepaguá","Jacarepaguá","Tratamento médico-hospitalar","arquivado"],
  ["0819412-65.2026.8.19.0001","RAFAEL DE MATOS FUZI","NOTRE DAME INTERMEDICA SAUDE S.A.","21º JEC Capital","Capital","Indenização Dano Material","ativo"],
  ["0816837-84.2026.8.19.0001","RAFAEL DE MATOS FUZI","","21º JEC Capital","Capital","Indenização Dano Material","arquivado"],
  ["0803757-11.2026.8.19.0209","ABEL FERREIRA CARNEIRO","ITAU UNIBANCO S.A","2º JEC Barra da Tijuca","Barra da Tijuca","Perdas e Danos","ativo"],
  ["0837263-30.2025.8.19.0203","WAGNER PERES PEREIRA","","16º JEC Jacarepaguá","Jacarepaguá","Cancelamento de vôo","ativo"],
  ["0837127-33.2025.8.19.0203","MARCUS VINICIUS MAGALHAES DE CAMPOS","DEUTSCHE LUFTHANSA AG","16º JEC Jacarepaguá","Jacarepaguá","Cancelamento de vôo","ativo"],
  ["0807129-64.2025.8.19.0253","GUILHERME DA COSTA ASSUNCAO CECILIO","","8º JEC Tijuca","Tijuca","Indenização Dano Material","arquivado"],
  ["0859415-36.2025.8.19.0021","RODRIGO RODRIGUES RAMOS","SUL AMERICA COMPANHIA DE SEGURO SAUDE","2º JEC Duque de Caxias","Duque de Caxias","Fornecimento de insumos","ativo"],
  ["0806815-21.2025.8.19.0253","VINCENZINA FICO PANARO","UNIMED RJ","8º JEC Tijuca","Tijuca","Tratamento médico-hospitalar","ativo"],
  ["0806473-10.2025.8.19.0253","CARLA ANTELMAN DO VALLE","","8º JEC Tijuca","Tijuca","Tratamento médico-hospitalar","arquivado"],
  ["0974568-80.2025.8.19.0001","L. F. S. P.","AMIL","6º NJ 4.0 Saúde","Capital","Tratamento médico-hospitalar","ativo"],
  ["0850505-20.2025.8.19.0021","EDUARDO PERES DE OLIVEIRA DE MELLO","NOTRE DAME INTERMEDICA SAUDE S.A.","6º NJ 4.0 Saúde","Duque de Caxias","Tratamento médico-hospitalar","ativo"],
  ["0805697-10.2025.8.19.0253","AVAH CHAMARELLI DE ALMEIDA HOFER","REAL GRANDEZA","8º JEC Tijuca","Tijuca","Indenização Dano Material","ativo"],
  ["0948362-29.2025.8.19.0001","GUILHERME DA COSTA ASSUNCAO CECILIO","MEDISE","1ª Vara Cível Bangu","Bangu","Erro Médico","ativo"],
  ["0805192-19.2025.8.19.0253","OLIVIA ANTELMAN DO VALLE","UNIMED RJ","8º JEC Tijuca","Tijuca","Erro Médico","ativo"],
  ["0805183-57.2025.8.19.0253","GUILHERME DA COSTA ASSUNCAO CECILIO","SUL AMERICA COMPANHIA DE SEGURO SAUDE","8º JEC Tijuca","Tijuca","Erro Médico","ativo"],
  ["0826012-15.2025.8.19.0203","ARTHUR DE CARVALHO CALDEIRA","AMIL","7º NJ 4.0 Saúde","Jacarepaguá","Obrigação de Fazer","ativo"],
  ["0804665-67.2025.8.19.0253","VINCENZINA FICO PANARO","UNIMED RJ","8º JEC Tijuca","Tijuca","Obrigação de Fazer","ativo"],
  ["0917793-45.2025.8.19.0001","ARTHUR DE CARVALHO CALDEIRA","","23º JEC Capital","Capital","Obrigação de Fazer","arquivado"],
  ["0881095-40.2025.8.19.0001","MARIA JOSE DE SOUZA PAOLINO","QUALICORP","46ª Vara Cível Capital","Capital","Reajuste contratual","ativo"],
  ["0876115-50.2025.8.19.0001","RAFAEL DE MATOS FUZI","NOTRE DAME INTERMEDICA SAUDE S.A.","7ª Vara Cível Barra","Barra da Tijuca","Urgência","ativo"],
  ["0802265-77.2025.8.19.0254","MARIA JOSE DE SOUZA PAOLINO","","9º JEC Vila Isabel","Vila Isabel","Revisão de Contrato","arquivado"],
  ["0802905-83.2025.8.19.0253","GUILHERME DA COSTA ASSUNCAO CECILIO","","8º JEC Tijuca","Tijuca","Indenização Dano Material","arquivado"],
  ["0817040-38.2025.8.19.0209","JORGE NAUM SAAD CHRISTOFF","UNIMED RJ","3º JEC Barra da Tijuca","Barra da Tijuca","Fornecimento de insumos","ativo"],
  ["0809355-77.2025.8.19.0209","ISADDORA SOUSA BARBOSA","AMIL","1ª Vara Cível Barra","Barra da Tijuca","Home Care","ativo"],
  ["0830456-18.2025.8.19.0001","ALESSANDRA DE MARTINO MOTA","CARLOS EDUARDO DA SILVA FIGUEIREDO","12ª Vara Família Capital","Capital","Guarda","arquivado"],
  ["0809121-77.2025.8.19.0021","GISELE FIORENTINI CHAVES","","2º JEC Duque de Caxias","Duque de Caxias","Fornecimento de insumos","arquivado"],
  ["0804898-41.2025.8.19.0002","VILMA DA SILVA NEVES","","2º JEC Niterói","Niterói","Indenização Dano Material","arquivado"],
  ["0803974-88.2025.8.19.0209","ISADDORA SOUSA BARBOSA","","7º NJ 4.0 Saúde","Barra da Tijuca","Tratamento médico-hospitalar","arquivado"],
  ["0802788-48.2025.8.19.0203","JEAN LOPES BARBOSA","BRADESCO SAUDE S A","1ª Vara Cível Jacarepaguá","Jacarepaguá","Tratamento médico-hospitalar","ativo"],
  ["0800300-64.2025.8.19.0254","MARIA JOSE DE SOUZA PAOLINO","SUL AMERICA COMPANHIA DE SEGURO SAUDE","7º NJ 4.0 Saúde","Vila Isabel","Tratamento médico-hospitalar","ativo"],
  ["0801880-52.2025.8.19.0021","ELENICE MEDEIROS RODRIGUES","SUL AMERICA COMPANHIA DE SEGURO SAUDE","7º NJ 4.0 Saúde","Duque de Caxias","Fornecimento de medicamentos","ativo"],
  ["0802623-25.2025.8.19.0001","ALESSANDRA DE MARTINO MOTA","CARLOS EDUARDO DA SILVA FIGUEIREDO","12ª Vara Família Capital","Capital","Fixação Alimentos","ativo"],
  ["0800443-33.2025.8.19.0002","VILMA DA SILVA NEVES","SUL AMERICA COMPANHIA DE SEGURO SAUDE","2º JEC Niterói","Niterói","Tratamento médico-hospitalar","arquivado"],
  ["0847089-96.2024.8.19.0209","ROGERIO TANICO NEVES","","7º NJ 4.0 Saúde","Barra da Tijuca","Tratamento médico-hospitalar","arquivado"],
  ["0963004-41.2024.8.19.0001","FREDERICO EVORA KOROLL","","18ª Vara Família Capital","Capital","Alimentos","arquivado"],
  ["0806868-36.2024.8.19.0253","OLIVIA ANTELMAN DO VALLE","UNIMED RJ","8º JEC Tijuca","Tijuca","Tratamento médico-hospitalar","ativo"],
  ["0840307-85.2024.8.19.0205","DANIELE BATISTA DE OLIVEIRA","KLINI PLANOS DE SAUDE LTDA","7º NJ 4.0 Saúde","Campo Grande","Tratamento médico-hospitalar","ativo"],
  ["0878336-26.2024.8.19.0038","CONCEICAO DE FATIMA LIMA BARROS","AMIL","1º JEC Nova Iguaçu","Nova Iguaçu","Tratamento médico-hospitalar","arquivado"],
  ["0826299-03.2024.8.19.0206","MARIA DAS GRACAS DE ARAUJO FEITOSA","","1º JEC Santa Cruz","Santa Cruz","Obrigação de Fazer","arquivado"],
  ["0806706-41.2024.8.19.0253","AVAH CHAMARELLI DE ALMEIDA HOFER","","8º JEC Tijuca","Tijuca","Tratamento médico-hospitalar","arquivado"],
  ["0838707-29.2024.8.19.0205","ARIANA SOUZA DE OLIVEIRA TRAJANO","","7º NJ 4.0 Saúde","Campo Grande","Tratamento médico-hospitalar","arquivado"],
  ["0948004-98.2024.8.19.0001","LUIGINO CIPOLLA","UNIMED RJ","6º NJ 4.0 Saúde","Capital","Eletiva","ativo"],
  ["0825500-28.2024.8.19.0054","EDNA ISRAEL DE OLIVEIRA","UNIMED RJ","7º NJ 4.0 Saúde","São João de Meriti","Tratamento médico-hospitalar","ativo"],
  ["0838385-15.2024.8.19.0203","ARTHUR DE CARVALHO CALDEIRA","","7º NJ 4.0 Saúde","Jacarepaguá","Acidente de Trânsito","arquivado"],
  ["0809046-24.2024.8.19.0037","CHAIENI FIRMINO DOS SANTOS","LUAN OLIVIERA BASTOS","1ª Vara Família Nova Friburgo","Nova Friburgo","Alimentos","ativo"],
  ["0834936-49.2024.8.19.0203","MARCOS PAULO DE FREITAS","SUL AMERICA COMPANHIA DE SEGURO SAUDE","7º NJ 4.0 Saúde","Jacarepaguá","Home Care","ativo"],
  ["0804108-14.2024.8.19.0254","PAULO CESAR BARBOSA ZENICOLA","","7º NJ 4.0 Saúde","Vila Isabel","Tratamento médico-hospitalar","arquivado"],
  ["0821222-07.2024.8.19.0208","JONAS BATISTA FERNANDES LINS","NOTRE DAME INTERMEDICA SAUDE S.A.","7º NJ 4.0 Saúde","Méier","Acidente de Trânsito","ativo"],
  ["0828939-67.2024.8.19.0209","MAURO LEBRAO","AMIL","7ª Vara Cível Barra","Barra da Tijuca","Inclusão Indevida Cadastro","ativo"],
  ["0819915-18.2024.8.19.0208","NEIDE GONCALVES RIBEIRO","","12º JEC Méier","Méier","Indenização Dano Material","arquivado"],
  ["0816114-09.2024.8.19.0204","GLAUCIA DA GLORIA CHAGAS","","7º NJ 4.0 Saúde","Capital","Tratamento médico-hospitalar","arquivado"],
  ["0805392-33.2024.8.19.0068","PATRICIA DE ASSIS GALVAO","BRADESCO SAÚDE","7º NJ 4.0 Saúde","Nova Friburgo","Indenização Dano Material","ativo"],
  ["0830456-89.2024.8.19.0021","ANTONIO JOSE PEREIRA SILVA","","7º NJ 4.0 Saúde","Duque de Caxias","Tratamento médico-hospitalar","arquivado"],
  ["0806360-04.2024.8.19.0023","MARLI UBALDINO DA COSTA TELES","AMIL","JEC Itaboraí","Itaboraí","Indenização Dano Material","ativo"],
  ["0819391-36.2024.8.19.0203","MARCUS VINICIUS MAGALHAES DE CAMPOS","","16º JEC Jacarepaguá","Jacarepaguá","Abatimento preço","arquivado"],
  ["0825069-93.2024.8.19.0021","ADRIANA AUGUSTA COELHO MELO","","3º JEC Duque de Caxias","Duque de Caxias","Abatimento preço","arquivado"],
  ["0802914-79.2024.8.19.0253","CARLA ANTELMAN DO VALLE","UNIMED RJ","8º JEC Tijuca","Tijuca","Internação compulsória","ativo"],
  ["0855363-91.2024.8.19.0001","MARCUS VINICIUS MAGALHAES DE CAMPOS","","3º JEC Capital","Capital","Abatimento preço","arquivado"],
  ["0815605-81.2024.8.19.0203","DANIELLE GONZALES DE MELLO ALVES","","14º JEC Jacarepaguá","Jacarepaguá","Indenização Dano Material","arquivado"],
  ["0802586-55.2024.8.19.0252","NAIR MENDONCA SOARES","","7º NJ 4.0 Saúde","Vila Isabel","Tratamento médico-hospitalar","arquivado"],
  ["0811721-38.2024.8.19.0205","SIMONE SOARES SILVA","","7º NJ 4.0 Saúde","Campo Grande","Reajuste contratual","arquivado"],
  ["0802312-57.2024.8.19.0037","ROSILENE FREIRE BRANDAO RODRIGUES","","7º NJ 4.0 Saúde","Nova Friburgo","Indenização Dano Material","arquivado"],
  ["0803385-54.2024.8.19.0008","CELIA MARTINS PIMENTA DE AVILA","PORTO SEGURO SEGURO SAUDE S A","3ª Vara Cível Belford Roxo","Belford Roxo","Eletiva","ativo"],
  ["0801212-98.2024.8.19.0253","GUILHERME DA COSTA ASSUNCAO CECILIO","","8º JEC Tijuca","Tijuca","Indenização Dano Material","arquivado"],
  ["0800841-40.2024.8.19.0252","JOSE DONATO MELO","SUL AMERICA COMPANHIA DE SEGURO SAUDE","7º NJ 4.0 Saúde","Vila Isabel","Indenização Dano Material","ativo"],
  ["0801609-19.2024.8.19.0008","JONATAS DE BRITO","SUL AMERICA COMPANHIA DE SEGURO SAUDE","2ª Vara Cível Belford Roxo","Belford Roxo","Direito Autoral","ativo"],
  ["0800475-67.2024.8.19.0036","CIRLAINE SOBRINHO BERG","","1º JEC Nilópolis","Nilópolis","Tratamento médico-hospitalar","arquivado"],
  ["0806687-69.2023.8.19.0253","GUILHERME DA COSTA ASSUNCAO CECILIO","","8º JEC Tijuca","Tijuca","Acidente de Trânsito","arquivado"],
  ["0828680-30.2023.8.19.0202","JESSICA BRAGA CORSO","ARMANDO LEMOS DE FIGUEIREDO JUNIOR","1ª Vara Cível Leopoldina","Leopoldina","Compra e Venda","ativo"],
  ["0962390-70.2023.8.19.0001","MARCUS VINICIUS MAGALHAES DE CAMPOS","","7º JEC Capital","Capital","Acidente de Trânsito","arquivado"],
  ["0826928-96.2023.8.19.0210","BRUNO BOTTINO DE PAIVA","IMPULSE CAPITAL EIRELI","2ª Vara Cível Leopoldina","Leopoldina","Anulação","ativo"],
  ["0804590-93.2023.8.19.0254","LUIGINO CIPOLLA","","7º NJ 4.0 Saúde","Vila Isabel","Indenização Dano Material","arquivado"],
  ["0829155-65.2023.8.19.0208","FLAVIA MAZZOLI DA ROCHA","IMPULSE CAPITAL EIRELI","1ª Vara Cível Méier","Méier","Acidente de Trânsito","ativo"],
  ["0841388-12.2023.8.19.0203","CHAIANE GOMES MAGALHAES DE CAMPOS","ESPACO RIO LOUNGE","5ª Vara Cível Jacarepaguá","Jacarepaguá","Acidente de Trânsito","ativo"],
  ["0831853-41.2023.8.19.0209","CASSIA CRISTINE DE DEUS PEDRON MARIANO","","2º JEC Barra da Tijuca","Barra da Tijuca","Acidente de Trânsito","arquivado"],
  ["0822340-46.2023.8.19.0210","RENATA DE SOUZA COSTA","","10º JEC Leopoldina","Leopoldina","Acidente de Trânsito","arquivado"],
  ["0809962-67.2023.8.19.0207","VALDIR SILVA DE ANDRADE","","20º JEC Ilha do Governador","Ilha do Governador","Acidente de Trânsito","arquivado"],
  ["0836871-25.2023.8.19.0021","VALTENIA SANTOS DA SILVA","","3º JEC Duque de Caxias","Duque de Caxias","Acidente de Trânsito","ativo"],
  ["0816379-27.2023.8.19.0210","MARCO ANTONIO RAMOS GONCALVES","","10º JEC Leopoldina","Leopoldina","Indenização Dano Material","arquivado"],
  ["0815424-02.2023.8.19.0208","SEGREDO DE JUSTIÇA","","4ª Vara Família Méier","Méier","Partilha Divórcio","arquivado"],
  ["0805987-65.2023.8.19.0036","JANETE DE JESUS NEVES","","2ª Vara Cível Nilópolis","Nilópolis","Inclusão Indevida Cadastro","arquivado"],
  ["0813288-29.2023.8.19.0209","EDMUNDO SEREBRENICK","","2º JEC Barra da Tijuca","Barra da Tijuca","Indenização Dano Material","arquivado"],
  ["0812522-73.2023.8.19.0209","GECINEI DE MATOS CARVALHO","","2º JEC Barra da Tijuca","Barra da Tijuca","Indenização Dano Material","arquivado"],
  ["0814275-93.2023.8.19.0038","JOELMA DA ROCHA PEIXOTO ANDRADE","","1º JEC Nova Iguaçu","Nova Iguaçu","Tratamento médico-hospitalar","arquivado"],
  ["0811617-50.2023.8.19.0021","VIVIAN GOMES BARRETO","","1º JEC Duque de Caxias","Duque de Caxias","Acidente de Trânsito","arquivado"],
  ["0800874-58.2023.8.19.0254","LUIZA HELENA DA SILVA SOUTO","","9º JEC Vila Isabel","Vila Isabel","Fornecimento de insumos","ativo"],
  ["0806201-22.2023.8.19.0209","JUCIARA DE MATOS ROSA FONSECA","","1º JEC Barra da Tijuca","Barra da Tijuca","Acidente de Trânsito","arquivado"],
  ["0801384-12.2023.8.19.0209","ALBERTO PINHEIRO DA COSTA","","1º JEC Barra da Tijuca","Barra da Tijuca","Indenização Dano Material","arquivado"],
  ["0867124-90.2022.8.19.0001","MARIA AUGUSTA DA SILVA OLIVEIRA","SUL AMERICA COMPANHIA DE SEGURO SAUDE","45ª Vara Cível Capital","Capital","Direito Autoral","ativo"],
  ["0839746-48.2022.8.19.0038","MARIANGELA CHERNICHARO LOPES","","1º JEC Nova Iguaçu","Nova Iguaçu","Fornecimento de insumos","arquivado"],
  ["0857882-10.2022.8.19.0001","FABIO PITZER DE ANDRADE","","27º JEC Capital","Capital","Produto Impróprio","arquivado"],
  ["0821823-81.2022.8.19.0208","ELLEN FERREIRA MACHADO","","13º JEC Méier","Méier","Produto Impróprio","arquivado"],
  ["0852445-85.2022.8.19.0001","NATHALIA OLIVEIRA","","21º JEC Capital","Capital","Indenização Dano Material","arquivado"],
  ["0822670-80.2022.8.19.0209","CARMELINDA TUPINAMBA DE MENEZES","","2º JEC Barra da Tijuca","Barra da Tijuca","Fornecimento de insumos","arquivado"],
  ["0832362-34.2022.8.19.0038","BRUNA ALVES BARBOSA DE ARAUJO","PAULA MONTEMEZO","5ª Vara Cível Nova Iguaçu","Nova Iguaçu","Erro Médico","ativo"],
  ["0824662-58.2022.8.19.0021","FRANCISCO FLAVIO DO NASCIMENTO","","3º JEC Duque de Caxias","Duque de Caxias","Reajuste contratual","arquivado"],
  ["0814070-12.2022.8.19.0002","ADRIANO FERREIRA NETO","SUL AMERICA COMPANHIA DE SEGURO SAUDE","7º NJ 4.0 Saúde","Niterói","Tratamento médico-hospitalar","ativo"],
  ["0815398-50.2022.8.19.0204","ANDERSON ELIAS MENDEL","NOTRE DAME INTERMEDICA SAUDE S.A.","7º NJ 4.0 Saúde","Capital","Tratamento médico-hospitalar","ativo"],
  ["0813602-12.2022.8.19.0208","ESPOLIO DE DIRCE MEDEIROS FERREIRA","BRADESCO SAUDE S A","5ª Vara Cível Méier","Méier","Acidente de Trânsito","ativo"],
  ["0814272-29.2022.8.19.0021","ANA CRISTINA FREITAS DOS SANTOS","","1º JEC Duque de Caxias","Duque de Caxias","Tratamento médico-hospitalar","ativo"],
  ["0804461-84.2022.8.19.0008","OSORIO EDUARDO BARROS RAMOS","","7º NJ 4.0 Saúde","Belford Roxo","Acidente de Trânsito","arquivado"],
  ["0817134-09.2022.8.19.0203","ANDREIA FERREIRA MACHADO","","2ª Vara Cível Jacarepaguá","Jacarepaguá","Acidente de Trânsito","arquivado"],
  ["0810504-19.2022.8.19.0208","RENATA PINTO RAMALHO","SUL AMERICA COMPANHIA DE SEGURO SAUDE","12º JEC Méier","Méier","Fornecimento de insumos","ativo"],
  ["0804555-88.2022.8.19.0054","SAUL PEREIRA RODRIGUES DO REGO","","2º JEC São João Meriti","São João de Meriti","Substituição do Produto","arquivado"],
  ["0808095-85.2022.8.19.0203","ANDRE PITZER DE ANDRADE","","16º JEC Jacarepaguá","Jacarepaguá","Compra e Venda","arquivado"],
  ["0808001-40.2022.8.19.0203","ANDRE PITZER DE ANDRADE","","16º JEC Jacarepaguá","Jacarepaguá","Compra e Venda","arquivado"],
  ["0801522-31.2022.8.19.0203","ANDRE PITZER DE ANDRADE","","14º JEC Jacarepaguá","Jacarepaguá","Abatimento preço","arquivado"],
  ["0801204-48.2022.8.19.0203","ANDRE PITZER DE ANDRADE","","16º JEC Jacarepaguá","Jacarepaguá","Repetição do Indébito","arquivado"],
  ["0804569-07.2021.8.19.0087","MELLISSA BARRETO OLIVEIRA DA SILVA","","2º JEC Alcântara","Alcântara","Acidente de Trânsito","arquivado"],
  ["0808034-79.2021.8.19.0004","MELLISSA BARRETO OLIVEIRA DA SILVA","","2º JEC São Gonçalo","São Gonçalo","Acidente de Trânsito","arquivado"],
  ["0800693-44.2021.8.19.0087","VIVIANE LUIZ DE FREITAS","","2º JEC Alcântara","Alcântara","Acidente de Trânsito","ativo"],
];

let criados = 0;
let atualizados = 0;
let clientesCriados = 0;

for (const [numero, nomeCliente, nomeReu, vara, comarca, tipo, status] of todos) {
  if (!nomeCliente || nomeCliente === 'SEGREDO DE JUSTIÇA') continue;

  // Criar ou buscar cliente
  let cliente = db.prepare('SELECT id FROM clients WHERE nome = ?').get(nomeCliente);
  if (!cliente) {
    const r = db.prepare('INSERT INTO clients (nome, created_by) VALUES (?, ?)').run(nomeCliente, USER_ID);
    cliente = { id: r.lastInsertRowid };
    clientesCriados++;
  }

  // Verificar se processo já existe
  const proc = db.prepare('SELECT id, client_id FROM processos WHERE numero_cnj = ?').get(numero);

  if (proc) {
    // Atualizar com dados corretos
    db.prepare(`UPDATE processos SET client_id=?, polo_ativo=?, polo_passivo=?, vara=?, comarca=?, tipo=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(cliente.id, nomeCliente, nomeReu||null, vara, comarca, tipo, status === 'ativo' ? 'ativo' : 'arquivado', proc.id);
    atualizados++;
  } else {
    // Criar novo
    db.prepare(`INSERT INTO processos (client_id, numero_cnj, tribunal, tipo, vara, comarca, polo_ativo, polo_passivo, status, created_by) VALUES (?,?,'TJRJ',?,?,?,?,?,?,?)`)
      .run(cliente.id, numero, tipo, vara, comarca, nomeCliente, nomeReu||null, status === 'ativo' ? 'ativo' : 'arquivado', USER_ID);
    criados++;
  }
}

// Remover cliente genérico "A IDENTIFICAR" se todos os processos foram migrados
const aIdentificar = db.prepare("SELECT id FROM clients WHERE nome = 'A IDENTIFICAR'").get();
if (aIdentificar) {
  const pendentes = db.prepare('SELECT COUNT(*) as n FROM processos WHERE client_id = ?').get(aIdentificar.id);
  if (pendentes.n === 0) {
    db.prepare('DELETE FROM clients WHERE id = ?').run(aIdentificar.id);
    console.log('🗑️  Cliente "A IDENTIFICAR" removido (sem processos)');
  } else {
    console.log(`⚠️  ${pendentes.n} processos ainda vinculados a "A IDENTIFICAR"`);
  }
}

console.log(`✅ ${criados} processos novos criados`);
console.log(`🔄 ${atualizados} processos atualizados com nome do cliente`);
console.log(`👤 ${clientesCriados} novos clientes criados`);
