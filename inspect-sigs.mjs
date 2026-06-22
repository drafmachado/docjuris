import { getDB } from './db.js';

const ATOKEN = process.env.AUTENTIQUE_API_TOKEN;
const db = getDB();

// Pegar um documento recente para inspecionar
const doc = db.prepare(`
  SELECT d.zapsign_doc_token, c.nome FROM documents d
  JOIN clients c ON c.id = d.client_id
  WHERE d.zapsign_doc_token IS NOT NULL
  ORDER BY d.id DESC LIMIT 1
`).get();

if (!doc) { console.log('Nenhum doc'); process.exit(0); }

// Query completa com todos os campos de evento de assinatura
const query = `query {
  document(id: "${doc.zapsign_doc_token}") {
    id name
    signatures {
      public_id name email
      action { name }
      viewed { created_at }
      signed { created_at }
      rejected { created_at }
      user { id name email }
    }
    files { original signed pades }
  }
}`;

const resp = await fetch('https://api.autentique.com.br/v2/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ATOKEN}` },
  body: JSON.stringify({ query })
});
const data = await resp.json();
console.log(`\nDocumento: ${doc.nome}`);
console.log(JSON.stringify(data.data?.document?.signatures, null, 2));
console.log('\nfiles:', JSON.stringify(data.data?.document?.files));
