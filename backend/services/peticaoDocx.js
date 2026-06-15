import {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, PageNumber, NumberFormat, HeadingLevel,
  BorderStyle, PageOrientation,
} from 'docx';

// A4 em DXA (1 DXA = 1/1440 inch)
const A4_W = 11906;
const A4_H = 16838;
// Margens (3cm top/bottom, 3cm left, 2cm right — padrão ABNT jurídico)
const M_TOP    = 1701;
const M_BOTTOM = 1701;
const M_LEFT   = 1701;
const M_RIGHT  = 1134;

function textRun(text, opts = {}) {
  return new TextRun({ text, font: 'Times New Roman', size: 24, ...opts });
}

function isPendente(text) {
  return text.includes('[JURISPRUDÊNCIA PENDENTE');
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

  // Negrito inline (**texto**)
  const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
  const runs = parts.map(p => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return textRun(p.replace(/\*\*/g, ''), { bold: true });
    }
    // Marcar [JURISPRUDÊNCIA PENDENTE] em vermelho
    if (isPendente(p)) {
      return textRun(p, { color: 'CC0000', bold: true });
    }
    return textRun(p);
  });

  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 0, after: 200, line: 360, lineRule: 'auto' }, // 1.5 espaçamento
    indent: { firstLine: 708 }, // 1.25cm primeira linha
    children: runs,
  });
}

export async function gerarPeticaoDocx(peticao, cliente) {
  const linhas = (peticao.conteudo || '').split('\n');
  const paragrafos = linhas
    .map(parseParagraph)
    .filter(Boolean);

  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '0d2340', space: 4 } },
        spacing: { after: 100 },
        children: [
          textRun('Dra. Andreia Machado — Advogada', { bold: true, size: 20, color: '0d2340' }),
          textRun('   |   OAB/RJ 218.586   |   OAB/SP 532.488', { size: 18, color: '555555' }),
        ],
      }),
    ],
  });

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
