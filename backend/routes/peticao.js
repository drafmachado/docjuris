import express from 'express';
import { gerarPeticaoDocx } from '../services/peticaoDocx.js';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// POST /api/peticao/gerar
router.post('/gerar', authMiddleware, async (req, res) => {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API de IA não configurada' });

  const db = getDB();
  const { client_id, processo_id, tipo_peca, area, fatos, pedidos, tribunal } = req.body;

  if (!tipo_peca || !fatos) return res.status(400).json({ error: 'tipo_peca e fatos são obrigatórios' });

  // Buscar dados do cliente
  const cliente = client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id) : null;

  // Buscar dados do processo e andamentos
  let processo = null;
  let andamentos = [];
  if (processo_id) {
    processo = db.prepare('SELECT * FROM processos WHERE id = ?').get(processo_id);
    andamentos = db.prepare('SELECT * FROM andamentos WHERE processo_id = ? ORDER BY data DESC LIMIT 10').all(processo_id);
  }

  // Montar contexto do caso
  const contextoCliente = cliente ? `
DADOS DO CLIENTE:
- Nome: ${cliente.nome}
- CPF: ${cliente.cpf || 'não informado'}
- Endereço: ${[cliente.endereco, cliente.cidade, cliente.estado].filter(Boolean).join(', ') || 'não informado'}
` : '';

  const contextoProcesso = processo ? `
DADOS DO PROCESSO:
- Número CNJ: ${processo.numero_cnj}
- Tribunal: ${processo.tribunal}
- Polo Ativo: ${processo.polo_ativo || cliente?.nome || 'não informado'}
- Polo Passivo: ${processo.polo_passivo || 'não informado'}
- Últimos andamentos: ${andamentos.slice(0,5).map(a => `${a.data}: ${a.descricao}`).join(' | ')}
` : '';

  const TIPOS = {
    'liminar': 'Pedido de Tutela de Urgência (Liminar)',
    'peticao_inicial': 'Petição Inicial',
    'contestacao': 'Contestação',
    'recurso_apelacao': 'Recurso de Apelação',
    'embargos': 'Embargos de Declaração',
    'manifestacao': 'Manifestação/Impugnação',
    'recurso_inominado': 'Recurso Inominado (JEC)',
    'agravo': 'Agravo Regimental',
  };

  const AREAS = {
    'medico': 'Direito Médico e da Saúde (planos de saúde, negativas de cobertura, procedimentos, medicamentos)',
    'inventarios': 'Direito das Sucessões (inventário, partilha, herança)',
    'civel': 'Direito Civil (responsabilidade civil, contratos, danos)',
  };

  const nomePeca = TIPOS[tipo_peca] || tipo_peca;
  const nomeArea = AREAS[area] || area || 'Direito Civil';

  const systemPrompt = `Você é a Dra. Andreia Machado, advogada especialista em ${nomeArea}, inscrita na OAB/RJ 218.586 e OAB/SP 532.488, com escritório em São Paulo e Rio de Janeiro.

Você deve redigir peças processuais completas, tecnicamente precisas e estratégicas, seguindo rigorosamente as normas do Direito brasileiro.

REGRAS OBRIGATÓRIAS:
1. Use web search para buscar jurisprudência REAL e RECENTE (últimos 2 anos) dos tribunais relevantes — nunca invente decisões
2. Cite os acórdãos com número completo (ex: STJ, REsp 1.234.567/SP, Rel. Min. Nome, j. 00/00/0000)
3. Cite artigos de lei com número exato
4. Estruture a peça com todos os requisitos formais (endereçamento, qualificação, fatos, direito, pedidos, valor da causa)
5. Linguagem técnica mas objetiva
6. Adapte ao tribunal e área informados`;

  const userPrompt = `CASO PARA REDAÇÃO DE ${nomePeca.toUpperCase()}

ÁREA: ${nomeArea}
TRIBUNAL/FORO: ${tribunal || processo?.tribunal || 'Juízo Cível da Comarca'}
${contextoCliente}${contextoProcesso}
FATOS DO CASO:
${fatos}

PEDIDOS ESPECÍFICOS:
${pedidos || 'Proceder conforme o tipo de peça e os fatos expostos'}

PASSO 1 — PESQUISE AGORA (obrigatório antes de redigir):
Execute pelo menos 3 buscas web com termos específicos para este caso.
Identifique decisões reais com número completo, relator e data.
Anote quais fontes confirmaram cada decisão.

PASSO 2 — REDIJA a ${nomePeca} completa usando APENAS o que foi encontrado no Passo 1.
Onde não houver jurisprudência verificada, escreva: [JURISPRUDÊNCIA PENDENTE — inserir manualmente]

PASSO 3 — Ao final, liste todas as citações usadas e onde cada uma foi encontrada.`;

  // Ler arquivos de contexto do cliente (PDFs, imagens)
  const { arquivos_contexto } = req.body;
  const { readFileSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const storageDir = process.env.NODE_ENV === 'production' ? '/app/storage' : join(process.cwd(), '../storage');

  const contentBlocks = [];
  if (arquivos_contexto && arquivos_contexto.length > 0) {
    for (const filename of arquivos_contexto.slice(0, 3)) { // máx 3 arquivos
      const filePath = join(storageDir, 'client_files', filename);
      if (!existsSync(filePath)) continue;
      try {
        const fileData = readFileSync(filePath);
        const ext = filename.split('.').pop().toLowerCase();
        if (['pdf'].includes(ext)) {
          contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData.toString('base64') } });
        } else if (['jpg','jpeg','png','webp'].includes(ext)) {
          const mt = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data: fileData.toString('base64') } });
        }
      } catch(e) { console.error('Erro lendo arquivo contexto:', filename, e.message); }
    }
  }
  contentBlocks.push({ type: 'text', text: userPrompt });

  try {
    // Usar streaming para resposta longa — ou await direto
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Erro na API de IA: ' + err });
    }

    const data = await response.json();

    // Coletar todo o texto gerado (incluindo após tool_use)
    const textos = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n\n');

    // Identificar fontes usadas (web search queries)
    const buscas = (data.content || [])
      .filter(b => b.type === 'tool_use' && b.name === 'web_search')
      .map(b => b.input?.query || '')
      .filter(Boolean);

    // Salvar na tabela peticoes se client_id informado
    let peticaoId = null;
    if (client_id) {
      const TIPOS_LABEL = {
        'liminar':'Tutela de Urgência','peticao_inicial':'Petição Inicial',
        'contestacao':'Contestação','recurso_apelacao':'Apelação',
        'embargos':'Embargos','manifestacao':'Manifestação',
        'recurso_inominado':'Recurso Inominado','agravo':'Agravo',
      };
      const titulo = `${TIPOS_LABEL[tipo_peca]||tipo_peca} — ${new Date().toLocaleDateString('pt-BR')}`;
      const r2 = db.prepare(`
        INSERT INTO peticoes (client_id, processo_id, titulo, tipo_peca, area, fatos, pedidos, tribunal, conteudo, buscas, arquivos_contexto, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(client_id, processo_id||null, titulo, tipo_peca, area||'civel',
             fatos, pedidos||null, tribunal||null, textos, JSON.stringify(buscas),
             JSON.stringify(arquivos_contexto||[]), req.user.id);
      peticaoId = r2.lastInsertRowid;
    }

    res.json({ conteudo: textos, buscas, tokens_usados: data.usage?.output_tokens, peticaoId });

  } catch(e) {
    console.error('Erro geração petição:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/peticao/historico (legado)
router.get('/historico', authMiddleware, (req, res) => {
  const db = getDB();
  const historico = db.prepare(`
    SELECT p.*, c.nome as cliente_nome, pr.numero_cnj
    FROM peticoes p
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN processos pr ON pr.id = p.processo_id
    ORDER BY p.created_at DESC LIMIT 20
  `).all();
  res.json(historico);
});

// GET /api/peticao/cliente/:id — listar petições de um cliente
router.get('/cliente/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const peticoes = db.prepare(`
    SELECT p.*, pr.numero_cnj
    FROM peticoes p
    LEFT JOIN processos pr ON pr.id = p.processo_id
    WHERE p.client_id = ?
    ORDER BY p.updated_at DESC
  `).all(req.params.id);
  res.json(peticoes);
});

// GET /api/peticao/:id — buscar petição específica
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const pet = db.prepare('SELECT * FROM peticoes WHERE id = ?').get(req.params.id);
  if (!pet) return res.status(404).json({ error: 'Petição não encontrada' });
  res.json(pet);
});

// POST /api/peticao/salvar — salvar petição na pasta do cliente
router.post('/salvar', authMiddleware, (req, res) => {
  const db = getDB();
  const { client_id, processo_id, titulo, tipo_peca, area, fatos, pedidos, tribunal, conteudo, buscas, arquivos_contexto } = req.body;
  if (!client_id || !conteudo) return res.status(400).json({ error: 'client_id e conteudo são obrigatórios' });
  const r = db.prepare(`
    INSERT INTO peticoes (client_id, processo_id, titulo, tipo_peca, area, fatos, pedidos, tribunal, conteudo, buscas, arquivos_contexto, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(client_id, processo_id||null, titulo||'Petição', tipo_peca||'outro', area||'civel',
         fatos||null, pedidos||null, tribunal||null, conteudo, JSON.stringify(buscas||[]),
         JSON.stringify(arquivos_contexto||[]), req.user.id);
  res.json({ id: r.lastInsertRowid });
});

// PUT /api/peticao/:id — atualizar conteúdo (edição)
router.put('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const { titulo, conteudo } = req.body;
  const pet = db.prepare('SELECT id FROM peticoes WHERE id = ?').get(req.params.id);
  if (!pet) return res.status(404).json({ error: 'Petição não encontrada' });
  db.prepare(`UPDATE peticoes SET titulo=COALESCE(?,titulo), conteudo=COALESCE(?,conteudo), updated_at=datetime('now') WHERE id=?`)
    .run(titulo||null, conteudo||null, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/peticao/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM peticoes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/peticao/:id/download/docx — baixar como Word
router.get('/:id/download/docx', authMiddleware, async (req, res) => {
  const db = getDB();
  const pet = db.prepare('SELECT p.*, c.nome as cliente_nome FROM peticoes p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?').get(req.params.id);
  if (!pet) return res.status(404).json({ error: 'Petição não encontrada' });

  try {
    const buffer = await gerarPeticaoDocx(pet, { nome: pet.cliente_nome });
    const filename = `${pet.titulo || 'peticao'}.docx`.replace(/[^a-zA-Z0-9À-ú\s._-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch(e) {
    console.error('Erro gerando DOCX:', e);
    res.status(500).json({ error: 'Erro ao gerar Word: ' + e.message });
  }
});

export default router;
