import { Router } from 'express';
import { consultarProcesso } from '../services/datajud.js';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/processos?client_id=X
router.get('/', (req, res) => {
  const db = getDB();
  const { client_id } = req.query;
  const query = client_id
    ? `SELECT p.*, c.nome as client_nome FROM processos p JOIN clients c ON c.id = p.client_id WHERE p.client_id = ? ORDER BY p.created_at DESC`
    : `SELECT p.*, c.nome as client_nome FROM processos p JOIN clients c ON c.id = p.client_id ORDER BY p.created_at DESC`;
  const rows = client_id ? db.prepare(query).all(client_id) : db.prepare(query).all();
  res.json(rows);
});

// GET /api/processos/:id
router.get('/agenda-prazos', (req, res) => {
  const db = getDB();
  // SEM filtro de data: prazos vencidos e abertos SEMPRE aparecem — some só ao concluir.
  // Inclui a última movimentação de cada processo (fixa no cartão do prazo).
  const prazos = db.prepare(`
    SELECT pz.*, pr.numero_cnj, pr.tribunal, pr.tipo as processo_tipo,
           pr.status as processo_status, pr.ultima_consulta,
           c.nome as cliente_nome, c.telefone as cliente_telefone,
           ult.data as ult_mov_data, ult.descricao as ult_mov_descricao
    FROM prazos pz
    JOIN processos pr ON pr.id = pz.processo_id
    JOIN clients c ON c.id = pz.client_id
    LEFT JOIN (
      SELECT a1.processo_id, a1.data, MAX(a1.descricao) as descricao
      FROM andamentos a1
      JOIN (SELECT processo_id, MAX(data) as md FROM andamentos GROUP BY processo_id) a2
        ON a2.processo_id = a1.processo_id AND a2.md = a1.data
      GROUP BY a1.processo_id, a1.data
    ) ult ON ult.processo_id = pr.id
    WHERE pz.concluido = 0
    ORDER BY pz.data_limite ASC
  `).all();

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const comStatus = prazos.map(p => {
    const dl = new Date(p.data_limite + 'T12:00:00');
    const dias = Math.ceil((dl - hoje) / (1000*60*60*24));
    let urgencia = 'normal';
    if (dias < 0) urgencia = 'vencido';
    else if (dias <= 3) urgencia = 'critico';
    else if (dias <= 7) urgencia = 'proximo';
    return { ...p, dias_restantes: dias, urgencia };
  });

  // Última sincronização do monitoramento (qualquer processo ativo)
  const sync = db.prepare(`
    SELECT MAX(ultima_consulta) as ultima, COUNT(*) as ativos
    FROM processos WHERE status = 'ativo'
  `).get();

  // ─── PONTOS CEGOS: processos ativos que o monitoramento NÃO está enxergando ───
  // O DataJud tem cobertura parcial; um processo sem nenhum andamento registrado,
  // ou parado há 60+ dias, pode estar fora da cobertura — e prazos dele passariam
  // despercebidos. Estes exigem conferência manual (DJE, push do tribunal).
  const semAndamento = db.prepare(`
    SELECT p.id, p.numero_cnj, p.tribunal, c.nome as cliente_nome
    FROM processos p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.status = 'ativo'
      AND NOT EXISTS (SELECT 1 FROM andamentos a WHERE a.processo_id = p.id)
  `).all();

  const paradosMais60d = db.prepare(`
    SELECT p.id, p.numero_cnj, p.tribunal, c.nome as cliente_nome,
           MAX(a.data) as ultima_mov
    FROM processos p
    LEFT JOIN clients c ON c.id = p.client_id
    JOIN andamentos a ON a.processo_id = p.id
    WHERE p.status = 'ativo'
    GROUP BY p.id
    HAVING MAX(a.data) < datetime('now', '-60 days')
  `).all();

  res.json({
    prazos: comStatus,
    ultima_sincronizacao: sync.ultima,
    processos_ativos: sync.ativos,
    pontos_cegos: {
      sem_andamento: semAndamento,
      parados_60d: paradosMais60d,
    },
  });
});

