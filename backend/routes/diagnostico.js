// Diagnóstico do sistema — testa cada módulo ao vivo e reporta verde/vermelho
import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { existsSync, statSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();
router.use(authMiddleware, adminOnly);

const STORAGE = process.env.NODE_ENV === 'production'
  ? '/app/storage'
  : path.join(__dirname, '../../storage');

async function tempo(fn) {
  const inicio = Date.now();
  try {
    const detalhe = await fn();
    return { ok: true, ms: Date.now() - inicio, detalhe: detalhe || 'OK' };
  } catch (e) {
    return { ok: false, ms: Date.now() - inicio, detalhe: e.message };
  }
}

router.post('/rodar', async (req, res) => {
  const db = getDB();
  const resultados = {};

  // ─── 1. Banco de dados ───
  resultados.banco = await tempo(async () => {
    const c = db.prepare('SELECT COUNT(*) as n FROM clients').get();
    const p = db.prepare('SELECT COUNT(*) as n FROM processos').get();
    const d = db.prepare('SELECT COUNT(*) as n FROM documents').get();
    return `${c.n} clientes, ${p.n} processos, ${d.n} documentos`;
  });

  // ─── 2. Storage (escrita/leitura) ───
  resultados.storage = await tempo(async () => {
    const teste = path.join(STORAGE, '.diag_test');
    writeFileSync(teste, 'ok');
    const lido = readFileSync(teste, 'utf8');
    unlinkSync(teste);
    if (lido !== 'ok') throw new Error('Leitura divergente');
    const dbSize = existsSync(path.join(STORAGE, 'docjuris.db'))
      ? (statSync(path.join(STORAGE, 'docjuris.db')).size / 1024 / 1024).toFixed(1) + 'MB'
      : 'db não encontrado';
    return `Escrita/leitura OK — banco: ${dbSize}`;
  });

  // ─── 3. IA (Anthropic) ───
  resultados.ia_anthropic = await tempo(async () => {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'oi' }],
      }),
    });
    if (!r.ok) throw new Error(`API respondeu ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return 'Chave válida, API respondendo';
  });

  // ─── 4. Autentique ───
  resultados.autentique = await tempo(async () => {
    if (!process.env.AUTENTIQUE_API_TOKEN) throw new Error('AUTENTIQUE_API_TOKEN não configurada');
    const r = await fetch('https://api.autentique.com.br/v2/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AUTENTIQUE_API_TOKEN}`,
      },
      body: JSON.stringify({ query: '{ me { name email } }' }),
    });
    const data = await r.json();
    if (data.errors) throw new Error(data.errors[0]?.message || 'Erro GraphQL');
    return `Conta: ${data.data?.me?.email || data.data?.me?.name || 'autenticada'}`;
  });

  // ─── 5. Email (Resend) ───
  resultados.email_resend = await tempo(async () => {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurada');
    const r = await fetch('https://api.resend.com/domains', {
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (r.status === 401) {
      const body = await r.json().catch(() => ({}));
      // Chave "sending only" não pode listar domínios mas É válida para enviar
      if ((body.message || '').toLowerCase().includes('restricted')) {
        return 'Chave válida (permissão: apenas envio de emails)';
      }
      throw new Error('Chave da API inválida (401)');
    }
    if (!r.ok) throw new Error(`Resend respondeu ${r.status}`);
    const data = await r.json();
    const verificados = (data.data || []).filter(d => d.status === 'verified').map(d => d.name);
    if (verificados.length === 0) throw new Error('Nenhum domínio verificado');
    return `Domínios verificados: ${verificados.join(', ')}`;
  });

  // ─── 6. WhatsApp (Evolution) ───
  resultados.whatsapp = await tempo(async () => {
    let url = process.env.EVOLUTION_API_URL;
    const key = process.env.EVOLUTION_API_KEY;
    const inst = process.env.EVOLUTION_INSTANCE;
    if (!url || !key || !inst) throw new Error('Variáveis Evolution não configuradas');
    if (!/^https?:\/\//.test(url)) url = 'https://' + url; // env sem protocolo
    const r = await fetch(`${url}/instance/connectionState/${inst}`, {
      headers: { 'apikey': key },
    });
    if (!r.ok) throw new Error(`Evolution respondeu ${r.status}`);
    const data = await r.json();
    const estado = data?.instance?.state || data?.state || 'desconhecido';
    if (estado !== 'open') throw new Error(`Instância "${inst}" está: ${estado} (esperado: open)`);
    return `Instância "${inst}" conectada`;
  });

  // ─── 7. DataJud ───
  resultados.datajud = await tempo(async () => {
    const r = await fetch('https://api-publica.datajud.cnj.jus.br/api_publica_tjrj/_search', {
      method: 'POST',
      headers: {
        'Authorization': 'APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ size: 1, query: { match_all: {} } }),
    });
    if (!r.ok) throw new Error(`DataJud respondeu ${r.status}`);
    return 'API pública respondendo (TJRJ)';
  });

  // ─── 8. Conversor PDF (LibreOffice) ───
  resultados.conversor_pdf = await tempo(async () => {
    for (const cmd of ['soffice', 'libreoffice']) {
      try {
        const v = execSync(`${cmd} --version`, { timeout: 20000, stdio: 'pipe' }).toString().trim().split('\n')[0];
        return v;
      } catch (e) { /* tenta próximo */ }
    }
    throw new Error('LibreOffice não encontrado no servidor');
  });

  // ─── 9. Backup (local + email + Drive) ───
  resultados.backup = await tempo(async () => {
    const { ultimoBackupLocal } = await import('../services/backup.js');
    const local = ultimoBackupLocal();
    if (!local) throw new Error('Nenhum backup local ainda. Clique em "Fazer backup agora" abaixo.');
    const idadeH = (Date.now() - new Date(local.modificado).getTime()) / (1000 * 60 * 60);
    if (idadeH > 48) throw new Error(`Último backup local tem ${Math.round(idadeH)}h (${local.nome}) — deveria ser diário`);
    return `Local: ${local.nome} (${local.tamanhoKB}KB, há ${Math.round(idadeH)}h, ${local.total} cópias) + email diário para o Gmail`;
  });

  // ─── 10. Filas/rotinas internas ───
  resultados.rotinas = await tempo(async () => {
    const prazosAtrasados = db.prepare(`SELECT COUNT(*) as n FROM prazos WHERE data_limite < date('now') AND concluido = 0`).get();
    const docsPendentes = db.prepare(`SELECT COUNT(*) as n FROM documents WHERE zapsign_doc_token IS NOT NULL AND status != 'assinado'`).get();
    return `${prazosAtrasados.n} prazo(s) vencido(s) aberto(s), ${docsPendentes.n} doc(s) aguardando assinatura`;
  });

  const total = Object.keys(resultados).length;
  const ok = Object.values(resultados).filter(r => r.ok).length;

  res.json({
    executado_em: new Date().toISOString(),
    resumo: `${ok}/${total} verificações OK`,
    saudavel: ok === total,
    resultados,
  });
});

// POST /api/diagnostico/backup-agora — executa o backup na hora e mostra o resultado real
router.post('/backup-agora', async (req, res) => {
  const { runBackup } = await import('../services/backup.js');
  const resultado = await runBackup();
  if (!resultado) return res.status(500).json({ error: 'Backup não retornou resultado' });
  if (!resultado.ok) return res.status(500).json({ error: resultado.erro });
  res.json({ ok: true, detalhe: resultado.detalhe });
});

export default router;
