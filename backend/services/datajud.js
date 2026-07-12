// Mapeamento tribunal → endpoint DataJud
const TRIBUNAL_ENDPOINTS = {
  'TJSP': 'api_publica_tjsp',
  'TJRJ': 'api_publica_tjrj',
  'TJMG': 'api_publica_tjmg',
  'TJRS': 'api_publica_tjrs',
  'TJPR': 'api_publica_tjpr',
  'TJSC': 'api_publica_tjsc',
  'TJBA': 'api_publica_tjba',
  'TJGO': 'api_publica_tjgo',
  'TJPE': 'api_publica_tjpe',
  'TJCE': 'api_publica_tjce',
  'TJMA': 'api_publica_tjma',
  'TJPA': 'api_publica_tjpa',
  'TJAM': 'api_publica_tjam',
  'TJMT': 'api_publica_tjmt',
  'TJMS': 'api_publica_tjms',
  'TJAL': 'api_publica_tjal',
  'TJSE': 'api_publica_tjse',
  'TJRN': 'api_publica_tjrn',
  'TJPB': 'api_publica_tjpb',
  'TJPI': 'api_publica_tjpi',
  'TJTO': 'api_publica_tjto',
  'TJRO': 'api_publica_tjro',
  'TJAC': 'api_publica_tjac',
  'TJAP': 'api_publica_tjap',
  'TJRR': 'api_publica_tjrr',
  'TRF1': 'api_publica_trf1',
  'TRF2': 'api_publica_trf2',
  'TRF3': 'api_publica_trf3',
  'TRF4': 'api_publica_trf4',
  'TRF5': 'api_publica_trf5',
  'TRF6': 'api_publica_trf6',
  'TRT1': 'api_publica_trt1',
  'TRT2': 'api_publica_trt2',
  'TRT3': 'api_publica_trt3',
  'TRT4': 'api_publica_trt4',
  'TRT5': 'api_publica_trt5',
  'TRT6': 'api_publica_trt6',
  'TRT7': 'api_publica_trt7',
  'TRT8': 'api_publica_trt8',
  'TRT9': 'api_publica_trt9',
  'TRT10': 'api_publica_trt10',
  'TRT11': 'api_publica_trt11',
  'TRT12': 'api_publica_trt12',
  'TRT13': 'api_publica_trt13',
  'TRT14': 'api_publica_trt14',
  'TRT15': 'api_publica_trt15',
  'TRT16': 'api_publica_trt16',
  'TRT17': 'api_publica_trt17',
  'TRT18': 'api_publica_trt18',
  'TRT19': 'api_publica_trt19',
  'TRT20': 'api_publica_trt20',
  'TRT21': 'api_publica_trt21',
  'TRT22': 'api_publica_trt22',
  'TRT23': 'api_publica_trt23',
  'TRT24': 'api_publica_trt24',
  'STJ': 'api_publica_stj',
  'STF': 'api_publica_stf',
};

const DATAJUD_API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

export async function consultarProcesso(numeroCNJ, tribunal) {
  const endpoint = TRIBUNAL_ENDPOINTS[tribunal?.toUpperCase()];
  if (!endpoint) {
    return { erro: `Tribunal "${tribunal}" não suportado para consulta automática.` };
  }

  // Limpar número CNJ (remover pontos e traços)
  const numeroLimpo = numeroCNJ.replace(/[.\-]/g, '').trim();

  try {
    // Retry automático em 429 (limite da chave pública compartilhada do CNJ)
    let response;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      response = await fetch(`${BASE_URL}/${endpoint}/_search`, {
      method: 'POST',
      headers: {
        'Authorization': `APIKey ${DATAJUD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: {
          match: {
            numeroProcesso: numeroLimpo
          }
        }
      }),
      });
      if (response.status !== 429) break;
      // 429: espera progressiva (5s, 10s) antes de tentar de novo
      if (tentativa < 3) await new Promise(r => setTimeout(r, tentativa * 5000));
    }

    if (response.status === 429) {
      return { erro: 'Limite temporário do DataJud (429) — nova tentativa no próximo ciclo' };
    }
    if (!response.ok) {
      return { erro: `Erro na consulta: ${response.status}` };
    }

    const data = await response.json();
    const hits = data?.hits?.hits || [];

    if (hits.length === 0) {
      return { erro: 'Processo não encontrado no DataJud.' };
    }

    const processo = hits[0]._source;
    const movimentos = processo.movimentos || [];

    // Pegar últimos 10 movimentos ordenados por data
    const movimentosOrdenados = movimentos
      .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora))
      .slice(0, 10)
      .map(m => ({
        data: m.dataHora,
        descricao: m.nome || m.complementosTabelados?.[0]?.nome || 'Movimentação'
      }));

    return {
      numeroProcesso: processo.numeroProcesso,
      classe: processo.classe?.nome,
      assunto: processo.assuntos?.[0]?.nome,
      tribunal: processo.tribunal?.nome,
      dataAjuizamento: processo.dataAjuizamento,
      movimentos: movimentosOrdenados,
      totalMovimentos: movimentos.length,
    };

  } catch (err) {
    return { erro: `Erro de conexão: ${err.message}` };
  }
}

