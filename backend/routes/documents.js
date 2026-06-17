// backend/routes/documents.js
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateDocument, buildFillValues } from '../services/docgen.js';
import { sendDocumentEmail } from '../services/email.js';
import { sincronizarAutentique } from '../services/autentique-sync.js';
import { createDocument, buildSigners } from '../services/autentique.js';
import { notifyDocumentoGerado } from '../services/evolution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFS_DIR = process.env.NODE_ENV === 'production'
  ? '/app/storage/pdfs'
  : path.join(__dirname, '../../storage/pdfs');
const router = Router();

router.use(authMiddleware);

// ─── GET /api/documents — lista todos ────────────────────────────────────────
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

// ─── POST /api/documents/generate — gera documento e envia ao Autentique ─────
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

  if (!client.email) {
    return res.status(400).json({ error: 'Cliente sem e-mail cadastrado. Cadastre o e-mail antes de gerar o documento.' });
  }

  try {
    // ── 1. Gerar o arquivo .docx / .pdf ───────────────────────────────────
    const manualVals = manual_values || {};
    const allValues = buildFillValues(client, manualVals);

    const timestamp = Date.now();
    const safeName = template.name.replace(/[^a-zA-Z0-9]/g, '_');
    const safeClient = client.nome.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    const outputBasename = `${safeClient}_${safeName}_${timestamp}`;

    const { docxFilename, pdfFilename } = await generateDocument(
      template.filename,
      allValues,
      outputBasename
    );

    const autoVals = {};
    Object.keys(allValues).forEach(k => {
      if (!manualVals[k]) autoVals[k] = allValues[k];
    });

    // ── 2. Salvar registro no banco ───────────────────────────────────────
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

    // ── 3. Enviar ao Autentique (D1: signatários por template) ────────────
    let autentiqueId = null;
    let autentiqueLinks = [];

    try {
      // Envia o PDF (preserva cabeçalho/rodapé). Fallback para DOCX se PDF não gerou.
      const docxPath = path.join(PDFS_DIR, docxFilename);
      const pdfPathForSign = pdfFilename ? path.join(PDFS_DIR, pdfFilename) : null;
      const fileToSign = (pdfPathForSign && fs.existsSync(pdfPathForSign)) ? pdfPathForSign : docxPath;

      // D1: monta a lista de signatários conforme o template
      const signers = buildSigners(template_id, client.email);

      const autDoc = await createDocument({
        name: `${template.name} - ${client.nome}`,
        filePath: fileToSign,
        signers,
      });

      autentiqueId = autDoc.id;
      // Triggers de auto-sign: verificar assinatura em 5, 20 e 60 min
      [5, 20, 60].forEach(min => {
        setTimeout(() => sincronizarAutentique(true), min * 60 * 1000);
      });
      autentiqueLinks = (autDoc.signatures || []).map(s => ({
        name: s.name || s.email,
        email: s.email,
        link: s.link?.short_link || null,
      }));

      // Salva o ID do Autentique no campo zapsign_doc_token (campo reutilizado)
      db.prepare(`UPDATE documents SET zapsign_doc_token = ?, status = 'enviado_assinatura' WHERE id = ?`)
        .run(autDoc.id, docId);

      console.log(`✅ Documento ${docId} enviado ao Autentique: ${autDoc.id} | signatários: ${signers.map(s => s.email).join(', ')}`);

      // D5: Notificações WhatsApp
      notifyDocumentoGerado({
        clienteNome:     client.nome,
        clienteTelefone: client.telefone,
        templateNome:    template.name,
        signatarios:     autentiqueLinks,
      }).catch(err => console.warn('[whatsapp] Erro na notificação de geração:', err.message));
    } catch (autErr) {
      console.error('❌ Erro ao enviar para Autentique:', autErr.message);
      // Não aborta — documento foi gerado; Autentique pode ser tentado depois
    }

    // ── 4. Envio por e-mail (opcional) ────────────────────────────────────
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
          UPDATE documents SET email_sent = 1, email_sent_to = ?, email_sent_at = datetime('now')
          WHERE id = ?
        `).run(recipient, docId);
      } catch (emailErr) {
        console.error('Erro ao enviar e-mail:', emailErr);
      }
    }

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    res.json({
      success: true,
      document: doc,
      pdf_url: pdfFilename ? `/files/pdfs/${pdfFilename}` : null,
      docx_url: docxFilename ? `/files/pdfs/${docxFilename}` : null,
      autentique: autentiqueId
        ? { id: autentiqueId, signers: autentiqueLinks }
        : null,
      email_sent: !!emailResult,
      email_preview: emailResult?.previewUrl || null,
    });

  } catch (err) {
    console.error('Erro na geração:', err);
    res.status(500).json({ error: 'Erro ao gerar documento: ' + err.message });
  }
});

// ─── GET /api/documents/:id/download/pdf ─────────────────────────────────────
router.get('/:id/download/pdf', (req, res) => {
  const db = getDB();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || !doc.pdf_filename) return res.status(404).json({ error: 'PDF não encontrado' });

  const filePath = path.join(PDFS_DIR, doc.pdf_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

  res.download(filePath);
});

// ─── GET /api/documents/:id/download/docx ────────────────────────────────────
router.get('/:id/download/docx', (req, res) => {
  const db = getDB();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || !doc.docx_filename) return res.status(404).json({ error: 'DOCX não encontrado' });

  const filePath = path.join(PDFS_DIR, doc.docx_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

  res.download(filePath);
});

// ─── GET /api/documents/:id/download/signed ──────────────────────────────────
// Baixar o PDF assinado (salvo pelo webhook após assinatura completa)
router.get('/:id/download/signed', (req, res) => {
  const db = getDB();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || !doc.signed_pdf_filename) {
    return res.status(404).json({ error: 'PDF assinado ainda não disponível' });
  }

  const filePath = path.join(PDFS_DIR, doc.signed_pdf_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

  res.download(filePath);
});

// ─── POST /api/documents/:id/resend ──────────────────────────────────────────
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

// ─── DELETE /api/documents/:id ────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const db = getDB();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });

  // Remove arquivos físicos se existirem
  for (const field of ['docx_filename', 'pdf_filename', 'signed_pdf_filename']) {
    if (doc[field]) {
      const p = path.join(PDFS_DIR, doc[field]);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  res.json({ success: true });
});

// DELETE /api/documents/:id — excluir documento
router.delete('/:id', (req, res) => {
  const db = getDB();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });

  // Remover arquivos físicos
  const { join } = path;
  const storageDir = process.env.NODE_ENV === 'production' ? '/app/storage' : join(process.cwd(), '../storage');
  const pdfsDir = join(storageDir, 'pdfs');
  for (const field of ['docx_filename', 'pdf_filename', 'signed_pdf_filename']) {
    if (doc[field]) {
      const fp = join(pdfsDir, doc[field]);
      try { fs.unlinkSync(fp); } catch(e) { /* ignora se não existir */ }
    }
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
