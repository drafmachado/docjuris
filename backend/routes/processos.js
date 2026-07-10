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
  const prazos = db.prepare(`
    SELECT pz.*, pr.numero_cnj, pr.tribunal, pr.tipo as processo_tipo,
           c.nome as cliente_nome, c.telefone as cliente_telefone
    FROM prazos pz
    JOIN processos pr ON pr.id = pz.processo_id
    JOIN clients c ON c.id = pz.client_id
    WHERE pz.concluido = 0
      AND pz.data_limite >= date('now')
    ORDER BY pz.data_limite ASC
  `).all();

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const comStatus = prazos.map(p => {
    const dl = new Date(p.data_limite + 'T12:00:00');
    const dias = Math.ceil((dl - hoje) / (1000*60*60*24));
    let urgencia = 'normal';
    if (dias < 0) urgencia = 'vencido';
    else if (dias <= 2) urgencia = 'critico';
    else if (dias <= 7) urgencia = 'proximo';
    return { ...p, dias_restantes: dias, urgencia };
  });

  res.json(comStatus);
});

// PUT /api/processos/prazos/:prazo_id/concluir — marcar prazo como concluído

router.put('/prazos/:prazo_id/concluir', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE prazos SET concluido = 1 WHERE id = ?').run(req.params.prazo_id);
  res.json({ ok: true });
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
