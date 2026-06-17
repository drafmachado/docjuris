// Diagnóstico do auto-sign: verifica documentos pendentes e testa signDocument
import { getDB } from './db.js';
import { getDocument } from './services/autentique.js';

const db = getDB();
const ANDREIA_EMAILS = ['fmachado.andreia@gmail.com','dra.andreia@advmachado.adv.br'];

const pendentes = db.prepare(`
  SELECT d.*, c.nome as cliente FROM documents d
  JOIN clients c ON c.id = d.client_id
  WHERE d.zapsign_doc_token IS NOT NULL
    AND (d.signed_pdf_filename IS NULL OR d.status != 'assinado')
  ORDER BY d.id DESC LIMIT 10
`).all();

console.log(`\n${pendentes.length} documento(s) pendente(s):\n`);

for (const doc of pendentes) {
  try {
    const autDoc = await getDocument(doc.zapsign_doc_token);
    const sigs = autDoc.signatures || [];
    const andreiaSig = sigs.find(s => ANDREIA_EMAILS.includes(s.email?.toLowerCase()));
    const clienteSigs = sigs.filter(s => !ANDREIA_EMAILS.includes(s.email?.toLowerCase()));
    const clienteAssinou = clienteSigs.length > 0 && clienteSigs.every(s => s.signed?.created_at);
    const andreiaAssinou = andreiaSig ? !!andreiaSig.signed?.created_at : false;
    const signedUrl = autDoc.files?.signed;

    console.log(`• ${doc.cliente} | ID ${doc.id} | Autentique: ${doc.zapsign_doc_token.substring(0,8)}...`);
    clienteSigs.forEach(s => console.log(`  Cliente ${s.email}: ${s.signed?.created_at ? '✅ assinou' : '⏳ pendente'}`));
    if (andreiaSig) console.log(`  Andreia (${andreiaSig.email}): ${andreiaAssinou ? '✅ assinou' : '⏳ pendente'}`);
    console.log(`  PDF assinado disponível: ${signedUrl ? 'SIM' : 'não'}`);
    console.log(`  → clienteAssinou: ${clienteAssinou}, andreiaAssinou: ${andreiaAssinou}`);

    if (clienteAssinou && !andreiaAssinou && andreiaSig) {
      console.log(`\n  🖊️  TENTANDO AUTO-ASSINAR agora...`);
      const mutation = `mutation { signDocument(id: "${doc.zapsign_doc_token}") }`;
      const resp = await fetch('https://api.autentique.com.br/v2/graphql', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${process.env.AUTENTIQUE_API_TOKEN}` },
        body: JSON.stringify({ query: mutation })
      });
      const data = await resp.json();
      console.log(`  Resposta: ${JSON.stringify(data)}`);
    }
    console.log('');
  } catch(e) {
    console.log(`  ERRO: ${e.message}\n`);
  }
}
