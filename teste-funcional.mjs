// TESTE FUNCIONAL DE API — gera token via signToken (sem precisar de senha)
import { getDB } from './db.js';
import { signToken } from './middleware/auth.js';

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}/api`;

// Gerar token do admin direto do banco
const db = getDB();
const admin = db.prepare("SELECT * FROM users WHERE role='admin' AND active=1 LIMIT 1").get()
           || db.prepare("SELECT * FROM users WHERE active=1 LIMIT 1").get();
if (!admin) { console.log('❌ Nenhum usuário ativo no banco'); process.exit(1); }
const token = signToken(admin);
console.log(`\nToken gerado para: ${admin.email} (${admin.role})\n`);

const results = { ok: 0, fail: 0, falhas: [] };
function check(cond, nome, extra='') {
  cond ? results.ok++ : (results.fail++, results.falhas.push(nome));
  console.log(`  ${cond ? '✅' : '❌'} ${nome}${extra ? ' — ' + extra : ''}`);
}
async function api(method, path, body=null) {
  const opts = { method, headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  let data=null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

console.log('='.repeat(60));
console.log('TESTE FUNCIONAL DE API — VEREDO');
console.log('='.repeat(60) + '\n');

console.log('📋 TELAS PRINCIPAIS (cada GET = uma tela abrindo)');
const telas = [
  ['GET','/clients','Clientes'],
  ['GET','/processos','Processos'],
  ['GET','/documents','Documentos'],
  ['GET','/templates','Templates'],
  ['GET','/processos/agenda-prazos','Agenda de Prazos'],
  ['GET','/leads','CRM Leads'],
  ['GET','/analytics','Analytics'],
  ['GET','/comunicados','Comunicados'],
  ['GET','/honorarios','Financeiro'],
  ['GET','/exclusao','Solicitações exclusão'],
  ['GET','/exclusao/count','Badge exclusão'],
  ['GET','/users','Usuários'],
  ['GET','/peticao/historico','Petição IA'],
  ['GET','/upload-links','Links de upload'],
];
for (const [m,p,nome] of telas) {
  const r = await api(m,p);
  const n = Array.isArray(r.data) ? r.data.length : (r.data?.processos?.length ?? (typeof r.data==='object'?'ok':''));
  check(r.status===200, `${nome}`, `HTTP ${r.status}${n!==''?', '+n+' itens':''}`);
}

console.log('\n🔍 ABRIR DETALHES');
const clients = await api('GET','/clients');
if (clients.data?.length) {
  const cid = clients.data[0].id;
  check((await api('GET',`/clients/${cid}`)).status===200, 'Abrir pasta de cliente');
  check((await api('GET',`/peticao/cliente/${cid}`)).status===200, 'Petições do cliente');
  check((await api('GET',`/honorarios?client_id=${cid}`)).status===200, 'Honorários do cliente');
}
const proc = await api('GET','/processos');
const parr = proc.data?.processos || proc.data;
if (Array.isArray(parr) && parr.length) {
  const pid = parr[0].id;
  check((await api('GET',`/processos/${pid}`)).status===200, 'Abrir detalhe de processo');
  check((await api('GET',`/processos/${pid}/andamentos`)).status===200, 'Andamentos do processo');
}

console.log('\n✏️  CICLO DE ESCRITA (criar+editar+apagar lead de teste)');
const novo = await api('POST','/leads',{nome:'__TESTE__',telefone:'11999999999',email:'t@t.com',origem:'site',etapa:'contato'});
check([200,201].includes(novo.status) && novo.data?.id, 'Criar lead', `HTTP ${novo.status}`);
if (novo.data?.id) {
  const id = novo.data.id;
  check([200,204].includes((await api('PUT',`/leads/${id}`,{etapa:'consulta'})).status), 'Mover etapa do lead');
  check([200,201].includes((await api('POST',`/leads/${id}/atividades`,{tipo:'nota',descricao:'x'})).status), 'Adicionar atividade');
  check([200,204].includes((await api('DELETE',`/leads/${id}`)).status), 'Apagar lead de teste');
}

console.log('\n' + '='.repeat(60));
console.log(`RESULTADO: ${results.ok} OK | ${results.fail} FALHAS`);
if (results.falhas.length) console.log('Falhas: ' + results.falhas.join(', '));
console.log('='.repeat(60) + '\n');
