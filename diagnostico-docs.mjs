import { getDB } from './db.js';
const db = getDB();

// Ver todos os documentos e seu status
const docs = db.prepare(`
  SELECT d.id, d.status, d.zapsign_doc_token, d.signed_pdf_filename,
         d.created_at, c.nome as cliente, t.name as template
  FROM documents d
  JOIN clients c ON c.id = d.client_id
  LEFT JOIN templates t ON t.id = d.template_id
  ORDER BY d.id DESC LIMIT 10
`).all();

console.log('\n=== Últimos 10 documentos ===\n');
docs.forEach(d => {
  console.log(`ID ${d.id}: ${d.cliente} | ${d.template}`);
  console.log(`  status: ${d.status}`);
  console.log(`  autentique_id: ${d.zapsign_doc_token || 'NÃO SALVO'}`);
  console.log(`  signed_pdf: ${d.signed_pdf_filename || 'nenhum'}`);
  console.log(`  criado: ${d.created_at}`);
  console.log('');
});
