import express from 'express';
import { gerarPeticaoDocx } from '../services/peticaoDocx.js';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ─── Job store em memória para geração assíncrona ───────────────────────────
// Cloudflare corta requisições > 100s; a geração leva 60-120s.
// Solução: POST retorna jobId na hora, frontend consulta status a cada 3s.
const jobs = new Map();

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > 15 * 60 * 1000) jobs.delete(id); // 15 min
  }
}
setInterval(cleanupJobs, 5 * 60 * 1000);

// POST /api/peticao/gerar — inicia geração assíncrona, retorna jobId imediatamente
router.post('/gerar', authMiddleware, (req, res) => {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API de IA não configurada' });

  const { tipo_peca, fatos } = req.body;
  if (!tipo_peca || !fatos) return res.status(400).json({ error: 'tipo_peca e fatos são obrigatórios' });

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  jobs.set(jobId, { status: 'processing', createdAt: Date.now() });

  // Dispara a geração em background — NÃO await
  gerarPeticaoAsync(jobId, req.body, req.user).catch(e => {
    console.error('Erro job petição:', e);
    jobs.set(jobId, { status: 'error', error: e.message, createdAt: Date.now() });
  });

  res.json({ jobId });
});

// GET /api/peticao/gerar/status/:jobId — consulta status da geração
router.get('/gerar/status/:jobId', authMiddleware, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job não encontrado ou expirado' });
  res.json(job);
});

// POST /api/peticao/perguntar — responde dúvidas sobre a peça SEM modificá-la (job assíncrono)
router.post('/perguntar', authMiddleware, (req, res) => {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API de IA não configurada' });

  const { conteudo, pergunta } = req.body;
  if (!conteudo || !pergunta) return res.status(400).json({ error: 'conteudo e pergunta são obrigatórios' });

  const jobId = 'pg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  jobs.set(jobId, { status: 'processing', createdAt: Date.now() });

  perguntarPeticaoAsync(jobId, req.body).catch(e => {
    console.error('Erro job pergunta:', e);
    jobs.set(jobId, { status: 'error', error: e.message, createdAt: Date.now() });
  });

  res.json({ jobId });
});

// Responde a pergunta em background
async function perguntarPeticaoAsync(jobId, body) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const { conteudo, pergunta } = body;

  const systemPrompt = `Você é a Dra. Andreia Machado, advogada experiente (OAB/RJ 218.586, OAB/SP 532.488), explicando o raciocínio jurídico de uma peça processual para uma colega.

REGRAS:
1. Responda a pergunta de forma DIRETA e objetiva — vá direto ao ponto na primeira frase.
2. Explique o fundamento jurídico: qual lei, súmula ou estratégia justifica o ponto questionado.
3. Se a pergunta envolver jurisprudência ou norma que você não tem certeza, use web search para verificar antes de afirmar.
4. Seja honesta sobre incertezas: se um ponto da peça for discutível ou tiver riscos, diga claramente.
5. Se identificar um ERRO real na peça ao analisar a pergunta, aponte-o e sugira a correção (mas NÃO reescreva a peça — apenas explique).
6. Responda em português, tom profissional entre colegas, sem juridiquês desnecessário.
7. Máximo ~300 palavras, a menos que a pergunta exija mais profundidade.`;

  const userPrompt = `PEÇA PROCESSUAL EM ANÁLISE:

${conteudo}

═══════════════════════════════════════
PERGUNTA DA ADVOGADA:
${pergunta}
═══════════════════════════════════════

Responda a pergunta sobre a peça acima. NÃO reescreva a peça — apenas explique, fundamente ou aponte riscos.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      jobs.set(jobId, { status: 'error', error: 'Erro na API de IA: ' + err, createdAt: Date.now() });
      return;
    }

    const data = await response.json();
    const resposta = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n\n');

    if (!resposta || resposta.trim().length < 10) {
      jobs.set(jobId, { status: 'error', error: 'A IA não retornou resposta. Tente novamente.', createdAt: Date.now() });
      return;
    }

    jobs.set(jobId, { status: 'done', resposta, createdAt: Date.now() });

  } catch(e) {
    console.error('Erro pergunta petição:', e);
    jobs.set(jobId, { status: 'error', error: e.message, createdAt: Date.now() });
  }
}

// POST /api/peticao/ajustar — ajusta peça existente conforme instruções (job assíncrono)
router.post('/ajustar', authMiddleware, (req, res) => {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API de IA não configurada' });

  const { conteudo, instrucao } = req.body;
  if (!conteudo || !instrucao) return res.status(400).json({ error: 'conteudo e instrucao são obrigatórios' });

  const jobId = 'aj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  jobs.set(jobId, { status: 'processing', createdAt: Date.now() });

  ajustarPeticaoAsync(jobId, req.body).catch(e => {
    console.error('Erro job ajuste:', e);
    jobs.set(jobId, { status: 'error', error: e.message, createdAt: Date.now() });
  });

  res.json({ jobId });
});

// Executa o ajuste da peça em background
async function ajustarPeticaoAsync(jobId, body) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const db = getDB();
  const { conteudo, instrucao, peticaoId } = body;

  const systemPrompt = `Você é a Dra. Andreia Machado, advogada (OAB/RJ 218.586, OAB/SP 532.488). Sua tarefa é REVISAR uma peça processual existente aplicando exatamente os ajustes solicitados.

