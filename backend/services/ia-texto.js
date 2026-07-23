// backend/services/ia-texto.js
// Camada de IA para tarefas de CLASSIFICAÇÃO (CRM, triagem de conversas).
// Ordem: Anthropic → Groq (gratuito) → Gemini (gratuito).
// Se a Anthropic ficar sem crédito, a automação continua funcionando pelos gratuitos.
// Peças jurídicas (Petição IA) NÃO usam este módulo — continuam na Anthropic por qualidade.

const MODELO_ANTHROPIC = 'claude-sonnet-4-6';
const MODELO_GROQ = 'llama-3.3-70b-versatile';
const MODELO_GEMINI = 'gemini-2.0-flash';

let avisoCredito = false;

function extrairJSON(texto) {
  const limpo = String(texto || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(limpo); } catch {}
  const m = limpo.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error('resposta da IA não é JSON');
}

async function viaAnthropic(prompt, maxTokens) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('sem chave');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODELO_ANTHROPIC, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) {
    const corpo = await r.text();
    const semCredito = r.status === 400 && /credit|balance/i.test(corpo);
    if (semCredito && !avisoCredito) {
      avisoCredito = true;
      console.warn('⚠️ Anthropic SEM CRÉDITO — classificações passam a usar provedor gratuito');
    }
    throw new Error(semCredito ? 'anthropic-sem-credito' : `anthropic ${r.status}`);
  }
  const d = await r.json();
  return extrairJSON((d.content || []).map(b => b.text || '').join(''));
}

async function viaGroq(prompt, maxTokens) {
  if (!process.env.GROQ_API_KEY) throw new Error('sem chave');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO_GROQ, max_tokens: maxTokens, temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Você responde SEMPRE com um único objeto JSON válido, sem texto fora dele.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!r.ok) throw new Error(`groq ${r.status}`);
  const d = await r.json();
  return extrairJSON(d.choices?.[0]?.message?.content || '');
}

async function viaGemini(prompt, maxTokens) {
  if (!process.env.GEMINI_API_KEY) throw new Error('sem chave');
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const d = await r.json();
  return extrairJSON(d.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

// Classificação com fallback automático entre provedores
export async function classificarJSON(prompt, maxTokens = 400) {
  const erros = [];
  for (const [nome, fn] of [['anthropic', viaAnthropic], ['groq', viaGroq], ['gemini', viaGemini]]) {
    try {
      return await fn(prompt, maxTokens);
    } catch (e) {
      erros.push(`${nome}: ${e.message}`);
      if (e.message === 'sem chave') continue;
    }
  }
  throw new Error(`Nenhum provedor de IA disponível (${erros.join(' | ')})`);
}

// Qual provedor está apto agora (para o Diagnóstico)
export function provedoresClassificacao() {
  return {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    anthropic_sem_credito: avisoCredito,
  };
}
