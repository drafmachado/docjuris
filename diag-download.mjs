// Diagnóstico: mostra a URL exata do files.signed e testa download
import { getDB } from './db.js';
import { getDocument, downloadSignedPdf } from './services/autentique.js';
import path from 'path';
import fs from 'fs';

const db = getDB();
const storageDir = process.env.NODE_ENV === 'production' ? '/app/storage' : path.join(process.cwd(), '../storage');
const pdfsDir = path.join(storageDir, 'pdfs');
if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });

// Pegar só o primeiro pendente para diagnóstico detalhado
const doc = db.prepare(`
  SELECT d.*, c.nome as client_nome FROM documents d
  JOIN clients c ON c.id = d.client_id
  WHERE d.zapsign_doc_token IS NOT NULL
    AND (d.signed_pdf_filename IS NULL OR d.status != 'assinado')
  ORDER BY d.id DESC LIMIT 1
`).get();

if (!doc) { console.log('Nenhum pendente'); process.exit(0); }

console.log(`\nDiagnóstico ID ${doc.id} (${doc.client_nome})`);
console.log(`Token Autentique: ${doc.zapsign_doc_token}\n`);

const autDoc = await getDocument(doc.zapsign_doc_token);
console.log('files:', JSON.stringify(autDoc.files, null, 2));
console.log('\nAssinaturas:');
(autDoc.signatures||[]).forEach(s => {
  console.log(`  ${s.email}: action=${s.action?.name}, signed=${s.signed?.created_at || 'null'}`);
});

const signedUrl = autDoc?.files?.signed;
console.log(`\nURL signed: ${signedUrl}`);

if (signedUrl) {
  // Se for URL relativa, montar URL completa
  const fullUrl = signedUrl.startsWith('http') ? signedUrl : `https://api.autentique.com.br${signedUrl}`;
  console.log(`URL completa: ${fullUrl}\n`);
  console.log('Testando download com retry...');
  try {
    const pdfFilename = `doc_${doc.id}_assinado.pdf`;
    await downloadSignedPdf(fullUrl, path.join(pdfsDir, pdfFilename));
    db.prepare(`UPDATE documents SET signed_pdf_filename=?, status='assinado', signed_at=datetime('now') WHERE id=?`)
      .run(pdfFilename, doc.id);
    console.log(`✅ SUCESSO! Baixado: ${pdfFilename}`);
  } catch(e) {
    console.log(`❌ Falhou: status=${e.response?.status}, msg=${e.message}`);
  }
}