// POST /api/processos/monitorar-agora — dispara o ciclo de monitoramento manualmente
let monitoramentoRodando = false;
router.post('/monitorar-agora', async (req, res) => {
  if (monitoramentoRodando) {
    return res.json({ ok: true, ja_rodando: true, mensagem: 'Monitoramento já está em execução' });
  }
  monitoramentoRodando = true;
  const { monitorarProcessos } = await import('../services/monitoramento.js');
  // Fire-and-forget: roda em segundo plano; a tela acompanha pelo ultima_sincronizacao
  monitorarProcessos()
    .catch(e => console.error('Monitoramento manual:', e.message))
    .finally(() => { monitoramentoRodando = false; });
  res.json({ ok: true, iniciado: true });
});

// PUT /api/processos/prazos/:prazo_id/concluir — marcar prazo como concluído

router.put('/prazos/:prazo_id/concluir', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE prazos SET concluido = 1 WHERE id = ?').run(req.params.prazo_id);
  res.json({ ok: true });
});



// ═══════════════════════════════════════════════════════════════════════════
// QUADRO DE ANDAMENTO (etapas estilo Trello) + importação do Trello
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/processos/etapas — colunas do quadro
router.get('/etapas', (req, res) => {
  const db = getDB();
  const etapas = db.prepare('SELECT * FROM etapas_processo ORDER BY ordem, id').all();
  // Contagem de processos por etapa
  const contagens = db.prepare(`
    SELECT etapa_id, COUNT(*) as n FROM processos
    WHERE status = 'ativo' AND etapa_id IS NOT NULL GROUP BY etapa_id
  `).all();
  const mapa = Object.fromEntries(contagens.map(x => [x.etapa_id, x.n]));
  res.json(etapas.map(e => ({ ...e, processos: mapa[e.id] || 0 })));
});

// POST /api/processos/etapas — criar coluna
router.post('/etapas', (req, res) => {
  const db = getDB();
  const { nome } = req.body;
  if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  const max = db.prepare('SELECT COALESCE(MAX(ordem), -1) as m FROM etapas_processo').get();
  const r = db.prepare('INSERT INTO etapas_processo (nome, ordem) VALUES (?, ?)').run(nome.trim(), max.m + 1);
  res.json({ id: r.lastInsertRowid });
});

