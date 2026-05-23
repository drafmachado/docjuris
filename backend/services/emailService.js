const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dramachado.adv@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

transporter.verify((err) => {
  if (err) {
    console.error('[emailService] Falha na conexão Gmail:', err.message);
  } else {
    console.log('[emailService] Gmail pronto para envio.');
  }
});

async function enviarPDF({ to, subject, text, html, pdfPath, pdfName }) {
  if (!to || !pdfPath) {
    throw new Error('enviarPDF: "to" e "pdfPath" são obrigatórios.');
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`enviarPDF: arquivo não encontrado em ${pdfPath}`);
  }

  const mailOptions = {
    from: '"Andreia Machado — Advocacia" <dramachado.adv@gmail.com>',
    to,
    subject: subject || 'Documento — Andreia Machado Advocacia',
    text: text || 'Segue em anexo o documento solicitado.',
    html: html || undefined,
    attachments: [
      {
        filename: pdfName || path.basename(pdfPath),
        path: pdfPath,
        contentType: 'application/pdf',
      },
    ],
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[emailService] Email enviado para ${to} — messageId: ${info.messageId}`);
  return info;
}

async function enviarPDFBuffer({ to, subject, text, html, pdfBuffer, pdfName }) {
  if (!to || !pdfBuffer) {
    throw new Error('enviarPDFBuffer: "to" e "pdfBuffer" são obrigatórios.');
  }

  const mailOptions = {
    from: '"Andreia Machado — Advocacia" <dramachado.adv@gmail.com>',
    to,
    subject: subject || 'Documento — Andreia Machado Advocacia',
    text: text || 'Segue em anexo o documento solicitado.',
    html: html || undefined,
    attachments: [
      {
        filename: pdfName || 'documento.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[emailService] Email (buffer) enviado para ${to} — messageId: ${info.messageId}`);
  return info;
}

module.exports = { enviarPDF, enviarPDFBuffer };
