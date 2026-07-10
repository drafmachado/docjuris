// Portal do Cliente — acesso público com verificação por código via WhatsApp
// Fluxo: cliente informa CPF → recebe código de 6 dígitos no WhatsApp → acessa seus dados
import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { getDB } from '../db.js';
import { sendText } from '../services/evolution.js';

const router = express.Router();
const PORTAL_SECRET = (process.env.JWT_SECRET || 'dev-only-secret-nao-usar-em-producao') + '_portal';

// Códigos em memória: cpf → { codigo, expira, tentativas }
const codigos = new Map();
setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of codigos) if (v.expira < agora) codigos.delete(k);
}, 60 * 1000);

// Rate limit rígido — evita enumeração de CPFs
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Muitas tentativas. Aguarde 15 minutos.' } });

function limparCPF(cpf) { return (cpf || '').replace(/\D/g, ''); }

// ─── POST /api/portal/solicitar-codigo ───
router.post('/solicitar-codigo', limiter, async (req, res) => {
  const cpf = limparCPF(req.body.cpf);
  if (cpf.length !== 11) return res.status(400).json({ error: 'CPF inválido' });

  const db = getDB();
  // Buscar cliente por CPF (normalizado)
  const cliente = db.prepare(`
    SELECT id, nome, telefone FROM clients
    WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
  `).get(cpf);

  // Resposta idêntica exista ou não o CPF — evita enumeração
  const respostaGenerica = { ok: true, mensagem: 'Se o CPF estiver cadastrado, um código foi enviado ao WhatsApp registrado.' };

  if (!cliente || !cliente.telefone) return res.json(respostaGenerica);

  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  codigos.set(cpf, { codigo, expira: Date.now() + 5 * 60 * 1000, tentativas: 0, clientId: cliente.id });

  const primeiroNome = (cliente.nome || '').split(' ')[0];
  await sendText(cliente.telefone,
    `🔐 *Portal do Cliente — Machado Advocacia*\n\nOlá, ${primeiroNome}! Seu código de acesso é:\n\n*${codigo}*\n\nVálido por 5 minutos. Não compartilhe com ninguém.`);

  res.json(respostaGenerica);
});

// ─── POST /api/portal/validar ───
router.post('/validar', limiter, (req, res) => {
  const cpf = limparCPF(req.body.cpf);
  const codigo = String(req.body.codigo || '').trim();

  const registro = codigos.get(cpf);
  if (!registro || registro.expira < Date.now()) {
    return res.status(401).json({ error: 'Código expirado ou não solicitado. Solicite um novo.' });
  }
  registro.tentativas++;
  if (registro.tentativas > 5) {
    codigos.delete(cpf);
    return res.status(429).json({ error: 'Muitas tentativas. Solicite um novo código.' });
  }
  if (registro.codigo !== codigo) {
    return res.status(401).json({ error: 'Código incorreto.' });
  }

  codigos.delete(cpf);
  const token = jwt.sign({ clientId: registro.clientId, tipo: 'portal' }, PORTAL_SECRET, { expiresIn: '30m' });
  res.json({ token });
});

// ─── Middleware do portal ───
function portalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const payload = jwt.verify(header.slice(7), PORTAL_SECRET);
    if (payload.tipo !== 'portal') throw new Error();
    req.clientId = payload.clientId;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
}

// ─── GET /api/portal/meus-dados ───
router.get('/meus-dados', portalAuth, (req, res) => {
  const db = getDB();
  const cliente = db.prepare('SELECT id, nome FROM clients WHERE id = ?').get(req.clientId);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

  const processos = db.prepare(`
    SELECT id, numero_cnj, tribunal, polo_ativo, polo_passivo, status
    FROM processos WHERE client_id = ? ORDER BY created_at DESC
  `).all(req.clientId);

  // Últimos 5 andamentos por processo
  for (const p of processos) {
    p.andamentos = db.prepare(`
      SELECT data, descricao FROM andamentos
      WHERE processo_id = ? ORDER BY data DESC LIMIT 5
    `).all(p.id);
  }

  const documentos = db.prepare(`
    SELECT d.id, t.name as nome, d.created_at,
           CASE WHEN d.status = 'assinado' OR d.signed_pdf_filename IS NOT NULL THEN 'assinado'
                WHEN d.zapsign_doc_token IS NOT NULL THEN 'aguardando_assinatura'
                ELSE 'em_preparo' END as situacao
    FROM documents d JOIN templates t ON t.id = d.template_id
    WHERE d.client_id = ? ORDER BY d.created_at DESC
  `).all(req.clientId);

  const prazos = db.prepare(`
    SELECT titulo, tipo, data_limite FROM prazos
    WHERE client_id = ? AND concluido = 0 AND data_limite >= date('now')
    ORDER BY data_limite ASC LIMIT 10
  `).all(req.clientId);

  res.json({ cliente: { nome: cliente.nome }, processos, documentos, prazos });
});

export default router;