// PUT /api/processos/etapas/:id — renomear ou reordenar
router.put('/etapas/:id', (req, res) => {
  const db = getDB();
  const { nome, ordem } = req.body;
  db.prepare('UPDATE etapas_processo SET nome = COALESCE(?, nome), ordem = COALESCE(?, ordem) WHERE id = ?')
    .run(nome ?? null, ordem ?? null, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/processos/etapas/:id — só se vazia
router.delete('/etapas/:id', (req, res) => {
  const db = getDB();
  const tem = db.prepare(`SELECT COUNT(*) as n FROM processos WHERE etapa_id = ? AND status='ativo'`).get(req.params.id);
  if (tem.n > 0) return res.status(400).json({ error: `Há ${tem.n} processo(s) nesta etapa. Mova-os antes de excluir.` });
  db.prepare('DELETE FROM etapas_processo WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/processos/quadro — processos agrupáveis por etapa
router.get('/quadro', (req, res) => {
  const db = getDB();
  const processos = db.prepare(`
    SELECT p.id, p.numero_cnj, p.tribunal, p.etapa_id, p.status,
           c.nome as cliente_nome,
           (SELECT a.descricao FROM andamentos a WHERE a.processo_id = p.id ORDER BY a.data DESC LIMIT 1) as ultima_mov,
           (SELECT MAX(a.data) FROM andamentos a WHERE a.processo_id = p.id) as ultima_mov_data,
           (SELECT MIN(pz.data_limite) FROM prazos pz WHERE pz.processo_id = p.id AND pz.concluido = 0) as proximo_prazo
    FROM processos p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.status = 'ativo'
    ORDER BY c.nome
  `).all();
  res.json(processos);
});

// PUT /api/processos/:id/etapa — mover processo de coluna
router.put('/:id/etapa', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE processos SET etapa_id = ? WHERE id = ?').run(req.body.etapa_id ?? null, req.params.id);
  res.json({ ok: true });
});

// POST /api/processos/importar-trello — recebe { lists: [{id, nome}], cards: [{name, desc, idList, due}] }
// (o navegador já filtra o JSON bruto do Trello para este formato compacto)
router.post('/importar-trello', (req, res) => {
  const db = getDB();
  const { lists, cards } = req.body;
  if (!Array.isArray(lists) || !Array.isArray(cards)) {
    return res.status(400).json({ error: 'Formato inválido — envie o JSON exportado do Trello' });
  }

  const resultado = { etapas_criadas: 0, vinculados: 0, criados_triagem: 0, sem_cnj: [], prazos_criados: 0 };
  const triagemId = getClienteTriagem(db, req.user.id);

  // 1. Listas do Trello → etapas (na ordem; reaproveita etapas com mesmo nome)
  const mapaLista = {}; // idList do Trello → etapa_id do Veredo
  const maxOrdem = db.prepare('SELECT COALESCE(MAX(ordem), -1) as m FROM etapas_processo').get().m;
  lists.forEach((l, i) => {
    const nome = (l.nome || l.name || '').trim();
    if (!nome) return;
    let etapa = db.prepare('SELECT id FROM etapas_processo WHERE nome = ?').get(nome);
    if (!etapa) {
      const r = db.prepare('INSERT INTO etapas_processo (nome, ordem) VALUES (?, ?)').run(nome, maxOrdem + 1 + i);
      etapa = { id: r.lastInsertRowid };
      resultado.etapas_criadas++;
    }
    mapaLista[l.id] = etapa.id;
  });

  // 2. Cartões → processos (match por CNJ; sem match mas com CNJ → cria na triagem)
  const regexCNJ = /\d{7}[-.]?\d{2}[.]?\d{4}[.]?\d[.]?\d{2}[.]?\d{4}/;
  const upEtapa = db.prepare('UPDATE processos SET etapa_id = ? WHERE id = ?');
  const insProc = db.prepare(`
    INSERT INTO processos (client_id, numero_cnj, tribunal, observacoes, status, etapa_id, created_by)
    VALUES (?, ?, ?, ?, 'ativo', ?, ?)
  `);
  const insPrazo = db.prepare(`
    INSERT INTO prazos (processo_id, client_id, titulo, tipo, data_limite, observacoes, created_by)
    VALUES (?, ?, ?, 'trello', ?, 'Importado do Trello', ?)
  `);

  for (const card of cards) {
    const etapaId = mapaLista[card.idList] || null;
    const textoCompleto = `${card.name || ''} ${card.desc || ''}`;
    const m = textoCompleto.match(regexCNJ);

    if (!m) {
      resultado.sem_cnj.push(card.name || '(sem título)');
      continue;
    }
    const digitos = m[0].replace(/\D/g, '');
    const existente = db.prepare(`
      SELECT p.id, p.client_id FROM processos p
      WHERE REPLACE(REPLACE(REPLACE(p.numero_cnj, '.', ''), '-', ''), ' ', '') = ?
    `).get(digitos);

    let procId, clientId;
    if (existente) {
      upEtapa.run(etapaId, existente.id);
      procId = existente.id; clientId = existente.client_id;
      resultado.vinculados++;
    } else {
      const fmt = `${digitos.slice(0,7)}-${digitos.slice(7,9)}.${digitos.slice(9,13)}.${digitos.slice(13,14)}.${digitos.slice(14,16)}.${digitos.slice(16,20)}`;
      const tribunal = inferirTribunal(digitos) || 'N/D';
      const obs = ['Importado do Trello', card.name, card.desc].filter(Boolean).join(' | ').slice(0, 800);
      const r = insProc.run(triagemId, fmt, tribunal, obs, etapaId, req.user.id);
      procId = r.lastInsertRowid; clientId = triagemId;
      resultado.criados_triagem++;
    }

    // Data de entrega do cartão → prazo
    if (card.due) {
      const dataISO = String(card.due).slice(0, 10);
      const ja = db.prepare('SELECT id FROM prazos WHERE processo_id = ? AND data_limite = ?').get(procId, dataISO);
      if (!ja) {
        insPrazo.run(procId, clientId, `Trello: ${(card.name || 'entrega').slice(0, 120)}`, dataISO, req.user.id);
        resultado.prazos_criados++;
      }
    }
  }

  res.json(resultado);
});


router.get('/:id', (req, res) => {
  const db = getDB();
  const processo = db.prepare(`
    SELECT p.*, c.nome as client_nome
    FROM processos p JOIN clients c ON c.id = p.client_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!processo) return res.status(404).json({ error: 'Processo não encontrado' });
  const prazos = db.prepare(`
    SELECT pz.*, u.name as responsavel_nome
    FROM prazos pz LEFT JOIN users u ON u.id = pz.responsavel_id
    WHERE pz.processo_id = ? ORDER BY pz.data_limite ASC
  `).all(processo.id);
  res.json({ ...processo, prazos });
});

// POST /api/processos
router.post('/', (req, res) => {
  const { client_id, numero_cnj, vara, comarca, tribunal, tipo, polo_ativo, polo_passivo, observacoes } = req.body;
  if (!client_id || !numero_cnj) return res.status(400).json({ error: 'client_id e numero_cnj são obrigatórios' });
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO processos (client_id, numero_cnj, vara, comarca, tribunal, tipo, polo_ativo, polo_passivo, observacoes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(client_id, numero_cnj, vara||null, comarca||null, tribunal||null, tipo||null, polo_ativo||null, polo_passivo||null, observacoes||null, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/processos/:id
router.put('/:id', (req, res) => {
  const { numero_cnj, vara, comarca, tribunal, tipo, polo_ativo, polo_passivo, observacoes, status, client_id } = req.body;
  const db = getDB();
  if (client_id) {
    db.prepare(`UPDATE processos SET client_id=?, numero_cnj=?, vara=?, comarca=?, tribunal=?, tipo=?, polo_ativo=?, polo_passivo=?, observacoes=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(client_id, numero_cnj, vara||null, comarca||null, tribunal||null, tipo||null, polo_ativo||null, polo_passivo||null, observacoes||null, status||'ativo', req.params.id);
  } else {
    db.prepare(`UPDATE processos SET numero_cnj=?, vara=?, comarca=?, tribunal=?, tipo=?, polo_ativo=?, polo_passivo=?, observacoes=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(numero_cnj, vara||null, comarca||null, tribunal||null, tipo||null, polo_ativo||null, polo_passivo||null, observacoes||null, status||'ativo', req.params.id);
  }
  res.json({ ok: true });
});

// DELETE /api/processos/:id
router.delete('/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM processos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/processos/:id/prazos
// GET /api/processos/agenda-prazos — todos os prazos consolidados de todos os processos
router.post('/:id/prazos', (req, res) => {
  const { titulo, tipo, data_limite, responsavel_id, observacoes } = req.body;
  if (!titulo || !data_limite) return res.status(400).json({ error: 'titulo e data_limite são obrigatórios' });
  const db = getDB();
  const processo = db.prepare('SELECT client_id FROM processos WHERE id = ?').get(req.params.id);
  if (!processo) return res.status(404).json({ error: 'Processo não encontrado' });
  const result = db.prepare(`
    INSERT INTO prazos (processo_id, client_id, titulo, tipo, data_limite, responsavel_id, observacoes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, processo.client_id, titulo, tipo||'prazo', data_limite, responsavel_id||null, observacoes||null, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/processos/:id/prazos/:prazo_id
router.put('/:id/prazos/:prazo_id', (req, res) => {
  const { concluido } = req.body;
  const db = getDB();
  db.prepare('UPDATE prazos SET concluido = ? WHERE id = ?').run(concluido ? 1 : 0, req.params.prazo_id);
  res.json({ ok: true });
});

// DELETE /api/processos/:id/prazos/:prazo_id
router.delete('/:id/prazos/:prazo_id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM prazos WHERE id = ?').run(req.params.prazo_id);
  res.json({ ok: true });
});

// GET /api/processos/:id/andamentos — retorna andamentos salvos + consulta ao vivo se vazio
router.get('/:id/andamentos', async (req, res) => {
  const db = getDB();
  const processo = db.prepare('SELECT * FROM processos WHERE id = ?').get(req.params.id);
  if (!processo) return res.status(404).json({ error: 'Processo não encontrado' });
  
  // Tentar andamentos salvos primeiro
  const salvos = db.prepare('SELECT * FROM andamentos WHERE processo_id = ? ORDER BY data DESC').all(req.params.id);
  if (salvos.length > 0) {
    return res.json({ movimentos: salvos.map(a => ({ data: a.data, descricao: a.descricao })), fonte: 'cache' });
  }
  
  // Se não tem salvos, consultar DataJud ao vivo
  const resultado = await consultarProcesso(processo.numero_cnj, processo.tribunal);
  res.json(resultado);
});


// ═══════════════════════════════════════════════════════════════════════════
// IMPORTAÇÃO EM LOTE — cola lista de números CNJ, busca no DataJud e cadastra
// ═══════════════════════════════════════════════════════════════════════════
const importJobs = new Map();
setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of importJobs) {
    if (agora - v.createdAt > 30 * 60 * 1000) importJobs.delete(k);
  }
}, 5 * 60 * 1000);

// Inferir tribunal a partir do número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
function inferirTribunal(numeroLimpo) {
  // posições: 13 = J (segmento), 14-15 = TR
  const j = numeroLimpo[13];
  const tr = numeroLimpo.slice(14, 16);
  if (j === '8') {
    const UFS = { '19': 'TJRJ', '26': 'TJSP', '13': 'TJMG', '05': 'TJBA', '06': 'TJCE',
                  '07': 'TJDFT', '08': 'TJES', '09': 'TJGO', '16': 'TJPR', '21': 'TJRS',
                  '24': 'TJSC', '17': 'TJPE' };
    return UFS[tr] || null;
  }
  if (j === '4') return 'TRF' + Number(tr);
  if (j === '5') return 'TRT' + Number(tr);
  if (j === '3') return 'STJ';
  return null;
}

// Extrair números CNJ de texto livre (com ou sem pontuação)
function extrairNumerosCNJ(texto) {
  const matches = texto.match(/\d{7}[-.]?\d{2}[.]?\d{4}[.]?\d[.]?\d{2}[.]?\d{4}/g) || [];
  const limpos = matches.map(m => m.replace(/\D/g, '')).filter(n => n.length === 20);
  return [...new Set(limpos)];
}

// Cliente especial de triagem (processos importados sem cliente identificado)
function getClienteTriagem(db, userId) {
  let triagem = db.prepare(`SELECT id FROM clients WHERE nome = '⚠️ TRIAGEM — Processos importados'`).get();
  if (!triagem) {
    const r = db.prepare(`
      INSERT INTO clients (nome, observacoes, advogadas, created_by)
      VALUES ('⚠️ TRIAGEM — Processos importados',
              'Cliente técnico: processos importados em lote aguardando vinculação ao cliente correto. Edite cada processo e mova para o cliente verdadeiro.',
              'ambas', ?)
    `).run(userId);
    triagem = { id: r.lastInsertRowid };
  }
  return triagem.id;
}

// POST /api/processos/importar-lote — inicia o job
router.post('/importar-lote', (req, res) => {
  const { texto } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ error: 'Cole a lista de números de processo' });

  const numeros = extrairNumerosCNJ(texto);
  if (numeros.length === 0) return res.status(400).json({ error: 'Nenhum número CNJ válido encontrado no texto' });
  if (numeros.length > 200) return res.status(400).json({ error: 'Máximo de 200 processos por importação' });

  const jobId = 'imp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  importJobs.set(jobId, {
    status: 'processing', total: numeros.length, processados: 0,
    criados: 0, existentes: 0, erros: [], createdAt: Date.now(),
  });

  importarLoteAsync(jobId, numeros, req.user.id).catch(e => {
    const job = importJobs.get(jobId);
    if (job) { job.status = 'error'; job.erroGeral = e.message; }
  });

  res.json({ jobId, total: numeros.length });
});

// GET /api/processos/importar-lote/status/:jobId
router.get('/importar-lote/status/:jobId', (req, res) => {
  const job = importJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job não encontrado ou expirado' });
  res.json(job);
});

async function importarLoteAsync(jobId, numeros, userId) {
  const db = getDB();
  const job = importJobs.get(jobId);
  const triagemId = getClienteTriagem(db, userId);

  for (const numero of numeros) {
    try {
      // Dedupe: já existe? (compara só dígitos)
      const existe = db.prepare(`
        SELECT id FROM processos
        WHERE REPLACE(REPLACE(REPLACE(numero_cnj, '.', ''), '-', ''), ' ', '') = ?
      `).get(numero);

      if (existe) {
        job.existentes++;
      } else {
        const tribunal = inferirTribunal(numero);
        if (!tribunal) {
          job.erros.push({ numero, erro: 'Tribunal não identificado pelo número' });
        } else {
          const dados = await consultarProcesso(numero, tribunal);

          // Formatar número CNJ padrão
          const fmt = `${numero.slice(0,7)}-${numero.slice(7,9)}.${numero.slice(9,13)}.${numero.slice(13,14)}.${numero.slice(14,16)}.${numero.slice(16,20)}`;

          if (dados.erro) {
            // Cadastra mesmo assim (sem dados do DataJud) para não perder o processo
            db.prepare(`
              INSERT INTO processos (client_id, numero_cnj, tribunal, observacoes, status, created_by)
              VALUES (?, ?, ?, ?, 'ativo', ?)
            `).run(triagemId, fmt, tribunal, 'Importado em lote. DataJud: ' + dados.erro, userId);
            job.criados++;
            job.erros.push({ numero: fmt, erro: 'Cadastrado, mas DataJud: ' + dados.erro });
          } else {
            const r = db.prepare(`
              INSERT INTO processos (client_id, numero_cnj, tribunal, tipo, observacoes, status, created_by)
              VALUES (?, ?, ?, ?, ?, 'ativo', ?)
            `).run(triagemId, fmt, tribunal, dados.classe || null,
                   [dados.assunto, 'Importado em lote'].filter(Boolean).join(' | '), userId);

            // Popular andamentos iniciais (baseline para o monitoramento)
            const insAnd = db.prepare('INSERT INTO andamentos (processo_id, data, descricao) VALUES (?, ?, ?)');
            for (const m of (dados.movimentos || [])) {
              insAnd.run(r.lastInsertRowid, m.data, m.descricao);
            }
            job.criados++;
          }
        }
      }
    } catch (e) {
      job.erros.push({ numero, erro: e.message });
    }

    job.processados++;
    await new Promise(r => setTimeout(r, 350)); // gentileza com a API do CNJ
  }

  job.status = 'done';
}

export default router;


