import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateDocument, buildFillValues } from '../services/docgen.js';
import { sendDocumentEmail } from '../services/email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFS_DIR = path.join(__dirname, '../../storage/pdfs');
const router = Router();

router.use(authMiddleware);

// GET /api/documents — lista todos
router.get('/', (req, res) => {
  const db = getDB();
  const docs = db.prepare(`
    SELECT d.*, c.nome as client_name, t.name as template_name, t.type as template_type, u.name as generated_by_name
    FROM documents d
    JOIN clients c ON c.id = d.client_id
    JOIN templates t ON t.id = d.template_id
    LEFT JOIN users u ON u.id = d.generated_by
    ORDER BY d.created_at DESC
    LIMIT 100
  `).all();
  res.json(docs);
});

// POST /api/documents/generate — gera um documento
router.post('/generate', async (req, res) => {
  const { client_id, template_id, manual_values, send_email, email_to } = req.body;

  if (!client_id || !template_id) {
    return res.status(400).json({ error: 'client_id e template_id são obrigatórios' });
  }

  const db = getDB();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  const template = db.prepare('SELECT * FROM templates WHERE id = ? AND active = 1').get(template_id);

  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
  if (!template) return res.status(404).json({ error: 'Template não encontrado' });

  try {
    // Prepara os valores para preencher o template
    const manualVals = manual_values || {};
    const allValues = buildFillValues(client, manualVals);

    // Gera nome único para o arquivo
    const timestamp = Date.now();
    const safeName = template.name.replace(/[^a-zA-Z0-9]/g, '_');
    const safeClient = client.nome.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    const outputBasename = `${safeClient}_${safeName}_${timestamp}`;

    // Gera o documento
    const { docxFilename, pdfFilename } = await generateDocument(
      template.filename,
      allValues,
      outputBasename
    );

    // Salva no banco
    const autoVals = {};
    Object.keys(allValues).forEach(k => {
      if (!manualVals[k]) autoVals[k] = allValues[k];
    });

    const docResult = db.prepare(`
      INSERT INTO documents (client_id, template_id, generated_by, pdf_filename, docx_filename, manual_values, auto_values, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client_id, template_id, req.user.id,
      pdfFilename, docxFilename,
      JSON.stringify(manualVals), JSON.stringify(autoVals),
      'gerado'
    );

    const docId = docResult.lastInsertRowid;

    // Envia por email se solicitado
    let emailResult = null;
    if (send_email && (email_to || client.email)) {
      const recipient = email_to || client.email;
      const pdfPath = pdfFilename ? path.join(PDFS_DIR, pdfFilename) : null;

      try {
        emailResult = await sendDocumentEmail({
          to: recipient,
          clientName: client.nome,
          documentName: template.name,
          pdfPath,
          fromName: req.user.name,
        });

        db.prepare(`
          UPDATE documents SET status = 'enviado', email_sent = 1, email_sent_to = ?, email_sent_at = datetime('now')
          WHERE id = ?
        `).run(recipient, docId);
      } catch (emailErr) {
        console.error('Erro ao enviar email:', emailErr);
        // Não falha a geração por erro de email
      }
    }

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    res.json({
      success: true,
      document: doc,
      pdf_url: pdfFilename ? `/files/pdfs/${pdfFilename}` : null,
      docx_url: docxFilename ? `/files/pdfs/${docxFilename}` : null,
      email_sent: !!emailResult,
      email_preview: emailResult?.previewUrl || null,
    });

  } catch (err) {
    console.error('Erro na geração:', err);
    res.status(500).json({ error: 'Erro ao gerar documento: ' + err.message });
  }
});

// GET /api/documents/:id/download/pdf
router.get('/:id/download/pdf', (req, res) => {
  const db = getDB();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || !doc.pdf_filename) return res.status(404).json({ error: 'PDF não encontrado' });

  const filePath = path.join(PDFS_DIR, doc.pdf_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

  res.download(filePath);
});

// GET /api/documents/:id/download/docx
router.get('/:id/download/docx', (req, res) => {
  const db = getDB();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || !doc.docx_filename) return res.status(404).json({ error: 'DOCX não encontrado' });

  const filePath = path.join(PDFS_DIR, doc.docx_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

  res.download(filePath);
});

// POST /api/documents/:id/resend
router.post('/:id/resend', async (req, res) => {
  const db = getDB();
  const doc = db.prepare(`
    SELECT d.*, c.nome as client_name, c.email as client_email, t.name as template_name
    FROM documents d
    JOIN clients c ON c.id = d.client_id
    JOIN templates t ON t.id = d.template_id
    WHERE d.id = ?
  `).get(req.params.id);

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });

  const email = req.body.email || doc.client_email;
  if (!email) return res.status(400).json({ error: 'Email do destinatário não encontrado' });

  const pdfPath = doc.pdf_filename ? path.join(PDFS_DIR, doc.pdf_filename) : null;

  try {
    const result = await sendDocumentEmail({
      to: email,
      clientName: doc.client_name,
      documentName: doc.template_name,
      pdfPath,
      fromName: req.user.name,
    });

    db.prepare(`
      UPDATE documents SET status = 'enviado', email_sent = 1, email_sent_to = ?, email_sent_at = datetime('now')
      WHERE id = ?
    `).run(email, doc.id);

    res.json({ success: true, email_preview: result.previewUrl });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao reenviar: ' + err.message });
  }
});

export default router;
