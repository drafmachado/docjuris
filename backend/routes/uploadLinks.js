// backend/routes/uploadLinks.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Resend } from 'resend';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { extractClientData } from '../services/ai.js';
import { createDocument, buildSigners } from '../services/autentique.js';
 
const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
 
// Instanciação lazy — não crasha se RESEND_API_KEY não estiver configurada
let _resend = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[resend] RESEND_API_KEY não configurada. Envio de email desabilitado.');
    return null;
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
 
async function sendNotification({ to, subject, html }) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn('[resend] Email não enviado — RESEND_API_KEY ausente.');
      return;
    }
    await resend.emails.send({
      from: 'Veredo <dra.andreia@advmachado.adv.br>',
      to,
      subject,
      html,
    });
    console.log(`✅ Email enviado para ${to}`);
  } catch (err) {
    console.error('❌ Erro ao enviar email:', err.message);
  }
}
 
router.post('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { client_id, template_ids, required_docs, manual_values, message, expires_in_days } = req.body;
 
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
  `).run(token, client_id, JSON.stringify(template_ids), JSON.stringify(required_docs || []), JSON.stringify(manual_values || {}), message || '', expiresAt, req.user.id);
 
  const baseUrl = process.env.BASE_URL || 'https://docjuris-production.up.railway.app';
  const link = `${baseUrl}/upload/${token}`;
 
  res.json({ token, link, expires_at: expiresAt });
});
 
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const links = db.prepare(`
    SELECT ul.*, c.nome as client_nome, u.name as created_by_name
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
 
// Rate limit público — previne enumeração de tokens
const uploadLinkLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 30,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
});
router.use(uploadLinkLimiter);

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
    templates: templates.map(t => ({ ...t, manual_fields: JSON.parse(t.manual_fields || '[]') })),
    expires_at: link.expires_at,
    completed: !!link.completed_at,
  });
});
 
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
 
  const fileArray = Object.values(files).flat();
  const clientFilesDir = process.env.NODE_ENV === 'production'
    ? '/app/storage/client_files'
    : path.join(__dirname, '../../storage/client_files');
  if (!fs.existsSync(clientFilesDir)) fs.mkdirSync(clientFilesDir, { recursive: true });
 
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  const MAX_SIZE = 10 * 1024 * 1024;
  const savedFiles = [];
 
  // Validar MIME type declarado + magic bytes reais (previne spoofing)
  const MAGIC_BYTES = {
    'image/jpeg':      [0xFF, 0xD8, 0xFF],
    'image/png':       [0x89, 0x50, 0x4E, 0x47],
    'image/webp':      [0x52, 0x49, 0x46, 0x46],  // RIFF
    'image/gif':       [0x47, 0x49, 0x46],          // GIF
    'application/pdf': [0x25, 0x50, 0x44, 0x46],   // %PDF
  };

  for (const file of fileArray) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ error: `Tipo não permitido: ${file.name}. Envie apenas imagens ou PDF.` });
    }
    if (file.size > MAX_SIZE) {
      return res.status(400).json({ error: `Arquivo muito grande: ${file.name}. Máximo 10MB.` });
    }
    // Verificar magic bytes reais do arquivo
    const expected = MAGIC_BYTES[file.mimetype];
    if (expected && file.data) {
      const actual = Array.from(file.data.slice(0, expected.length));
      const match = expected.every((b, i) => actual[i] === b);
      if (!match) {
        return res.status(400).json({ error: `Arquivo inválido: ${file.name}. O conteúdo não corresponde ao tipo declarado.` });
      }
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
 
  const docKey = req.body.doc_key || 'arquivo';
  const existing = JSON.parse(link.received_docs || '[]');
  existing.push({ doc_key: docKey, files: savedFiles, sent_at: new Date().toISOString() });
 
  db.prepare(`UPDATE upload_links SET received_docs = ? WHERE token = ?`)
    .run(JSON.stringify(existing), link.token);
 
  const requiredDocs = JSON.parse(link.required_docs || '[]');
  const sentKeys = existing.map(d => d.doc_key);
  const allSent = requiredDocs.every(d => sentKeys.includes(d.key));
 
  if (allSent && !link.completed_at) {
    db.prepare(`UPDATE upload_links SET completed_at = datetime('now') WHERE token = ?`)
      .run(link.token);
 
    try {
      console.log('🤖 Extraindo dados do cliente via IA...');
      const allClientFiles = db.prepare(
        'SELECT * FROM client_files WHERE client_id = ? ORDER BY uploaded_at DESC LIMIT 10'
      ).all(link.client_id);
 
      const fileObjects = allClientFiles.map(f => {
        const filePath = path.join(clientFilesDir, f.filename);
        if (!fs.existsSync(filePath)) return null;
        return { name: f.original_name, mimetype: f.mimetype, tempFilePath: filePath, size: f.size };
      }).filter(Boolean);
 
      if (fileObjects.length > 0) {
        const extracted = await extractClientData(fileObjects);
        const current = db.prepare('SELECT * FROM clients WHERE id = ?').get(link.client_id);
 
        const updated = {
          nome:            extracted.nome            || current.nome,
          nacionalidade:   extracted.nacionalidade   || current.nacionalidade,
          cpf:             extracted.cpf             || current.cpf,
          rg:              extracted.rg              || current.rg,
          orgao_expedidor: extracted.orgao_expedidor || current.orgao_expedidor,
          endereco:        extracted.endereco        || current.endereco,
          cidade:          extracted.cidade          || current.cidade,
          estado:          extracted.estado          || current.estado,
          email:           extracted.email           || current.email,
          telefone:        extracted.telefone        || current.telefone,
        };
 
        db.prepare(`
          UPDATE clients SET
            nome = ?, nacionalidade = ?, cpf = ?, rg = ?, orgao_expedidor = ?,
            endereco = ?, cidade = ?, estado = ?, email = ?, telefone = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          updated.nome, updated.nacionalidade, updated.cpf, updated.rg, updated.orgao_expedidor,
          updated.endereco, updated.cidade, updated.estado, updated.email, updated.telefone,
          link.client_id,
        );
 
        console.log(`✅ Dados do cliente ${link.client_nome} atualizados via IA`);
      }
    } catch (err) {
      console.error('❌ Erro na extração automática de dados:', err.message);
    }
 
    await generateDocumentsAutomatically(db, link);
 
    const baseUrl = process.env.BASE_URL || 'https://docjuris-production.up.railway.app';
    await sendNotification({
      to: 'fmachado.andreia@gmail.com',
      subject: `📄 Veredo — ${link.client_nome} enviou todos os documentos`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a3a5c">Documentos recebidos!</h2>
          <p>O cliente <strong>${link.client_nome}</strong> enviou todos os documentos solicitados.</p>
          <p>Os dados foram <strong>extraídos automaticamente</strong> e o contrato foi gerado e enviado para assinatura.</p>
          <a href="${baseUrl}/clients/${link.client_id}"
             style="display:inline-block;background:#1a3a5c;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
            Ver pasta do cliente
          </a>
          <p style="color:#999;font-size:12px;margin-top:32px">Veredo · Escritório Andreia Machado</p>
        </div>
      `,
    });
  }
 
  res.json({ ok: true, saved: savedFiles, all_sent: allSent });
});
 
