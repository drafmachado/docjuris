// Diagnóstico de login: replica o fluxo do navegador
// 1. login → pega token  2. /auth/me com o token  3. /clients (1ª chamada do dashboard)
import { getDB } from './db.js';
import { signToken } from './middleware/auth.js';
import jwt from 'jsonwebtoken';

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}/api`;
const db = getDB();

console.log('\n=== DIAGNÓSTICO DE LOGIN ===\n');

// 1. Verificar JWT_SECRET
const secret = process.env.JWT_SECRET;
console.log(`JWT_SECRET configurado: ${secret ? 'SIM ('+secret.length+' chars)' : '❌ NÃO'}`);

// 2. Pegar admin e gerar token
const admin = db.prepare("SELECT * FROM users WHERE active=1 LIMIT 1").get();
console.log(`Usuário ativo: ${admin?.email || 'NENHUM'}`);
if (!admin) process.exit(1);

const token = signToken(admin);
console.log(`Token gerado: ${token.substring(0,30)}...`);

// 3. Verificar se o token é válido com o MESMO secret
try {
  const decoded = jwt.verify(token, secret);
  console.log(`✅ Token válido — decodifica para: ${decoded.email}, exp em ${new Date(decoded.exp*1000).toLocaleString('pt-BR')}`);
} catch(e) {
  console.log(`❌ Token NÃO valida com JWT_SECRET: ${e.message}`);
}

// 4. Simular /auth/me via HTTP (o que o navegador faz após login)
console.log('\n--- Testando /auth/me (chamada que decide se entra) ---');
const meResp = await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
console.log(`/auth/me → HTTP ${meResp.status}`);
if (meResp.status !== 200) {
  const txt = await meResp.text();
  console.log(`  ⚠️ ISSO causa o loop de login! Resposta: ${txt.substring(0,200)}`);
} else {
  const data = await meResp.json();
  console.log(`  ✅ OK: ${JSON.stringify(data).substring(0,150)}`);
}

// 5. Simular 1ª chamada do Dashboard (/clients)
console.log('\n--- Testando /clients (1ª chamada do Dashboard) ---');
const cliResp = await fetch(`${BASE}/clients`, { headers: { Authorization: `Bearer ${token}` } });
console.log(`/clients → HTTP ${cliResp.status}`);
if (cliResp.status === 401) console.log('  ⚠️ 401 aqui = interceptor joga de volta pro login!');

// 6. Testar login REAL com senha (precisa que você passe a senha via env)
const testPass = process.env.TEST_PASS;
if (testPass) {
  console.log('\n--- Testando login real com senha ---');
  const loginResp = await fetch(`${BASE}/auth/login`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email: admin.email, password: testPass })
  });
  console.log(`/auth/login → HTTP ${loginResp.status}`);
  if (loginResp.status === 200) {
    const { token: realToken } = await loginResp.json();
    const meReal = await fetch(`${BASE}/auth/me`, { headers:{Authorization:`Bearer ${realToken}`} });
    console.log(`  /auth/me com token real → HTTP ${meReal.status} ${meReal.status===200?'✅':'❌ AQUI ESTÁ O BUG'}`);
  } else {
    console.log(`  ❌ Senha incorreta ou erro no login`);
  }
} else {
  console.log('\n(Para testar senha real: TEST_PASS="suasenha" node diag-login.mjs)');
}

console.log('\n=== FIM ===\n');
