import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDB } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { analyzeTemplateFields, extractPlaceholders } from '../services/ai.js';
import { readTemplateText } from '../services/docgen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../storage/templates');
const router = Router();

router.use(authMiddleware);

// GET /api/templates
router.get('/', (req, res) => {
  const db = getDB();
  const templates = db.prepare('SELECT * FROM templates WHERE active = 1 ORDER BY created_at DESC').all();
  res.json(templates.map(t => ({
    ...t,
    auto_fields: JSON.parse(t.auto_fields || '[]'),
    manual_fields: JSON.parse(t.manual_fields || '[]'),
  })));
});

// GET /api/templates/:id
router.get('/:id', (req, res) => {
  const db = getDB();
  const t = db.prepare('SELECT * FROM templates WHERE id = ? AND active = 1').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template não encontrado' });
  res.json({
    ...t,
    auto_fields: JSON.parse(t.auto_fields || '[]'),
    manual_fields: JSON.parse(t.manual_fields || '[]'),
  });
});

// POST /api/templates — upload de novo template
router.post('/', adminOnly, async (req, res) => {
  if (!req.files?.file) return res.status(400).json({ error: 'Arquivo .docx não enviado' });

  const file = req.files.file;
  const ext = path.extname(file.name).toLowerCase();
  if (ext !== '.docx') return res.status(400).json({ error: 'Apenas arquivos .docx são aceitos' });

  const { name, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome do template é obrigatório' });

  // Salva o arquivo
  const safeName = `template_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const destPath = path.join(TEMPLATES_DIR, safeName);
  await file.mv(destPath);

  // Analisa os campos com IA
  let autoFields = [];
  let manualFields = [];
  try {
    const templateText = readTemplateText(safeName);
    const analysis = await analyzeTemplateFields(templateText);
    autoFields = analysis.auto_fields || [];
    manualFields = analysis.manual_fields || [];
  } catch (err) {
    console.warn('Não foi possível analisar campos com IA:', err.message);
    // Tenta extração simples
    try {
      const templateText = readTemplateText(safeName);
      const placeholders = extractPlaceholders(templateText);
      manualFields = placeholders.map(p => ({ key: p, label: p, type: 'text' }));
    } catch {}
  }

  const db = getDB();
  const result = db.prepare(`
    INSERT INTO templates (name, type, filename, original_name, auto_fields, manual_fields, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    type || 'outro',
    safeName,
    file.name,
    JSON.stringify(autoFields),
    JSON.stringify(manualFields),
    req.user.id
  );

  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    ...template,
    auto_fields: JSON.parse(template.auto_fields),
    manual_fields: JSON.parse(template.manual_fields),
  });
});

// PUT /api/templates/:id — atualiza nome, tipo e campos manualmente
router.put('/:id', adminOnly, (req, res) => {
  const db = getDB();
  const { name, type, manual_fields, auto_fields } = req.body;

  db.prepare(`
    UPDATE templates SET name = ?, type = ?, manual_fields = ?, auto_fields = ?
    WHERE id = ?
  `).run(
    name,
    type,
    JSON.stringify(manual_fields || []),
    JSON.stringify(auto_fields || []),
    req.params.id
  );

  res.json({ success: true });
});

// DELETE /api/templates/:id — desativa (soft delete)
router.delete('/:id', adminOnly, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE templates SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/templates/:id/reanalyze — re-analisa campos com IA
router.post('/:id/reanalyze', adminOnly, async (req, res) => {
  const db = getDB();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template não encontrado' });

  try {
    const templateText = readTemplateText(template.filename);
    const analysis = await analyzeTemplateFields(templateText);

    db.prepare(`
      UPDATE templates SET auto_fields = ?, manual_fields = ? WHERE id = ?
    `).run(
      JSON.stringify(analysis.auto_fields || []),
      JSON.stringify(analysis.manual_fields || []),
      template.id
    );

    res.json({
      success: true,
      auto_fields: analysis.auto_fields,
      manual_fields: analysis.manual_fields,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
