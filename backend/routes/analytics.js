import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDB();

  // ── Leads ──
  const leadsPorEtapa = db.prepare(`
    SELECT etapa, COUNT(*) as total FROM leads GROUP BY etapa
  `).all();

  const leadsPorOrigem = db.prepare(`
    SELECT origem, COUNT(*) as total FROM leads GROUP BY origem ORDER BY total DESC
  `).all();

  const totalLeads = db.prepare('SELECT COUNT(*) as n FROM leads').get().n;
  const contratados = db.prepare("SELECT COUNT(*) as n FROM leads WHERE etapa='contratado'").get().n;
  const taxaConversao = totalLeads > 0 ? ((contratados / totalLeads) * 100).toFixed(1) : 0;

  // ── Financeiro ──
  const honorariosPorStatus = db.prepare(`
    SELECT status, COUNT(*) as qtd, SUM(valor_total) as total
    FROM honorarios GROUP BY status
  `).all();

  const honorariosPorMes = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as mes,
           SUM(valor_total) as total,
           SUM(CASE WHEN status='pago' THEN valor_total ELSE 0 END) as pago
    FROM honorarios
    WHERE created_at >= datetime('now', '-6 months')
    GROUP BY mes ORDER BY mes ASC
  `).all();

  const totalHonorarios = db.prepare("SELECT SUM(valor_total) as total FROM honorarios").get().total || 0;
  const totalPago = db.prepare("SELECT SUM(valor_total) as total FROM honorarios WHERE status='pago'").get().total || 0;
  const totalPendente = db.prepare("SELECT SUM(valor_total) as total FROM honorarios WHERE status='pendente'").get().total || 0;
  const totalAtrasado = db.prepare("SELECT SUM(valor_total) as total FROM honorarios WHERE status='atrasado'").get().total || 0;

  // ── Clientes ──
  const totalClientes = db.prepare('SELECT COUNT(*) as n FROM clients').get().n;

  const clientesPorMes = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as mes, COUNT(*) as total
    FROM clients
    WHERE created_at >= datetime('now', '-6 months')
    GROUP BY mes ORDER BY mes ASC
  `).all();

  // ── Processos ──
  const totalProcessos = db.prepare('SELECT COUNT(*) as n FROM processos').get().n;
  const processosAtivos = db.prepare("SELECT COUNT(*) as n FROM processos WHERE status='ativo'").get().n;
  const processosPorTribunal = db.prepare(`
    SELECT tribunal, COUNT(*) as total FROM processos GROUP BY tribunal ORDER BY total DESC LIMIT 5
  `).all();

  // ── Documentos ──
  const docsPorStatus = db.prepare(`
    SELECT status, COUNT(*) as total FROM documents GROUP BY status
  `).all();
  const docsAssinados = db.prepare("SELECT COUNT(*) as n FROM documents WHERE status='assinado'").get().n;

  res.json({
    leads: { porEtapa: leadsPorEtapa, porOrigem: leadsPorOrigem, total: totalLeads, taxaConversao },
    financeiro: { porStatus: honorariosPorStatus, porMes: honorariosPorMes, totalHonorarios, totalPago, totalPendente, totalAtrasado },
    clientes: { total: totalClientes, porMes: clientesPorMes },
    processos: { total: totalProcessos, ativos: processosAtivos, porTribunal: processosPorTribunal },
    documentos: { porStatus: docsPorStatus, assinados: docsAssinados },
  });
});

export default router;
