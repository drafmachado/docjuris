// backend/routes/webhook.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDB } from '../db.js';
import { assinarComoDoutora, baixarPdfAssinado, SIGNING_SCENARIO } from '../services/zapsign.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRA_ANDREIA_USER_TOKEN = process.env.ZAPSIGN_USER_TOKEN_ANDREIA;
const DRA_THAISA_USER_TOKEN  = process.env.ZAPSIGN_USER_TOKEN_THAISA;

// POST /api/webhook/zapsign
router.post('/zapsign', async (req, res) => {
  try {
    const event = req.body;
    console.log('📩 Webhook ZapSign recebido:', event?.event_type, event?.document?.token);

    // Responde 200 imediatamente (ZapSign exige resposta rápida)
    res.json({ ok: true });

    const docToken = event?.document?.token;
    if (!docToken) return;

    const db = getDB();
    const docRecord = db.prepare(
      'SELECT * FROM documents WHERE zapsign_doc_token = ?'
    ).get(docToken);

    if (!docRecord) {
      console.warn('⚠️ Webhook ZapSign: documento não encontrado no DB:', docToken);
      return;
    }

    const scenario = SIGNING_SCENARIO[docRecord.template_id] ?? 1;

    // ── Evento: cliente assinou (document_signed mas ainda faltam doutoras) ──
    if (event.event_type === 'document_signed' && scenario > 1) {
      const signers = event.document?.signers ?? [];

      // Verifica se o cliente assinou e as doutoras ainda não
      const clienteSigou = signers.some(s =>
        s.status === 'signed' && s.order_group === 1
      );
      const doutoraPendente = signers.some(s =>
        s.status !== 'signed' && s.order_group === 2
      );

      if (clienteSigou && doutoraPendente) {
        console.log('✅ Cliente assinou. Aplicando assinatura das doutoras via API...');

        for (const signer of signers) {
          if (signer.order_group !== 2) continue;

          let userToken = null;
          if (signer.email === 'dra.andreia@advmachado.adv.br') {
            userToken = DRA_ANDREIA_USER_TOKEN;
          } else if (signer.email === 'thaiisa_sousa@hotmail.com') {
            userToken = DRA_THAISA_USER_TOKEN;
          }

          if (!userToken) {
            console.warn(`⚠️ user_token não encontrado para ${signer.email}`);
            continue;
          }

          try {
            await assinarComoDoutora(signer.token, userToken);
            console.log(`✅ Assinatura automática aplicada: ${signer.name}`);
          } catch (err) {
            console.error(`❌ Erro ao assinar como doutora ${signer.name}:`, err.message);
          }
        }
      }
    }

    // ── Evento: todos assinaram → baixa PDF e salva na pasta do cliente ──
    if (event.event_type === 'document_signed') {
      const allSigned = (event.document?.signers ?? []).every(s => s.status === 'signed');

      if (allSigned) {
        const signedFileUrl = event.document?.signed_file;
        if (!signedFileUrl) return;

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
    }

  } catch (err) {
    console.error('❌ Erro no webhook ZapSign:', err.message);
  }
});

export default router;
