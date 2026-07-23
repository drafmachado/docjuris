// backend/services/transcricao.js
// Transcrição de áudios do WhatsApp (OpenAI Whisper).
// Muitos clientes negociam por áudio — sem isto, o CRM ficaria cego a essas conversas.
// Requer OPENAI_API_KEY. Resultados ficam em cache: cada áudio é pago uma única vez.
import { getDB } from '../db.js';

const MAX_SEGUNDOS = 600;     // ignora áudios acima de 10 min (custo/ruído)
const CUSTO_POR_MIN = 0.036;  // USD (referência Whisper)

// Provedores suportados, em ordem de preferência.
// Groq: mesmo modelo Whisper, camada gratuita generosa e sem cartão — padrão recomendado.
// Gemini: alternativa gratuita do Google.
// OpenAI: pago (~US$ 0,006/min), usado apenas se for o único configurado.
export function provedorTranscricao() {
  if (process.env.GROQ_API_KEY)   return 'groq';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

export function transcricaoDisponivel() {
  return !!provedorTranscricao();
}

function evoUrl() {
  let u = process.env.EVOLUTION_API_URL || '';
  if (u && !/^https?:\/\//.test(u)) u = 'https://' + u;
  return u;
}

function cacheGet(db, chave) {
  try { return db.prepare('SELECT texto FROM audio_transcricoes WHERE chave = ?').get(chave)?.texto || null; }
  catch { return null; }
}
function cacheSet(db, chave, texto, segundos) {
  try {
    db.prepare(`INSERT OR REPLACE INTO audio_transcricoes (chave, texto, segundos, created_at)
                VALUES (?, ?, ?, datetime('now'))`).run(chave, texto, segundos || 0);
  } catch {}
}

// Baixa o áudio da Evolution e transcreve. Retorna string ou null.
export async function transcreverAudio(instancia, msg) {
  if (!transcricaoDisponivel()) return null;

  const db = getDB();
  const chave = `${instancia}:${msg?.key?.id || ''}`;
  if (!msg?.key?.id) return null;

  const emCache = cacheGet(db, chave);
  if (emCache !== null) return emCache;

  const audio = msg.message?.audioMessage || msg.message?.pttMessage;
  const segundos = Number(audio?.seconds || 0);
  if (segundos > MAX_SEGUNDOS) {
    cacheSet(db, chave, `[áudio de ${Math.round(segundos / 60)} min — muito longo, não transcrito]`, segundos);
    return null;
  }

  try {
    // 1. Baixar o áudio em base64 pela Evolution
    const r = await fetch(`${evoUrl()}/chat/getBase64FromMediaMessage/${instancia}`, {
      method: 'POST',
      headers: { 'apikey': process.env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { key: msg.key }, convertToMp4: false }),
    });
    if (!r.ok) throw new Error(`Evolution media ${r.status}`);
    const d = await r.json();
    const b64 = d.base64 || d.media || d.data;
    if (!b64) throw new Error('áudio vazio');

    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > 24 * 1024 * 1024) throw new Error('áudio acima de 24MB');

    // 2. Transcrever no provedor configurado
    const provedor = provedorTranscricao();
    let texto = '';

    if (provedor === 'groq' || provedor === 'openai') {
      // Ambos usam a API de transcrição no formato OpenAI
      const conf = provedor === 'groq'
        ? { url: 'https://api.groq.com/openai/v1/audio/transcriptions', key: process.env.GROQ_API_KEY, model: 'whisper-large-v3-turbo' }
        : { url: 'https://api.openai.com/v1/audio/transcriptions', key: process.env.OPENAI_API_KEY, model: 'whisper-1' };

      const form = new FormData();
      form.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'audio.ogg');
      form.append('model', conf.model);
      form.append('language', 'pt');

      const rw = await fetch(conf.url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${conf.key}` },
        body: form,
      });
      if (!rw.ok) {
        const err = await rw.text();
        throw new Error(`${provedor} ${rw.status}: ${err.slice(0, 140)}`);
      }
      const dw = await rw.json();
      texto = String(dw.text || '').trim();

    } else if (provedor === 'gemini') {
      // Gemini aceita o áudio embutido na requisição
      const rg = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: 'Transcreva este áudio em português do Brasil. Responda APENAS com a transcrição literal, sem comentários.' },
                { inline_data: { mime_type: 'audio/ogg', data: b64 } },
              ],
            }],
          }),
        }
      );
      if (!rg.ok) {
        const err = await rg.text();
        throw new Error(`gemini ${rg.status}: ${err.slice(0, 140)}`);
      }
      const dg = await rg.json();
      texto = String(dg.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    } else {
      return null;
    }

    cacheSet(db, chave, texto, segundos);
    console.log(`  🎙️ Áudio transcrito (${segundos}s): "${texto.slice(0, 60)}..."`);
    return texto;
  } catch (e) {
    console.error('  Transcrição falhou:', e.message);
    return null;
  }
}

// Estatísticas para o Diagnóstico
export function estatisticasTranscricao() {
  try {
    const db = getDB();
    const r = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(segundos),0) s FROM audio_transcricoes`).get();
    const custoUSD = (r.s / 60) * CUSTO_POR_MIN;
    const prov = provedorTranscricao();
    return {
      total: r.n, minutos: Math.round(r.s / 60),
      provedor: prov,
      gratuito: prov === 'groq' || prov === 'gemini',
      custo_estimado_usd: (prov === 'openai' ? custoUSD : 0).toFixed(2),
    };
  } catch { return { total: 0, minutos: 0, custo_estimado_usd: '0.00' }; }
}

