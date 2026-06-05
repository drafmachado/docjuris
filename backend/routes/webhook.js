// backend/routes/webhook.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDB } from '../db.js';
import { downloadSignedPdf } from '../services/autentique.js';
import { notifyDocumentoAssinado } from '../services/evolution.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── POST /api/webhook/autentique ────────────────────────────────────────────
//
// Payload esperado do Autentique (evento document.finished):
// {
//   "event": "document.finished",
//   "document": {
//     "id": "uuid-do-documento",
//     "name": "Nome do documento",
//     "files": { "signed": "https://..." }
//   }
// }
//
// Variável Railway necessária: AUTENTIQUE_WEBHOOK_SECRET
// Configure no painel Autentique a URL: https://<seu-dominio>/api/webhook/autentique
// ────────────────────────────────────────────────────────────────────────────
router.post('/autentique', async (req, res) => {
  try {
    // ── 1. Validar secret do Autentique ──────────────────────────────────────
    const secret = process.env.AUTENTIQUE_WEBHOOK_SECRET;
    if (secret) {
      const receivedSecret =
        req.headers['x-autentique-secret'] ||
        req.headers['x-webhook-secret'] ||
        req.body?.secret;

      if (receivedSecret !== secret) {
        console.warn('⚠️  Webhook Autentique: secret inválido');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const event = req.body;
    console.log('📩 Webhook Autentique recebido:', event?.event, event?.document?.id);

    // Responde 200 imediatamente (Autentique exige resposta rápida)
    res.json({ ok: true });

    // ── 2. Processar apenas evento de documento finalizado ─────────────────
    if (event?.event !== 'document.finished') return;

    const documentId = event?.document?.id;
    if (!documentId) return;

    const signedUrl = event?.document?.files?.signed;
    if (!signedUrl) {
      console.warn('⚠️  Webhook Autentique: URL do PDF assinado não encontrada no payload');
      return;
    }

    // ── 3. Buscar registro no banco pelo autentique_doc_id ─────────────────
    const db = getDB();

    // O campo zapsign_doc_token guarda o ID do Autentique (campo reutilizado na migração)
    const docRecord = db.prepare(
      'SELECT * FROM documents WHERE zapsign_doc_token = ?'
    ).get(documentId);

    if (!docRecord) {
      console.warn('⚠️  Webhook Autentique: documento não encontrado no DB:', documentId);
      return;
    }

    // ── 4. Baixar e salvar o PDF assinado ──────────────────────────────────
    const storageDir = process.env.NODE_ENV === 'production'
      ? '/app/storage'
      : path.join(__dirname, '../../storage');

    const pdfFilename = docRecord.docx_filename
      ? docRecord.docx_filename.replace('.docx', '_assinado.pdf')
      : `doc_${documentId}_assinado.pdf`;

    const pdfPath = path.join(storageDir, 'pdfs', pdfFilename);

    try {
      await downloadSignedPdf(signedUrl, pdfPath);

      db.prepare(`
        UPDATE documents
        SET signed_pdf_filename = ?,
            status = 'assinado',
            signed_at = datetime('now')
        WHERE zapsign_doc_token = ?
      `).run(pdfFilename, documentId);

      console.log(`✅ PDF assinado salvo: ${pdfFilename} (doc DB id=${docRecord.id})`);

      // D5: Notificações WhatsApp — buscar dados do cliente
      try {
        const db2 = getDB();
        const clientInfo = db2.prepare(`
          SELECT c.nome, c.telefone, t.name as template_name
          FROM documents d
          JOIN clients c ON c.id = d.client_id
          JOIN templates t ON t.id = d.template_id
          WHERE d.id = ?
        `).get(docRecord.id);

        if (clientInfo) {
          notifyDocumentoAssinado({
            clienteNome:     clientInfo.nome,
            clienteTelefone: clientInfo.telefone,
            templateNome:    clientInfo.template_name,
          }).catch(err => console.warn('[whatsapp] Erro na notificação de assinatura:', err.message));
        }
      } catch (notifyErr) {
        console.warn('[whatsapp] Erro ao buscar dados para notificação:', notifyErr.message);
      }
    } catch (err) {
      console.error('❌ Erro ao baixar PDF assinado do Autentique:', err.message);
    }

  } catch (err) {
    console.error('❌ Erro no webhook Autentique:', err.message);
    // Não relança — já respondeu 200 acima ou nunca chegou a responder
  }
});

// ─── Rota legada ZapSign — mantida para não quebrar caso ainda exista algum
//     documento antigo em trânsito. Pode ser removida depois.
router.post('/zapsign', (req, res) => {
  console.warn('⚠️  Webhook ZapSign chamado — integração encerrada. Ignorando.');
  res.json({ ok: true, note: 'ZapSign desativado' });
});

export default router;
