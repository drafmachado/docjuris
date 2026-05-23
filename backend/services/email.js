import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// Configura o transporte de email
// Para produção: use SMTP real (Gmail, SendGrid, Brevo, etc.)
// Para desenvolvimento: usa Ethereal (email falso para teste)
let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    // Configuração de produção
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Conta de teste Ethereal (desenvolvimento)
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('📧 Email de teste configurado:', testAccount.user);
    console.log('📬 Visualize em: https://ethereal.email');
  }

  return transporter;
}

export async function sendDocumentEmail({ to, clientName, documentName, pdfPath, fromName }) {
  const transport = await getTransporter();

  const attachments = [];
  if (pdfPath && fs.existsSync(pdfPath)) {
    attachments.push({
      filename: path.basename(pdfPath),
      path: pdfPath,
      contentType: 'application/pdf',
    });
  }

  const senderName = fromName || process.env.SENDER_NAME || 'Escritório Jurídico';
  const senderEmail = process.env.SMTP_USER || 'noreply@escritorio.com';

  const info = await transport.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to,
    subject: `${documentName} - ${clientName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f2035;">Documento pronto para assinatura</h2>
        <p>Prezado(a) <strong>${clientName}</strong>,</p>
        <p>Segue em anexo o documento <strong>${documentName}</strong> para sua apreciação e assinatura.</p>
        <p>Em caso de dúvidas, entre em contato conosco.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <p style="color: #666; font-size: 12px;">${senderName}</p>
      </div>
    `,
    attachments,
  });

  // Em desenvolvimento, mostra URL de preview
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('📧 Preview do email:', previewUrl);
  }

  return { messageId: info.messageId, previewUrl };
}
