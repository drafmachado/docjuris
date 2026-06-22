// Estado REAL de cada documento pendente: quem assinou, quem falta
import { getDB } from './db.js';
import { getDocument } from './services/autentique.js';

const db = getDB();
const docs = db.prepare(`
  SELECT d.id, d.zapsign_doc_token, d.created_at, c.nome as cliente
  FROM documents d JOIN clients c ON c.id = d.client_id
  WHERE d.zapsign_doc_token IS NOT NULL
    AND (d.signed_pdf_filename IS NULL OR d.status != 'assinado')
  ORDER BY d.id DESC
`).all();

console.log(`\n${docs.length} documento(s) — estado real das assinaturas:\n`);

let prontos = 0, aguardando = 0, naoEncontrados = 0;

for (const doc of docs) {
  try {
    const autDoc = await getDocument(doc.zapsign_doc_token);
    const sigs = autDoc.signatures || [];
    const total = sigs.filter(s => s.action?.name === 'SIGN').length;
    const assinados = sigs.filter(s => s.action?.name === 'SIGN' && s.signed?.created_at).length;
    const todosAssinaram = total > 0 && assinados === total;

    console.log(`ID ${doc.id} | ${doc.cliente} | criado ${doc.created_at?.substring(0,10)}`);
    sigs.forEach(s => {
      const status = s.signed?.created_at ? '✅ assinou' : '⏳ falta';
      const acao = s.action?.name || 'sem ação';
      console.log(`    ${s.email} [${acao}]: ${status}`);
    });
    console.log(`    → ${assinados}/${total} assinaturas SIGN completas\n`);

    if (todosAssinaram) prontos++;
    else aguardando++;
  } catch(e) {
    naoEncontrados++;
    console.log(`ID ${doc.id} | ${doc.cliente}: ❌ ${e.message}\n`);
  }
}

console.log('─'.repeat(50));
console.log(`✅ Prontos p/ download (todos assinaram): ${prontos}`);
console.log(`⏳ Aguardando assinatura:                 ${aguardando}`);
console.log(`❌ Não encontrados no Autentique:         ${naoEncontrados}`);
console.log('─'.repeat(50));
