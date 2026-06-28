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

═══════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE INTEGRIDADE JURÍDICA — SEM EXCEÇÕES
═══════════════════════════════════════════════════════════

JURISPRUDÊNCIA:
1. PROIBIDO inventar, estimar, parafrasear ou "completar" qualquer decisão judicial. Zero tolerância.
2. Use web search para buscar decisões REAIS. Só cite o que você encontrou e leu no resultado da busca.
3. Toda citação jurisprudencial DEVE conter OBRIGATORIAMENTE:
   - Número CNJ completo do processo (ex: REsp 1.234.567/SP ou 0001234-56.2023.8.26.0100)
   - Nome do relator (ex: Rel. Min. Nancy Andrighi)
   - Data de julgamento (ex: j. 15/03/2024)
   - Órgão julgador (ex: 3ª Turma do STJ)
   - Link direto para o acórdão no formato: [Verificar: URL_ENCONTRADA_NA_BUSCA]
4. Se a busca retornou uma decisão mas SEM o número completo, relator ou data — NÃO cite. Escreva [JURISPRUDÊNCIA PENDENTE] nesse ponto.
5. Se não encontrou nenhuma decisão verificável para fundamentar um ponto — escreva [JURISPRUDÊNCIA PENDENTE — pesquisar em: JusBrasil / STJ / tribunal competente].
6. NUNCA escreva frases como "conforme jurisprudência pacífica" ou "os tribunais têm decidido que" sem citar a decisão concreta e verificável.

LEGISLAÇÃO:
7. Cite artigos de lei com número exato da lei e artigo (ex: art. 35, §1º, da Lei nº 9.656/1998).
8. PROIBIDO citar artigos de lei que não existem ou números errados.

FATOS:
9. Use APENAS os fatos descritos pelo usuário. Não invente detalhes, datas, valores ou circunstâncias não informadas.
10. Se um dado essencial estiver faltando (ex: data exata, valor do contrato), escreva [DADO PENDENTE — confirmar com cliente].

ESTRUTURA:
11. Responda APENAS com o texto da peça processual. Comece diretamente com o endereçamento.
12. Não inclua introduções, listas de fontes, explicações sobre o processo de geração, nem rodapés de verificação fora do corpo da peça.`;

  const userPrompt = `Redija uma ${nomePeca} completa para o caso abaixo.

ÁREA: ${nomeArea}
TRIBUNAL/FORO: ${tribunal || processo?.tribunal || 'Juízo Cível da Comarca'}
${contextoCliente}${contextoProcesso}
FATOS DO CASO:
${fatos}

PEDIDOS ESPECÍFICOS:
${pedidos || 'Proceder conforme o tipo de peça e os fatos expostos'}

INSTRUÇÕES DE EXECUÇÃO:
1. Antes de redigir, use web search para buscar decisões reais sobre: "${nomeArea}" + tema central dos fatos acima.
2. Busque especificamente em: STJ, ${tribunal || 'TJSP'}, JusBrasil, sites de tribunais (.jus.br).
3. Para cada decisão encontrada: confirme número CNJ, relator, data e copie o link exato.
4. Só então redija a peça usando EXCLUSIVAMENTE o que foi encontrado e verificado.
5. Cada citação jurisprudencial deve aparecer no formato:
   (Tribunal, Número CNJ, Rel. Nome do Relator, j. DD/MM/AAAA — [Verificar: URL])
6. Onde não houver decisão verificada: escreva [JURISPRUDÊNCIA PENDENTE — pesquisar em: JusBrasil/tribunal competente].
7. Comece diretamente com o endereçamento da peça.`;

  // Ler arquivos de contexto do cliente (PDFs, imagens)
  const { arquivos_contexto, arquivos_base64 } = req.body;
  const { readFileSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const storageDir = process.env.NODE_ENV === 'production' ? '/app/storage' : join(process.cwd(), '../storage');

  const contentBlocks = [];

  // 1. Arquivos já salvos na pasta do cliente (filename no disco)
  if (arquivos_contexto && arquivos_contexto.length > 0) {
    for (const filename of arquivos_contexto.slice(0, 5)) {
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

  // 2. Arquivos enviados diretamente como base64 (quando não há cliente selecionado)
  if (arquivos_base64 && arquivos_base64.length > 0) {
    for (const arq of arquivos_base64.slice(0, 5)) {
      try {
        if (arq.type === 'application/pdf') {
          contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arq.data } });
        } else if (['image/jpeg','image/png','image/webp'].includes(arq.type)) {
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: arq.type, data: arq.data } });
        }
      } catch(e) { console.error('Erro processando arquivo base64:', arq.name, e.message); }
    }
  }

  contentBlocks.push({ type: 'text', text: userPrompt });

  try {
    // ─── CHAMADA 1: Gerar com web_search ────────────────────────────────────
    const response1 = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response1.ok) {
      const err = await response1.text();
      return res.status(500).json({ error: 'Erro na API de IA: ' + err });
    }

    const data1 = await response1.json();

    // Coletar buscas realizadas
    const buscas = (data1.content || [])
      .filter(b => b.type === 'tool_use' && b.name === 'web_search')
      .map(b => b.input?.query || '')
      .filter(Boolean);

    // A web_search_20250305 executa buscas internamente e retorna tudo em uma só resposta.
    // Pode retornar múltiplos ciclos de tool_use → text dentro do mesmo content[].
    // Precisamos continuar chamando a API enquanto stop_reason === 'tool_use'.
    let textos = '';
    let currentData = data1;
    let messages = [{ role: 'user', content: contentBlocks }];
    let safetyLimit = 5; // evitar loop infinito

    while (currentData.stop_reason === 'tool_use' && safetyLimit-- > 0) {
      // Adicionar resposta do assistente ao histórico
      messages.push({ role: 'assistant', content: currentData.content });

      // Extrair os tool_use blocks e montar os tool_result correspondentes
      // A web_search já retornou os resultados dentro do próprio bloco (server_tool_use)
      // Precisamos confirmar cada tool_use com um tool_result vazio para continuar
      const toolResults = (currentData.content || [])
        .filter(b => b.type === 'tool_use' || b.type === 'server_tool_use')
        .map(b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: b.output ? JSON.stringify(b.output) : '[]',
        }));

      if (toolResults.length === 0) break;

      messages.push({ role: 'user', content: toolResults });

      const responseNext = await fetch('https://api.anthropic.com/v1/messages', {
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
          messages,
        }),
      });

      if (!responseNext.ok) {
        const err = await responseNext.text();
        return res.status(500).json({ error: 'Erro na continuação da API de IA: ' + err });
      }

      currentData = await responseNext.json();
    }

    // Coletar todos os blocos de texto da resposta final
    textos = (currentData.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n\n');

    // Se ainda vazio, coletar de todas as mensagens do assistente no histórico
    if (!textos || textos.trim().length < 100) {
      textos = messages
        .filter(m => m.role === 'assistant')
        .flatMap(m => (m.content || []).filter(b => b.type === 'text').map(b => b.text))
        .join('\n\n');
    }

    if (!textos || textos.trim().length < 100) {
      return res.status(500).json({ error: 'A IA não retornou conteúdo suficiente. Tente novamente.' });
    }

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

    res.json({ conteudo: textos, buscas, peticaoId });

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
