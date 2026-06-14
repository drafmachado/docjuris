// Verifica documentos recentes no Autentique e status de assinatura
const TOKEN = process.env.AUTENTIQUE_API_TOKEN;
if (!TOKEN) { console.log('❌ AUTENTIQUE_API_TOKEN não configurado'); process.exit(0); }

const query = `
query {
  documents(limit: 10, page: 1) {
    data {
      id
      name
      created_at
      signatures {
        name email
        action { name }
        signed { created_at }
        link { short_link }
      }
      files { signed original }
    }
  }
}`;

const r = await fetch('https://api.autentique.com.br/v2/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ query })
});
const data = await r.json();
if (data.errors) { console.log('Erro:', JSON.stringify(data.errors)); process.exit(0); }

const docs = data.data?.documents?.data || [];
console.log(`📄 ${docs.length} documentos no Autentique:\n`);
for (const d of docs) {
  console.log(`• ${d.name} (id: ${d.id})`);
  console.log(`  Criado: ${d.created_at}`);
  for (const s of d.signatures || []) {
    const assinou = s.signed?.created_at ? `✅ assinou ${s.signed.created_at}` : '⏳ pendente';
    console.log(`    - ${s.name || s.email} [${s.action?.name}] ${assinou}`);
  }
  console.log(`  PDF assinado disponível: ${d.files?.signed ? 'SIM' : 'não'}`);
  console.log('');
}
