// backend/services/extenso.js
// Números por extenso em pt-BR — valores em reais e percentuais.
// Sem dependências externas. Cobre até centenas de milhões.

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function trioPorExtenso(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), resto = n % 100;
  const d = Math.floor(resto / 10), u = resto % 10;
  const partes = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto >= 10 && resto <= 19) {
    partes.push(DEZ_A_DEZENOVE[resto - 10]);
  } else {
    if (d >= 2) partes.push(u > 0 ? DEZENAS[d] + ' e ' + UNIDADES[u] : DEZENAS[d]);
    else if (u > 0) partes.push(UNIDADES[u]);
  }
  return partes.join(' e ');
}

export function numeroPorExtenso(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  if (n > 999999999) return String(n); // fora do alcance — devolve o número

  const milhoes = Math.floor(n / 1000000);
  const milhares = Math.floor((n % 1000000) / 1000);
  const centenas = n % 1000;

  const partes = [];
  if (milhoes > 0) partes.push(milhoes === 1 ? 'um milhão' : trioPorExtenso(milhoes) + ' milhões');
  if (milhares > 0) partes.push(milhares === 1 ? 'mil' : trioPorExtenso(milhares) + ' mil');
  if (centenas > 0) partes.push(trioPorExtenso(centenas));

  // Conector "e": antes do último grupo quando ele é < 100 ou múltiplo de 100
  if (partes.length > 1) {
    const ultimo = partes.pop();
    const usaE = centenas > 0 && (centenas < 100 || centenas % 100 === 0);
    return partes.join(', ') + (usaE ? ' e ' : ', ') + ultimo;
  }
  return partes[0];
}

// "2500,50" | "2500.50" | 2500.5 → { num: 2500.5, formatado: "2.500,50" }
export function parseValor(entrada) {
  let s = String(entrada ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  // Formato BR: 1.234,56 → remove pontos de milhar, vírgula vira ponto
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  const formatado = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { num, formatado };
}

// 2500.5 → "dois mil e quinhentos reais e cinquenta centavos"
export function valorPorExtenso(num) {
  const reais = Math.floor(num);
  const centavos = Math.round((num - reais) * 100);
  const partes = [];
  if (reais > 0) {
    // "um milhão DE reais" quando termina exatamente em milhão/milhões
    const de = reais >= 1000000 && reais % 1000000 === 0 ? ' de' : '';
    partes.push(numeroPorExtenso(reais) + de + (reais === 1 ? ' real' : ' reais'));
  }
  if (centavos > 0) {
    partes.push(numeroPorExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos'));
  }
  if (partes.length === 0) return 'zero reais';
  return partes.join(' e ');
}

// "20" → "20% (vinte por cento)" | "12,5" → "12,5% (doze vírgula cinco por cento)"
export function percentualComExtenso(entrada) {
  let s = String(entrada ?? '').trim().replace(/[%\s]/g, '');
  if (!s) return null;
  const temVirgula = s.includes(',') || s.includes('.');
  const norm = s.replace(',', '.');
  const num = parseFloat(norm);
  if (isNaN(num)) return null;

  const inteiro = Math.floor(num);
  const decimal = Math.round((num - inteiro) * 10) / 10;

  let extenso;
  if (decimal === 0) {
    extenso = numeroPorExtenso(inteiro) + ' por cento';
  } else {
    const casaDecimal = Math.round(decimal * 10);
    extenso = numeroPorExtenso(inteiro) + ' vírgula ' + numeroPorExtenso(casaDecimal) + ' por cento';
  }
  const display = temVirgula && decimal !== 0
    ? `${inteiro},${Math.round(decimal * 10)}%`
    : `${inteiro}%`;
  return `${display} (${extenso})`;
}
