import { getDB } from '../db.js';
import { getDocument, downloadSignedPdf } from './autentique.js';
import { notifyDocumentoAssinado } from './evolution.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Verifica documentos pendentes de assinatura no Autentique e baixa os assinados
// Assinar documento automaticamente pela Dra. Andreia via API Autentique
async function autoAssinarAndreia(documentId, sig) {
  const TOKEN = process.env.AUTENTIQUE_API_TOKEN;
  if (!TOKEN) return;

  // Usar o link de assinatura da Andreia para assinar via API
  const mutation = `
    mutation SignDocument($id: UUID!, $data: SignatoryDataInput) {
      sign(document_id: $id, data: $data) {
        signed
      }
    }
  `;

  try {
    const resp = await fetch('https://api.autentique.com.br/v2/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${TOKEN}\` },
      body: JSON.stringify({
        query: mutation,
        variables: { id: documentId, data: {} }
      })
    });
    const data = await resp.json();
    if (data.errors) {
      console.error('  ❌ Erro auto-assinatura:', JSON.stringify(data.errors));
    } else {
      console.log('  ✅ Assinatura Andreia enviada via API');
    }
  } catch(e) {
    console.error('  ❌ Erro auto-assinatura:', e.message);
  }
}

export async function sincronizarAutentique(recentOnly = false) {
  if (!process.env.AUTENTIQUE_API_TOKEN) {
    console.log('⚠️  AUTENTIQUE_API_TOKEN não configurado — pulando sync');
    return;
  }

  const db = getDB();

  // Buscar documentos enviados para assinatura que ainda não foram baixados
  const filtroRecente = recentOnly ? "AND d.created_at > datetime('now', '-7 days')" : '';
  const pendentes = db.prepare(`
    SELECT d.*, c.nome as client_nome, c.telefone as client_telefone, t.name as template_name
    FROM documents d
    JOIN clients c ON c.id = d.client_id
    LEFT JOIN templates t ON t.id = d.template_id
    WHERE d.zapsign_doc_token IS NOT NULL
      AND (d.signed_pdf_filename IS NULL OR d.status != 'assinado')
      ${filtroRecente}
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

      // Verificar estado das assinaturas
      const assinaturas = autDoc.signatures || [];
      const signedUrl = autDoc.files?.signed;

      // Auto-assinar pela Dra. Andreia se cliente já assinou e Andreia ainda não
      const andreiaSig = assinaturas.find(s =>
        s.email?.toLowerCase() === 'fmachado.andreia@gmail.com' ||
        s.email?.toLowerCase() === 'dra.andreia@advmachado.adv.br'
      );
      const clienteSigs = assinaturas.filter(s =>
        s.email?.toLowerCase() !== 'fmachado.andreia@gmail.com' &&
        s.email?.toLowerCase() !== 'dra.andreia@advmachado.adv.br'
      );
      const clienteAssinou = clienteSigs.length > 0 && clienteSigs.every(s => s.signed?.created_at);
      const andreiaAssinou = andreiaSig ? !!andreiaSig.signed?.created_at : true; // se não é signatária, ok

      if (clienteAssinou && !andreiaAssinou && andreiaSig) {
        console.log(`  🖊️  ${doc.client_nome}: cliente assinou — iniciando auto-assinatura da Dra. Andreia...`);
        await autoAssinarAndreia(doc.zapsign_doc_token, andreiaSig);
        // Aguardar Autentique processar
        await new Promise(r => setTimeout(r, 3000));
        // Buscar novamente para pegar o PDF assinado
        const autDocAtualizado = await getDocument(doc.zapsign_doc_token);
        if (autDocAtualizado?.files?.signed) {
          console.log(`  ✅ Auto-assinatura concluída!`);
        }
      }

      if (!signedUrl) {
        const pendentes = assinaturas.filter(s => !s.signed?.created_at).map(s => s.email).join(', ');
        console.log(`  ⏳ ${doc.client_nome}: aguardando assinatura de ${pendentes || 'verificando'}`);
        continue;
      }

      if (signedUrl) {
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
