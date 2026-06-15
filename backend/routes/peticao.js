import express from 'express';
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

  const userPrompt = `Redija uma ${nomePeca} para o seguinte caso:

ÁREA: ${nomeArea}
TRIBUNAL/FORO: ${tribunal || processo?.tribunal || 'Juízo Cível da Comarca'}
${contextoCliente}${contextoProcesso}
FATOS DO CASO:
${fatos}

PEDIDOS ESPECÍFICOS:
${pedidos || 'Proceder conforme o tipo de peça e os fatos expostos'}

INSTRUÇÕES:
1. Antes de redigir, use a busca web para encontrar jurisprudência recente e relevante para este caso
2. Redija a peça completa e formal
3. Inclua os fundamentos legais e jurisprudenciais encontrados
4. Inclua pedido de assistência judiciária gratuita se pertinente
5. Finalize com local, data e identificação da advogada (Dra. Andreia Machado, OAB/RJ 218.586 / OAB/SP 532.488)`;

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
        messages: [{ role: 'user', content: userPrompt }],
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

    // Salvar no histórico
    db.prepare(`
      INSERT OR IGNORE INTO peticoes_geradas (client_id, processo_id, tipo_peca, area, fatos, conteudo, buscas, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(client_id||null, processo_id||null, tipo_peca, area||'civel',
           fatos.substring(0,500), textos, JSON.stringify(buscas), req.user.id);

    res.json({ conteudo: textos, buscas, tokens_usados: data.usage?.output_tokens });

  } catch(e) {
    console.error('Erro geração petição:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/peticao/historico
router.get('/historico', authMiddleware, (req, res) => {
  const db = getDB();
  const historico = db.prepare(`
    SELECT p.*, c.nome as cliente_nome, pr.numero_cnj
    FROM peticoes_geradas p
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN processos pr ON pr.id = p.processo_id
    ORDER BY p.created_at DESC LIMIT 20
  `).all();
  res.json(historico);
});

export default router;