REGRAS ABSOLUTAS:
1. Aplique SOMENTE os ajustes solicitados. Todo o restante da peça deve permanecer EXATAMENTE como está — mesmas palavras, mesma estrutura, mesmas citações.
2. Se o ajuste exigir nova jurisprudência, use web search para buscar decisões REAIS. Toda citação nova DEVE ter: número CNJ completo, relator, data de julgamento, órgão julgador e link no formato [Verificar: URL]. Sem esses dados, escreva [JURISPRUDÊNCIA PENDENTE].
3. PROIBIDO inventar decisões, artigos de lei inexistentes ou fatos não informados.
4. Se a instrução for ambígua, aplique a interpretação mais conservadora juridicamente.
5. Responda APENAS com o texto INTEGRAL da peça revisada, do endereçamento ao final. Sem comentários, sem explicações do que mudou, sem introduções.
6. ENDEREÇO PROFISSIONAL das advogadas: se a Dra. Andreia estiver entre as subscritas, use 'Av. Presidente Kennedy, 3700 - Boa Vista - São Caetano do Sul/SP, CEP 09.572-015'. Se apenas a Dra. Thaísa subscrever, use 'Rua Geminiano de Góis, nº 350 - Freguesia - Rio de Janeiro/RJ'. Nunca invente outro endereço.`;

  const userPrompt = `PEÇA ATUAL:

${conteudo}

═══════════════════════════════════════
AJUSTES SOLICITADOS PELA ADVOGADA:
${instrucao}
═══════════════════════════════════════

Reescreva a peça COMPLETA aplicando os ajustes acima. Mantenha intacto tudo que não foi mencionado nos ajustes.`;

  try {
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
      jobs.set(jobId, { status: 'error', error: 'Erro na API de IA: ' + err, createdAt: Date.now() });
      return;
    }

    const data = await response.json();

    const buscas = (data.content || [])
      .filter(b => (b.type === 'server_tool_use' || b.type === 'tool_use') && b.name === 'web_search')
      .map(b => b.input?.query || '')
      .filter(Boolean);

    const textos = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n\n');

    if (!textos || textos.trim().length < 100) {
      jobs.set(jobId, { status: 'error', error: 'A IA não retornou a peça revisada. Tente novamente.', createdAt: Date.now() });
      return;
    }

    // Se a peça está salva, atualiza no banco (mantém a biblioteca de conhecimento alimentada)
    if (peticaoId) {
      try {
        db.prepare(`UPDATE peticoes SET conteudo = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(textos, peticaoId);
      } catch(e) { /* atualização é bônus — não falhar o ajuste */ }
    }

    jobs.set(jobId, { status: 'done', conteudo: textos, buscas, peticaoId: peticaoId || null, createdAt: Date.now() });

  } catch(e) {
    console.error('Erro ajuste petição:', e);
    jobs.set(jobId, { status: 'error', error: e.message, createdAt: Date.now() });
  }
}

