// Força download de todos os documentos com PDF assinado disponível no Autentique
import { getDB } from './db.js';
import { getDocument, downloadSignedPdf } from './services/autentique.js';
import { notifyDocumentoAssinado } from './services/evolution.js';
import path from 'path';
import fs from 'fs';

const db = getDB();
const storageDir = process.env.NODE_ENV === 'production' ? '/app/storage' : path.join(process.cwd(), '../storage');
const pdfsDir = path.join(storageDir, 'pdfs');
if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });

const pendentes = db.prepare(`
  SELECT d.*, c.nome as client_nome, c.telefone as client_telefone, t.name as template_name
  FROM documents d
  JOIN clients c ON c.id = d.client_id
  LEFT JOIN templates t ON t.id = d.template_id
  WHERE d.zapsign_doc_token IS NOT NULL
    AND (d.signed_pdf_filename IS NULL OR d.status != 'assinado')
`).all();

console.log(`\n📦 ${pendentes.length} documento(s) para verificar\n`);
let baixados = 0, pulados = 0, erros = 0;

for (const doc of pendentes) {
  try {
    const autDoc = await getDocument(doc.zapsign_doc_token);
    const signedUrl = autDoc?.files?.signed;

    if (!signedUrl) { pulados++; continue; }

    const pdfFilename = doc.docx_filename
      ? doc.docx_filename.replace(/\.docx$/, '_assinado.pdf')
      : `doc_${doc.id}_assinado.pdf`;
    const pdfPath = path.join(pdfsDir, pdfFilename);

    await downloadSignedPdf(signedUrl, pdfPath);
    db.prepare(`UPDATE documents SET signed_pdf_filename=?, status='assinado', signed_at=datetime('now') WHERE id=?`)
      .run(pdfFilename, doc.id);

    baixados++;
    console.log(`  ✅ ${doc.client_nome} | ${doc.template_name || 'doc'} (ID ${doc.id}) → ${pdfFilename}`);

    notifyDocumentoAssinado({
      clienteNome: doc.client_nome,
      clienteTelefone: doc.client_telefone,
      templateNome: doc.template_name,
    }).catch(()=>{});

    await new Promise(r => setTimeout(r, 600));
  } catch(e) {
    erros++;
    console.log(`  ❌ ID ${doc.id} (${doc.client_nome}): ${e.message}`);
  }
}

console.log(`\n✅ Baixados: ${baixados} | ⏳ Sem PDF ainda: ${pulados} | ❌ Erros: ${erros}\n`);
