import { getDB } from '../db.js';
import { getDocument, downloadSignedPdf } from './autentique.js';
import { notifyDocumentoAssinado } from './evolution.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Verifica documentos pendentes de assinatura no Autentique e baixa os assinados
export async function sincronizarAutentique() {
  if (!process.env.AUTENTIQUE_API_TOKEN) {
    console.log('⚠️  AUTENTIQUE_API_TOKEN não configurado — pulando sync');
    return;
  }

  const db = getDB();

  // Buscar documentos enviados para assinatura que ainda não foram baixados
  const pendentes = db.prepare(`
    SELECT d.*, c.nome as client_nome, c.telefone as client_telefone, t.name as template_name
    FROM documents d
    JOIN clients c ON c.id = d.client_id
    LEFT JOIN templates t ON t.id = d.template_id
    WHERE d.zapsign_doc_token IS NOT NULL
      AND (d.signed_pdf_filename IS NULL OR d.status != 'assinado')
  `).all();

  if (pendentes.length === 0) {
    console.log('📝 Autentique sync: nenhum documento pendente');
    return;
  }

  console.log(`📝 Autentique sync: verificando ${pendentes.length} documento(s) pendente(s)...`);

  const storageDir = process.env.NODE_ENV === 'production'
    ? '/app/storage'
    : path.join(__dirname, '../../storage');
  const pdfsDir = path.join(storageDir, 'pdfs');
  if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });

  let baixados = 0;

  for (const doc of pendentes) {
    try {
      const autDoc = await getDocument(doc.zapsign_doc_token);
      if (!autDoc) continue;

      // Verificar se TODOS assinaram
      const assinaturas = autDoc.signatures || [];
      const todosAssinaram = assinaturas.length > 0 &&
        assinaturas.every(s => s.signed?.created_at || s.action?.name !== 'Sign');

      const signedUrl = autDoc.files?.signed;

      if (todosAssinaram && signedUrl) {
        const pdfFilename = doc.docx_filename
          ? doc.docx_filename.replace(/\.docx$/, '_assinado.pdf')
          : `doc_${doc.zapsign_doc_token}_assinado.pdf`;
        const pdfPath = path.join(pdfsDir, pdfFilename);

        await downloadSignedPdf(signedUrl, pdfPath);

        db.prepare(`
          UPDATE documents SET signed_pdf_filename = ?, status = 'assinado', signed_at = datetime('now')
          WHERE id = ?
        `).run(pdfFilename, doc.id);

        baixados++;
        console.log(`  ✅ Assinado e baixado: ${doc.template_name} - ${doc.client_nome}`);

        // Notificar
        notifyDocumentoAssinado({
          clienteNome: doc.client_nome,
          clienteTelefone: doc.client_telefone,
          templateNome: doc.template_name,
        }).catch(() => {});
      }
    } catch (e) {
      console.error(`  Erro ao verificar doc ${doc.id}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`✅ Autentique sync concluído — ${baixados} novo(s) PDF(s) assinado(s)`);
}
