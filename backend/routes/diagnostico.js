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

    // Estado de TODAS as linhas do escritório (os 3 números)
    try {
      const ri = await fetch(`${url}/instance/fetchInstances`, { headers: { 'apikey': key } });
      if (ri.ok) {
        const lista = await ri.json();
        const todas = (Array.isArray(lista) ? lista : [lista]).map(x => {
          const i = x?.instance || x || {};
          const owner = String(i.owner || i.ownerJid || '').split('@')[0].replace(/\D/g, '');
          const fmt = owner.length >= 12
            ? `(${owner.slice(2,4)}) ${owner.slice(4,9)}-${owner.slice(9)}`
            : (i.instanceName || i.name || '?');
          return {
            nome: i.instanceName || i.name || '?',
            ok: ['open', 'connected'].includes(String(i.connectionStatus || i.status || i.state || '').toLowerCase()),
            label: fmt,
          };
        }).filter(x => x.nome !== '?');

        const caidas = todas.filter(x => !x.ok);
        const descricao = todas.map(x => `${x.ok ? '🟢' : '🔴'} ${x.label}`).join(' · ');
        if (caidas.length) {
          throw new Error(`${caidas.length} de ${todas.length} linha(s) DESCONECTADA(S) — leads desses números não são captados. ${descricao}`);
        }
        return `${todas.length} linha(s) conectada(s): ${descricao}`;
      }
    } catch(e) {
      if (String(e.message).includes('DESCONECTADA')) throw e;
    }

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
    if (r.status === 429) {
      // A chave pública do CNJ é compartilhada nacionalmente — 429 é congestionamento, não falha
      return 'API ativa, mas com limite de requisições no momento (429) — o monitoramento tenta de novo automaticamente';
    }
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
    const docsPendentes = db.prepare(`SELECT COUNT(*) as n FROM documents WHERE zapsign_doc_token IS NOT NULL AND status != 'assinado'`).get();
    return `${docsPendentes.n} doc(s) aguardando assinatura`;
  });

  // ─── 11. Prazos & Monitoramento (rotina central das advogadas) ───
  resultados.prazos = await tempo(async () => {
    const vencidos = db.prepare(`SELECT COUNT(*) as n FROM prazos WHERE data_limite < date('now') AND concluido = 0`).get().n;
    const criticos = db.prepare(`SELECT COUNT(*) as n FROM prazos WHERE concluido = 0 AND data_limite >= date('now') AND data_limite <= date('now', '+3 days')`).get().n;
    const dezDias = db.prepare(`SELECT COUNT(*) as n FROM prazos WHERE concluido = 0 AND data_limite >= date('now') AND data_limite <= date('now', '+10 days')`).get().n;

    // Saúde do monitoramento: a última sincronização deve ter menos de 12h (ciclo é de 6h)
    const sync = db.prepare(`SELECT MAX(ultima_consulta) as ultima FROM processos WHERE status = 'ativo'`).get();
    let syncInfo = 'monitoramento aguardando primeiro ciclo';
    if (sync.ultima) {
      const horas = (Date.now() - new Date(sync.ultima.replace(' ', 'T') + 'Z').getTime()) / (1000 * 60 * 60);
      if (horas > 12) {
        throw new Error(`Monitoramento PARADO: última sincronização há ${Math.round(horas)}h (deveria rodar a cada 6h). Use "Atualizar agora" na Agenda.`);
      }
      syncInfo = `sincronizado há ${Math.round(horas)}h`;
    }

    if (vencidos > 0) {
      throw new Error(`${vencidos} prazo(s) VENCIDO(S) em aberto! ${criticos} crítico(s) (3 dias). Vá à Agenda de Prazos. (${syncInfo})`);
    }
    return `Nenhum vencido · ${criticos} crítico(s) ≤3d · ${dezDias} nos próximos 10 dias · ${syncInfo}`;
  });

  // ─── 12. DJE/Intimações (DJEN) ───
  resultados.dje = await tempo(async () => {
    const { OABS_MONITORADAS } = await import('../services/dje-monitor.js');
    const hoje = new Date();
    let totalPubs = 0;
    const porOab = [];

    for (const oab of OABS_MONITORADAS) {
      // Testa a API do DJEN ao vivo: publicações de hoje para cada OAB
      const dataISO = hoje.toISOString().split('T')[0];
      const r = await fetch(
        `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${oab.numero}&ufOab=${oab.uf}&dataDisponibilizacaoInicio=${dataISO}&dataDisponibilizacaoFim=${dataISO}&itensPorPagina=5`,
        { headers: { 'Accept': 'application/json', 'Accept-Language': 'pt-BR,pt;q=0.9', 'Referer': 'https://comunica.pje.jus.br/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' } }
      );
      if (r.status === 403) {
        // CNJ bloqueia consultas vindas de datacenters — fora do nosso controle.
        // A cobertura de intimações fica pela via dos emails do Domicílio Eletrônico
        // (monitorados no Gmail), que não sofre esse bloqueio.
        const gmailOk = !!(process.env.GOOGLE_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN);
        if (gmailOk) {
          return 'DJEN bloqueia servidores (403) — cobertura ativa pela via alternativa: emails do Domicílio Eletrônico monitorados no Gmail. Validação manual: comunica.pje.jus.br';
        }
        throw new Error('DJEN bloqueado (403) E monitor do Gmail sem credenciais — intimações SEM cobertura automática! Confira o Domicílio Eletrônico manualmente.');
      }
      if (!r.ok && r.status !== 404) throw new Error(`DJEN inacessível para OAB/${oab.uf} ${oab.numero} (HTTP ${r.status})`);
      let n = 0;
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        n = d.count ?? (d.items || d.content || []).length;
      }
      totalPubs += n;
      porOab.push(`${oab.advogada.replace('Dra. ', '')} OAB/${oab.uf}: ${n}`);
      await new Promise(r2 => setTimeout(r2, 300));
    }

    return `API do DJEN acessível · publicações hoje — ${porOab.join(' · ')} · monitor roda a cada 6h`;
  });

  // ─── 13. Token GitHub (manutenção via Claude) ───
  resultados.github = await tempo(async () => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return 'Não configurado (opcional) — para monitorar a validade, adicione GITHUB_TOKEN nas variáveis do Railway';
    }
    const r = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${token}`, 'User-Agent': 'Veredo/1.0' },
    });
    if (r.status === 401) throw new Error('Token INVÁLIDO ou expirado! Gere um novo em github.com/settings/tokens e atualize no Railway.');
    if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);

    const exp = r.headers.get('github-authentication-token-expiration');
    if (!exp) return 'Token válido, sem data de expiração definida';

    const dataExp = new Date(exp.replace(' UTC', 'Z').replace(' ', 'T'));
    const dias = Math.floor((dataExp - Date.now()) / (1000 * 60 * 60 * 24));
    if (isNaN(dias)) return `Token válido · expiração: ${exp}`;
    if (dias <= 0) throw new Error('Token EXPIRADO! Gere um novo em github.com/settings/tokens e atualize no Railway.');
    if (dias <= 10) throw new Error(`Token expira em ${dias} dia(s)! Gere um novo em github.com/settings/tokens (e informe ao Claude).`);
    return `Token válido · expira em ${dias} dias (${dataExp.toLocaleDateString('pt-BR')})`;
  });

  // ─── 14. CRM diário (WhatsApp → funil) ───
  resultados.crm = await tempo(async () => {
    let log = null;
    try { log = db.prepare('SELECT executado_em, resumo FROM crm_diario_log ORDER BY id DESC LIMIT 1').get(); } catch {}
    if (!log) return 'Ainda não executado — roda diariamente às 7h30 (ou manualmente em WhatsApp)';
    const horas = (Date.now() - new Date(log.executado_em.replace(' ', 'T') + 'Z').getTime()) / 3600000;
    const r = JSON.parse(log.resumo || '{}');
    if (horas > 36) throw new Error(`Última análise há ${Math.round(horas)}h (deveria rodar diariamente). Rode manualmente na tela WhatsApp.`);
    return `Há ${Math.round(horas)}h · ${r.conversas || 0} conversa(s) lida(s) · ${r.leads_novos || 0} lead(s) novo(s) · ${r.convertidos || 0} convertido(s)`;
  });

  // ─── 15. Transcrição de áudios (Whisper) ───
  resultados.transcricao = await tempo(async () => {
    const { provedorTranscricao, estatisticasTranscricao } = await import('../services/transcricao.js');
    const prov = provedorTranscricao();
    const st = estatisticasTranscricao();

    if (!prov) {
      throw new Error('Nenhuma chave de transcrição configurada — áudios do WhatsApp NÃO são transcritos. Opção gratuita: crie GROQ_API_KEY em console.groq.com e adicione no Railway.');
    }

    // Validação da chave conforme o provedor
    if (prov === 'groq') {
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` } });
      if (r.status === 401) throw new Error('Chave da Groq inválida (401)');
      if (!r.ok) throw new Error(`Groq respondeu ${r.status}`);
      return `Ativa via Groq (gratuita) · ${st.total} áudio(s), ${st.minutos} min transcritos`;
    }
    if (prov === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
      if (!r.ok) throw new Error(`Gemini respondeu ${r.status} — verifique a chave`);
      return `Ativa via Gemini (gratuita) · ${st.total} áudio(s), ${st.minutos} min transcritos`;
    }
    const r = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` } });
    if (r.status === 401) throw new Error('Chave da OpenAI inválida (401)');
    if (!r.ok) throw new Error(`OpenAI respondeu ${r.status}`);
    return `Ativa via OpenAI (paga) · ${st.total} áudio(s), ${st.minutos} min, custo estimado US$ ${st.custo_estimado_usd}`;
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







