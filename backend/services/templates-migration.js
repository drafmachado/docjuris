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
