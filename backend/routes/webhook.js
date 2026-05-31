// backend/routes/webhook.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDB } from '../db.js';
import { baixarPdfAssinado } from '../services/zapsign.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// POST /api/webhook/zapsign
router.post('/zapsign', async (req, res) => {
  try {
    const event = req.body;
    console.log('📩 Webhook ZapSign recebido:', event?.event_type, event?.document?.token);

    // Responde 200 imediatamente (ZapSign exige resposta rápida)
    res.json({ ok: true });

    const docToken = event?.document?.token;
    if (!docToken) return;

    // ── Evento: todos assinaram → baixa PDF e salva na pasta do cliente ──
    if (event.event_type === 'doc_signed') {
      const allSigned = (event.document?.signers ?? []).every(s => s.status === 'signed');

      if (!allSigned) return;

      const signedFileUrl = event.document?.signed_file;
      if (!signedFileUrl) return;

      const db = getDB();
      const docRecord = db.prepare(
        'SELECT * FROM documents WHERE zapsign_doc_token = ?'
      ).get(docToken);

      if (!docRecord) {
        console.warn('⚠️ Webhook ZapSign: documento não encontrado no DB:', docToken);
        return;
      }

      const storageDir = process.env.NODE_ENV === 'production'
        ? '/app/storage'
        : path.join(__dirname, '../../storage');

      const pdfFilename = docRecord.docx_filename.replace('.docx', '_assinado.pdf');
      const pdfPath = path.join(storageDir, 'pdfs', pdfFilename);

      try {
        await baixarPdfAssinado(signedFileUrl, pdfPath);

        db.prepare(`
          UPDATE documents
          SET signed_pdf_filename = ?, status = 'assinado', signed_at = datetime('now')
          WHERE zapsign_doc_token = ?
        `).run(pdfFilename, docToken);

        console.log(`✅ PDF assinado salvo: ${pdfFilename}`);
      } catch (err) {
        console.error('❌ Erro ao baixar PDF assinado:', err.message);
      }
    }

  } catch (err) {
    console.error('❌ Erro no webhook ZapSign:', err.message);
  }
});

export default router;
