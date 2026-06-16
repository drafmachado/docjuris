import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = process.env.NODE_ENV === 'production'
  ? '/app/storage/templates'
  : path.join(__dirname, '../../storage/templates');
const PDFS_DIR = process.env.NODE_ENV === 'production'
  ? '/app/storage/pdfs'
  : path.join(__dirname, '../../storage/pdfs');

// Garante as pastas existem
[TEMPLATES_DIR, PDFS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Gera documento a partir de um template .docx e valores
// Data por extenso: "16 de Junho de 2026"
function dataExtenso() {
  const d = new Date();
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// Local + data para encerramento: "São Paulo/SP, 16 de Junho de 2026"
function localData(client) {
  const cidade = client?.cidade || 'São Paulo';
  const estado = client?.estado || 'SP';
  return `${cidade}/${estado}, ${dataExtenso()}`;
}

// Normalizar fonte para 12pt no DOCX gerado (elimina inconsistências de tamanho)
function normalizarFonte12(buffer) {
  try {
    const conteudo = buffer.toString('binary');
    // 11pt = w:val="22", 10pt = w:val="20" → trocar por 12pt = w:val="24"
    const normalizado = conteudo
      .replace(/w:sz w:val="22"/g, 'w:sz w:val="24"')
      .replace(/w:szCs w:val="22"/g, 'w:szCs w:val="24"')
      .replace(/w:sz w:val="20"/g, 'w:sz w:val="24"')
      .replace(/w:szCs w:val="20"/g, 'w:szCs w:val="24"');
    return Buffer.from(normalizado, 'binary');
  } catch(e) {
    console.warn('normalizarFonte12: erro ao normalizar, usando buffer original:', e.message);
    return buffer;
  }
}

export async function generateDocument(templateFilename, values, outputBasename) {
  const templatePath = path.join(TEMPLATES_DIR, templateFilename);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template não encontrado: ${templateFilename}`);
  }

  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);

  // Monta valores normalizados — cobre variações de maiúsculas/minúsculas e underscores
  const normalizedValues = {};
  for (const [key, val] of Object.entries(values)) {
    const v = val ?? '';
    normalizedValues[key] = v;
    normalizedValues[key.toUpperCase()] = v;
    normalizedValues[key.toLowerCase()] = v;
    normalizedValues[key.replace(/\s+/g, '_')] = v;
    normalizedValues[key.replace(/\s+/g, '_').toUpperCase()] = v;
  }

  // IMPORTANTE: os templates usam chaves DUPLAS {{campo}}.
  // O delimitador precisa ser configurado como '{{' / '}}' — sem isso o
  // docxtemplater usa '{' / '}' (padrão) e acusa "duplicate open/close tags".
  // (Mesma configuração usada no fluxo automático de uploadLinks.js)
  let doc;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      errorLogging: false,
      // Placeholder sem valor → string vazia (não lança erro)
      nullGetter() { return ''; },
      // Busca tolerante (case-insensitive e com underscores)
      parser(tag) {
        return {
          get(scope) {
            const t = tag.trim();
            return scope[t]
              ?? scope[t.toUpperCase()]
              ?? scope[t.toLowerCase()]
              ?? scope[t.replace(/\s+/g, '_')]
              ?? scope[t.replace(/\s+/g, '_').toUpperCase()]
              ?? '';
          }
        };
      },
    });
  } catch (compileErr) {
    if (compileErr.properties?.errors) {
      const details = compileErr.properties.errors
        .map(e => e.properties?.explanation || e.properties?.tag || e.message)
        .filter(Boolean).slice(0, 8).join('; ');
      console.error('❌ docxtemplater compile:', details);
      throw new Error('Template com placeholders inválidos: ' + details);
    }
    throw compileErr;
  }

  try {
    doc.render(normalizedValues);
  } catch (renderErr) {
    if (renderErr.properties?.errors) {
      const details = renderErr.properties.errors
        .map(e => e.properties?.explanation || e.properties?.tag || e.message)
        .filter(Boolean).slice(0, 8).join('; ');
      console.error('❌ docxtemplater render:', details);
      throw new Error('Erro ao preencher template: ' + details);
    }
    throw renderErr;
  }

  // Salva o .docx preenchido
  const docxFilename = `${outputBasename}.docx`;
  const docxPath = path.join(PDFS_DIR, docxFilename);
  const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const bufNormalizado = normalizarFonte12(buf);
  fs.writeFileSync(docxPath, bufNormalizado);

  // Converte para PDF usando LibreOffice
  const pdfFilename = `${outputBasename}.pdf`;
  const pdfPath = path.join(PDFS_DIR, pdfFilename);

  // Converte para PDF via LibreOffice (headless).
  // O LibreOffice precisa de um HOME gravável para criar o perfil de usuário.
  // No Nix o binário pode se chamar 'soffice' ou 'libreoffice' — tentamos ambos.
  const loHome = process.env.NODE_ENV === 'production' ? '/app/storage/.lo-profile' : path.join(__dirname, '../../storage/.lo-profile');
  if (!fs.existsSync(loHome)) fs.mkdirSync(loHome, { recursive: true });

  const loCommands = ['soffice', 'libreoffice'];
  let pdfOk = false;
  let lastErr = null;

  for (const cmd of loCommands) {
    try {
      execSync(
        `${cmd} --headless --convert-to "pdf:writer_pdf_Export:EmbedStandardFonts=true,SelectPdfVersion=0" --outdir "${PDFS_DIR}" "${docxPath}"`,
        {
          timeout: 60000,
          stdio: 'pipe',
          env: { ...process.env, HOME: loHome },
        }
      );
      const generatedPdf = path.join(PDFS_DIR, `${outputBasename}.pdf`);
      if (fs.existsSync(generatedPdf)) {
        pdfOk = true;
        break;
      }
      lastErr = new Error('PDF não foi gerado pelo comando ' + cmd);
    } catch (err) {
      lastErr = err;
      // tenta o próximo comando
    }
  }

  if (!pdfOk) {
    console.warn('⚠️  LibreOffice indisponível, retornando apenas .docx:', lastErr?.message);
    return { docxFilename, pdfFilename: null, docxPath };
  }
  console.log('✅ PDF gerado:', pdfFilename);

  return { docxFilename, pdfFilename, docxPath, pdfPath };
}

// Lê o texto do template para análise de campos
export function readTemplateText(templateFilename) {
  const templatePath = path.join(TEMPLATES_DIR, templateFilename);
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);

  const docXml = zip.files['word/document.xml'];
  if (!docXml) return '';

  const xmlContent = docXml.asText();
  return xmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export const AUTO_FIELD_MAP = {
  'NOME_CLIENTE': 'nome',
  'Nome do contratante': 'nome',
  'Nacionalidade': 'nacionalidade',
  'Número do documento': 'rg',
  'Órgão expedidor': 'orgao_expedidor',
  'Número CPF': 'cpf',
  'Endereço completo': 'endereco',
  'Cidade e Estado': 'cidade_estado',
  'NOME': 'nome',
  'CPF': 'cpf',
  'RG': 'rg',
  'ENDEREÇO': 'endereco',
  'CIDADE': 'cidade',
  'ESTADO': 'estado',
};

export function buildFillValues(client, manualValues) {
  const cidadeEstado = [client.cidade, client.estado].filter(Boolean).join(', ');
  const enderecoCompleto = [client.endereco, client.cidade, client.estado].filter(Boolean).join(', ');

  const clientFields = {
    'NOME_CLIENTE':        client.nome || '',
    'Nome do contratante': client.nome || '',
    'NOME':                client.nome || '',
    'nome':                client.nome || '',
    'Nacionalidade':       client.nacionalidade || '',
    'nacionalidade':       client.nacionalidade || '',
    'Número do documento': client.rg || '',
    'RG':                  client.rg || '',
    'rg':                  client.rg || '',
    'Órgão expedidor':     client.orgao_expedidor || '',
    'orgao_expedidor':     client.orgao_expedidor || '',
    'ORGAO_EXPEDIDOR':     client.orgao_expedidor || '',
    'Número CPF':          client.cpf || '',
    'CPF':                 client.cpf || '',
    'cpf':                 client.cpf || '',
    'Endereço completo':   enderecoCompleto,
    'ENDEREÇO':            client.endereco || '',
    'endereco':            client.endereco || '',
    'Cidade e Estado':     cidadeEstado,
    'cidade_estado':       cidadeEstado,
    'CIDADE':              client.cidade || '',
    'cidade':              client.cidade || '',
    'ESTADO':              client.estado || '',
    'estado':              client.estado || '',
    'email':               client.email || '',
    'EMAIL':               client.email || '',
    'telefone':            client.telefone || '',
    'TELEFONE':            client.telefone || '',
    'data_atual':          new Date().toLocaleDateString('pt-BR'),
    'DATA_ATUAL':          new Date().toLocaleDateString('pt-BR'),
  };

  return { ...clientFields, ...manualValues };
}
