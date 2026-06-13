import { getDB } from '../db.js';

async function getResend() {
  const { Resend } = await import('resend');
  return new Resend(process.env.RESEND_API_KEY);
}

export async function verificarPrazosProximos() {
  const db = getDB();

  const hoje = new Date();
  const em3dias = new Date();
  em3dias.setDate(hoje.getDate() + 3);

  const dataHoje = hoje.toISOString().split('T')[0];
  const dataLimite = em3dias.toISOString().split('T')[0];

  const prazos = db.prepare(`
    SELECT 
      pz.id, pz.titulo, pz.tipo, pz.data_limite,
      p.numero_cnj,
      c.nome as client_nome,
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

  const destinatario = process.env.ALERT_EMAIL || process.env.SMTP_USER || 'dra.andreia@advmachado.adv.br';
  const senderName = process.env.SENDER_NAME || 'DocJuris';

  const linhas = prazos.map(pz => {
    const d = new Date(pz.data_limite + 'T00:00:00');
    const diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
    const urgencia = diff <= 0 ? '🔴 VENCIDO' : diff === 1 ? '🟠 AMANHÃ' : `🟡 em ${diff} dia(s)`;
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
        <p>Você tem <strong>${prazos.length} prazo(s)</strong> vencendo nos próximos 3 dias:</p>
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
    const resend = await getResend();
    const { data, error } = await resend.emails.send({
      from: `${senderName} <onboarding@resend.dev>`,
      to: destinatario,
      subject: `⚠️ ${prazos.length} prazo(s) vencendo em breve — DocJuris`,
      html,
    });

    if (error) {
      console.error('❌ Erro Resend:', error);
      return;
    }

    console.log(`✅ Alerta enviado para ${destinatario} (id: ${data?.id})`);

    const ids = prazos.map(p => p.id);
    db.prepare(`UPDATE prazos SET alerta_enviado = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);

  } catch (err) {
    console.error('❌ Erro ao enviar alerta:', err.message);
  }
}