async function generateDocumentsAutomatically(db, link) {
  try {
    const templateIds = JSON.parse(link.template_ids || '[]');
    const manualValues = JSON.parse(link.manual_values || '{}');
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(link.client_id);
 
    const storageDir = process.env.NODE_ENV === 'production'
      ? '/app/storage'
      : path.join(__dirname, '../../storage');
 
    for (const templateId of templateIds) {
      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
      if (!template) continue;
 
      const autoValues = {
        nome:            client.nome            || '',
        nacionalidade:   client.nacionalidade   || '',
        cpf:             client.cpf             || '',
        rg:              client.rg              || '',
        orgao_expedidor: client.orgao_expedidor || '',
        endereco:        client.endereco        || '',
        cidade:          client.cidade          || '',
        estado:          client.estado          || '',
        cidade_estado:   [client.cidade, client.estado].filter(Boolean).join(', ') || '',
        email:           client.email           || '',
        telefone:        client.telefone        || '',
        data_atual:      new Date().toLocaleDateString('pt-BR'),
      };
 
      const allValues = { ...autoValues, ...manualValues };
      const docxFilename = await fillTemplate(template, allValues, client);
 
      if (docxFilename) {
        const result = db.prepare(`
          INSERT INTO documents
            (client_id, template_id, generated_by, docx_filename, manual_values, auto_values, status)
          VALUES (?, ?, ?, ?, ?, ?, 'gerado')
        `).run(link.client_id, templateId, link.created_by, docxFilename, JSON.stringify(manualValues), JSON.stringify(autoValues));
 
        const documentId = result.lastInsertRowid;
 
        // ── Autentique (substitui ZapSign) ──────────────────────────────
        try {
          const docxPath = path.join(storageDir, 'pdfs', docxFilename);
          // D1: signatários conforme o template (4/7 = cliente+Andreia; 5/6 = só cliente)
          const signers = buildSigners(templateId, client.email);
          const autDoc = await createDocument({
            name: `${template.name} - ${client.nome}`,
            filePath: docxPath,
            signers,
          });
 
          db.prepare(`UPDATE documents SET zapsign_doc_token = ? WHERE id = ?`)
            .run(autDoc.id, documentId);
 
          console.log(`✅ Enviado para Autentique: ${autDoc.id}`);
        } catch (err) {
          console.error('❌ Erro ao enviar para Autentique:', err.message);
        }
        // ────────────────────────────────────────────────────────────────
      }
    }
  } catch (err) {
    console.error('❌ Erro na geração automática:', err.message);
  }
}
 
