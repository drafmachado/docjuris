// Descobre qual conta é dona do token da API do Autentique
const ATOKEN = process.env.AUTENTIQUE_API_TOKEN;
if (!ATOKEN) { console.log('❌ AUTENTIQUE_API_TOKEN não configurado'); process.exit(1); }

const query = `query { me { id name email } }`;
const resp = await fetch('https://api.autentique.com.br/v2/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ATOKEN}` },
  body: JSON.stringify({ query })
});
const data = await resp.json();
console.log('\n=== DONO DO TOKEN AUTENTIQUE ===');
console.log(JSON.stringify(data, null, 2));
console.log('\nEmails configurados no buildSigners:');
console.log('  Dra. Andreia (signatária): dra.andreia@advmachado.adv.br');
console.log('  Monitoramento Gmail:       fmachado.andreia@gmail.com');
