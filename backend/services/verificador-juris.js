// backend/services/verificador-juris.js
// ═══════════════════════════════════════════════════════════════════════════
// VALIDADOR MECÂNICO DE CITAÇÕES JURÍDICAS
// A IA pode alucinar julgados mesmo instruída a não fazê-lo. Este módulo
// impede que isso chegue à peça: TODA citação (REsp, Tema, Súmula, nº CNJ,
// URL) é conferida contra as fontes REAIS retornadas pela busca — blocos
// web_search_tool_result gerados pelo servidor, que a IA não consegue forjar.
// O que não constar das fontes é REMOVIDO e substituído por
// [JURISPRUDÊNCIA PENDENTE]. Nenhuma citação não verificada sobrevive.
// ═══════════════════════════════════════════════════════════════════════════

// Extrai as fontes reais da resposta da API (urls + títulos dos resultados de busca)
export function extrairFontes(content) {
  const urls = [];
  const titulos = [];
  for (const bloco of (content || [])) {
    if (bloco.type !== 'web_search_tool_result') continue;
    const resultados = Array.isArray(bloco.content) ? bloco.content : [];
    for (const r of resultados) {
      if (r?.url) urls.push(String(r.url));
      if (r?.title) titulos.push(String(r.title));
    }
  }
  const corpus = (urls.join(' ') + ' ' + titulos.join(' ')).toLowerCase();
  // Versão só-dígitos para casar números com/sem pontuação (1.704.520 ≡ 1704520)
  const corpusDigitos = corpus.replace(/[.\-\/\s]/g, '');
  return { urls, titulos, corpus, corpusDigitos, temBusca: urls.length > 0 };
}

const normUrl = u => String(u || '')
  .replace(/^https?:\/\//, '').replace(/^www\./, '')
  .replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

// Valida o texto da peça contra as fontes. Retorna { texto, confirmadas, removidas }.
export function validarJurisprudencia(texto, fontes) {
  const confirmadas = [];
  const removidas = [];
  let t = String(texto || '');
  const PEND = '[JURISPRUDÊNCIA PENDENTE]';

  const urlsNorm = new Set((fontes.urls || []).map(normUrl));

  const confirmaDigitos = (dig) => dig.length >= 4 && fontes.corpusDigitos.includes(dig);
  const confirmaContexto = (palavra, num) =>
    new RegExp(`${palavra}[\\s.ºo°n]*${num}\\b`, 'i').test(fontes.corpus.replace(/[.]/g, ''));

  // ── 1. [Verificar: URL] — a URL precisa ter vindo da busca real ──
  t = t.replace(/\[\s*Verificar:\s*(https?:\/\/[^\]\s]+)\s*\]/gi, (m, url) => {
    if (urlsNorm.has(normUrl(url))) {
      confirmadas.push({ tipo: 'url', ref: url });
      return m; // mantém
    }
    removidas.push({ tipo: 'url', ref: url, motivo: 'URL não veio das buscas realizadas' });
    return ''; // remove o marcador com URL inventada
  });

  // ── 2. Recursos e classes (REsp, AREsp, AgInt, RE, HC, etc.) ──
  t = t.replace(
    /\b(REsp|AREsp|EREsp|EDcl|AgInt|AgRg|RE|ARE|RHC|HC|RMS|MS|Rcl|AI)\s*(?:n[ºo°.]?\s*)?([\d][\d.\-\/]{3,})(\/?[A-Z]{2})?\b/g,
    (m, classe, numero, uf) => {
      const dig = numero.replace(/\D/g, '');
      const refFull = `${classe} ${numero}${uf || ''}`;
      if (confirmaDigitos(dig)) { confirmadas.push({ tipo: classe, ref: refFull }); return m; }
      removidas.push({ tipo: classe, ref: refFull, motivo: 'número não consta das fontes pesquisadas' });
      return PEND;
    }
  );

  // ── 3. Números CNJ completos ──
  t = t.replace(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g, (m) => {
    const dig = m.replace(/\D/g, '');
    if (confirmaDigitos(dig)) { confirmadas.push({ tipo: 'processo', ref: m }); return m; }
    removidas.push({ tipo: 'processo', ref: m, motivo: 'número não consta das fontes pesquisadas' });
    return PEND;
  });

  // ── 4. Temas de repetitivos / repercussão geral ──
  t = t.replace(/\bTema\s*(?:n[ºo°.]?\s*)?(\d{2,4})\b/gi, (m, num) => {
    if (confirmaContexto('tema', num)) { confirmadas.push({ tipo: 'tema', ref: `Tema ${num}` }); return m; }
    removidas.push({ tipo: 'tema', ref: `Tema ${num}`, motivo: 'não consta das fontes pesquisadas' });
    return PEND;
  });

  // ── 5. Súmulas ──
  t = t.replace(/\bS[úu]mula\s*(?:n[ºo°.]?\s*)?(\d{1,4})\b/gi, (m, num) => {
    if (confirmaContexto('s[úu]mula', num)) { confirmadas.push({ tipo: 'sumula', ref: `Súmula ${num}` }); return m; }
    removidas.push({ tipo: 'sumula', ref: `Súmula ${num}`, motivo: 'não consta das fontes pesquisadas' });
    return PEND;
  });

  // ── 6. Ementas órfãs: parágrafo com PENDENTE + transcrição longa entre aspas ──
  if (removidas.length) {
    t = t.split('\n').map(par => {
      if (!par.includes(PEND)) return par;
      return par.replace(/["“”']{1}[^"“”']{140,}["“”']{1}/g,
        '[EMENTA REMOVIDA — transcrição não confirmada nas fontes pesquisadas]');
    }).join('\n');
  }

  // ── 7. Colapsar pendências repetidas na mesma frase ──
  t = t.replace(/\[JURISPRUDÊNCIA PENDENTE\](\s*[,;e\/]+\s*\[JURISPRUDÊNCIA PENDENTE\])+/g, PEND);
  t = t.replace(/\(\s*\[JURISPRUDÊNCIA PENDENTE\]\s*\)/g, PEND);

  return { texto: t, confirmadas, removidas };
}