async function fillTemplate(template, values, client) {
  try {
    const PizZip = (await import('pizzip')).default;
    const Docxtemplater = (await import('docxtemplater')).default;
    const { randomBytes } = await import('crypto');
 
    const storageDir = process.env.NODE_ENV === 'production'
      ? '/app/storage'
      : path.join(__dirname, '../../storage');
 
    const templatePath = path.join(storageDir, 'templates', template.filename);
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
    const outPath = path.join(storageDir, 'pdfs', filename);
    fs.writeFileSync(outPath, buf);
 
    return filename;
  } catch (err) {
    console.error('❌ Erro ao preencher template:', err.message);
    return null;
  }
}
 
router.post('/:token/sign', async (req, res) => {
  const db = getDB();
  const link = db.prepare('SELECT * FROM upload_links WHERE token = ?').get(req.params.token);
  if (!link) return res.status(404).json({ error: 'Link não encontrado' });
 
  db.prepare(`UPDATE upload_links SET signed_at = datetime('now') WHERE token = ?`)
    .run(link.token);
 
  const client = db.prepare('SELECT nome FROM clients WHERE id = ?').get(link.client_id);
  const baseUrl = process.env.BASE_URL || 'https://docjuris-production.up.railway.app';
 
  await sendNotification({
    to: 'fmachado.andreia@gmail.com',
    subject: `✍️ Veredo — ${client.nome} assinou o contrato`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1a3a5c">Contrato assinado!</h2>
        <p>O cliente <strong>${client.nome}</strong> acabou de assinar o contrato.</p>
        <a href="${baseUrl}/clients/${link.client_id}"
           style="display:inline-block;background:#1a3a5c;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
          Ver pasta do cliente
        </a>
        <p style="color:#999;font-size:12px;margin-top:32px">Veredo · Escritório Andreia Machado</p>
      </div>
    `,
  });
 
  res.json({ ok: true, signed_at: new Date().toISOString() });
});
 
export default router;
 
