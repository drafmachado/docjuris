// backend/services/backup.js
// Backup triplo do banco de dados:
//   1. Cópia local compactada no volume (storage/backups) — mantém 14 dias
//   2. Email diário com o banco anexado (Resend → Gmail da Dra. Andreia) — off-site garantido
//   3. Google Drive (bônus — contas de serviço têm limitação de cota, pode falhar)
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FOLDER_ID = '1S430FxBjLfjVLpdXsBfD8l8Hd6IBoBbN';
const STORAGE = process.env.NODE_ENV === 'production'
  ? '/app/storage'
  : path.join(__dirname, '../../storage');
const DB_PATH = path.join(STORAGE, 'docjuris.db');
const BACKUPS_DIR = path.join(STORAGE, 'backups');
const KEEP_LOCAL = 14;   // dias de cópias locais
const KEEP_DRIVE = 30;   // dias no Drive
const EMAIL_DESTINO = 'fmachado.andreia@gmail.com';

function getAuth() {
  return new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL, null,
    process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/drive']
  );
}

// ─── 1. Cópia local compactada ───────────────────────────────────────────────
function backupLocal(timestamp) {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const destino = path.join(BACKUPS_DIR, `docjuris_${timestamp}.db.gz`);
  if (fs.existsSync(destino)) return { ok: true, detalhe: 'cópia local do dia já existe' };

  const dados = fs.readFileSync(DB_PATH);
  const comprimido = zlib.gzipSync(dados);
  fs.writeFileSync(destino, comprimido);

  // Limpeza: manter só os últimos KEEP_LOCAL
  const arquivos = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('docjuris_') && f.endsWith('.db.gz'))
    .sort();
  while (arquivos.length > KEEP_LOCAL) {
    fs.unlinkSync(path.join(BACKUPS_DIR, arquivos.shift()));
  }
  return { ok: true, detalhe: `${(comprimido.length / 1024).toFixed(0)}KB` };
}

// ─── 2. Email com anexo (Resend) ─────────────────────────────────────────────
async function backupEmail(timestamp) {
  if (!process.env.RESEND_API_KEY) return { ok: false, erro: 'RESEND_API_KEY ausente' };
  const dados = fs.readFileSync(DB_PATH);
  const comprimido = zlib.gzipSync(dados);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Veredo Backup <docjuris@advmachado.adv.br>',
      to: EMAIL_DESTINO,
      subject: `📦 Backup Veredo — ${timestamp}`,
      html: `<p>Backup diário automático do banco de dados do Veredo.</p>
             <p><strong>Data:</strong> ${timestamp}<br>
             <strong>Tamanho:</strong> ${(comprimido.length / 1024).toFixed(0)}KB (compactado)</p>
             <p>Para restaurar: descompacte o .gz e substitua o arquivo docjuris.db no servidor.</p>`,
      attachments: [{
        filename: `docjuris_${timestamp}.db.gz`,
        content: comprimido.toString('base64'),
      }],
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    return { ok: false, erro: `Resend ${r.status}: ${body.slice(0, 150)}` };
  }
  return { ok: true, detalhe: `enviado para ${EMAIL_DESTINO}` };
}

// ─── 3. Google Drive (bônus) ─────────────────────────────────────────────────
async function backupDrive(timestamp) {
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return { ok: false, erro: 'credenciais Google ausentes' };
  }
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const filename = `docjuris_backup_${timestamp}.db`;

  const existing = await drive.files.list({
    q: `name='${filename}' and '${FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id)',
  });
  if (existing.data.files.length > 0) return { ok: true, detalhe: 'já existe no Drive' };

  const response = await drive.files.create({
    requestBody: { name: filename, parents: [FOLDER_ID] },
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(DB_PATH) },
    fields: 'id, name, size',
    supportsAllDrives: true,
  });

  // Limpeza de antigos
  const allFiles = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed=false and name contains 'docjuris_backup_'`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime',
  });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DRIVE);
  for (const file of allFiles.data.files) {
    if (new Date(file.createdTime) < cutoff) {
      try { await drive.files.delete({ fileId: file.id }); } catch(e) {}
    }
  }
  return { ok: true, detalhe: `${response.data.name}` };
}

// ─── Orquestrador ────────────────────────────────────────────────────────────
export async function runBackup() {
  console.log('🔄 Iniciando backup triplo...');
  if (!fs.existsSync(DB_PATH)) {
    return { ok: false, erro: 'Arquivo do banco não encontrado: ' + DB_PATH };
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const resultados = {};

  try { resultados.local = backupLocal(timestamp); }
  catch(e) { resultados.local = { ok: false, erro: e.message }; }

  try { resultados.email = await backupEmail(timestamp); }
  catch(e) { resultados.email = { ok: false, erro: e.message }; }

  try { resultados.drive = await backupDrive(timestamp); }
  catch(e) { resultados.drive = { ok: false, erro: e.message }; }

  const partes = [
    `local: ${resultados.local.ok ? '✓ ' + resultados.local.detalhe : '✗ ' + resultados.local.erro}`,
    `email: ${resultados.email.ok ? '✓ ' + resultados.email.detalhe : '✗ ' + resultados.email.erro}`,
    `drive: ${resultados.drive.ok ? '✓' : '✗ ' + resultados.drive.erro}`,
  ];
  const algumOk = resultados.local.ok || resultados.email.ok || resultados.drive.ok;

  console.log((algumOk ? '✅' : '❌') + ' Backup: ' + partes.join(' | '));
  return { ok: algumOk, detalhe: partes.join(' | '), resultados };
}

// Info do último backup local (para o diagnóstico)
export function ultimoBackupLocal() {
  if (!fs.existsSync(BACKUPS_DIR)) return null;
  const arquivos = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('docjuris_') && f.endsWith('.db.gz'))
    .sort().reverse();
  if (arquivos.length === 0) return null;
  const f = arquivos[0];
  const st = fs.statSync(path.join(BACKUPS_DIR, f));
  return { nome: f, tamanhoKB: Math.round(st.size / 1024), modificado: st.mtime, total: arquivos.length };
}
