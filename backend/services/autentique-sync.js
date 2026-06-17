import { getDB } from '../db.js';
import { getDocument, downloadSignedPdf } from './autentique.js';
import { notifyDocumentoAssinado } from './evolution.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Verifica documentos pendentes de assinatura no Autentique e baixa os assinados
// Assinar documento automaticamente pela Dra. Andreia via API Autentique
// Documentação: https://docs.autentique.com.br/api/mutations/assinando-um-documento
// Só funciona com a conta vinculada ao token da API (conta da Andreia)
async function autoAssinarAndreia(documentId) {
  const ATOKEN = process.env.AUTENTIQUE_API_TOKEN;
  if (!ATOKEN) return;

  const mutation = `mutation { signDocument(id: "${documentId}") }`;

  try {
    const resp = await fetch('https://api.autentique.com.br/v2/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ATOKEN}` },
      body: JSON.stringify({ query: mutation })
    });
    const data = await resp.json();
    console.log('  Resposta Autentique sign:', JSON.stringify(data));
    if (data.errors) {
      console.error('  ❌ Erro auto-assinatura:', JSON.stringify(data.errors));
    } else {
      console.log('  ✅ Auto-assinatura Dra. Andreia concluída');
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

      // ÚNICO indicador confiável: files.signed (signed?.created_at é inconsistente na API)
      const assinaturas = autDoc.signatures || [];
      const signedUrl = autDoc.files?.signed;

      // Tentar auto-assinatura se o PDF ainda não está disponível
      if (!signedUrl) {
        const ANDREIA = ['fmachado.andreia@gmail.com','dra.andreia@advmachado.adv.br'];
        const andreiaSig = assinaturas.find(s => ANDREIA.includes(s.email?.toLowerCase()));
        const clienteSigs = assinaturas.filter(s => !ANDREIA.includes(s.email?.toLowerCase()));
        // Verificar se cliente assinou via signed.created_at (quando disponível)
        const clienteAssinouAPI = clienteSigs.length > 0 && clienteSigs.every(s => s.signed?.created_at);
        const andreiaAssinouAPI = andreiaSig ? !!andreiaSig.signed?.created_at : true;

        if (clienteAssinouAPI && !andreiaAssinouAPI && andreiaSig) {
          console.log(`  🖊️  ${doc.client_nome}: tentando auto-assinatura...`);
          await autoAssinarAndreia(doc.zapsign_doc_token);
          await new Promise(r => setTimeout(r, 4000));
          // Rebuscar após tentar assinar
          const autDocAtualizado = await getDocument(doc.zapsign_doc_token);
          if (autDocAtualizado?.files?.signed) {
            console.log(`  ✅ Auto-assinatura OK — baixando PDF`);
            // continuar com o PDF do documento atualizado
            Object.assign(autDoc, autDocAtualizado);
          } else {
            console.log(`  ⏳ ${doc.client_nome}: aguardando assinatura do cliente`);
            continue;
          }
        } else {
          console.log(`  ⏳ ${doc.client_nome}: PDF assinado não disponível ainda`);
          continue;
        }
      }

      const signedUrlFinal = autDoc.files?.signed;
      if (signedUrlFinal) {
        const pdfFilename = doc.docx_filename
          ? doc.docx_filename.replace(/\.docx$/, '_assinado.pdf')
          : `doc_${doc.zapsign_doc_token}_assinado.pdf`;
        const pdfPath = path.join(pdfsDir, pdfFilename);

        await downloadSignedPdf(signedUrlFinal || signedUrl, pdfPath);

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
