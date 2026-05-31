// backend/services/autentique.js
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const AUTENTIQUE_API_URL = 'https://api.autentique.com.br/v2/graphql';
const AUTENTIQUE_API_TOKEN = process.env.AUTENTIQUE_API_TOKEN;

if (!AUTENTIQUE_API_TOKEN) {
  console.warn('[autentique] AUTENTIQUE_API_TOKEN nao definido. Configure no Railway.');
}

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
    signers: signers.map((s) => ({ action: 'SIGN', ...s })),
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
