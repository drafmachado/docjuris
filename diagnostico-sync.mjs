// Diagnostica os documentos pendentes e por que o download falha
import { getDB } from './db.js';
import { getDocument } from './services/autentique.js';
import axios from 'axios';

const db = getDB();
const pendentes = db.prepare(`
  SELECT d.*, c.nome as client_nome
  FROM documents d JOIN clients c ON c.id = d.client_id
  WHERE d.zapsign_doc_token IS NOT NULL
    AND (d.signed_pdf_filename IS NULL OR d.status != 'assinado')
`).all();

console.log(`${pendentes.length} documento(s) pendente(s):\n`);

for (const doc of pendentes) {
  try {
    const autDoc = await getDocument(doc.zapsign_doc_token);
    const sigs = autDoc?.signatures || [];
    const signers = sigs.filter(s => (s.action?.name||'').toUpperCase()==='SIGN');
    const assinaram = signers.filter(s => s.signed?.created_at).length;
    console.log(`• ${doc.client_nome}`);
    console.log(`  Signatários SIGN: ${assinaram}/${signers.length} assinaram`);
    signers.forEach(s => console.log(`    - ${s.email}: ${s.signed?.created_at ? '✅' : '⏳ pendente'}`));
    console.log(`  files.signed: ${autDoc?.files?.signed ? 'existe' : 'NÃO'}`);

    // Se todos assinaram, testar o download para ver o erro real
    if (signers.length > 0 && assinaram === signers.length && autDoc?.files?.signed) {
      try {
        const r = await axios.get(autDoc.files.signed, { responseType: 'arraybuffer', maxRedirects: 5 });
        console.log(`  Download: OK (${r.data.byteLength} bytes)`);
      } catch(e) {
        console.log(`  Download FALHOU: ${e.response?.status || e.message}`);
      }
    }
    console.log('');
  } catch(e) {
    console.log(`• ${doc.client_nome}: erro ${e.message}\n`);
  }
}
