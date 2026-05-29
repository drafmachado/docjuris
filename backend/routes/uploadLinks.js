// backend/src/routes/uploadLinks.js
import express from 'express';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import nodemailer from 'nodemailer';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Email helper ─────────────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // App Password do Gmail
    },
  });
}

async function sendNotification({ to, subject, html }) {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"DocJuris" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('❌ Erro ao enviar email:', err.message);
  }
}

// ─── POST /api/upload-links — Cria link de upload (autenticado) ──────────────
router.post('/', authMiddleware, (req, res) => {
  const db = getDB();
  const {
    client_id,
    template_ids,      // array de IDs de templates a gerar
    required_docs,     // array de { key, label } — docs que o cliente deve enviar
    manual_values,     // { honorarios, valor, etc. } — valores manuais
    message,           // mensagem personalizada para o cliente
    expires_in_days,   // 3, 7, 15 dias
  } = req.body;

  if (!client_id || !template_ids?.length) {
    return res.status(400).json({ error: 'client_id e template_ids são obrigatórios' });
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

  const token = randomBytes(32).toString('hex');
  const days = expires_in_days || 7;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO upload_links
      (token, client_id, template_ids, required_docs, manual_values, message, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token,
    client_id,
    JSON.stringify(template_ids),
    JSON.stringify(required_docs || []),
    JSON.stringify(manual_values || {}),
    message || '',
    expiresAt,
    req.user.id,
  );

  const baseUrl = process.env.BASE_URL || 'https://docjuris-production.up.railway.app';
  const link = `${baseUrl}/upload/${token}`;

  res.json({ token, link, expires_at: expiresAt });
});

// ─── GET /api/upload-links — Lista links (autenticado) ───────────────────────
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const links = db.prepare(`
    SELECT ul.*, c.nome as client_nome,
           u.name as created_by_name
    FROM upload_links ul
    JOIN clients c ON c.id = ul.client_id
    LEFT JOIN users u ON u.id = ul.created_by
    ORDER BY ul.created_at DESC
  `).all();

  res.json(links.map(l => ({
    ...l,
    template_ids: JSON.parse(l.template_ids || '[]'),
    required_docs: JSON.parse(l.required_docs || '[]'),
    manual_values: JSON.parse(l.manual_values || '{}'),
  })));
});

