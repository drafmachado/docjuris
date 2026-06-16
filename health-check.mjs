// Health check — verifica tabelas e conta registros de cada módulo
import { getDB } from './db.js';

const db = getDB();
console.log('\n========== VEREDO — HEALTH CHECK ==========\n');

const checks = [
  ['Clientes', 'clients'],
  ['Documentos', 'documents'],
  ['Templates', 'templates'],
  ['Usuários', 'users'],
  ['Links de upload', 'upload_links'],
  ['Processos', 'processos'],
  ['Andamentos', 'andamentos'],
  ['Prazos', 'prazos'],
  ['Comunicados', 'comunicados'],
  ['Leads (CRM)', 'leads'],
  ['Honorários', 'honorarios'],
  ['Solicitações exclusão', 'solicitacoes_exclusao'],
  ['Petições IA', 'peticoes'],
];

for (const [nome, tabela] of checks) {
  try {
    const r = db.prepare(`SELECT COUNT(*) as n FROM ${tabela}`).get();
    console.log(`  OK   ${nome.padEnd(24)} ${r.n} registro(s)`);
  } catch(e) {
    console.log(`  ERRO ${nome.padEnd(24)} ${e.message}`);
  }
}

// Variáveis críticas
console.log('\n========== VARIÁVEIS DE AMBIENTE ==========\n');
const vars = ['EVOLUTION_API_URL','EVOLUTION_API_KEY','ANDREIA_WHATSAPP','AUTENTIQUE_API_TOKEN','ANTHROPIC_API_KEY','RESEND_API_KEY','GMAIL_REFRESH_TOKEN','JWT_SECRET'];
for (const v of vars) {
  console.log(`  ${process.env[v] ? 'OK  ' : 'FALTA'} ${v}`);
}

console.log('\n===========================================\n');
