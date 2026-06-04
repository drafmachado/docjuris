import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../storage/templates');
const PDFS_DIR = path.join(__dirname, '../../storage/pdfs');

// Garante as pastas existem
[TEMPLATES_DIR, PDFS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Gera documento a partir de um template .docx e valores
export async function generateDocument(templateFilename, values, outputBasename) {
  const templatePath = path.join(TEMPLATES_DIR, templateFilename);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template não encontrado: ${templateFilename}`);
  }

  // Lê e processa o template
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    errorLogging: false,
    // Placeholders não encontrados retornam string vazia em vez de lançar erro
    nullGetter(part) {
      if (!part.module) return '';
      return '';
    },
  });

  // Substitui os campos — docxtemplater usa {CAMPO} (sem duplas chaves)
  // mas nossos templates usam {{CAMPO}}, então convertemos
  const normalizedValues = {};
  for (const [key, val] of Object.entries(values)) {
    const normalKey = key.replace(/\s+/g, '_').toUpperCase();
    normalizedValues[normalKey] = val || '';
    // Também mantém a chave original para compatibilidade
    normalizedValues[key] = val || '';
  }

  try {
    doc.render(normalizedValues);
  } catch (renderErr) {
    // Logar detalhes do Multi error para diagnóstico
    if (renderErr.properties && renderErr.properties.errors) {
      const details = renderErr.properties.errors.map(e => ({
        message: e.message,
        name: e.name,
        properties: e.properties,
      }));
      console.error('❌ docxtemplater render errors:', JSON.stringify(details, null, 2));
      const firstMsg = details.map(e => e.properties?.explanation || e.message).join('; ');
      throw new Error('Erro ao preencher template: ' + firstMsg);
    }
    throw renderErr;
  }

  // Salva o .docx preenchido
  const docxFilename = `${outputBasename}.docx`;
  const docxPath = path.join(PDFS_DIR, docxFilename);
  const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(docxPath, buf);

  // Converte para PDF usando LibreOffice
  const pdfFilename = `${outputBasename}.pdf`;
  const pdfPath = path.join(PDFS_DIR, pdfFilename);

  try {
    execSync(
      `soffice --headless --convert-to pdf --outdir "${PDFS_DIR}" "${docxPath}"`,
      { timeout: 30000, stdio: 'pipe' }
    );
    // LibreOffice gera o PDF com o mesmo nome base
    const generatedPdf = path.join(PDFS_DIR, `${outputBasename}.pdf`);
    if (!fs.existsSync(generatedPdf)) throw new Error('PDF não gerado');
  } catch (err) {
    // Se LibreOffice não disponível, retorna só o docx
    console.warn('LibreOffice não disponível, retornando apenas .docx:', err.message);
    return { docxFilename, pdfFilename: null, docxPath };
  }

  return { docxFilename, pdfFilename, docxPath, pdfPath };
}

// Lê o texto do template para análise de campos
export function readTemplateText(templateFilename) {
  const templatePath = path.join(TEMPLATES_DIR, templateFilename);
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);

  // Extrai texto do document.xml
  const docXml = zip.files['word/document.xml'];
  if (!docXml) return '';

  const xmlContent = docXml.asText();
  // Remove tags XML e retorna texto puro com placeholders preservados
  return xmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Mapeamento padrão: placeholder do template → chave no objeto cliente
export const AUTO_FIELD_MAP = {
  'NOME_CLIENTE': 'nome',
  'Nome do contratante': 'nome',
  'Nacionalidade': 'nacionalidade',
  'Número do documento': 'rg',
  'Órgão expedidor': 'orgao_expedidor',
  'Número CPF': 'cpf',
  'Endereço completo': 'endereco',
  'Cidade e Estado': 'cidade_estado', // calculado
  'NOME': 'nome',
  'CPF': 'cpf',
  'RG': 'rg',
  'ENDEREÇO': 'endereco',
  'CIDADE': 'cidade',
  'ESTADO': 'estado',
};

// Prepara os valores finais para preenchimento do template
export function buildFillValues(client, manualValues) {
  // Constrói cidade_estado se necessário
  const cidadeEstado = [client.cidade, client.estado].filter(Boolean).join(', ');
  const enderecoCompleto = [client.endereco, client.cidade, client.estado].filter(Boolean).join(', ');

  // Mapeamento amplo: cobre variações de placeholder nos templates
  const clientFields = {
    // Variações de nome
    'NOME_CLIENTE':        client.nome || '',
    'Nome do contratante': client.nome || '',
    'NOME':                client.nome || '',
    'nome':                client.nome || '',
    // Nacionalidade
    'Nacionalidade':       client.nacionalidade || '',
    'nacionalidade':       client.nacionalidade || '',
    // RG
    'Número do documento': client.rg || '',
    'RG':                  client.rg || '',
    'rg':                  client.rg || '',
    // Órgão expedidor
    'Órgão expedidor':     client.orgao_expedidor || '',
    'orgao_expedidor':     client.orgao_expedidor || '',
    'ORGAO_EXPEDIDOR':     client.orgao_expedidor || '',
    // CPF
    'Número CPF':          client.cpf || '',
    'CPF':                 client.cpf || '',
    'cpf':                 client.cpf || '',
    // Endereço
    'Endereço completo':   enderecoCompleto,
    'ENDEREÇO':            client.endereco || '',
    'endereco':            client.endereco || '',
    // Cidade / Estado
    'Cidade e Estado':     cidadeEstado,
    'cidade_estado':       cidadeEstado,
    'CIDADE':              client.cidade || '',
    'cidade':              client.cidade || '',
    'ESTADO':              client.estado || '',
    'estado':              client.estado || '',
    // Email e telefone
    'email':               client.email || '',
    'EMAIL':               client.email || '',
    'telefone':            client.telefone || '',
    'TELEFONE':            client.telefone || '',
    // Data
    'data_atual':          new Date().toLocaleDateString('pt-BR'),
    'DATA_ATUAL':          new Date().toLocaleDateString('pt-BR'),
  };

  return { ...clientFields, ...manualValues };
}
