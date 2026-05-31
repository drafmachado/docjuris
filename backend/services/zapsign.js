// backend/services/zapsign.js
import fs from 'fs';
import fetch from 'node-fetch';

const ZAPSIGN_API = 'https://api.zapsign.com.br/api/v1';
const TOKEN = process.env.ZAPSIGN_API_TOKEN;

// Signatários fixos (doutoras)
const DRA_ANDREIA = {
  name: 'Andreia Machado',
  email: 'dra.andreia@advmachado.adv.br',
};

const DRA_THAISA = {
  name: 'THAISA DE SOUZA DA SILVA',
  email: 'thaiisa_sousa@hotmail.com',
};

// Cenários de assinatura por template
// 1 = só cliente, 2 = cliente + Andreia, 3 = cliente + Andreia + Thaísa
export const SIGNING_SCENARIO = {
  4: 2, // Contrato Cível → cliente + Andreia
  5: 1, // Declaração de Hipossuficiência → só cliente
  6: 1, // Procuração → só cliente
  7: 2, // Contrato de Honorários → cliente + Andreia
};

/**
 * Envia documento para assinatura na ZapSign
 * @param {object} params
 * @param {string} params.docxPath - caminho do .docx gerado
 * @param {string} params.docName  - nome do documento
 * @param {object} params.client   - { nome, email }
 * @param {number} params.templateId
 * @returns {object} { zapDocToken, signers }
 */
export async function enviarParaAssinatura({ docxPath, docName, client, templateId }) {
  const scenario = SIGNING_SCENARIO[templateId] ?? 1;

  // Converte docx para base64
  const base64 = fs.readFileSync(docxPath).toString('base64');

  // Monta signatários
  const signers = [];

  // Cliente sempre assina primeiro (order_group: 1)
  signers.push({
    name: client.nome,
    email: client.email,
    auth_mode: 'assinaturaTela',
    send_automatic_email: true,
    order_group: 1,
    lock_name: true,
    lock_email: true,
    custom_message: `Olá ${client.nome}, seu documento está pronto para assinatura. Por favor, assine para prosseguir.`,
  });

  // Doutoras recebem link por e-mail para assinar manualmente (order_group: 2)
  if (scenario === 2 || scenario === 3) {
    signers.push({
      name: DRA_ANDREIA.name,
      email: DRA_ANDREIA.email,
      auth_mode: 'assinaturaTela',
      send_automatic_email: true,
      order_group: 2,
      lock_name: true,
      lock_email: true,
      custom_message: 'Um cliente assinou o documento. Por favor, assine para concluir.',
    });
  }

  if (scenario === 3) {
    signers.push({
      name: DRA_THAISA.name,
      email: DRA_THAISA.email,
      auth_mode: 'assinaturaTela',
      send_automatic_email: true,
      order_group: 2,
      lock_name: true,
      lock_email: true,
      custom_message: 'Um cliente assinou o documento. Por favor, assine para concluir.',
    });
  }

  const body = {
    name: docName,
    base64_docx: base64,
    lang: 'pt-br',
    signature_order_active: true,
    brand_name: 'Machado Escritório de Advocacia',
    signers,
  };

  const res = await fetch(`${ZAPSIGN_API}/docs/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ZapSign erro ao criar documento: ${err}`);
  }

  const data = await res.json();

  return {
    zapDocToken: data.token,
    signers: data.signers,
  };
}

/**
 * Busca documento na ZapSign para obter URL do PDF assinado
 * @param {string} zapDocToken
 */
export async function detalharDocumento(zapDocToken) {
  const res = await fetch(`${ZAPSIGN_API}/docs/${zapDocToken}/`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (!res.ok) throw new Error(`ZapSign erro ao detalhar documento: ${res.status}`);
  return await res.json();
}

/**
 * Baixa PDF assinado e salva localmente
 * @param {string} signedFileUrl - URL do arquivo assinado (retornada pelo webhook)
 * @param {string} destPath      - caminho onde salvar
 */
export async function baixarPdfAssinado(signedFileUrl, destPath) {
  const res = await fetch(signedFileUrl);
  if (!res.ok) throw new Error(`Erro ao baixar PDF assinado: ${res.status}`);
  const buffer = await res.buffer();
  fs.writeFileSync(destPath, buffer);
}