// ─── GET /api/upload-links/:token — Dados públicos do link ───────────────────
router.get('/:token', (req, res) => {
  const db = getDB();
  const link = db.prepare(`
    SELECT ul.*, c.nome as client_nome, c.email as client_email
    FROM upload_links ul
    JOIN clients c ON c.id = ul.client_id
    WHERE ul.token = ?
  `).get(req.params.token);

  if (!link) return res.status(404).json({ error: 'Link não encontrado' });
  if (new Date(link.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Este link expirou' });
  }

  // Busca info dos templates
  const templateIds = JSON.parse(link.template_ids || '[]');
  const templates = templateIds.map(id =>
    db.prepare('SELECT id, name, type, manual_fields FROM templates WHERE id = ?').get(id)
  ).filter(Boolean);

  res.json({
    token: link.token,
    client_nome: link.client_nome,
    message: link.message,
    required_docs: JSON.parse(link.required_docs || '[]'),
    manual_values: JSON.parse(link.manual_values || '{}'),
    templates: templates.map(t => ({
      ...t,
      manual_fields: JSON.parse(t.manual_fields || '[]'),
    })),
    expires_at: link.expires_at,
    completed: !!link.completed_at,
  });
});

// ─── POST /api/upload-links/:token/files — Cliente envia arquivos (público) ──
router.post('/:token/files', async (req, res) => {
  const db = getDB();
  const link = db.prepare(`
    SELECT ul.*, c.nome as client_nome, c.email as client_email
    FROM upload_links ul
    JOIN clients c ON c.id = ul.client_id
    WHERE ul.token = ?
  `).get(req.params.token);

  if (!link) return res.status(404).json({ error: 'Link não encontrado' });
  if (new Date(link.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Este link expirou' });
  }

  const files = req.files;
  if (!files || Object.keys(files).length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  const clientFilesDir = path.join(__dirname, '../../storage/client_files');
  if (!fs.existsSync(clientFilesDir)) fs.mkdirSync(clientFilesDir, { recursive: true });

  const savedFiles = [];
  const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
  ];
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  for (const file of fileArray) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ error: `Tipo de arquivo não permitido: ${file.name}. Envie apenas imagens ou PDF.` });
    }
    if (file.size > MAX_SIZE) {
      return res.status(400).json({ error: `Arquivo muito grande: ${file.name}. Máximo 10MB.` });
    }
  }

  for (const file of fileArray) {
    const ext = path.extname(file.name);
    const filename = `${Date.now()}_${randomBytes(8).toString('hex')}${ext}`;
    const dest = path.join(clientFilesDir, filename);
    await file.mv(dest);

    db.prepare(`
      INSERT INTO client_files (client_id, filename, original_name, mimetype, size)
      VALUES (?, ?, ?, ?, ?)
    `).run(link.client_id, filename, file.name, file.mimetype, file.size);

    savedFiles.push({ filename, original_name: file.name });
  }

  // Salva quais docs foram enviados neste link
  const docKey = req.body.doc_key || 'arquivo';
  const existing = JSON.parse(link.received_docs || '[]');
  existing.push({ doc_key: docKey, files: savedFiles, sent_at: new Date().toISOString() });

  db.prepare(`
    UPDATE upload_links SET received_docs = ? WHERE token = ?
  `).run(JSON.stringify(existing), link.token);

  // ── Verifica se todos os documentos foram enviados ──
  const requiredDocs = JSON.parse(link.required_docs || '[]');
  const sentKeys = existing.map(d => d.doc_key);
  const allSent = requiredDocs.every(d => sentKeys.includes(d.key));

  if (allSent && !link.completed_at) {
    // Marca como completo
    db.prepare(`
      UPDATE upload_links SET completed_at = datetime('now') WHERE token = ?
    `).run(link.token);

    // ── Geração automática dos documentos ──
    await generateDocumentsAutomatically(db, link);

    // ── Notificação por email para a advogada ──
    const baseUrl = process.env.BASE_URL || 'https://docjuris-production.up.railway.app';
    await sendNotification({
      to: 'fmachado.andreia@gmail.com',
      subject: `📄 DocJuris — ${link.client_nome} enviou todos os documentos`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a3a5c">Documentos recebidos!</h2>
          <p>O cliente <strong>${link.client_nome}</strong> enviou todos os documentos solicitados.</p>
          <p>Os documentos foram <strong>gerados automaticamente</strong> e já estão disponíveis na pasta do cliente.</p>
          <a href="${baseUrl}/clients/${link.client_id}"
             style="display:inline-block;background:#1a3a5c;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
            Ver pasta do cliente
          </a>
          <p style="color:#999;font-size:12px;margin-top:32px">DocJuris · Escritório Andreia Machado</p>
        </div>
      `,
    });
  }

  res.json({ ok: true, saved: savedFiles, all_sent: allSent });
});

// ─── Geração automática dos documentos ───────────────────────────────────────
async function generateDocumentsAutomatically(db, link) {
  try {
    const templateIds = JSON.parse(link.template_ids || '[]');
    const manualValues = JSON.parse(link.manual_values || '{}');
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(link.client_id);

    for (const templateId of templateIds) {
      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
      if (!template) continue;

      // Campos automáticos do cliente
      const autoValues = {
        nome: client.nome || '',
        nacionalidade: client.nacionalidade || '',
        cpf: client.cpf || '',
        rg: client.rg || '',
        orgao_expedidor: client.orgao_expedidor || '',
        endereco: client.endereco || '',
        cidade: client.cidade || '',
        estado: client.estado || '',
        email: client.email || '',
        telefone: client.telefone || '',
        data_atual: new Date().toLocaleDateString('pt-BR'),
      };

      // Combina com valores manuais
      const allValues = { ...autoValues, ...manualValues };

      // Gera o documento via rota interna (reutiliza lógica existente)
      const docxFilename = await fillTemplate(template, allValues, client);

      if (docxFilename) {
        db.prepare(`
          INSERT INTO documents
            (client_id, template_id, generated_by, docx_filename, manual_values, auto_values, status)
          VALUES (?, ?, ?, ?, ?, ?, 'gerado')
        `).run(
          link.client_id,
          templateId,
          link.created_by,
          docxFilename,
          JSON.stringify(manualValues),
          JSON.stringify(autoValues),
        );
      }
    }
  } catch (err) {
    console.error('❌ Erro na geração automática:', err.message);
  }
}

// ─── Preenche template DOCX com os valores ───────────────────────────────────
async function fillTemplate(template, values, client) {
  try {
    const PizZip = (await import('pizzip')).default;
    const Docxtemplater = (await import('docxtemplater')).default;
    const { randomBytes } = await import('crypto');

    const templatePath = path.join(__dirname, '../../storage/templates', template.filename);
    if (!fs.existsSync(templatePath)) return null;

    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });

    doc.render(values);

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const filename = `${Date.now()}_${randomBytes(4).toString('hex')}.docx`;
    const outPath = path.join(__dirname, '../../storage/pdfs', filename);
    fs.writeFileSync(outPath, buf);

    return filename;
  } catch (err) {
    console.error('❌ Erro ao preencher template:', err.message);
    return null;
  }
}

// ─── POST /api/upload-links/:token/sign — Cliente assina (hook futuro) ───────
router.post('/:token/sign', async (req, res) => {
  const db = getDB();
  const link = db.prepare('SELECT * FROM upload_links WHERE token = ?').get(req.params.token);
  if (!link) return res.status(404).json({ error: 'Link não encontrado' });

  db.prepare(`
    UPDATE upload_links SET signed_at = datetime('now') WHERE token = ?
  `).run(link.token);

  const client = db.prepare('SELECT nome FROM clients WHERE id = ?').get(link.client_id);
  const baseUrl = process.env.BASE_URL || 'https://docjuris-production.up.railway.app';

  await sendNotification({
    to: 'fmachado.andreia@gmail.com',
    subject: `✍️ DocJuris — ${client.nome} assinou o contrato`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1a3a5c">Contrato assinado!</h2>
        <p>O cliente <strong>${client.nome}</strong> acabou de assinar o contrato.</p>
        <a href="${baseUrl}/clients/${link.client_id}"
           style="display:inline-block;background:#1a3a5c;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
          Ver pasta do cliente
        </a>
        <p style="color:#999;font-size:12px;margin-top:32px">DocJuris · Escritório Andreia Machado</p>
      </div>
    `,
  });

  res.json({ ok: true, signed_at: new Date().toISOString() });
});

export default router;
