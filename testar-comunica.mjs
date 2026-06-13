// Testa a API Comunica do CNJ (DJEN) — fonte oficial de intimações
const OAB = '218586';
const UF = 'RJ';

const urls = [
  `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${OAB}&ufOab=${UF}&pagina=1&itensPorPagina=5`,
  `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${OAB}&ufOab=${UF}`,
];

for (const url of urls) {
  console.log(`\n🔍 Testando: ${url.substring(0, 80)}...`);
  try {
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 DocJuris' }
    });
    console.log(`   Status: ${r.status}`);
    if (r.ok) {
      const data = await r.json();
      const items = data.items || data.content || data.data || [];
      console.log(`   Total retornado: ${data.count ?? data.total ?? items.length}`);
      if (items.length > 0) {
        const ex = items[0];
        console.log(`   Exemplo de campos:`, Object.keys(ex).join(', '));
        console.log(`   Processo: ${ex.numeroProcesso || ex.numero_processo || 'N/A'}`);
        console.log(`   Tipo: ${ex.tipoComunicacao || ex.tipo || 'N/A'}`);
        console.log(`   Data: ${ex.data_disponibilizacao || ex.dataDisponibilizacao || 'N/A'}`);
        const texto = ex.texto || ex.teor || '';
        console.log(`   Texto (200 chars): ${texto.substring(0, 200)}`);
      }
    } else {
      const t = await r.text();
      console.log(`   Resposta: ${t.substring(0, 300)}`);
    }
  } catch(e) {
    console.log(`   Erro: ${e.message}`);
  }
}
