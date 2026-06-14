// Recupera o PDF assinado do Andre Pitzer que já foi assinado mas não chegou ao Veredo
import { getDB } from './db.js';
import { getDocument, downloadSignedPdf } from './services/autentique.js';
import path from 'path';
import fs from 'fs';

const ANDRE_DOC_ID = 'ea259891ea672396b4d5a8c5cc890894215892c1689229d68';

const db = getDB();

// Buscar o documento no banco pelo autentique id
let docRecord = db.prepare('SELECT * FROM documents WHERE zapsign_doc_token = ?').get(ANDRE_DOC_ID);

if (!docRecord) {
  console.log('⚠️  Documento não encontrado no banco pelo ID Autentique. Buscando por cliente...');
  docRecord = db.prepare(`
    SELECT d.* FROM documents d JOIN clients c ON c.id = d.client_id
    WHERE c.nome LIKE '%PITZER%' ORDER BY d.id DESC LIMIT 1
  `).get();
  if (docRecord) {
    db.prepare('UPDATE documents SET zapsign_doc_token = ? WHERE id = ?').run(ANDRE_DOC_ID, docRecord.id);
    console.log(`✅ Vinculado doc DB id=${docRecord.id} ao Autentique`);
  }
}

if (!docRecord) { console.log('❌ Documento do Andre não existe no banco.'); process.exit(0); }

// Buscar URL do PDF assinado no Autentique
const autDoc = await getDocument(ANDRE_DOC_ID);
const signedUrl = autDoc?.files?.signed;
console.log('URL PDF assinado:', signedUrl ? 'encontrada' : 'NÃO encontrada');

if (signedUrl) {
  const storageDir = process.env.NODE_ENV === 'production' ? '/app/storage' : path.join(process.cwd(), '../storage');
  const pdfsDir = path.join(storageDir, 'pdfs');
  if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });
  const pdfFilename = `andre_pitzer_procuracao_assinado.pdf`;
  const pdfPath = path.join(pdfsDir, pdfFilename);
  await downloadSignedPdf(signedUrl, pdfPath);
  db.prepare(`UPDATE documents SET signed_pdf_filename = ?, status = 'assinado', signed_at = datetime('now') WHERE id = ?`)
    .run(pdfFilename, docRecord.id);
  console.log(`✅ PDF assinado salvo: ${pdfFilename}`);
  console.log('   Agora aparece no Veredo na pasta do cliente Andre Pitzer.');
}
