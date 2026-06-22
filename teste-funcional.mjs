// TESTE FUNCIONAL DE API — exercita os endpoints reais que os botões disparam
// Roda contra o servidor local (mesma máquina). Só leituras + 1 ciclo de escrita seguro.
const BASE = 'http://localhost:' + (process.env.PORT || 3000) + '/api';
const ADMIN_EMAIL = 'dra.andreia@advmachado.adv.br';
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || 'Machado@2024';

let token = null;
const log = (ok, nome, extra='') => console.log(`  ${ok ? '✅' : '❌'} ${nome}${extra ? ' — ' + extra : ''}`);
const results = { ok: 0, fail: 0 };
function check(cond, nome, extra='') { cond ? results.ok++ : results.fail++; log(cond, nome, extra); }

async function api(method, path, body=null, useAuth=true) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (useAuth && token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

console.log('\n' + '='.repeat(60));
console.log('TESTE FUNCIONAL DE API — VEREDO');
console.log('='.repeat(60) + '\n');

// ── AUTENTICAÇÃO ─────────────────────────────────────────────────────────────
console.log('🔐 AUTENTICAÇÃO');
const login = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS }, false);
check(login.status === 200 && login.data?.token, 'POST /auth/login', `status ${login.status}`);
token = login.data?.token;
if (!token) { console.log('\n❌ Login falhou — abortando. Verifique TEST_ADMIN_PASS.'); process.exit(1); }

const me = await api('GET', '/auth/me');
check(me.status === 200 && me.data?.email, 'GET /auth/me', me.data?.email || '');

// ── LEITURAS (cada GET = uma tela que abre) ──────────────────────────────────
console.log('\n📋 LISTAGENS (telas principais)');
const clients = await api('GET', '/clients');
check(clients.status === 200 && Array.isArray(clients.data), 'GET /clients (Clientes)', `${clients.data?.length || 0} registros`);

const processos = await api('GET', '/processos');
const procArr = processos.data?.processos || processos.data;
check(processos.status === 200, 'GET /processos (Processos)', `${Array.isArray(procArr) ? procArr.length : '?'} registros`);

const docs = await api('GET', '/documents');
check(docs.status === 200, 'GET /documents (Documentos)', `status ${docs.status}`);

const templates = await api('GET', '/templates');
check(templates.status === 200 && Array.isArray(templates.data), 'GET /templates (Templates)', `${templates.data?.length || 0} registros`);

const agenda = await api('GET', '/processos/agenda-prazos');
check(agenda.status === 200 && Array.isArray(agenda.data), 'GET /processos/agenda-prazos (Agenda)', `${agenda.data?.length || 0} prazos`);

const leads = await api('GET', '/leads');
check(leads.status === 200, 'GET /leads (CRM Leads)', `status ${leads.status}`);

const analytics = await api('GET', '/analytics');
check(analytics.status === 200 && analytics.data?.clientes, 'GET /analytics (Analytics)', `status ${analytics.status}`);

const comunicados = await api('GET', '/comunicados');
check(comunicados.status === 200, 'GET /comunicados (Comunicados)', `status ${comunicados.status}`);

const honorarios = await api('GET', '/honorarios');
check(honorarios.status === 200, 'GET /honorarios (Financeiro)', `status ${honorarios.status}`);

const exclusao = await api('GET', '/exclusao');
check(exclusao.status === 200, 'GET /exclusao (Solicitações)', `status ${exclusao.status}`);

const exclusaoCount = await api('GET', '/exclusao/count');
check(exclusaoCount.status === 200, 'GET /exclusao/count (badge)', `${exclusaoCount.data?.pendentes ?? '?'} pendentes`);

const users = await api('GET', '/users');
check(users.status === 200, 'GET /users (Usuários)', `status ${users.status}`);

const peticaoHist = await api('GET', '/peticao/historico');
check(peticaoHist.status === 200, 'GET /peticao/historico (Petição IA)', `status ${peticaoHist.status}`);

const uploadLinks = await api('GET', '/upload-links');
check(uploadLinks.status === 200, 'GET /upload-links', `status ${uploadLinks.status}`);

// ── DETALHES (abrir um registro) ─────────────────────────────────────────────
console.log('\n🔍 ABRIR DETALHES');
if (clients.data?.length > 0) {
  const cid = clients.data[0].id;
  const cdet = await api('GET', `/clients/${cid}`);
  check(cdet.status === 200 && cdet.data?.nome, `GET /clients/${cid} (pasta cliente)`, cdet.data?.nome);
  
  const petCliente = await api('GET', `/peticao/cliente/${cid}`);
  check(petCliente.status === 200, `GET /peticao/cliente/${cid}`, `status ${petCliente.status}`);
  
  const honCliente = await api('GET', `/honorarios?client_id=${cid}`);
  check(honCliente.status === 200, `GET /honorarios?client_id=${cid}`, `status ${honCliente.status}`);
}
if (Array.isArray(procArr) && procArr.length > 0) {
  const pid = procArr[0].id;
  const pdet = await api('GET', `/processos/${pid}`);
  check(pdet.status === 200, `GET /processos/${pid} (detalhe processo)`, `status ${pdet.status}`);
  const andamentos = await api('GET', `/processos/${pid}/andamentos`);
  check(andamentos.status === 200, `GET /processos/${pid}/andamentos`, `status ${andamentos.status}`);
}

// ── CICLO DE ESCRITA SEGURO (cria e apaga um lead de teste) ──────────────────
console.log('\n✏️  CICLO DE ESCRITA (criar + apagar lead de teste)');
const novoLead = await api('POST', '/leads', {
  nome: '__TESTE_REGRESSAO__', telefone: '11999999999',
  email: 'teste@teste.com', origem: 'site', etapa: 'contato'
});
check([200,201].includes(novoLead.status) && novoLead.data?.id, 'POST /leads (criar lead)', `status ${novoLead.status}`);
if (novoLead.data?.id) {
  const leadId = novoLead.data.id;
  const upd = await api('PUT', `/leads/${leadId}`, { etapa: 'consulta' });
  check([200,204].includes(upd.status), `PUT /leads/${leadId} (mover etapa)`, `status ${upd.status}`);
  const ativ = await api('POST', `/leads/${leadId}/atividades`, { tipo: 'nota', descricao: 'teste' });
  check([200,201].includes(ativ.status), `POST /leads/${leadId}/atividades`, `status ${ativ.status}`);
  const del = await api('DELETE', `/leads/${leadId}`);
  check([200,204].includes(del.status), `DELETE /leads/${leadId} (limpar teste)`, `status ${del.status}`);
}

console.log('\n' + '='.repeat(60));
console.log(`RESULTADO: ${results.ok} OK | ${results.fail} FALHAS`);
console.log('='.repeat(60) + '\n');
