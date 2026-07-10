// Migração automática de templates v2 (cabeçalho/rodapé corrigidos + advogadas dinâmicas)
// Roda no boot. Idempotente: marca em storage/.templates_v2_applied após aplicar.
// Substitui o ARQUIVO físico dos templates existentes (mesmo filename),
// então todas as referências (IDs, documentos gerados) continuam válidas.
import { existsSync, copyFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDB } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR    = path.join(__dirname, '../assets/templates_v2');
const TEMPLATES_DIR = path.join(__dirname, '../../storage/templates');
const MARKER        = path.join(__dirname, '../../storage/.templates_v2_applied');

// Mapeia padrão do NOME do template (no banco) → arquivo v2
const MAPA = [
  { padrao: /procura/i,                          arquivo: 'Procuracao_v2.docx' },
  { padrao: /hipossufici/i,                      arquivo: 'Declaracao_Hipossuficiencia_v2.docx' },
  { padrao: /c[íi]vel/i,                         arquivo: 'Contrato_Civel_v2.docx' },
  { padrao: /honor[áa]rio/i,                     arquivo: 'Contrato_Honorarios_v2.docx' },
];

const CAMPOS_SISTEMA = new Set([
  'qualificacao_advogadas', 'QUALIFICACAO_ADVOGADAS',
  'tratamento_outorgadas',
  'assinatura_advogadas', 'ASSINATURA_ADVOGADAS',
  'nome_advogadas', 'NOME_ADVOGADAS',
  'data_atual', 'DATA_ATUAL',
  'cidade_estado', 'CIDADE_ESTADO',
  'local_data', 'LOCAL_DATA',
]);

// Remove campos de sistema da lista de manuais em todos os templates (roda em todo boot)
export function limparCamposSistema() {
  try {
    const db = getDB();
    const templates = db.prepare('SELECT id, auto_fields, manual_fields FROM templates').all();
    for (const t of templates) {
      let manual = [];
      let auto = [];
      try { manual = JSON.parse(t.manual_fields || '[]'); } catch {}
      try { auto = JSON.parse(t.auto_fields || '[]'); } catch {}

      const manualLimpo = manual.filter(m => !CAMPOS_SISTEMA.has(m.key || m));
      const movidos = manual.filter(m => CAMPOS_SISTEMA.has(m.key || m)).map(m => m.key || m);
      if (movidos.length === 0) continue;

      const autoNovo = [...new Set([...auto, ...movidos])];
      db.prepare('UPDATE templates SET manual_fields = ?, auto_fields = ? WHERE id = ?')
        .run(JSON.stringify(manualLimpo), JSON.stringify(autoNovo), t.id);
      console.log(`🔧 Template ${t.id}: campos de sistema movidos para auto: ${movidos.join(', ')}`);
    }
  } catch(e) {
    console.error('⚠️ Limpeza de campos de sistema falhou (não crítico):', e.message);
  }
}

export function aplicarTemplatesV2() {
  try {
    if (existsSync(MARKER)) return; // já aplicado

    const db = getDB();
    const templates = db.prepare('SELECT id, name, filename FROM templates WHERE active = 1').all();
    if (templates.length === 0) return; // nada a migrar ainda

    const aplicados = [];
    const usados = new Set();

    for (const t of templates) {
      // Cível tem precedência sobre honorários (ambos contêm "honorários" no conteúdo,
      // mas o nome distingue). Testa na ordem do MAPA e pula arquivos já usados.
      for (const { padrao, arquivo } of MAPA) {
        if (usados.has(arquivo)) continue;
        if (!padrao.test(t.name)) continue;

        const origem  = path.join(ASSETS_DIR, arquivo);
        const destino = path.join(TEMPLATES_DIR, t.filename);
        if (!existsSync(origem)) break;

        copyFileSync(origem, destino);
        usados.add(arquivo);
        aplicados.push(`${t.name} (id ${t.id}) ← ${arquivo}`);
        break;
      }
    }

    if (aplicados.length > 0) {
      writeFileSync(MARKER, new Date().toISOString() + '\n' + aplicados.join('\n'));
      console.log('✅ Templates v2 aplicados:\n  ' + aplicados.join('\n  '));
    }
  } catch (e) {
    console.error('⚠️ Migração de templates v2 falhou (não crítico):', e.message);
  }
}
