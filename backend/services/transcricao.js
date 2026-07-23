// backend/services/transcricao.js
// Transcrição de áudios do WhatsApp (OpenAI Whisper).
// Muitos clientes negociam por áudio — sem isto, o CRM ficaria cego a essas conversas.
// Requer OPENAI_API_KEY. Resultados ficam em cache: cada áudio é pago uma única vez.
import { getDB } from '../db.js';

const MAX_SEGUNDOS = 600;     // ignora áudios acima de 10 min (custo/ruído)
const CUSTO_POR_MIN = 0.036;  // USD (referência Whisper)

export function transcricaoDisponivel() {
  return !!process.env.OPENAI_API_KEY;
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

    // 2. Whisper (OpenAI)
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'audio.ogg');
    form.append('model', 'whisper-1');
    form.append('language', 'pt');

    const rw = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!rw.ok) {
      const err = await rw.text();
      throw new Error(`Whisper ${rw.status}: ${err.slice(0, 120)}`);
    }
    const dw = await rw.json();
    const texto = String(dw.text || '').trim();

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
    return { total: r.n, minutos: Math.round(r.s / 60), custo_estimado_usd: custoUSD.toFixed(2) };
  } catch { return { total: 0, minutos: 0, custo_estimado_usd: '0.00' }; }
}
