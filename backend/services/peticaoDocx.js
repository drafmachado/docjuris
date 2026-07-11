import {
  Document, Packer, Paragraph, TextRun, Header, Footer, ExternalHyperlink,
  AlignmentType, PageNumber, NumberFormat, BorderStyle,
  PageOrientation, ImageRun, WidthType,
} from 'docx';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// A4 em DXA (1 DXA = 1/1440 inch)
const A4_W = 11906;
const A4_H = 16838;
// Margens ABNT jurídico: 3cm top/left, 2cm right/bottom
const M_TOP    = 1701;
const M_BOTTOM = 1134;
const M_LEFT   = 1701;
const M_RIGHT  = 1134;

// Caminho da logo (relativo ao serviço, na raiz do projeto)
const __dirname_service = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname_service, '../assets/logo_peticao.png'); // mesma logo dos templates

function textRun(text, opts = {}) {
  return new TextRun({ text, font: 'Times New Roman', size: 24, ...opts });
}

function isPendente(text) {
  return /\[[^\]]*PENDENTE[^\]]*\]/i.test(text);
}

function parseParagraph(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Linha de divider (--- ou ═══)
  if (/^[-═]{3,}$/.test(trimmed)) {
    return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA', space: 1 } },
      spacing: { before: 120, after: 120 },
      children: [],
    });
  }

  // Aviso de verificação (⚠️)
  if (trimmed.startsWith('⚠️')) {
    return new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 200, after: 120 },
      border: {
        top:    { style: BorderStyle.SINGLE, size: 4, color: 'CC8800', space: 4 },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CC8800', space: 4 },
        left:   { style: BorderStyle.SINGLE, size: 4, color: 'CC8800', space: 4 },
        right:  { style: BorderStyle.SINGLE, size: 4, color: 'CC8800', space: 4 },
      },
      children: [textRun(trimmed, { bold: true, color: 'CC8800', size: 20 })],
    });
  }

  // Cabeçalho centrado (linha toda maiúscula >= 4 palavras OU entre ** **)
  const isCenteredHeader = (
    (trimmed === trimmed.toUpperCase() && trimmed.length > 10 && /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(trimmed)) ||
    (trimmed.startsWith('**') && trimmed.endsWith('**'))
  );
  if (isCenteredHeader) {
    const t = trimmed.replace(/\*\*/g, '');
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [textRun(t, { bold: true })],
    });
  }

  // Quebrar linha em segmentos: **negrito**, [PENDENTE...], [Verificar: URL], texto normal
  // Regex captura cada tipo de segmento
  const segmentRegex = /(\*\*[^*]+\*\*|\[[^\]]*PENDENTE[^\]]*\]|\[Verificar:\s*https?:\/\/[^\]]+\])/g;
  const parts = trimmed.split(segmentRegex);

  const runs = [];
  for (const p of parts) {
    if (!p) continue;

    // Negrito
    if (p.startsWith('**') && p.endsWith('**')) {
      runs.push(textRun(p.replace(/\*\*/g, ''), { bold: true }));
      continue;
    }

    // Qualquer [___PENDENTE___] — vermelho bold para chamar atenção
    if (/^\[[^\]]*PENDENTE[^\]]*\]$/i.test(p)) {
      runs.push(textRun(p, { color: 'CC0000', bold: true, size: 22 }));
      continue;
    }

    // [Verificar: URL] — link clicável em azul
    const verMatch = p.match(/^\[Verificar:\s*(https?:\/\/[^\]]+)\]$/);
    if (verMatch) {
      const url = verMatch[1].trim();
      runs.push(
        new ExternalHyperlink({
          link: url,
          children: [
            new TextRun({
              text: '[Verificar decisão ↗]',
              font: 'Times New Roman',
              size: 20,
              color: '0563C1',
              underline: { type: 'single', color: '0563C1' },
            }),
          ],
        })
      );
      continue;
    }

    // Texto normal
    runs.push(textRun(p));
  }

  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 0, after: 200, line: 360, lineRule: 'auto' },
    indent: { firstLine: 708 },
    children: runs,
  });
}

export async function gerarPeticaoDocx(peticao, cliente) {
  const linhas = (peticao.conteudo || '').split('\n');
  const paragrafos = linhas
    .map(parseParagraph)
    .filter(Boolean);

  // ─── Cabeçalho com Logo ───────────────────────────────────────────────────
  const headerChildren = [];

  // Tentar carregar a logo
  let logoBuffer = null;
  if (existsSync(LOGO_PATH)) {
    try { logoBuffer = readFileSync(LOGO_PATH); } catch(e) { /* sem logo */ }
  }

  if (logoBuffer) {
    // Parágrafo com logo centralizada
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: {
              width: 210,  // proporção original 365x84
              height: 48,
            },
            type: 'png',
          }),
        ],
      })
    );
  }

  // Linha de texto com OABs (sempre presente)
  headerChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '0d2340', space: 4 } },
      spacing: { before: 0, after: 100 },
      children: [
        textRun('Dra. Andreia Machado', { bold: true, size: 18, color: '0d2340' }),
        textRun('   —   OAB/RJ 218.586   |   OAB/SP 532.488', { size: 16, color: '555555' }),
        textRun('   |   dra.andreia@advmachado.adv.br', { size: 16, color: '888888' }),
      ],
    })
  );

  const header = new Header({ children: headerChildren });

  // ─── Rodapé ───────────────────────────────────────────────────────────────
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          textRun('Página ', { size: 18, color: '888888' }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 18, color: '888888' }),
          textRun(' de ', { size: 18, color: '888888' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Times New Roman', size: 18, color: '888888' }),
        ],
      }),
    ],
  });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Times New Roman', size: 24 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: A4_W, height: A4_H, orientation: PageOrientation.PORTRAIT },
          margin: { top: M_TOP, bottom: M_BOTTOM, left: M_LEFT, right: M_RIGHT, header: 400, footer: 400 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children: paragrafos,
    }],
  });

  return Packer.toBuffer(doc);
}


