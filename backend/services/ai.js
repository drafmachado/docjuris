import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Extrai dados pessoais de documentos do cliente (RG, CPF, comprovante de residência, etc.)
export async function extractClientData(files) {
  const contentParts = [];

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    const isPDF = ext === '.pdf';

    if (isImage) {
      const data = fs.readFileSync(file.tempFilePath);
      const base64 = data.toString('base64');
      const mediaType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      contentParts.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 }
      });
      contentParts.push({ type: 'text', text: `[Arquivo: ${file.name}]` });
    } else if (isPDF) {
      const data = fs.readFileSync(file.tempFilePath);
      const base64 = data.toString('base64');
      contentParts.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 }
      });
      contentParts.push({ type: 'text', text: `[Arquivo PDF: ${file.name}]` });
    }
  }

  if (contentParts.length === 0) {
    throw new Error('Nenhum arquivo de imagem ou PDF válido encontrado');
  }

  contentParts.push({
    type: 'text',
    text: `Analise os documentos enviados e extraia os dados pessoais do cliente.
Responda APENAS com um JSON válido, sem markdown, sem explicações, no seguinte formato:
{
  "nome": "Nome completo do cliente",
  "nacionalidade": "Brasileiro(a) ou outra nacionalidade",
  "cpf": "000.000.000-00",
  "rg": "00.000.000-0",
  "orgao_expedidor": "SSP-RJ ou similar",
  "endereco": "Rua, número, bairro",
  "cidade": "Cidade",
  "estado": "UF",
  "email": "email@exemplo.com ou null",
  "telefone": "(00) 00000-0000 ou null",
  "confianca": "alta | media | baixa",
  "observacoes": "qualquer observação relevante sobre a extração ou null"
}
Se algum campo não estiver visível, use null. Formate CPF como 000.000.000-00 e RG como padronizado.`
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: contentParts }],
  });

  const text = response.content.map(b => b.text || '').join('');
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('IA não conseguiu extrair os dados no formato esperado. Tente com documentos mais legíveis.');
  }
}

// Preenche os campos de um template com dados do cliente + campos manuais
export async function fillTemplateFields(templateContent, clientData, manualFields, autoFieldsMap) {
  // Monta o mapeamento de campos automáticos a partir dos dados do cliente
  const autoValues = {};
  for (const [placeholder, clientKey] of Object.entries(autoFieldsMap)) {
    autoValues[placeholder] = clientData[clientKey] || '';
  }

  // Se o template tiver campos que não mapeamos diretamente, usamos IA para inferir
  const unmapped = [];
  const allPlaceholders = extractPlaceholders(templateContent);
  for (const ph of allPlaceholders) {
    if (!autoValues[ph] && !manualFields[ph]) {
      unmapped.push(ph);
    }
  }

  if (unmapped.length > 0) {
    const inferred = await inferRemainingFields(unmapped, clientData);
    Object.assign(autoValues, inferred);
  }

  return { ...autoValues, ...manualFields };
}

// Extrai todos os placeholders {{CAMPO}} de um texto
export function extractPlaceholders(text) {
  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '').trim()))];
}

// Usa IA para inferir campos não mapeados a partir dos dados do cliente
async function inferRemainingFields(fields, clientData) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Dados do cliente: ${JSON.stringify(clientData)}

Preciso preencher os seguintes campos de um documento jurídico:
${fields.join('\n')}

Responda APENAS com JSON sem markdown:
{ "NomeCampo": "valor inferido ou string vazia" }

Use os dados do cliente para inferir os valores. Para campos que não podem ser inferidos dos dados, retorne string vazia.`
    }]
  });

  const text = response.content.map(b => b.text || '').join('');
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return {};
  }
}

// Analisa um template .docx e identifica os campos
export async function analyzeTemplateFields(templateText) {
  const placeholders = extractPlaceholders(templateText);

  if (placeholders.length === 0) return { auto_fields: [], manual_fields: [] };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Analise estes campos de um template de documento jurídico e classifique cada um:
${placeholders.join(', ')}

Campos AUTO são dados pessoais do cliente (nome, CPF, RG, endereço, etc.) que podem ser extraídos de documentos.
Campos MANUAL são dados do serviço/contrato (valores, datas, percentuais, forma de pagamento, etc.) que precisam ser preenchidos manualmente.

Responda APENAS com JSON válido:
{
  "auto_fields": ["CAMPO1", "CAMPO2"],
  "manual_fields": [
    {"key": "CAMPO", "label": "Rótulo amigável", "type": "text|number|date|currency|percent"},
    ...
  ]
}`
    }]
  });

  const text = response.content.map(b => b.text || '').join('');
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    // Fallback: todos como manuais
    return {
      auto_fields: [],
      manual_fields: placeholders.map(p => ({ key: p, label: p, type: 'text' }))
    };
  }
}
