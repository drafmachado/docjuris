import { getDB } from './db.js';

const db = getDB();
const prazos = db.prepare(`
  SELECT p.titulo, p.tipo, p.data_limite, p.observacoes,
         c.nome as cliente, pr.numero_cnj
  FROM prazos p
  JOIN clients c ON c.id = p.client_id
  LEFT JOIN processos pr ON pr.id = p.processo_id
  WHERE p.observacoes LIKE 'Auto%'
  ORDER BY p.created_at DESC
`).all();

if (prazos.length === 0) {
  console.log('Nenhum prazo criado automaticamente ainda.');
} else {
  console.log(`${prazos.length} prazo(s) criado(s) automaticamente:\n`);
  prazos.forEach(x => {
    console.log(`Cliente : ${x.cliente}`);
    console.log(`Processo: ${x.numero_cnj || 'N/A'}`);
    console.log(`Prazo   : ${x.titulo} — ${x.data_limite}`);
    console.log(`Origem  : ${(x.observacoes || '').substring(0, 100)}`);
    console.log('---');
  });
}
