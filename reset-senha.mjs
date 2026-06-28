// Reset de senha — define uma nova senha para a Dra. Andreia
// Uso: NOVA_SENHA="suanovasenha" node reset-senha.mjs
import { getDB } from './db.js';
import bcrypt from 'bcryptjs';

const novaSenha = process.env.NOVA_SENHA;
const email = process.env.EMAIL_RESET || 'dra.andreia@advmachado.adv.br';

if (!novaSenha) {
  console.log('\n❌ Defina a nova senha:');
  console.log('   NOVA_SENHA="suaNovaSenha123" node reset-senha.mjs\n');
  process.exit(1);
}

if (novaSenha.length < 6) {
  console.log('\n⚠️  Use uma senha com pelo menos 6 caracteres.\n');
  process.exit(1);
}

const db = getDB();
const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email.toLowerCase().trim());

if (!user) {
  console.log(`\n❌ Usuário ${email} não encontrado.`);
  console.log('Usuários cadastrados:');
  db.prepare('SELECT email, name, active FROM users').all().forEach(u =>
    console.log(`   - ${u.email} (${u.name}) ${u.active ? '[ativo]' : '[inativo]'}`));
  process.exit(1);
}

// Gerar hash bcrypt (mesmo método do sistema: 12 rounds)
const hash = bcrypt.hashSync(novaSenha, 12);
db.prepare('UPDATE users SET password_hash = ?, active = 1 WHERE id = ?').run(hash, user.id);

// Verificar que funcionou
const check = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
const valido = bcrypt.compareSync(novaSenha, check.password_hash);

console.log(`\n✅ Senha redefinida para ${user.email} (${user.name})`);
console.log(`   Verificação: ${valido ? '✅ a nova senha funciona' : '❌ erro na verificação'}`);
console.log(`\n   Agora entre no Veredo com:`);
console.log(`   Email: ${user.email}`);
console.log(`   Senha: (a que você acabou de definir)\n`);
