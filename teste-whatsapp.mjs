// Testa envio WhatsApp via Evolution API e mostra resposta exata
const url = process.env.EVOLUTION_API_URL;
const key = process.env.EVOLUTION_API_KEY;
const instance = process.env.EVOLUTION_INSTANCE || 'docjuris';
const andreia = process.env.ANDREIA_WHATSAPP || '5511967351199';

console.log('=== Variáveis de ambiente ===');
console.log('EVOLUTION_API_URL:', url || '❌ VAZIO');
console.log('EVOLUTION_API_KEY:', key ? `✅ definida (${key.length} chars)` : '❌ VAZIO');
console.log('EVOLUTION_INSTANCE:', instance);
console.log('ANDREIA_WHATSAPP:', andreia);
console.log('');

if (!url || !key) { console.log('❌ Variáveis faltando — não dá para testar'); process.exit(1); }

const base = url.replace(/\/+$/, '').startsWith('http') ? url.replace(/\/+$/, '') : 'https://' + url.replace(/\/+$/, '');
const endpoint = `${base}/message/sendText/${instance}`;
console.log('Endpoint:', endpoint);
console.log('');

// 1. Verificar status da instância
console.log('=== 1. Status da instância ===');
try {
  const r = await fetch(`${base}/instance/connectionState/${instance}`, {
    headers: { apikey: key }
  });
  const data = await r.json();
  console.log('Status:', JSON.stringify(data));
} catch(e) { console.log('Erro ao verificar status:', e.message); }
console.log('');

// 2. Tentar enviar mensagem de teste
console.log('=== 2. Enviando mensagem de teste ===');
try {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: andreia, text: '🔔 Teste de notificação Veredo — ' + new Date().toLocaleString('pt-BR') }),
  });
  console.log('HTTP status:', r.status);
  const data = await r.text();
  console.log('Resposta:', data.substring(0, 500));
} catch(e) { console.log('Erro ao enviar:', e.message); }
