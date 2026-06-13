import { getDB } from '../db.js';
import nodemailer from 'nodemailer';

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('📧 Ethereal configurado:', testAccount.user);
  }
  return transporter;
}

export async function verificarPrazosProximos() {
  const db = getDB();

  // Busca prazos pendentes com vencimento em até 3 dias
  const hoje = new Date();
  const em3dias = new Date();
  em3dias.setDate(hoje.getDate() + 3);

  const dataHoje = hoje.toISOString().split('T')[0];
  const dataLimite = em3dias.toISOString().split('T')[0];

  const prazos = db.prepare(`
    SELECT 
      pz.id, pz.titulo, pz.tipo, pz.data_limite, pz.observacoes,
      p.numero_cnj, p.vara, p.comarca, p.tribunal,
      c.nome as client_nome, c.email as client_email,
      u.name as responsavel_nome, u.email as responsavel_email
    FROM prazos pz
    JOIN processos p ON p.id = pz.processo_id
    JOIN clients c ON c.id = pz.client_id
    LEFT JOIN users u ON u.id = pz.responsavel_id
    WHERE pz.concluido = 0
      AND pz.data_limite BETWEEN ? AND ?
      AND pz.alerta_enviado = 0
  `).all(dataHoje, dataLimite);

  if (prazos.length === 0) {
    console.log('⏰ Nenhum prazo próximo para alertar');
    return;
  }

  console.log(`⚠️  ${prazos.length} prazo(s) próximo(s) encontrado(s)`);

  const transport = await getTransporter();
  const senderName = process.env.SENDER_NAME || 'DocJuris';
  const senderEmail = process.env.SMTP_USER || 'noreply@docjuris.com';
  const destinatario = process.env.ALERT_EMAIL || senderEmail;

  // Agrupar prazos por email do responsável
  const porResponsavel = {};
  for (const pz of prazos) {
    const email = pz.responsavel_email || destinatario;
    if (!porResponsavel[email]) porResponsavel[email] = [];
    porResponsavel[email].push(pz);
  }

  for (const [email, lista] of Object.entries(porResponsavel)) {
    const linhas = lista.map(pz => {
      const d = new Date(pz.data_limite + 'T00:00:00');
      const diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
      const urgencia = diff <= 0 ? '🔴 VENCIDO' : diff === 1 ? '🟠 AMANHÃ' : `🟡 em ${diff} dias`;
      return `
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:10px">${urgencia}</td>
          <td style="padding:10px"><strong>${pz.titulo}</strong><br><span style="color:#666;font-size:12px">${pz.tipo}</span></td>
          <td style="padding:10px">${pz.numero_cnj}<br><span style="color:#666;font-size:12px">${pz.client_nome}</span></td>
          <td style="padding:10px">${d.toLocaleDateString('pt-BR')}</td>
        </tr>`;
    }).join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
        <div style="background:#0f2035;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0">⚠️ Alerta de Prazos — DocJuris</h2>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb">
          <p>Você tem <strong>${lista.length} prazo(s)</strong> vencendo nos próximos 3 dias:</p>
          <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:#0f2035;color:white">
                <th style="padding:10px;text-align:left">Situação</th>
                <th style="padding:10px;text-align:left">Prazo</th>
                <th style="padding:10px;text-align:left">Processo / Cliente</th>
                <th style="padding:10px;text-align:left">Data</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
          <p style="margin-top:20px;color:#666;font-size:12px">Acesse o DocJuris para visualizar os detalhes.</p>
        </div>
      </div>`;

    try {
      const info = await transport.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: email,
        subject: `⚠️ ${lista.length} prazo(s) vencendo em breve — DocJuris`,
        html,
      });
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) console.log('📧 Preview:', preview);
      console.log(`✅ Alerta enviado para ${email}`);

      // Marcar alertas como enviados
      const ids = lista.map(p => p.id);
      db.prepare(`UPDATE prazos SET alerta_enviado = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    } catch (err) {
      console.error(`❌ Erro ao enviar alerta para ${email}:`, err.message);
    }
  }
}
