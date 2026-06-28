// ╔══════════════════════════════════════════════════════════════╗
// ║  TESTE DE REGRESSÃO FUNCIONAL COMPLETO — VEREDO               ║
// ║  Exercita cada endpoint que os botões disparam.              ║
// ║  Cria registros de teste e os APAGA ao final (sem lixo).     ║
// ╚══════════════════════════════════════════════════════════════╝
import { getDB } from './db.js';
import { signToken } from './middleware/auth.js';

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}/api`;
const db = getDB();

const admin = db.prepare("SELECT * FROM users WHERE role='admin' AND active=1 LIMIT 1").get()
           || db.prepare("SELECT * FROM users WHERE active=1 LIMIT 1").get();
if (!admin) { console.log('❌ Sem usuário ativo'); process.exit(1); }
const token = signToken(admin);

const R = { ok:0, fail:0, falhas:[] };
function check(cond, nome, extra='') {
  cond ? R.ok++ : (R.fail++, R.falhas.push(nome));
  console.log(`  ${cond?'✅':'❌'} ${nome}${extra?' — '+extra:''}`);
}
async function api(method, path, body=null) {
  const opts = { method, headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`} };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE+path, opts);
  let data=null; try{data=await r.json();}catch{}
  return { status:r.status, data };
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

console.log('\n'+'='.repeat(64));
console.log(`TESTE DE REGRESSÃO FUNCIONAL — ${admin.email}`);
console.log('='.repeat(64));

// ── 1. TELAS (cada GET = uma tela abrindo) ───────────────────────────────────
console.log('\n📋 TELAS PRINCIPAIS');
const telas = [
  ['/clients','Clientes'], ['/processos','Processos'], ['/documents','Documentos'],
  ['/templates','Templates'], ['/processos/agenda-prazos','Agenda Prazos'],
  ['/leads','CRM Leads'], ['/analytics','Analytics'], ['/comunicados','Comunicados'],
  ['/honorarios','Financeiro'], ['/exclusao','Exclusões'], ['/exclusao/count','Badge exclusão'],
  ['/users','Usuários'], ['/peticao/historico','Petição IA'], ['/upload-links','Upload Links'],
];
for (const [p,nome] of telas) {
  const r = await api('GET',p);
  const n = Array.isArray(r.data)?r.data.length:(r.data?.processos?.length ?? '');
  check(r.status===200, nome, `HTTP ${r.status}${n!==''?', '+n+' itens':''}`);
}

// ── 2. ABRIR DETALHES ────────────────────────────────────────────────────────
console.log('\n🔍 ABRIR REGISTROS');
const clients = await api('GET','/clients');
let cid = clients.data?.[0]?.id;
if (cid) {
  check((await api('GET',`/clients/${cid}`)).status===200, 'Abrir pasta cliente');
  check((await api('GET',`/peticao/cliente/${cid}`)).status===200, 'Petições do cliente');
  check((await api('GET',`/honorarios?client_id=${cid}`)).status===200, 'Honorários do cliente');
}
const proc = await api('GET','/processos');
const parr = proc.data?.processos || proc.data;
let pid = Array.isArray(parr)?parr[0]?.id:null;
if (pid) {
  check((await api('GET',`/processos/${pid}`)).status===200, 'Abrir processo');
  check((await api('GET',`/processos/${pid}/andamentos`)).status===200, 'Andamentos');
}
const templates = await api('GET','/templates');
let tid = templates.data?.[0]?.id;
if (tid) check((await api('GET',`/templates/${tid}`)).status===200, 'Abrir template');

// ── 3. CRM LEADS — ciclo completo ────────────────────────────────────────────
console.log('\n👥 CRM LEADS (criar→editar→atividade→excluir)');
const novoLead = await api('POST','/leads',{nome:'__TESTE_REG__',telefone:'11988887777',email:'teste@reg.com',origem:'site',etapa:'contato'});
check([200,201].includes(novoLead.status)&&novoLead.data?.id,'Criar lead',`HTTP ${novoLead.status}`);
const leadId = novoLead.data?.id;
if (leadId) {
  check([200,204].includes((await api('PUT',`/leads/${leadId}`,{etapa:'consulta'})).status),'Mover etapa');
  check([200,201].includes((await api('POST',`/leads/${leadId}/atividades`,{tipo:'nota',descricao:'teste'})).status),'Add atividade');
  check([200,204].includes((await api('DELETE',`/leads/${leadId}`)).status),'Excluir lead');
}

// ── 4. HONORÁRIOS — ciclo completo ───────────────────────────────────────────
console.log('\n💰 HONORÁRIOS (criar→status→excluir)');
if (cid) {
  const novoHon = await api('POST','/honorarios',{client_id:cid,descricao:'__TESTE_REG__',valor_total:1000,num_parcelas:2});
  check([200,201].includes(novoHon.status)&&novoHon.data?.id,'Criar honorário',`HTTP ${novoHon.status}`);
  const honId = novoHon.data?.id;
  if (honId) {
    check([200,204].includes((await api('PUT',`/honorarios/${honId}/status`,{status:'pago'})).status),'Marcar pago');
    check([200,204].includes((await api('DELETE',`/honorarios/${honId}`)).status),'Excluir honorário');
  }
}

// ── 5. EXCLUSÃO — ciclo completo (criar solicitação → rejeitar) ──────────────
console.log('\n🗑️  SOLICITAÇÃO EXCLUSÃO (criar→rejeitar)');
if (cid) {
  const novaExc = await api('POST','/exclusao',{tipo:'cliente',referencia_id:cid,motivo:'__TESTE_REG__'});
  check([200,201].includes(novaExc.status),'Criar solicitação',`HTTP ${novaExc.status}`);
  // pegar a solicitação criada e rejeitar (NÃO aprovar, p/ não apagar cliente real!)
  const lista = await api('GET','/exclusao');
  const minha = (lista.data||[]).find(s=>s.motivo==='__TESTE_REG__');
  if (minha) {
    check([200,204].includes((await api('PUT',`/exclusao/${minha.id}/rejeitar`)).status),'Rejeitar solicitação (limpeza)');
  } else {
    check(false,'Localizar solicitação criada','não encontrada');
  }
}

// ── 6. AUTO-SIGN — verificar dono do token e config ──────────────────────────
console.log('\n🖊️  AUTO-SIGN (configuração)');
const ATOKEN = process.env.AUTENTIQUE_API_TOKEN;
if (ATOKEN) {
  const me = await fetch('https://api.autentique.com.br/v2/graphql',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ATOKEN}`},
    body:JSON.stringify({query:'query { me { email } }'})
  }).then(r=>r.json()).catch(()=>null);
  const dono = me?.data?.me?.email;
  const signerEnv = process.env.AUTENTIQUE_SIGNER_EMAIL || 'fmachado.andreia@gmail.com';
  check(!!dono, 'Token Autentique válido', dono||'sem resposta');
  check(dono===signerEnv, 'Email signatário == dono do token', `${signerEnv} vs ${dono}`);
} else {
  check(false,'AUTENTIQUE_API_TOKEN configurado','ausente');
}

console.log('\n'+'='.repeat(64));
console.log(`RESULTADO FINAL: ${R.ok} OK | ${R.fail} FALHAS`);
if (R.falhas.length) console.log('Falhas: '+R.falhas.join(', '));
console.log('='.repeat(64)+'\n');