// Função que executa a geração de fato (em background)
async function gerarPeticaoAsync(jobId, body, user) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const db = getDB();
  const { client_id, processo_id, tipo_peca, area, fatos, pedidos, tribunal } = body;

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

  // ─── Biblioteca de conhecimento: peças anteriores validadas pela advogada ──
  // Peças com updated_at > created_at foram revisadas/editadas = aprovadas.
  // Suas citações e estrutura servem de referência para peças futuras da mesma área.
  let bibliotecaConhecimento = '';
  try {
    const pecasValidadas = db.prepare(`
      SELECT conteudo FROM peticoes
      WHERE area = ? AND tipo_peca = ? AND updated_at > created_at
      ORDER BY updated_at DESC LIMIT 2
    `).all(area || 'civel', tipo_peca);

    if (pecasValidadas.length > 0) {
      // Extrair citações jurisprudenciais das peças validadas (linhas com REsp, AgInt, Apelação, nº CNJ)
      const citacoes = new Set();
      for (const p of pecasValidadas) {
        const matches = (p.conteudo || '').match(/[^\n]*(?:REsp|AgInt|AREsp|Apela[çc][ãa]o|Agravo)[^\n]{20,200}/g) || [];
        matches.slice(0, 5).forEach(m => citacoes.add(m.trim()));
      }
      if (citacoes.size > 0) {
        bibliotecaConhecimento = `

JURISPRUDÊNCIA JÁ VALIDADA PELO ESCRITÓRIO EM PEÇAS ANTERIORES (verifique se ainda pertinente e reutilize quando aplicável):
${[...citacoes].slice(0, 8).map(c => '- ' + c).join('\n')}`;
      }
    }
  } catch(e) { /* biblioteca é opcional — não falhar a geração */ }

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
    'jec': 'Juizado Especial Cível — Lei 9.099/95 (causas até 40 salários mínimos, rito sumaríssimo)',
  };

  // ─── Conhecimento especialista por área ─────────────────────────────────
  const ESPECIALISTA = {
    'medico': `
VOCÊ É ESPECIALISTA EM DIREITO MÉDICO E DA SAÚDE. Domine e aplique:
- Lei 9.656/98 (planos de saúde): art. 12 (coberturas mínimas), art. 35-C (urgência/emergência), art. 13 (rescisão unilateral)
- Lei 14.454/2022: rol da ANS é EXEMPLIFICATIVO — cobertura obrigatória se há eficácia comprovada, recomendação CONITEC ou órgão internacional
- RN 465/2021 ANS e atualizações do rol
- Súmula 608/STJ: CDC aplica-se aos planos de saúde (exceto autogestão)
- Súmula 609/STJ: recusa de cobertura por doença preexistente é ilícita sem exame prévio
- Tema 990/STJ: reembolso fora da rede credenciada
- CDC arts. 6º, 14, 39, 51 (cláusulas abusivas em contratos de saúde)
- Jurisprudência consolidada: prazo máximo de resposta da operadora (RN 259), multa diária em obrigação de fazer, dano moral in re ipsa em negativas indevidas de tratamento urgente
- Tutela de urgência em saúde: perigo de dano irreparável à vida/saúde justifica liminar inaudita altera parte (art. 300 CPC)
- Medicamentos de alto custo, home care, cirurgias, próteses (Súmula 93 TJSP para stents)`,
    'inventarios': `
VOCÊ É ESPECIALISTA EM DIREITO DAS SUCESSÕES E INVENTÁRIO. Domine e aplique:
- CPC arts. 610-673: inventário judicial e extrajudicial, arrolamento sumário (art. 659) e comum (art. 664)
- Resolução CNJ 35/2007: inventário extrajudicial (consenso + capazes + testamento inexistente ou homologado)
- CC arts. 1.784-2.027: ordem de vocação hereditária, herança legítima e testamentária, colação, sonegados
- ITCMD: alíquotas estaduais (RJ: Lei 7.174/2015; SP: Lei 10.705/2000), prazos de recolhimento, isenções
- Cessão de direitos hereditários (CC art. 1.793): escritura pública obrigatória
- Sobrepartilha (CPC art. 669), alvará judicial (Lei 6.858/80) para valores de até 500 OTNs
- Nomeação de inventariante (CPC art. 617 — ordem legal), remoção (art. 622)
- Prazo de abertura: 2 meses do óbito (CPC art. 611), multa ITCMD por atraso conforme lei estadual
- Meação do cônjuge vs. herança: regime de bens determina o que é meado e o que é herdado
- Herdeiros menores/incapazes: intervenção obrigatória do MP (CPC art. 178, II)`,
    'civel': `
VOCÊ É ESPECIALISTA EM DIREITO CIVIL E JUIZADOS ESPECIAIS CÍVEIS (JEC). Domine e aplique:
- Lei 9.099/95: competência até 40 SM (art. 3º), dispensa de advogado até 20 SM (art. 9º), impossibilidade de perícia complexa, ausência de custas em 1º grau (art. 54-55), recurso inominado (art. 41-46)
- Enunciados FONAJE atualizados (especialmente sobre competência, revelia, provas)
- CDC: inversão do ônus da prova (art. 6º VIII), responsabilidade objetiva do fornecedor (art. 14), práticas abusivas (art. 39), cobrança indevida com repetição em dobro (art. 42 § único)
- Súmula 385/STJ: negativação preexistente legítima afasta dano moral
- Tema 929/STJ: dano moral por inscrição indevida — desnecessidade de prova do prejuízo (in re ipsa)
- Telecom/consumo: falha na portabilidade, cobrança pós-cancelamento, negativação indevida — responsabilidade solidária das operadoras envolvidas (CDC art. 7º § único e art. 25 §1º)
- Correção monetária e juros: Tema 112 STJ, taxa SELIC (CC art. 406 c/c EC 113/2021)
- Valor da causa no JEC limita a condenação (art. 3º §3º Lei 9.099/95) — atenção ao teto`,
  };
  ESPECIALISTA['jec'] = `
VOCÊ É ESPECIALISTA EM JUIZADOS ESPECIAIS CÍVEIS (Lei 9.099/95). Domine e aplique com rigor:
- Competência: causas até 40 salários mínimos (art. 3º); acima de 20 SM exige advogado (art. 9º); renúncia ao excedente do teto (art. 3º §3º)
- VEDAÇÕES no JEC: perícia complexa, causas de estado/capacidade, alimentos, falência, fazenda pública (usar JEFaz — Lei 12.153/09)
- Rito: petição inicial simplificada (art. 14 — pedido e fundamentos de forma simples), audiência de conciliação obrigatória, revelia pela ausência do réu (art. 20)
- Sem custas nem honorários em 1º grau (art. 54-55); custas apenas no recurso inominado
- Recurso inominado: prazo 10 dias, preparo obrigatório em 48h sob pena de deserção (art. 42), julgamento por Turma Recursal
- Embargos de declaração interrompem prazo (art. 50, redação Lei 13.105/15)
- Enunciados FONAJE: aplicar os consolidados (citação por WhatsApp, dispensa de contador, limites de prova testemunhal — 3 por fato)
- Execução no próprio JEC (art. 52-53): penhora online, multa do art. 523 CPC aplicável (Enunciado 97 FONAJE)
- CDC combinado: inversão do ônus (art. 6º VIII), responsabilidade objetiva (art. 14), repetição em dobro (art. 42 § único)
- Dano moral no JEC: pedido líquido recomendado, Súmula 385/STJ (negativação preexistente), Tema 929/STJ (in re ipsa na inscrição indevida)
- Linguagem: peça DIRETA e OBJETIVA — juízes de JEC valorizam concisão; evitar dissertações doutrinárias longas`;

  const conhecimentoEspecialista = ESPECIALISTA[area] || ESPECIALISTA['civel'];

  const nomePeca = TIPOS[tipo_peca] || tipo_peca;
  const nomeArea = AREAS[area] || area || 'Direito Civil';

  // Identidade conforme advogadas atuantes no cadastro do cliente
  const modoAdv = (cliente && cliente.advogadas) || 'ambas';
  const IDENTIDADES = {
    'andreia': 'Você é a Dra. Andreia Ferreira Machado, advogada (OAB/RJ 218.586, OAB/SP 532.488). A peça é subscrita APENAS por você.',
    'thaisa':  'Você é a Dra. Thaisa de Souza da Silva, advogada (OAB/RJ 226.810). A peça é subscrita APENAS por você.',
    'ambas':   'Você redige em nome das advogadas Dra. Andreia Ferreira Machado (OAB/RJ 218.586, OAB/SP 532.488) e Dra. Thaisa de Souza da Silva (OAB/RJ 226.810), que atuam em conjunto. A peça é subscrita pelas DUAS.',
  };
  const ASSINATURAS_PECA = {
    'andreia': 'ANDREIA FERREIRA MACHADO\nOAB/RJ 218.586 | OAB/SP 532.488',
    'thaisa':  'THAISA DE SOUZA DA SILVA\nOAB/RJ 226.810',
    'ambas':   'ANDREIA FERREIRA MACHADO\nOAB/RJ 218.586 | OAB/SP 532.488\n\nTHAISA DE SOUZA DA SILVA\nOAB/RJ 226.810',
  };

  // Endereço profissional na qualificação: com Andreia entre as subscritas → São Caetano do Sul/SP;
  // apenas Thaísa → escritório do Rio de Janeiro.
  const ENDERECOS_PECA = {
    'andreia': 'Av. Presidente Kennedy, 3700 - Boa Vista - São Caetano do Sul/SP, CEP 09.572-015',
    'ambas':   'Av. Presidente Kennedy, 3700 - Boa Vista - São Caetano do Sul/SP, CEP 09.572-015',
    'thaisa':  'Rua Geminiano de Góis, nº 350 - Freguesia - Rio de Janeiro/RJ',
  };

  const systemPrompt = `${IDENTIDADES[modoAdv]} Especialista em ${nomeArea}, com escritório em São Paulo e Rio de Janeiro.

ENDEREÇO PROFISSIONAL: sempre que a peça exigir o endereço da(s) advogada(s)/outorgada(s)/patrona(s) — na qualificação, no cabeçalho ou onde for solicitado — use EXATAMENTE este endereço, sem inventar outro:
${ENDERECOS_PECA[modoAdv]}

AO FINAL DA PEÇA, o bloco de assinatura deve ser exatamente:
${ASSINATURAS_PECA[modoAdv]}

${conhecimentoEspecialista}

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
${bibliotecaConhecimento}

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
  const { arquivos_contexto, arquivos_base64 } = body;
  const { readFileSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const storageDir = process.env.NODE_ENV === 'production' ? '/app/storage' : join(process.cwd(), '../storage');

  const contentBlocks = [];

  // 1. Arquivos já salvos na pasta do cliente (filename no disco)
  if (arquivos_contexto && arquivos_contexto.length > 0) {
    for (const filename of arquivos_contexto.slice(0, 20)) {
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
    for (const arq of arquivos_base64.slice(0, 20)) {
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
      jobs.set(jobId, { status: 'error', error: 'Erro na API de IA: ' + err, createdAt: Date.now() });
      return;
    }

    const data1 = await response1.json();

    // A web_search_20250305 é uma ferramenta SERVER-SIDE: a própria API da Anthropic
    // executa as buscas internamente e retorna o resultado final em UMA única resposta.
    // Não precisamos (nem podemos) devolver tool_result manualmente.
    // O content[] já contém: server_tool_use (buscas), web_search_tool_result e text (peça final).

    // Coletar as queries de busca realizadas (para exibir ao usuário)
    const buscas = (data1.content || [])
      .filter(b => (b.type === 'server_tool_use' || b.type === 'tool_use') && b.name === 'web_search')
      .map(b => b.input?.query || '')
      .filter(Boolean);

    // Coletar todo o texto gerado (a peça final)
    let textos = (data1.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n\n');

    if (!textos || textos.trim().length < 100) {
      // Log para diagnóstico — mostra o que a API retornou de fato
      console.error('Petição vazia. stop_reason:', data1.stop_reason,
        '| tipos de bloco:', (data1.content || []).map(b => b.type).join(', '),
        '| erro:', data1.error ? JSON.stringify(data1.error) : 'nenhum');
      jobs.set(jobId, { status: 'error',
        error: 'A IA não retornou conteúdo (' + (data1.stop_reason || 'sem stop_reason') + '). Tente novamente.',
        createdAt: Date.now() });
      return;
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
             JSON.stringify(arquivos_contexto||[]), user.id);
      peticaoId = r2.lastInsertRowid;
    }

    jobs.set(jobId, {
      status: 'done',
      conteudo: textos,
      buscas,
      peticaoId,
      createdAt: Date.now(),
    });

  } catch(e) {
    console.error('Erro geração petição:', e);
    jobs.set(jobId, { status: 'error', error: e.message, createdAt: Date.now() });
  }
}

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

// GET /api/peticao/:id/download/pdf — baixar como PDF (converte via LibreOffice)
router.get('/:id/download/pdf', authMiddleware, async (req, res) => {
  const db = getDB();
  const pet = db.prepare('SELECT p.*, c.nome as cliente_nome FROM peticoes p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?').get(req.params.id);
  if (!pet) return res.status(404).json({ error: 'Petição não encontrada' });

  try {
    const { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } = await import('fs');
    const { join } = await import('path');
    const { execSync } = await import('child_process');
    const os = await import('os');

    const buffer = await gerarPeticaoDocx(pet, { nome: pet.cliente_nome });
    const tmpDir = join(os.tmpdir(), 'peticao_pdf');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const base = `pet_${pet.id}_${Date.now()}`;
    const docxPath = join(tmpDir, base + '.docx');
    const pdfPath = join(tmpDir, base + '.pdf');
    writeFileSync(docxPath, buffer);

    let converted = false;
    for (const cmd of ['soffice', 'libreoffice']) {
      try {
        execSync(`${cmd} --headless --convert-to pdf --outdir "${tmpDir}" "${docxPath}"`, { timeout: 60000, stdio: 'pipe' });
        if (existsSync(pdfPath)) { converted = true; break; }
      } catch(e) { /* tenta o próximo */ }
    }

    if (!converted) return res.status(500).json({ error: 'Conversão para PDF indisponível no servidor' });

    const pdfBuffer = readFileSync(pdfPath);
    try { unlinkSync(docxPath); unlinkSync(pdfPath); } catch(e) {}

    const filename = `${pet.titulo || 'peticao'}.pdf`.replace(/[^a-zA-Z0-9À-ú\s._-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch(e) {
    console.error('Erro gerando PDF:', e);
    res.status(500).json({ error: 'Erro ao gerar PDF: ' + e.message });
  }
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







