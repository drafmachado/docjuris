// backend/services/autentique.js
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const AUTENTIQUE_API_URL = 'https://api.autentique.com.br/v2/graphql';
const AUTENTIQUE_API_TOKEN = process.env.AUTENTIQUE_API_TOKEN;

if (!AUTENTIQUE_API_TOKEN) {
  console.warn('[autentique] AUTENTIQUE_API_TOKEN nao definido. Configure no Railway.');
}

// ─── Signatários por template ────────────────────────────────────────────────
// Templates 5 e 6: só o cliente assina
// Templates 4 e 7: cliente + Dra. Andreia (cliente assina primeiro)
// Outros / desconhecidos: só o cliente (comportamento padrão seguro)
export function buildSigners(templateId, clientEmail, advogadas = 'ambas') {
  // IMPORTANTE: para a auto-assinatura funcionar, o email da Andreia DEVE ser
  // o mesmo da conta dona do token da API do Autentique (fmachado.andreia@gmail.com).
  // O signDocument só assina pela conta titular do token. (doc oficial Autentique)
  // Configurável via AUTENTIQUE_SIGNER_EMAIL; default = dono do token.
  const ANDREIA_EMAIL = process.env.AUTENTIQUE_SIGNER_EMAIL || 'fmachado.andreia@gmail.com';
  const THAISA_EMAIL  = 'thaiisa_sousa@hotmail.com';

  const id = Number(templateId);

  // Só cliente
  if (id === 5 || id === 6) {
    return [
      { email: clientEmail, action: 'SIGN' },
    ];
  }

  // Cliente + advogada(s) atuante(s) — conforme cadastro do cliente (cliente assina primeiro)
  if (id === 4 || id === 7) {
    const signers = [{ email: clientEmail, action: 'SIGN' }];
    if (advogadas === 'ambas' || advogadas === 'andreia') {
      signers.push({ email: ANDREIA_EMAIL, action: 'SIGN' });
    }
    if (advogadas === 'ambas' || advogadas === 'thaisa') {
      signers.push({ email: THAISA_EMAIL, action: 'SIGN' });
    }
    return signers;
  }

  // Casos especiais futuros: cliente + Andreia + Thaisa
  // if (id === X) { return [..., { email: THAISA_EMAIL, action: 'SIGN' }]; }

  // Padrão: só cliente
  console.warn(`[autentique] Template ${templateId} sem regra de signatários definida. Usando padrão: só cliente.`);
  return [{ email: clientEmail, action: 'SIGN' }];
}

// ─── Criar documento e enviar para assinatura ────────────────────────────────
export async function createDocument({ name, filePath, fileBuffer, fileName, signers, options = {} }) {
  const mutation = `
    mutation CreateDocumentMutation(
      $document: DocumentInput!,
      $signers: [SignerInput!]!,
      $file: Upload!
    ) {
      createDocument(document: $document, signers: $signers, file: $file) {
        id
        name
        refusable
        sortable
        created_at
        signatures {
          public_id
          name
          email
          created_at
          action { name }
          link { short_link }
          user { id name email }
        }
        files {
          original
          signed
        }
      }
    }
  `;

  const variables = {
    document: { name, ...options },
    signers: signers.map((s) => ({ ...s, action: s.action || 'SIGN' })),
    file: null,
  };

  const form = new FormData();
  form.append('operations', JSON.stringify({ query: mutation, variables }));
  form.append('map', JSON.stringify({ file: ['variables.file'] }));

  if (fileBuffer) {
    form.append('file', fileBuffer, { filename: fileName || 'documento.pdf', contentType: 'application/pdf' });
  } else if (filePath) {
    form.append('file', fs.createReadStream(filePath));
  } else {
    throw new Error('[autentique] createDocument: forneca filePath ou fileBuffer');
  }

  const response = await axios.post(AUTENTIQUE_API_URL, form, {
    headers: {
      Authorization: `Bearer ${AUTENTIQUE_API_TOKEN}`,
      ...form.getHeaders(),
    },
  });

  assertNoErrors(response.data, 'createDocument');
  return response.data.data.createDocument;
}

// ─── Consultar documento ─────────────────────────────────────────────────────
export async function getDocument(documentId) {
  const query = `
    query {
      document(id: "${documentId}") {
        id
        name
        created_at
        signatures {
          public_id
          name
          email
          action { name }
          link { short_link }
          viewed { created_at }
          signed { created_at }
          rejected { created_at }
        }
        files { original signed }
      }
    }
  `;

  const response = await axios.post(AUTENTIQUE_API_URL, { query }, { headers: authHeaders() });
  assertNoErrors(response.data, 'getDocument');
  return response.data.data.document;
}

// ─── Baixar PDF assinado a partir da URL pública do Autentique ───────────────
export async function downloadSignedPdf(signedUrl, destPath) {
  // 425 = arquivo ainda sendo selado pelo Autentique. Retry com backoff.
  const tentativas = [0, 2000, 4000, 8000, 15000]; // ms de espera antes de cada tentativa
  let ultimoErro;

  for (let i = 0; i < tentativas.length; i++) {
    if (tentativas[i] > 0) await new Promise(r => setTimeout(r, tentativas[i]));
    try {
      const response = await axios.get(signedUrl, {
        responseType: 'arraybuffer',
        maxRedirects: 5,
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Veredo/1.0)' },
        validateStatus: s => s >= 200 && s < 300,
      });
      fs.writeFileSync(destPath, Buffer.from(response.data));
      return destPath;
    } catch(e) {
      ultimoErro = e;
      const status = e.response?.status;
      // 425/503 = ainda processando, vale retry. Outros erros = aborta.
      if (status !== 425 && status !== 503 && status !== 429) {
        // Tentar uma vez com auth header antes de desistir
        if (status === 401 || status === 403) {
          try {
            const r2 = await axios.get(signedUrl, { responseType:'arraybuffer', maxRedirects:5, timeout:30000, headers: authHeaders() });
            fs.writeFileSync(destPath, Buffer.from(r2.data));
            return destPath;
          } catch(e2) { throw e2; }
        }
        throw e;
      }
      // senão, continua o loop (retry)
    }
  }
  throw ultimoErro;
}

// ─── Reenviar assinatura ─────────────────────────────────────────────────────
export async function resendSignature(signaturePublicId) {
  const mutation = `
    mutation {
      resendSignature(public_id: "${signaturePublicId}") {
        public_id name email
      }
    }
  `;

  const response = await axios.post(AUTENTIQUE_API_URL, { query: mutation }, { headers: authHeaders() });
  assertNoErrors(response.data, 'resendSignature');
  return response.data.data.resendSignature;
}

// ─── Deletar documento ────────────────────────────────────────────────────────
export async function deleteDocument(documentId) {
  const mutation = `
    mutation {
      deleteDocument(id: "${documentId}") { id }
    }
  `;

  const response = await axios.post(AUTENTIQUE_API_URL, { query: mutation }, { headers: authHeaders() });
  assertNoErrors(response.data, 'deleteDocument');
  return response.data.data.deleteDocument;
}

// ─── Helpers internos ────────────────────────────────────────────────────────
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AUTENTIQUE_API_TOKEN}`,
  };
}

function assertNoErrors(responseData, operationName) {
  if (responseData.errors?.length) {
    const msgs = responseData.errors.map((e) => e.message).join(' | ');
    throw new Error(`[autentique] Erro em "${operationName}": ${msgs}`);
  }
}
